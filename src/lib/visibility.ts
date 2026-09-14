/**
 * Phase 3.2 — conditional section visibility.
 *
 * Pure evaluation so it unit-tests cleanly and behaves identically in SSR.
 * Rules are AND-combined: every rule must pass for the section to render.
 * Rules that depend on the visitor (auth, cart, segment) are "deferred" during
 * SSR — the renderer hides the section until hydration, so no mismatch.
 */
export type VisibilityKind = "auth" | "cart" | "locale" | "date" | "segment";

export type VisibilityRule = {
  kind: VisibilityKind;
  /**
   * auth: is / not (`in` | `out`)
   * cart: empty | not_empty | min_items | min_total (value = number)
   * locale: is | not (`en` | `bn`)
   * date: after | before (ISO date string)
   * segment: is | not (segment key)
   */
  op: string;
  value: string | number;
};

export const VISIBILITY_OPS: Record<VisibilityKind, string[]> = {
  auth: ["is"],
  cart: ["empty", "not_empty", "min_items", "min_total"],
  locale: ["is", "not"],
  date: ["after", "before"],
  segment: ["is", "not"],
};

export type VisibilityContext = {
  /** Null when unknown (SSR): visitor-dependent rules defer. */
  signedIn: boolean | null;
  cartCount: number | null;
  cartTotalMinor: number | null;
  locale: "en" | "bn";
  now: number;
  segments: string[] | null;
};

export type VisibilityResult = { visible: boolean; deferred: boolean };

function ruleResult(rule: VisibilityRule, ctx: VisibilityContext): VisibilityResult {
  switch (rule.kind) {
    case "auth": {
      if (ctx.signedIn === null) return { visible: false, deferred: true };
      const want = String(rule.value) === "in";
      return { visible: ctx.signedIn === want, deferred: false };
    }
    case "cart": {
      if (ctx.cartCount === null) return { visible: false, deferred: true };
      const total = ctx.cartTotalMinor ?? 0;
      const n = Number(rule.value);
      if (rule.op === "empty") return { visible: ctx.cartCount === 0, deferred: false };
      if (rule.op === "not_empty") return { visible: ctx.cartCount > 0, deferred: false };
      if (rule.op === "min_items")
        return { visible: ctx.cartCount >= (Number.isFinite(n) ? n : 0), deferred: false };
      if (rule.op === "min_total")
        return { visible: total >= (Number.isFinite(n) ? n : 0), deferred: false };
      return { visible: true, deferred: false };
    }
    case "locale": {
      const match = ctx.locale === String(rule.value);
      return { visible: rule.op === "not" ? !match : match, deferred: false };
    }
    case "date": {
      const at = Date.parse(String(rule.value));
      if (!Number.isFinite(at)) return { visible: true, deferred: false };
      return { visible: rule.op === "before" ? ctx.now < at : ctx.now >= at, deferred: false };
    }
    case "segment": {
      if (ctx.segments === null) return { visible: false, deferred: true };
      const match = ctx.segments.includes(String(rule.value));
      return { visible: rule.op === "not" ? !match : match, deferred: false };
    }
    default:
      return { visible: true, deferred: false };
  }
}

/** AND-combines every rule; an empty rule list always renders. */
export function evaluateVisibility(
  rules: VisibilityRule[] | undefined,
  ctx: VisibilityContext,
): VisibilityResult {
  if (!rules || rules.length === 0) return { visible: true, deferred: false };
  let deferred = false;
  for (const rule of rules) {
    const result = ruleResult(rule, ctx);
    if (result.deferred) deferred = true;
    if (!result.visible) return { visible: false, deferred: result.deferred };
  }
  return { visible: true, deferred };
}

/**
 * A/B slot: a section bound to an experiment variant renders only for visitors
 * assigned to that variant. No assignment, or an unknown experiment, is control
 * behaviour — the section renders, so a broken experiment never blanks a page.
 */
export function abMatches(
  ab: { experiment: string; variant: string } | undefined,
  assignments: Record<string, string> | null | undefined,
): boolean {
  if (!ab?.experiment || !ab.variant) return true;
  const assigned = assignments?.[ab.experiment];
  if (!assigned) return true;
  return assigned === ab.variant;
}

/** Human summary used by the inspector rule list. */
export function describeRule(rule: VisibilityRule, locale: "en" | "bn"): string {
  const en = `${rule.kind} ${rule.op} ${rule.value}`.trim();
  if (locale !== "bn") return en;
  const kindBn: Record<VisibilityKind, string> = {
    auth: "লগইন",
    cart: "কার্ট",
    locale: "ভাষা",
    date: "তারিখ",
    segment: "সেগমেন্ট",
  };
  return `${kindBn[rule.kind]} ${rule.op} ${rule.value}`.trim();
}
