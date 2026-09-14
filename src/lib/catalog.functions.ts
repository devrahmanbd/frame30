import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const merchantId = z.string().uuid();

export const catalogDeskFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCatalogDesk } = await import("./catalog.server");
    return loadCatalogDesk(context.supabase, data.merchantId);
  });

export const catalogDryRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId,
        fileName: z.string().min(1).max(200),
        sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
        rows: z.array(z.record(z.string(), z.string().max(4000))).min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { dryRunImport } = await import("./catalog.server");
    return dryRunImport(context.supabase, data.merchantId, {
      fileName: data.fileName,
      sourceHash: data.sourceHash,
      rows: data.rows,
    });
  });

export const catalogApplyImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId, jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { applyImport } = await import("./catalog.server");
    return applyImport(context.supabase, data.merchantId, data.jobId);
  });

export const catalogDiscardImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId, jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { discardImport } = await import("./catalog.server");
    return discardImport(context.supabase, data.merchantId, data.jobId);
  });

export const catalogSaveKindFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId,
        productId: z.string().uuid(),
        kind: z.enum(["physical", "digital", "service", "subscription"]),
        digital: z
          .object({
            fileName: z.string().min(1).max(200),
            storagePath: z.string().min(1).max(500),
            maxDownloads: z.number().int().min(1).max(100),
            expiryHours: z.number().int().min(1).max(8760),
          })
          .nullable()
          .optional(),
        service: z
          .object({
            durationMinutes: z.number().int().min(5).max(1440),
            bufferMinutes: z.number().int().min(0).max(480),
            capacityPerSlot: z.number().int().min(1).max(500),
            locationKind: z.enum(["onsite", "remote", "customer_address"]),
            advanceBookingDays: z.number().int().min(0).max(365),
            cancellationHours: z.number().int().min(0).max(720),
          })
          .nullable()
          .optional(),
        subscription: z
          .object({
            variantId: z.string().uuid(),
            intervalUnit: z.enum(["day", "week", "month", "year"]),
            intervalCount: z.number().int().min(1).max(24),
            trialDays: z.number().int().min(0).max(90),
            minimumCycles: z.number().int().min(1).max(60),
          })
          .nullable()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveKindConfig } = await import("./catalog.server");
    return saveKindConfig(context.supabase, data);
  });

export const catalogKindConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId, productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadKindConfig } = await import("./catalog.server");
    return loadKindConfig(context.supabase, data.merchantId, data.productId);
  });

export const catalogSaveDefinitionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId,
        id: z.string().uuid().optional(),
        ownerType: z.enum(["product", "variant", "collection", "order", "customer", "article"]),
        namespace: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
        key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
        label: z.string().min(1).max(80),
        valueType: z.enum(["text", "number", "boolean", "json", "url", "date"]),
        isRequired: z.boolean(),
        validation: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveMetafieldDefinition } = await import("./catalog.server");
    return saveMetafieldDefinition(context.supabase, data);
  });

export const catalogDeleteDefinitionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteMetafieldDefinition } = await import("./catalog.server");
    return deleteMetafieldDefinition(context.supabase, data.merchantId, data.id);
  });

export const catalogSaveRulesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId,
        collectionId: z.string().uuid(),
        isSmart: z.boolean(),
        rules: z.object({
          match: z.enum(["all", "any"]),
          conditions: z
            .array(
              z.object({
                field: z.enum([
                  "title",
                  "brand",
                  "category",
                  "price",
                  "stock",
                  "kind",
                  "tag",
                  "metafield",
                ]),
                op: z.string().min(1).max(20),
                value: z.string().max(200).optional(),
                key: z.string().max(40).optional(),
              }),
            )
            .max(20),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveCollectionRules } = await import("./catalog.server");
    return saveCollectionRules(context.supabase, data);
  });

export const catalogPreviewCollectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId, collectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { previewCollection } = await import("./catalog.server");
    return previewCollection(context.supabase, data.merchantId, data.collectionId);
  });

/** Round-trip CSV export of the merchant's catalog. */
export const catalogExportCsvFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { exportCatalogCsv } = await import("./catalog.server");
    return exportCatalogCsv(context.supabase, data.merchantId);
  });
