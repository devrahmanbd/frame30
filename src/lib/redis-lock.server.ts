/**
 * Production-grade Redis Distributed Lock with lease timeouts, safe token release,
 * and graceful fallback to in-memory mutex when Redis is unconfigured or degraded.
 *
 * Invariants:
 *  1. Mutual Exclusion: At most one worker can hold the lock for a given resource.
 *  2. Deadlock Free: Every lock carries a time-to-live (TTL); expired locks auto-release.
 *  3. Safe Release: Release and Extend use atomic Lua scripts that check the owner's
 *     unique token before mutating or deleting the lock. A slow worker whose lease
 *     expired will never accidentally release another worker's newly acquired lock.
 *  4. Graceful Fallback: When REDIS_URL is unconfigured or Redis circuit breaker is open,
 *     an isolate-local asynchronous mutex provides mutual exclusion without throwing.
 */

import { incr, log, observe, registerMetric } from "./observability.server";
import { redisCommand, redisConfigured, redisEval, redisKey } from "./redis.server";

registerMetric(
  "framique_locks_acquired_total",
  "counter",
  "Distributed locks successfully acquired by resource and tier",
);
registerMetric(
  "framique_locks_failed_total",
  "counter",
  "Distributed lock acquisition failures by resource and reason",
);
registerMetric(
  "framique_lock_hold_ms",
  "histogram",
  "Time a distributed lock was held before release in milliseconds",
  [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
);

export class LockAcquisitionError extends Error {
  constructor(readonly resource: string, message = "lock.acquisition_failed") {
    super(message);
    this.name = "LockAcquisitionError";
  }
}

export type LockHandle = {
  key: string;
  token: string;
  expiresAt: number;
  release: () => Promise<boolean>;
  extend: (additionalTtlMs: number) => Promise<boolean>;
};

export type LockOptions = {
  retries?: number;
  retryDelayMs?: number;
};

const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

const EXTEND_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end
`;

/* ------------------------------------------------------------------ */
/* In-Memory Mutex Fallback (Isolate-Local)                           */
/* ------------------------------------------------------------------ */

type MemoryLock = {
  token: string;
  timer: ReturnType<typeof setTimeout>;
  resolveNext?: () => void;
};

const memoryLocks = new Map<string, MemoryLock>();
const memoryWaiters = new Map<string, Array<() => void>>();

function acquireMemoryLock(key: string, token: string, ttlMs: number): Promise<boolean> {
  if (!memoryLocks.has(key)) {
    const timer = setTimeout(() => releaseMemoryLock(key, token), ttlMs);
    memoryLocks.set(key, { token, timer });
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function releaseMemoryLock(key: string, token: string): boolean {
  const current = memoryLocks.get(key);
  if (!current || current.token !== token) return false;
  clearTimeout(current.timer);
  memoryLocks.delete(key);

  const waiters = memoryWaiters.get(key);
  if (waiters && waiters.length > 0) {
    const next = waiters.shift();
    if (next) next();
    if (waiters.length === 0) memoryWaiters.delete(key);
  }
  return true;
}

function extendMemoryLock(key: string, token: string, additionalTtlMs: number): boolean {
  const current = memoryLocks.get(key);
  if (!current || current.token !== token) return false;
  clearTimeout(current.timer);
  current.timer = setTimeout(() => releaseMemoryLock(key, token), additionalTtlMs);
  return true;
}

/* ------------------------------------------------------------------ */
/* Lock Acquisition & Release                                         */
/* ------------------------------------------------------------------ */

function formatLockKey(resource: string): string {
  return redisKey("lock", resource);
}

/**
 * Attempt to acquire a distributed lock for `resource` for `ttlMs` milliseconds.
 * Returns a LockHandle on success, or null if lock is currently held.
 */
export async function acquireLock(
  resource: string,
  ttlMs: number,
  opts: LockOptions = {},
): Promise<LockHandle | null> {
  const key = formatLockKey(resource);
  const retries = Math.max(0, opts.retries ?? 0);
  const baseDelay = Math.max(10, opts.retryDelayMs ?? 50);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const token = crypto.randomUUID();
    const started = Date.now();

    if (redisConfigured()) {
      const res = await redisCommand(["SET", key, token, "NX", "PX", ttlMs]);
      if (res.ok && res.value === "OK") {
        incr("framique_locks_acquired_total", { resource, tier: "redis" });
        return createLockHandle(key, token, ttlMs, started, true);
      }
    } else {
      // Fallback to in-memory mutex
      const acquired = await acquireMemoryLock(key, token, ttlMs);
      if (acquired) {
        incr("framique_locks_acquired_total", { resource, tier: "memory" });
        return createLockHandle(key, token, ttlMs, started, false);
      }
    }

    if (attempt < retries) {
      // Exponential jitter backoff
      const jitter = Math.floor(Math.random() * baseDelay);
      const delay = baseDelay * Math.pow(1.5, attempt) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  incr("framique_locks_failed_total", { resource, reason: "busy" });
  return null;
}

function createLockHandle(
  key: string,
  token: string,
  ttlMs: number,
  acquiredAt: number,
  isRedis: boolean,
): LockHandle {
  let released = false;

  return {
    key,
    token,
    expiresAt: acquiredAt + ttlMs,
    release: async () => {
      if (released) return true;
      released = true;
      const holdTime = Date.now() - acquiredAt;
      observe("framique_lock_hold_ms", holdTime);

      if (isRedis && redisConfigured()) {
        const res = await redisEval(RELEASE_LOCK_LUA, [key], [token]);
        return res.ok && Number(res.value) === 1;
      }
      return releaseMemoryLock(key, token);
    },
    extend: async (additionalTtlMs: number) => {
      if (released) return false;
      if (isRedis && redisConfigured()) {
        const res = await redisEval(EXTEND_LOCK_LUA, [key], [token, additionalTtlMs]);
        return res.ok && Number(res.value) === 1;
      }
      return extendMemoryLock(key, token, additionalTtlMs);
    },
  };
}

/**
 * Execute `fn` while holding a distributed lock on `resource`.
 * Automatically releases the lock when `fn` completes or errors.
 */
export async function withDistributedLock<T>(
  resource: string,
  ttlMs: number,
  fn: (handle: LockHandle) => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  const handle = await acquireLock(resource, ttlMs, opts);
  if (!handle) {
    log("warn", "lock.acquisition_timeout", { resource, ttlMs });
    throw new LockAcquisitionError(resource, `Could not acquire lock for ${resource}`);
  }

  try {
    return await fn(handle);
  } finally {
    await handle.release().catch((err) => {
      log("error", "lock.release_error", { resource, error: (err as Error).message });
    });
  }
}

/**
 * Tenant-scoped distributed lock: guarantees isolation across merchant boundaries.
 */
export function withTenantLock<T>(
  tenantId: string,
  resource: string,
  ttlMs: number,
  fn: (handle: LockHandle) => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  const scopedResource = `tenant:${tenantId}:${resource}`;
  return withDistributedLock(scopedResource, ttlMs, fn, opts);
}

/**
 * System/Platform distributed lock: guards platform-wide operations (e.g. crons, billing sweeps).
 */
export function withSystemLock<T>(
  resource: string,
  ttlMs: number,
  fn: (handle: LockHandle) => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  const scopedResource = `system:${resource}`;
  return withDistributedLock(scopedResource, ttlMs, fn, opts);
}
