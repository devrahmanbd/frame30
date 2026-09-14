import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Growth + digital-fulfilment RPC surface (§4.3).
 *
 * Thin by design: every handler authenticates, resolves the caller's merchant
 * server-side (never trusting a merchant id from the client) and delegates to
 * the service layer, which owns rate limiting, auditing, encryption and
 * observability.
 */
async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

/* --------------------------------------------------------------- loyalty desk */

export const growthDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadGrowthDesk } = await import("./loyalty.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await loadGrowthDesk(context.supabase, merchantId)) };
  });

export const growthSaveSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        loyaltyEnabled: z.boolean().optional(),
        referralEnabled: z.boolean().optional(),
        affiliateEnabled: z.boolean().optional(),
        loyalty: z.record(z.string(), z.unknown()).optional(),
        referral: z.record(z.string(), z.unknown()).optional(),
        affiliate: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveSettings } = await import("./loyalty.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveSettings(context.supabase, merchantId, context.userId, data as never);
  });

export const growthAdjustPointsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        customerId: z.string().uuid(),
        points: z.number().int().min(-1_000_000).max(1_000_000),
        reason: z.string().trim().min(3).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { adjustPoints } = await import("./loyalty.server");
    const merchantId = await scope(context.supabase, context.userId);
    return adjustPoints(context.supabase, merchantId, context.userId, data);
  });

export const growthDecideReferralFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        referralId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { decideReferral } = await import("./loyalty.server");
    const merchantId = await scope(context.supabase, context.userId);
    return decideReferral(context.supabase, merchantId, context.userId, {
      referralId: data.referralId,
      approve: data.decision === "approve",
      reason: data.reason ?? (data.decision === "approve" ? "approved by staff" : "rejected by staff"),
    });
  });

export const growthSaveAffiliateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        displayName: z.string().trim().min(2).max(120),
        slug: z.string().trim().min(3).max(40).optional(),
        contactEmail: z.string().trim().email().max(200).nullable().optional(),
        contactPhone: z.string().trim().max(30).nullable().optional(),
        commissionBps: z.number().int().min(0).max(10_000).optional(),
        state: z.enum(["pending", "active", "paused", "banned"]).optional(),
        reason: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { upsertAffiliate } = await import("./loyalty.server");
    const merchantId = await scope(context.supabase, context.userId);
    return upsertAffiliate(context.supabase, merchantId, context.userId, data);
  });


export const growthPayCommissionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        affiliateId: z.string().uuid(),
        commissionIds: z.array(z.string().uuid()).min(1).max(500),
        reference: z.string().trim().min(2).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { markCommissionsPaid } = await import("./loyalty.server");
    const merchantId = await scope(context.supabase, context.userId);
    return markCommissionsPaid(context.supabase, merchantId, context.userId, data);
  });

/* --------------------------------------------------------- virtual fulfilment */

export const virtualPoolsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadPools, loadDeliveries } = await import("./virtual-delivery.server");
    const merchantId = await scope(context.supabase, context.userId);
    const [pools, deliveries] = await Promise.all([
      loadPools(context.supabase, merchantId),
      loadDeliveries(context.supabase, merchantId),
    ]);
    return { merchantId, pools, deliveries };
  });

export const virtualSavePoolFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        productId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).max(80),
        instructions: z.string().trim().max(2000).nullable().optional(),
        instructionsBn: z.string().trim().max(2000).nullable().optional(),
        lowStockThreshold: z.number().int().min(0).max(10_000),
        autoDeliver: z.boolean(),
        channels: z.array(z.enum(["email", "sms"])).min(1).max(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { savePool } = await import("./virtual-delivery.server");
    const merchantId = await scope(context.supabase, context.userId);
    return savePool(context.supabase, merchantId, context.userId, data);
  });

export const virtualImportCodesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        poolId: z.string().uuid(),
        // ~5k codes; the parser caps again and reports every rejected line.
        raw: z.string().min(1).max(500_000),
        costMinor: z.number().int().min(0).max(100_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importCodes } = await import("./virtual-delivery.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importCodes(context.supabase, merchantId, context.userId, data);
  });

export const virtualRevealCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ codeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revealCode } = await import("./virtual-delivery.server");
    const merchantId = await scope(context.supabase, context.userId);
    // Staff reveal: allowed because the caller owns the merchant, but still
    // double rate limited and written to the growth audit log.
    return revealCode(context.supabase, {
      codeId: data.codeId,
      merchantId,
      actor: context.userId,
      staff: true,
    });
  });

export const virtualRevokeCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ codeId: z.string().uuid(), reason: z.string().trim().min(3).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { revokeCode } = await import("./virtual-delivery.server");
    const merchantId = await scope(context.supabase, context.userId);
    return revokeCode(context.supabase, merchantId, context.userId, data);
  });

export const virtualRetryDeliveryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deliveryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { retryDelivery } = await import("./virtual-delivery.server");
    const merchantId = await scope(context.supabase, context.userId);
    return retryDelivery(context.supabase, merchantId, context.userId, data.deliveryId);
  });
