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
});
