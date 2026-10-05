/**
 * Per-widget theme presentation registry (REGISTRY CORE lane).
 *
 * Maps themeKey × widgetType → presentation Component, owned by themes:
 * a theme claims a pair by calling `registerThemePresentation` (typically
 * from its own module init), and the engine (`SectionRenderer`) resolves
 * through `resolveThemePresentation` in the component lookup path,
 * falling back to the existing resolution when no presentation is
 * registered — zero behavior change for unregistered pairs.
 *
 * Contracts (the header/docs lanes must follow these):
 * - Registration is first-wins: a duplicate registration warns and keeps
 *   the first Component. Registration never throws.
 * - Resolution never throws: unknown / null / missing keys return the
 *   caller-supplied fallback (usually the existing
 *   `resolveWidgetComponent` result), or undefined when no fallback is
 *   given. Unknown themes NEVER resolve to another theme's presentation.
 * - This module names no theme and branches on no theme: lookup is an
 *   opaque two-level Map. Types reference only `WidgetComponent` and
 *   `SectionType` — never theme modules (type-only imports, erased at
 *   runtime, so zero theme imports in shared code).
 */
import type { SectionType } from "./builder-ast";
import type { WidgetComponent } from "@/components/builder/widgets";

/** themeKey → (widgetType → presentation Component). */
const PRESENTATIONS = new Map<string, Map<SectionType, WidgetComponent>>();

/**
 * Claim one themeKey × widgetType pair for a presentation Component.
 * Owned by themes: only theme modules call this. First registration wins;
 * duplicates warn and are ignored. Never throws (invalid input warns and
 * returns).
 */
export function registerThemePresentation(
  themeKey: string,
  widgetType: SectionType,
  Component: WidgetComponent,
): void {
  if (typeof themeKey !== "string" || themeKey.length === 0) {
    console.warn(
      `[theme-presentations] ignoring registration for empty theme key (${String(widgetType)}).`,
    );
    return;
  }
  if (typeof Component !== "function") {
    console.warn(
      `[theme-presentations] ignoring registration for ${themeKey}/${String(widgetType)}: not a component.`,
    );
    return;
  }
  let byWidget = PRESENTATIONS.get(themeKey);
  if (!byWidget) {
    byWidget = new Map<SectionType, WidgetComponent>();
    PRESENTATIONS.set(themeKey, byWidget);
  }
  if (byWidget.has(widgetType)) {
    console.warn(
      `[theme-presentations] duplicate registration for ${themeKey}/${String(widgetType)} ignored; keeping the first.`,
    );
    return;
  }
  byWidget.set(widgetType, Component);
}

/**
 * Resolve the registered presentation for a themeKey × widgetType pair,
 * or the caller-supplied fallback (the existing resolution result) when
 * nothing is registered. Never throws — unknown themes, null keys and
 * missing widgets all fall back instead of leaking another theme's brand.
 */
export function resolveThemePresentation(
  themeKey: string | null | undefined,
  widgetType: SectionType,
  fallback?: WidgetComponent | undefined,
): WidgetComponent | undefined {
  try {
    const hit = PRESENTATIONS.get(themeKey ?? "")?.get(widgetType);
    return hit ?? fallback;
  } catch {
    return fallback;
  }
}

/** Test-only reset: drops every registration (isolates suites). */
export function clearThemePresentations(): void {
  PRESENTATIONS.clear();
}
