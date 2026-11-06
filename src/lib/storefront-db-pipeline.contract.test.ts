import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mergePublicVariants,
  type PublicVariant,
} from "./storefront.server";
import { resolveProductPricingAndStock } from "@/components/store/CollectionView";

describe("storefront database query pipeline & variant contract", () => {
  it("enforces that database queries select valid products table columns and embedded variants", () => {
    const storefrontServerSource = readFileSync(
      resolve(process.cwd(), "src/lib/storefront.server.ts"),
      "utf8",
    );

    // 1. loadStoreCollection must select product_kind, requires_shipping and product_variants
    expect(storefrontServerSource).toContain(
      '.from("products")\n          .select(\n            "id, title, slug, description, image_url, tags, status, created_at, product_kind, requires_shipping, product_variants(id, product_id, name, sku, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity)"',
    );

    // 2. loadStoreProduct must select product_kind, requires_shipping, and status
    expect(storefrontServerSource).toContain(
      '.from("products")\n    .select(\n      "id, title, slug, description, image_url, tags, category_id, product_kind, requires_shipping, status"',
    );

    // 3. loadStorefront must select product_kind and requires_shipping
    expect(storefrontServerSource).toContain(
      '.from("products")\n      .select(\n        "id, title, slug, description, image_url, category_id, tags, status, created_at, product_kind, requires_shipping"',
    );
  });

  it("resolves products with zero variants as unpriced and out-of-stock without synthesizing fake prices", () => {
    // Database returns a products row without any variants
    const dbProduct = {
      id: "prod-no-variants",
      title: "Unconfigured Product",
      slug: "unconfigured-product",
      description: "A product created without variants in product_variants",
      image_url: null,
      tags: ["handloom"],
      status: "active",
      created_at: "2026-11-06T00:00:00Z",
      product_kind: "physical",
      requires_shipping: true,
      product_variants: [] as PublicVariant[],
    };

    const [resolved] = mergePublicVariants([dbProduct], []);

    expect(resolved.product_variants).toEqual([]);
    expect(resolved.price_amount_minor_int).toBe(0);
    expect(resolved.stock_quantity).toBeNull();

    const pricing = resolveProductPricingAndStock(resolved as never);

    expect(pricing.hasPrice).toBe(false);
    expect(pricing.priceMinMinor).toBe(0);
    expect(pricing.priceMaxMinor).toBe(0);
    expect(pricing.inStock).toBe(false);
    expect(pricing.isOutOfStock).toBe(true);
    expect(pricing.hasInventoryInfo).toBe(false);
  });

  it("resolves simple products with exactly one variant correctly through the pipeline", () => {
    const dbProduct = {
      id: "prod-single-variant",
      title: "Silk Scarf",
      slug: "silk-scarf",
      description: "100% pure silk scarf",
      image_url: "/ph/scarf.jpg",
      tags: ["silk", "women"],
      status: "active",
      created_at: "2026-11-06T00:00:00Z",
      product_kind: "physical",
      requires_shipping: true,
      product_variants: [],
    };

    const variantRows: PublicVariant[] = [
      {
        id: "var-1",
        product_id: "prod-single-variant",
        name: "Standard",
        sku: "SLK-01",
        price_amount_minor_int: 250000, // ৳ 2,500.00
        compare_at_amount_minor_int: 300000,
        stock_quantity: 8,
      },
    ];

    const [resolved] = mergePublicVariants([dbProduct], variantRows);

    expect(resolved.product_variants).toHaveLength(1);
    expect(resolved.price_amount_minor_int).toBe(250000);
    expect(resolved.stock_quantity).toBe(8);

    const pricing = resolveProductPricingAndStock(resolved as never);

    expect(pricing.hasPrice).toBe(true);
    expect(pricing.priceMinMinor).toBe(250000);
    expect(pricing.priceMaxMinor).toBe(250000);
    expect(pricing.inStock).toBe(true);
    expect(pricing.isOutOfStock).toBe(false);
    expect(pricing.isPriceRange).toBe(false);
  });

  it("resolves multi-variant products with aggregated inventory and consistent min/max bounds", () => {
    const dbProduct = {
      id: "prod-multi-variant",
      title: "Festive Panjabi",
      slug: "festive-panjabi",
      description: "Embroidered festive cotton panjabi",
      image_url: "/ph/panjabi.jpg",
      tags: ["men", "festive"],
      status: "active",
      created_at: "2026-11-06T00:00:00Z",
      product_kind: "physical",
      requires_shipping: true,
      product_variants: [],
    };

    const variantRows: PublicVariant[] = [
      {
        id: "var-m",
        product_id: "prod-multi-variant",
        name: "Size M",
        sku: "PANJ-M",
        price_amount_minor_int: 380000, // ৳ 3,800.00
        compare_at_amount_minor_int: 420000,
        stock_quantity: 4,
      },
      {
        id: "var-l",
        product_id: "prod-multi-variant",
        name: "Size L",
        sku: "PANJ-L",
        price_amount_minor_int: 420000, // ৳ 4,200.00
        compare_at_amount_minor_int: null,
        stock_quantity: 0,
      },
      {
        id: "var-xl",
        product_id: "prod-multi-variant",
        name: "Size XL",
        sku: "PANJ-XL",
        price_amount_minor_int: 450000, // ৳ 4,500.00
        compare_at_amount_minor_int: null,
        stock_quantity: 6,
      },
    ];

    const [resolved] = mergePublicVariants([dbProduct], variantRows);

    expect(resolved.product_variants).toHaveLength(3);
    expect(resolved.price_amount_minor_int).toBe(380000);
    expect(resolved.stock_quantity).toBe(10); // 4 + 0 + 6

    const pricing = resolveProductPricingAndStock(resolved as never);

    expect(pricing.hasPrice).toBe(true);
    expect(pricing.priceMinMinor).toBe(380000);
    expect(pricing.priceMaxMinor).toBe(450000);
    expect(pricing.isPriceRange).toBe(true);
    expect(pricing.inStock).toBe(true);
    expect(pricing.stockQuantity).toBe(10);
  });
});
