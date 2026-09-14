import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BillingError, logEvent, toPlanDef, type Plan } from "./billing.server";

type Client = SupabaseClient<Database>;

export async function requirePlatformAdmin(db: Client, userId: string) {
  const { data } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new BillingError("forbidden", "platform.forbidden");
  return true;
}

export async function loadPlans(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const { data } = await db
    .from("plan_definitions")
    .select("*")
    .order("sort_order", { ascending: true });
  return { plans: (data ?? []).map(toPlanDef) };
}

/**
 * Tenant limits view. Caps are read from tenant_limits, falling back to the
 * tenant's plan definition. Missing rows stay `null` — no invented numbers.
 */
export async function loadTenants(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [plans, merchants, subscriptions, limits, products, staff] = await Promise.all([
    db.from("plan_definitions").select("*").order("sort_order", { ascending: true }),
    db.from("merchants").select("id, name, slug, status, kyc_status, currency_code").order("name"),
    db.from("subscriptions").select("merchant_id, plan, status, trial_ends_at, next_billing_at"),
    db.from("tenant_limits").select("merchant_id, products_limit, staff_limit"),
    db.from("products").select("merchant_id"),
    db.from("merchant_members").select("merchant_id"),
  ]);

  const count = (rows: { merchant_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) map.set(r.merchant_id, (map.get(r.merchant_id) ?? 0) + 1);
    return map;
  };
  const productCount = count(products.data);
  const staffCount = count(staff.data);
  const subMap = new Map((subscriptions.data ?? []).map((s) => [s.merchant_id, s]));
  const limitMap = new Map((limits.data ?? []).map((l) => [l.merchant_id, l]));
  const planMap = new Map((plans.data ?? []).map((p) => [p.plan, p]));

  const tenants = (merchants.data ?? []).map((m) => {
    const sub = subMap.get(m.id) ?? null;
    const override = limitMap.get(m.id) ?? null;
    const def = sub ? (planMap.get(sub.plan) ?? null) : null;
    return {
      ...m,
      plan: sub?.plan ?? null,
      subscriptionStatus: sub?.status ?? null,
      trialEndsAt: sub?.trial_ends_at ?? null,
      nextBillingAt: sub?.next_billing_at ?? null,
      productsLimit: override?.products_limit ?? def?.products_limit ?? null,
      staffLimit: override?.staff_limit ?? def?.staff_limit ?? null,
      hasOverride: Boolean(override),
      productsUsed: productCount.get(m.id) ?? 0,
      staffUsed: staffCount.get(m.id) ?? 0,
    };
  });

  return { tenants };
}

export async function loadAudit(db: Client, userId: string, limit = 50) {
  await requirePlatformAdmin(db, userId);
  const { data } = await db
    .from("platform_audit_log")
    .select("id, action, entity, entity_id, actor, created_at, before_data, after_data")
    .order("created_at", { ascending: false })
    .limit(limit);
  return { audit: data ?? [] };
}

export type PlanInput = {
  plan: Plan;
  title_bn: string;
  title_en: string;
  price_minor_int: number | null;
  currency_code: string;
  products_limit: number;
  staff_limit: number;
  features: string[];
  trial_days: number;
  payment_methods_allowed: string[];
  feature_flags: Record<string, boolean>;
  sort_order: number;
  active: boolean;
};

/** All mutations go through owner-only procedures that append an audit row. */
export async function savePlan(db: Client, userId: string, input: PlanInput) {
  await requirePlatformAdmin(db, userId);
  // Runs as the signed-in admin: the routine re-asserts platform-admin itself
  // and stamps the audit row from auth.uid().
  const { error } = await db.rpc("platform_save_plan", { _plan: input as never });
  if (error) throw new BillingError("plan_save_failed", error.message);
  return { ok: true };
}

export async function setTenantQuota(
  db: Client,
  userId: string,
  merchantId: string,
  productsLimit: number,
  staffLimit: number,
) {
  await requirePlatformAdmin(db, userId);
  const { error } = await db.rpc("platform_set_tenant_limits", {
    _merchant_id: merchantId,
    _products_limit: productsLimit,
    _staff_limit: staffLimit,
  });
  if (error) throw new BillingError("quota_save_failed", error.message);
  await logEvent(db, merchantId, userId, "quota.overridden", {
    products_limit: productsLimit,
    staff_limit: staffLimit,
  });
  return { ok: true };
}

export async function clearTenantQuota(db: Client, userId: string, merchantId: string) {
  await requirePlatformAdmin(db, userId);
  const { error } = await db.rpc("platform_clear_tenant_limits", { _merchant_id: merchantId });
  if (error) throw new BillingError("quota_clear_failed", error.message);
  await logEvent(db, merchantId, userId, "quota.reset_to_plan", {});
  return { ok: true };
}
