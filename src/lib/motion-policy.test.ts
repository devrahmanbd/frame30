import { describe, expect, it, vi } from "vitest";
import {
  ENGINE_LOAD_POLICY,
  MOTION_TOKENS,
  MotionBudget,
  allowsHeavyMedia,
  allowsOpacity,
  allowsTransform,
  backoffDelayMs,
  clamp,
  counterValueAt,
  easeOutExpo,
  entranceDuration,
  formatCounterValue,
  magneticOffset,
  marqueeDurationMs,
  motionLogRecord,
  parallaxOffset,
  resolveIntent,
  shouldRetryLoad,
  shouldSampleLog,
  staggerSchedule,
} from "./motion-policy";

describe("resolveIntent", () => {
  it("is off before hydration so SSR and the first client render agree", () => {
    expect(resolveIntent({ hydrated: false })).toBe("off");
    expect(resolveIntent({})).toBe("full");
  });

  it("honours prefers-reduced-motion", () => {
    expect(resolveIntent({ hydrated: true, prefersReduced: true })).toBe("reduced");
  });

  it("never lets a product override beat the OS accessibility setting", () => {
    expect(resolveIntent({ override: "full", prefersReduced: true })).toBe("reduced");
    expect(resolveIntent({ override: "off", prefersReduced: false })).toBe("off");
  });

  it("downgrades on Save-Data, low memory and low core counts", () => {
    expect(resolveIntent({ hydrated: true, saveData: true })).toBe("reduced");
    expect(resolveIntent({ hydrated: true, deviceMemoryGb: 1 })).toBe("reduced");
    expect(resolveIntent({ hydrated: true, hardwareConcurrency: 2 })).toBe("reduced");
    expect(resolveIntent({ hydrated: true, deviceMemoryGb: 8, hardwareConcurrency: 8 })).toBe("full");
  });

  it("gates transforms, opacity and heavy media by intent", () => {
    expect(allowsTransform("full")).toBe(true);
    expect(allowsTransform("reduced")).toBe(false);
    expect(allowsOpacity("reduced")).toBe(true);
    expect(allowsOpacity("off")).toBe(false);
    expect(allowsHeavyMedia("reduced")).toBe(false);
  });

  it("clamps entrance duration and collapses it at off intent", () => {
    expect(entranceDuration("off")).toBe(0);
    expect(entranceDuration("reduced")).toBeLessThanOrEqual(MOTION_TOKENS.duration.fast);
    expect(entranceDuration("full", 5_000)).toBe(MOTION_TOKENS.duration.slow);
  });
});

describe("staggerSchedule", () => {
  it("returns one delay per child, starting at zero", () => {
    const delays = staggerSchedule(4, { stepMs: 50 });
    expect(delays).toEqual([0, 50, 100, 150]);
  });

  it("shrinks the step so the last child never exceeds the total budget", () => {
    const delays = staggerSchedule(40, { stepMs: 120, maxTotalMs: 900 });
    expect(delays).toHaveLength(40);
    expect(Math.max(...delays)).toBeLessThanOrEqual(900);
  });

  it("caps how many children get distinct delays", () => {
    const delays = staggerSchedule(60, { stepMs: 40, maxChildren: 10, maxTotalMs: 900 });
    expect(new Set(delays).size).toBeLessThanOrEqual(10);
    expect(delays[59]).toBe(delays[10]);
  });

  it("flattens to zero at reduced/off intent and tolerates junk input", () => {
    expect(staggerSchedule(3, { intent: "reduced" })).toEqual([0, 0, 0]);
    expect(staggerSchedule(0)).toEqual([]);
    expect(staggerSchedule(Number.NaN)).toEqual([]);
    expect(staggerSchedule(-5)).toEqual([]);
  });
});

describe("marqueeDurationMs", () => {
  it("keeps speed constant across content widths", () => {
    const short = marqueeDurationMs(800, 40);
    const long = marqueeDurationMs(1_600, 40);
    expect(long).toBeGreaterThan(short);
    expect(long / short).toBeCloseTo(2, 1);
  });

  it("clamps to the min/max window and survives zero or invalid speed", () => {
    expect(marqueeDurationMs(10, 40)).toBe(MOTION_TOKENS.marquee.minMs);
    expect(marqueeDurationMs(10_000_000, 40)).toBe(MOTION_TOKENS.marquee.maxMs);
    expect(marqueeDurationMs(4_000, 0)).toBeGreaterThan(0);
    expect(marqueeDurationMs(Number.NaN)).toBe(MOTION_TOKENS.marquee.minMs);
  });
});

describe("offsets", () => {
  it("clamps parallax to the token maximum in both directions", () => {
    expect(parallaxOffset(0, 1)).toBe(0);
    expect(parallaxOffset(5, 1)).toBe(MOTION_TOKENS.distance.parallaxMax);
    expect(parallaxOffset(-5, 1)).toBe(-MOTION_TOKENS.distance.parallaxMax);
    expect(parallaxOffset(1, 0)).toBe(0);
    expect(parallaxOffset(Number.NaN, 0.5)).toBe(0);
  });

  it("never lets a magnetic button escape further than its cap", () => {
    const rect = { width: 200, height: 60 };
    expect(magneticOffset(0, 0, rect)).toEqual({ x: 0, y: 0 });
    const far = magneticOffset(9_999, 9_999, rect, 10);
    expect(far).toEqual({ x: 10, y: 10 });
    const near = magneticOffset(-50, -15, rect, 10);
    expect(near.x).toBeCloseTo(-5, 1);
    expect(near.y).toBeCloseTo(-5, 1);
  });
});

describe("counters", () => {
  it("eases out and always lands exactly on the target", () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(0.5)).toBeGreaterThan(0.5);
    expect(counterValueAt(1_400, 1_400, 0, 1_240, "full")).toBeCloseTo(1_240, 0);
    expect(counterValueAt(0, 1_400, 0, 1_240, "full")).toBe(0);
  });

  it("skips straight to the target when motion is reduced or off", () => {
    expect(counterValueAt(0, 1_400, 0, 99, "reduced")).toBe(99);
    expect(counterValueAt(0, 0, 0, 99, "full")).toBe(99);
  });

  it("pads in-flight values to the settled width so nothing reflows", () => {
    const settled = formatCounterValue(1_240, 1_240);
    const inflight = formatCounterValue(7, 1_240);
    expect(settled).toBe("1,240");
    expect(inflight).toHaveLength(settled.length);
    expect(inflight.trim().replace(/\u2007/g, "")).toBe("7");
  });
});

describe("MotionBudget", () => {
  it("caps concurrent animations and reports the overflow", () => {
    const budget = new MotionBudget(2);
    expect(budget.acquire("a")).toBe(true);
    expect(budget.acquire("b")).toBe(true);
    expect(budget.acquire("c")).toBe(false);
    expect(budget.stats()).toMatchObject({ active: 2, rejected: 1, max: 2, peak: 2 });
    budget.release("a");
    expect(budget.acquire("c")).toBe(true);
  });

  it("is idempotent per id and clears cleanly", () => {
    const budget = new MotionBudget(1);
    expect(budget.acquire("a")).toBe(true);
    expect(budget.acquire("a")).toBe(true);
    expect(budget.size).toBe(1);
    budget.clear();
    expect(budget.size).toBe(0);
  });

  it("never allows a zero or negative cap to disable motion entirely", () => {
    expect(new MotionBudget(0).max).toBe(1);
    expect(new MotionBudget(-4).max).toBe(1);
  });
});

describe("engine load policy", () => {
  it("grows exponentially, jitters, and never exceeds the cap", () => {
    expect(backoffDelayMs(0, ENGINE_LOAD_POLICY, () => 1)).toBe(300);
    expect(backoffDelayMs(1, ENGINE_LOAD_POLICY, () => 1)).toBe(600);
    expect(backoffDelayMs(9, ENGINE_LOAD_POLICY, () => 1)).toBe(ENGINE_LOAD_POLICY.maxBackoffMs);
    expect(backoffDelayMs(0, ENGINE_LOAD_POLICY, () => 0)).toBe(150);
  });

  it("stops retrying at the configured ceiling", () => {
    expect(shouldRetryLoad(0)).toBe(true);
    expect(shouldRetryLoad(ENGINE_LOAD_POLICY.retries)).toBe(false);
  });
});

describe("logging", () => {
  it("normalises fields, bounds cardinality and drops nullish values", () => {
    const record = motionLogRecord("warn", "budget.exhausted", {
      active: 14.456,
      id: "x".repeat(400),
      missing: null,
      ok: true,
      bad: Number.NaN,
    });
    expect(record.scope).toBe("motion");
    expect(record.fields.active).toBe(14.46);
    expect(String(record.fields.id)).toHaveLength(120);
    expect(record.fields).not.toHaveProperty("missing");
    expect(record.fields.bad).toBe(0);
  });

  it("always reports warnings and errors, and samples the chatty levels", () => {
    const rand = vi.fn(() => 0.9);
    expect(shouldSampleLog("error", 0.05, rand)).toBe(true);
    expect(shouldSampleLog("warn", 0.05, rand)).toBe(true);
    expect(shouldSampleLog("info", 0.05, rand)).toBe(false);
    expect(shouldSampleLog("debug", 1, rand)).toBe(true);
  });
});

describe("clamp", () => {
  it("falls back to the minimum for non-finite input", () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
    expect(clamp(10, 2, 8)).toBe(8);
    expect(clamp(-10, 2, 8)).toBe(2);
  });
});
