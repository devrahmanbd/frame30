/**
 * Bundles and customer records/segments.
 *
 * A bundle price is always derived server-side from the current component
 * variant prices — the browser never sends a bundle price. Segment membership
 * is resolved from stored order/customer facts, never from a client filter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { CommerceError } from "./inventory.server";

type Client = SupabaseClient<Database>;

export type BundleComponent = { variantId: string; quantity: number };

export function bundlePrice(
  mode: "fixed" | "percent",
  componentTotalMinor: number,
  fixedMinor: number | null,
  percentOff: number,
) {
  if (mode === "fixed") return Math.max(0, Math.floor(fixedMinor ?? componentTotalMinor));
  const pct = Math.min(100, Math.max(0, Math.floor(percentOff)));
  return componentTotalMinor - Math.floor((componentTotalMinor * pct) / 100);
}

export async function loadBundles(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("product_bundles")
    .select("*, products(title, slug), bundle_items(id, variant_id, quantity)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new CommerceError("bundles_unavailable", "Bundles are temporarily unavailable");
  return data ?? [];
}

export async function saveBundle(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    productId: string;
    pricingMode: "fixed" | "percent";
    fixedPriceMinorInt?: number | null;
    percentOff?: number;
    active?: boolean;
    components: BundleComponent[];
  },
) {
  return withSpan("commerce.bundle_save", async () => {
    await enforceRateLimit("commerce.bundles", `${merchantId}:${actor}`);
    const components = input.components
      .map((c) => ({ ...c, quantity: Math.max(1, Math.floor(c.quantity)) }))
      .filter((c) => c.variantId);
    if (components.length < 2) {
      throw new CommerceError("bundle_needs_components", "A bundle needs at least two items");
    }
    const { data: bundle, error } = await db
      .from("product_bundles")
      .upsert(
        {
          merchant_id: merchantId,
          product_id: input.productId,
          pricing_mode: input.pricingMode,
          fixed_price_minor_int:
            input.pricingMode === "fixed" ? Math.max(0, Math.floor(input.fixedPriceMinorInt ?? 0)) : null,
          percent_off: input.pricingMode === "percent" ? Math.min(100, Math.max(0, Math.floor(input.percentOff ?? 0))) : 0,
          active: input.active ?? true,
        },
        { onConflict: "product_id" },
      )
      .select("*")
      .single();
    if (error) throw new CommerceError("bundle_save_failed", error.message);

    await db.from("bundle_items").delete().eq("bundle_id", bundle.id).eq("merchant_id", merchantId);
    const { error: itemError } = await db.from("bundle_items").insert(
      components.map((c) => ({
        merchant_id: merchantId,
        bundle_id: bundle.id,
        variant_id: c.variantId,
        quantity: c.quantity,
      })),
    );
    if (itemError) throw new CommerceError("bundle_save_failed", itemError.message);
    incr("framique_bundle_saved_total", {});
    return bundle;
  });
}

export async function deleteBundle(db: Client, merchantId: string, bundleId: string) {
  await db.from("product_bundles").delete().eq("id", bundleId).eq("merchant_id", merchantId);
}

/* ---------------------------------- customers ---------------------------------- */

export type CustomerRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  orders: number;
  spendMinorInt: number;
  lastOrderAt: string | null;
};

export async function loadCustomers(db: Client, merchantId: string, term = "") {
  return withSpan("commerce.customers_load", async () => {
    await enforceRateLimit("commerce.customers", merchantId);
    let q = db
      .from("customers")
      .select("id, name, email, phone, created_at")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    const needle = term.trim();
    if (needle) q = q.or(`name.ilike.%${needle}%,email.ilike.%${needle}%,phone.ilike.%${needle}%`);
    const { data: customers, error } = await q;
    if (error) throw new CommerceError("customers_unavailable", "Customers are unavailable");

    const ids = (customers ?? []).map((c) => c.id);
    const { data: orders } = ids.length
      ? await db
          .from("orders")
          .select("customer_id, total_minor_int, created_at")
          .eq("merchant_id", merchantId)
          .in("customer_id", ids)
      : { data: [] as { customer_id: string | null; total_minor_int: number; created_at: string }[] };

    return (customers ?? []).map<CustomerRecord>((c) => {
      const mine = (orders ?? []).filter((o) => o.customer_id === c.id);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        orders: mine.length,
        spendMinorInt: mine.reduce((s, o) => s + Number(o.total_minor_int), 0),
        lastOrderAt:
          mine.map((o) => o.created_at).sort((a, b) => (a < b ? 1 : -1))[0] ?? null,
      };
    });
  });
}

export type SegmentRule = { field: string; operator: string; value: string };

export function matchesSegment(customer: CustomerRecord, rule: SegmentRule) {
  const numeric = Number(rule.value);
  switch (rule.field) {
    case "orders":
      return rule.operator === "gte" ? customer.orders >= numeric : customer.orders <= numeric;
    case "spend":
      return rule.operator === "gte"
        ? customer.spendMinorInt >= numeric
        : customer.spendMinorInt <= numeric;
    case "has_email":
      return Boolean(customer.email);
    case "has_phone":
      return Boolean(customer.phone);
    default:
      return false;
  }
}

export async function loadSegments(db: Client, merchantId: string) {
  const { data } = await db
    .from("segments")
    .select("*")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function saveSegment(
  db: Client,
  merchantId: string,
  input: { id?: string; name: string; field: string; operator: string; value: string },
) {
  await enforceRateLimit("commerce.customers", merchantId);
  const row = {
    merchant_id: merchantId,
    name: input.name.trim(),
    rule_field: input.field,
    rule_operator: input.operator,
    rule_value: input.value,
  };
  const query = input.id
    ? db.from("segments").update(row).eq("id", input.id).eq("merchant_id", merchantId)
    : db.from("segments").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) throw new CommerceError("segment_save_failed", error.message);
  return data;
}
