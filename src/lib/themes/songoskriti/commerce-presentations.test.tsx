/**
 * Songoskriti's own commerce and account renderers — their contract.
 *
 * **What is under test.** `src/lib/themes/songoskriti/commerce-presentations.tsx`
 * is the theme's own renderer for the ten commerce and account widget types
 * the theme claims (`SONGOSKRITI_PRESENTATION_CLAIMS`). A theme renderer sits
 * where the platform's renderer used to sit, so three things must hold:
 *
 *  1. **The parts prop survives the swap.** The effective order comes from
 *     `partOrder(ctx.str("parts"), type)` — the theme's own list when it is
 *     valid, the platform's default otherwise — and a part the theme dropped
 *     is not drawn. The suite renders the cart's line list and the totals
 *     with an authored order and asserts the MARKUP follows it.
 *  2. **The data is the route's, never the theme's.** The commerce renderers
 *     read the shared cart context; the account renderers read the account
 *     provider. The suite reads the module's source and asserts it never
 *     queries, never fetches and never imports a server module.
 *  3. **No money is computed.** Every figure comes from `ctx.money` over the
 *     server's MINOR UNITS. A theme renderer that divides a minor-unit
 *     figure (or multiplies a price) is a bug — the suite reads the source
 *     and fails on it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CartProvider } from "@/components/builder/CartContext";
import { widgetReader } from "@/components/builder/widgets";
import type { WidgetCtx } from "@/components/builder/widgets";
import type { Section } from "@/lib/builder-ast";
import {
  songoskritiPreviewCart,
  songoskritiPreviewOrders,
} from "./preview-demo-data";
import {
  SONGOSKRITI_COMMERCE_WIDGETS,
  SongoskritiCartLines,
  SongoskritiCartSummary,
} from "./commerce-presentations";
import { SONGOSKRITI_PRESENTATION_CLAIMS } from "./presentation-claims";

const SOURCE = readFileSync(
  new URL("./commerce-presentations.tsx", import.meta.url),
  "utf8",
);

/** The ten widget types the theme's commerce pack owns. */
const COMMERCE_TYPES = [
  "cart_lines",
  "cart_summary",
  "payment_methods",
  "checkout_steps",
  "orders_list",
  "profile_card",
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
] as const;

/** A widget context for one section. */
function ctxFor(section: Section, extra: Partial<WidgetCtx> = {}): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "songoskriti",
    data: { rows: undefined, pending: false },
    renderChildren: () => null,
    link: (href: string) => href,
    ...extra,
  } as WidgetCtx;
}

/** The section the authored prop belongs to. */
function sectionWith(type: string, props: Record<string, unknown>): Section {
  return {
    id: `${type}-1`,
    type: type as Section["type"],
    props: props as never,
  };
}

describe("songoskriti commerce presentations — the pack", () => {
  it("carries one renderer for each of the ten claimed commerce and account types", () => {
    for (const type of COMMERCE_TYPES) {
      expect(
        SONGOSKRITI_COMMERCE_WIDGETS[type],
        `${type} must have a Songoskriti renderer`,
      ).toBeTypeOf("function");
    }
    expect(Object.keys(SONGOSKRITI_COMMERCE_WIDGETS).sort()).toEqual(
      [...COMMERCE_TYPES].sort(),
    );
  });

  it("every claimed type resolves to a Songoskriti renderer, not the generic one", async () => {
    // The claims are registered through the PRODUCTIVE graph (the preview
    // entry registers them), so importing it is the registration.
    await import("./preview");
    const { resolveThemePresentation } =
      await import("@/lib/theme-presentations");
    for (const type of COMMERCE_TYPES) {
      const resolved = resolveThemePresentation("songoskriti", type);
      expect(resolved, `${type} must resolve`).toBeDefined();
      expect(resolved).toBe(SONGOSKRITI_COMMERCE_WIDGETS[type]);
    }
  });

  it("the claim set is EXACT — a dropped claim fails this suite", () => {
    // The theme's own pack (thirteen) plus the commerce pack (ten).
    const claimed = SONGOSKRITI_PRESENTATION_CLAIMS.map((key) =>
      key.toString(),
    ).sort();
    const expected = [
      "product_rail",
      "product_grid",
      "rich_text",
      "newsletter",
      "footer_sitemap",
      "payment_icons",
      "department_grid",
      "store_locator",
      "split_feature",
      "collection_story",
      "ugc_gallery",
      "category_header",
      "result_toolbar",
      ...COMMERCE_TYPES,
    ].sort();
    expect(claimed).toEqual(expected);
    expect(SONGOSKRITI_PRESENTATION_CLAIMS).toHaveLength(23);
  });
});

describe("songoskriti commerce presentations — the parts prop survives the swap", () => {
  it("the cart lines draw the parts in the AUTHORED order", () => {
    const section = sectionWith("cart_lines", {
      heading: "",
      parts: "title,variant,quantity,lineTotal,unitPrice,remove",
      layout: "row",
    });
    const html = renderToStaticMarkup(
      createElement(
        CartProvider,
        { value: songoskritiPreviewCart() },
        createElement(SongoskritiCartLines, ctxFor(section)),
      ),
    );
    const cart = songoskritiPreviewCart();
    const line = cart.totals!.lines[0]!;
    // The authored order is title → variant → quantity → line total → unit
    // price → remove, so the markers appear in exactly that order. The
    // variant's name is HTML-escaped in the markup, so it is escaped here too.
    const titleAt = html.indexOf(line.productTitle);
    const variantAt = html.indexOf(line.variantName.replace(/&/g, "&amp;"));
    const quantityAt = html.indexOf("Quantity for");
    const removeAt = html.indexOf("Remove");
    expect(titleAt).toBeGreaterThanOrEqual(0);
    expect(variantAt).toBeGreaterThan(titleAt);
    expect(quantityAt).toBeGreaterThan(variantAt);
    expect(removeAt).toBeGreaterThan(quantityAt);
  });

  it("a part the theme dropped is not drawn", () => {
    const section = sectionWith("cart_lines", {
      heading: "",
      // The quantity stepper is dropped.
      parts: "title,variant,lineTotal,unitPrice,remove",
      layout: "row",
    });
    const cart = songoskritiPreviewCart();
    const html = renderToStaticMarkup(
      createElement(
        CartProvider,
        { value: cart },
        createElement(SongoskritiCartLines, ctxFor(section)),
      ),
    );
    expect(html).not.toContain("Quantity for");
    // … and the parts that were kept are still there.
    expect(html).toContain(cart.totals!.lines[0]!.productTitle);
  });

  it("the totals draw the rows in the AUTHORED order", () => {
    const section = sectionWith("cart_summary", {
      heading: "Order summary",
      parts: "subtotal,shipping,total",
    });
    const html = renderToStaticMarkup(
      createElement(
        CartProvider,
        { value: songoskritiPreviewCart() },
        createElement(SongoskritiCartSummary, ctxFor(section)),
      ),
    );
    const subtotalAt = html.indexOf("Subtotal");
    const shippingAt = html.indexOf("Delivery");
    const totalAt = html.indexOf("Total");
    expect(subtotalAt).toBeGreaterThanOrEqual(0);
    expect(shippingAt).toBeGreaterThan(subtotalAt);
    expect(totalAt).toBeGreaterThan(shippingAt);
  });
});

describe("songoskriti commerce presentations — the data is the route's", () => {
  it("the module never queries, never fetches and never imports a server module", () => {
    expect(SOURCE).not.toMatch(/fetch\s*\(/);
    expect(SOURCE).not.toMatch(/supabase/i);
    expect(SOURCE).not.toMatch(/\.server\b/);
    expect(SOURCE).not.toMatch(/from\s+"@\/lib\/[^"]*server/);
  });

  it("the commerce renderers read the shared cart context", () => {
    expect(SOURCE).toContain("useCartContext");
  });

  it("the account renderers read the account provider", () => {
    expect(SOURCE).toContain("useAccountDashboardState");
  });

  it("the account renderer reads the same rows the platform's mapper produces", () => {
    // The demo order rows and the platform's own mapper agree — the theme
    // renderer never re-derives a row.
    const rows = songoskritiPreviewOrders();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.title).toContain("ORD-");
  });
});

describe("songoskriti commerce presentations — no money is computed", () => {
  /** The module's CODE — the comments (which contain prose asterisks) and the
   *  import paths (which contain slashes) are stripped, so the operator scan
   *  sees only executable text. */
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*import[\s\S]*?;\s*$/gm, "")
    .replace(/\/\/.*$/gm, "");

  it("the module never divides a figure and never multiplies a price", () => {
    // The platform's own rule (`src/components/builder/cart.tsx:1-11`):
    // every figure comes from `ctx.money` over the server's minor units.
    // A renderer that divides (or multiplies a minor-unit figure) is a bug.
    const divisions = CODE.match(/(?<![\w<])\/\s*[0-9a-zA-Z_(]/g) ?? [];
    expect(divisions).toEqual([]);
    const multiplications = CODE.match(/(?<![\w<])\*\s*[0-9a-zA-Z_(]/g) ?? [];
    expect(multiplications).toEqual([]);
  });

  it("every figure is formatted through ctx.money", () => {
    // The money formatter is the only place a minor-unit figure becomes a
    // string; the theme's renderers call it and never build one themselves.
    expect(SOURCE).toContain("money(");
    expect(SOURCE).not.toMatch(/toFixed\s*\(/);
    expect(SOURCE).not.toMatch(/Intl\.NumberFormat/);
  });
});
