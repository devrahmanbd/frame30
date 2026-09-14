#!/usr/bin/env node
/**
 * Phase 10.3 — the visual rhythm release gate.
 *
 * The rules in TODO §10.3 are geometric and typographic, which means only a
 * layout engine can tell us whether they hold. This gate loads every public
 * marketing surface in a real browser, at every supported width, in both
 * locales, measures the rendered DOM, and runs the *same* auditors the app
 * uses at authoring time (`src/lib/site-rhythm.ts`) over those numbers.
 *
 * What it measures per surface × width × locale:
 *   1. every band's inner container width against the 1200px artboard;
 *   2. every band's block padding against the 112/72 rhythm;
 *   3. surface order — no two glass-family bands stacked;
 *   4. chroma budget — aurora fields per page, signal-blue per band;
 *   5. type — body 17/1.6, display tracking in em, Bangla tracking reset and
 *      line box ≥ 1.35;
 *   6. elevation — a 1px 14% white edge on every glass surface.
 *
 * Operational behaviour, because a gate that flakes gets disabled:
 *   - bounded concurrency (`--concurrency`, default 3) over one browser;
 *   - per-navigation timeout with two retries and exponential backoff;
 *   - a readiness probe against the base URL before any work starts, so a cold
 *     dev server reports "server not up" instead of 30 navigation failures;
 *   - structured JSONL logs on stderr (`--log-level`), human report on stdout;
 *   - a machine report via `--json out.json` for trend tracking;
 *   - `--allow code[,code]` to accept known findings by code, and
 *     `--fail-on error|warn` to choose the blocking threshold;
 *   - console errors on the page are collected and reported, never ignored;
 *   - exit 0 clean, 1 findings above threshold, 2 harness failure. The two are
 *     distinct so CI can tell "the site regressed" from "the gate broke".
 *
 * Usage:
 *   node scripts/rhythm-gate.mjs [--base URL] [--only home] [--widths 320,1440]
 *        [--locales en,bn] [--json report.json] [--fail-on warn]
 *        [--allow type.family_missing] [--concurrency 3] [--log-level debug]
 */
import { writeFileSync } from "node:fs";
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
const list = (name, fallback) =>
  String(arg(name, fallback))
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const BASE = (arg("base", process.env.E2E_BASE_URL ?? "http://localhost:8080")).replace(/\/$/, "");
const ONLY = arg("only", null);
const WIDTHS = list("widths", "320,768,1440,1920")
  .map(Number)
  .filter((n) => Number.isFinite(n) && n >= 320);
const LOCALES = list("locales", "en,bn");
const JSON_OUT = arg("json", null);
const FAIL_ON = arg("fail-on", "error") === "warn" ? "warn" : "error";
const ALLOW = new Set(list("allow", ""));
const CONCURRENCY = Math.max(1, Math.min(6, Number(arg("concurrency", "3")) || 3));
const NAV_TIMEOUT_MS = Number(arg("timeout", "20000")) || 20000;
const ATTEMPTS = 3;
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LOG_LEVELS[arg("log-level", "info")] ?? LOG_LEVELS.info;

const log = (level, event, fields = {}) => {
  if ((LOG_LEVELS[level] ?? 2) > LOG_LEVEL) return;
  process.stderr.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, gate: "rhythm", event, ...fields })}\n`,
  );
};

/** Surfaces under contract. Kept in step with `scripts/responsive-sweep.mjs`. */
const SURFACES = [
  { name: "bands", path: "/dev/bands" },
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

/* -------------------------------------------------------------------------- */
/* Spec import — one implementation of the rules, not two                     */
/* -------------------------------------------------------------------------- */

/**
 * The auditors are TypeScript. Rather than duplicating the thresholds in this
 * script (the exact drift this phase exists to prevent), the gate imports the
 * module through the project's TS-capable runtime. Node cannot type-strip
 * `.ts` on every supported version, so we require Bun for this gate and say so
 * plainly instead of failing with a cryptic syntax error.
 */
async function loadSpec() {
  const url = pathToFileURL(new URL("../src/lib/site-rhythm.ts", import.meta.url).pathname).href;
  try {
    return await import(url);
  } catch (cause) {
    throw new Error(
      `Cannot load src/lib/site-rhythm.ts (${cause?.message ?? cause}). Run this gate with bun: "bun scripts/rhythm-gate.mjs".`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* In-page measurement                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Runs inside the browser. Pure measurement: it makes no judgements, so every
 * threshold stays in one place on the Node side and this function can be read
 * as "what the page looks like" rather than "what is wrong with the page".
 */
const MEASURE = () => {
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const langOf = (el) => el.closest("[lang]")?.getAttribute("lang") ?? "en";

  /** Alpha of a colour string, or null when it is not visibly painted. */
  const alphaOf = (color) => {
    if (!color) return null;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,/]/).map((p) => Number.parseFloat(p.trim()));
    if (parts.length < 3) return null;
    const a = parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1;
    return a <= 0 ? null : a;
  };

  const isSignal = (cs) => {
    // The signal is a saturated blue around hue 203. Read the painted values
    // rather than class names, so an inline style cannot dodge the budget.
    const candidates = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.fill];
    return candidates.some((c) => {
      const m = String(c ?? "").match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const [r, g, b] = m[1].split(/[,/]/).map((p) => Number.parseFloat(p.trim()));
      if (![r, g, b].every(Number.isFinite)) return false;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 60) return false; // greyscale
      return b === max && b - r > 60 && b - g > 25;
    });
  };

  const bandEls = [...document.querySelectorAll("[data-band-surface]")];
  const bands = bandEls.map((el, index) => {
    const inner = el.querySelector(":scope > [data-band-inner]") ?? el;
    const cs = getComputedStyle(inner);
    const bandCs = getComputedStyle(el);
    // A band that clips its own overflow (the aurora field is inset -10% on
    // purpose) still reports a larger scrollWidth even though nothing can be
    // scrolled to and nothing is cut off. Report the *scrollable* overflow, so
    // the finding means "the visitor can scroll sideways", not "a pseudo
    // element is wider than its box".
    const clipsX = /hidden|clip/.test(bandCs.overflowX);
    const heading = el.querySelector("h1,h2,h3");
    const descendants = [...el.querySelectorAll("*")];
    return {
      index,
      label:
        el.id ||
        (heading?.textContent ?? "").trim().slice(0, 40) ||
        `${el.tagName.toLowerCase()}#${index}`,
      surface: el.getAttribute("data-band-surface") ?? "unknown",
      width: el.getAttribute("data-band-width") ?? "custom",
      density: el.getAttribute("data-band-density") === "tight" ? "tight" : "section",
      containerWidthPx: inner.getBoundingClientRect().width - num(cs.paddingLeft) - num(cs.paddingRight),
      paddingTopPx: num(cs.paddingTop),
      paddingBottomPx: num(cs.paddingBottom),
      scrollWidthPx: clipsX ? el.clientWidth : el.scrollWidth,
      overflowX: bandCs.overflowX,
      clientWidthPx: el.clientWidth,
      auroraCount: [el, ...descendants].filter(
        (n) => n.classList?.contains("fq-aurora") || n.classList?.contains("fq-spotlight"),
      ).length,
      signalCount: descendants.filter((n) => {
        const r = n.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        return isSignal(getComputedStyle(n));
      }).length,
    };
  });

  /* Type samples. The band primitives declare `data-type-role`, so the gate
   * measures declared roles instead of guessing from tag names; headings are
   * always the display role. When a band declares no roles at all we fall back
   * to its first non-eyebrow paragraph and say so, which keeps routes that are
   * not yet on the band kit under some contract instead of none. */
  const type = [];
  const ROLES = new Set(["display", "lead", "body", "caption", "numeral"]);
  const pushType = (el, kind, note = "") => {
    if (type.length >= 80 || !el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(el);
    const size = num(cs.fontSize);
    type.push({
      label: `${kind}${note}:${(el.textContent ?? "").trim().slice(0, 32) || el.tagName.toLowerCase()}`,
      kind,
      lang: langOf(el),
      fontFamily: cs.fontFamily,
      fontSizePx: size,
      lineHeightPx: cs.lineHeight === "normal" ? size * 1.2 : num(cs.lineHeight),
      letterSpacingPx: cs.letterSpacing === "normal" ? 0 : num(cs.letterSpacing),
      // Set when the band declared no role and the gate had to guess: the
      // sample is reported, never size-audited, because a guessed role would
      // manufacture failures on correct markup.
      undeclared: note === "?",
    });
  };

  for (const el of bandEls) {
    for (const h of el.querySelectorAll("h1,h2,h3")) pushType(h, "display");
    const roled = [...el.querySelectorAll("[data-type-role]")];
    for (const node of roled) {
      const role = node.getAttribute("data-type-role");
      if (ROLES.has(role)) pushType(node, role);
    }
    if (roled.length === 0) {
      const fallback = el.querySelector("p:not([data-band-eyebrow])");
      if (fallback) pushType(fallback, "body", "?");
    }
  }

  /* Glass surfaces: the edge is the elevation, so read border + box-shadow. */
  const glass = [...document.querySelectorAll(".fq-glass")].slice(0, 40).map((el, i) => {
    const cs = getComputedStyle(el);
    const shadow = cs.boxShadow || "";
    const blurs = [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    return {
      label: `glass#${i}:${(el.textContent ?? "").trim().slice(0, 24)}`,
      edgeAlpha: alphaOf(cs.borderTopColor),
      edgeWidthPx: num(cs.borderTopWidth),
      ambientBlurPx: shadow.includes("inset") && blurs.length === 0 ? 0 : Math.max(0, ...blurs, 0),
      hasInsetHighlight: shadow.includes("inset"),
    };
  });

  return {
    bands,
    type,
    glass,
    documentScrollWidth: document.documentElement.scrollWidth,
    h1Count: document.querySelectorAll("h1").length,
  };
};

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(base, attempts = 15) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(4000) });
      if (res.ok || res.status < 500) {
        log("info", "server.ready", { base, status: res.status, attempt: i });
        return;
      }
      log("warn", "server.unhealthy", { base, status: res.status, attempt: i });
    } catch (e) {
      log("debug", "server.probe_failed", { base, attempt: i, error: String(e?.message ?? e) });
    }
    await sleep(Math.min(4000, 400 * i));
  }
  throw new Error(`Dev server at ${base} did not answer after ${attempts} probes.`);
}

/** One job = one surface at one width in one locale. */
function planJobs() {
  const jobs = [];
  for (const surface of SURFACES) {
    for (const width of WIDTHS) {
      for (const locale of LOCALES) jobs.push({ surface, width, locale });
    }
  }
  return jobs;
}

async function runJob(browser, job, spec) {
  const { surface, width, locale } = job;
  const url = `${BASE}${surface.path}${surface.path.includes("?") ? "&" : "?"}lang=${locale}`;
  let lastError = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const context = await browser.newContext({
      viewport: { width, height: 1400 },
      deviceScaleFactor: 1,
      locale: locale === "bn" ? "bn-BD" : "en-US",
      reducedMotion: "reduce", // measure the static frame, not a mid-animation one
    });
    const consoleErrors = [];
    try {
      const page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      // Bands are server-rendered; fonts and the aurora layer are not. Wait for
      // fonts so tracking and line boxes are measured against the real face.
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      await page.waitForTimeout(150);

      const measured = await page.evaluate(MEASURE);
      const report = spec.auditPage({
        route: surface.name,
        viewportPx: width,
        locale,
        bands: measured.bands,
        // Only declared roles are audited; guesses are reported below.
        type: measured.type.filter((t) => !t.undeclared),
        glass: measured.glass,
      });

      const extra = [];
      const at = `${surface.name} @${width}/${locale}`;
      for (const guessed of measured.type.filter((t) => t.undeclared)) {
        extra.push({
          code: "type.role_undeclared",
          severity: "info",
          rule: "Bands declare data-type-role",
          where: `${at} · ${guessed.label}`,
          message: `Prose in this band declares no data-type-role, so its ${guessed.fontSizePx}px size is unaudited. Tag it display/lead/body/caption/numeral to bring it under the type contract.`,
        });
      }
      if (measured.bands.length === 0) {
        extra.push({
          code: "surface.unknown",
          severity: "warn",
          rule: "Bands are the section chassis",
          where: at,
          message:
            "No [data-band-surface] element on the page — the route is not built on the shared band kit, so §10.3 cannot be enforced on it.",
        });
      }
      if (measured.documentScrollWidth > width + spec.RHYTHM.overflowSlackPx) {
        extra.push({
          code: "rhythm.section.overflow",
          severity: "error",
          rule: "No horizontal overflow",
          where: at,
          message: `Document scrolls ${measured.documentScrollWidth - width}px wider than the ${width}px viewport.`,
          actual: measured.documentScrollWidth,
          expected: width,
        });
      }

      log("debug", "job.done", {
        route: surface.name,
        width,
        locale,
        attempt,
        bands: measured.bands.length,
        findings: report.findings.length + extra.length,
      });

      await context.close();
      return {
        ...report,
        findings: [...report.findings, ...extra],
        consoleErrors,
        bandCount: measured.bands.length,
        h1Count: measured.h1Count,
      };
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
    bandCount: 0,
    h1Count: 0,
  };
}

/** Bounded worker pool: one browser, N contexts in flight. */
async function drain(jobs, worker, concurrency) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      results.push(await worker(job));
    }
  });
  await Promise.all(runners);
  return results;
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function printReport(results, spec) {
  const all = results.flatMap((r) => r.findings);
  const kept = all.filter((f) => !ALLOW.has(f.code));
  const unique = spec.dedupeFindings(kept);
  const byRoute = new Map();
  for (const f of unique) {
    const route = f.where.split(" ")[0];
    byRoute.set(route, [...(byRoute.get(route) ?? []), f]);
  }

  const lines = [];
  lines.push("");
  lines.push("Phase 10.3 — visual rhythm gate");
  lines.push(
    `  ${SURFACES.length} surfaces × ${WIDTHS.length} widths × ${LOCALES.length} locales = ${results.length} views`,
  );

  const harnessFailures = results.filter((r) => r.harnessError);
  for (const r of harnessFailures) {
    lines.push(`  HARNESS ${r.route} @${r.viewportPx}/${r.locale}: ${r.harnessError}`);
  }

  const consoleErrors = spec.dedupeFindings(
    results.flatMap((r) =>
      r.consoleErrors.map((text) => ({
        code: "surface.unknown",
        severity: "warn",
        rule: "Console is clean",
        where: `${r.route} @${r.viewportPx}/${r.locale}`,
        message: `console error: ${text}`,
      })),
    ),
  );

  for (const [route, findings] of [...byRoute.entries()].sort()) {
    lines.push("");
    lines.push(`  ${route}`);
    for (const f of findings.sort((a, b) => a.severity.localeCompare(b.severity))) {
      lines.push(`    ${spec.formatFinding(f)}`);
    }
  }

  if (consoleErrors.length) {
    lines.push("");
    lines.push("  console");
    for (const f of consoleErrors) lines.push(`    ${spec.formatFinding(f)}`);
  }

  const counts = spec.countBySeverity(unique);
  const noBands = results.filter((r) => r.bandCount === 0).map((r) => r.route);
  const multiH1 = results.filter((r) => r.h1Count !== 1);
  lines.push("");
  lines.push(
    `  ${counts.error} blocking · ${counts.warn} advisory · ${counts.info} informational` +
      (ALLOW.size ? ` · ${all.length - kept.length} allowed by --allow` : ""),
  );
  if (noBands.length) lines.push(`  not on the band kit: ${[...new Set(noBands)].join(", ")}`);
  for (const r of multiH1) {
    lines.push(`  FAIL [heading] ${r.route} @${r.viewportPx}/${r.locale}: ${r.h1Count} h1 elements`);
  }
  lines.push("");
  process.stdout.write(lines.join("\n"));

  return { unique, counts, harnessFailures, multiH1, consoleErrors };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  if (SURFACES.length === 0) throw new Error(`--only ${ONLY} matched no known surface.`);
  const spec = await loadSpec();
  await waitForServer(BASE);

  const started = Date.now();
  const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  let results;
  try {
    const jobs = planJobs();
    log("info", "run.start", { jobs: jobs.length, concurrency: CONCURRENCY, base: BASE });
    results = await drain(jobs, (job) => runJob(browser, job, spec), CONCURRENCY);
  } finally {
    await browser.close().catch(() => {});
  }

  const summary = printReport(results, spec);
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
          gate: "rhythm",
          generatedAt: new Date().toISOString(),
          base: BASE,
          widths: WIDTHS,
          locales: LOCALES,
          elapsedMs,
          allow: [...ALLOW],
          failOn: FAIL_ON,
          counts: summary.counts,
          findings: summary.unique,
          views: results.map(({ consoleErrors, ...r }) => ({
            ...r,
            consoleErrorCount: consoleErrors.length,
          })),
        },
        null,
        2,
      )}\n`,
    );
    log("info", "report.written", { path: JSON_OUT });
  }

  if (summary.harnessFailures.length) return 2;
  const blocking =
    summary.counts.error +
    summary.multiH1.length +
    (FAIL_ON === "warn" ? summary.counts.warn : 0);
  return blocking > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    log("error", "run.failed", { error: String(e?.message ?? e) });
    process.stderr.write(`\nrhythm gate could not run: ${e?.stack ?? e}\n`);
    process.exit(2);
  });
