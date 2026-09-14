import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
export type Plan = Database["public"]["Enums"]["billing_plan"];

export class BillingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BillingError";
  }
}

/**
 * Plan caps and prices are never hardcoded: every value is read from
 * plan_definitions / tenant_limits. When a row is missing the caller gets the
 * keyed message `billing.limits.unconfigured` ("Contact your platform admin").
 */
export type PlanDef = {
  plan: Plan;
  title: string;
  en: string;
  priceMinorInt: number | null;
  currencyCode: string;
  products: number;
  staff: number;
  features: string[];
  trialDays: number;
  paymentMethods: string[];
  featureFlags: Record<string, string | number | boolean>;
};

export const LIMITS_UNCONFIGURED = "billing.limits.unconfigured";

type PlanRow = Database["public"]["Tables"]["plan_definitions"]["Row"];

export function toPlanDef(row: PlanRow): PlanDef {
  return {
    plan: row.plan,
    title: row.title_bn,
    en: row.title_en,
    priceMinorInt: row.price_minor_int === null ? null : Number(row.price_minor_int),
    currencyCode: row.currency_code,
    products: row.products_limit,
    staff: row.staff_limit,
    features: Array.isArray(row.features) ? (row.features as string[]) : [],
    trialDays: row.trial_days,
    paymentMethods: Array.isArray(row.payment_methods_allowed)
      ? (row.payment_methods_allowed as string[])
      : [],
    featureFlags:
      row.feature_flags && typeof row.feature_flags === "object"
        ? (row.feature_flags as Record<string, string | number | boolean>)
        : {},
  };
}

export async function loadPlanDefs(db: Client): Promise<PlanDef[]> {
  const { data } = await db
    .from("plan_definitions")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map(toPlanDef);
}

export async function planDefFor(db: Client, plan: Plan): Promise<PlanDef> {
  const { data } = await db.from("plan_definitions").select("*").eq("plan", plan).maybeSingle();
  if (!data) throw new BillingError("limits_unconfigured", LIMITS_UNCONFIGURED);
  return toPlanDef(data);
}

export async function vatBasisPoints(db: Client) {
  const year = new Date().getUTCFullYear();
  const { data } = await db
    .from("vat_rates")
    .select("rate_basis_points, effective_year")
    .eq("country_code", "BD")
    .eq("category", "standard")
    .lte("effective_year", year)
    .order("effective_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new BillingError("no_vat_rate", "No VAT rate configured");
  return { rate: data.rate_basis_points, year: data.effective_year };
}

export async function ensureSubscription(db: Client, merchantId: string) {
  const { data } = await db
    .from("subscriptions")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (data) return data;
  const def = await planDefFor(db, "launch");
  const trialEnds = new Date(Date.now() + def.trialDays * 86400000).toISOString();
  const { data: created, error } = await db
    .from("subscriptions")
    .insert({ merchant_id: merchantId, plan: "launch", status: "trial", trial_ends_at: trialEnds })
    .select("*")
    .single();
  if (error) throw new BillingError("subscription_init_failed", error.message);
  return created;
}

export async function ensureLimits(db: Client, merchantId: string, plan: Plan) {
  const { data } = await db
    .from("tenant_limits")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (data) return data;
  const def = await planDefFor(db, plan);
  const { data: created, error } = await db
    .from("tenant_limits")
    .insert({
      merchant_id: merchantId,
      products_limit: def.products,
      staff_limit: def.staff,
    })
    .select("*")
    .single();
  if (error) throw new BillingError("limits_init_failed", error.message);
  return created;
}


export async function logEvent(
  db: Client,
  merchantId: string,
  actor: string | null,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await db.from("billing_events").insert({
    merchant_id: merchantId,
    actor,
    event_type: eventType,
    payload: payload as never,
  });
}

export function daysBetween(from: string | null, to = Date.now()) {
  if (!from) return null;
  return Math.floor((to - new Date(from).getTime()) / 86400000);
}
