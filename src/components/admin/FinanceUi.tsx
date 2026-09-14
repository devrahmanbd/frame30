import type { ReactNode } from "react";
import type { CredentialState } from "@/lib/provider-gate";
import type { PayoutState } from "@/lib/payouts";

/**
 * Presentational pieces for the money surfaces (provider sign-off, payouts,
 * USD pilot). Pure rendering — routes own fetching and mutations.
 */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info bg-info-soft text-info-strong",
  success: "border-success bg-success-soft text-success-strong",
  warning: "border-warning bg-warning-soft text-warning-strong",
  danger: "border-destructive bg-destructive/10 text-destructive",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function credentialTone(state: CredentialState): Tone {
  if (state === "live") return "success";
  if (state === "approved" || state === "in_review" || state === "submitted") return "info";
  if (state === "changes_requested") return "warning";
  if (state === "rejected" || state === "suspended" || state === "revoked") return "danger";
  return "neutral";
}

export function payoutTone(state: PayoutState): Tone {
  if (state === "paid") return "success";
  if (state === "approved" || state === "processing" || state === "requested") return "info";
  if (state === "failed" || state === "reversed") return "danger";
  return "neutral";
}

/** Evidence checklist progress rail. */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {done}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className={`block h-full rounded-full ${pct === 100 ? "bg-success" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Gate checklist: one row per named check with an explicit reason on failure. */
export function GateChecks({
  checks,
}: {
  checks: { key: string; ok: boolean; detail: string }[];
}) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.key} className="flex items-start gap-2 text-sm">
          <span
            aria-hidden
            className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
              c.ok ? "bg-success-soft text-success-strong" : "bg-destructive/10 text-destructive"
            }`}
          >
            {c.ok ? "✓" : "!"}
          </span>
          <span>
            <span className="font-medium capitalize">{c.key.replace(/_/g, " ")}</span>
            <span className="block text-xs text-muted-foreground">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  const value = (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className="tabular-nums">
      {currency === "BDT" ? "৳" : "$"}
      {value}
    </span>
  );
}

export function BalanceCard({
  labels,
  balance,
}: {
  labels: { available: string; gross: string; reserved: string; hold: string };
  balance: { grossMinor: number; reservedMinor: number; holdMinor: number; availableMinor: number };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {[
        { label: labels.available, minor: balance.availableMinor, strong: true },
        { label: labels.gross, minor: balance.grossMinor, strong: false },
        { label: labels.reserved, minor: balance.reservedMinor, strong: false },
        { label: labels.hold, minor: balance.holdMinor, strong: false },
      ].map((cell) => (
        <div key={cell.label} className="rounded-fq-md border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{cell.label}</p>
          <p className={cell.strong ? "text-xl font-semibold" : "text-lg"}>
            <Money minor={cell.minor} currency="BDT" />
          </p>
        </div>
      ))}
    </div>
  );
}

export function InlineAlert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p className={`rounded-fq-sm border px-3 py-2 text-sm ${toneClass[tone]}`} role="status">
      {children}
    </p>
  );
}
