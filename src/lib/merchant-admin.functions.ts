import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const adminOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSetupState, loadNotifications } = await import("./merchant-admin.server");
    const merchantId = await scope(context.supabase, context.userId);
    const [setup, notifications] = await Promise.all([
      loadSetupState(context.supabase, merchantId),
      loadNotifications(context.supabase, merchantId, context.userId, 20),
    ]);
    return { setup, ...notifications };
  });

export const adminNotificationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadNotifications } = await import("./merchant-admin.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadNotifications(context.supabase, merchantId, context.userId, 20);
  });

export const adminMarkNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(50).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { markNotificationsRead } = await import("./merchant-admin.server");
    const merchantId = await scope(context.supabase, context.userId);
    const count = await markNotificationsRead(
      context.supabase,
      merchantId,
      context.userId,
      data.ids,
    );
    return { count };
  });

export const adminSaveSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        support_phone: z.string().max(32).optional(),
        support_email: z.string().email().max(120).optional(),
        ship_address_line: z.string().max(200).optional(),
        ship_city: z.string().max(80).optional(),
        ship_postcode: z.string().max(16).optional(),
        low_stock_threshold: z.number().int().min(0).max(10000).optional(),
        vat_registration_no: z.string().max(64).optional(),
        notify_prefs: z.record(z.string(), z.boolean()).optional(),
        dismiss: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveSetup } = await import("./merchant-admin.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveSetup(context.supabase, merchantId, context.userId, data);
  });

export const adminActivityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cursor: z.string().max(32).nullable().optional(),
        resourceType: z.string().max(40).nullable().optional(),
        action: z.enum(["created", "updated", "deleted"]).nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listActivity } = await import("./merchant-admin.server");
    const merchantId = await scope(context.supabase, context.userId);
    return listActivity(context.supabase, merchantId, context.userId, {
      cursor: data.cursor ?? null,
      resourceType: data.resourceType ?? null,
      action: data.action ?? null,
    });
  });
