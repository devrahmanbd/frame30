import { describe, it, expect, beforeEach } from "vitest";
import {
  startCohortRollout,
  getCohortRolloutState,
  advanceCohortRollout,
  recordTenantTelemetry,
  tripBlastRadiusWatchdog,
  evaluateCohortHealth,
  abortCohortRollout,
  generateOpenRestyCohortLuaBlock,
  COHORT_RING_CONFIGS,
} from "./tenant-cohort-rollout.server";
import {
  getActiveCohortRolloutTier,
  setTenantCohort,
  resolveTenantCanaryRoute,
} from "./tenant-canary.server";

describe("Phase 11.2 — Progressive Tenant Cohort Rollout Controller & Blast Radius Watchdog", () => {
  beforeEach(async () => {
    // Reset state before each test
    await abortCohortRollout("test_reset");
  });

  it("defines the strict 5-ring cohort hierarchy with explicit soak times and error budgets", () => {
    expect(COHORT_RING_CONFIGS[0].name).toContain("Cohort 0 (Internal / Dogfood)");
    expect(COHORT_RING_CONFIGS[0].maxStores).toBe(25);
    expect(COHORT_RING_CONFIGS[0].soakDurationMs).toBe(10 * 60 * 1000);

    expect(COHORT_RING_CONFIGS[1].name).toContain("Cohort 1 (10 Beta Stores)");
    expect(COHORT_RING_CONFIGS[1].maxStores).toBe(10);
    expect(COHORT_RING_CONFIGS[1].maxSingleTenantErrors).toBe(0); // Zero-tolerance

    expect(COHORT_RING_CONFIGS[2].name).toContain("Cohort 2 (100 Early-Adopters)");
    expect(COHORT_RING_CONFIGS[2].maxStores).toBe(100);

    expect(COHORT_RING_CONFIGS[3].name).toContain("Cohort 3 (1,000 Scaled Production Stores)");
    expect(COHORT_RING_CONFIGS[3].maxStores).toBe(1000);

    expect(COHORT_RING_CONFIGS[4].name).toContain("Cohort 4 (Global 10,000+ Stores)");
    expect(COHORT_RING_CONFIGS[4].maxStores).toBe(Number.POSITIVE_INFINITY);
  });

  it("initiates progressive rollout at Cohort 0 with candidate GREEN and primary BLUE", async () => {
    const state = await startCohortRollout({ gitSha: "sha-phase11-test" });

    expect(state.active).toBe(true);
    expect(state.currentTier).toBe(0);
    expect(state.status).toBe("soaking");
    expect(state.candidateSlot).toBe("green");
    expect(state.primarySlot).toBe("blue");
    expect(state.gitSha).toBe("sha-phase11-test");

    // Router tier in Redis/memory must be set to 0
    const activeTier = await getActiveCohortRolloutTier();
    expect(activeTier).toBe(0);
  });

  it("enforces soak duration gate before allowing progression to the next ring", async () => {
    await startCohortRollout({ initialTier: 0 });

    // Attempting to advance immediately without { force: true } must fail due to active soak timer
    const result = await advanceCohortRollout({ force: false });
    expect(result.success).toBe(false);
    expect(result.reason).toContain("Soak time for Cohort 0 (Internal / Dogfood) still active");

    const state = await getCohortRolloutState();
    expect(state.currentTier).toBe(0);
  });

  it("advances sequentially through all 5 rings when forced or soak completes", async () => {
    await startCohortRollout({ initialTier: 0 });

    // 0 -> 1
    const adv1 = await advanceCohortRollout({ force: true });
    expect(adv1.success).toBe(true);
    expect(adv1.state.currentTier).toBe(1);
    expect(await getActiveCohortRolloutTier()).toBe(1);

    // 1 -> 2
    const adv2 = await advanceCohortRollout({ force: true });
    expect(adv2.success).toBe(true);
    expect(adv2.state.currentTier).toBe(2);
    expect(await getActiveCohortRolloutTier()).toBe(2);

    // 2 -> 3
    const adv3 = await advanceCohortRollout({ force: true });
    expect(adv3.success).toBe(true);
    expect(adv3.state.currentTier).toBe(3);
    expect(await getActiveCohortRolloutTier()).toBe(3);

    // 3 -> 4
    const adv4 = await advanceCohortRollout({ force: true });
    expect(adv4.success).toBe(true);
    expect(adv4.state.currentTier).toBe(4);
    expect(await getActiveCohortRolloutTier()).toBe(4);

    // 4 -> Completed
    const adv5 = await advanceCohortRollout({ force: true });
    expect(adv5.success).toBe(true);
    expect(adv5.state.status).toBe("completed");
  });

  it("Blast Radius Watchdog: Customer #17 courier failure at Cohort 1 halts rollout and triggers instant rollback", async () => {
    // Start rollout at Cohort 1 (10 Beta Stores)
    await startCohortRollout({ initialTier: 1 });
    expect(await getActiveCohortRolloutTier()).toBe(1);

    // Assign Customer #17 to Cohort 1
    await setTenantCohort("customer-17", 1);

    // Normal traffic for other beta customers flows through GREEN with zero errors
    const normalEvent = await recordTenantTelemetry({
      tenantId: "partner-beta-store-1",
      cohortTier: 1,
      slot: "green",
      statusCode: 200,
      latencyMs: 85,
    });
    expect(normalEvent.watchdogTripped).toBe(false);

    // Customer #17 encounters an unexpected Courier Booking failure (e.g. SteadFast API 500 error)
    const fatalEvent = await recordTenantTelemetry({
      tenantId: "customer-17",
      cohortTier: 1,
      slot: "green",
      statusCode: 500,
      isFatalTransactionFailure: true,
      transactionType: "courier_booking",
      errorMessage: "SteadFast courier API 500: Malformed consignment payload for BD district",
      latencyMs: 420,
    });

    // 1. Assert Watchdog was tripped
    expect(fatalEvent.watchdogTripped).toBe(true);
    expect(fatalEvent.tripReason).toContain("CRITICAL FAULT");
    expect(fatalEvent.tripReason).toContain("customer-17");
    expect(fatalEvent.tripReason).toContain("courier_booking");

    // 2. Assert Rollout State transitioned to 'halted'
    const state = await getCohortRolloutState();
    expect(state.active).toBe(false);
    expect(state.status).toBe("halted");
    expect(state.failedTenantId).toBe("customer-17");
    expect(state.haltReason).toContain("SteadFast courier API 500");

    // 3. Assert Instant Rollback: Active Cohort Tier immediately repointed to -1 (All traffic to BLUE)
    const activeTierAfterTrip = await getActiveCohortRolloutTier();
    expect(activeTierAfterTrip).toBe(-1);

    // 4. Verify that edge router immediately routes Customer #17 and all other tenants back to BLUE
    const edgeRequest = new Request("http://localhost/store/customer-17", {
      headers: { "x-merchant-id": "customer-17" },
    });
    const decision = await resolveTenantCanaryRoute(edgeRequest);
    expect(decision.targetSlot).toBe("blue");
    expect(decision.headersToInject["x-framique-target-slot"]).toBe("blue");

    // 5. Subsequent attempts to advance the rollout are strictly blocked
    const advanceAttempt = await advanceCohortRollout({ force: true });
    expect(advanceAttempt.success).toBe(false);
    expect(advanceAttempt.reason).toContain("Cannot advance: Rollout is halted");
  });

  it("evaluates cohort health report with violations when error budgets are exceeded", async () => {
    await startCohortRollout({ initialTier: 0 });

    // Clean initial health
    const cleanHealth = await evaluateCohortHealth(0);
    expect(cleanHealth.isHealthy).toBe(true);
    expect(cleanHealth.violations).toHaveLength(0);

    // Inject payment callback failure
    await recordTenantTelemetry({
      tenantId: "internal-dogfood",
      cohortTier: 0,
      slot: "green",
      statusCode: 502,
      isFatalTransactionFailure: false, // Non-fatal trigger to inspect report
      transactionType: "payment_callback",
      errorMessage: "bKash IPN connection timeout",
      latencyMs: 1200,
    });

    const report = await evaluateCohortHealth(0);
    expect(report.errorCount).toBe(1);
    expect(report.paymentFailures).toBe(1);
    expect(report.isHealthy).toBe(false);
    expect(report.violations.some((v) => v.includes("Payment health failed"))).toBe(true);
  });

  it("generates production OpenResty dynamic Lua router configuration", () => {
    const luaBlock = generateOpenRestyCohortLuaBlock();

    expect(luaBlock).toContain("resty.redis");
    expect(luaBlock).toContain("platform:canary:active_cohort_tier");
    expect(luaBlock).toContain("platform:tenant:cohorts");
    expect(luaBlock).toContain("framique_target_green");
    expect(luaBlock).toContain("framique_target_blue");
    expect(luaBlock).toContain("X-Framique-Target-Slot");
  });
});
