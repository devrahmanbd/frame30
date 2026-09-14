import { beforeEach, describe, expect, it } from "vitest";
import { SECTION_CATALOG, type SectionType } from "./builder-ast";
import { isDataWidget } from "./widget-registry";
import { WIDGET_COMPONENTS } from "@/components/builder/widgets";
import { clearSlot, pushSlot, readSlot, SLOT_LIMIT, subscribeChannel } from "./section-channel";
import { biTextState, bnKey, readBiText, resolveBiText, textOf, toDigits } from "./bitext";
import { formatDisplayMoney, formatDisplayNumber } from "./money-display";
import { canAdvance, flowReducer, progressOf, startFlow, type FlowStep } from "./flow-machine";

describe("bitext", () => {
  it("falls back to English when বাংলা is missing", () => {
    const props = { title: "Shop now", [bnKey("title")]: "" };
    expect(textOf(props, "title", "bn")).toBe("Shop now");
    expect(biTextState(readBiText(props, "title"))).toBe("fallback");
  });

  it("prefers বাংলা when present", () => {
    const value = { en: "Shop now", bn: "এখনই কিনুন" };
    expect(resolveBiText(value, "bn")).toBe("এখনই কিনুন");
    expect(resolveBiText(value, "en")).toBe("Shop now");
    expect(biTextState(value)).toBe("ok");
  });

  it("maps numerals only for the Bengali digit system", () => {
    expect(toDigits("1,200", "bengali")).toBe("১,২০০");
    expect(toDigits("1,200", "latin")).toBe("1,200");
  });
});

describe("money display", () => {
  it("never divides by 100 in the widget layer", () => {
    expect(formatDisplayMoney(120000, { compact: true })).toContain("1,200");
    expect(formatDisplayMoney(120000, { compact: true })).not.toContain(".00");
  });

  it("renders Bengali numerals for a Bengali page", () => {
    expect(formatDisplayMoney(120000, { locale: "bn", compact: true })).toContain("১,২০০");
    expect(formatDisplayNumber(42, { locale: "bn" })).toBe("৪২");
  });

  it("treats a missing amount as zero rather than NaN", () => {
    expect(formatDisplayMoney(null)).not.toContain("NaN");
  });
});

describe("flow machine", () => {
  const steps: FlowStep[] = [
    { key: "skin", choices: [{ value: "dry", label: "Dry" }], required: true },
    { key: "concern", choices: [{ value: "acne", label: "Acne" }], multiple: true },
  ];

  it("blocks advancing past an unanswered required step", () => {
    const state = startFlow();
    expect(canAdvance(steps, state)).toBe(false);
    expect(flowReducer(steps, state, { kind: "next" }).index).toBe(0);
  });

  it("advances once answered and reports progress", () => {
    let state = flowReducer(steps, startFlow(), { kind: "answer", step: "skin", value: "dry" });
    expect(canAdvance(steps, state)).toBe(true);
    state = flowReducer(steps, state, { kind: "next" });
    expect(state.index).toBe(1);
    expect(progressOf(steps, state)).toBe(50);
  });

  it("toggles multi-select answers and resets cleanly", () => {
    let state = flowReducer(steps, startFlow(), { kind: "answer", step: "concern", value: "acne" });
    state = flowReducer(steps, state, { kind: "answer", step: "concern", value: "acne" });
    expect(state.answers["concern"]).toEqual([]);
    expect(flowReducer(steps, state, { kind: "reset" })).toEqual(startFlow());
  });
});

describe("phase 1 catalog wiring", () => {
  const PHASE1: SectionType[] = [
    "container",
    "columns",
    "tabs",
    "accordion",
    "divider",
    "spacer",
    "sticky_bar",
    "spec_table",
    "quiz",
    "recently_viewed",
    "quick_view",
    "bundle_offer",
  ];

  it("exposes every phase 1 primitive in the catalog", () => {
    for (const type of PHASE1) {
      expect(SECTION_CATALOG.some((entry) => entry.type === type), type).toBe(true);
    }
  });

  it("gives every phase 1 primitive a renderer", () => {
    for (const type of PHASE1) {
      expect(typeof WIDGET_COMPONENTS[type], type).toBe("function");
    }
  });

  it("treats the data-bound primitives as data widgets", () => {
    expect(isDataWidget("recently_viewed")).toBe(true);
    expect(isDataWidget("quick_view")).toBe(true);
    // Phase 2.7 promoted spec_table to a data widget: it can now bind to the
    // `specs` source instead of only carrying authored rows.
    expect(isDataWidget("spec_table")).toBe(true);
  });
});

describe("cross-section channel", () => {
  beforeEach(() => {
    clearSlot("acme", "recentlyViewed");
    clearSlot("other", "recentlyViewed");
  });

  it("keeps the most recent id first and de-duplicates", () => {
    pushSlot("acme", "recentlyViewed", "a");
    pushSlot("acme", "recentlyViewed", "b");
    pushSlot("acme", "recentlyViewed", "a");
    expect(readSlot("acme", "recentlyViewed")).toEqual(["a", "b"]);
  });

  it("caps each slot and namespaces by store", () => {
    for (let i = 0; i < SLOT_LIMIT.recentlyViewed + 5; i += 1) {
      pushSlot("acme", "recentlyViewed", `p${i}`);
    }
    expect(readSlot("acme", "recentlyViewed")).toHaveLength(SLOT_LIMIT.recentlyViewed);
    expect(readSlot("other", "recentlyViewed")).toEqual([]);
  });

  it("notifies subscribers so sibling sections agree", () => {
    let hits = 0;
    const off = subscribeChannel("acme", () => {
      hits += 1;
    });
    pushSlot("acme", "recentlyViewed", "x");
    off();
    pushSlot("acme", "recentlyViewed", "y");
    expect(hits).toBe(1);
  });
});
