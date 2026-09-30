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
 */
import type { SectionType } from "@/lib/builder-ast";
import {
  GENERIC_WIDGETS,
  WIDGET_COMPONENTS,
  type WidgetComponent,
} from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";

const THEME_WIDGETS: Record<
  string,
  () => Partial<Record<SectionType, WidgetComponent>>
> = {
  songoskriti: () => SONGOSKRITI_WIDGETS,
};

/** Registered theme keys, for routes and diagnostics. */
export function themeWidgetKeys(): string[] {
  return Object.keys(THEME_WIDGETS);
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
