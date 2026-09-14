import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import {
  DashboardHome,
  DashboardSkeleton,
  LiveActivity,
  NeedsQueue,
  TodayStrip,
  useDashboardOnboarding,
  useHomeRealtime,
} from "@/components/admin/DashboardHome";
import { TrendChart } from "@/components/admin/TrendChart";
import { analyticsFn } from "@/lib/analytics.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Framique Admin" },
      {
        name: "description",
        content:
          "Merchant dashboard with BDT revenue, orders, average order value and COD exposure at a glance.",
      },
      { property: "og:title", content: "Framique Admin Dashboard" },
      {
        property: "og:description",
        content:
          "Track revenue, orders, AOV, conversion and COD pending for your Bangladeshi store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

/**
 * Phase 8 — a decision surface, not a metric wall. Three densities only:
 * 1. today's numbers with a delta each,
 * 2. what needs a decision + the single revenue trend,
 * 3. ambient live activity, with the secondary totals as one quiet footnote row.
 */
function Dashboard() {
  const { t } = useLang();
  const fetchAnalytics = useServerFn(analyticsFn);
  const { data: home, isLoading: homeLoading, error: homeError } = useDashboardOnboarding();
  useHomeRealtime();
  const onboarding = home?.onboarding ?? false;

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "7d"],
    queryFn: () => fetchAnalytics({ data: { range: "7d" as const } }),
    enabled: !homeLoading && !onboarding,
  });

  const currency = data?.currency ?? home?.currency ?? "BDT";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Dashboard", "ড্যাশবোর্ড")}</h1>
          <p className="mt-1 text-[13px] fq-sub">
            {onboarding
              ? t(
                  "Getting started · analytics unlock after your first orders.",
                  "শুরু করুন · প্রথম অর্ডারের পর অ্যানালিটিক্স চালু হবে।",
                )
              : `Today, then the last 7 days · ${currency}, recomputed server-side.`}
          </p>
        </div>
        <Link
          to="/admin/analytics"
          className="inline-flex min-h-9 items-center fq-shine rounded-fq-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"
        >
          {t("Full analytics", "বিস্তারিত অ্যানালিটিক্স")}
        </Link>
      </header>

      <SetupChecklist />

      {homeError ? (
        <p role="alert" className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
          {(homeError as Error).message}
        </p>
      ) : null}

      {onboarding ? (
        <DashboardHome />
      ) : (
        <>
          {homeLoading || !home ? <DashboardSkeleton /> : <TodayStrip data={home} />}

          {/* Asymmetric: a wide analysis column, a narrow decision rail. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-4">
            <section aria-label="Revenue trend" className="fq-card fq-beam fq-hover-spotlight fq-edge-inner p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">{t("Revenue trend", "বিক্রির ধারা")}</h2>
                {data ? (
                  <span className="fq-num text-xs fq-sub">
                    {fmtMinor(data.totals.revenueMinorInt, currency)} ·{" "}
                    {data.totals.orderCount} {t("orders", "অর্ডার")}
                  </span>
                ) : null}
              </div>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {(error as Error).message}
                </p>
              ) : isLoading || !data ? (
                <div className="mt-3 h-[132px] animate-pulse rounded-fq-md bg-muted/40" aria-busy />
              ) : (
                <div className="mt-1">
                  <TrendChart
                    label={t("Revenue, last 7 days", "বিক্রি, শেষ ৭ দিন")}
                    points={data.series.map((p) => ({ date: p.date, value: p.revenueMinorInt }))}
                    format={(v) => fmtMinor(v, currency)}
                  />
                </div>
              )}
            </section>

            <section aria-label="Top products" className="fq-card fq-beam fq-hover-spotlight fq-edge-inner p-4">
              <h2 className="text-sm font-semibold">
                {t("Top products (7 days)", "সেরা পণ্য (৭ দিন)")}
              </h2>
              {!data || data.topProducts.length === 0 ? (
                <p className="mt-3 text-sm fq-sub">{t("No sales yet.", "এখনো কোনো বিক্রি নেই।")}</p>
              ) : (
                <ul className="mt-2 divide-y divide-border text-sm">
                  {data.topProducts.slice(0, 5).map((p) => (
                    <li key={p.title} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">{p.title}</span>
                      <span className="fq-num shrink-0 fq-sub">
                        {p.quantity} × · {fmtMinor(p.revenueMinorInt, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data ? (
            <section
              aria-label="Seven day totals"
              className="fq-card fq-edge-inner flex flex-wrap gap-x-8 gap-y-3 p-4 text-sm"
            >
              {[
                { label: t("COD pending", "COD পেন্ডিং"), value: `${fmtMinor(data.totals.codPendingMinorInt, currency)} · ${data.totals.codPendingCount}` },
                { label: t("Average order value", "গড় অর্ডার মূল্য"), value: fmtMinor(data.totals.aovMinorInt, currency) },
                { label: t("VAT collected", "ভ্যাট সংগৃহীত"), value: fmtMinor(data.totals.vatMinorInt, currency) },
                {
                  label: t("Cancelled / refunded", "বাতিল / রিফান্ড"),
                  value: `${data.totals.cancelledCount} / ${data.totals.refundedCount}`,
                },
              ].map((k) => (
                <div key={k.label}>
                  <p className="text-xs fq-sub">{k.label}</p>
                  <p className="fq-num mt-0.5 font-medium">{k.value}</p>
                </div>
              ))}
              </section>
            ) : null}
            </div>

            <div className="space-y-4">
              {home ? <NeedsQueue data={home} /> : null}
              {home ? <LiveActivity data={home} /> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
