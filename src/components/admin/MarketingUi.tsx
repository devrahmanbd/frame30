import { useState } from "react";
import { useLang } from "@/lib/i18n";

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const map: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground border-border",
    success: "bg-success-soft text-success-foreground border-success",
    warning: "bg-warning-soft text-warning-foreground border-warning",
    danger: "bg-danger-soft text-danger-foreground border-danger",
    info: "bg-accent text-accent-foreground border-primary",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${map[tone]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Money({ minor, className = "" }: { minor: number; className?: string }) {
  const major = Math.trunc(minor) / 100;
  return (
    <span className={`tabular-nums ${className}`}>
      ৳ {major.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "fq-focus-glow w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const btnPrimary =
  "fq-shine inline-flex min-h-10 items-center justify-center rounded-fq-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50";

export const btnGhost =
  "inline-flex min-h-9 items-center justify-center rounded-fq-md border border-border px-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50";

export function ErrorFrame({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-foreground"
    >
      {message}
    </p>
  );
}

export function CopyLink({ value }: { value: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={btnGhost}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={`Copy ${value}`}
    >
      {copied ? t("Copied", "কপি হয়েছে") : t("Copy", "কপি করুন")}
    </button>
  );
}
