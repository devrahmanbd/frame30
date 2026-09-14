/**
 * Phase 5 — RPC surface for the Site Kit desk.
 *
 * Thin *here only*. Module scope stays imports plus exported server-function
 * declarations, because server-function splitting deletes runtime siblings.
 * Every handler: validate with zod → resolve the caller's merchant → authorise
 * with a literal permission → delegate to `search-console.server.ts`, which
 * owns quota, retries, caching, auditing and the job log.
 *
 * Nothing here calls Google except the three functions that must (property
 * listing, manual refresh, URL inspection); reads answer from the snapshot.
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

const windowSchema = z.number().int().min(7).max(90).optional();

const siteKitSchema = z.object({
  verification: z
    .object({
      tokens: z.record(z.string(), z.string().max(200)).optional(),
      custom: z
        .array(z.object({ name: z.string().max(80), content: z.string().max(200) }))
        .max(20)
        .optional(),
    })
    .optional(),
  analytics: z
    .object({
      enabled: z.record(z.string(), z.string().max(60)).optional(),
      consentRequired: z.boolean().optional(),
    })
    .optional(),
  searchConsoleSiteUrl: z.string().max(300).nullable().optional(),
});

/** Everything the desk needs for its first paint. Snapshot rows only. */
export const siteKitStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ merchantId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadSiteKit, readConnection, jobHistory, siteKitConfigured } = await import(
      "./search-console.server"
    );
    const { analyticsBudgetKb, humaniseFailure, tagPlan } = await import("./search-console");
    const merchantId = data.merchantId ?? (await currentMerchantId(context.supabase, context.userId));

    const [settings, connection, jobs] = await Promise.all([
      loadSiteKit(context.supabase, merchantId),
      readConnection(context.supabase, merchantId).catch(() => null),
      jobHistory(context.supabase, merchantId, 20).catch(() => []),
    ]);

    return {
      merchantId,
      configured: siteKitConfigured(),
      settings,
      connection,
      jobs,
      plan: tagPlan(settings.analytics),
      budgetKb: analyticsBudgetKb(settings.analytics),
      // A banner is derived from the stored code, never from a live call, so an
      // outage cannot turn into "reconnect Google" advice.
      banner: connection?.last_error_code ? humaniseFailure(connection.last_error_code) : null,
    };
  });

/**
 * Lists the verified properties and matches them against this store's host.
 * Costs Google quota, so it is gated by `settings.update` and its own bucket.
 */
export const siteKitPropertiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("settings.update")])
  .inputValidator((d: unknown) =>
    z.object({ origin: originSchema, refresh: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listVerifiedProperties, resolvePropertyForStore } = await import("./search-console.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("gsc.properties", merchantId);
    const properties = await listVerifiedProperties(data.refresh === true);
    return { merchantId, properties, resolution: await resolvePropertyForStore(data.origin) };
  });

/** Saves verification tags, analytics ids and the chosen property. */
export const siteKitSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("settings.update")])
  .inputValidator((d: unknown) => z.object({ settings: siteKitSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveSiteKit } = await import("./search-console.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return saveSiteKit(context.supabase, merchantId, context.userId, data.settings);
  });

/** Performance cards for the selected window, read from the snapshot table. */
export const siteKitSnapshotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ days: windowSchema }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { snapshotCards } = await import("./search-console.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return snapshotCards(context.supabase, merchantId, data.days);
  });

/** Per-article search performance, matched by URL path suffix. */
export const siteKitArticlesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ days: windowSchema }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { articlePerformance } = await import("./search-console.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return articlePerformance(context.supabase, merchantId, data.days);
  });

/**
 * Manual refresh. Deliberately rate limited far below the cron cadence: the
 * button exists for "I just fixed my property", not for polling.
 */
export const siteKitRefreshFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("settings.update")])
  .inputValidator((d: unknown) => z.object({ days: windowSchema }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { refreshMerchant } = await import("./search-console.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("gsc.refresh", merchantId);
    return refreshMerchant({
      merchantId,
      trigger: "manual",
      requestedBy: context.userId,
      ...(data.days === undefined ? {} : { days: data.days }),
    });
  });

/**
 * Reads Google's index record for one URL. Not a live test, not an indexing
 * request — the API cannot do either, and the response says so.
 */
export const siteKitInspectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("settings.update")])
  .inputValidator((d: unknown) => z.object({ url: z.string().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { inspectUrl } = await import("./search-console.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return inspectUrl({ merchantId, url: data.url, requestedBy: context.userId });
  });
