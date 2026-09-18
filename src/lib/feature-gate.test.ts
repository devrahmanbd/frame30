import { describe, it, expect } from "vitest";
import { hasFeature, requireFeature } from "./feature-gate";

describe("feature-gate", () => {
  it("low tier has all features", () => {
    expect(hasFeature("low", "customCode")).toBe(true);
    expect(hasFeature("low", "builder")).toBe(true);
    expect(hasFeature("low", "checkout")).toBe(true);
  });

  it("medium tier lacks customCode", () => {
    expect(hasFeature("medium", "customCode")).toBe(false);
    expect(hasFeature("medium", "builder")).toBe(false);
    expect(hasFeature("medium", "checkout")).toBe(true);
  });

  it("high tier lacks everything", () => {
    expect(hasFeature("high", "customCode")).toBe(false);
    expect(hasFeature("high", "checkout")).toBe(false);
    expect(hasFeature("high", "analytics")).toBe(false);
  });

  it("requireFeature throws for disabled feature", () => {
    expect(() => requireFeature("high", "builder")).toThrow(
      "feature_disabled_by_risk_policy",
    );
  });

  it("requireFeature does not throw for enabled feature", () => {
    expect(() => requireFeature("low", "builder")).not.toThrow();
  });
});
