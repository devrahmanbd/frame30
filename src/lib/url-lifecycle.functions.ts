/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public resolver for a storefront URL that matched no row: the shopper may be
 * following a renamed link (301) or a permanently removed one (410).
 */
export const resolveMissingUrlFn = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(80), path: z.string().min(1).max(512) }).parse(data))
  .handler(async ({ data }) => {
    const { resolveMissingUrl } = await import("./url-lifecycle.server");
    return resolveMissingUrl(data.slug, data.path);
  });

/**
 * Records the 301 a merchant's slug rename creates. Scoped to the caller's own
 * store, so nobody can plant a redirect inside somebody else's storefront.
 */
export const recordSlugChangeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entityType: z.enum(["product", "collection", "page", "article"]),
        oldSlug: z.string().min(1).max(200),
        newSlug: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { recordSlugChange } = await import("./url-lifecycle.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    if (!merchantId) return { ok: false as const };
    const { data: merchant } = await (context.supabase as any)
      .from("merchants")
      .select("slug")
      .eq("id", merchantId)
      .maybeSingle();
    const storeSlug = merchant?.slug ?? undefined;
    const basePath = {
      product: `/store/${storeSlug}/p`,
      collection: `/store/${storeSlug}/search`,
      page: `/store/${storeSlug}/pages`,
      article: `/store/${storeSlug}/blog`,
    }[data.entityType];
    await recordSlugChange({
      merchantId,
      storeSlug,
      entityType: data.entityType,
      basePath,
      oldSlug: data.oldSlug,
      newSlug: data.newSlug,
    });
    return { ok: true as const };
  });
