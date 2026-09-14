import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Filter, PackageSearch, AlertTriangle } from "lucide-react";
import { analyticsFunnelFn, analyticsAudienceFn } from "@/lib/analytics.functions";
import { PERSONA_LABELS, type Persona } from "@/lib/analytics-pipeline";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";


const RANGES = [7, 30, 90] as const;

function heat(retention: number) {
  if (retention >= 40) return "bg-primary text-primary-foreground";
  if (retention >= 20) return "bg-primary/60 text-primary-foreground";
  if (retention >= 8) return "bg-primary/30";
  if (retention > 0) return "bg-primary/15";
  return "bg-muted";
}

export function Insights() {
  const { t } = useLang();
  const [days, setDays] = useState<number>(30);
  const fetchFunnel = useServerFn(analyticsFunnelFn);
  const fetchAudience = useServerFn(analyticsAudienceFn);

  const funnelQuery = useQuery({
    queryKey: ["analytics-funnel", days],
    queryFn: () => fetchFunnel({ data: { days } }),
  });
  const audienceQuery = useQuery({
    queryKey: ["analytics-audience", days],
    queryFn: () => fetchAudience({ data: { days } }),
  });

  const funnel = funnelQuery.data?.funnel;
  const cohorts = funnelQuery.data?.cohorts;
  const personas = audienceQuery.data?.personas;
  const products = audienceQuery.data?.products;
  const currency = personas?.currency ?? products?.currency ?? "BDT";
  const error = (funnelQuery.error ?? audienceQuery.error) as Error | null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight">
            {t("Insights", "ইনসাইটস")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Funnel drop-off, retention cohorts, buyer personas and inventory aging — all from server rollups.",
              "ফানেল, রিটেনশন, পার্সোনা ও ইনভেন্টরি এজিং — সবই সার্ভারে হিসাব করা।",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Date range" className="inline-flex rounded-fq-md border border-border bg-card p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                aria-pressed={days === r}
                className={`min-h-9 rounded-fq-md px-3 text-sm transition-colors ${
                  days === r
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <Link
            to="/admin/analytics/reports"
            className="min-h-9 rounded-fq-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {t("Report builder", "রিপোর্ট বিল্ডার")}
          </Link>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
          {error.message}
        </p>
      )}

      <section aria-label="Conversion funnel" className="rounded-fq-lg border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-bangla-display text-sm font-semibold">{t("Conversion funnel", "কনভার্সন ফানেল")}</h2>
          {funnel && (
            <span className="ml-auto text-sm text-muted-foreground">
              {t("Conversion", "কনভার্সন")}: <strong className="text-foreground">{funnel.conversionRate}%</strong>
            </span>
          )}
        </div>

        {funnelQuery.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}

        {funnel && (
          <ol className="mt-4 space-y-2">
            {funnel.stages.map((stage) => (
              <li key={stage.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{stage.en}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {stage.count.toLocaleString()} · {stage.ofTop}%
                    {stage.dropOff > 0 && (
                      <span className={funnel.biggestLeak === stage.key ? "ml-2 text-danger-foreground" : "ml-2"}>
                        −{stage.dropOff.toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-3 rounded-fq-md bg-muted">
                  <div
                    className={`h-3 rounded-fq-md ${funnel.biggestLeak === stage.key ? "bg-danger" : "bg-primary"}`}
                    style={{ width: `${Math.max(1, stage.ofTop)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}

        {funnel && funnel.stages.every((s) => s.count === 0) && (
          <p className="mt-3 rounded-fq-md bg-muted p-3 text-sm text-muted-foreground">
            {t(
              "No behaviour events rolled up yet. Storefront beacons appear here after the next ETL run.",
              "এখনও কোনো ইভেন্ট রোলআপ হয়নি। পরের ETL রানের পরে দেখা যাবে।",
            )}
          </p>
        )}

        {funnel && funnel.channels.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Top sources", "টপ সোর্স")}
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {funnel.channels.map((c) => (
                <li key={c.source} className="rounded-fq-md bg-muted px-2 py-1 text-xs">
                  {c.source} · {c.events.toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-label="Retention cohorts" className="mt-6 rounded-fq-lg border border-border bg-card p-4 shadow-xs">
        <h2 className="font-bangla-display text-sm font-semibold">{t("Weekly cohorts", "সাপ্তাহিক কোহর্ট")}</h2>
        {cohorts && cohorts.weeks.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("No paid cohorts in range yet.", "এই সময়ে কোনো কোহর্ট নেই।")}
          </p>
        )}
        {cohorts && cohorts.weeks.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Weekly retention by cohort</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-1 pr-3">Cohort</th>
                  <th scope="col" className="py-1 pr-3">Size</th>
                  {Array.from({ length: cohorts.maxOffset + 1 }, (_, i) => (
                    <th key={i} scope="col" className="py-1 pr-2">W{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.rows.map((row) => (
                  <tr key={row.week} className="border-t border-border">
                    <th scope="row" className="py-1 pr-3 text-left font-medium">{row.week}</th>
                    <td className="py-1 pr-3 tabular-nums text-muted-foreground">{row.size}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.offset} className="py-1 pr-2">
                        <span className={`inline-block min-w-11 rounded-fq-md px-1 text-center text-xs tabular-nums ${heat(cell.retention)}`}>
                          {cell.retention}%
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-label="Buyer personas" className="rounded-fq-lg border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-bangla-display text-sm font-semibold">{t("Buyer personas", "বায়ার পার্সোনা")}</h2>
          </div>
          {personas && (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {personas.totalCustomers.toLocaleString()} {t("buyers", "ক্রেতা")}
                {personas.vipThresholdMinorInt > 0 &&
                  ` · VIP ≥ ${fmtMinor(personas.vipThresholdMinorInt, currency)}`}
              </p>
              <ul className="mt-3 space-y-2">
                {personas.breakdown.map((row) => {
                  const meta = PERSONA_LABELS[row.persona as Persona];
                  const share = personas.totalCustomers
                    ? Math.round((row.customers / personas.totalCustomers) * 100)
                    : 0;
                  return (
                    <li key={row.persona} className="rounded-fq-md border border-border p-2">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{meta.en}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {row.customers} · {share}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{meta.hint}</p>
                      <p className="mt-1 text-xs tabular-nums">
                        {fmtMinor(row.revenueMinorInt, currency)} · AOV {fmtMinor(row.aovMinorInt, currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section aria-label="Product performance" className="rounded-fq-lg border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <PackageSearch className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-bangla-display text-sm font-semibold">
              {t("Products & inventory aging", "প্রোডাক্ট ও ইনভেন্টরি এজিং")}
            </h2>
          </div>

          {products && (
            <>
              <ul className="mt-3 space-y-1">
                {products.top.slice(0, 6).map((row) => (
                  <li key={`${row.title}-${row.sku ?? ""}`} className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{row.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {row.units} · {fmtMinor(row.revenueMinorInt, currency)}
                    </span>
                  </li>
                ))}
                {products.top.length === 0 && (
                  <li className="text-sm text-muted-foreground">{t("No paid items in range.", "কোনো বিক্রি নেই।")}</li>
                )}
              </ul>

              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>{t("Stock age", "স্টক বয়স")}</span>
                  <span>{t("Tied-up", "আটকে থাকা")} {fmtMinor(products.aging.totalTiedUpMinorInt, currency)}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {products.aging.buckets.map((bucket) => (
                    <li key={bucket.key} className="flex justify-between text-sm">
                      <span>{bucket.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {bucket.units} {t("units", "ইউনিট")} · {fmtMinor(bucket.tiedUpMinorInt, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {products.deadVariants.length > 0 && (
                <div className="mt-4 rounded-fq-md bg-warning-soft p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-warning-foreground">
                    <AlertTriangle className="size-4" aria-hidden />
                    {t("Dead stock", "ডেড স্টক")} · {fmtMinor(products.aging.deadStockMinorInt, currency)}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-warning-foreground">
                    {products.deadVariants.slice(0, 5).map((row) => (
                      <li key={`${row.title}-${row.sku ?? ""}`} className="flex justify-between gap-3">
                        <span className="truncate">{row.title}</span>
                        <span className="shrink-0 tabular-nums">{row.stock} × {fmtMinor(row.tiedUpMinorInt, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
