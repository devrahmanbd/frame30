import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planInput = z.object({ plan: z.enum(["launch", "growth", "business", "enterprise"]) });

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const billingLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBilling } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await loadBilling(context.supabase, merchantId)) };
  });

/** Read-only proration quote. Never used as the billed amount — the RPC re-derives it. */
export const billingPlanPreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    const { planPreview } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return planPreview(context.supabase, merchantId, data.plan);
  });

export const billingChangePlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    const { changePlan } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return changePlan(context.supabase, merchantId, context.userId, data.plan);
  });

export const billingClaimTrialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { claimTrial, fingerprintOf } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    const claims = context.claims as { email?: string; phone?: string };
    // The signal is hashed server-side; neither the browser nor the DB sees it raw.
    const fingerprint = await fingerprintOf([claims.email, claims.phone, context.userId]);
    return claimTrial(context.supabase, merchantId, context.userId, fingerprint);
  });

export const billingPayInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { payInvoice } = await import("./billing-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return payInvoice(context.supabase, merchantId, context.userId, data.invoiceId);
  });
