/**
 * Preview theme registry — the composition root for theme previews.
 *
 * This map is the ONLY place that names themes for preview. Adding a theme
 * means a new folder under `lib/themes` exporting a preview source plus one
 * entry here. The engine (`theme-preview-nav`) never names a theme, and
 * themes never import engine behavior — they only implement its port type.
 */
import type { PreviewThemeSource } from "./theme-preview-nav";
import { songoskritiPreviewSource } from "./themes/songoskriti/preview";

const SOURCES: Record<string, () => PreviewThemeSource> = {
  songoskriti: songoskritiPreviewSource,
};

export function previewSourceFor(key: string): PreviewThemeSource | null {
  const factory = SOURCES[key];
  return factory ? factory() : null;
}

/** Registered preview keys, for routes and diagnostics. */
export function previewSourceKeys(): string[] {
  return Object.keys(SOURCES);
}
