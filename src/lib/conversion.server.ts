/**
 * Storefront conversion surfaces: reviews, wishlists, recently viewed and
 * recommendations.
 *
 * Rules that hold for every export here:
 * - Tenancy comes from the merchant id resolved from the URL slug, never a client field.
 * - Public reads go through security-definer routines that only return published rows.
 * - Read paths are cached per tenant + entity; write paths purge what they invalidate.
 * - Every unit of work is wrapped in a span so latency and failures reach Prometheus.
 */
import { publicClient } from "./pricing.server";
import { cached, invalidate } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { EMPTY_AGG, mergeRails, type RecommendedProduct, type ReviewAgg } from "./conversion";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type PublicReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  author_name: string;
  verified_purchase: boolean;
  created_at: string;
  reply: { body: string; published_at: string } | null;
};

/* ------------------------------- reviews --------------------------------- */

/**
 * Published reviews plus the aggregate, both computed in the database.
 * Cached briefly: a review is not urgent, but a product page must not fan out
 * two extra round trips on every single request.
 */
export async function productReviews(productId: string) {
  return cached(`reviews:${productId}`, 60, async () =>
    withSpan("conversion.reviews", async () => {
      const db = publicClient() as unknown as Rpc;
      const [agg, list] = await Promise.all([
        db.rpc("review_agg", { _product_id: productId }),
        db.rpc("review_list_published", { _product_id: productId, _limit: 20 }),
      ]);
      if (agg.error) log("warn", "reviews.agg_failed", { productId });
      if (list.error) log("warn", "reviews.list_failed", { productId });
      return {
        agg: ((agg.data as ReviewAgg | null) ?? EMPTY_AGG) as ReviewAgg,
        list: ((list.data as PublicReview[] | null) ?? []) as PublicReview[],
      };
    }),
  );
}

/** Purged whenever a review is submitted, moderated or replied to. */
export function purgeReviews(productId: string) {
  invalidate(`reviews:${productId}`);
}

/* --------------------------- views + rails ------------------------------- */

/**
 * Records an anonymous product view. Best effort by design: a tracking failure
 * must never break a product page, so it is logged and counted, not thrown.
 */
export async function trackProductView(merchantId: string, productId: string, sessionKey: string) {
  try {
    const db = publicClient() as unknown as Rpc;
    const { error } = await db.rpc("storefront_track_view", {
      _merchant_id: merchantId,
      _product_id: productId,
      _session_key: sessionKey,
    });
    if (error) throw error;
    incr("framique_storefront_view_total", { outcome: "recorded" });
  } catch {
    incr("framique_storefront_view_total", { outcome: "failed" });
    log("warn", "storefront.view_track_failed", { merchantId });
  }
}

/**
 * Recommendation rail for a product. Tenant- and product-keyed cache with a
 * stale window, because the underlying co-purchase scan is the heaviest read
 * on the page and its answer changes slowly.
 */
export async function recommendations(merchantId: string, productId: string, limit = 6) {
  return cached(
    `recs:${merchantId}:${productId}:${limit}`,
    300,
    async () =>
      withSpan("conversion.recommendations", async () => {
        const db = publicClient() as unknown as Rpc;
        const { data, error } = await db.rpc("product_recommendations", {
          _merchant_id: merchantId,
          _product_id: productId,
          _limit: limit,
        });
        if (error) {
          log("warn", "recommendations.failed", { merchantId });
          return [] as RecommendedProduct[];
        }
        return ((data as RecommendedProduct[] | null) ?? []) as RecommendedProduct[];
      }),
    { staleSeconds: 600 },
  );
}

/** Session-scoped, so it is never cached across shoppers. */
export async function recentlyViewed(
  merchantId: string,
  sessionKey: string,
  excludeId: string | null,
  limit = 8,
) {
  const db = publicClient() as unknown as Rpc;
  const { data, error } = await db.rpc("storefront_recently_viewed", {
    _merchant_id: merchantId,
    _session_key: sessionKey,
    _exclude: excludeId,
    _limit: limit,
  });
  if (error) {
    log("warn", "recently_viewed.failed", { merchantId });
    return [] as RecommendedProduct[];
  }
  return ((data as (RecommendedProduct & { seen_at: string })[] | null) ??
    []) as RecommendedProduct[];
}

/**
 * Everything the product page needs below the fold, in one round trip.
 * Each part degrades independently: a failed rail renders as an absent rail,
 * never as a 500 on a page that is otherwise fine.
 */
export async function productConversionBundle(opts: {
  merchantId: string;
  productId: string;
  sessionKey: string | null;
}) {
  const { merchantId, productId, sessionKey } = opts;
  const [reviews, recs, recent] = await Promise.all([
    productReviews(productId).catch(() => ({ agg: EMPTY_AGG, list: [] as PublicReview[] })),
    recommendations(merchantId, productId).catch(() => [] as RecommendedProduct[]),
    sessionKey
      ? recentlyViewed(merchantId, sessionKey, productId).catch(() => [] as RecommendedProduct[])
      : Promise.resolve([] as RecommendedProduct[]),
  ]);

  return {
    reviews: reviews.list,
    agg: reviews.agg,
    // Cross-sell first, then anything else the shopper has already looked at.
    recommendations: mergeRails([recs], productId, 6),
    recentlyViewed: mergeRails([recent], productId, 8),
  };
}
