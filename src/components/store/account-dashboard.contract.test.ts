/**
 * The account dashboard — the CONTRACT suite.
 *
 * The dashboard is the account surface's designed body, and the brief's
 * failure mode for it is specific: *a dashboard that shows data it is not
 * allowed to show, or a link that 404s*. This suite is the guard.
 *
 *   (a) every navigation destination is a member of `ACCOUNT_TABS` and is a
 *       `?tab=` value on `/store/$slug/account` — there is no
 *       `/account/orders` route in this tree, so a link to one would 404;
 *   (b) the dashboard reads ONLY from the `AccountOverview` fields the
 *       `customer_overview` RPC returns — no spent total, no loyalty tier,
 *       no "unread" counter, nothing from another customer;
 *   (c) the dashboard links to no path that does not exist;
 *   (d) the six states are each reachable and each distinct.
 *
 * The tree is read as TEXT (the same pattern as
 * `src/routes/store.$slug.search-composition.test.tsx`); the states are
 * rendered through `renderToStaticMarkup` with the router's `Link` mocked.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ACCOUNT_TABS, isAccountTab } from "@/lib/account-tab";
import type { AccountOverview } from "@/lib/accounts.server";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => () => undefined,
    Link: ({
      to,
      params,
      search,
      children,
      ...rest
    }: {
      to: string;
      params?: unknown;
      search?: unknown;
      children?: React.ReactNode;
    }) =>
      createElement(
        "a",
        {
          "data-link-to": to,
          "data-link-params": JSON.stringify(params ?? null),
          "data-link-search": JSON.stringify(search ?? null),
          ...rest,
        },
        children,
      ),
  };
});

import { AccountDashboard } from "./AccountDashboard";

const DASHBOARD_SRC = readFileSync(
  "src/components/store/AccountDashboard.tsx",
  "utf8",
);
const ROUTE_SRC = readFileSync("src/routes/store.$slug.account.tsx", "utf8");

/** The paths this tree actually serves (`src/routes/store.$slug.*`). */
const EXISTING_PATHS = [
  "/store/$slug/account",
  "/store/$slug/order/$orderId",
  "/store/$slug/p/$productSlug",
  "/store/$slug",
] as const;

/** The fields the `customer_overview` RPC returns (`AccountOverview`). */
const OVERVIEW_FIELDS = [
  "profile",
  "addresses",
  "wishlist",
  "consents",
  "orders",
  "reviews",
] as const;

const OVERVIEW: AccountOverview = {
  profile: {
    id: "p1",
    name: "Rumana Haque",
    email: "rumana@example.com",
    phone: "01700000000",
  },
  addresses: [],
  wishlist: [],
  consents: [],
  orders: [
    {
      id: "o1",
      order_number: "ORD-2451",
      status: "delivered",
      total_minor_int: 129900,
      currency_code: "BDT",
      created_at: "2026-09-12T09:30:00.000Z",
    },
  ],
  reviews: [],
};

function render(props: Partial<Parameters<typeof AccountDashboard>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(AccountDashboard, {
      slug: "demo",
      overview: OVERVIEW,
      status: "ready",
      tab: "orders",
      currency: "BDT",
      ...props,
    }),
  );
}

describe("the account dashboard — the navigation contract", () => {
  it("renders exactly the account destinations the platform defines", () => {
    // The tab values the dashboard itself declares.
    const declared = [...DASHBOARD_SRC.matchAll(/\btab:\s*"([a-z_]+)"/g)].map(
      (match) => match[1]!,
    );
    expect(new Set(declared)).toEqual(new Set(ACCOUNT_TABS));
    // …and every one of them is a real tab.
    for (const tab of declared) expect(isAccountTab(tab)).toBe(true);
  });

  it("routes every destination through the account route's own `?tab=`", () => {
    // The route owns the search parameter and validates it against the same
    // union — so a tab is a URL state, never a second route.
    expect(ROUTE_SRC).toContain("validateSearch");
    expect(ROUTE_SRC).toContain("isAccountTab(s.tab)");
    expect(ROUTE_SRC).toContain("initialAccountTab(search.tab)");
    // The dashboard's links carry the tab as a search value on the account
    // route — never as a path segment.
    expect(DASHBOARD_SRC).toContain('to="/store/$slug/account"');
    expect(DASHBOARD_SRC).toContain("search={{ tab: item.tab }}");
    expect(DASHBOARD_SRC).not.toContain("/account/orders");
    expect(DASHBOARD_SRC).not.toContain("/account/profile");
    expect(DASHBOARD_SRC).not.toContain("/account/addresses");
    expect(DASHBOARD_SRC).not.toContain("/account/wishlist");
  });

  it("renders no destination outside the account union", () => {
    const html = render();
    const searches = [...html.matchAll(/data-link-search="([^"]+)"/g)].map(
      (match) => match[1]!,
    );
    for (const search of searches) {
      if (!search.includes("tab")) continue;
      const tab = /&quot;tab&quot;:&quot;([a-z_]+)&quot;/.exec(search)?.[1];
      expect(tab).toBeTruthy();
      expect(ACCOUNT_TABS as readonly string[]).toContain(tab!);
    }
  });
});

describe("the account dashboard — the data contract", () => {
  it("reads only the fields the shopper's own payload carries", () => {
    const reads = [...DASHBOARD_SRC.matchAll(/\boverview\??\.([a-z_]+)/g)].map(
      (match) => match[1]!,
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const field of reads) {
      expect(OVERVIEW_FIELDS as readonly string[]).toContain(field);
    }
  });

  it("invents no metric the payload cannot carry", () => {
    // A spent total, a loyalty tier, a recommendation rail, an avatar
    // upload, a session list — none of them is a fact the RPC returns.
    for (const invented of [
      "total_spent",
      "loyalty",
      "tier",
      "points_balance",
      "unread",
      "recommendation",
      "avatar",
    ]) {
      expect(DASHBOARD_SRC.toLowerCase()).not.toContain(invented);
    }
  });

  it("reads no other shopper's data — the identity is the session's", () => {
    // The dashboard never names a customer id, a shopper id or a session.
    expect(DASHBOARD_SRC).not.toContain("customer_id");
    expect(DASHBOARD_SRC).not.toContain("shopper_id");
    expect(DASHBOARD_SRC).not.toContain("auth.uid");
  });
});

describe("the account dashboard — the link contract", () => {
  it("links to no path that does not exist", () => {
    const links = [
      ...DASHBOARD_SRC.matchAll(/\bto="([^"]+)"/g),
      ...DASHBOARD_SRC.matchAll(/\bhref="([^"]+)"/g),
    ].map((match) => match[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(EXISTING_PATHS as readonly string[]).toContain(link);
    }
  });

  it("renders links that all resolve to a real route", () => {
    const html = render();
    const links = [...html.matchAll(/data-link-to="([^"]+)"/g)].map(
      (match) => match[1]!,
    );
    for (const link of links) {
      expect(EXISTING_PATHS as readonly string[]).toContain(link);
    }
  });
});

describe("the account dashboard — the six states", () => {
  const states = {
    authenticated: render({ tab: "profile" }),
    unauthenticated: render({ status: "unauthenticated", overview: undefined }),
    loading: render({ status: "loading", overview: undefined }),
    failure: render({ status: "error", overview: undefined }),
    withOrders: render({ tab: "orders" }),
    noOrders: render({ overview: { ...OVERVIEW, orders: [] } }),
  };

  it("reaches each state", () => {
    expect(states.authenticated).toContain("Your Account");
    expect(states.unauthenticated).toContain("Track Your Order");
    expect(states.loading).toContain("Loading your account");
    expect(states.failure).toContain("We could not load your account");
    expect(states.withOrders).toContain("ORD-2451");
    expect(states.noOrders).toContain("No orders yet.");
  });

  it("keeps each state distinct", () => {
    const rendered = Object.values(states);
    expect(new Set(rendered).size).toBe(rendered.length);
  });
});
