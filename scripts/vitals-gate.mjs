#!/usr/bin/env node
/**
 * Phase 9 — field-vitals release gate (the Lighthouse-CI slot).
 *
 * Measures the three storefront surfaces shoppers actually load — index,
 * collection/search and product — in a throttled mobile profile and fails the
 * run when LCP / CLS / long-task blocking time exceed the platform budget, or
 * when the axe score for the page drops below the a11y floor.
 *
 * Thresholds come from src/lib/web-vitals.ts (asserted by test), so CI and the
 * app can never quote different numbers.
 *
 * Usage: node scripts/vitals-gate.mjs [--base http://localhost:8080] [--a11y-min 95]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, devices } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const base = arg("base", process.env.E2E_BASE_URL ?? "http://localhost:8080");
const a11yMin = Number(arg("a11y-min", "95"));
// The seeded demo store. The gate used to point at `cloudman`, which no
// environment actually provisions, so every storefront surface scored a 404
// and the run "passed" without measuring a single merchant page.
const storeSlug = process.env.E2E_STORE_SLUG ?? "frame19-demo";
/** Overridable so a merchant-specific regression can be measured directly. */
const productSlug = process.env.E2E_PRODUCT_SLUG ?? "";

// Kept in sync with VITALS_BUDGET in src/lib/web-vitals.ts (asserted by test).
const VITALS_BUDGET = { lcpMs: 2500, inpMs: 200, cls: 0.02 };
/** Total blocking time stands in for the interaction budget in a lab run. */
const TBT_BUDGET_MS = 300;

// Kept in sync with MARKETING_VITALS_BUDGET in src/lib/web-vitals.ts.
const MARKETING_BUDGET = { lcpMs: 2000, inpMs: 200, cls: 0.02, tbtMs: 250 };

/**
 * Phase 10.5 — the marketing surfaces are measured with the same rig as the
 * storefront but against a stricter LCP: we control every byte on `/`, so a
 * slow paint there is our own regression, not a merchant's 4MB hero image.
 */
/**
 * The product surface used to reuse the store index path, so a PDP regression
 * was invisible. Resolve a real product URL from the store's own sitemap, and
 * fail loudly rather than silently measure the wrong page.
 */
async function resolveProductPath() {
  if (productSlug) return `/store/${storeSlug}/p/${productSlug}`;
  for (const url of [
    `${base}/store/${storeSlug}/sitemaps/products`,
    `${base}/store/${storeSlug}/sitemap.xml`,
  ]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const found = /\/store\/[^<"\s]+\/p\/([^<"\s?]+)/.exec(await res.text());
      if (found) return `/store/${storeSlug}/p/${found[1]}`;
    } catch {
      // Fall through to the next candidate.
    }
  }
  return null;
}

const productPath = await resolveProductPath();
if (!productPath) {
  console.error(
    `vitals-gate: no product URL found for store "${storeSlug}". ` +
      `Seed the store or set E2E_PRODUCT_SLUG.`,
  );
  process.exit(1);
}

const PAGES = [
  { name: "index", path: `/store/${storeSlug}` },
  { name: "collection", path: `/store/${storeSlug}/search?q=` },
  { name: "product", path: productPath },
  { name: "marketing:/", path: "/", budget: MARKETING_BUDGET },
  { name: "marketing:pricing", path: "/pricing", budget: MARKETING_BUDGET },
  { name: "marketing:features", path: "/features", budget: MARKETING_BUDGET },
];

const WEIGHT = { critical: 10, serious: 7, moderate: 3, minor: 1 };
function axeScore(results) {
  let earned = 0;
  let total = 0;
  for (const p of results.passes) {
    const w = WEIGHT[p.impact ?? "minor"] ?? 1;
    total += w;
    earned += w;
  }
  for (const v of results.violations) total += WEIGHT[v.impact ?? "minor"] ?? 1;
  return total === 0 ? 100 : Math.round((earned / total) * 100);
}

/**
 * LCP, layout-shift and longtask entries are not retrievable with
 * `getEntriesByType` — the buffer is only exposed to a `PerformanceObserver`
 * registered with `buffered: true`. The gate used to read them the other way
 * and got zeros on every surface, which meant it reported "inside budget"
 * without ever measuring a page. The observers are installed before any
 * document script runs so nothing is missed.
 */
const COLLECTOR = `
  window.__vitals = { lcpMs: 0, cls: 0, tbtMs: 0 };
  try {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) window.__vitals.lcpMs = Math.round(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__vitals.tbtMs += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
`;

const failures = [];
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 5"] });
await context.addInitScript(COLLECTOR);

for (const target of PAGES) {
  const page = await context.newPage();
  try {
    // Mobile-class CPU + network, so the numbers mean something.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    const res = await page.goto(base + target.path, { waitUntil: "load" });
    if (!res || res.status() >= 400) {
      failures.push(`${target.name}: HTTP ${res ? res.status() : "no response"}`);
      continue;
    }
    await page.waitForTimeout(3000);

    const vitals = await page.evaluate(() => {
      const v = window.__vitals ?? { lcpMs: 0, cls: 0, tbtMs: 0 };
      return {
        lcpMs: Math.round(v.lcpMs),
        cls: Number(v.cls.toFixed(4)),
        tbtMs: Math.round(v.tbtMs),
      };
    });
    // An LCP of zero means the collector never fired, not a perfect page.
    if (vitals.lcpMs === 0) failures.push(`${target.name}: no LCP recorded`);

    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      }),
    );
    // Likewise: a page where axe asserted nothing has not scored 100.
    if (results.passes.length === 0 && results.violations.length === 0) {
      failures.push(`${target.name}: axe ran no checks`);
    }
    const a11y = axeScore(results);

    console.log(
      `${target.name.padEnd(11)} LCP ${String(vitals.lcpMs).padStart(5)}ms  CLS ${String(
        vitals.cls,
      ).padStart(6)}  TBT ${String(vitals.tbtMs).padStart(4)}ms  a11y ${a11y}`,
    );

    const budget = target.budget ?? { ...VITALS_BUDGET, tbtMs: TBT_BUDGET_MS };
    if (vitals.lcpMs > budget.lcpMs)
      failures.push(`${target.name}: LCP ${vitals.lcpMs}ms > ${budget.lcpMs}ms`);
    if (vitals.cls > budget.cls)
      failures.push(`${target.name}: CLS ${vitals.cls} > ${budget.cls}`);
    if (vitals.tbtMs > budget.tbtMs)
      failures.push(`${target.name}: TBT ${vitals.tbtMs}ms > ${budget.tbtMs}ms`);
    if (a11y < a11yMin) failures.push(`${target.name}: a11y ${a11y} < ${a11yMin}`);
  } catch (err) {
    failures.push(`${target.name}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await page.close();
  }
}

await context.close();
await browser.close();

if (failures.length > 0) {
  console.error("\nvitals gate FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nvitals gate passed — every storefront surface is inside budget.");
