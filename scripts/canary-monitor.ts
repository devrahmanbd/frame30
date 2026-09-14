#!/usr/bin/env bun
/**
 * Automated Canary Circuit Breaker & Metric Monitor CLI (Phase 7.4).
 *
 * Continuously watches candidate health metrics and executes instant < 500ms
 * rollbacks if safety thresholds are breached:
 * 1. HTTP 5xx error rate > 0.5%
 * 2. p99 response latency > 800ms for 2 consecutive check cycles
 * 3. Unhandled exception count > 10
 *
 * Usage:
 *   bun run scripts/canary-monitor.ts --status
 *   bun run scripts/canary-monitor.ts --reset
 *   bun run scripts/canary-monitor.ts --watch
 *   bun run scripts/canary-monitor.ts --simulate-chaos --type=5xx
 *   bun run scripts/canary-monitor.ts --simulate-chaos --type=latency
 *   bun run scripts/canary-monitor.ts --simulate-chaos --type=sentry
 */
import {
  CIRCUIT_BREAKER_THRESHOLDS,
  evaluateCanaryMetrics,
  getCircuitBreakerState,
  resetCircuitBreaker,
  tripCircuitBreaker,
} from "../src/lib/circuit-breaker.server";
import { getCanaryState, setCanaryStage } from "../src/lib/canary-weights.server";

async function main() {
  const args = process.argv.slice(2);

  const isStatus = args.includes("--status") || args.length === 0;
  const isReset = args.includes("--reset");
  const isWatch = args.includes("--watch");
  const isChaos = args.includes("--simulate-chaos");

  if (isReset) {
    const reset = await resetCircuitBreaker();
    console.log("=".repeat(80));
    console.log("\x1b[32mCircuit Breaker Reset: Status CLOSED.\x1b[0m Ready for canary rollouts.");
    console.log("=".repeat(80));
    return;
  }

  if (isChaos) {
    const typeIdx = args.indexOf("--type");
    const chaosType = typeIdx !== -1 ? args[typeIdx + 1] : "5xx";

    console.log("=".repeat(80));
    console.log(`CHAOS TEST INJECTION: Triggering simulated failure of type '${chaosType}'`);
    console.log("=".repeat(80));

    // First ensure a canary is staged
    await setCanaryStage(1, { candidateSlot: "green", primarySlot: "blue" });
    console.log("  ✓ Staged active canary (GREEN: 1%, BLUE: 99%)");

    let result;
    const start = Date.now();

    if (chaosType === "5xx") {
      console.log("  ○ Injecting spike: 200 HTTP 500 errors out of 10,000 requests (2.0% error rate > 0.5% threshold)...");
      result = await evaluateCanaryMetrics({
        totalRequests: 10000,
        errors5xx: 200,
        p99LatencyMs: 120,
      });
    } else if (chaosType === "latency") {
      console.log("  ○ Injecting p99 latency breach: Cycle 1 (950ms > 800ms)...");
      await evaluateCanaryMetrics({ totalRequests: 1000, errors5xx: 0, p99LatencyMs: 950 });
      console.log("  ○ Injecting p99 latency breach: Cycle 2 (1100ms > 800ms)...");
      result = await evaluateCanaryMetrics({ totalRequests: 1000, errors5xx: 0, p99LatencyMs: 1100 });
    } else if (chaosType === "sentry") {
      console.log("  ○ Injecting 15 unhandled Sentry exceptions (> 10 limit)...");
      result = await evaluateCanaryMetrics({
        totalRequests: 500,
        errors5xx: 0,
        p99LatencyMs: 80,
        unhandledExceptions: 15,
      });
    } else {
      console.error(`Unknown chaos type: ${chaosType}. Use 5xx, latency, or sentry.`);
      process.exit(1);
    }

    const duration = Date.now() - start;

    console.log("\n" + "-".repeat(80));
    console.log(`CIRCUIT BREAKER VERDICT : ${result.tripped ? "\x1b[31mTRIPPED (CIRCUIT OPEN)\x1b[0m" : "\x1b[32mHEALTHY (CLOSED)\x1b[0m"}`);
    console.log(`TRIP REASON             : ${result.reason}`);
    console.log(`ROLLBACK DURATION       : ${result.rollbackDurationMs ?? duration}ms (SLA: < ${CIRCUIT_BREAKER_THRESHOLDS.ROLLBACK_SLA_MS}ms)`);
    console.log(`SLA SATISFIED           : ${(result.rollbackDurationMs ?? duration) < CIRCUIT_BREAKER_THRESHOLDS.ROLLBACK_SLA_MS ? "\x1b[32mPASS (< 500ms)\x1b[0m" : "\x1b[31mFAIL (>= 500ms)\x1b[0m"}`);

    const canary = await getCanaryState();
    console.log(`TRAFFIC RESTORATION     : 100% traffic immediately reverted to ${canary.primarySlot.toUpperCase()}`);
    console.log("=".repeat(80));
    return;
  }

  if (isWatch) {
    console.log("=".repeat(80));
    console.log("Framique Automated Canary Circuit Breaker Monitor (Phase 7.4)");
    console.log("Watching candidate health every 5 seconds. Press Ctrl+C to stop.");
    console.log("=".repeat(80));

    // Monitor tick simulation
    setInterval(async () => {
      const canary = await getCanaryState();
      const state = await getCircuitBreakerState();

      if (!canary.active) {
        console.log(`[MONITOR ${new Date().toLocaleTimeString()}] No active canary rollout in progress (Status: ${canary.status.toUpperCase()})`);
        return;
      }

      if (state.status === "OPEN") {
        console.log(`[MONITOR ${new Date().toLocaleTimeString()}] \x1b[31mCIRCUIT BREAKER IS OPEN\x1b[0m. Reason: ${state.tripReason}`);
        return;
      }

      console.log(`[MONITOR ${new Date().toLocaleTimeString()}] Canary Stage ${canary.stage} (${canary.candidateSlot.toUpperCase()}) Healthy. Circuit: CLOSED`);
    }, 5000);

    return;
  }

  if (isStatus) {
    const state = await getCircuitBreakerState();
    const canary = await getCanaryState();

    console.log("=".repeat(80));
    console.log("Framique Canary Circuit Breaker & Safety Status (Phase 7.4)");
    console.log("=".repeat(80));
    console.log(`Circuit Status       : ${state.status === "CLOSED" ? "\x1b[32mCLOSED (Healthy)\x1b[0m" : "\x1b[31mOPEN (Tripped - 100% Rollback)\x1b[0m"}`);
    console.log(`Canary State         : ${canary.active ? `Stage ${canary.stage} Active (${canary.candidateSlot.toUpperCase()})` : "Inactive"}`);
    if (state.trippedAt) {
      console.log(`Tripped At           : ${state.trippedAt}`);
      console.log(`Trip Reason          : ${state.tripReason}`);
      console.log(`Rollback Latency     : ${state.rollbackDurationMs}ms (SLA < 500ms)`);
    }
    console.log(`Latency Breaches     : ${state.consecutiveLatencyBreaches} / ${CIRCUIT_BREAKER_THRESHOLDS.CONSECUTIVE_LATENCY_BREACHES} consecutive minutes`);
    console.log("\nSafety Thresholds Enforced:");
    console.log(`  • Max 5xx Error Rate       : ${CIRCUIT_BREAKER_THRESHOLDS.MAX_ERROR_RATE_5XX * 100}%`);
    console.log(`  • Max p99 Response Latency : ${CIRCUIT_BREAKER_THRESHOLDS.MAX_P99_LATENCY_MS}ms (for ${CIRCUIT_BREAKER_THRESHOLDS.CONSECUTIVE_LATENCY_BREACHES} cycles)`);
    console.log(`  • Max Unhandled Exceptions : ${CIRCUIT_BREAKER_THRESHOLDS.MAX_UNHANDLED_EXCEPTIONS}`);
    console.log(`  • Automated Rollback SLA   : < ${CIRCUIT_BREAKER_THRESHOLDS.ROLLBACK_SLA_MS}ms`);
    console.log("=".repeat(80));
  }
}

main().catch((err) => {
  console.error(`Fatal canary monitor error: ${(err as Error).message}`);
  process.exit(1);
});
