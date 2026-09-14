import type { ReactNode } from "react";
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
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info bg-info-soft text-info-strong",
  success: "border-success bg-success-soft text-success-strong",
  warning: "border-warning bg-warning-soft text-warning-strong",
  danger: "border-destructive bg-destructive/10 text-destructive",
};

export function DomainStatusPill({ status, label }: { status: DomainStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass[statusTone(status)]}`}
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
    <ol className="flex flex-wrap items-center gap-2" aria-label={labels["progress"]}>
      {DOMAIN_STAGES.map((stage, i) => {
        const done = stage.reached.includes(status);
        const current = stage.key === status;
        return (
          <li key={stage.key} className="flex items-center gap-2">
            <span
              aria-current={current ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                current
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : done
                    ? "border-success bg-success-soft text-success-strong"
                    : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <span aria-hidden className="text-[10px]">
                {done && !current ? "✓" : i + 1}
              </span>
              {labels[stage.key] ?? stage.key}
            </span>
            {i < DOMAIN_STAGES.length - 1 && (
              <span aria-hidden className="h-px w-4 bg-border" />
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
  labels: { type: string; name: string; value: string; copy: string; optional: string };
}) {
  return (
    <div className="overflow-x-auto rounded-fq-md border border-border">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{labels.type}</th>
            <th className="px-3 py-2">{labels.name}</th>
            <th className="px-3 py-2">{labels.value}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.type}-${r.value}`} className="border-t border-border align-top">
              <td className="px-3 py-2 font-mono text-xs">
                {r.type}
                {!r.required && (
                  <span className="ml-1 text-[10px] text-muted-foreground">({labels.optional})</span>
                )}
              </td>
              <td className="break-all px-3 py-2 font-mono text-xs">{r.name}</td>
              <td className="break-all px-3 py-2 font-mono text-xs">{r.value}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="min-h-8 rounded-fq-md border border-border px-2 text-xs"
                  onClick={() => navigator.clipboard.writeText(r.value)}
                >
                  {labels.copy}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CertBadge({ health, labels }: { health: CertHealth; labels: Record<string, string> }) {
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
    health.daysLeft === null ? "" : ` · ${Math.max(health.daysLeft, 0)}${labels["days"] ?? "d"}`;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${toneClass[tone]}`}>
      {labels[health.state] ?? health.state}
      {suffix}
    </span>
  );
}

export function InlineNote({ tone, children }: { tone: DomainTone; children: ReactNode }) {
  return (
    <p className={`rounded-fq-md border px-3 py-2 text-xs ${toneClass[tone]}`}>{children}</p>
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
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{labels.title}</p>
      {observed.map((o) => (
        <p key={o.type} className="break-all font-mono">
          {o.type}: {o.values.length ? o.values.join(", ") : labels.none}
        </p>
      ))}
    </div>
  );
}
