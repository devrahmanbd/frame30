/**
 * Somvabona own catalog (theme-remediation Task 1, TDD): the `somvabona`
 * key is a dedicated everyday-cotton catalog — not an alias of the
 * songoskriti heritage-silk catalog. Preview rows for somvabona read as
 * cotton panjabi/kurta/saree/kids lines; the women category and the
 * festive/wedding collections resolve through the preview focus path.
 */
import { describe, expect, it } from "vitest";
import { DEMO_CATALOGS, demoCatalogFor } from "./demo-catalog";
import { resolveDemoFocus } from "./theme-preview-nav";

/** Heritage-silk markers that must never appear in somvabona titles. */
const HERITAGE_SILK_RE = /silk|jamdani|katan|tussar|kantha|zari|benarasi/i;

describe("somvabona own catalog", () => {
  it("is its own object, not the songoskriti alias", () => {
    expect(DEMO_CATALOGS.somvabona).not.toBe(DEMO_CATALOGS.songoskriti);
    expect(demoCatalogFor("somvabona")).toBe(DEMO_CATALOGS.somvabona);
  });

  it("ships everyday-cotton positioning across women/men/kids/living", () => {
    const catalog = DEMO_CATALOGS.somvabona;
    const categories = catalog.categories.map((c) => c.slug);
    for (const slug of ["women", "men", "kids", "living"])
      expect(categories).toContain(slug);
    const collections = catalog.collections.map((c) => c.slug);
    for (const slug of ["new-in", "festive", "wedding", "gifting"])
      expect(collections).toContain(slug);
    expect(catalog.products.length).toBeGreaterThanOrEqual(8);
    const usedCategories = new Set(catalog.products.map((p) => p.category));
    for (const slug of ["women", "men", "kids", "living"])
      expect(usedCategories.has(slug)).toBe(true);
    const copy = catalog.products
      .map((p) => `${p.title} ${p.description}`)
      .join(" ");
    expect(copy).toMatch(/cotton|panjabi|kurta|saree/i);
  });

  it("carries no heritage-silk titles and uses own art paths", () => {
    const catalog = DEMO_CATALOGS.somvabona;
    for (const product of catalog.products) {
      expect(product.title).not.toMatch(HERITAGE_SILK_RE);
      expect(product.image_url?.startsWith("/ph/somvabona/")).toBe(true);
      for (const v of product.variants) {
        expect(Number.isInteger(v.price)).toBe(true);
        expect(v.price).toBeGreaterThan(0);
      }
    }
    const songoskritiTitles = new Set(
      DEMO_CATALOGS.songoskriti.products.map((p) => p.title),
    );
    for (const product of catalog.products)
      expect(songoskritiTitles.has(product.title)).toBe(false);
  });

  it("resolves the women category and festive/wedding collections", () => {
    const women = resolveDemoFocus("somvabona", "collection", "women");
    expect(women).not.toBeNull();
    expect(women!.collection).toBe("women");
    for (const slug of ["festive", "wedding"]) {
      const focus = resolveDemoFocus("somvabona", "collection", slug);
      expect(focus).not.toBeNull();
      expect(focus!.collection).toBe(slug);
    }
  });
});
