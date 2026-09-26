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
 * Click → URL write (shared, single source of truth). Tab buttons replace
 * `?tab=` via `navigate({ search: (prev) => nextAccountTabSearch(prev, key),
 * replace: true })` — replace, not push, so tab-hopping never spams history.
 * Returns EXACTLY `{ tab }` and drops every other search key on purpose:
 * both account routes' `validateSearch` return only `{ tab }`, so any extra
 * key spread here would be stripped on navigation — claiming to preserve
 * params the router drops. Callers pass `prev` only to satisfy the TanStack
 * search-updater shape; it is intentionally ignored.
 */
export function nextAccountTabSearch(
  _search: unknown,
  tab: AccountTab,
): { tab: AccountTab } {
  return { tab };
}
