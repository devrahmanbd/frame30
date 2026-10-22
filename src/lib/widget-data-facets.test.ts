/**
 * S4 — the search sidebar counts the shopper's QUERY, not the catalogue.
 *
 * The storefront search route passes the search backend's scoped facets and
 * total into `resolveWidgetData`; the facets loader must then answer from
 * that scope and never run its catalogue-wide products query. These tests
 * pin both halves: the resolver forwards the scope, and the real loader's
 * output changes with it.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADERS,
  facetRowsFromSearch,
  resolveWidgetData,
  type SourceLoaders,
} from "./widget-data.server";
import type { WidgetDataRequest } from "./widget-data";
import type { SearchFacets } from "./storefront-search";

const FACETS: SearchFacets = {
  categories: [
    { slug: "sarees", name: "Sarees", count: 4 },
    { slug: "jamdani", name: "Jamdani", count: 9 },
  ],
  kinds: [
    { kind: "physical", count: 11 },
    { kind: "digital", count: 2 },
  ],
  in_stock: 6,
  price_min_minor: 1000,
  price_max_minor: 9000,
};

const REQUEST: WidgetDataRequest = {
  key: "facets:test",
  source: "facets",
  params: { limit: 12 },
};

describe("S4 — query-scoped facet counts", () => {
  it("builds rows from the scoped facets, total first", () => {
    const rows = facetRowsFromSearch(FACETS, 13, "/store/demo");
    expect(rows.map((row) => [row.subtitle, row.title, row.count])).toEqual([
      ["category", "Jamdani", 9],
      ["category", "Sarees", 4],
      ["kind", "physical", 11],
      ["kind", "digital", 2],
      ["stock", "in_stock", 6],
      ["total", "total", 13],
    ]);
    expect(rows[0]?.href).toBe("/store/demo/search?category=jamdani");
    expect(rows[2]?.href).toBe("/store/demo/search?q=physical");
  });

  it("the real facets loader answers from the scope without the database", async () => {
    const loader = DEFAULT_LOADERS.facets;
    expect(loader).toBeTruthy();
    const out = await loader!("merchant", [REQUEST], {
      base: "/store/demo",
      facets: FACETS,
      total: 13,
    });
    expect(out[REQUEST.key]).toEqual(
      facetRowsFromSearch(FACETS, 13, "/store/demo"),
    );
  });

  it("honours the per-request group limit inside the scope", async () => {
    const loader = DEFAULT_LOADERS.facets!;
    const limited = { ...REQUEST, key: "facets:limited", params: { limit: 1 } };
    const out = await loader("merchant", [limited], {
      base: "/store/demo",
      facets: FACETS,
      total: 13,
    });
    expect(out[limited.key]).toEqual([
      expect.objectContaining({ title: "Jamdani", subtitle: "category" }),
      expect.objectContaining({ title: "physical", subtitle: "kind" }),
      expect.objectContaining({ title: "in_stock", count: 6 }),
      expect.objectContaining({ title: "total", count: 13 }),
    ]);
  });

  it("forwards the scope to whichever loader owns the facets source", async () => {
    const seen: Array<{ facets?: SearchFacets; total?: number }> = [];
    const loaders: SourceLoaders = {
      facets: async (_merchantId, requests, ctx) => {
        seen.push({ facets: ctx?.facets, total: ctx?.total });
        return Object.fromEntries(requests.map((r) => [r.key, []]));
      },
    };
    await resolveWidgetData(
      "merchant",
      { requests: [REQUEST], byNode: {} },
      loaders,
      { base: "/store/demo", facets: FACETS, total: 13 },
    );
    expect(seen).toEqual([{ facets: FACETS, total: 13 }]);
  });

  it("keeps the old loader context when no scope is supplied", async () => {
    const seen: unknown[] = [];
    const loaders: SourceLoaders = {
      facets: async (_merchantId, requests, ctx) => {
        seen.push(ctx);
        return Object.fromEntries(requests.map((r) => [r.key, []]));
      },
    };
    await resolveWidgetData(
      "merchant",
      { requests: [REQUEST], byNode: {} },
      loaders,
      { base: "/store/demo" },
    );
    expect(seen).toEqual([{ base: "/store/demo" }]);
  });
});
