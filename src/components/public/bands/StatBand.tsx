/**
 * StatBand — the live numbers row.
 *
 * Integrity rule from the copy decks, enforced in the type: every figure is
 * either read from the database or omitted. There is no `fallback` prop and no
 * default value, so a page cannot quietly ship a placeholder that reads as a
 * real metric. When a value is unavailable the caller passes `null` and the
 * whole stat is dropped from the row rather than shown as "—", which a visitor
 * would read as "zero".
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Counter, Reveal, Stagger } from "@/components/public/motion";

export type BandStat = {
  id: string;
  label: ReactNode;
  /** Numeric value from the database, or null when it is not available. */
  value: number | null;
  /** Pre-formatted string (money, ratio) — used instead of the count-up. */
  display?: string | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: ReactNode;
};

export type StatBandProps = {
  stats: BandStat[];
  columns?: 3 | 4;
  className?: string;
};

export function StatBand({ stats, columns = 4, className }: StatBandProps) {
  const shown = stats.filter((stat) => stat.display != null || stat.value != null);
  if (shown.length === 0) return null;

  return (
    <Stagger
      className={cn(
        "grid grid-cols-2 gap-4",
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
    >
      {shown.map((stat) => (
        <Reveal key={stat.id} className="fq-glass fq-dots fq-hover-spotlight fq-edge-inner rounded-fq-lg p-6">
          <p data-type-role="numeral" className="fq-display text-3xl tabular-nums sm:text-4xl">
            {stat.display != null ? (
              <>
                {stat.prefix}
                {stat.display}
                {stat.suffix}
              </>
            ) : (
              <Counter
                to={stat.value as number}
                decimals={stat.decimals ?? 0}
                prefix={stat.prefix ?? ""}
                suffix={stat.suffix ?? ""}
              />
            )}
          </p>
          <p data-type-role="caption" className="mt-3 text-sm text-muted-foreground">{stat.label}</p>
          {stat.hint ? <p data-type-role="caption" className="mt-1 text-xs text-muted-foreground">{stat.hint}</p> : null}
        </Reveal>
      ))}
    </Stagger>
  );
}
