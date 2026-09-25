/**
 * Songoskriti widget skins — theme-owned preset defaults (spec §4).
 *
 * Same widget, better look, automatic per theme: every section this theme
 * creates carries its skin default unless the merchant overrides it in the
 * inspector. Defaults merge UNDER authored props (authored always wins).
 *
 * Contract note (defensive): the core lane owns the `skin` prop, the
 * renderer `data-widget`/`data-skin` attributes, and conditional sheet
 * loading. Nothing in `builder-ast` or `SectionRenderer` implements those
 * yet (verified 2026-09-25 — no `skin` key outside `skin_quiz`/taxonomy).
 * This module implements against the spec's contract only:
 * - defaults are plain section props, so they survive in section JSON with
 *   no migration and no engine support;
 * - `skins.css` selectors match nothing until the core lane emits the
 *   attributes — harmless by design, never a crash, never empty;
 * - `resolveSongoskritiSkin` gives the core renderer (and tests) the
 *   unknown → default fallback without touching shared widgets.
 *
 * No widget forks: no new SectionType. Demo data untouched.
 */
import type {
  PropValue,
  Section,
  SectionBuilder,
  SectionType,
} from "../../builder-ast";
import "./skins.css";

/**
 * Closed skin vocabulary per skinnable widget (spec §1). Mirrors the catalog
 * `skin` select the core lane adds — kept here so the theme resolves
 * fallbacks without importing shared widget code.
 */
export const SONGOSKRITI_SKIN_SETS = {
  product_rail: ["editorial", "compact", "minimal"],
  hero_carousel: ["split", "fullbleed", "minimal"],
  testimonials: ["wall", "carousel", "single"],
  product_grid: ["cards", "rows"],
} as const;

export type SongoskritiSkinnableWidget = keyof typeof SONGOSKRITI_SKIN_SETS;

export type SongoskritiSkinOf<W extends SongoskritiSkinnableWidget> =
  (typeof SONGOSKRITI_SKIN_SETS)[W][number];

/**
 * Theme preset defaults: the warm-craft/editorial face of each widget.
 * Terracotta brand + Playfair Display moments come from the theme tokens
 * (`--theme-*`), never literals — see `skins.css`.
 */
export const SONGOSKRITI_WIDGET_DEFAULTS = {
  product_rail: { skin: "editorial" },
  hero_carousel: { skin: "split" },
  testimonials: { skin: "wall" },
  product_grid: { skin: "cards" },
} satisfies Partial<Record<SectionType, Record<string, PropValue>>>;

/** Default skin per skinnable widget (first entry of each set). */
export const SONGOSKRITI_SKIN_DEFAULTS: Record<
  SongoskritiSkinnableWidget,
  string
> = {
  product_rail: "editorial",
  hero_carousel: "split",
  testimonials: "wall",
  product_grid: "cards",
};

/**
 * Unknown → default fallback (spec: "never a crash, never empty").
 * Known values pass through untouched; non-skinnable types pass the raw
 * value through so the core renderer stays the single source of truth.
 */
export function resolveSongoskritiSkin(type: string, value: unknown): string {
  const fallback = (SONGOSKRITI_SKIN_DEFAULTS as Record<string, string>)[type];
  if (fallback === undefined) return typeof value === "string" ? value : "";
  if (typeof value !== "string") return fallback;
  const allowed = (SONGOSKRITI_SKIN_SETS as Record<string, readonly string[]>)[
    type
  ]!;
  return allowed.includes(value) ? value : fallback;
}

/** Defaults for one widget type (empty when the type has none). */
export function songoskritiDefaultsFor(
  type: SectionType,
): Record<string, PropValue> {
  return { ...(SONGOSKRITI_WIDGET_DEFAULTS[type] ?? {}) };
}

/** Authored props never carry `undefined` into the merge (JSON-safe). */
function stripUndefined(
  props: Record<string, PropValue>,
): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Wrap a SectionBuilder so every created section carries this theme's
 * defaults UNDER the authored props: `{ ...defaults, ...authored }`.
 * Authored keys (including an explicit `skin`) always win; bilingual
 * twins (`heading_bn`, …) are untouched; unknown types pass through.
 */
export function withSongoskritiDefaults(s: SectionBuilder): SectionBuilder {
  return (
    type: SectionType,
    props: Record<string, PropValue> = {},
  ): Section => {
    const defaults = SONGOSKRITI_WIDGET_DEFAULTS[type] as
      Record<string, PropValue> | undefined;
    if (!defaults) return s(type, props);
    return s(type, { ...defaults, ...stripUndefined(props) });
  };
}
