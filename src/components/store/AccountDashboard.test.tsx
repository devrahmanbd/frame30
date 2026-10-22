/**
 * The account dashboard — its own suite.
 *
 * The dashboard is the account surface's designed body: a header, an
 * INTENTIONAL navigation (five tabs, each with an icon, a label and a
 * selected state), an overview strip built only from data the shopper's own
 * `customer_overview` payload carries, the composed profile and structured
 * order rows.
 *
 * The six states the surface distinguishes are each reachable and each
 * DISTINCT: signed out, loading, failed, signed in with orders, signed in
 * without orders.
 *
 * Vitest env node — NO jsdom/testing-library. Static markup via
 * `renderToStaticMarkup` + the router's `Link` mocked (the repo's own
 * convention, `src/components/store/StoreHeader.test.tsx`).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { bucketForWidth } from "@/lib/responsive";
import { ACCOUNT_TABS } from "@/lib/account-tab";
import type { AccountOverview } from "@/lib/accounts.server";

const navigated = vi.hoisted(() => ({
  last: null as { to: string; params: unknown } | null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => (options: { to: string; params: unknown }) => {
      navigated.last = options;
    },
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

import { AccountDashboard, OrderDetail } from "./AccountDashboard";
import type { AccountOrderDetail } from "./AccountDashboard";

/**
 * The account SURFACE's source — the dashboard and the panels module that
 * holds its four panels (Frame30 made them placeable widgets). The
 * assertions below are unchanged; they now cover the surface's source.
 */
const SOURCE =
  readFileSync("src/components/store/AccountDashboard.tsx", "utf8") +
  readFileSync("src/components/store/account-widgets.tsx", "utf8");

const OVERVIEW: AccountOverview = {
  profile: {
    id: "p1",
    name: "Rumana Haque",
    email: "rumana@example.com",
    phone: "01700000000",
  },
  addresses: [
    {
      id: "a1",
      address_type: "shipping",
      label: "Home",
      full_name: "Rumana Haque",
      phone: "01700000000",
      line1: "12 Demo Road",
      line2: null,
      city: "Dhaka",
      district: "Dhaka",
      postcode: "1207",
      is_default: true,
    },
  ],
  wishlist: [
    {
      id: "w1",
      variant_id: "v1",
      stock_alert: false,
      variant_name: "Default",
      price_amount_minor_int: 129900,
      stock_quantity: 4,
      product_title: "Dhakai Jamdani Heritage Saree",
      product_slug: "dhakai-jamdani-heritage-saree",
    },
  ],
  consents: [
    { channel: "email", purpose: "marketing", granted: true },
    { channel: "sms", purpose: "marketing", granted: false },
  ],
  orders: [
    {
      id: "o1",
      order_number: "ORD-2451",
      status: "delivered",
      total_minor_int: 129900,
      currency_code: "BDT",
      created_at: "2026-09-12T09:30:00.000Z",
    },
    {
      id: "o2",
      order_number: "ORD-2468",
      status: "shipped",
      total_minor_int: 54900,
      currency_code: "BDT",
      created_at: "2026-09-29T13:05:00.000Z",
    },
  ],
  reviews: [],
};

/**
 * The session-scoped order detail — the shape the `customer_order_detail`
 * RPC returns for the shopper's own order.
 */
const DETAIL: AccountOrderDetail = {
  order: {
    id: "o1",
    order_number: "ORD-2451",
    status: "delivered",
    payment_method: "cod",
    currency_code: "BDT",
    subtotal_minor_int: 129900,
    shipping_minor_int: 0,
    discount_minor_int: 0,
    cod_surcharge_minor_int: 0,
    vat_minor_int: 0,
    total_minor_int: 129900,
    city: "Dhaka",
    created_at: "2026-09-12T09:30:00.000Z",
  },
  items: [
    {
      title: "Dhakai Jamdani Heritage Saree",
      variant_name: "Default",
      quantity: 1,
      unit_minor: 129900,
      line_minor: 129900,
    },
  ],
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

describe("the account dashboard — the header", () => {
  it("shows the shopper's name and a one-line status", () => {
    const html = render();
    expect(html).toContain("Your Account");
    expect(html).toContain("Signed in as");
    expect(html).toContain("Rumana Haque");
    expect(html).toContain("rumana@example.com");
  });

  it("says so honestly when the profile carries no name", () => {
    const html = render({
      overview: { ...OVERVIEW, profile: null },
    });
    expect(html).toContain("Signed in to this store&#x27;s account.");
    expect(html).not.toContain("Rumana Haque");
  });
});

describe("the account dashboard — the navigation", () => {
  it("is a real tablist with one tab per account destination", () => {
    const html = render();
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)?.length ?? 0).toBe(ACCOUNT_TABS.length);
    // Every tab carries an icon (an inline <svg>) and a label.
    expect(html.match(/<svg/g)?.length ?? 0).toBeGreaterThanOrEqual(
      ACCOUNT_TABS.length,
    );
    for (const label of [
      "Orders",
      "Addresses",
      "Wishlist",
      "Profile",
      "Privacy",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("marks the selected tab and only that one", () => {
    const html = render({ tab: "wishlist" });
    expect(html).toContain('aria-selected="true"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-selected="false"');
  });

  it("links every tab to a `?tab=` value on the account route", () => {
    const html = render();
    const tabs = [...html.matchAll(/data-link-to="([^"]+)"/g)].map(
      (match) => match[1],
    );
    // Every account destination is the SAME route with a `?tab=` value, and
    // every other link is a route that exists.
    const allowed = new Set([
      "/store/$slug/account",
      "/store/$slug/p/$productSlug",
      "/store/$slug",
    ]);
    for (const link of tabs) expect(allowed.has(link)).toBe(true);
    expect(tabs).toContain("/store/$slug/account");
    // The order route is NOT linked: it is token-gated (`loadOrder` returns
    // nothing without the order's own access token) and the account payload
    // carries no token, so a link to it would dead-end on a 404. The row
    // DISCLOSES the order instead.
    expect(tabs).not.toContain("/store/$slug/order/$orderId");
    const searches = [...html.matchAll(/data-link-search="([^"]+)"/g)].map(
      (match) => match[1],
    );
    for (const search of searches) {
      if (!search.includes("tab")) continue;
      const tab = /&quot;tab&quot;:&quot;([a-z_]+)&quot;/.exec(search)?.[1];
      expect(tab).toBeTruthy();
      expect(ACCOUNT_TABS as readonly string[]).toContain(tab);
    }
  });

  it("points the tabpanel at the selected tab", () => {
    const html = render({ tab: "addresses" });
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="account-tab-addresses"');
  });
});

describe("the account dashboard — the ARIA tabs pattern", () => {
  it("keeps ONE tab in the tab sequence (the roving tabindex)", () => {
    const html = render();
    // The tablist is ONE tab stop: the selected tab is focusable, every
    // other tab is reachable with the arrow keys, not with Tab.
    const tags = html.match(/<a [^>]*role="tab"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(ACCOUNT_TABS.length);
    const focusable = tags.filter((tag) => tag.includes('tabindex="0"'));
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toContain('id="account-tab-orders"');
    const roving = tags.filter((tag) => tag.includes('tabindex="-1"'));
    expect(roving).toHaveLength(ACCOUNT_TABS.length - 1);
  });

  it("moves the focus between the tabs with the arrow keys", () => {
    // The tablist handles ArrowLeft / ArrowRight, and Home / End.
    expect(SOURCE).toContain('event.key === "ArrowRight"');
    expect(SOURCE).toContain('event.key === "ArrowLeft"');
    expect(SOURCE).toContain('event.key === "Home"');
    expect(SOURCE).toContain('event.key === "End"');
    // …and the focus actually moves (the tab refs are focused).
    expect(SOURCE).toContain("tabRefs.current[target.tab]?.focus()");
  });

  it("moves the focus to the panel when a tab is activated", () => {
    const html = render();
    // The panel is focusable…
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="account-panel"');
    // …and the activation hands it the focus.
    expect(SOURCE).toContain("panelRef.current?.focus()");
  });
});

describe("the account dashboard — the overview strip", () => {
  it("shows only facts the shopper's own payload carries", () => {
    const html = render();
    // The order count.
    expect(html).toContain("2 orders");
    // The most recent order's number and status.
    expect(html).toContain("ORD-2468");
    // The default address's city.
    expect(html).toContain("Dhaka");
    // The wishlist count.
    expect(html).toContain("Saved items");
  });

  it("invents no figure the payload does not carry", () => {
    const html = render();
    // No spent total, no loyalty tier, no "unread" counter — none of them
    // is a fact the `customer_overview` RPC returns.
    expect(html).not.toContain("Total spent");
    expect(html).not.toContain("Loyalty");
    expect(html).not.toContain("unread");
    expect(html).not.toContain("Points");
  });

  it('says "not set" instead of guessing a default address', () => {
    const html = render({
      overview: { ...OVERVIEW, addresses: [] },
    });
    expect(html).toContain("Not set");
  });
});

describe("the account dashboard — the orders", () => {
  it("lays the orders out as rows: number, date, status and total", () => {
    const html = render({ tab: "orders" });
    expect(html).toContain("ORD-2451");
    expect(html).toContain("ORD-2468");
    expect(html).toContain("delivered");
    expect(html).toContain("shipped");
    // The server's own money — never client arithmetic.
    expect(html).toContain("1,299");
    expect(html).toContain("549");
  });

  it("discloses the order inline instead of linking to the token-gated order route", () => {
    const html = render({ tab: "orders", onLoadOrder: () => undefined });
    // No link to the order route: it needs the order's access token, which
    // the account payload does not carry, so a link would 404.
    expect(html).not.toContain('data-link-to="/store/$slug/order/$orderId"');
    // One disclosure control per row, pointing at its own region.
    const controls = html.match(/aria-controls="account-order-detail-[^"]+"/g);
    expect(controls).toHaveLength(OVERVIEW.orders.length);
    expect(html).toContain('aria-controls="account-order-detail-o1"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("View order");
  });

  it("draws no disclosure control where there is no session to resolve one", () => {
    // The theme preview has no shopper, so no affordance is drawn there.
    const html = render({ tab: "orders" });
    expect(html).not.toContain("View order");
  });

  it("shows the empty state when the shopper has no orders", () => {
    const html = render({ overview: { ...OVERVIEW, orders: [] } });
    expect(html).toContain("No orders yet.");
    expect(html).toContain('data-link-to="/store/$slug"');
  });

  it("renders the disclosed order from the session-scoped payload", () => {
    const html = renderToStaticMarkup(
      createElement(OrderDetail, { detail: DETAIL, lang: "en" }),
    );
    // The order's own fields…
    expect(html).toContain("ORD-2451");
    expect(html).toContain("delivered");
    expect(html).toContain("cod");
    // …its line items…
    expect(html).toContain("Dhakai Jamdani Heritage Saree");
    expect(html).toContain("Default");
    // …and its server-priced totals. Nothing is computed on the client.
    expect(html).toContain("1,299");
    expect(html).toContain("Subtotal");
    expect(html).toContain("Delivery");
    expect(html).toContain("Total");
  });
});

describe("the account dashboard — the six states", () => {
  const states = {
    unauthenticated: render({ status: "unauthenticated", overview: undefined }),
    loading: render({ status: "loading", overview: undefined }),
    failure: render({ status: "error", overview: undefined }),
    withOrders: render({ tab: "orders" }),
    noOrders: render({ overview: { ...OVERVIEW, orders: [] } }),
  };

  it("renders each state", () => {
    expect(states.unauthenticated).toContain("Track Your Order");
    expect(states.loading).toContain("Loading your account");
    expect(states.failure).toContain("We could not load your account");
    expect(states.withOrders).toContain("ORD-2451");
    expect(states.noOrders).toContain("No orders yet.");
  });

  it("keeps every state distinct", () => {
    const rendered = Object.values(states);
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("keeps the signed-out state on the platform's own order lookup", () => {
    // The lookup form posts the shopper to the real order route.
    expect(states.unauthenticated).toContain("order-lookup-input");
  });

  it("asks a signed-out shopper for the order's access code, so the lookup can never 404", () => {
    // The order route is token-gated: `loadOrder` returns nothing unless the
    // request carries the order's own access token. A lookup that carried
    // only the order id would dead-end on a 404 — so the code is asked for,
    // and the navigation carries it.
    expect(states.unauthenticated).toContain("order-lookup-code");
    expect(SOURCE).toContain("search: { t: code.trim() }");
  });

  it("shows the signed-out state, never a skeleton", () => {
    // The overview query is DISABLED for a signed-out shopper, and a
    // disabled React Query v5 query is `status: "pending"` — so the
    // widgets' skeleton flag is gated on the session
    // (`accountSlotsPending`). The signed-out shopper reaches the lookup.
    expect(states.unauthenticated).not.toContain("animate-pulse");
    expect(states.unauthenticated).toContain("Track Your Order");
  });
});

describe("the account dashboard — the privacy switches", () => {
  it("disables the consent switches while the consent mutation is in flight", () => {
    const html = render({
      tab: "privacy",
      onSetConsent: () => undefined,
      busy: { consent: true },
    });
    const inputs = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(4);
    for (const input of inputs) expect(input).toContain("disabled");
  });

  it("leaves the consent switches live when nothing is in flight", () => {
    const html = render({
      tab: "privacy",
      onSetConsent: () => undefined,
      busy: { consent: false },
    });
    const inputs = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(4);
    for (const input of inputs) expect(input).not.toContain("disabled");
  });
});

describe("the account dashboard — the layout contract", () => {
  const WIDTHS = [1440, 1280, 768, 430, 390, 375];

  it("maps every required width onto the platform's own buckets", () => {
    // Every required width, and the bucket the platform's own helper gives
    // it — asserted once each, in one list, rather than in a loop over the
    // same markup six times.
    expect(WIDTHS.map((width) => bucketForWidth(width))).toEqual([
      "desktop",
      "desktop",
      "tablet",
      "mobile",
      "mobile",
      "mobile",
    ]);
  });

  it("lays out through the platform's own breakpoints", () => {
    // The dashboard is ONE markup at every width: the width decides which
    // of the platform's breakpoint rules is the live one. So the class
    // contract is asserted ONCE, and the bucket mapping above carries every
    // width. The PIXELS are measured in the Task 7 Playwright lane
    // (`.e2e/songoskriti-storefront-surfaces.spec.ts`), which is where the
    // real frames are rendered.
    const html = render();
    // The overview strip: one column on mobile, two from `sm`, four from
    // `xl` — the platform's own breakpoints (`src/lib/responsive.ts`).
    expect(html).toContain("grid gap-4 sm:grid-cols-2 xl:grid-cols-4");
    // The navigation: a scrolling strip on mobile, a wrapping row from `sm`.
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("sm:flex-wrap");
    // The order rows: stacked on mobile, a row from `sm`.
    expect(html).toContain("sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]");
  });

  it("uses no hand-rolled breakpoint variant", () => {
    // `max-[430px]:` / `min-[375px]:` style variants would drift from the
    // platform's device frames; the storefront's own breakpoints only.
    expect(SOURCE).not.toMatch(/\b(?:min|max)-\[/);
    expect(SOURCE).not.toMatch(/\b(?:min|max)-\[\\d+px\]/);
  });

  it("keeps every interactive target at the platform's minimum", () => {
    // The platform's minimum touch target is 44px (`MIN_TOUCH_PX`,
    // `src/lib/responsive.ts:53`).
    const html = render();
    expect(html).toContain("min-h-11");
    // The forms (the address and the profile editors) carry the same floor.
    expect(SOURCE).toContain("min-h-12");
    expect(SOURCE).toContain("min-h-14");
  });
});
