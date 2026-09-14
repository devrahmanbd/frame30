import type { ReactNode } from "react";

export function OwnerHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article
      aria-label={label}
      className="rounded-fq-md border border-border p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

/** Status is never colour-only: each state carries its own word and glyph. */
export function StatePill({ tone, children }: { tone: "ok" | "warn" | "bad"; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-primary/10 text-primary"
      : tone === "warn"
        ? "bg-muted text-foreground"
        : "bg-destructive/10 text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 rounded-fq-sm px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span aria-hidden>{tone === "ok" ? "✓" : tone === "warn" ? "•" : "!"}</span>
      {children}
    </span>
  );
}

export function FlagSwitch({
  label,
  hint,
  enabled,
  onLabel,
  offLabel,
  pending,
  onToggle,
}: {
  label: string;
  hint?: string;
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  pending: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-fq-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <StatePill tone={enabled ? "ok" : "bad"}>{enabled ? onLabel : offLabel}</StatePill>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={label}
          disabled={pending}
          onClick={() => onToggle(!enabled)}
          className="rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {enabled ? offLabel : onLabel}
        </button>
      </div>
    </div>
  );
}

export function OwnerTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-fq-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
