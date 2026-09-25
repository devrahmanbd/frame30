/**
 * LANE B2-5 — editor (studio) range/slider styling contracts.
 *
 * Static-markup assertions: the MenuBuilder mega-columns slider and the
 * StudioControls Radix slider keep native keyboard behavior, read theme
 * tokens only (no raw hex), expose a 44px touch height, keep visible
 * focus, preserve bilingual labels, and add no transitions (reduced
 * motion needs no gating on the native inputs; the Radix thumb transition
 * is explicitly gated off). Control logic is untouched — styling only.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EDITOR_RANGE_INPUT,
  MenuBuilder,
  rangeFillPct,
  type MenuItem,
} from "./MenuBuilder";
import { ControlField } from "./studio/StudioControls";
import type { Control } from "@/lib/studio/controls";

const NO_HEX = /#[0-9a-fA-F]{3,8}\b/;

describe("editor range token styling", () => {
  it("uses theme tokens only, never raw hex", () => {
    expect(EDITOR_RANGE_INPUT).not.toMatch(NO_HEX);
    expect(EDITOR_RANGE_INPUT).toContain("var(--color-primary)");
    expect(EDITOR_RANGE_INPUT).toContain("var(--color-card)");
  });

  it("declares a 44px touch height and visible focus", () => {
    expect(EDITOR_RANGE_INPUT).toContain("h-11");
    expect(EDITOR_RANGE_INPUT).toContain("focus-visible:outline-2");
    expect(EDITOR_RANGE_INPUT).toContain("focus-visible:outline-primary");
  });

  it("adds no transitions, so reduced motion is inherently respected", () => {
    expect(EDITOR_RANGE_INPUT).not.toContain("transition");
  });
});

describe("rangeFillPct", () => {
  it("maps the value across min..max, clamped to 0..100", () => {
    expect(rangeFillPct(1, 4, 1)).toBe(0);
    expect(rangeFillPct(1, 4, 4)).toBe(100);
    expect(rangeFillPct(1, 4, 3)).toBeCloseTo(66.67, 1);
    expect(rangeFillPct(0, 100, -5)).toBe(0);
    expect(rangeFillPct(0, 100, 150)).toBe(100);
  });

  it("returns 0 for a degenerate range instead of NaN", () => {
    expect(rangeFillPct(5, 5, 5)).toBe(0);
  });
});

function megaMenu(): MenuItem[] {
  return [
    {
      id: "m1",
      label: "Home",
      href: "/",
      type: "link",
      mega: { enabled: true, columns: 3 },
    },
  ];
}

describe("MenuBuilder mega-columns slider", () => {
  function html(): string {
    return renderToStaticMarkup(
      createElement(MenuBuilder, { value: megaMenu(), onChange: () => {} }),
    );
  }

  it("keeps a native range input with its min/max keyboard semantics", () => {
    const out = html();
    expect(out).toContain('type="range"');
    expect(out).toContain('min="1"');
    expect(out).toContain('max="4"');
  });

  it("renders the token-styled track, fill and 44px touch row", () => {
    const out = html();
    expect(out).toContain("bg-muted");
    expect(out).toContain("var(--color-primary)");
    expect(out).toContain("min-h-11");
    expect(out).toContain("h-11");
  });

  it("keeps the bilingual Columns label linked to the input", () => {
    const out = html();
    expect(out).toContain("Columns");
    expect(out).toContain('for="m1-mega-columns"');
    expect(out).toContain('id="m1-mega-columns"');
  });
});

describe("StudioControls slider", () => {
  const control: Control = {
    key: "gap",
    label: "Gap",
    type: "slider",
    tab: "style",
    section: "Layout",
    min: 0,
    max: 100,
    step: 1,
    responsive: false,
  };

  function html(): string {
    return renderToStaticMarkup(
      createElement(ControlField, {
        control,
        settings: { gap: 24 },
        device: "desktop",
        onChange: () => {},
        onDevice: () => {},
        activeDevices: ["desktop"],
      }),
    );
  }

  it("keeps the keyboard-native slider with its label", () => {
    const out = html();
    expect(out).toContain('role="slider"');
    expect(out).toContain('aria-label="Gap"');
  });

  it("exposes a 44px touch row and gates the thumb transition", () => {
    const out = html();
    expect(out).toContain("min-h-11");
    expect(out).toContain("motion-reduce:transition-none");
  });

  it("adds no raw hex at the usage site", () => {
    expect(html()).not.toMatch(NO_HEX);
  });
});
