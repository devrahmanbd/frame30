/**
 * Phase 2.3 — rating display primitive.
 *
 * One star row and one histogram bar, shared by `rating_summary`,
 * `review_list` and `ProductCard`. Imports no theme module; colour comes from
 * semantic token classes only. Numerals follow the render locale.
 */
import { formatDisplayNumber } from "@/lib/money-display";
import type { Locale } from "@/lib/bitext";

/** Clamp any incoming rating into the 0–5 display range. */
export function clampRating(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, value));
}

/** Histogram percentages for buckets [1★…5★]; total 0 yields all zeroes. */
export function histogramPercents(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  if (total <= 0) return counts.map(() => 0);
  return counts.map((n) => Math.round(((Number.isFinite(n) ? n : 0) / total) * 100));
}

export function Stars({
  rating,
  locale,
  count,
  size = "sm",
}: {
  rating: number | null | undefined;
  locale: Locale;
  count?: number;
  size?: "sm" | "lg";
}) {
  const value = clampRating(rating);
  const label =
    locale === "bn"
      ? `৫-এর মধ্যে ${formatDisplayNumber(Math.round(value * 10) / 10, { locale })}`
      : `${Math.round(value * 10) / 10} out of 5`;
  return (
    <span className={`inline-flex items-center gap-1 ${size === "lg" ? "text-base" : "text-xs"}`} aria-label={label}>
      <span aria-hidden="true" className="relative inline-block leading-none tracking-[0.1em] text-muted-foreground">
        <span>★★★★★</span>
        <span
          className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-warning"
          style={{ width: `${(value / 5) * 100}%` }}
        >
          ★★★★★
        </span>
      </span>
      <span className="tabular-nums text-muted-foreground">
        {formatDisplayNumber(Math.round(value * 10) / 10, { locale })}
        {typeof count === "number" && ` (${formatDisplayNumber(count, { locale })})`}
      </span>
    </span>
  );
}

export function HistogramBar({
  bucket,
  percent,
  locale,
}: {
  bucket: number;
  percent: number;
  locale: Locale;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
        {formatDisplayNumber(bucket, { locale })}★
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-fq-sm bg-muted">
        <span className="block h-full bg-warning" style={{ width: `${percent}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
        {formatDisplayNumber(percent, { locale })}%
      </span>
    </div>
  );
}
