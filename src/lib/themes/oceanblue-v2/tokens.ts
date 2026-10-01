import type { ThemeTokens } from "../../builder-ast";
import { DEFAULT_GLOBALS } from "../../theme-globals";

/**
 * Oceanblue-v2 brand tokens (spec §2, maroon studied-DNA system).
 * Deep maroon brand on white canvas; darker maroon-plum accent reserved
 * for hover/festive depth (never small body text on white alone).
 * Crimson Pro display role + Work Sans body role; Bengali falls back to
 * the Bangla stack declared in styles.css (zero negative tracking).
 * Blush tint (#F9EFEF) is NOT a token — ThemeTokens carries no tint slot —
 * it lives as a named skins.css variable (see skins.css).
 */
export const OCEANBLUE_V2_TOKENS: ThemeTokens = {
  brand: "#A72F30",
  accent: "#5C1A24",
  surface: "#FFFFFF",
  ink: "#241318",
  radius: "10px",
  fontDisplay: "Crimson Pro",
  fontBody: "Work Sans",
  container: "1280px",
  density: "comfortable",
  typeScale: "default",
  spaceUnit: "16px",
  shadow: "soft",
  motion: "subtle",
  digits: "latin",
  locale: "en",
  currencyDisplay: "symbol",
  fontPairing: "bengali-classic",
  dark: null,
  globals: DEFAULT_GLOBALS,
};
