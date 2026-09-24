import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
// Tab panels load on demand: each pulls its own data + chart deps, so the
// analytics route shell paints without waiting for all four (perf batch 2).
const Traffic = lazy(() =>
  import("@/components/admin/analytics/Traffic").then((m) => ({
    default: m.Traffic,
  })),
);
const Insights = lazy(() =>
  import("@/components/admin/analytics/Insights").then((m) => ({
    default: m.Insights,
  })),
);
const Reports = lazy(() =>
  import("@/components/admin/analytics/Reports").then((m) => ({
    default: m.Reports,
  })),
);
const ActivityLog = lazy(() =>
  import("@/components/admin/analytics/ActivityLog").then((m) => ({
    default: m.ActivityLog,
  })),
);
const TabFallback = () => (
  <div
    className="h-64 animate-pulse rounded-fq-lg border border-border bg-muted/40"
    aria-busy="true"
    aria-label="Loading"
  />
);
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
} from "@/components/icons/tabler";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { KpiCard } from "@/components/admin/KpiCard";
import { analyticsFn, analyticsTrafficFn } from "@/lib/analytics.functions";
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

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
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
        content:
          "Server-computed BDT revenue trends, COD exposure and best-selling products.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: AnalyticsTab } => {
    const tab = search.tab as AnalyticsTab | undefined;
    return tab &&
      ["overview", "traffic", "insights", "reports", "activity"].includes(tab)
      ? { tab }
      : {};
  },
  component: AnalyticsHub,
});

type AnalyticsTab =
  "overview" | "traffic" | "insights" | "reports" | "activity";

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
      {tab !== "overview" && (
        <Suspense fallback={<TabFallback />}>
          {tab === "traffic" && <Traffic />}
          {tab === "insights" && <Insights />}
          {tab === "reports" && <Reports />}
          {tab === "activity" && <ActivityLog />}
        </Suspense>
      )}
    </div>
  );
}

function deltaTone(pct: number | null) {
  if (pct === null) return "info" as const;
  if (pct > 0) return "success" as const;
  if (pct < 0) return "danger" as const;
  return "info" as const;
}

function deltaText(pct: number | null, suffix: string, fresh: string) {
  if (pct === null) return fresh;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% ${suffix}`;
}

function AnalyticsPage() {
  const { t } = useLang();
  const [range, setRange] = useState<RangeKey>("30d");
  const fetchAnalytics = useServerFn(analyticsFn);
  const fetchTraffic = useServerFn(analyticsTrafficFn);

  const rangeDays = range === "7d" ? 7 : range === "90d" ? 90 : 30;

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => fetchAnalytics({ data: { range } }),
  });

  const { data: trafficData } = useQuery({
    queryKey: ["admin", "traffic", rangeDays],
    queryFn: () => fetchTraffic({ data: { rangeDays } }),
  });

  const currency = data?.currency ?? "BDT";
  const maxRevenue = Math.max(
    1,
    ...(data?.series.map((p) => p.revenueMinorInt) ?? [1]),
  );
  const totalMethodRevenue = Math.max(
    1,
    (data?.byMethod ?? []).reduce((a, m) => a + m.revenueMinorInt, 0),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight">
            {t("Analytics", "অ্যানালিটিক্স")}
          </h1>
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
        <p
          role="alert"
          className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground"
        >
          {(error as Error).message}
        </p>
      )}

      {isLoading && !data && (
        <p className="text-sm text-muted-foreground">
          {t("Loading analytics…", "লোড হচ্ছে… / Loading analytics…")}
        </p>
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
                text: deltaText(
                  data.deltas.revenuePct,
                  t("vs previous period", "vs আগের সময়"),
                  t("New this period", "এই সময়ে নতুন"),
                ),
                tone: deltaTone(data.deltas.revenuePct),
              }}
            />
            <KpiCard
              labelBn={t("Orders", "অর্ডার")}
              label="Orders"
              value={String(data.totals.orderCount)}
              icon={ShoppingCart}
              delta={{
                text: deltaText(
                  data.deltas.ordersPct,
                  t("vs previous period", "vs আগের সময়"),
                  t("New this period", "এই সময়ে নতুন"),
                ),
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
              delta={{
                text: t(
                  `${data.totals.codPendingCount} shipments`,
                  `${data.totals.codPendingCount}টি চালান`,
                ),
                tone: "warning",
              }}
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
            <h2 className="font-bangla-display text-sm font-semibold mb-4">
              {t("Revenue trend", "বিক্রির ধারা")}
            </h2>
            <ChartContainer
              config={{
                revenue: {
                  label: t("Revenue", "বিক্রি"),
                  color: "var(--fq-primary)",
                },
              }}
              className="h-64 w-full"
            >
              <AreaChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value) => {
                    const d = new Date(value);
                    return isNaN(d.getTime())
                      ? value
                      : d.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    value > 0 ? (value / 100).toLocaleString() : "0"
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value: any, name: string) => [
                        fmtMinor(value as number, currency),
                        name,
                      ]}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="revenueMinorInt"
                  fill="var(--color-revenue)"
                  fillOpacity={0.2}
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section
              aria-label="Payment method mix"
              className="rounded-fq-lg border border-border bg-card p-4 shadow-xs flex flex-col"
            >
              <h2 className="font-bangla-display text-sm font-semibold mb-4">
                {t("Payment mix", "পেমেন্ট মাধ্যম")}
              </h2>
              <div className="flex-1 min-h-[200px]">
                <ChartContainer
                  config={{
                    revenue: {
                      label: t("Revenue", "বিক্রি"),
                      color: "var(--fq-primary)",
                    },
                  }}
                  className="h-full w-full"
                >
                  <BarChart
                    data={data.byMethod.map((m) => ({
                      ...m,
                      methodLabel: t(
                        methodLabel[m.method]?.en ?? m.method,
                        methodLabel[m.method]?.bn ?? m.method,
                      ),
                    }))}
                    layout="vertical"
                    margin={{ left: 24 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="methodLabel"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <ChartTooltip
                      cursor={{ fill: "transparent" }}
                      content={
                        <ChartTooltipContent
                          formatter={(value: any, name: string) => [
                            fmtMinor(value as number, currency),
                            name,
                          ]}
                        />
                      }
                    />
                    <Bar
                      dataKey="revenueMinorInt"
                      fill="var(--color-revenue)"
                      radius={[0, 4, 4, 0]}
                      barSize={24}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
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
                        <td className="py-2 text-right tabular-nums">
                          {p.quantity}
                        </td>
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

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section
              aria-label="Source of traffic"
              className="rounded-fq-lg border border-border bg-card p-4 shadow-xs flex flex-col"
            >
              <h2 className="font-bangla-display text-sm font-semibold mb-4">
                {t("Source of traffic", "ট্রাফিকের উৎস")}
              </h2>
              {trafficData?.sources && trafficData.sources.length > 0 ? (
                <div className="flex-1 min-h-[200px]">
                  <ChartContainer
                    config={{
                      events: {
                        label: t("Clicks", "ক্লিক"),
                        color: "var(--fq-accent)",
                      },
                    }}
                    className="h-full w-full"
                  >
                    <BarChart
                      data={trafficData.sources}
                      layout="vertical"
                      margin={{ left: 24 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="key"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={80}
                      />
                      <ChartTooltip
                        cursor={{ fill: "transparent" }}
                        content={<ChartTooltipContent />}
                      />
                      <Bar
                        dataKey="events"
                        fill="var(--color-events)"
                        radius={[0, 4, 4, 0]}
                        barSize={24}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("No traffic data yet.", "এখনো কোনো ট্রাফিক ডেটা নেই।")}
                </p>
              )}
            </section>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            VAT collected in period:{" "}
            {fmtMinor(data.totals.vatMinorInt, currency)} · from legal year rate
            tables.
          </p>
        </>
      )}
    </div>
  );
}
