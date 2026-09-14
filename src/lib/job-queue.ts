/**
 * Durable job queue contract — §4.4.
 *
 * BullMQ needs a long-lived Redis connection and a resident worker process.
 * Neither exists in a request-scoped Worker runtime, so the same guarantees are
 * rebuilt on Postgres, which the app already depends on: at-least-once
 * delivery, visibility timeouts (leases), bounded retries with jittered
 * backoff, a dead-letter state, and cron-style repeatable jobs.
 *
 * This module holds the pure rules — state machine, backoff, lease expiry, cron
 * matching — so the queue's behaviour under contention and failure can be
 * proven in tests instead of guessed at from production logs.
 */

export type JobState = "queued" | "running" | "succeeded" | "failed" | "dead" | "cancelled";

const JOB_TRANSITIONS: Record<JobState, JobState[]> = {
  queued: ["running", "cancelled"],
  // `running -> queued` is the retry path; `running -> dead` is attempt exhaustion.
  running: ["succeeded", "failed", "queued", "dead"],
  failed: ["queued", "dead", "cancelled"],
  succeeded: [],
  dead: ["queued"],
  cancelled: [],
};

export function canTransitionJob(from: JobState, to: JobState) {
  return (JOB_TRANSITIONS[from] ?? []).includes(to);
}

export function assertJobTransition(from: JobState, to: JobState) {
  if (!canTransitionJob(from, to)) {
    throw new Error(`job_invalid_transition:${from}->${to}`);
  }
}

export type JobPriority = "critical" | "default" | "bulk";

/** Lower sorts first. Money and delivery must not queue behind a bulk export. */
export const PRIORITY_RANK: Record<JobPriority, number> = {
  critical: 0,
  default: 10,
  bulk: 20,
};

export type QueueName =
  | "payments"
  | "delivery"
  | "search-index"
  | "exports"
  | "notifications"
  | "maintenance";

export type QueuePolicy = {
  maxAttempts: number;
  /** Seconds a claimed job may run before another worker may steal it. */
  leaseSeconds: number;
  baseBackoffSeconds: number;
  maxBackoffSeconds: number;
  priority: JobPriority;
  /** Cap on jobs a single drain will claim, protecting the request budget. */
  batchSize: number;
};

export const QUEUE_POLICIES: Record<QueueName, QueuePolicy> = {
  // Money: retried hard and for a long time, because giving up loses a payment.
  payments: {
    maxAttempts: 10,
    leaseSeconds: 120,
    baseBackoffSeconds: 15,
    maxBackoffSeconds: 3600,
    priority: "critical",
    batchSize: 20,
  },
  delivery: {
    maxAttempts: 6,
    leaseSeconds: 90,
    baseBackoffSeconds: 30,
    maxBackoffSeconds: 3600,
    priority: "critical",
    batchSize: 25,
  },
  // Index drift self-heals on the next full sync, so this gives up early.
  "search-index": {
    maxAttempts: 4,
    leaseSeconds: 60,
    baseBackoffSeconds: 10,
    maxBackoffSeconds: 300,
    priority: "default",
    batchSize: 50,
  },
  exports: {
    maxAttempts: 3,
    leaseSeconds: 300,
    baseBackoffSeconds: 60,
    maxBackoffSeconds: 900,
    priority: "bulk",
    batchSize: 5,
  },
  notifications: {
    maxAttempts: 5,
    leaseSeconds: 60,
    baseBackoffSeconds: 20,
    maxBackoffSeconds: 1800,
    priority: "default",
    batchSize: 40,
  },
  maintenance: {
    maxAttempts: 2,
    leaseSeconds: 300,
    baseBackoffSeconds: 300,
    maxBackoffSeconds: 3600,
    priority: "bulk",
    batchSize: 10,
  },
};

export function policyFor(queue: string): QueuePolicy {
  return QUEUE_POLICIES[queue as QueueName] ?? QUEUE_POLICIES.maintenance;
}

/**
 * Deterministic jitter keyed on the job id. Pure exponential backoff makes a
 * thousand jobs that failed together retry together, re-creating the outage
 * that failed them; spreading them over the window is the whole point.
 */
export function backoffSeconds(policy: QueuePolicy, attempt: number, jobId: string) {
  const exponent = Math.max(0, attempt - 1);
  const raw = policy.baseBackoffSeconds * 2 ** Math.min(exponent, 12);
  const capped = Math.min(policy.maxBackoffSeconds, raw);
  let hash = 0;
  for (let i = 0; i < jobId.length; i += 1) hash = (hash * 31 + jobId.charCodeAt(i)) >>> 0;
  const jitter = 0.75 + (hash % 1000) / 2000; // 0.75x .. 1.25x
  return Math.max(1, Math.round(capped * jitter));
}

export type AttemptOutcome = {
  next: JobState;
  runAfterSeconds: number;
  dead: boolean;
};

/**
 * Decides what happens after a failed attempt. Non-retryable errors (bad input,
 * permanently missing record) go straight to dead-letter: burning nine more
 * attempts on a 400 helps nobody and hides the real failures.
 */
export function afterFailure(
  policy: QueuePolicy,
  attempt: number,
  jobId: string,
  retryable: boolean,
): AttemptOutcome {
  if (!retryable || attempt >= policy.maxAttempts) {
    return { next: "dead", runAfterSeconds: 0, dead: true };
  }
  return { next: "queued", runAfterSeconds: backoffSeconds(policy, attempt, jobId), dead: false };
}

/** Errors worth retrying: transport, timeout, throttling, and 5xx. */
export function isRetryableError(status: number | null, message: string) {
  if (status === null) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  if (/timeout|socket|network|econn|temporar/i.test(message)) return true;
  return false;
}

/** A lease that outlived its window means the worker died mid-flight. */
export function isLeaseExpired(lockedAt: string | null, leaseSeconds: number, now = Date.now()) {
  if (!lockedAt) return true;
  const t = Date.parse(lockedAt);
  if (Number.isNaN(t)) return true;
  return now - t > leaseSeconds * 1000;
}

/* ------------------------------------------------------------------ schedules */

/** Minimal 5-field cron matcher: minute hour dom month dow. */
export function cronMatches(expression: string, date: Date) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ];
  return fields.every((field, i) => matchField(field!, values[i]!));
}

function matchField(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) return false;
    if (range === "*") return value % step === 0;
    const [startRaw, endRaw] = range!.split("-");
    const start = Number(startRaw);
    const end = endRaw === undefined ? start : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (value < start || value > end) return false;
    return (value - start) % step === 0;
  });
}

/**
 * A schedule that missed its window (worker outage, deploy) must fire once on
 * recovery, not once per missed minute — catch-up storms are how a queue takes
 * itself down straight after coming back.
 */
export function scheduleIsDue(
  expression: string,
  lastRunAt: string | null,
  now = new Date(),
  minGapSeconds = 55,
) {
  if (lastRunAt) {
    const since = now.getTime() - Date.parse(lastRunAt);
    if (Number.isFinite(since) && since < minGapSeconds * 1000) return false;
  }
  return cronMatches(expression, now);
}

/* --------------------------------------------------------------- queue health */

export type QueueDepth = {
  queue: string;
  queued: number;
  running: number;
  dead: number;
  oldestQueuedAgeSeconds: number;
};

export type QueueVerdict = {
  status: "healthy" | "backlogged" | "stalled" | "failing";
  message: string;
};

/**
 * Turns raw depth into something a merchant or on-call human can act on.
 * Depth alone is a bad signal — a deep queue that is draining fast is fine,
 * while a shallow one whose head is ten minutes old is stalled.
 */
export function judgeQueue(depth: QueueDepth): QueueVerdict {
  if (depth.dead > 0 && depth.dead >= Math.max(5, depth.queued)) {
    return { status: "failing", message: `${depth.dead} jobs gave up and need attention.` };
  }
  if (depth.oldestQueuedAgeSeconds > 900) {
    return { status: "stalled", message: "Oldest job has been waiting over 15 minutes." };
  }
  if (depth.queued > 1000) {
    return { status: "backlogged", message: `${depth.queued} jobs waiting; workers are behind.` };
  }
  return { status: "healthy", message: "Draining normally." };
}
