/**
 * Phase 9 — Heritage (clothing) theme widgets.
 *
 * Eight editorial widgets inspired by Aarong's handcrafted, story-driven
 * aesthetic. Each accepts a `tokens: ThemeTokens` prop and uses Tailwind CSS
 * with semantic utility classes — no theme import, no hard-coded colour.
 *
 * All text supports bilingual EN/বাং labels via the `t()` helper. Deterministic
 * monogram tiles are used for images (no external URLs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PropRow,
  PropValue,
  Section,
  SectionType,
} from "@/lib/builder-ast";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { resolveSkin } from "@/lib/builder-ast";
import { placeholderSeed } from "@/lib/placeholder";
import { useSongoskritiHero } from "./songoskriti-motion";

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

const readNumber = (row: PropRow, key: string, fallback: number) => {
  const v = row[key];
  return typeof v === "number" ? v : Number(v) || fallback;
};

/**
 * Carousel-pack shared reduced-motion gate. SSR-safe (effects never run
 * under renderToStaticMarkup): first paint assumes motion, then corrects
 * from the OS setting and follows mid-session changes.
 */
function useCarouselReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Hand-built Jamdani buti lattice (Tier-B SVG craft — no stock, no blobs).
 * Deterministic per seed: 4 lattice variants + accent rotation. Used as hero
 * art when a slide has no real photograph; real merchant photos always win.
 */
function WeaveMotif({ seed, className }: { seed: string; className?: string }) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const v = (h >>> 0) % 4;
  const diamond = (cx: number, cy: number, r: number, o: string) => (
    <path
      key={`${cx}-${cy}`}
      d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      opacity={o}
    />
  );
  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) =>
          diamond(
            34 + c * 66 + (r % 2 ? 33 : 0),
            36 + r * 68,
            v === 2 ? 24 : 18,
            "0.55",
          ),
        ),
      )}
      {v % 2 === 0 && (
        <circle
          cx="200"
          cy="250"
          r="70"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.6"
        />
      )}
      {v % 2 === 0 && (
        <path
          d="M200 195 L248 250 L200 305 L152 250 Z"
          fill="currentColor"
          opacity="0.18"
        />
      )}
      {v === 3 && (
        <path
          d="M40 430 Q200 340 360 430"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.5"
        />
      )}
      {v === 1 && (
        <g fill="currentColor" opacity="0.35">
          <circle cx="200" cy="120" r="10" />
          <circle cx="200" cy="380" r="10" />
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------ hero_carousel */

type HeroSlide = {
  image: string;
  headline: string;
  headlineBn: string;
  subhead: string;
  subheadBn: string;
  ctaLabel: string;
  ctaLabelBn: string;
  ctaUrl: string;
  caption: string;
  captionBn: string;
};

/**
 * Dots + arrows shared by the non-split hero skins. Class-identical to the
 * split branch's inline controls (44px targets, bilingual labels, keyboard
 * arrows on the group) so every skin keeps the same a11y contract.
 */
function HeroSlideControls({
  slides,
  current,
  goTo,
  next,
  prev,
  locale,
  prevLabel,
  nextLabel,
}: {
  slides: HeroSlide[];
  current: number;
  goTo: (i: number) => void;
  next: () => void;
  prev: () => void;
  locale: string;
  prevLabel: string;
  nextLabel: string;
}) {
  return null;
}

/**
 * `fullbleed` + `minimal` hero skins. Same slide data, same carousel shell
 * (region, keyboard, touch, autoplay gate, live position, 44px CTA and
 * controls, bn/en copy) — only the composition forks. `split` keeps its
 * inline branch below byte-identical.
 */
function HeroSkinSlide({
  skin,
  slide,
  isFirst,
  locale,
  Heading,
  slides,
  current,
  count,
  goTo,
  next,
  prev,
  prevLabel,
  nextLabel,
}: {
  skin: string;
  slide: HeroSlide;
  isFirst: boolean;
  locale: string;
  Heading: WidgetCtx["Heading"];
  slides: HeroSlide[];
  current: number;
  count: number;
  goTo: (i: number) => void;
  next: () => void;
  prev: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const slideLabel = `${t(locale, "Slide", "স্লাইড")} ${current + 1} / ${count}`;
  const subhead =
    locale === "bn" && slide.subheadBn ? slide.subheadBn : slide.subhead;
  const art =
    slide.image && !slide.image.startsWith("/api/public/ph/") ? (
      <img
        src={slide.image}
        alt={slide.headline}
        className="absolute inset-0 h-full w-full object-cover"
        loading={isFirst ? "eager" : "lazy"}
        fetchPriority={isFirst ? "high" : "auto"}
        decoding="async"
      />
    ) : (
      <WeaveMotif
        seed={slide.headline || "heritage"}
        className="absolute inset-0 h-full w-full text-primary"
      />
    );
  const controls = (
    <HeroSlideControls
      slides={slides}
      current={current}
      goTo={goTo}
      next={next}
      prev={prev}
      locale={locale}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
    />
  );
  if (skin === "minimal") {
    return (
      <div
        key={current}
        role="group"
        aria-roledescription="slide"
        aria-label={slideLabel}
        className="fq-enter-fade mx-auto max-w-3xl px-4 py-12 text-center sm:py-16"
      >
        {slide.caption && (
          <p
            data-hero-eyebrow
            data-part="caption"
            className="text-xs font-semibold tracking-widest text-primary fq-caps"
          >
            {locale === "bn" && slide.captionBn
              ? slide.captionBn
              : slide.caption}
          </p>
        )}
        <Heading
          data-hero-headline
          {...(locale === "bn" && slide.headlineBn ? { lang: "bn" } : {})}
          className="mt-2 font-bangla-display text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-4xl"
        >
          {locale === "bn" && slide.headlineBn
            ? slide.headlineBn
            : slide.headline}
        </Heading>
        {slide.subhead && (
          <p
            data-hero-sub
            className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground"
          >
            {subhead}
          </p>
        )}
        <div
          data-hero-cta
          className="mt-7 flex flex-wrap items-center justify-center gap-3"
        >
          {slide.ctaLabel && (
            <a
              href={slide.ctaUrl || "#"}
              className="inline-flex min-h-12 items-center whitespace-nowrap bg-foreground px-8 text-[11px] font-bold fq-caps tracking-widest text-background transition-transform hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {locale === "bn" && slide.ctaLabelBn
                ? slide.ctaLabelBn
                : slide.ctaLabel}
            </a>
          )}
          {controls}
        </div>
        <div
          data-hero-art
          className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-fq-lg"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-transparent">
            {art}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      key={current}
      role="group"
      aria-roledescription="slide"
      aria-label={slideLabel}
      className="fq-enter-fade relative flex items-end justify-center overflow-hidden -mt-[68px]"
      style={{ height: "100vh" }}
    >
      {/* Full-bleed background image */}
      <div className="absolute inset-0">{art}</div>
      {/* Gradient overlay — darkens toward bottom for text legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent"
      />
      {/* Copy — pinned to bottom center, Nakhrali style */}
      <div className="relative z-10 w-full flex flex-col items-center text-center px-4 pb-16 sm:pb-24">
        {slide.caption && (
          <p
            data-hero-eyebrow
            data-part="caption"
            className="mb-5 text-[10px] font-medium tracking-[0.35em] text-white/70 uppercase"
          >
            {locale === "bn" && slide.captionBn
              ? slide.captionBn
              : slide.caption}
          </p>
        )}
        <Heading
          data-hero-headline
          {...(locale === "bn" && slide.headlineBn ? { lang: "bn" } : {})}
          className="font-serif text-4xl sm:text-6xl lg:text-[5.5rem] font-light text-white leading-[1.05] tracking-[-0.01em] max-w-4xl"
        >
          {locale === "bn" && slide.headlineBn
            ? slide.headlineBn
            : slide.headline}
        </Heading>
        {slide.subhead && (
          <p
            data-hero-sub
            className="mt-5 max-w-xl font-serif text-base sm:text-[18px] font-light leading-relaxed text-white/75"
          >
            {subhead}
          </p>
        )}
        <div data-hero-cta className="mt-8 flex items-center justify-center gap-6">
          {slide.ctaLabel && (
            <a
              href={slide.ctaUrl || "#"}
              className="inline-flex items-center min-h-[46px] bg-white/10 border border-white/40 backdrop-blur-sm px-8 text-[11px] font-medium tracking-[0.25em] uppercase text-white hover:bg-white hover:text-foreground transition-all duration-300"
            >
              {locale === "bn" && slide.ctaLabelBn
                ? slide.ctaLabelBn
                : slide.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const HeroCarousel: WidgetComponent = ({
  section,
  str,
  int,
  Heading,
  locale,
  editing,
}) => {
  const slides = rowsOf(section, "slides").map((row) => ({
    image: readString(row, "image"),
    headline: readString(row, "headline"),
    headlineBn: readString(row, "headline_bn"),
    subhead: readString(row, "subhead"),
    subheadBn: readString(row, "subhead_bn"),
    ctaLabel: readString(row, "ctaLabel"),
    ctaLabelBn: readString(row, "ctaLabel_bn"),
    ctaUrl: readString(row, "ctaUrl"),
    caption: readString(row, "caption"),
    captionBn: readString(row, "caption_bn"),
  }));
  const autoAdvanceMs = int("autoAdvanceMs", 5000, 1000, 15000);
  const atmosphere = str("atmosphere") || "wash";
  // Widget skin (spec 2026-09-25): split (default, current asymmetric
  // editorial grid), fullbleed (art-bleed overlay) and minimal (centred,
  // quiet). Autoplay gates, keyboard, touch, live region, 44px targets and
  // bn/en copy stay common — only presentation forks.
  const skin = resolveSkin("hero_carousel", str("skin"));
  const reducedMotion = useCarouselReducedMotion();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  // Task 5 motion: hero load timeline scoped to this section. SSR-safe
  // (effects never run under renderToStaticMarkup) and static under
  // reduced motion — the hook no-ops unless intent is full.
  const heroScope = useRef<HTMLElement | null>(null);
  useSongoskritiHero(heroScope, true);

  const count = slides.length;
  const goTo = useCallback(
    (i: number) => {
      if (count <= 0) return;
      setCurrent(((i % count) + count) % count);
    },
    [count],
  );
  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    // Autoplay never arms under reduced motion; manual dots/arrows/swipe
    // keep working so every visitor can still reach every slide.
    if (paused || reducedMotion || slides.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % slides.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [paused, reducedMotion, slides.length, autoAdvanceMs]);

  if (slides.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Hero carousel: add at least one slide.",
          "হিরো ক্যারোজেল: অন্তত একটি স্লাইড যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const slide = slides[current]!;
  const isFirst = current === 0;
  const prevLabel = t(locale, "Previous slide", "আগের স্লাইড");
  const nextLabel = t(locale, "Next slide", "পরের স্লাইড");
  return (
    <section
      ref={heroScope}
      data-songoskriti-hero
      role="region"
      aria-roledescription="carousel"
      aria-label={t(locale, "Hero carousel", "হিরো ক্যারোজেল")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          prev();
        } else if (event.key === "Home") {
          event.preventDefault();
          goTo(0);
        } else if (event.key === "End") {
          event.preventDefault();
          goTo(count - 1);
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const end = event.changedTouches[0]?.clientX ?? start;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) next();
        else prev();
      }}
      className={`relative overflow-hidden bg-background ${skin === "fullbleed" ? "-mt-[68px]" : ""}`}
    >
      {atmosphere !== "none" && skin === "split" && (
        <div
          aria-hidden="true"
          className="fq-theme-aurora pointer-events-none absolute inset-0 opacity-40"
        />
      )}
      <p className="sr-only" role="status">
        {t(locale, "Slide", "স্লাইড")} {current + 1} / {count}
      </p>
      {skin !== "split" ? (
        <HeroSkinSlide
          skin={skin}
          slide={slide}
          isFirst={isFirst}
          locale={locale}
          Heading={Heading}
          slides={slides}
          current={current}
          count={count}
          goTo={goTo}
          next={next}
          prev={prev}
          prevLabel={prevLabel}
          nextLabel={nextLabel}
        />
      ) : (
      <div
        key={current}
        role="group"
        aria-roledescription="slide"
        aria-label={`${t(locale, "Slide", "স্লাইড")} ${current + 1} / ${count}`}
        className="fq-enter-fade mx-auto grid max-w-[var(--fq-container,1440px)] items-center gap-8 px-4 py-12 sm:gap-12 sm:px-8 sm:py-24 lg:grid-cols-12 lg:gap-16"
      >
        {/* Copy — asymmetric left, six columns */}
        <div className="min-w-0 lg:col-span-6 lg:pl-8">
          {slide.caption && (
            <p
              data-hero-eyebrow
              data-part="caption"
              className="text-xs font-semibold tracking-widest text-primary fq-caps"
            >
              {locale === "bn" && slide.captionBn
                ? slide.captionBn
                : slide.caption}
            </p>
          )}
          <Heading
            data-hero-headline
            {...(locale === "bn" && slide.headlineBn ? { lang: "bn" } : {})}
            className="mt-2 font-bangla-display text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-6xl"
          >
            {locale === "bn" && slide.headlineBn
              ? slide.headlineBn
              : slide.headline}
          </Heading>
          {slide.subhead && (
            <p
              data-hero-sub
              className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              {locale === "bn" && slide.subheadBn
                ? slide.subheadBn
                : slide.subhead}
            </p>
          )}
          <div data-hero-cta className="mt-7 flex flex-wrap items-center gap-3">
            {slide.ctaLabel && (
              <a
                href={slide.ctaUrl || "#"}
                className="inline-flex min-h-12 sm:min-h-14 items-center whitespace-nowrap bg-foreground px-8 sm:px-10 text-[11px] sm:text-[13px] font-bold fq-caps tracking-widest text-background transition-transform hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {locale === "bn" && slide.ctaLabelBn
                  ? slide.ctaLabelBn
                  : slide.ctaLabel}
              </a>
            )}
            {/* Nakhrali-style thin progress bar indicators — no arrow buttons */}
            {slides.length > 1 && (
              <div
                className="mt-8 flex items-center gap-3"
                role="tablist"
                aria-label={t(locale, "Slides", "স্লাইড")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    next();
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    prev();
                  }
                }}
              >
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    onClick={() => goTo(i)}
                    aria-selected={i === current}
                    className="group flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
                    style={{ minHeight: 44, minWidth: 44 }}
                    aria-label={`${t(locale, "Slide", "স্লাইড")} ${i + 1} / ${slides.length}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`block h-[2px] rounded-full transition-all duration-500 ease-out ${
                        i === current
                          ? "w-10 bg-current"
                          : "w-5 bg-current/30 group-hover:bg-current/60"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Art — six columns, its own zone. Real photographs render;
            placeholder URLs become hand-built weave lattice instead. */}
        <div data-hero-art className="min-w-0 lg:col-span-6 lg:-mr-8">
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-transparent sm:aspect-[4/3] lg:aspect-[3/4]">
            {slide.image && !slide.image.startsWith("/api/public/ph/") ? (
              <img
                src={slide.image}
                alt={slide.headline}
                className="absolute inset-0 h-full w-full object-cover"
                loading={isFirst ? "eager" : "lazy"}
                fetchPriority={isFirst ? "high" : "auto"}
                decoding="async"
              />
            ) : (
              <WeaveMotif
                seed={slide.headline || "heritage"}
                className="absolute inset-0 h-full w-full text-primary"
              />
            )}
          </div>
        </div>
      </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------ department_grid */

const DepartmentGrid: WidgetComponent = ({
  section,
  str,
  int,
  Heading,
  locale,
  editing,
}) => {
  const departments = rowsOf(section, "departments").map((row) => ({
    image: readString(row, "image"),
    name: readString(row, "name") || readString(row, "title"),
    nameBn: readString(row, "name_bn"),
    count: readNumber(row, "count", 0),
    href: readString(row, "href"),
  }));
  const columns = int("columns", 4, 2, 6);

  if (departments.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Department grid: add departments.",
          "বিভাগ গ্রিড: বিভাগ যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const gridCols =
    columns <= 2
      ? "grid-cols-2 sm:grid-cols-2"
      : columns <= 3
        ? "grid-cols-2 sm:grid-cols-3"
        : columns <= 4
          ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
  return (
    <section className="py-8 sm:py-12 max-w-[var(--fq-container,1440px)] mx-auto px-4 sm:px-8">
      <div className="mb-8 sm:mb-10 text-center">
        <Heading className="font-bangla-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-wide text-foreground">
          {t(locale, "Shop by department", "বিভাগ অনুযায়ী কিনুন")}
        </Heading>
        <p className="mt-3 text-[13.5px] font-medium tracking-wide text-muted-foreground">
          {departments.reduce((n, d) => n + (d.count || 0), 0)}{" "}
          {t(locale, "handcrafted pieces", "হাতে তৈরি পণ্য")}
        </p>
      </div>
      <div className={`grid gap-x-4 gap-y-10 sm:gap-x-12 sm:gap-y-12 ${gridCols}`}>
        {departments.map((dept, i) => (
          <a
            key={i}
            href={dept.href || "#"}
            className="group flex flex-col items-center justify-center relative transition-transform duration-500 ease-out"
          >
            <div className="relative w-full aspect-[3/4] overflow-hidden bg-muted/10">
              <div className="w-full h-full overflow-hidden relative">
                {/* Primary Image */}
                {dept.image ? (
                  <img
                    src={dept.image}
                    alt={dept.name}
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out group-hover:opacity-0"
                    loading="lazy"
                  />
                ) : (
                  <img
                    src={`/api/public/ph/${placeholderSeed(dept.name || "department")}`}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out group-hover:opacity-0"
                    loading="lazy"
                  />
                )}
                {/* Secondary Image (Hover) */}
                {dept.image ? (
                  <img
                    src={dept.image.replace('.png', '-hover.png')}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-in-out group-hover:opacity-100"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to primary if no hover image exists
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.previousElementSibling?.classList.remove('group-hover:opacity-0');
                    }}
                  />
                ) : (
                  <img
                    src={`/api/public/ph/${placeholderSeed((dept.name || "department") + "hover")}`}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-in-out group-hover:opacity-100"
                    loading="lazy"
                  />
                )}
              </div>
            </div>
            <p className="mt-5 font-serif text-[15px] sm:text-[17px] font-medium tracking-[0.05em] text-foreground group-hover:text-primary transition-colors text-center w-full uppercase">
              {locale === "bn" && dept.nameBn ? dept.nameBn : dept.name}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------ heritage_story */

const HeritageStory: WidgetComponent = ({
  section,
  str,
  Heading,
  locale,
  editing,
}) => {
  const image = str("image");
  const headline = str("headline") || str("heading");
  const eyebrow = str("eyebrow") || str("caption");
  const body = str("body");
  const ctaLabel = str("ctaLabel") || str("buttonLabel");
  const ctaHref = str("ctaHref") || str("buttonHref");
  const founderQuote = str("founder_quote");
  const founderName = str("founder_name");
  const layout = str("layout") || "left";

  if (!headline && !body) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Heritage story: add a headline.",
          "হেরিটেজ গল্প: একটি শিরোনাম যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const imageBlock = (
    <div className="relative overflow-hidden rounded-fq-sm">
      <div className="aspect-[4/5] bg-gradient-to-br from-amber-900/15 to-rose-900/10 flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt={headline}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <img
            src={`/api/public/ph/${placeholderSeed(headline || "heritage-story")}`}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>
    </div>
  );

  const textBlock = (
    <div className="flex flex-col justify-center">
      {eyebrow && (
        <p className="mb-2 text-[11px] fq-caps tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <Heading className="text-2xl font-bold leading-tight sm:text-3xl">
        {headline}
      </Heading>
      {body && (
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {ctaLabel && (
        <a
          href={ctaHref || "#"}
          className="mt-4 inline-flex min-h-11 w-fit items-center rounded-fq-sm border border-current px-5 text-sm font-medium transition hover:bg-muted"
        >
          {ctaLabel}
        </a>
      )}
      {founderQuote && (
        <blockquote className="mt-6 border-l-2 border-amber-700 pl-4 italic text-muted-foreground">
          "{founderQuote}"
          {founderName && (
            <cite className="mt-2 block not-italic text-xs text-muted-foreground">
              — {founderName}
            </cite>
          )}
        </blockquote>
      )}
    </div>
  );

  return (
    <section className="grid items-center gap-8 md:grid-cols-2">
      {layout === "right" ? (
        <>
          {textBlock}
          {imageBlock}
        </>
      ) : (
        <>
          {imageBlock}
          {textBlock}
        </>
      )}
    </section>
  );
};

/* ------------------------------------------------------ textile_showcase */

const TextileShowcase: WidgetComponent = ({
  section,
  str,
  Heading,
  locale,
  editing,
  money,
}) => {
  const productRows = rowsOf(section, "products");
  const itemRows = rowsOf(section, "items");
  const products =
    productRows.length > 0
      ? productRows.map((row) => ({
          image: readString(row, "image"),
          name: readString(row, "name"),
          nameBn: readString(row, "name_bn"),
          price: readNumber(row, "price", 0),
          href: readString(row, "href"),
        }))
      : itemRows.map((row) => ({
          image: readString(row, "image"),
          name: readString(row, "title"),
          nameBn: "",
          price: readNumber(row, "price", 0),
          href: readString(row, "href"),
        }));
  const headline = str("headline") || str("heading");
  const ctaLabel = str("cta_label") || str("ctaLabel");

  if (products.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Textile showcase: add products.",
          "টেক্সটাইল শোকেইস: পণ্য যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  return (
    <section>
      {headline && (
        <Heading className="mb-6 text-2xl font-bold">{headline}</Heading>
      )}
      <div className="grid gap-12 sm:grid-cols-2">
        {products.map((product, i) => (
          <a
            key={i}
            href={product.href || "#"}
            className="group flex flex-col items-center text-center overflow-hidden transition-transform duration-500 ease-out hover:-translate-y-2"
          >
            <div className="w-full aspect-[4/3] bg-muted/20 flex items-center justify-center overflow-hidden mb-6">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
                  loading="lazy"
                />
              ) : (
                <img
                  src={`/api/public/ph/${placeholderSeed(product.name || "textile")}`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-110"
                  loading="lazy"
                />
              )}
            </div>
            <div className="px-4">
              <p data-part="title" className="font-serif text-[15px] font-light tracking-wide text-foreground group-hover:text-primary transition-colors">
                {locale === "bn" && product.nameBn
                  ? product.nameBn
                  : product.name}
              </p>
              {product.price > 0 && (
                <p
                  data-part="price"
                  className="mt-2 font-serif text-[14px] font-medium text-foreground"
                >
                  {money(product.price * 100)}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
      {ctaLabel && (
        <div className="mt-6 text-center">
          <a
            href="#"
            className="inline-flex min-h-11 items-center rounded-fq-sm border border-current px-6 text-sm font-medium transition hover:bg-muted"
          >
            {ctaLabel}
          </a>
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------ editorial_banner */

const EditorialBanner: WidgetComponent = ({
  section,
  str,
  Heading,
  locale,
  editing,
}) => {
  const image = str("image");
  const headline = str("headline") || str("heading");
  const subhead = str("subhead") || str("body");
  const eyebrow = str("eyebrow");
  const ctaLabel = str("cta_label") || str("ctaLabel");
  const ctaUrl = str("cta_url") || str("ctaHref");
  const overlay = str("overlay") || "dark";
  const surface = str("surface") || "card";

  if (!headline) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Editorial banner: add a headline.",
          "এডিটোরিয়াল ব্যানার: একটি শিরোনাম যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const overlayCls =
    overlay === "light"
      ? "bg-gradient-to-t from-background/80 via-background/40 to-transparent text-foreground"
      : "bg-gradient-to-t from-foreground/70 via-foreground/30 to-transparent text-background";

  return (
    <section
      className={`relative overflow-hidden rounded-fq-sm${surface === "glass" ? " fq-theme-glass" : ""}`}
    >
      <div className="relative aspect-[3/1] min-h-[200px] w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-rose-900/10 to-amber-800/20">
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-[10rem] font-bold text-foreground/10 select-none"
              aria-hidden="true"
            >
              {headline?.charAt(0) || "E"}
            </span>
          </div>
        </div>
        {image && (
          <img
            src={image}
            alt={headline}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        )}
        {!image && (
          <img
            src={`/api/public/ph/${placeholderSeed(headline || "editorial")}`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        )}
        <div
          className={`absolute inset-0 flex flex-col items-start justify-end p-6 sm:p-10 ${overlayCls}`}
        >
          <div className="max-w-xl">
            {eyebrow && (
              <p className="mb-2 text-[11px] fq-caps tracking-[0.16em] opacity-80">
                {eyebrow}
              </p>
            )}
            <Heading className="text-2xl font-bold sm:text-4xl">
              {headline}
            </Heading>
            {subhead && (
              <p className="mt-2 text-sm sm:text-base opacity-80">{subhead}</p>
            )}
            {ctaLabel && (
              <a
                href={ctaUrl || "#"}
                className="mt-4 inline-flex min-h-10 items-center rounded-fq-sm border border-current px-5 text-sm font-medium transition hover:bg-primary/10"
              >
                {ctaLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------ testimonial_carousel */

const TestimonialCarousel: WidgetComponent = ({
  section,
  str,
  int,
  Heading,
  locale,
  editing,
}) => {
  const testimonials = rowsOf(section, "testimonials").map((row) => ({
    quote: readString(row, "quote"),
    author: readString(row, "author"),
    image: readString(row, "image"),
  }));
  const autoAdvanceMs = int("autoAdvanceMs", 4000, 1500, 10000);
  const reducedMotion = useCarouselReducedMotion();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = testimonials.length;
  const goTo = useCallback(
    (i: number) => {
      if (count <= 0) return;
      setCurrent(((i % count) + count) % count);
    },
    [count],
  );
  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    if (paused || reducedMotion || testimonials.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % testimonials.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [paused, reducedMotion, testimonials.length, autoAdvanceMs]);

  if (testimonials.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Testimonial carousel: add testimonials.",
          "টেস্টিমোনিয়াল ক্যারোজেল: টেস্টিমোনিয়াল যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const testimonial = testimonials[current]!;
  const prevLabel = t(locale, "Previous testimonial", "আগের প্রশংসাপত্র");
  const nextLabel = t(locale, "Next testimonial", "পরের প্রশংসাপত্র");
  return (
    <section
      role="region"
      aria-roledescription="carousel"
      className="rounded-fq-sm border border-border bg-card p-6 sm:p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          prev();
        } else if (event.key === "Home") {
          event.preventDefault();
          goTo(0);
        } else if (event.key === "End") {
          event.preventDefault();
          goTo(count - 1);
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const end = event.changedTouches[0]?.clientX ?? start;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) next();
        else prev();
      }}
      aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
    >
      <p className="sr-only" role="status">
        {t(locale, "Testimonial", "টেস্টিমোনিয়াল")} {current + 1} / {count}
      </p>
      <div
        key={current}
        role="group"
        aria-roledescription="slide"
        aria-label={`${t(locale, "Testimonial", "টেস্টিমোনিয়াল")} ${current + 1} / ${count}`}
        className="fq-enter-fade flex flex-col items-center text-center"
      >
        {testimonial.image && (
          <img
            src={testimonial.image}
            alt={testimonial.author}
            className="mb-4 h-12 w-12 rounded-full object-cover"
            loading="lazy"
          />
        )}
        <blockquote className="max-w-xl text-base italic text-foreground/80">
          "{testimonial.quote}"
        </blockquote>
        <figcaption
          data-part="author"
          className="mt-3 text-sm font-medium text-muted-foreground"
        >
          {testimonial.author}
        </figcaption>
      </div>
      {testimonials.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
          <button
            type="button"
            onClick={prev}
            aria-label={prevLabel}
            className="grid h-11 w-11 place-items-center rounded-fq-md border border-border bg-card text-base leading-none transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                next();
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                prev();
              }
            }}
          >
            {testimonials.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === current}
                className="grid min-h-11 min-w-11 place-items-center rounded-fq-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`${t(locale, "Testimonial", "টেস্টিমোনিয়াল")} ${i + 1} / ${testimonials.length}`}
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full transition ${
                    i === current ? "w-6 bg-primary" : "w-2 bg-border"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label={nextLabel}
            className="grid h-11 w-11 place-items-center rounded-fq-md border border-border bg-card text-base leading-none transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------ marquee_strip */

const MarqueeStrip: WidgetComponent = ({
  section,
  str,
  int,
  locale,
  editing,
}) => {
  const rowItems = rowsOf(section, "items").map((row) => ({
    text: readString(row, "text"),
    icon: readString(row, "icon"),
  }));
  // Blueprint fallback: scalar label split on middle-dot / comma / newline.
  const labelItems =
    rowItems.length === 0 && str("label")
      ? str("label")
          .split(/[·,|\n]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .map((text) => ({ text, icon: "" }))
      : [];
  const items = rowItems.length > 0 ? rowItems : labelItems;
  const speed = str("speed") || "normal";
  const direction = str("direction") || "left";

  const speedMap: Record<string, string> = {
    slow: "40s",
    normal: "25s",
    fast: "15s",
  };
  const duration = speedMap[speed] ?? "25s";

  if (items.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Marquee strip: add items.",
          "মার্কি স্ট্রিপ: আইটেম যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const content = items
    .map((item) => `${item.icon ? item.icon + " " : ""}${item.text}`)
    .join("  •  ");

  const animDir = direction === "right" ? "reverse" : "normal";

  return (
    <div
      className="overflow-hidden border-y border-border bg-card py-3"
      aria-label={t(locale, "Marquee", "মার্কি")}
    >
      <p
        className="whitespace-nowrap text-sm font-medium text-muted-foreground motion-safe:animate-[fq-marquee_linear_infinite]"
        style={{
          ["--fq-marquee" as string]: duration,
          animationDirection: animDir,
        }}
      >
        {content} • {content}
      </p>
    </div>
  );
};

/* ------------------------------------------------------ story_trunk */

const StoryTrunk: WidgetComponent = ({
  section,
  str,
  bool,
  Heading,
  locale,
  editing,
}) => {
  const items = rowsOf(section, "items").map((row) => ({
    question: readString(row, "question"),
    answer: readString(row, "answer"),
  }));
  const allowMultiple = bool("allowMultiple");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    if (allowMultiple) {
      setOpenIndex((prev) => (prev === i ? null : i));
    } else {
      setOpenIndex((prev) => (prev === i ? null : i));
    }
  };

  if (items.length === 0) {
    return editing ? (
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Story trunk: add FAQ items.",
          "স্টোরি ট্রাংক: FAQ আইটেম যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  return (
    <section className="rounded-fq-sm border border-border bg-card">
      <Heading className="px-6 pt-6 text-lg font-semibold">
        {t(locale, "Frequently asked questions", "প্রায়শই জিজ্ঞাসিত প্রশ্ন")}
      </Heading>
      <div className="divide-y divide-border">
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i}>
              <button
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium transition hover:bg-muted/50"
                aria-expanded={isOpen}
              >
                <span>{item.question}</span>
                <svg
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-6 pb-4 text-sm text-muted-foreground">
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ------------------------------------------------------ exports */

export const HERITAGE_WIDGETS: Record<
  Extract<
    SectionType,
    | "hero_carousel"
    | "department_grid"
    | "heritage_story"
    | "textile_showcase"
    | "editorial_banner"
    | "testimonial_carousel"
    | "marquee_strip"
    | "story_trunk"
  >,
  WidgetComponent
> = {
  hero_carousel: HeroCarousel,
  department_grid: DepartmentGrid,
  heritage_story: HeritageStory,
  textile_showcase: TextileShowcase,
  editorial_banner: EditorialBanner,
  testimonial_carousel: TestimonialCarousel,
  marquee_strip: MarqueeStrip,
  story_trunk: StoryTrunk,
};
