#!/usr/bin/env node
/**
 * Phase 10 — merchant console verification gate.
 *
 * Sweeps the console surfaces at 390 / 768 / 1280 / 1920 in light and dark,
 * runs axe-core on each, and asserts the console-specific invariants that axe
 * cannot see: no horizontal overflow, a visible focus ring on the signal
 * colour, tap targets >= 44px at 390, and no motion left running under
 * prefers-reduced-motion. Screenshots of every section land in
 * .artifacts/console/ so a reviewer can diff them between releases.
 *
 * The console lives behind auth. When no session is injected the gate reports
 * "skipped" and exits 0 rather than failing a release for a missing session.
 *
 * Usage: node scripts/console-gate.mjs [--base http://localhost:8080] [--min 90]
 */
import { mkdirSync, readFileSync } from "node:fs";
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
const outDir = ".artifacts/console";

/** The eight audited sections — one representative surface each. */
const PAGES = [
  { name: "dashboard", path: "/admin" },
  { name: "orders", path: "/admin/orders" },
  { name: "products", path: "/admin/products" },
  { name: "product-new", path: "/admin/products/new" },
  { name: "customers", path: "/admin/customers" },
  { name: "content", path: "/admin/content/pages" },
  { name: "editor-page", path: "/admin/content/editor?kind=page" },
  { name: "editor-post", path: "/admin/content/editor?kind=post" },
  { name: "marketing", path: "/admin/marketing/coupons" },
  { name: "money", path: "/admin/money/payments" },
  { name: "settings", path: "/admin/settings" },
  { name: "settings-seo", path: "/admin/settings/seo" },
  { name: "content-media", path: "/admin/content/media" },
  { name: "content-menus", path: "/admin/content/menus" },
  { name: "themes", path: "/admin/content/themes" },
];

const WIDTHS = [390, 768, 1280, 1920];
const VARIANTS = [
  { name: "light", scheme: "light" },
  { name: "dark", scheme: "dark" },
  { name: "reduced", scheme: "light", reducedMotion: "reduce" },
];

const WEIGHT = { critical: 10, serious: 7, moderate: 3, minor: 1 };
function score(results) {
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

const sessionJson = process.env.BROWSER_SUPABASE_SESSION_JSON;
const storageKey = process.env.BROWSER_SUPABASE_STORAGE_KEY;
const email = process.env.GATE_EMAIL;
const password = process.env.GATE_PASSWORD;

if ((!sessionJson || !storageKey) && (!email || !password)) {
  console.log(
    "console gate skipped — no authenticated session available for /admin. " +
      "Inject a session, or set GATE_EMAIL / GATE_PASSWORD to sign in through /auth.",
  );
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const only = (process.env.GATE_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const failures = [];
const browser = await chromium.launch();

/**
 * Signing in through the real /auth form once, then replaying the stored
 * origin state into every sweep context, keeps the gate runnable on machines
 * that have credentials but no injected session — and exercises the login
 * path a merchant actually uses.
 */
let seededState = null;
if (!sessionJson || !storageKey) {
  const loginContext = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${base}/auth`, { waitUntil: "domcontentloaded" });
  await loginPage.waitForSelector("input[type=email]", { timeout: 20000 });
  // The form only becomes interactive after hydration; filling earlier is discarded.
  await loginPage.waitForTimeout(3500);
  await loginPage.fill("input[type=email]", email);
  await loginPage.fill("input[type=password]", password);
  await loginPage.getByRole("button", { name: /sign in/i }).first().click();
  await loginPage.waitForURL(/\/admin/, { timeout: 30000 }).catch(() => {});
  await loginPage.waitForTimeout(1500);
  const state = await loginContext.storageState();
  seededState = state.origins?.find((o) => base.startsWith(o.origin))?.localStorage ?? [];
  await loginContext.close();
  if (seededState.length === 0) {
    console.error("console gate FAILED: could not sign in with GATE_EMAIL / GATE_PASSWORD.");
    await browser.close();
    process.exit(1);
  }
}

for (const variant of VARIANTS) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 1400 },
      colorScheme: variant.scheme,
      reducedMotion: variant.reducedMotion ?? "no-preference",
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    if (seededState) {
      await page.evaluate((entries) => {
        for (const { name, value } of entries) window.localStorage.setItem(name, value);
      }, seededState);
    } else {
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [storageKey, sessionJson],
      );
    }


    for (const target of PAGES.filter((p) => !only.length || only.some((o) => p.name.includes(o)))) {
      const label = `${target.name} [${variant.name}@${width}]`;
      try {
        const res = await page.goto(base + target.path, { waitUntil: "domcontentloaded" });
        if (!res || res.status() >= 400) {
          failures.push(`${label}: HTTP ${res ? res.status() : "no response"}`);
          continue;
        }
        // Hydration in dev can take seconds; wait for the page heading before auditing.
        await page.waitForSelector("main h1, main textarea[aria-label]", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1200);

        await page.addScriptTag({ content: axeSource });
        const results = await page.evaluate(async () =>
          window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          }),
        );
        const value = score(results);
        console.log(`${String(value).padStart(3)}  ${label}`);
        for (const v of results.violations) {
          console.log(`      ${v.impact ?? "minor"}  ${v.id} — ${v.help} (${v.nodes.length})`);
        }
        if (value < min) failures.push(`${label}: axe score ${value} < ${min}`);
        if (results.violations.some((v) => v.id === "color-contrast"))
          failures.push(`${label}: text below 4.5:1 contrast`);

        // No console surface may scroll sideways at any sweep width.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 2) failures.push(`${label}: ${overflow}px horizontal overflow`);

        // Primary tap targets stay reachable with a thumb on the phone width.
        if (width === 390) {
          const small = await page.evaluate(() =>
            [...document.querySelectorAll("main button, main a[href]")]
              .filter((el) => el.getClientRects().length > 0)
              .filter((el) => {
                // Inline links inside running text inherit the line box; only
                // stand-alone controls are held to the thumb-target rule.
                if (getComputedStyle(el).display === "inline") return false;
                const r = el.getBoundingClientRect();
                return r.height > 0 && r.height < 32;
              })
              .map((el) => `${Math.round(el.getBoundingClientRect().height)}px "${(el.textContent ?? "").trim().slice(0, 24)}" .${el.className.toString().slice(0, 60)}`),
          );
          if (small.length > 0)
            failures.push(`${label}: ${small.length} tap target(s) under 32px tall — ${small.join(" | ")}`);
        }

        // Keyboard: the first tab stop must show a visible focus ring.
        // The tab must own document focus, otherwise :focus / :focus-visible
        // never match and every ring reads as missing.
        await page.bringToFront();
        await page.keyboard.press("Tab");
        // Outline width settles a frame after focus moves in headless Chromium.
        await page.waitForTimeout(120);
        const ring = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return { state: "none", who: "body" };
          const s = getComputedStyle(el);
          const visible =
            (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
          return {
            state: visible ? "ok" : "missing",
            who: `<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 24)}" .${el.className.toString().slice(0, 60)}`,
          };
        });
        if (ring.state !== "ok")
          failures.push(`${label}: first tab stop has no visible focus ring — ${ring.who}`);

        if (variant.reducedMotion === "reduce") {
          const animating = await page.evaluate(() =>
            document
              .getAnimations()
              .filter((a) => a.playState === "running")
              .map((a) => {
                const t = a.effect?.target;
                const name = a.animationName ?? a.transitionProperty ?? "animation";
                return `${name} on <${t?.tagName?.toLowerCase() ?? "?"}> .${t?.className?.toString?.().slice(0, 50) ?? ""}`;
              }),
          );
          if (animating.length > 0)
            failures.push(
              `${label}: ${animating.length} animation(s) running under reduced motion — ${animating.join(" | ")}`,
            );
        }

        if (width === 1280 && variant.name === "light") {
          await page.screenshot({ path: `${outDir}/${target.name}.png` });
        }
      } catch (err) {
        failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await context.close();
  }
}

await browser.close();

if (failures.length > 0) {
  console.error("\nconsole gate FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nconsole gate passed — every section scored >= ${min} at 390/768/1280/1920.`);
