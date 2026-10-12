/**
 * Phase 5 — server extension points.
 *
 * Plugin code never runs in our process. A hook is a queued outbound POST to
 * the plugin's declared HTTPS endpoint, wrapped in a timeout and a per-plugin
 * circuit breaker. A slow, failing or hostile plugin can therefore never block
 * cart calculation, checkout validation or order creation: the call is
 * abandoned and the core result stands.
 */

import { incr, log, observe } from "./observability.server";
import { EgressError, fetchWithEgressGuard } from "./egress-fetch";
import type { EgressTransport } from "./egress-fetch";
export type { EgressTransport };
import {
  isAllowedHooksUrl,
  parseManifest,
  type InstalledPlugin,
  type ServerHook,
} from "./plugin-manifest";
import {
  computeSignature,
  signatureHeader,
  SIGNATURE_HEADER,
} from "./webhook-signing";
import { hookAllowed } from "./scope-adapter";

export const HOOK_TIMEOUT_MS = 800;
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;

type BreakerState = { failures: number; openedAt: number };
const breakers = new Map<string, BreakerState>();

function breakerKey(pluginId: string, hook: ServerHook) {
  return `${pluginId}:${hook}`;
}

/* Shared failure counts (multi-isolate aggregation).
 *
 * The local map above is per-isolate: on multi-isolate deployments each
 * isolate counted its own 3 failures, so a hostile endpoint earned 3×N
 * attempts. The shared counter fixes that without a migration, reusing the
 * optional Redis client (`redis.server`: shared window across isolates, never
 * a correctness dependency):
 *
 *  - Redis configured: every failure INCRs a shared key (one atomic Lua
 *    INCR + PEXPIRE with a sliding 60s window, matching the local semantics
 *    below) and every check also reads it. Either side reaching 3 opens the
 *    breaker on every isolate. Redis faults degrade to the local map — they
 *    never fail open.
 *  - Redis unconfigured: the shared helpers return null and the local map
 *    decides alone, byte-identical to the old behavior.
 */
const BREAKER_WINDOW_MS = OPEN_MS;
const BREAKER_INCR_LUA = `
local count = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return count
`;

async function sharedBreakerIncr(
  pluginId: string,
  hook: ServerHook,
): Promise<number | null> {
  try {
    const { redisConfigured, redisEval, redisKey } =
      await import("./redis.server");
    if (!redisConfigured()) return null;
    const res = await redisEval(
      BREAKER_INCR_LUA,
      [redisKey("plugin-hook-breaker", pluginId, hook)],
      [BREAKER_WINDOW_MS],
    );
    if (!res.ok) return null;
    const count = Number(res.value);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

async function sharedBreakerCount(
  pluginId: string,
  hook: ServerHook,
): Promise<number | null> {
  try {
    const { redisConfigured, redisCommand, redisKey } =
      await import("./redis.server");
    if (!redisConfigured()) return null;
    const res = await redisCommand([
      "GET",
      redisKey("plugin-hook-breaker", pluginId, hook),
    ]);
    if (!res.ok || res.value === null || res.value === undefined) return null;
    const count = Number(res.value);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

/**
 * Milliseconds until the shared counter's window expires (`null` when the key
 * is missing, has no expiry, or the store is unavailable). Because every
 * failure refreshes the key's TTL to the full window, `lastFailure = now -
 * (OPEN_MS - ttl)` — letting a fresh isolate reconstruct the exact window
 * instead of anchoring it at first sight.
 */
async function sharedBreakerTtl(
  pluginId: string,
  hook: ServerHook,
): Promise<number | null> {
  try {
    const { redisConfigured, redisCommand, redisKey } =
      await import("./redis.server");
    if (!redisConfigured()) return null;
    const res = await redisCommand([
      "PTTL",
      redisKey("plugin-hook-breaker", pluginId, hook),
    ]);
    if (!res.ok) return null;
    const ttl = Number(res.value);
    return Number.isFinite(ttl) && ttl >= 0 ? ttl : null;
  } catch {
    return null;
  }
}

async function sharedBreakerClear(
  pluginId: string,
  hook: ServerHook,
): Promise<void> {
  try {
    const { redisConfigured, redisCommand, redisKey } =
      await import("./redis.server");
    if (!redisConfigured()) return;
    await redisCommand([
      "DEL",
      redisKey("plugin-hook-breaker", pluginId, hook),
    ]);
  } catch {
    // The local map below is already cleared; a leftover shared count stays
    // fail-closed until its window expires.
  }
}

export async function breakerOpen(
  pluginId: string,
  hook: ServerHook,
  now = Date.now(),
): Promise<boolean> {
  const key = breakerKey(pluginId, hook);
  const state = breakers.get(key);
  if (state && state.failures >= FAILURE_THRESHOLD) {
    if (now - state.openedAt > OPEN_MS) {
      breakers.delete(key);
    } else {
      return true;
    }
  }
  // Multi-isolate aggregation: another isolate may have tripped the shared
  // counter while this one saw few (or no) failures. An unavailable shared
  // store leaves the local verdict standing (identical to the old behavior).
  const shared = await sharedBreakerCount(pluginId, hook);
  if (shared !== null && shared >= FAILURE_THRESHOLD) {
    const local = breakers.get(key);
    // Anchor the open window to the shared counter's last failure (derived
    // from its TTL), so every isolate observes the same 60s window. A missing
    // TTL anchors at first sight instead (fail-closed, bounded by one window).
    // Reads never slide the window: only recordFailure moves openedAt.
    const ttl = await sharedBreakerTtl(pluginId, hook);
    const sharedOpenedAt =
      ttl !== null ? now - (OPEN_MS - Math.min(ttl, OPEN_MS)) : now;
    const failures = Math.max(local?.failures ?? 0, shared);
    const openedAt = local
      ? Math.max(local.openedAt, sharedOpenedAt)
      : sharedOpenedAt;
    breakers.set(key, { failures, openedAt });
    return true;
  }
  return false;
}

async function recordFailure(
  pluginId: string,
  hook: ServerHook,
  now = Date.now(),
) {
  const key = breakerKey(pluginId, hook);
  const state = breakers.get(key) ?? { failures: 0, openedAt: now };
  state.failures += 1;
  state.openedAt = now;
  breakers.set(key, state);
  // Aggregate across isolates (best-effort). The local map above is already
  // recorded, so a shared-store fault changes nothing locally. Reconciling
  // the high-water mark keeps a degraded-then-recovered isolate fail-closed.
  const shared = await sharedBreakerIncr(pluginId, hook);
  if (shared !== null && shared > state.failures) state.failures = shared;
}

async function recordSuccess(pluginId: string, hook: ServerHook) {
  breakers.delete(breakerKey(pluginId, hook));
  // Reset the shared counter so the next failure starts from zero — the same
  // reset the local map above just performed. Best-effort: a fault leaves the
  // shared count in place (fail-closed) until its window expires.
  await sharedBreakerClear(pluginId, hook);
}

/**
 * Test seam — the local breaker map is process state, so suites must be able
 * to reset it. Shared Redis counters expire via TTL; suites that double the
 * shared store reset the double directly.
 */
export function resetBreakers() {
  breakers.clear();
}

export type HookOutcome = {
  pluginId: string;
  hook: ServerHook;
  status:
    | "ok"
    | "timeout"
    | "error"
    | "skipped"
    | "skipped:scope"
    | "queued"
    | "failed"
    | "dead_letter";
  ms: number;
  result?: unknown;
};

function simpleHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

async function callOne(
  plugin: InstalledPlugin,
  hook: ServerHook,
  payload: unknown,
  timeoutMs: number,
  transport?: EgressTransport,
): Promise<HookOutcome> {
  const started = Date.now();
  if (
    !plugin.enabled ||
    !plugin.manifest.hooks.includes(hook) ||
    !plugin.manifest.hooksUrl
  ) {
    return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
  }
  if (await breakerOpen(plugin.manifest.id, hook)) {
    return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
  }
  if (!hookAllowed(hook, plugin.grantedScopes)) {
    incr("framique_plugin_hook_total", { hook, status: "skipped:scope" });
    return {
      pluginId: plugin.manifest.id,
      hook,
      status: "skipped:scope",
      ms: 0,
    };
  }
  // Egress guard (defense in depth behind the manifest gate): a stored
  // install predating the gate — or a row written around it — must still
  // never POST to literal-IP / private-range / metadata / wildcard-DNS
  // hosts. Refused without fetch and without queueing (no retry).
  const egress = isAllowedHooksUrl(plugin.manifest.hooksUrl);
  if (!egress.ok) {
    log("warn", "plugin.hook.egress_denied", {
      hook,
      plugin: plugin.manifest.id,
      reason: egress.reason,
    });
    return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
  }
  // R2-3: an unset secret is loud, never silent. Always warn + metric;
  // outside tests fail closed so no unsigned callback ever leaves us.
  const hookSecret = process.env.PLUGIN_HOOK_SECRET;
  if (!hookSecret) {
    log("warn", "plugin.hook.unsigned_secret", {
      hook,
      plugin: plugin.manifest.id,
    });
    incr("framique_plugin_hook_total", { hook, status: "unsigned" });
    if (process.env.NODE_ENV !== "test" && !process.env.VITEST)
      throw new Error("plugin_hook_secret_missing");
  }
  let body = "";
  // R2-8: stable vendor-visible delivery identity. Computed from the exact
  // bytes POSTed so the live attempt, the queued retry, and any redelivery
  // all carry the same `x-framique-delivery` value — vendors dedupe on it.
  // (At-least-once transport; the header is the dedupe key, not a mutex.)
  let deliveryId = "";
  try {
    body = JSON.stringify({ hook, payload, settings: plugin.settings });
    deliveryId = `hook:${plugin.manifest.id}:${hook}:${simpleHash(body)}`;
    const secret = process.env.PLUGIN_HOOK_SECRET;
    let signature = "";
    if (secret) {
      const ts = Math.floor(Date.now() / 1000);
      const mac = await computeSignature(secret, ts, body);
      signature = signatureHeader(ts, [mac]);
    }
    const res = (
      await fetchWithEgressGuard(plugin.manifest.hooksUrl, {
        timeoutMs,
        guard: (u) => isAllowedHooksUrl(u),
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-framique-hook": hook,
          "x-framique-plugin": plugin.manifest.id,
          "x-framique-delivery": deliveryId,
          ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
        },
        body,
        ...(transport ? { transport } : {}),
      })
    ).response;
    if (!res.ok) throw new Error(`status_${res.status}`);
    const result = await res.json().catch(() => null);
    await recordSuccess(plugin.manifest.id, hook);
    return {
      pluginId: plugin.manifest.id,
      hook,
      status: "ok",
      ms: Date.now() - started,
      result,
    };
  } catch (err) {
    // Deterministic egress refusals (redirect chains escaping to
    // metadata/private hosts, DNS rebinding, redirect loops): no POST ever
    // left us, so there is nothing to retry — skip like the pre-check above
    // instead of enqueueing a job that could only refuse again.
    if (err instanceof EgressError && err.code !== "egress_timeout") {
      log("warn", "plugin.hook.egress_denied", {
        hook,
        plugin: plugin.manifest.id,
        reason: err.reason,
      });
      return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
    }
    await recordFailure(plugin.manifest.id, hook);
    const timedOut =
      (err as Error)?.name === "AbortError" ||
      (err instanceof EgressError && err.code === "egress_timeout");
    try {
      const { enqueueJob } = await import("./job-queue.server");
      const key =
        deliveryId || `hook:${plugin.manifest.id}:${hook}:${simpleHash(body)}`;
      await enqueueJob({
        queue: "plugins",
        name: "plugin.hook.deliver",
        payload: {
          pluginId: plugin.manifest.id,
          installId: plugin.installId,
          hook,
          body,
          hooksUrl: plugin.manifest.hooksUrl,
          deliveryId: key,
        },
        merchantId: null,
        idempotencyKey: key,
      });
      return {
        pluginId: plugin.manifest.id,
        hook,
        status: "queued",
        ms: Date.now() - started,
      };
    } catch {
      return {
        pluginId: plugin.manifest.id,
        hook,
        status: timedOut ? "timeout" : "error",
        ms: Date.now() - started,
      };
    }
  }
}

/**
 * Runs every subscriber of a hook in parallel. Never throws or rejects except
 * fail-closed `plugin_hook_secret_missing` when `PLUGIN_HOOK_SECRET` is unset
 * outside tests (no unsigned callback ever leaves us). Host flows stay
 * protected because every emission site awaits inside try/catch.
 */
export async function runHook(
  installed: readonly InstalledPlugin[],
  hook: ServerHook,
  payload: unknown,
  timeoutMs = HOOK_TIMEOUT_MS,
  transport?: EgressTransport,
): Promise<HookOutcome[]> {
  const subscribers = installed.filter((p) => p.manifest.hooks.includes(hook));
  if (!subscribers.length) return [];
  const outcomes = await Promise.all(
    subscribers.map((p) => callOne(p, hook, payload, timeoutMs, transport)),
  );
  // Phase 8.7: timeout and skip rate per hook is how an operator sees a plugin
  // degrading before merchants report it.
  for (const outcome of outcomes) {
    incr("framique_plugin_hook_total", { hook, status: outcome.status });
    if (outcome.status !== "skipped" && outcome.status !== "skipped:scope")
      observe("framique_plugin_hook_ms", outcome.ms, { hook });
  }
  return outcomes;
}

/** Dequeues one previously timed-out/failed delivery. Breaker still gates. */
export type QueuedParkReason =
  | "not_installed"
  | "disabled"
  | "suspended"
  | "killed"
  | "unsubscribed"
  | "scope_revoked"
  | "hooks_url_rotated";

/**
 * Minimal install-state source for the queued-delivery recheck. The queue
 * worker always passes the admin client; it is optional only so unit tests
 * can assert the raw redelivery contract without install state.
 */
export type QueuedHookDb = {
  from: (table: string) => any;
};

export type DeliverQueuedHookDeps = {
  db?: QueuedHookDb | null;
  /** Test seam: injected transport for the guarded POST. */
  transport?: EgressTransport;
};

type QueuedInstallRow = {
  id: string;
  plugin_id: string;
  manifest: unknown;
  scopes: string[] | null;
  enabled: boolean | null;
  suspended: boolean | null;
};

/**
 * Re-resolves install state before a queued POST. Jobs carry
 * `merchantId: null`, so the row is resolved by the queued `installId`
 * (`plugin_state.id`) — never by `pluginId` alone when an `installId` is
 * present, otherwise a retry could POST one merchant's PII-bearing body to
 * another merchant's install of the same plugin.
 *
 * Definitive policy denials park the row (`ok:false` + reason: the worker
 * marks the job done WITHOUT a POST and WITHOUT a retry). Transient DB
 * failures throw so the queue retries later — never fail open, never drop.
 */
async function recheckQueuedDelivery(
  db: QueuedHookDb,
  opts: {
    pluginId: string;
    installId: string;
    hook: ServerHook;
    hooksUrl: string;
  },
): Promise<{ ok: true; hooksUrl: string } | { ok: false; reason: QueuedParkReason }> {
  let row: QueuedInstallRow | null = null;
  if (opts.installId) {
    const { data } = await db
      .from("plugin_state")
      .select("id, plugin_id, manifest, scopes, enabled, suspended")
      .eq("id", opts.installId)
      .maybeSingle();
    row = (data as QueuedInstallRow | null) ?? null;
    // The exact install is gone (uninstalled, purged, or never existed):
    // cancel. Falling back to another merchant's row would cross PII.
    if (!row) return { ok: false, reason: "not_installed" };
  } else {
    // Legacy rows without an installId: single-row match only.
    const { data } = await db
      .from("plugin_state")
      .select("id, plugin_id, manifest, scopes, enabled, suspended")
      .eq("plugin_id", opts.pluginId)
      .maybeSingle();
    row = (data as QueuedInstallRow | null) ?? null;
    if (!row) return { ok: false, reason: "not_installed" };
  }
  if (row.enabled === false) return { ok: false, reason: "disabled" };
  if (row.suspended === true) return { ok: false, reason: "suspended" };
  // Kill switch is authoritative even if the per-merchant suspend loop lagged.
  const { data: kill } = await db
    .from("plugin_kill_switch")
    .select("disabled")
    .eq("plugin_id", row.plugin_id || opts.pluginId)
    .maybeSingle();
  if ((kill as { disabled?: unknown } | null)?.disabled === true)
    return { ok: false, reason: "killed" };
  const verdict = parseManifest(row.manifest);
  if (!verdict.ok) return { ok: false, reason: "not_installed" };
  const manifest = verdict.manifest;
  if (!manifest.hooks.includes(opts.hook))
    return { ok: false, reason: "unsubscribed" };
  if (!hookAllowed(opts.hook, row.scopes ?? []))
    return { ok: false, reason: "scope_revoked" };
  const currentUrl = (manifest.hooksUrl ?? "").trim();
  // The endpoint rotated since enqueue: never POST PII to the stale URL.
  if (!currentUrl || currentUrl !== opts.hooksUrl)
    return { ok: false, reason: "hooks_url_rotated" };
  return { ok: true, hooksUrl: currentUrl };
}

export async function deliverQueuedHook(
  payload: Record<string, unknown>,
  deps: DeliverQueuedHookDeps = {},
) {
  const hook = payload["hook"] as Parameters<typeof callOne>[1];
  const body = String(payload["body"] ?? "");
  const hooksUrl = String(payload["hooksUrl"] ?? "");
  const pluginId = String(payload["pluginId"] ?? "");
  const installId = String(payload["installId"] ?? "");
  if (!hooksUrl || !hook) return { ok: false, reason: "malformed" };
  // Egress guard for queued redelivery: same decision as the live path and
  // the manifest gate. Refused without fetch (no throw, so no retry).
  const egress = isAllowedHooksUrl(hooksUrl);
  if (!egress.ok) {
    log("warn", "plugin.hook.egress_denied", {
      hook,
      plugin: pluginId,
      reason: egress.reason,
    });
    return { ok: false, reason: "egress_denied" };
  }
  if (await breakerOpen(pluginId, hook))
    return { ok: false, reason: "breaker_open" };
  // Security recheck: disable / suspend / kill-switch / unsubscribe /
  // scope-narrow / hooksUrl rotation after enqueue must park the retry —
  // the queued body may carry PII and the queued URL may be stale.
  let targetUrl = hooksUrl;
  if (deps.db) {
    const recheck = await recheckQueuedDelivery(deps.db, {
      pluginId,
      installId,
      hook,
      hooksUrl,
    });
    if (!recheck.ok) {
      incr("framique_plugin_hook_total", {
        hook,
        status: "parked",
        reason: recheck.reason,
      });
      return { ok: false, reason: recheck.reason };
    }
    targetUrl = recheck.hooksUrl;
  }
  // R2-8: the retry carries the ORIGINAL delivery id when the queue row has
  // one (enqueue path always sets it); rows enqueued before this field
  // existed fall back to recomputing from the stored bytes — same function,
  // same inputs, same key.
  const deliveryId =
    typeof payload["deliveryId"] === "string" && payload["deliveryId"]
      ? String(payload["deliveryId"])
      : `hook:${pluginId}:${hook}:${simpleHash(body)}`;
  const secret = process.env.PLUGIN_HOOK_SECRET;
  // R2-3 (queued half): same loud guard as the live path; a throw here
  // reaches the worker's error handling — never an unsigned redelivery.
  if (!secret) {
    log("warn", "plugin.hook.unsigned_secret", { hook, plugin: pluginId });
    incr("framique_plugin_hook_total", { hook, status: "unsigned" });
    if (process.env.NODE_ENV !== "test" && !process.env.VITEST)
      throw new Error("plugin_hook_secret_missing");
  }
  const ts = Math.floor(Date.now() / 1000);
  const signature = secret
    ? signatureHeader(ts, [await computeSignature(secret, ts, body)])
    : "";
  // Same 800ms deadline as the live path (previously unbounded) plus the
  // egress guard on the initial URL and every redirect hop.
  let res: Response;
  try {
    ({ response: res } = await fetchWithEgressGuard(targetUrl, {
      timeoutMs: HOOK_TIMEOUT_MS,
      guard: (u) => isAllowedHooksUrl(u),
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-framique-hook": hook,
        "x-framique-plugin": pluginId,
        "x-framique-delivery": deliveryId,
        ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
      },
      body,
      ...(deps.transport ? { transport: deps.transport } : {}),
    }));
  } catch (err) {
    // Timeout (and any other network error): throw so the queue retries
    // toward dead_letter, as before. Deterministic refusals park instead —
    // no POST happened and a retry could only refuse again.
    if (err instanceof EgressError && err.code !== "egress_timeout") {
      log("warn", "plugin.hook.egress_denied", {
        hook,
        plugin: pluginId,
        reason: err.reason,
      });
      return { ok: false, reason: err.code };
    }
    throw err;
  }
  if (!res.ok)
    throw Object.assign(new Error(`status_${res.status}`), {
      status: res.status,
    });
  incr("framique_plugin_hook_total", { hook, status: "delivered" });
  return { ok: true, installId };
}
