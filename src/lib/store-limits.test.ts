import { describe, expect, it } from "vitest";
import {
  MAX_STORES_PER_ACCOUNT,
  canCreateAdditionalStore,
  storeCapForPlan,
} from "./store-limits";

describe("single-store MVP gate", () => {
  it("caps every plan at one store globally", () => {
    expect(MAX_STORES_PER_ACCOUNT).toBe(1);
    expect(storeCapForPlan("launch")).toBe(1);
    expect(storeCapForPlan("enterprise")).toBe(1);
    expect(storeCapForPlan(null)).toBe(1);
  });

  it("allows the first store, blocks the second", () => {
    expect(canCreateAdditionalStore(0)).toBe(true);
    expect(canCreateAdditionalStore(1)).toBe(false);
    expect(canCreateAdditionalStore(5)).toBe(false);
  });

  it("rejects nonsense counts fail-closed", () => {
    expect(canCreateAdditionalStore(-1)).toBe(false);
    expect(canCreateAdditionalStore(Number.NaN)).toBe(false);
  });
});
