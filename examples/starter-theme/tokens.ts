import type { ThemeTokens } from "../../src/lib/builder-ast";
import type { ThemeGlobals } from "../../src/lib/theme-globals";

/**
 * Starter theme tokens — copy this file first, then change the brand,
 * accent, surface, ink, and layout knobs to taste.
 *
 * Every key is required by `ThemeTokens` (`src/lib/builder-ast.ts:6021`);
 * `dark: null` means the storefront is light-only. Globals seed the
 * merchant-editable palette (`src/lib/theme-globals.ts:32`).
 */
export const STARTER_GLOBALS: ThemeGlobals = {
  colors: [
    { id: "primary", name: "Primary", value: "#166534" },
    { id: "secondary", name: "Secondary", value: "#CA8A04" },
    { id: "text", name: "Text", value: "#1F2937" },
    { id: "surface", name: "Surface", value: "#FFFFFF" },
  ],
  fonts: [
    { id: "heading", name: "Headings", family: "Inter", weight: "700" },
    { id: "body", name: "Body", family: "Inter", weight: "400" },
  ],
};

export const STARTER_TOKENS: ThemeTokens = {
  brand: "#166534",
  accent: "#CA8A04",
  surface: "#FFFFFF",
  ink: "#1F2937",
  radius: "8px",
  fontDisplay: "Inter",
  fontBody: "Inter",
  container: "1200px",
  density: "comfortable",
  typeScale: "default",
  spaceUnit: "16px",
  shadow: "soft",
  motion: "subtle",
  digits: "latin",
  locale: "en",
  currencyDisplay: "symbol",
  fontPairing: "modern-sans",
  dark: null,
  globals: STARTER_GLOBALS,
};
