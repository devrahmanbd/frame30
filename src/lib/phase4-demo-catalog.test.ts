import { describe, expect, it } from "vitest";
import { DEMO_CATALOGS, demoCatalogFor, type DemoCatalog } from "./demo-catalog";
import { SHIPPED_BLUEPRINT_KEYS } from "./theme-blueprints";

const keys = Object.keys(DEMO_CATALOGS) as (keyof typeof DEMO_CATALOGS)[];

function slugs(cat: DemoCatalog) {
  return {
    categories: cat.categories.map((c) => c.slug),
    collections: cat.collections.map((c) => c.slug),
  };
}

describe("per-vertical demo catalogues", () => {
  it("ships one catalogue per shipped blueprint", () => {
    for (const key of SHIPPED_BLUEPRINT_KEYS) {
      expect(keys).toContain(key);
    }
  });

  it("falls back to a broad catalogue for unknown theme keys", () => {
    expect(demoCatalogFor("not-a-theme").products.length).toBeGreaterThan(0);
  });

  it.each(keys)("%s is internally consistent and referentially valid", (key) => {
    const cat = DEMO_CATALOGS[key];
    const { categories, collections } = slugs(cat);

    expect(new Set(categories).size).toBe(categories.length);
    expect(new Set(collections).size).toBe(collections.length);
    expect(cat.products.length).toBeGreaterThanOrEqual(3);

    const productSlugs = cat.products.map((p) => p.slug);
    expect(new Set(productSlugs).size).toBe(productSlugs.length);

    const skus: string[] = [];
    for (const product of cat.products) {
      expect(categories).toContain(product.category);
      for (const c of product.collections) expect(collections).toContain(c);
      expect(product.description.length).toBeGreaterThan(20);
      expect(product.variants.length).toBeGreaterThan(0);
      for (const v of product.variants) {
        expect(v.price).toBeGreaterThan(0);
        if (v.compare_at !== undefined) expect(v.compare_at).toBeGreaterThan(v.price);
        if (v.sku) skus.push(v.sku);
      }
    }
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("every collection is used by at least one product", () => {
    for (const key of keys) {
      const cat = DEMO_CATALOGS[key];
      const used = new Set(cat.products.flatMap((p) => p.collections));
      for (const c of cat.collections) expect(used.has(c.slug)).toBe(true);
    }
  });

  it("verticals carry their domain detail", () => {
    const text = (key: keyof typeof DEMO_CATALOGS) =>
      DEMO_CATALOGS[key].products.map((p) => `${p.description} ${p.variants.map((v) => v.name).join(" ")}`).join(" ");
    expect(text("atelier")).toMatch(/cotton|linen|Model is/i);
    expect(text("circuit")).toMatch(/warranty/i);
    expect(text("rupaboti")).toMatch(/Step \d|shade/i);
    expect(DEMO_CATALOGS.bazaar.categories.length).toBeGreaterThanOrEqual(3);
  });
});
