/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

const entityType = z.enum(["store", "product", "collection", "page", "article"]);

const faqSchema = z
  .array(z.object({ q: z.string().max(400), a: z.string().max(2000) }))
  .max(24)
  .default([]);

const saveSchema = z.object({
  entityType,
  entityId: z.string().uuid().nullable(),
  metaTitle: z.string().max(300).default(""),
  metaDescription: z.string().max(600).default(""),
  canonical: z.string().max(500).default(""),
  robotsIndex: z.boolean().default(true),
  robotsFollow: z.boolean().default(true),
  ogImageUrl: z.string().max(500).default(""),
  focusKeyword: z.string().max(120).default(""),
  secondaryKeywords: z.array(z.string().max(120)).max(8).default([]),
  faq: faqSchema,
  url: z.string().max(500).optional(),
  locale: z.enum(["en", "bn"]).optional(),
  content: z.string().max(20000).optional(),
  fallbackTitle: z.string().max(300).optional(),
  fallbackDescription: z.string().max(600).optional(),
});

export const seoIndexFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listSeoEntities, listSeoAudit } = await import("./seo.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `${merchantId}:${context.userId}`);
    const [entities, audit] = await Promise.all([
      listSeoEntities(context.supabase, merchantId),
      listSeoAudit(context.supabase, merchantId),
    ]);
    return { entities, audit };
  });

export const seoLoadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ entityType, entityId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadSeoMeta } = await import("./seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return loadSeoMeta(context.supabase, merchantId, data.entityType, data.entityId);
  });

export const seoSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveSeoMeta } = await import("./seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return saveSeoMeta(context.supabase, merchantId, context.userId, data);
  });

export const consentLedgerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { consentLedger } = await import("./consent.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return consentLedger(context.supabase, merchantId);
  });

/** Merchant-side consent correction (support call, paper form). Always audited. */
export const consentRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subscriberId: z.string().uuid(),
        channel: z.enum(["email", "sms", "push"]),
        purpose: z.enum(["marketing", "cart_recovery", "stock_alerts"]),
        granted: z.boolean(),
        reason: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { recordConsent } = await import("./consent.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("consent.record", `${merchantId}:${context.userId}`);

    const { data: subscriber } = await (context.supabase as any)
      .from("subscribers")
      .select("id, email, phone")
      .eq("id", data.subscriberId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!subscriber) throw new Error("Subscriber not found");

    return recordConsent({
      merchantId,
      channel: data.channel,
      purpose: data.purpose,
      granted: data.granted,
      source: "admin_console",
      subscriberId: subscriber.id,
      contact: data.channel === "sms" ? subscriber.phone : subscriber.email,
      actor: context.userId,
      reason: data.reason ?? "merchant_update",
    });
  });

/* ------------------- Phase 7.4 — templates & redirect manager -------------- */

const templateType = z.enum(["product", "collection", "page", "article"]);

export const seoTemplatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listSeoTemplates, listRedirects } = await import("./seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const [templates, redirects] = await Promise.all([
      listSeoTemplates(context.supabase, merchantId),
      listRedirects(context.supabase, merchantId),
    ]);
    return { templates, redirects };
  });

export const seoTemplateSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entityType: templateType,
        titleTemplate: z.string().max(300).default(""),
        descriptionTemplate: z.string().max(600).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveSeoTemplate } = await import("./seo.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.write", `${merchantId}:${context.userId}`);
    return saveSeoTemplate(context.supabase, merchantId, context.userId, data);
  });

export const seoRedirectSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fromPath: z.string().min(1).max(500),
        toPath: z.string().max(500).default(""),
        status: z.union([z.literal(301), z.literal(410)]).default(301),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { createRedirect } = await import("./seo.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.write", `${merchantId}:${context.userId}`);
    return createRedirect(context.supabase, merchantId, data);
  });

export const seoRedirectDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { deleteRedirect } = await import("./seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await deleteRedirect(context.supabase, merchantId, data.id);
    return { ok: true };
  });


/* --------------------- Phase 2 — bulk editing & the gate ------------------- */

const bulkQuery = z.object({
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  search: z.string().max(120).default(""),
  type: z.union([entityType, z.literal("all")]).default("all"),
  state: z.enum(["all", "missing_title", "missing_description", "noindex", "poor"]).default("all"),
  sort: z.enum(["label", "score", "type"]).default("label"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

/** One paginated page of the bulk table. Read-limited, never N+1. */
export const seoBulkFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) => bulkQuery.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listSeoBulk } = await import("./seo.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `${merchantId}:${context.userId}`);
    return listSeoBulk(context.supabase, merchantId, data);
  });

/** Inline edits from the bulk grid: capped at 50 rows, one audited round-trip. */
export const seoBulkSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        edits: z
          .array(
            z.object({
              entityType,
              entityId: z.string().uuid().nullable(),
              metaTitle: z.string().max(300).default(""),
              metaDescription: z.string().max(600).default(""),
              robotsIndex: z.boolean().default(true),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveSeoBulk } = await import("./seo.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return saveSeoBulk(context.supabase, merchantId, context.userId, data.edits);
  });

/**
 * Advisory read of the publish gate, so the editor can show the blocking
 * reasons *before* the merchant hits publish rather than after the error.
 */
export const seoGateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z
      .object({
        entityType,
        entityId: z.string().uuid().nullable(),
        title: z.string().max(300).optional(),
        description: z.string().max(600).optional(),
        canonical: z.string().max(500).optional(),
        robotsIndex: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { evaluateSeoPublishGate } = await import("./seo.server");
    const { requestOrigin } = await import("./site-origin.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.read", `${merchantId}:${context.userId}`);
    return evaluateSeoPublishGate(context.supabase, merchantId, {
      ...data,
      origin: requestOrigin() ?? "https://example.invalid",
    });
  });
