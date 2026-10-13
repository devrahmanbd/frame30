/**
 * Production Readiness & Liveness Probe Engine (Phase 6.2).
 *
 * Implements standard container orchestrator probe contracts:
 * - Liveness (/api/healthz?type=liveness): Verifies event loop responsiveness.
 * - Readiness (/api/healthz?type=readiness): Performs live dependency probes
 *   against PostgreSQL database pool and Redis cache before admitting traffic.
 */
import { incr, log } from "./observability.server";

export type DependencyStatus = "up" | "down" | "degraded" | "skipped";

export type DependencyCheck = {
  status: DependencyStatus;
  latencyMs: number;
  message?: string;
};

export type HealthzResult = {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  gitSha: string;
  uptimeSeconds: number;
  environment: string;
  timestamp: string;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    memory: {
      status: "ok" | "warning" | "critical";
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
    };
  };
};

/** Probe PostgreSQL database connectivity and query responsiveness. */
export async function probeDatabase(
  timeoutMs = 3000,
): Promise<DependencyCheck> {
  const start = Date.now();
  // AbortController owns the deadline: the signal aborts the query in flight
  // (no fire-and-forget loser), the timer is unref'd so an idle isolate never
  // waits on a probe, and it is always cleared before return.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    timer = setTimeout(() => controller.abort(), timeoutMs);
    (timer as unknown as { unref?: () => void }).unref?.();

    // Light-weight database query. An aborted query resolves (not rejects)
    // with an AbortError payload, which the error branch below reports.
    const { error } = await supabaseAdmin
      .from("merchants")
      .select("id")
      .limit(1)
      .abortSignal(controller.signal);
    const latencyMs = Date.now() - start;

    if (error) {
      return { status: "down", latencyMs, message: error.message };
    }

    return { status: latencyMs > 800 ? "degraded" : "up", latencyMs };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      message: (err as Error).message,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Probe Redis cache connectivity and ping round-trip. */
export async function probeRedis(timeoutMs = 2000): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const { redisCommand, redisConfigured } = await import("./redis.server");
    // Redis is an accelerator, never a correctness dependency: unconfigured
    // means skipped, not failed.
    if (!redisConfigured()) {
      return { status: "skipped", latencyMs: 0 };
    }

    // The shared client already bounds the command — no second race here, so
    // there is no loser to leak. The result is a status object, never a bare
    // string: only ok+PONG counts as reachable.
    const res = await redisCommand(["PING"], { timeoutMs });
    const latencyMs = Date.now() - start;

    if (res.ok && res.value === "PONG") {
      return { status: latencyMs > 300 ? "degraded" : "up", latencyMs };
    }

    return {
      status: "degraded",
      latencyMs,
      message: `Unexpected response: ${res.ok ? String(res.value) : res.outcome}`,
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      message: (err as Error).message,
    };
  }
}

/** Evaluate current process memory health. */
export function checkMemoryHealth(): HealthzResult["checks"]["memory"] {
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));
  const heapTotalMb = Math.round(mem.heapTotal / (1024 * 1024));
  const rssMb = Math.round(mem.rss / (1024 * 1024));

  // If heap usage exceeds 90% of heap total and exceeds 1GB
  const isCritical = heapUsedMb > 1024 && heapUsedMb / heapTotalMb > 0.95;
  const isWarning = heapUsedMb > 768 && heapUsedMb / heapTotalMb > 0.85;

  return {
    status: isCritical ? "critical" : isWarning ? "warning" : "ok",
    heapUsedMb,
    heapTotalMb,
    rssMb,
  };
}

/**
 * Full health & readiness evaluation.
 * In 'liveness' mode, skips external dependencies to confirm node process is alive.
 * In 'readiness' mode, enforces DB & Redis availability.
 */
export async function checkHealth(
  mode: "liveness" | "readiness" = "readiness",
): Promise<{
  statusCode: number;
  result: HealthzResult;
}> {
  const gitSha = process.env["GIT_SHA"] || "development";
  const version = process.env["VERSION"] || "1.0.0";
  const uptimeSeconds = Math.round(process.uptime());
  const environment = process.env["NODE_ENV"] || "development";
  const memory = checkMemoryHealth();

  if (mode === "liveness") {
    return {
      statusCode: memory.status === "critical" ? 503 : 200,
      result: {
        status: memory.status === "critical" ? "unhealthy" : "healthy",
        version,
        gitSha,
        uptimeSeconds,
        environment,
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: "skipped", latencyMs: 0 },
          redis: { status: "skipped", latencyMs: 0 },
          memory,
        },
      },
    };
  }

  // Readiness Mode: Probe DB and Redis concurrently
  const [dbCheck, redisCheck] = await Promise.all([
    probeDatabase(),
    probeRedis(),
  ]);

  const hasCriticalFailure =
    dbCheck.status === "down" ||
    redisCheck.status === "down" ||
    memory.status === "critical";
  const hasDegradation =
    dbCheck.status === "degraded" ||
    redisCheck.status === "degraded" ||
    memory.status === "warning";

  const status: HealthzResult["status"] = hasCriticalFailure
    ? "unhealthy"
    : hasDegradation
      ? "degraded"
      : "healthy";

  const statusCode = hasCriticalFailure ? 503 : 200;

  if (statusCode === 503) {
    incr("framique_healthz_failures_total", {
      db: dbCheck.status,
      redis: redisCheck.status,
      memory: memory.status,
    });
    log("warn", "healthz.readiness_failed", {
      dbCheck,
      redisCheck,
      memory,
    });
  }

  return {
    statusCode,
    result: {
      status,
      version,
      gitSha,
      uptimeSeconds,
      environment,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck,
        redis: redisCheck,
        memory,
      },
    },
  };
}
