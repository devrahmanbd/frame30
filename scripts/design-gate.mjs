#!/usr/bin/env node
/**
 * Phase 10.6 — the design exit gate.
 *
 * Two passes, one report:
 *
 *   1. a static scan of every file that renders inside `.fq-site`, for
 *      hardcoded colour utilities, arbitrary colour values, inline style
 *      colours and raw hex;
 *   2. a browser pass over every marketing surface at every supported width in
 *      both locales, measuring contrast (with alpha composited over the real
 *      backdrop stack), horizontal overflow, Bangla line boxes, tap targets,
 *      heading structure, LCP, CLS and font-swap timing.
 *
 * Both passes hand plain records to the auditors in `src/lib/design-exit.ts`,
 * so this script contains no thresholds. Operationally it behaves like the
 * rhythm and motion gates: readiness probe, bounded worker pool, retries with
 * backoff, JSONL logs on stderr, human report on stdout, `--json` machine
 * report, `--allow code[,code]`, `--fail-on error|warn`, and exit 0 clean /
 * 1 findings / 2 harness failure.
 *
 * Usage:
 *   bun scripts/design-gate.mjs [--base URL] [--only home] [--widths 320,1920]
 *        [--locales en,bn] [--skip-source] [--skip-browser] [--json out.json]
 *        [--allow color.raw_hex] [--fail-on warn] [--concurrency 3]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);
const list = (name, fallback) =>
  String(arg(name, fallback))
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const BASE = arg("base", process.env.E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const ONLY = arg("only", null);
const WIDTHS = list("widths", "320,768,1440,1920")
  .map(Number)
  .filter((n) => Number.isFinite(n) && n >= 320);
const LOCALES = list("locales", "en,bn");
const JSON_OUT = arg("json", null);
const FAIL_ON = arg("fail-on", "error") === "warn" ? "warn" : "error";
const ALLOW = new Set(list("allow", ""));
const CONCURRENCY = Math.max(1, Math.min(6, Number(arg("concurrency", "3")) || 3));
const NAV_TIMEOUT_MS = Number(arg("timeout", "25000")) || 25000;
const ATTEMPTS = 3;
const SKIP_SOURCE = flag("skip-source");
const SKIP_BROWSER = flag("skip-browser");
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LOG_LEVELS[arg("log-level", "info")] ?? LOG_LEVELS.info;

const log = (level, event, fields = {}) => {
  if ((LOG_LEVELS[level] ?? 2) > LOG_LEVEL) return;
  process.stderr.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, gate: "design", event, ...fields })}\n`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Surfaces under contract. Kept in step with the rhythm and motion gates. */
const SURFACES = [
  { name: "home", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "features", path: "/features" },
  { name: "builder", path: "/builder" },
  { name: "payments", path: "/payments" },
  { name: "fulfilment", path: "/fulfilment" },
  { name: "customers", path: "/customers" },
  { name: "security", path: "/security" },
  { name: "about", path: "/about" },
  { name: "docs", path: "/docs" },
  { name: "contact", path: "/contact" },
].filter((s) => !ONLY || s.name === ONLY);

/**
 * Directories whose files render inside `.fq-site`. The colour rule is scoped:
 * the admin console and the storefront themes have their own palettes and are
 * deliberately out of scope here, and `styles.css` is where the tokens are
 * *defined*, so scanning it would report the token layer as a violation.
 */
const SOURCE_ROOTS = [
  "src/components/public",
  "src/components/docs",
  "src/routes/index.tsx",
  "src/routes/pricing.tsx",
  "src/routes/features.tsx",
  "src/routes/builder.tsx",
  "src/routes/payments.tsx",
  "src/routes/fulfilment.tsx",
  "src/routes/customers.tsx",
  "src/routes/security.tsx",
  "src/routes/about.tsx",
  "src/routes/contact.tsx",
  "src/routes/docs.index.tsx",
  "src/routes/dev.bands.tsx",
  "src/lib/marketing",
];
const SOURCE_EXT = /\.(tsx|ts)$/;
const SOURCE_SKIP = /\.(test|spec|contract\.test)\.tsx?$/;

async function loadSpec() {
  const url = pathToFileURL(new URL("../src/lib/design-exit.ts", import.meta.url).pathname).href;
  try {
    return await import(url);
  } catch (cause) {
    throw new Error(
      `Cannot load src/lib/design-exit.ts (${cause?.message ?? cause}). Run this gate with bun: "bun scripts/design-gate.mjs".`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Pass 1 — static source scan                                                */
/* -------------------------------------------------------------------------- */

function collectFiles(root, out = []) {
  let st;
  try {
    st = statSync(root);
  } catch {
    log("debug", "source.missing", { path: root });
    return out;
  }
  if (st.isFile()) {
    if (SOURCE_EXT.test(root) && !SOURCE_SKIP.test(root)) {
      out.push({ path: root, contents: readFileSync(root, "utf8") });
    }
    return out;
  }
  for (const entry of readdirSync(root)) collectFiles(`${root}/${entry}`, out);
  return out;
}

function scanSource(spec) {
  const files = SOURCE_ROOTS.flatMap((r) => collectFiles(r));
  const findings = spec.auditSourceTree(files);
  log("info", "source.scanned", { files: files.length, findings: findings.length });
  return { files: files.length, findings };
}

async function auditSeoCrawl(spec) {
  const seoUrl = pathToFileURL(new URL("../src/lib/marketing-seo.ts", import.meta.url).pathname).href;
  const { MARKETING_ROUTES, buildGraph, buildMarketingHead } = await import(seoUrl);
  const findings = [];

  for (const r of MARKETING_ROUTES) {
    for (const loc of ["en", "bn"]) {
      const titleLen = r.title[loc].length;
      if (titleLen >= 60) {
        findings.push(
          spec.finding(
            "seo.title_too_long",
            "error",
            "SERP title width",
            `${r.path} [${loc}]`,
            `Title "${r.title[loc]}" is ${titleLen} chars (limit: <60)`,
            titleLen,
            59,
          ),
        );
      }
      const descLen = r.description[loc].length;
      if (descLen >= 155) {
        findings.push(
          spec.finding(
            "seo.description_too_long",
            "error",
            "SERP description width",
            `${r.path} [${loc}]`,
            `Description is ${descLen} chars (limit: <155)`,
            descLen,
            154,
          ),
        );
      }
    }

    // Bidirectional hreflang alternates
    const head = buildMarketingHead({ route: r.id, origin: "https://framique.com" });
    const alternates = head.links.filter((l) => l.rel === "alternate");
    const hreflangs = alternates.map((a) => a.hreflang);
    if (!hreflangs.includes("bn-BD") || !hreflangs.includes("x-default")) {
      findings.push(
        spec.finding(
          "seo.hreflang_incomplete",
          "error",
          "Bidirectional hreflang",
          r.path,
          `Missing reciprocal hreflang alternates (found: ${hreflangs.join(", ")})`,
          hreflangs.length,
          3,
        ),
      );
    }

    // Complete JSON-LD schema
    const graph = buildGraph({ route: r.id, origin: "https://framique.com" });
    if (!graph || !graph["@graph"] || graph["@graph"].length === 0) {
      findings.push(
        spec.finding(
          "seo.schema_missing",
          "error",
          "Structured data graph",
          r.path,
          "Route does not emit a valid JSON-LD graph",
          0,
          1,
        ),
      );
    }
  }

  // Verify SemrushBot crawler policy in robots.txt
  const robotsSrc = readFileSync(new URL("../src/routes/robots[.]txt.ts", import.meta.url).pathname, "utf8");
  if (!robotsSrc.includes("User-agent: SemrushBot") || !robotsSrc.includes("Allow: /")) {
    findings.push(
      spec.finding(
        "seo.semrush_bot_blocked",
        "error",
        "SemrushBot crawl permission",
        "robots.txt",
        "SemrushBot must be explicitly permitted for automated crawl audits",
        0,
        1,
      ),
    );
  }

  log("info", "seo.crawled", { routes: MARKETING_ROUTES.length, findings: findings.length });
  return { routes: MARKETING_ROUTES.length, findings };
}

/* -------------------------------------------------------------------------- */
/* Pass 2 — in-page measurement                                               */
/* -------------------------------------------------------------------------- */

/**
 * Runs inside the browser. Pure collection: it makes no judgements, so every
 * threshold stays on the Node side and this function reads as "what the page
 * looks like" rather than "what is wrong with it".
 */
const MEASURE = () => {
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const label = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const id = el.id ? `#${el.id}` : "";
    return `${tag}${id}${cls ? `.${cls}` : ""}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && num(cs.opacity) > 0.05;
  };
  const opaque = (color) => {
    const m = String(color ?? "").match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(/[,/\s]+/).filter(Boolean);
    const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
    return Number.isFinite(a) && a > 0;
  };

  /** Backdrop layers from the element up to the first opaque ancestor. */
  const backdropOf = (el) => {
    const layers = [];
    let node = el.parentElement;
    let base = "rgb(11, 15, 20)";
    while (node && layers.length < 8) {
      const cs = getComputedStyle(node);
      const bg = cs.backgroundColor;
      if (opaque(bg)) {
        const m = bg.match(/rgba?\(([^)]+)\)/);
        const parts = m ? m[1].split(/[,/\s]+/).filter(Boolean) : [];
        const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
        if (a >= 0.995) {
          base = bg;
          break;
        }
        layers.push(bg);
      }
      node = node.parentElement;
    }
    // Outermost-first is what the auditor composites in.
    return { layers: layers.reverse(), base };
  };

  const scope = document.querySelector(".fq-site") ?? document.body;

  /* Contrast samples: declared text roles first, then CTAs in every state we
   * can synthesise, then focus rings. Capped so a docs page with 400 table
   * cells does not produce a 400-line report. */
  const contrast = [];
  const pushContrast = (el, role, state) => {
    if (contrast.length >= 60 || !el || !visible(el)) return;
    const cs = getComputedStyle(el);
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    const { layers, base } = backdropOf(el);
    contrast.push({
      label: `${label(el)}${state ? ` [${state}]` : ""}`,
      role,
      state,
      color: role === "focus-ring" ? cs.outlineColor || cs.borderTopColor : cs.color,
      backdrop: role === "cta" || role === "cta-disabled" ? [cs.backgroundColor, ...layers] : layers,
      base,
      fontSizePx: num(cs.fontSize),
      fontWeight: num(cs.fontWeight) || 400,
      text,
    });
  };

  const roleMap = { display: "body", lead: "body", body: "body", caption: "muted", numeral: "body" };
  for (const el of scope.querySelectorAll("[data-type-role]")) {
    const declared = el.getAttribute("data-type-role") ?? "body";
    pushContrast(el, roleMap[declared] ?? "body");
  }
  for (const el of [...scope.querySelectorAll("p, li")].slice(0, 12)) {
    pushContrast(el, num(getComputedStyle(el).opacity) < 0.9 ? "muted" : "body");
  }

  const ctas = [...scope.querySelectorAll("a[data-cta], button, a[class*='fq-pill']")]
    .filter(visible)
    .slice(0, 6);
  for (const el of ctas) {
    const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
    pushContrast(el, disabled ? "cta-disabled" : "cta", disabled ? "disabled" : "rest");
  }

  /* Overflow. Report the widest painted boxes and whether anything clips them. */
  const overflow = [];
  for (const el of scope.querySelectorAll("*")) {
    if (overflow.length >= 40) break;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right <= window.innerWidth + 2) continue;
    let clipped = false;
    let node = el.parentElement;
    while (node) {
      if (/hidden|clip|auto|scroll/.test(getComputedStyle(node).overflowX)) {
        clipped = true;
        break;
      }
      node = node.parentElement;
    }
    overflow.push({
      label: label(el),
      rightPx: r.right + window.scrollX,
      widthPx: r.width,
      clipped,
    });
  }

  /* Bangla line boxes.
   *
   * Two measurement traps this pass corrects, because both produced confident
   * failures on markup that renders perfectly:
   *
   *   1. `getBoundingClientRect()` on an *inline* element returns the font's
   *      content box, not the line box. An inline span at 30.7px/49.2px
   *      measures 41px tall and looks 8px "clipped" when nothing is clipped.
   *      Inline runs are therefore measured as the union of `getClientRects()`
   *      and their line count comes from the rect count.
   *   2. `overflow: clip` *somewhere* up the tree is not clipping. The aurora
   *      band clips a decorative field 300px away from the text. A clip only
   *      counts when the clipping ancestor's padding box actually cuts the
   *      text's own box on the block axis, or the element scrolls itself.
   */
  const bangla = [];
  const bnScope = document.querySelector('[lang="bn"]') ? document : null;
  const bnNodes = bnScope
    ? [
        ...document.querySelectorAll(
          '[lang="bn"] :is(h1,h2,h3,h4,p,li,span,td,th,button,a), [lang="bn"]',
        ),
      ]
    : [];
  for (const el of bnNodes) {
    if (bangla.length >= 40) break;
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!/[\u0980-\u09FF]/.test(text) || el.children.length > 0) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const size = num(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? size * 1.2 : num(cs.lineHeight);
    const isInline = cs.display === "inline";
    const rects = [...el.getClientRects()];
    const box = el.getBoundingClientRect();

    // Ink extent: for inline runs the union of line rects; for block boxes the
    // border box, which already contains every line.
    let top = box.top;
    let bottom = box.bottom;
    if (isInline && rects.length > 0) {
      top = Math.min(...rects.map((r) => r.top));
      bottom = Math.max(...rects.map((r) => r.bottom));
    }
    const inkHeight = Math.max(0, bottom - top);
    const lineCount = isInline
      ? Math.max(1, rects.length)
      : Math.max(1, Math.round(inkHeight / (lh || 1)));

    // Self-clipping (a fixed height plus overflow hidden on the text itself).
    const selfClips =
      /hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;

    // Ancestor clipping, but only when the clip line actually crosses the text.
    let ancestorClipsY = false;
    let node = el.parentElement;
    while (node) {
      const ps = getComputedStyle(node);
      if (/hidden|clip/.test(ps.overflowY)) {
        const pr = node.getBoundingClientRect();
        const padTop = pr.top + num(ps.borderTopWidth);
        const padBottom = pr.bottom - num(ps.borderBottomWidth);
        if (top < padTop - 0.5 || bottom > padBottom + 0.5) {
          ancestorClipsY = true;
        }
        break; // the nearest clipper decides; outer ones cannot cut more.
      }
      node = node.parentElement;
    }

    bangla.push({
      label: label(el),
      // An inline run's rects are content boxes (font-size tall), so the
      // honest "needed height" for an *unclipped* inline run is its line boxes;
      // when a clipper really does cut it, report the visible ink instead so the
      // auditor can see the shortfall.
      heightPx:
        isInline && !(ancestorClipsY || selfClips) ? lh * lineCount : inkHeight,
      fontSizePx: size,
      lineHeightPx: lh,
      lineCount,
      ancestorClipsY: ancestorClipsY || selfClips,
      text: text.slice(0, 40),
    });
  }

  /* Tap targets. */
  const tapTargets = [];
  for (const el of scope.querySelectorAll("a[href], button, [role='button'], input, summary")) {
    if (tapTargets.length >= 40 || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    const parentText = (el.parentElement?.textContent ?? "").trim();
    const own = (el.textContent ?? "").trim();
    tapTargets.push({
      label: label(el),
      widthPx: r.width,
      heightPx: r.height,
      inline:
        getComputedStyle(el).display === "inline" && parentText.length > own.length + 8,
    });
  }

  /* Headings, in document order. */
  const headings = [...scope.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
      visuallyHidden: el.className.includes("sr-only"),
    }));

  const vitals = window.__fqVitals ?? { lcpMs: null, clsScore: null, lcpElement: null, worstShift: null };
  const nav = performance.getEntriesByType("navigation")[0];

  return {
    documentScrollWidthPx: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    contrast,
    overflow,
    bangla,
    tapTargets,
    headings,
    vitals: {
      lcpMs: vitals.lcpMs,
      clsScore: vitals.clsScore,
      lcpElement: vitals.lcpElement,
      worstShift: vitals.worstShift,
      ttfbMs: nav ? nav.responseStart : null,
      fontsReadyMs: window.__fqFontsReadyMs ?? null,
    },
  };
};

/**
 * Installed before navigation. Vitals observers attached after paint report
 * nothing, and "nothing" would be indistinguishable from "fast" — which is the
 * failure mode this whole phase exists to prevent.
 */
const INSTALL_OBSERVERS = () => {
  window.__fqVitals = { lcpMs: null, clsScore: 0, lcpElement: null, worstShift: null };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__fqVitals.lcpMs = entry.startTime;
        const el = entry.element;
        window.__fqVitals.lcpElement = el
          ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`
          : entry.url || "unknown";
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__fqVitals.clsScore = (window.__fqVitals.clsScore ?? 0) + entry.value;
        const worst = window.__fqVitals.worstShift;
        if (!worst || entry.value > worst.value) {
          window.__fqVitals.worstShift = {
            value: entry.value,
            sources: (entry.sources ?? [])
              .map((s) => s.node && s.node.tagName ? s.node.tagName.toLowerCase() : "unknown")
              .slice(0, 3),
          };
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    /* Older engines: the auditor reports "unmeasured" rather than "fast". */
  }
  document.fonts?.ready?.then(() => {
    window.__fqFontsReadyMs = performance.now();
  });
};

/** Synthesises hover and focus on the primary CTA and re-samples its colours. */
async function sampleCtaStates(page) {
  const out = [];
  const cta = page.locator("[data-cta='primary'], .fq-site a[class*='fq-pill'], .fq-site button").first();
  if ((await cta.count()) === 0) return out;
  for (const state of ["hover", "focus"]) {
    try {
      if (state === "hover") await cta.hover({ timeout: 2000 });
      else await cta.focus({ timeout: 2000 });
      const sample = await cta.evaluate((el, st) => {
        const cs = getComputedStyle(el);
        return {
          label: `${el.tagName.toLowerCase()}[cta] [${st}]`,
          role: "cta",
          state: st,
          color: cs.color,
          backdrop: [cs.backgroundColor],
          base: "rgb(11, 15, 20)",
          fontSizePx: Number.parseFloat(cs.fontSize) || 16,
          fontWeight: Number.parseFloat(cs.fontWeight) || 400,
          text: (el.textContent ?? "").trim().slice(0, 32),
          outline: cs.outlineColor,
          outlineWidth: Number.parseFloat(cs.outlineWidth) || 0,
        };
      }, state);
      const { outline, outlineWidth, ...rest } = sample;
      out.push(rest);
      if (state === "focus" && outlineWidth > 0) {
        out.push({
          label: "focus ring",
          role: "focus-ring",
          color: outline,
          backdrop: [],
          base: "rgb(11, 15, 20)",
          fontSizePx: 16,
          fontWeight: 400,
        });
      }
    } catch (e) {
      log("debug", "cta.state_failed", { state, error: String(e?.message ?? e).slice(0, 120) });
    }
  }
  return out;
}

async function waitForServer(base) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`Dev server at ${base} never became ready. Start it, or pass --base.`);
}

function planJobs() {
  return SURFACES.flatMap((surface) =>
    WIDTHS.flatMap((width) => LOCALES.map((locale) => ({ surface, width, locale }))),
  );
}

async function runJob(browser, { surface, width, locale }, spec) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const context = await browser.newContext({
      viewport: { width, height: Math.max(720, Math.round(width * 0.75)) },
      deviceScaleFactor: 1,
      locale: locale === "bn" ? "bn-BD" : "en-US",
      reducedMotion: "no-preference",
    });
    const consoleErrors = [];
    try {
      await context.addInitScript(INSTALL_OBSERVERS);
      const page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
      });
      page.on("pageerror", (e) => consoleErrors.push(String(e?.message ?? e).slice(0, 200)));

      const url = `${BASE}${surface.path}${surface.path.includes("?") ? "&" : "?"}lang=${locale}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(600); // let reveals settle and CLS accumulate

      const measured = await page.evaluate(MEASURE);
      const ctaStates = await sampleCtaStates(page);

      const report = spec.auditExitPage({
        route: surface.name,
        viewportPx: width,
        locale,
        documentScrollWidthPx: measured.documentScrollWidthPx,
        overflow: measured.overflow,
        bangla: measured.bangla,
        tapTargets: measured.tapTargets,
        contrast: [...measured.contrast, ...ctaStates],
        headings: measured.headings,
        vitals: { route: surface.name, viewportPx: width, locale, ...measured.vitals },
      });

      await context.close().catch(() => {});
      log("debug", "job.done", {
        route: surface.name,
        width,
        locale,
        findings: report.findings.length,
      });
      return { ...report, consoleErrors, headingCount: measured.headings.length };
    } catch (e) {
      lastError = e;
      await context.close().catch(() => {});
      log("warn", "job.retry", {
        route: surface.name,
        width,
        locale,
        attempt,
        error: String(e?.message ?? e).slice(0, 200),
      });
      if (attempt < ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  return {
    route: surface.name,
    viewportPx: width,
    locale,
    findings: [],
    counts: { error: 0, warn: 0, info: 0 },
    ok: false,
    harnessError: String(lastError?.message ?? lastError),
    consoleErrors: [],
    headingCount: 0,
  };
}

async function drain(jobs, worker, concurrency) {
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (cursor < jobs.length) results.push(await worker(jobs[cursor++]));
    }),
  );
  return results;
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function printReport(source, seoCrawl, results, spec) {
  const all = [
    ...(source?.findings ?? []),
    ...(seoCrawl?.findings ?? []),
    ...results.flatMap((r) => r.findings),
  ];
  const kept = all.filter((f) => !ALLOW.has(f.code));
  const unique = spec.dedupeFindings(kept);

  const byGroup = new Map();
  for (const f of unique) {
    const group = f.where.includes(".ts") ? "source" : f.where.split(" ")[0];
    byGroup.set(group, [...(byGroup.get(group) ?? []), f]);
  }

  const lines = ["", "Phase 10.6 — design exit gate & SEO crawl audit"];
  if (source) lines.push(`  source scan: ${source.files} files under .fq-site`);
  if (seoCrawl) {
    lines.push(
      `  seo crawl audit: ${seoCrawl.routes} routes verified (titles <60, desc <155, hreflang, schemas, SemrushBot)`,
    );
  }
  if (results.length) {
    lines.push(
      `  browser: ${SURFACES.length} surfaces × ${WIDTHS.length} widths × ${LOCALES.length} locales = ${results.length} views`,
    );
  }

  for (const r of results.filter((r) => r.harnessError)) {
    lines.push(`  HARNESS ${r.route} @${r.viewportPx}/${r.locale}: ${r.harnessError}`);
  }

  for (const [group, findings] of [...byGroup.entries()].sort()) {
    lines.push("", `  ${group}`);
    for (const f of findings.sort((a, b) => a.severity.localeCompare(b.severity))) {
      lines.push(`    ${spec.formatFinding(f)}`);
    }
  }

  const consoleErrors = [
    ...new Set(results.flatMap((r) => r.consoleErrors ?? [])),
  ].slice(0, 10);
  if (consoleErrors.length) {
    lines.push("", "  console");
    for (const text of consoleErrors) lines.push(`    WARN [console] ${text}`);
  }

  const counts = spec.countBySeverity(unique);
  lines.push(
    "",
    `  ${counts.error} blocking · ${counts.warn} advisory · ${counts.info} informational` +
      (ALLOW.size ? ` · ${all.length - kept.length} allowed by --allow` : ""),
    "",
  );
  process.stdout.write(lines.join("\n"));

  return { unique, counts, harnessFailures: results.filter((r) => r.harnessError) };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  if (SURFACES.length === 0) throw new Error(`--only ${ONLY} matched no known surface.`);
  const spec = await loadSpec();
  const started = Date.now();

  const source = SKIP_SOURCE ? null : scanSource(spec);
  const seoCrawl = await auditSeoCrawl(spec);

  let results = [];
  if (!SKIP_BROWSER) {
    await waitForServer(BASE);
    const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
    try {
      const jobs = planJobs();
      log("info", "run.start", { jobs: jobs.length, concurrency: CONCURRENCY, base: BASE });
      results = await drain(jobs, (job) => runJob(browser, job, spec), CONCURRENCY);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  const summary = printReport(source, seoCrawl, results, spec);
  const elapsedMs = Date.now() - started;
  log("info", "run.done", {
    elapsedMs,
    errors: summary.counts.error,
    warnings: summary.counts.warn,
    harnessFailures: summary.harnessFailures.length,
  });

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          gate: "design-exit",
          generatedAt: new Date().toISOString(),
          base: BASE,
          widths: WIDTHS,
          locales: LOCALES,
          elapsedMs,
          allow: [...ALLOW],
          failOn: FAIL_ON,
          counts: summary.counts,
          sourceFiles: source?.files ?? 0,
          findings: summary.unique,
          views: results.map(({ consoleErrors, ...r }) => ({
            ...r,
            consoleErrorCount: (consoleErrors ?? []).length,
          })),
        },
        null,
        2,
      )}\n`,
    );
    log("info", "report.written", { path: JSON_OUT });
  }

  if (summary.harnessFailures.length) return 2;
  const blocking = summary.counts.error + (FAIL_ON === "warn" ? summary.counts.warn : 0);
  return blocking > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    log("error", "run.failed", { error: String(e?.message ?? e) });
    process.stderr.write(`\ndesign exit gate could not run: ${e?.stack ?? e}\n`);
    process.exit(2);
  });
