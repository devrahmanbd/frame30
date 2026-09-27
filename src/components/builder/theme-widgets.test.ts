/**
 * Theme-keyed widget resolution (theme-remediation Task 3).
 *
 * RED-first contract: the same widget key must resolve to different
 * renderers by theme key, with the generic renderer as fallback. The
 * global merge in `./widgets` must carry zero songoskriti overrides —
 * per-theme look comes from the theme-keyed registry only.
 */
import { describe, expect, it } from "vitest";
import type { SectionType } from "@/lib/builder-ast";
import { GENERIC_WIDGETS, WIDGET_COMPONENTS } from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import { resolveWidgetComponent, themeWidgetKeys } from "./theme-widgets";

/** Keys the songoskriti theme overrides on top of the generic renderers. */
const OVERRIDDEN_KEYS = (
  Object.keys(SONGOSKRITI_WIDGETS) as SectionType[]
).filter(
  (key) =>
    (GENERIC_WIDGETS as Partial<Record<SectionType, unknown>>)[key] !==
    undefined,
);

/** Keys only the songoskriti theme provides (no generic renderer exists). */
const THEME_ONLY_KEYS = (
  Object.keys(SONGOSKRITI_WIDGETS) as SectionType[]
).filter(
  (key) =>
    (GENERIC_WIDGETS as Partial<Record<SectionType, unknown>>)[key] ===
    undefined,
);

describe("theme widget registry", () => {
  it("registers one entry per theme (preview-sources.ts style)", () => {
    expect(themeWidgetKeys()).toContain("songoskriti");
    expect(themeWidgetKeys()).toContain("somvabona");
  });

  it("two themes resolve the same key to different renderers by theme key", () => {
    expect(OVERRIDDEN_KEYS.length).toBeGreaterThan(0);
    for (const key of OVERRIDDEN_KEYS) {
      const themed = resolveWidgetComponent("songoskriti", key);
      const generic = resolveWidgetComponent("somvabona", key);
      expect(themed).toBe(
        SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS],
      );
      expect(generic).toBe(
        (GENERIC_WIDGETS as Record<SectionType, unknown>)[key],
      );
      // The violation this task ends: both themes must NOT share the
      // songoskriti override.
      expect(generic).not.toBe(themed);
    }
  });

  it("generic fallback serves unknown themes and keys without an override", () => {
    expect(resolveWidgetComponent("no-such-theme", "newsletter")).toBe(
      GENERIC_WIDGETS.newsletter,
    );
    expect(resolveWidgetComponent("somvabona", "newsletter")).toBe(
      GENERIC_WIDGETS.newsletter,
    );
    expect(resolveWidgetComponent(null, "newsletter")).toBe(
      WIDGET_COMPONENTS.newsletter,
    );
  });

  it("theme-only keys resolve for their theme and to nothing generic", () => {
    expect(THEME_ONLY_KEYS).toContain("finder_row");
    for (const key of THEME_ONLY_KEYS) {
      expect(resolveWidgetComponent("songoskriti", key)).toBe(
        SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS],
      );
      // No generic renderer exists and no brand may leak: other themes
      // get nothing, so the section renders the unavailable placeholder.
      expect(resolveWidgetComponent("somvabona", key)).toBeUndefined();
    }
  });

  it("no global override: the generic map carries zero songoskriti renderers", () => {
    const songoskritiRenderers = new Set(Object.values(SONGOSKRITI_WIDGETS));
    for (const key of OVERRIDDEN_KEYS) {
      expect((GENERIC_WIDGETS as Record<SectionType, unknown>)[key]).not.toBe(
        SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS],
      );
    }
    for (const [key, renderer] of Object.entries(GENERIC_WIDGETS)) {
      expect(
        songoskritiRenderers.has(renderer as never),
        `${key} resolves to a songoskriti override globally`,
      ).toBe(false);
    }
  });

  it("songoskriti default path is byte-identical to the legacy closed map", () => {
    for (const key of Object.keys(WIDGET_COMPONENTS) as SectionType[]) {
      expect(resolveWidgetComponent("songoskriti", key)).toBe(
        WIDGET_COMPONENTS[key],
      );
      expect(resolveWidgetComponent(undefined, key)).toBe(
        WIDGET_COMPONENTS[key],
      );
    }
  });
});
