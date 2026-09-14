import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Traffic } from "@/components/admin/analytics/Traffic";
import { Insights } from "@/components/admin/analytics/Insights";
import { Reports } from "@/components/admin/analytics/Reports";
import { ActivityLog } from "@/components/admin/analytics/ActivityLog";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeDollarSign,
  ShoppingCart,
  Receipt,
  Truck,
  TicketPercent,
  RotateCcw,
} from "lucide-react";
import { KpiCard } from "@/components/admin/KpiCard";
import { analyticsFn } from "@/lib/analytics.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

const ranges = [
  { key: "7d", label: "৭ দিন", en: "7 days" },
  { key: "30d", label: "৩০ দিন", en: "30 days" },
  { key: "90d", label: "৯০ দিন", en: "90 days" },
] as const;
type RangeKey = (typeof ranges)[number]["key"];

const methodLabel: Record<string, { en: string; bn: string }> = {
  cod: { en: "Cash on delivery", bn: "ক্যাশ অন ডেলিভারি" },
  bkash: { en: "bKash", bn: "বিকাশ" },
  nagad: { en: "Nagad", bn: "নগদ" },
  rocket: { en: "Rocket", bn: "রকেট" },
};

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Framique Admin" },
      {
        name: "description",
        content:
          "Revenue, orders, average order value, payment-method mix and top products for your Framique store.",
      },
      { property: "og:title", content: "Store analytics — Framique" },
      {
        property: "og:description",
        content: "Server-computed BDT revenue trends, COD exposure and best-selling products.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: AnalyticsTab } => {
    const tab = search.tab as AnalyticsTab | undefined;
    return tab && ["overview", "traffic", "insights", "reports", "activity"].includes(tab) ? { tab } : {};
  },
  component: AnalyticsHub,
});

type AnalyticsTab = "overview" | "traffic" | "insights" | "reports" | "activity";

const TABS = [
  { key: "overview", en: "Overview", bn: "সারসংক্ষেপ" },
  { key: "traffic", en: "Traffic", bn: "ট্রাফিক" },
  { key: "insights", en: "Insights", bn: "ইনসাইটস" },
  { key: "reports", en: "Reports", bn: "রিপোর্ট" },
  { key: "activity", en: "Activity", bn: "অ্যাক্টিভিটি" },
] as const;

/** One destination, four views — replaces the old four sidebar rows. */
function AnalyticsHub() {
  const { t } = useLang();
  const tab = Route.useSearch().tab ?? "overview";
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="mx-auto max-w-6xl">
      <div
        role="tablist"
        aria-label="Analytics views"
        className="mb-5 inline-flex flex-wrap gap-1 rounded-fq-md border border-border bg-card p-1"
      >
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => navigate({ to: ".", search: { tab: tb.key } })}
            className={`min-h-9 rounded-fq-md px-3 text-sm transition-colors ${
              tab === tb.key
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="font-bangla-display">{t(tb.en, tb.bn)}</span>
          </button>
        ))}
      </div>

      {tab === "overview" && <AnalyticsPage />}
      {tab === "traffic" && <Traffic />}
      {tab === "insights" && <Insights />}
      {tab === "reports" && <Reports />}
      {tab === "activity" && <ActivityLog />}
    </div>
  );
}

function deltaTone(pct: number) {
  if (pct > 0) return "success" as const;
  if (pct < 0) return "danger" as const;
  return "info" as const;
}

function deltaText(pct: number, suffix: string) {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% ${suffix}`;
}

function AnalyticsPage() {
  const { t } = useLang();
  const [range, setRange] = useState<RangeKey>("30d");
  const fetchAnalytics = useServerFn(analyticsFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => fetchAnalytics({ data: { range } }),
  });

  const currency = data?.currency ?? "BDT";
  const maxRevenue = Math.max(1, ...(data?.series.map((p) => p.revenueMinorInt) ?? [1]));
  const totalMethodRevenue = Math.max(
    1,
    (data?.byMethod ?? []).reduce((a, m) => a + m.revenueMinorInt, 0),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight">{t("Analytics", "অ্যানালিটিক্স")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analytics · all money computed server-side in {currency}.
          </p>
        </div>
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex rounded-fq-md border border-border bg-card p-1"
        >
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`min-h-9 rounded-fq-md px-3 text-sm transition-colors ${
                range === r.key
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-bangla-display">{r.label}</span>
              <span className="sr-only">{r.en}</span>
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
          {(error as Error).message}
        </p>
      )}

      {isLoading && !data && (
        <p className="text-sm text-muted-foreground">{t("Loading analytics…", "লোড হচ্ছে… / Loading analytics…")}</p>
      )}

      {data && (
        <>
          <section
            aria-label="Key performance indicators"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <KpiCard
              labelBn={t("Revenue", "মোট বিক্রি")}
              label="Revenue"
              value={fmtMinor(data.totals.revenueMinorInt, currency)}
              icon={BadgeDollarSign}
              delta={{
                text: deltaText(data.deltas.revenuePct, t("vs previous period", "vs আগের সময়")),
                tone: deltaTone(data.deltas.revenuePct),
              }}
            />
            <KpiCard
              labelBn={t("Orders", "অর্ডার")}
              label="Orders"
              value={String(data.totals.orderCount)}
              icon={ShoppingCart}
              delta={{
                text: deltaText(data.deltas.ordersPct, t("vs previous period", "vs আগের সময়")),
                tone: deltaTone(data.deltas.ordersPct),
              }}
            />
            <KpiCard
              labelBn={t("Average order value", "গড় অর্ডার মূল্য")}
              label="Average order value"
              value={fmtMinor(data.totals.aovMinorInt, currency)}
              icon={Receipt}
            />
            <KpiCard
              labelBn={t("COD pending", "COD পেন্ডিং")}
              label="COD pending"
              value={fmtMinor(data.totals.codPendingMinorInt, currency)}
              icon={Truck}
              tone="warning"
              delta={{ text: t(`${data.totals.codPendingCount} shipments`, `${data.totals.codPendingCount}টি চালান`), tone: "warning" }}
            />
            <KpiCard
              labelBn={t("Discounts given", "ডিসকাউন্ট")}
              label="Discounts given"
              value={fmtMinor(data.totals.discountMinorInt, currency)}
              icon={TicketPercent}
            />
            <KpiCard
              labelBn={t("Cancelled & refunded", "বাতিল ও রিফান্ড")}
              label="Cancelled & refunded"
              value={`${data.totals.cancelledCount} / ${data.totals.refundedCount}`}
              icon={RotateCcw}
              tone="danger"
            />
          </section>

          <section
            aria-label="Revenue trend"
            className="mt-6 rounded-fq-lg border border-border bg-card p-4 shadow-xs"
          >
            <h2 className="font-bangla-display text-sm font-semibold">
              {t("Revenue trend", "বিক্রির ধারা")}
            </h2>
            <ul className="mt-4 flex h-40 items-end gap-1">
              {data.series.map((point) => (
                <li key={point.date} className="flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-fq-md bg-primary/80"
                    style={{
                      height: `${Math.max(2, (point.revenueMinorInt / maxRevenue) * 100)}%`,
                    }}
                    title={`${point.date}: ${fmtMinor(point.revenueMinorInt, currency)} · ${point.orders} orders`}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{data.series[0]?.date}</span>
              <span>{data.series[data.series.length - 1]?.date}</span>
            </div>
            <table className="sr-only">
              <caption>Revenue by day</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map((p) => (
                  <tr key={p.date}>
                    <td>{p.date}</td>
                    <td>{fmtMinor(p.revenueMinorInt, currency)}</td>
                    <td>{p.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section
              aria-label="Payment method mix"
              className="rounded-fq-lg border border-border bg-card p-4 shadow-xs"
            >
              <h2 className="font-bangla-display text-sm font-semibold">
                {t("Payment mix", "পেমেন্ট মাধ্যম")}
              </h2>
              <ul className="mt-3 space-y-3">
                {data.byMethod.map((m) => (
                  <li key={m.method}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-bangla-display">{t(methodLabel[m.method]?.en ?? m.method, methodLabel[m.method]?.bn ?? m.method)}</span>
                      <span className="money text-muted-foreground">
                        {fmtMinor(m.revenueMinorInt, currency)} · {m.orders}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(m.revenueMinorInt / totalMethodRevenue) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section
              aria-label="Top products"
              className="rounded-fq-lg border border-border bg-card p-4 shadow-xs"
            >
              <h2 className="font-bangla-display text-sm font-semibold">
                {t("Top products", "সেরা পণ্য")}
              </h2>
              {data.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("No sales in this period.", "এই সময়ে কোনো বিক্রি নেই।")}
                </p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="pb-2 font-medium">
                        {t("Product", "পণ্য")}
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        {t("Quantity", "পরিমাণ")}
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        {t("Sales", "বিক্রি")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.title} className="border-t border-border">
                        <td className="py-2 pr-2">{p.title}</td>
                        <td className="py-2 text-right tabular-nums">{p.quantity}</td>
                        <td className="money py-2 text-right">
                          {fmtMinor(p.revenueMinorInt, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            VAT collected in period: {fmtMinor(data.totals.vatMinorInt, currency)} · from legal year
            rate tables.
          </p>
        </>
      )}
    </div>
  );
}
