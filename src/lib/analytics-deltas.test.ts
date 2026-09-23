/**
 * Analytics delta math — TDD: zero baselines must not fabricate +100%.
 */
import { describe, expect, it } from "vitest";
import { deltaPct } from "./analytics.server";

describe("deltaPct", () => {
  it("computes normal deltas", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(0, 0)).toBe(0);
  });

  it("returns null for activity from a zero baseline (no fake +100%)", () => {
    expect(deltaPct(40250, 0)).toBeNull();
    expect(deltaPct(1, 0)).toBeNull();
  });
});
