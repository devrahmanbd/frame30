/**
 * Stable idempotency keys for checkout and payment retry (T5 audit fix).
 *
 * Two defects, one root cause — fresh randomness per render/click:
 *  - the checkout page minted a fresh order key per mount, so a
 *    refresh+resubmit duplicated the order instead of replaying it;
 *  - the "Pay now" buttons minted `retry-<orderId>-<Date.now()>` per click,
 *    so a double-click opened parallel settable charge intents.
 *
 * Contract:
 *  - exactly one order key per checkout session, persisted in sessionStorage
 *    (survives remount + refresh in the same tab, never leaks across tabs);
 *    rotated after a successful placement so the next purchase cannot replay;
 *  - retry keys are deterministic per order+attempt. Concurrent clicks share
 *    one key (server replays it); a retry after a terminal intent advances
 *    the attempt server-side (`resolveRetryKey` in `payments.server.ts`).
 *
 * Pure module — no DOM at import time, SSR-safe. The store parameter exists
 * for tests; production passes nothing and gets sessionStorage.
 */
export type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStore(): KeyStore | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      // Touch it once: private-mode Safari throws on access, not on read.
      window.sessionStorage.getItem("__fq_probe__");
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
  return null;
}

const fallbackMemory = new Map<string, string>();
const fallbackStore: KeyStore = {
  getItem: (k) => fallbackMemory.get(k) ?? null,
  setItem: (k, v) => {
    fallbackMemory.set(k, v);
  },
  removeItem: (k) => {
    fallbackMemory.delete(k);
  },
};

function storeOrFallback(store?: KeyStore): KeyStore {
  return store ?? sessionStore() ?? fallbackStore;
}

export function checkoutSessionKeyName(slug: string): string {
  return `fq-checkout-key:${slug}`;
}

function randomSuffix(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function newCheckoutKey(slug: string): string {
  return `${slug}-order-${randomSuffix()}`;
}

/**
 * The single order key for this checkout session. Stable across remounts
 * and refreshes in the same tab; a new tab (new session) mints a new one.
 */
export function getCheckoutSessionKey(slug: string, store?: KeyStore): string {
  const s = storeOrFallback(store);
  const name = checkoutSessionKeyName(slug);
  const existing = s.getItem(name);
  if (existing) return existing;
  const fresh = newCheckoutKey(slug);
  s.setItem(name, fresh);
  return fresh;
}

/**
 * Rotate after a successful placement. Without this the next checkout in
 * the same tab would replay the previous order's idempotency key.
 */
export function clearCheckoutSessionKey(slug: string, store?: KeyStore): void {
  storeOrFallback(store).removeItem(checkoutSessionKeyName(slug));
}

/** Canonical retry key for an order + 1-based attempt. */
export function buildRetryKey(orderId: string, attempt: number): string {
  return `retry-${orderId}-${attempt}`;
}

export function retryKeyPrefix(orderId: string): string {
  return `retry-${orderId}-`;
}

/**
 * True for canonical `retry-<orderId>-<n>` keys and for legacy timestamped
 * `retry-<orderId>-<Date.now()>` keys still minted by older clients — the
 * server canonicalises both onto the current attempt.
 */
export function isRetryKeyForOrder(key: string, orderId: string): boolean {
  return key.startsWith(retryKeyPrefix(orderId));
}

/** A retry may reuse this intent instead of opening a new attempt. */
export function isLiveIntentStatus(status: string): boolean {
  return status === "initiated" || status === "pending";
}
