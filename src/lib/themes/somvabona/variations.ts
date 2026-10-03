/**
 * Somvabona theme variations (Track T) — starter presets.
 *
 * Base Somvabona is value-forward franchise retail (compact rails, fullbleed
 * hero, carousel testimonials, rows grids, warm paper surface). The two
 * starters move away from it, token + default-skin overrides only:
 * - `minimal`: white surface, no elevation, quiet minimal skins.
 * - `editorial`: ivory surface, expressive type, editorial/split/wall skins
 *   for brand-storytelling moments.
 */
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { SOMVABONA_TOKENS } from "./tokens";
import { SOMVABONA_WIDGET_DEFAULTS } from "./skins";
import {
  applyVariationTokens,
  validateThemeVariations,
  variationForKey,
  withVariationSkinDefaults,
  type ThemeVariation,
} from "../../theme-variations";

export const SOMVABONA_VARIATIONS: ThemeVariation[] = [
  {
    key: "minimal",
    label: "Minimal",
    label_bn: "মিনিমাল",
    tokenOverrides: {
      surface: "#FFFFFF",
      ink: "#1E1B16",
      radius: "8px",
      typeScale: "compact",
      spaceUnit: "20px",
      shadow: "none",
      motion: "subtle",
    },
    skinDefaults: {
      product_rail: "minimal",
      hero_carousel: "minimal",
      testimonials: "single",
      product_grid: "cards",
      urgency_rail: "minimal",
    },
  },
  {
    key: "editorial",
    label: "Editorial",
    label_bn: "এডিটোরিয়াল",
    tokenOverrides: {
      brand: "#1A1A1A",
      surface: "#FAF9F7",
      radius: "0px",
      density: "comfortable",
      typeScale: "expressive",
      shadow: "soft",
    },
    skinDefaults: {
      product_rail: "editorial",
      hero_carousel: "split",
      testimonials: "wall",
      product_grid: "cards",
      urgency_rail: "editorial",
    },
  },
];

/** The starter list is valid by construction — pinned so drift fails loudly. */
export const SOMVABONA_VARIATIONS_CHECK = validateThemeVariations(
  "somvabona",
  SOMVABONA_VARIATIONS,
);

export function somvabonaVariationFor(
  key: string | null | undefined,
): ThemeVariation | null {
  return variationForKey(SOMVABONA_VARIATIONS, key);
}

/** Base tokens with the named variation merged over them (base on unknown). */
export function somvabonaTokensFor(key: string | null | undefined) {
  return applyVariationTokens(SOMVABONA_TOKENS, somvabonaVariationFor(key));
}

/**
 * Layer a variation's skin defaults under the builder output. Compose
 * OUTSIDE the theme's base wrap (`withSomvabonaVariation(wrapped)`) so
 * the final precedence is base < variation < authored.
 */
export function withSomvabonaVariation<
  S extends (type: never, props?: Record<string, PropValue>) => Section,
>(
  s: S,
  key: string | null | undefined,
): S {
  return withVariationSkinDefaults(
    s as unknown as (
      type: SectionType,
      props?: Record<string, PropValue>,
    ) => Section,
    somvabonaVariationFor(key),
    SOMVABONA_WIDGET_DEFAULTS as Partial<
      Record<SectionType, Record<string, PropValue>>
    >,
  ) as unknown as S;
}
