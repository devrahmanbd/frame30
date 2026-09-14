/**
 * Phase 7.4 — Automated Canary Circuit Breaker & Instant Rollback Engine.
 *
 * Enforces production blast-radius safety gates during canary releases:
 * - Breaches trigger immediate automated rollback to 100% BLUE within < 500ms.
 * - Monitored thresholds:
 *   1. HTTP 5xx error rate > 0.5%
 *   2. p99 latency > 800ms for 2 consecutive minutes
 *   3. Unhandled exceptions > 10 in Sentry/GlitchTip
 * - Paging: Dispatches emergency high-severity on-call alert via Alertmanager.
 */
import { abortCanary, getCanaryState } from "./canary-weights.server";
import { incr, log } from "./observability.server";
import { emitAlert } from "./ops-alerts.server";
import { redisCommand, redisConfigured, redisKey } from "./redis.server";

export type CircuitBreakerStatus = "CLOSED" | "OPEN" | "HALF_OPEN";

export type CanaryMetricsSample = {
  totalRequests: number;
  errors5xx: number;
  errorRate5xx: number;
  p99LatencyMs: number;
  unhandledExceptions: number;
  timestamp: string;
};

export type CircuitBreakerState = {
  status: CircuitBreakerStatus;
  trippedAt: string | null;
  tripReason: string | null;
  consecutiveLatencyBreaches: number;
  lastMetrics: CanaryMetricsSample | null;
  rollbackDurationMs: number | null;
  updatedAt: string;
};

export const CIRCUIT_BREAKER_THRESHOLDS = {
  MAX_ERROR_RATE_5XX: 0.005,             // 0.5% maximum allowable 5xx rate
  MAX_P99_LATENCY_MS: 800,               // 800ms p99 latency threshold
  CONSECUTIVE_LATENCY_BREACHES: 2,        // 2 consecutive minutes required
  MAX_UNHANDLED_EXCEPTIONS: 10,          // 10 unhandled exceptions threshold
  ROLLBACK_SLA_MS: 500,                  // < 500ms rollback SLA guarantee
};

const CIRCUIT_KEY = "canary:circuit_breaker:state";

// In-Memory State Fallback
let localCircuitState: CircuitBreakerState = {
  status: "CLOSED",
  trippedAt: null,
  tripReason: null,
  consecutiveLatencyBreaches: 0,
  lastMetrics: null,
  rollbackDurationMs: null,
  updatedAt: new Date().toISOString(),
};

/**
 * Read current circuit breaker state from Redis or memory.
 */
export async function getCircuitBreakerState(): Promise<CircuitBreakerState> {
  if (redisConfigured()) {
    try {
      const res = await redisCommand(["GET", redisKey("platform", CIRCUIT_KEY)]);
      if (res.ok && typeof res.value === "string") {
        return JSON.parse(res.value) as CircuitBreakerState;
      }
    } catch {
      // Fallback
    }
  }
  return localCircuitState;
}

/**
 * Persist circuit breaker state.
 */
export async function saveCircuitBreakerState(state: CircuitBreakerState): Promise<boolean> {
  state.updatedAt = new Date().toISOString();
  localCircuitState = state;

  if (redisConfigured()) {
    try {
      const res = await redisCommand([
        "SET",
        redisKey("platform", CIRCUIT_KEY),
        JSON.stringify(state),
      ]);
      return res.ok;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Reset circuit breaker back to CLOSED state.
 */
export async function resetCircuitBreaker(): Promise<CircuitBreakerState> {
  const resetState: CircuitBreakerState = {
    status: "CLOSED",
    trippedAt: null,
    tripReason: null,
    consecutiveLatencyBreaches: 0,
    lastMetrics: null,
    rollbackDurationMs: null,
    updatedAt: new Date().toISOString(),
  };

  await saveCircuitBreakerState(resetState);

  log("info", "canary.circuit_breaker_reset", {
    status: "CLOSED",
  });

  return resetState;
}

/**
 * Trip the circuit breaker and execute instant < 500ms rollback to BLUE.
 */
export async function tripCircuitBreaker(
  reason: string,
  metrics?: Partial<CanaryMetricsSample>,
): Promise<{ success: boolean; rollbackDurationMs: number; state: CircuitBreakerState }> {
  const start = Date.now();
  const canary = await getCanaryState();

  // 1. Instant Rollback: shift 100% traffic back to BLUE
  await abortCanary();

  const rollbackDurationMs = Date.now() - start;
  const now = new Date().toISOString();

  const trippedState: CircuitBreakerState = {
    status: "OPEN",
    trippedAt: now,
    tripReason: reason,
    consecutiveLatencyBreaches: localCircuitState.consecutiveLatencyBreaches,
    lastMetrics: metrics
      ? {
          totalRequests: metrics.totalRequests || 0,
          errors5xx: metrics.errors5xx || 0,
          errorRate5xx: metrics.errorRate5xx || 0,
          p99LatencyMs: metrics.p99LatencyMs || 0,
          unhandledExceptions: metrics.unhandledExceptions || 0,
          timestamp: now,
        }
      : null,
    rollbackDurationMs,
    updatedAt: now,
  };

  await saveCircuitBreakerState(trippedState);

  // 2. Alert on-call immediately via Alertmanager / ops alert dispatch
  await emitAlert({
    severity: "critical",
    title: `[EMERGENCY ROLLBACK] Canary Circuit Breaker Tripped: ${reason}`,
    body: `Canary release candidate (${canary.candidateSlot.toUpperCase()}) tripped circuit breaker threshold. 100% traffic automatically reverted to ${canary.primarySlot.toUpperCase()} in ${rollbackDurationMs}ms (SLA < 500ms).`,
    source: "canary.circuit_breaker",
    dedupeKey: `canary_circuit_tripped_${Date.now()}`,
    payload: {
      reason,
      rollbackDurationMs,
      metrics,
      revertedSlot: canary.primarySlot,
      previousCandidate: canary.candidateSlot,
    },
  }).catch(() => null);

  incr("framique_canary_circuit_tripped_total", {
    reason,
  });

  log("error", "canary.circuit_breaker_tripped", {
    reason,
    rollbackDurationMs,
    metrics,
    withinSla: rollbackDurationMs < CIRCUIT_BREAKER_THRESHOLDS.ROLLBACK_SLA_MS,
  });

  return {
    success: true,
    rollbackDurationMs,
    state: trippedState,
  };
}

/**
 * Evaluate metrics sample against safety thresholds.
 * Returns verdict whether circuit tripped.
 */
export async function evaluateCanaryMetrics(sample: {
  totalRequests: number;
  errors5xx: number;
  p99LatencyMs: number;
  unhandledExceptions?: number;
}): Promise<{
  tripped: boolean;
  reason?: string;
  rollbackDurationMs?: number;
}> {
  const current = await getCircuitBreakerState();
  if (current.status === "OPEN") {
    return { tripped: true, reason: current.tripReason || "Circuit already OPEN" };
  }

  const errorRate5xx =
    sample.totalRequests > 0 ? sample.errors5xx / sample.totalRequests : 0;
  const unhandledExceptions = sample.unhandledExceptions || 0;

  // Rule 1: HTTP 5xx Error Rate > 0.5%
  if (sample.totalRequests >= 100 && errorRate5xx > CIRCUIT_BREAKER_THRESHOLDS.MAX_ERROR_RATE_5XX) {
    const reason = `HTTP 5xx error rate (${(errorRate5xx * 100).toFixed(2)}%) exceeded threshold (0.50%)`;
    const trip = await tripCircuitBreaker(reason, {
      ...sample,
      errorRate5xx,
      unhandledExceptions,
      timestamp: new Date().toISOString(),
    });
    return { tripped: true, reason, rollbackDurationMs: trip.rollbackDurationMs };
  }

  // Rule 2: Unhandled Exceptions > 10
  if (unhandledExceptions > CIRCUIT_BREAKER_THRESHOLDS.MAX_UNHANDLED_EXCEPTIONS) {
    const reason = `Unhandled exceptions count (${unhandledExceptions}) exceeded maximum limit (10)`;
    const trip = await tripCircuitBreaker(reason, {
      ...sample,
      errorRate5xx,
      unhandledExceptions,
      timestamp: new Date().toISOString(),
    });
    return { tripped: true, reason, rollbackDurationMs: trip.rollbackDurationMs };
  }

  // Rule 3: p99 Latency > 800ms for 2 consecutive minutes
  if (sample.p99LatencyMs > CIRCUIT_BREAKER_THRESHOLDS.MAX_P99_LATENCY_MS) {
    const newCount = current.consecutiveLatencyBreaches + 1;
    current.consecutiveLatencyBreaches = newCount;
    await saveCircuitBreakerState(current);

    if (newCount >= CIRCUIT_BREAKER_THRESHOLDS.CONSECUTIVE_LATENCY_BREACHES) {
      const reason = `p99 latency (${sample.p99LatencyMs}ms) exceeded 800ms for ${newCount} consecutive checks`;
      const trip = await tripCircuitBreaker(reason, {
        ...sample,
        errorRate5xx,
        unhandledExceptions,
        timestamp: new Date().toISOString(),
      });
      return { tripped: true, reason, rollbackDurationMs: trip.rollbackDurationMs };
    }
  } else {
    // Latency is healthy, reset consecutive breach counter
    if (current.consecutiveLatencyBreaches > 0) {
      current.consecutiveLatencyBreaches = 0;
      await saveCircuitBreakerState(current);
    }
  }

  return { tripped: false };
}

/**
 * Handle incoming Prometheus Alertmanager webhook payload.
 *
 * Payload schema:
 * {
 *   receiver: "canary-circuit-breaker",
 *   status: "firing" | "resolved",
 *   alerts: [
 *     {
 *       status: "firing",
 *       labels: { alertname: "CanaryHigh5xxRate" | "CanaryHighLatencyP99", severity: "critical" },
 *       annotations: { description: "..." }
 *     }
 *   ]
 * }
 */
export async function processPrometheusAlertWebhook(payload: {
  status?: string;
  alerts?: Array<{
    status?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  }>;
}): Promise<{ tripped: boolean; reason?: string; rollbackDurationMs?: number }> {
  if (!payload.alerts || !Array.isArray(payload.alerts)) {
    return { tripped: false, reason: "No alerts in payload" };
  }

  const firingAlerts = payload.alerts.filter((a) => a.status === "firing");
  if (firingAlerts.length === 0) {
    return { tripped: false, reason: "No firing alerts found" };
  }

  for (const alert of firingAlerts) {
    const alertname = alert.labels?.["alertname"] || "UnknownAlert";
    const desc = alert.annotations?.["description"] || alert.labels?.["severity"] || "Critical metric breached";
    const reason = `Prometheus alert '${alertname}' firing: ${desc}`;

    const trip = await tripCircuitBreaker(reason);
    return {
      tripped: true,
      reason,
      rollbackDurationMs: trip.rollbackDurationMs,
    };
  }

  return { tripped: false };
}
