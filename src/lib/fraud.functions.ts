import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}


export const fraudDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadDesk } = await import("./fraud-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, ...(await loadDesk(context.supabase, merchantId)) };
  });

export const fraudScanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { scanOrders } = await import("./fraud.server");
    const merchantId = await scope(context.supabase, context.userId);
    return scanOrders(context.supabase, merchantId, context.userId);
  });

export const fraudDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "evidence_requested"]),
        note: z.string().trim().max(400).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { decideCase } = await import("./fraud-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return decideCase(
      context.supabase,
      merchantId,
      context.userId,
      data.caseId,
      data.decision,
      data.note ?? null,
    );
  });

export const fraudRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(2).max(40),
        enabled: z.boolean(),
        params: z.record(z.string(), z.number().int().min(0)).default({}),
        action: z.enum(["allow", "review", "block"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setRule } = await import("./fraud-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setRule(
      context.supabase,
      merchantId,
      context.userId,
      data.code,
      data.enabled,
      data.params,
      data.action,
    );
  });


export const fraudBlacklistAddFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["phone", "email"]),
        value: z.string().trim().min(3).max(120),
        reason: z.string().trim().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { addBlacklist } = await import("./fraud-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return addBlacklist(
      context.supabase,
      merchantId,
      context.userId,
      data.kind,
      data.value,
      data.reason ?? null,
    );
  });

export const fraudBlacklistToggleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setBlacklistActive } = await import("./fraud-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setBlacklistActive(context.supabase, merchantId, context.userId, data.id, data.active);
  });

export const fraudAuditFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAudit } = await import("./fraud-desk.server");
    const merchantId = await scope(context.supabase, context.userId);
    return listAudit(context.supabase, merchantId);
  });
