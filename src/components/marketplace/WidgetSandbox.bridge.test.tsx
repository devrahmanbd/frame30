/**
 * Sandbox settings bridge — TDD: the host answers `plugin.settings` with the
 * merchant-validated values for exactly the plugin mounted in the frame.
 * Everything else still flows to the host `onCall`, and every denial shape
 * from `authorizeWidgetCall` is preserved.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  answerWidgetCall,
  FRAME_HTML,
  handleSandboxMessage,
  isMenusListCall,
  menusListSlot,
} from "./WidgetSandbox";
import {
  BRIDGE_MAX_MESSAGES,
  checkFloodGuard,
  createFloodGuard,
  type BridgeTimers,
} from "@/lib/bridge-flood-guard";

const SETTINGS = {
  phone_number: "8801712345678",
  greeting_message: "Hello!",
  button_position: "bottom-right",
};

const msg = (method: string, params?: unknown) => ({
  v: 1,
  id: "7",
  method,
  params,
});

describe("answerWidgetCall", () => {
  it("serves validated settings for plugin.settings with render_storefront", async () => {
    const out = await answerWidgetCall(msg("plugin.settings"), {
      settings: SETTINGS,
      granted: ["render_storefront"],
      onCall: async () => {
        throw new Error("must not delegate settings");
      },
    });
    expect(out).toEqual({ result: SETTINGS });
  });

  it("denies plugin.settings without the scope, even when values exist", async () => {
    const out = await answerWidgetCall(msg("plugin.settings"), {
      settings: SETTINGS,
      granted: ["read_orders"],
      onCall: async () => ({ ok: true }),
    });
    expect(out).toEqual({ error: "sandbox.scope_denied" });
  });

  it("delegates non-settings methods to onCall after authorization", async () => {
    const out = await answerWidgetCall(msg("shop.info", { fields: ["name"] }), {
      settings: SETTINGS,
      granted: ["read_shop", "render_storefront"],
      onCall: async (method, params) => ({ method, params }),
    });
    expect(out).toEqual({
      result: { method: "shop.info", params: { fields: ["name"] } },
    });
  });

  it("rejects unknown methods without calling onCall", async () => {
    let called = false;
    const out = await answerWidgetCall(msg("shop.delete"), {
      settings: SETTINGS,
      granted: ["render_storefront", "read_shop"],
      onCall: async () => {
        called = true;
        return {};
      },
    });
    expect(out).toEqual({ error: "sandbox.unknown_method" });
    expect(called).toBe(false);
  });

  it("returns empty settings object when the plugin stored none", async () => {
    const out = await answerWidgetCall(msg("plugin.settings"), {
      settings: undefined,
      granted: ["render_storefront"],
      onCall: async () => {
        throw new Error("must not delegate settings");
      },
    });
    expect(out).toEqual({ result: {} });
  });
});

describe("menus.list bridge — TRACK M fill points", () => {
  const rows = [{ id: "m1", label: "Women", href: "/c/women" }];

  it("serves host rows to plugins granted read_menus", async () => {
    let seen: unknown;
    const out = await answerWidgetCall(
      msg("menus.list", { slot: "menu_bar" }),
      {
        granted: ["read_menus", "render_storefront"],
        onCall: async (method, params) => {
          seen = { method, params };
          return rows;
        },
      },
    );
    expect(out).toEqual({ result: rows });
    expect(seen).toEqual({
      method: "menus.list",
      params: { slot: "menu_bar" },
    });
  });

  it("stays readable by default for storefront plugins without read_menus", async () => {
    const out = await answerWidgetCall(msg("menus.list"), {
      granted: ["render_storefront"],
      onCall: async () => rows,
    });
    expect(out).toEqual({ result: rows });
  });

  it("denies menus.list with no storefront grant at all", async () => {
    let called = false;
    const out = await answerWidgetCall(msg("menus.list"), {
      granted: ["read_orders"],
      onCall: async () => {
        called = true;
        return rows;
      },
    });
    expect(out).toEqual({ error: "sandbox.scope_denied" });
    expect(called).toBe(false);
  });

  it("rejects an unsanctioned fill point without calling the host", async () => {
    let called = false;
    const out = await answerWidgetCall(msg("menus.list", { slot: "sidebar" }), {
      granted: ["read_menus", "render_storefront"],
      onCall: async () => {
        called = true;
        return rows;
      },
    });
    expect(out).toEqual({ error: "sandbox.unknown_slot" });
    expect(called).toBe(false);
  });

  it("accepts every sanctioned fill point and slot-less reads", async () => {
    for (const slot of [
      "menu_bar",
      "menu_dropdown",
      "menu_drawer",
      undefined,
    ]) {
      const out = await answerWidgetCall(
        msg("menus.list", slot === undefined ? undefined : { slot }),
        {
          granted: ["render_storefront"],
          onCall: async () => rows,
        },
      );
      expect(out, String(slot)).toEqual({ result: rows });
    }
  });

  it("maps host failures to sandbox.host_error without leaking", async () => {
    const out = await answerWidgetCall(msg("menus.list"), {
      granted: ["render_storefront"],
      onCall: async () => {
        throw new Error("db down");
      },
    });
    expect(out).toEqual({ error: "db down" });
    const bare = await answerWidgetCall(msg("menus.list"), {
      granted: ["render_storefront"],
      onCall: async () => {
        throw "string-failure";
      },
    });
    expect(bare).toEqual({ error: "sandbox.host_error" });
  });

  it("classifies envelopes and slot params without touching scopes", () => {
    expect(isMenusListCall(msg("menus.list"))).toBe(true);
    expect(isMenusListCall(msg("shop.info"))).toBe(false);
    expect(isMenusListCall({ method: "menus.list" })).toBe(false);
    expect(menusListSlot(msg("menus.list", { slot: "menu_drawer" }))).toBe(
      "menu_drawer",
    );
    expect(menusListSlot(msg("menus.list"))).toBeUndefined();
    expect(menusListSlot(msg("menus.list", "junk"))).toBeUndefined();
  });
});

describe("handleSandboxMessage — flood / duplicate / oversize", () => {
  const ctxFor = (
    onCall: (method: string, params: unknown) => Promise<unknown>,
  ) => ({
    granted: ["read_shop", "render_storefront"],
    onCall,
  });

  it("answers the first 30 of a 40-message flood, rate-limits the rest", async () => {
    const onCall = vi.fn(async (method: string) => ({ method }));
    const guard = createFloodGuard();
    const ctx = ctxFor(onCall);
    const outs: ({ result: unknown } | { error: string })[] = [];
    for (let i = 0; i < 40; i++) {
      outs.push(
        await handleSandboxMessage(
          { v: 1, id: `flood-${i}`, method: "shop.info" },
          { ...ctx, guard, now: 0 },
        ),
      );
    }
    expect(outs.slice(0, 30)).toEqual(
      Array.from({ length: 30 }, () => ({ result: { method: "shop.info" } })),
    );
    expect(outs.slice(30)).toEqual(
      Array.from({ length: 10 }, () => ({
        error: "sandbox.rate_limited",
      })),
    );
    expect(onCall).toHaveBeenCalledTimes(30);
  });

  it("rejects a duplicate id without touching onCall again", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createFloodGuard();
    const ctx = ctxFor(onCall);
    const first = await handleSandboxMessage(
      { v: 1, id: "7", method: "shop.info" },
      { ...ctx, guard, now: 0 },
    );
    const dup = await handleSandboxMessage(
      { v: 1, id: "7", method: "shop.info" },
      { ...ctx, guard, now: 1 },
    );
    expect(first).toEqual({ result: { ok: true } });
    expect(dup).toEqual({ error: "sandbox.duplicate_id" });
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("maps oversize params to sandbox.oversize without calling onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await handleSandboxMessage(
      {
        v: 1,
        id: "big",
        method: "shop.info",
        params: { blob: "x".repeat(70 * 1024) },
      },
      { ...ctxFor(onCall), guard: createFloodGuard(), now: 0 },
    );
    expect(out).toEqual({ error: "sandbox.oversize" });
    expect(onCall).not.toHaveBeenCalled();
  });
});

describe("handleSandboxMessage — call timeout", () => {
  const never = () => new Promise<unknown>(() => {});
  const shopInfo = (id: string) => ({ v: 1, id, method: "shop.info" });
  const base = {
    granted: ["read_shop", "render_storefront"],
  } as const;
  /** Deterministic clock: timeouts only fire when the test says so. */
  const rig = () => {
    const pending = new Map<number, () => void>();
    let next = 1;
    const timers: BridgeTimers = {
      schedule: (cb, _ms) => {
        const h = next++;
        pending.set(h, cb);
        return h;
      },
      cancel: (h) => {
        pending.delete(h as number);
      },
    };
    return {
      timers,
      pending,
      fireAll: () => {
        const cbs = [...pending.values()];
        pending.clear();
        cbs.forEach((cb) => cb());
      },
    };
  };

  it("answers sandbox.timeout when onCall never settles", async () => {
    const out = await handleSandboxMessage(shopInfo("t1"), {
      ...base,
      onCall: never,
      guard: createFloodGuard(),
      timeoutMs: 20,
    });
    expect(out).toEqual({ error: "sandbox.timeout" });
  });

  it("still answers slow-but-finite calls (no false timeout)", async () => {
    const out = await handleSandboxMessage(shopInfo("t2"), {
      ...base,
      onCall: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true };
      },
      guard: createFloodGuard(),
      timeoutMs: 500,
    });
    expect(out).toEqual({ result: { ok: true } });
  });

  it("leaves normal calls alone under the 5s default budget", async () => {
    const out = await handleSandboxMessage(shopInfo("t3"), {
      ...base,
      onCall: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true };
      },
      guard: createFloodGuard(),
    });
    expect(out).toEqual({ result: { ok: true } });
  });

  it("retires a timed-out id: reuse is duplicate_id, the late value never lands", async () => {
    let release!: (v: unknown) => void;
    const gate = new Promise<unknown>((res) => {
      release = res;
    });
    const onCall = vi.fn(() => gate);
    const guard = createFloodGuard();
    const ctx = { ...base, onCall, guard, timeoutMs: 20 };
    await expect(handleSandboxMessage(shopInfo("t4"), ctx)).resolves.toEqual({
      error: "sandbox.timeout",
    });
    release({ late: true });
    await new Promise((r) => setTimeout(r, 10));
    const retry = await handleSandboxMessage(shopInfo("t4"), {
      ...ctx,
      timeoutMs: 500,
    });
    expect(retry).toEqual({ error: "sandbox.duplicate_id" });
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("silent frames are never unmounted: no watchdog in host or guard", () => {
    // Five shipped builtin widgets plus the starter plugin never call the
    // bridge — unmount-on-silence deleted them. The watchdog was reverted;
    // per-call timeouts + the flood gate remain the containment. Pin the
    // absence so it cannot silently return.
    for (const f of [
      "src/components/marketplace/WidgetSandbox.tsx",
      "src/lib/bridge-flood-guard.ts",
    ]) {
      const src = readFileSync(`/opt/frame28/${f}`, "utf8");
      expect(src).not.toMatch(
        /islandFailed|checkMountWatch|createMountWatch|MountWatch|DEFAULT_MOUNT_BUDGET/,
      );
    }
  });

  it("rate-limited traffic starts no timer", async () => {
    const r = rig();
    const guard = createFloodGuard();
    for (let i = 0; i < 30; i++) checkFloodGuard(guard, `fill-${i}`, 0);
    const out = await handleSandboxMessage(shopInfo("x"), {
      ...base,
      onCall: async () => ({ ok: true }),
      guard,
      timers: r.timers,
      timeoutMs: 100,
      now: 0,
    });
    expect(out).toEqual({ error: "sandbox.rate_limited" });
    expect(r.pending.size).toBe(0);
  });

  it("storm: 40 never-resolving near-cap calls settle as errors, leak no timers, stay bounded", async () => {
    const r = rig();
    const guard = createFloodGuard();
    // Just under the 64 KiB message cap: exercises the largest payload the
    // authorizer admits, in a tight loop, against a hung host handler.
    const blob = "x".repeat(60 * 1024);
    const ctx = {
      ...base,
      onCall: never,
      guard,
      timers: r.timers,
      timeoutMs: 100,
      now: 0,
    };
    const calls = Array.from({ length: 40 }, (_, i) =>
      handleSandboxMessage(
        { v: 1, id: `storm-${i}`, method: "shop.info", params: { blob } },
        ctx,
      ),
    );
    // Timeouts only fire here — if any call hung instead of racing the
    // timer, Promise.all below would never settle (testTimeout fails it).
    r.fireAll();
    const outs = await Promise.all(calls);
    expect(outs.slice(0, 30)).toEqual(
      Array.from({ length: 30 }, () => ({ error: "sandbox.timeout" })),
    );
    expect(outs.slice(30)).toEqual(
      Array.from({ length: 10 }, () => ({ error: "sandbox.rate_limited" })),
    );
    // No leaked handles: every started timer fired, none remain armed.
    expect(r.pending.size).toBe(0);
    // No leaked host state: window pruned, retired ids bounded by budget.
    expect(guard.times.length).toBeLessThanOrEqual(BRIDGE_MAX_MESSAGES);
    expect(guard.seen.size).toBe(30);
    // Host still responsive on a fresh identity after the storm.
    const fresh = await handleSandboxMessage(shopInfo("after"), {
      ...base,
      onCall: async () => ({ ok: true }),
      guard: createFloodGuard(),
      timeoutMs: 500,
    });
    expect(fresh).toEqual({ result: { ok: true } });
  });

  it("near-cap params in a tight loop admit then rate-limit without hangs", async () => {
    const guard = createFloodGuard();
    const blob = "x".repeat(60 * 1024);
    const onCall = vi.fn(async () => ({ ok: true }));
    const outs: ({ result: unknown } | { error: string })[] = [];
    for (let i = 0; i < 40; i++) {
      outs.push(
        await handleSandboxMessage(
          { v: 1, id: `cap-${i}`, method: "shop.info", params: { blob } },
          { ...base, onCall, guard, timeoutMs: 1000, now: 0 },
        ),
      );
    }
    expect(outs.slice(0, 30).every((o) => "result" in o)).toBe(true);
    expect(outs.slice(30)).toEqual(
      Array.from({ length: 10 }, () => ({ error: "sandbox.rate_limited" })),
    );
    expect(onCall).toHaveBeenCalledTimes(30);
  });

  it("keeps the frame wire format unchanged: the timeout is host-side only", () => {
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    // The frame already drops `pending` on the first answer, so the host's
    // timeout reply needs no frame change — pin that no frame-side timeout
    // machinery exists.
    expect(html).toContain("pending.delete(d.id)");
    expect(html).not.toContain("sandbox.timeout");
  });
});
