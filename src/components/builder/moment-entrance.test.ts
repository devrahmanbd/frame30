/**
 * Shared entrance moment — budget + intent gating. TDD: the moment must be
 * exactly one one-shot transform/opacity cascade, and must resolve to null
 * (static, settled content) for every non-`full` intent.
 */
import { describe, expect, it } from "vitest";
import { MOMENT_SWATCH_TARGETS, momentCascadeConfig } from "./moment-entrance";
import { MOTION_TOKENS } from "@/lib/motion-policy";
import {
  COUNT_UP_SELECTOR,
  countUpPlan,
  parseCountTarget,
  resolveFxMode,
  scrollScrubPlan,
} from "./motion-fx";

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

describe("motion-fx executor modes", () => {
  it("routes JS effects to the engine and CSS effects to the stylesheet", () => {
    expect(resolveFxMode("full", "count-up")).toBe("js");
    expect(resolveFxMode("full", "scroll-scrub")).toBe("js");
    expect(resolveFxMode("full", "rise")).toBe("css");
    expect(resolveFxMode("full", "marquee")).toBe("css");
    expect(resolveFxMode("full", "none")).toBe("static");
  });

  it("collapses every effect to the settled final state under reduced motion", () => {
    for (const effect of [
      "count-up",
      "scroll-scrub",
      "rise",
      "marquee",
    ] as const) {
      // Static mode never observes and never loads the engine, so the
      // server-rendered final state is what the visitor keeps.
      expect(resolveFxMode("reduced", effect)).toBe("static");
      expect(resolveFxMode("off", effect)).toBe("static");
    }
    expect(countUpPlan("reduced", "count-up")).toBeNull();
    expect(countUpPlan("off", "count-up")).toBeNull();
    expect(scrollScrubPlan("reduced", "scroll-scrub")).toBeNull();
    expect(scrollScrubPlan("off", "scroll-scrub")).toBeNull();
  });

  it("plans a token-gated count-up at full intent only", () => {
    const plan = countUpPlan("full", "count-up");
    expect(plan?.targets).toBe(COUNT_UP_SELECTOR);
    expect(COUNT_UP_SELECTOR.startsWith("[data-")).toBe(true);
    expect(plan?.durationMs).toBe(MOTION_TOKENS.duration.counter);
    expect(countUpPlan("full", "rise")).toBeNull();
  });

  it("plans a capped linear scrub at full intent only", () => {
    const plan = scrollScrubPlan("full", "scroll-scrub");
    // Symmetric drift against the scroll, capped by the parallax ceiling —
    // the scroll position is the easing, so the tween itself is linear.
    expect(plan?.travelPx).toBeLessThanOrEqual(
      MOTION_TOKENS.distance.parallaxMax,
    );
    expect(plan?.ease).toBe("none");
    expect(scrollScrubPlan("full", "rise")).toBeNull();
  });

  it("parses count targets tolerantly and rejects garbage", () => {
    expect(parseCountTarget("1,240")).toBe(1240);
    expect(parseCountTarget("12.5")).toBe(12.5);
    expect(parseCountTarget("-40")).toBe(-40);
    expect(parseCountTarget(7)).toBe(7);
    expect(parseCountTarget("abc")).toBeNull();
    expect(parseCountTarget("")).toBeNull();
    expect(parseCountTarget(undefined)).toBeNull();
  });
});
