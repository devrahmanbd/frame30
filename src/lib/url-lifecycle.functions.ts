/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_PERMALINKS } from "./permalink";

/**
 * Public resolver for a storefront URL that matched no row: the shopper may be
 * following a renamed link (301) or a permanently removed one (410).
 */
export const resolveMissingUrlFn = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        path: z.string().min(1).max(512),
      })
      .parse(data),
  )
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
    const { recordPermalinkSlugChange } =
      await import("./url-lifecycle.server");
    const merchantId = await currentMerchantId(
      context.supabase,
      context.userId,
    );
    if (!merchantId) return { ok: false as const };
    const { data: merchant } = await (context.supabase as any)
      .from("merchants")
      .select("slug")
      .eq("id", merchantId)
      .maybeSingle();
    const storeSlug = merchant?.slug ?? undefined;
    // Bases come from the merchant's live permalink settings, never from a
    // hardcoded map: with a custom product base the old `/p` rule would never
    // fire. A settings outage falls back to the defaults, not to a failure.
    const { permalinkSettingsFor } = await import("./permalink.server");
    let settings = DEFAULT_PERMALINKS;
    try {
      settings = await permalinkSettingsFor(context.supabase, merchantId);
    } catch {
      /* defaults */
    }
    // Dated article patterns need the entity's own publish date; without it
    // the rule would be built with zeroed date parts and never match.
    let date: string | null = null;
    if (data.entityType === "article") {
      try {
        const { data: row } = await (context.supabase as any)
          .from("articles")
          .select("published_at")
          .eq("merchant_id", merchantId)
          .in("slug", [data.oldSlug, data.newSlug])
          .limit(1)
          .maybeSingle();
        date = (row?.published_at as string | null) ?? null;
      } catch {
        /* null date: defaults apply */
      }
    }
    await recordPermalinkSlugChange({
      merchantId,
      storeSlug,
      entityType: data.entityType,
      settings,
      oldSlug: data.oldSlug,
      newSlug: data.newSlug,
      date,
    });
    return { ok: true as const };
  });
