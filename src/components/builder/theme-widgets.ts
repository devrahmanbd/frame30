/**
 * Theme-keyed widget registry — the composition root for widget resolution
 * (theme-remediation Task 3).
 *
 * This map is the ONLY place that names themes for widget resolution,
 * mirroring the `preview-sources.ts` port pattern: adding a theme means one
 * entry here, and the renderer (`SectionRenderer`) never names a theme.
 * Resolution is explicit per theme key with the generic map as fallback —
 * no theme overrides a generic key globally anymore.
 *
 * - `themeKey == null` (studio, legacy tests): the closed
 *   `WIDGET_COMPONENTS` map, i.e. today's songoskriti-default composition,
 *   byte-identical.
 * - known theme key: that theme's overrides, falling back per key to
 *   `GENERIC_WIDGETS`.
 * - unknown theme key: pure `GENERIC_WIDGETS` — never brand.
 *
 * SWITCHOVER-3 — installed package discovery: merchant-installed packages
 * carry no components (widgets are code), so an installed-only key resolves
 * exactly like an unknown key — generic widgets, never brand, never a throw.
 * Discovery still lists it: `themeWidgetKeys(installed)` returns the union
 * (source keys first, installed-only keys after), mirroring
 * `preview-sources.ts`. A removed row stops being passed, so its key
 * disappears from the list while resolution keeps its no-crash fallback.
 */
import type { SectionType } from "@/lib/builder-ast";
import type { InstalledThemeRef } from "@/lib/preview-sources";
import {
  GENERIC_WIDGETS,
  WIDGET_COMPONENTS,
  type WidgetComponent,
} from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import { SOMVABONA_WIDGETS } from "./somvabona";

const THEME_WIDGETS: Record<
  string,
  () => Partial<Record<SectionType, WidgetComponent>>
> = {
  songoskriti: () => SONGOSKRITI_WIDGETS,
  somvabona: () => SOMVABONA_WIDGETS,
};

/**
 * Registered theme keys: built-in source keys first, then installed-only
 * keys. Garbage entries (null, blank, non-string keys) are ignored —
 * discovery never throws on untrusted input.
 */
export function themeWidgetKeys(
  installed?: readonly InstalledThemeRef[] | null,
): string[] {
  const keys = Object.keys(THEME_WIDGETS);
  if (!installed) return keys;
  const seen = new Set(keys);
  for (const entry of installed) {
    const raw =
      typeof entry === "string"
        ? entry
        : (entry as { key?: unknown } | null | undefined)?.key;
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * Renderer for a widget type under an explicit theme key, or undefined when
 * neither the theme nor the generic map provides one (the caller renders
 * the unavailable placeholder — never another theme's brand).
 */
export function resolveWidgetComponent(
  themeKey: string | null | undefined,
  type: SectionType,
): WidgetComponent | undefined {
  if (themeKey == null) return WIDGET_COMPONENTS[type];
  return THEME_WIDGETS[themeKey]?.()[type] ?? GENERIC_WIDGETS[type];
}
