import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const kindSchema = z.enum(["theme", "widget"]);

export const marketCatalogFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .handler(async ({ context }) => {
    const { listCatalog, APP_VERSION } = await import("./marketplace.server");
    const merchantId = await scope(context.supabase, context.userId);
    return {
      merchantId,
      appVersion: APP_VERSION,
      ...(await listCatalog(context.supabase, merchantId)),
    };
  });

export const marketInstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        // UUIDs for marketplace rows, `preset:<key>` for official built-ins.
        listingId: z.string().min(1).max(80),
        trial: z.boolean().default(false),
        idempotencyKey: z.string().min(8).max(80),
        versionId: z.string().uuid().nullable().default(null),
        grantedScopes: z
          .array(z.string().trim().min(2).max(40))
          .max(20)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.install", merchantId);
    const { BUILTIN_PREFIX, APP_VERSION } =
      await import("./marketplace.server");
    const builtinSlug = data.listingId.startsWith(BUILTIN_PREFIX)
      ? data.listingId.slice(BUILTIN_PREFIX.length)
      : null;
    // Theme installs are first-class again (WordPress-parity lifecycle):
    // install creates an inactive store_themes row + ledger row, and the
    // Themes screen drives Activate / Live Preview / Delete.
    if (builtinSlug) {
      if (data.trial) throw new Error("market_trial_not_allowed");
      // QUBICKLE H1/H2: key-driven replay FIRST — the idempotency key is the
      // event identity. A reused key with a different builtin is a conflict,
      // never a silent replay of the wrong install.
      const { data: keyed } = await context.supabase
        .from("marketplace_installs")
        .select("id, kind, listing_slug")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (keyed) {
        const hit = keyed as unknown as {
          id: string;
          kind: string;
          listing_slug: string;
        };
        if (hit.kind !== data.kind || hit.listing_slug !== builtinSlug)
          throw new Error("market_idempotency_conflict");
        return {
          installId: hit.id,
          replayed: true,
          impacted: [] as string[],
          appVersion: APP_VERSION,
          themeApplied: null,
          themeNoticeKey: null,
        };
      }
      // Re-clicks and retries replay the original install instead of
      // stacking duplicate ledger rows (third-party installs get this
      // from the idempotency_key check inside installListing).
      //
      // B2: "paused" is a live install state (WP parity: deactivated but
      // present — see marketplace-badges.ts), so it replays here too. An
      // earlier revision only replayed installed/trial and stacked a
      // duplicate row when a merchant re-clicked a paused builtin.
      const { data: existing } = await context.supabase
        .from("marketplace_installs")
        .select("id")
        .eq("merchant_id", merchantId)
        .eq("kind", data.kind)
        .eq("listing_slug", builtinSlug)
        .in("status", ["installed", "trial", "paused"])
        .maybeSingle();
      if (existing) {
        return {
          installId: existing.id,
          replayed: true,
          impacted: [] as string[],
          appVersion: APP_VERSION,
          themeApplied: null,
          themeNoticeKey: null,
        };
      }
    }
    if (data.kind === "widget" && builtinSlug) {
      // QUBICKLE H1/H4: the builtin widget path lives in
      // marketplace-install.server.ts `installBuiltinWidget` — key-driven
      // replay, ledger-checked before the plugin write, ledger compensated
      // when the plugin write fails.
      const { installBuiltinWidget } =
        await import("./marketplace-install.server");
      return installBuiltinWidget(
        context.supabase,
        merchantId,
        data.kind,
        builtinSlug,
        data.idempotencyKey,
        context.userId,
      );
    }
    const { installListing } = await import("./marketplace-install.server");
    return installListing(context.supabase, merchantId, {
      ...data,
      consentedBy: context.userId,
    });
  });

/**
 * B2 — Upload Theme server path (M-04 / WF-23).
 *
 * The `Upload theme` drop-zone validated `.zip` files client-side only.
 * This is the working server path: authoritative archive checks + a new
 * inactive `store_themes` row (see installUploadedTheme), so every upload
 * lands where Activate / Live Preview / Delete already work.
 *
 * Placement note: this fn thematically belongs next to themeInstallFn in
 * `themes/appearance.functions.ts`, but that module is outside the B2 file
 * boundary — it lives here until a follow-up moves it next to the other
 * theme fns. The client drop-zone wiring (AddThemeScreen/ThemesScreen) is
 * likewise follow-up; the server path ships first so no button stays dead.
 *
 * Idempotency: the client mints ONE key per file-pick (crypto.randomUUID,
 * held across retries/double-clicks). Replays return the original row.
 */
export const themeUploadFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        fileName: z.string().trim().min(1).max(100),
        // Base64 of a zip bounded by MAX_THEME_UPLOAD_BYTES server-side;
        // the transport cap here only stops absurd payloads early.
        fileBase64: z.string().min(1).max(30_000_000),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.install", merchantId);
    const { installUploadedTheme } = await import("./themes/appearance.server");
    return installUploadedTheme(
      context.supabase,
      merchantId,
      data,
      context.userId,
    );
  });

export const marketInstallStatusFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
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
    return setInstallStatus(
      context.supabase,
      merchantId,
      data.installId,
      data.status,
      context.userId,
    );
  });

/**
 * WordPress-style bulk actions on installs. Applies per row and reports each
 * result — one bad row (unknown id, active theme, unlinked install) never
 * aborts the rest of the batch.
 */
export const marketBulkInstallsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        installIds: z.array(z.string().uuid()).min(1).max(50),
        action: z.enum(["enable", "pause", "delete"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { bulkInstallStatus } = await import("./marketplace-install.server");
    const merchantId = await scope(context.supabase, context.userId);
    return bulkInstallStatus(
      context.supabase,
      merchantId,
      context.userId,
      data.installIds,
      data.action,
    );
  });

/** WordPress-style plugin uninstall: removes the plugin row, retires the ledger row. */
export const marketUninstallWidgetFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ installId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { uninstallWidgetInstall } =
      await import("./marketplace-install.server");
    const merchantId = await scope(context.supabase, context.userId);
    return uninstallWidgetInstall(
      context.supabase,
      merchantId,
      data.installId,
      context.userId,
    );
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
    return saveListing(
      context.supabase,
      merchantId,
      {
        ...data,
        id: data.id ?? null,
        description: data.description ?? null,
      },
      context.userId,
    );
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
    return sellerTransition(
      context.supabase,
      merchantId,
      data.kind,
      data.id,
      data.status,
      context.userId,
    );
  });

export const marketModerationFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listModeration, isPlatformAdmin } =
      await import("./marketplace.server");
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
    return moderate(
      context.supabase,
      data.kind,
      data.id,
      data.status,
      context.userId,
    );
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
        version: z
          .string()
          .trim()
          .regex(/^\d+\.\d+\.\d+$/),
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
    return {
      merchantId,
      ...(await listVersions(context.supabase, merchantId)),
    };
  });

export const marketVersionQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isPlatformAdmin } = await import("./marketplace.server");
    const { listReviewQueue } = await import("./marketplace-vault.server");
    if (!(await isPlatformAdmin(context.supabase, context.userId)))
      return { admin: false, versions: [] };
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
    if (!(await isPlatformAdmin(context.supabase, context.userId)))
      throw new Error("market_forbidden");
    await rateLimit("market.moderate", context.userId);
    return reviewVersion(
      context.supabase,
      data.versionId,
      data.status,
      data.note,
    );
  });

export const marketListingVersionsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.read")])
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
  .middleware([requirePermission("themes.read")])
  .handler(async ({ context }) => {
    const { entitledBlocks } = await import("./marketplace-vault.server");
    const { lapseExpiredTrials } = await import("./marketplace-install.server");
    const merchantId = await scope(context.supabase, context.userId);
    // QUBICKLE H5: entitledBlocks (vault-owned, untouched here) only admits
    // installed/trial rows — parking expired trials on terminal `lapsed`
    // first is what enforces expiry on this read path.
    await lapseExpiredTrials(context.supabase, merchantId);
    return {
      merchantId,
      ...(await entitledBlocks(context.supabase, merchantId)),
    };
  });

export const marketPayoutsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { payoutOverview } = await import("./marketplace-vault.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.read", merchantId);
    return {
      merchantId,
      ...(await payoutOverview(context.supabase, merchantId)),
    };
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
    if (!(await isPlatformAdmin(context.supabase, context.userId)))
      throw new Error("market_forbidden");
    await rateLimit("market.payout", context.userId);
    return settlePayout(
      context.supabase,
      data.payoutId,
      data.outcome,
      data.reference,
      data.reason,
    );
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
    return submitReview(
      context.supabase,
      data.installId,
      data.rating,
      data.comment,
    );
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
