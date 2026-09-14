/**
 * Phase 2.4 — collection / search widgets.
 *
 * Facet sidebar, filter chips, result toolbar, pagination, category header and
 * empty state. Every one of them is URL-driven: state lives in the query
 * string (`storefront-search.ts` owns its shape, `facet-url.ts` computes the
 * next one), so a filtered view is shareable, cacheable and crawlable.
 *
 * No theme module is imported, and no widget owns filter state of its own.
 */
import { createContext, useContext, useMemo, useState } from "react";
import type { SectionType } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { formatDisplayNumber } from "@/lib/money-display";
import {
  SORTS,
  activeFilters,
  clearFacets,
  facetHref,
  pageCount,
  pageWindow,
  toggleFacet,
  withFacet,
  withPage,
  withSort,
  type FacetKey,
  type SearchParams,
} from "@/lib/facet-url";
import { normalizeSearchParams } from "@/lib/storefront-search";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { FacetGroup, type FacetOption } from "./primitives/FacetGroup";
import { OverlayHost } from "./primitives/OverlayHost";
import { ProductCard } from "./primitives/ProductCard";

/* ------------------------------------------------------------------ context */

export type CollectionQuery = {
  params: SearchParams;
  /** Total results the server reported, used by the toolbar and the pager. */
  total: number;
  /** Path the facet links point at, e.g. `/store/acme/search`. */
  basePath: string;
  /** Supplied by the route; absent in the studio, where links are inert. */
  navigate?: (next: SearchParams) => void;
};

const DEFAULT_QUERY: CollectionQuery = {
  params: normalizeSearchParams({}),
  total: 0,
  basePath: "",
};

const CollectionQueryContext = createContext<CollectionQuery>(DEFAULT_QUERY);

export const CollectionQueryProvider = CollectionQueryContext.Provider;

export function useCollectionQuery(): CollectionQuery {
  return useContext(CollectionQueryContext);
}

/* ------------------------------------------------------------------- shared */

const SORT_LABELS: Record<string, { en: string; bn: string }> = {
  relevance: { en: "Relevance", bn: "প্রাসঙ্গিকতা" },
  price_asc: { en: "Price: low to high", bn: "দাম: কম থেকে বেশি" },
  price_desc: { en: "Price: high to low", bn: "দাম: বেশি থেকে কম" },
  newest: { en: "Newest", bn: "নতুন" },
  title: { en: "Title A–Z", bn: "নাম অনুসারে" },
};

const FACET_CHIP_LABELS: Record<FacetKey, { en: string; bn: string }> = {
  category: { en: "Category", bn: "ক্যাটাগরি" },
  collection: { en: "Collection", bn: "কালেকশন" },
  kind: { en: "Type", bn: "ধরন" },
  min: { en: "Min", bn: "সর্বনিম্ন" },
  max: { en: "Max", bn: "সর্বোচ্চ" },
  stock: { en: "In stock", bn: "স্টকে আছে" },
};

function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-9 w-full animate-pulse rounded-fq-md bg-muted" />
      ))}
    </div>
  );
}

/** Rows the `facets` source returns, split by the group it tagged them with. */
export function groupFacetRows(rows: WidgetRow[] | undefined) {
  const out = { category: [] as WidgetRow[], kind: [] as WidgetRow[], stock: 0, total: 0 };
  for (const row of rows ?? []) {
    if (row.subtitle === "category") out.category.push(row);
    else if (row.subtitle === "kind") out.kind.push(row);
    else if (row.subtitle === "stock") out.stock = row.count ?? 0;
    else if (row.subtitle === "total") out.total = row.count ?? 0;
  }
  return out;
}

function useFacetLinks() {
  const query = useCollectionQuery();
  return useMemo(
    () => ({
      query,
      href: (next: SearchParams) => facetHref(query.basePath, next),
      go: (next: SearchParams) => query.navigate?.(next),
    }),
    [query],
  );
}

/* ------------------------------------------------------------------ widgets */

function facetOptions(
  rows: WidgetRow[],
  key: FacetKey,
  limit: number,
  query: CollectionQuery,
  href: (next: SearchParams) => string,
): FacetOption[] {
  return rows.slice(0, limit).map((row) => {
    const value = row.href ?? row.id;
    const next = toggleFacet(query.params, key, value);
    return {
      value,
      label: row.title,
      ...(typeof row.count === "number" ? { count: row.count } : {}),
      href: href(next),
      active: (key === "category" ? query.params.category : query.params.kind) === value,
    } satisfies FacetOption;
  });
}

function FacetPanel({ ctx }: { ctx: WidgetCtx }) {
  const { str, bool, int, locale, data } = ctx;
  const { query, href, go } = useFacetLinks();
  const groups = groupFacetRows(data?.rows);
  const limit = int("limit", 24, 1, 48);
  const collapsed = bool("collapsed");

  if (data?.pending) return <Skeleton lines={5} />;

  return (
    <div className="space-y-3">
      {bool("showCategories") && (
        <FacetGroup
          title={str("categoryLabel") || (locale === "bn" ? "ক্যাটাগরি" : "Category")}
          defaultOpen={!collapsed}
          options={facetOptions(groups.category, "category", limit, query, href)}
          onSelect={
            query.navigate
              ? (value) => go(toggleFacet(query.params, "category", value))
              : undefined
          }
        />
      )}
      {bool("showKinds") && (
        <FacetGroup
          title={str("kindLabel") || (locale === "bn" ? "ধরন" : "Type")}
          defaultOpen={!collapsed}
          options={facetOptions(groups.kind, "kind", limit, query, href)}
          onSelect={query.navigate ? (value) => go(toggleFacet(query.params, "kind", value)) : undefined}
        />
      )}
      {bool("showStock") && (
        <FacetGroup
          title={str("stockLabel") || (locale === "bn" ? "স্টক" : "Availability")}
          defaultOpen={!collapsed}
          options={[
            {
              value: "1",
              label: str("inStockLabel") || (locale === "bn" ? "শুধু স্টকে আছে" : "In stock only"),
              count: groups.stock,
              href: href(withFacet(query.params, "stock", query.params.inStock ? null : "1")),
              active: query.params.inStock,
            },
          ]}
          onSelect={
            query.navigate
              ? () => go(withFacet(query.params, "stock", query.params.inStock ? null : "1"))
              : undefined
          }
        />
      )}
      {bool("showPrice") && <PriceFacet ctx={ctx} />}
      <a
        href={href(clearFacets(query.params))}
        onClick={query.navigate ? (e) => { e.preventDefault(); go(clearFacets(query.params)); } : undefined}
        className="inline-flex min-h-11 items-center px-2 text-sm underline"
      >
        {str("clearLabel") || (locale === "bn" ? "সব মুছুন" : "Clear all")}
      </a>
    </div>
  );
}

/**
 * Price bounds stay integer minor units end to end: the input collects whole
 * currency units and multiplies by 100 once, on the way into the URL. No
 * widget ever does money arithmetic on a value it will display.
 */
function PriceFacet({ ctx }: { ctx: WidgetCtx }) {
  const { str, locale, money } = ctx;
  const { query, href, go } = useFacetLinks();
  const [min, setMin] = useState(query.params.minMinor === null ? "" : String(query.params.minMinor / 100));
  const [max, setMax] = useState(query.params.maxMinor === null ? "" : String(query.params.maxMinor / 100));
  const toMinor = (value: string) => {
    const n = Number(value);
    return value === "" || !Number.isFinite(n) || n < 0 ? null : String(Math.round(n) * 100);
  };
  const next = withFacet(withFacet(query.params, "min", toMinor(min)), "max", toMinor(max));
  return (
    <div className="rounded-fq-md border border-border bg-card p-3">
      <p className="mb-2 text-sm font-medium">
        {str("priceLabel") || (locale === "bn" ? "দাম" : "Price")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="fq-facet-min">
          {locale === "bn" ? "সর্বনিম্ন দাম" : "Minimum price"}
        </label>
        <input
          id="fq-facet-min"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-11 min-w-0 flex-1 rounded-fq-md border border-border bg-background px-2 text-sm tabular-nums"
          placeholder={money(0)}
        />
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        <label className="sr-only" htmlFor="fq-facet-max">
          {locale === "bn" ? "সর্বোচ্চ দাম" : "Maximum price"}
        </label>
        <input
          id="fq-facet-max"
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-11 min-w-0 flex-1 rounded-fq-md border border-border bg-background px-2 text-sm tabular-nums"
          placeholder={money(0)}
        />
        <a
          href={href(next)}
          onClick={query.navigate ? (e) => { e.preventDefault(); go(next); } : undefined}
          className="inline-flex h-11 shrink-0 items-center rounded-fq-md border border-border px-3 text-sm"
        >
          {locale === "bn" ? "প্রয়োগ" : "Apply"}
        </a>
      </div>
    </div>
  );
}

const FacetSidebar: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const [open, setOpen] = useState(false);
  const heading = str("heading") || (locale === "bn" ? "ফিল্টার" : "Filters");
  return (
    <>
      {/* Mobile: the shared overlay host owns focus trap, scroll lock and Escape. */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center rounded-fq-md border border-border px-4 text-sm font-medium"
        >
          {str("drawerLabel") || heading}
        </button>
        <OverlayHost open={open} onClose={() => setOpen(false)} title={heading} side="bottom">
          <FacetPanel ctx={ctx} />
        </OverlayHost>
      </div>
      <aside aria-label={heading} className="hidden md:block">
        <h2 className="mb-3 text-base font-semibold">{heading}</h2>
        <FacetPanel ctx={ctx} />
      </aside>
    </>
  );
};

const FilterChips: WidgetComponent = (ctx) => {
  const { str, bool, locale } = ctx;
  const { query, href, go } = useFacetLinks();
  const chips = activeFilters(query.params);
  if (chips.length === 0) {
    if (!bool("showWhenEmpty")) return null;
    const empty = str("emptyText");
    return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  }
  return (
    <ul aria-label={locale === "bn" ? "সক্রিয় ফিল্টার" : "Active filters"} className="m-0 flex flex-wrap gap-2 p-0">
      {chips.map((chip) => {
        const next = withFacet(query.params, chip.key, null);
        const label = FACET_CHIP_LABELS[chip.key][locale === "bn" ? "bn" : "en"];
        return (
          <li key={`${chip.key}:${chip.value}`}>
            <a
              href={href(next)}
              onClick={query.navigate ? (e) => { e.preventDefault(); go(next); } : undefined}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm"
            >
              <span className="min-w-0 break-words">
                {label}
                {chip.key === "stock" ? "" : `: ${chip.label}`}
              </span>
              <span aria-hidden="true">×</span>
              <span className="sr-only">{locale === "bn" ? "ফিল্টার সরান" : "Remove filter"}</span>
            </a>
          </li>
        );
      })}
      <li>
        <a
          href={href(clearFacets(query.params))}
          onClick={query.navigate ? (e) => { e.preventDefault(); go(clearFacets(query.params)); } : undefined}
          className="inline-flex min-h-11 items-center px-2 text-sm underline"
        >
          {str("clearLabel") || (locale === "bn" ? "সব মুছুন" : "Clear all")}
        </a>
      </li>
    </ul>
  );
};

const ResultToolbar: WidgetComponent = (ctx) => {
  const { str, bool, locale, data } = ctx;
  const { query, href, go } = useFacetLinks();
  const groups = groupFacetRows(data?.rows);
  const total = query.total || groups.total;
  const noun = str("countLabel") || (locale === "bn" ? "পণ্য" : "products");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {data?.pending ? (
          <span className="inline-block h-4 w-24 animate-pulse rounded-fq-sm bg-muted" aria-hidden="true" />
        ) : (
          <>
            <span className="tabular-nums">{formatDisplayNumber(total, { locale })}</span> {noun}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {bool("showSort") && (
          <>
            <label htmlFor="fq-sort" className="text-sm text-muted-foreground">
              {str("sortLabel") || (locale === "bn" ? "সাজান" : "Sort")}
            </label>
            <select
              id="fq-sort"
              value={query.params.sort}
              onChange={(event) => go(withSort(query.params, event.target.value))}
              className="h-11 rounded-fq-md border border-border bg-background px-2 text-sm"
            >
              {SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]![locale === "bn" ? "bn" : "en"]}
                </option>
              ))}
            </select>
            {/* Crawlable equivalents of the select, for clients without JS. */}
            <noscript>
              {SORTS.map((sort) => (
                <a key={sort} href={href(withSort(query.params, sort))} className="px-1 text-sm underline">
                  {SORT_LABELS[sort]!.en}
                </a>
              ))}
            </noscript>
          </>
        )}
      </div>
    </div>
  );
};

const Pagination: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const { query, href, go } = useFacetLinks();
  const last = pageCount(query.total);
  if (last <= 1) return null;
  const current = Math.min(query.params.page, last);
  const prev = withPage(query.params, current - 1, query.total);
  const next = withPage(query.params, current + 1, query.total);
  const mode = str("mode") || "numbered";

  const link = (page: number, label: string, disabled = false, current2 = false) => (
    <a
      key={`${label}-${page}`}
      href={href(withPage(query.params, page, query.total))}
      aria-current={current2 ? "page" : undefined}
      aria-disabled={disabled ? "true" : undefined}
      onClick={
        query.navigate
          ? (e) => {
              e.preventDefault();
              if (!disabled) go(withPage(query.params, page, query.total));
            }
          : undefined
      }
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-fq-md border border-border px-3 text-sm tabular-nums ${
        current2 ? "bg-secondary font-medium text-secondary-foreground" : ""
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      {label}
    </a>
  );

  if (mode === "more") {
    return (
      <nav aria-label={locale === "bn" ? "পেজিনেশন" : "Pagination"} className="flex justify-center py-4">
        {current < last
          ? link(current + 1, str("moreLabel") || (locale === "bn" ? "আরও দেখুন" : "Load more"))
          : null}
        {/* Real prev/next links stay in the markup so crawlers can walk the set. */}
        <span className="sr-only">
          <a href={href(prev)}>{str("prevLabel") || "Previous"}</a>
          <a href={href(next)}>{str("nextLabel") || "Next"}</a>
        </span>
      </nav>
    );
  }

  return (
    <nav aria-label={locale === "bn" ? "পেজিনেশন" : "Pagination"} className="flex flex-wrap items-center justify-center gap-2 py-4">
      {link(current - 1, str("prevLabel") || (locale === "bn" ? "আগের" : "Previous"), current === 1)}
      {pageWindow(current, last).map((page, index) =>
        page === -1 ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          link(page, formatDisplayNumber(page, { locale }), false, page === current)
        ),
      )}
      {link(current + 1, str("nextLabel") || (locale === "bn" ? "পরের" : "Next"), current === last)}
    </nav>
  );
};

const CategoryHeader: WidgetComponent = (ctx) => {
  const { str, bool, locale, Heading } = ctx;
  const { query, href } = useFacetLinks();
  const image = str("imageUrl");
  const body = str("body");
  const title = str("heading") || (locale === "bn" ? "সব পণ্য" : "All products");
  return (
    <header className="mb-4">
      {bool("showBreadcrumb") && (
        <nav aria-label={locale === "bn" ? "ব্রেডক্রাম্ব" : "Breadcrumb"} className="mb-2 text-sm text-muted-foreground">
          <a href={href({ ...query.params, category: null, kind: null, page: 1 })} className="underline">
            {str("homeLabel") || (locale === "bn" ? "হোম" : "Home")}
          </a>
          <span aria-hidden="true"> / </span>
          <span>{title}</span>
        </nav>
      )}
      {image ? (
        <div className="relative overflow-hidden rounded-fq-lg">
          <img
            src={image}
            alt=""
            width={1600}
            height={480}
            fetchPriority="high"
            className="h-auto w-full object-cover"
          />
          {bool("scrim") && <div aria-hidden="true" className="absolute inset-0 bg-foreground/40" />}
          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <Heading className="text-2xl font-semibold text-background">{title}</Heading>
            {body && <p className="mt-1 max-w-prose text-sm text-background/90">{body}</p>}
          </div>
        </div>
      ) : (
        <>
          <Heading className="text-2xl font-semibold">{title}</Heading>
          {body && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{body}</p>}
        </>
      )}
      {bool("showCount") && query.total > 0 && (
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {formatDisplayNumber(query.total, { locale })}
        </p>
      )}
    </header>
  );
};

const EmptyState: WidgetComponent = (ctx) => {
  const { str, bool, int, locale, data } = ctx;
  const { query, href, go } = useFacetLinks();
  const rows = (data?.rows ?? []).slice(0, int("limit", 4, 1, 12));
  return (
    <section
      aria-label={locale === "bn" ? "কোনো ফল নেই" : "No results"}
      className="rounded-fq-lg border border-border bg-card p-6 text-center"
    >
      <p className="text-base font-semibold">
        {str("heading") || (locale === "bn" ? "কোনো ফল পাওয়া যায়নি" : "Nothing matches those filters")}
      </p>
      {str("body") && <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{str("body")}</p>}
      <a
        href={href(clearFacets(query.params))}
        onClick={query.navigate ? (e) => { e.preventDefault(); go(clearFacets(query.params)); } : undefined}
        className="mt-4 inline-flex min-h-11 items-center rounded-fq-md border border-border px-4 text-sm font-medium"
      >
        {str("clearLabel") || (locale === "bn" ? "সব ফিল্টার মুছুন" : "Clear all filters")}
      </a>
      {bool("showSuggestions") && rows.length > 0 && (
        <ul className="mt-6 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
          {rows.map((row) => (
            <li key={row.id}>
              <ProductCard row={row} locale={locale} variant="compact" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const COLLECTION_WIDGETS: Record<
  Extract<
    SectionType,
    "facet_sidebar" | "filter_chips" | "result_toolbar" | "pagination" | "category_header" | "empty_state"
  >,
  WidgetComponent
> = {
  facet_sidebar: FacetSidebar,
  filter_chips: FilterChips,
  result_toolbar: ResultToolbar,
  pagination: Pagination,
  category_header: CategoryHeader,
  empty_state: EmptyState,
};
