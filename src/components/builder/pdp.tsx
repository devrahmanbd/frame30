/**
 * Phase 2.3 — product detail page widgets.
 *
 * Buy box, variant picker, delivery promise, stock line, rating summary,
 * review list, Q&A, seller card and the sticky buy bar. Every renderer reads
 * rows from the single batched data call, formats money from integer minor
 * units, and imports no theme module — one PDP widget set, every theme.
 */
import { useMemo, useState } from "react";
import type { WidgetRow } from "@/lib/widget-data";
import type { SectionType } from "@/lib/builder-ast";
import { formatDisplayNumber } from "@/lib/money-display";
import { rowSwatch } from "./beauty";
import { SkinToneBackdrop } from "./primitives/SkinToneBackdrop";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { Stars, HistogramBar, histogramPercents, clampRating } from "./primitives/Stars";
import { SwatchDot } from "./primitives/SwatchDot";
import { StickyBar, useDockedAfterScroll } from "./primitives/StickyBar";
import { Disclosure } from "./primitives/Disclosure";

/* ------------------------------------------------------------------ shared */

function Panel({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="rounded-fq-lg border border-border bg-card p-4">
      {children}
    </section>
  );
}

function Head({ ctx, fallback }: { ctx: WidgetCtx; fallback?: string }) {
  const text = ctx.str("heading") || fallback;
  if (!text) return null;
  return <ctx.Heading className="mb-3 text-lg font-semibold">{text}</ctx.Heading>;
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded-fq-sm bg-muted" />
      ))}
    </div>
  );
}

/** The variant a picker or buy box shows first: cheapest in-stock, else first. */
export function defaultVariant(rows: WidgetRow[] | undefined): WidgetRow | undefined {
  if (!rows || rows.length === 0) return undefined;
  const inStock = rows.filter((r) => r.inStock !== false);
  const pool = inStock.length > 0 ? inStock : rows;
  return pool.reduce((best, row) => ((row.priceMinor ?? 0) < (best.priceMinor ?? 0) ? row : best), pool[0]!);
}

/** Splits `Red / M` option paths into ordered, de-duplicated axes. */
export function variantAxes(rows: WidgetRow[]): string[][] {
  const axes: string[][] = [];
  for (const row of rows) {
    const parts = (row.options ?? row.title ?? "").split("/").map((p) => p.trim()).filter(Boolean);
    parts.forEach((part, i) => {
      const axis = (axes[i] ??= []);
      if (!axis.includes(part)) axis.push(part);
    });
  }
  return axes;
}

/** Aggregate published reviews into an average and a [1★…5★] histogram. */
export function reviewStats(rows: WidgetRow[]): { average: number; total: number; buckets: number[] } {
  const buckets = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const row of rows) {
    const value = Math.round(clampRating(row.rating));
    if (value >= 1 && value <= 5) buckets[value - 1]! += 1;
    sum += clampRating(row.rating);
  }
  const total = rows.length;
  return { average: total > 0 ? sum / total : 0, total, buckets };
}

/* ------------------------------------------------------------------ widgets */

const BuyBox: WidgetComponent = (ctx) => {
  const { str, bool, money, locale, data, slot } = ctx;
  const rows = data?.rows;
  const variant = defaultVariant(rows);
  const [qty, setQty] = useState(1);
  if (data?.pending) {
    return (
      <Panel label={locale === "bn" ? "কেনার প্যানেল" : "Buy box"}>
        <Skeleton lines={4} />
      </Panel>
    );
  }
  // With no bound product the host slot (live PDP data) still renders.
  if (!variant && slot) return <Panel>{slot}</Panel>;
  const compareAt = bool("showCompareAt") ? variant?.compareAtMinor : undefined;
  const soldOut = variant?.inStock === false;
  return (
    <Panel label={locale === "bn" ? "কেনার প্যানেল" : "Buy box"}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {money(variant?.priceMinor ?? 0, variant?.currency)}
        </span>
        {typeof compareAt === "number" && compareAt > (variant?.priceMinor ?? 0) && (
          <span className="text-sm text-muted-foreground line-through tabular-nums">
            {money(compareAt, variant?.currency)}
          </span>
        )}
      </div>
      {str("note") && <p className="mt-1 text-xs text-muted-foreground">{str("note")}</p>}
      {variant?.options && (
        <p className="mt-2 text-sm text-muted-foreground">{variant.options}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {bool("showQuantity") && (
          <span className="inline-flex items-center rounded-fq-md border border-border">
            <button
              type="button"
              className="h-11 w-11 text-lg"
              aria-label={locale === "bn" ? "কমান" : "Decrease quantity"}
              onClick={() => setQty((n) => Math.max(1, n - 1))}
            >
              −
            </button>
            <span className="w-10 text-center tabular-nums" aria-live="polite">
              {formatDisplayNumber(qty, { locale })}
            </span>
            <button
              type="button"
              className="h-11 w-11 text-lg"
              aria-label={locale === "bn" ? "বাড়ান" : "Increase quantity"}
              onClick={() => setQty((n) => Math.min(99, n + 1))}
            >
              +
            </button>
          </span>
        )}
        <button
          type="button"
          disabled={soldOut}
          className="h-11 flex-1 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {soldOut ? (locale === "bn" ? "স্টক নেই" : "Sold out") : str("label") || "Add to cart"}
        </button>
      </div>
      {str("promise") && <p className="mt-3 text-xs text-muted-foreground">{str("promise")}</p>}
    </Panel>
  );
};

const VariantPicker: WidgetComponent = (ctx) => {
  const { str, locale, data } = ctx;
  const rows = data?.rows ?? [];
  const mode = str("mode") || "chip";
  const [selected, setSelected] = useState<string | null>(null);
  const axes = useMemo(() => variantAxes(rows), [rows]);
  if (data?.pending) return <Skeleton lines={2} />;
  if (rows.length === 0) return null;
  const current = selected ?? defaultVariant(rows)?.id ?? rows[0]!.id;
  const labelOf = (row: WidgetRow) => row.options || row.title;

  if (mode === "dropdown") {
    return (
      <div>
        <Head ctx={ctx} />
        <label className="block text-sm">
          <span className="sr-only">{str("heading") || (locale === "bn" ? "অপশন" : "Option")}</span>
          <select
            className="h-11 w-full rounded-fq-md border border-border bg-card px-3"
            value={current}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rows.map((row) => (
              <option key={row.id} value={row.id} disabled={row.inStock === false}>
                {labelOf(row)}
                {row.inStock === false ? ` — ${locale === "bn" ? "স্টক নেই" : "sold out"}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (mode === "matrix" && axes.length >= 2) {
    return (
      <div>
        <Head ctx={ctx} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{str("heading") || "Variant matrix"}</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2 text-left font-medium">
                  {str("axisOneLabel") || (locale === "bn" ? "অপশন ১" : "Option 1")}
                </th>
                {axes[1]!.map((col) => (
                  <th key={col} scope="col" className="p-2 text-left font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axes[0]!.map((rowLabel) => (
                <tr key={rowLabel} className="border-t border-border">
                  <th scope="row" className="p-2 text-left font-normal">
                    {rowLabel}
                  </th>
                  {axes[1]!.map((col) => {
                    const match = rows.find((r) => (r.options ?? r.title) === `${rowLabel} / ${col}`);
                    return (
                      <td key={col} className="p-2">
                        <button
                          type="button"
                          disabled={!match || match.inStock === false}
                          aria-pressed={match?.id === current}
                          onClick={() => match && setSelected(match.id)}
                          className={`h-9 w-full rounded-fq-md border px-2 text-xs ${
                            match?.id === current ? "border-primary ring-1 ring-primary" : "border-border"
                          } disabled:opacity-40`}
                        >
                          {match
                            ? match.inStock === false
                              ? locale === "bn"
                                ? "স্টক নেই"
                                : "Sold out"
                              : locale === "bn"
                                ? "বেছে নিন"
                                : "Select"
                            : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Phase 2.8 — shade mode: swatches carry the name, and the chosen shade is
  // previewed against three skin tones because a swatch on white lies.
  if (mode === "shade") {
    const chosen = rows.find((row) => row.id === current) ?? rows[0];
    return (
      <div>
        <Head ctx={ctx} />
        <div role="radiogroup" aria-label={str("heading") || "Shades"} className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <SwatchDot
              key={row.id}
              value={rowSwatch(row)}
              label={labelOf(row)}
              selected={row.id === current}
              disabled={row.inStock === false}
              onSelect={() => setSelected(row.id)}
            />
          ))}
        </div>
        {chosen ? (
          <>
            <p className="mt-2 text-sm">{labelOf(chosen)}</p>
            <div className="mt-2">
              <SkinToneBackdrop
                value={rowSwatch(chosen)}
                label={locale === "bn" ? "ত্বকে শেড" : "Swatch on skin"}
                toneLabels={
                  locale === "bn" ? ["ফর্সা", "মাঝারি", "গাঢ়"] : ["Fair", "Medium", "Deep"]
                }
              />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <Head ctx={ctx} />
      <div role="radiogroup" aria-label={str("heading") || "Options"} className="flex flex-wrap gap-2">
        {rows.map((row) =>
          mode === "swatch" ? (
            <SwatchDot
              key={row.id}
              value={{ hex: row.swatch?.startsWith("#") ? row.swatch : undefined, image: row.imageUrl ?? undefined }}
              label={labelOf(row)}
              selected={row.id === current}
              disabled={row.inStock === false}
              onSelect={() => setSelected(row.id)}
            />
          ) : (
            <button
              key={row.id}
              type="button"
              role="radio"
              aria-checked={row.id === current}
              disabled={row.inStock === false}
              onClick={() => setSelected(row.id)}
              className={`h-11 rounded-fq-md border px-3 text-sm ${
                row.id === current ? "border-primary ring-1 ring-primary" : "border-border"
              } disabled:line-through disabled:opacity-40`}
            >
              {labelOf(row)}
            </button>
          ),
        )}
      </div>
    </div>
  );
};

const DeliveryPromise: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const zones: [string, string][] = [
    [str("insideLabel"), str("insideDays")],
    [str("outsideLabel"), str("outsideDays")],
  ];
  return (
    <Panel label={locale === "bn" ? "ডেলিভারি" : "Delivery"}>
      <Head ctx={ctx} fallback={locale === "bn" ? "ডেলিভারি" : "Delivery"} />
      <dl className="space-y-1 text-sm">
        {zones
          .filter(([label]) => Boolean(label))
          .map(([label, days]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{days}</dd>
            </div>
          ))}
      </dl>
      {str("note") && <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p>}
    </Panel>
  );
};

const StockDelivery: WidgetComponent = (ctx) => {
  const { str, int, locale, data } = ctx;
  if (data?.pending) return <Skeleton lines={1} />;
  const rows = data?.rows ?? [];
  if (rows.length === 0) return null;
  const stock = rows.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const low = int("lowStockAt", 5, 1, 100);
  const status =
    stock <= 0
      ? locale === "bn"
        ? "স্টক নেই"
        : "Out of stock"
      : stock <= low
        ? locale === "bn"
          ? `মাত্র ${formatDisplayNumber(stock, { locale })} টি বাকি`
          : `Only ${formatDisplayNumber(stock, { locale })} left`
        : locale === "bn"
          ? "স্টকে আছে"
          : "In stock";
  return (
    <p className="text-sm">
      <span className={stock <= 0 ? "text-destructive" : stock <= low ? "text-warning" : "text-success"}>
        {status}
      </span>
      {str("cutOff") && <span className="ml-2 text-muted-foreground">{str("cutOff")}</span>}
    </p>
  );
};

const RatingSummary: WidgetComponent = (ctx) => {
  const { bool, locale, data } = ctx;
  if (data?.pending) return <Skeleton lines={4} />;
  const rows = (data?.rows ?? []).filter((row) => !bool("verifiedOnly") || row.verified);
  const { average, total, buckets } = reviewStats(rows);
  if (total === 0) return null;
  const percents = histogramPercents(buckets);
  return (
    <Panel label={locale === "bn" ? "রেটিং" : "Ratings"}>
      <Head ctx={ctx} fallback={locale === "bn" ? "রেটিং" : "Customer ratings"} />
      <div className="flex items-center gap-3">
        <span className="text-3xl font-semibold tabular-nums">
          {formatDisplayNumber(Math.round(average * 10) / 10, { locale })}
        </span>
        <Stars rating={average} locale={locale} count={total} size="lg" />
      </div>
      {bool("showHistogram") && (
        <div className="mt-3 space-y-1">
          {[5, 4, 3, 2, 1].map((bucket) => (
            <HistogramBar key={bucket} bucket={bucket} percent={percents[bucket - 1] ?? 0} locale={locale} />
          ))}
        </div>
      )}
    </Panel>
  );
};

const ReviewList: WidgetComponent = (ctx) => {
  const { str, bool, int, locale, data } = ctx;
  const [verified, setVerified] = useState(false);
  if (data?.pending) return <Skeleton lines={5} />;
  const all = data?.rows ?? [];
  const filtered = all.filter((row) => (!bool("verifiedOnly") && !verified) || row.verified);
  const sort = str("sort") || "recent";
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "rating_desc") return clampRating(b.rating) - clampRating(a.rating);
    if (sort === "rating_asc") return clampRating(a.rating) - clampRating(b.rating);
    return String(b.date ?? "").localeCompare(String(a.date ?? ""));
  });
  const rows = sorted.slice(0, int("limit", 6, 1, 24));
  return (
    <section aria-label={locale === "bn" ? "রিভিউ" : "Reviews"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Head ctx={ctx} fallback={locale === "bn" ? "রিভিউ" : "Reviews"} />
        {!bool("verifiedOnly") && all.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            {locale === "bn" ? "শুধু যাচাইকৃত ক্রয়" : "Verified purchases only"}
          </label>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {str("emptyText") || (locale === "bn" ? "এখনো কোনো রিভিউ নেই।" : "No reviews yet.")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-fq-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Stars rating={row.rating} locale={locale} />
                <span className="text-sm font-medium">{row.title}</span>
                {row.verified && (
                  <span className="rounded-fq-sm bg-muted px-2 py-0.5 text-[0.65rem] fq-caps text-muted-foreground">
                    {locale === "bn" ? "যাচাইকৃত" : "Verified"}
                  </span>
                )}
              </div>
              {row.body && <p className="mt-1 text-sm text-muted-foreground">{row.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {row.subtitle}
                {row.date ? ` · ${new Date(row.date).toISOString().slice(0, 10)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const ProductQna: WidgetComponent = (ctx) => {
  const { str, locale, data } = ctx;
  const live = data?.rows ?? [];
  const authored = [1, 2, 3]
    .map((n) => ({ q: str(`q${n}`), a: str(`a${n}`) }))
    .filter((entry) => entry.q);
  const entries = live.length
    ? live.map((row) => ({ q: row.title, a: row.body ?? "" }))
    : authored;
  if (entries.length === 0) return null;
  return (
    <section aria-label={locale === "bn" ? "প্রশ্ন ও উত্তর" : "Questions and answers"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Head ctx={ctx} fallback={locale === "bn" ? "প্রশ্ন ও উত্তর" : "Questions and answers"} />
        {str("askLabel") && str("askHref") && (
          <a
            href={str("askHref")}
            className="inline-flex h-11 items-center rounded-fq-md border border-border px-3 text-sm"
          >
            {str("askLabel")}
          </a>
        )}
      </div>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <Disclosure key={`${entry.q}-${i}`} summary={entry.q}>
            <p className="text-sm text-muted-foreground">{entry.a}</p>
          </Disclosure>
        ))}
      </div>
    </section>
  );
};

const SellerCard: WidgetComponent = (ctx) => {
  const { str, int, locale } = ctx;
  if (!str("name")) return null;
  const rating = int("rating", 0, 0, 5);
  return (
    <Panel label={locale === "bn" ? "বিক্রেতা" : "Seller"}>
      <div className="flex items-center gap-3">
        {str("logoUrl") && (
          <img
            src={str("logoUrl")}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            className="h-12 w-12 rounded-fq-md border border-border object-cover"
          />

        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{str("name")}</p>
          {str("tagline") && <p className="truncate text-sm text-muted-foreground">{str("tagline")}</p>}
          {rating > 0 && <Stars rating={rating} locale={locale} />}
        </div>
      </div>
      {str("policy") && <p className="mt-2 text-xs text-muted-foreground">{str("policy")}</p>}
      {str("linkHref") && str("linkLabel") && (
        <a
          href={str("linkHref")}
          className="mt-3 inline-flex h-11 items-center rounded-fq-md border border-border px-3 text-sm"
        >
          {str("linkLabel")}
        </a>
      )}
    </Panel>
  );
};

const StickyBuyBar: WidgetComponent = (ctx) => {
  const { str, bool, int, money, locale, data, editing } = ctx;
  const docked = useDockedAfterScroll(int("dockAfter", 320, 0, 4000));
  const variant = defaultVariant(data?.rows);
  if (data?.pending || !variant) return null;
  // In the studio the bar is shown inline so it can be selected and edited.
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{variant.title}</p>
        {bool("showPrice") && (
          <p className="text-sm tabular-nums">{money(variant.priceMinor ?? 0, variant.currency)}</p>
        )}
      </div>
      <button
        type="button"
        disabled={variant.inStock === false}
        className="h-11 shrink-0 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {variant.inStock === false
          ? locale === "bn"
            ? "স্টক নেই"
            : "Sold out"
          : str("label") || "Add to cart"}
      </button>
    </>
  );
  if (editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-fq-lg border border-border bg-card px-4 py-2">
        {content}
      </div>
    );
  }
  return (
    <StickyBar visible={docked} label={locale === "bn" ? "দ্রুত কেনা" : "Quick buy"}>
      {content}
    </StickyBar>
  );
};

export const PDP_WIDGETS: Record<
  Extract<
    SectionType,
    | "buy_box"
    | "variant_picker"
    | "delivery_promise"
    | "stock_delivery"
    | "rating_summary"
    | "review_list"
    | "product_qna"
    | "seller_card"
    | "sticky_buy_bar"
  >,
  WidgetComponent
> = {
  buy_box: BuyBox,
  variant_picker: VariantPicker,
  delivery_promise: DeliveryPromise,
  stock_delivery: StockDelivery,
  rating_summary: RatingSummary,
  review_list: ReviewList,
  product_qna: ProductQna,
  seller_card: SellerCard,
  sticky_buy_bar: StickyBuyBar,
};
