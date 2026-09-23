import { useState, type ReactNode } from "react";
import {
  DOMAIN_STAGES,
  statusTone,
  type CertHealth,
  type DnsRecord,
  type DomainStatus,
  type DomainTone,
} from "@/lib/domains";

/**
 * Presentational pieces for the custom-domain screen. Pure rendering — the
 * route owns fetching and mutations.
 */

const toneClass: Record<DomainTone, string> = {
  neutral:
    "border-border bg-muted text-foreground",
  info: "border-info/40 bg-info-soft text-info-foreground font-medium",
  success:
    "border-success/40 bg-success-soft text-success-foreground font-medium",
  warning:
    "border-warning/50 bg-warning-soft text-warning-foreground font-medium",
  danger: "border-danger/40 bg-danger-soft text-danger-foreground font-medium",
};

export function DomainStatusPill({
  status,
  label,
}: {
  status: DomainStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-2xs ${toneClass[statusTone(status)]}`}
    >
      {label}
    </span>
  );
}

/** Horizontal progress rail: pending → verifying → verified → cert → live. */
export function DomainProgress({
  status,
  labels,
}: {
  status: DomainStatus;
  labels: Record<string, string>;
}) {
  return (
    <ol
      className="flex flex-wrap items-center gap-2"
      aria-label={labels["progress"]}
    >
      {DOMAIN_STAGES.map((stage, i) => {
        const done = stage.reached.includes(status);
        const current = stage.key === status;
        return (
          <li key={stage.key} className="flex items-center gap-2">
            <span
              aria-current={current ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                current
                  ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs"
                  : done
                    ? "border-emerald-400/80 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                    : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <span aria-hidden className="text-[10px] font-bold">
                {done && !current ? "✓" : i + 1}
              </span>
              {labels[stage.key] ?? stage.key}
            </span>
            {i < DOMAIN_STAGES.length - 1 && (
              <span
                aria-hidden
                className="h-0.5 w-4 rounded-full bg-border"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** DNS records to copy into the registrar, with per-row copy buttons. */
export function DnsRecordTable({
  records,
  labels,
}: {
  records: DnsRecord[];
  labels: {
    type: string;
    name: string;
    value: string;
    copy: string;
    optional: string;
  };
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto rounded-fq-md border border-border/80 bg-card shadow-xs">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="border-b border-border/80 bg-muted text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3.5 py-2.5">{labels.type}</th>
            <th className="px-3.5 py-2.5">{labels.name}</th>
            <th className="px-3.5 py-2.5">{labels.value}</th>
            <th className="px-3.5 py-2.5 text-right w-24" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {records.map((r, i) => (
            <tr
              key={`${r.type}-${r.value}`}
              className="align-top transition-colors hover:bg-muted/40"
            >
              <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-foreground">
                {r.type}
                {!r.required && (
                  <span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground">
                    ({labels.optional})
                  </span>
                )}
              </td>
              <td className="break-all px-3.5 py-2.5 font-mono text-xs text-foreground select-all">
                {r.name}
              </td>
              <td className="break-all px-3.5 py-2.5 font-mono text-xs text-foreground select-all">
                {r.value}
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <button
                  type="button"
                  className="inline-flex min-h-7 items-center justify-center rounded-fq-md border border-border/80 bg-background px-2.5 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted hover:border-foreground/30 active:scale-95"
                  onClick={() => {
                    void navigator.clipboard.writeText(r.value).then(() => {
                      setCopiedIndex(i);
                      setTimeout(() => setCopiedIndex(null), 1500);
                    });
                  }}
                >
                  {copiedIndex === i ? "✓ Copied" : labels.copy}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CertBadge({
  health,
  labels,
}: {
  health: CertHealth;
  labels: Record<string, string>;
}) {
  const tone: DomainTone =
    health.state === "ok"
      ? "success"
      : health.state === "renew_soon"
        ? "info"
        : health.state === "none"
          ? "neutral"
          : health.state === "expiring"
            ? "warning"
            : "danger";
  const suffix =
    health.daysLeft === null
      ? ""
      : ` · ${Math.max(health.daysLeft, 0)}${labels["days"] ?? "d"}`;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-2xs ${toneClass[tone]}`}
    >
      {labels[health.state] ?? health.state}
      {suffix}
    </span>
  );
}

export function InlineNote({
  tone,
  children,
}: {
  tone: DomainTone;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-fq-md border px-3.5 py-2.5 text-xs leading-relaxed font-medium shadow-2xs ${toneClass[tone]}`}
    >
      {children}
    </div>
  );
}

export function ObservedRecords({
  observed,
  labels,
}: {
  observed: { type: string; values: string[] }[];
  labels: { title: string; none: string };
}) {
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">{labels.title}</p>
      {observed.map((o) => (
        <p key={o.type} className="break-all font-mono text-foreground/90">
          <span className="font-semibold text-foreground">{o.type}:</span>{" "}
          {o.values.length ? o.values.join(", ") : labels.none}
        </p>
      ))}
    </div>
  );
}
