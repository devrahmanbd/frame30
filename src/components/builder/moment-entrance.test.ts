/**
 * Shared entrance moment — budget + intent gating. TDD: the moment must be
 * exactly one one-shot transform/opacity cascade, and must resolve to null
 * (static, settled content) for every non-`full` intent.
 */
import { describe, expect, it } from "vitest";
import { MOMENT_SWATCH_TARGETS, momentCascadeConfig } from "./moment-entrance";

describe("momentCascadeConfig", () => {
  it("returns a one-shot cascade config for the full intent", () => {
    const config = momentCascadeConfig("full");
    expect(config).not.toBeNull();
    expect(config!.targets).toBe(MOMENT_SWATCH_TARGETS);
    expect(config!.runOnce).toBe(true);
    // Budget: half a second, gentle stagger — a moment, not a show.
    expect(config!.duration).toBeLessThanOrEqual(0.62);
    expect(config!.stagger).toBeLessThanOrEqual(0.08);
    // GPU-only properties: no width/height/top/left animation.
    expect(config!.from).toEqual({ y: 14, autoAlpha: 0 });
    expect(config!.ease).toBe("power2.out");
  });

  it("resolves to null for reduced and off intents — content stays settled", () => {
    expect(momentCascadeConfig("reduced")).toBeNull();
    expect(momentCascadeConfig("off")).toBeNull();
  });

  it("targets swatch dots via a data attribute, never a global class", () => {
    expect(MOMENT_SWATCH_TARGETS.startsWith("[data-")).toBe(true);
  });
});
