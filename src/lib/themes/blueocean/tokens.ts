import type { ThemeTokens } from "../../builder-ast";
import { DEFAULT_GLOBALS } from "../../theme-globals";

/**
 * BlueOcean brand tokens — premium ethnic-editorial system.
 * Deep lagoon-teal brand on white canvas; muted marigold reserved for
 * hairline accents and festive highlights (never body copy — it fails
 * text contrast on white). Playfair Display + Inter both ship Fallback
 * faces in styles.css, so the pairing stays portable; Bengali falls back
 * to the Bangla stack with zero negative tracking.
 */
export const BLUEOCEAN_TOKENS: ThemeTokens = {
  brand: "#0A3642",
  accent: "#C2913B",
  surface: "#FFFFFF",
  ink: "#10222B",
  radius: "6px",
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
  fontPairing: "bengali-classic",
  dark: null,
  globals: DEFAULT_GLOBALS,
};
