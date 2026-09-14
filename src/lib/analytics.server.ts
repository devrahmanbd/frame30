import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type RangeKey = "7d" | "30d" | "90d";

const DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const REVENUE_STATUSES = ["paid", "confirmed", "packed", "shipped", "delivered", "fulfilled"];
const OPEN_COD_STATUSES = ["pending", "payment_pending", "confirmed", "packed", "shipped"];

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function emptySeries(days: number, end: Date) {
  const out: { date: string; revenueMinorInt: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), revenueMinorInt: 0, orders: 0 });
  }
  return out;
}

export async function loadAnalytics(supabase: Client, merchantId: string, range: RangeKey) {
  const days = DAYS[range];
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - days);

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_method, currency_code, total_minor_int, discount_minor_int, vat_minor_int, created_at",
    )
    .eq("merchant_id", merchantId)
    .gte("created_at", prevStart.toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw error;

  const currency = orders?.[0]?.currency_code ?? "BDT";
  const inCurrent = (o: { created_at: string }) => o.created_at >= start.toISOString();
  const current = (orders ?? []).filter(inCurrent);
  const previous = (orders ?? []).filter((o) => !inCurrent(o));

  const sum = (rows: typeof current, pick: (o: (typeof current)[number]) => number) =>
    rows.reduce((acc, o) => acc + pick(o), 0);

  const earning = (rows: typeof current) => rows.filter((o) => REVENUE_STATUSES.includes(o.status));

  const revenueMinorInt = sum(earning(current), (o) => o.total_minor_int);
  const prevRevenueMinorInt = sum(earning(previous), (o) => o.total_minor_int);
  const orderCount = current.length;
  const prevOrderCount = previous.length;
  const paidCount = earning(current).length;
  const aovMinorInt = paidCount > 0 ? Math.round(revenueMinorInt / paidCount) : 0;

  const codPendingMinorInt = sum(
    current.filter((o) => o.payment_method === "cod" && OPEN_COD_STATUSES.includes(o.status)),
    (o) => o.total_minor_int,
  );
  const codPendingCount = current.filter(
    (o) => o.payment_method === "cod" && OPEN_COD_STATUSES.includes(o.status),
  ).length;

  const discountMinorInt = sum(earning(current), (o) => o.discount_minor_int);
  const vatMinorInt = sum(earning(current), (o) => o.vat_minor_int);
  const cancelledCount = current.filter((o) => o.status === "cancelled").length;
  const refundedCount = current.filter((o) => o.status === "refunded" || o.status === "refund_requested").length;

  const series = emptySeries(days, now);
  const index = new Map(series.map((p, i) => [p.date, i]));
  for (const o of current) {
    const i = index.get(dayKey(o.created_at));
    if (i === undefined) continue;
    series[i].orders += 1;
    if (REVENUE_STATUSES.includes(o.status)) series[i].revenueMinorInt += o.total_minor_int;
  }

  const byMethod = ["cod", "bkash", "nagad", "rocket"].map((method) => {
    const rows = current.filter((o) => o.payment_method === method);
    return {
      method,
      orders: rows.length,
      revenueMinorInt: sum(earning(rows), (o) => o.total_minor_int),
    };
  });

  const currentIds = current.map((o) => o.id);
  let topProducts: { title: string; quantity: number; revenueMinorInt: number }[] = [];
  if (currentIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("product_title, quantity, line_total_minor_int, order_id")
      .eq("merchant_id", merchantId)
      .in("order_id", currentIds.slice(0, 500))
      .limit(5000);
    if (itemsError) throw itemsError;
    const grouped = new Map<string, { quantity: number; revenueMinorInt: number }>();
    for (const item of items ?? []) {
      const row = grouped.get(item.product_title) ?? { quantity: 0, revenueMinorInt: 0 };
      row.quantity += item.quantity;
      row.revenueMinorInt += item.line_total_minor_int;
      grouped.set(item.product_title, row);
    }
    topProducts = [...grouped.entries()]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => b.revenueMinorInt - a.revenueMinorInt)
      .slice(0, 8);
  }

  const pct = (now_: number, before: number) =>
    before === 0 ? (now_ > 0 ? 100 : 0) : Math.round(((now_ - before) / before) * 1000) / 10;

  return {
    range,
    currency,
    totals: {
      revenueMinorInt,
      orderCount,
      aovMinorInt,
      codPendingMinorInt,
      codPendingCount,
      discountMinorInt,
      vatMinorInt,
      cancelledCount,
      refundedCount,
    },
    deltas: {
      revenuePct: pct(revenueMinorInt, prevRevenueMinorInt),
      ordersPct: pct(orderCount, prevOrderCount),
    },
    series,
    byMethod,
    topProducts,
  };
}

export type AnalyticsSnapshot = Awaited<ReturnType<typeof loadAnalytics>>;
