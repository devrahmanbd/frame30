import { describe, expect, it } from "vitest";
import { mergePublicVariants, type PublicVariant } from "./storefront.server";

const row = (
  product_id: string,
  price: number,
  stock: number,
): PublicVariant => ({
  product_id,
  id: `${product_id}-v1`,
  name: "Default",
  sku: null,
  price_amount_minor_int: price,
  compare_at_amount_minor_int: null,
  stock_quantity: stock,
});

describe("mergePublicVariants", () => {
  it("attaches fetched rows by product id", () => {
    const out = mergePublicVariants(
      [{ id: "p1" }, { id: "p2" }],
      [row("p1", 285000, 50)],
    );
    expect(out[0].product_variants).toHaveLength(1);
    expect(out[0].product_variants[0].price_amount_minor_int).toBe(285000);
    // No rows for p2: falls back to empty, never undefined.
    expect(out[1].product_variants).toEqual([]);
  });

  it("overrides the anon join (which resolves to [] without a public policy)", () => {
    const out = mergePublicVariants(
      [{ id: "p1", product_variants: [] }],
      [row("p1", 185000, 100), row("p1", 195000, 5)],
    );
    expect(out[0].product_variants).toHaveLength(2);
  });

  it("ignores rows for unknown products and empty input", () => {
    const out = mergePublicVariants([{ id: "p1" }], [row("ghost", 100, 1)]);
    expect(out[0].product_variants).toEqual([]);
    expect(mergePublicVariants([], [row("p1", 100, 1)])).toEqual([]);
  });

  it("resolves pricing and stock for simple products without variants", () => {
    const out = mergePublicVariants(
      [
        {
          id: "sp-1",
          price_amount_minor_int: 350000,
          stock_quantity: 15,
          status: "active",
        },
        {
          id: "sp-2",
          price: 25.5,
          stock_quantity: 0,
        },
        {
          id: "sp-3",
          price_min_minor_int: 120000,
        },
      ],
      [],
    );

    expect(out[0].product_variants).toEqual([]);
    expect(out[0].price_amount_minor_int).toBe(350000);
    expect(out[0].stock_quantity).toBe(15);
    expect(out[0].status).toBe("active");

    expect(out[1].product_variants).toEqual([]);
    expect(out[1].price_amount_minor_int).toBe(2550); // Math.round(25.5 * 100)
    expect(out[1].stock_quantity).toBe(0);
    expect(out[1].status).toBe("active");

    expect(out[2].product_variants).toEqual([]);
    expect(out[2].price_amount_minor_int).toBe(120000);
    expect(out[2].stock_quantity).toBeNull();
  });

  it("hoists min variant price and total stock for multi-variant products", () => {
    const out = mergePublicVariants(
      [{ id: "mp-1", status: "active" }],
      [row("mp-1", 500000, 10), row("mp-1", 420000, 5)],
    );

    expect(out[0].product_variants).toHaveLength(2);
    expect(out[0].price_amount_minor_int).toBe(420000);
    expect(out[0].stock_quantity).toBe(15);
  });

  it("preserves and hoists embedded product_variants when row list is empty", () => {
    const embedded = [
      {
        product_id: "emb-1",
        id: "emb-v1",
        name: "Standard",
        sku: "EMB-STD",
        price_amount_minor_int: 320000,
        compare_at_amount_minor_int: null,
        stock_quantity: 8,
      },
    ];
    const out = mergePublicVariants(
      [{ id: "emb-1", product_variants: embedded, status: "active" }],
      [],
    );

    expect(out[0].product_variants).toHaveLength(1);
    expect(out[0].price_amount_minor_int).toBe(320000);
    expect(out[0].stock_quantity).toBe(8);
  });
});

