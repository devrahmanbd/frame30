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
import { ProductCard, ProductCardSkeleton } from "./primitives/ProductCard";
import { cardVariantOf } from "./merch";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";
import { placeholderSeed } from "@/lib/placeholder";
import { parseLinkList } from "./chrome";
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

const FinderRow: WidgetComponent = ({ str, Heading, editing, locale, link }) => {
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
        {t(locale, "Occasion finder: add occasions.", "উপলক্ষ সন্ধান: উপলক্ষ যোগ করুন।")}
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
              <Heading className="font-serif text-[28px] sm:text-[36px] lg:text-[44px] font-light tracking-[0.01em] text-foreground leading-tight">
                {str("heading")}
              </Heading>
            )}
            {str("body") && (
              <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-foreground/60 font-light">
                {str("body")}
              </p>
            )}
            {str("buttonLabel") && (
              <a
                href={link(str("buttonHref") || "#")}
                className="mt-8 inline-flex min-h-[46px] items-center border-b-2 border-foreground/30 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-foreground hover:border-foreground transition-all duration-300"
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
                      <span className="text-foreground transition-colors group-hover:text-foreground/60">
                        {o.label}
                      </span>
                      <span aria-hidden="true" className="text-foreground/30 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground">
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
        style={{ backgroundImage: `url(${image || `/api/public/ph/${placeholderSeed("craft")}`})` }}
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
            className="mt-10 inline-flex items-center min-h-[46px] border-b-2 border-[var(--theme-surface)]/40 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-[var(--theme-surface)] hover:border-[var(--theme-surface)] transition-all duration-300"
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
                <span aria-hidden="true" className="mb-6 block font-serif text-5xl leading-none text-foreground/10 select-none">&ldquo;</span>
                <blockquote className="font-serif text-[16px] font-light leading-[1.75] text-foreground/80">
                  {item.quote}
                </blockquote>
                <div className="mt-8 flex items-center justify-center gap-4">
                  <div className="h-px w-8 bg-foreground/15" />
                  <p data-part="author" className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground">
                    {item.author}
                    {item.role && <span className="text-foreground/50 ml-2 font-normal normal-case tracking-normal">· {item.role}</span>}
                  </p>
                  <div className="h-px w-8 bg-foreground/15" />
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
          <span aria-hidden="true" className="mb-8 block font-serif text-[5rem] leading-none text-foreground/10 select-none">&ldquo;</span>
          <blockquote className="font-serif text-[20px] sm:text-[24px] font-light leading-[1.65] text-foreground">
            {item.quote}
          </blockquote>
          <div className="mt-10 flex items-center justify-center gap-5">
            <div className="h-px w-10 bg-foreground/20" />
            <p data-part="author" className="text-[10px] font-medium uppercase tracking-[0.25em] text-foreground">
              {item.author}
              {item.role && <span className="text-foreground/50 ml-2 font-normal normal-case tracking-normal">· {item.role}</span>}
            </p>
            <div className="h-px w-10 bg-foreground/20" />
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
              i === current ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
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
              <div className="mb-8 h-px w-12 bg-foreground/15" />
            )}
            <blockquote className="font-serif text-[18px] sm:text-[22px] lg:text-[26px] font-light leading-[1.65] tracking-[0.01em] text-foreground">
              {item.quote}
            </blockquote>
            <div className="mt-10 flex items-center justify-center gap-5">
              <div className="h-px w-10 bg-foreground/20" />
              <p data-part="author" className="text-[10px] font-medium uppercase tracking-[0.25em] text-foreground">
                {item.author}
                {item.role && <span className="text-foreground/50 ml-2 font-normal normal-case tracking-normal">· {item.role}</span>}
              </p>
              <div className="h-px w-10 bg-foreground/20" />
            </div>
          </div>
        ))}
      </div>

      {/* Nakhrali-style thin progress bar indicators */}
      {testimonials.length > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3" role="tablist">
          {testimonials.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              onClick={() => goTo(i)}
              aria-label={`${t(locale, "Testimonial", "প্রশংসাপত্র")} ${i + 1}`}
              aria-selected={i === current}
              className="group flex items-center justify-center"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <span
                className={`block h-[2px] rounded-full transition-all duration-500 ease-out ${
                  i === current
                    ? "w-10 bg-foreground"
                    : "w-5 bg-foreground/25 group-hover:bg-foreground/50"
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
              className="mb-4 block font-serif text-[11px] tracking-[0.3em] text-foreground/30 tabular-nums"
            >
              0{idx + 1}
            </span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.22em] text-foreground leading-tight">
              {item.title}
            </span>
            {item.body && (
              <span className="mt-2.5 block font-serif text-[13px] font-light leading-relaxed text-foreground/55 max-w-[180px]">
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

  const arrowClassName =
    "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--theme-border)] text-foreground motion-safe:transition-colors hover:bg-[var(--theme-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none";

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
                  <ProductCard
                    row={row}
                    locale={locale}
                    variant={variant}
                    badgeLabel={str("badgeLabel") || undefined}
                    promise={str("promise") || undefined}
                    showRating={bool("showRating")}
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

/* -------------------------------------------------------- luxury footer */

const SongoskritiNewsletter: WidgetComponent = ({ str, section, locale }) => (
  <section className="border-t border-[var(--theme-border)] py-16 sm:py-24 text-center px-4">
    <div className="mx-auto max-w-xl">
      <h3 className="font-serif text-[24px] sm:text-[32px] font-light tracking-[0.02em] text-foreground mb-4">
        {str("heading")}
      </h3>
      <p className="text-[13px] font-light leading-relaxed text-foreground/60 mb-8 max-w-sm mx-auto">
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
          className="h-12 w-full sm:w-auto px-8 bg-foreground text-background text-[11px] font-medium uppercase tracking-[0.2em] hover:bg-foreground/90 transition-colors"
        >
          {str("buttonLabel") || "Subscribe"}
        </button>
      </form>
      <div className="mt-6 text-[10px] text-foreground/40 uppercase tracking-widest">
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
          <h2 className="font-serif text-[28px] sm:text-[40px] font-light leading-tight tracking-[0.01em] text-foreground mb-6">
            {heading}
          </h2>
        )}
        {body && (
          <p className="font-serif text-[15px] sm:text-[18px] font-light leading-relaxed text-foreground/60 max-w-lg mx-auto">
            {body}
          </p>
        )}
      </div>
    </section>
  );
};

const SongoskritiFooterSitemap: WidgetComponent = ({ str, section, link, locale }) => {
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => {
          const r = row as Record<string, unknown>;
          const title = typeof r.title === "string" ? r.title : "";
          const titleBn = typeof r.title_bn === "string" ? r.title_bn : "";
          const links = parseLinkList(typeof r.links === "string" ? r.links : "");
          const linksBn = parseLinkList(typeof r.links_bn === "string" ? r.links_bn : "");
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
  if (columns.length === 0) return null;
  return (
    <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:gap-12 py-16 sm:py-20 border-t border-[var(--theme-border)]">
      {columns.map((col) => (
        <div key={col.title}>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground mb-8">
            {col.title}
          </p>
          <ul className="space-y-4">
            {col.links.map((linkItem) => (
              <li key={`${col.title}-${linkItem.label}`}>
                <a
                  href={link(linkItem.href)}
                  className="font-serif text-[15px] font-light text-foreground/70 hover:text-foreground transition-colors"
                >
                  {linkItem.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
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

const SongoskritiDepartmentGrid: WidgetComponent = ({ str, section, link, locale }) => {
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

  const heading = str("heading") || (locale === "bn" ? "আমাদের সংগ্রহ" : "SHOP THE COLLECTION");

  // 6-tile layout: first 2 tiles are taller (portrait hero), rest are landscape grid
  const heroes = departments.slice(0, 2);
  const grid = departments.slice(2);

  return (
    <section ref={scope} data-songoskriti-reveal className="py-16 sm:py-20 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="flex items-center justify-between mb-10">
          <h2 className="font-serif text-[22px] sm:text-[28px] font-light tracking-[0.04em] text-foreground uppercase">
            {heading}
          </h2>
          <a href={link("/c")} className="hidden sm:flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/50 hover:text-foreground transition-colors">
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
                  <div className="absolute inset-0 flex items-center justify-center text-2xl text-foreground/10 select-none font-serif">
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
const MEGA_MENU_DEFS: Record<string, { sections: Array<{ title: string; links: string[] }>; featuredImage?: string; shopAllHref: string }> = {
  Women: {
    sections: [
      { title: "BY TYPE", links: ["Sarees", "Salwar Kameez", "Kurta", "Blouses", "Dupatta"] },
      { title: "BY WEAVE", links: ["Jamdani", "Tangail", "Rajshahi Silk", "Nakshi Kantha", "Khadi"] },
      { title: "BY OCCASION", links: ["Festive", "Wedding", "Everyday", "New Arrivals"] },
    ],
    featuredImage: "/ph/songoskriti/cat-women.png",
    shopAllHref: "/c/women",
  },
  Men: {
    sections: [
      { title: "BY TYPE", links: ["Panjabi", "Pajama", "Kurta", "Shirts"] },
      { title: "BY OCCASION", links: ["Festive", "Wedding", "Everyday", "Handloom"] },
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
      { title: "BY WEAVE", links: ["Jamdani", "Tangail Taant", "Rajshahi Silk", "Cotton", "Muslin"] },
      { title: "BY OCCASION", links: ["Bridal", "Festive", "Everyday", "Party"] },
    ],
    featuredImage: "/ph/songoskriti/prod-saree.png",
    shopAllHref: "/c/sarees",
  },
  Jewellery: {
    sections: [
      { title: "BY TYPE", links: ["Earrings", "Necklace", "Jhumka", "Bangles", "Rings"] },
      { title: "BY STYLE", links: ["Heritage", "Contemporary", "Bridal", "Everyday"] },
    ],
    featuredImage: "/ph/songoskriti/cat-jewelry.png",
    shopAllHref: "/c/jewellery",
  },
  Festive: {
    sections: [
      { title: "BY OCCASION", links: ["Eid", "Puja", "Weddings", "Mehendi", "Sangeet", "Gifting"] },
      { title: "BY GENDER", links: ["For Women", "For Men", "For Kids", "Family Matching"] },
    ],
    featuredImage: "/ph/songoskriti/hero-festive.png",
    shopAllHref: "/c/festive",
  },
  Heritage: {
    sections: [
      { title: "BY CRAFT", links: ["Jamdani", "Nakshi Kantha", "Rajshahi Silk", "Tangail", "Khadi", "Muslin"] },
      { title: "STORIES", links: ["Artisan Stories", "Weave Guides", "Care Guide"] },
    ],
    featuredImage: "/ph/songoskriti/hero-weaves.png",
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
  locale,
  slot,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const textColor = scrolled ? "text-foreground" : "text-[var(--theme-surface)]";
  const activeEntry = activeMenu
    ? (entries.find((entry) => entry.id === activeMenu) ?? null)
    : null;
  const showPanel = activeEntry && activeEntry.sections.length > 0;

  return (
    <div
      className={`relative w-full border-b motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out ${
        scrolled
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
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-foreground/40 mb-4">{section.title}</p>
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
          {heading && <h2 className="font-serif text-[32px] sm:text-[44px] lg:text-[56px] font-light leading-tight tracking-[0.01em] text-foreground mb-6">{heading}</h2>}
          {body && <p className="font-serif text-[15px] sm:text-[18px] font-light leading-relaxed text-foreground/60 mb-10 max-w-md">{body}</p>}
          <div className="flex gap-6 flex-wrap justify-center md:justify-start">
            {str("ctaLabel") && (
              <a href={link(str("ctaUrl") || "#")} className="inline-flex items-center min-h-[46px] border-b-2 border-foreground/40 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-foreground hover:border-foreground transition-all duration-300">
                {str("ctaLabel")}
              </a>
            )}
            {str("ctaLabel2") && (
              <a href={link(str("ctaUrl2") || "#")} className="inline-flex items-center min-h-[46px] border-b-2 border-foreground/40 pb-1 text-[11px] font-medium tracking-[0.25em] uppercase text-foreground hover:border-foreground transition-all duration-300">
                {str("ctaLabel2")}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const SongoskritiCollectionStory: WidgetComponent = ({ str, section, locale, link }) => {
  const heading = str("heading");
  const subhead = str("subhead");
  const collections = rowsOf(section, "collections")
    .map(row => ({
      title: readString(row, "title"),
      image: readString(row, "image"),
      href: readString(row, "href"),
      subtitle: readString(row, "subtitle")
    }))
    .filter(c => c.title);

  return (
    <section className="bg-[var(--theme-muted)] py-20 sm:py-32">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="text-center mb-16">
          {heading && <h2 className="font-serif text-[32px] sm:text-[48px] font-light text-foreground mb-4">{heading}</h2>}
          {subhead && <p className="font-serif text-[15px] text-foreground/60 max-w-xl mx-auto">{subhead}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {collections.map((c, i) => (
            <a key={i} href={link(c.href || "#")} className="group block text-center">
              <div className="w-full aspect-[4/5] overflow-hidden bg-[var(--theme-surface)] mb-6">
                {c.image && (
                  <img src={c.image} alt={c.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" loading="lazy" />
                )}
              </div>
              {c.subtitle && <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/40 mb-2">{c.subtitle}</p>}
              <h3 className="font-serif text-[18px] font-light tracking-wide text-foreground group-hover:text-foreground/70 transition-colors">{c.title}</h3>
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
  const images = (str("images") || "").split(",").map(i => i.trim()).filter(Boolean);
  const displayImages = images.length > 0 ? images : Array.from({ length: 4 }).map((_, i) => `/api/public/ph/ugc-${i + 1}.svg`);

  const scope = useRef<HTMLElement | null>(null);
  useSongoskritiReveals(scope, true);

  return (
    <section ref={scope} data-songoskriti-reveal className="py-16 sm:py-24 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-10 gap-4">
          <div>
            {subhead && <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground/40 mb-2">{subhead}</p>}
            {heading && <h2 className="font-serif text-[28px] sm:text-[36px] font-light text-foreground">{heading}</h2>}
          </div>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/50 hover:text-foreground transition-colors shrink-0"
          >
            @SONGOSKRITI →
          </a>
        </div>
        {/* Masonry-style grid: first image tall, rest normal */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {displayImages.slice(0, 1).map((img, i) => (
            <div key={`ugc-main-${i}`} className="col-span-2 row-span-2 sm:row-span-1 aspect-square sm:aspect-[4/5] overflow-hidden bg-[var(--theme-muted)] group sm:col-span-2">
              <img src={img} alt="" className="w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.03]" loading="lazy" />
            </div>
          ))}
          {displayImages.slice(1, 4).map((img, i) => (
            <div key={`ugc-${i}`} className="aspect-[4/5] overflow-hidden bg-[var(--theme-muted)] group">
              <img src={img} alt="" className="w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.03]" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const SongoskritiStoreLocator: WidgetComponent = ({ str, locale }) => {
  const heading = str("heading") || (locale === "bn" ? "আমাদের স্টোরসমূহ" : "VISIT SONGOSKRITI");
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
    <section ref={scope} data-songoskriti-reveal className="py-16 sm:py-24 bg-[var(--theme-surface)] border-t border-[var(--theme-border)]">
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="text-center mb-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground/40 mb-3">OUR STORES</p>
          <h2 className="font-serif text-[28px] sm:text-[40px] font-light text-foreground">{heading}</h2>
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
              <div className="h-px w-8 bg-foreground/15 mb-5" />
              <h3 className="font-sans text-[12px] font-semibold uppercase tracking-[0.22em] text-foreground mb-2">
                {store.name}
              </h3>
              {store.hours && (
                <p className="font-serif text-[14px] font-light text-foreground/60 mb-5">
                  {store.hours}
                </p>
              )}
              <a
                href="#"
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/50 hover:text-foreground transition-colors"
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

/* ------------------------------------------------------ exports */

export const SONGOSKRITI_WIDGETS: Record<
  Extract<
    SectionType,
    | "finder_row"
    | "craft_story"
    | "testimonials"
    | "trust_footer"
    | "product_rail"
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
  >,
  WidgetComponent
> = {
  finder_row: FinderRow,
  craft_story: CraftStory,
  testimonials: Testimonials,
  trust_footer: TrustFooter,
  product_rail: SongoskritiProductRail,
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
};
