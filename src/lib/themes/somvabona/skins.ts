import type { PropValue, Section, SectionType } from "../../builder-ast";

/**
 * Somvabona widget skin presets (widget-skins spec §4, lane C).
 *
 * Same widgets as every other theme — only the default `skin` (and a few
 * merchandising flags) differs. This is what makes "same widget, better
 * look" automatic for Somvabona: everyday-ethnic franchise retail, so the
 * defaults are value-forward, dense and badge-rich —
 * price/rating/dispatch lead, craft storytelling follows.
 *
 * - `hero_carousel → fullbleed`: offer-led, edge-to-edge merchandising.
 *   (Songoskriti defaults to `split`; fullbleed is the visibly distinct
 *   retail treatment.)
 * - `product_rail → compact`: dense cards with price + badges up front.
 *   (Songoskriti defaults to `editorial`.)
 * - `urgency_rail → compact`: same dense treatment — it reuses the
 *   product_rail data shape (collection source + limit). Provisional on the
 *   core lane giving `urgency_rail` a `skin` prop with a `compact` value;
 *   until then the key is inert data (ignored by the renderer, dropped by
 *   `parseAst` like any undeclared prop — see gap note below).
 * - `testimonials → carousel`: high-throughput franchise proof rotation.
 * - `product_grid → rows`: dense price-comparison rows.
 *   (Songoskriti defaults to `cards`.)
 *
 * GAP (core lane owns it): the `skin` catalog field + renderer
 * `data-widget`/`data-skin` attributes + conditional sheet loading do not
 * exist yet. Consequences, coded defensively:
 * - `parseAst` strips undeclared props, so these defaults survive the
 *   in-memory builders (homepage/chrome/preview) but are dropped on a
 *   persist/parse round-trip until core adds the `skin` field. Nothing
 *   crashes; sections render the widget default.
 * - `resolveSomvabonaSkin` mirrors the spec's "unknown skin → default"
 *   rule so theme code (and tests) can resolve without the renderer.
 *
 * bn/en: skin values are style keys, never copy — no `_bn` twins needed.
 * No widget forks: this file is data + a merge helper only. Demo data
 * untouched (`previewDemoMap` not referenced).
 */
export const SOMVABONA_WIDGET_DEFAULTS = {
  hero_carousel: { skin: "fullbleed" },
  product_rail: { skin: "compact", cardVariant: "standard", showRating: true },
  urgency_rail: {
    skin: "compact",
    cardVariant: "standard",
    showRating: true,
    showDiscount: true,
    showStockHint: true,
  },
  testimonials: { skin: "carousel" },
  product_grid: { skin: "rows" },
} satisfies Partial<Record<SectionType, Record<string, PropValue>>>;

/**
 * Closed per-widget skin vocabularies (spec §1, `e.g.` table) plus the
 * Somvabona default for each. `urgency_rail` shares the product_rail
 * vocabulary by design (same data shape); provisional until core confirms.
 */
const SKIN_VOCABULARIES: Record<string, readonly string[]> = {
  product_rail: ["editorial", "compact", "minimal"],
  hero_carousel: ["split", "fullbleed", "minimal"],
  testimonials: ["wall", "carousel", "single"],
  product_grid: ["cards", "rows"],
  urgency_rail: ["editorial", "compact", "minimal"],
};

const SKIN_DEFAULTS: Record<string, string> = {
  product_rail: "compact",
  hero_carousel: "fullbleed",
  testimonials: "carousel",
  product_grid: "rows",
  urgency_rail: "compact",
};

/**
 * Spec §1 fallback rule: an unknown (or absent) skin value resolves to the
 * widget default — never a crash, never empty. Returns `undefined` for
 * widget types with no skinnable contract, so callers can leave them alone.
 */
export function resolveSomvabonaSkin(
  type: string,
  skin: unknown,
): string | undefined {
  const fallback = SKIN_DEFAULTS[type];
  if (!fallback) return undefined;
  if (typeof skin !== "string" || !skin.trim()) return fallback;
  const vocab = SKIN_VOCABULARIES[type] ?? [];
  return vocab.includes(skin) ? skin : fallback;
}

/**
 * Merge theme defaults UNDER authored props: every key the merchant/theme
 * author set wins, every absent key fills from `SOMVABONA_WIDGET_DEFAULTS`.
 * Unknown widget types pass through untouched.
 */
export function applySomvabonaWidgetDefaults(
  type: string,
  props: Record<string, PropValue> = {},
): Record<string, PropValue> {
  const defaults = (
    SOMVABONA_WIDGET_DEFAULTS as Record<string, Record<string, PropValue>>
  )[type];
  if (!defaults) return props;
  return { ...defaults, ...props };
}

/**
 * Wrap a section builder so every created section carries the theme
 * defaults. Works for both the loose `SomvabonaBuilder` (theme blueprints)
 * and the narrow shared `SectionBuilder` (preview sources) — both are
 * `(type, props?) => Section` at runtime.
 */
export function withSomvabonaWidgetDefaults<
  S extends (type: any, props?: any) => Section,
>(s: S): S {
  const wrapped = (
    type: string,
    props: Record<string, PropValue> = {},
  ): Section =>
    (s as unknown as (t: string, p?: Record<string, PropValue>) => Section)(
      type,
      applySomvabonaWidgetDefaults(type, props),
    );
  return wrapped as unknown as S;
}
