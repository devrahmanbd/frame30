/**
 * Songoskriti (heritage) homepage widgets.
 *
 * Four editorial widgets with no generic renderer coverage: the occasion
 * finder row, the copy-only craft story, the multi-quote testimonials
 * carousel, and the trust assurances footer. `hero_carousel` is covered by
 * heritage.tsx HeroCarousel and needs no renderer here.
 *
 * Everything reads design tokens through semantic utility classes only and
 * never imports a theme module, so the set stays usable by any theme.
 * Empty `testimonials`/`items` arrays render an editing placeholder and
 * null on the storefront — never a throw, never a blank crash.
 */
import { useEffect, useState } from "react";
import type {
  PropRow,
  PropValue,
  Section,
  SectionType,
} from "@/lib/builder-ast";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { MediaFrame } from "./primitives/MediaFrame";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";
import {
  Headset,
  RotateCcw,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";

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

const FinderRow: WidgetComponent = ({ str, Heading, editing, locale }) => {
  const occasions = [
    { label: str("o1Label"), href: str("o1Href") },
    { label: str("o2Label"), href: str("o2Href") },
    { label: str("o3Label"), href: str("o3Href") },
  ].filter((o) => o.label);
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
    <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
      {str("heading") && (
        <Heading className="font-bangla-display text-2xl font-bold">
          {str("heading")}
        </Heading>
      )}
      {str("body") && (
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {str("body")}
        </p>
      )}
      {occasions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {occasions.map((o) => (
            <a
              key={o.label}
              href={o.href || "#"}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:border-primary/40"
            >
              {o.label}
            </a>
          ))}
        </div>
      )}
      {str("buttonLabel") && (
        <a
          href={str("buttonHref") || "#"}
          className="mt-4 inline-flex min-h-11 w-fit items-center rounded-fq-md border border-current px-5 text-sm font-medium"
        >
          {str("buttonLabel")}
        </a>
      )}
    </section>
  );
};

/* ------------------------------------------------------------- craft_story */

const CraftStory: WidgetComponent = ({ str, bool, Heading, editing, locale }) => {
  if (!str("heading") && !str("body")) {
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
    <section className="relative overflow-hidden rounded-fq-lg">
      <MediaFrame
        src={str("imageUrl")}
        alt={str(altKey("imageUrl"))}
        ratio="wide"
        sizes={sizesAttr(str(sizesKey("imageUrl")))}
        className="rounded-fq-lg"
      />
      {bool("scrim") && (
        <div aria-hidden="true" className="absolute inset-0 bg-foreground/40" />
      )}
      <div className="absolute inset-0 flex items-end p-6 md:p-10">
        <div className="max-w-xl text-background">
          {str("eyebrow") && (
            <p className="mb-2 text-[11px] fq-caps tracking-[0.16em] opacity-80">
              {str("eyebrow")}
            </p>
          )}
          <Heading className="text-2xl font-semibold md:text-4xl">
            {str("heading")}
          </Heading>
          {str("body") && (
            <p className="mt-3 text-sm opacity-90">{str("body")}</p>
          )}
          {str("ctaLabel") && (
            <a
              href={str("ctaHref") || "#"}
              className="mt-4 inline-flex min-h-11 items-center rounded-fq-md border border-current px-5 text-sm font-medium"
            >
              {str("ctaLabel")}
            </a>
          )}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------ testimonials */

const Testimonials: WidgetComponent = ({
  section,
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
  const autoAdvanceMs = int("autoAdvanceMs", 6000, 1500, 15000);
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
          "Testimonials: add a quote.",
          "প্রশংসাপত্র: একটি মতামত যোগ করুন।",
        )}
      </p>
    ) : null;
  }

  const item = testimonials[current]!;
  return (
    <section
      className="rounded-fq-lg border border-border bg-card p-6 sm:p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
    >
      <div className="flex flex-col items-center text-center">
        {item.image && (
          <img
            src={item.image}
            alt={item.author}
            className="mb-4 h-12 w-12 rounded-full object-cover"
            loading="lazy"
          />
        )}
        <blockquote className="max-w-xl text-base italic leading-relaxed text-foreground/80 line-clamp-3">
          &ldquo;{item.quote}&rdquo;
        </blockquote>
        <p className="mt-3 text-sm font-medium">
          {item.author}
          {item.role && (
            <span className="block text-xs font-normal text-muted-foreground">
              {item.role}
            </span>
          )}
        </p>
      </div>
      {testimonials.length > 1 && (
        <div className="mt-4 flex justify-center gap-1">
          {testimonials.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              className="grid min-h-11 min-w-11 place-items-center"
              aria-label={`${t(locale, "Testimonial", "প্রশংসাপত্র")} ${i + 1}`}
              aria-current={i === current}
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
        {t(
          locale,
          "Trust footer: add badges.",
          "আস্থা ফুটার: ব্যাজ যোগ করুন।",
        )}
      </p>
    ) : null;
  }
  return (
    <ul className="grid grid-cols-2 gap-4 rounded-fq-lg border border-border bg-card p-4 sm:grid-cols-4">
      {items.map((item) => {
        const Icon =
          TRUST_FOOTER_ICON[
            item.icon as keyof typeof TRUST_FOOTER_ICON
          ] ?? Star;
        return (
          <li key={item.title} className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-fq-md bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              {item.body && (
                <span className="block text-xs text-muted-foreground">
                  {item.body}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

/* ------------------------------------------------------ exports */

export const SONGOSKRITI_WIDGETS: Record<
  Extract<
    SectionType,
    "finder_row" | "craft_story" | "testimonials" | "trust_footer"
  >,
  WidgetComponent
> = {
  finder_row: FinderRow,
  craft_story: CraftStory,
  testimonials: Testimonials,
  trust_footer: TrustFooter,
};
