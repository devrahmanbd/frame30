/**
 * T5 stable retry/remount keys — RED first.
 *
 * Defects (verified 2026-09-28):
 *  - checkout mints a fresh idempotency key per mount
 *    (`store.$slug.checkout.tsx:93-97`), so refresh+resubmit duplicates;
 *  - retry buttons mint `retry-${order.id}-${Date.now()}`
 *    (`order.$orderId.tsx:83`, `store.$slug.order.$orderId.tsx:91`),
 *    so a double-click opens parallel settable intents.
 */
import { describe, expect, it } from "vitest";
import {
  buildRetryKey,
  getCheckoutSessionKey,
  isRetryKeyForOrder,
} from "./payment-keys";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
}

describe("checkout session key", () => {
  it("is stable across remounts within one session (refresh+resubmit replays)", () => {
    const session = memStore();
    const first = getCheckoutSessionKey("demo", session);
    // A remount reuses the same tab session store, so the key must not change.
    const second = getCheckoutSessionKey("demo", session);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(8);
  });

  it("is scoped per store slug and per session", () => {
    const session = memStore();
    expect(getCheckoutSessionKey("a", session)).not.toBe(
      getCheckoutSessionKey("b", session),
    );
    expect(getCheckoutSessionKey("a", memStore())).not.toBe(
      getCheckoutSessionKey("a", memStore()),
    );
  });
});

describe("retry keys", () => {
  it("are deterministic per order+attempt (double-click reuses one key)", () => {
    const orderId = "11111111-2222-3333-4444-555555555555";
    expect(buildRetryKey(orderId, 1)).toBe(buildRetryKey(orderId, 1));
    expect(buildRetryKey(orderId, 1)).not.toBe(buildRetryKey(orderId, 2));
  });

  it("recognises retry keys for an order, including legacy timestamped ones", () => {
    const orderId = "11111111-2222-3333-4444-555555555555";
    expect(isRetryKeyForOrder(buildRetryKey(orderId, 3), orderId)).toBe(true);
    // Legacy client mint: `retry-<orderId>-<Date.now()>`.
    expect(isRetryKeyForOrder(`retry-${orderId}-${Date.now()}`, orderId)).toBe(
      true,
    );
    expect(isRetryKeyForOrder("chg-abc123", orderId)).toBe(false);
    expect(isRetryKeyForOrder(buildRetryKey(orderId, 1), "other-order")).toBe(
      false,
    );
  });
});
