/**
 * Frame30 — single authoritative built-in registry for official themes.
 *
 * Songoskriti + Somvabona are source-owned: first-party code in this repo,
 * rendered through their trusted source modules. This map is the ONLY place
 * that names official themes for identity. Catalogues, preview fallbacks,
 * and install paths resolve official identity through `isOfficialThemeKey`
 * / `getBuiltinTheme` — never through bundle JSON keys, `theme-export`
 * maps, or `theme_registry` rows.
 */
import type { PreviewThemeSource } from "../theme-preview-nav";
import { songoskritiPreviewSource } from "./songoskriti/preview";
import { somvabonaPreviewSource } from "./somvabona/preview";

export const OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"] as const;

export type BuiltinThemeKey = (typeof OFFICIAL_THEME_KEYS)[number];

export type BuiltinThemeEntry = {
  key: BuiltinThemeKey;
  source: (variationKey?: string) => PreviewThemeSource;
};

const ENTRIES: Record<BuiltinThemeKey, BuiltinThemeEntry> = {
  songoskriti: { key: "songoskriti", source: songoskritiPreviewSource },
  somvabona: { key: "somvabona", source: somvabonaPreviewSource },
};

export function isOfficialThemeKey(key: string): key is BuiltinThemeKey {
  return (OFFICIAL_THEME_KEYS as readonly string[]).includes(key);
}

export function getBuiltinTheme(key: string): BuiltinThemeEntry | null {
  if (!isOfficialThemeKey(key)) return null;
  return ENTRIES[key];
}

export function builtinThemeKeys(): BuiltinThemeKey[] {
  return [...OFFICIAL_THEME_KEYS];
}
