import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const money = z.number().int().min(0).max(1_000_000_000);

export const posBootstrap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentShift, listPosOrders } = await import("./pos.server");
    const { listCarriers } = await import("./courier.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const [shift, orders, carriers] = await Promise.all([
      currentShift(context.supabase, merchantId, context.userId),
      listPosOrders(context.supabase, merchantId),
      listCarriers(context.supabase, merchantId),
    ]);
    return { merchantId, ...shift, orders, carriers };
  });

export const openShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ startingCashMinorInt: money, note: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { openShift } = await import("./pos.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return openShift(
      context.supabase,
      merchantId,
      context.userId,
      data.startingCashMinorInt,
      data.note,
    );
  });

export const closeShiftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), actualCashMinorInt: money }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { closeShift } = await import("./pos.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return closeShift(context.supabase, merchantId, data.sessionId, data.actualCashMinorInt);
  });

const lineSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

const captureSchema = z.object({
  clientId: z.string().min(8).max(64),
  sessionId: z.string().uuid().nullable().optional(),
  origin: z.enum(["offline", "online"]),
  tenders: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "cod"]),
        amountMinorInt: money,
        tenderedMinorInt: money.optional(),
        authCode: z.string().max(40).nullable().optional(),
      }),
    )
    .min(1)
    .max(4),
  discountMinorInt: money,
  customerName: z.string().max(120).nullable().optional(),
  customerPhone: z.string().max(30).nullable().optional(),
  addressLine: z.string().max(240).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  capturedAt: z.string().max(40).nullable().optional(),
  lines: z.array(lineSchema).min(1).max(100),
});

export const capturePosOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => captureSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { capturePosOrder, recordFailure } = await import("./pos.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    try {
      return await capturePosOrder(context.supabase, merchantId, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      await recordFailure(context.supabase, merchantId, data.clientId, message);
      throw error;
    }
  });

export const refundPosOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        posOrderId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(64),
        amountMinorInt: money,
        method: z.enum(["cash", "card", "cod"]),
        reason: z.string().max(200).nullable().optional(),
        restock: z.boolean(),
        lines: z.array(lineSchema).max(100).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { refundPosOrder } = await import("./pos.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return refundPosOrder(context.supabase, merchantId, context.userId, data);
  });

export const shiftReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { shiftReport } = await import("./pos.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return shiftReport(context.supabase, merchantId, data.sessionId);
  });

export const lookupBarcodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(2).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { lookupBarcode } = await import("./pos.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return lookupBarcode(context.supabase, merchantId, data.code);
  });


export const listShipmentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listShipments, listCarriers } = await import("./courier.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const [shipments, carriers] = await Promise.all([
      listShipments(context.supabase, merchantId),
      listCarriers(context.supabase, merchantId),
    ]);
    return { shipments, carriers };
  });

export const createShipmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid().nullable().optional(),
        posOrderId: z.string().uuid().nullable().optional(),
        carrierCode: z.string().min(2).max(40),
        weightGrams: z.number().int().min(1).max(50_000),
        isCod: z.boolean(),
        codAmountMinorInt: money,
        addressLine: z.string().max(240).nullable().optional(),
        city: z.string().max(80).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createShipment } = await import("./courier.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return createShipment(context.supabase, merchantId, data);
  });

export const advanceShipmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        shipmentId: z.string().uuid(),
        target: z.enum([
          "pickup_scheduled",
          "picked_up",
          "in_transit",
          "out_for_delivery",
          "delivered",
          "failed_attempt",
          "returned",
        ]),
        signatureText: z.string().max(160).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceShipment } = await import("./courier.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return advanceShipment(
      context.supabase,
      merchantId,
      data.shipmentId,
      data.target,
      data.signatureText,
    );
  });

export const retryRateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { retryRate } = await import("./courier.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return retryRate(context.supabase, merchantId, data.shipmentId);
  });

export const generateLabelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateLabel } = await import("./courier.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return generateLabel(context.supabase, merchantId, data.shipmentId);
  });
