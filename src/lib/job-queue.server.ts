/**
 * Durable job queue service layer — §4.4.
 *
 * Replaces "call the function and hope" with a Postgres-backed queue that
 * survives a worker dying mid-flight:
 *
 *  - Enqueue is idempotent. A dedupe key means a retried webhook or a
 *    double-clicked button produces one job, not two.
 *  - Claiming is a compare-and-swap on the row's state plus a worker lease, so
 *    two isolates racing the same job can only have one winner. A lease that
 *    expires (worker crashed, isolate evicted) is reclaimed automatically.
 *  - Failures back off exponentially with per-job jitter, and non-retryable
 *    errors dead-letter immediately instead of burning ten attempts on a 400.
 *  - Everything is measured: depth, age, claims, outcomes and duration all land
 *    in Prometheus so Grafana can alert before a merchant notices.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  afterFailure,
  isLeaseExpired,
  isRetryableError,
  judgeQueue,
  policyFor,
  PRIORITY_RANK,
  scheduleIsDue,
  type JobState,
  type QueueDepth,
} from "./job-queue";
import { incr, log, observe, setGauge, captureError } from "./observability.server";

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

export class JobQueueError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "JobQueueError";
  }
}

async function admin(): Promise<Client> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Client;
}

function table(client: Client, name: string) {
  return (client as unknown as { from: (t: string) => any }).from(name);
}

/* ------------------------------------------------------------------ enqueue */

export type EnqueueInput = {
  queue: string;
  name: string;
  payload?: Record<string, unknown>;
  merchantId?: string | null;
  /** Stable key; a second enqueue with the same key is a no-op. */
  idempotencyKey?: string | null;
  /** Delay before the job becomes claimable. */
  delaySeconds?: number;
  /** Overrides the queue policy default. */
  maxAttempts?: number;
};

export async function enqueueJob(input: EnqueueInput, client?: Client) {
  const db = client ?? (await admin());
  const policy = policyFor(input.queue);
  const runAfter = new Date(Date.now() + Math.max(0, input.delaySeconds ?? 0) * 1000).toISOString();

  const row = {
    queue: input.queue,
    name: input.name,
    payload: input.payload ?? {},
    merchant_id: input.merchantId ?? null,
    state: "queued" as JobState,
    priority: PRIORITY_RANK[policy.priority],
    max_attempts: input.maxAttempts ?? policy.maxAttempts,
    run_after: runAfter,
    idempotency_key: input.idempotencyKey ?? null,
  };

  if (input.idempotencyKey) {
    const { data: existing } = await table(db, "job_queue")
      .select("id,state")
      .eq("queue", input.queue)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) {
      incr("framique_jobs_enqueued_total", { queue: input.queue, result: "duplicate" });
      return { id: (existing as Row)["id"] as string, duplicate: true };
    }
  }

  const { data, error } = await table(db, "job_queue").insert(row).select("id").single();
  if (error) {
    // Unique violation = another isolate won the same dedupe key. Not an error.
    if ((error as { code?: string }).code === "23505" && input.idempotencyKey) {
      incr("framique_jobs_enqueued_total", { queue: input.queue, result: "duplicate" });
      return { id: null, duplicate: true };
    }
    throw new JobQueueError("job_enqueue_failed", (error as { message?: string }).message);
  }

  incr("framique_jobs_enqueued_total", { queue: input.queue, result: "accepted" });
  log("info", "job.enqueued", { queue: input.queue, name: input.name });
  return { id: (data as Row)["id"] as string, duplicate: false };
}

/* -------------------------------------------------------------------- claim */

export type ClaimedJob = {
  id: string;
  queue: string;
  name: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  merchantId: string | null;
};

/**
 * Claims up to `limit` jobs with a compare-and-swap per row. Postgrest has no
 * `SKIP LOCKED`, so the guard is the `.eq("state", ...)` predicate on the
 * update: a loser's update matches zero rows and it simply moves on.
 */
export async function claimJobs(
  queue: string,
  workerId: string,
  limit?: number,
  client?: Client,
): Promise<ClaimedJob[]> {
  const db = client ?? (await admin());
  const policy = policyFor(queue);
  const take = Math.min(limit ?? policy.batchSize, policy.batchSize);
  const nowIso = new Date().toISOString();

  const { data: candidates, error } = await table(db, "job_queue")
    .select("id,queue,name,payload,attempts,max_attempts,merchant_id,state,locked_at")
    .eq("queue", queue)
    .in("state", ["queued", "running"])
    .lte("run_after", nowIso)
    .order("priority", { ascending: true })
    .order("run_after", { ascending: true })
    .limit(take * 3);

  if (error) throw new JobQueueError("job_claim_failed", (error as { message?: string }).message);

  const claimed: ClaimedJob[] = [];
  for (const raw of (candidates ?? []) as Row[]) {
    if (claimed.length >= take) break;
    const state = raw["state"] as JobState;
    // A running job is only stealable once its lease has expired.
    if (state === "running" && !isLeaseExpired(raw["locked_at"] as string | null, policy.leaseSeconds)) {
      continue;
    }

    const { data: won } = await table(db, "job_queue")
      .update({
        state: "running",
        locked_at: new Date().toISOString(),
        locked_by: workerId,
        attempts: (raw["attempts"] as number) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", raw["id"] as string)
      .eq("state", state)
      .select("id,queue,name,payload,attempts,max_attempts,merchant_id")
      .maybeSingle();

    if (!won) {
      incr("framique_jobs_claim_lost_total", { queue });
      continue;
    }
    const w = won as Row;
    claimed.push({
      id: w["id"] as string,
      queue: w["queue"] as string,
      name: w["name"] as string,
      payload: (w["payload"] as Record<string, unknown>) ?? {},
      attempts: w["attempts"] as number,
      maxAttempts: w["max_attempts"] as number,
      merchantId: (w["merchant_id"] as string | null) ?? null,
    });
  }

  incr("framique_jobs_claimed_total", { queue }, claimed.length);
  return claimed;
}

/* --------------------------------------------------------- complete / fail */

export async function completeJob(id: string, result: Record<string, unknown> = {}, client?: Client) {
  const db = client ?? (await admin());
  await table(db, "job_queue")
    .update({
      state: "succeeded",
      result,
      locked_at: null,
      locked_by: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  incr("framique_jobs_completed_total", { outcome: "succeeded" });
}

export async function failJob(
  job: ClaimedJob,
  err: { status?: number | null; code?: string; message: string },
  client?: Client,
) {
  const db = client ?? (await admin());
  const policy = { ...policyFor(job.queue), maxAttempts: job.maxAttempts };
  const retryable = isRetryableError(err.status ?? null, err.message);
  const outcome = afterFailure(policy, job.attempts, job.id, retryable);

  await table(db, "job_queue")
    .update({
      state: outcome.next,
      run_after: new Date(Date.now() + outcome.runAfterSeconds * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
      last_error_code: err.code ?? (err.status ? String(err.status) : "unknown"),
      last_error_message: err.message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  incr("framique_jobs_completed_total", { outcome: outcome.dead ? "dead" : "retry" });
  if (outcome.dead) {
    log("error", "job.dead_letter", { queue: job.queue, name: job.name, code: err.code ?? "unknown" });
    await captureError(new Error(`job dead-lettered: ${job.name}`), {
      scope: "job.queue.dead",
      queue: job.queue,
      job_type: job.name,
    });
  }
  return outcome;
}

/* -------------------------------------------------------------------- drain */

export type JobHandler = (job: ClaimedJob) => Promise<Record<string, unknown> | void>;

/**
 * Runs one drain pass. Bounded by the queue policy's batch size so a single
 * cron invocation always finishes inside the request budget; the next tick
 * picks up whatever is left.
 */
export async function drainQueue(
  queue: string,
  workerId: string,
  handlers: Record<string, JobHandler>,
  client?: Client,
) {
  const db = client ?? (await admin());
  const jobs = await claimJobs(queue, workerId, undefined, db);
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = handlers[job.name];
    const started = Date.now();
    if (!handler) {
      await failJob(job, { status: 400, code: "no_handler", message: `no handler for ${job.name}` }, db);
      failed += 1;
      continue;
    }
    try {
      const result = await handler(job);
      await completeJob(job.id, result ?? {}, db);
      succeeded += 1;
    } catch (error) {
      const status = (error as { status?: number }).status ?? null;
      const message = error instanceof Error ? error.message : String(error);
      await failJob(job, { status, code: (error as { code?: string }).code, message }, db);
      failed += 1;
    } finally {
      observe("framique_job_duration_ms", Date.now() - started, { queue });
    }
  }

  return { queue, claimed: jobs.length, succeeded, failed };
}

/* ----------------------------------------------------------------- recovery */

/** Returns jobs whose worker vanished mid-flight back to the queue. */
export async function reclaimStalled(client?: Client) {
  const db = client ?? (await admin());
  const { data } = await table(db, "job_queue")
    .select("id,queue,locked_at,attempts,max_attempts")
    .eq("state", "running")
    .limit(500);

  let reclaimed = 0;
  for (const raw of (data ?? []) as Row[]) {
    const policy = policyFor(raw["queue"] as string);
    if (!isLeaseExpired(raw["locked_at"] as string | null, policy.leaseSeconds)) continue;
    const attempts = raw["attempts"] as number;
    const exhausted = attempts >= (raw["max_attempts"] as number);
    await table(db, "job_queue")
      .update({
        state: exhausted ? "dead" : "queued",
        locked_at: null,
        locked_by: null,
        last_error_code: "lease_expired",
        last_error_message: "Worker lease expired before the job reported back.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", raw["id"] as string)
      .eq("state", "running");
    reclaimed += 1;
  }
  if (reclaimed) {
    incr("framique_jobs_reclaimed_total", {}, reclaimed);
    log("warn", "job.reclaimed", { count: reclaimed });
  }
  return reclaimed;
}

/** Requeues a dead job after a human fixed the underlying cause. */
export async function replayJob(id: string, client?: Client) {
  const db = client ?? (await admin());
  const { data } = await table(db, "job_queue")
    .update({
      state: "queued",
      attempts: 0,
      run_after: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("state", ["dead", "failed", "cancelled"])
    .select("id")
    .maybeSingle();
  if (!data) throw new JobQueueError("job_not_replayable");
  incr("framique_jobs_replayed_total", {});
  return { id };
}

export async function cancelJob(id: string, client?: Client) {
  const db = client ?? (await admin());
  const { data } = await table(db, "job_queue")
    .update({ state: "cancelled", locked_at: null, locked_by: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("state", ["queued", "failed"])
    .select("id")
    .maybeSingle();
  if (!data) throw new JobQueueError("job_not_cancellable");
  return { id };
}

/* ------------------------------------------------------------------- health */

export async function queueDepths(client?: Client): Promise<(QueueDepth & { verdict: ReturnType<typeof judgeQueue> })[]> {
  const db = client ?? (await admin());
  const { data } = await table(db, "job_queue")
    .select("queue,state,run_after")
    .in("state", ["queued", "running", "dead"])
    .limit(5000);

  const byQueue = new Map<string, QueueDepth>();
  const now = Date.now();
  for (const raw of (data ?? []) as Row[]) {
    const queue = raw["queue"] as string;
    const cur = byQueue.get(queue) ?? { queue, queued: 0, running: 0, dead: 0, oldestQueuedAgeSeconds: 0 };
    const state = raw["state"] as JobState;
    if (state === "queued") {
      cur.queued += 1;
      const age = Math.max(0, Math.round((now - Date.parse(raw["run_after"] as string)) / 1000));
      cur.oldestQueuedAgeSeconds = Math.max(cur.oldestQueuedAgeSeconds, age);
    } else if (state === "running") cur.running += 1;
    else cur.dead += 1;
    byQueue.set(queue, cur);
  }

  const depths = [...byQueue.values()].map((d) => ({ ...d, verdict: judgeQueue(d) }));
  // Gauges, not counters: depth is a level, and Grafana must be able to read
  // the current value rather than a rate. Oldest-queued-age is the honest
  // latency signal — a shallow queue whose head is 20 minutes old is broken.
  for (const d of depths) {
    setGauge("framique_queue_depth", d.queued, { queue: d.queue, state: "queued" });
    setGauge("framique_queue_depth", d.running, { queue: d.queue, state: "running" });
    setGauge("framique_queue_depth", d.dead, { queue: d.queue, state: "dead" });
    setGauge("framique_queue_oldest_age_seconds", d.oldestQueuedAgeSeconds, { queue: d.queue });
    const severity = { healthy: 0, backlogged: 1, stalled: 2, failing: 3 }[d.verdict.status] ?? 0;
    setGauge("framique_queue_health", severity, { queue: d.queue });
  }
  return depths;
}

/* ---------------------------------------------------------------- schedules */

/** Fires every enabled schedule whose cron expression is due, exactly once. */
export async function runDueSchedules(now = new Date(), client?: Client) {
  const db = client ?? (await admin());
  const { data } = await table(db, "job_schedules").select("*").eq("enabled", true).limit(200);

  let fired = 0;
  for (const raw of (data ?? []) as Row[]) {
    const cron = raw["cron"] as string;
    const lastRun = (raw["last_run_at"] as string | null) ?? null;
    if (!scheduleIsDue(cron, lastRun, now)) continue;

    const minuteKey = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
    await enqueueJob(
      {
        queue: raw["queue"] as string,
        name: raw["name"] as string,
        payload: (raw["payload"] as Record<string, unknown>) ?? {},
        idempotencyKey: `sched:${raw["name"] as string}:${minuteKey}`,
      },
      db,
    );
    await table(db, "job_schedules")
      .update({ last_run_at: now.toISOString(), last_status: "enqueued", updated_at: now.toISOString() })
      .eq("id", raw["id"] as string);
    fired += 1;
  }

  if (fired) incr("framique_schedules_fired_total", {}, fired);
  return fired;
}
