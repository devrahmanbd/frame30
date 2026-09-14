/**
 * Server functions for the storefront conversion surfaces.
 *
 * Public (unauthenticated) entry points are rate limited by session key and
 * validated with Zod before they reach the database. Staff entry points carry
 * the Supabase bearer middleware and resolve tenancy from the session.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const sessionKey = z
  .string()
  .regex(/^[a-z0-9]{16,64}$/, "invalid_session")
  .optional();

const publicInput = z.object({
  slug: z.string().min(1).max(80),
  productId: z.string().uuid(),
  sessionKey,
});

/** Below-the-fold bundle for a product page: reviews, rails, recently viewed. */
export const productConversionFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => publicInput.parse(d))
  .handler(async ({ data }) => {
    const { storeBySlug } = await import("./accounts.server");
    const { enforceRateLimit, RateLimitError } = await import("./rate-limit.server");
    const store = await storeBySlug(data.slug);
    try {
      await enforceRateLimit("storefront.social", `${store.id}:${data.sessionKey ?? "anon"}`);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return { reviews: [], agg: null, recommendations: [], recentlyViewed: [], throttled: true };
      }
      throw err;
    }
    const { productConversionBundle } = await import("./conversion.server");
    const bundle = await productConversionBundle({
      merchantId: store.id,
      productId: data.productId,
      sessionKey: data.sessionKey ?? null,
    });
    return { ...bundle, throttled: false };
  });

/** Fire-and-forget view beacon. Always answers 200 so it can never block a page. */
export const trackProductViewFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => publicInput.extend({ sessionKey: sessionKey }).parse(d))
  .handler(async ({ data }) => {
    if (!data.sessionKey) return { ok: false };
    const { storeBySlug } = await import("./accounts.server");
    const { rateLimit } = await import("./rate-limit.server");
    const store = await storeBySlug(data.slug);
    const verdict = await rateLimit("storefront.view", `${store.id}:${data.sessionKey}`);
    if (!verdict.allowed) return { ok: false };
    const { trackProductView } = await import("./conversion.server");
    await trackProductView(store.id, data.productId, data.sessionKey);
    return { ok: true };
  });

/** Shopper review submission. Verified-purchase status is decided server-side. */
export const submitReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        productId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        title: z.string().min(3).max(140),
        body: z.string().min(10).max(4000),
        authorName: z.string().max(80).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("storefront.review", `${data.slug}:${context.userId}`);
    const { storeBySlug, submitReview } = await import("./accounts.server");
    const store = await storeBySlug(data.slug);
    await submitReview(context.supabase, store.id, {
      productId: data.productId,
      rating: data.rating,
      title: data.title,
      body: data.body,
      authorName: data.authorName,
    });
    const { purgeReviews } = await import("./conversion.server");
    purgeReviews(data.productId);
    // Pending until a human publishes it: the shopper is told, not surprised.
    return { ok: true, status: "pending" as const };
  });

/* --------------------------------- staff ---------------------------------- */

const merchantInput = z.object({ merchantId: z.string().uuid() });

export const reviewQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => merchantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("admin.reviews", `${data.merchantId}:${context.userId}`);
    const { loadReviewQueue } = await import("./accounts.server");
    return loadReviewQueue(context.supabase, data.merchantId);
  });

export const moderateReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    merchantInput
      .extend({
        reviewId: z.string().uuid(),
        productId: z.string().uuid(),
        status: z.enum(["pending", "published", "rejected"]),
        note: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("admin.reviews", `${data.merchantId}:${context.userId}`);
    const { moderateReview } = await import("./accounts.server");
    await moderateReview(context.supabase, data.reviewId, data.status, data.note);
    const { purgeReviews } = await import("./conversion.server");
    purgeReviews(data.productId);
    return { ok: true };
  });

export const replyReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    merchantInput
      .extend({
        reviewId: z.string().uuid(),
        productId: z.string().uuid(),
        body: z.string().min(2).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("admin.reviews", `${data.merchantId}:${context.userId}`);
    const { replyToReview } = await import("./accounts.server");
    await replyToReview(context.supabase, data.reviewId, data.body);
    const { purgeReviews } = await import("./conversion.server");
    purgeReviews(data.productId);
    return { ok: true };
  });

/* ------------------------------ experiments -------------------------------- */

const variantSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "variant_key_format"),
  isControl: z.boolean(),
  weightPct: z.number().int().min(0).max(100),
});

export const experimentListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => merchantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("admin.experiments", `${data.merchantId}:${context.userId}`);
    const { listExperiments } = await import("./experiments.server");
    return listExperiments(context.supabase, data.merchantId);
  });

export const experimentSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    merchantInput
      .extend({
        id: z.string().uuid().nullable().default(null),
        key: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9_.-]+$/, "experiment_key_format"),
        name: z.string().min(2).max(120),
        hypothesis: z.string().max(1000).default(""),
        surface: z.string().min(2).max(60).default("storefront"),
        trafficPct: z.number().int().min(0).max(100).default(100),
        variants: z.array(variantSchema).min(2).max(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("admin.experiments", `${data.merchantId}:${context.userId}`);
    const { saveExperiment } = await import("./experiments.server");
    const id = await saveExperiment(context.supabase, data.merchantId, data);
    return { id };
  });

export const experimentStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    merchantInput
      .extend({
        experimentId: z.string().uuid(),
        status: z.enum(["draft", "running", "paused", "stopped"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("admin.experiments", `${data.merchantId}:${context.userId}`);
    const { setExperimentStatus } = await import("./experiments.server");
    await setExperimentStatus(context.supabase, data.merchantId, data.experimentId, data.status);
    return { ok: true };
  });
