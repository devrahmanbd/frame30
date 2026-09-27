import type {
  PropValue,
  Section,
  SectionBuilder,
  SectionType,
} from "../../src/lib/builder-ast";

/**
 * Starter theme skins — same widgets, starter look.
 *
 * The core lane owns the `skin` prop: every skinnable widget gains a **Skin**
 * select in the style panel whose options come from the closed vocabulary in
 * `WIDGET_SKINS` (`src/lib/builder-ast.ts:599`) with the core default in
 * `DEFAULT_WIDGET_SKIN` (`src/lib/builder-ast.ts:617`). This module mirrors
 * that vocabulary so the theme resolves fallbacks without importing shared
 * widget code, and ships this theme's defaults. Defaults merge UNDER
 * authored props — an explicit `skin` in the inspector always wins.
 */
export const STARTER_SKIN_SETS = {
  product_rail: ["editorial", "compact", "minimal"],
  hero_carousel: ["split", "fullbleed", "minimal"],
  testimonials: ["carousel", "wall", "single"],
  product_grid: ["cards", "rows"],
} as const;

export type StarterSkinnableWidget = keyof typeof STARTER_SKIN_SETS;

/** This theme's face for each skinnable widget. */
export const STARTER_WIDGET_DEFAULTS = {
  hero_carousel: { skin: "minimal" },
  product_rail: { skin: "compact" },
  testimonials: { skin: "single" },
  product_grid: { skin: "cards" },
} satisfies Partial<Record<SectionType, Record<string, PropValue>>>;

/** Default skin per skinnable widget (first entry of each set below). */
export const STARTER_SKIN_DEFAULTS: Record<StarterSkinnableWidget, string> = {
  hero_carousel: "minimal",
  product_rail: "compact",
  testimonials: "single",
  product_grid: "cards",
};

/**
 * Unknown → default fallback: known values pass through untouched,
 * anything else resolves to the widget default — never a crash, never
 * empty. Non-skinnable types pass the raw value through so the core
 * renderer stays the single source of truth.
 */
export function resolveStarterSkin(type: string, value: unknown): string {
  const fallback = (STARTER_SKIN_DEFAULTS as Record<string, string>)[type];
  if (fallback === undefined) return typeof value === "string" ? value : "";
  if (typeof value !== "string") return fallback;
  const allowed = (STARTER_SKIN_SETS as Record<string, readonly string[]>)[
    type
  ]!;
  return allowed.includes(value) ? value : fallback;
}

/** Defaults for one widget type (empty when the type has none). */
export function starterDefaultsFor(
  type: SectionType,
): Record<string, PropValue> {
  return { ...(STARTER_WIDGET_DEFAULTS[type] ?? {}) };
}

/**
 * Wrap a `SectionBuilder` so every created section carries this theme's
 * defaults UNDER the authored props: `{ ...defaults, ...authored }`.
 */
export function withStarterDefaults(s: SectionBuilder): SectionBuilder {
  return (
    type: SectionType,
    props: Record<string, PropValue> = {},
  ): Section => {
    const defaults = STARTER_WIDGET_DEFAULTS[type] as
      | Record<string, PropValue>
      | undefined;
    if (!defaults) return s(type, props);
    const out: Record<string, PropValue> = {};
    for (const [key, value] of Object.entries(props)) {
      if (value !== undefined) out[key] = value;
    }
    return s(type, { ...defaults, ...out });
  };
}
