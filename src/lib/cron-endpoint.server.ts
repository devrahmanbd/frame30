/**
 * Scheduled endpoint wrapper (§9.3).
 *
 * Every cron route delegates its POST handler here so that all sixteen jobs get
 * identical operational behaviour instead of sixteen slightly different
 * try/catch blocks:
 *
 *   1. **Authorisation** — constant-time bearer compare via `authorizeCron`.
 *   2. **Registry check** — an endpoint with no registry entry refuses to run,
 *      because an unowned schedule is how jobs rot unnoticed.
 *   3. **Lease** — `ops_cron_claim` takes a database lease, so two schedulers
 *      (or a retrying scheduler) cannot run the same job concurrently. A locked
 *      job answers 409 and is ledgered as a skip, not an error.
 *   4. **Timeout** — the handler races the job's own wall-clock budget so the
 *      platform never has to kill the request; a timeout is recorded as such.
 *   5. **Ledger** — `ops_cron_finish` writes duration, outcome, error code and
 *      result counters, and maintains the consecutive-failure streak.
 *   6. **Alerting** — once the streak crosses the job's threshold, the alert
 *      router is asked to page, with dedupe and cooldown applied there.
 *   7. **Metrics and logs** — counter per outcome, duration histogram, one
 *      structured log line, Sentry only for genuine faults.
 *
 * Response bodies never contain provider internals; the run id is returned in a
 * header so an operator can join a scheduler log line to the ledger row.
 */
import { cronJob, nextRunAfter, type CronJobDefinition } from "./cron-registry";
import { captureError, incr, log, observe, withSpan } from "./observability.server";

export type CronRunContext = {
  request: Request;
  url: URL;
  job: CronJobDefinition;
  runId: string | null;
  attempt: number;
  /** Milliseconds left before the wrapper declares a timeout. */
  remainingMs: () => number;
  /** Numeric query param with a default and a clamp — jobs take limits, not vibes. */
  num: (name: string, fallback: number, max?: number) => number;
};

/** Thrown by a job that decided not to work this tick. Recorded, never paged. */
export class CronSkip extends Error {
  constructor(
    public reason: string,
    public retryAfterSeconds = 0,
  ) {
    super(`skipped:${reason}`);
    this.name = "CronSkip";
  }
}

type FinishStatus = "ok" | "failed" | "timeout" | "skipped";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

async function claim(key: string, token: string, trigger: string, leaseSeconds: number) {
  try {
    const a = await admin();
    const { data, error } = await a.rpc("ops_cron_claim", {
      _key: key,
      _token: token,
      _trigger: trigger,
      _lease_seconds: leaseSeconds,
    });
    if (error) {
      // A ledger outage must not stop the platform's heartbeat: run unledgered
      // and shout about it, because a silent job is worse than an unrecorded one.
      log("error", "cron.claim_failed", { job: key, message: error.message });
      return { ok: true as const, runId: null, attempt: 1, unledgered: true as const };
    }
    const row = (data ?? {}) as { ok?: boolean; reason?: string; run_id?: string; attempt?: number };
    if (!row.ok) return { ok: false as const, reason: row.reason ?? "unavailable" };
    return {
      ok: true as const,
      runId: row.run_id ?? null,
      attempt: Number(row.attempt ?? 1),
      unledgered: false as const,
    };
  } catch (err) {
    log("error", "cron.claim_threw", { job: key, message: (err as Error)?.message });
    return { ok: true as const, runId: null, attempt: 1, unledgered: true as const };
  }
}

async function finish(
  job: CronJobDefinition,
  runId: string | null,
  token: string,
  status: FinishStatus,
  detail: {
    httpStatus?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    stats?: Record<string, unknown>;
  },
): Promise<{ consecutiveFailures: number }> {
  if (!runId) return { consecutiveFailures: 0 };
  try {
    const a = await admin();
    const next = nextRunAfter(job.schedule, new Date());
    const { data, error } = await a.rpc("ops_cron_finish", {
      _run_id: runId,
      _token: token,
      _status: status,
      _http_status: detail.httpStatus ?? null,
      _error_code: detail.errorCode ?? null,
      _error_message: detail.errorMessage ?? null,
      _stats: detail.stats ?? {},
      _next_run_at: next ? next.toISOString() : null,
    });
    if (error) {
      log("error", "cron.finish_failed", { job: job.key, message: error.message });
      return { consecutiveFailures: 0 };
    }
    const row = (data ?? {}) as { consecutive_failures?: number };
    return { consecutiveFailures: Number(row.consecutive_failures ?? 0) };
  } catch (err) {
    log("error", "cron.finish_threw", { job: job.key, message: (err as Error)?.message });
    return { consecutiveFailures: 0 };
  }
}

/**
 * Raises a page when the streak reached the job's tolerance. Threshold checks
 * live here (not in the router) so a job that recovers on its next tick never
 * pages, and a job that keeps failing pages exactly once per cooldown.
 */
async function maybeAlert(
  job: CronJobDefinition,
  streak: number,
  status: FinishStatus,
  errorMessage: string | null,
) {
  if (status !== "failed" && status !== "timeout") return;
  if (streak < job.alertAfterFailures) return;
  try {
    const { emitAlert } = await import("./ops-alerts.server");
    await emitAlert({
      severity: job.severity,
      title: `[${job.severity}] cron ${job.key} failed ${streak}x`,
      body: [
        `${job.label} — ${job.description}`,
        `Schedule: ${job.schedule} UTC`,
        `Outcome: ${status}`,
        `Consecutive failures: ${streak} (threshold ${job.alertAfterFailures})`,
        `Detail: ${errorMessage ?? "no detail recorded"}`,
      ].join("\n"),
      source: `cron.${job.key}`,
      dedupeKey: `cron:${job.key}:failing`,
      payload: { job: job.key, streak, status },
    });
  } catch (err) {
    // Alerting is best-effort by construction; the ledger row is the record.
    log("error", "cron.alert_failed", { job: job.key, message: (err as Error)?.message });
  }
}

const methodNotAllowed = () =>
  new Response("Method not allowed", {
    status: 405,
    headers: { allow: "POST", "cache-control": "no-store" },
  });

/** Shared GET handler: scheduled endpoints are POST-only, and say so. */
export const cronGet = async () => methodNotAllowed();

/**
 * Wraps a job body into a fully instrumented POST handler.
 *
 * The body returns whatever JSON the operator should see. Throw `CronSkip` to
 * record a deliberate no-op, `RateLimitError` to record a throttle, anything
 * else to record a failure.
 */
export function cronPost<T>(
  key: string,
  work: (ctx: CronRunContext) => Promise<T>,
): (args: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    const job = cronJob(key);
    if (!job) {
      // Fail closed: a handler without a registry entry has no owner, no
      // schedule and no alerting policy, so it must not be reachable.
      log("error", "cron.unregistered", { job: key });
      return Response.json({ error: "job_not_registered" }, { status: 500 });
    }

    const { authorizeCron } = await import("./cron-auth.server");
    const gate = await authorizeCron(request, key);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const trigger = url.searchParams.get("trigger") === "manual" ? "manual" : "schedule";
    const token = crypto.randomUUID();
    const leaseSeconds = Math.ceil(job.timeoutMs / 1000) + 60;

    const lease = await claim(key, token, trigger, leaseSeconds);
    if (!lease.ok) {
      const locked = lease.reason === "locked";
      incr("framique_cron_runs_total", { job: key, outcome: locked ? "locked" : lease.reason });
      log("warn", "cron.not_claimed", { job: key, reason: lease.reason });
      return Response.json(
        { skipped: true, reason: lease.reason },
        {
          status: locked ? 409 : 503,
          headers: { "cache-control": "no-store", "retry-after": String(Math.min(job.timeoutMs / 1000, 300)) },
        },
      );
    }

    const startedAt = Date.now();
    const deadline = startedAt + job.timeoutMs;
    const ctx: CronRunContext = {
      request,
      url,
      job,
      runId: lease.runId,
      attempt: lease.attempt,
      remainingMs: () => Math.max(0, deadline - Date.now()),
      num: (name, fallback, max) => {
        const raw = Number(url.searchParams.get(name));
        const value = Number.isFinite(raw) && raw > 0 ? raw : fallback;
        return max ? Math.min(value, max) : value;
      },
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload = await withSpan(
        `cron.${key}`,
        () =>
          Promise.race([
            work(ctx),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`cron timeout after ${job.timeoutMs}ms`)),
                job.timeoutMs,
              );
            }),
          ]),
        { job: key },
      );
      const durationMs = Date.now() - startedAt;
      const slow = durationMs > job.slaMaxDurationMs;
      const { consecutiveFailures } = await finish(job, lease.runId, token, "ok", {
        httpStatus: 200,
        stats: {
          duration_ms: durationMs,
          slow,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? summarise(payload as Record<string, unknown>)
            : {}),
        },
      });
      void consecutiveFailures;
      observe("framique_cron_duration_ms", durationMs, { job: key });
      incr("framique_cron_runs_total", { job: key, outcome: slow ? "slow" : "ok" });
      log("info", "cron.completed", { job: key, durationMs, slow, trigger });
      return Response.json(
        { ok: true, job: key, durationMs, slow, result: payload },
        {
          headers: {
            "cache-control": "no-store",
            ...(lease.runId ? { "x-cron-run-id": lease.runId } : {}),
          },
        },
      );
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      observe("framique_cron_duration_ms", durationMs, { job: key });

      // Deliberate no-op.
      if (err instanceof CronSkip) {
        await finish(job, lease.runId, token, "skipped", {
          httpStatus: 200,
          errorCode: err.reason,
          stats: { duration_ms: durationMs, reason: err.reason },
        });
        incr("framique_cron_runs_total", { job: key, outcome: "skipped" });
        log("info", "cron.skipped", { job: key, reason: err.reason });
        return Response.json(
          { skipped: true, reason: err.reason },
          {
            status: 200,
            headers: {
              "cache-control": "no-store",
              ...(err.retryAfterSeconds ? { "retry-after": String(err.retryAfterSeconds) } : {}),
            },
          },
        );
      }

      // Throttled by our own bucket: the scheduler is early, not broken.
      const { RateLimitError } = await import("./rate-limit.server");
      if (err instanceof RateLimitError) {
        await finish(job, lease.runId, token, "skipped", {
          httpStatus: 429,
          errorCode: "rate_limited",
          stats: { duration_ms: durationMs },
        });
        incr("framique_cron_runs_total", { job: key, outcome: "rate_limited" });
        log("warn", "cron.rate_limited", { job: key });
        return Response.json(
          { skipped: true, reason: "rate_limited" },
          { status: 429, headers: { "cache-control": "no-store", "retry-after": "600" } },
        );
      }

      const message = String((err as Error)?.message ?? err).slice(0, 500);
      const timedOut = message.includes("cron timeout after");
      const status: FinishStatus = timedOut ? "timeout" : "failed";
      const { consecutiveFailures } = await finish(job, lease.runId, token, status, {
        httpStatus: timedOut ? 504 : 500,
        errorCode: timedOut ? "timeout" : ((err as { code?: string })?.code ?? "exception"),
        errorMessage: message,
        stats: { duration_ms: durationMs },
      });
      incr("framique_cron_runs_total", { job: key, outcome: status });
      log("error", "cron.failed", { job: key, status, durationMs, message, trigger });
      void captureError(err, { route: `cron.${key}`, job: key, status });
      await maybeAlert(job, consecutiveFailures, status, message);
      return Response.json(
        { error: status === "timeout" ? "timeout" : "job_failed", job: key },
        {
          status: timedOut ? 504 : 500,
          headers: {
            "cache-control": "no-store",
            ...(lease.runId ? { "x-cron-run-id": lease.runId } : {}),
          },
        },
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

/**
 * Extracts a few small scalar counters from a job's payload for the ledger, so
 * the run desk can show "what did it actually do" without storing whole result
 * documents in the operations database.
 */
function summarise(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let taken = 0;
  for (const [k, v] of Object.entries(payload)) {
    if (taken >= 12) break;
    if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      taken += 1;
    } else if (Array.isArray(v)) {
      out[`${k}_count`] = v.length;
      taken += 1;
    } else if (typeof v === "string" && v.length <= 60) {
      out[k] = v;
      taken += 1;
    }
  }
  return out;
}