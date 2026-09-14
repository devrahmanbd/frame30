/**
 * Phase 4 — RPC surface for the sitemap & robots desk.
 *
 * Thin *here only*: every handler validates with zod, resolves the caller's
 * merchant, enforces a marketing permission, and delegates to
 * `sitemap-config.server.ts`, which owns caching, rate limits, auditing and
 * invalidation. Module scope stays imports + exported declarations because
 * server-function splitting deletes anything else.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

const originSchema = z
  .string()
  .url()
  .max(300)
  .transform((value) => value.replace(/\/+$/, ""));

const kindConfigSchema = z.object({
  include: z.boolean(),
  changefreq: z.enum(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]),
  priority: z.string().max(4),
});

const robotsRuleSchema = z.object({
  agent: z.string().min(1).max(60),
  allow: z.array(z.string().max(200)).max(50),
  disallow: z.array(z.string().max(200)).max(50),
  crawlDelay: z.number().min(0).max(60).nullable(),
});

const crawlSettingsSchema = z.object({
  sitemap: z
    .object({
      kinds: z.record(z.string(), kindConfigSchema).optional(),
      includeImages: z.boolean().optional(),
      entriesPerFile: z.number().int().min(1).max(50_000).optional(),
    })
    .optional(),
  robots: z
    .object({
      indexable: z.boolean().optional(),
      aiCrawlers: z.boolean().optional(),
      rules: z.array(robotsRuleSchema).max(20).optional(),
      extraSitemaps: z.array(z.string().max(300)).max(10).optional(),
      rawAppend: z.string().max(8_000).optional(),
    })
    .optional(),
});

export const crawlStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ origin: originSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadCrawlSettings, previewCrawlDocuments } = await import("./sitemap-config.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `crawl:${merchantId}:${context.userId}`);
    const settings = await loadCrawlSettings(context.supabase, merchantId);
    const preview = await previewCrawlDocuments(context.supabase, merchantId, data.origin, {});
    return { settings, ...preview };
  });

export const crawlPreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z.object({ origin: originSchema, candidate: crawlSettingsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { previewCrawlDocuments } = await import("./sitemap-config.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `crawl-preview:${merchantId}:${context.userId}`);
    return previewCrawlDocuments(context.supabase, merchantId, data.origin, data.candidate);
  });

export const crawlSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z.object({ origin: originSchema, settings: crawlSettingsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveCrawlSettings, previewCrawlDocuments } = await import("./sitemap-config.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const settings = await saveCrawlSettings(context.supabase, merchantId, context.userId, data.settings);
    const preview = await previewCrawlDocuments(context.supabase, merchantId, data.origin, {});
    return { settings, ...preview };
  });

export const crawlTestPathFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        origin: originSchema,
        path: z.string().min(1).max(300),
        agent: z.string().max(60).default("*"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { previewCrawlDocuments } = await import("./sitemap-config.server");
    const { testRobotsPath } = await import("./sitemap-config");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `crawl-test:${merchantId}:${context.userId}`);
    const preview = await previewCrawlDocuments(context.supabase, merchantId, data.origin, {});
    const path = data.path.startsWith("/") ? data.path : `/${data.path}`;
    return { ...testRobotsPath(preview.currentRobots, path, data.agent || "*"), path };
  });

export const sitemapExcludeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        entityType: z.enum(["product", "collection", "page", "article"]),
        entityId: z.string().uuid(),
        exclude: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { setEntitySitemapExclusion } = await import("./sitemap-config.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await setEntitySitemapExclusion(context.supabase, merchantId, context.userId, data);
    return { ok: true as const };
  });
