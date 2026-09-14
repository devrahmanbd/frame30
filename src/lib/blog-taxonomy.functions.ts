/**
 * Phase 9.1 RPC surface — reader listings (public) and taxonomy admin (authed).
 *
 * Two audiences live in one module because they share one validation vocabulary,
 * but they are guarded very differently:
 *
 *  - **Reader functions are public endpoints.** They take a page number and a
 *    slug, nothing else, are rate-limited by client IP (a server function is
 *    reachable directly, so "only our route calls it" is not a control), and
 *    read through the anon client so RLS — not this file — decides what is
 *    visible.
 *  - **Admin functions require a permission**, not merely a session:
 *    `marketing.update` for writes, `marketing.create` for a new term. Each one
 *    resolves the caller's merchant server-side and never accepts a merchant id
 *    from the client.
 *
 * `TaxonomyError` is translated into the same `code|field|en|bn` message shape
 * `cms.functions.ts` uses, so the admin desk needs no second error reader.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

/* --------------------------------------------------------------- public API */

const pageSchema = z.object({ page: z.number().int().min(1).max(500).optional() });
const archiveSchema = pageSchema.extend({
  kind: z.enum(["category", "tag"]),
  slug: z.string().min(1).max(120),
});

/** IP-keyed subject for public buckets. Hashed upstream; never logged raw. */
async function readerSubject(): Promise<string> {
  const { requestFingerprint } = await import("./identity.server");
  const { ipHash } = await requestFingerprint();
  return `blog:${ipHash}`;
}

export const blogIndexFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => pageSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadBlogIndex } = await import("./blog-index.server");
    await enforceRateLimit("blog.read", await readerSubject());
    return loadBlogIndex(data.page ?? 1);
  });

export const blogArchiveFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => archiveSchema.parse(d))
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadTermArchive, TermNotFound } = await import("./blog-index.server");
    await enforceRateLimit("blog.read", await readerSubject());
    try {
      return await loadTermArchive(data.kind, data.slug, data.page ?? 1);
    } catch (error) {
      // A missing term is a real 404; the route turns this into notFound() so we
      // never serve an indexable soft-404 archive.
      if (error instanceof TermNotFound) return null;
      throw error;
    }
  });

/* ---------------------------------------------------------------- admin API */

const termSchema = z.object({
  id: z.string().uuid().nullable(),
  kind: z.enum(["category", "tag"]),
  name: z.string().min(1).max(80),
  nameEn: z.string().max(80).default(""),
  slug: z.string().max(60).default(""),
  description: z.string().max(500).default(""),
  parentId: z.string().uuid().nullable().default(null),
  sortOrder: z.number().int().min(0).max(9_999).default(0),
  coverImageUrl: z.string().max(2048).default(""),
  metaTitle: z.string().max(200).default(""),
  metaDescription: z.string().max(600).default(""),
  robotsIndex: z.boolean().default(true),
});

/** Keep merchant-actionable failures readable; keep everything else opaque. */
function toClientError(error: unknown): Error {
  if (error && typeof error === "object" && (error as { name?: string }).name === "TaxonomyError") {
    const detail = error as { code: string; field: string; en: string; bn: string };
    const wrapped = new Error(`${detail.code}|${detail.field}|${detail.en}|${detail.bn}`);
    wrapped.name = "TaxonomyError";
    return wrapped;
  }
  return error instanceof Error ? error : new Error("taxonomy_failed");
}

export const taxonomyStateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadTaxonomy, termOptions } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.read", `${merchantId}:${context.userId}`);
    const [state, options] = await Promise.all([
      loadTaxonomy(context.supabase, merchantId),
      termOptions(context.supabase, merchantId),
    ]);
    return { ...state, options };
  });

export const saveTermFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.create")])
  .inputValidator((d: unknown) => termSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveTerm } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.write", `${merchantId}:${context.userId}`);
    try {
      return await saveTerm(context.supabase, merchantId, context.userId, data);
    } catch (error) {
      throw toClientError(error);
    }
  });

export const deleteTermFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { deleteTerm } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.delete", `${merchantId}:${context.userId}`);
    try {
      return await deleteTerm(context.supabase, merchantId, context.userId, data.id);
    } catch (error) {
      throw toClientError(error);
    }
  });

export const reorderTermsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        order: z
          .array(
            z.object({
              id: z.string().uuid(),
              sortOrder: z.number().int().min(0).max(9_999),
              parentId: z.string().uuid().nullable(),
            }),
          )
          .max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { reorderTerms } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.reorder", `${merchantId}:${context.userId}`);
    try {
      return await reorderTerms(context.supabase, merchantId, context.userId, data.order);
    } catch (error) {
      throw toClientError(error);
    }
  });

export const articleTermsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ articleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { articleTerms } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.read", `${merchantId}:${context.userId}`);
    return articleTerms(context.supabase, merchantId, data.articleId);
  });

export const setArticleTermsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        articleId: z.string().uuid(),
        terms: z
          .array(z.object({ termId: z.string().uuid(), isPrimary: z.boolean() }))
          .max(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { setArticleTerms } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.write", `${merchantId}:${context.userId}`);
    try {
      return await setArticleTerms(
        context.supabase,
        merchantId,
        context.userId,
        data.articleId,
        data.terms,
      );
    } catch (error) {
      throw toClientError(error);
    }
  });

/** Manual counter repair, for after a bulk import or a restored backup. */
export const refreshTermCountsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { refreshCounts } = await import("./blog-taxonomy.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("taxonomy.delete", `${merchantId}:${context.userId}`);
    return refreshCounts(context.supabase, merchantId);
  });