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

/**
 * The account SURFACE's source — the dashboard and the panels module that
 * holds its four panels. Frame30 moved the nav, the overview, the order
 * rows and the details block into `src/components/store/account-widgets.tsx`
 * (they are placeable widgets now), so this contract reads the surface's
 * source, not one module's. The assertions below are unchanged.
 */
const DASHBOARD_SRC =
  readFileSync("src/components/store/AccountDashboard.tsx", "utf8") +
  readFileSync("src/components/store/account-widgets.tsx", "utf8");
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

describe("the account dashboard — the order detail contract", () => {
  it("never links to the token-gated order route", () => {
    // The order route requires the order's own access token
    // (`loadOrder` returns nothing without it — `src/lib/orders.server.ts`)
    // and the `customer_overview` payload carries no token, so a link to it
    // dead-ends on a 404. The row DISCLOSES the order instead.
    expect(DASHBOARD_SRC).not.toContain('to="/store/$slug/order/$orderId"');
    const html = render({ tab: "orders", onLoadOrder: () => undefined });
    expect(html).not.toContain('data-link-to="/store/$slug/order/$orderId"');
  });

  it("resolves the order inline, under the shopper's own session", () => {
    // The route uses the tree's own session-scoped server function — the
    // one the batch defined and never used.
    expect(ROUTE_SRC).toContain("accountOrderFn");
    expect(ROUTE_SRC).toContain("onLoadOrder=");
    expect(ROUTE_SRC).toContain(
      'queryKey: ["store-order-detail", slug, openOrderId]',
    );
    // …and the dashboard renders a disclosure, not a link.
    expect(DASHBOARD_SRC).toContain("aria-expanded={open}");
    expect(DASHBOARD_SRC).toContain("onLoadOrder");
  });

  it("asks a signed-out shopper for the order's access code", () => {
    // The order route is token-gated, so the signed-out lookup carries the
    // code it was given — the lookup can no longer dead-end on a 404.
    expect(DASHBOARD_SRC).toContain("order-lookup-code");
    expect(DASHBOARD_SRC).toContain("search: { t: code.trim() }");
  });
});

describe("the account route — the six-state wiring", () => {
  it("wires the states through the one pure mapping", () => {
    expect(ROUTE_SRC).toContain("accountStatus({");
    expect(ROUTE_SRC).toContain("sessionPending: session.isPending");
    expect(ROUTE_SRC).toContain("queryPending: account.isPending");
    expect(ROUTE_SRC).toContain("queryError: account.isError");
  });

  it("gates the widgets' skeleton on the session, not on the disabled query", () => {
    // A disabled React Query v5 query is `status: "pending"`, so a
    // signed-out shopper would see a skeleton forever.
    expect(ROUTE_SRC).toContain("accountSlotsPending({");
    expect(ROUTE_SRC).not.toContain("const pending = account.isPending");
  });

  it("asks the theme's own predicate whether the theme places the profile card", () => {
    // The theme's body only renders when it declares the route-owned body
    // slot; a merchant whose body predates that slot places NOTHING, so
    // the dashboard must carry the profile.
    expect(ROUTE_SRC).toContain("themePlacesAccountProfile(chrome?.ast)");
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
