/**
 * Phase 5 — server extension points.
 *
 * Plugin code never runs in our process. A hook is a queued outbound POST to
 * the plugin's declared HTTPS endpoint, wrapped in a timeout and a per-plugin
 * circuit breaker. A slow, failing or hostile plugin can therefore never block
 * cart calculation, checkout validation or order creation: the call is
 * abandoned and the core result stands.
 */

import { incr, observe } from "./observability.server";
import type { InstalledPlugin, ServerHook } from "./plugin-manifest";

export const HOOK_TIMEOUT_MS = 800;
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;

type BreakerState = { failures: number; openedAt: number };
const breakers = new Map<string, BreakerState>();

function breakerKey(pluginId: string, hook: ServerHook) {
  return `${pluginId}:${hook}`;
}

export function breakerOpen(pluginId: string, hook: ServerHook, now = Date.now()) {
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
  status: "ok" | "timeout" | "error" | "skipped";
  ms: number;
  result?: unknown;
};

async function callOne(
  plugin: InstalledPlugin,
  hook: ServerHook,
  payload: unknown,
  timeoutMs: number,
): Promise<HookOutcome> {
  const started = Date.now();
  if (!plugin.enabled || !plugin.manifest.hooks.includes(hook) || !plugin.manifest.hooksUrl) {
    return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
  }
  if (breakerOpen(plugin.manifest.id, hook)) {
    return { pluginId: plugin.manifest.id, hook, status: "skipped", ms: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(plugin.manifest.hooksUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-framique-hook": hook,
        "x-framique-plugin": plugin.manifest.id,
      },
      body: JSON.stringify({ hook, payload, settings: plugin.settings }),
    });
    if (!res.ok) throw new Error(`status_${res.status}`);
    const result = await res.json().catch(() => null);
    recordSuccess(plugin.manifest.id, hook);
    return { pluginId: plugin.manifest.id, hook, status: "ok", ms: Date.now() - started, result };
  } catch (err) {
    recordFailure(plugin.manifest.id, hook);
    const timedOut = (err as Error)?.name === "AbortError";
    return {
      pluginId: plugin.manifest.id,
      hook,
      status: timedOut ? "timeout" : "error",
      ms: Date.now() - started,
    };
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
  const outcomes = await Promise.all(subscribers.map((p) => callOne(p, hook, payload, timeoutMs)));
  // Phase 8.7: timeout and skip rate per hook is how an operator sees a plugin
  // degrading before merchants report it.
  for (const outcome of outcomes) {
    incr("framique_plugin_hook_total", { hook, status: outcome.status });
    if (outcome.status !== "skipped") observe("framique_plugin_hook_ms", outcome.ms, { hook });
  }
  return outcomes;
}
