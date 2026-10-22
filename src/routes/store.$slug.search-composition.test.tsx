/**
 * Task 9 — the storefront search route exposes the platform's search pieces
 * individually (Decision D6, State B; Decision D4 relaxed §7 for this file).
 *
 * The route (`store.$slug.search.tsx`) splits its one opaque listing block into
 * NAMED pieces and gives every piece exactly ONE owner:
 *
 *   · the query box, the category/kind chips, the search-status notice, the
 *     degraded notice and the results grid go to the THEME, as the
 *     `productSlot` (the "results block") — they are search execution and
 *     authorization, and the route's `fallback` is not rendered at all once a
 *     theme publishes a body;
 *   · the result count, the sort control, the active filter chips, the pager,
 *     the empty state and the page `<h1>` go to the platform's own per-widget
 *     context slots;
 *   · an unthemed store keeps the WHOLE listing in the `fallback`.
 *
 * The route module is NOT imported here: it pulls the whole server graph (the
 * server fn, the chrome loader, the router runtime). The assertions read the
 * route file as TEXT instead — the same pattern as
 * `src/components/store/chrome-localization.test.tsx` and
 * `src/routes/store.$slug.index.isolated-route.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(DIR, "store.$slug.search.tsx"), "utf8");

/** The balanced `{…}` block that starts at the first `{` after `marker`. */
function block(marker: string): string {
  const at = SRC.indexOf(marker);
  expect(at, `the route source must contain ${marker}`).toBeGreaterThanOrEqual(
    0,
  );
  const open = SRC.indexOf("{", at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    const ch = SRC[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return SRC.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced block after ${marker}`);
}

/** The text between two markers, in source order. */
function between(start: string, end: string): string {
  const a = SRC.indexOf(start);
  expect(a, `the route source must contain ${start}`).toBeGreaterThanOrEqual(0);
  const b = SRC.indexOf(end, a + start.length);
  expect(b, `the route source must contain ${end}`).toBeGreaterThanOrEqual(0);
  return SRC.slice(a, b);
}

describe("storefront search route — the theme composes the platform's pieces", () => {
  it("mounts a CollectionQueryProvider carrying the LIVE query, so the facet/sort/pager links are real", () => {
    expect(SRC).toContain("CollectionQueryProvider");
    const value = block("value={{");
    expect(value).toContain("params,");
    expect(value).toContain("total: result?.total ?? 0");
    expect(value).toContain("basePath: `/store/${slug}/search`");
    expect(value).toContain("navigate: (next) => apply(next)");
  });

  it("grants EXACTLY the six slots the storefront can feed — the facet sidebar included", () => {
    const slots = block("contextSlots={{");
    const granted = [...slots.matchAll(/([a-z_]+):\s*null/g)].map((m) => m[1]);
    expect(new Set(granted)).toEqual(
      new Set([
        "result_toolbar",
        "filter_chips",
        "pagination",
        "empty_state",
        "category_header",
        "facet_sidebar",
      ]),
    );
    // Decision Gate **G2 (a)**: the storefront GRANTS the facet sidebar —
    // its rows come from the widget-data pipeline, and the route now
    // resolves that batch on the server and mounts the
    // `WidgetDataProvider` that feeds it. The preview and the storefront
    // therefore show the SAME filters (the preview-parity contract asserts
    // the two grant sets are EQUAL).
    expect(SRC).toContain("WidgetDataProvider");
    expect(SRC).toContain("collectWidgetRequests");
    expect(SRC).toContain("resolveWidgetData");
    // The empty state is granted ONLY when the platform's own empty state
    // would have shown (the widget renders its panel unconditionally).
    expect(slots).toContain("result.items.length === 0");
    expect(slots).toContain("!query.isPending");
  });

  it("scopes the facet widget data to the shopper's query (S4)", () => {
    // S4 — the route passes the search backend's query-scoped facets and
    // total into the same resolver that feeds the sidebar; the facets loader
    // then answers from that scope instead of counting the whole catalogue.
    expect(SRC).toContain("facets: outcome.result.facets");
    expect(SRC).toContain("total: outcome.result.total");
    expect(SRC).toContain('outcome.status === "ok"');
  });

  it("hands the theme the RESULTS BLOCK, and that block still carries the query box and the filters", () => {
    // The identifier handed to `productSlot` is NOT the one handed to
    // `fallback`.
    expect(SRC).toContain("productSlot={resultsBlock}");
    expect(block("fallback={")).toContain("{listing}");

    const resultsBlock = between("const resultsBlock = (", "const heading = (");
    expect(resultsBlock).toContain("{queryBox}");
    expect(resultsBlock).toContain("{filtersPanel}");
    expect(resultsBlock).toContain("{searchNotice}");
    expect(resultsBlock).toContain("{degradedNotice}");
    expect(resultsBlock).toContain("{results}");
    // The count and the sort control are NOT in the block — the granted
    // `result_toolbar` widget owns them, so they must not render twice.
    expect(resultsBlock).not.toContain("{summaryAndSort}");

    // The query box is the search form; the filters panel is the category and
    // product-type chip panel.
    const queryBox = between("const queryBox = (", "const filtersPanel =");
    expect(queryBox).toContain("<form");
    expect(queryBox).toContain('type="search"');
    const filtersPanel = between("const filtersPanel =", "const resultCount =");
    expect(filtersPanel).toContain("<Chip");
    expect(filtersPanel).toContain("facets.categories.map");
    expect(filtersPanel).toContain("facets.kinds.map");
  });

  it("keeps the fallback as the WHOLE listing plus the route's own h1", () => {
    const fallback = block("fallback={");
    expect(fallback).toContain("{heading}");
    expect(fallback).toContain("{listing}");

    const listing = between("const listing = (", "const resultsBlock = (");
    for (const piece of [
      "{queryBox}",
      "{filtersPanel}",
      "{summaryAndSort}",
      "{degradedNotice}",
      "{emptyState}",
      "{results}",
      "{pager}",
    ]) {
      expect(listing).toContain(piece);
    }

    // The route still owns the page h1 for a store with no published search
    // template.
    expect(SRC).toContain(
      '<h1 className="font-bangla-display text-2xl font-bold sm:text-3xl">',
    );
  });

  it("still executes and authorizes the search — the platform owns the query", () => {
    expect(SRC).toContain("searchStorefrontFn");
    expect(SRC).toContain(
      'getStoreChrome({ data: { slug: params.slug, template: "search" } })',
    );
    expect(SRC).toContain(
      'queryKey: ["storefront-search", slug, toSearchQuery(params)]',
    );
  });

  it("leaves the canonical / robots discipline untouched", () => {
    expect(SRC).toContain("facetIndexPolicy");
    expect(SRC).toContain("listingPolicy");
    expect(SRC).toContain("buildSearchHead");
    expect(SRC).toContain("policy.canonicalPath");
    expect(SRC).toContain("listing.robots");
  });
});
