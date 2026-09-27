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
import { useRef, useState, useEffect, type KeyboardEvent } from "react";
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
import { ProductCard, ProductCardSkeleton, WishlistHeart } from "./primitives/ProductCard";
import { cardVariantOf } from "./merch";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";
import { placeholderSeed } from "@/lib/placeholder";
import { parseLinkList } from "./chrome";
import { formatDisplayMoney } from "@/lib/money-display";
import { Instagram, Facebook, Twitter } from "lucide-react";
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
                  <li key={o.label} className="border-b border-[var(--theme-border)] last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
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

/* Neutral imageless fallback: a deterministic placeholder tile per seed —
   never brand art. Theme-authored `imageUrl` props always win at the call
   site; this only covers imageless rows in shared preview/demo renders. */
const getLuxuryImage = (seed: string) =>
  `/api/public/ph/${placeholderSeed(seed)}`;

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
        {/* Wishlist button — only when a variant exists to save (mirrors
            the shared ProductCard gate); skipping it keeps provider-less
            renders (preview/tests) safe. */}
        {row.variants?.[0]?.id && (
          <WishlistHeart
            storeSlug="demo"
            variantId={row.variants[0].id}
            locale="en"
            className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--theme-surface)]/90 text-[var(--theme-ink)] shadow-sm backdrop-blur-sm transition-all duration-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 group/btn"
          />
        )}
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

/**
 * Songoskriti product rail — luxury editorial skin over the shared
 * merchandising primitives.
 *
 * Browser-verified rhythm (2026-09-24, pinned by songoskriti.test.tsx):
 * heading + arrows share one docked header row (`justify-between`) ahead
 * of the card list — never a floating control row beneath it. The shared
 * `Rail` primitive went button-less (snap-scroll redesign), so this rail
 * owns its docked header + scroll list here: same keyboard contract
 * (ArrowLeft/Right/Home/End on a labelled list), the same shared
 * `ProductCard` data semantics as the merch rail (prices, badges, stars —
 * byte-identical cards), 44px arrow targets, bn/en labels, and
 * reduced-motion gating. Colours ride `var(--theme-*)` tokens only.
 */
const SongoskritiProductRail: WidgetComponent = (ctx) => {
  const { str, bool, int, data, locale, Heading } = ctx;
  const rows = data?.rows?.slice(0, int("limit", 12, 1, 24));
  const label =
    str("heading") || (locale === "bn" ? "পণ্যের তালিকা" : "Product rail");
  const subhead = str("subhead");
  const variant = cardVariantOf(str("cardVariant"), "compact");
  const prevLabel = locale === "bn" ? "বামে স্ক্রল করুন" : "Scroll left";
  const nextLabel = locale === "bn" ? "ডানে স্ক্রল করুন" : "Scroll right";

  const listRef = useRef<HTMLUListElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const updateEdges = () => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 4) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < max - 4);
  };
  const rowCount = rows?.length ?? -1;
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);

  const nudge = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(160, el.clientWidth * 0.8),
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      listRef.current?.scrollTo({
        left: 0,
        behavior: reduced ? "auto" : "smooth",
      });
    } else if (event.key === "End") {
      event.preventDefault();
      const el = listRef.current;
      el?.scrollTo({
        left: el.scrollWidth,
        behavior: reduced ? "auto" : "smooth",
      });
    }
  };

  // h-11 w-11 is the 44px target in Tailwind scale (shared with the
  // <Rail> primitive this rail replaces): keeps the widget-skins 44px
  // contract green while the docked header owns its own scroll list.
  const arrowClassName =
    "flex h-11 w-11 items-center justify-center rounded-full border border-[var(--theme-border)] text-foreground motion-safe:transition-colors hover:bg-[var(--theme-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none";

  // Docked header: heading + both arrows share one row ahead of the list.
  const header = (
    <div className="mb-8 flex items-center justify-between gap-3">
      <div className="min-w-0">
        {str("heading") ? (
          <Heading className="font-serif text-[28px] sm:text-[36px] lg:text-[44px] font-light tracking-[0.01em] text-foreground">
            {str("heading")}
          </Heading>
        ) : (
          <span className="sr-only">{label}</span>
        )}
        {subhead && (
          <p className="mt-3 font-serif text-[14px] sm:text-[16px] font-light text-foreground/50 italic">
            {subhead}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={prevLabel}
          aria-disabled={!canLeft}
          onClick={() => nudge(-1)}
          className={arrowClassName}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          aria-disabled={!canRight}
          onClick={() => nudge(1)}
          className={arrowClassName}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );

  const sectionClassName =
    "w-full bg-[var(--theme-surface)] py-16 sm:py-24 border-t border-[var(--theme-border)]";

  if (rows !== undefined && rows.length === 0 && !data?.pending) return null;
  return (
    <section className={sectionClassName}>
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        {data?.pending || rows === undefined ? (
          <>
            {header}
            <div
              className="flex gap-6 overflow-hidden sm:gap-8"
              aria-hidden="true"
            >
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="w-[72vw] max-w-[300px] shrink-0 sm:w-[38vw] sm:max-w-[320px] lg:w-[22%]"
                >
                  <ProductCardSkeleton variant={variant} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {header}
            <ul
              ref={listRef}
              aria-label={label}
              tabIndex={0}
              onKeyDown={onListKeyDown}
              onScroll={updateEdges}
              style={{ WebkitOverflowScrolling: "touch" }}
              className="flex snap-x snap-mandatory gap-6 sm:gap-8 overflow-x-auto scroll-px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="shrink-0 snap-start w-[72vw] max-w-[300px] min-w-[10rem] sm:w-[38vw] sm:max-w-[320px] lg:w-[22%] lg:min-w-0"
                >
                  <SongoskritiProductCard
                    row={row}
                    promise={str("promise") || undefined}
                    badge={str("badgeLabel") || undefined}
                  />
                </li>
              ))}
            </ul>
          </>
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
          className="h-12 w-full flex-1 rounded-none border-b border-[var(--theme-border)] bg-transparent px-2 py-2 text-[13px] outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground"
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
      <section className="py-6 border-t border-[var(--theme-border)] text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/50">
          {body}
        </p>
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
  // Brand zones are theme-authored props (with `_bn` twins resolved through
  // `str`), never hardcoded imports: a bare section renders generic chrome
  // only. Each zone renders only when its heading prop is authored.
  const statementHeading = str("statementHeading");
  const statementBody = str("statementBody");
  const storyHref = str("storyHref") || "/pages/about";
  const storyLabel =
    str("storyLabel") || t(locale, "OUR STORY →", "আমাদের গল্প →");
  const newsletterHeading = str("newsletterHeading");
  const newsletterButton = str("newsletterButton") || "Subscribe";
  const newsletterConsent = str("newsletterConsent");
  const brandName = str("brandName");
  const paymentMarks = str("paymentsMarks")
    .split(/[,\n]+/)
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 12);
  const paymentHeading =
    str("paymentsHeading") || t(locale, "Payment methods", "পেমেন্ট মাধ্যম");

  return (
    <section className="w-full flex flex-col pt-10 sm:pt-20">
      {/* ZONE 1: Brand closing statement (theme-authored, skipped when empty) */}
      {statementHeading && (
        <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-16 sm:mb-24 flex flex-col md:flex-row items-start justify-between gap-8">
          <h2 className="font-serif text-[40px] sm:text-[56px] lg:text-[72px] font-light leading-[1.1] tracking-[0.01em] text-[var(--theme-ink)] max-w-3xl">
            {statementHeading}
          </h2>
          <div className="flex flex-col md:items-end text-left md:text-right max-w-xs mt-2 md:mt-4">
            {statementBody && (
              <p className="font-serif text-[15px] sm:text-[18px] font-light leading-relaxed text-[var(--theme-ink)]/70 mb-4">
                {statementBody}
              </p>
            )}
            <a
              href={link(storyHref)}
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)] hover:opacity-70 transition-opacity"
            >
              {storyLabel}
            </a>
          </div>
        </div>
      )}

      {/* ZONE 2: Newsletter (theme-authored, skipped when empty) */}
      {newsletterHeading && (
        <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-20 sm:mb-32">
          <div className="border-t border-b border-[var(--theme-border)] py-10 sm:py-16 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 lg:gap-16">
            <div className="w-full lg:w-1/2">
              <h3 className="font-serif text-[24px] sm:text-[32px] font-light tracking-[0.02em] text-[var(--theme-ink)] uppercase">
                {newsletterHeading}
              </h3>
            </div>
            <div className="w-full lg:w-1/2 max-w-lg">
              <form
                className="flex flex-col sm:flex-row items-center gap-3 w-full"
                method="post"
                action="#newsletter"
              >
                <input
                  name="email"
                  type="email"
                  required
                  className="h-12 w-full flex-1 rounded-none border-b border-[var(--theme-border)] bg-transparent px-2 py-2 text-[13px] outline-none transition-colors placeholder:text-[var(--theme-ink)]/30 focus:border-[var(--theme-ink)]"
                  placeholder={
                    locale === "bn" ? "ইমেইল লিখুন" : "Enter your email"
                  }
                />
                <button
                  type="submit"
                  className="h-12 w-full sm:w-auto px-8 bg-[var(--theme-ink)] text-[var(--theme-surface)] text-[11px] font-medium uppercase tracking-[0.2em] hover:bg-[var(--theme-ink)]/90 transition-colors flex-shrink-0"
                >
                  {newsletterButton}
                </button>
              </form>
              {newsletterConsent && (
                <p className="mt-4 text-[10px] text-[var(--theme-ink)]/40 uppercase tracking-widest text-left">
                  {newsletterConsent}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ZONE 3: Utility navigation/contact matrix */}
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-20 sm:mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* LEFT: Brand identity & social (theme-authored, skipped when empty) */}
          {brandName && (
            <div className="lg:col-span-4 flex flex-col pb-8 lg:pb-0 border-b border-[var(--theme-border)] lg:border-none">
              <span className="font-serif text-[28px] sm:text-[36px] text-[var(--theme-ink)] tracking-wider mb-6">
                {brandName}
              </span>
              <div className="flex items-center gap-4 text-[var(--theme-ink)]/60">
                <a
                  href="#"
                  className="hover:text-[var(--theme-ink)] transition-colors"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="#"
                  className="hover:text-[var(--theme-ink)] transition-colors"
                >
                  <Facebook size={18} />
                </a>
                <a
                  href="#"
                  className="hover:text-[var(--theme-ink)] transition-colors"
                >
                  <Twitter size={18} />
                </a>
              </div>
            </div>
          )}

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
          {paymentMarks.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/50">
                {paymentHeading}
              </span>
              <ul className="flex flex-wrap items-center justify-center gap-2">
                {paymentMarks.map((mark) => (
                  <li key={mark}>
                    <PaymentMark mark={mark} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 sm:gap-8 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--theme-ink)]/50 w-full md:w-auto justify-center md:justify-end">
            <span>© 2026{brandName ? ` ${brandName}` : ""}</span>
            <a
              href={link("/pages/terms")}
              className="hover:text-[var(--theme-ink)] transition-colors"
            >
              Terms
            </a>
            <a
              href={link("/pages/privacy")}
              className="hover:text-[var(--theme-ink)] transition-colors"
            >
              Privacy
            </a>
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
    <section className="py-12 border-t border-[var(--theme-border)] text-center">
      {str("heading") && (
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/50 mb-6">
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
    <section ref={scope} data-songoskriti-reveal className="py-16 sm:py-20 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]">
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
              <div className={`relative w-full overflow-hidden bg-[var(--theme-muted)] ${
                i < 2 ? "aspect-[2/3]" : "aspect-[3/4]"
              }`}>
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
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--theme-ink)]/70 via-black/10 to-transparent transition-opacity duration-500 group-hover:from-black/80" />
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

/**
 * Songoskriti mega menu — live-data tiers with a hardcoded safety net.
 *
 * (a) Host slot wins when present. `slot` is the existing WidgetCtx prop
 *     SectionRenderer fills from `contextSlots` — but only for
 *     template-context widgets (SectionRenderer.tsx:244-256), and mega_menu
 *     declares no `templates`, so no host supplies it today. The check costs
 *     nothing, reuses the existing pipe (no new plumbing), and lets a future
 *     host override win. Dashboard StoreMenus do NOT flow through this pipe;
 *     they reach songoskriti shoppers through `StoreHeader`, which owns that
 *     data. Do not wire a menu fetch here.
 * (b) Else live taxonomy rows (the registry's `taxonomy` source, honoring the
 *     `limit` param) render the top-level menubar — the same rows the generic
 *     chrome MegaMenu consumes. Flat taxonomy rows carry no children, so they
 *     render as plain top-level links with no dropdown panel (nothing
 *     invented, no fake hierarchy).
 * (c) Else the hardcoded bilingual tree below (demo/preview safety — the
 *     storefront never renders a bare bar).
 *
 * `label`/`label_bn` (bitext: BITEXT_FIELDS + withBiText already promote and
 * seed the sibling, and the songoskriti header preset emits both) names the
 * nav landmark. `limit` caps top-level entries. `columns` (1–4, closed
 * Tailwind set) sizes the dropdown panel grid wherever panels exist.
 */

// বাংলা twins for every hardcoded fallback string, keyed by the English
// copy. A missing key falls back to English (flagged, never blank).
export const MEGA_MENU_FALLBACK_BN: Record<string, string> = {
  Women: "মহিলা",
  Men: "পুরুষ",
  Kids: "শিশু",
  Sarees: "শাড়ি",
  Panjabi: "পাঞ্জাবি",
  Festive: "উৎসব",
  Wedding: "বিয়ে",
  Jewellery: "গহনা",
  Heritage: "ঐতিহ্য",
  "New Arrivals": "নতুন সংগ্রহ",
  "BY TYPE": "ধরন অনুযায়ী",
  "BY WEAVE": "বুনন অনুযায়ী",
  "BY OCCASION": "উপলক্ষ অনুযায়ী",
  "BY GENDER": "ক্রেতা অনুযায়ী",
  "BY CRAFT": "কারুকাজ অনুযায়ী",
  "BY STYLE": "স্টাইল অনুযায়ী",
  STORIES: "গল্প",
  "Salwar Kameez": "সালোয়ার কামিজ",
  Kurta: "কুর্তা",
  Blouses: "ব্লাউজ",
  Dupatta: "দুপাট্টা",
  Jamdani: "জামদানি",
  Tangail: "টাঙ্গাইল",
  "Rajshahi Silk": "রাজশাহী সিল্ক",
  "Nakshi Kantha": "নকশি কাঁথা",
  Khadi: "খাদি",
  Everyday: "প্রতিদিনের",
  Pajama: "পাজামা",
  Shirts: "শার্ট",
  Handloom: "হ্যান্ডলুম",
  Girls: "মেয়েরা",
  Boys: "ছেলেরা",
  Unisex: "ইউনিসেক্স",
  School: "স্কুল",
  "Family Matching": "পরিবারের মিল",
  "Tangail Taant": "টাঙ্গাইল তাঁত",
  Cotton: "সুতি",
  Muslin: "মসলিন",
  Bridal: "বিয়ের",
  Party: "পার্টি",
  Earrings: "কানের দুল",
  Necklace: "হার",
  Jhumka: "ঝুমকা",
  Bangles: "চুড়ি",
  Rings: "আংটি",
  Contemporary: "আধুনিক",
  Eid: "ঈদ",
  Puja: "পূজা",
  Weddings: "বিয়ে",
  Mehendi: "মেহেদি",
  Sangeet: "সংগীত",
  Gifting: "উপহার",
  "For Women": "নারীদের জন্য",
  "For Men": "পুরুষদের জন্য",
  "For Kids": "শিশুদের জন্য",
  "Artisan Stories": "কারিগরের গল্প",
  "Weave Guides": "বুনন নির্দেশিকা",
  "Care Guide": "যত্ন নির্দেশিকা",
  Featured: "বিশেষ",
  Shop: "কেনাকাটা",
  "Main navigation": "প্রধান নেভিগেশন",
};

function megaFallbackLabel(en: string, locale: string): string {
  if (locale !== "bn") return en;
  return MEGA_MENU_FALLBACK_BN[en] ?? en;
}

/** Panel grid columns stay a closed Tailwind set so the classes survive. */
export const MEGA_PANEL_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export type SongoskritiMegaPanelLink = { label: string; href: string };
export type SongoskritiMegaPanelSection = {
  title: string;
  links: SongoskritiMegaPanelLink[];
};
export type SongoskritiMegaEntry = {
  id: string;
  label: string;
  href: string;
  sections: SongoskritiMegaPanelSection[];
  featuredImage?: string;
  shopAllHref: string;
};

const megaSlug = (s: string) => `/c/${s.toLowerCase().replace(/\s+/g, "-")}`;
// Tier-(c) fallback panels keep their image-panel design, but the art is a
// neutral placeholder tile — never brand art. Taxonomy labels stay generic
// fashion terms (owned by the fallback, localized via MEGA_MENU_FALLBACK_BN).
const MEGA_MENU_DEFS: Record<string, { sections: Array<{ title: string; links: string[] }>; featuredImage?: string; shopAllHref: string }> = {
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
    featuredImage: `/api/public/ph/${placeholderSeed("mega-women")}`,
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
    featuredImage: `/api/public/ph/${placeholderSeed("mega-men")}`,
    shopAllHref: "/c/men",
  },
  Kids: {
    sections: [
      { title: "BY GENDER", links: ["Girls", "Boys", "Unisex"] },
      { title: "BY OCCASION", links: ["Festive", "School", "Family Matching"] },
    ],
    featuredImage: `/api/public/ph/${placeholderSeed("mega-kids")}`,
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
    featuredImage: `/api/public/ph/${placeholderSeed("mega-sarees")}`,
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
    featuredImage: `/api/public/ph/${placeholderSeed("mega-jewellery")}`,
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
    featuredImage: `/api/public/ph/${placeholderSeed("mega-festive")}`,
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
    featuredImage: `/api/public/ph/${placeholderSeed("mega-heritage")}`,
    shopAllHref: "/c/heritage",
  },
};

/**
 * Hardcoded fallback tree (tier c). English source of truth; বাংলা resolves
 * through MEGA_MENU_FALLBACK_BN at render so both locales stay covered.
 * Top-level order matches the spec §2 center nav.
 */
export function buildSongoskritiFallbackEntries(
  locale: string,
): SongoskritiMegaEntry[] {
  const L = (en: string) => megaFallbackLabel(en, locale);
  const withDef = (
    id: string,
    en: string,
    href: string,
    defKey: string,
  ): SongoskritiMegaEntry => {
    const def = MEGA_MENU_DEFS[defKey];
    return {
      id,
      label: L(en),
      href,
      sections: (def?.sections ?? []).map((section) => ({
        title: L(section.title),
        links: section.links.map((linkText) => ({
          label: L(linkText),
          href: megaSlug(linkText),
        })),
      })),
      featuredImage: def?.featuredImage,
      shopAllHref: def?.shopAllHref ?? href,
    };
  };
  const plain = (
    id: string,
    en: string,
    href: string,
  ): SongoskritiMegaEntry => ({
    id,
    label: L(en),
    href,
    sections: [],
    shopAllHref: href,
  });
  return [
    withDef("women", "Women", "/c/women", "Women"),
    withDef("men", "Men", "/c/men", "Men"),
    withDef("kids", "Kids", "/c/kids", "Kids"),
    withDef("sarees", "Sarees", "/c/sarees", "Sarees"),
    plain("panjabi", "Panjabi", "/c/panjabi"),
    withDef("festive", "Festive", "/c/festive", "Festive"),
    plain("wedding", "Wedding", "/c/wedding"),
    withDef("jewellery", "Jewellery", "/c/jewellery", "Jewellery"),
    withDef("heritage", "Heritage", "/c/heritage", "Heritage"),
    plain("new-in", "New Arrivals", "/c/new-in"),
  ];
}

const SongoskritiMegaMenu: WidgetComponent = ({
  str,
  int,
  data,
  link,
  template,
  locale,
  slot,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

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

  // Tier (a): host override through the existing WidgetCtx.slot prop.
  // Unset for mega_menu today (no `templates` entry), so this is a no-op
  // until a host provides one — never a fetch, never a new pipe.
  if (slot != null) return <>{slot}</>;

  // The batch flight shows a box-model skeleton, never a bare bar.
  if (data?.pending) {
    return (
      <div
        className="w-full border-b border-[var(--theme-border)]"
        aria-hidden="true"
      >
        <div className="mx-auto flex h-12 max-w-[var(--fq-container,1440px)] items-center justify-center gap-6 px-4">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className="h-3 w-16 animate-pulse bg-foreground/10 motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    );
  }

  // Locale-aware trigger label (label_bn resolves through str); it names the
  // landmark, matching the generic chrome MegaMenu precedent.
  const label = str("label") || megaFallbackLabel("Shop", locale);
  const limit = int("limit", 8, 1, 24);
  const columns = int("columns", 4, 1, 4);

  // Tier (b): live taxonomy rows win when the batch resolved any.
  const rows = data?.rows ?? [];
  const entries: SongoskritiMegaEntry[] =
    rows.length > 0
      ? rows.slice(0, limit).map((row) => ({
          id: row.id,
          label: row.title,
          href: row.href ?? "#",
          sections: [],
          shopAllHref: row.href ?? "#",
        }))
      : buildSongoskritiFallbackEntries(locale).slice(0, limit);

  // On homepage: transparent (white text) at top, solid when scrolled.
  // On all other templates: always solid ivory (dark text).
  const isSolid = !isHomepage || scrolled;
  const textColor = isSolid
    ? "text-[var(--theme-ink)]"
    : "text-[var(--theme-surface)]";
  const activeEntry = activeMenu
    ? (entries.find((entry) => entry.id === activeMenu) ?? null)
    : null;
  const showPanel = activeEntry && activeEntry.sections.length > 0;

  return (
    <div
      className={`relative w-full border-b motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out ${
        isSolid
          ? "bg-[var(--theme-surface)]/95 backdrop-blur-xl border-[var(--theme-border)]"
          : "bg-transparent border-transparent"
      }`}
      onMouseLeave={() => setActiveMenu(null)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setActiveMenu(null);
      }}
    >
      <nav
        aria-label={label}
        className="mx-auto flex h-12 max-w-[var(--fq-container,1440px)] items-center justify-center gap-6 overflow-x-auto px-4"
      >
        {entries.map((item) => {
          const hasMega = item.sections.length > 0;
          return (
            <div
              key={item.id}
              className="relative flex h-full shrink-0 items-center"
              onMouseEnter={() =>
                hasMega ? setActiveMenu(item.id) : setActiveMenu(null)
              }
              onFocus={() =>
                hasMega ? setActiveMenu(item.id) : setActiveMenu(null)
              }
            >
              <a
                href={link(item.href)}
                aria-haspopup={hasMega ? "true" : undefined}
                className={`inline-flex h-full min-h-[44px] items-center gap-1 whitespace-nowrap px-0.5 font-sans text-[11px] font-semibold tracking-[0.14em] uppercase motion-safe:transition-all motion-safe:duration-200 hover:opacity-60 ${
                  activeMenu === item.id ? "opacity-60" : ""
                } ${textColor}`}
              >
                {item.label}
                {hasMega && (
                  <ChevronDown
                    size={9}
                    className={`shrink-0 motion-safe:transition-transform motion-safe:duration-200 ${activeMenu === item.id ? "rotate-180" : ""}`}
                  />
                )}
              </a>
            </div>
          );
        })}
      </nav>

      {/* Mega menu panel */}
      {showPanel && (
        <div
          className="absolute left-0 top-full z-50 w-full bg-[var(--theme-surface)]/98 backdrop-blur-2xl shadow-2xl border-t border-[var(--theme-border)]"
          onMouseEnter={() =>
            activeEntry && setActiveMenu(activeEntry.id)
          }
        >
          <div className="mx-auto max-w-[var(--fq-container,1440px)] px-8 py-10 grid grid-cols-12 gap-8">
            {/* Left: subcategory columns */}
            <div
              className={`${activeEntry.featuredImage ? "col-span-8" : "col-span-12"} grid gap-8 ${MEGA_PANEL_COLS[columns] ?? MEGA_PANEL_COLS[4]!}`}
            >
              {activeEntry.sections.map((section) => (
                <div key={section.title}>
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--theme-ink)]/40 mb-4">
                    {section.title}
                  </p>
                  <ul className="space-y-2.5">
                    {section.links.map((linkItem) => (
                      <li key={linkItem.label}>
                        <a
                          href={link(linkItem.href)}
                          className="flex min-h-[44px] items-center font-serif text-[14px] font-light text-foreground/75 motion-safe:transition-colors hover:text-foreground leading-snug"
                        >
                          {linkItem.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {section.title === activeEntry.sections[0]?.title && (
                    <a
                      href={link(activeEntry.shopAllHref)}
                      className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground border-b border-foreground pb-0.5 motion-safe:transition-opacity hover:opacity-60"
                    >
                      {locale === "bn"
                        ? `${activeEntry.label} সব দেখুন →`
                        : `SHOP ALL ${activeEntry.label} →`}
                    </a>
                  )}
                </div>
              ))}
            </div>
            {/* Right: featured image */}
            {activeEntry.featuredImage && (
              <div className="col-span-4">
                <a href={link(activeEntry.shopAllHref)} className="group block relative aspect-[3/4] overflow-hidden bg-[var(--theme-muted)]">
                  <img
                    src={activeEntry.featuredImage}
                    alt={activeEntry.label}
                    className="absolute inset-0 w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-[1200ms] motion-safe:ease-out group-hover:scale-[1.04]"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--theme-ink)]/60 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--theme-surface)]/70 mb-1">{megaFallbackLabel("Featured", locale)}</p>
                    <p className="font-serif text-[18px] font-light text-[var(--theme-surface)]">{activeEntry.label}</p>
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
      <div className={`mx-auto flex flex-col md:flex-row max-w-[var(--fq-container,1440px)] gap-8 lg:gap-16 px-4 sm:px-8 items-center ${layout === "image_right" ? "md:flex-row-reverse" : ""}`}>
        <div className="w-full md:w-1/2 flex gap-4">
          <div className="w-2/3 aspect-[3/4] overflow-hidden bg-[var(--theme-muted)]">
            {primaryImage && <img src={primaryImage} className="w-full h-full object-cover" loading="lazy" alt="" />}
          </div>
          <div className="w-1/3 flex items-end">
            <div className="w-full aspect-[2/3] overflow-hidden bg-[var(--theme-muted)]">
              {secondaryImage && <img src={secondaryImage} className="w-full h-full object-cover" loading="lazy" alt="" />}
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
            <a key={i} href={link(c.href || "#")} className="group block text-center">
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
  // Social handle is theme-authored (songoskriti homepage owns the brand
  // handle); the generic fallback names no brand and links nowhere.
  const handleLabel =
    str("handleLabel") || t(locale, "Follow us", "অনুসরণ করুন");
  const handleHref = str("handleHref") || "https://instagram.com";
  const rawImages = (str("images") || "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);

  // Imageless fallback is a neutral placeholder tile, never brand art.
  const displayImages =
    rawImages.length >= 6
      ? rawImages
      : [
          ...rawImages,
          ...Array.from(
            { length: 6 - rawImages.length },
            (_, i) =>
              `/api/public/ph/${placeholderSeed(`ugc-${rawImages.length + i}`)}`,
          ),
        ];

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  return (
    <section ref={scope} data-songoskriti-reveal className="py-20 sm:py-32 bg-[var(--theme-surface)] overflow-hidden border-t border-[var(--theme-border)]">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8 mb-12 sm:mb-20 text-center flex flex-col items-center">
        {subhead && (
          <p className="text-[10px] sm:text-[12px] font-semibold uppercase tracking-[0.3em] text-[var(--theme-ink)]/50 mb-4 sm:mb-6">
            {subhead}
          </p>
        )}
        {heading && (
          <h2 className="font-serif text-[32px] sm:text-[48px] lg:text-[56px] leading-[1.1] font-light text-[var(--theme-ink)] mb-6">
            {heading}
          </h2>
        )}
        <a
          href={handleHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[11px] sm:text-[13px] font-medium uppercase tracking-[0.15em] text-[var(--theme-ink)] border-b border-[var(--theme-ink)]/30 pb-1 hover:border-[var(--theme-ink)] transition-colors"
        >
          {handleLabel}
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      </div>

      <div className="mx-auto max-w-[1600px] px-2 sm:px-4">
        {/* Modern interactive flex gallery */}
        <div className="group flex flex-col sm:flex-row gap-2 sm:gap-4 h-auto sm:h-[500px] lg:h-[700px]">
          {displayImages.map((img, i) => (
            <div 
              key={`ugc-${i}`} 
              className="relative overflow-hidden bg-[var(--theme-muted)] transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] flex-1 sm:hover:flex-[2.5] cursor-pointer h-[300px] sm:h-full w-full rounded-sm sm:rounded-md"
            >
              <img 
                src={img} 
                alt="User generated content" 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 scale-100" 
                loading="lazy" 
              />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors duration-500 flex items-center justify-center opacity-0 hover:opacity-100">
                 <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 transform translate-y-4 hover:translate-y-0 transition-all duration-500">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                    </svg>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const SongoskritiStoreLocator: WidgetComponent = ({ str, locale }) => {
  // Heading/eyebrow fall back to generic chrome, never a brand name; the
  // songoskriti homepage authors its own heading. Store images resolve
  // per-store (`sNImage`), then the authored `images` list, then a neutral
  // placeholder tile — never brand art.
  const heading =
    str("heading") || t(locale, "Visit our stores", "আমাদের স্টোরসমূহ");
  const eyebrow = str("eyebrow") || t(locale, "OUR STORES", "আমাদের শাখাসমূহ");
  const listImages = (str("images") || "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  const imageFor = (n: number, name: string) =>
    str(`s${n}Image`) ||
    listImages[n - 1] ||
    `/api/public/ph/${placeholderSeed(`store-${name || n}`)}`;
  const stores = [1, 2, 3]
    .map((n) => ({
      name: str(`s${n}Name`),
      hours: str(`s${n}Hours`),
      image: "",
      n,
    }))
    .filter((s) => s.name)
    .map((s) => ({ ...s, image: imageFor(s.n, s.name) }));

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  if (stores.length === 0) return null;

  return (
    <section ref={scope} data-songoskriti-reveal className="py-16 sm:py-24 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="text-center mb-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--theme-ink)]/40 mb-3">
            {eyebrow}
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
                  src={store.image}
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
