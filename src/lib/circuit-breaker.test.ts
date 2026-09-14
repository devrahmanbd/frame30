import { describe, expect, it, beforeEach } from "vitest";
import {
  CIRCUIT_BREAKER_THRESHOLDS,
  evaluateCanaryMetrics,
  getCircuitBreakerState,
  processPrometheusAlertWebhook,
  resetCircuitBreaker,
  tripCircuitBreaker,
} from "./circuit-breaker.server";
import { getCanaryState, setCanaryStage } from "./canary-weights.server";

describe("Phase 7.4 — Automated Circuit Breaker & Instant Rollback", () => {
  beforeEach(async () => {
    await resetCircuitBreaker();
    // Stage active canary (GREEN: 5%, BLUE: 95%)
    await setCanaryStage(2, { candidateSlot: "green", primarySlot: "blue" });
  });

  it("maintains CLOSED status under normal, healthy traffic metrics", async () => {
    const verdict = await evaluateCanaryMetrics({
      totalRequests: 2000,
      errors5xx: 2, // 0.1% < 0.5%
      p99LatencyMs: 150, // < 800ms
      unhandledExceptions: 1, // < 10
    });

    expect(verdict.tripped).toBe(false);
    const state = await getCircuitBreakerState();
    expect(state.status).toBe("CLOSED");

    const canary = await getCanaryState();
    expect(canary.active).toBe(true);
  });

  it("trips circuit breaker and instantly rolls back to BLUE when HTTP 5xx error rate > 0.5%", async () => {
    // Inject 15 errors out of 1000 requests (1.5% > 0.5% threshold)
    const verdict = await evaluateCanaryMetrics({
      totalRequests: 1000,
      errors5xx: 15,
      p99LatencyMs: 200,
    });

    expect(verdict.tripped).toBe(true);
    expect(verdict.reason).toContain("HTTP 5xx error rate");
    expect(verdict.rollbackDurationMs).toBeDefined();
    expect(verdict.rollbackDurationMs!).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.ROLLBACK_SLA_MS);

    // Verify Circuit State
    const state = await getCircuitBreakerState();
    expect(state.status).toBe("OPEN");
    expect(state.tripReason).toContain("HTTP 5xx error rate");

    // Verify Canary Abort -> Reverted to BLUE
    const canary = await getCanaryState();
    expect(canary.active).toBe(false);
    expect(canary.stage).toBe(0);
    expect(canary.primarySlot).toBe("blue");
  });

  it("trips circuit breaker when p99 latency exceeds 800ms for 2 consecutive cycles", async () => {
    // Cycle 1: p99 = 850ms (> 800ms) -> First breach (should not trip yet)
    const cycle1 = await evaluateCanaryMetrics({
      totalRequests: 500,
      errors5xx: 0,
      p99LatencyMs: 850,
    });
    expect(cycle1.tripped).toBe(false);

    const stateAfter1 = await getCircuitBreakerState();
    expect(stateAfter1.status).toBe("CLOSED");
    expect(stateAfter1.consecutiveLatencyBreaches).toBe(1);

    // Cycle 2: p99 = 920ms (> 800ms) -> Second breach -> TRIPS CIRCUIT!
    const cycle2 = await evaluateCanaryMetrics({
      totalRequests: 500,
      errors5xx: 0,
      p99LatencyMs: 920,
    });
    expect(cycle2.tripped).toBe(true);
    expect(cycle2.reason).toContain("p99 latency (920ms) exceeded 800ms for 2 consecutive checks");

    const stateAfter2 = await getCircuitBreakerState();
    expect(stateAfter2.status).toBe("OPEN");
  });

  it("resets consecutive latency breaches if latency recovers in the next cycle", async () => {
    // Cycle 1: Latency spike
    await evaluateCanaryMetrics({ totalRequests: 500, errors5xx: 0, p99LatencyMs: 850 });
    let state = await getCircuitBreakerState();
    expect(state.consecutiveLatencyBreaches).toBe(1);

    // Cycle 2: Latency recovers to 150ms
    const recovered = await evaluateCanaryMetrics({ totalRequests: 500, errors5xx: 0, p99LatencyMs: 150 });
    expect(recovered.tripped).toBe(false);

    state = await getCircuitBreakerState();
    expect(state.consecutiveLatencyBreaches).toBe(0);
  });

  it("trips circuit breaker when unhandled exceptions count exceeds 10", async () => {
    const verdict = await evaluateCanaryMetrics({
      totalRequests: 500,
      errors5xx: 0,
      p99LatencyMs: 100,
      unhandledExceptions: 12, // > 10
    });

    expect(verdict.tripped).toBe(true);
    expect(verdict.reason).toContain("Unhandled exceptions count (12) exceeded maximum limit (10)");

    const state = await getCircuitBreakerState();
    expect(state.status).toBe("OPEN");
  });

  it("processes Prometheus Alertmanager webhook and triggers immediate rollback", async () => {
    const webhookPayload = {
      status: "firing",
      alerts: [
        {
          status: "firing",
          labels: {
            alertname: "CanarySurge5xxErrors",
            severity: "critical",
          },
          annotations: {
            description: "Surge in HTTP 502/503 responses detected on framique-green upstream",
          },
        },
      ],
    };

    const outcome = await processPrometheusAlertWebhook(webhookPayload);
    expect(outcome.tripped).toBe(true);
    expect(outcome.reason).toContain("CanarySurge5xxErrors");
    expect(outcome.rollbackDurationMs).toBeLessThan(CIRCUIT_BREAKER_THRESHOLDS.ROLLBACK_SLA_MS);

    const state = await getCircuitBreakerState();
    expect(state.status).toBe("OPEN");
  });

  it("resets circuit breaker back to CLOSED upon operational clearance", async () => {
    // Force trip
    await tripCircuitBreaker("Manual test trip");
    let state = await getCircuitBreakerState();
    expect(state.status).toBe("OPEN");

    // Reset
    const reset = await resetCircuitBreaker();
    expect(reset.status).toBe("CLOSED");

    state = await getCircuitBreakerState();
    expect(state.status).toBe("CLOSED");
  });
});
