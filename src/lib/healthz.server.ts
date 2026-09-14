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
export async function probeDatabase(timeoutMs = 3000): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Database probe timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    // Light-weight database query
    const checkPromise = supabaseAdmin.from("merchants").select("id").limit(1);

    const { error } = await Promise.race([checkPromise, timeoutPromise]);
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
  }
}

/** Probe Redis cache connectivity and ping round-trip. */
export async function probeRedis(timeoutMs = 2000): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const { redisCommand } = await import("./redis.server");
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Redis probe timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    const checkPromise = redisCommand(["PING"]);
    const res = (await Promise.race([checkPromise, timeoutPromise])) as unknown;
    const latencyMs = Date.now() - start;

    if (res === "PONG" || (typeof res === "string" && res.includes("PONG"))) {
      return { status: latencyMs > 300 ? "degraded" : "up", latencyMs };
    }

    return { status: "degraded", latencyMs, message: `Unexpected response: ${String(res)}` };
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
export async function checkHealth(mode: "liveness" | "readiness" = "readiness"): Promise<{
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
  const [dbCheck, redisCheck] = await Promise.all([probeDatabase(), probeRedis()]);

  const hasCriticalFailure =
    dbCheck.status === "down" || redisCheck.status === "down" || memory.status === "critical";
  const hasDegradation =
    dbCheck.status === "degraded" || redisCheck.status === "degraded" || memory.status === "warning";

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
