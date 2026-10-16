/**
 * Theme bridge v2 — TDD: versioned envelopes, per-install capability
 * allow/deny, forgery rejection, flood/duplicate/oversize/timeout gates.
 * Every assertion runs under node (pure module, no DOM).
 */
import { describe, expect, it, vi } from "vitest";
import {
  answerThemeCall,
  authorizeThemeCall,
  checkThemeGuard,
  createThemeGuard,
  handleThemeMessage,
  isOwnerFrame,
  isThemeError,
  normalizeThemeTimeoutMs,
  resetThemeGuard,
  THEME_BRIDGE_MAX_MESSAGES,
  THEME_BRIDGE_VERSION,
  THEME_ENVELOPE_MAX_SKEW_MS,
  type ThemeAnswer,
  type ThemeTimers,
} from "./bridge-v2";
import { buildThemeGrants } from "./capabilities";

const FULL = buildThemeGrants({
  storefrontRead: true,
  variantSelect: true,
  cartAdd: true,
  navigate: true,
  navigateAllowlist: ["https://shop.example.com"],
});

const env = (method: string, params?: unknown, id = "1") => ({
  v: 2,
  id,
  method,
  params,
});

describe("envelope versioning", () => {
  it("pins the bridge at v2", () => {
    expect(THEME_BRIDGE_VERSION).toBe(2);
  });

  it("rejects v1 widget envelopes as malformed (lanes never mix)", () => {
    expect(
      authorizeThemeCall(
        { v: 1, id: "1", method: "storefront.read" },
        { granted: FULL.granted },
      ),
    ).toEqual({ allowed: false, reason: "malformed" });
  });

  it("rejects unversioned and shapeless input as malformed", () => {
    for (const bad of [
      null,
      undefined,
      "storefront.read",
      42,
      [],
      {},
      { v: 2, method: "storefront.read" },
      { v: 2, id: "1" },
      { v: 2, id: "", method: "storefront.read" },
      { v: 2, id: "1", method: 42 },
      { v: "2", id: "1", method: "storefront.read" },
    ]) {
      expect(authorizeThemeCall(bad, { granted: FULL.granted }).allowed).toBe(
        false,
      );
    }
  });

  it("maps circular (unserializable) envelopes to malformed, never throws", () => {
    const cyclic: Record<string, unknown> = {
      v: 2,
      id: "c",
      method: "cart.add",
    };
    cyclic.params = { self: cyclic };
    expect(() =>
      authorizeThemeCall(cyclic, { granted: FULL.granted }),
    ).not.toThrow();
    expect(authorizeThemeCall(cyclic, { granted: FULL.granted }).allowed).toBe(
      false,
    );
  });
});

describe("capability allow/deny per install", () => {
  it("admits each method under its own grant", () => {
    expect(
      authorizeThemeCall(env("storefront.read"), { granted: FULL.granted }),
    ).toEqual({ allowed: true, method: "storefront.read" });
    expect(
      authorizeThemeCall(env("variant.select", { variantId: "v-1" }), {
        granted: FULL.granted,
      }),
    ).toEqual({ allowed: true, method: "variant.select" });
    expect(
      authorizeThemeCall(env("cart.add", { variantId: "v-1", quantity: 2 }), {
        granted: FULL.granted,
      }),
    ).toEqual({ allowed: true, method: "cart.add" });
    expect(
      authorizeThemeCall(env("navigate", { href: "/c/women" }), {
        granted: FULL.granted,
        navigateAllowlist: FULL.navigateAllowlist,
      }),
    ).toEqual({ allowed: true, method: "navigate" });
  });

  it("denies each method without its grant (default-deny install)", () => {
    const empty = buildThemeGrants();
    for (const [method, params] of [
      ["storefront.read", undefined],
      ["variant.select", { variantId: "v-1" }],
      ["cart.add", { variantId: "v-1", quantity: 1 }],
      ["navigate", { href: "/x" }],
    ] as const) {
      expect(
        authorizeThemeCall(env(method, params), { granted: empty.granted }),
      ).toEqual({ allowed: false, reason: "scope_denied", method });
    }
  });

  it("denies cross-method grant use (cart grant is not a read grant)", () => {
    const cartOnly = buildThemeGrants({ cartAdd: true });
    expect(
      authorizeThemeCall(env("storefront.read"), {
        granted: cartOnly.granted,
      }),
    ).toEqual({
      allowed: false,
      reason: "scope_denied",
      method: "storefront.read",
    });
    expect(
      authorizeThemeCall(env("cart.add", { variantId: "v", quantity: 1 }), {
        granted: cartOnly.granted,
      }),
    ).toEqual({ allowed: true, method: "cart.add" });
  });

  it("rejects unknown methods without touching onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await answerThemeCall(env("shop.delete"), {
      granted: FULL.granted,
      onCall,
    });
    expect(out).toEqual({ error: "theme.unknown_method" });
    expect(onCall).not.toHaveBeenCalled();
  });

  it("rejects widget-lane method names as unknown here", () => {
    for (const m of [
      "shop.info",
      "products.list",
      "plugin.settings",
      "menus.list",
    ]) {
      expect(authorizeThemeCall(env(m), { granted: FULL.granted })).toEqual({
        allowed: false,
        reason: "unknown_method",
        method: m,
      });
    }
  });
});

describe("forgery rejection (price / tenant / payment)", () => {
  it("rejects forged price on cart.add", () => {
    expect(
      authorizeThemeCall(
        env("cart.add", { variantId: "v", quantity: 1, price: 1 }),
        { granted: FULL.granted },
      ),
    ).toEqual({
      allowed: false,
      reason: "forbidden_field",
      method: "cart.add",
    });
  });

  it("rejects forged tenant on storefront.read (cross-tenant probe)", () => {
    expect(
      authorizeThemeCall(env("storefront.read", { tenantId: "other" }), {
        granted: FULL.granted,
      }),
    ).toEqual({
      allowed: false,
      reason: "forbidden_field",
      method: "storefront.read",
    });
  });

  it("rejects payment-status forgery on variant.select", () => {
    expect(
      authorizeThemeCall(
        env("variant.select", { variantId: "v", paymentStatus: "paid" }),
        { granted: FULL.granted },
      ),
    ).toEqual({
      allowed: false,
      reason: "forbidden_field",
      method: "variant.select",
    });
  });

  it("rejects nested forgery (items[0].stock)", () => {
    expect(
      authorizeThemeCall(
        env("cart.add", {
          variantId: "v",
          quantity: 1,
          items: [{ stock: 999 }],
        }),
        { granted: FULL.granted },
      ),
    ).toEqual({
      allowed: false,
      reason: "forbidden_field",
      method: "cart.add",
    });
  });

  it("never delegates forged calls to onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await answerThemeCall(
      env("cart.add", { variantId: "v", quantity: 1, total: 5 }),
      { granted: FULL.granted, onCall },
    );
    expect(out).toEqual({ error: "theme.forbidden_field" });
    expect(onCall).not.toHaveBeenCalled();
  });
});

describe("param schemas (invalid_params)", () => {
  it("bounds cart.add quantity to 1..99 integers", () => {
    for (const q of [0, -1, 100, 1.5, "2", NaN]) {
      expect(
        authorizeThemeCall(env("cart.add", { variantId: "v", quantity: q }), {
          granted: FULL.granted,
        }),
      ).toEqual({
        allowed: false,
        reason: "invalid_params",
        method: "cart.add",
      });
    }
    expect(
      authorizeThemeCall(env("cart.add", { quantity: 1 }), {
        granted: FULL.granted,
      }),
    ).toEqual({ allowed: false, reason: "invalid_params", method: "cart.add" });
  });

  it("requires a variant or product reference for variant.select", () => {
    expect(
      authorizeThemeCall(env("variant.select", {}), {
        granted: FULL.granted,
      }),
    ).toEqual({
      allowed: false,
      reason: "invalid_params",
      method: "variant.select",
    });
    expect(
      authorizeThemeCall(env("variant.select", { productId: "p-1" }), {
        granted: FULL.granted,
      }).allowed,
    ).toBe(true);
  });

  it("denies off-allowlist navigation targets", () => {
    expect(
      authorizeThemeCall(
        env("navigate", { href: "https://evil.example.com/x" }),
        { granted: FULL.granted, navigateAllowlist: FULL.navigateAllowlist },
      ),
    ).toEqual({
      allowed: false,
      reason: "navigation_denied",
      method: "navigate",
    });
    expect(
      authorizeThemeCall(env("navigate", { href: "javascript:alert(1)" }), {
        granted: FULL.granted,
        navigateAllowlist: FULL.navigateAllowlist,
      }).allowed,
    ).toBe(false);
  });
});

describe("answerThemeCall — delegation and never-throw", () => {
  it("delegates admitted calls with sanitized params", async () => {
    const seen: unknown[] = [];
    const out = await answerThemeCall(
      env("cart.add", { variantId: "v-9", quantity: 3 }),
      {
        granted: FULL.granted,
        onCall: async (method, params) => {
          seen.push([method, params]);
          return { lineId: "l-1" };
        },
      },
    );
    expect(out).toEqual({ result: { lineId: "l-1" } });
    expect(seen).toEqual([["cart.add", { variantId: "v-9", quantity: 3 }]]);
  });

  it("maps host Error messages and foreign rejections without leaking", async () => {
    const err = await answerThemeCall(env("storefront.read"), {
      granted: FULL.granted,
      onCall: async () => {
        throw new Error("db down");
      },
    });
    expect(err).toEqual({ error: "db down" });
    const foreign = await answerThemeCall(env("storefront.read"), {
      granted: FULL.granted,
      // Hostile host rejecting with a primitive (type-legal: throw
      // expressions are unchecked — the mapping is what this pins).
      onCall: async () => {
        throw "string-failure";
      },
    });
    expect(foreign).toEqual({ error: "theme.host_error" });
  });

  it("malformed envelopes never throw host-side (always resolve)", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    for (const bad of [null, undefined, 42, "x", [], {}, { v: 2 }]) {
      await expect(
        answerThemeCall(bad, { granted: FULL.granted, onCall }),
      ).resolves.toEqual(
        expect.objectContaining({ error: expect.any(String) }),
      );
    }
    expect(onCall).not.toHaveBeenCalled();
  });

  it("a throwing onCall factory still resolves (never rejects)", async () => {
    await expect(
      answerThemeCall(env("storefront.read"), {
        granted: FULL.granted,
        onCall: () => {
          throw new Error("sync boom");
        },
      }),
    ).resolves.toEqual({ error: "sync boom" });
  });
});

describe("oversize guard", () => {
  it("rejects >64 KiB envelopes without calling onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await answerThemeCall(
      env("storefront.read", { blob: "x".repeat(70 * 1024) }),
      { granted: FULL.granted, onCall },
    );
    expect(out).toEqual({ error: "theme.oversize" });
    expect(onCall).not.toHaveBeenCalled();
  });
});

describe("handleThemeMessage — flood / duplicate / timeout", () => {
  const base = {
    granted: FULL.granted,
    navigateAllowlist: FULL.navigateAllowlist,
  };

  it("answers the first 30 of a 40-message flood, rate-limits the rest", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createThemeGuard();
    const outs: ThemeAnswer[] = [];
    for (let i = 0; i < 40; i++) {
      outs.push(
        await handleThemeMessage(env("storefront.read", undefined, `f-${i}`), {
          ...base,
          onCall,
          guard,
          now: 0,
        }),
      );
    }
    expect(outs.slice(0, 30)).toEqual(
      Array.from({ length: 30 }, () => ({ result: { ok: true } })),
    );
    expect(outs.slice(30)).toEqual(
      Array.from({ length: 10 }, () => ({ error: "theme.rate_limited" })),
    );
    expect(onCall).toHaveBeenCalledTimes(30);
  });

  it("rejects a duplicate id without touching onCall again", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createThemeGuard();
    const first = await handleThemeMessage(
      env("storefront.read", undefined, "7"),
      {
        ...base,
        onCall,
        guard,
        now: 0,
      },
    );
    const dup = await handleThemeMessage(
      env("storefront.read", undefined, "7"),
      {
        ...base,
        onCall,
        guard,
        now: 1,
      },
    );
    expect(first).toEqual({ result: { ok: true } });
    expect(dup).toEqual({ error: "theme.duplicate_id" });
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("window slides: budget returns after 10s", () => {
    const guard = createThemeGuard();
    for (let i = 0; i < 30; i++)
      expect(checkThemeGuard(guard, `fill-${i}`, 0).ok).toBe(true);
    expect(checkThemeGuard(guard, "over", 0).ok).toBe(false);
    expect(checkThemeGuard(guard, "later", 10_001).ok).toBe(true);
  });

  it("answers theme.timeout when onCall never settles", async () => {
    const out = await handleThemeMessage(
      env("storefront.read", undefined, "t"),
      {
        ...base,
        onCall: () => new Promise<unknown>(() => {}),
        guard: createThemeGuard(),
        timeoutMs: 20,
      },
    );
    expect(out).toEqual({ error: "theme.timeout" });
  });

  it("rate-limited traffic starts no timer", async () => {
    const pending = new Map<number, () => void>();
    let next = 1;
    const timers: ThemeTimers = {
      schedule: (cb) => {
        const h = next++;
        pending.set(h, cb);
        return h;
      },
      cancel: (h) => {
        pending.delete(h as number);
      },
    };
    const guard = createThemeGuard();
    for (let i = 0; i < 30; i++) checkThemeGuard(guard, `fill-${i}`, 0);
    const out = await handleThemeMessage(
      env("storefront.read", undefined, "x"),
      {
        ...base,
        onCall: async () => ({ ok: true }),
        guard,
        timers,
        timeoutMs: 100,
        now: 0,
      },
    );
    expect(out).toEqual({ error: "theme.rate_limited" });
    expect(pending.size).toBe(0);
  });

  it("fresh identity stays responsive after a storm", async () => {
    const guard = createThemeGuard();
    const ctx = {
      ...base,
      onCall: async () => ({ ok: true }),
      guard,
      timeoutMs: 500,
      now: 0,
    };
    for (let i = 0; i < 40; i++) {
      await handleThemeMessage(
        env("storefront.read", undefined, `s-${i}`),
        ctx,
      );
    }
    expect(guard.times.length).toBeLessThanOrEqual(THEME_BRIDGE_MAX_MESSAGES);
    const fresh = await handleThemeMessage(
      env("storefront.read", undefined, "after"),
      { ...ctx, guard: createThemeGuard() },
    );
    expect(fresh).toEqual({ result: { ok: true } });
  });
});

describe("isOwnerFrame — caller-frame check", () => {
  it("admits only the exact owned frame window", () => {
    const frame = {};
    expect(isOwnerFrame(frame, frame)).toBe(true);
    expect(isOwnerFrame({}, frame)).toBe(false);
    expect(isOwnerFrame(null, frame)).toBe(false);
    expect(isOwnerFrame(undefined, frame)).toBe(false);
    expect(isOwnerFrame(frame, null)).toBe(false);
    expect(isOwnerFrame("*", "*")).toBe(false);
  });
});

describe("theme.* error namespace", () => {
  it("prefixes every denial with theme. (never sandbox.)", async () => {
    const cases: unknown[] = [
      null,
      { v: 1, id: "1", method: "storefront.read" },
      env("nope.unknown"),
      env("cart.add", { variantId: "v", quantity: 1 }),
      env("cart.add", { variantId: "v", quantity: 1, price: 1 }),
      env("cart.add", { variantId: "v", quantity: 0 }),
    ];
    for (const c of cases) {
      const out = await answerThemeCall(c, {
        granted: buildThemeGrants().granted,
        onCall: async () => ({ ok: true }),
      });
      expect(isThemeError(out)).toBe(true);
      expect((out as { error: string }).error).toMatch(/^theme\./);
    }
  });

  it("normalizes timeout budgets like the widget lane pattern", () => {
    expect(normalizeThemeTimeoutMs(100)).toBe(100);
    expect(normalizeThemeTimeoutMs(-5)).toBe(5_000);
    expect(normalizeThemeTimeoutMs(NaN)).toBe(5_000);
    expect(normalizeThemeTimeoutMs(undefined)).toBe(5_000);
  });
});

describe("envelope freshness (ts / replayed-or-forged traffic)", () => {
  const NOW = 1_700_000_000_000;

  it("admits untimestamped envelopes without a freshness check (back-compat)", () => {
    expect(
      authorizeThemeCall(env("storefront.read"), { granted: FULL.granted }),
    ).toEqual({ allowed: true, method: "storefront.read" });
    expect(
      authorizeThemeCall(
        env("storefront.read"),
        { granted: FULL.granted },
        { now: NOW },
      ),
    ).toEqual({ allowed: true, method: "storefront.read" });
  });

  it("admits a fresh timestamp within skew", () => {
    for (const ts of [NOW, NOW - 1, NOW + THEME_ENVELOPE_MAX_SKEW_MS - 1]) {
      expect(
        authorizeThemeCall(
          { ...env("storefront.read"), ts },
          { granted: FULL.granted },
          { now: NOW },
        ),
      ).toEqual({ allowed: true, method: "storefront.read" });
    }
  });

  it("refuses replayed (stale past) and pre-forged (future) envelopes", () => {
    expect(
      authorizeThemeCall(
        { ...env("storefront.read"), ts: NOW - THEME_ENVELOPE_MAX_SKEW_MS - 1 },
        { granted: FULL.granted },
        { now: NOW },
      ),
    ).toEqual({
      allowed: false,
      reason: "stale",
      method: "storefront.read",
    });
    expect(
      authorizeThemeCall(
        {
          ...env("cart.add", { variantId: "v", quantity: 1 }),
          ts: NOW + 3_600_000,
        },
        { granted: FULL.granted },
        { now: NOW },
      ),
    ).toEqual({ allowed: false, reason: "stale", method: "cart.add" });
  });

  it("treats an ill-typed ts as malformed envelope shape", () => {
    for (const ts of ["now", true, NaN, Infinity, {}, []]) {
      expect(
        authorizeThemeCall(
          { ...env("storefront.read"), ts },
          { granted: FULL.granted },
          { now: NOW },
        ).allowed,
      ).toBe(false);
      expect(
        authorizeThemeCall(
          { ...env("storefront.read"), ts },
          { granted: FULL.granted },
          { now: NOW },
        ),
      ).toEqual({ allowed: false, reason: "malformed" });
    }
  });

  it("never delegates stale envelopes to onCall (answer + handle layers)", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const stale = {
      ...env("cart.add", { variantId: "v", quantity: 1 }),
      ts: 0,
    };
    await expect(
      answerThemeCall(stale, {
        granted: FULL.granted,
        onCall,
        now: NOW,
      }),
    ).resolves.toEqual({ error: "theme.stale" });
    await expect(
      handleThemeMessage(stale, {
        granted: FULL.granted,
        navigateAllowlist: FULL.navigateAllowlist,
        onCall,
        guard: createThemeGuard(),
        now: NOW,
      }),
    ).resolves.toEqual({ error: "theme.stale" });
    expect(onCall).not.toHaveBeenCalled();
  });

  it("skips freshness for timestamped envelopes when the host has no clock", () => {
    expect(
      authorizeThemeCall(
        { ...env("storefront.read"), ts: 0 },
        { granted: FULL.granted },
      ),
    ).toEqual({ allowed: true, method: "storefront.read" });
  });
});

describe("suspension — kill switch propagates to live frames", () => {
  it("refuses every method while suspended, even well-formed and in-scope", () => {
    const ctx = { granted: FULL.granted, suspended: true as const };
    for (const [method, params] of [
      ["storefront.read", undefined],
      ["variant.select", { variantId: "v-1" }],
      ["cart.add", { variantId: "v-1", quantity: 1 }],
      ["navigate", { href: "/x" }],
    ] as const) {
      expect(authorizeThemeCall(env(method, params), ctx)).toEqual({
        allowed: false,
        reason: "suspended",
      });
    }
  });

  it("suspension wins over every other verdict, including malformed", () => {
    expect(authorizeThemeCall(null, { granted: [], suspended: true })).toEqual({
      allowed: false,
      reason: "suspended",
    });
    expect(
      authorizeThemeCall(
        { v: 1, id: "1", method: "shop.info" },
        { granted: [], suspended: true },
      ),
    ).toEqual({ allowed: false, reason: "suspended" });
  });

  it("never touches onCall while suspended, via answer and handle", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    await expect(
      answerThemeCall(env("storefront.read"), {
        granted: FULL.granted,
        onCall,
        suspended: true,
      }),
    ).resolves.toEqual({ error: "theme.suspended" });
    await expect(
      handleThemeMessage(env("storefront.read"), {
        granted: FULL.granted,
        navigateAllowlist: FULL.navigateAllowlist,
        onCall,
        guard: createThemeGuard(),
        suspended: true,
      }),
    ).resolves.toEqual({ error: "theme.suspended" });
    expect(onCall).not.toHaveBeenCalled();
  });

  it("mid-session revocation stops execution; re-grant resumes (no stranded state)", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createThemeGuard();
    const live = {
      granted: FULL.granted,
      navigateAllowlist: FULL.navigateAllowlist,
      onCall,
      guard,
      now: 0,
    };
    await expect(
      handleThemeMessage(env("storefront.read", undefined, "live-1"), live),
    ).resolves.toEqual({ result: { ok: true } });
    // Kill switch flips mid-session: the NEXT envelope is refused explicitly.
    await expect(
      handleThemeMessage(env("storefront.read", undefined, "live-2"), {
        ...live,
        suspended: true,
      }),
    ).resolves.toEqual({ error: "theme.suspended" });
    // Grant revocation (empty set) denies distinctly, and replay of a seen
    // id stays a duplicate even across the revocation boundary.
    await expect(
      handleThemeMessage(env("storefront.read", undefined, "live-3"), {
        ...live,
        granted: [],
      }),
    ).resolves.toEqual({ error: "theme.scope_denied" });
    await expect(
      handleThemeMessage(env("storefront.read", undefined, "live-1"), live),
    ).resolves.toEqual({ error: "theme.duplicate_id" });
    // Re-grant on a fresh identity resumes; the old guard stays bounded.
    await expect(
      handleThemeMessage(env("storefront.read", undefined, "live-4"), {
        ...live,
        guard: createThemeGuard(),
      }),
    ).resolves.toEqual({ result: { ok: true } });
    expect(onCall).toHaveBeenCalledTimes(2);
  });
});

describe("forged source — postMessage spoofing refused before any budget", () => {
  const legit = env("storefront.read");

  it("refuses an explicit non-owned source without touching guard or onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createThemeGuard();
    await expect(
      handleThemeMessage(legit, {
        granted: FULL.granted,
        navigateAllowlist: FULL.navigateAllowlist,
        onCall,
        guard,
        now: 0,
        sourceValid: false,
      }),
    ).resolves.toEqual({ error: "theme.forged_source" });
    expect(onCall).not.toHaveBeenCalled();
    expect(guard.times.length).toBe(0);
    expect(guard.seen.size).toBe(0);
  });

  it("admits owned sources (true / unset) unchanged", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    for (const sourceValid of [true, undefined] as const) {
      await expect(
        handleThemeMessage(
          env("storefront.read", undefined, `s-${String(sourceValid)}`),
          {
            granted: FULL.granted,
            navigateAllowlist: FULL.navigateAllowlist,
            onCall,
            guard: createThemeGuard(),
            sourceValid,
          },
        ),
      ).resolves.toEqual({ result: { ok: true } });
    }
    expect(onCall).toHaveBeenCalledTimes(2);
  });

  it("spoofed floods cannot consume the rate budget", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createThemeGuard();
    for (let i = 0; i < 40; i++) {
      await handleThemeMessage(
        env("storefront.read", undefined, `spoof-${i}`),
        {
          granted: FULL.granted,
          navigateAllowlist: FULL.navigateAllowlist,
          onCall,
          guard,
          now: 0,
          sourceValid: false,
        },
      );
    }
    // Budget untouched: a legitimate call still admits on the same guard.
    await expect(
      handleThemeMessage(env("storefront.read", undefined, "real"), {
        granted: FULL.granted,
        navigateAllowlist: FULL.navigateAllowlist,
        onCall,
        guard,
        now: 0,
        sourceValid: true,
      }),
    ).resolves.toEqual({ result: { ok: true } });
    expect(onCall).toHaveBeenCalledTimes(1);
  });
});

describe("handleThemeMessage — storm hygiene (no leaked timers, bounded state)", () => {
  const base = {
    granted: FULL.granted,
    navigateAllowlist: FULL.navigateAllowlist,
  };

  it("resets guard state on identity change (no cross-mount replay bleed)", () => {
    const guard = createThemeGuard();
    expect(checkThemeGuard(guard, "a", 0).ok).toBe(true);
    expect(checkThemeGuard(guard, "a", 1).ok).toBe(false);
    resetThemeGuard(guard);
    expect(guard.times.length).toBe(0);
    expect(guard.seen.size).toBe(0);
    expect(checkThemeGuard(guard, "a", 2).ok).toBe(true);
  });

  it("storm: 40 never-resolving near-cap calls settle as errors, leak no timers", async () => {
    const pending = new Map<number, () => void>();
    let next = 1;
    const timers: ThemeTimers = {
      schedule: (cb) => {
        const h = next++;
        pending.set(h, cb);
        return h;
      },
      cancel: (h) => {
        pending.delete(h as number);
      },
    };
    const guard = createThemeGuard();
    const blob = "x".repeat(60 * 1024);
    const ctx = {
      ...base,
      onCall: () => new Promise<unknown>(() => {}),
      guard,
      timers,
      timeoutMs: 100,
      now: 0,
    };
    const calls = Array.from({ length: 40 }, (_, i) =>
      handleThemeMessage(env("storefront.read", { blob }, `storm-${i}`), ctx),
    );
    // Timeouts only fire here — a hung call would never settle the batch.
    for (const cb of [...pending.values()]) cb();
    pending.clear();
    const outs = await Promise.all(calls);
    expect(outs.slice(0, 30)).toEqual(
      Array.from({ length: 30 }, () => ({ error: "theme.timeout" })),
    );
    expect(outs.slice(30)).toEqual(
      Array.from({ length: 10 }, () => ({ error: "theme.rate_limited" })),
    );
    expect(pending.size).toBe(0);
    expect(guard.times.length).toBeLessThanOrEqual(THEME_BRIDGE_MAX_MESSAGES);
    expect(guard.seen.size).toBe(30);
  });

  it("oversize envelopes are refused at the handle layer without onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    await expect(
      handleThemeMessage(
        env("storefront.read", { blob: "x".repeat(70 * 1024) }, "big"),
        { ...base, onCall, guard: createThemeGuard(), now: 0 },
      ),
    ).resolves.toEqual({ error: "theme.oversize" });
    expect(onCall).not.toHaveBeenCalled();
  });
});
