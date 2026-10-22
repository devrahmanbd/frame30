/**
 * The account's four placeable panels — their contract suite.
 *
 * The panels are the account surface's contents, turned into widgets a theme
 * may place in its own body. That is a power and a risk, and this suite is
 * the guard on both:
 *
 *   (a) the catalogue carries the four panel types, each `templates:
 *       ["account"]` and `heading: false` — they are route-owned panels, not
 *       free-standing widgets;
 *   (b) a panel reads the PROVIDER and nothing else: its source contains no
 *       `fetch(`, no `supabase` and no server-function import;
 *   (c) a panel with NO provider renders NOTHING — it fails closed, it never
 *       throws and it never fetches;
 *   (d) the provider's state is the state the dashboard reads: the dashboard
 *       and a theme-placed panel agree on ONE tab and ONE open order;
 *   (e) the four panels, taken together, render the same content the
 *       dashboard renders — the dashboard IS their composition.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { catalogEntry, type SectionType } from "@/lib/builder-ast";
import type { AccountOverview as AccountOverviewPayload } from "@/lib/accounts.server";
import type { WidgetRow } from "@/lib/widget-data";
import { AccountDashboard } from "./AccountDashboard";
import {
  AccountDashboardProvider,
  useAccountDashboard,
  useAccountDashboardState,
  type AccountDashboardState,
} from "./AccountDashboardContext";
import {
  AccountDetails,
  AccountNav,
  AccountOrders,
  AccountOverview,
} from "./account-widgets";

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

const PANELS_SRC = readFileSync(
  "src/components/store/account-widgets.tsx",
  "utf8",
);
const CONTEXT_SRC = readFileSync(
  "src/components/store/AccountDashboardContext.tsx",
  "utf8",
);

const PANEL_TYPES = [
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
] as const;

const OVERVIEW: AccountOverviewPayload = {
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
  wishlist: [],
  consents: [{ channel: "email", purpose: "marketing", granted: true }],
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

const ROWS: WidgetRow[] = [
  {
    id: "o1",
    title: "ORD-2451",
    subtitle: "delivered",
    priceMinor: 129900,
    currency: "BDT",
    date: "2026-09-12T09:30:00.000Z",
  },
];

function stateOf(
  overrides: Partial<AccountDashboardState> = {},
): AccountDashboardState {
  return {
    slug: "demo",
    currency: "BDT",
    status: "ready",
    overview: OVERVIEW,
    orders: ROWS,
    tab: "orders",
    setTab: () => undefined,
    openOrderId: null,
    setOpenOrderId: () => undefined,
    orderDetail: null,
    orderDetailPending: false,
    orderDetailError: false,
    ...overrides,
  };
}

/** A widget context — the panels read the provider, not the context. */
const WIDGET_CTX = {
  section: { id: "panel-1", type: "account_nav" as SectionType, props: {} },
  str: () => "",
  bool: () => false,
  int: (_key: string, fallback: number) => fallback,
  money: (minor: number | string | null | undefined) => String(minor ?? 0),
  link: (href: string) => href,
  Heading: "h2" as const,
  primary: false,
  editing: false,
  locale: "en" as const,
  renderChildren: () => null,
};

/** The provider around one child. */
function withProvider(state: AccountDashboardState, child: ReactNode) {
  return createElement(AccountDashboardProvider, {
    value: state,
    children: child,
  });
}

/** The dashboard's own props — the surface without a provider. */
const DASHBOARD_PROPS = {
  slug: "demo",
  overview: OVERVIEW,
  status: "ready" as const,
  tab: "orders" as const,
  currency: "BDT",
};

describe("the account panels — the catalogue", () => {
  it("carries the four panel types, each owned by the account template", () => {
    for (const type of PANEL_TYPES) {
      const entry = catalogEntry(type);
      expect(entry, type).toBeDefined();
      expect(entry!.templates, type).toEqual(["account"]);
      expect(entry!.heading, type).toBe(false);
      expect(entry!.group, type).toBe("context");
      expect(entry!.slots, type).toEqual(["main"]);
    }
  });

  it("keeps them out of every other template", () => {
    for (const type of PANEL_TYPES) {
      expect(catalogEntry(type)!.templates).toEqual(["account"]);
    }
  });
});

describe("the account panels — they read the provider and nothing else", () => {
  it("fetches nothing and imports no server module", () => {
    for (const source of [PANELS_SRC, CONTEXT_SRC]) {
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("supabase");
      expect(source).not.toContain(".functions.ts");
      expect(source).not.toContain("publicClient");
      expect(source).not.toContain("requireSupabaseAuth");
    }
  });

  it("reads the provider through the one documented hook", () => {
    expect(PANELS_SRC).toContain("useAccountDashboardState");
    // …and the strict read throws a NAMED error when there is no provider.
    expect(CONTEXT_SRC).toContain("AccountDashboardProviderMissing");
  });

  it("throws a named error from the strict read when there is no provider", () => {
    function Reader() {
      const state = useAccountDashboard();
      return createElement("span", null, state.slug);
    }
    expect(() => renderToStaticMarkup(createElement(Reader))).toThrow(
      /AccountDashboardProviderMissing/,
    );
  });

  it("returns null from the safe read when there is no provider", () => {
    function Reader() {
      const state = useAccountDashboardState();
      return createElement("span", null, state === null ? "none" : "some");
    }
    expect(renderToStaticMarkup(createElement(Reader))).toContain("none");
  });
});

describe("the account panels — no provider, no panel", () => {
  it("renders nothing at all, and never throws", () => {
    expect(renderToStaticMarkup(createElement(AccountNav, WIDGET_CTX))).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(createElement(AccountOverview, WIDGET_CTX)),
    ).toBe("");
    expect(renderToStaticMarkup(createElement(AccountOrders, WIDGET_CTX))).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(createElement(AccountDetails, WIDGET_CTX)),
    ).toBe("");
  });
});

describe("the account panels — the provider is the one state", () => {
  it("renders the navigation from the provider's tab", () => {
    const html = renderToStaticMarkup(
      withProvider(
        stateOf({ tab: "wishlist" }),
        createElement(AccountNav, WIDGET_CTX),
      ),
    );
    expect(html).toContain('aria-selected="true"');
    // The wishlist tab is the selected one — the provider's tab, not a prop.
    expect(html).toContain('id="account-tab-wishlist"');
    expect(html).toContain('aria-selected="false"');
  });

  it("renders the overview from the provider's overview", () => {
    const html = renderToStaticMarkup(
      withProvider(stateOf(), createElement(AccountOverview, WIDGET_CTX)),
    );
    expect(html).toContain("ORD-2451");
    expect(html).toContain("1 order");
    expect(html).toContain("Dhaka");
  });

  it("renders the orders from the provider's rows", () => {
    const html = renderToStaticMarkup(
      withProvider(stateOf(), createElement(AccountOrders, WIDGET_CTX)),
    );
    expect(html).toContain("ORD-2451");
    expect(html).toContain("delivered");
    expect(html).toContain("1,299");
  });

  it("renders the details from the provider's overview", () => {
    const html = renderToStaticMarkup(
      withProvider(
        stateOf({ tab: "addresses" }),
        createElement(AccountDetails, WIDGET_CTX),
      ),
    );
    expect(html).toContain("Home");
    expect(html).toContain("12 Demo Road");
  });

  it("gives the dashboard and a theme-placed panel ONE tab and ONE open order", () => {
    const html = renderToStaticMarkup(
      withProvider(
        stateOf({
          tab: "orders",
          openOrderId: "o1",
          onLoadOrder: () => undefined,
        }),
        createElement(AccountDashboard, DASHBOARD_PROPS),
      ),
    );
    // ONE tab is selected — the provider's.
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('id="account-tab-orders"');
    // ONE order is open — the provider's — and both copies agree.
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-controls="account-order-detail-o1"');
  });

  it("skips a panel the theme placed — the dashboard's fallback does not duplicate it", () => {
    const html = renderToStaticMarkup(
      withProvider(
        stateOf({ placed: ["account_nav"] }),
        createElement(AccountDashboard, DASHBOARD_PROPS),
      ),
    );
    // The nav is the theme's own now: the dashboard does not draw it again.
    expect(html).not.toContain('role="tablist"');
    // …and the rest of the surface is still the dashboard's.
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("ORD-2451");
  });
});

describe("the account panels — the dashboard is their composition", () => {
  const provider = stateOf();

  function dashboardHtml() {
    return renderToStaticMarkup(
      withProvider(provider, createElement(AccountDashboard, DASHBOARD_PROPS)),
    );
  }

  it("draws the panels' own markup — the dashboard is their composition", () => {
    const html = dashboardHtml();
    const nav = renderToStaticMarkup(
      withProvider(provider, createElement(AccountNav, WIDGET_CTX)),
    );
    const overview = renderToStaticMarkup(
      withProvider(provider, createElement(AccountOverview, WIDGET_CTX)),
    );
    const orders = renderToStaticMarkup(
      withProvider(provider, createElement(AccountOrders, WIDGET_CTX)),
    );
    expect(nav.length).toBeGreaterThan(0);
    expect(html).toContain(nav);
    expect(html).toContain(overview);
    expect(html).toContain(orders);
  });

  it("renders the same content the dashboard renders today", () => {
    const html = dashboardHtml();
    // The navigation's five destinations.
    for (const label of [
      "Orders",
      "Addresses",
      "Wishlist",
      "Profile",
      "Privacy",
    ]) {
      expect(html, label).toContain(label);
    }
    // The overview strip's facts.
    expect(html).toContain("At a glance");
    expect(html).toContain("Latest order");
    expect(html).toContain("Saved items");
    // The order row's fields.
    expect(html).toContain("ORD-2451");
    expect(html).toContain("delivered");
    expect(html).toContain("1,299");
  });
});
