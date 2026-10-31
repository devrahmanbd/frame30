/**
 * Frame30 — single authoritative built-in registry for official themes.
 *
 * Songoskriti is the one official theme: first-party code in this repo,
 * rendered through its trusted source module. This map is the ONLY place
 * that names official themes for identity. Catalogues, preview fallbacks,
 * and install paths resolve official identity through `isOfficialThemeKey`
 * / `getBuiltinTheme` — never through bundle JSON keys, `theme-export`
 * maps, or `theme_registry` rows.
 */
import type { PreviewThemeSource } from "../theme-preview-nav";
import { songoskritiPreviewSource } from "./songoskriti/preview";

export const OFFICIAL_THEME_KEYS = ["songoskriti"] as const;

export type BuiltinThemeKey = (typeof OFFICIAL_THEME_KEYS)[number];

export type BuiltinThemeEntry = {
  key: BuiltinThemeKey;
  source: (variationKey?: string) => PreviewThemeSource;
};

const ENTRIES: Record<BuiltinThemeKey, BuiltinThemeEntry> = {
  songoskriti: { key: "songoskriti", source: songoskritiPreviewSource },
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

/**
 * Display metadata for the official catalogue section. Names come from the
 * themes' own source modules (`BRAND_NAME*`); summaries describe the
 * source-owned theme honestly (no installs/ratings — those stay honest
 * zeros in `catalog-meta.ts`). Version is the documented source version:
 * the source has no version field, so the registry carries it. Songoskriti
 * is **1.1.0** because Task 2 changed its cart/checkout/account
 * presentations; existing installs are keyed by `source_listing_slug`, so the
 * bump records the change without gating it (the install is source-owned).
 */
export type BuiltinThemeMeta = {
  key: BuiltinThemeKey;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  version: string;
};

const META: Record<BuiltinThemeKey, BuiltinThemeMeta> = {
  songoskriti: {
    key: "songoskriti",
    nameEn: "Songoskriti",
    nameBn: "সংস্কৃতি",
    summaryEn:
      "Official Framique heritage theme: jamdani, panjabi and festive craft.",
    summaryBn: "অফিসিয়াল ফ্রামিক হেরিটেজ থিম।",
    category: "general",
    version: "1.1.0",
  },
};

export function builtinThemeMeta(key: string): BuiltinThemeMeta | null {
  if (!isOfficialThemeKey(key)) return null;
  return META[key];
}
