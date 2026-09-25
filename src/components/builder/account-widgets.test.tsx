/**
 * Account-template widgets — orders_list, profile_card. TDD.
 *
 * Shopper scoping is server-side (session filter, never client-filter), so a
 * signed-out shopper resolves NO rows: `orders_list` must render a sign-in
 * prompt linking `/account` when dataless, and `profile_card` must render
 * without crashing. Both render their rows when `data` is supplied.
 *
 * Components are imported DIRECTLY from `./account` — the catalog/registry
 * entries land at integration, so the `WIDGET_COMPONENTS` map cannot address
 * these types yet.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PropValue, Section, SectionType } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { previewDemoMap } from "@/lib/preview-demo-data";
import { OrdersList, ProfileCard } from "./account";
import { widgetReader, type WidgetCtx } from "./widgets";

function sectionOf(
  type: "orders_list" | "profile_card",
  props: Record<string, PropValue> = {},
): Section {
  return {
    id: `test-${type}`,
    type: type as unknown as SectionType,
    props,
  };
}

function ctxFor(
  type: "orders_list" | "profile_card",
  locale: "en" | "bn",
  data?: { rows?: WidgetRow[]; pending: boolean },
  props: Record<string, PropValue> = {},
): WidgetCtx {
  const section = sectionOf(type, props);
  return {
    section,
    ...widgetReader(section, undefined, locale),
    link: (href: string) => href,
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test-store",
    data,
    renderChildren: () => null,
  };
}

const ORDER_ROWS: WidgetRow[] = [
  {
    id: "demo-ord-1",
    title: "ORD-1001",
    subtitle: "delivered",
    priceMinor: 129900,
    currency: "BDT",
    date: "2026-09-10T10:00:00.000Z",
  },
  {
    id: "demo-ord-2",
    title: "ORD-1002",
    subtitle: "shipped",
    priceMinor: 54900,
    currency: "BDT",
    date: "2026-09-18T10:00:00.000Z",
  },
];

const PROFILE_ROW: WidgetRow = {
  id: "demo-profile",
  title: "Demo Shopper",
  subtitle: "demo@example.com",
  body: "01700000000",
};

describe("orders_list", () => {
  it("renders a sign-in prompt linking /account when dataless", () => {
    const html = renderToStaticMarkup(
      <>{OrdersList(ctxFor("orders_list", "en", undefined))}</>,
    );
    expect(html).toContain("Sign in");
    expect(html).toContain('href="/account"');
  });

  it("renders the sign-in prompt in Bangla", () => {
    const html = renderToStaticMarkup(
      <>{OrdersList(ctxFor("orders_list", "bn", undefined))}</>,
    );
    expect(html).toContain("সাইন ইন");
    expect(html).toContain('href="/account"');
  });

  it("renders the empty state when signed in with no orders", () => {
    const html = renderToStaticMarkup(
      <>
        {OrdersList(ctxFor("orders_list", "en", { rows: [], pending: false }))}
      </>,
    );
    expect(html).toContain("No orders yet.");
  });

  it("renders order rows when data is supplied", () => {
    const html = renderToStaticMarkup(
      <>
        {OrdersList(
          ctxFor("orders_list", "en", { rows: ORDER_ROWS, pending: false }),
        )}
      </>,
    );
    expect(html).toContain("ORD-1001");
    expect(html).toContain("ORD-1002");
    // Totals print from server minor units — never client math.
    expect(html).toContain("1,299");
  });
});

describe("profile_card", () => {
  it("renders without crashing when dataless", () => {
    const html = renderToStaticMarkup(
      <>{ProfileCard(ctxFor("profile_card", "en", undefined))}</>,
    );
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders the profile row when data is supplied", () => {
    const html = renderToStaticMarkup(
      <>
        {ProfileCard(
          ctxFor("profile_card", "en", {
            rows: [PROFILE_ROW],
            pending: false,
          }),
        )}
      </>,
    );
    expect(html).toContain("Demo Shopper");
    expect(html).toContain("demo@example.com");
  });
});

describe("account preview demo rows", () => {
  it("resolves 2 demo BDT orders for the orders source", () => {
    const map = previewDemoMap(
      {
        requests: [{ key: "k", source: "orders" as never, params: {} }],
        byNode: {},
      },
      "bazaar",
    );
    const rows = map["k"] ?? [];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.title).toBeTruthy();
      expect(row.currency).toBe("BDT");
      expect(row.priceMinor ?? 0).toBeGreaterThan(0);
    }
  });

  it("resolves 1 demo profile for the profile source", () => {
    const map = previewDemoMap(
      {
        requests: [{ key: "k", source: "profile" as never, params: {} }],
        byNode: {},
      },
      "bazaar",
    );
    const rows = map["k"] ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0]?.title).toBeTruthy();
  });
});
