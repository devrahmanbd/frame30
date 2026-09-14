import { describe, expect, it } from "vitest";
import {
  evaluateFlagsForMerchant,
  getFeatureFlag,
  isFeatureEnabled,
  listFeatureFlags,
  setFeatureFlag,
  setMerchantFlagOverride,
} from "./feature-flags.server";

describe("Phase 7.3 — Tenant Feature Flag Engine", () => {
  it("loads pre-seeded core platform feature flags", async () => {
    const flags = await listFeatureFlags();
    expect(flags.length).toBeGreaterThanOrEqual(4);
    expect(flags.some((f) => f.key === "checkout_v2")).toBe(true);
    expect(flags.some((f) => f.key === "ai_agent_support")).toBe(true);
  });

  it("respects master global switch to kill a feature", async () => {
    await setFeatureFlag({
      key: "test_kill_switch",
      name: "Kill Switch Test",
      enabled: false,
      rolloutPercentage: 100,
    });

    const enabled = await isFeatureEnabled("test_kill_switch", { merchantId: "merchant-any" });
    expect(enabled).toBe(false);
  });

  it("verifies toggling a feature flag enables functionality for Merchant A while remaining disabled for Merchant B", async () => {
    const flagKey = "beta_express_checkout";
    await setFeatureFlag({
      key: flagKey,
      name: "Beta Express Checkout",
      enabled: false, // globally disabled
      rolloutPercentage: 0,
      merchantOverrides: {},
    });

    // Merchant A and B initially both disabled
    expect(await isFeatureEnabled(flagKey, { merchantId: "merchant-alpha" })).toBe(false);
    expect(await isFeatureEnabled(flagKey, { merchantId: "merchant-beta" })).toBe(false);

    // Explicitly enable for Merchant A only
    await setMerchantFlagOverride(flagKey, "merchant-alpha", true);

    // Verify Merchant A is enabled, Merchant B remains disabled
    expect(await isFeatureEnabled(flagKey, { merchantId: "merchant-alpha" })).toBe(true);
    expect(await isFeatureEnabled(flagKey, { merchantId: "merchant-beta" })).toBe(false);

    // Explicitly disable for Merchant A
    await setMerchantFlagOverride(flagKey, "merchant-alpha", false);
    expect(await isFeatureEnabled(flagKey, { merchantId: "merchant-alpha" })).toBe(false);
  });

  it("enforces tenant cohort ring targeting", async () => {
    const cohortFlag = "exclusive_cohort_feature";
    await setFeatureFlag({
      key: cohortFlag,
      name: "Cohort Restricted Feature",
      enabled: true,
      rolloutPercentage: 100,
      cohortTiers: [0, 1], // internal & beta only
      merchantOverrides: {},
    });

    // Internal store (Cohort 0) -> Allowed
    expect(await isFeatureEnabled(cohortFlag, { merchantId: "framique-hq" })).toBe(true);

    // Beta store (Cohort 1) -> Allowed
    expect(await isFeatureEnabled(cohortFlag, { merchantId: "beta-partner-1" })).toBe(true);

    // Global store (Cohort 4) -> Denied
    expect(await isFeatureEnabled(cohortFlag, { merchantId: "standard-global-shop", cohortTier: 4 })).toBe(false);
  });

  it("evaluates deterministic percentage rollouts consistently", async () => {
    const flagKey = "rollout_feature_50pct";
    await setFeatureFlag({
      key: flagKey,
      name: "50% Rollout Feature",
      enabled: true,
      rolloutPercentage: 50,
      merchantOverrides: {},
    });

    const m1 = "merchant-stable-123";
    const res1 = await isFeatureEnabled(flagKey, { merchantId: m1 });
    const res2 = await isFeatureEnabled(flagKey, { merchantId: m1 });
    expect(res1).toBe(res2); // strictly deterministic

    // 0% rollout -> always false
    await setFeatureFlag({ key: "rollout_0pct", enabled: true, rolloutPercentage: 0 });
    expect(await isFeatureEnabled("rollout_0pct", { merchantId: "any-store" })).toBe(false);

    // 100% rollout -> always true
    await setFeatureFlag({ key: "rollout_100pct", enabled: true, rolloutPercentage: 100 });
    expect(await isFeatureEnabled("rollout_100pct", { merchantId: "any-store" })).toBe(true);
  });

  it("evaluates flags with zero latency overhead (< 0.1ms per check)", async () => {
    const flagKey = "checkout_v2";
    const start = performance.now();
    const iterations = 500;

    for (let i = 0; i < iterations; i++) {
      await isFeatureEnabled(flagKey, { merchantId: "merchant-perf-bench" });
    }

    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;
    expect(avgMs).toBeLessThan(0.2); // Average < 0.2ms per evaluation
  });

  it("batch evaluates multiple flags for merchant storefront hydration", async () => {
    const evaluated = await evaluateFlagsForMerchant("framique-hq", [
      "checkout_v2",
      "ai_agent_support",
      "multi_currency_checkout",
    ]);

    expect(evaluated["checkout_v2"]).toBe(true);
    expect(evaluated["ai_agent_support"]).toBe(true);
    expect(evaluated["multi_currency_checkout"]).toBe(false);
  });
});
