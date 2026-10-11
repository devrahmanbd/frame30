/**
 * Bridge flood guard — TDD: a malicious frame must not be able to flood the
 * host with async work + setState per message (DoS), nor reuse a client-chosen
 * `id` to clobber in-flight replies. Pure state machine so it is unit-testable
 * under node (no jsdom); the `WidgetSandbox` host handler delegates to it.
 */
import { describe, expect, it } from "vitest";
import {
  answerWithTimeout,
  BRIDGE_MAX_MESSAGES,
  BRIDGE_WINDOW_MS,
  BridgeTimeoutError,
  checkFloodGuard,
  createFloodGuard,
  DEFAULT_CALL_TIMEOUT_MS,
  resetFloodGuard,
  withCallTimeout,
  type BridgeAnswer,
  type BridgeTimers,
} from "./bridge-flood-guard";

describe("bridge flood guard", () => {
  it("allows up to 30 messages per rolling 10s window", () => {
    const g = createFloodGuard();
    for (let i = 0; i < BRIDGE_MAX_MESSAGES; i++) {
      expect(checkFloodGuard(g, `id-${i}`, 0)).toEqual({ ok: true });
    }
    expect(checkFloodGuard(g, "id-30", 0)).toEqual({
      ok: false,
      error: "sandbox.rate_limited",
    });
  });

  it("slides the window: old timestamps stop counting after 10s", () => {
    const g = createFloodGuard();
    for (let i = 0; i < BRIDGE_MAX_MESSAGES; i++) {
      expect(checkFloodGuard(g, `id-${i}`, 0).ok).toBe(true);
    }
    // At exactly the window edge the burst has aged out.
    expect(checkFloodGuard(g, "fresh", BRIDGE_WINDOW_MS)).toEqual({
      ok: true,
    });
  });

  it("rejects duplicate ids within the frame lifetime", () => {
    const g = createFloodGuard();
    expect(checkFloodGuard(g, "7", 0)).toEqual({ ok: true });
    expect(checkFloodGuard(g, "7", 1)).toEqual({
      ok: false,
      error: "sandbox.duplicate_id",
    });
  });

  it("does not spend rate budget on duplicates", () => {
    const g = createFloodGuard();
    expect(checkFloodGuard(g, "dup", 0).ok).toBe(true);
    for (let i = 0; i < 10; i++) {
      expect(checkFloodGuard(g, "dup", i + 1)).toEqual({
        ok: false,
        error: "sandbox.duplicate_id",
      });
    }
    // Only one slot consumed despite 11 arrivals sharing one id.
    for (let i = 0; i < BRIDGE_MAX_MESSAGES - 1; i++) {
      expect(checkFloodGuard(g, `other-${i}`, 20).ok).toBe(true);
    }
    expect(checkFloodGuard(g, "last", 20)).toEqual({
      ok: false,
      error: "sandbox.rate_limited",
    });
  });

  it("resets both ids and window on frame identity change", () => {
    const g = createFloodGuard();
    for (let i = 0; i < BRIDGE_MAX_MESSAGES; i++) {
      checkFloodGuard(g, `id-${i}`, 0);
    }
    expect(checkFloodGuard(g, "blocked", 0).ok).toBe(false);
    resetFloodGuard(g);
    expect(checkFloodGuard(g, "id-0", 0)).toEqual({ ok: true });
  });

  it("pins the documented per-call budget (5s; no mount-liveness constant)", () => {
    expect(DEFAULT_CALL_TIMEOUT_MS).toBe(5_000);
  });
});

describe("bridge call timeout", () => {
  /** Deterministic clock: timeouts only fire when the test says so. */
  const rig = () => {
    const pending = new Map<number, () => void>();
    let next = 1;
    let cancels = 0;
    const timers: BridgeTimers = {
      schedule: (cb, _ms) => {
        const h = next++;
        pending.set(h, cb);
        return h;
      },
      cancel: (h) => {
        if (pending.delete(h as number)) cancels++;
      },
    };
    return {
      timers,
      pending,
      cancels: () => cancels,
      fireAll: () => {
        const cbs = [...pending.values()];
        pending.clear();
        cbs.forEach((cb) => cb());
      },
    };
  };
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  it("resolves in-time work and releases its timer", async () => {
    const r = rig();
    const out = await withCallTimeout(Promise.resolve("ok"), 50, r.timers);
    expect(out).toBe("ok");
    expect(r.pending.size).toBe(0);
    expect(r.cancels()).toBe(1);
  });

  it("rejects slow work with sandbox.timeout and drops the late resolution", async () => {
    const r = rig();
    const d = deferred<string>();
    const seen: string[] = [];
    const raced = withCallTimeout(d.promise, 50, r.timers);
    void raced.then(
      (v) => seen.push(`resolved:${v}`),
      (e) =>
        seen.push(`rejected:${e instanceof Error ? e.message : String(e)}`),
    );
    r.fireAll();
    await expect(raced).rejects.toBeInstanceOf(BridgeTimeoutError);
    await flush();
    expect(seen).toEqual(["rejected:sandbox.timeout"]);
    // The host work finally settles — after retirement it must not land.
    d.resolve("late-value");
    await flush();
    await flush();
    expect(seen).toEqual(["rejected:sandbox.timeout"]);
    expect(r.pending.size).toBe(0);
  });

  it("drops a late rejection too, so no unhandled rejection escapes", async () => {
    const r = rig();
    const d = deferred<string>();
    const raced = withCallTimeout(d.promise, 50, r.timers);
    const settled = raced.then(
      () => "resolved",
      () => "rejected",
    );
    r.fireAll();
    await expect(settled).resolves.toBe("rejected");
    d.reject(new Error("late-boom"));
    await flush();
    await flush();
    await expect(settled).resolves.toBe("rejected");
  });

  it("lets already-settled work win the race even with a 0ms budget", async () => {
    const r = rig();
    await expect(
      withCallTimeout(Promise.resolve("x"), 0, r.timers),
    ).resolves.toBe("x");
    expect(r.cancels()).toBe(1);
  });

  it("maps the timeout to the sandbox.timeout answer shape, once", async () => {
    const r = rig();
    const d = deferred<BridgeAnswer>();
    const p = answerWithTimeout(d.promise, 50, r.timers);
    r.fireAll();
    await expect(p).resolves.toEqual({ error: "sandbox.timeout" });
    d.resolve({ result: "late" });
    await flush();
    await expect(p).resolves.toEqual({ error: "sandbox.timeout" });
  });

  it("passes non-timeout answers through and rethrows foreign rejections", async () => {
    const r = rig();
    await expect(
      answerWithTimeout(Promise.resolve({ result: 1 }), 50, r.timers),
    ).resolves.toEqual({ result: 1 });
    const d = deferred<BridgeAnswer>();
    const p = answerWithTimeout(d.promise, 50, r.timers);
    const boom = new Error("boom");
    d.reject(boom);
    await expect(p).rejects.toBe(boom);
    expect(r.pending.size).toBe(0);
  });
});
