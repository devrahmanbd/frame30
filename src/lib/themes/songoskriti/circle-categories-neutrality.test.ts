/**
 * Songoskriti unified port — lane (a) neutrality top-up (Task 5).
 *
 * Classification row: HP-CIRCLE-CATEGORIES (circle_categories) — clean (a) row:
 * passes on the unmodified tree; a failure is a misclassification signal,
 * never fix by editing src/.
 *
 * circle_categories is a shared key, generic only, neutral in every graph:
 * the songoskriti theme owns NO override for it (not in SONGOSKRITI_WIDGETS),
 * so keyed resolution (songoskriti / foreign / unknown) and unkeyed
 * editor/studio resolution all land on the generic CircleCategories
 * renderer (widgets.tsx, via APPAREL_WIDGETS).
 */
import { describe, expect, it } from "vitest";
import type { SectionType } from "@/lib/builder-ast";
import {
  GENERIC_WIDGETS,
  WIDGET_COMPONENTS,
} from "@/components/builder/widgets";
import { resolveWidgetComponent } from "@/components/builder/theme-widgets";
import { SONGOSKRITI_WIDGETS } from "@/components/builder/songoskriti";

const KEY = "circle_categories" as SectionType;

describe("songoskriti circle_categories neutrality (HP-CIRCLE-CATEGORIES)", () => {
  it("is not overridden by the songoskriti theme — key not in SONGOSKRITI_WIDGETS", () => {
    expect(Object.keys(SONGOSKRITI_WIDGETS)).not.toContain(KEY);
  });

  it("is defined in GENERIC_WIDGETS and WIDGET_COMPONENTS as the same reference", () => {
    const generic = GENERIC_WIDGETS[KEY];
    const closed = WIDGET_COMPONENTS[KEY];
    expect(generic).toBeDefined();
    expect(closed).toBeDefined();
    expect(closed).toBe(generic);
  });

  it("keyed songoskriti resolves to the generic renderer — neutral even for the owner theme", () => {
    expect(resolveWidgetComponent("songoskriti", KEY)).toBe(
      GENERIC_WIDGETS[KEY],
    );
  });

  it("keyed foreign resolves to the generic renderer — EVERYDAY_WIDGETS does not override our key", () => {
    expect(resolveWidgetComponent("acme-pack", KEY)).toBe(GENERIC_WIDGETS[KEY]);
  });

  it("keyed unknown theme resolves to the generic renderer", () => {
    expect(resolveWidgetComponent("no-such-theme", KEY)).toBe(
      GENERIC_WIDGETS[KEY],
    );
  });

  it("unkeyed editor/studio resolves to WIDGET_COMPONENTS[key] === GENERIC_WIDGETS[key]", () => {
    expect(resolveWidgetComponent(null, KEY)).toBe(WIDGET_COMPONENTS[KEY]);
    expect(WIDGET_COMPONENTS[KEY]).toBe(GENERIC_WIDGETS[KEY]);
  });

  it("all resolutions are the same component reference — neutral in every graph", () => {
    const songoskriti = resolveWidgetComponent("songoskriti", KEY);
    const foreign = resolveWidgetComponent("acme-pack", KEY);
    const unknown = resolveWidgetComponent("no-such-theme", KEY);
    const unkeyed = resolveWidgetComponent(null, KEY);
    expect(songoskriti).toBeDefined();
    expect(songoskriti).toBe(foreign);
    expect(foreign).toBe(unknown);
    expect(unknown).toBe(unkeyed);
  });
});
