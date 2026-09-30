import type { ThemeTokens } from "../../builder-ast";
import { DEFAULT_GLOBALS } from "../../theme-globals";

/**
 * Oceanblue brand tokens (spec §2, locked palette).
 * Premium clean minimal: deep-ocean brand on white canvas, muted gold
 * reserved for offer/wedding accents (decorative roles only — 3.02:1 on
 * white never passes text contrast, so gold never sets body copy).
 * Inter display + body; Bangla faces fall back to the Bangla stack
 * declared in styles.css (zero negative tracking on Bengali).
 */
export const OCEANBLUE_TOKENS: ThemeTokens = {
  brand: "#0B3A5B",
  accent: "#C08A3E",
  surface: "#FFFFFF",
  ink: "#0F1E2E",
  radius: "8px",
  fontDisplay: "Inter",
  fontBody: "Inter",
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
