/**
 * Phase 2.4 — pure facet/URL helpers for the collection and search widgets.
 *
 * The storefront search contract (`storefront-search.ts`) already owns what a
 * query may say. This module only computes the *next* query for a facet
 * click, a chip removal, a sort change or a page link, and turns it into a
 * crawlable href. No React, no network, no theme: the widgets stay dumb and
 * the URL stays the single source of truth.
 */
import {
  MAX_OFFSET,
  PAGE_SIZE,
  PRODUCT_KINDS_FILTER,
  SORTS,
  activeFilterCount,
  normalizeSearchParams,
  pageCount,
  toSearchQuery,
  type SearchParams,
  type SortKey,
} from "./storefront-search";

export type FacetKey = "category" | "collection" | "kind" | "min" | "max" | "stock";

export const FACET_KEYS: FacetKey[] = ["category", "collection", "kind", "min", "max", "stock"];

/**
 * Facets that may be indexed on their own URL. Everything else must be
 * `noindex,follow` with a canonical back to the clean collection, which is
 * what keeps a faceted catalogue from shredding its crawl budget.
 */
export const INDEXABLE_FACETS: FacetKey[] = ["category"];

/** True when this URL may be indexed: at most one facet, from the allowlist, page 1. */
export function isIndexableFacetState(params: SearchParams): boolean {
  const active = FACET_KEYS.filter((key) => hasFacet(params, key));
  if (params.page > 1) return false;
  if (active.length === 0) return true;
  return active.length === 1 && INDEXABLE_FACETS.includes(active[0]!);
}

export function hasFacet(params: SearchParams, key: FacetKey): boolean {
  switch (key) {
    case "category":
      return !!params.category;
    case "collection":
      return !!params.collection;
    case "kind":
      return !!params.kind;
    case "min":
      return params.minMinor !== null;
    case "max":
      return params.maxMinor !== null;
    case "stock":
      return params.inStock;
  }
}

/** Current value of a facet as a display string, or `null` when unset. */
export function facetValue(params: SearchParams, key: FacetKey): string | null {
  switch (key) {
    case "category":
      return params.category;
    case "collection":
      return params.collection;
    case "kind":
      return params.kind;
    case "min":
      return params.minMinor === null ? null : String(params.minMinor);
    case "max":
      return params.maxMinor === null ? null : String(params.maxMinor);
    case "stock":
      return params.inStock ? "1" : null;
  }
}

/**
 * Applies one facet change. A `null` value clears the facet. Any change that
 * narrows or widens the result set resets pagination — page 3 of the old
 * result set is meaningless for the new one.
 */
export function withFacet(params: SearchParams, key: FacetKey, value: string | null): SearchParams {
  const query = { ...toSearchQuery(params) };
  const target = key === "stock" ? "stock" : key;
  if (value === null || value === "") delete query[target];
  else query[target] = value;
  delete query["page"];
  return normalizeSearchParams(query);
}

/** Toggles a value: clicking the active option clears it, like every facet UI. */
export function toggleFacet(params: SearchParams, key: FacetKey, value: string): SearchParams {
  return withFacet(params, key, facetValue(params, key) === value ? null : value);
}

/** Clears every facet but keeps the search term and the sort. */
export function clearFacets(params: SearchParams): SearchParams {
  const query = toSearchQuery(params);
  for (const key of FACET_KEYS) delete query[key === "stock" ? "stock" : key];
  delete query["page"];
  return normalizeSearchParams(query);
}

export function withSort(params: SearchParams, sort: string): SearchParams {
  const next = (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : params.sort;
  return normalizeSearchParams({ ...toSearchQuery(params), sort: next, page: 1 });
}

/** Clamps to the real page range so a hand-typed `?page=9999` cannot deep-scan. */
export function withPage(params: SearchParams, page: number, total: number): SearchParams {
  const last = Math.min(pageCount(total), Math.floor(MAX_OFFSET / PAGE_SIZE) + 1);
  const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), last);
  return normalizeSearchParams({ ...toSearchQuery(params), page: clamped });
}

/** A real, crawlable href — facets and pagination are links, never buttons. */
export function facetHref(base: string, params: SearchParams): string {
  const query = new URLSearchParams(toSearchQuery(params)).toString();
  return query ? `${base}?${query}` : base;
}

export type ActiveFilter = { key: FacetKey; value: string; label: string };

/**
 * Active filters as removable chips. Labels are resolved by the caller when a
 * human-readable name is known (a category slug → its title), otherwise the
 * raw value is shown rather than an empty chip.
 */
export function activeFilters(
  params: SearchParams,
  labels: Partial<Record<string, string>> = {},
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const key of FACET_KEYS) {
    const value = facetValue(params, key);
    if (value === null) continue;
    out.push({ key, value, label: labels[`${key}:${value}`] ?? labels[value] ?? value });
  }
  return out;
}

/** Page numbers with ellipsis gaps (`-1`), the classic windowed pager. */
export function pageWindow(current: number, last: number, span = 2): number[] {
  if (last <= 1) return [1];
  const pages = new Set<number>([1, last]);
  for (let p = current - span; p <= current + span; p += 1) if (p > 1 && p < last) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: number[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push(-1);
    out.push(page);
    previous = page;
  }
  return out;
}

export { activeFilterCount, pageCount, PAGE_SIZE, PRODUCT_KINDS_FILTER, SORTS };
export type { SearchParams, SortKey };
