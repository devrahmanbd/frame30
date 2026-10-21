/**
 * The account surface's six states — the unit suite.
 *
 * The six-state wiring used to live inline in the route
 * (`src/routes/store.$slug.account.tsx`), which meant a flip of its
 * precedence passed every suite: the component suites drive the `status`
 * PROP directly, so they never exercised the mapping that produces it.
 *
 * This suite drives the MAPPING. Six combinations, each with the reason it
 * is what it is:
 *
 *   1. the session has not answered        → loading
 *   2. the session answered, nobody signed → unauthenticated
 *   3. signed out AND a pending query      → unauthenticated (the disabled
 *      query is `pending` in React Query v5 — this is the case that used to
 *      show a signed-out visitor a skeleton forever)
 *   4. signed in, the query is pending      → loading
 *   5. signed in, the query failed          → error
 *   6. signed in, the query answered        → ready
 */
import { describe, expect, it } from "vitest";
import { accountSlotsPending, accountStatus } from "./account-status";

describe("the account surface's six states", () => {
  it("shows a loading page while the session has not answered", () => {
    expect(
      accountStatus({
        sessionPending: true,
        signedIn: false,
        queryPending: true,
        queryError: false,
      }),
    ).toBe("loading");
  });

  it("shows the unauthenticated state to a signed-out shopper", () => {
    expect(
      accountStatus({
        sessionPending: false,
        signedIn: false,
        queryPending: false,
        queryError: false,
      }),
    ).toBe("unauthenticated");
  });

  it("never shows a signed-out shopper a loading page, even with a pending query", () => {
    // A DISABLED query is `status: "pending"` in React Query v5 — the
    // overview query is disabled for a signed-out shopper, so this is the
    // exact combination the old inline mapping got wrong.
    expect(
      accountStatus({
        sessionPending: false,
        signedIn: false,
        queryPending: true,
        queryError: false,
      }),
    ).toBe("unauthenticated");
  });

  it("shows a loading page while a signed-in shopper's overview is in flight", () => {
    expect(
      accountStatus({
        sessionPending: false,
        signedIn: true,
        queryPending: true,
        queryError: false,
      }),
    ).toBe("loading");
  });

  it("shows the error state when a signed-in shopper's overview fails", () => {
    expect(
      accountStatus({
        sessionPending: false,
        signedIn: true,
        queryPending: false,
        queryError: true,
      }),
    ).toBe("error");
  });

  it("shows the ready state when everything has answered", () => {
    expect(
      accountStatus({
        sessionPending: false,
        signedIn: true,
        queryPending: false,
        queryError: false,
      }),
    ).toBe("ready");
  });

  it("keeps the session ahead of the sign, and the sign ahead of the query", () => {
    // The precedence IS the contract: a pending session outranks a signed
    // -out shopper, and a signed-out shopper outranks a pending query.
    expect(
      accountStatus({
        sessionPending: true,
        signedIn: true,
        queryPending: false,
        queryError: true,
      }),
    ).toBe("loading");
    expect(
      accountStatus({
        sessionPending: false,
        signedIn: false,
        queryPending: false,
        queryError: true,
      }),
    ).toBe("unauthenticated");
  });
});

describe("the account widgets' pending flag", () => {
  it("is false for a signed-out shopper, whose widgets show the sign-in prompt", () => {
    // A disabled query is `pending` in React Query v5 — the flag must not
    // follow it, or the shopper sees a skeleton forever.
    expect(accountSlotsPending({ signedIn: false, queryPending: true })).toBe(
      false,
    );
    expect(accountSlotsPending({ signedIn: false, queryPending: false })).toBe(
      false,
    );
  });

  it("is true only while a signed-in shopper's overview is in flight", () => {
    expect(accountSlotsPending({ signedIn: true, queryPending: true })).toBe(
      true,
    );
    expect(accountSlotsPending({ signedIn: true, queryPending: false })).toBe(
      false,
    );
  });
});
