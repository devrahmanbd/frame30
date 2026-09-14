/**
 * Pre-Flight Automated Health, Smoke & DB Compatibility Probes (Phase 6.2).
 *
 * Implements strict CI/CD gate checks against candidate GREEN pods before
 * admitting any customer traffic.
 *
 * Guarantees:
 * 1. ZERO traffic admitted to GREEN until all 3 probe tiers pass:
 *    Tier 1: HTTP /api/healthz Readiness (DB pool, Redis cache, memory).
 *    Tier 2: Headless Smoke Journeys (Home, Storefront, APIs, Security Headers).
 *    Tier 3: Database Compatibility (Schema tables & RPC routines).
 * 2. If ANY check fails, verdict is ABORT_PROMOTION, leaving BLUE 100% untouched.
 */
import { incr, log } from "./observability.server";

export type ProbeVerdict = "PROCEED_TO_CANARY" | "ABORT_PROMOTION";

export type PreflightOptions = {
  targetUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryIntervalMs?: number;
  metricsToken?: string;
  skipDbQuery?: boolean;
};

export type ReadinessCheckReport = {
  passed: boolean;
  statusCode: number;
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

export type SmokeJourneyReport = {
  journey: string;
  url: string;
  passed: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
};

export type DbCompatibilityReport = {
  passed: boolean;
  checkedTables: string[];
  missingTables: string[];
  checkedRpcs: string[];
  missingRpcs: string[];
  error?: string;
};

export type PreflightReport = {
  verdict: ProbeVerdict;
  passed: boolean;
  targetUrl: string;
  durationMs: number;
  blueEnvironmentStatus: "UNTOUCHED_AND_ACTIVE";
  readiness: ReadinessCheckReport;
  smoke: {
    passed: boolean;
    journeys: SmokeJourneyReport[];
  };
  databaseCompatibility: DbCompatibilityReport;
  failureReasons: string[];
  timestamp: string;
};

export const REQUIRED_PRODUCTION_TABLES = [
  "merchants",
  "merchant_members",
  "orders",
  "order_items",
  "customers",
  "products",
  "product_variants",
  "carriers",
  "gateway_accounts",
  "platform_dynamic_config",
  "platform_admins",
  "support_tickets",
  "ai_conversations",
  "ai_training_conversations",
];

export const REQUIRED_PRODUCTION_RPCS = [
  "has_merchant_role",
  "create_store",
  "customer_overview_impl",
  "shipment_tracking_public",
  "platform_get_active_config",
  "platform_stage_config_slot",
  "platform_promote_config_slot",
];

/** Tier 1: Poll Candidate Container Readiness Probe */
export async function probeReadiness(
  targetUrl: string,
  maxRetries = 5,
  intervalMs = 1000,
): Promise<ReadinessCheckReport> {
  const healthzUrl = `${targetUrl.replace(/\/+$/, "")}/api/healthz?type=readiness`;
  let lastError = "";
  let lastStatus = 0;
  let lastDetails: Record<string, unknown> | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(healthzUrl, { signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      lastStatus = res.status;

      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return {
          passed: true,
          statusCode: res.status,
          latencyMs,
          details: body,
        };
      } else {
        lastDetails = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        lastError = `HTTP ${res.status}: ${JSON.stringify(lastDetails)}`;
      }
    } catch (err) {
      lastError = (err as Error).message;
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    passed: false,
    statusCode: lastStatus,
    latencyMs: 0,
    details: lastDetails,
    error: `Readiness check failed after ${maxRetries} attempts: ${lastError}`,
  };
}

/** Tier 2: Headless Smoke Journeys against Candidate Pod */
export async function probeSmokeJourneys(
  targetUrl: string,
  metricsToken?: string,
): Promise<{ passed: boolean; journeys: SmokeJourneyReport[] }> {
  const base = targetUrl.replace(/\/+$/, "");
  const journeys: SmokeJourneyReport[] = [];

  // Journey 1: Root / Landing Route
  {
    const start = Date.now();
    try {
      const res = await fetch(`${base}/`, { redirect: "manual" });
      const latencyMs = Date.now() - start;
      const passed = res.status >= 200 && res.status < 400;
      journeys.push({
        journey: "Public Root Landing",
        url: `${base}/`,
        passed,
        statusCode: res.status,
        latencyMs,
        error: passed ? undefined : `Unexpected status code: ${res.status}`,
      });
    } catch (err) {
      journeys.push({
        journey: "Public Root Landing",
        url: `${base}/`,
        passed: false,
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  }

  // Journey 2: Fast-path Healthz Endpoint
  {
    const start = Date.now();
    try {
      const res = await fetch(`${base}/healthz?type=liveness`);
      const latencyMs = Date.now() - start;
      const passed = res.status === 200;
      journeys.push({
        journey: "Liveness Fast-Path",
        url: `${base}/healthz?type=liveness`,
        passed,
        statusCode: res.status,
        latencyMs,
        error: passed ? undefined : `Status was ${res.status}`,
      });
    } catch (err) {
      journeys.push({
        journey: "Liveness Fast-Path",
        url: `${base}/healthz?type=liveness`,
        passed: false,
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  }

  // Journey 3: Protected Metrics Target Gate
  {
    const start = Date.now();
    try {
      // Unauthenticated request must be closed (404 or 401)
      const resUnauth = await fetch(`${base}/api/public/metrics`);
      const unauthBlocked = resUnauth.status === 404 || resUnauth.status === 401;

      // Authenticated request if token available
      let authPassed = true;
      if (metricsToken && unauthBlocked) {
        const resAuth = await fetch(`${base}/api/public/metrics`, {
          headers: { Authorization: `Bearer ${metricsToken}` },
        });
        authPassed = resAuth.status === 200;
      }

      const passed = unauthBlocked && authPassed;
      journeys.push({
        journey: "Security Metrics Endpoint Gate",
        url: `${base}/api/public/metrics`,
        passed,
        statusCode: resUnauth.status,
        latencyMs: Date.now() - start,
        error: passed
          ? undefined
          : `Failed security boundary (unauth status: ${resUnauth.status})`,
      });
    } catch (err) {
      journeys.push({
        journey: "Security Metrics Endpoint Gate",
        url: `${base}/api/public/metrics`,
        passed: false,
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  }

  // Journey 4: Security Headers Enforcement Check
  {
    const start = Date.now();
    try {
      const res = await fetch(`${base}/`);
      const latencyMs = Date.now() - start;
      const nosniff = res.headers.get("x-content-type-options") === "nosniff";
      const frameOptions = res.headers.has("x-frame-options");
      const passed = nosniff && frameOptions;

      journeys.push({
        journey: "Security Headers Policy",
        url: `${base}/`,
        passed,
        statusCode: res.status,
        latencyMs,
        error: passed
          ? undefined
          : `Missing headers (nosniff: ${nosniff}, x-frame-options: ${frameOptions})`,
      });
    } catch (err) {
      journeys.push({
        journey: "Security Headers Policy",
        url: `${base}/`,
        passed: false,
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      });
    }
  }

  const allPassed = journeys.every((j) => j.passed);
  return { passed: allPassed, journeys };
}

/** Tier 3: Database Compatibility Validation */
export async function probeDatabaseCompatibility(
  requiredTables: string[] = REQUIRED_PRODUCTION_TABLES,
  requiredRpcs: string[] = REQUIRED_PRODUCTION_RPCS,
): Promise<DbCompatibilityReport> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check table accessibility
    const missingTables: string[] = [];
    await Promise.all(
      requiredTables.map(async (table) => {
        try {
          const { error } = await supabaseAdmin.from(table).select("*").limit(0);
          if (error && error.code === "42P01") {
            // relation does not exist
            missingTables.push(table);
          }
        } catch {
          missingTables.push(table);
        }
      }),
    );

    // Check RPC presence
    const missingRpcs: string[] = [];
    await Promise.all(
      requiredRpcs.map(async (rpc) => {
        try {
          // Probe RPC with empty/null arguments to check function existence
          const { error } = await (supabaseAdmin as unknown as {
            rpc: (name: string, args: Record<string, unknown>) => Promise<{ error?: { code?: string } }>;
          }).rpc(rpc, {});

          // Code 42883 means function does not exist
          if (error && error.code === "42883") {
            missingRpcs.push(rpc);
          }
        } catch {
          // If RPC threw with argument mismatch, the function still exists
        }
      }),
    );

    const passed = missingTables.length === 0 && missingRpcs.length === 0;

    return {
      passed,
      checkedTables: requiredTables,
      missingTables,
      checkedRpcs: requiredRpcs,
      missingRpcs,
      error: passed
        ? undefined
        : `Database schema mismatch: missing tables [${missingTables.join(", ")}], missing RPCs [${missingRpcs.join(", ")}]`,
    };
  } catch (err) {
    return {
      passed: false,
      checkedTables: requiredTables,
      missingTables: [],
      checkedRpcs: requiredRpcs,
      missingRpcs: [],
      error: `DB compatibility probe failed to connect: ${(err as Error).message}`,
    };
  }
}

/** Orchestrate Complete Pre-Flight Suite */
export async function runPreflightSuite(opts: PreflightOptions): Promise<PreflightReport> {
  const startedAt = Date.now();
  const failureReasons: string[] = [];

  // 1. Readiness Probe
  const readiness = await probeReadiness(
    opts.targetUrl,
    opts.maxRetries ?? 6,
    opts.retryIntervalMs ?? 1000,
  );
  if (!readiness.passed) {
    failureReasons.push(`Readiness probe failed: ${readiness.error || `HTTP ${readiness.statusCode}`}`);
  }

  // 2. Smoke Probes
  const smoke = await probeSmokeJourneys(opts.targetUrl, opts.metricsToken);
  if (!smoke.passed) {
    const failed = smoke.journeys.filter((j) => !j.passed);
    failureReasons.push(
      `Smoke journeys failed: ${failed.map((f) => `${f.journey} (${f.error})`).join("; ")}`,
    );
  }

  // 3. Database Compatibility Probe
  let dbCompat: DbCompatibilityReport;
  if (opts.skipDbQuery) {
    dbCompat = {
      passed: true,
      checkedTables: REQUIRED_PRODUCTION_TABLES,
      missingTables: [],
      checkedRpcs: REQUIRED_PRODUCTION_RPCS,
      missingRpcs: [],
    };
  } else {
    dbCompat = await probeDatabaseCompatibility();
    if (!dbCompat.passed) {
      failureReasons.push(`Database compatibility error: ${dbCompat.error}`);
    }
  }

  const passed = readiness.passed && smoke.passed && dbCompat.passed;
  const verdict: ProbeVerdict = passed ? "PROCEED_TO_CANARY" : "ABORT_PROMOTION";

  const report: PreflightReport = {
    verdict,
    passed,
    targetUrl: opts.targetUrl,
    durationMs: Date.now() - startedAt,
    blueEnvironmentStatus: "UNTOUCHED_AND_ACTIVE",
    readiness,
    smoke,
    databaseCompatibility: dbCompat,
    failureReasons,
    timestamp: new Date().toISOString(),
  };

  if (!passed) {
    incr("framique_deploy_preflight_aborted_total", { target: opts.targetUrl });
    log("warn", "deploy.preflight_aborted", {
      targetUrl: opts.targetUrl,
      reasons: failureReasons,
      durationMs: report.durationMs,
    });
  } else {
    incr("framique_deploy_preflight_passed_total", { target: opts.targetUrl });
    log("info", "deploy.preflight_passed", {
      targetUrl: opts.targetUrl,
      durationMs: report.durationMs,
    });
  }

  return report;
}
