import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ad-fraud RPC surface (§4.2). Every function is authenticated, resolves the
 * caller's merchant server-side (never from client input) and delegates to the
 * service layer, which owns rate limiting, auditing and observability.
 */
async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const adFraudDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAdFraudDesk } = await import("./ad-fraud.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await loadAdFraudDesk(context.supabase, merchantId)) };
  });

export const adFraudSaveSpendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        network: z.string().trim().min(1).max(20),
        campaign: z.string().trim().min(1).max(120),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        spendMinorInt: z.number().int().min(0).max(1_000_000_000_000),
        currencyCode: z.string().trim().length(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveSpend } = await import("./ad-fraud.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveSpend(context.supabase, merchantId, context.userId, data);
  });

export const adFraudBlockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["ip_hash", "visitor_hash", "ua_hash", "campaign"]),
        value: z.string().trim().min(2).max(120),
        reason: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { addBlock } = await import("./ad-fraud.server");
    const merchantId = await scope(context.supabase, context.userId);
    return addBlock(context.supabase, merchantId, context.userId, data);
  });

export const adFraudToggleBlockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setBlockActive } = await import("./ad-fraud.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setBlockActive(context.supabase, merchantId, context.userId, data.id, data.active);
  });

export const adFraudRecomputeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { recomputeWindow } = await import("./ad-fraud.server");
    const merchantId = await scope(context.supabase, context.userId);
    return recomputeWindow(context.supabase, merchantId, context.userId, data.days);
  });
