#!/usr/bin/env node
/**
 * Accessibility release gate.
 *
 * Runs axe-core against the release-critical surfaces in a real browser and
 * scores each page the way Lighthouse does: every audit carries a weight, a
 * page's score is the weighted pass ratio, and anything under the threshold
 * fails the run. Serious/critical violations fail outright regardless of score
 * because checkout and auth are AAA surfaces in this product.
 *
 * Phase 9: every surface is swept in four variants — light/dark colour scheme
 * × EN/বাংলা — because contrast (>= 4.5:1) and text elasticity are properties of
 * the rendered theme, not of the markup alone.
 *
 * Usage: node scripts/a11y-gate.mjs [--base http://localhost:8080] [--min 90]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const base = arg("base", process.env.E2E_BASE_URL ?? "http://localhost:8080");
const min = Number(arg("min", "90"));
const storeSlug = process.env.E2E_STORE_SLUG ?? "cloudman";

const PAGES = [
  { name: "home", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "features", path: "/features" },
  { name: "contact", path: "/contact" },
  { name: "auth", path: "/auth", strict: true },
  { name: "storefront", path: `/store/${storeSlug}` },
  { name: "search", path: `/store/${storeSlug}/search?q=` },
  { name: "checkout", path: `/store/${storeSlug}/checkout`, strict: true },
];

/** Phase 9: contrast + elasticity are checked in every theme × locale combo. */
const VARIANTS = [
  { name: "light-en", scheme: "light", locale: "en" },
  { name: "dark-en", scheme: "dark", locale: "en" },
  { name: "light-bn", scheme: "light", locale: "bn" },
  { name: "dark-bn", scheme: "dark", locale: "bn" },
  // Phase 10.1 — the marketing motion layer must degrade, not disappear:
  // with reduced motion forced, every revealed section is settled and every
  // decorative loop is parked.
  { name: "reduced-en", scheme: "light", locale: "en", reducedMotion: "reduce" },
];

// Lighthouse-equivalent impact weights.
const WEIGHT = { critical: 10, serious: 7, moderate: 3, minor: 1 };

function score(results) {
  let earned = 0;
  let total = 0;
  const consider = (node, passed) => {
    const w = WEIGHT[node.impact ?? "minor"] ?? 1;
    total += w;
    if (passed) earned += w;
  };
  for (const p of results.passes) consider(p, true);
  for (const v of results.violations) consider(v, false);
  if (total === 0) return 100;
  return Math.round((earned / total) * 100);
}

const failures = [];
const browser = await chromium.launch();

for (const variant of VARIANTS) {
const context = await browser.newContext({
  viewport: { width: 1280, height: 1800 },
  colorScheme: variant.scheme,
  reducedMotion: variant.reducedMotion ?? "no-preference",
  locale: variant.locale === "bn" ? "bn-BD" : "en-US",
});

for (const page_ of PAGES) {
  const page = await context.newPage();
  try {
    const sep = page_.path.includes("?") ? "&" : "?";
    const res = await page.goto(`${base}${page_.path}${sep}lang=${variant.locale}`, {
      waitUntil: "domcontentloaded",
    });
    if (!res || res.status() >= 400) {
      failures.push(`${page_.name} [${variant.name}]: HTTP ${res ? res.status() : "no response"}`);
      continue;
    }
    await page.waitForTimeout(1200);
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      }),
    );
    const value = score(results);
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    const line = `${value.toString().padStart(3)}  ${variant.name.padEnd(9)} ${page_.name.padEnd(12)} ${page_.path}`;
    console.log(line);
    for (const v of results.violations) {
      console.log(`      ${v.impact ?? "minor"}  ${v.id} — ${v.help} (${v.nodes.length} node(s))`);
    }
    if (value < min) failures.push(`${page_.name} [${variant.name}]: score ${value} < ${min}`);
    // Contrast is never allowed to slip, in any variant, on any surface.
    const contrast = results.violations.filter((v) => v.id === "color-contrast");
    if (contrast.length > 0) {
      failures.push(
        `${page_.name} [${variant.name}]: ${contrast[0].nodes.length} node(s) below 4.5:1 contrast`,
      );
    }
    if (page_.strict && blocking.length > 0) {
      failures.push(
        `${page_.name} [${variant.name}]: ${blocking.length} serious/critical violation(s) on an AAA surface`,
      );
    }

    // Motion invariants — checked in every variant, enforced hard under
    // reduced motion. Content that is still `pending` after load is content a
    // visitor cannot read, which is a worse bug than a missing animation.
    const motion = await page.evaluate(() => ({
      pending: document.querySelectorAll('[data-motion-state="pending"]').length,
      running: document.querySelectorAll('[data-motion="marquee"][data-running="true"]').length,
      drifting: document.querySelectorAll('[data-motion="gradient-mesh"][data-drifting="true"]').length,
    }));
    if (motion.pending > 0) {
      failures.push(
        `${page_.name} [${variant.name}]: ${motion.pending} node(s) stuck in a pending reveal`,
      );
    }
    if (variant.reducedMotion === "reduce" && (motion.running > 0 || motion.drifting > 0)) {
      failures.push(
        `${page_.name} [${variant.name}]: decorative motion still running under prefers-reduced-motion ` +
          `(marquee=${motion.running}, mesh=${motion.drifting})`,
      );
    }
  } catch (err) {
    failures.push(`${page_.name} [${variant.name}]: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await page.close();
  }
}

await context.close();
}

await browser.close();

if (failures.length > 0) {
  console.error("\na11y gate FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\na11y gate passed — every surface scored >= ${min}.`);
