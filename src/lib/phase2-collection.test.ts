/**
 * Phase 2.4 — collection / search widget tests.
 *
 * Covers the URL algebra (facet toggles reset pagination, chips round-trip,
 * indexability rules) and the catalogue/registry wiring for the six widgets.
 */
import { describe, expect, it } from "vitest";
import { normalizeSearchParams } from "./storefront-search";
import {
  activeFilters,
  clearFacets,
  facetHref,
  isIndexableFacetState,
  pageWindow,
  toggleFacet,
  withFacet,
  withPage,
  withSort,
} from "./facet-url";
import { SECTION_CATALOG, type SectionType } from "./builder-ast";
import { widgetMeta } from "./widget-registry";
import { groupFacetRows } from "@/components/builder/collection";

const TYPES: SectionType[] = [
  "facet_sidebar",
  "filter_chips",
  "result_toolbar",
  "pagination",
  "category_header",
  "empty_state",
];

const base = () => normalizeSearchParams({ page: "3", category: "shoes" });

describe("facet URL algebra", () => {
  it("resets pagination whenever the result set changes", () => {
    expect(withFacet(base(), "kind", "simple").page).toBe(1);
    expect(withSort(base(), "price_asc").page).toBe(1);
  });

  it("toggles a facet off when the same value is clicked twice", () => {
    const once = toggleFacet(base(), "category", "shoes");
    expect(once.category).toBeNull();
    expect(toggleFacet(once, "category", "shoes").category).toBe("shoes");
  });

  it("clears every facet but keeps the search term and sort", () => {
    const params = normalizeSearchParams({ q: "boot", sort: "newest", category: "shoes", stock: "1" });
    const cleared = clearFacets(params);
    expect(cleared.q).toBe("boot");
    expect(cleared.sort).toBe("newest");
    expect(cleared.category).toBeNull();
    expect(cleared.inStock).toBe(false);
  });

  it("lists active filters as removable chips", () => {
    const params = normalizeSearchParams({ category: "shoes", stock: "1" });
    expect(activeFilters(params).map((c) => c.key).sort()).toEqual(["category", "stock"]);
    for (const chip of activeFilters(params)) {
      expect(activeFilters(withFacet(params, chip.key, null))).not.toContainEqual(chip);
    }
  });

  it("only marks allowlisted single-facet page-1 URLs indexable", () => {
    expect(isIndexableFacetState(normalizeSearchParams({}))).toBe(true);
    expect(isIndexableFacetState(normalizeSearchParams({ category: "shoes" }))).toBe(true);
    expect(isIndexableFacetState(normalizeSearchParams({ category: "shoes", page: "2" }))).toBe(false);
    expect(isIndexableFacetState(normalizeSearchParams({ category: "shoes", stock: "1" }))).toBe(false);
  });

  it("builds crawlable hrefs on the given base path", () => {
    const href = facetHref("/store/acme/search", normalizeSearchParams({ category: "shoes" }));
    expect(href.startsWith("/store/acme/search?")).toBe(true);
    expect(href).toContain("category=shoes");
  });

  it("clamps page links to the real page count", () => {
    expect(withPage(base(), 0, 100).page).toBe(1);
    expect(withPage(base(), 999, 10).page).toBe(1);
  });

  it("windows page numbers with gap markers and no duplicates", () => {
    const window = pageWindow(10, 30);
    expect(window[0]).toBe(1);
    expect(window.at(-1)).toBe(30);
    expect(window).toContain(10);
    expect(new Set(window.filter((p) => p !== -1)).size).toBe(window.filter((p) => p !== -1).length);
  });
});

describe("facet rows", () => {
  it("splits the batched facets payload by group", () => {
    const groups = groupFacetRows([
      { id: "shoes", title: "Shoes", count: 4, subtitle: "category" },
      { id: "simple", title: "Simple", count: 9, subtitle: "kind" },
      { id: "stock", title: "In stock", count: 7, subtitle: "stock" },
      { id: "total", title: "Total", count: 12, subtitle: "total" },
    ]);
    expect(groups.category).toHaveLength(1);
    expect(groups.kind).toHaveLength(1);
    expect(groups.stock).toBe(7);
    expect(groups.total).toBe(12);
  });
});

describe("collection widgets are registered", () => {
  it("has a catalogue entry and registry meta for each", () => {
    for (const type of TYPES) {
      expect(SECTION_CATALOG.some((e) => e.type === type), type).toBe(true);
      expect(widgetMeta(type), type).toBeTruthy();
    }
  });

  it("gives every data-bound collection widget a skeleton", () => {
    for (const type of TYPES) {
      const meta = widgetMeta(type)!;
      if (meta.data) expect(meta.skeleton, type).toBe(true);
    }
  });
});
