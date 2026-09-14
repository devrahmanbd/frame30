/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAYMENT_METHOD_KEYS } from "./payment-rails";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

const planSchema = z.object({
  plan: z.enum(["launch", "growth", "business", "enterprise"]),
  title_bn: z.string().min(1),
  title_en: z.string().min(1),
  price_minor_int: z.number().int().min(0).nullable(),
  currency_code: z.string().min(3).max(3),
  products_limit: z.number().int().min(-1),
  staff_limit: z.number().int().min(-1),
  features: z.array(z.string()),
  trial_days: z.number().int().min(0).max(365),
  payment_methods_allowed: z.array(z.enum(PAYMENT_METHOD_KEYS)),
  feature_flags: z.record(z.string(), z.boolean()),
  sort_order: z.number().int().min(0),
  active: z.boolean(),
});

export const platformPlansFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadPlans } = await import("./platform.server");
    return loadPlans(context.supabase, context.userId);
  });

export const platformTenantsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTenants, loadAudit } = await import("./platform.server");
    const [tenants, audit] = await Promise.all([
      loadTenants(context.supabase, context.userId),
      loadAudit(context.supabase, context.userId),
    ]);
    return { ...tenants, ...audit };
  });

export const platformSavePlanFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plan.write")])
  .inputValidator((d: unknown) => planSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { savePlan } = await import("./platform.server");
    return savePlan(context.supabase, context.userId, data);
  });

export const platformSetQuotaFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("tenant.limits")])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: z.string().uuid(),
        productsLimit: z.number().int().min(-1),
        staffLimit: z.number().int().min(-1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setTenantQuota } = await import("./platform.server");
    return setTenantQuota(
      context.supabase,
      context.userId,
      data.merchantId,
      data.productsLimit,
      data.staffLimit,
    );
  });

export const platformClearQuotaFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("tenant.limits")])
  .inputValidator((d: unknown) => z.object({ merchantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clearTenantQuota } = await import("./platform.server");
    return clearTenantQuota(context.supabase, context.userId, data.merchantId);
  });

/**
 * Route gate for the owner console. Returns a boolean instead of throwing so
 * the /root layout can render a neutral "not available" screen rather than
 * confirming the console exists.
 *
 * Exclusively permitted for the owner of Framique (devrahmanbd@gmail.com).
 */
export const platformIsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as Record<string, unknown> | undefined;
    const email = (typeof claims?.["email"] === "string" ? claims["email"] : "").toLowerCase();
    
    const ownerEmails = [
      "devrahmanbd@gmail.com",
      "nahid52flame@gmail.com",
    ];
    
    const configuredOwner = (process.env["PLATFORM_OWNER_EMAIL"] || "").toLowerCase();
    if (configuredOwner) {
      ownerEmails.push(configuredOwner);
    }

    if (!ownerEmails.includes(email)) {
      return { admin: false };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("platform_admins")
        .upsert({ user_id: context.userId }, { onConflict: "user_id" });
    } catch {
      // Ignore if supabaseAdmin is not configured
    }

    const { data } = await (context.supabase as any)
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { admin: Boolean(data) || ownerEmails.includes(email) };
  });
