/**
 * Phase 1.4 — React binding for the cross-section state channel.
 *
 * One `useSyncExternalStore` subscription per slot, so a compare tray, a
 * wishlist button and a recently-viewed rail in different parts of the tree
 * agree without prop-drilling and without a refetch. SSR reads the empty
 * server snapshot, so hydration never mismatches.
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  pushSlot,
  readSlot,
  removeSlot,
  subscribeChannel,
  toggleSlot,
  clearSlot,
  type ChannelSlot,
} from "@/lib/section-channel";

const EMPTY: string[] = [];

export function useSectionChannel(store: string, slot: ChannelSlot) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeChannel(store, listener),
    [store],
  );
  const ids = useSyncExternalStore(
    subscribe,
    () => readSlot(store, slot),
    () => EMPTY,
  );
  return {
    ids,
    push: useCallback((id: string) => pushSlot(store, slot, id), [store, slot]),
    remove: useCallback((id: string) => removeSlot(store, slot, id), [store, slot]),
    toggle: useCallback((id: string) => toggleSlot(store, slot, id), [store, slot]),
    clear: useCallback(() => clearSlot(store, slot), [store, slot]),
  };
}
