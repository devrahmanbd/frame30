/**
 * Phase 13 — typed RPC surface for `/admin/settings/seo`.
 *
 * Reads need `settings.read`; every write needs `settings.update`. The server
 * layer re-parses each payload, so validation cannot be skipped from a client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "@/lib/authz-middleware";

const templateSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(400),
  index: z.boolean(),
  sitemap: z.boolean(),
});

const settingsSchema = z.object({
  separator: z.string().max(4),
  templates: z.record(z.string(), templateSchema),
  verification: z.object({
    google: z.string().max(200),
    bing: z.string().max(200),
    pinterest: z.string().max(200),
  }),
  sitemap: z.object({
    enabled: z.boolean(),
    perPage: z.number().int().min(20).max(1000),
    includeImages: z.boolean(),
  }),
  aiCrawlers: z.boolean(),
  instantIndexing: z.boolean(),
  analytics: z
    .object({
      facebookPixelId: z.string().max(200).optional().default(""),
      facebookCapiToken: z.string().max(1000).optional().default(""),
      googleConversionUrl: z.string().max(500).optional().default(""),
      googleTagManagerId: z.string().max(200).optional().default(""),
    })
    .optional(),
});

export const siteSeoLoadFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("settings.read")])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { loadSiteSeo } = await import("./site-seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return loadSiteSeo(context.supabase, merchantId);
  });

export const siteSeoSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("settings.update")])
  .inputValidator((d: unknown) => z.object({ settings: settingsSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { saveSiteSeo } = await import("./site-seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return saveSiteSeo(context.supabase, merchantId, data.settings);
  });

export const redirectSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("settings.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        sourcePath: z.string().min(1).max(512),
        targetPath: z.string().min(1).max(2048),
        code: z.union([z.literal(301), z.literal(302), z.literal(307)]),
        isActive: z.boolean(),
        note: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { upsertRedirect } = await import("./site-seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return upsertRedirect(context.supabase, merchantId, data);
  });

export const redirectDeleteFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("settings.update")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { deleteRedirect } = await import("./site-seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await deleteRedirect(context.supabase, merchantId, data.id);
    return { ok: true };
  });

export const notFoundRedirectFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("settings.update")])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), targetPath: z.string().min(1).max(2048) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { redirectNotFound } = await import("./site-seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return redirectNotFound(context.supabase, merchantId, data);
  });

export const notFoundClearFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("settings.update")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { clearNotFound } = await import("./site-seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await clearNotFound(context.supabase, merchantId, data.id);
    return { ok: true };
  });
