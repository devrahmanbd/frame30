/**
 * Two-tier read cache: per-isolate L1 map, shared Redis L2.
 *
 * L1 is a TTL map with stale-while-revalidate and single-flight. It is the fast
 * path and the only tier that can serve a hit with zero I/O, but it is scoped to
 * one isolate, so on a cold or newly-spawned instance every key misses.
 *
 * L2 is Redis (`REDIS_URL`). It turns "one database round trip per isolate per
 * key" into "one per fleet per key", which is the whole point of provisioning it:
 * a deploy or a scale-out event no longer stampedes Postgres. L2 is written on
 * every L1 fill and read on every L1 miss, both behind the shared client's own
 * short timeouts and circuit breaker.
 *
 * Invariants that make this safe:
 *  - The cache key MUST carry `merchant_id` (or the user id) whenever the value
 *    is tenant data. Cross-tenant reuse of an entry is the same class of defect
 *    as a missing RLS policy — and with L2 the blast radius is the whole fleet,
 *    not one isolate, so the rule is stricter here, not looser.
 *  - Only JSON-serialisable values go to L2. A value that does not round-trip is
 *    kept in L1 only and counted, never silently corrupted.
 *  - Oversized values are not shared: a multi-megabyte payload in Redis buys
 *    latency, not throughput.
 *  - Redis never decides correctness. Every L2 fault degrades to the loader.
 */
import { incr, log, observe, registerMetric } from "./observability.server";
import { redisCommand, redisConfigured, redisKey } from "./redis.server";

registerMetric("framique_cache_shared_total", "counter", "Shared (Redis) cache operations by op and result");
registerMetric("framique_cache_shared_ms", "histogram", "Shared cache operation latency in milliseconds", [1, 2, 5, 10, 25, 50, 100, 250]);

type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

/** Anything larger than this stays isolate-local. */
const MAX_SHARED_BYTES = 256 * 1024;

export type CacheOptions = {
  staleSeconds?: number;
  /**
   * Publish/read this key through Redis as well. Opt-in because a value that is
   * cheap to recompute but expensive to serialise is better off L1-only.
   */
  shared?: boolean;
  /** Shared TTL, when it should differ from the L1 fresh window. */
  sharedTtlSeconds?: number;
};

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const oldest = [...store.entries()].sort((a, b) => a[1].staleUntil - b[1].staleUntil);
  for (const [key] of oldest.slice(0, Math.ceil(MAX_ENTRIES * 0.2))) store.delete(key);
}

function sharedKey(key: string): string {
  return redisKey("cache", key);
}

async function readShared<T>(key: string): Promise<{ hit: true; value: T } | { hit: false }> {
  if (!redisConfigured()) return { hit: false };
  const started = Date.now();
  const result = await redisCommand(["GET", sharedKey(key)]);
  observe("framique_cache_shared_ms", Date.now() - started, { op: "get" });
  if (!result.ok) {
    incr("framique_cache_shared_total", { op: "get", result: result.outcome });
    return { hit: false };
  }
  if (typeof result.value !== "string") {
    incr("framique_cache_shared_total", { op: "get", result: "miss" });
    return { hit: false };
  }
  try {
    const parsed = JSON.parse(result.value) as { v: T };
    incr("framique_cache_shared_total", { op: "get", result: "hit" });
    return { hit: true, value: parsed.v };
  } catch {
    // A poisoned entry (partial write, format change across deploys) is dropped
    // rather than trusted; the loader refills it on this same request.
    incr("framique_cache_shared_total", { op: "get", result: "corrupt" });
    void redisCommand(["DEL", sharedKey(key)]);
    return { hit: false };
  }
}

async function writeShared<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (!redisConfigured()) return;
  let payload: string;
  try {
    payload = JSON.stringify({ v: value });
  } catch {
    incr("framique_cache_shared_total", { op: "set", result: "unserialisable" });
    return;
  }
  if (payload === undefined) {
    incr("framique_cache_shared_total", { op: "set", result: "unserialisable" });
    return;
  }
  if (payload.length > MAX_SHARED_BYTES) {
    incr("framique_cache_shared_total", { op: "set", result: "too_large" });
    return;
  }
  const started = Date.now();
  const result = await redisCommand(["SET", sharedKey(key), payload, "PX", Math.max(1_000, ttlSeconds * 1000)]);
  observe("framique_cache_shared_ms", Date.now() - started, { op: "set" });
  incr("framique_cache_shared_total", { op: "set", result: result.ok ? "ok" : result.outcome });
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  opts: CacheOptions = {},
): Promise<T> {
  const now = Date.now();
  const shared = opts.shared === true;
  const sharedTtl = opts.sharedTtlSeconds ?? ttlSeconds;
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.freshUntil > now) {
    incr("framique_cache_total", { result: "hit" });
    return hit.value;
  }

  const fill = (value: T) => {
    store.set(key, {
      value,
      freshUntil: Date.now() + ttlSeconds * 1000,
      staleUntil: Date.now() + (ttlSeconds + (opts.staleSeconds ?? ttlSeconds)) * 1000,
    });
    evictIfNeeded();
  };

  const revalidate = () => {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => {
      // L2 before the loader: on a cold isolate this is the difference between
      // one database read for the fleet and one per instance.
      if (shared) {
        const remote = await readShared<T>(key);
        if (remote.hit) {
          fill(remote.value);
          incr("framique_cache_total", { result: "shared_hit" });
          return remote.value;
        }
      }
      const value = await loader();
      fill(value);
      if (shared) void writeShared(key, value, sharedTtl).catch(() => undefined);
      return value;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };

  if (hit && hit.staleUntil > now) {
    incr("framique_cache_total", { result: "stale" });
    void revalidate().catch(() => undefined);
    return hit.value;
  }

  incr("framique_cache_total", { result: "miss" });
  return revalidate();
}

/**
 * Drop every key under `prefix` from L1, and from L2 when Redis is configured.
 *
 * L2 deletion uses cursored `SCAN` with a bounded page count: an unbounded
 * `KEYS` sweep on a production Redis is a stall, and an invalidation that stalls
 * the write path is worse than one that leaves a key to expire on its TTL. If we
 * hit the page budget we log it so the pattern can be narrowed.
 */
export function invalidate(prefix: string) {
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
  if (redisConfigured()) void invalidateShared(prefix);
}

const SCAN_PAGES = 20;
const SCAN_COUNT = 200;

async function invalidateShared(prefix: string) {
  const match = `${sharedKey(prefix)}*`;
  let cursor = "0";
  let deleted = 0;
  for (let page = 0; page < SCAN_PAGES; page += 1) {
    const result = await redisCommand(["SCAN", cursor, "MATCH", match, "COUNT", SCAN_COUNT]);
    if (!result.ok || !Array.isArray(result.value)) {
      incr("framique_cache_shared_total", { op: "scan", result: result.outcome });
      return;
    }
    const [next, keys] = result.value as [string, string[]];
    if (Array.isArray(keys) && keys.length > 0) {
      const del = await redisCommand(["DEL", ...keys]);
      if (del.ok) deleted += keys.length;
    }
    cursor = String(next ?? "0");
    if (cursor === "0") {
      incr("framique_cache_shared_total", { op: "invalidate", result: "ok" }, 1);
      return;
    }
  }
  log("warn", "cache.invalidate_truncated", { prefix: prefix.slice(0, 80), deleted });
  incr("framique_cache_shared_total", { op: "invalidate", result: "truncated" });
}

export function cacheStats() {
  return {
    entries: store.size,
    inflight: inflight.size,
    max: MAX_ENTRIES,
    shared: redisConfigured(),
  };
}
