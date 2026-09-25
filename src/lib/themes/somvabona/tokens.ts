import type { ThemeTokens } from "../../builder-ast";
import { DEFAULT_GLOBALS } from "../../theme-globals";

/**
 * Somvabona brand tokens (spec §4, locked palette).
 *
 * Terracotta heritage base, Songoskriti-adjacent but a distinct key: a
 * deeper maroon brand, warmer paper surface, same ink family. Comfortable
 * density (not airy), default type scale (not expressive). Inter body +
 * Bangla stack; the display serif is reserved for campaign headlines only.
 * Motion stays subtle and gated on prefers-reduced-motion throughout.
 * BDT-first: symbol display, Latin digits, EN/BN inline props everywhere.
 */
export const SOMVABONA_TOKENS: ThemeTokens = {
  brand: "#7C2A1A",
  accent: "#B95A38",
  surface: "#FBF6EE",
  ink: "#2E2620",
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
