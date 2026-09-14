/**
 * Phase 1.4 — the cross-section state channel.
 *
 * Compare trays, recently-viewed rails and wishlist buttons live in different
 * sections of the tree and must agree without prop-drilling or a refetch, so
 * they share one tiny per-store store. It is capped, namespaced by store slug,
 * persisted to localStorage and SSR-safe: reads before hydration return the
 * empty list rather than touching `window`.
 */

export const CHANNEL_SLOTS = ["compare", "recentlyViewed", "wishlist"] as const;
export type ChannelSlot = (typeof CHANNEL_SLOTS)[number];

/** Hard caps: a channel is a UI convenience, never a data store. */
export const SLOT_LIMIT: Record<ChannelSlot, number> = {
  compare: 4,
  recentlyViewed: 12,
  wishlist: 50,
};

type ChannelState = Record<ChannelSlot, string[]>;

const EMPTY: ChannelState = { compare: [], recentlyViewed: [], wishlist: [] };

const memory = new Map<string, ChannelState>();
const listeners = new Map<string, Set<() => void>>();

const storageKey = (store: string) => `fq:channel:${store}`;

function hydrate(store: string): ChannelState {
  const cached = memory.get(store);
  if (cached) return cached;
  let state: ChannelState = { ...EMPTY };
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(storageKey(store));
      const parsed = raw ? (JSON.parse(raw) as Partial<Record<ChannelSlot, unknown>>) : {};
      state = CHANNEL_SLOTS.reduce((acc, slot) => {
        const values = parsed[slot];
        acc[slot] = Array.isArray(values)
          ? values.filter((v): v is string => typeof v === "string").slice(0, SLOT_LIMIT[slot])
          : [];
        return acc;
      }, {} as ChannelState);
    } catch {
      state = { ...EMPTY };
    }
  }
  memory.set(store, state);
  return state;
}

function commit(store: string, state: ChannelState) {
  memory.set(store, state);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(store), JSON.stringify(state));
    } catch {
      /* quota or private mode — the in-memory channel still works */
    }
  }
  for (const listener of listeners.get(store) ?? []) listener();
}

export function readSlot(store: string, slot: ChannelSlot): string[] {
  return hydrate(store)[slot];
}

/** Adds an id, most-recent-first, de-duplicated and capped. */
export function pushSlot(store: string, slot: ChannelSlot, id: string): string[] {
  const state = hydrate(store);
  const next = [id, ...state[slot].filter((v) => v !== id)].slice(0, SLOT_LIMIT[slot]);
  commit(store, { ...state, [slot]: next });
  return next;
}

export function removeSlot(store: string, slot: ChannelSlot, id: string): string[] {
  const state = hydrate(store);
  const next = state[slot].filter((v) => v !== id);
  commit(store, { ...state, [slot]: next });
  return next;
}

/** Present ⇒ remove, absent ⇒ add. The wishlist / compare button contract. */
export function toggleSlot(store: string, slot: ChannelSlot, id: string): string[] {
  return readSlot(store, slot).includes(id)
    ? removeSlot(store, slot, id)
    : pushSlot(store, slot, id);
}

export function clearSlot(store: string, slot: ChannelSlot): void {
  commit(store, { ...hydrate(store), [slot]: [] });
}

/** `useSyncExternalStore`-compatible subscription. */
export function subscribeChannel(store: string, listener: () => void): () => void {
  const set = listeners.get(store) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(store, set);
  return () => set.delete(listener);
}

/** Test seam: drops all in-memory state for a store. */
export function resetChannel(store: string): void {
  memory.delete(store);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(storageKey(store));
    } catch {
      /* ignore */
    }
  }
}
