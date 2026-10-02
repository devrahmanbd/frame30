/**
 * Theme-keyed widget registry — the composition root for widget resolution
 * (theme-remediation Task 3).
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

export function themeWidgetKeys(): string[] {
  return Object.keys(THEME_WIDGETS);
}

export function resolveWidgetComponent(
  themeKey: string | null | undefined,
  type: SectionType,
): WidgetComponent | undefined {
  if (themeKey == null) return WIDGET_COMPONENTS[type];
  return THEME_WIDGETS[themeKey]?.()[type] ?? GENERIC_WIDGETS[type];
}
