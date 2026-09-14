import type { ReactNode } from "react";
import type { CampaignIntegrity, IntegritySummary } from "@/lib/ad-fraud";
import { fmtMinor } from "@/lib/money";

/**
 * Presentational layer for the ad-defense desk (§4.2). Pure rendering only —
 * the route owns loading, mutations and error handling. Every number that
 * costs the merchant money is shown next to the reason it was counted, because
 * "we blocked something" is worthless without "here is why, in your language".
 */

const gradeTone: Record<CampaignIntegrity["grade"], string> = {
  A: "border-success bg-success-soft text-success-strong",
  B: "border-success bg-success-soft text-success-strong",
  C: "border-warning bg-warning-soft text-warning-strong",
  D: "border-destructive bg-destructive/10 text-destructive",
  F: "border-destructive bg-destructive/10 text-destructive",
};

export function GradeBadge({ grade }: { grade: CampaignIntegrity["grade"] }) {
  return (
    <span
      aria-label={`Integrity grade ${grade}`}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${gradeTone[grade]}`}
    >
      {grade}
    </span>
  );
}

export function VerdictPill({ verdict }: { verdict: string }) {
  const tone =
    verdict === "invalid"
      ? "border-destructive bg-destructive/10 text-destructive"
      : verdict === "suspicious"
        ? "border-warning bg-warning-soft text-warning-strong"
        : "border-success bg-success-soft text-success-strong";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {verdict}
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-fq-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-fq-md border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Horizontal share bar: genuine vs suspicious vs refused clicks. */
export function TrafficSplit({ summary }: { summary: IntegritySummary }) {
  const total = Math.max(1, summary.clicks);
  const invalid = (summary.invalidClicks / total) * 100;
  const suspicious = (summary.suspiciousClicks / total) * 100;
  const valid = Math.max(0, 100 - invalid - suspicious);
  return (
    <div
      role="img"
      aria-label={`${summary.invalidClicks} refused, ${summary.suspiciousClicks} suspicious, ${
        summary.clicks - summary.invalidClicks - summary.suspiciousClicks
      } genuine clicks`}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <span className="bg-success" style={{ width: `${valid}%` }} />
      <span className="bg-warning" style={{ width: `${suspicious}%` }} />
      <span className="bg-destructive" style={{ width: `${invalid}%` }} />
    </div>
  );
}

export function CampaignTable({
  rows,
  emptyLabel,
  onBlock,
}: {
  rows: CampaignIntegrity[];
  emptyLabel: string;
  onBlock: (campaign: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Campaign attribution integrity</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Campaign</th>
            <th scope="col" className="py-2 pr-3 font-medium">Grade</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Clicks</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Refused</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Reported CPC</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">True CPC</th>
            <th scope="col" className="py-2 pr-3 font-medium text-right">Wasted</th>
            <th scope="col" className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.day}-${r.network}-${r.campaign}`} className="border-b border-border/60">
              <td className="py-2 pr-3">
                <span className="font-medium">{r.campaign}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.network} · {r.day}
                </span>
              </td>
              <td className="py-2 pr-3">
                <GradeBadge grade={r.grade} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.clicks}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {r.invalidClicks}
                <span className="ml-1 text-xs text-muted-foreground">({r.invalidRate}%)</span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {fmtMinor(r.reportedCpcMinorInt, r.currencyCode)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {fmtMinor(r.trueCpcMinorInt, r.currencyCode)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-destructive">
                {fmtMinor(r.wastedSpendMinorInt, r.currencyCode)}
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => onBlock(r.campaign)}
                  className="rounded-fq-sm border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  Block
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ExplainedSignal = {
  code: string;
  title: string;
  detail: string;
  weight: number;
  note?: string | null;
};

export function SignalList({ signals }: { signals: ExplainedSignal[] }) {
  if (signals.length === 0) {
    return <p className="text-xs text-muted-foreground">No risk signals fired.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {signals.map((s) => (
        <li key={s.code} className="text-xs">
          <span className="font-medium">{s.title}</span>
          <span className="ml-1 text-muted-foreground">{s.detail}</span>
        </li>
      ))}
    </ul>
  );
}
