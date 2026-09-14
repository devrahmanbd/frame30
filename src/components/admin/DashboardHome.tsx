/**
 * Phase 8 — the dashboard's decision surface, split into three parts that the
 * route composes: today's numbers with deltas, the "needs you" queue and the
 * live activity feed. `DashboardHome` keeps the onboarding arrangement.
 */
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dashboardHomeFn } from "@/lib/dashboard.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

export type HomeData = Awaited<ReturnType<typeof dashboardHomeFn>>;

function Delta({ pct, onSignal = false }: { pct: number; onSignal?: boolean }) {
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  const tone = onSignal
    ? "text-primary-foreground/90"
    : pct > 0
      ? "text-success-foreground"
      : pct < 0
        ? "text-danger"
        : "text-muted-foreground";
  return (
    <span className={`fq-chip fq-num ${tone}`}>
      <Icon className="size-3.5" aria-hidden />
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

/**
 * Density 1 — asymmetric: one hero metric on the signal plate, two supporting
 * numbers stacked beside it. One loud surface per screen, never three.
 */
export function TodayStrip({ data }: { data: HomeData }) {
  const { t } = useLang();
  const c = data.currency;
  const vs = t("vs same weekday last week", "গত সপ্তাহের একই দিনের তুলনায়");
  const side = [
    {
      label: t("Orders today", "আজকের অর্ডার"),
      value: String(data.strip.orders.value),
      pct: data.strip.orders.deltaPct,
    },
    {
      label: t("Average order value", "গড় অর্ডার মূল্য"),
      value: fmtMinor(data.strip.aov.valueMinorInt, c),
      pct: data.strip.aov.deltaPct,
    },
  ];
  return (
    <section aria-label="Today" className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="fq-plate-signal fq-gridlines fq-halo fq-shine p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary-foreground/70">
          {t("Revenue today", "আজকের বিক্রি")}
        </p>
        <p className="fq-num mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          {fmtMinor(data.strip.revenue.valueMinorInt, c)}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <Delta pct={data.strip.revenue.deltaPct} onSignal />
          <span className="text-xs text-primary-foreground/70">{vs}</span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {side.map((k) => (
          <div key={k.label} className="fq-card fq-card-interactive fq-beam fq-dots fq-hover-spotlight fq-edge-inner p-4">
            <p className="text-xs fq-sub">{k.label}</p>
            <p className="fq-num mt-1 text-2xl font-semibold tracking-tight">{k.value}</p>
            <p className="mt-2 flex items-center gap-2">
              <Delta pct={k.pct} />
              <span className="text-xs fq-sub">{vs}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Density 2 — the work waiting for a decision. */
export function NeedsQueue({ data }: { data: HomeData }) {
  const { t } = useLang();
  const c = data.currency;
  return (
    <section aria-label="Needs you" className="fq-card fq-beam fq-hover-spotlight fq-edge-inner p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        {t("Needs you", "আপনার দরকার")}
        {data.needs.length > 0 ? (
          <span className="fq-chip fq-num ml-auto text-muted-foreground">{data.needs.length}</span>
        ) : null}
      </h2>
      {data.needs.length === 0 ? (
        <p className="mt-3 text-sm fq-sub">
          {t("Nothing waiting. Add a product to keep momentum.", "কিছুই অপেক্ষা করছে না। নতুন পণ্য যোগ করুন।")}
        </p>
      ) : (
        <ul className="fq-divide-soft mt-2 text-sm">
          {data.needs.slice(0, 6).map((n) => (
            <li
              key={n.id}
              className="fq-row-accent -mx-2 flex items-center justify-between gap-3 rounded-fq-md px-3 py-2.5 transition-colors hover:bg-accent/60"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{t(n.titleEn, n.titleBn)}</p>
                <p className="truncate text-xs fq-sub">
                  {t(n.detailEn, n.detailBn)}
                  {n.amountMinorInt !== undefined ? ` · ${fmtMinor(n.amountMinorInt, c)}` : ""}
                </p>
              </div>
              <Link
                to={n.to}
                className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                {t(n.actionEn, n.actionBn)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Density 3 — ambient: what just happened. */
export function LiveActivity({ data }: { data: HomeData }) {
  const { t } = useLang();
  const c = data.currency;
  return (
    <section aria-label="Live activity" className="fq-card fq-beam fq-hover-spotlight fq-edge-inner p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        {t("Live activity", "লাইভ কার্যক্রম")}
      </h2>
      {data.feed.length === 0 ? (
        <p className="mt-3 text-sm fq-sub">{t("No activity yet.", "এখনো কিছু হয়নি।")}</p>
      ) : (
        <ul className="fq-divide-soft mt-2 text-sm">
          {data.feed.slice(0, 8).map((f) => (
            <li key={f.id} className="flex items-baseline justify-between gap-3 py-2">
              <Link to={f.to} className="flex min-h-8 min-w-0 items-center truncate hover:text-primary hover:underline">
                {t(f.titleEn, f.titleBn)}
              </Link>
              <span className="fq-num shrink-0 text-xs fq-sub">
                {new Date(f.at).toLocaleTimeString()}
                {f.amountMinorInt !== undefined ? ` · ${fmtMinor(f.amountMinorInt, c)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-busy>
      <div className="h-[152px] animate-pulse rounded-fq-lg border border-border bg-muted/50" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {[0, 1].map((i) => (
          <div key={i} className="h-[70px] animate-pulse rounded-fq-lg border border-border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

/** Keeps the live feed fresh without a poll loop. */
export function useHomeRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "home"] });
    };
    // Unique per mount: reusing one name lets StrictMode's double-effect (or a
    // second subscriber) attach listeners to an already-subscribed channel.
    const channel = supabase
      .channel(`admin-home-feed:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "subscribers" }, invalidate)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function DashboardHome() {
  const load = useServerFn(dashboardHomeFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "home"],
    queryFn: () => load(),
    refetchOnWindowFocus: true,
  });
  useHomeRealtime();

  if (error) {
    return (
      <p role="alert" className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
        {(error as Error).message}
      </p>
    );
  }
  if (isLoading || !data) return <DashboardSkeleton />;

  return (
    <div className="space-y-4">
      <TodayStrip data={data} />
      <NeedsQueue data={data} />
      <LiveActivity data={data} />
    </div>
  );
}

export function useDashboardOnboarding() {
  const load = useServerFn(dashboardHomeFn);
  return useQuery({ queryKey: ["admin", "home"], queryFn: () => load() });
}
