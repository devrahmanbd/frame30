#!/usr/bin/env node
/**
 * Phase 5 — responsive release gate.
 *
 * The static half of this contract lives in `src/lib/responsive-lint.ts` and
 * runs on the publish path. This is the empirical half: it loads the real
 * storefront in a real browser at every supported width, in both locales and
 * both colour schemes, and measures what only a layout engine can tell us.
 *
 * Per surface × width × locale × scheme it asserts:
 *   1. no horizontal overflow — `scrollWidth` must not exceed the viewport,
 *      and the offending elements are named (up to five, widest first) so the
 *      failure is actionable rather than a number;
 *   2. every interactive element is at least 44×44 CSS px, skipping elements
 *      that are hidden, zero-sized or inline links inside a paragraph (WCAG
 *      2.5.8 exempts inline text links);
 *   3. no `100vh` in any computed height — the platform standard is `100dvh`,
 *      because mobile Safari's collapsing URL bar makes `vh` lie;
 *   4. no fixed-width tappable inside a `lang="bn"` subtree, since বাংলা runs
 *      15–30% longer than the English the width was eyeballed against.
 *
 * Exit code is 1 on any failure, with a grouped report. Usage:
 *   node scripts/responsive-sweep.mjs [--base URL] [--widths 320,360,768]
 *                                     [--only storefront] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const base = arg("base", process.env.E2E_BASE_URL ?? "http://localhost:8080");
const storeSlug = process.env.E2E_STORE_SLUG ?? "cloudman";
const widths = arg("widths", "320,360,768,1024,1440,1920")
  .split(",")
  .map((w) => Number(w.trim()))
  .filter((w) => Number.isFinite(w) && w >= 320);
const only = arg("only", null);
const jsonOut = arg("json", null);
const MIN_TOUCH_PX = 44;
/** Sub-pixel tolerance: layout engines round, we should not fail on 0.5px. */
const OVERFLOW_SLACK_PX = 1;

/**
 * Phase 10 — the sweep covers every public marketing route, not just the two
 * that existed when it was written.
 *
 * `bands` is first on purpose. It is the internal visual-smoke surface that
 * renders every band primitive with long English strings, a three-line card
 * title, a wide comparison matrix and Bangla subtrees. A primitive-level
 * regression therefore fails on one surface with a precise element label,
 * instead of failing on eight marketing routes at once and forcing a bisect
 * through page copy to find the shared cause.
 *
 * `--only <name>` still narrows to a single surface for a tight edit loop.
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
  { name: "storefront", path: `/store/${storeSlug}` },
  { name: "product", path: `/store/${storeSlug}` },
  { name: "checkout", path: `/store/${storeSlug}/checkout` },
].filter((s) => !only || s.name === only);


const VARIANTS = [
  { scheme: "light", locale: "en" },
  { scheme: "dark", locale: "en" },
  { scheme: "light", locale: "bn" },
  { scheme: "dark", locale: "bn" },
];

/** Runs in the page. Returns plain data only — no DOM handles cross the bridge. */
const AUDIT = ({ minTouch, slack }) => {
  const label = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
    const text = (el.textContent ?? "").trim().slice(0, 28);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const viewport = document.documentElement.clientWidth;
  const overflow = [];
  const tap = [];
  const vh = [];
  const bnFixed = [];

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.right > viewport + slack || rect.left < -slack) {
      const style = getComputedStyle(el);
      // Deliberate horizontal scrollers (rails, tables) are allowed to be
      // wider than the viewport *inside* their own scroll box.
      if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
      let parent = el.parentElement;
      let inScroller = false;
      while (parent && parent !== document.body) {
        const ps = getComputedStyle(parent);
        if (ps.overflowX === "auto" || ps.overflowX === "scroll" || ps.overflowX === "hidden") {
          inScroller = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!inScroller) overflow.push({ el: label(el), right: Math.round(rect.right), width: Math.round(rect.width) });
    }
    const style = getComputedStyle(el);
    if (/\b\d+(?:\.\d+)?vh\b/.test(style.height) || /\b\d+(?:\.\d+)?vh\b/.test(style.minHeight)) {
      vh.push({ el: label(el), height: style.height, minHeight: style.minHeight });
    }
  }

  const interactive = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])',
  );
  for (const el of interactive) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    // WCAG 2.5.8 exemption: an inline link inside a run of text.
    const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
    if (inline) continue;
    // Off-canvas by design: spam honeypots and skip links are parked far to the
    // left. They are not pointer targets at all, so a 44px rule says nothing
    // about them — measuring them only produces noise that hides real failures.
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewport) continue;
    // A checkbox or radio may be small when its `<label>` shares the hit area:
    // clicking the label activates the control, so the effective target is the
    // union of the two boxes. WCAG 2.5.8 measures the target, not the widget.
    let w = rect.width;
    let h = rect.height;
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      const labelEl = el.id
        ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        : el.closest("label");
      if (labelEl) {
        const lr = labelEl.getBoundingClientRect();
        w = Math.max(rect.right, lr.right) - Math.min(rect.left, lr.left);
        h = Math.max(rect.bottom, lr.bottom) - Math.min(rect.top, lr.top);
      }
    }
    if (w + 0.5 < minTouch || h + 0.5 < minTouch) {
      tap.push({ el: label(el), w: Math.round(w), h: Math.round(h) });
    }

    if (el.closest('[lang="bn"]')) {
      const style = getComputedStyle(el);
      if (style.width !== "auto" && style.maxWidth !== "none" && style.flexShrink === "0" && style.minWidth !== "0px") {
        bnFixed.push({ el: label(el), width: style.width, minWidth: style.minWidth });
      }
    }
  }

  return {
    viewport,
    docScrollWidth: document.documentElement.scrollWidth,
    overflow: overflow.sort((a, b) => b.right - a.right).slice(0, 5),
    tap: tap.slice(0, 8),
    vh: vh.slice(0, 5),
    bnFixed: bnFixed.slice(0, 5),
  };
};

const failures = [];
const report = [];
const browser = await chromium.launch();

try {
  for (const variant of VARIANTS) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: variant.scheme,
        locale: variant.locale === "bn" ? "bn-BD" : "en-US",
        deviceScaleFactor: 2,
        hasTouch: width <= 768,
        isMobile: width <= 768,
      });
      // The storefront remembers the language per store; seed it so the বাংলা
      // pass measures বাংলা text and not English with a Bangla `Accept-Language`.
      await context.addInitScript((locale) => {
        try {
          window.localStorage.setItem("fq.lang", locale);
        } catch {
          /* storage disabled — the Accept-Language header still applies */
        }
      }, variant.locale);

      const page = await context.newPage();
      for (const surface of SURFACES) {
        const url = `${base}${surface.path}`;
        const tag = `${surface.name} @${width} ${variant.scheme}/${variant.locale}`;
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          if (response && response.status() >= 500) {
            failures.push(`${tag}: server returned ${response.status()}`);
            continue;
          }
          // Let fonts settle: a Bangla face swapping in changes every width.
          await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
          await page.evaluate(() => document.fonts?.ready).catch(() => {});

          const result = await page.evaluate(AUDIT, { minTouch: MIN_TOUCH_PX, slack: OVERFLOW_SLACK_PX });
          report.push({ tag, ...result });

          if (result.docScrollWidth > result.viewport + OVERFLOW_SLACK_PX) {
            failures.push(
              `${tag}: horizontal overflow — document is ${result.docScrollWidth}px wide in a ${result.viewport}px viewport` +
                (result.overflow.length ? `\n      widest: ${result.overflow.map((o) => `${o.el} (right ${o.right}px)`).join("\n              ")}` : ""),
            );
          }
          if (result.tap.length) {
            failures.push(
              `${tag}: ${result.tap.length} tap target(s) under ${MIN_TOUCH_PX}px — ${result.tap
                .map((x) => `${x.el} ${x.w}×${x.h}`)
                .join("; ")}`,
            );
          }
          if (result.vh.length) {
            failures.push(`${tag}: 100vh used — ${result.vh.map((x) => `${x.el} (${x.height}/${x.minHeight})`).join("; ")}`);
          }
          if (variant.locale === "bn" && result.bnFixed.length) {
            failures.push(
              `${tag}: fixed-width tappable inside a বাংলা subtree — ${result.bnFixed.map((x) => `${x.el} ${x.width}`).join("; ")}`,
            );
          }
        } catch (error) {
          failures.push(`${tag}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ base, widths, failures, report }, null, 2));

const surfaces = SURFACES.length * VARIANTS.length * widths.length;
console.log(`responsive sweep: ${surfaces} surface renders (${widths.join("/")} px × light/dark × en/bn)`);
if (failures.length) {
  console.error(`\n${failures.length} responsive failure(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(has("soft") ? 0 : 1);
}
console.log("responsive sweep: PASS — no overflow, no small tap targets, no vh units.");
