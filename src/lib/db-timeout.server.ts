/**
 * Bounded database waits for money paths.
 *
 * Supabase/PostgREST calls have no client-side deadline here: a stalled
 * connection holds the request until the platform's stream killer fires. This
 * module bounds ONE round trip with a promise race so the caller fails closed
 * (503-style, per each caller's own error vocabulary) instead of hanging.
 *
 * The race only bounds the waiter — the underlying query cannot be cancelled
 * through this seam (no AbortSignal reaches PostgREST here), so the loser runs
 * fire-and-forget and its late settlement is swallowed. Callers must therefore
 * treat a timeout as *unknown outcome* and keep the operation idempotent.
 */
import { incr, log } from "./observability.server";

/** Default budget for money paths: tolerant of Supabase RTT, far under locks. */
export const DEFAULT_DB_TIMEOUT_MS = 5000;

// NOTE: no registerMetric() call here on purpose. The `db.timeout` series is
// created implicitly by incr() below (describe() is docs-only), and a
// top-level registerMetric would break suites that mock observability.server
// with only { incr, log, observe }.

export class DbTimeoutError extends Error {
  readonly op: string;
  readonly timeoutMs: number;
  readonly code = "db_timeout";

  constructor(op: string, timeoutMs: number) {
    super(`db.timeout: ${op} exceeded ${timeoutMs}ms`);
    this.name = "DbTimeoutError";
    this.op = op;
    this.timeoutMs = timeoutMs;
  }
}

export function isDbTimeout(err: unknown): err is DbTimeoutError {
  return (
    err instanceof DbTimeoutError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === "db_timeout")
  );
}

export async function withDbTimeout<T>(
  work: Promise<T> | PromiseLike<T> | (() => Promise<T> | PromiseLike<T>),
  opts: { timeoutMs?: number; op?: string } = {},
): Promise<T> {
  const op = opts.op ?? "db";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_DB_TIMEOUT_MS;
  // Normalise thunks, raw promises and PostgREST/FakeDb thenables alike; a
  // synchronous throw inside the thunk becomes a rejection, never an escape.
  const pending = Promise.resolve().then(() =>
    typeof work === "function" ? work() : work,
  ) as Promise<T>;
  // The loser (post-timeout settlement) is observed here so a late rejection
  // can never surface as an unhandled rejection; the race below still sees it.
  pending.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          incr("db.timeout", { op });
          log("warn", "db.timeout", { op, timeoutMs });
          reject(new DbTimeoutError(op, timeoutMs));
        }, timeoutMs);
        (timer as unknown as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
