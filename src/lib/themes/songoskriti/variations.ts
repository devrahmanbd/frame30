/**
 * Songoskriti theme variations (Track T) — starter presets.
 *
 * Base Songoskriti is the editorial face (editorial rails, split hero, wall
 * testimonials, cards grids, ivory surface). The two starters move away from
 * it in opposite directions, token + default-skin overrides only:
 * - `minimal`: white surface, quiet elevation, single/minimal skins.
 * - `festive`: warm maroon/terracotta tokens, lively motion, dense
 *   retail skins for campaign season.
 */
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { SONGOSKRITI_WIDGET_DEFAULTS } from "./skins";
import {
  applyVariationTokens,
  validateThemeVariations,
  variationForKey,
  withVariationSkinDefaults,
  type ThemeVariation,
} from "../../theme-variations";

export const SONGOSKRITI_VARIATIONS: ThemeVariation[] = [
  {
    key: "minimal",
    label: "Minimal",
    label_bn: "মিনিমাল",
    tokenOverrides: {
      surface: "#FFFFFF",
      ink: "#1E1B16",
      radius: "8px",
      density: "comfortable",
      typeScale: "compact",
      spaceUnit: "20px",
      shadow: "none",
      motion: "subtle",
    },
    skinDefaults: {
      product_rail: "minimal",
      hero_carousel: "minimal",
      testimonials: "single",
      product_grid: "rows",
    },
  },
  {
    key: "festive",
    label: "Festive",
    label_bn: "উৎসবমুখর",
    tokenOverrides: {
      brand: "#7C2A1A",
      accent: "#C4714A",
      surface: "#FDF6EC",
      shadow: "lifted",
      motion: "lively",
      typeScale: "expressive",
    },
    skinDefaults: {
      product_rail: "compact",
      hero_carousel: "fullbleed",
      testimonials: "carousel",
      product_grid: "cards",
    },
  },
];

/** The starter list is valid by construction — pinned so drift fails loudly. */
export const SONGOSKRITI_VARIATIONS_CHECK = validateThemeVariations(
  "songoskriti",
  SONGOSKRITI_VARIATIONS,
);

export function songoskritiVariationFor(
  key: string | null | undefined,
): ThemeVariation | null {
  return variationForKey(SONGOSKRITI_VARIATIONS, key);
}

/** Base tokens with the named variation merged over them (base on unknown). */
export function songoskritiTokensFor(key: string | null | undefined) {
  return applyVariationTokens(
    SONGOSKRITI_TOKENS,
    songoskritiVariationFor(key),
  );
}

/**
 * Layer a variation's skin defaults under the builder output. Compose
 * OUTSIDE the theme's base wrap (`withSongoskritiVariation(wrapped)`) so
 * the final precedence is base < variation < authored.
 */
export function withSongoskritiVariation(
  s: (type: SectionType, props?: Record<string, PropValue>) => Section,
  key: string | null | undefined,
): (type: SectionType, props?: Record<string, PropValue>) => Section {
  return withVariationSkinDefaults(
    s,
    songoskritiVariationFor(key),
    SONGOSKRITI_WIDGET_DEFAULTS,
  );
}
