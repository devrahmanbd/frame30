/**
 * Songoskriti (heritage) homepage widgets.
 *
 * SECTION-track editorial design mapped onto this tree's Task-built catalog
 * types and platform primitives. The track's five type names
 * (`department_grid`, `gift_finder`, `heritage_story`,
 * `testimonial_carousel`, `marquee_strip`) do not exist in this tree's
 * `builder-ast` catalog — the Task-2 gap pack already covers those roles as
 * `circle_categories`, `finder_row`, `craft_story`, `testimonials`, and
 * `announcement_bar` — so the track's JSX lands on the four widgets owned
 * here (`hero_carousel` stays covered by heritage.tsx HeroCarousel):
 *
 * - FinderRow ← track gift_finder: two-zone editorial (copy col + occasion
 *   list col), bordered occasion rows with arrow affordance, one outline
 *   CTA. Adapted: links stay `o1Href`-style collection hrefs (the track's
 *   `/search?q=` queries have no verified route here), not query strings.
 * - CraftStory ← track heritage_story: offset grid (art 5 cols, copy 6
 *   cols offset), hairline rule, single eyebrow, outline CTA. Adapted:
 *   art goes through MediaFrame (CLS-safe + alt/sizes primitives), the
 *   `scrim` prop keeps working, and headline/button fallbacks match the
 *   heritage precedent.
 * - Testimonials ← track testimonial_carousel: quote-card voice (oversized
 *   quote mark, bordered caption). Adapted: the snap+buttons carousel
 *   controller + dots + line-clamp-3 stay (pinned by songoskriti.test.tsx),
 *   motion stays on the shared Task-5 hooks.
 * - TrustFooter ← track trust_bar: icon-chip assurances grid. Kept
 *   repeater-first (`items[]` rows win, i1–i4 scalars fall back) with the
 *   track's larger chip.
 *
 * Not ported: the `SongoskritiWeave` lattice (it stands in for the track's
 * `/api/public/ph/` placeholder prefixes, which this blueprint never
 * emits — MediaFrame owns the imageless fallback) and the marquee (the
 * announcement_bar owns the single-marquee slot).
 *
 * Everything reads design tokens through semantic utility classes only and
 * never imports a theme module, so the set stays usable by any theme.
 * Empty `testimonials`/`items` arrays render an editing placeholder and
 * null on the storefront — never a throw, never a blank crash.
 */
import { useRef, useState, useEffect } from "react";
import type {
  PropRow,
  PropValue,
  Section,
  SectionType,
} from "@/lib/builder-ast";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { resolveSkin } from "@/lib/builder-ast";
import {
  useSongoskritiCarousel,
  useSongoskritiReveals,
} from "./songoskriti-motion";
import { MediaFrame } from "./primitives/MediaFrame";
import { Rail } from "./primitives/Rail";
import { ProductCard, ProductCardSkeleton, WishlistHeart } from "./primitives/ProductCard";
import { cardVariantOf } from "./merch";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";
import { placeholderSeed } from "@/lib/placeholder";
import { parseLinkList } from "./chrome";
import { formatDisplayMoney } from "@/lib/money-display";
import { Instagram, Facebook, Twitter } from "lucide-react";
import {
  STATEMENT,
  NEWSLETTER,
  PAYMENT_MARKS,
  COLOPHON,
} from "@/lib/themes/songoskriti/footer";
import { PaymentMark } from "@/components/store/PaymentMarks";
import {
  ChevronDown,
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

/* ------------------------------------------------------------- finder_row */

const FinderRow: WidgetComponent = ({
  str,
  Heading,
  editing,
  locale,
  link,
}) => {
  // Support up to 7 occasions (o1–o7)
  const occasions = [
    { label: str("o1Label"), href: str("o1Href") },
    { label: str("o2Label"), href: str("o2Href") },
    { label: str("o3Label"), href: str("o3Href") },
    { label: str("o4Label"), href: str("o4Href") },
    { label: str("o5Label"), href: str("o5Href") },
    { label: str("o6Label"), href: str("o6Href") },
    { label: str("o7Label"), href: str("o7Href") },
  ].filter((o) => o.label);
  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);
  if (!str("heading") && occasions.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Occasion finder: add occasions.",
          "উপলক্ষ সন্ধান: উপলক্ষ যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="w-full py-16 sm:py-24 border-t border-[var(--theme-border)] bg-[var(--theme-surface)]"
    >
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="min-w-0 lg:col-span-5">
            {str("heading") && (
              <Heading className="font-serif text-[28px] sm:text-[36px] lg:text-[44px] font-light tracking-[0.01em] text-[var(--theme-ink)] leading-tight">
                {str("heading")}
              </Heading>
            )}
            {str("body") && (
              <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-[var(--theme-ink)]/60 font-light">
                {str("body")}
              </p>
            )}
            {str("buttonLabel") && (
              <a
                href={link(str("buttonHref") || "#")}
                className="mt-8 inline-flex min-h-11 items-center border-b-2 border-[var(--theme-ink)]/30 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-[var(--theme-ink)] hover:border-[var(--theme-ink)] transition-all duration-300"
              >
                {str("buttonLabel")}
              </a>
            )}
          </div>
          {occasions.length > 0 && (
            <div className="min-w-0 lg:col-span-7">
              <ul
                aria-label={t(locale, "Occasions", "উপলক্ষ")}
                className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-0 p-0 list-none"
              >
                {occasions.map((o) => (
                  <li
                    key={o.label}
                    className="border-b border-[var(--theme-border)] last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
                  >
                    <a
                      href={link(o.href || "#")}
                      className="group flex min-h-[60px] items-center justify-between bg-transparent px-4 sm:px-6 text-[11px] sm:text-[12px] font-semibold tracking-[0.18em] uppercase transition-all hover:bg-[var(--theme-surface)]"
                    >
                      <span className="text-[var(--theme-ink)] transition-colors group-hover:text-[var(--theme-ink)]/60">
                        {o.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-[var(--theme-ink)]/30 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[var(--theme-ink)]"
                      >
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------- craft_story */

const CraftStory: WidgetComponent = ({
  str,
  bool,
  Heading,
  editing,
  locale,
  link,
}) => {
  // Track fallbacks (heritage precedent): headline/button aliases resolve
  // to the canonical craft_story fields.
  const image = str("image") || str("imageUrl");
  const headline = str("headline") || str("heading");
  const eyebrow = str("eyebrow") || str("caption");
  const body = str("body");
  const ctaLabel = str("ctaLabel") || str("buttonLabel");
  const ctaHref = str("ctaHref") || str("buttonHref");
  // Task 5 motion: once-only batch reveal at full intent; static otherwise.
  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);
  if (!headline && !body) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Craft story: add a heading.",
          "কারুকাজের গল্প: একটি শিরোনাম যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="relative w-full h-[70vh] min-h-[500px] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Fixed background for pure CSS parallax effect */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat bg-fixed"
        style={{
          backgroundImage: `url(${image || `/api/public/ph/${placeholderSeed("craft")}`})`,
        }}
      />
      {bool("scrim") && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[var(--theme-ink)]/60"
        />
      )}

      <div className="relative z-10 mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 flex flex-col items-center text-center">
        {eyebrow && (
          <p className="mb-6 text-[10px] font-medium uppercase tracking-[0.35em] text-[var(--theme-surface)]/70">
            {eyebrow}
          </p>
        )}
        <Heading className="font-serif text-3xl sm:text-5xl lg:text-[4rem] font-light tracking-wide leading-tight text-[var(--theme-surface)] max-w-4xl">
          {headline}
        </Heading>
        {body && (
          <p className="mt-6 max-w-2xl text-[14px] sm:text-[16px] font-light leading-relaxed text-[var(--theme-surface)]/80">
            {body}
          </p>
        )}
        {ctaLabel && (
          <a
            href={link(ctaHref || "#")}
            className="mt-10 inline-flex items-center min-h-11 border-b-2 border-[var(--theme-surface)]/40 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-[var(--theme-surface)] hover:border-[var(--theme-surface)] transition-all duration-300"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------ testimonials */

const Testimonials: WidgetComponent = ({
  section,
  str,
  int,
  locale,
  editing,
}) => {
  const testimonials = rowsOf(section, "testimonials")
    .map((row) => ({
      quote: readBn(row, "quote", locale),
      author: readBn(row, "author", locale),
      role: readBn(row, "role", locale),
      image: readString(row, "image"),
    }))
    .filter((item) => item.quote);

  const skin = resolveSkin("testimonials", str("skin"));
  const autoAdvanceMs = int("autoAdvanceMs", 5000, 1500, 15000);

  const {
    index: current,
    goTo,
    pause,
    resume,
  } = useSongoskritiCarousel(testimonials.length, autoAdvanceMs);

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  if (testimonials.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Testimonials: add a quote.",
          "প্রশংসাপত্র: একটি মতামত যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  // Wall skin — 3-column editorial grid
  if (skin === "wall") {
    return (
      <section
        ref={scope}
        data-songoskriti-reveal
        className="w-full py-20 sm:py-28"
        aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
      >
        <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
          <ul className="grid grid-cols-1 gap-16 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((item) => (
              <li
                key={`${item.author}-${item.quote.slice(0, 24)}`}
                className="flex flex-col items-center text-center"
              >
                <span
                  aria-hidden="true"
                  className="mb-6 block font-serif text-5xl leading-none text-[var(--theme-ink)]/10 select-none"
                >
                  &ldquo;
                </span>
                <blockquote className="font-serif text-[16px] font-light leading-[1.75] text-[var(--theme-ink)]/80">
                  {item.quote}
                </blockquote>
                <div className="mt-8 flex items-center justify-center gap-4">
                  <div className="h-px w-8 bg-[var(--theme-ink)]/15" />
                  <p
                    data-part="author"
                    className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]"
                  >
                    {item.author}
                    {item.role && (
                      <span className="text-[var(--theme-ink)]/50 ml-2 font-normal normal-case tracking-normal">
                        · {item.role}
                      </span>
                    )}
                  </p>
                  <div className="h-px w-8 bg-[var(--theme-ink)]/15" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  // Single skin — static centered quote
  if (skin === "single") {
    const item = testimonials[0]!;
    return (
      <section
        ref={scope}
        data-songoskriti-reveal
        className="w-full py-20 sm:py-28"
        aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-8 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="mb-8 block font-serif text-[5rem] leading-none text-[var(--theme-ink)]/10 select-none"
          >
            &ldquo;
          </span>
          <blockquote className="font-serif text-[20px] sm:text-[24px] font-light leading-[1.65] text-[var(--theme-ink)]">
            {item.quote}
          </blockquote>
          <div className="mt-10 flex items-center justify-center gap-5">
            <div className="h-px w-10 bg-[var(--theme-ink)]/20" />
            <p
              data-part="author"
              className="text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--theme-ink)]"
            >
              {item.author}
              {item.role && (
                <span className="text-[var(--theme-ink)]/50 ml-2 font-normal normal-case tracking-normal">
                  · {item.role}
                </span>
              )}
            </p>
            <div className="h-px w-10 bg-[var(--theme-ink)]/20" />
          </div>
        </div>
      </section>
    );
  }

  // Default: full-width crossfade carousel (Nakhrali model)
  // Each quote cross-fades in/out via opacity transitions on a fixed-height
  // stack — no layout shift, no scroll snap needed.
  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="w-full bg-[var(--theme-surface)] py-16 sm:py-20"
      aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
      onMouseEnter={() => pause()}
      onMouseLeave={() => resume()}
    >
      {/* Fixed-height crossfade stack */}
      <div
        className="relative mx-auto max-w-4xl px-4 sm:px-8"
        style={{ minHeight: "clamp(240px, 36vw, 360px)" }}
        aria-live="polite"
        aria-atomic="true"
      >
        {testimonials.map((item, i) => (
          <div
            key={`${item.author}-${i}`}
            className={`absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-700 ease-in-out ${
              i === current
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={i !== current}
          >
            {item.image ? (
              <img
                src={item.image}
                alt={item.author}
                className="mb-8 h-14 w-14 rounded-full object-cover ring-1 ring-foreground/10"
                loading="lazy"
              />
            ) : (
              <div className="mb-8 h-px w-12 bg-[var(--theme-ink)]/15" />
            )}
            <blockquote className="font-serif text-[18px] sm:text-[22px] lg:text-[26px] font-light leading-[1.65] tracking-[0.01em] text-[var(--theme-ink)]">
              {item.quote}
            </blockquote>
            <div className="mt-10 flex items-center justify-center gap-5">
              <div className="h-px w-10 bg-[var(--theme-ink)]/20" />
              <p
                data-part="author"
                className="text-[10px] font-medium uppercase tracking-[0.25em] text-[var(--theme-ink)]"
              >
                {item.author}
                {item.role && (
                  <span className="text-[var(--theme-ink)]/50 ml-2 font-normal normal-case tracking-normal">
                    · {item.role}
                  </span>
                )}
              </p>
              <div className="h-px w-10 bg-[var(--theme-ink)]/20" />
            </div>
          </div>
        ))}
      </div>

      {/* Nakhrali-style thin progress bar indicators */}
      {testimonials.length > 1 && (
        <div
          className="mt-10 flex items-center justify-center gap-3"
          role="tablist"
        >
          {testimonials.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              onClick={() => goTo(i)}
              aria-label={`${t(locale, "Testimonial", "প্রশংসাপত্র")} ${i + 1}`}
              aria-selected={i === current}
              className="group flex items-center justify-center min-h-11 min-w-11"
            >
              <span
                className={`block h-[2px] rounded-full transition-all duration-500 ease-out ${
                  i === current
                    ? "w-10 bg-[var(--theme-ink)]"
                    : "w-5 bg-[var(--theme-ink)]/25 group-hover:bg-[var(--theme-ink)]/50"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------ trust_footer */

const TRUST_FOOTER_ICON = {
  delivery: Truck,
  returns: RotateCcw,
  secure: ShieldCheck,
  support: Headset,
  quality: Star,
} as const;

const TrustFooter: WidgetComponent = ({ str, section, locale, editing }) => {
  // Task 5 motion: once-only batch reveal at full intent; static otherwise.
  const scope = useRef<HTMLDivElement | null>(null);
  useSongoskritiReveals(scope, true);
  // Repeater-first (trust_bar precedent): studio `items` rows win when
  // present, scalar i1–i4 triples remain as the fallback for
  // theme-authored sections.
  const itemRows = rowsOf(section, "items")
    .map((row) => ({
      icon: readString(row, "icon"),
      title: readBn(row, "title", locale),
      body: readBn(row, "body", locale),
    }))
    .filter((row) => row.title);
  const items =
    itemRows.length > 0
      ? itemRows
      : [1, 2, 3, 4]
          .map((n) => ({
            icon: str(`i${n}Icon`),
            title: str(`i${n}Title`),
            body: str(`i${n}Body`),
          }))
          .filter((item) => item.title);
  if (items.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(locale, "Trust footer: add badges.", "আস্থা ফুটার: ব্যাজ যোগ করুন।")}
      </p>
    ) : null;
  }
  return (
    <div
      ref={scope}
      data-songoskriti-reveal
      className="w-full border-t border-[var(--theme-border)]"
    >
      <ul className="mx-auto grid max-w-[var(--fq-container,1440px)] grid-cols-2 lg:grid-cols-4 divide-x divide-[var(--theme-border)] px-0">
        {items.map((item, idx) => (
          <li
            key={item.title}
            className="flex flex-col items-center text-center py-10 sm:py-12 px-6 sm:px-8"
          >
            <span
              aria-hidden="true"
              className="mb-4 block font-serif text-[11px] tracking-[0.3em] text-[var(--theme-ink)]/30 tabular-nums"
            >
              0{idx + 1}
            </span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--theme-ink)] leading-tight">
              {item.title}
            </span>
            {item.body && (
              <span className="mt-2.5 block font-serif text-[13px] font-light leading-relaxed text-[var(--theme-ink)]/55 max-w-[180px]">
                {item.body}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------ product_rail */

const getLuxuryImage = (seed: string) => {
  const images = [
    "/ph/songoskriti/hero-festive.png",
    "/ph/songoskriti/hero-weaves.png",
    "/ph/songoskriti/hero-artisans.png",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = hash * 31 + seed.charCodeAt(i);
  return images[Math.abs(hash) % images.length]!;
};

const SongoskritiProductCard = ({ row, promise, badge }: any) => {
  const image = row.imageUrl?.endsWith(".svg")
    ? getLuxuryImage(row.id)
    : row.imageUrl || getLuxuryImage(row.id);
  const hoverImage = getLuxuryImage(row.id + "hover");

  return (
    <article className="group relative flex flex-col">
      <a
        href={row.href ?? "#"}
        className="relative w-full aspect-[3/4] block overflow-hidden bg-[var(--theme-muted)]"
      >
        <img
          src={image}
          alt={row.title}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-[1200ms] ease-[cubic-bezier(0.23,1,0.32,1)] opacity-100 group-hover:opacity-0 group-hover:scale-105"
          loading="lazy"
        />
        <img
          src={hoverImage}
          alt={row.title}
          className="absolute inset-0 w-full h-full object-cover transition-all duration-[1200ms] ease-[cubic-bezier(0.23,1,0.32,1)] scale-[1.04] opacity-0 group-hover:scale-100 group-hover:opacity-100"
          loading="lazy"
        />
        {badge && (
          <span
            data-part="badge"
            className="absolute top-3 left-3 text-[9px] font-semibold tracking-[0.2em] uppercase bg-[var(--theme-surface)]/90 text-[var(--theme-ink)] px-2 py-0.5"
          >
            {badge}
          </span>
        )}
        {/* Wishlist button */}
        <WishlistHeart
          storeSlug="demo"
          variantId={row.variants?.[0]?.id}
          locale="en"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--theme-surface)]/90 text-[var(--theme-ink)] shadow-sm backdrop-blur-sm transition-all duration-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 group/btn"
        />
      </a>
      <a
        href={row.href ?? "#"}
        className="flex flex-col items-start text-left mt-3 gap-0.5 w-full"
      >
        <h3
          data-part="title"
          className="font-sans text-[13px] font-medium text-[var(--theme-ink)] group-hover:text-[var(--theme-ink)]/70 transition-colors line-clamp-2 leading-snug"
        >
          {row.title}
        </h3>
        <div
          data-part="price"
          className="font-sans text-[13px] font-normal text-[var(--theme-ink)] mt-0.5"
        >
          {row.priceMinor
            ? formatDisplayMoney(row.priceMinor, {
                currency: row.currency || "BDT",
              })
            : ""}
        </div>
        {promise && (
          <p
            data-part="promise"
            className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-ink)]/50 mt-1"
          >
            {promise}
          </p>
        )}
      </a>
    </article>
  );
};

const SongoskritiProductRail: WidgetComponent = (ctx) => {
  const { str, int, data, locale, Heading } = ctx;
  const rows = data?.rows?.slice(0, int("limit", 12, 1, 24));
  const label =
    str("heading") || (locale === "bn" ? "পণ্যের তালিকা" : "Product rail");
  const subhead = str("subhead");
  const badgeLabel = str("badgeLabel");

  const headingEl = str("heading") ? (
    <div className="text-center mb-2 w-full">
      <Heading className="font-serif text-[28px] sm:text-[36px] lg:text-[44px] font-light tracking-[0.01em] text-[var(--theme-ink)]">
        {str("heading")}
      </Heading>
      {subhead && (
        <p className="mt-3 font-serif text-[14px] sm:text-[16px] font-light text-[var(--theme-ink)]/50 italic">
          {subhead}
        </p>
      )}
    </div>
  ) : null;

  const sectionClassName =
    "w-full bg-[var(--theme-surface)] py-16 sm:py-24 border-t border-[var(--theme-border)]";

  if (rows !== undefined && rows.length === 0 && !data?.pending) return null;
  return (
    <section className={sectionClassName}>
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        {data?.pending || rows === undefined ? (
          <Rail label={label} heading={headingEl ?? undefined}>
            {Array.from({ length: 4 }, (_, i) => (
              <ProductCardSkeleton key={i} variant="standard" />
            ))}
          </Rail>
        ) : rows.length === 0 ? null : (
          <Rail label={label} heading={headingEl ?? undefined}>
            {rows.map((row) => (
              <SongoskritiProductCard
                key={row.id}
                row={row}
                promise={str("promise") || undefined}
                badge={badgeLabel || undefined}
              />
            ))}
          </Rail>
        )}
      </div>
    </section>
  );
};

const SongoskritiProductGrid: WidgetComponent = (ctx) => {
  const { str, data, locale, Heading } = ctx;
  const rows = data?.rows;
  const heading = str("heading");
  const subhead = str("subhead");
  const badgeLabel = str("badgeLabel");
  const promise = str("promise");

  if (rows !== undefined && rows.length === 0 && !data?.pending) return null;

  return (
    <section className="w-full bg-[var(--theme-surface)] py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        {heading && (
          <div className="mb-16 flex flex-col items-center text-center">
            <Heading className="font-serif text-[32px] sm:text-[40px] lg:text-[48px] font-light tracking-[0.01em] text-[var(--theme-ink)]">
              {heading}
            </Heading>
            {subhead && (
              <p className="mt-4 font-serif text-[15px] sm:text-[16px] font-light text-[var(--theme-ink)]/50 italic max-w-xl">
                {subhead}
              </p>
            )}
          </div>
        )}

        {data?.pending || rows === undefined ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-12 sm:gap-x-8 sm:gap-y-16">
            {Array.from({ length: 8 }, (_, i) => (
              <ProductCardSkeleton key={i} variant="standard" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-12 sm:gap-x-8 sm:gap-y-16">
            {rows.map((row) => (
              <SongoskritiProductCard
                key={row.id}
                row={row}
                promise={promise}
                badge={badgeLabel}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/* -------------------------------------------------------- luxury footer */

const SongoskritiNewsletter: WidgetComponent = ({ str, section, locale }) => (
  <section className="border-t border-[var(--theme-border)] py-16 sm:py-24 text-center px-4">
    <div className="mx-auto max-w-xl">
      <h3 className="font-serif text-[24px] sm:text-[32px] font-light tracking-[0.02em] text-[var(--theme-ink)] mb-4">
        {str("heading")}
      </h3>
      <p className="text-[13px] font-light leading-relaxed text-[var(--theme-ink)]/60 mb-8 max-w-sm mx-auto">
        {str("body")}
      </p>
      <form
        className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md mx-auto"
        method="post"
        action="#newsletter"
      >
        <label className="sr-only" htmlFor={`nl-${section.id}`}>
          {locale === "bn" ? "ইমেইল ঠিকানা" : "Email address"}
        </label>
        <input
          id={`nl-${section.id}`}
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 w-full flex-1 rounded-none border-b border-[var(--theme-border)] bg-transparent px-2 py-2 text-[13px] outline-none transition-colors placeholder:text-[var(--theme-ink)]/30 focus:border-[var(--theme-ink)]"
          placeholder={locale === "bn" ? "ইমেইল লিখুন" : "Enter your email"}
        />
        <button
          type="submit"
          className="h-12 w-full sm:w-auto px-8 bg-[var(--theme-ink)] text-[var(--theme-surface)] text-[11px] font-medium uppercase tracking-[0.2em] hover:bg-[var(--theme-ink)]/90 transition-colors"
        >
          {str("buttonLabel") || "Subscribe"}
        </button>
      </form>
      <div className="mt-6 text-[10px] text-[var(--theme-ink)]/40 uppercase tracking-widest">
        {str("consentText")}
      </div>
    </div>
  </section>
);

const SongoskritiRichText: WidgetComponent = ({ str }) => {
  const heading = str("heading");
  const body = str("body");

  if (!heading && body) {
    // Colophon variant (bottom of footer)
    return (
      <section className="py-6 text-center w-full">
        <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/50">
            {body}
          </p>
        </div>
      </section>
    );
  }

  // Statement variant
  return (
    <section className="py-16 sm:py-24 text-center px-4 border-t border-[var(--theme-border)]">
      <div className="mx-auto max-w-2xl">
        {heading && (
          <h2 className="font-serif text-[28px] sm:text-[40px] font-light leading-tight tracking-[0.01em] text-[var(--theme-ink)] mb-6">
            {heading}
          </h2>
        )}
        {body && (
          <p className="font-serif text-[15px] sm:text-[18px] font-light leading-relaxed text-[var(--theme-ink)]/60 max-w-lg mx-auto">
            {body}
          </p>
        )}
      </div>
    </section>
  );
};

const SongoskritiFooterSitemap: WidgetComponent = ({
  str,
  section,
  link,
  locale,
}) => {
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => {
          const r = row as Record<string, unknown>;
          const title = typeof r.title === "string" ? r.title : "";
          const titleBn = typeof r.title_bn === "string" ? r.title_bn : "";
          const links = parseLinkList(
            typeof r.links === "string" ? r.links : "",
          );
          const linksBn = parseLinkList(
            typeof r.links_bn === "string" ? r.links_bn : "",
          );
          return {
            title: locale === "bn" && titleBn ? titleBn : title,
            links: locale === "bn" && linksBn.length > 0 ? linksBn : links,
          };
        })
        .filter((col) => col.title || col.links.length > 0)
    : [];
  const columns =
    itemRows.length > 0
      ? itemRows
      : [1, 2, 3, 4]
          .map((n) => ({
            title: str(`c${n}Title`),
            links: parseLinkList(str(`c${n}Links`)),
          }))
          .filter((col) => col.title || col.links.length > 0);
  const statementHeading = locale === "bn" ? STATEMENT.heading_bn : STATEMENT.heading;
  const statementBody = locale === "bn" ? STATEMENT.body_bn : STATEMENT.body;
  const nlHeading = locale === "bn" ? NEWSLETTER.heading_bn : NEWSLETTER.heading;
  const nlButton = locale === "bn" ? NEWSLETTER.buttonLabel_bn : NEWSLETTER.buttonLabel;
  const nlConsent = locale === "bn" ? NEWSLETTER.consentText_bn : NEWSLETTER.consentText;
  const paymentHeading = locale === "bn" ? "পেমেন্ট মাধ্যম" : "Payment methods";
  const brandName = locale === "bn" ? "সংস্কৃতি" : "Songoskriti";

  return (
    <section className="w-full flex flex-col pt-10 sm:pt-20">
      {/* ZONE 1: Brand closing statement */}
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-16 sm:mb-24 flex flex-col md:flex-row items-start justify-between gap-8">
        <h2 className="font-serif text-[40px] sm:text-[56px] lg:text-[72px] font-light leading-[1.1] tracking-[0.01em] text-[var(--theme-ink)] max-w-3xl">
          {statementHeading}
        </h2>
        <div className="flex flex-col md:items-end text-left md:text-right max-w-xs mt-2 md:mt-4">
          <p className="font-serif text-[15px] sm:text-[18px] font-light leading-relaxed text-[var(--theme-ink)]/70 mb-4">
            {statementBody}
          </p>
          <a href={link("/pages/about")} className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)] hover:opacity-70 transition-opacity">
            {locale === "bn" ? "আমাদের গল্প →" : "OUR STORY →"}
          </a>
        </div>
      </div>

      {/* ZONE 2: Newsletter */}
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-20 sm:mb-32">
        <div className="border-t border-b border-[var(--theme-border)] py-10 sm:py-16 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 lg:gap-16">
          <div className="w-full lg:w-1/2">
            <h3 className="font-serif text-[24px] sm:text-[32px] font-light tracking-[0.02em] text-[var(--theme-ink)] uppercase">
              {nlHeading}
            </h3>
          </div>
          <div className="w-full lg:w-1/2 max-w-lg">
            <form className="flex flex-col sm:flex-row items-center gap-3 w-full" method="post" action="#newsletter">
              <input
                name="email" type="email" required
                className="h-12 w-full flex-1 rounded-none border-b border-[var(--theme-border)] bg-transparent px-2 py-2 text-[13px] outline-none transition-colors placeholder:text-[var(--theme-ink)]/30 focus:border-[var(--theme-ink)]"
                placeholder={locale === "bn" ? "ইমেইল লিখুন" : "Enter your email"}
              />
              <button
                type="submit"
                className="h-12 w-full sm:w-auto px-8 bg-[var(--theme-ink)] text-[var(--theme-surface)] text-[11px] font-medium uppercase tracking-[0.2em] hover:bg-[var(--theme-ink)]/90 transition-colors flex-shrink-0"
              >
                {nlButton}
              </button>
            </form>
            <p className="mt-4 text-[10px] text-[var(--theme-ink)]/40 uppercase tracking-widest text-left">
              {nlConsent}
            </p>
          </div>
        </div>
      </div>

      {/* ZONE 3: Utility navigation/contact matrix */}
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-20 sm:mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* LEFT: Brand identity & social */}
          <div className="lg:col-span-4 flex flex-col pb-8 lg:pb-0 border-b border-[var(--theme-border)] lg:border-none">
            <span className="font-serif text-[28px] sm:text-[36px] text-[var(--theme-ink)] tracking-wider mb-6">
              {brandName}
            </span>
            <div className="flex items-center gap-4 text-[var(--theme-ink)]/60">
              <a href="#" className="hover:text-[var(--theme-ink)] transition-colors"><Instagram size={18} /></a>
              <a href="#" className="hover:text-[var(--theme-ink)] transition-colors"><Facebook size={18} /></a>
              <a href="#" className="hover:text-[var(--theme-ink)] transition-colors"><Twitter size={18} /></a>
            </div>
          </div>
          
          {/* CENTER & RIGHT: Navigation columns */}
          <div className="lg:col-span-8 grid grid-cols-1 min-[400px]:grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4 lg:gap-12">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)] mb-6 sm:mb-8">
                  {col.title}
                </p>
                <ul className="space-y-4">
                  {col.links.map((linkItem) => (
                    <li key={`${col.title}-${linkItem.label}`}>
                      <a
                        href={link(linkItem.href)}
                        className="font-serif text-[15px] font-light text-[var(--theme-ink)]/70 hover:text-[var(--theme-ink)] transition-colors"
                      >
                        {linkItem.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ZONE 4: Payments & Legal */}
      <div className="border-t border-[var(--theme-border)]">
        <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-6 sm:py-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/50">
              {paymentHeading}
            </span>
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {PAYMENT_MARKS.split(/[,\n]+/).map(m => m.trim()).filter(Boolean).slice(0,12).map((mark) => (
                <li key={mark}>
                  <PaymentMark mark={mark} />
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-8 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--theme-ink)]/50 w-full md:w-auto justify-center md:justify-end">
            <span>© 2026 {brandName}</span>
            <a href={link("/pages/terms")} className="hover:text-[var(--theme-ink)] transition-colors">Terms</a>
            <a href={link("/pages/privacy")} className="hover:text-[var(--theme-ink)] transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </section>
  );
};

const SongoskritiPaymentIcons: WidgetComponent = ({ str }) => {
  const marks = str("marks")
    .split(/[,\n]+/)
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (marks.length === 0) return null;
  return (
    <section className="py-12 text-center w-full">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        {str("heading") && (
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 mb-6">
            {str("heading")}
          </p>
        )}
        <ul className="flex flex-wrap items-center justify-center gap-4">
          {marks.map((mark) => (
            <li key={mark}>
              <PaymentMark mark={mark} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/* ---------------------------------------------------- luxury categories */

const SongoskritiDepartmentGrid: WidgetComponent = ({
  str,
  section,
  link,
  locale,
}) => {
  const departments = rowsOf(section, "departments")
    .map((row) => ({
      title: readBn(row, "title", locale) || readBn(row, "name", locale),
      image: readString(row, "image"),
      href: readString(row, "href"),
    }))
    .filter((d) => d.title && d.href);

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  if (departments.length === 0) return null;

  const heading =
    str("heading") ||
    (locale === "bn" ? "আমাদের সংগ্রহ" : "SHOP THE COLLECTION");

  // 6-tile layout: first 2 tiles are taller (portrait hero), rest are landscape grid
  const heroes = departments.slice(0, 2);
  const grid = departments.slice(2);

  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="py-16 sm:py-20 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]"
    >
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="flex items-center justify-between mb-10">
          <h2 className="font-serif text-[22px] sm:text-[28px] font-light tracking-[0.04em] text-[var(--theme-ink)] uppercase">
            {heading}
          </h2>
          <a
            href={link("/c")}
            className="hidden sm:flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 hover:text-[var(--theme-ink)] transition-colors"
          >
            {locale === "bn" ? "সব দেখুন" : "VIEW ALL"} →
          </a>
        </div>
        {/* Desktop: 6-column grid. Mobile: 2-column grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {departments.map((dept, i) => (
            <a
              key={dept.title}
              href={link(dept.href)}
              className={`group block relative overflow-hidden ${
                // First two tiles taller on desktop
                i < 2 ? "lg:row-span-1" : ""
              }`}
            >
              <div
                className={`relative w-full overflow-hidden bg-[var(--theme-muted)] ${
                  i < 2 ? "aspect-[2/3]" : "aspect-[3/4]"
                }`}
              >
                {dept.image ? (
                  <img
                    src={dept.image}
                    alt={dept.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1800ms] ease-out group-hover:scale-[1.05]"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-2xl text-[var(--theme-ink)]/10 select-none font-serif">
                    {dept.title.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent transition-opacity duration-500 group-hover:from-black/80" />
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                  <h3 className="font-serif text-[14px] sm:text-[16px] font-light text-[var(--theme-surface)] tracking-[0.05em] uppercase leading-tight">
                    {dept.title}
                  </h3>
                  <span className="mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-surface)]/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {locale === "bn" ? "দেখুন →" : "SHOP →"}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------ luxury mega menu */

// Mega menu subcategory definitions (spec §3)
const MEGA_MENU_DEFS: Record<
  string,
  {
    sections: Array<{ title: string; links: string[] }>;
    featuredImage?: string;
    shopAllHref: string;
  }
> = {
  Women: {
    sections: [
      {
        title: "BY TYPE",
        links: ["Sarees", "Salwar Kameez", "Kurta", "Blouses", "Dupatta"],
      },
      {
        title: "BY WEAVE",
        links: [
          "Jamdani",
          "Tangail",
          "Rajshahi Silk",
          "Nakshi Kantha",
          "Khadi",
        ],
      },
      {
        title: "BY OCCASION",
        links: ["Festive", "Wedding", "Everyday", "New Arrivals"],
      },
    ],
    featuredImage: "/ph/songoskriti/cat-women.png",
    shopAllHref: "/c/women",
  },
  Men: {
    sections: [
      { title: "BY TYPE", links: ["Panjabi", "Pajama", "Kurta", "Shirts"] },
      {
        title: "BY OCCASION",
        links: ["Festive", "Wedding", "Everyday", "Handloom"],
      },
    ],
    featuredImage: "/ph/songoskriti/cat-men.png",
    shopAllHref: "/c/men",
  },
  Kids: {
    sections: [
      { title: "BY GENDER", links: ["Girls", "Boys", "Unisex"] },
      { title: "BY OCCASION", links: ["Festive", "School", "Family Matching"] },
    ],
    featuredImage: "/ph/songoskriti/cat-kids.png",
    shopAllHref: "/c/kids",
  },
  Sarees: {
    sections: [
      {
        title: "BY WEAVE",
        links: [
          "Jamdani",
          "Tangail Taant",
          "Rajshahi Silk",
          "Cotton",
          "Muslin",
        ],
      },
      {
        title: "BY OCCASION",
        links: ["Bridal", "Festive", "Everyday", "Party"],
      },
    ],
    featuredImage: "/ph/songoskriti/prod-saree.png",
    shopAllHref: "/c/sarees",
  },
  Jewellery: {
    sections: [
      {
        title: "BY TYPE",
        links: ["Earrings", "Necklace", "Jhumka", "Bangles", "Rings"],
      },
      {
        title: "BY STYLE",
        links: ["Heritage", "Contemporary", "Bridal", "Everyday"],
      },
    ],
    featuredImage: "/ph/songoskriti/cat-jewelry.png",
    shopAllHref: "/c/jewellery",
  },
  Festive: {
    sections: [
      {
        title: "BY OCCASION",
        links: ["Eid", "Puja", "Weddings", "Mehendi", "Sangeet", "Gifting"],
      },
      {
        title: "BY GENDER",
        links: ["For Women", "For Men", "For Kids", "Family Matching"],
      },
    ],
    featuredImage: "/ph/songoskriti/hero-festive.png",
    shopAllHref: "/c/festive",
  },
  Heritage: {
    sections: [
      {
        title: "BY CRAFT",
        links: [
          "Jamdani",
          "Nakshi Kantha",
          "Rajshahi Silk",
          "Tangail",
          "Khadi",
          "Muslin",
        ],
      },
      {
        title: "STORIES",
        links: ["Artisan Stories", "Weave Guides", "Care Guide"],
      },
    ],
    featuredImage: "/ph/songoskriti/hero-weaves.png",
    shopAllHref: "/c/heritage",
  },
};

const SongoskritiMegaMenu: WidgetComponent = ({
  str,
  int,
  data,
  link,
  template,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const rows = data?.rows ?? [];
  const label = str("label") || "Shop";
  const visible = rows.slice(0, int("limit", 12, 1, 24));

  // Only the homepage (index) gets the transparent-over-hero treatment.
  // All other templates (collection, product, search, etc.) always use
  // the solid ivory surface so text is always readable.
  const isHomepage = !template || template === "index";

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!isHomepage) return; // non-homepage: always solid, no listener needed
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHomepage]);

  // Static nav items (spec §2 center nav)
  const NAV_ITEMS = [
    "Women",
    "Men",
    "Kids",
    "Sarees",
    "Panjabi",
    "Festive",
    "Wedding",
    "Jewellery",
    "Heritage",
    "New Arrivals",
  ];

  // On homepage: transparent (white text) at top, solid when scrolled.
  // On all other templates: always solid ivory (dark text).
  const isSolid = !isHomepage || scrolled;
  const textColor = isSolid
    ? "text-[var(--theme-ink)]"
    : "text-[var(--theme-surface)]";
  const activeDef = activeMenu ? MEGA_MENU_DEFS[activeMenu] : null;

  return (
    <div
      className={`relative w-full transition-all duration-300 ease-out border-b ${
        isSolid
          ? "bg-[var(--theme-surface)] border-[var(--theme-border)]"
          : "bg-transparent border-transparent"
      }`}
      onMouseLeave={() => setActiveMenu(null)}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-12 max-w-[var(--fq-container,1440px)] items-center justify-center gap-6 px-4"
      >
        {NAV_ITEMS.map((item) => {
          const href =
            item === "New Arrivals"
              ? "/c/new-in"
              : item === "Panjabi"
                ? "/c/panjabi"
                : item === "Wedding"
                  ? "/c/wedding"
                  : `/c/${item.toLowerCase()}`;
          const hasMega = !!MEGA_MENU_DEFS[item];
          return (
            <div
              key={item}
              className="relative flex h-full items-center"
              onMouseEnter={() =>
                hasMega ? setActiveMenu(item) : setActiveMenu(null)
              }
            >
              <a
                href={link(href)}
                className={`inline-flex h-full items-center gap-1 whitespace-nowrap px-0.5 font-sans text-[11px] font-semibold tracking-[0.14em] uppercase transition-all duration-200 hover:opacity-60 ${
                  activeMenu === item ? "opacity-60" : ""
                } ${textColor}`}
              >
                {item}
                {hasMega && (
                  <ChevronDown
                    size={9}
                    className={`shrink-0 transition-transform duration-200 ${activeMenu === item ? "rotate-180" : ""}`}
                  />
                )}
              </a>
            </div>
          );
        })}
      </nav>

      {/* Mega menu panel */}
      {activeMenu && activeDef && (
        <div
          className="absolute left-0 top-full z-50 w-full bg-[var(--theme-surface)]/98 backdrop-blur-2xl shadow-2xl border-t border-[var(--theme-border)]"
          onMouseEnter={() => setActiveMenu(activeMenu)}
        >
          <div className="mx-auto max-w-[var(--fq-container,1440px)] px-8 py-10 grid grid-cols-12 gap-8">
            {/* Left: subcategory columns */}
            <div className="col-span-8 grid grid-cols-3 gap-8">
              {activeDef.sections.map((section) => (
                <div key={section.title}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--theme-ink)]/40 mb-4">
                    {section.title}
                  </p>
                  <ul className="space-y-2.5">
                    {section.links.map((linkText) => (
                      <li key={linkText}>
                        <a
                          href={link(
                            `/c/${linkText.toLowerCase().replace(/\s+/g, "-")}`,
                          )}
                          className="block font-serif text-[14px] font-light text-[var(--theme-ink)]/75 hover:text-[var(--theme-ink)] transition-colors leading-snug"
                        >
                          {linkText}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {section.title === activeDef.sections[0]?.title && (
                    <a
                      href={link(activeDef.shopAllHref)}
                      className="mt-6 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)] border-b border-[var(--theme-ink)] pb-0.5 hover:opacity-60 transition-opacity"
                    >
                      SHOP ALL {activeMenu} →
                    </a>
                  )}
                </div>
              ))}
            </div>
            {/* Right: featured image */}
            {activeDef.featuredImage && (
              <div className="col-span-4">
                <a
                  href={link(activeDef.shopAllHref)}
                  className="group block relative aspect-[3/4] overflow-hidden bg-[var(--theme-muted)]"
                >
                  <img
                    src={activeDef.featuredImage}
                    alt={activeMenu}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--theme-surface)]/70 mb-1">
                      Featured
                    </p>
                    <p className="font-serif text-[18px] font-light text-[var(--theme-surface)]">
                      {activeMenu}
                    </p>
                  </div>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SongoskritiSplitFeature: WidgetComponent = ({ str, locale, link }) => {
  const layout = str("layout") || "image_left";
  const heading = str("heading");
  const body = str("body");
  const primaryImage = str("primaryImage");
  const secondaryImage = str("secondaryImage");

  return (
    <section className="bg-[var(--theme-surface)] py-16 sm:py-24">
      <div
        className={`mx-auto flex flex-col md:flex-row max-w-[var(--fq-container,1440px)] gap-8 lg:gap-16 px-4 sm:px-8 items-center ${layout === "image_right" ? "md:flex-row-reverse" : ""}`}
      >
        <div className="w-full md:w-1/2 flex gap-4">
          <div className="w-2/3 aspect-[3/4] overflow-hidden bg-[var(--theme-muted)]">
            {primaryImage && (
              <img
                src={primaryImage}
                className="w-full h-full object-cover"
                loading="lazy"
                alt=""
              />
            )}
          </div>
          <div className="w-1/3 flex items-end">
            <div className="w-full aspect-[2/3] overflow-hidden bg-[var(--theme-muted)]">
              {secondaryImage && (
                <img
                  src={secondaryImage}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  alt=""
                />
              )}
            </div>
          </div>
        </div>
        <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left mt-8 md:mt-0 px-4 md:px-12">
          {heading && (
            <h2 className="font-serif text-[32px] sm:text-[44px] lg:text-[56px] font-light leading-tight tracking-[0.01em] text-[var(--theme-ink)] mb-6">
              {heading}
            </h2>
          )}
          {body && (
            <p className="font-serif text-[15px] sm:text-[18px] font-light leading-relaxed text-[var(--theme-ink)]/60 mb-10 max-w-md">
              {body}
            </p>
          )}
          <div className="flex gap-6 flex-wrap justify-center md:justify-start">
            {str("ctaLabel") && (
              <a
                href={link(str("ctaUrl") || "#")}
                className="inline-flex items-center min-h-11 border-b-2 border-[var(--theme-ink)]/40 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-[var(--theme-ink)] hover:border-[var(--theme-ink)] transition-all duration-300"
              >
                {str("ctaLabel")}
              </a>
            )}
            {str("ctaLabel2") && (
              <a
                href={link(str("ctaUrl2") || "#")}
                className="inline-flex items-center min-h-11 border-b-2 border-[var(--theme-ink)]/40 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-[var(--theme-ink)] hover:border-[var(--theme-ink)] transition-all duration-300"
              >
                {str("ctaLabel2")}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const SongoskritiCollectionStory: WidgetComponent = ({
  str,
  section,
  locale,
  link,
}) => {
  const heading = str("heading");
  const subhead = str("subhead");
  const collections = rowsOf(section, "collections")
    .map((row) => ({
      title: readString(row, "title"),
      image: readString(row, "image"),
      href: readString(row, "href"),
      subtitle: readString(row, "subtitle"),
    }))
    .filter((c) => c.title);

  return (
    <section className="bg-[var(--theme-muted)] py-20 sm:py-32">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="text-center mb-16">
          {heading && (
            <h2 className="font-serif text-[32px] sm:text-[48px] font-light text-[var(--theme-ink)] mb-4">
              {heading}
            </h2>
          )}
          {subhead && (
            <p className="font-serif text-[15px] text-[var(--theme-ink)]/60 max-w-xl mx-auto">
              {subhead}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {collections.map((c, i) => (
            <a
              key={i}
              href={link(c.href || "#")}
              className="group block text-center"
            >
              <div className="w-full aspect-[4/5] overflow-hidden bg-[var(--theme-surface)] mb-6">
                {c.image && (
                  <img
                    src={c.image}
                    alt={c.title}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
              </div>
              {c.subtitle && (
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/40 mb-2">
                  {c.subtitle}
                </p>
              )}
              <h3 className="font-serif text-[18px] font-light tracking-wide text-[var(--theme-ink)] group-hover:text-[var(--theme-ink)]/70 transition-colors">
                {c.title}
              </h3>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

const SongoskritiUgcGallery: WidgetComponent = ({ str, section, locale }) => {
  const heading = str("heading");
  const subhead = str("subhead");
  const images = (str("images") || "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  const displayImages =
    images.length > 0
      ? images
      : Array.from({ length: 4 }).map(
          (_, i) => `/api/public/ph/ugc-${i + 1}.svg`,
        );

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="py-16 sm:py-24 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]"
    >
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-10 gap-4">
          <div>
            {subhead && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--theme-ink)]/40 mb-2">
                {subhead}
              </p>
            )}
            {heading && (
              <h2 className="font-serif text-[28px] sm:text-[36px] font-light text-[var(--theme-ink)]">
                {heading}
              </h2>
            )}
          </div>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 hover:text-[var(--theme-ink)] transition-colors shrink-0"
          >
            @SONGOSKRITI →
          </a>
        </div>
        {/* Masonry-style grid: first image tall, rest normal */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {displayImages.slice(0, 1).map((img, i) => (
            <div
              key={`ugc-main-${i}`}
              className="col-span-2 row-span-2 sm:row-span-1 aspect-square sm:aspect-[4/5] overflow-hidden bg-[var(--theme-muted)] group sm:col-span-2"
            >
              <img
                src={img}
                alt=""
                className="w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
          ))}
          {displayImages.slice(1, 4).map((img, i) => (
            <div
              key={`ugc-${i}`}
              className="aspect-[4/5] overflow-hidden bg-[var(--theme-muted)] group"
            >
              <img
                src={img}
                alt=""
                className="w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.03]"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const SongoskritiStoreLocator: WidgetComponent = ({ str, locale }) => {
  const heading =
    str("heading") ||
    (locale === "bn" ? "আমাদের স্টোরসমূহ" : "VISIT SONGOSKRITI");
  const stores = [1, 2, 3]
    .map((n) => ({
      name: str(`s${n}Name`),
      hours: str(`s${n}Hours`),
    }))
    .filter((s) => s.name);

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  if (stores.length === 0) return null;

  const STORE_IMAGES = [
    "/ph/songoskriti/cat-women.png",
    "/ph/songoskriti/cat-men.png",
    "/ph/songoskriti/hero-festive.png",
  ];

  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="py-16 sm:py-24 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]"
    >
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="text-center mb-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--theme-ink)]/40 mb-3">
            {locale === "bn" ? "আমাদের শাখাসমূহ" : "OUR STORES"}
          </p>
          <h2 className="font-serif text-[28px] sm:text-[40px] font-light text-[var(--theme-ink)]">
            {heading}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {stores.map((store, i) => (
            <div key={i} className="group flex flex-col">
              <div className="aspect-[4/3] overflow-hidden bg-[var(--theme-muted)] mb-6">
                <img
                  src={STORE_IMAGES[i % STORE_IMAGES.length]}
                  alt={store.name}
                  className="w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]"
                  loading="lazy"
                />
              </div>
              <div className="h-px w-8 bg-[var(--theme-ink)]/15 mb-5" />
              <h3 className="font-sans text-[12px] font-semibold uppercase tracking-[0.22em] text-[var(--theme-ink)] mb-2">
                {store.name}
              </h3>
              {store.hours && (
                <p className="font-serif text-[14px] font-light text-[var(--theme-ink)]/60 mb-5">
                  {store.hours}
                </p>
              )}
              <a
                href="#"
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 hover:text-[var(--theme-ink)] transition-colors"
              >
                {locale === "bn" ? "দিকনির্দেশনা পান →" : "GET DIRECTIONS →"}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* --------------------------------------------------- category_header */

/**
 * Collection page header: breadcrumb + title + editorial intro + subnav.
 * Replaces the generic `heading` + manual nav on collection templates.
 *
 * Props:
 *   title / title_bn      — collection name
 *   description / desc_bn — short editorial line
 *   collectionType        — "curated" | "department" | "occasion" (default: curated)
 *   subnav                — comma-separated "Label:/c/slug" pairs
 *   homeLabel / homeLabel_bn — breadcrumb home label (default: Home / হোম)
 *   breadcrumbParent      — optional parent level: "Women > Sarees"
 */
const SongoskritiCategoryHeader: WidgetComponent = ({
  str,
  locale,
  link,
  section,
}) => {
  const title = str("title") || str("text") || "Collection";
  const titleBn = str("title_bn") || str("text_bn") || title;
  const desc = str("description") || str("body") || "";
  const descBn = str("description_bn") || str("body_bn") || desc;
  const collectionType = (str("collectionType") || "curated") as
    "curated" | "department" | "occasion";
  const homeLabel = t(
    locale,
    str("homeLabel") || "Home",
    str("homeLabel_bn") || "হোম",
  );
  const breadcrumbParent = str("breadcrumbParent") || "";

  // Parse subnav: comma-separated "Label:/c/slug" pairs
  const subnavRaw = str("subnav") || "";
  const subnavItems = subnavRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const colonIdx = item.lastIndexOf(":");
      if (colonIdx === -1) return { label: item, href: "#" };
      return {
        label: item.slice(0, colonIdx).trim(),
        href: item.slice(colonIdx + 1).trim(),
      };
    });

  const displayTitle = t(locale, title, titleBn);
  const displayDesc = t(locale, desc, descBn);

  // Tightly-sized bg that matches the page surface (not white, not grey)
  // so breadcrumb through subnav reads as one compact region.
  return (
    <div
      className="w-full bg-[var(--theme-surface)] border-b border-[var(--theme-border)]"
      data-collection-header
    >
      {/* Breadcrumb strip */}
      <div className="mx-auto max-w-6xl px-4 sm:px-8 flex justify-center">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 pt-12 pb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/40"
        >
          <a
            href={link("/")}
            className="hover:text-[var(--theme-ink)]/70 transition-colors"
          >
            {homeLabel}
          </a>
          {breadcrumbParent && (
            <>
              <span>/</span>
              <span>{breadcrumbParent}</span>
            </>
          )}
          <span>/</span>
          <span className="text-[var(--theme-ink)]/70">{displayTitle}</span>
        </nav>
      </div>

      {/* Title + description */}
      <div className="mx-auto max-w-4xl px-4 sm:px-8 pb-16 sm:pb-24 flex flex-col items-center text-center">
        <h1 className="font-serif text-[40px] sm:text-[56px] lg:text-[72px] font-light text-[var(--theme-ink)] leading-[1.1] tracking-[0.01em]">
          {displayTitle}
        </h1>
        {displayDesc && (
          <p className="mt-5 font-serif text-[15px] sm:text-[18px] font-light italic leading-relaxed text-[var(--theme-ink)]/60 max-w-2xl">
            {displayDesc}
          </p>
        )}
      </div>

      {/* Contextual subnav — only when items exist */}
      {subnavItems.length > 0 && (
        <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
          <nav
            aria-label="Collection navigation"
            className="overflow-x-auto scrollbar-none"
          >
            <ul className="flex items-center gap-0 min-w-max border-t border-[var(--theme-border)]">
              {subnavItems.map((item, i) => (
                <li key={i}>
                  <a
                    href={link(item.href)}
                    className="inline-block px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-ink)]/50 hover:text-[var(--theme-ink)] border-b-2 border-transparent hover:border-[var(--theme-ink)]/30 transition-all duration-200 whitespace-nowrap"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
};

/* --------------------------------------------------- result_toolbar */

/**
 * Collection page toolbar: product count + filter drawer trigger + sort.
 * Renders a compact bar that sticks just below the mega-menu on scroll.
 *
 * Props:
 *   countLabel / countLabel_bn — e.g. "24 Products"
 *   sortDefault               — default sort label (e.g. "Featured")
 */
const SongoskritiResultToolbar: WidgetComponent = ({ str, data, locale }) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const count = data?.rows?.length ?? 0;
  const countLabel =
    count > 0
      ? t(locale, `${count} Products`, `${count}টি পণ্য`)
      : t(locale, "Products", "পণ্য");
  const sortLabel = str("sortDefault") || t(locale, "Featured", "বৈশিষ্ট্য");

  const filterLabel = t(locale, "Filter", "ফিল্টার");
  const sortByLabel = t(locale, "Sort:", "সাজান:");
  const clearLabel = t(locale, "Clear All", "সব মুছুন");
  const applyLabel = t(locale, "Apply", "প্রয়োগ করুন");
  const filtersLabel = t(locale, "Filters", "ফিল্টার");

  // Filter groups for this Songoskriti context
  // In a live implementation these come from real facet data;
  // for the preview/theme system they are representative placeholders.
  const FILTER_GROUPS: { title: string; items: string[] }[] = [
    {
      title: t(locale, "Category", "ক্যাটাগরি"),
      items:
        locale === "bn"
          ? ["শাড়ি", "পাঞ্জাবি", "শিশু", "গহনা"]
          : ["Sarees", "Panjabi", "Kids", "Jewellery"],
    },
    {
      title: t(locale, "Occasion", "উপলক্ষ"),
      items:
        locale === "bn"
          ? ["উৎসব", "বিয়ে", "প্রতিদিন", "ঈদ"]
          : ["Festive", "Wedding", "Everyday", "Eid"],
    },
    {
      title: t(locale, "Price", "মূল্য"),
      items:
        locale === "bn"
          ? ["৳৫,০০০-এর নিচে", "৳৫,০০০–১০,০০০", "৳১০,০০০-এর বেশি"]
          : ["Under ৳5,000", "৳5,000–10,000", "Above ৳10,000"],
    },
    {
      title: t(locale, "Availability", "প্রাপ্যতা"),
      items:
        locale === "bn"
          ? ["স্টকে আছে", "স্টক নেই"]
          : ["In Stock", "Out of Stock"],
    },
  ];

  const SORT_OPTIONS: string[] =
    locale === "bn"
      ? ["বৈশিষ্ট্য", "সর্বশেষ", "দাম: কম থেকে বেশি", "দাম: বেশি থেকে কম"]
      : [
          "Featured",
          "Newest first",
          "Price: low to high",
          "Price: high to low",
        ];

  return (
    <>
      {/* ── Toolbar bar ─────────────────────────────────────── */}
      <div className="w-full bg-[var(--theme-surface)] border-b border-[var(--theme-border)]">
        <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
          <div className="flex items-center justify-between h-12 gap-4">
            {/* Filter button */}
            <button
              onClick={() => setFilterOpen(true)}
              className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--theme-ink)] hover:opacity-60 transition-opacity"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <line x1="1" y1="3.5" x2="13" y2="3.5" />
                <line x1="1" y1="7" x2="13" y2="7" />
                <line x1="1" y1="10.5" x2="13" y2="10.5" />
                <circle
                  cx="4"
                  cy="3.5"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="9"
                  cy="7"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="4"
                  cy="10.5"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              {filterLabel}
            </button>

            {/* Count — center on desktop */}
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--theme-ink)]/40 hidden sm:block">
              {countLabel}
            </span>

            {/* Sort button */}
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="relative flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--theme-ink)] hover:opacity-60 transition-opacity"
            >
              <span className="text-[var(--theme-ink)]/40">{sortByLabel}</span>
              {sortLabel}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <polyline points="2,3.5 5,6.5 8,3.5" />
              </svg>
              {/* Sort dropdown */}
              {sortOpen && (
                <ul className="absolute top-full right-0 mt-1 w-52 bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-lg z-40 py-1">
                  {SORT_OPTIONS.map((opt) => (
                    <li key={opt}>
                      <button
                        onClick={() => setSortOpen(false)}
                        className="w-full text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--theme-ink)] hover:bg-[var(--theme-surface)] transition-colors"
                      >
                        {opt}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter drawer ───────────────────────────────────── */}
      {filterOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[var(--theme-ink)]/30 z-[60] backdrop-blur-[2px]"
            onClick={() => setFilterOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div className="fixed inset-y-0 left-0 w-full max-w-[340px] bg-[var(--theme-surface)] z-[70] shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--theme-border)]">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--theme-ink)]">
                {filtersLabel}
              </h2>
              <button
                onClick={() => setFilterOpen(false)}
                className="text-[var(--theme-ink)]/40 hover:text-[var(--theme-ink)] transition-colors p-1 -mr-1"
                aria-label="Close filters"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <line x1="3" y1="3" x2="15" y2="15" />
                  <line x1="15" y1="3" x2="3" y2="15" />
                </svg>
              </button>
            </div>

            {/* Filter groups */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
              {FILTER_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-ink)]/40 mb-4">
                    {group.title}
                  </h3>
                  <ul className="space-y-3">
                    {group.items.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <span className="size-4 border border-[var(--theme-ink)]/20 flex items-center justify-center flex-shrink-0">
                          {/* Checkbox visual */}
                        </span>
                        <span className="text-[13px] text-[var(--theme-ink)]/80 font-sans">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-5 border-t border-[var(--theme-border)] grid grid-cols-2 gap-3">
              <button
                onClick={() => setFilterOpen(false)}
                className="py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--theme-ink)] border border-[var(--theme-ink)]/20 hover:border-[var(--theme-ink)]/40 transition-colors bg-transparent"
              >
                {clearLabel}
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--theme-surface)] bg-[var(--theme-ink)] hover:bg-[var(--theme-ink)]/90 transition-colors"
              >
                {applyLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

/* ------------------------------------------------------ exports */

export const SONGOSKRITI_WIDGETS: Record<
  Extract<
    SectionType,
    | "finder_row"
    | "craft_story"
    | "testimonials"
    | "trust_footer"
    | "product_rail"
    | "product_grid"
    | "rich_text"
    | "newsletter"
    | "footer_sitemap"
    | "payment_icons"
    | "department_grid"
    | "mega_menu"
    | "store_locator"
    | "split_feature"
    | "collection_story"
    | "ugc_gallery"
    | "category_header"
    | "result_toolbar"
  >,
  WidgetComponent
> = {
  finder_row: FinderRow,
  craft_story: CraftStory,
  testimonials: Testimonials,
  trust_footer: TrustFooter,
  product_rail: SongoskritiProductRail,
  product_grid: SongoskritiProductGrid,
  rich_text: SongoskritiRichText,
  newsletter: SongoskritiNewsletter,
  footer_sitemap: SongoskritiFooterSitemap,
  payment_icons: SongoskritiPaymentIcons,
  department_grid: SongoskritiDepartmentGrid,
  mega_menu: SongoskritiMegaMenu,
  store_locator: SongoskritiStoreLocator,
  split_feature: SongoskritiSplitFeature,
  collection_story: SongoskritiCollectionStory,
  ugc_gallery: SongoskritiUgcGallery,
  category_header: SongoskritiCategoryHeader,
  result_toolbar: SongoskritiResultToolbar,
};
