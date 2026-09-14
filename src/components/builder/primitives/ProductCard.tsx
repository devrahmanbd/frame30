/**
 * Phase 2.2 — the one product card.
 *
 * Every merchandising surface (grid, rail, deal strip, rank list, recently
 * viewed, quick view) renders this component, which is what keeps the widget
 * set shared across Bazaar, Atelier, Circuit and Rupaboti. It imports no theme
 * module: colours, radii and shadows come from semantic token classes.
 *
 * Money arrives as server-valued minor units and is only formatted here —
 * never computed.
 */
import { formatDisplayMoney, formatDisplayNumber } from "@/lib/money-display";
import type { Locale } from "@/lib/bitext";
import type { WidgetRow } from "@/lib/widget-data";
import { MediaFrame } from "./MediaFrame";

export type CardVariant = "standard" | "compact" | "wide" | "editorial";

const RATIO: Record<CardVariant, "square" | "landscape"> = {
  standard: "square",
  compact: "square",
  wide: "landscape",
  editorial: "landscape",
};

const PAD: Record<CardVariant, string> = {
  standard: "p-3",
  compact: "p-2",
  wide: "p-3",
  editorial: "p-4",
};

const TITLE: Record<CardVariant, string> = {
  standard: "text-sm font-medium",
  compact: "text-xs font-medium",
  wide: "text-sm font-medium",
  editorial: "text-base font-semibold",
};

/** Discount percentage from server-valued minor units. Display only. */
export function savePercent(priceMinor?: number, compareAtMinor?: number): number | null {
  if (!priceMinor || !compareAtMinor || compareAtMinor <= priceMinor) return null;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}

export function ProductCard({
  row,
  locale,
  variant = "standard",
  withPrice = true,
  rank,
  badgeLabel,
  promise,
  showRating = false,
  sponsored = false,
  eager = false,
}: {
  row: WidgetRow;
  locale: Locale;
  variant?: CardVariant;
  withPrice?: boolean;
  /** 1-based position, rendered as a numbered badge by `rank_list`. */
  rank?: number;
  badgeLabel?: string;
  promise?: string;
  showRating?: boolean;
  sponsored?: boolean;
  eager?: boolean;
}) {
  const save = savePercent(row.priceMinor, row.compareAtMinor);
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-fq-lg border border-border bg-card">
      {typeof rank === "number" && (
        <span className="absolute left-2 top-2 z-10 rounded-fq-sm bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
          {formatDisplayNumber(rank, { locale })}
        </span>
      )}
      {sponsored && (
        <span className="absolute right-2 top-2 z-10 rounded-fq-sm bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          {locale === "bn" ? "স্পনসর্ড" : "Sponsored"}
        </span>
      )}
      <MediaFrame src={row.imageUrl} alt={row.title} ratio={RATIO[variant]} className="rounded-none" eager={eager} />
      <div className={`flex min-w-0 flex-1 flex-col ${PAD[variant]}`}>
        <p className={`line-clamp-2 ${TITLE[variant]}`}>{row.title}</p>
        {row.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.subtitle}</p>}
        {withPrice && typeof row.priceMinor === "number" && (
          <p className="money mt-1 flex flex-wrap items-baseline gap-2 text-sm font-semibold">
            <span>{formatDisplayMoney(row.priceMinor, { locale, currency: row.currency ?? "BDT" })}</span>
            {typeof row.compareAtMinor === "number" && row.compareAtMinor > (row.priceMinor ?? 0) && (
              <s className="text-xs font-normal text-muted-foreground">
                {formatDisplayMoney(row.compareAtMinor, { locale, currency: row.currency ?? "BDT" })}
              </s>
            )}
            {save !== null && (
              <span className="rounded-fq-sm bg-success-soft px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums">
                {badgeLabel ? `${badgeLabel} ` : ""}
                {formatDisplayNumber(save, { locale })}%
              </span>
            )}
          </p>
        )}
        {showRating && (
          <p className="mt-1 text-xs text-muted-foreground" aria-hidden="true">
            ★★★★★
          </p>
        )}
        {promise && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{promise}</p>}
        {row.inStock === false && (
          <p className="mt-1 text-xs text-muted-foreground">{locale === "bn" ? "স্টক নেই" : "Out of stock"}</p>
        )}
      </div>
    </article>
  );
}

/** Box-model-identical placeholder. Same frame, same line heights, no shift. */
export function ProductCardSkeleton({
  variant = "standard",
  withPrice = true,
}: {
  variant?: CardVariant;
  withPrice?: boolean;
}) {
  const ratio = RATIO[variant] === "square" ? "aspect-square" : "aspect-[4/3]";
  return (
    <div className="overflow-hidden rounded-fq-lg border border-border bg-card" aria-hidden="true">
      <div className={`${ratio} animate-pulse bg-muted`} />
      <div className={`space-y-2 ${PAD[variant]}`}>
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        {withPrice && <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />}
      </div>
    </div>
  );
}
