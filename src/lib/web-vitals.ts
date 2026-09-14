/**
 * Phase 7.3 — the platform performance contract.
 *
 * One module owns the numbers so the CI gate, the storefront runtime and the
 * merchant-facing copy can never quote different budgets. Everything here is
 * pure data + pure functions: `scripts/perf-budget.mjs` reads the same
 * constants the tests assert on.
 */
import { fontPreload } from "./theme-fonts";

/** Field thresholds. A route is "good" only at or under these values. */
export const VITALS_BUDGET = {
  /** Largest Contentful Paint, milliseconds. */
  lcpMs: 2500,
  /** Interaction to Next Paint, milliseconds. */
  inpMs: 200,
  /** Cumulative Layout Shift, unitless. Stricter than the web default (0.1). */
  cls: 0.02,
} as const;

export type VitalName = keyof typeof VITALS_BUDGET;
export type VitalRating = "good" | "needs-improvement" | "poor";

/**
 * Lab thresholds for the CI gate (`scripts/vitals-gate.mjs`). Category scores
 * are Lighthouse-equivalent floors; the field numbers re-export
 * `VITALS_BUDGET` so a budget can only be changed in one place.
 */
export const LIGHTHOUSE_BUDGET = {
  /** Mobile performance category floor. */
  performance: 90,
  /** Accessibility category floor. */
  accessibility: 95,
  /** Total Blocking Time, milliseconds. */
  tbtMs: 300,
  lcpMs: VITALS_BUDGET.lcpMs,
  inpMs: VITALS_BUDGET.inpMs,
  clsL: VITALS_BUDGET.cls,
} as const;

/**
 * Phase 10.5 — the marketing site is held to a stricter LCP than a storefront.
 *
 * A storefront has to render merchant-supplied imagery it does not control; `/`
 * renders our own hero, our own fonts and our own copy, so there is no excuse
 * for a slow paint. Every number here is enforced by `scripts/vitals-gate.mjs`
 * against the marketing surfaces, and by `scripts/perf-budget.mjs` for weight.
 */
export const MARKETING_VITALS_BUDGET = {
  lcpMs: 2000,
  inpMs: VITALS_BUDGET.inpMs,
  cls: VITALS_BUDGET.cls,
  /** Lab stand-in for INP in the CI run. */
  tbtMs: 250,
} as const;

/** Transfer budget for a marketing route, gzipped bytes. */
export const MARKETING_ASSET_BUDGET = {
  cssGzBytes: 60 * 1024,
  jsGzBytes: 140 * 1024,
} as const;

/** Anything beyond twice the budget is poor, matching the CWV grading shape. */
export function rateVital(name: VitalName, value: number): VitalRating {
  const budget = VITALS_BUDGET[name];
  if (!Number.isFinite(value) || value < 0) return "poor";
  if (value <= budget) return "good";
  return value <= budget * 2 ? "needs-improvement" : "poor";
}

/** Per-storefront-route transfer budgets, gzipped bytes. */
export const ASSET_BUDGET = {
  cssGzBytes: 60 * 1024,
  jsGzBytes: 100 * 1024,
} as const;

/**
 * Merchant/third-party code budget. Storefront scripts that are not deferred
 * block parsing and are the single biggest INP regression in this product, so
 * a blocking script fails the budget regardless of size.
 */
export const THIRD_PARTY_BUDGET = {
  /** Combined gzipped bytes of every merchant/plugin script on one page. */
  scriptGzBytes: 30 * 1024,
  /** Distinct third-party script sources on one page. */
  maxScripts: 4,
} as const;

export type BudgetFailure = {
  /** Stable machine code — CI prints these, tests assert on them. */
  code: string;
  message: string;
  actual: number;
  budget: number;
};

export type BudgetReport = {
  ok: boolean;
  failures: BudgetFailure[];
};

function fail(code: string, message: string, actual: number, budget: number): BudgetFailure {
  return { code, message, actual, budget };
}

/** Bytes → "42.1KB" for CI output. */
export function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/** CSS/JS weight of one storefront route, measured gzipped. */
export function checkAssetBudget(input: {
  route: string;
  cssGzBytes: number;
  jsGzBytes: number;
}): BudgetReport {
  const failures: BudgetFailure[] = [];
  if (input.cssGzBytes > ASSET_BUDGET.cssGzBytes) {
    failures.push(
      fail(
        "asset:css",
        `${input.route}: CSS ${formatBytes(input.cssGzBytes)} gz exceeds ${formatBytes(ASSET_BUDGET.cssGzBytes)}.`,
        input.cssGzBytes,
        ASSET_BUDGET.cssGzBytes,
      ),
    );
  }
  if (input.jsGzBytes > ASSET_BUDGET.jsGzBytes) {
    failures.push(
      fail(
        "asset:js",
        `${input.route}: JS ${formatBytes(input.jsGzBytes)} gz exceeds ${formatBytes(ASSET_BUDGET.jsGzBytes)}.`,
        input.jsGzBytes,
        ASSET_BUDGET.jsGzBytes,
      ),
    );
  }
  return { ok: failures.length === 0, failures };
}

export type ThirdPartyScript = {
  name: string;
  gzBytes: number;
  /** False for a parser-blocking script — always a failure. */
  deferred: boolean;
};

export function checkThirdPartyBudget(scripts: ThirdPartyScript[]): BudgetReport {
  const failures: BudgetFailure[] = [];
  for (const script of scripts) {
    if (!script.deferred) {
      failures.push(fail("third_party:blocking", `${script.name} is not deferred.`, 1, 0));
    }
  }
  if (scripts.length > THIRD_PARTY_BUDGET.maxScripts) {
    failures.push(
      fail(
        "third_party:count",
        `${scripts.length} third-party scripts exceed the ${THIRD_PARTY_BUDGET.maxScripts} allowed on one page.`,
        scripts.length,
        THIRD_PARTY_BUDGET.maxScripts,
      ),
    );
  }
  const total = scripts.reduce((sum, s) => sum + Math.max(0, s.gzBytes), 0);
  if (total > THIRD_PARTY_BUDGET.scriptGzBytes) {
    failures.push(
      fail(
        "third_party:bytes",
        `Third-party scripts weigh ${formatBytes(total)} gz, over ${formatBytes(THIRD_PARTY_BUDGET.scriptGzBytes)}.`,
        total,
        THIRD_PARTY_BUDGET.scriptGzBytes,
      ),
    );
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Both font subsets ship in one stylesheet and both are preloaded, so a locale
 * switch never swaps in an unloaded face. The fallback metrics below keep the
 * pre-swap box the same height as the real face — that is what holds CLS at 0
 * when বাংলা replaces English mid-session.
 *
 * Phase 3: this is no longer a hand-written constant. It is derived from the
 * *platform default* pairing through `theme-fonts`; a storefront derives its
 * own from the active theme's pairing via `fontHeadLinks(tokens)`.
 */
export const FONT_PRELOAD = fontPreload({
  fontDisplay: "Noto Sans Bengali",
  fontBody: "Inter",
});

