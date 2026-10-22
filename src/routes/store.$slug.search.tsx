import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, SlidersHorizontal, X } from "@/components/icons/tabler";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { fmtMinor } from "@/lib/money";
import { trackEvent } from "@/lib/traffic-client";
import { useLang } from "@/lib/i18n";
import { buildSearchHead } from "@/lib/theme-seo";
import { facetIndexPolicy } from "@/lib/seo-technical";
import { listingPolicy } from "@/lib/url-lifecycle";
import { searchStorefrontFn } from "@/lib/storefront-search.functions";
import { getStoreChrome } from "@/lib/storefront.functions";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import { SupportWidget } from "@/components/store/SupportWidget";
import { CollectionQueryProvider } from "@/components/builder/collection";
import {
  EMPTY_BUNDLE,
  collectWidgetRequests,
  type WidgetDataBundle,
  type WidgetDataMap,
} from "@/lib/widget-data";
import {
  PAGE_SIZE,
  SORTS,
  activeFilterCount,
  normalizeSearchParams,
  pageCount,
  toSearchQuery,
  type SearchParams,
  type SortKey,
} from "@/lib/storefront-search";

export const Route = createFileRoute("/store/$slug/search")({
  validateSearch: (search: Record<string, unknown>) =>
    toSearchQuery(normalizeSearchParams(search)),
  loaderDeps: ({ search }) => search,
  // Phase 7.1: the listing is rendered server-side, so the products exist in
  // the HTML a crawler (or a shopper on a dead 3G connection) receives.
  loader: async ({ params, deps }) => {
    const state = normalizeSearchParams(deps as Record<string, unknown>);
    // The published `search` template is fetched alongside the results, so the
    // page arrives already wearing the merchant's theme.
    let outcome;
    let chrome;
    try {
      [outcome, chrome] = await Promise.all([
        searchStorefrontFn({
          data: {
            slug: params.slug,
            q: state.q,
            category: state.category,
            collection: state.collection,
            kind: state.kind,
            min: state.minMinor,
            max: state.maxMinor,
            stock: state.inStock,
            sort: state.sort,
            page: state.page,
          },
        }),
        getStoreChrome({ data: { slug: params.slug, template: "search" } }),
      ]);
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry. Degraded/empty outcomes still resolve below and render
      // in-page — they are not loader failures.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
    // Decision Gate **G2 (a)** — the storefront GRANTS the facet sidebar, so
    // the preview and the storefront show the SAME filters. The sidebar's
    // rows come from the widget-data pipeline (`source: "facets"`), and no
    // storefront route mounted a `WidgetDataProvider` — which is exactly why
    // the facet column existed in the preview and not in production
    // (Decision **D7**).
    //
    // The batch is resolved HERE, on the server, for the published SEARCH
    // layout's own AST — the same mechanism the homepage uses
    // (`src/lib/storefront.server.ts:506-514`). It is shipped inside the
    // route payload, so the client never refetches it on hydrate.
    const widgetBundle: WidgetDataBundle = chrome?.ast
      ? collectWidgetRequests(chrome.ast)
      : EMPTY_BUNDLE;
    let widgetMap: WidgetDataMap = {};
    if (widgetBundle.requests.length > 0 && chrome) {
      try {
        const { resolveWidgetData } = await import("@/lib/widget-data.server");
        const { currentRequestHost, storeLinkBase } =
          await import("@/lib/storefront-host.server");
        widgetMap = await resolveWidgetData(
          chrome.merchant.id,
          widgetBundle,
          undefined,
          {
            base: storeLinkBase(
              currentRequestHost(),
              chrome.merchant.slug ?? params.slug,
            ),
          },
        );
      } catch {
        // A resolver failure degrades to an empty facet column — never a
        // broken page, never a wrong tenant's rows.
        widgetMap = {};
      }
    }
    return {
      ...outcome,
      chrome,
      origin: chrome?.origin ?? null,
      widgetBundle,
      widgetMap,
    };
  },
  head: ({ params, match, loaderData }) => {
    // Phase 7.1 canonical discipline: one allowlisted facet on page 1 stays
    // indexable and self-canonical; every other permutation is noindex,follow
    // with a canonical back to the clean listing.
    const base = `/store/${params.slug}/search`;
    const state = normalizeSearchParams(
      ((match as unknown as { search?: Record<string, unknown> }).search ??
        {}) as Record<string, unknown>,
    );
    const policy = facetIndexPolicy(base, state);
    // …and an empty listing is not a missing page: it stays 200, but a filtered
    // or searched view with nothing in it is kept out of the index.
    const total = loaderData?.status === "ok" ? loaderData.result.total : 0;
    const listing = listingPolicy({
      total,
      hasQuery: !!state.q,
      filtered: activeFilterCount(state) > 0 || state.page > 1,
    });
    return buildSearchHead({
      origin:
        loaderData && "origin" in loaderData
          ? (loaderData.origin as string | null)
          : null,
      path: policy.canonicalPath,
      storePath: `/store/${params.slug}`,
      storeName: params.slug,
      query: state.q,
      robots:
        listing.robots === "index,follow" ? policy.robots : listing.robots,
    });
  },
  component: SearchPage,
  errorComponent: StorefrontError,
  notFoundComponent: SearchMissing,
});

function SearchMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Store not found", "দোকান পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

function SearchPage() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  const rawSearch = Route.useSearch();
  const { chrome, widgetBundle, widgetMap, ...loaderData } =
    Route.useLoaderData();
  const navigate = useNavigate();
  const params = normalizeSearchParams(rawSearch as Record<string, unknown>);
  const [term, setTerm] = useState(params.q);
  const [showFilters, setShowFilters] = useState(false);
  const search = useServerFn(searchStorefrontFn);

  useEffect(() => setTerm(params.q), [params.q]);

  // Funnel step: searches, with the query kept as a plain term (no shopper id).
  useEffect(() => {
    if (params.q)
      trackEvent({
        entity: "search",
        action: "query",
        payload: { q: params.q.slice(0, 60) },
      });
  }, [params.q]);

  const query = useQuery({
    queryKey: ["storefront-search", slug, toSearchQuery(params)],
    queryFn: () =>
      search({
        data: {
          slug,
          q: params.q,
          category: params.category,
          collection: params.collection,
          kind: params.kind,
          min: params.minMinor,
          max: params.maxMinor,
          stock: params.inStock,
          sort: params.sort,
          page: params.page,
        },
      }),
    staleTime: 20_000,
    placeholderData: (prev) => prev,
    // Seeded from the SSR loader so the first paint needs no round trip.
    initialData: loaderData,
  });

  const apply = (patch: Partial<SearchParams>) => {
    const next = { ...params, ...patch, page: patch.page ?? 1 };
    void navigate({
      to: "/store/$slug/search",
      params: { slug },
      search: toSearchQuery(next),
    });
  };

  const outcome = query.data;
  const result = outcome?.status === "ok" ? outcome.result : null;
  const currency = result?.currency_code ?? "BDT";
  const facets = result?.facets;
  const pages = pageCount(result?.total ?? 0, result?.limit ?? PAGE_SIZE);
  const filters = activeFilterCount(params);

  // Phase 2 (Task 9.3) — the listing is split into NAMED PIECES, so that every
  // piece has exactly ONE owner: the results block the theme places (the
  // productSlot), or the platform's own widget. Every piece keeps its existing
  // markup and its existing `t()` calls — the split MOVES markup into named
  // constants; it does not redesign the platform's UI.
  //
  //   queryBox        the search form
  //   filtersPanel    the category/kind chips, the price bounds, the stock
  //                   toggle and the clear button
  //   resultCount     the count branch of the summary
  //   searchNotice    every other branch of it
  //   summaryAndSort  the summary row and the sort control
  //   degradedNotice  the degraded-engine notice
  //   emptyState      the no-results panel
  //   results         the results grid
  //   pager           the pager
  const queryBox = (
    <form
      className="mt-4 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: term.trim() });
      }}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor="sf-q"
          className="block text-xs font-medium text-muted-foreground"
        >
          {t("Product name, description or tag", "পণ্যের নাম, বিবরণ বা ট্যাগ")}
        </label>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="sf-q"
            type="search"
            value={term}
            maxLength={80}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("e.g. jamdani shari", "যেমন: জামদানি শাড়ি")}
            className="min-h-11 w-full rounded-fq-md border border-border bg-card pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      </div>
      <button
        type="submit"
        className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {t("Search", "খুঁজুন")}
      </button>
      <button
        type="button"
        onClick={() => setShowFilters((v) => !v)}
        aria-expanded={showFilters}
        className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border bg-card px-3 text-sm"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {t("Filters", "ফিল্টার")}
        {filters > 0 && (
          <span className="money rounded-full bg-primary px-2 text-xs text-primary-foreground">
            {filters}
          </span>
        )}
      </button>
    </form>
  );

  const filtersPanel =
    showFilters && facets ? (
      <section
        aria-label={t("Filters", "ফিল্টার")}
        className="mt-4 space-y-4 rounded-fq-lg border border-border bg-card p-4"
      >
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">
            {t("Category", "ক্যাটাগরি")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip
              active={!params.category}
              label={t("All", "সব")}
              onClick={() => apply({ category: null })}
            />
            {facets.categories.map((c) => (
              <Chip
                key={c.slug}
                active={params.category === c.slug}
                label={`${c.name} (${c.count})`}
                onClick={() =>
                  apply({
                    category: params.category === c.slug ? null : c.slug,
                  })
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">
            {t("Product type", "পণ্যের ধরন")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip
              active={!params.kind}
              label={t("All", "সব")}
              onClick={() => apply({ kind: null })}
            />
            {facets.kinds.map((k) => (
              <Chip
                key={k.kind}
                active={params.kind === k.kind}
                label={`${k.kind} (${k.count})`}
                onClick={() =>
                  apply({
                    kind:
                      params.kind === k.kind
                        ? null
                        : (k.kind as SearchParams["kind"]),
                  })
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">
            {t("Price range", "দামের সীমা")}{" "}
            {facets.price_min_minor !== null && (
              <span className="money">
                {fmtMinor(facets.price_min_minor, currency)} –{" "}
                {fmtMinor(facets.price_max_minor ?? 0, currency)}
              </span>
            )}
          </legend>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <MoneyBound
              id="sf-min"
              label={t("Minimum", "সর্বনিম্ন")}
              currency={currency}
              valueMinor={params.minMinor}
              onCommit={(v) => apply({ minMinor: v })}
            />
            <MoneyBound
              id="sf-max"
              label={t("Maximum", "সর্বোচ্চ")}
              currency={currency}
              valueMinor={params.maxMinor}
              onCommit={(v) => apply({ maxMinor: v })}
            />
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={params.inStock}
            onChange={(e) => apply({ inStock: e.target.checked })}
            className="size-4 accent-[var(--bd-teal-700)]"
          />
          {t("In stock only", "শুধু স্টকে আছে")}{" "}
          <span className="money text-xs text-muted-foreground">
            ({facets.in_stock})
          </span>
        </label>

        {filters > 0 && (
          <button
            type="button"
            onClick={() =>
              apply({
                category: null,
                collection: null,
                kind: null,
                minMinor: null,
                maxMinor: null,
                inStock: false,
              })
            }
            className="inline-flex min-h-9 items-center gap-1 text-sm text-primary underline"
          >
            <X className="size-3.5" aria-hidden />{" "}
            {t("Clear filters", "ফিল্টার মুছুন")}
          </button>
        )}
      </section>
    ) : null;

  // The count — the "ok" branch of the summary. It keeps the original
  // paragraph wrapper, so the summary row keeps its single live region.
  const resultCount =
    !query.isPending && outcome?.status === "ok" ? (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t(
          `${result?.total ?? 0} ${result?.total === 1 ? "product" : "products"}`,
          `${result?.total ?? 0} টি পণ্য`,
        )}
      </p>
    ) : null;

  // The notice — every other branch of the summary: pending, rate-limited,
  // not published and unavailable. Exactly one of the count and the notice
  // renders at a time, and the notice renders NOTHING in the "ok" case (on a
  // themed page the count comes from the granted result_toolbar widget).
  const searchNotice =
    query.isPending || outcome?.status !== "ok" ? (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {query.isPending
          ? t("Searching…", "খোঁজা হচ্ছে…")
          : outcome?.status === "rate_limited"
            ? t(
                "Too many searches — try again shortly.",
                "অনেক বেশি সার্চ — কিছুক্ষণ পরে চেষ্টা করুন।",
              )
            : outcome?.status === "not_found"
              ? t("This store is not published.", "এই দোকানটি প্রকাশিত নয়।")
              : t("Search is unavailable right now.", "সার্চ এখন কাজ করছে না।")}
      </p>
    ) : null;

  const summaryAndSort = (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      {resultCount}
      {searchNotice}
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("Sort", "সাজান")}</span>
        <select
          value={params.sort}
          onChange={(e) => apply({ sort: e.target.value as SortKey })}
          className="min-h-11 rounded-fq-md border border-border bg-card px-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {s === "relevance"
                ? t("Best match", "সবচেয়ে মিল")
                : s === "price_asc"
                  ? t("Price: low to high", "দাম: কম থেকে বেশি")
                  : s === "price_desc"
                    ? t("Price: high to low", "দাম: বেশি থেকে কম")
                    : s === "newest"
                      ? t("Newest", "নতুন")
                      : t("Name", "নাম")}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const degradedNotice = result?.degraded ? (
    // The search engine is down and Postgres answered instead. Ranking is
    // simpler, so say so plainly rather than let shoppers assume the
    // catalogue shrank.
    <p className="mt-4 rounded-fq-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      {t(
        "Showing basic results while search is recovering — ordering may be less precise.",
        "সার্চ ঠিক হওয়া পর্যন্ত সাধারণ ফলাফল দেখানো হচ্ছে — ক্রম কম নিখুঁত হতে পারে।",
      )}
    </p>
  ) : null;

  const emptyState =
    result && result.items.length === 0 && !query.isPending ? (
      <div className="mt-8 rounded-fq-lg border border-border bg-card p-6">
        <h2 className="font-bangla-display text-lg font-semibold">
          {t("No products matched", "কোনো পণ্য মেলেনি")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Try a shorter word, or clear a filter to widen the results.",
            "ছোট শব্দ লিখুন, বা একটি ফিল্টার সরিয়ে ফলাফল বাড়ান।",
          )}
        </p>
        <Link
          to="/store/$slug"
          search={{ preview_token: undefined }}
          params={{ slug }}
          className="mt-3 inline-block text-sm text-primary underline"
        >
          {t("Browse everything", "সব পণ্য দেখুন")}
        </Link>
      </div>
    ) : null;

  const results =
    result && result.items.length > 0 ? (
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {result.items.map((p) => (
          <li key={p.id}>
            <Link
              to="/store/$slug/p/$productSlug"
              params={{ slug, productSlug: p.slug }}
              className="group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="aspect-square bg-muted">
                <StoreImage
                  image={p.image ?? null}
                  fallbackSrc={p.image_url}
                  alt={p.title}
                  seed={p.id}
                  sizes="(max-width: 768px) 50vw, 300px"
                  className="size-full object-cover"
                />
              </div>
              <div className="p-3">
                <h2 className="line-clamp-2 text-sm font-medium">{p.title}</h2>
                <p className="money mt-1 text-sm font-semibold">
                  {fmtMinor(p.price_minor, currency)}
                </p>
                <p
                  className={`mt-1 text-xs ${p.stock > 0 ? "text-success-foreground" : "text-danger-foreground"}`}
                >
                  {p.stock > 0
                    ? t("In stock", "স্টকে আছে")
                    : t("Out of stock", "স্টক নেই")}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    ) : null;

  const pager =
    pages > 1 ? (
      <nav
        aria-label={t("Pages", "পেজ")}
        className="mt-8 flex items-center justify-center gap-2"
      >
        {/* Phase 7.1: real hrefs — a crawler (and a JS-less shopper) must be
              able to walk the whole result set, so these are links, not buttons. */}
        <Link
          to="/store/$slug/search"
          params={{ slug }}
          search={toSearchQuery({
            ...params,
            page: Math.max(1, params.page - 1),
          })}
          rel="prev"
          aria-disabled={params.page <= 1}
          className={`min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm leading-[2.75rem] ${
            params.page <= 1 ? "pointer-events-none opacity-40" : ""
          }`}
        >
          {t("Previous", "আগের")}
        </Link>
        <span className="money text-sm text-muted-foreground">
          {params.page} / {pages}
        </span>
        <Link
          to="/store/$slug/search"
          params={{ slug }}
          search={toSearchQuery({
            ...params,
            page: Math.min(pages, params.page + 1),
          })}
          rel="next"
          aria-disabled={params.page >= pages}
          className={`min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm leading-[2.75rem] ${
            params.page >= pages ? "pointer-events-none opacity-40" : ""
          }`}
        >
          {t("Next", "পরের")}
        </Link>
      </nav>
    ) : null;

  // The whole listing — the `fallback`'s content: every piece, in today's
  // order, so a store with NO published search template still gets today's
  // page, content for content.
  const listing = (
    <>
      {queryBox}
      {filtersPanel}
      {summaryAndSort}
      {degradedNotice}
      {emptyState}
      {results}
      {pager}
    </>
  );

  // The results block — what the theme's `product_grid` receives as
  // `productSlot`. It carries the query box and the platform's category/kind
  // chips (search EXECUTION and AUTHORIZATION, not presentation), the
  // search-status notice, the degraded notice and the results grid.
  const resultsBlock = (
    <>
      {queryBox}
      {filtersPanel}
      {searchNotice}
      {degradedNotice}
      {results}
    </>
  );

  const heading = (
    <h1 className="font-bangla-display text-2xl font-bold sm:text-3xl">
      {t("Search this store", "এই দোকানে খুঁজুন")}
    </h1>
  );

  return (
    <PluginLayer plugins={chrome?.installedPlugins ?? []}>
      {/*
        Phase 2 (Task 9.3) — the theme's facet, sort and pager widgets compute
        REAL links, so the provider carries the LIVE query: the live params,
        the live total, the store's search path and the route's own `apply()`.
      */}
      <CollectionQueryProvider
        value={{
          params,
          total: result?.total ?? 0,
          basePath: `/store/${slug}/search`,
          navigate: (next) => apply(next),
        }}
      >
        {/*
          Decision Gate **G2 (a)** — the storefront grants the facet sidebar,
          and the widget batch the sidebar reads is resolved on the server
          (the loader) and shipped in the payload. The preview and the
          storefront therefore show the SAME filters.
        */}
        <WidgetDataProvider bundle={widgetBundle} map={widgetMap}>
          <ThemeChrome
            template="search"
            storeSlug={slug}
            themeKey={chrome?.themeKey ?? null}
            merchantId={chrome?.merchant.id ?? null}
            ast={chrome?.ast ?? null}
            tokens={chrome?.tokens ?? null}
            siteKit={chrome?.siteKit ?? null}
            chrome={
              <>
                <StoreHeader
                  slug={slug}
                  name={chrome?.merchant.name ?? slug}
                  menus={chrome?.menus}
                  themeKey={chrome?.themeKey ?? null}
                />
                {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
                {/* <SupportWidget slug={slug} /> */}
              </>
            }
            // The storefront grants the platform's search widgets — and, per
            // Decision Gate **G2 (a)**, the facet sidebar too. Its rows come
            // from the widget-data pipeline, which this route now resolves and
            // mounts (the `WidgetDataProvider` above). The platform's own
            // category/kind chips stay visible inside the results block as
            // well, so the shopper can filter from either place.
            contextSlots={{
              result_toolbar: null,
              filter_chips: null,
              pagination: null,
              facet_sidebar: null,
              // The `empty_state` widget renders its panel unconditionally
              // (`src/components/builder/collection.tsx:707-753`), so the GRANT
              // is what decides whether the theme's empty copy appears — it is
              // granted only when the platform's own empty state would have
              // shown.
              ...(result && result.items.length === 0 && !query.isPending
                ? { empty_state: null }
                : {}),
              category_header: null,
            }}
            productSlot={resultsBlock}
            fallback={
              <>
                {heading}
                {listing}
              </>
            }
          />
        </WidgetDataProvider>
      </CollectionQueryProvider>
    </PluginLayer>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  key?: React.Key;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active
          ? "border-bd-teal-700 bg-bd-teal-700 text-background"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}

/** Shoppers type major units; the URL and the database only ever see integer minor units. */
function MoneyBound({
  id,
  label,
  currency,
  valueMinor,
  onCommit,
}: {
  id: string;
  label: string;
  currency: string;
  valueMinor: number | null;
  onCommit: (minor: number | null) => void;
}) {
  const digits = currency === "BDT" || currency === "USD" ? 2 : 2;
  const [text, setText] = useState(
    valueMinor === null ? "" : String(valueMinor / 10 ** digits),
  );
  useEffect(() => {
    setText(valueMinor === null ? "" : String(valueMinor / 10 ** digits));
  }, [valueMinor, digits]);

  return (
    <label htmlFor={id} className="text-xs text-muted-foreground">
      {label}
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          const major = Number(text);
          if (!text.trim()) return onCommit(null);
          if (!Number.isFinite(major) || major < 0) return onCommit(null);
          onCommit(Math.round(major * 10 ** digits));
        }}
        className="money mt-1 block min-h-11 w-28 rounded-fq-md border border-border bg-card px-2 text-sm"
      />
    </label>
  );
}
