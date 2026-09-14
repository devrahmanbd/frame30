import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ||
    "https://placeholder.supabase.co";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "placeholder-key";

  return createClient<Database>(
    url,
    key,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export type PublicPlan = {
  plan: string;
  titleEn: string;
  titleBn: string;
  priceMinorInt: number | null;
  currencyCode: string;
  trialDays: number;
  productsLimit: number;
  staffLimit: number;
  paymentMethods: string[];
  features: string[];
};

const DEFAULT_PLANS: PublicPlan[] = [
  {
    plan: "starter",
    titleEn: "Starter",
    titleBn: "স্টার্টার",
    priceMinorInt: 150000,
    currencyCode: "BDT",
    trialDays: 14,
    productsLimit: 100,
    staffLimit: 1,
    paymentMethods: ["bkash", "nagad", "cod"],
    features: ["100 products", "1 staff seat", "bKash & Nagad checkout", "Courier integration"],
  },
  {
    plan: "growth",
    titleEn: "Growth",
    titleBn: "গ্রোথ",
    priceMinorInt: 350000,
    currencyCode: "BDT",
    trialDays: 14,
    productsLimit: 1000,
    staffLimit: 5,
    paymentMethods: ["bkash", "nagad", "rocket", "card", "cod"],
    features: ["1,000 products", "5 staff seats", "Automated couriers", "COD Return Shield", "Custom domain"],
  },
  {
    plan: "scale",
    titleEn: "Scale",
    titleBn: "স্কেল",
    priceMinorInt: 750000,
    currencyCode: "BDT",
    trialDays: 14,
    productsLimit: 10000,
    staffLimit: 15,
    paymentMethods: ["bkash", "nagad", "rocket", "card", "cod", "pos"],
    features: ["Unlimited products", "15 staff seats", "Multi-location POS", "Priority support", "Custom API"],
  },
];

/**
 * Public pricing matrix. Values come from plan_definitions only — a missing or
 * null price renders as "Contact your platform admin", never an invented number.
 * Fails soft to default plans if Supabase connection is unavailable during SSR.
 */
export async function publicPlans(): Promise<PublicPlan[]> {
  try {
    const db = publicClient();
    const { data, error } = await db
      .from("plan_definitions")
      .select(
        "plan, title_en, title_bn, price_minor_int, currency_code, trial_days, products_limit, staff_limit, payment_methods_allowed, features",
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

    const rows = (data ?? []).map((row) => ({
      plan: row.plan,
      titleEn: row.title_en,
      titleBn: row.title_bn,
      priceMinorInt: row.price_minor_int,
      currencyCode: row.currency_code,
      trialDays: row.trial_days,
      productsLimit: row.products_limit,
      staffLimit: row.staff_limit,
      paymentMethods: list(row.payment_methods_allowed),
      features: list(row.features),
    }));

    return rows.length > 0 ? rows : DEFAULT_PLANS;
  } catch (err) {
    console.warn("Failed to load public plans from DB, using fallback plans:", err);
    return DEFAULT_PLANS;
  }
}

