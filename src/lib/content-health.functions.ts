/**
 * Phase 6 — content health RPCs.
 *
 * Thin by design and by rule: every handler authorises, rate-limits, resolves
 * the tenant, then delegates to `content-health.server.ts`. No domain logic
 * lives here, and nothing in this module is importable from the storefront.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";
import { FINDING_CODES } from "./content-health";

const findingCode = z.enum(FINDING_CODES as unknown as [string, ...string[]]);
const entityType = z.enum(["article", "page", "product", "collection"]);

/** Maps runtime failures onto messages a merchant can act on. */
async function friendly(err: unknown): Promise<never> {
  const { ContentHealthError } = await import("./content-health.server");
  const { RateLimitError } = await import("./rate-limit.server");
  if (err instanceof RateLimitError) {
    throw new Error("Too many content scans. Wait a few minutes and try again.");
  }
  if (err instanceof ContentHealthError) {
    switch (err.code) {
      case "scan_busy":
        throw new Error("A content scan is already running for this store. Give it a minute.");
      case "merchant_not_found":
        throw new Error("This store is not set up yet.");
      case "not_found":
        throw new Error("That item no longer exists — refresh the list.");
      default:
        throw new Error("The content scan could not finish. Try again shortly.");
    }
  }
  const { captureError } = await import("./observability.server");
  void captureError(err, { scope: "content.health.rpc" });
  throw new Error("Something went wrong reading content health.");
}

export const contentHealthStateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadContentHealthState } = await import("./content-health.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      const merchantId = await currentMerchantId(context.supabase, context.userId);
      await enforceRateLimit("content.health_read", `${merchantId}:${context.userId}`);
      return await loadContentHealthState(context.supabase, merchantId);
    } catch (err) {
      return friendly(err);
    }
  });

export const contentHealthFindingsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        state: z.enum(["open", "ignored", "resolved", "all"]).default("open"),
        code: z.union([findingCode, z.literal("all")]).default("all"),
        severity: z.enum(["error", "warning", "notice", "all"]).default("all"),
        entityType: z.union([entityType, z.literal("all")]).default("all"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).max(10_000).default(0),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadFindings } = await import("./content-health.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      const merchantId = await currentMerchantId(context.supabase, context.userId);
      await enforceRateLimit("content.health_read", `${merchantId}:${context.userId}`);
      return await loadFindings(context.supabase, merchantId, data as never);
    } catch (err) {
      return friendly(err);
    }
  });

export const contentHealthRunFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ checkExternal: z.boolean().default(true) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { runContentHealthScan } = await import("./content-health.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      const merchantId = await currentMerchantId(context.supabase, context.userId);
      await enforceRateLimit("content.health_run", `${merchantId}:${context.userId}`);
      return await runContentHealthScan({
        merchantId,
        trigger: "manual",
        requestedBy: context.userId,
        checkExternal: data.checkExternal,
      });
    } catch (err) {
      return friendly(err);
    }
  });

export const contentHealthTriageFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z.object({ findingId: z.string().uuid(), state: z.enum(["open", "ignored"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { setFindingState } = await import("./content-health.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      const merchantId = await currentMerchantId(context.supabase, context.userId);
      await enforceRateLimit("content.health_triage", `${merchantId}:${context.userId}`);
      return await setFindingState(context.supabase, merchantId, data.findingId, data.state, context.userId);
    } catch (err) {
      return friendly(err);
    }
  });

export const contentLinkSuggestionsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().nullish(),
        title: z.string().max(500).default(""),
        body: z.string().max(400_000).default(""),
        focusKeyword: z.string().max(200).optional(),
        tags: z.array(z.string().max(80)).max(50).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { suggestLinksForDraft } = await import("./content-health.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      const merchantId = await currentMerchantId(context.supabase, context.userId);
      await enforceRateLimit("content.health_suggest", `${merchantId}:${context.userId}`);
      const { limit, ...draft } = data;
      return await suggestLinksForDraft(context.supabase, merchantId, draft as never, limit);
    } catch (err) {
      return friendly(err);
    }
  });

export const contentSchemaReportFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ entityId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { schemaReportFor } = await import("./content-health.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      const merchantId = await currentMerchantId(context.supabase, context.userId);
      await enforceRateLimit("content.health_read", `${merchantId}:${context.userId}`);
      return await schemaReportFor(context.supabase, merchantId, data.entityId);
    } catch (err) {
      return friendly(err);
    }
  });
