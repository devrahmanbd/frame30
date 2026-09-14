import type { ReactNode } from "react";

/**
 * Presentational primitives for the developer platform screens. No data
 * fetching here — the route owns state so these stay trivially reusable.
 */

export function SectionCard({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-fq-md border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bangla-display text-base font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-fq-md border border-border bg-muted/40 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`min-h-9 rounded-fq-md px-3 text-sm transition ${
            active === tab.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Shown once after create/rotate: the plaintext is unrecoverable afterwards. */
export function SecretReveal({
  secret,
  note,
  onDismiss,
  copyLabel,
  closeLabel,
}: {
  secret: string;
  note: string;
  onDismiss: () => void;
  copyLabel: string;
  closeLabel: string;
}) {
  return (
    <div className="space-y-2 rounded-fq-md border border-success bg-success-soft p-4 text-sm">
      <p className="font-medium">{note}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded-fq-md bg-background px-2 py-1 font-mono text-xs">{secret}</code>
        <button
          type="button"
          className="min-h-9 rounded-fq-md border border-border bg-background px-3 text-sm"
          onClick={() => navigator.clipboard.writeText(secret)}
        >
          {copyLabel}
        </button>
        <button type="button" className="min-h-9 rounded-fq-md px-3 text-sm underline" onClick={onDismiss}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-fq-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  const tone =
    status === "delivered"
      ? "border-success bg-success-soft"
      : status === "dead"
        ? "border-danger bg-danger-soft"
        : status === "failed"
          ? "border-warning bg-warning-soft"
          : "border-border bg-muted";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tone}`}>{status}</span>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-fq-md border border-border bg-muted/50 p-3 text-xs leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}
