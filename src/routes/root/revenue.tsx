import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { ownerRevenueFn } from "@/lib/owner.functions";
import { formatMinor } from "@/lib/revenue";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/revenue")({
  head: () => ({
    meta: [
      { title: "Platform revenue — Framique owner console" },
      {
        name: "description",
        content:
          "Recurring revenue, ARPA, plan mix and trailing logo churn for every Framique tenant, computed from stored plan prices in integer minor units.",
      },
      { property: "og:title", content: "Platform revenue — Framique owner console" },
      {
        property: "og:description",
        content: "MRR, ARR, ARPA, plan mix and 30/90-day churn across all tenants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RevenueDesk,
});

const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

function RevenueDesk() {
  const { t } = useLang();
  const load = useServerFn(ownerRevenueFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-revenue"],
    queryFn: () => load(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Loading platform revenue…", "প্ল্যাটফর্ম রেভিনিউ লোড হচ্ছে…")}
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {t("Revenue is owner-only and could not be read.", "রেভিনিউ শুধু ওনারের জন্য, পড়া যায়নি।")}
      </p>
    );
  }

  const s = data.snapshot;
  return (
    <section className="space-y-6">
      <OwnerHeader
        title={t("Platform revenue", "প্ল্যাটফর্ম রেভিনিউ")}
        subtitle={t(
          "Computed live from subscriptions and stored plan prices. Amounts stay in integer minor units; foreign-currency contracts are reported separately, never converted here.",
          "সাবস্ক্রিপশন ও সংরক্ষিত প্ল্যান প্রাইস থেকে লাইভ হিসাব। অঙ্ক পূর্ণসংখ্যা মাইনর ইউনিটে থাকে; ভিন্ন মুদ্রার চুক্তি আলাদা দেখানো হয়, এখানে রূপান্তর হয় না।",
        )}
      />

      <StatGrid>
        <StatCard label={t("MRR", "এমআরআর")} value={formatMinor(s.mrrMinorInt, s.currencyCode)} />
        <StatCard label={t("ARR", "এআরআর")} value={formatMinor(s.arrMinorInt, s.currencyCode)} />
        <StatCard label={t("ARPA", "গড় আয় / টেন্যান্ট")} value={formatMinor(s.arpaMinorInt, s.currencyCode)} />
        <StatCard label={t("Paying tenants", "পেইং টেন্যান্ট")} value={String(s.paying)} />
      </StatGrid>

      <StatGrid>
        <StatCard label={t("Trialing", "ট্রায়ালে")} value={String(s.trialing)} />
        <StatCard label={t("Past due", "বকেয়া")} value={String(s.pastDue)} />
        <StatCard label={t("Paused", "পজড")} value={String(s.paused)} />
        <StatCard label={t("Suspended tenants", "সাসপেন্ডেড টেন্যান্ট")} value={String(data.tenants.suspended)} />
      </StatGrid>

      <div className="grid gap-4 sm:grid-cols-2">
        {[data.churn30, data.churn90].map((c) => (
          <article key={c.windowDays} className="rounded-fq-md border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(`Logo churn — ${c.windowDays} days`, `লোগো চার্ন — ${c.windowDays} দিন`)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{pct(c.rate)}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {t(
                `${c.cancelled} cancelled of ${c.atRiskStart} at risk at window start`,
                `উইন্ডো শুরুতে ঝুঁকিতে ${c.atRiskStart}, বাতিল ${c.cancelled}`,
              )}
            </p>
            {c.atRiskStart === 0 ? (
              <p className="mt-2">
                <StatePill tone="warn">
                  {t("Not enough history", "যথেষ্ট ইতিহাস নেই")}
                </StatePill>
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("Plan mix", "প্ল্যান মিক্স")}</h3>
        <OwnerTable
          head={[
            t("Plan", "প্ল্যান"),
            t("Paying", "পেইং"),
            t("MRR", "এমআরআর"),
            t("Share", "অংশ"),
          ]}
        >
          {s.perPlan.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-sm text-muted-foreground">
                {t("No billing subscriptions yet.", "এখনো কোনো বিলিং সাবস্ক্রিপশন নেই।")}
              </td>
            </tr>
          ) : (
            s.perPlan.map((p) => (
              <tr key={p.plan} className="border-t border-border">
                <td className="px-3 py-2">{p.title}</td>
                <td className="px-3 py-2 tabular-nums">{p.paying}</td>
                <td className="px-3 py-2 tabular-nums">{formatMinor(p.mrrMinorInt, s.currencyCode)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {s.mrrMinorInt ? `${Math.round((p.mrrMinorInt / s.mrrMinorInt) * 100)}%` : "—"}
                </td>
              </tr>
            ))
          )}
        </OwnerTable>
      </div>

      {s.mixedCurrencies.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            `Excluded from MRR — contracts in ${s.mixedCurrencies.join(", ")} are not converted on this desk.`,
            `এমআরআর থেকে বাদ — ${s.mixedCurrencies.join(", ")} মুদ্রার চুক্তি এখানে রূপান্তর করা হয় না।`,
          )}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("Snapshot taken", "স্ন্যাপশট নেওয়া হয়েছে")}: {new Date(data.generatedAt).toLocaleString()}
      </p>
    </section>
  );
}
