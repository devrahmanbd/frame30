/**
 * Phase 3 — RPC surface for the permalink desk.
 *
 * Thin by design *here only*: every handler validates input with zod, resolves
 * the caller's merchant, enforces a marketing permission, and delegates to
 * `permalink.server.ts`, which owns the batching, rate limits, auditing and
 * cache invalidation. Keeping runtime logic out of this module is also a hard
 * requirement of server-function splitting — module scope must stay imports
 * plus exported declarations.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";
import type { PermalinkSettings } from "./permalink";

const kind = z.enum(["article", "product", "collection", "page"]);
const statusCode = z.union([z.literal(301), z.literal(302), z.literal(410)]);

const settingsSchema = z.object({
  articleBase: z.string().max(120).default("/blog"),
  articlePattern: z.string().max(120).default("/%slug%"),
  productBase: z.string().max(120).default("/p"),
  collectionBase: z.string().max(120).default("/c"),
  pageBase: z.string().max(120).default("/pages"),
});

export const permalinkStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadPermalinkSettings, listRedirectsPage, listMissingPaths } = await import(
      "./permalink.server"
    );
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `permalinks:${merchantId}:${context.userId}`);
    const [settings, redirects, missing] = await Promise.all([
      loadPermalinkSettings(context.supabase, merchantId),
      listRedirectsPage(context.supabase, merchantId, { page: 1, pageSize: 50 }),
      listMissingPaths(context.supabase, merchantId, 100),
    ]);
    return { settings, redirects, missing };
  });

export const permalinkPreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) => settingsSchema.partial().parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { previewPermalinkChange } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const plan = await previewPermalinkChange(context.supabase, merchantId, data as Partial<PermalinkSettings>);
    // The full move list can be tens of thousands of rows; the client only
    // ever renders the sample and the counts.
    const { moves: _moves, ...wire } = plan;
    return wire;
  });

export const permalinkApplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { applyPermalinkChange } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return applyPermalinkChange(context.supabase, merchantId, context.userId, data as Partial<PermalinkSettings>);
  });

export const permalinkSlugCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({ kind, slug: z.string().max(200), excludeId: z.string().uuid().nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { checkSlug } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return checkSlug(context.supabase, merchantId, {
      kind: data.kind,
      slug: data.slug,
      excludeId: data.excludeId ?? null,
    });
  });

export const redirectListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        origin: z.string().max(40).optional(),
        status: z.union([statusCode, z.literal("all")]).optional(),
        page: z.number().int().min(1).max(1000).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listRedirectsPage } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return listRedirectsPage(context.supabase, merchantId, data);
  });

export const redirectSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        fromPath: z.string().min(1).max(500),
        toPath: z.string().max(500).default(""),
        status: statusCode.default(301),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { upsertRedirect } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return upsertRedirect(context.supabase, merchantId, context.userId, data);
  });

export const redirectDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { deleteRedirects } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const deleted = await deleteRedirects(context.supabase, merchantId, context.userId, data.ids);
    return { deleted };
  });

export const redirectImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ csv: z.string().max(2_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { importRedirectCsv } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return importRedirectCsv(context.supabase, merchantId, context.userId, data.csv);
  });

export const redirectExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.read")])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { exportRedirectCsv } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return { csv: await exportRedirectCsv(context.supabase, merchantId) };
  });

export const missingResolveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        toPath: z.string().max(500).default(""),
        status: statusCode.default(301),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { resolveMissingPath } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return resolveMissingPath(context.supabase, merchantId, context.userId, data);
  });

export const missingDismissFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { dismissMissingPath } = await import("./permalink.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await dismissMissingPath(context.supabase, merchantId, data.id);
    return { ok: true as const };
  });
