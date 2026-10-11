/**
 * Hook circuit breaker — shared failure counts across isolates.
 *
 * The breaker (`FAILURE_THRESHOLD = 3`, `OPEN_MS = 60_000`, per plugin+hook)
 * must aggregate failures from every isolate, so a hostile endpoint trips the
 * breaker after 3 total failures — not 3 per isolate. The shared counter lives
 * behind the existing breaker interface with identical single-isolate
 * semantics; when the shared store is unavailable the process-local map is the
 * fallback (fail-closed locally, never fail-open globally).
 *
 * The `./redis.server` mock below is a faithful test double of the primitive:
 * it only stores counts with expiries. Threshold, window and open/reset
 * enforcement all stay in `plugin-hooks.server.ts` — nothing here skips it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sharedState = vi.hoisted(() => ({
  enabled: true,
  store: new Map<string, { count: number; expiresAt: number }>(),
}));

vi.mock("./redis.server", () => ({
  redisConfigured: () => sharedState.enabled,
  redisKey: (...parts: (string | number)[]) =>
    parts.map((p) => String(p)).join(":"),
  redisCommand: async (args: (string | number)[]) => {
    const [command, ...rest] = args;
    const op = String(command).toUpperCase();
    if (op === "GET") {
      const entry = sharedState.store.get(String(rest[0]));
      if (!entry) return { ok: true, value: null, outcome: "ok" };
      if (Date.now() > entry.expiresAt) {
        sharedState.store.delete(String(rest[0]));
        return { ok: true, value: null, outcome: "ok" };
      }
      return { ok: true, value: String(entry.count), outcome: "ok" };
    }
    if (op === "DEL") {
      let removed = 0;
      for (const key of rest.map(String))
        if (sharedState.store.delete(key)) removed += 1;
      return { ok: true, value: removed, outcome: "ok" };
    }
    if (op === "PTTL") {
      const entry = sharedState.store.get(String(rest[0]));
      if (!entry) return { ok: true, value: -2, outcome: "ok" };
      const ttl = entry.expiresAt - Date.now();
      if (ttl < 0) {
        sharedState.store.delete(String(rest[0]));
        return { ok: true, value: -2, outcome: "ok" };
      }
      return { ok: true, value: ttl, outcome: "ok" };
    }
    return { ok: false, value: null, outcome: "error" };
  },
  redisEval: async (
    script: string,
    keys: string[],
    argv: (string | number)[],
  ) => {
    // Double of the breaker's atomic INCR + PEXPIRE: increment the counter and
    // refresh its sliding window. Returns the new count, like Redis.
    if (!script.includes("INCR") || keys.length === 0)
      return { ok: false, value: null, outcome: "error" };
    const key = String(keys[0]);
    const ttlMs = Number(argv[0]);
    const cur = sharedState.store.get(key);
    const base = cur && Date.now() <= cur.expiresAt ? cur.count : 0;
    const count = base + 1;
    sharedState.store.set(key, { count, expiresAt: Date.now() + ttlMs });
    return { ok: true, value: count, outcome: "ok" };
  },
}));

const enqueueJobMock = vi.hoisted(() => vi.fn());
vi.mock("./job-queue.server", () => ({ enqueueJob: enqueueJobMock }));
// Queue-down by default: failures report raw error (existing contract).
enqueueJobMock.mockRejectedValue(new Error("queue_down"));

import {
  parseManifest,
  defaultSettings,
  type InstalledPlugin,
} from "./plugin-manifest";
import { breakerOpen, resetBreakers, runHook } from "./plugin-hooks.server";

const PLUGIN_ID = "breaker-probe";
const HOOK = "order.created" as const;

function installed(): InstalledPlugin {
  const verdict = parseManifest({
    id: PLUGIN_ID,
    name: "Breaker Probe",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["read_orders"],
    widgets: [],
    hooks: [HOOK],
    hooksUrl: "https://apps.example.com/hooks",
    settings: [],
    i18n: { en: {}, bn: {} },
  });
  if (!verdict.ok) throw new Error(verdict.errors.join(","));
  return {
    installId: "install-breaker",
    manifest: verdict.manifest,
    grantedScopes: ["read_orders"],
    settings: defaultSettings(verdict.manifest.settings),
    enabled: true,
  };
}

function stubFetch500() {
  const mock = vi.fn(async () => new Response("boom", { status: 500 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function stubFetchOk() {
  const mock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  sharedState.enabled = true;
  sharedState.store.clear();
  resetBreakers();
  vi.unstubAllGlobals();
  enqueueJobMock.mockReset();
  enqueueJobMock.mockRejectedValue(new Error("queue_down"));
  delete process.env.PLUGIN_HOOK_SECRET;
});

afterEach(() => {
  resetBreakers();
  vi.unstubAllGlobals();
  delete process.env.PLUGIN_HOOK_SECRET;
});

describe("shared hook circuit breaker", () => {
  it("trips after 3 failures and skips the 4th without fetch", async () => {
    const fetchMock = stubFetch500();
    const plugins = [installed()];
    for (let i = 0; i < 3; i += 1) {
      const out = await runHook(plugins, HOOK, {});
      expect(out[0]!.status).toBe("error");
    }
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(true);
    const out = await runHook(plugins, HOOK, {});
    expect(out[0]!.status).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stays open for 60s, then closes", async () => {
    stubFetch500();
    const plugins = [installed()];
    for (let i = 0; i < 3; i += 1) await runHook(plugins, HOOK, {});
    const now = Date.now();
    expect(await breakerOpen(PLUGIN_ID, HOOK, now)).toBe(true);
    // The shared window expiring does not reopen anything early, and the
    // local window still holds the circuit open on its own.
    sharedState.store.clear();
    expect(await breakerOpen(PLUGIN_ID, HOOK, now)).toBe(true);
    // Generous margin past the window: the last failure predates `now`, so
    // both windows have certainly elapsed and the circuit is closed.
    expect(await breakerOpen(PLUGIN_ID, HOOK, now + 61_000)).toBe(false);
  });

  it("resets on success — shared and local counts clear", async () => {
    stubFetch500();
    const plugins = [installed()];
    await runHook(plugins, HOOK, {});
    await runHook(plugins, HOOK, {});
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(false);
    stubFetchOk();
    const ok = await runHook(plugins, HOOK, {});
    expect(ok[0]!.status).toBe("ok");
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(false);
    // The success deleted the shared counter, not just the local map.
    expect(sharedState.store.size).toBe(0);
    // Two more failures must NOT trip: the count restarted from zero.
    const fetchMock = stubFetch500();
    fetchMock.mockClear();
    const first = await runHook(plugins, HOOK, {});
    const second = await runHook(plugins, HOOK, {});
    expect(first[0]!.status).toBe("error");
    expect(second[0]!.status).toBe("error");
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("multi-instance counts aggregate: 2 failures here + 1 there trips", async () => {
    stubFetch500();
    const plugins = [installed()];
    // Isolate A records two failures against the shared store.
    await runHook(plugins, HOOK, {});
    await runHook(plugins, HOOK, {});
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(false);
    // Simulate moving to a fresh isolate: process-local state is gone, the
    // shared store persists. resetBreakers() only clears the local map.
    resetBreakers();
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(false);
    // Isolate B records the third failure. The old process-local breaker
    // would need two more; the shared breaker is already tripped.
    const third = await runHook(plugins, HOOK, {});
    expect(third[0]!.status).toBe("error");
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(true);
    const counts = [...sharedState.store.values()].map((e) => e.count);
    expect(counts).toEqual([3]);
    // The next emission is skipped without touching the network.
    const fetchMock = stubFetch500();
    fetchMock.mockClear();
    const out = await runHook(plugins, HOOK, {});
    expect(out[0]!.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a fresh isolate honors a shared trip within the same 60s window", async () => {
    stubFetch500();
    const plugins = [installed()];
    // Isolate A trips the breaker on its own.
    for (let i = 0; i < 3; i += 1) await runHook(plugins, HOOK, {});
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(true);
    // Isolate B starts with no local state at all, yet sees the open circuit
    // without recording a single local failure.
    resetBreakers();
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(true);
    // The window is anchored to the shared failures, not to first sight: once
    // both windows have elapsed, the fresh isolate closes too.
    const now = Date.now();
    sharedState.store.clear();
    expect(await breakerOpen(PLUGIN_ID, HOOK, now + 61_000)).toBe(false);
  });

  it("falls back to the local breaker when the shared store is unavailable", async () => {
    sharedState.enabled = false;
    const fetchMock = stubFetch500();
    const plugins = [installed()];
    for (let i = 0; i < 3; i += 1) {
      const out = await runHook(plugins, HOOK, {});
      expect(out[0]!.status).toBe("error");
    }
    expect(await breakerOpen(PLUGIN_ID, HOOK)).toBe(true);
    const out = await runHook(plugins, HOOK, {});
    expect(out[0]!.status).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Recovery is local too: one success reopens the circuit.
    stubFetchOk();
    resetBreakers();
    const ok = await runHook(plugins, HOOK, {});
    expect(ok[0]!.status).toBe("ok");
  });
});
