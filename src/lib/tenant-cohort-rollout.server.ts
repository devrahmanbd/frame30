/**
 * Phase 11.2 — Progressive Tenant Cohort Rollout Controller & Blast Radius Watchdog.
 *
 * Implements the Shopify/WordPress-grade progressive tenant cohort rollout architecture:
 *
 * 1. Strict 5-Ring Cohort Hierarchy:
 *    - Cohort 0: Internal Team & Dogfooding Stores (immediate validation, max 25 stores).
 *    - Cohort 1: 10 Beta Customers (partner merchants opted into early releases).
 *    - Cohort 2: 100 Early-Adopter Stores (representative cross-section of high volume).
 *    - Cohort 3: 1,000 Production Stores (scaled production soak).
 *    - Cohort 4: Global 10,000+ Stores (all merchants platform-wide).
 *
 * 2. Real-Time Blast Radius Watchdog:
 *    - Continuous per-tenant and per-cohort error budget and transaction health monitoring.
 *    - If Customer #17 or any single tenant in the active cohort discovers a fatal unhandled
 *      5xx error, courier booking failure (Steadfast, Pathao, RedX), or payment callback crash,
 *      the watchdog immediately trips the circuit breaker:
 *      - Halts rollout progression before touching downstream cohorts.
 *      - Automatically triggers instant rollback: active cohort tier reset to -1 / BLUE.
 *      - Captures full forensic diagnostics (tenant ID, transaction type, error details).
 *
 * 3. Edge Router Integration (OpenResty / Envoy / NGINX):
 *    - Inspects incoming tenant context headers or store slugs.
 *    - Generates dynamic routing maps and Lua upstream selection directives.
 */

import { incr, setGauge, log } from "./observability.server";
import { redisCommand, redisConfigured, redisKey } from "./redis.server";
import { type TopologySlot } from "./blue-green-router.server";
import {
  type CohortTier,
  COHORT_DEFINITIONS,
  getTenantCohort,
  setTenantCohort,
  setActiveCohortRolloutTier,
  getActiveCohortRolloutTier,
  extractTenantIdentifier,
} from "./tenant-canary.server";

export type RolloutStatus =
  | "idle"
  | "in_progress"
  | "soaking"
  | "halted"
  | "rolled_back"
  | "completed";

export type CohortRingConfig = {
  tier: CohortTier;
  name: string;
  maxStores: number;
  soakDurationMs: number;
  maxAllowedErrors: number; // Maximum allowable fatal errors across entire cohort
  maxSingleTenantErrors: number; // 0 = zero-tolerance for any single store
  requireCourierHealth: boolean; // Must verify courier booking success
  requirePaymentHealth: boolean; // Must verify checkout/payment callback success
};

export const COHORT_RING_CONFIGS: Record<CohortTier, CohortRingConfig> = {
  0: {
    tier: 0,
    name: "Cohort 0 (Internal / Dogfood)",
    maxStores: 25,
    soakDurationMs: 10 * 60 * 1000, // 10 minutes
    maxAllowedErrors: 0,
    maxSingleTenantErrors: 0,
    requireCourierHealth: true,
    requirePaymentHealth: true,
  },
  1: {
    tier: 1,
    name: "Cohort 1 (10 Beta Stores)",
    maxStores: 10,
    soakDurationMs: 15 * 60 * 1000, // 15 minutes
    maxAllowedErrors: 0, // Zero tolerance: any single customer failure trips rollback
    maxSingleTenantErrors: 0,
    requireCourierHealth: true,
    requirePaymentHealth: true,
  },
  2: {
    tier: 2,
    name: "Cohort 2 (100 Early-Adopters)",
    maxStores: 100,
    soakDurationMs: 30 * 60 * 1000, // 30 minutes
    maxAllowedErrors: 1, // Max 1 transient error before trip
    maxSingleTenantErrors: 0,
    requireCourierHealth: true,
    requirePaymentHealth: true,
  },
  3: {
    tier: 3,
    name: "Cohort 3 (1,000 Scaled Production Stores)",
    maxStores: 1000,
    soakDurationMs: 60 * 60 * 1000, // 60 minutes
    maxAllowedErrors: 5,
    maxSingleTenantErrors: 1,
    requireCourierHealth: true,
    requirePaymentHealth: true,
  },
  4: {
    tier: 4,
    name: "Cohort 4 (Global 10,000+ Stores)",
    maxStores: Number.POSITIVE_INFINITY,
    soakDurationMs: 120 * 60 * 1000, // 120 minutes full soak
    maxAllowedErrors: 20,
    maxSingleTenantErrors: 2,
    requireCourierHealth: true,
    requirePaymentHealth: true,
  },
};

export type CohortRolloutState = {
  active: boolean;
  currentTier: CohortTier | -1;
  status: RolloutStatus;
  candidateSlot: TopologySlot;
  primarySlot: TopologySlot;
  gitSha?: string;
  startedAt: string;
  tierStartedAt: string;
  soakExpiresAt: string;
  isSoakComplete: boolean;
  haltReason?: string;
  failedTenantId?: string;
  failureDetails?: Record<string, unknown>;
  updatedAt: string;
};

export type TenantTelemetryEvent = {
  tenantId: string;
  cohortTier: CohortTier;
  slot: TopologySlot;
  statusCode: number;
  isUnhandled5xx?: boolean;
  isFatalTransactionFailure?: boolean; // e.g. Courier API booking failed, payment gateway callback crash
  transactionType?: "checkout" | "payment_callback" | "courier_booking" | "order_mutation" | "page_render";
  latencyMs: number;
  errorMessage?: string;
  timestamp?: string;
};

export type CohortHealthReport = {
  tier: CohortTier;
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  courierFailures: number;
  paymentFailures: number;
  tenantsWithErrors: string[];
  isHealthy: boolean;
  violations: string[];
};

const COHORT_STATE_KEY = "canary:cohort_rollout:state";
const COHORT_METRICS_KEY_PREFIX = "canary:cohort_rollout:metrics";
const TENANT_ERRORS_KEY_PREFIX = "canary:cohort_rollout:tenant_errors";

// In-memory fallback state for testing and offline resilience
let localRolloutState: CohortRolloutState = {
  active: false,
  currentTier: -1,
  status: "idle",
  candidateSlot: "green",
  primarySlot: "blue",
  startedAt: new Date().toISOString(),
  tierStartedAt: new Date().toISOString(),
  soakExpiresAt: new Date().toISOString(),
  isSoakComplete: false,
  updatedAt: new Date().toISOString(),
};

// In-memory telemetry cache
const localTenantErrors = new Map<string, { count: number; recentErrors: TenantTelemetryEvent[] }>();
const localCohortMetrics = new Map<CohortTier, {
  total: number;
  errors: number;
  courierFailures: number;
  paymentFailures: number;
  tenants: Set<string>;
}>();

function getOrCreateCohortMetrics(tier: CohortTier) {
  let m = localCohortMetrics.get(tier);
  if (!m) {
    m = { total: 0, errors: 0, courierFailures: 0, paymentFailures: 0, tenants: new Set<string>() };
    localCohortMetrics.set(tier, m);
  }
  return m;
}

/**
 * Get current progressive cohort rollout state.
 */
export async function getCohortRolloutState(): Promise<CohortRolloutState> {
  if (redisConfigured()) {
    try {
      const res = await redisCommand(["GET", redisKey("platform", COHORT_STATE_KEY)]);
      if (res.ok && typeof res.value === "string") {
        const parsed = JSON.parse(res.value) as CohortRolloutState;
        localRolloutState = parsed;
        return parsed;
      }
    } catch (err) {
      log("warn", "cohort_rollout.state_read_fallback", { error: String(err) });
    }
  }

  // Check soak expiration on read
  if (localRolloutState.status === "soaking" || localRolloutState.status === "in_progress") {
    const now = Date.now();
    const expires = new Date(localRolloutState.soakExpiresAt).getTime();
    localRolloutState.isSoakComplete = now >= expires;
  }

  return { ...localRolloutState };
}

/**
 * Persist progressive cohort rollout state.
 */
export async function saveCohortRolloutState(state: CohortRolloutState): Promise<boolean> {
  state.updatedAt = new Date().toISOString();
  localRolloutState = { ...state };

  if (redisConfigured()) {
    try {
      const res = await redisCommand([
        "SET",
        redisKey("platform", COHORT_STATE_KEY),
        JSON.stringify(state),
      ]);
      return res.ok;
    } catch (err) {
      log("error", "cohort_rollout.state_write_failed", { error: String(err) });
      return false;
    }
  }

  return true;
}

/**
 * Initialize and start a progressive cohort rollout sequence.
 * Begins at Cohort 0 (Internal / Dogfood).
 */
export async function startCohortRollout(options: {
  gitSha?: string;
  candidateSlot?: TopologySlot;
  primarySlot?: TopologySlot;
  initialTier?: CohortTier;
} = {}): Promise<CohortRolloutState> {
  const candidateSlot = options.candidateSlot ?? "green";
  const primarySlot = options.primarySlot ?? "blue";
  const initialTier = options.initialTier ?? 0;
  const config = COHORT_RING_CONFIGS[initialTier];

  const now = new Date();
  const soakExpiresAt = new Date(now.getTime() + config.soakDurationMs);

  // Clear metric caches for a clean run
  localTenantErrors.clear();
  localCohortMetrics.clear();

  const state: CohortRolloutState = {
    active: true,
    currentTier: initialTier,
    status: "soaking",
    candidateSlot,
    primarySlot,
    gitSha: options.gitSha,
    startedAt: now.toISOString(),
    tierStartedAt: now.toISOString(),
    soakExpiresAt: soakExpiresAt.toISOString(),
    isSoakComplete: config.soakDurationMs === 0,
    updatedAt: now.toISOString(),
  };

  // Sync with active rollout tier in tenant canary router
  await setActiveCohortRolloutTier(initialTier);
  await saveCohortRolloutState(state);

  incr("framique_cohort_rollout_started_total", { tier: String(initialTier) });
  setGauge("framique_cohort_rollout_active_tier", initialTier);

  log("info", "cohort_rollout.started", {
    tier: initialTier,
    name: config.name,
    candidateSlot,
    soakExpiresAt: state.soakExpiresAt,
  });

  return state;
}

/**
 * Real-Time Blast Radius Watchdog: Ingest request/transaction telemetry.
 *
 * Evaluates whether an unhandled failure on any single tenant in the active
 * cohort breaches the containment threshold. If Customer #17 or any store
 * triggers a critical fault, the watchdog IMMEDIATELY halts and initiates rollback.
 */
export async function recordTenantTelemetry(
  event: TenantTelemetryEvent
): Promise<{ watchdogTripped: boolean; tripReason?: string }> {
  const state = await getCohortRolloutState();

  // If no rollout is active or already halted/rolled back, skip watchdog
  if (!state.active || state.status === "halted" || state.status === "rolled_back") {
    return { watchdogTripped: false };
  }

  // Only evaluate telemetry for requests served by the candidate slot
  if (event.slot !== state.candidateSlot) {
    return { watchdogTripped: false };
  }

  // Update cohort metrics
  const cohortMetrics = getOrCreateCohortMetrics(event.cohortTier);
  cohortMetrics.total += 1;
  cohortMetrics.tenants.add(event.tenantId);

  const is5xx = event.statusCode >= 500 || event.isUnhandled5xx === true;
  const isFatal = event.isFatalTransactionFailure === true;

  if (is5xx || isFatal) {
    cohortMetrics.errors += 1;
    if (event.transactionType === "courier_booking") cohortMetrics.courierFailures += 1;
    if (event.transactionType === "payment_callback") cohortMetrics.paymentFailures += 1;

    // Track per-tenant error history
    let tenantRecord = localTenantErrors.get(event.tenantId);
    if (!tenantRecord) {
      tenantRecord = { count: 0, recentErrors: [] };
      localTenantErrors.set(event.tenantId, tenantRecord);
    }
    tenantRecord.count += 1;
    tenantRecord.recentErrors.push(event);

    // Save to Redis if configured
    if (redisConfigured()) {
      try {
        await redisCommand([
          "INCR",
          redisKey("platform", `${TENANT_ERRORS_KEY_PREFIX}:${event.tenantId}`),
        ]);
        await redisCommand([
          "INCR",
          redisKey("platform", `${COHORT_METRICS_KEY_PREFIX}:${event.cohortTier}:errors`),
        ]);
      } catch {
        // Non-blocking telemetry
      }
    }

    // Evaluate Real-Time Blast Radius Watchdog Rules
    const ringConfig = COHORT_RING_CONFIGS[event.cohortTier];

    // Rule 1: Single-Tenant Fatal Transaction Violation (Zero-Tolerance)
    // If a tenant discovers a courier booking failure or fatal payment crash:
    if (isFatal) {
      const tripReason = `CRITICAL FAULT: Single tenant '${event.tenantId}' in ${ringConfig.name} encountered fatal ${event.transactionType || "transaction"} failure: ${event.errorMessage || "Unhandled exception"}`;
      await tripBlastRadiusWatchdog(tripReason, event.tenantId, event);
      return { watchdogTripped: true, tripReason };
    }

    // Rule 2: Single-Tenant Unhandled 5xx Error Threshold
    if (tenantRecord.count > ringConfig.maxSingleTenantErrors) {
      const tripReason = `BLAST RADIUS BREACH: Single tenant '${event.tenantId}' in ${ringConfig.name} exceeded maximum allowable errors (${tenantRecord.count} > ${ringConfig.maxSingleTenantErrors}). Error: ${event.errorMessage || "HTTP " + event.statusCode}`;
      await tripBlastRadiusWatchdog(tripReason, event.tenantId, event);
      return { watchdogTripped: true, tripReason };
    }

    // Rule 3: Cohort Aggregate Error Budget Breach
    if (cohortMetrics.errors > ringConfig.maxAllowedErrors) {
      const tripReason = `COHORT ERROR BUDGET EXCEEDED: ${ringConfig.name} accumulated ${cohortMetrics.errors} errors (budget: ${ringConfig.maxAllowedErrors}). Halting rollout.`;
      await tripBlastRadiusWatchdog(tripReason, event.tenantId, event);
      return { watchdogTripped: true, tripReason };
    }
  }

  return { watchdogTripped: false };
}

/**
 * Trip the Blast Radius Watchdog: Immediate Circuit Breaker & Reversion to BLUE.
 */
export async function tripBlastRadiusWatchdog(
  reason: string,
  failedTenantId: string,
  details: Record<string, unknown>
): Promise<CohortRolloutState> {
  incr("framique_blast_radius_watchdog_tripped_total", { failedTenant: failedTenantId });

  log("error", "blast_radius_watchdog.TRIPPED", {
    reason,
    failedTenantId,
    details,
  });

  // Execute Instant Rollback: Repoint active cohort rollout tier to -1 (All traffic to BLUE)
  await setActiveCohortRolloutTier(-1);

  const state = await getCohortRolloutState();
  state.active = false;
  state.status = "halted";
  state.haltReason = reason;
  state.failedTenantId = failedTenantId;
  state.failureDetails = details;
  state.updatedAt = new Date().toISOString();

  await saveCohortRolloutState(state);

  log("warn", "cohort_rollout.instant_rollback_executed", {
    previousTier: state.currentTier,
    activeTierNow: -1,
    revertedSlot: state.primarySlot,
  });

  return state;
}

/**
 * Evaluate health of the active cohort tier.
 */
export async function evaluateCohortHealth(tier: CohortTier): Promise<CohortHealthReport> {
  const metrics = getOrCreateCohortMetrics(tier);
  const ringConfig = COHORT_RING_CONFIGS[tier];

  const total = metrics.total;
  const errors = metrics.errors;
  const errorRate = total > 0 ? errors / total : 0;
  const courierFailures = metrics.courierFailures;
  const paymentFailures = metrics.paymentFailures;

  const tenantsWithErrors: string[] = [];
  for (const [tenantId, rec] of localTenantErrors.entries()) {
    if (rec.count > 0) tenantsWithErrors.push(tenantId);
  }

  const violations: string[] = [];

  if (errors > ringConfig.maxAllowedErrors) {
    violations.push(`Total errors (${errors}) exceeded allowable budget (${ringConfig.maxAllowedErrors})`);
  }

  if (ringConfig.requireCourierHealth && courierFailures > 0) {
    violations.push(`Courier health failed: ${courierFailures} booking failures detected`);
  }

  if (ringConfig.requirePaymentHealth && paymentFailures > 0) {
    violations.push(`Payment health failed: ${paymentFailures} checkout/callback failures detected`);
  }

  const isHealthy = violations.length === 0;

  return {
    tier,
    totalRequests: total,
    errorCount: errors,
    errorRate,
    courierFailures,
    paymentFailures,
    tenantsWithErrors,
    isHealthy,
    violations,
  };
}

/**
 * Advance the rollout to the next progressive cohort ring (0 -> 1 -> 2 -> 3 -> 4 -> Completed).
 *
 * Enforces:
 * 1. Blast Radius Watchdog is untripped.
 * 2. Soak timer for the current ring has completed.
 * 3. Cohort health report has zero violations.
 */
export async function advanceCohortRollout(options: { force?: boolean } = {}): Promise<{
  success: boolean;
  state: CohortRolloutState;
  reason?: string;
}> {
  const state = await getCohortRolloutState();

  if (state.status === "halted" || state.status === "rolled_back") {
    return { success: false, state, reason: `Cannot advance: Rollout is halted due to: ${state.haltReason}` };
  }

  if (!state.active) {
    return { success: false, state, reason: `Cannot advance: Rollout is not active (status: ${state.status})` };
  }

  const currentTier = state.currentTier as CohortTier;

  // Verify Soak Duration
  const now = Date.now();
  const soakExpires = new Date(state.soakExpiresAt).getTime();
  const soakComplete = now >= soakExpires;

  if (!soakComplete && !options.force) {
    const remainingSec = Math.ceil((soakExpires - now) / 1000);
    return {
      success: false,
      state,
      reason: `Soak time for ${COHORT_RING_CONFIGS[currentTier].name} still active (${remainingSec}s remaining). Use { force: true } to override.`,
    };
  }

  // Verify Cohort Health
  const health = await evaluateCohortHealth(currentTier);
  if (!health.isHealthy && !options.force) {
    const reason = `Health check failed for ${COHORT_RING_CONFIGS[currentTier].name}: ${health.violations.join("; ")}`;
    await tripBlastRadiusWatchdog(reason, "cohort_health_failure", { violations: health.violations });
    return { success: false, state: await getCohortRolloutState(), reason };
  }

  // Final Cohort Check: If current was Cohort 4, mark completed
  if (currentTier >= 4) {
    state.status = "completed";
    state.active = true;
    state.isSoakComplete = true;
    state.updatedAt = new Date().toISOString();
    await saveCohortRolloutState(state);

    incr("framique_cohort_rollout_completed_total");
    log("info", "cohort_rollout.completed", { gitSha: state.gitSha });

    return { success: true, state };
  }

  // Advance to next tier
  const nextTier = (currentTier + 1) as CohortTier;
  const nextConfig = COHORT_RING_CONFIGS[nextTier];
  const nextSoakExpiresAt = new Date(Date.now() + nextConfig.soakDurationMs);

  state.currentTier = nextTier;
  state.status = "soaking";
  state.tierStartedAt = new Date().toISOString();
  state.soakExpiresAt = nextSoakExpiresAt.toISOString();
  state.isSoakComplete = nextConfig.soakDurationMs === 0;
  state.updatedAt = new Date().toISOString();

  await setActiveCohortRolloutTier(nextTier);
  await saveCohortRolloutState(state);

  incr("framique_cohort_rollout_advanced_total", { nextTier: String(nextTier) });
  setGauge("framique_cohort_rollout_active_tier", nextTier);

  log("info", "cohort_rollout.advanced", {
    fromTier: currentTier,
    toTier: nextTier,
    name: nextConfig.name,
    soakExpiresAt: state.soakExpiresAt,
  });

  return { success: true, state };
}

/**
 * Manual emergency abort / rollback of cohort rollout.
 */
export async function abortCohortRollout(reason: string): Promise<CohortRolloutState> {
  await setActiveCohortRolloutTier(-1);

  const state = await getCohortRolloutState();
  state.active = false;
  state.status = "rolled_back";
  state.haltReason = reason;
  state.updatedAt = new Date().toISOString();

  await saveCohortRolloutState(state);

  incr("framique_cohort_rollout_aborted_total");
  log("warn", "cohort_rollout.manually_aborted", { reason });

  return state;
}

/**
 * Generate OpenResty / NGINX dynamic Lua cohort resolution snippet.
 * This snippet executes in `access_by_lua_block` to dynamically map requests to
 * the candidate GREEN or primary BLUE cluster by reading the active cohort tier in Redis.
 */
export function generateOpenRestyCohortLuaBlock(): string {
  return `-- Framique Progressive Tenant Cohort Dynamic Lua Router
local redis = require "resty.redis"
local red = redis:new()
red:set_timeout(500) -- 500ms max timeout

local ok, err = red:connect(os.getenv("REDIS_HOST") or "127.0.0.1", tonumber(os.getenv("REDIS_PORT") or 6379))
if not ok then
    ngx.log(ngx.WARN, "Redis connect failed for cohort routing: ", err)
    ngx.var.selected_backend = "framique_target_blue"
    return
end

local active_tier_raw, err = red:get("platform:canary:active_cohort_tier")
local active_tier = tonumber(active_tier_raw) or -1

if active_tier < 0 then
    ngx.var.selected_backend = "framique_target_blue"
    return
end

-- Extract tenant identifier from headers or cookie
local tenant_id = ngx.req.get_headers()["x-merchant-id"] or ngx.req.get_headers()["x-store-slug"]
if not tenant_id then
    local cookie_tenant = ngx.var.cookie_framique_tenant_id
    if cookie_tenant then tenant_id = cookie_tenant end
end

if not tenant_id then
    ngx.var.selected_backend = "framique_target_blue"
    return
end

-- Lookup merchant cohort tier
local cohort_raw, err = red:hget("platform:tenant:cohorts", string.lower(tenant_id))
local cohort_tier = tonumber(cohort_raw)

if not cohort_tier then
    -- Fallback consistent hash: hash(tenant_id) % 100
    local hash = ngx.crc32_short(tenant_id) % 100
    if hash < 10 then cohort_tier = 2
    elseif hash < 40 then cohort_tier = 3
    else cohort_tier = 4 end
end

ngx.req.set_header("X-Framique-Cohort-Tier", tostring(cohort_tier))

if cohort_tier <= active_tier then
    ngx.req.set_header("X-Framique-Target-Slot", "green")
    ngx.var.selected_backend = "framique_target_green"
else
    ngx.req.set_header("X-Framique-Target-Slot", "blue")
    ngx.var.selected_backend = "framique_target_blue"
end
`;
}
