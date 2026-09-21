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
import { useEffect, useState } from "react";
import type {
  PropRow,
  PropValue,
  Section,
  SectionType,
} from "@/lib/builder-ast";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { placeholderSeed } from "@/lib/placeholder";

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

/* ------------------------------------------------------ hero_carousel */

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
    ctaUrl: readString(row, "ctaUrl"),
    caption: readString(row, "caption"),
  }));
  const autoAdvanceMs = int("autoAdvanceMs", 5000, 1000, 15000);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % slides.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [paused, slides.length, autoAdvanceMs]);

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
  const artSrc =
    slide.image ||
    `/api/public/ph/${placeholderSeed(slide.headline || "heritage")}`;
  return (
    <section
      aria-label={t(locale, "Hero carousel", "হিরো ক্যারোজেল")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="border-b border-border bg-card"
    >
      <div className="mx-auto grid max-w-[var(--fq-container,1280px)] items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-12 lg:gap-12">
        {/* Copy — asymmetric left, seven columns */}
        <div className="min-w-0 lg:col-span-7">
          {slide.caption && (
            <p className="text-xs font-semibold tracking-widest text-primary fq-caps">
              {slide.caption}
            </p>
          )}
          {slide.headlineBn && (
            <p
              lang="bn"
              className="font-bangla-display mt-3 text-2xl font-bold leading-tight text-foreground sm:text-4xl"
            >
              {slide.headlineBn}
            </p>
          )}
          <Heading className="mt-2 font-bangla-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            {slide.headline}
          </Heading>
          {slide.subhead && (
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {locale === "bn" && slide.subheadBn
                ? slide.subheadBn
                : slide.subhead}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {slide.ctaLabel && (
              <a
                href={slide.ctaUrl || "#"}
                className="inline-flex min-h-12 items-center whitespace-nowrap rounded-fq-md bg-primary px-7 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                {slide.ctaLabel}
              </a>
            )}
            {/* Dots live with the copy — never overlapping art or CTA */}
            {slides.length > 1 && (
              <div className="flex items-center gap-2" role="tablist" aria-label={t(locale, "Slides", "স্লাইড")}>
                {slides.map((_, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === current}
                    onClick={() => setCurrent(i)}
                    className={`h-2 rounded-full transition ${
                      i === current
                        ? "w-7 bg-primary"
                        : "w-2 bg-foreground/25 hover:bg-foreground/50"
                    }`}
                    aria-label={`${t(locale, "Slide", "স্লাইড")} ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Art — five columns, portrait crop, its own zone */}
        <div className="min-w-0 lg:col-span-5">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-fq-lg border border-border bg-muted sm:aspect-[16/10] lg:aspect-[4/5]">
            <img
              src={artSrc}
              alt={slide.image ? slide.headline : ""}
              aria-hidden={slide.image ? undefined : true}
              className="absolute inset-0 h-full w-full object-cover"
              loading={isFirst ? "eager" : "lazy"}
              fetchPriority={isFirst ? "high" : "auto"}
              decoding="async"
            />
          </div>
        </div>
      </div>
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
    name: readString(row, "name"),
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
      ? "sm:grid-cols-2"
      : columns <= 3
        ? "sm:grid-cols-3"
        : columns <= 4
          ? "sm:grid-cols-2 lg:grid-cols-4"
          : "sm:grid-cols-3 lg:grid-cols-5";
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <Heading className="font-bangla-display text-2xl font-bold tracking-tight sm:text-3xl">
          {t(locale, "Shop by department", "বিভাগ অনুযায়ী কিনুন")}
        </Heading>
        <p className="text-xs text-muted-foreground">
          {departments.reduce((n, d) => n + (d.count || 0), 0)}{" "}
          {t(locale, "handcrafted pieces", "হাতে তৈরি পণ্য")}
        </p>
      </div>
      <div className={`grid gap-4 ${gridCols}`}>
        {departments.map((dept, i) => (
          <a
            key={i}
            href={dept.href || "#"}
            className={`group relative overflow-hidden rounded-fq-md border border-border bg-card transition hover:shadow-fq-sm ${
              i === 0 ? "sm:col-span-2 sm:row-span-2" : ""
            }`}
          >
            <div
              className={`bg-gradient-to-br from-amber-100 to-rose-50 flex items-center justify-center ${
                i === 0 ? "aspect-[3/4] sm:aspect-auto sm:h-full sm:min-h-[28rem]" : "aspect-[3/4]"
              }`}
            >
              {dept.image ? (
                <img
                  src={dept.image}
                  alt={dept.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <img
                  src={`/api/public/ph/${placeholderSeed(dept.name || "department")}`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="p-3">
              <p className={`font-medium ${i === 0 ? "text-base" : "text-sm"}`}>
                {locale === "bn" && dept.nameBn ? dept.nameBn : dept.name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {dept.count} {t(locale, "items", "পণ্য")}
              </p>
            </div>
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
  const headline = str("headline");
  const body = str("body");
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
      <Heading className="text-2xl font-bold leading-tight sm:text-3xl">
        {headline}
      </Heading>
      {body && (
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
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
  const products = rowsOf(section, "products").map((row) => ({
    image: readString(row, "image"),
    name: readString(row, "name"),
    nameBn: readString(row, "name_bn"),
    price: readNumber(row, "price", 0),
    href: readString(row, "href"),
  }));
  const headline = str("headline");
  const ctaLabel = str("cta_label");

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
      <div className="grid gap-6 sm:grid-cols-2">
        {products.map((product, i) => (
          <a
            key={i}
            href={product.href || "#"}
            className="group overflow-hidden rounded-fq-sm border border-border bg-card transition hover:shadow-fq-sm"
          >
            <div className="aspect-[4/3] bg-gradient-to-br from-amber-100 to-rose-50 flex items-center justify-center">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <img
                  src={`/api/public/ph/${placeholderSeed(product.name || "textile")}`}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="p-4">
              <p className="text-sm font-medium">
                {locale === "bn" && product.nameBn
                  ? product.nameBn
                  : product.name}
              </p>
              {product.price > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
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
  const headline = str("headline");
  const subhead = str("subhead");
  const ctaLabel = str("cta_label");
  const ctaUrl = str("cta_url");
  const overlay = str("overlay") || "dark";

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
    <section className="relative overflow-hidden rounded-fq-sm">
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
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || testimonials.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % testimonials.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [paused, testimonials.length, autoAdvanceMs]);

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
  return (
    <section
      className="rounded-fq-sm border border-border bg-card p-6 sm:p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
    >
      <div className="flex flex-col items-center text-center">
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
        <figcaption className="mt-3 text-sm font-medium text-muted-foreground">
          {testimonial.author}
        </figcaption>
      </div>
      {testimonials.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition ${
                i === current ? "w-6 bg-primary" : "w-2 bg-border"
              }`}
              aria-label={`${t(locale, "Testimonial", "টেস্টিমোনিয়াল")} ${i + 1}`}
            />
          ))}
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
  const items = rowsOf(section, "items").map((row) => ({
    text: readString(row, "text"),
    icon: readString(row, "icon"),
  }));
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
