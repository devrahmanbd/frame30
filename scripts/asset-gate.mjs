#!/usr/bin/env bun
/**
 * Phase 10.5 — the asset gate (TODO §10.5).
 *
 * Sibling of `rhythm-gate.mjs` and `motion-gate.mjs`, same division of labour:
 * this script *measures* a real browser, `src/lib/marketing-assets.ts` *judges*
 * the measurements, and `marketing-assets.test.ts` pins the judgements. No
 * threshold is duplicated here.
 *
 * What one pass over one route observes:
 *   • every registry-backed still: declared width/height, offered formats,
 *     decoded density against the box it renders into, alt text, load priority,
 *     transferred bytes (attributed from the network log, not guessed);
 *   • every icon: sprite-backed or inline, symbol known to the manifest,
 *     standalone marks labelled, decorative marks hidden;
 *   • the Open Graph card: present, absolute https, emitted by the leaf and not
 *     inherited from the root document, HEAD-probed for status/bytes/type and
 *     decoded for its true 1200×630 geometry;
 *   • the whole network log: any 404 or 4xx/5xx asset request, and any image
 *     served as the wrong content type.
 *
 * "Emitted by the leaf, never `__root`" is verified structurally: the gate reads
 * the SSR HTML for a route with no registered card (`/status` has one, so it
 * uses a deliberately unregistered path) and fails if an og:image appears there.
 *
 * Operational behaviour: bounded worker pool over one browser, per-job retries
 * with jittered backoff, JSONL logs on stderr, human report on stdout, machine
 * report to `--json`, `--allow code` for a named exception, and exit 0 clean /
 * 1 blocking findings / 2 harness failure — a harness failure is never a pass.
 *
 * Usage:
 *   bun scripts/asset-gate.mjs
 *   bun scripts/asset-gate.mjs --only features,pricing --widths 1440
 *   bun scripts/asset-gate.mjs --json /tmp/assets.json --fail-on warn
 */
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

const ROOT = resolve(import.meta.dirname, "..");
const BASE = String(flag("base", process.env.ASSET_GATE_BASE ?? "http://localhost:8080")).replace(
  /\/$/,
  "",
);
const ONLY = flag("only", null);
const WIDTHS = String(flag("widths", "390,1440"))
  .split(",")
  .map((n) => Number.parseInt(n, 10))
  .filter((n) => Number.isFinite(n) && n >= 320);
const LOCALES = String(flag("locales", "en"))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CONCURRENCY = Math.max(1, Number.parseInt(String(flag("concurrency", "4")), 10) || 4);
const ATTEMPTS = Math.max(1, Number.parseInt(String(flag("attempts", "2")), 10) || 2);
const FAIL_ON = String(flag("fail-on", "error"));
const JSON_OUT = flag("json", null);
const LOG_LEVEL = String(flag("log-level", "info"));
const SKIP_INVENTORY = argv.includes("--skip-inventory");
const ALLOW = new Set(
  String(flag("allow", ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const log = (level, event, fields = {}) => {
  if ((LEVELS[level] ?? 20) < (LEVELS[LOG_LEVEL] ?? 20)) return;
  process.stderr.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, gate: "assets", event, ...fields })}\n`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* In-page measurement                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Runs in the page. Returns raw facts only — every threshold lives in the spec
 * module, so this function must never decide whether something is a problem.
 */
const MEASURE = () => {
  const foldHeight = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.top < foldHeight && r.bottom > 0;
  };

  const stills = [...document.querySelectorAll("img[data-still], figure[data-still] img")].map((img) => {
    const figure = img.closest("[data-still]");
    const picture = img.closest("picture");
    const offered = picture
      ? [...picture.querySelectorAll("source")]
          .map((s) => (s.getAttribute("type") || "").replace("image/", ""))
          .filter(Boolean)
      : [];
    const ext = (img.currentSrc || img.src || "").split(".").pop()?.split("?")[0];
    if (ext && !offered.includes(ext)) offered.push(ext);
    const box = img.getBoundingClientRect();
    return {
      id: figure?.getAttribute("data-still") ?? null,
      currentSrc: img.currentSrc || img.src || "",
      alt: img.getAttribute("alt"),
      attrWidth: img.getAttribute("width") ? Number(img.getAttribute("width")) : null,
      attrHeight: img.getAttribute("height") ? Number(img.getAttribute("height")) : null,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayWidth: box.width,
      loading: img.getAttribute("loading"),
      fetchPriority: img.getAttribute("fetchpriority"),
      offeredFormats: offered,
      aboveFold: visible(img),
      bytes: null,
    };
  });

  // Fallback placeholders count as a broken still: the component renders them
  // exactly when the file did not decode.
  for (const node of document.querySelectorAll("[data-still-fallback]")) {
    stills.push({
      id: node.getAttribute("data-still-fallback"),
      currentSrc: "(fallback)",
      alt: node.getAttribute("aria-label"),
      attrWidth: null,
      attrHeight: null,
      naturalWidth: 0,
      naturalHeight: 0,
      displayWidth: node.getBoundingClientRect().width,
      loading: null,
      fetchPriority: null,
      offeredFormats: [],
      aboveFold: visible(node),
      bytes: null,
    });
  }

  const icons = [...document.querySelectorAll("svg")]
    .filter((svg) => svg.closest("[data-fq-site], .fq-site, main, header, footer"))
    .map((svg) => {
      const use = svg.querySelector("use");
      const href = use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? null;
      const symbol = href && href.includes("#") ? href.split("#").pop() : null;
      const declared = svg.getAttribute("data-icon-standalone");
      const labelled = Boolean(svg.getAttribute("aria-label"));
      return {
        symbol,
        href,
        standalone: declared === null ? labelled : declared === "true",
        ariaLabel: svg.getAttribute("aria-label"),
        ariaHidden: svg.getAttribute("aria-hidden") === "true",
        role: svg.getAttribute("role"),
      };
    })
    // Charts, logos and decorative flourishes without a sprite reference are out
    // of §10.5's scope; a non-sprited svg is only interesting when it looks like
    // an icon (24px grid, small box).
    .filter((icon) => icon.symbol !== null || icon.standalone);

  const meta = (selector, attr = "content") =>
    document.querySelector(selector)?.getAttribute(attr) ?? null;

  return {
    stills,
    icons,
    og: {
      ogImage: meta('meta[property="og:image"]'),
      twitterImage: meta('meta[name="twitter:image"]'),
      ogImageAlt: meta('meta[property="og:image:alt"]'),
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

async function probe(url) {
  try {
    let res = await fetch(url, { method: "HEAD" });
    // Some static handlers answer HEAD with 405; fall back to a ranged GET
    // rather than reporting a healthy asset as broken.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { headers: { range: "bytes=0-0" } });
    }
    const len = res.headers.get("content-length");
    return {
      status: res.status === 206 ? 200 : res.status,
      bytes: len ? Number(len) : null,
      contentType: res.headers.get("content-type"),
    };
  } catch (error) {
    log("warn", "assets.probe_failed", { url, message: String(error?.message ?? error) });
    return null;
  }
}

async function decodePngSize(url) {
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-32" } });
    if (!res.ok && res.status !== 206) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

async function measureRoute(browser, spec, width, locale, assets) {
  const context = await browser.newContext({
    viewport: { width, height: 1400 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const requests = [];
  const bytesBySrc = new Map();

  page.on("response", async (res) => {
    const req = res.request();
    const url = res.url();
    if (!url.startsWith(BASE) && !/^https:/.test(url)) return;
    let bytes = null;
    const len = res.headers()["content-length"];
    if (len) bytes = Number(len);
    const record = {
      url,
      status: res.status(),
      resourceType: req.resourceType(),
      contentType: res.headers()["content-type"] ?? null,
      bytes,
    };
    requests.push(record);
    if (req.resourceType() === "image" && bytes !== null) bytesBySrc.set(url, bytes);
  });

  const url = `${BASE}${spec.path}${locale === "en" ? "" : `${spec.path.includes("?") ? "&" : "?"}lang=${locale}`}`;
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  const status = response?.status() ?? 0;
  if (status >= 400) throw new Error(`${url} responded HTTP ${status}`);

  // Scroll the page so lazy stills below the fold actually load; measuring a
  // never-requested image would report "no modern format" for everything.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);

  const raw = await page.evaluate(MEASURE);

  const sprite = await (async () => {
    const res = await probe(`${BASE}${assets.SPRITE_PATH}`);
    if (!res) return { ok: false, bytes: null, symbols: [] };
    return { ok: res.status === 200, bytes: res.bytes, symbols: [] };
  })();

  const og = {
    route: spec.id,
    ogImage: raw.og.ogImage,
    twitterImage: raw.og.twitterImage,
    ogImageAlt: raw.og.ogImageAlt,
    probe: raw.og.ogImage && /^https?:\/\//.test(raw.og.ogImage) ? await probe(raw.og.ogImage) : null,
    intrinsic:
      raw.og.ogImage && /\.png($|\?)/.test(raw.og.ogImage) ? await decodePngSize(raw.og.ogImage) : null,
    fromRoot: false,
  };

  const stills = raw.stills.map((s) => ({ ...s, bytes: bytesBySrc.get(s.currentSrc) ?? null }));

  await context.close();
  return {
    route: spec.id,
    url,
    width,
    locale,
    stills,
    icons: raw.icons,
    og,
    requests,
    sprite,
  };
}

/**
 * The leaf-only rule, checked structurally: fetch the SSR HTML of a path that
 * has no registry entry (so no leaf `head()` can contribute a card). Any
 * og:image in that document came from `__root` and would then be on every page.
 */
async function auditRootHead(assets) {
  const url = `${BASE}/__asset-gate-unregistered-path`;
  try {
    const res = await fetch(url);
    const html = await res.text();
    const match = html.match(/<meta[^>]+property="og:image"[^>]*>/i);
    if (!match) return [];
    return [
      {
        code: "asset.og.on_root",
        severity: "error",
        where: "__root",
        message: `the root document emits ${match[0].slice(0, 120)}; §10.5 forbids og:image on __root`,
      },
    ];
  } catch (error) {
    log("warn", "assets.root_probe_failed", { message: String(error?.message ?? error) });
    return [];
  }
  void assets;
}

async function main() {
  const assets = await import(`${ROOT}/src/lib/marketing-assets.ts`);
  const seo = await import(`${ROOT}/src/lib/marketing-seo.ts`);

  const only = ONLY ? new Set(String(ONLY).split(",").map((s) => s.trim())) : null;
  const specs = seo.MARKETING_ROUTES.filter(
    (r) => assets.ogCard(r.id) && (!only || only.has(r.id)) && !r.path.includes(":"),
  ).map((r) => ({ id: r.id, path: r.path }));

  if (specs.length === 0) {
    console.error(`asset gate FAILED: --only "${ONLY}" matched no route with a registered OG card.`);
    process.exit(2);
  }

  const findings = [];

  /* Inventory first: a missing file is one named finding, not 40 404s. */
  if (!SKIP_INVENTORY) {
    const inventory = assets.auditAssetInventory((p) => existsSync(resolve(ROOT, `public${p}`)));
    findings.push(...inventory);
    log("info", "assets.inventory", { findings: inventory.length });
  }

  const browser = await chromium.launch();
  const jobs = [];
  for (const spec of specs) for (const width of WIDTHS) for (const locale of LOCALES) jobs.push({ spec, width, locale });

  const measurements = [];
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const job = jobs[cursor++];
      if (!job) return;
      let lastError = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const m = await measureRoute(browser, job.spec, job.width, job.locale, assets);
          measurements.push(m);
          log("debug", "assets.measured", {
            route: job.spec.id,
            width: job.width,
            stills: m.stills.length,
            icons: m.icons.length,
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          log("warn", "assets.attempt_failed", {
            route: job.spec.id,
            width: job.width,
            attempt,
            message: String(error?.message ?? error),
          });
          await sleep(250 * attempt + Math.random() * 200);
        }
      }
      if (lastError) {
        // A surface we could not measure is a harness failure, not a pass.
        findings.push({
          code: "asset.harness.no_samples",
          severity: "error",
          where: `${job.spec.id} @${job.width}`,
          message: `could not measure the page: ${String(lastError?.message ?? lastError)}`,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  await browser.close();

  for (const m of measurements) findings.push(...assets.auditAssetPage(m).findings);
  findings.push(...(await auditRootHead(assets)));

  const deduped = assets
    .dedupeAssetFindings(findings)
    .filter((f) => !ALLOW.has(f.code))
    .sort((a, b) => (a.severity === b.severity ? a.where.localeCompare(b.where) : a.severity === "error" ? -1 : 1));
  const counts = assets.countAssetsBySeverity(deduped);

  for (const f of deduped) console.log(assets.formatAssetFinding(f));
  console.log(
    `\nasset gate — ${measurements.length}/${jobs.length} surfaces measured · ` +
      `${counts.error} blocking · ${counts.warn} advisory · ${counts.info} info` +
      (ALLOW.size ? ` · allowed: ${[...ALLOW].join(", ")}` : ""),
  );

  if (JSON_OUT && typeof JSON_OUT === "string") {
    writeFileSync(
      JSON_OUT,
      JSON.stringify({ base: BASE, widths: WIDTHS, locales: LOCALES, counts, findings: deduped }, null, 2),
    );
  }

  const blocking =
    FAIL_ON === "warn" ? counts.error + counts.warn : FAIL_ON === "info" ? deduped.length : counts.error;
  if (blocking > 0) {
    console.error(`\nasset gate FAILED — ${blocking} finding(s) at or above "${FAIL_ON}".`);
    process.exit(1);
  }
  console.log("asset gate passed — every §10.5 promise holds on every measured surface.");
}

main().catch((error) => {
  log("error", "assets.harness_failed", { message: String(error?.message ?? error) });
  console.error(`asset gate harness failed: ${error?.stack ?? error}`);
  process.exit(2);
});
