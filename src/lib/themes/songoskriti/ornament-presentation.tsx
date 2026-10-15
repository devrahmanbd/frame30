/**
 * Songoskriti ornament divider — native theme-owned renderer.
 *
 * `SongoskritiOrnamentPresentation` is the trusted-source component for
 * `theme:songoskriti/ornament` (def in `./ornament-def`), registered by
 * exact widget id via `registerThemeOwnedComponent`. The renderer executes
 * it through the theme-owned branch under the owning theme only — same
 * process as builtins, no sandbox. Foreign-theme and missing cases keep
 * the explicit recoverable placeholder (fail-closed, never another brand).
 *
 * Reads design tokens through CSS variables only and names only its own
 * key — no theme branch lives here. SSR-safe (no hooks, no effects).
 * Empty (no eyebrow, `rule` motif, `none` rule) renders null on the
 * storefront and a labelled hint in the studio — never a throw.
 */
import { registerThemeOwnedComponent } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";
import { SONGOSKRITI_ORNAMENT_ID } from "./ornament-def";

/** Closed motif vocabulary; unknown values fall back to `diamond`. */
function motifOf(raw: string): "diamond" | "bloom" | "rule" {
  return raw === "bloom" ? "bloom" : raw === "rule" ? "rule" : "diamond";
}

/** Closed rule vocabulary; unknown values fall back to `single`. */
function ruleOf(raw: string): "single" | "double" | "none" {
  return raw === "double" ? "double" : raw === "none" ? "none" : "single";
}

function DiamondGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="block"
    >
      <path
        d="M6 1 L11 6 L6 11 L1 6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function BloomGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="block"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7" cy="7" r="1.75" fill="currentColor" />
    </svg>
  );
}

function RuleLine({ double }: { double: boolean }) {
  if (!double) {
    return (
      <span
        aria-hidden="true"
        className="h-px min-w-8 flex-1 bg-[var(--theme-border)]"
      />
    );
  }
  return (
    <span aria-hidden="true" className="flex min-w-8 flex-1 flex-col gap-1">
      <span className="h-px w-full bg-[var(--theme-border)]" />
      <span className="h-px w-full bg-[var(--theme-border)]" />
    </span>
  );
}

/**
 * Heritage ornament divider over merchant props. The eyebrow resolves
 * through the locale-aware reader (an `eyebrow_bn` sibling wins in বাংলা);
 * motif and rule fall back to their documented defaults on unknown values.
 */
export const SongoskritiOrnamentPresentation: WidgetComponent = (ctx) => {
  const eyebrow = ctx.str("eyebrow");
  const motif = motifOf(ctx.str("motif"));
  const rule = ruleOf(ctx.str("rule"));
  if (!eyebrow && motif === "rule" && rule === "none") {
    if (!ctx.editing) return null;
    return (
      <p
        data-ornament="songoskriti-empty"
        className="px-4 py-6 text-center text-sm text-muted-foreground"
      >
        Ornament — add an eyebrow, a motif, or a rule.
      </p>
    );
  }
  return (
    <div
      data-ornament="songoskriti"
      className="mx-auto flex w-full max-w-3xl items-center justify-center gap-4 px-4 py-6"
    >
      {rule !== "none" && <RuleLine double={rule === "double"} />}
      {motif !== "rule" && (
        <span
          aria-hidden="true"
          className="shrink-0 text-[var(--theme-ink)]/70"
        >
          {motif === "bloom" ? <BloomGlyph /> : <DiamondGlyph />}
        </span>
      )}
      {eyebrow ? (
        <p className="shrink-0 font-serif text-[11px] font-medium uppercase tracking-[0.25em] text-[var(--theme-ink)]">
          {eyebrow}
        </p>
      ) : null}
      {rule !== "none" && <RuleLine double={rule === "double"} />}
    </div>
  );
};

registerThemeOwnedComponent(
  SONGOSKRITI_ORNAMENT_ID,
  SongoskritiOrnamentPresentation,
);
