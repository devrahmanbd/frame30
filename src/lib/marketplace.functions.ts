import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const kindSchema = z.enum(["theme", "widget"]);

export const marketCatalogFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCatalog, APP_VERSION } = await import("./marketplace.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, appVersion: APP_VERSION, ...(await listCatalog(context.supabase, merchantId)) };
  });

export const marketInstallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        // UUIDs for marketplace rows, `preset:<key>` for official built-ins.
        listingId: z.string().min(1).max(80),
        trial: z.boolean().default(false),
        idempotencyKey: z.string().min(8).max(80),
        versionId: z.string().uuid().nullable().default(null),
        grantedScopes: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.install", merchantId);
    const { BUILTIN_PREFIX, APP_VERSION } = await import("./marketplace.server");
    if (data.kind === "theme" && data.listingId.startsWith(BUILTIN_PREFIX)) {
      if (data.trial) throw new Error("market_trial_not_allowed");
      const key = data.listingId.slice(BUILTIN_PREFIX.length);
      const { installRegistryTheme } = await import("./themes.server");
      const { THEME_PRESETS } = await import("./theme-presets");
      const preset = THEME_PRESETS.find((p) => p.key === key);
      const { versionId } = await installRegistryTheme(context.supabase, merchantId, key);

      // Record in marketplace_installs so My Installs and badges track it
      const { data: installRecord } = await context.supabase
        .from("marketplace_installs")
        .insert({
          merchant_id: merchantId,
          kind: "theme",
          theme_id: null,
          widget_id: null,
          listing_slug: key,
          listing_name: preset?.nameEn ?? key,
          version: preset?.version ?? "1.0.0",
          version_id: versionId,
          granted_scopes: [],
          consented_at: new Date().toISOString(),
          consented_by: context.userId,
          price_minor_int: 0,
          currency_code: "BDT",
          is_trial: false,
          status: "installed",
          idempotency_key: data.idempotencyKey,
        })
        .select("id")
        .maybeSingle();

      return {
        installId: installRecord?.id ?? versionId,
        replayed: false,
        impacted: [] as string[],
        appVersion: APP_VERSION,
        themeApplied: true,
        themeNoticeKey: "marketplace.theme.applied",
      };
    }

    if (data.kind === "widget" && data.listingId.startsWith(BUILTIN_PREFIX)) {
      if (data.trial) throw new Error("market_trial_not_allowed");
      const pluginId = data.listingId.slice(BUILTIN_PREFIX.length);
      const { getBuiltinPlugin } = await import("./builtin-plugins");
      const pluginDef = getBuiltinPlugin(pluginId);
      if (!pluginDef) throw new Error("market_listing_not_found");

      // Record in marketplace_installs
      const { data: installRecord } = await context.supabase
        .from("marketplace_installs")
        .insert({
          merchant_id: merchantId,
          kind: "widget",
          theme_id: null,
          widget_id: null,
          listing_slug: pluginId,
          listing_name: pluginDef.manifest.name,
          version: pluginDef.manifest.version,
          version_id: null,
          granted_scopes: pluginDef.manifest.permissions,
          consented_at: new Date().toISOString(),
          consented_by: context.userId,
          price_minor_int: 0,
          currency_code: "BDT",
          is_trial: false,
          status: "installed",
          idempotency_key: data.idempotencyKey,
        })
        .select("id")
        .maybeSingle();

      // Activate into plugin_state for the storefront and builder
      const { upsertPlugin } = await import("./plugins.server");
      await upsertPlugin(context.supabase, merchantId, {
        manifest: pluginDef.manifest,
        grantedScopes: pluginDef.manifest.permissions,
        installId: installRecord?.id ?? null,
      });

      return {
        installId: installRecord?.id ?? pluginId,
        replayed: false,
        impacted: [] as string[],
        appVersion: APP_VERSION,
        themeApplied: null,
        themeNoticeKey: null,
      };
    }
    const { installListing } = await import("./marketplace-install.server");
    return installListing(context.supabase, merchantId, { ...data, consentedBy: context.userId });
  });

export const marketInstallStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        installId: z.string().uuid(),
        status: z.enum(["paused", "installed", "rolled_back"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setInstallStatus } = await import("./marketplace-install.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setInstallStatus(context.supabase, merchantId, data.installId, data.status);
  });

export const marketMineFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMine } = await import("./marketplace.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await listMine(context.supabase, merchantId)) };
  });

export const marketSaveListingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        kind: kindSchema,
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9-]+$/),
        description: z.string().trim().max(500).nullable().optional(),
        category: z.string().trim().min(2).max(40).default("general"),
        version: z.string().trim().max(20).default("1.0.0"),
        priceMinor: z.number().int().min(0).max(100_000_000),
        trialAllowed: z.boolean().default(false),
        manifest: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveListing } = await import("./marketplace-install.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveListing(context.supabase, merchantId, {
      ...data,
      id: data.id ?? null,
      description: data.description ?? null,
    });
  });

export const marketListingStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        id: z.string().uuid(),
        status: z.enum(["review", "active", "paused", "archived"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { sellerTransition } = await import("./marketplace-install.server");
    const merchantId = await scope(context.supabase, context.userId);
    return sellerTransition(context.supabase, merchantId, data.kind, data.id, data.status);
  });

export const marketModerationFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listModeration, isPlatformAdmin } = await import("./marketplace.server");
    const admin = await isPlatformAdmin(context.supabase, context.userId);
    if (!admin) return { admin: false, listings: [] };
    return { admin: true, listings: await listModeration(context.supabase) };
  });

export const marketModerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        id: z.string().uuid(),
        status: z.enum(["active", "paused", "draft"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isPlatformAdmin } = await import("./marketplace.server");
    const { moderate } = await import("./marketplace-install.server");
    if (!(await isPlatformAdmin(context.supabase, context.userId)))
      throw new Error("market_forbidden");
    return moderate(context.supabase, data.kind, data.id, data.status);
  });

// ------------------------------------------------------------- §3.3 ecosystem

const scopeListSchema = z.array(z.string().trim().min(2).max(40)).max(20);

export const marketPublishVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        listingId: z.string().uuid(),
        version: z.string().trim().regex(/^\d+\.\d+\.\d+$/),
        changelog: z.string().trim().max(1000).nullable().default(null),
        scopes: scopeListSchema,
        source: z.record(z.string(), z.unknown()),
        blocks: z
          .array(
            z.object({
              blockKey: z.string().trim().min(2).max(40),
              name: z.string().trim().min(2).max(80),
              target: z.string().trim().min(2).max(20),
              schema: z.record(z.string(), z.unknown()).default({}),
              entry: z.string().max(200_000).nullable().default(null),
            }),
          )
          .max(20)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { publishVersion } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.publish", merchantId);
    return publishVersion(context.supabase, merchantId, data);
  });

export const marketVersionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { listVersions } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.read", merchantId);
    return { merchantId, ...(await listVersions(context.supabase, merchantId)) };
  });

export const marketVersionQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isPlatformAdmin } = await import("./marketplace.server");
    const { listReviewQueue } = await import("./marketplace-vault.server");
    if (!(await isPlatformAdmin(context.supabase, context.userId))) return { admin: false, versions: [] };
    return { admin: true, versions: await listReviewQueue(context.supabase) };
  });

export const marketReviewVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        versionId: z.string().uuid(),
        status: z.enum(["active", "paused", "archived"]),
        note: z.string().trim().max(500).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { isPlatformAdmin } = await import("./marketplace.server");
    const { reviewVersion } = await import("./marketplace-vault.server");
    if (!(await isPlatformAdmin(context.supabase, context.userId))) throw new Error("market_forbidden");
    await rateLimit("market.moderate", context.userId);
    return reviewVersion(context.supabase, data.versionId, data.status, data.note);
  });

export const marketListingVersionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: kindSchema, listingId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { installableVersions } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.read", merchantId);
    return installableVersions(context.supabase, data.kind, data.listingId);
  });

export const marketAppBlocksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { entitledBlocks } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await entitledBlocks(context.supabase, merchantId)) };
  });

export const marketPayoutsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { payoutOverview } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.read", merchantId);
    return { merchantId, ...(await payoutOverview(context.supabase, merchantId)) };
  });

export const marketPayoutAccrueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { accruePayout } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.payout", merchantId);
    return accruePayout(context.supabase, merchantId);
  });

export const marketPayoutSettleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payoutId: z.string().uuid(),
        outcome: z.enum(["processing", "paid", "failed"]),
        reference: z.string().trim().max(80).nullable().default(null),
        reason: z.string().trim().max(200).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { isPlatformAdmin } = await import("./marketplace.server");
    const { settlePayout } = await import("./marketplace-vault.server");
    if (!(await isPlatformAdmin(context.supabase, context.userId))) throw new Error("market_forbidden");
    await rateLimit("market.payout", context.userId);
    return settlePayout(context.supabase, data.payoutId, data.outcome, data.reference, data.reason);
  });

export const marketSubmitReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        installId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(600).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { submitReview } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.review", merchantId);
    return submitReview(context.supabase, data.installId, data.rating, data.comment);
  });

export const marketMyReviewsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ installIds: z.array(z.string().uuid()).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { listReviews } = await import("./marketplace-vault.server");
    return { reviews: await listReviews(context.supabase, data.installIds) };
  });
