/**
 * Phase 2.2 — merchandising widgets.
 *
 * Rails, deals, sponsored placements, brand walls, compare and rank lists.
 * All of them render the shared `ProductCard` and `Rail` primitives, take
 * their rows from the single batched data call, and import no theme module —
 * one widget set, four themes.
 */
import type { SectionType } from "@/lib/builder-ast";
import { resolveSkin } from "@/lib/builder-ast";
import { formatDisplayNumber } from "@/lib/money-display";
import type { WidgetRow } from "@/lib/widget-data";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { DataTable } from "./primitives/DataTable";
import { MediaFrame } from "./primitives/MediaFrame";
import {
  ProductCard,
  ProductCardSkeleton,
  type CardVariant,
} from "./primitives/ProductCard";
import { Rail } from "./primitives/Rail";

const CARD_VARIANTS = new Set<CardVariant>([
  "standard",
  "compact",
  "wide",
  "editorial",
]);

export function cardVariantOf(
  value: string,
  fallback: CardVariant = "standard",
): CardVariant {
  return CARD_VARIANTS.has(value as CardVariant)
    ? (value as CardVariant)
    : fallback;
}

const GRID_COLUMNS: Record<number, string> = {
  2: "grid grid-cols-2",
  3: "grid grid-cols-2 sm:grid-cols-3",
  4: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
};

function SectionHeading({ ctx }: { ctx: WidgetCtx }) {
  const { str, Heading } = ctx;
  if (!str("heading")) return null;
  return (
    <Heading className="mb-3 text-lg font-semibold">{str("heading")}</Heading>
  );
}

/** Rail of product cards, or a box-model-identical skeleton while loading. */
function CardRail({
  ctx,
  rows,
  variant,
  sponsored = false,
  headingClassName = "text-lg font-semibold",
  itemClassName,
}: {
  ctx: WidgetCtx;
  rows: WidgetRow[] | undefined;
  variant: CardVariant;
  sponsored?: boolean;
  /** Skin presentation fork: heading rhythm only, data and controls shared. */
  headingClassName?: string;
  /** Skin presentation fork: card tile widths only, card markup untouched. */
  itemClassName?: string;
}) {
  const { str, bool, data, locale, Heading } = ctx;
  const label =
    str("heading") || (locale === "bn" ? "পণ্যের তালিকা" : "Product rail");
  const headingText = str("heading");
  // Docked header: arrows share the heading row (startup-grade rhythm)
  // instead of floating in a separate row beneath the rail.
  const heading = headingText ? (
    <Heading className={headingClassName}>{headingText}</Heading>
  ) : undefined;
  const prevLabel =
    locale === "bn" ? "বামে স্ক্রল করুন" : "Scroll products left";
  const nextLabel =
    locale === "bn" ? "ডানে স্ক্রল করুন" : "Scroll products right";
  if (data?.pending || rows === undefined) {
    return (
      <Rail
        label={label}
        heading={heading}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        {...(itemClassName ? { itemClassName } : {})}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <ProductCardSkeleton key={i} variant={variant} />
        ))}
      </Rail>
    );
  }
  if (rows.length === 0) return null;
  return (
    <Rail
      label={label}
      heading={heading}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
      {...(itemClassName ? { itemClassName } : {})}
    >
      {rows.map((row) => (
        <ProductCard
          key={row.id}
          row={row}
          locale={locale}
          variant={variant}
          badgeLabel={str("badgeLabel") || undefined}
          promise={str("promise") || undefined}
          showRating={bool("showRating")}
          sponsored={sponsored}
        />
      ))}
    </Rail>
  );
}

/**
 * Widget skins: editorial (default, current rhythm byte-identical), compact
 * (smaller heading, narrower tiles — more cards per viewport) and minimal
 * (quiet small-caps heading, narrower tiles). Shared structure — Rail
 * keyboard/arrows/labels, ProductCard data semantics, skeletons, bn/en copy,
 * 44px targets, reduced-motion handling — stays common; only presentation
 * forks.
 */
const ProductRail: WidgetComponent = (ctx) => {
  const skin = resolveSkin("product_rail", ctx.str("skin"));
  const headingClassName =
    skin === "compact"
      ? "text-base font-semibold"
      : skin === "minimal"
        ? "text-sm font-semibold fq-caps text-muted-foreground"
        : undefined;
  const itemClassName =
    skin === "editorial"
      ? undefined
      : "w-[60vw] max-w-[220px] min-w-[8rem] sm:w-[32vw] sm:max-w-[240px] lg:w-[18%] lg:min-w-0";
  const rail = (rows: WidgetRow[] | undefined) => (
    <CardRail
      ctx={ctx}
      rows={rows}
      variant={cardVariantOf(ctx.str("cardVariant"), "compact")}
      {...(headingClassName ? { headingClassName } : {})}
      {...(itemClassName ? { itemClassName } : {})}
    />
  );
  const rows = ctx.data?.rows?.slice(0, ctx.int("limit", 12, 1, 24));
  if (ctx.data?.pending || rows === undefined) {
    return <section>{rail(rows)}</section>;
  }
  if (rows.length === 0) return null;
  return <section>{rail(rows)}</section>;
};

const DealStrip: WidgetComponent = (ctx) => {
  // Only rows that actually carry a saving belong in a deal strip.
  const rows = ctx.data?.rows
    ?.filter(
      (row) =>
        typeof row.compareAtMinor === "number" &&
        row.compareAtMinor > (row.priceMinor ?? 0),
    )
    .slice(0, ctx.int("limit", 8, 1, 24));
  if (ctx.data?.pending || rows === undefined) {
    return (
      <section>
        <CardRail
          ctx={ctx}
          rows={rows}
          variant={cardVariantOf(ctx.str("cardVariant"), "compact")}
        />
      </section>
    );
  }
  if (rows.length === 0) return null;
  return (
    <section>
      <CardRail
        ctx={ctx}
        rows={rows}
        variant={cardVariantOf(ctx.str("cardVariant"), "compact")}
      />
    </section>
  );
};

/**
 * Sponsored placements are always labelled — the chip is not optional and a
 * test fails if it disappears.
 */
const SponsoredSlot: WidgetComponent = (ctx) => {
  const { locale } = ctx;
  const rows = ctx.data?.rows?.slice(0, ctx.int("limit", 4, 1, 8));
  const variant = cardVariantOf(ctx.str("cardVariant"), "compact");
  return (
    <section aria-label={locale === "bn" ? "স্পনসর্ড" : "Sponsored"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <SectionHeading ctx={ctx} />
        <span className="shrink-0 rounded-fq-sm bg-muted px-2 py-0.5 text-[0.65rem] font-medium fq-caps text-muted-foreground">
          {locale === "bn" ? "স্পনসর্ড" : "Sponsored"}
        </span>
      </div>
      {ctx.data?.pending || rows === undefined ? (
        <div className={`${GRID_COLUMNS[4]} gap-4`} aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <ProductCardSkeleton key={i} variant={variant} />
          ))}
        </div>
      ) : rows.length === 0 ? null : (
        <div className={`${GRID_COLUMNS[4]} gap-4`}>
          {rows.map((row) => (
            <ProductCard
              key={row.id}
              row={row}
              locale={ctx.locale}
              variant={variant}
              sponsored
            />
          ))}
        </div>
      )}
    </section>
  );
};

/** A single authored offer card. Static props, no data binding. */
const DealCard: WidgetComponent = ({ str, Heading, locale }) => {
  const endsAt = str("endsAt");
  const ends = Number.isNaN(Date.parse(endsAt)) ? null : new Date(endsAt);
  return (
    <section className="flex flex-col gap-3 rounded-fq-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Heading className="text-base font-semibold">{str("heading")}</Heading>
        {str("badgeLabel") && (
          <span className="mt-1 inline-block rounded-fq-sm bg-success-soft px-2 py-0.5 text-xs font-semibold">
            {str("badgeLabel")}
          </span>
        )}
        {ends && (
          <p className="mt-1 text-xs text-muted-foreground">
            <time dateTime={ends.toISOString()}>
              {locale === "bn" ? "শেষ হবে " : "Ends "}
              {ends.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB")}
            </time>
          </p>
        )}
      </div>
      {str("ctaLabel") && (
        <a
          href={str("ctaHref") || "#"}
          className="shrink-0 rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {str("ctaLabel")}
        </a>
      )}
    </section>
  );
};

function BrandTile({ row }: { row: WidgetRow }) {
  return (
    <a
      href={row.href ? `#${row.href}` : "#"}
      className="flex h-full flex-col items-center justify-center gap-2 rounded-fq-lg border border-border bg-card p-3 text-center"
    >
      <MediaFrame
        src={row.imageUrl}
        alt={row.title}
        ratio="landscape"
        className="w-full rounded-fq-sm"
        artSeed={row.id}
      />
      <span className="line-clamp-1 text-xs font-medium">{row.title}</span>
    </a>
  );
}

const BrandStrip: WidgetComponent = (ctx) => {
  const cols = ctx.int("columns", 4, 2, 4);
  const grid = `${GRID_COLUMNS[cols] ?? GRID_COLUMNS[4]} gap-3`;
  const rows = ctx.data?.rows?.slice(0, ctx.int("limit", 12, 1, 24));
  return (
    <section>
      <SectionHeading ctx={ctx} />
      {ctx.data?.pending || rows === undefined ? (
        <div className={grid} aria-hidden="true">
          {Array.from({ length: cols * 2 }, (_, i) => (
            <div
              key={i}
              className="rounded-fq-lg border border-border bg-card p-3"
            >
              <div className="aspect-[4/3] animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? null : (
        <div className={grid}>
          {rows.map((row) => (
            <BrandTile key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
};

const BrandRail: WidgetComponent = (ctx) => {
  const { Heading } = ctx;
  const rows = ctx.data?.rows?.slice(0, ctx.int("limit", 16, 1, 32));
  const label =
    ctx.str("heading") || (ctx.locale === "bn" ? "ব্র্যান্ড" : "Brands");
  const headingText = ctx.str("heading");
  // Same docked-header rhythm as the product rails: arrows share the
  // heading row, items keep a peek of the next tile on mobile.
  const heading = headingText ? (
    <Heading className="text-lg font-semibold">{headingText}</Heading>
  ) : undefined;
  if (!ctx.data?.pending && rows !== undefined && rows.length === 0)
    return null;
  return (
    <section>
      <Rail
        label={label}
        heading={heading}
        itemClassName="w-[42vw] max-w-[240px] min-w-[9rem] sm:w-[24vw] sm:max-w-[260px] lg:w-[15%] lg:min-w-0"
        prevLabel={ctx.locale === "bn" ? "বামে স্ক্রল করুন" : "Scroll brands left"}
        nextLabel={ctx.locale === "bn" ? "ডানে স্ক্রল করুন" : "Scroll brands right"}
      >
        {ctx.data?.pending || rows === undefined
          ? Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="rounded-fq-lg border border-border bg-card p-3"
                aria-hidden="true"
              >
                <div className="aspect-[4/3] animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ))
          : rows.map((row) => <BrandTile key={row.id} row={row} />)}
      </Rail>
    </section>
  );
};

/** Up to four SKUs side by side, on the shared DataTable primitive. */
const CompareTable: WidgetComponent = ({ str, int, data, locale, money }) => {
  const rows = (data?.rows ?? []).slice(0, Math.min(4, int("limit", 4, 1, 4)));
  if (data?.pending) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return null;
  const columns = rows.map((row) => ({ key: row.id, label: row.title }));
  const cellsFor = (fn: (row: WidgetRow) => string) =>
    Object.fromEntries(rows.map((row) => [row.id, fn(row)]));
  const attributes = [
    {
      key: "price",
      label: str("r1Label") || (locale === "bn" ? "দাম" : "Price"),
      cells: cellsFor((row) => money(row.priceMinor ?? 0, row.currency)),
    },
    {
      key: "stock",
      label: str("r2Label") || (locale === "bn" ? "স্টক" : "Availability"),
      cells: cellsFor((row) =>
        row.inStock === false
          ? locale === "bn"
            ? "নেই"
            : "Out of stock"
          : locale === "bn"
            ? "আছে"
            : "In stock",
      ),
    },
    ...[3, 4]
      .map((i) => ({ key: `r${i}`, label: str(`r${i}Label`) }))
      .filter((row) => row.label)
      .map((row) => ({ ...row, cells: cellsFor(() => "—") })),
  ];
  return (
    <DataTable
      caption={str("caption") || undefined}
      columns={columns}
      rows={attributes}
    />
  );
};

/** Numbered bestseller list; ranks are tabular and locale-aware. */
const RankList: WidgetComponent = (ctx) => {
  const rows = ctx.data?.rows?.slice(0, ctx.int("limit", 10, 1, 20));
  return (
    <section>
      <SectionHeading ctx={ctx} />
      {ctx.data?.pending || rows === undefined ? (
        <ol className="space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="h-16 animate-pulse rounded-fq-lg bg-muted" />
          ))}
        </ol>
      ) : rows.length === 0 ? null : (
        <ol className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-fq-lg border border-border bg-card p-2"
            >
              <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                {formatDisplayNumber(index + 1, { locale: ctx.locale })}
              </span>
              <div className="min-w-0 flex-1">
                <ProductCard row={row} locale={ctx.locale} variant="wide" />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export const MERCH_WIDGETS: Record<
  | "product_rail"
  | "deal_card"
  | "deal_strip"
  | "sponsored_slot"
  | "brand_strip"
  | "brand_rail"
  | "compare_table"
  | "rank_list",
  WidgetComponent
> = {
  product_rail: ProductRail,
  deal_card: DealCard,
  deal_strip: DealStrip,
  sponsored_slot: SponsoredSlot,
  brand_strip: BrandStrip,
  brand_rail: BrandRail,
  compare_table: CompareTable,
  rank_list: RankList,
} satisfies Partial<Record<SectionType, WidgetComponent>>;
