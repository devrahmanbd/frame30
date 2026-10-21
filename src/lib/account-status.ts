/**
 * The account surface's SIX states — a pure mapping.
 *
 * The account route wires six states from two queries and one session, and
 * the wiring is the only place they are decided. A pure function makes that
 * decision **testable**: the precedence is asserted in every combination
 * instead of being observable only through a rendered page.
 *
 * The precedence, and why each rung sits where it does:
 *
 *  1. **the session** first — a session that has not answered yet is a
 *     loading page. Nothing else can be known yet: the shopper may or may
 *     not exist, and the overview query is DISABLED until they do.
 *  2. **the sign** second — a signed-out shopper is `unauthenticated`, NEVER
 *     `loading`. Their overview query is disabled, and in React Query v5 a
 *     DISABLED query is `status: "pending"`, so a naive `isPending` test
 *     would show a skeleton for a signed-out visitor forever.
 *  3. **the query** third — pending is a loading page, an error is an error
 *     page.
 *  4. otherwise the surface is **ready**.
 *
 * Pure data in, one state out: no React, no DOM, no DB, no clock.
 */

/** The route's own state — the six states the account surface distinguishes. */
export type AccountStatus = "unauthenticated" | "loading" | "error" | "ready";

export type AccountStatusInput = {
  /** The session query has not answered yet. */
  sessionPending: boolean;
  /** The session resolved AND carries a shopper. */
  signedIn: boolean;
  /** The overview query has not answered yet. */
  queryPending: boolean;
  /** The overview query failed. */
  queryError: boolean;
};

/**
 * The one place the account surface's state is decided.
 *
 * The route calls it; the suite calls it with every combination. A flip of
 * the precedence is a failing test, not a silent change of behaviour.
 */
export function accountStatus(input: AccountStatusInput): AccountStatus {
  if (input.sessionPending) return "loading";
  if (!input.signedIn) return "unauthenticated";
  if (input.queryPending) return "loading";
  if (input.queryError) return "error";
  return "ready";
}

/**
 * The context widgets' `pending` flag.
 *
 * `ProfileCard` and `OrdersList` render a skeleton while `pending` is true
 * and a SIGN-IN PROMPT when their rows are undefined. A signed-out shopper
 * must reach the prompt, never the skeleton — and their overview query is
 * disabled, which React Query v5 reports as `pending`. So the flag is
 * gated on the session.
 */
export function accountSlotsPending(input: {
  signedIn: boolean;
  queryPending: boolean;
}): boolean {
  return input.signedIn && input.queryPending;
}
