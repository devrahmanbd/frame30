/**
 * Preview theme registry — the composition root for theme previews.
 *
 * This map is the ONLY place that names themes for preview. Adding a theme
 * means a new folder under `lib/themes` exporting a preview source plus one
 * entry here. The engine (`theme-preview-nav`) never names a theme, and
 * themes never import engine behavior — they only implement its port type.
 */
import type { PreviewThemeSource } from "./theme-preview-nav";
import type { TemplateKey } from "./builder-ast";
import { songoskritiPreviewSource } from "./themes/songoskriti/preview";
import { somvabonaPreviewSource } from "./themes/somvabona/preview";

const SOURCES: Record<string, (variationKey?: string) => PreviewThemeSource> = {
  songoskriti: (variationKey) => songoskritiPreviewSource(variationKey),
  somvabona: (variationKey) => somvabonaPreviewSource(variationKey),
};

export function previewSourceFor(
  key: string,
  variationKey?: string,
): PreviewThemeSource | null {
  const factory = SOURCES[key];
  return factory ? factory(variationKey) : null;
}

/** Registered preview keys, for routes and diagnostics. */
export function previewSourceKeys(): string[] {
  return Object.keys(SOURCES);
}

/** Default demo theme for merchant-less storefront URLs. First registered. */
export function defaultPreviewKey(): string {
  return previewSourceKeys()[0] ?? "songoskriti";
}

/**
 * Demo target for a merchant-less storefront permalink (/c/*, /p/* on a
 * platform host): the theme preview renders it with demo data instead of
 * a dead "not found" page. Actions stay blocked, page stays noindex.
 */
export function demoPreviewTarget(
  key: string,
  template: TemplateKey,
  slug: string,
): string {
  const clean = slug.trim().toLowerCase().slice(0, 80);
  return `/theme-preview/${key}?template=${template}&focus=${encodeURIComponent(clean)}`;
}
