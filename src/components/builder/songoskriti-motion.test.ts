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
  HERO_SELECTOR,
  REVEAL_SELECTOR,
  DESKTOP_MIN,
  HERO_DEFAULTS,
  createCarouselController,
  findRevealScroller,
  findRevealScrollerNode,
  heroTimelinePlan,
  resolveRevealMode,
  resolveMotionBranch,
  revealBatchOptions,
  type RevealScrollNode,
} from "./songoskriti-motion";

describe("theme-neutral motion selectors", () => {
  it("exposes generic reveal + hero hooks (no brand prefix)", () => {
    expect(REVEAL_SELECTOR).toBe("[data-reveal]");
    expect(HERO_SELECTOR).toBe("[data-hero]");
  });
});

describe("hero timeline plan", () => {
  it("builds the spec timeline at full intent", () => {
    const plan = heroTimelinePlan("full");
    expect(plan).not.toBeNull();
    expect(plan!.defaults).toEqual({ duration: 0.6, ease: "power2.out" });
    expect(HERO_DEFAULTS).toEqual({
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

describe("resolveRevealMode", () => {
  it("animates only at full intent with a live scope", () => {
    expect(resolveRevealMode("full", true)).toBe("animate");
  });

  it("leaves content visible when scroller lookup fails (no scope)", () => {
    // Progressive enhancement: a scope that failed to resolve could never
    // fire its triggers, so hiding it would strand it at opacity 0.
    expect(resolveRevealMode("full", false)).toBe("static");
  });

  it("renders static-visible under reduced motion at any scope", () => {
    expect(resolveRevealMode("reduced", true)).toBe("static");
    expect(resolveRevealMode("reduced", false)).toBe("static");
    expect(resolveRevealMode("off", true)).toBe("static");
    expect(resolveRevealMode("off", false)).toBe("static");
  });
});

describe("findRevealScrollerNode", () => {
  const node = (
    partial: Partial<RevealScrollNode> & {
      parentElement?: RevealScrollNode | null;
    },
  ): RevealScrollNode => ({
    parentElement: partial.parentElement ?? null,
    overflowY: partial.overflowY ?? "visible",
    scrollHeight: partial.scrollHeight ?? 0,
    clientHeight: partial.clientHeight ?? 0,
  });

  it("returns null when there is no scope (lookup fails → static)", () => {
    expect(findRevealScrollerNode(null)).toBeNull();
  });

  it("finds the nearest scrolling ancestor (preview dialog host)", () => {
    const dialog = node({
      parentElement: null,
      overflowY: "auto",
      scrollHeight: 2000,
      clientHeight: 800,
    });
    const inner = node({ parentElement: dialog, overflowY: "visible" });
    const scope = node({ parentElement: inner });
    expect(findRevealScrollerNode(scope)).toBe(dialog);
  });

  it("skips overflow-hidden ancestors and falls back to the viewport", () => {
    const page = node({ parentElement: null, overflowY: "visible" });
    const scope = node({ parentElement: page });
    expect(findRevealScrollerNode(scope)).toBe("viewport");
  });

  it("ignores auto containers with no overflowing content", () => {
    const flat = node({
      parentElement: null,
      overflowY: "auto",
      scrollHeight: 400,
      clientHeight: 400,
    });
    const scope = node({ parentElement: flat });
    expect(findRevealScrollerNode(scope)).toBe("viewport");
  });
});

describe("findRevealScroller (DOM adapter)", () => {
  it("leaves detached scopes visible (triggers could never fire)", () => {
    const scope = { isConnected: false } as unknown as HTMLElement;
    expect(findRevealScroller(scope)).toBeNull();
  });
});

describe("resolveMotionBranch", () => {
  it("picks desktop vs mobile at the 768px breakpoint", () => {
    expect(DESKTOP_MIN).toBe(768);
    expect(resolveMotionBranch("full", 1024)).toBe("desktop");
    expect(resolveMotionBranch("full", 768)).toBe("desktop");
    expect(resolveMotionBranch("full", 767)).toBe("mobile");
    expect(resolveMotionBranch("full", 375)).toBe("mobile");
  });

  it("goes static under reduced motion at any width", () => {
    expect(resolveMotionBranch("reduced", 1024)).toBe("static");
    expect(resolveMotionBranch("reduced", 375)).toBe("static");
    expect(resolveMotionBranch("off", 1024)).toBe("static");
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
