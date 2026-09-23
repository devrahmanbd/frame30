/**
 * Songoskriti motion controller (Task 5, spec §3) — TDD.
 *
 * Pure layer only (no DOM, no engine): the hero timeline plan, the batch
 * reveal options, the breakpoint/reduced-motion branch decision, and the
 * snap+buttons carousel controller state machine. Hooks are thin shells
 * over these + `withEngine`, so asserting the pure layer pins the spec.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SONGOSKRITI_DESKTOP_MIN,
  SONGOSKRITI_HERO_DEFAULTS,
  createCarouselController,
  heroTimelinePlan,
  resolveSongoskritiBranch,
  revealBatchOptions,
} from "./songoskriti-motion";

describe("hero timeline plan", () => {
  it("builds the spec timeline at full intent", () => {
    const plan = heroTimelinePlan("full");
    expect(plan).not.toBeNull();
    expect(plan!.defaults).toEqual({ duration: 0.6, ease: "power2.out" });
    expect(SONGOSKRITI_HERO_DEFAULTS).toEqual({
      duration: 0.6,
      ease: "power2.out",
    });
    const targets = plan!.steps.map((s) => s.target);
    expect(targets).toEqual([
      "[data-hero-eyebrow]",
      "[data-hero-headline]",
      "[data-hero-sub]",
      "[data-hero-cta]",
      "[data-hero-art]",
    ]);
    // Labels exist and every step lands on a label or position param.
    expect(plan!.labels).toContain("hero-start");
    for (const step of plan!.steps) {
      expect(step.position).toBeDefined();
    }
    // Transforms + opacity only — no layout work.
    const allowed = new Set([
      "x",
      "y",
      "autoAlpha",
      "opacity",
      "duration",
      "ease",
      "stagger",
      "overwrite",
      "clearProps",
    ]);
    for (const step of plan!.steps) {
      for (const key of Object.keys(step.from)) {
        expect(allowed.has(key), `hero step leaks ${key}`).toBe(true);
      }
    }
  });

  it("returns null under reduced motion (static first slide)", () => {
    expect(heroTimelinePlan("reduced")).toBeNull();
    expect(heroTimelinePlan("off")).toBeNull();
  });
});

describe("reveal batch options", () => {
  it("reveals once with play-only toggle actions", () => {
    expect(revealBatchOptions()).toMatchObject({
      once: true,
      toggleActions: "play none none none",
    });
  });
});

describe("resolveSongoskritiBranch", () => {
  it("picks desktop vs mobile at the 768px breakpoint", () => {
    expect(SONGOSKRITI_DESKTOP_MIN).toBe(768);
    expect(resolveSongoskritiBranch("full", 1024)).toBe("desktop");
    expect(resolveSongoskritiBranch("full", 768)).toBe("desktop");
    expect(resolveSongoskritiBranch("full", 767)).toBe("mobile");
    expect(resolveSongoskritiBranch("full", 375)).toBe("mobile");
  });

  it("goes static under reduced motion at any width", () => {
    expect(resolveSongoskritiBranch("reduced", 1024)).toBe("static");
    expect(resolveSongoskritiBranch("reduced", 375)).toBe("static");
    expect(resolveSongoskritiBranch("off", 1024)).toBe("static");
  });
});

describe("carousel controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays on the first slide under reduced motion (static branch)", () => {
    const seen: number[] = [];
    const ctrl = createCarouselController({
      count: 3,
      autoAdvanceMs: 6000,
      intent: "reduced",
      onIndex: (i) => seen.push(i),
    });
    ctrl.start();
    expect(ctrl.isAuto()).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(ctrl.getIndex()).toBe(0);
    expect(seen).toEqual([]);
  });

  it("auto-advances and wraps at full intent", () => {
    const seen: number[] = [];
    const ctrl = createCarouselController({
      count: 3,
      autoAdvanceMs: 6000,
      intent: "full",
      onIndex: (i) => seen.push(i),
    });
    ctrl.start();
    expect(ctrl.isAuto()).toBe(true);
    vi.advanceTimersByTime(6000);
    expect(ctrl.getIndex()).toBe(1);
    vi.advanceTimersByTime(12_000);
    expect(ctrl.getIndex()).toBe(0);
    expect(seen).toEqual([1, 2, 0]);
    ctrl.stop();
    expect(ctrl.isAuto()).toBe(false);
  });

  it("supports snap buttons: manual nav wraps both directions", () => {
    const ctrl = createCarouselController({ count: 3, intent: "full" });
    ctrl.next();
    expect(ctrl.getIndex()).toBe(1);
    ctrl.prev();
    expect(ctrl.getIndex()).toBe(0);
    ctrl.prev();
    expect(ctrl.getIndex()).toBe(2);
    ctrl.goTo(7);
    expect(ctrl.getIndex()).toBe(1);
  });

  it("pauses and resumes autoplay", () => {
    const ctrl = createCarouselController({
      count: 3,
      autoAdvanceMs: 6000,
      intent: "full",
      onIndex: () => {},
    });
    ctrl.start();
    ctrl.pause();
    vi.advanceTimersByTime(12_000);
    expect(ctrl.getIndex()).toBe(0);
    ctrl.resume();
    vi.advanceTimersByTime(6000);
    expect(ctrl.getIndex()).toBe(1);
    ctrl.stop();
  });

  it("never auto-advances a single slide or an empty carousel", () => {
    const single = createCarouselController({ count: 1, intent: "full" });
    single.start();
    expect(single.isAuto()).toBe(false);
    const empty = createCarouselController({ count: 0, intent: "full" });
    empty.start();
    expect(empty.getIndex()).toBe(0);
    expect(() => {
      empty.next();
      empty.prev();
      empty.goTo(3);
    }).not.toThrow();
    expect(empty.getIndex()).toBe(0);
  });
});
