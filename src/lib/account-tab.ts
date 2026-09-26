/**
 * Phase 1b — shared account tab helper.
 *
 * Single source of truth for the account dashboard tabs so the storefront
 * header wishlist link (`?tab=wishlist`) and both account routes agree on
 * the tab union, search validation, and initial state.
 */
export const ACCOUNT_TABS = [
  "orders",
  "addresses",
  "wishlist",
  "profile",
  "privacy",
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number];

export function isAccountTab(value: unknown): value is AccountTab {
  return (
    typeof value === "string" &&
    (ACCOUNT_TABS as readonly string[]).includes(value)
  );
}

export function initialAccountTab(tab: unknown): AccountTab {
  return isAccountTab(tab) ? tab : "orders";
}

/**
 * Search patch for tab clicks. Preserves unrelated params (e.g.
 * preview_token) and only touches `tab` — same shape as
 * `nextAuthSearch` in auth-mode.
 */
export type AccountSearch = { tab?: AccountTab };

export function nextAccountTabSearch<S extends AccountSearch>(
  search: S,
  tab: AccountTab,
): S & AccountSearch {
  return { ...search, tab };
}

/*
 * PUSH-vs-REPLACE decision (WS2): tab clicks PUSH a new history entry
 * (TanStack `navigate` default — deliberately no `replace: true`).
 *
 * Rationale: `?tab=` is deep-linkable navigation state (shared, bookmarked,
 * linked from the storefront header), so each DISTINCT tab deserves its own
 * entry and Back/Forward restores the prior tab coherently. `replace: true`
 * would make Back skip tabs entirely and exit the page, failing "back
 * restores". History spam is prevented instead by the same-tab no-op guard
 * in both account routes (`if (key === tab) return` — clicking the active
 * tab pushes nothing), so Back never steps through duplicates; distinct-tab
 * entries are legitimate navigation history, not spam. The tab value itself
 * is URL-derived (`initialAccountTab(search.tab)`), so popstate and direct
 * `?tab=` URLs re-sync with no effect and cannot bounce. Invalid `?tab=`
 * falls back to "orders" via validateSearch + initialAccountTab.
 */
