/**
 * Songoskriti's preview demo data — the cart, the account and the facets.
 *
 * The expert's bar is *"demo data is realistic and explicitly labelled"*.
 * These four contracts are what make it true:
 *
 * - the cart's **money is derived from its lines** — never a second hand-typed
 *   number that can disagree with the lines beside it;
 * - every cart line names a **real Songoskriti demo product** at the
 *   catalogue's own price;
 * - the cart is **not the studio's snapshot** ("Sample product" /
 *   "Second product") and is **inert** — synthetic, never live;
 * - the account is **visibly demo** ("(demo shopper)", an RFC 2606
 *   `.example` address) and its order history reads like one.
 *
 * The facet rows are shaped for the platform's own facet reader
 * (`groupFacetRows`), so the preview's filter column and the preview's
 * products always agree.
 */
import { describe, expect, it } from "vitest";
import {
  songoskritiPreviewCart,
  songoskritiPreviewFacets,
} from "./preview-demo-data";
import { demoCatalogFor } from "../../demo-catalog";
import { groupFacetRows } from "../../../components/builder/collection";

/** The three Songoskriti demo products the preview's cart and orders name. */
const PREVIEW_SLUGS = [
  "dhakai-jamdani-heritage-saree",
  "comilla-khadi-casual-kurta",
  "dhamrai-brass-heritage-necklace",
] as const;

const CATALOG = demoCatalogFor("songoskriti");

function catalogueProduct(slug: string) {
  const product = CATALOG.products.find((p) => p.slug === slug);
  if (!product) throw new Error(`no demo product "${slug}"`);
  return product;
}

describe("songoskriti preview demo data — cart", () => {
  it("derives the cart's money from its lines", () => {
    const totals = songoskritiPreviewCart().totals!;
    expect(totals.subtotalMinor).toBe(
      totals.lines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    );
    expect(totals.totalMinor).toBe(totals.subtotalMinor + totals.shippingMinor);
  });

  it("cites real Songoskriti demo products", () => {
    const totals = songoskritiPreviewCart().totals!;
    expect(totals.lines.map((l) => l.productTitle)).toEqual([
      "Dhakai Jamdani Heritage Saree",
      "Comilla Handspun Khadi Kurta",
      "Dhamrai Brass Heritage Necklace",
    ]);
    // …and those titles are the catalogue's own, at the catalogue's price.
    expect(totals.lines.map((l) => l.productTitle)).toEqual(
      PREVIEW_SLUGS.map((slug) => catalogueProduct(slug).title),
    );
    expect(totals.lines.map((l) => l.unitPriceMinor)).toEqual(
      PREVIEW_SLUGS.map((slug) => catalogueProduct(slug).variants[0]!.price),
    );
    expect(
      totals.lines.every((l) => l.unitPriceMinor > 0 && l.quantity > 0),
    ).toBe(true);
  });

  it("is not the studio's snapshot", () => {
    const serialised = JSON.stringify(songoskritiPreviewCart());
    expect(serialised).not.toContain("Sample product");
    expect(serialised).not.toContain("Second product");
  });

  it("is synthetic, inert — and type-complete", () => {
    const cart = songoskritiPreviewCart();
    expect(cart.live).toBe(false);
    expect(cart.pending).toBe(false);
    expect(cart.error).toBeNull();
    expect(cart.methods.length).toBeGreaterThan(0);

    // The context value's `lines` is `CartLine[]` — `{ variantId, quantity }`
    // and nothing else (`src/lib/cart.ts:4`). It is the field the
    // `cart_lines` widget merges quantities from.
    expect(cart.lines.length).toBeGreaterThan(0);
    expect(
      cart.lines.every(
        (l) =>
          typeof l.variantId === "string" &&
          l.variantId.length > 0 &&
          l.quantity > 0,
      ),
    ).toBe(true);
    expect(Object.keys(cart.lines[0]!).sort()).toEqual([
      "quantity",
      "variantId",
    ]);
    // …and it is tied to the priced lines.
    expect(cart.lines.map((l) => l.variantId)).toEqual(
      cart.totals!.lines.map((l) => l.variantId),
    );
    expect(cart.lines.reduce((n, l) => n + l.quantity, 0)).toBe(cart.count);

    // The two free-shipping fields live on `totals`, NOT on the context
    // value (`src/components/builder/CartContext.tsx:35`, `:37`).
    expect(cart.totals!.freeShippingThresholdMinor).toBe(300000);
    expect(cart.totals!.freeShippingRemainingMinor).toBe(
      Math.max(0, 300000 - cart.totals!.subtotalMinor),
    );
    expect("freeShippingThresholdMinor" in cart).toBe(false);
    expect("freeShippingRemainingMinor" in cart).toBe(false);
  });
});

describe("songoskriti preview demo data — account", () => {
  it("shows a shopper profile that is visibly demo", async () => {
    const { songoskritiPreviewProfile } = await import("./preview-demo-data");
    const profile = songoskritiPreviewProfile();
    expect(profile.title).toContain("demo shopper");
    // RFC 2606 reserved domain — the address can never be a real customer.
    expect(profile.subtitle).toMatch(/@example\.[a-z]+$/);
    // A Bangladeshi mobile shape.
    expect(profile.body).toMatch(/^01\d{9}$/);
  });

  it("shows an order history that reads like one", async () => {
    const { songoskritiPreviewOrders } = await import("./preview-demo-data");
    const orders = songoskritiPreviewOrders();
    expect(orders.length).toBeGreaterThanOrEqual(3);
    for (const order of orders) {
      expect(order.title).toMatch(/^ORD-\d{4}$/);
      expect(order.subtitle).toBeTruthy();
      expect(["placed", "packed", "shipped", "delivered"]).toContain(
        order.subtitle,
      );
      expect(order.currency).toBe("BDT");
      expect(order.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(
      orders.every((o) => typeof o.priceMinor === "number" && o.priceMinor > 0),
    ).toBe(true);
    // Every order's total is the catalogue price of the product it names.
    expect(orders.map((o) => o.priceMinor)).toEqual([1850000, 285000, 185000]);
  });
});

describe("songoskriti preview demo data — facets", () => {
  it("shapes the facet rows for the platform's facet reader", () => {
    const grouped = groupFacetRows(songoskritiPreviewFacets());
    expect(grouped.category.length).toBeGreaterThan(0);
    expect(grouped.kind.length).toBeGreaterThan(0);
    expect(grouped.stock).toBeGreaterThan(0);
    expect(grouped.total).toBeGreaterThan(0);
    expect(grouped.category.every((r) => r.title.length > 0)).toBe(true);
  });
});
