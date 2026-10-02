/**
 * Somvabona (everyday-ethnic) homepage widgets.
 *
 * The five new widgets from spec §3 (2026-09-25): trust_marquee,
 * price_buckets, occasion_matrix, urgency_rail, rating_stars. Reused
 * PDP/category widgets (product rails, facets, reviews) are composed, never
 * rebuilt — urgency_rail wraps the shared `ProductCard`/`Rail` primitives so
 * prices, % off and stock states stay byte-identical with every other rail.
 *
 * Fail-closed throughout: empty rows render an editing placeholder and null
 * on the storefront — never a throw, never fabricated numbers, prices or
 * ratings. Motion is subtle and gated on prefers-reduced-motion (the marquee
 * freezes; rails and grids render statically).
 *
 * Everything reads design tokens through semantic utility classes only and
 * never imports a theme module, so the set stays usable by any theme.
 */
import { useRef } from "react";
import type {
  PropRow,
  PropValue,
  Section,
  SectionType,
} from "@/lib/builder-ast";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { useScrollReveals } from "./songoskriti-motion";
import { Countdown } from "./primitives/Countdown";
import { MediaFrame } from "./primitives/MediaFrame";
import { Rail } from "./primitives/Rail";
import { ProductCard, ProductCardSkeleton } from "./primitives/ProductCard";
import { cardVariantOf } from "./merch";
import {
  Banknote,
  Headset,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
} from "@/components/icons/tabler";
/* ---------------------------------------------------------------- helpers */

function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

function rowsOf(section: Section, key: string): PropRow[] {
  const value: PropValue | undefined = section.props[key];
  return Array.isArray(value) ? value : [];
}

const readString = (row: PropRow, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : "";

function readBn(row: PropRow, key: string, locale: string) {
  const bn = readString(row, `${key}_bn`);
  const en = readString(row, key);
  return locale === "bn" && bn ? bn : en;
}

const readNumber = (row: PropRow, key: string) =>
  typeof row[key] === "number" && Number.isFinite(row[key])
    ? (row[key] as number)
    : 0;

/* ------------------------------------------------------------ trust_marquee */

const TRUST_MARQUEE_ICON = {
  cod: Banknote,
  delivery: Truck,
  returns: RotateCcw,
  secure: ShieldCheck,
  support: Headset,
  quality: Star,
} as const;

const MARQUEE_SPEED: Record<string, string> = {
  slow: "40s",
  normal: "25s",
  fast: "15s",
};

const TrustMarquee: WidgetComponent = ({ section, str, locale, editing }) => {
  const items = rowsOf(section, "items")
    .map((row) => ({
      icon: readString(row, "icon"),
      title: readBn(row, "title", locale),
      body: readBn(row, "body", locale),
    }))
    .filter((row) => row.title);
  if (items.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Trust marquee: add badges.",
          "আস্থা মার্কি: ব্যাজ যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  const duration = MARQUEE_SPEED[str("speed")] ?? "25s";
  const loop = [...items, ...items];
  return (
    <div
      className="overflow-hidden border-y border-border/60 bg-muted/10 py-3"
      role="marquee"
      aria-label={t(
        locale,
        "Why shoppers trust us",
        "কেন ক্রেতারা আস্থা রাখেন",
      )}
    >
      <ul
        className="flex w-max items-center gap-10 whitespace-nowrap motion-safe:animate-[fq-marquee_linear_infinite] motion-reduce:animate-none"
        style={{ ["--fq-marquee" as string]: duration }}
      >
        {loop.map((item, i) => {
          const Icon =
            TRUST_MARQUEE_ICON[item.icon as keyof typeof TRUST_MARQUEE_ICON] ??
            Star;
          return (
            <li
              key={`${item.title}-${i}`}
              aria-hidden={i >= items.length}
              className="flex items-center gap-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-bold fq-caps tracking-widest text-foreground sm:text-[13px]">
                {item.title}
                {item.body && (
                  <span className="ml-2 font-medium normal-case tracking-wide text-muted-foreground">
                    {item.body}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------ price_buckets */

const PriceBuckets: WidgetComponent = ({
  section,
  str,
  Heading,
  locale,
  editing,
  link,
}) => {
  // Fail-closed: a tile without a label, bound or href is omitted, never
  // rendered blank. Bounds are navigational only — the label carries the
  // copy, so no price is ever computed or formatted here.
  const buckets = rowsOf(section, "buckets")
    .map((row) => ({
      label: readBn(row, "label", locale),
      maxPrice: readNumber(row, "maxPrice"),
      href: readString(row, "href"),
      image: readString(row, "image"),
    }))
    .filter((b) => b.label && b.href && b.maxPrice > 0);
  const scope = useRef<HTMLElement | null>(null);
  useScrollReveals(scope, true);
  if (!str("heading") && buckets.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Price buckets: add buckets.",
          "দামের ঝুড়ি: ঝুড়ি যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  if (buckets.length === 0) return null;
  return (
    <section
      ref={scope}
      data-reveal
      className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 py-12 sm:px-8 sm:py-24"
    >
      {str("heading") && (
        <Heading className="font-bangla-display text-2xl font-medium tracking-wide text-foreground sm:text-3xl lg:text-4xl">
          {str("heading")}
        </Heading>
      )}
      <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-4 p-0 sm:mt-8 sm:grid-cols-3 sm:gap-6">
        {buckets.map((bucket) => (
          <li key={bucket.label} className="min-w-0">
            <a
              href={link(bucket.href)}
              className="group block overflow-hidden border border-border/60 bg-card transition-colors hover:border-foreground"
            >
              <span className="block aspect-[16/9] overflow-hidden bg-muted/20">
                <MediaFrame
                  src={bucket.image}
                  alt={bucket.label}
                  ratio="landscape"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </span>
              <span className="flex min-h-12 items-center justify-between px-4 py-3">
                <span className="text-[11px] font-bold fq-caps tracking-widest text-foreground sm:text-[13px]">
                  {bucket.label}
                </span>
                <span
                  aria-hidden="true"
                  className="text-foreground transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

/* ---------------------------------------------------------- occasion_matrix */

const OccasionMatrix: WidgetComponent = ({
  section,
  str,
  Heading,
  locale,
  editing,
  link,
}) => {
  const occasions = rowsOf(section, "occasions")
    .map((row) => ({
      label: readBn(row, "label", locale),
      href: readString(row, "href"),
    }))
    .filter((o) => o.label && o.href);
  const collections = rowsOf(section, "collections")
    .map((row) => ({
      title: readBn(row, "title", locale),
      href: readString(row, "href"),
      image: readString(row, "image"),
    }))
    .filter((col) => col.title && col.href);
  const scope = useRef<HTMLElement | null>(null);
  useScrollReveals(scope, true);
  if (!str("heading") && occasions.length === 0 && collections.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Occasion matrix: add occasions.",
          "উপলক্ষ ম্যাট্রিক্স: উপলক্ষ যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  return (
    <section
      ref={scope}
      data-reveal
      className="w-full border-t border-border/60 py-12 sm:py-24"
    >
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        {str("heading") && (
          <Heading className="font-bangla-display text-2xl font-medium tracking-wide text-foreground sm:text-3xl lg:text-4xl">
            {str("heading")}
          </Heading>
        )}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:mt-8 lg:grid-cols-12">
          {occasions.length > 0 && (
            <ul
              aria-label={t(locale, "Occasions", "উপলক্ষ")}
              className="m-0 flex list-none flex-col gap-2 p-0 lg:col-span-4"
            >
              {occasions.map((o) => (
                <li key={o.label}>
                  <a
                    href={link(o.href)}
                    className="group flex min-h-12 items-center justify-between border-b border-border/60 px-2 text-[11px] font-bold fq-caps tracking-widest transition-colors hover:border-foreground sm:min-h-14 sm:text-[13px]"
                  >
                    <span className="text-foreground transition-colors group-hover:text-muted-foreground">
                      {o.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-foreground transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {collections.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 sm:gap-6 lg:col-span-8">
              {collections.map((col) => (
                <li key={col.title} className="min-w-0">
                  <a
                    href={link(col.href)}
                    className="group block overflow-hidden border border-border/60 bg-card transition-colors hover:border-foreground"
                  >
                    <span className="block aspect-[3/4] overflow-hidden bg-muted/20">
                      <MediaFrame
                        src={col.image}
                        alt={col.title}
                        ratio="portrait"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    </span>
                    <span className="block px-3 py-2 text-[11px] font-bold fq-caps tracking-widest text-foreground sm:text-[13px]">
                      {col.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- urgency_rail */

const UrgencyRail: WidgetComponent = (ctx) => {
  const { str, bool, int, data, locale, Heading } = ctx;
  const variant = cardVariantOf(str("cardVariant"), "standard");
  const showDiscount = bool("showDiscount");
  const showStockHint = bool("showStockHint");
  const lowStockAt = int("lowStockAt", 5, 1, 100);
  const raw = data?.rows?.slice(0, int("limit", 8, 1, 24));
  // Hiding the sale badge strips the compare-at leg (display-only), never
  // the price itself — the merchant sees standard cards, not fake discounts.
  const rows = showDiscount
    ? raw
    : raw?.map((row) => ({ ...row, compareAtMinor: undefined }));
  const label =
    str("heading") || (locale === "bn" ? "দ্রুত বিক্রি হচ্ছে" : "Selling fast");
  const heading = str("heading") ? (
    <Heading className="font-bangla-display text-2xl font-medium tracking-wide text-foreground sm:text-3xl lg:text-4xl">
      {str("heading")}
    </Heading>
  ) : null;
  // An empty rail leaves no hole: null, not a padded empty shell.
  if (rows !== undefined && rows.length === 0 && !data?.pending) return null;
  const endsAt = str("endsAt");
  const showCountdown = !Number.isNaN(Date.parse(endsAt));
  const endsLabel =
    str("endsLabel") || (locale === "bn" ? "অফার শেষ হতে" : "Sale ends in");
  return (
    <section className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 py-12 sm:px-8 sm:py-24 [&_article]:border-none [&_article]:bg-transparent [&_article]:shadow-none">
      {showCountdown && (
        <div className="mb-4 flex justify-start">
          <Countdown endsAt={endsAt} label={endsLabel} locale={locale} />
        </div>
      )}
      {data?.pending || rows === undefined ? (
        <Rail label={label} heading={heading ?? undefined}>
          {Array.from({ length: 6 }, (_, i) => (
            <ProductCardSkeleton key={i} variant={variant} />
          ))}
        </Rail>
      ) : rows.length === 0 ? null : (
        <Rail label={label} heading={heading ?? undefined}>
          {rows.map((row) => {
            // Real inventory flags only: an absent count shows no hint.
            const low =
              showStockHint &&
              typeof row.count === "number" &&
              row.count > 0 &&
              row.count <= lowStockAt;
            return (
              <div key={row.id} className="relative">
                {low && (
                  <span
                    data-part="badge"
                    className="absolute left-2 top-2 z-10 rounded-fq-sm border border-warning-foreground/30 bg-warning-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-foreground"
                  >
                    {t(
                      locale,
                      `Only ${row.count} left`,
                      `মাত্র ${row.count} টি বাকি`,
                    )}
                  </span>
                )}
                <ProductCard
                  row={row}
                  locale={locale}
                  variant={variant}
                  promise={str("promise") || undefined}
                  showRating={bool("showRating")}
                />
              </div>
            );
          })}
        </Rail>
      )}
    </section>
  );
};

/* ------------------------------------------------------------- rating_stars */

const RatingStars: WidgetComponent = ({ section, int, locale, editing }) => {
  const raw = section.props.rating;
  const rating =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(5, Math.max(0, raw))
      : 0;
  const reviewCount = int("reviewCount", 0, 0, 1000000);
  // No aggregate, no stars — never a fake 4.8.
  if (!(rating > 0) || !(reviewCount > 0)) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Rating stars: add a review aggregate.",
          "রেটিং তারা: রিভিউয়ের গড় যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  const filled = Math.round(rating);
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-sm"
      role="img"
      aria-label={t(
        locale,
        `Rated ${rating} out of 5 from ${reviewCount} reviews`,
        `৫-এর মধ্যে ${rating} রেটিং, ${reviewCount}টি রিভিউ`,
      )}
    >
      <span aria-hidden="true" className="tracking-tight">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={
              i < filled ? "text-foreground" : "text-muted-foreground/40"
            }
          >
            ★
          </span>
        ))}
      </span>
      <span className="font-semibold tabular-nums text-foreground">
        {String(rating)}
      </span>
      <span className="text-muted-foreground">
        ({t(locale, `${reviewCount} reviews`, `${reviewCount}টি রিভিউ`)})
      </span>
    </p>
  );
};

/* ------------------------------------------------------ exports */

export const SOMVABONA_WIDGETS: Record<
  Extract<
    SectionType,
    | "trust_marquee"
    | "price_buckets"
    | "occasion_matrix"
    | "urgency_rail"
    | "rating_stars"
  >,
  WidgetComponent
> = {
  trust_marquee: TrustMarquee,
  price_buckets: PriceBuckets,
  occasion_matrix: OccasionMatrix,
  urgency_rail: UrgencyRail,
  rating_stars: RatingStars,
};
