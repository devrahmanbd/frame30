import type { LucideIcon } from "lucide-react";

type Tone = "info" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  info: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-danger-soft text-danger-foreground",
};

const deltaText: Record<Tone, string> = {
  info: "text-muted-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

export function fmtBDT(amountMinor: number) {
  const taka = Math.round(amountMinor / 100);
  return `৳ ${taka.toLocaleString("en-BD")}`;
}

export function KpiCard({
  label,
  labelBn,
  value,
  delta,
  tone = "info",
  icon: Icon,
}: {
  label: string;
  labelBn: string;
  value: string;
  delta?: { text: string; tone: Tone };
  tone?: Tone;
  icon: LucideIcon;
}) {
  return (
    <article className="fq-card fq-card-interactive fq-beam fq-dots fq-hover-spotlight fq-edge-inner p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bangla-display min-w-0 truncate text-[13px] font-medium text-muted-foreground">
          {labelBn}
        </h3>
        <span className={`grid size-7 shrink-0 place-items-center rounded-fq-md ${toneClass[tone]}`}>
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <p className="money mt-2 text-[26px] font-semibold leading-tight tracking-tight">{value}</p>
      {delta && (
        <p className={`mt-1.5 text-xs font-medium ${deltaText[delta.tone]}`}>{delta.text}</p>
      )}
      <span className="sr-only">{label}</span>
    </article>
  );
}
