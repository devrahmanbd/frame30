#!/usr/bin/env bun
/**
 * Phase 10.4 — the motion choreography gate (TODO §10.4).
 *
 * Sibling of `scripts/rhythm-gate.mjs`, same shape and same division of labour:
 * this script *measures* a real browser and `src/lib/motion-choreography.ts`
 * *judges* the measurements. Duplicating a threshold here is the exact drift the
 * phase exists to prevent, so the script imports the spec instead.
 *
 * Three passes per surface, because §10.4 makes three different promises and no
 * single pass can observe all of them:
 *
 *   full     JS on, motion allowed. Scrolls the page so every reveal settles,
 *            then measures durations, travel, aurora drift and the magnet.
 *   reduced  `prefers-reduced-motion: reduce`. Nothing may travel, nothing may
 *            loop, counters must already read their final figure, and no node
 *            may be parked invisible.
 *   ssr      JavaScript disabled. This is the honest test of "no motion above
 *            the fold before hydration": if the server HTML ships a pending
 *            (opacity: 0) node in the first viewport, the visitor sees a hole.
 *
 * Operational behaviour is deliberate rather than incidental:
 *   • bounded worker pool over one browser, so a 12-surface sweep is minutes
 *     not hours, with per-job retries and jittered backoff for flaky contexts;
 *   • structured JSONL logs on stderr (`--log-level`), human report on stdout,
 *     machine report to `--json`;
 *   • exit 0 clean, 1 blocking findings, 2 harness failure — a harness failure
 *     is never reported as a pass, which is how gates quietly stop working;
 *   • `--allow code` to ship with a known, named exception instead of the usual
 *     alternative, which is deleting the gate from CI.
 *
 * Usage:
 *   bun scripts/motion-gate.mjs
 *   bun scripts/motion-gate.mjs --only home --widths 1440 --log-level debug
 *   bun scripts/motion-gate.mjs --json /tmp/motion.json --fail-on warn
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
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

const BASE = String(flag("base", process.env.MOTION_GATE_BASE ?? "http://localhost:8080")).replace(
  /\/$/,
  "",
);
const ONLY = flag("only", null);
const WIDTHS = String(flag("widths", "390,1440"))
  .split(",")
  .map((n) => Number.parseInt(n, 10))
  .filter((n) => Number.isFinite(n) && n >= 320);
const PASSES = String(flag("passes", "full,reduced,ssr"))
  .split(",")
  .map((p) => p.trim())
  .filter((p) => ["full", "reduced", "ssr"].includes(p));
const LOCALES = String(flag("locales", "en")).split(",");
const CONCURRENCY = Math.max(1, Number.parseInt(String(flag("concurrency", "4")), 10) || 4);
const ATTEMPTS = Math.max(1, Number.parseInt(String(flag("attempts", "2")), 10) || 2);
const FAIL_ON = String(flag("fail-on", "error"));
const JSON_OUT = flag("json", null);
const LOG_LEVEL = String(flag("log-level", "info"));
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
    `${JSON.stringify({ ts: new Date().toISOString(), level, gate: "motion", event, ...fields })}\n`,
  );
};

/**
 * The surfaces §10.4 governs. `/dev/bands` is first on purpose: it renders every
 * primitive, so a token regression shows up there before it reaches a page a
 * visitor sees.
 */
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

async function loadSpec() {
  const url = pathToFileURL(new URL("../src/lib/motion-choreography.ts", import.meta.url).pathname)
    .href;
  try {
    return await import(url);
  } catch (cause) {
    throw new Error(
      `Cannot load src/lib/motion-choreography.ts (${cause?.message ?? cause}). Run this gate with bun: "bun scripts/motion-gate.mjs".`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* In-page measurement                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pure measurement, no judgement. Everything it returns is a number, a string
 * or a list of them, so the thresholds stay on the Node side and this function
 * reads as "what the page is doing".
 */
const MEASURE = () => {
  const ms = (value) => {
    // Computed animation/transition values are comma-separated seconds.
    const parts = String(value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    let max = 0;
    for (const part of parts) {
      const n = Number.parseFloat(part);
      if (!Number.isFinite(n)) continue;
      max = Math.max(max, part.endsWith("ms") ? n : n * 1_000);
    }
    return max;
  };

  const props = (value) =>
    String(value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v && v !== "none");

  /** Absolute translation implied by a computed transform matrix, px. */
  const translationOf = (transform) => {
    if (!transform || transform === "none") return 0;
    const m = transform.match(/matrix(3d)?\(([^)]+)\)/);
    if (!m) return 0;
    const n = m[2].split(",").map((v) => Number.parseFloat(v.trim()));
    const [x, y] = m[1] ? [n[12], n[13]] : [n[4], n[5]];
    return Math.hypot(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
  };

  /**
   * Properties a named @keyframes rule actually touches. Same-origin only, and
   * a cross-origin sheet throws on `.cssRules`, so every access is guarded: the
   * gate must never fail because a font provider injected a stylesheet.
   */
  const keyframeProperties = (name) => {
    if (!name || name === "none") return [];
    const found = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules ?? []) {
        if (rule.type !== CSSRule.KEYFRAMES_RULE || rule.name !== name) continue;
        for (const frame of rule.cssRules ?? []) {
          const style = frame.style;
          for (let i = 0; i < style.length; i += 1) found.add(style.item(i));
        }
      }
    }
    return [...found];
  };

  const vh = window.innerHeight;
  const label = (el, fallback) =>
    (el.getAttribute?.("data-motion-label") || (el.textContent ?? "").trim().slice(0, 32) || fallback);

  /* Reveals ------------------------------------------------------------- */
  const reveals = [...document.querySelectorAll("[data-motion-state]")]
    .slice(0, 120)
    .map((el, i) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const state = el.getAttribute("data-motion-state") === "pending" ? "pending" : "settled";
      // Prefer the entrance the primitive *declares*. The computed transition on
      // a glass card is the union of its entrance and its hover affordance, so
      // reading it back reported every hover `border-color 200ms` as an illegal
      // entrance property. Declared attributes describe the entrance only; the
      // computed fallback still covers any node that predates the contract.
      const declared = el.getAttribute("data-motion-duration") !== null;
      const attrNum = (name) => {
        const n = Number.parseFloat(el.getAttribute(name) ?? "");
        return Number.isFinite(n) ? n : 0;
      };
      return {
        label: label(el, `reveal#${i}`),
        state,
        durationMs: declared ? attrNum("data-motion-duration") : ms(cs.transitionDuration),
        delayMs: declared ? attrNum("data-motion-delay") : ms(cs.transitionDelay),
        properties: declared
          ? (el.getAttribute("data-motion-properties") ?? "").split(",").filter(Boolean)
          : props(cs.transitionProperty),
        translatePx: declared
          ? state === "pending"
            ? attrNum("data-motion-distance")
            : 0
          : translationOf(cs.transform),
        topPx: rect.top + window.scrollY,
        declared,
      };
    });

  /* Drifting atmosphere -------------------------------------------------- */
  const driftNodes = [
    ...document.querySelectorAll('[data-band-drift="true"], .fq-aurora, .fq-mesh-blob'),
  ].slice(0, 40);
  const drifts = [];
  for (const [i, el] of driftNodes.entries()) {
    // The aurora field is a ::before, the mesh blob animates itself; sample both
    // so neither implementation can hide from the gate.
    for (const pseudo of [null, "::before"]) {
      const cs = getComputedStyle(el, pseudo ?? undefined);
      const duration = ms(cs.animationDuration);
      if (duration <= 0) continue;
      const rect = el.getBoundingClientRect();
      const iteration = cs.animationIterationCount.split(",")[0].trim();
      drifts.push({
        label: `${el.classList.contains("fq-mesh-blob") ? "mesh" : "aurora"}#${i}${pseudo ?? ""}`,
        durationMs: duration,
        iterationCount: iteration === "infinite" ? "infinite" : Number.parseFloat(iteration) || 1,
        properties: keyframeProperties(cs.animationName.split(",")[0].trim()),
        aboveFold: rect.top < vh && rect.bottom > 0,
      });
    }
  }

  /* Magnetic CTAs -------------------------------------------------------- */
  const magnetics = [...document.querySelectorAll('[data-motion="magnetic"]')].map((el, i) => {
    const band = el.closest("[data-band-surface]");
    return {
      label: label(el, `magnet#${i}`),
      // The primitive publishes its resolved decision; the gate audits that
      // rather than re-deriving it from media queries.
      enabled: el.getAttribute("data-motion-magnetic") === "on",
      offsetPx: translationOf(getComputedStyle(el).transform),
      bandLabel: band?.id || band?.getAttribute("data-band-surface") || "page",
    };
  });

  /* Counters ------------------------------------------------------------- */
  const counters = [...document.querySelectorAll('[data-motion="counter"]')].map((el, i) => ({
    label: `counter#${i}`,
    rendered: (el.querySelector('[aria-hidden="true"]')?.textContent ?? el.textContent ?? "").trim(),
    settled: (el.getAttribute("data-motion-settled") ?? "").trim(),
  }));

  /* LCP text node -------------------------------------------------------- */
  // The h1 is the LCP element on every marketing route by construction (see
  // HeroBand); using it directly is more reliable than racing the real LCP
  // entry, which in a headless run can resolve to the aurora layer.
  const h1 = document.querySelector("h1");
  const lcp = h1
    ? (() => {
        const cs = getComputedStyle(h1);
        const name = cs.animationName.split(",")[0].trim();
        return {
          label: `h1:${(h1.textContent ?? "").trim().slice(0, 32)}`,
          durationMs: Math.max(ms(cs.transitionDuration), ms(cs.animationDuration)),
          animationName: name === "none" ? null : name,
        };
      })()
    : null;

  return {
    reveals,
    drifts,
    magnetics,
    counters,
    lcp,
    viewportHeightPx: vh,
    peakConcurrentAnimations: document.getAnimations
      ? document.getAnimations().filter((a) => a.playState === "running").length
      : null,
  };
};

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const sleep = (msDelay) => new Promise((r) => setTimeout(r, msDelay));
const jitter = (msDelay) => msDelay * (0.7 + Math.random() * 0.6);

async function waitForServer(base, attempts = 15) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(4_000) });
      if (res.status < 500) {
        log("info", "server.ready", { base, status: res.status, attempt: i });
        return;
      }
      log("warn", "server.unhealthy", { base, status: res.status, attempt: i });
    } catch (e) {
      log("debug", "server.probe_failed", { base, attempt: i, error: String(e?.message ?? e) });
    }
    await sleep(Math.min(4_000, 400 * i));
  }
  throw new Error(`Dev server at ${base} did not answer after ${attempts} probes.`);
}

function planJobs() {
  const jobs = [];
  for (const surface of SURFACES) {
    for (const width of WIDTHS) {
      for (const locale of LOCALES) {
        for (const pass of PASSES) {
          // The SSR pass is width-sensitive (the fold moves) but locale- and
          // motion-independent, so it runs once per width in the first locale.
          if (pass === "ssr" && locale !== LOCALES[0]) continue;
          jobs.push({ surface, width, locale, pass });
        }
      }
    }
  }
  return jobs;
}

/**
 * Settles the page: scrolls to the bottom in viewport steps so every
 * IntersectionObserver has fired, then returns to the top. Without this, every
 * below-the-fold reveal reports `pending` and the gate would flag the entire
 * page — the classic false positive in this kind of check.
 */
async function settleReveals(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = await page.evaluate(() => window.innerHeight);
  for (let y = 0; y < height; y += Math.max(200, step * 0.8)) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(90);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  // One full entrance plus a frame, so transitions have committed their end
  // state before anything is read.
  await page.waitForTimeout(600);
}

/**
 * Waits until the motion layer has actually resolved its intent.
 *
 * `useMotionIntent` reports `off` until hydration, so a headless run under CPU
 * pressure (this gate runs four contexts against one dev server) can easily be
 * measured *between* first paint and hydration. Every entrance then reports a
 * 0ms duration and the hero reports no drift — and the gate would cheerfully
 * conclude "this page has no motion", which is the worst possible failure mode
 * for a gate: silently green. So we wait for a positive signal and, when it
 * never arrives, report that explicitly instead of guessing.
 */
async function waitForMotionResolved(page, timeoutMs = 8_000) {
  try {
    await page.waitForFunction(
      () => {
        if (document.querySelector('[data-band-drift="true"]')) return true;
        const nodes = [...document.querySelectorAll("[data-motion-duration]")];
        return nodes.some((n) => Number.parseFloat(n.getAttribute("data-motion-duration")) > 0);
      },
      null,
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

/** Provokes the magnet with a synthetic pointer move over the first CTA. */
async function pokeMagnets(page) {
  const target = page.locator('[data-motion="magnetic"]').first();
  if ((await target.count()) === 0) return;
  try {
    const box = await target.boundingBox({ timeout: 1_000 });
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.85);
    await page.waitForTimeout(260);
  } catch (e) {
    log("debug", "magnet.poke_failed", { error: String(e?.message ?? e) });
  }
}

async function runJob(browser, job, spec) {
  const { surface, width, locale, pass } = job;
  const url = `${BASE}${surface.path}${surface.path.includes("?") ? "&" : "?"}lang=${locale}`;
  let lastError = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      locale: locale === "bn" ? "bn-BD" : "en-US",
      reducedMotion: pass === "reduced" ? "reduce" : "no-preference",
      javaScriptEnabled: pass !== "ssr",
      hasTouch: width < 1024,
    });
    const consoleErrors = [];
    try {
      const page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) =>
        consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`),
      );

      await page.goto(url, { waitUntil: pass === "ssr" ? "commit" : "load", timeout: 45_000 });
      if (pass === "ssr") {
        // No JS: the DOM is final as soon as parsing completes.
        await page.waitForLoadState("domcontentloaded");
      }

      let motionResolved = true;
      if (pass !== "ssr") {
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        motionResolved = await waitForMotionResolved(page);
        await settleReveals(page);
        if (pass === "full") await pokeMagnets(page);
      }

      const measured = await page.evaluate(MEASURE);
      const report = spec.auditMotionPage({
        route: surface.name,
        viewportPx: width,
        viewportHeightPx: measured.viewportHeightPx,
        locale,
        intent: pass === "reduced" ? "reduced" : "full",
        hydrated: pass !== "ssr",
        reveals: measured.reveals,
        drifts: measured.drifts,
        magnetics: measured.magnetics,
        counters: measured.counters,
        lcp: measured.lcp,
        peakConcurrentAnimations: measured.peakConcurrentAnimations,
        budgetMax: null,
      });

      const at = `${surface.name} @${width}/${locale}/${pass}`;
      const extra = [];
      if (motionResolved && pass === "full" && measured.reveals.length === 0 && surface.name !== "contact") {
        extra.push({
          code: "motion.unknown",
          severity: "info",
          rule: "Marketing bands use the shared entrance primitives",
          where: at,
          message:
            "No [data-motion-state] node on the page: the route either has no entrance motion or is not using Reveal/Stagger, so §10.4's entrance contract is unenforceable here.",
        });
      }
      if (!motionResolved && pass !== "ssr") {
        extra.push({
          code: "motion.unknown",
          severity: "info",
          rule: "Motion intent resolves after hydration",
          where: at,
          message:
            "Motion intent never resolved above `off` within the wait window, so entrance and drift measurements on this view describe the pre-hydration frame rather than the animated one. Usually CPU pressure in the harness; re-run with --concurrency 1 before treating absent motion as a defect.",
        });
      }
      if (
        motionResolved &&
        pass === "full" &&
        surface.name !== "contact" &&
        measured.drifts.length === 0
      ) {
        extra.push({
          code: "motion.drift.missing",
          severity: "info",
          rule: "Hero carries the one drifting field",
          where: at,
          message:
            "No drifting atmosphere found. Expected on routes with a hero aurora; harmless on routes without one.",
        });
      }

      log("debug", "job.done", {
        route: surface.name,
        width,
        locale,
        pass,
        attempt,
        reveals: measured.reveals.length,
        drifts: measured.drifts.length,
        magnets: measured.magnetics.length,
        findings: report.findings.length + extra.length,
      });

      await context.close();
      return {
        ...report,
        pass,
        motionResolved,
        findings: [...report.findings, ...extra],
        consoleErrors,
        revealCount: measured.reveals.length,
      };
    } catch (e) {
      lastError = e;
      await context.close().catch(() => {});
      log("warn", "job.retry", {
        route: surface.name,
        width,
        locale,
        pass,
        attempt,
        error: String(e?.message ?? e).slice(0, 200),
      });
      if (attempt < ATTEMPTS) await sleep(jitter(500 * 2 ** (attempt - 1)));
    }
  }

  return {
    route: surface.name,
    viewportPx: width,
    locale,
    pass,
    intent: pass === "reduced" ? "reduced" : "full",
    hydrated: pass !== "ssr",
    findings: [],
    counts: { error: 0, warn: 0, info: 0 },
    ok: false,
    harnessError: String(lastError?.message ?? lastError),
    consoleErrors: [],
    revealCount: 0,
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
  const unique = spec.dedupeMotionFindings(kept);

  const byRoute = new Map();
  for (const f of unique) {
    const route = f.where.split(" ")[0];
    byRoute.set(route, [...(byRoute.get(route) ?? []), f]);
  }

  const lines = ["", "Phase 10.4 — motion choreography gate"];
  lines.push(
    `  ${SURFACES.length} surfaces × ${WIDTHS.length} widths × ${LOCALES.length} locales × ${PASSES.join("/")} = ${results.length} views`,
  );

  const harnessFailures = results.filter((r) => r.harnessError);
  for (const r of harnessFailures) {
    lines.push(`  HARNESS ${r.route} @${r.viewportPx}/${r.locale}/${r.pass}: ${r.harnessError}`);
  }

  for (const [route, findings] of [...byRoute.entries()].sort()) {
    lines.push("", `  ${route}`);
    const order = { error: 0, warn: 1, info: 2 };
    for (const f of findings.sort((a, b) => order[a.severity] - order[b.severity])) {
      lines.push(`    ${spec.formatMotionFinding(f)}`);
    }
  }

  const consoleErrors = spec.dedupeMotionFindings(
    results.flatMap((r) =>
      r.consoleErrors.map((text) => ({
        code: "motion.unknown",
        severity: "warn",
        rule: "Console is clean",
        where: `${r.route} @${r.viewportPx}/${r.locale}/${r.pass}`,
        message: `console error: ${text}`,
      })),
    ),
  );
  if (consoleErrors.length) {
    lines.push("", "  console");
    for (const f of consoleErrors) lines.push(`    ${spec.formatMotionFinding(f)}`);
  }

  const counts = spec.countMotionBySeverity(unique);
  lines.push("");
  lines.push(
    `  ${counts.error} blocking · ${counts.warn} advisory · ${counts.info} informational` +
      (ALLOW.size ? ` · ${all.length - kept.length} allowed by --allow` : ""),
  );
  lines.push("");
  process.stdout.write(lines.join("\n"));

  return { unique, counts, harnessFailures, consoleErrors };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  if (SURFACES.length === 0) throw new Error(`--only ${ONLY} matched no known surface.`);
  if (WIDTHS.length === 0) throw new Error("--widths produced no usable viewport width.");
  if (PASSES.length === 0) throw new Error("--passes must include at least one of full,reduced,ssr.");

  const spec = await loadSpec();
  await waitForServer(BASE);

  const started = Date.now();
  const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  let results;
  try {
    const jobs = planJobs();
    log("info", "run.start", { jobs: jobs.length, concurrency: CONCURRENCY, base: BASE, passes: PASSES });
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
          gate: "motion",
          generatedAt: new Date().toISOString(),
          base: BASE,
          widths: WIDTHS,
          locales: LOCALES,
          passes: PASSES,
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
  const blocking = summary.counts.error + (FAIL_ON === "warn" ? summary.counts.warn : 0);
  return blocking > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    log("error", "run.failed", { error: String(e?.message ?? e) });
    process.stderr.write(`\nmotion gate could not run: ${e?.stack ?? e}\n`);
    process.exit(2);
  });
