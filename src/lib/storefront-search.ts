/**
 * Pure storefront search contract shared by the route, the URL and the server.
 *
 * Nothing here reads the network. The database owns the result set; this module
 * only normalises what may be asked for, so a hand-edited query string can
 * never widen the search beyond the whitelisted sorts, bounds and page size.
 */

import type { ResponsiveImage } from "./image-transform";
import { renderMarkdownBlocks } from "./editor/page-markdown";

export const SORTS = ["relevance", "price_asc", "price_desc", "newest", "title"] as const;
export type SortKey = (typeof SORTS)[number];

export const PRODUCT_KINDS_FILTER = ["physical", "digital", "service", "subscription"] as const;
export type KindFilter = (typeof PRODUCT_KINDS_FILTER)[number];

export const PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export const MAX_OFFSET = 480;
export const MAX_TERM_LENGTH = 80;

export type SearchParams = {
  q: string;
  category: string | null;
  collection: string | null;
  kind: KindFilter | null;
  minMinor: number | null;
  maxMinor: number | null;
  inStock: boolean;
  sort: SortKey;
  page: number;
};

export type SearchEngineLabel = "postgres" | "meilisearch" | "typesense";

export type FacetCategory = { slug: string; name: string; count: number };
export type FacetKind = { kind: string; count: number };

export type SearchFacets = {
  categories: FacetCategory[];
  kinds: FacetKind[];
  in_stock: number;
  price_min_minor: number | null;
  price_max_minor: number | null;
};

export type SearchHit = {
  id: string;
  title: string;
  slug: string;
  description: string;
  image_url: string | null;
  kind: string;
  price_minor: number;
  compare_at_minor: number | null;
  stock: number;
  category: string | null;
  /** Signed responsive variants, attached server-side when transforms are on. */
  image?: ResponsiveImage | null;
};

export type SearchResult = {
  found: boolean;
  /** Which engine actually answered, and whether it was a fallback. */
  engine?: SearchEngineLabel;
  degraded?: boolean;
  currency_code?: string;
  total: number;
  limit: number;
  offset: number;
  sort: SortKey;
  items: SearchHit[];
  facets: SearchFacets;
};

export const EMPTY_FACETS: SearchFacets = {
  categories: [],
  kinds: [],
  in_stock: 0,
  price_min_minor: null,
  price_max_minor: null,
};

export const EMPTY_RESULT: SearchResult = {
  found: true,
  total: 0,
  limit: PAGE_SIZE,
  offset: 0,
  sort: "relevance",
  items: [],
  facets: EMPTY_FACETS,
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function slugOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s && SLUG_RE.test(s) ? s : null;
}

/** Integer minor units only — a decimal or negative bound is dropped, never coerced. */
function minorOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

export function normalizeSearchParams(raw: Record<string, unknown>): SearchParams {
  const sortRaw = typeof raw["sort"] === "string" ? raw["sort"] : "";
  const kindRaw = typeof raw["kind"] === "string" ? raw["kind"] : "";
  const pageRaw = Number(raw["page"] ?? 1);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, MAX_OFFSET / PAGE_SIZE + 1) : 1;

  let minMinor = minorOrNull(raw["min"]);
  let maxMinor = minorOrNull(raw["max"]);
  if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
    [minMinor, maxMinor] = [maxMinor, minMinor];
  }

  return {
    q: String(raw["q"] ?? "").trim().slice(0, MAX_TERM_LENGTH),
    category: slugOrNull(raw["category"]),
    collection: slugOrNull(raw["collection"]),
    kind: (PRODUCT_KINDS_FILTER as readonly string[]).includes(kindRaw) ? (kindRaw as KindFilter) : null,
    minMinor,
    maxMinor,
    inStock: raw["stock"] === true || raw["stock"] === "1" || raw["stock"] === "true",
    sort: (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as SortKey) : "relevance",
    page,
  };
}

/** Search state that belongs in the URL, so a filtered view is shareable and cacheable. */
export function toSearchQuery(p: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.q) out["q"] = p.q;
  if (p.category) out["category"] = p.category;
  if (p.collection) out["collection"] = p.collection;
  if (p.kind) out["kind"] = p.kind;
  if (p.minMinor !== null) out["min"] = String(p.minMinor);
  if (p.maxMinor !== null) out["max"] = String(p.maxMinor);
  if (p.inStock) out["stock"] = "1";
  if (p.sort !== "relevance") out["sort"] = p.sort;
  if (p.page > 1) out["page"] = String(p.page);
  return out;
}

export function offsetOf(p: SearchParams) {
  return Math.min((p.page - 1) * PAGE_SIZE, MAX_OFFSET);
}

export function pageCount(total: number, limit = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / Math.max(limit, 1)));
}

export function activeFilterCount(p: SearchParams) {
  return (
    (p.category ? 1 : 0) +
    (p.collection ? 1 : 0) +
    (p.kind ? 1 : 0) +
    (p.minMinor !== null ? 1 : 0) +
    (p.maxMinor !== null ? 1 : 0) +
    (p.inStock ? 1 : 0)
  );
}

/** Cache key for a search: tenant-scoped by construction so a hit cannot cross stores. */
export function searchCacheKey(slug: string, p: SearchParams) {
  return [
    "sf-search",
    slug,
    p.q.toLowerCase(),
    p.category ?? "-",
    p.collection ?? "-",
    p.kind ?? "-",
    p.minMinor ?? "-",
    p.maxMinor ?? "-",
    p.inStock ? "1" : "0",
    p.sort,
    p.page,
  ].join("|");
}

/**
 * Allow-list markdown for tenant pages. Since Phase 12 this is the shared
 * markdown ⇄ block bridge the Classic editor writes, so what merchants see in
 * the editor is byte-for-byte what shoppers receive. Every inline run is
 * sanitised by `parseInline`; raw markup in a page body is escaped as text.
 */
export function renderPageMarkdown(md: string): string {
  return renderMarkdownBlocks(md);
}
