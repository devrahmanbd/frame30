import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { analyticsTrafficFn } from "@/lib/analytics.functions";
import { TrendChart } from "@/components/admin/TrendChart";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

const RANGES = [
  { days: 7, en: "7 days", bn: "৭ দিন" },
  { days: 30, en: "30 days", bn: "৩০ দিন" },
  { days: 90, en: "90 days", bn: "৯০ দিন" },
] as const;

const COUNTRY_NAMES: Record<string, string> = {
  BD: "Bangladesh",
  IN: "India",
  PK: "Pakistan",
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  MY: "Malaysia",
  SG: "Singapore",
  AU: "Australia",
  CA: "Canada",
  DE: "Germany",
  ZZ: "Unknown",
};

function Bars({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { key: string; label?: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="fq-card fq-edge-inner p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.label ?? r.key}</span>
                <span className="fq-num shrink-0 text-muted-foreground">{r.value.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((r.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Where visits come from and what they do: visitors, clicks, countries and
 * regions, devices, referral sources and the shopping funnel. Every number is
 * counted server-side from pseudonymised events — no shopper is identifiable.
 */
export function Traffic() {
  const { t } = useLang();
  const [days, setDays] = useState<number>(30);
  const fetchTraffic = useServerFn(analyticsTrafficFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "traffic", days],
    queryFn: () => fetchTraffic({ data: { rangeDays: days } }),
    placeholderData: (prev) => prev,
  });

  const currency = "BDT";
  const funnel = data?.funnel;
  const steps = funnel
    ? [
        { label: t("Product views", "পণ্য দেখা"), value: funnel.productViews },
        { label: t("Added to cart", "কার্টে যোগ"), value: funnel.cartAdds },
        { label: t("Checkout started", "চেকআউট শুরু"), value: funnel.checkouts },
        { label: t("Orders placed", "অর্ডার সম্পন্ন"), value: funnel.orders },
      ]
    : [];
  const funnelMax = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight">
            {t("Traffic", "ট্রাফিক")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Visitors, clicks, countries and the path to checkout. Counted without storing anyone's identity.",
              "ভিজিটর, ক্লিক, দেশ এবং চেকআউট পর্যন্ত পথ। কারো পরিচয় সংরক্ষণ না করেই গোনা হয়।",
            )}
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-fq-md border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={`min-h-9 rounded-fq-md px-3 text-sm ${
                days === r.days
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t(r.en, r.bn)}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
          {(error as Error).message}
        </p>
      ) : null}

      {isLoading && !data ? (
        <div className="h-32 animate-pulse rounded-fq-md bg-muted/40" aria-busy />
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: t("Visitors", "ভিজিটর"), value: data.totals.visitors.toLocaleString() },
              { label: t("Sessions", "সেশন"), value: data.totals.sessions.toLocaleString() },
              { label: t("Events", "ইভেন্ট"), value: data.totals.events.toLocaleString() },
              { label: t("Clicks", "ক্লিক"), value: data.totals.clicks.toLocaleString() },
              { label: t("Orders", "অর্ডার"), value: data.totals.orders.toLocaleString() },
              {
                label: t("Revenue", "বিক্রি"),
                value: fmtMinor(data.totals.revenueMinorInt, currency),
              },
            ].map((k) => (
              <div key={k.label} className="fq-card fq-edge-inner p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="fq-num mt-1 text-lg font-semibold">{k.value}</p>
              </div>
            ))}
          </section>

          <section className="fq-card fq-edge-inner p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">{t("Visitors per day", "প্রতিদিনের ভিজিটর")}</h2>
              <span className="text-xs text-muted-foreground">
                {data.lastEventAt
                  ? `${t("Last activity", "সর্বশেষ কার্যক্রম")}: ${new Date(data.lastEventAt).toLocaleString()}`
                  : t("No activity recorded yet.", "এখনো কোনো কার্যক্রম নেই।")}
              </span>
            </div>
            {data.series.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t(
                  "Nothing yet. Numbers appear a few minutes after your storefront gets its first visit.",
                  "এখনো কিছু নেই। দোকানে প্রথম ভিজিটের কয়েক মিনিট পর সংখ্যা দেখা যাবে।",
                )}
              </p>
            ) : (
              <div className="mt-1">
                <TrendChart
                  label={t("Visitors", "ভিজিটর")}
                  points={data.series.map((p) => ({ date: p.day, value: p.visitors }))}
                  format={(v) => v.toLocaleString()}
                />
              </div>
            )}
          </section>

          <section className="fq-card fq-edge-inner p-4">
            <h2 className="text-sm font-semibold">{t("Path to checkout", "চেকআউট পর্যন্ত পথ")}</h2>
            <ul className="mt-3 space-y-2">
              {steps.map((s, i) => (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{s.label}</span>
                    <span className="fq-num text-muted-foreground">
                      {s.value.toLocaleString()}
                      {i > 0 && steps[i - 1]!.value > 0
                        ? ` · ${Math.round((s.value / steps[i - 1]!.value) * 100)}%`
                        : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((s.value / funnelMax) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bars
              title={t("Countries", "দেশ")}
              empty={t("No location data yet.", "এখনো লোকেশন তথ্য নেই।")}
              rows={data.countries.map((c) => ({
                key: c.key,
                label: `${COUNTRY_NAMES[c.key] ?? c.label} · ${fmtMinor(c.revenueMinorInt, currency)}`,
                value: c.visitors,
              }))}
            />
            <Bars
              title={t("Regions", "অঞ্চল")}
              empty={t("No region data yet.", "এখনো অঞ্চলের তথ্য নেই।")}
              rows={data.regions.map((r) => ({ key: r.key, label: r.label, value: r.visitors }))}
            />
            <Bars
              title={t("Devices", "ডিভাইস")}
              empty={t("No device data yet.", "এখনো ডিভাইস তথ্য নেই।")}
              rows={data.devices.map((d) => ({ key: d.key, value: d.events }))}
            />
            <Bars
              title={t("Where visits come from", "ভিজিট কোথা থেকে")}
              empty={t("No sources yet.", "এখনো কোনো উৎস নেই।")}
              rows={data.sources.map((s) => ({ key: s.key, value: s.events }))}
            />
            <Bars
              title={t("Most clicked", "সর্বাধিক ক্লিক")}
              empty={t("No clicks recorded yet.", "এখনো কোনো ক্লিক নেই।")}
              rows={data.clickTargets.map((c) => ({ key: c.key, value: c.events }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
