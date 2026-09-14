import { describe, expect, it } from "vitest";

import { hydrationMode, hydrationProfile, isZeroJsWidget } from "./widget-hydration";
import {
  BUILDER_API_VERSION,
  PRESET_API_RANGE,
  checkApiCompatibility,
  isCompatiblePackage,
  registryVersionInfo,
} from "./registry-version";
import { THEME_PRESETS } from "./theme-presets";
import { WIDGET_TYPES } from "./widget-registry";

describe("island hydration policy", () => {
  it("keeps markup-only widgets at zero client JS", () => {
    expect(hydrationMode("rich_text")).toBe("static");
    expect(isZeroJsWidget("image")).toBe(true);
    expect(isZeroJsWidget("quiz")).toBe(false);
  });

  it("hydrates chrome and buy-path widgets eagerly", () => {
    for (const type of ["announcement_bar", "add_to_cart", "buy_box", "search_command"]) {
      expect(hydrationMode(type)).toBe("eager");
    }
  });

  it("defers disclosure widgets until first interaction", () => {
    expect(hydrationMode("accordion")).toBe("interaction");
    expect(hydrationMode("faq")).toBe("interaction");
  });

  it("defaults every other widget to visibility-triggered hydration", () => {
    expect(hydrationMode("product_rail")).toBe("visible");
  });

  it("assigns exactly one mode to every registered widget", () => {
    for (const type of WIDGET_TYPES) {
      expect(["static", "eager", "visible", "interaction"]).toContain(hydrationMode(type));
    }
  });

  it("reports the deferred share of a layout for the perf budget", () => {
    const profile = hydrationProfile(["rich_text", "image", "product_rail", "add_to_cart"]);
    expect(profile.counts.static).toBe(2);
    expect(profile.staticShare).toBe(0.5);
    expect(profile.deferredShare).toBe(0.75);
  });
});

describe("registry versioning", () => {
  it("accepts the range the official presets declare", () => {
    expect(isCompatiblePackage(PRESET_API_RANGE)).toBe(true);
    expect(checkApiCompatibility(PRESET_API_RANGE).ok).toBe(true);
  });

  it("rejects a package built for another major line", () => {
    const verdict = checkApiCompatibility("^2.0.0");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("registry.api_incompatible");
  });

  it("rejects a malformed range instead of assuming compatibility", () => {
    const verdict = checkApiCompatibility("latest");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("registry.api_range_invalid");
  });

  it("treats a missing range as the official preset range", () => {
    expect(isCompatiblePackage(null)).toBe(true);
  });

  it("ships every official preset compatible with the running builder API", () => {
    const info = registryVersionInfo();
    expect(info.builderApi).toBe(BUILDER_API_VERSION);
    expect(info.presets).toHaveLength(THEME_PRESETS.length);
    expect(info.presets.every((preset) => preset.compatible)).toBe(true);
  });
});
