/**
 * Oceanblue-v2 widget skins — theme-owned preset defaults (spec §2–§3).
 *
 * Same widget, maroon studied-DNA face, automatic per theme: every section
 * this theme creates carries its skin default unless the merchant overrides
 * it in the inspector. Defaults merge UNDER authored props (authored wins).
 *
 * V2 bias is festive/maroon: banner hero, minimal rails, single
 * testimonial, cards grid. Accent (maroon-plum) never arrives through
 * skins as body text — skins are style keys, and festive surfaces are
 * authored per-section where the campaign calls for them.
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
 * Closed skin vocabulary per skinnable widget. Mirrors the core
 * `WIDGET_SKINS` first-option convention: the first entry of each set is
 * the documented default. `banner` leads hero_carousel (the shared core
 * append lands in Task 7; until then the core renderer falls back per its
 * own convention while this theme's default string stays pinned).
 */
export const OCEANBLUE_V2_SKIN_SETS = {
  product_rail: ["minimal", "editorial", "compact"],
  hero_carousel: ["banner", "split", "fullbleed", "minimal"],
  testimonials: ["single", "carousel", "wall"],
  product_grid: ["cards", "rows"],
  urgency_rail: ["minimal", "editorial", "compact"],
} as const;

export type OceanblueV2SkinnableWidget = keyof typeof OCEANBLUE_V2_SKIN_SETS;

export type OceanblueV2SkinOf<W extends OceanblueV2SkinnableWidget> =
  (typeof OCEANBLUE_V2_SKIN_SETS)[W][number];

/**
 * Theme preset defaults: the maroon face of each widget. Brand maroon +
 * serif moments come from the theme tokens (`--theme-*`), never
 * literals — see `skins.css`.
 */
export const OCEANBLUE_V2_WIDGET_DEFAULTS = {
  product_rail: { skin: "minimal" },
  hero_carousel: { skin: "banner" },
  testimonials: { skin: "single" },
  product_grid: { skin: "cards" },
  urgency_rail: { skin: "minimal" },
} satisfies Partial<Record<SectionType, Record<string, PropValue>>>;

/** Default skin per skinnable widget (first entry of each set). */
export const OCEANBLUE_V2_SKIN_DEFAULTS: Record<
  OceanblueV2SkinnableWidget,
  string
> = {
  product_rail: "minimal",
  hero_carousel: "banner",
  testimonials: "single",
  product_grid: "cards",
  urgency_rail: "minimal",
};

/**
 * Unknown → default fallback ("never a crash, never empty").
 * Known values pass through untouched; non-skinnable types pass the raw
 * value through so the core renderer stays the single source of truth.
 */
export function resolveOceanblueV2Skin(type: string, value: unknown): string {
  const fallback = (OCEANBLUE_V2_SKIN_DEFAULTS as Record<string, string>)[type];
  if (fallback === undefined) return typeof value === "string" ? value : "";
  if (typeof value !== "string") return fallback;
  const allowed = (OCEANBLUE_V2_SKIN_SETS as Record<string, readonly string[]>)[
    type
  ]!;
  return allowed.includes(value) ? value : fallback;
}

/** Defaults for one widget type (empty when the type has none). */
export function oceanblueV2DefaultsFor(
  type: SectionType,
): Record<string, PropValue> {
  return { ...(OCEANBLUE_V2_WIDGET_DEFAULTS[type] ?? {}) };
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
export function withOceanblueV2Defaults(s: SectionBuilder): SectionBuilder {
  return (
    type: SectionType,
    props: Record<string, PropValue> = {},
  ): Section => {
    const defaults = OCEANBLUE_V2_WIDGET_DEFAULTS[type] as
      | Record<string, PropValue>
      | undefined;
    if (!defaults) return s(type, props);
    return s(type, { ...defaults, ...stripUndefined(props) });
  };
}
