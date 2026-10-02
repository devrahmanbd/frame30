/**
 * BlueOcean widget skins — theme-owned preset defaults.
 *
 * Editorial bias: fullbleed hero, editorial rails, wall testimonial,
 * cards grid. Defaults merge UNDER authored props (authored always
 * wins). Skins are style keys only — marigold surfaces are authored
 * per-section where the campaign calls for them.
 *
 * Closed skin vocabulary mirrors the core `WIDGET_SKINS` first-option
 * convention. No widget forks: no new SectionType.
 */
import type {
  PropValue,
  Section,
  SectionBuilder,
  SectionType,
} from "../../builder-ast";
import "./skins.css";

export const BLUEOCEAN_SKIN_SETS = {
  product_rail: ["editorial", "compact", "minimal"],
  hero_carousel: ["fullbleed", "split", "minimal", "banner"],
  testimonials: ["wall", "carousel", "single"],
  product_grid: ["cards", "rows"],
  urgency_rail: ["editorial", "compact", "minimal"],
} as const;

export type BlueoceanSkinnableWidget = keyof typeof BLUEOCEAN_SKIN_SETS;

export type BlueoceanSkinOf<W extends BlueoceanSkinnableWidget> =
  (typeof BLUEOCEAN_SKIN_SETS)[W][number];

/**
 * Theme preset defaults: the editorial face of each widget. Lagoon +
 * Inter moments come from the theme tokens (`--theme-*`), never
 * literals — see `skins.css`.
 */
export const BLUEOCEAN_WIDGET_DEFAULTS = {
  product_rail: { skin: "editorial" },
  hero_carousel: { skin: "fullbleed" },
  testimonials: { skin: "wall" },
  product_grid: { skin: "cards" },
  urgency_rail: { skin: "editorial" },
} satisfies Partial<Record<SectionType, Record<string, PropValue>>>;

/** Default skin per skinnable widget (first entry of each set). */
export const BLUEOCEAN_SKIN_DEFAULTS: Record<BlueoceanSkinnableWidget, string> =
  {
    product_rail: "editorial",
    hero_carousel: "fullbleed",
    testimonials: "wall",
    product_grid: "cards",
    urgency_rail: "editorial",
  };

/**
 * Unknown → default fallback ("never a crash, never empty").
 * Known values pass through untouched; non-skinnable types pass the raw
 * value through so the core renderer stays the single source of truth.
 */
export function resolveBlueoceanSkin(type: string, value: unknown): string {
  const fallback = (BLUEOCEAN_SKIN_DEFAULTS as Record<string, string>)[type];
  if (fallback === undefined) return typeof value === "string" ? value : "";
  if (typeof value !== "string") return fallback;
  const allowed = (BLUEOCEAN_SKIN_SETS as Record<string, readonly string[]>)[
    type
  ]!;
  return allowed.includes(value) ? value : fallback;
}

/** Defaults for one widget type (empty when the type has none). */
export function blueoceanDefaultsFor(
  type: SectionType,
): Record<string, PropValue> {
  return { ...(BLUEOCEAN_WIDGET_DEFAULTS[type] ?? {}) };
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
export function withBlueoceanDefaults(s: SectionBuilder): SectionBuilder {
  return (
    type: SectionType,
    props: Record<string, PropValue> = {},
  ): Section => {
    const defaults = BLUEOCEAN_WIDGET_DEFAULTS[type] as
      | Record<string, PropValue>
      | undefined;
    if (!defaults) return s(type, props);
    return s(type, { ...defaults, ...stripUndefined(props) });
  };
}
