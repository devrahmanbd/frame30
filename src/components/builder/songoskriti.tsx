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

const FinderRow: WidgetComponent = ({ str, Heading, editing, locale }) => {
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
      className="mx-auto w-full max-w-6xl px-4"
    >
      <div className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            {str("heading") && (
              <Heading className="font-bangla-display text-2xl font-bold">
                {str("heading")}
              </Heading>
            )}
            {str("body") && (
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {str("body")}
              </p>
            )}
            {str("buttonLabel") && (
              <a
                href={str("buttonHref") || "#"}
                className="mt-4 inline-flex min-h-11 items-center whitespace-nowrap rounded-fq-md border border-current px-5 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                      href={o.href || "#"}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-fq-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span>{o.label}</span>
                      <span aria-hidden="true" className="text-primary">
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
      className="mx-auto w-full max-w-6xl px-4"
    >
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <div className="relative overflow-hidden rounded-fq-lg border border-border">
            <MediaFrame
              src={image}
              alt={str(altKey("imageUrl")) || headline}
              ratio="portrait"
              sizes={sizesAttr(str(sizesKey("imageUrl")))}
              className="rounded-fq-lg"
            />
            {bool("scrim") && image && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-foreground/40"
              />
            )}
          </div>
        </div>
        <div className="min-w-0 lg:col-span-6 lg:col-start-7">
          <div aria-hidden="true" className="mb-4 h-px w-16 bg-primary" />
          {eyebrow && (
            <p className="mb-2 text-xs font-semibold tracking-widest text-primary fq-caps">
              {eyebrow}
            </p>
          )}
          <Heading className="font-bangla-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {headline}
          </Heading>
          {body && (
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
              {body}
            </p>
          )}
          {ctaLabel && (
            <a
              href={ctaHref || "#"}
              className="mt-5 inline-flex min-h-11 items-center whitespace-nowrap rounded-fq-md border border-current px-5 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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

const Testimonials: WidgetComponent = ({ section, int, locale, editing }) => {
  const testimonials = rowsOf(section, "testimonials")
    .map((row) => ({
      quote: readBn(row, "quote", locale),
      author: readBn(row, "author", locale),
      role: readBn(row, "role", locale),
      image: readString(row, "image"),
    }))
    .filter((item) => item.quote);
  const autoAdvanceMs = int("autoAdvanceMs", 6000, 1500, 15000);
  // Task 5 motion: snap+buttons controller (spec §3). Reduced/off intents
  // stay on the static first slide; buttons and dots keep working for all
  // visitors. Pause-on-hover maps to pause()/resume().
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

  const item = testimonials[current]!;
  return (
    <section
      ref={scope}
      data-songoskriti-reveal
      className="mx-auto w-full max-w-4xl px-4"
      aria-label={t(locale, "Testimonials", "প্রশংসাপত্র")}
    >
      <div
        className="rounded-fq-lg border border-border bg-card p-6 sm:p-8"
        onMouseEnter={() => pause()}
        onMouseLeave={() => resume()}
      >
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
              className="mb-2 text-3xl leading-none text-primary"
            >
              &ldquo;
            </span>
          )}
          <blockquote className="max-w-xl text-base leading-relaxed text-foreground line-clamp-3">
            {item.image ? <>&ldquo;{item.quote}&rdquo;</> : item.quote}
          </blockquote>
          <p className="mt-3 w-full border-t border-border pt-3 text-sm font-medium">
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
      className="mx-auto w-full max-w-6xl px-4"
    >
      <ul className="grid grid-cols-2 gap-4 rounded-fq-lg border border-border bg-card p-4 sm:grid-cols-4">
        {items.map((item) => {
          const Icon =
            TRUST_FOOTER_ICON[item.icon as keyof typeof TRUST_FOOTER_ICON] ??
            Star;
          return (
            <li key={item.title} className="flex min-w-0 items-start gap-2.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-fq-md bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
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
  const rows = data?.rows?.slice(0, int("limit", 12, 1, 24));
  const label =
    str("heading") || (locale === "bn" ? "পণ্যের তালিকা" : "Product rail");
  const heading = str("heading") ? (
    <Heading className="text-xl font-bold tracking-tight">
      {str("heading")}
    </Heading>
  ) : null;
  // An empty rail leaves no hole: null, not a padded empty shell.
  if (rows !== undefined && rows.length === 0 && !data?.pending) return null;
  return (
    <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
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
