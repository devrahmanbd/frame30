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
import { useRef } from "react";
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
import { ProductCard, ProductCardSkeleton } from "./primitives/ProductCard";
import { cardVariantOf } from "./merch";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";
import {
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
  const occasions = [
    { label: str("o1Label"), href: str("o1Href") },
    { label: str("o2Label"), href: str("o2Href") },
    { label: str("o3Label"), href: str("o3Href") },
  ].filter((o) => o.label);
  // Task 5 motion: once-only batch reveal at full intent; static otherwise.
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
      className="w-full py-12 sm:py-24 border-t border-border/60"
    >
      <div className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            {str("heading") && (
              <Heading className="font-bangla-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-wide text-foreground">
                {str("heading")}
              </Heading>
            )}
            {str("body") && (
              <p className="mt-3 sm:mt-4 max-w-prose text-[12px] sm:text-[13.5px] leading-relaxed text-muted-foreground">
                {str("body")}
              </p>
            )}
            {str("buttonLabel") && (
              <a
                href={link(str("buttonHref") || "#")}
                className="mt-6 sm:mt-8 inline-flex min-h-12 items-center justify-center border border-border px-6 sm:px-8 text-[10px] sm:text-[11px] font-bold fq-caps tracking-widest text-foreground hover:bg-muted/50 transition-colors"
              >
                {str("buttonLabel")}
              </a>
            )}
          </div>
          {occasions.length > 0 && (
            <div className="min-w-0 lg:col-span-5">
              <ul
                aria-label={t(locale, "Occasions", "উপলক্ষ")}
                className="m-0 flex list-none flex-col gap-2 p-0"
              >
                {occasions.map((o) => (
                  <li key={o.label}>
                    <a
                      href={link(o.href || "#")}
                      className="group flex min-h-12 sm:min-h-14 items-center justify-between border-b border-border/60 bg-transparent px-2 text-[11px] sm:text-[13px] font-bold fq-caps tracking-widest transition-colors hover:border-foreground"
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
      className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-16 sm:py-24"
    >
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-6">
          <div className="relative overflow-hidden aspect-[4/5] bg-muted/20">
            <MediaFrame
              src={image}
              alt={str(altKey("imageUrl")) || headline}
              ratio="portrait"
              sizes={sizesAttr(str(sizesKey("imageUrl")))}
              className="h-full w-full object-cover"
            />
            {bool("scrim") && image && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-foreground/40"
              />
            )}
          </div>
        </div>
        <div className="min-w-0 lg:col-span-5 lg:col-start-8">
          {eyebrow && (
            <p className="mb-4 text-[11px] font-bold tracking-widest text-muted-foreground fq-caps border-b border-border/60 pb-3 inline-block">
              {eyebrow}
            </p>
          )}
          <Heading className="font-bangla-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-wide leading-tight text-foreground mt-4">
            {headline}
          </Heading>
          {body && (
            <p className="mt-4 sm:mt-6 max-w-prose text-[12px] sm:text-[13.5px] leading-relaxed text-muted-foreground">
              {body}
            </p>
          )}
          {ctaLabel && (
            <a
              href={link(ctaHref || "#")}
              className="mt-6 sm:mt-8 inline-flex min-h-12 sm:min-h-14 items-center justify-center bg-foreground px-8 sm:px-10 text-[11px] sm:text-[13px] font-bold fq-caps tracking-widest text-background transition-transform hover:opacity-90 active:scale-[0.98]"
            >
              {ctaLabel}
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
  // Widget skin (spec 2026-09-25): carousel (default, current snap+buttons
  // controller byte-identical), wall (all quotes in a responsive grid) and
  // single (first quote, static). bn twins, quote-card voice, empty-state
  // contract and reduced-motion behaviour stay common — only the composition
  // forks.
  const skin = resolveSkin("testimonials", str("skin"));
  const autoAdvanceMs = int("autoAdvanceMs", 6000, 1500, 15000);
  // Task 5 motion: snap+buttons controller (spec §3). Reduced/off intents
  // stay on the static first slide; buttons and dots keep working for all
  // visitors. Pause-on-hover maps to pause()/resume(). Called unconditionally
  // so hooks stay stable; wall/single simply ignore the controller.
  const {
    index: current,
    goTo,
    pause,
    resume,
  } = useSongoskritiCarousel(testimonials.length, autoAdvanceMs);
  // Task 5 motion: once-only batch reveal at full intent; static otherwise.
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

  const quoteCard = (item: (typeof testimonials)[number]) => (
    <div className="flex flex-col items-center text-center">
      {item.image ? (
        <img
          src={item.image}
          alt={item.author}
          className="mb-4 h-12 w-12 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className="mb-6 block font-bangla-display text-6xl leading-none text-foreground/20"
        >
          &ldquo;
        </span>
      )}
      <blockquote className="max-w-2xl font-bangla-display text-lg leading-relaxed text-foreground sm:text-xl lg:text-3xl text-center">
        {item.quote}
      </blockquote>
      <div className="mt-8 flex items-center justify-center gap-4">
        <div className="h-px w-8 bg-foreground/30"></div>
        <p
          data-part="author"
          className="text-[10px] sm:text-[12px] font-bold fq-caps tracking-widest text-foreground"
        >
          {item.author}
          {item.role && (
            <span className="text-muted-foreground ml-2 font-medium">
              — {item.role}
            </span>
          )}
        </p>
        <div className="h-px w-8 bg-foreground/30"></div>
      </div>
    </div>
  );

  if (skin === "wall") {
    return (
      <section
        ref={scope}
        data-songoskriti-reveal
        className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-12 sm:py-24"
        aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
      >
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((item) => (
            <li
              key={`${item.author}-${item.quote.slice(0, 24)}`}
              className="rounded-fq-md border border-border bg-card p-5"
            >
              <span
                aria-hidden="true"
                className="mb-2 block font-bangla-display text-4xl leading-none text-foreground/20"
              >
                &ldquo;
              </span>
              <blockquote className="font-bangla-display text-base leading-relaxed text-foreground">
                {item.quote}
              </blockquote>
              <p
                data-part="author"
                className="mt-4 text-[10px] sm:text-[12px] font-bold fq-caps tracking-widest text-foreground"
              >
                {item.author}
                {item.role && (
                  <span className="text-muted-foreground ml-2 font-medium">
                    — {item.role}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (skin === "single") {
    const item = testimonials[0]!;
    return (
      <section
        ref={scope}
        data-songoskriti-reveal
        className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-12 sm:py-24"
        aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
      >
        <div className="max-w-4xl mx-auto px-4">{quoteCard(item)}</div>
      </section>
    );
  }

  const item = testimonials[current]!;
  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-12 sm:py-24"
      aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
    >
      <div
        className="max-w-4xl mx-auto px-4"
        onMouseEnter={() => pause()}
        onMouseLeave={() => resume()}
      >
        {quoteCard(item)}
        {testimonials.length > 1 && (
          <div className="mt-4 flex justify-center gap-1">
            {testimonials.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
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
      </div>
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
      className="w-full border-t border-border/60 bg-muted/10"
    >
      <ul className="mx-auto grid max-w-[var(--fq-container,1440px)] grid-cols-1 gap-6 sm:gap-8 px-4 sm:px-8 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
        {items.map((item) => {
          const Icon =
            TRUST_FOOTER_ICON[item.icon as keyof typeof TRUST_FOOTER_ICON] ??
            Star;
          return (
            <li
              key={item.title}
              className="flex flex-col items-center text-center gap-4"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-background">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] sm:text-[13px] font-bold fq-caps tracking-widest text-foreground">
                  {item.title}
                </span>
                {item.body && (
                  <span className="mt-1 sm:mt-2 block text-[11px] sm:text-[13px] font-medium tracking-wide text-muted-foreground">
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

/* ------------------------------------------------------------ product_rail */

/**
 * Songoskriti product rail (browser-verified rhythm fix, 2026-09-24).
 *
 * The shared merch rail rendered a bare section: the H2 sat flush to the
 * viewport edge, and the prev/next arrows floated in their own row beneath
 * the cards. This override keeps the merch data semantics byte-identical
 * (same limit clamp, same variant resolution, same `ProductCard` props for
 * prices/badges/stars — `ProductCard` itself is untouched) and changes only
 * the wrapper rhythm: a padded max-w container, the H2 sharing a header row
 * with docked arrows (via the `Rail` heading slot), and the `MediaFrame`
 * aspect-ratio box inside every card/skeleton reserving media space so the
 * rail holds CLS < 0.1 as images land.
 */
const SongoskritiProductRail: WidgetComponent = (ctx) => {
  const { str, bool, int, data, locale, Heading } = ctx;
  const variant = cardVariantOf(str("cardVariant"), "compact");
  // Widget skin (spec 2026-09-25): editorial (default, browser-verified
  // rhythm byte-identical), compact and minimal (quieter heading, tighter
  // rhythm). Data semantics, docked arrows, card markup, skeletons and bn/en
  // copy stay common — only presentation forks.
  const skin = resolveSkin("product_rail", str("skin"));
  const rows = data?.rows?.slice(0, int("limit", 12, 1, 24));
  const label =
    str("heading") || (locale === "bn" ? "পণ্যের তালিকা" : "Product rail");
  const headingClassName =
    skin === "compact"
      ? "font-bangla-display text-xl sm:text-2xl font-medium tracking-wide text-foreground"
      : skin === "minimal"
        ? "text-sm font-bold fq-caps tracking-widest text-muted-foreground"
        : "font-bangla-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-wide text-foreground";
  const heading = str("heading") ? (
    <Heading className={headingClassName}>{str("heading")}</Heading>
  ) : null;
  const sectionClassName =
    skin === "editorial"
      ? "mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-12 sm:py-24 [&_article]:border-none [&_article]:bg-transparent [&_article]:shadow-none"
      : "mx-auto w-full max-w-[var(--fq-container,1440px)] px-4 sm:px-8 py-8 sm:py-12 [&_article]:border-none [&_article]:bg-transparent [&_article]:shadow-none";
  // An empty rail leaves no hole: null, not a padded empty shell.
  if (rows !== undefined && rows.length === 0 && !data?.pending) return null;
  return (
    <section className={sectionClassName}>
      {data?.pending || rows === undefined ? (
        <Rail label={label} heading={heading ?? undefined}>
          {Array.from({ length: 6 }, (_, i) => (
            <ProductCardSkeleton key={i} variant={variant} />
          ))}
        </Rail>
      ) : rows.length === 0 ? null : (
        <Rail label={label} heading={heading ?? undefined}>
          {rows.map((row) => (
            <ProductCard
              key={row.id}
              row={row}
              locale={locale}
              variant={variant}
              badgeLabel={str("badgeLabel") || undefined}
              promise={str("promise") || undefined}
              showRating={bool("showRating")}
            />
          ))}
        </Rail>
      )}
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
  >,
  WidgetComponent
> = {
  finder_row: FinderRow,
  craft_story: CraftStory,
  testimonials: Testimonials,
  trust_footer: TrustFooter,
  product_rail: SongoskritiProductRail,
};
