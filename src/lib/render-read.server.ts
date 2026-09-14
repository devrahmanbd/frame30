/**
 * Phase 7 — the one render-path read contract.
 *
 * Phase 7 of the content roadmap says every read that happens while a
 * storefront page is being rendered must be:
 *
 *  - **tenant-keyed and cached** with stale-while-revalidate, so a cold cache
 *    costs one database round-trip for the whole store, not one per page view;
 *  - **hard-bounded in time**, so a slow table can never hold SSR open past the
 *    LCP budget in `web-vitals.ts`;
 *  - **fail-soft**, returning a declared fallback instead of throwing — a dead
 *    SEO table must never 500 a storefront;
 *  - **counted**, so "the storefront quietly lost its SEO overrides" is a
 *    Prometheus series and an alert, not a support ticket six weeks later.
 *
 * Before this module each read re-implemented three of those four rules with a
 * private `withTimeout` and its own catch, which is exactly how the fourth one
 * goes missing. `renderRead` is now the only sanctioned shape, and
 * `scripts/seo-weight-gate.mjs` plus `seo-weight.contract.test.ts` fail the
 * build when a render-path module calls `cached()` directly again.
 *
 * Server-only: it imports the observability registry and the process-wide cache.
 */
import { cached, invalidate } from "./cache.server";
import { incr, log, observe } from "./observability.server";

/** Timeouts are deliberately short: this budget is spent inside SSR. */
export const RENDER_READ_TIMEOUT_MS = 1_500;
export const RENDER_READ_TTL_SECONDS = 60;
export const RENDER_READ_STALE_SECONDS = 300;

export class RenderReadTimeout extends Error {
  constructor(readonly label: string) {
    super(`${label}.timeout`);
    this.name = "RenderReadTimeout";
  }
}

export type RenderReadOptions<T> = {
  /** Metric/log label, e.g. `seo.resolve`. Bounded cardinality: no ids. */
  name: string;
  /** Cache key. MUST carry the tenant (merchant id or store slug). */
  key: string;
  /** Value returned when the read times out, throws, or the table is gone. */
  fallback: T;
  load: () => Promise<T>;
  ttlSeconds?: number;
  staleSeconds?: number;
  timeoutMs?: number;
  /**
   * Publish the value to the shared (Redis) cache tier as well. Default `true`:
   * render-path reads are exactly the case Redis was provisioned for — a deploy
   * or scale-out event otherwise stampedes Postgres once per isolate per key.
   * Set `false` for values that are cheap to load but expensive to serialise.
   */
  shared?: boolean;
  /** Extra bounded log context (never PII, never a full row). */
  context?: Record<string, string | number | boolean | null>;
};


function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RenderReadTimeout(label)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Run one render-path read under the full contract. Never rejects: the caller
 * gets either the loaded value or `fallback`, and the failure is observable.
 */
export async function renderRead<T>(opts: RenderReadOptions<T>): Promise<T> {
  const {
    name,
    key,
    fallback,
    load,
    ttlSeconds = RENDER_READ_TTL_SECONDS,
    staleSeconds = RENDER_READ_STALE_SECONDS,
    timeoutMs = RENDER_READ_TIMEOUT_MS,
    shared = true,
    context,
  } = opts;

  if (!key.includes("|")) {
    // A key without a tenant segment is a cross-tenant leak waiting to happen.
    log("warn", "render_read.unkeyed", { name, key: key.slice(0, 80) });
  }

  try {
    return await cached(
      key,
      ttlSeconds,
      async () => {
        const started = Date.now();
        try {
          const value = await withTimeout(load(), timeoutMs, name);
          observe("framique_render_read_ms", Date.now() - started, { read: name, result: "ok" });
          incr("framique_render_read_total", { read: name, result: "ok" });
          return value;
        } catch (error) {
          const timeout = error instanceof RenderReadTimeout;
          const result = timeout ? "timeout" : "error";
          observe("framique_render_read_ms", Date.now() - started, { read: name, result });
          incr("framique_render_read_total", { read: name, result });
          log("warn", "render_read.failed", {
            ...(context ?? {}),
            read: name,
            reason: timeout ? "timeout" : String((error as Error)?.message ?? error).slice(0, 200),
          });
          // Fallback is cached for the TTL on purpose: a broken table should not
          // be hammered once per page view while it is down.
          return fallback;
        }
      },
      { staleSeconds, shared, sharedTtlSeconds: ttlSeconds },
    );
  } catch {
    // The cache itself failing (eviction race, OOM) must still not 500 a page.
    incr("framique_render_read_total", { read: name, result: "cache_error" });
    return fallback;
  }
}

/** Drop one tenant's cached render-path reads after a write. */
export function invalidateRenderRead(prefix: string) {
  invalidate(prefix);
}
