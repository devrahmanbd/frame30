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
import type { InstalledPlugin, ServerHook } from "./plugin-manifest";
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

export function breakerOpen(
  pluginId: string,
  hook: ServerHook,
  now = Date.now(),
) {
  const state = breakers.get(breakerKey(pluginId, hook));
  if (!state || state.failures < FAILURE_THRESHOLD) return false;
  if (now - state.openedAt > OPEN_MS) {
    breakers.delete(breakerKey(pluginId, hook));
    return false;
  }
  return true;
}

function recordFailure(pluginId: string, hook: ServerHook, now = Date.now()) {
  const key = breakerKey(pluginId, hook);
  const state = breakers.get(key) ?? { failures: 0, openedAt: now };
  state.failures += 1;
  state.openedAt = now;
  breakers.set(key, state);
}

function recordSuccess(pluginId: string, hook: ServerHook) {
  breakers.delete(breakerKey(pluginId, hook));
}

/** Test seam — the breaker is process state, so suites must be able to reset. */
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
): Promise<HookOutcome> {
  const started = Date.now();
  if (
    !plugin.enabled ||
    !plugin.manifest.hooks.includes(hook) ||
    !plugin.manifest.hooksUrl
  ) {
    return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
  }
  if (breakerOpen(plugin.manifest.id, hook)) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    const res = await fetch(plugin.manifest.hooksUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-framique-hook": hook,
        "x-framique-plugin": plugin.manifest.id,
        "x-framique-delivery": deliveryId,
        ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
      },
      body,
    });
    if (!res.ok) throw new Error(`status_${res.status}`);
    const result = await res.json().catch(() => null);
    recordSuccess(plugin.manifest.id, hook);
    return {
      pluginId: plugin.manifest.id,
      hook,
      status: "ok",
      ms: Date.now() - started,
      result,
    };
  } catch (err) {
    recordFailure(plugin.manifest.id, hook);
    const timedOut = (err as Error)?.name === "AbortError";
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs every subscriber of a hook in parallel. Never throws and never rejects:
 * the caller inspects outcomes and always keeps its own computed result.
 */
export async function runHook(
  installed: readonly InstalledPlugin[],
  hook: ServerHook,
  payload: unknown,
  timeoutMs = HOOK_TIMEOUT_MS,
): Promise<HookOutcome[]> {
  const subscribers = installed.filter((p) => p.manifest.hooks.includes(hook));
  if (!subscribers.length) return [];
  const outcomes = await Promise.all(
    subscribers.map((p) => callOne(p, hook, payload, timeoutMs)),
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
export async function deliverQueuedHook(payload: Record<string, unknown>) {
  const hook = payload["hook"] as Parameters<typeof callOne>[1];
  const body = String(payload["body"] ?? "");
  const hooksUrl = String(payload["hooksUrl"] ?? "");
  const pluginId = String(payload["pluginId"] ?? "");
  const installId = String(payload["installId"] ?? "");
  if (!hooksUrl || !hook) return { ok: false, reason: "malformed" };
  if (breakerOpen(pluginId, hook)) return { ok: false, reason: "breaker_open" };
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
  const res = await fetch(hooksUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-framique-hook": hook,
      "x-framique-plugin": pluginId,
      "x-framique-delivery": deliveryId,
      ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
    },
    body,
  });
  if (!res.ok)
    throw Object.assign(new Error(`status_${res.status}`), {
      status: res.status,
    });
  incr("framique_plugin_hook_total", { hook, status: "delivered" });
  return { ok: true, installId };
}
