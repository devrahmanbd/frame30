import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const REVENUE_STATUSES = ["paid", "confirmed", "packed", "shipped", "delivered", "fulfilled"];
const UNFULFILLED_STATUSES = ["paid", "confirmed", "packed"];
const OPEN_COD_STATUSES = ["pending", "payment_pending", "confirmed", "packed", "shipped"];

/**
 * Bounds for the home cards. The dashboard summarises a rolling window, so it
 * reads a window — never the tenant's whole order history. Asserted by
 * `query-discipline.contract.test.ts` against the 50 000-row fixture.
 */
export const DASHBOARD_ORDER_SCAN_LIMIT = 2_000;
export const DASHBOARD_PAYMENT_SCAN_LIMIT = 5;
export const DASHBOARD_STOCK_SCAN_LIMIT = 20;
export const DASHBOARD_SUBSCRIBER_SCAN_LIMIT = 5;

export type NeedsYouItem = {
  id: string;
  kind: "unfulfilled" | "suspicious" | "payment_failed" | "low_stock" | "subscriber";
  rank: number;
  titleEn: string;
  titleBn: string;
  detailEn: string;
  detailBn: string;
  actionEn: string;
  actionBn: string;
  to: string;
  amountMinorInt?: number;
};

export type FeedItem = {
  id: string;
  kind: "order" | "payment_failed" | "subscriber";
  at: string;
  titleEn: string;
  titleBn: string;
  amountMinorInt?: number;
  to: string;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Today strip + ranked "needs you" queue + live feed seed for the /admin home. */
export async function loadDashboardHome(supabase: Client, merchantId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  // Same weekday last week, so weekday seasonality does not distort the delta.
  const baseStart = new Date(todayStart);
  baseStart.setUTCDate(baseStart.getUTCDate() - 7);
  const baseEnd = new Date(baseStart);
  baseEnd.setUTCDate(baseEnd.getUTCDate() + 1);
  // Compare like-for-like: only the elapsed part of the day.
  const elapsedMs = now.getTime() - todayStart.getTime();
  const baseCutoff = new Date(baseStart.getTime() + elapsedMs);

  const [{ data: merchant }, { data: orders, error }] = await Promise.all([
    supabase.from("merchants").select("currency_code").eq("id", merchantId).maybeSingle(),
    supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_method, currency_code, total_minor_int, customer_name, created_at",
      )
      .eq("merchant_id", merchantId)
      .gte("created_at", baseStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(DASHBOARD_ORDER_SCAN_LIMIT),
  ]);
  if (error) throw error;

  const rows = orders ?? [];
  const currency = merchant?.currency_code ?? rows[0]?.currency_code ?? "BDT";

  const today = rows.filter((o) => o.created_at >= todayStart.toISOString());
  const baseline = rows.filter(
    (o) => o.created_at >= baseStart.toISOString() && o.created_at < baseCutoff.toISOString(),
  );

  const earning = (r: typeof rows) => r.filter((o) => REVENUE_STATUSES.includes(o.status));
  const revenue = (r: typeof rows) => earning(r).reduce((a, o) => a + o.total_minor_int, 0);
  const aov = (r: typeof rows) => {
    const paid = earning(r);
    return paid.length ? Math.round(revenue(r) / paid.length) : 0;
  };
  const pct = (a: number, b: number) =>
    b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 1000) / 10;

  const strip = {
    revenue: {
      valueMinorInt: revenue(today),
      deltaPct: pct(revenue(today), revenue(baseline)),
    },
    orders: { value: today.length, deltaPct: pct(today.length, baseline.length) },
    aov: { valueMinorInt: aov(today), deltaPct: pct(aov(today), aov(baseline)) },
  };

  // ---- Needs you queue -------------------------------------------------
  const needs: NeedsYouItem[] = [];

  const unfulfilled = rows.filter((o) => UNFULFILLED_STATUSES.includes(o.status));
  for (const o of unfulfilled.slice(0, 6)) {
    needs.push({
      id: `order-${o.id}`,
      kind: "unfulfilled",
      rank: 1,
      titleEn: `Fulfil order #${o.order_number}`,
      titleBn: `অর্ডার #${o.order_number} পাঠান`,
      detailEn: o.customer_name ?? "Customer",
      detailBn: o.customer_name ?? "গ্রাহক",
      actionEn: "Fulfil",
      actionBn: "পাঠান",
      to: `/admin/orders/${o.id}`,
      amountMinorInt: o.total_minor_int,
    });
  }

  // High-value COD orders still open read as the suspicious-order signal until
  // the dedicated risk tables land.
  const suspicious = rows
    .filter((o) => o.payment_method === "cod" && OPEN_COD_STATUSES.includes(o.status))
    .sort((a, b) => b.total_minor_int - a.total_minor_int)
    .filter((o) => o.total_minor_int >= 500000)
    .slice(0, 4);
  for (const o of suspicious) {
    needs.push({
      id: `risk-${o.id}`,
      kind: "suspicious",
      rank: 2,
      titleEn: `Verify high-value COD #${o.order_number}`,
      titleBn: `বড় অঙ্কের COD #${o.order_number} যাচাই করুন`,
      detailEn: o.customer_name ?? "Unverified buyer",
      detailBn: o.customer_name ?? "অযাচাইকৃত ক্রেতা",
      actionEn: "Review",
      actionBn: "যাচাই",
      to: `/admin/orders/${o.id}`,
      amountMinorInt: o.total_minor_int,
    });
  }

  const { data: failedPayments } = await supabase
    .from("payments")
    .select("id, order_id, amount_minor_int, payment_provider, payment_status, created_at")
    .eq("merchant_id", merchantId)
    .eq("payment_status", "failed")
    .order("created_at", { ascending: false })
    .limit(DASHBOARD_PAYMENT_SCAN_LIMIT);
  for (const p of failedPayments ?? []) {
    needs.push({
      id: `pay-${p.id}`,
      kind: "payment_failed",
      rank: 3,
      titleEn: `Recover failed ${p.payment_provider} payment`,
      titleBn: `ব্যর্থ ${p.payment_provider} পেমেন্ট উদ্ধার করুন`,
      detailEn: "Payment declined by the provider",
      detailBn: "প্রোভাইডার পেমেন্ট বাতিল করেছে",
      actionEn: "Open order",
      actionBn: "অর্ডার দেখুন",
      to: p.order_id ? `/admin/orders/${p.order_id}` : "/admin/payments",
      amountMinorInt: p.amount_minor_int,
    });
  }

  const { data: lowStock } = await supabase
    .from("inventory_levels")
    .select("id, on_hand, reserved, low_stock_threshold, variant_id")
    .eq("merchant_id", merchantId)
    .order("on_hand", { ascending: true })
    .limit(DASHBOARD_STOCK_SCAN_LIMIT);
  const lowRows = (lowStock ?? []).filter(
    (l) => l.on_hand - (l.reserved ?? 0) <= (l.low_stock_threshold ?? 0),
  );
  let variantNames = new Map<string, string>();
  if (lowRows.length) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, name, sku")
      .in(
        "id",
        lowRows.map((l) => l.variant_id),
      )
      // Bounded by construction (`lowRows` is at most the stock scan limit),
      // but stated explicitly so the discipline audit can see it.
      .limit(DASHBOARD_STOCK_SCAN_LIMIT);
    variantNames = new Map((variants ?? []).map((v) => [v.id, v.name ?? v.sku ?? "Variant"]));
  }
  for (const l of lowRows.slice(0, 5)) {
    const available = l.on_hand - (l.reserved ?? 0);
    needs.push({
      id: `stock-${l.id}`,
      kind: "low_stock",
      rank: 4,
      titleEn: `Restock ${variantNames.get(l.variant_id) ?? "variant"}`,
      titleBn: `${variantNames.get(l.variant_id) ?? "ভ্যারিয়েন্ট"} রিস্টক করুন`,
      detailEn: `${available} left on hand`,
      detailBn: `স্টকে বাকি ${available}টি`,
      actionEn: "Adjust stock",
      actionBn: "স্টক ঠিক করুন",
      to: "/admin/inventory",
    });
  }

  needs.sort((a, b) => a.rank - b.rank || (b.amountMinorInt ?? 0) - (a.amountMinorInt ?? 0));

  // ---- Live feed seed --------------------------------------------------
  const { data: newSubscribers } = await supabase
    .from("subscribers")
    .select("id, email, phone, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(DASHBOARD_SUBSCRIBER_SCAN_LIMIT);

  const feed: FeedItem[] = [
    ...rows.slice(0, 10).map<FeedItem>((o) => ({
      id: `order-${o.id}`,
      kind: "order",
      at: o.created_at,
      titleEn: `Order #${o.order_number} placed`,
      titleBn: `অর্ডার #${o.order_number} এসেছে`,
      amountMinorInt: o.total_minor_int,
      to: `/admin/orders/${o.id}`,
    })),
    ...(failedPayments ?? []).map<FeedItem>((p) => ({
      id: `pay-${p.id}`,
      kind: "payment_failed",
      at: p.created_at,
      titleEn: `${p.payment_provider} payment failed`,
      titleBn: `${p.payment_provider} পেমেন্ট ব্যর্থ`,
      amountMinorInt: p.amount_minor_int,
      to: p.order_id ? `/admin/orders/${p.order_id}` : "/admin/payments",
    })),
    ...(newSubscribers ?? []).map<FeedItem>((s) => ({
      id: `sub-${s.id}`,
      kind: "subscriber",
      at: s.created_at,
      titleEn: `New subscriber ${s.email ?? s.phone ?? ""}`.trim(),
      titleBn: `নতুন সাবস্ক্রাইবার ${s.email ?? s.phone ?? ""}`.trim(),
      to: "/admin/marketing",
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  const { count: lifetimeOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId);

  return {
    currency,
    generatedAt: now.toISOString(),
    strip,
    needs: needs.slice(0, 12),
    feed,
    lifetimeOrders: lifetimeOrders ?? 0,
    // First-30-days mode: analytics stay hidden until the store has real volume.
    onboarding: (lifetimeOrders ?? 0) < 10,
  };
}
