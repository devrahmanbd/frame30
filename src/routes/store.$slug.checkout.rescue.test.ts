/**
 * Frame30 checkout rescue — pending-order helpers.
 *
 * Defect (verified Oct 2026): `store.$slug.checkout.tsx` `onSuccess` cleared
 * the cart FIRST and then attempted the charge hop, persisting nothing. A
 * network drop during the hop stranded the shopper: order placed, cart gone,
 * no link back to the order.
 *
 * Contract (implemented in `src/routes/store.$slug.checkout.tsx`):
 * - `onSuccess` persists `{ orderId, accessToken, placedAt }` to
 *   sessionStorage BEFORE the charge hop;
 * - a checkout mount with a fresh pending key shows a banner linking to the
 *   order page;
 * - the hop carries an explicit redirecting state (button + live region).
 *
 * Pure helpers live in the route module (same pattern as `mintCheckoutToken`,
 * pinned by `src/lib/checkout-token.test.ts`) so they stay SSR-safe and
 * injectable for tests. Vitest env node — no DOM at import time.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  clearPendingOrder,
  PENDING_ORDER_TTL_MS,
  pendingOrderKeyName,
  readPendingOrder,
  savePendingOrder,
} from "./store.$slug.checkout";

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

const PENDING = {
  orderId: "11111111-2222-3333-4444-555555555555",
  accessToken: "tok_0123456789abcdef",
};

describe("pending-order key", () => {
  it("is namespaced per store slug", () => {
    expect(pendingOrderKeyName("a")).not.toBe(pendingOrderKeyName("b"));
    expect(pendingOrderKeyName("a")).toContain("a");
  });

  it("round-trips { orderId, accessToken } with a placement timestamp", () => {
    const store = memStore();
    savePendingOrder("demo", PENDING, store);
    const back = readPendingOrder("demo", store);
    expect(back?.orderId).toBe(PENDING.orderId);
    expect(back?.accessToken).toBe(PENDING.accessToken);
    expect(typeof back?.placedAt).toBe("number");
  });

  it("a newer placement overwrites the previous pending order", () => {
    const store = memStore();
    savePendingOrder("demo", PENDING, store);
    const next = {
      orderId: "99999999-8888-7777-6666-555555555555",
      accessToken: "tok_secondplacementkey",
    };
    savePendingOrder("demo", next, store);
    expect(readPendingOrder("demo", store)?.orderId).toBe(next.orderId);
  });

  it("ignores malformed payloads instead of crashing the banner", () => {
    const store = memStore();
    store.setItem(pendingOrderKeyName("demo"), "not-json{{{");
    expect(readPendingOrder("demo", store)).toBeNull();
    store.setItem(
      pendingOrderKeyName("demo"),
      JSON.stringify({ orderId: "", accessToken: "" }),
    );
    expect(readPendingOrder("demo", store)).toBeNull();
  });

  it("expires stale keys so old orders stop haunting new checkouts", () => {
    expect(PENDING_ORDER_TTL_MS).toBeGreaterThan(0);
    const store = memStore();
    store.setItem(
      pendingOrderKeyName("demo"),
      JSON.stringify({ ...PENDING, placedAt: 1 }),
    );
    expect(readPendingOrder("demo", store)).toBeNull();
  });

  it("clears when the shopper reaches the order page or dismisses", () => {
    const store = memStore();
    savePendingOrder("demo", PENDING, store);
    clearPendingOrder("demo", store);
    expect(readPendingOrder("demo", store)).toBeNull();
  });
});

describe("checkout rescue wiring", () => {
  const SRC = readFileSync("src/routes/store.$slug.checkout.tsx", "utf8");
  const onSuccess = SRC.slice(SRC.indexOf("onSuccess"));

  it("persists the pending order BEFORE the charge hop", () => {
    expect(onSuccess).toContain("savePendingOrder(slug");
    expect(onSuccess.indexOf("savePendingOrder(slug")).toBeLessThan(
      onSuccess.indexOf("startCharge("),
    );
  });

  it("reads the pending key on mount for the rescue banner", () => {
    expect(SRC).toContain("readPendingOrder(slug)");
    expect(SRC).toContain("/store/$slug/order/$orderId");
  });

  it("carries an explicit redirecting state through the hop", () => {
    expect(SRC).toContain("Redirecting to payment");
    expect(onSuccess).toContain("redirecting");
  });

  it("retires the pending key once the shopper reaches the order page", () => {
    expect(onSuccess).toContain("clearPendingOrder(slug)");
  });
});
