import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_WIDGET_REQUESTS } from "./widget-data";

const paramValue = z.union([z.string().max(120), z.number(), z.boolean()]);

/**
 * The query-scoped facet payload a search results page hands the resolver.
 * Mirrors `SearchFacets` (`src/lib/storefront-search.ts:51-57`) — the counts
 * the search backend already computed for THIS query. Bounded, because the
 * function is public: a client may repeat its own search's scope, never
 * enlarge the resolver's work.
 */
const facetCount = z.number().int().min(0).max(1_000_000);
const searchFacetsSchema = z.object({
  categories: z
    .array(
      z.object({
        slug: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        count: facetCount,
      }),
    )
    .max(200),
  kinds: z
    .array(z.object({ kind: z.string().min(1).max(60), count: facetCount }))
    .max(50),
  in_stock: facetCount,
  price_min_minor: z.number().int().min(0).nullable(),
  price_max_minor: z.number().int().min(0).nullable(),
});

/**
 * Full WidgetDataSource union (see widget-registry.ts) — client-initiated
 * refetches for product-detail/account widgets must validate exactly like the
 * SSR batch serves them.
 */
export const widgetDataRequestSchema = z.object({
  key: z.string().min(1).max(300),
  source: z.enum([
    "collection",
    "manual",
    "recommendation",
    "reviews",
    "facets",
    "taxonomy",
    "variants",
    "qna",
    "order",
    "specs",
    "finance",
    "product",
    "orders",
    "profile",
  ]),
  params: z.record(z.string().max(40), paramValue),
});

const requestSchema = widgetDataRequestSchema;

/**
 * The single storefront data call. Every data widget on a page is resolved by
 * one invocation of this function; the client reads rows out of the returned
 * keyed map by node id.
 *
 * Public on purpose (storefronts are anonymous), so it only ever returns
 * published, active catalogue rows for the tenant named by `slug`.
 */
export const resolveWidgetDataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        requests: z.array(requestSchema).max(MAX_WIDGET_REQUESTS),
        /**
         * The search route's query scope (S4). Present only on a search
         * results page; absent everywhere else, where the facets loader
         * keeps its own behaviour.
         */
        facets: searchFacetsSchema.optional(),
        total: z.number().int().min(0).max(1_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.requests.length === 0) return {};
    const { publicClient } = await import("./pricing.server");
    const { data: merchant } = await publicClient()
      .from("merchants")
      .select("id")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return {};
    const { resolveWidgetData } = await import("./widget-data.server");
    const { currentRequestHost, storeLinkBase } =
      await import("./storefront-host.server");
    return resolveWidgetData(
      merchant.id,
      {
        requests: data.requests,
        byNode: {},
      },
      undefined,
      {
        base: storeLinkBase(currentRequestHost(), data.slug),
        ...(data.facets ? { facets: data.facets, total: data.total ?? 0 } : {}),
      },
    );
  });
