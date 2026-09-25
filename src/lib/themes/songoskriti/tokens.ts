import type { ThemeTokens } from "../../builder-ast";
import { DEFAULT_GLOBALS } from "../../theme-globals";

/**
 * Songoskriti brand tokens (spec §1, locked palette).
 * Display serif EN headlines (Playfair Display), Inter body; Bangla faces
 * fall back to the Bangla stack declared in styles.css.
 */
export const SONGOSKRITI_TOKENS: ThemeTokens = {
  brand: "#8A3B1F",
  accent: "#C45D3E",
  surface: "#FAF8F5",
  ink: "#2D2A26",
  radius: "4px",
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
