/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const startCharge = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        orderId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const { openCharge } = await import("./payments.server");
    const host = getRequestHost();
    const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
    return openCharge(data.slug, data.orderId, data.idempotencyKey, origin, data.slug);
  });

export const loadPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadPaymentsDesk } = await import("./payments.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return loadPaymentsDesk(context.supabase, merchantId);
  });

export const openRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        amountMinor: z.number().int().positive().max(100_000_000),
        reason: z.string().min(4).max(300),
        refundKey: z.string().min(8).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requestRefund } = await import("./payments.server");
    return requestRefund(
      context.supabase,
      data.orderId,
      data.amountMinor,
      data.reason,
      data.refundKey,
      context.userId,
    );
  });

export const stepRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        refundId: z.string().uuid(),
        to: z.enum(["approved", "processing", "settled", "failed", "declined"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceRefund } = await import("./payments.server");
    return advanceRefund(context.supabase, data.refundId, data.to);
  });

export const reconcileCodOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        collectedMinor: z.number().int().min(0).max(100_000_000),
        carrierCode: z.string().max(40).optional(),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { reconcileCod } = await import("./payments.server");
    return reconcileCod(
      context.supabase,
      data.orderId,
      data.collectedMinor,
      data.carrierCode ?? null,
      data.note ?? null,
    );
  });

export const clearCod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ reconId: z.string().uuid(), note: z.string().min(4).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { clearCodVariance } = await import("./payments.server");
    return clearCodVariance(context.supabase, data.reconId, data.note);
  });

export const uploadSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        provider: z.enum(["bkash", "nagad", "rocket", "bank"]),
        fileDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        csv: z.string().min(3).max(200_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { parseSettlementCsv } = await import("./settlement-csv");
    const { ingestSettlement } = await import("./payments.server");
    const { createHash } = await import("crypto");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const items = parseSettlementCsv(data.csv);
    const hash = createHash("sha256").update(data.csv).digest("hex");
    return ingestSettlement(merchantId, data.provider, data.fileDate, hash, items);
  });

export const postSettlementFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { postSettlement } = await import("./payments.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    // Ownership check through the member-scoped client before privileged posting.
    const { data: file } = await (context.supabase as any)
      .from("settlement_files")
      .select("id")
      .eq("id", data.fileId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!file) throw new Error("Settlement file not found for this store");
    return postSettlement(data.fileId);
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ alertId: z.string().uuid(), note: z.string().min(4).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { resolveSettlementAlert } = await import("./payments.server");
    return resolveSettlementAlert(context.supabase, data.alertId, data.note);
  });
