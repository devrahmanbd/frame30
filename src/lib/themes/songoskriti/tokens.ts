import type { ThemeTokens } from "../../builder-ast";
import { DEFAULT_GLOBALS } from "../../theme-globals";

/**
 * Songoskriti brand tokens (spec §1, locked palette).
 * Display serif EN headlines (Playfair Display), Inter body; Bangla faces
 * fall back to the Bangla stack declared in styles.css.
 */
export const SONGOSKRITI_TOKENS: ThemeTokens = {
  brand: "#1a1a1a",
  accent: "#8B4513", // Subtle heritage terracotta/brown
  surface: "#faf9f7", // Editorial ivory
  ink: "#1a1a1a",
  radius: "0px", // Sharp, fashion-editorial edges
  fontDisplay: "Playfair Display",
  fontBody: "Inter",
  container: "1320px",
  density: "comfortable",
  typeScale: "default",
  spaceUnit: "16px",
  shadow: "soft",
  motion: "subtle",
  digits: "latin",
  locale: "en",
  currencyDisplay: "symbol",
  fontPairing: "editorial-serif",
  dark: null,
  globals: DEFAULT_GLOBALS,
};
