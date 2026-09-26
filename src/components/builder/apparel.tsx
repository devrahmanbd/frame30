/**
 * Phase 2.6 — Atelier (apparel) widgets.
 *
 * Editorial merchandising, fit and sizing, and the apparel cross-sell set.
 * Everything here is built from the shared primitives (MediaFrame, Rail,
 * ProductCard, OverlayHost, Disclosure, DataTable, ConsentChip) and reads its
 * rows from the single batched data call. No theme module is imported and no
 * raw colour appears: Atelier is a token preset, not a renderer fork.
 *
 * Money is never computed here — prices come from the server-valued minor
 * units through `ctx.money`.
 */
import { useState } from "react";
import { textOf } from "@/lib/bitext";
import type { SectionType } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import { ConsentChip } from "./primitives/ConsentChip";
import { DataTable } from "./primitives/DataTable";
import { Disclosure } from "./primitives/Disclosure";
import { Hotspot } from "./primitives/Hotspot";
import { MediaFrame } from "./primitives/MediaFrame";
import { OverlayHost } from "./primitives/OverlayHost";
import { ProductCard, ProductCardSkeleton } from "./primitives/ProductCard";
import { Rail } from "./primitives/Rail";
import { onRadioGroupKeyDown } from "./primitives/RovingRadiogroup";
import { UnitToggle, convertCm, type SizeUnit } from "./primitives/UnitToggle";
import { useSectionChannel } from "./useSectionChannel";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";

function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

function Eyebrow({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mb-2 text-[11px] fq-caps tracking-[0.16em] text-muted-foreground">
      {text}
    </p>
  );
}

function Cta({ label, href }: { label: string; href: string }) {
  if (!label) return null;
  return (
    <a
      href={href || "#"}
      className="mt-4 inline-flex min-h-11 items-center rounded-fq-md border border-current px-5 text-sm font-medium"
    >
      {label}
    </a>
  );
}

function TileSkeleton({
  count = 4,
  ratio = "aspect-[3/4]",
}: {
  count?: number;
  ratio?: string;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`${ratio} animate-pulse rounded-fq-md bg-muted`}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------- editorial_hero */

const EditorialHero: WidgetComponent = (ctx) => {
  const { str, bool, Heading } = ctx;
  const split = str("layout") === "split";
  const scrim = bool("scrim");
  const image = (
    <MediaFrame
      src={str("imageUrl")}
      alt={str(altKey("imageUrl")) || str("heading")}
      ratio={split ? "portrait" : "wide"}
      eager
      sizes={sizesAttr(str(sizesKey("imageUrl")))}
      className="rounded-fq-lg"
    />
  );
  const copy = (
    <div
      className={
        split
          ? ""
          : "rounded-fq-lg border border-border bg-card p-6 shadow-fq-sm"
      }
    >
      <Eyebrow text={str("eyebrow")} />
      <Heading className="text-3xl font-semibold leading-tight md:text-5xl">
        {str("heading")}
      </Heading>
      {str("body") && (
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          {str("body")}
        </p>
      )}
      <Cta label={str("ctaLabel")} href={str("ctaHref")} />
    </div>
  );

  if (split) {
    return (
      <section className="grid items-center gap-6 md:grid-cols-2">
        {image}
        {copy}
      </section>
    );
  }
  return (
    <section className="relative">
      {image}
      {scrim && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-fq-lg bg-foreground/25"
        />
      )}
      <div className="relative -mt-16 px-4 md:-mt-24 md:max-w-md md:px-8">
        {copy}
      </div>
    </section>
  );
};

/* -------------------------------------------------------------- lookbook */

const Lookbook: WidgetComponent = (ctx) => {
  const { str, bool, Heading, section, locale } = ctx;
  const offset = bool("offset");
  // Repeater-first (faq/trust_bar precedent): studio `items` rows win when
  // present, scalar i1..i4 triples remain as the fallback for
  // theme-authored sections. Ratio alternation is index-based so both
  // paths paint identically.
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => ({
          image: typeof row.image === "string" ? row.image : "",
          alt: textOf(row, "alt", locale),
          href: typeof row.href === "string" ? row.href : "",
        }))
        .filter((row) => row.image)
    : [];
  const tiles =
    itemRows.length > 0
      ? itemRows.map((row, index) => ({
          src: row.image,
          alt: row.alt,
          href: row.href,
          ratio:
            index % 2 === 1 ? ("portrait" as const) : ("landscape" as const),
        }))
      : [1, 2, 3, 4]
          .map((n) => ({
            src: str(`i${n}Image`),
            alt: str(`i${n}Alt`),
            href: str(`i${n}Href`),
            ratio: n % 2 === 0 ? ("portrait" as const) : ("landscape" as const),
          }))
          .filter((tile) => tile.src);
  if (tiles.length === 0) return null;
  return (
    <section>
      {str("heading") && (
        <Heading className="mb-4 text-lg font-semibold">
          {str("heading")}
        </Heading>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile, index) => {
          const body = (
            <MediaFrame
              src={tile.src}
              alt={tile.alt}
              ratio={tile.ratio}
              className="rounded-fq-md"
              eager={index === 0}
            />
          );
          return (
            <div
              key={index}
              className={offset && index % 2 === 1 ? "sm:mt-12" : undefined}
            >
              {tile.href ? <a href={tile.href}>{body}</a> : body}
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ------------------------------------------------------- shoppable_image */

const ShoppableImage: WidgetComponent = (ctx) => {
  const { str, int, data, locale, money, Heading } = ctx;
  const limit = int("limit", 4, 1, 4);
  const rows = (data?.rows ?? []).slice(0, limit);
  const pins = rows.map((row, i) => ({
    row,
    x: int(`p${i + 1}x`, 25 + i * 15, 0, 100),
    y: int(`p${i + 1}y`, 30 + i * 15, 0, 100),
  }));
  return (
    <section
      aria-label={str("heading") || t(locale, "Shop the look", "লুক কিনুন")}
    >
      {str("heading") && (
        <Heading className="mb-3 text-lg font-semibold">
          {str("heading")}
        </Heading>
      )}
      <div className="relative">
        <MediaFrame
          src={str("imageUrl")}
          alt={str(altKey("imageUrl")) || str("altText")}
          ratio="portrait"
          sizes={sizesAttr(str(sizesKey("imageUrl")))}
          className="rounded-fq-lg"
        />
        {data?.pending
          ? null
          : pins.map((pin, index) => (
              <Hotspot
                key={pin.row.id}
                x={pin.x}
                y={pin.y}
                index={index + 1}
                label={t(
                  locale,
                  `Show ${pin.row.title}`,
                  `${pin.row.title} দেখুন`,
                )}
              >
                <a
                  href={pin.row.href ?? "#"}
                  className="flex items-center gap-2"
                >
                  <MediaFrame
                    src={pin.row.imageUrl}
                    alt=""
                    ratio="square"
                    className="w-14 shrink-0 rounded-fq-sm"
                  />
                  <span className="min-w-0">
                    <span data-part="title" className="block truncate text-sm font-medium">
                      {pin.row.title}
                    </span>
                    {pin.row.priceMinor !== undefined && (
                      <span
                        data-part="price"
                        className="block text-xs tabular-nums text-muted-foreground"
                      >
                        {money(pin.row.priceMinor, pin.row.currency)}
                      </span>
                    )}
                  </span>
                </a>
              </Hotspot>
            ))}
      </div>
    </section>
  );
};

/* --------------------------------------------------------- split_feature */

const SplitFeature: WidgetComponent = (ctx) => {
  const { str, bool, Heading } = ctx;
  const flip = bool("flip");
  return (
    <section className="grid items-center gap-6 md:grid-cols-2">
      <div className={flip ? "md:order-2" : undefined}>
        <MediaFrame
          src={str("imageUrl")}
          alt={str(altKey("imageUrl")) || str("imageAlt")}
          ratio="portrait"
          sizes={sizesAttr(str(sizesKey("imageUrl")))}
          className="rounded-fq-lg"
        />
      </div>
      <div className={flip ? "md:order-1" : undefined}>
        <Eyebrow text={str("eyebrow")} />
        <Heading className="text-2xl font-semibold">{str("heading")}</Heading>
        {str("body") && (
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {str("body")}
          </p>
        )}
        <Cta label={str("ctaLabel")} href={str("ctaHref")} />
      </div>
    </section>
  );
};

/* ------------------------------------------------------ collection_story */

const CollectionStory: WidgetComponent = (ctx) => {
  const { str, bool, Heading } = ctx;
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
          <Eyebrow text={str("eyebrow")} />
          <Heading className="text-2xl font-semibold md:text-4xl">
            {str("heading")}
          </Heading>
          {str("body") && (
            <p className="mt-3 text-sm opacity-90">{str("body")}</p>
          )}
          <Cta label={str("ctaLabel")} href={str("ctaHref")} />
        </div>
      </div>
    </section>
  );
};

/* ----------------------------------------------------------- ugc_gallery */

const UgcGallery: WidgetComponent = (ctx) => {
  const { str, int, data, Heading, locale } = ctx;
  const limit = int("limit", 6, 2, 12);
  const rows = (data?.rows ?? []).slice(0, limit);
  return (
    <section
      aria-label={
        str("heading") || t(locale, "Customer gallery", "ক্রেতাদের ছবি")
      }
    >
      {str("heading") && (
        <Heading className="mb-3 text-lg font-semibold">
          {str("heading")}
        </Heading>
      )}
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {data?.pending
          ? Array.from({ length: limit }, (_, i) => (
              <li key={i}>
                <div
                  className="aspect-square animate-pulse rounded-fq-md bg-muted"
                  aria-hidden="true"
                />
              </li>
            ))
          : rows.map((row) => (
              <li key={row.id}>
                <a href={row.href ?? "#"}>
                  <MediaFrame
                    src={row.imageUrl}
                    alt={row.title}
                    ratio="square"
                    className="rounded-fq-md"
                  />
                </a>
              </li>
            ))}
      </ul>
      {str("note") && (
        <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p>
      )}
    </section>
  );
};

/* ---------------------------------------------------------- social_strip */

const SocialStrip: WidgetComponent = (ctx) => {
  const { str, Heading } = ctx;
  const images = [1, 2, 3, 4, 5, 6]
    .map((n) => str(`i${n}Image`))
    .filter(Boolean);
  if (images.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <Heading className="text-sm fq-caps tracking-[0.16em] text-muted-foreground">
          {str("heading")}
        </Heading>
        {str("href") && (
          <a href={str("href")} className="text-sm underline">
            {str("heading")}
          </a>
        )}
      </div>
      <Rail label={str("heading") || "Social"}>
        {images.map((src, i) => (
          <MediaFrame
            key={i}
            src={src}
            alt=""
            ratio="square"
            className="w-40 rounded-fq-md"
          />
        ))}
      </Rail>
    </section>
  );
};

/* --------------------------------------------------------- store_locator */

const StoreLocator: WidgetComponent = (ctx) => {
  const { str, Heading, locale } = ctx;
  const stores = [1, 2, 3]
    .map((n) => ({
      name: str(`s${n}Name`),
      address: str(`s${n}Address`),
      hours: str(`s${n}Hours`),
      phone: str(`s${n}Phone`),
    }))
    .filter((store) => store.name);
  if (stores.length === 0) return null;
  return (
    <section
      className="w-full border-t border-[var(--theme-border)] py-16 sm:py-20"
      aria-label={str("heading") || t(locale, "Stores", "দোকান")}
    >
      <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 sm:px-8">
        {str("heading") && (
          <Heading className="mb-12 text-center text-[11px] font-medium tracking-[0.25em] text-foreground fq-caps">
            {str("heading")}
          </Heading>
        )}
        <ul className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--theme-border)]">
          {stores.map((store) => (
            <li
              key={store.name}
              className="flex flex-col items-center text-center py-8 sm:py-0 px-6 sm:px-8 lg:px-12"
            >
              <p className="font-serif text-[18px] font-light text-foreground tracking-wide">
                {store.name}
              </p>
              {store.address && (
                <p className="mt-3 font-serif text-[13px] font-light text-foreground/55 whitespace-pre-line leading-relaxed">
                  {store.address}
                </p>
              )}
              {store.hours && (
                <p className="mt-3 text-[10px] font-medium tracking-[0.2em] text-foreground/50 fq-caps">
                  {store.hours}
                </p>
              )}
              {store.phone && (
                <a
                  href={`tel:${store.phone}`}
                  className="mt-4 font-serif text-[13px] font-light text-foreground/70 hover:text-foreground transition-colors underline underline-offset-4 decoration-foreground/20"
                >
                  {store.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/* --------------------------------------------------------- size_selector */

/** Variant rows whose option path looks like a size, in catalogue order. */
export function sizeRows(rows: WidgetRow[] | undefined): WidgetRow[] {
  return (rows ?? []).filter(
    (row) => (row.options ?? row.title).trim().length > 0,
  );
}

const SizeSelector: WidgetComponent = (ctx) => {
  const { str, data, locale } = ctx;
  const [selected, setSelected] = useState<string | null>(null);
  const rows = sizeRows(data?.rows);

  if (data?.pending) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-11 w-14 animate-pulse rounded-fq-md bg-muted"
          />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          locale,
          "Sizes appear once the product is connected.",
          "পণ্য যুক্ত হলে সাইজ দেখা যাবে।",
        )}
      </p>
    );
  }

  return (
    <section aria-label={str("heading") || t(locale, "Size", "সাইজ")}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">
          {str("heading") || t(locale, "Size", "সাইজ")}
        </p>
        {str("guideLabel") && (
          <a href="#size-guide" className="text-sm underline">
            {str("guideLabel")}
          </a>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label={str("heading") || "Size"}
        onKeyDown={onRadioGroupKeyDown}
        className="flex flex-wrap gap-2"
      >
        {rows.map((row) => {
          const label = row.options ?? row.title;
          const out = row.inStock === false;
          return (
            <button
              key={row.id}
              type="button"
              role="radio"
              aria-checked={selected === row.id}
              onClick={() => setSelected(row.id)}
              className={[
                "min-h-11 min-w-11 rounded-fq-md border px-3 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                selected === row.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
                out ? "line-through opacity-60" : "",
              ].join(" ")}
            >
              {label}
              {out && (
                <span className="sr-only">
                  {" "}
                  — {t(locale, "out of stock", "স্টক নেই")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected &&
        rows.find((row) => row.id === selected)?.inStock === false && (
          <a
            href="#back-in-stock"
            className="mt-3 inline-flex min-h-11 items-center text-sm underline"
          >
            {str("notifyLabel") || t(locale, "Notify me", "জানাবেন")}
          </a>
        )}
    </section>
  );
};

/* ------------------------------------------------------------ size_guide */

const SizeGuide: WidgetComponent = (ctx) => {
  const { str, int, locale } = ctx;
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<SizeUnit>(
    str("unit") === "in" ? "in" : "cm",
  );

  const columns = [1, 2, 3]
    .map((n) => ({ key: `c${n}`, label: str(`c${n}Label`) }))
    .filter((column) => column.label);
  const rows = [1, 2, 3, 4]
    .map((n) => ({
      key: `r${n}`,
      label: str(`r${n}Label`),
      cells: Object.fromEntries(
        columns.map((column, ci) => [
          column.key,
          <span key={column.key} className="tabular-nums">
            {convertCm(int(`r${n}c${ci + 1}`, 0, 0, 400), unit)}
          </span>,
        ]),
      ),
    }))
    .filter((row) => row.label);

  return (
    <section id="size-guide">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-4 text-sm"
      >
        {str("openLabel") || t(locale, "Size guide", "সাইজ গাইড")}
      </button>
      <OverlayHost
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        title={str("heading") || t(locale, "Size guide", "সাইজ গাইড")}
      >
        <div className="mb-3">
          <UnitToggle
            unit={unit}
            onChange={setUnit}
            label={t(locale, "Units", "একক")}
          />
        </div>
        <DataTable
          caption={str("heading")}
          columns={columns}
          rows={rows}
          stickyFirstColumn
        />
        {str("note") && (
          <p className="mt-3 text-xs text-muted-foreground">{str("note")}</p>
        )}
      </OverlayHost>
    </section>
  );
};

/* -------------------------------------------------------------- fit_note */

const FIT_LABELS: Record<string, { en: string; bn: string }> = {
  small: {
    en: "Runs small — consider sizing up",
    bn: "একটু ছোট — বড় সাইজ নিন",
  },
  true: { en: "True to size", bn: "সঠিক মাপ" },
  large: {
    en: "Runs large — consider sizing down",
    bn: "একটু বড় — ছোট সাইজ নিন",
  },
};

const FitNote: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const fit = FIT_LABELS[str("fit")] ?? FIT_LABELS["true"]!;
  return (
    <p className="rounded-fq-md border border-border bg-muted/40 p-3 text-sm">
      <span className="font-medium">{t(locale, fit.en, fit.bn)}</span>
      {str("note") && (
        <span className="text-muted-foreground"> · {str("note")}</span>
      )}
      {(str("modelHeight") || str("modelSize")) && (
        <span className="block text-xs text-muted-foreground">
          {t(locale, "Model", "মডেল")}: {str("modelHeight")}{" "}
          {str("modelSize") && `· ${str("modelSize")}`}
        </span>
      )}
    </p>
  );
};

/* --------------------------------------------------------- back_in_stock */

const BackInStock: WidgetComponent = (ctx) => {
  const { str, data, locale, section } = ctx;
  const rows = sizeRows(data?.rows).filter((row) => row.inStock === false);
  return (
    <section
      id="back-in-stock"
      className="rounded-fq-md border border-border bg-card p-4"
    >
      <p className="text-sm font-semibold">{str("heading")}</p>
      {str("body") && (
        <p className="mt-1 text-sm text-muted-foreground">{str("body")}</p>
      )}
      <form
        className="mt-3 flex flex-wrap gap-2"
        method="post"
        action="#back-in-stock"
      >
        {rows.length > 0 && (
          <>
            <label className="sr-only" htmlFor={`bis-variant-${section.id}`}>
              {t(locale, "Size", "সাইজ")}
            </label>
            <select
              id={`bis-variant-${section.id}`}
              name="variantId"
              className="min-h-11 rounded-fq-md border border-border px-3 text-sm"
            >
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.options ?? row.title}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="sr-only" htmlFor={`bis-email-${section.id}`}>
          {t(locale, "Email address", "ইমেইল ঠিকানা")}
        </label>
        <input
          id={`bis-email-${section.id}`}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="min-h-11 min-w-[14rem] flex-1 rounded-fq-md border border-border px-3 text-sm"
        />
        <button
          type="submit"
          className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {str("buttonLabel") || t(locale, "Notify me", "জানাবেন")}
        </button>
      </form>
      <ConsentChip
        props={{ consentText: str("consentText") }}
        locale={locale}
      />
    </section>
  );
};

/* ------------------------------------------------------------ care_panel */

const CarePanel: WidgetComponent = (ctx) => {
  const { str, bool, locale } = ctx;
  return (
    <Disclosure
      summary={str("heading") || t(locale, "Material & care", "উপাদান ও যত্ন")}
      defaultOpen={bool("open")}
      tone="card"
    >
      <dl className="m-0 space-y-2 text-sm">
        {str("composition") && (
          <div>
            <dt className="font-medium">
              {t(locale, "Composition", "উপাদান")}
            </dt>
            <dd className="m-0 text-muted-foreground">{str("composition")}</dd>
          </div>
        )}
        {str("care") && (
          <div>
            <dt className="font-medium">{t(locale, "Care", "যত্ন")}</dt>
            <dd className="m-0 whitespace-pre-line text-muted-foreground">
              {str("care")}
            </dd>
          </div>
        )}
        {str("origin") && (
          <div>
            <dt className="font-medium">{t(locale, "Made in", "তৈরি")}</dt>
            <dd className="m-0 text-muted-foreground">{str("origin")}</dd>
          </div>
        )}
      </dl>
    </Disclosure>
  );
};

/* ---------------------------------------------------------- sustain_badge */

const SustainBadge: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const claims = [1, 2, 3]
    .map((n) => ({ label: str(`c${n}Label`), source: str(`c${n}Source`) }))
    .filter((claim) => claim.label);
  if (claims.length === 0) return null;
  return (
    <section
      aria-label={str("heading") || t(locale, "Sustainability", "টেকসইতা")}
    >
      {str("heading") && (
        <p className="mb-2 text-sm font-medium">{str("heading")}</p>
      )}
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {claims.map((claim) => (
          <li key={claim.label}>
            <span
              className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs"
              title={claim.source || undefined}
            >
              {claim.label}
            </span>
            {claim.source && <span className="sr-only"> — {claim.source}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

/* ------------------------------------------------------ complete_the_look */

const CompleteTheLook: WidgetComponent = (ctx) => {
  const { str, int, data, locale, Heading } = ctx;
  const limit = int("limit", 4, 2, 6);
  const rows = (data?.rows ?? []).slice(0, limit);
  const label = str("heading") || t(locale, "Complete the look", "পুরো লুক");
  return (
    <section aria-label={label}>
      <Heading className="mb-3 text-lg font-semibold">{label}</Heading>
      <Rail label={label}>
        {data?.pending
          ? Array.from({ length: limit }, (_, i) => (
              <ProductCardSkeleton key={i} variant="compact" />
            ))
          : rows.map((row) => (
              <ProductCard
                key={row.id}
                row={row}
                locale={locale}
                variant="compact"
              />
            ))}
      </Rail>
      {rows.length > 0 && (
        <form method="post" action="#complete-the-look" className="mt-3">
          {rows.map((row) => (
            <input key={row.id} type="hidden" name="variantId" value={row.id} />
          ))}
          <button
            type="submit"
            className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {str("buttonLabel") || t(locale, "Add all", "সব যোগ করুন")}
          </button>
        </form>
      )}
    </section>
  );
};

/* -------------------------------------------------------- wishlist_button */

const WishlistButton: WidgetComponent = (ctx) => {
  const { str, bool, locale, storeSlug } = ctx;
  const { ids, toggle } = useSectionChannel(storeSlug ?? "preview", "wishlist");
  const id = str("productId") || ctx.section.id;
  const saved = ids.includes(id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => toggle(id)}
      className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border px-4 text-sm"
    >
      <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
      {saved
        ? str("savedLabel") || t(locale, "Saved", "সংরক্ষিত")
        : str("addLabel") || t(locale, "Save", "সংরক্ষণ")}
      {bool("showCount") && ids.length > 0 && (
        <span className="tabular-nums text-muted-foreground">
          ({ids.length})
        </span>
      )}
    </button>
  );
};

/* --------------------------------------------------- circle_categories */

const CircleCategories: WidgetComponent = ({ str, Heading }) => {
  const heading = str("heading");
  const categories = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) => ({
      title: str(`c${n}Title`),
      imageUrl: str(`c${n}Image`),
      href: str(`c${n}Href`) || "#",
    }))
    .filter((c) => c.title);

  if (categories.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
      {heading && (
        <div className="flex items-center justify-center text-center">
          <Heading className="text-xl font-bold tracking-tight text-foreground font-theme-display text-center">
            {heading}
          </Heading>
        </div>
      )}
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 pt-1 sm:grid sm:grid-cols-4 md:grid-cols-8 sm:gap-4 sm:overflow-visible sm:p-0">
        {categories.map((c, idx) => (
          <a
            key={idx}
            href={c.href}
            className="group flex flex-col items-center text-center snap-start shrink-0 w-20 sm:w-auto transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="relative size-18 sm:size-22 md:size-24 rounded-full overflow-hidden p-0.5 ring-2 ring-primary/30 ring-offset-2 ring-offset-background transition-all duration-300 group-hover:ring-primary group-hover:shadow-md bg-muted">
              {c.imageUrl ? (
                <img
                  src={c.imageUrl}
                  // Decorative: the adjacent label names the link, so a
                  // titled alt would announce "Women Women".
                  alt=""
                  className="size-full rounded-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
              ) : (
                <div className="size-full rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-base sm:text-lg">
                  {c.title.charAt(0)}
                </div>
              )}
            </div>
            <span className="mt-2.5 text-xs font-semibold text-foreground tracking-tight line-clamp-2 leading-tight group-hover:text-primary transition-colors">
              {c.title}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
};

/* -------------------------------------------------- subbrand_spotlight */

const SubbrandSpotlight: WidgetComponent = ({ str, Heading, locale }) => {
  const heading = str("heading");
  const subheading = str("subheading");
  const brands = [1, 2, 3, 4]
    .map((n) => ({
      name: str(`b${n}Name`),
      tagline: str(`b${n}Tagline`),
      imageUrl: str(`b${n}Image`),
      href: str(`b${n}Href`) || "#",
    }))
    .filter((b) => b.name);

  if (brands.length === 0) return null;

  return (
    <section className="space-y-4 py-6">
      {(heading || subheading) && (
        <div className="mx-auto mb-6 max-w-xl space-y-1 text-center">
          {heading && (
            <Heading className="font-theme-display text-2xl font-bold tracking-tight text-foreground">
              {heading}
            </Heading>
          )}
          {subheading && (
            <p className="text-xs text-muted-foreground tracking-wider fq-caps">
              {subheading}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {brands.map((b, idx) => (
          <a
            key={idx}
            href={b.href}
            className="group block overflow-hidden rounded-fq-lg border border-border bg-card shadow-fq-sm transition-all duration-300 hover:border-primary/50 hover:shadow-fq-md"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
              {b.imageUrl ? (
                <img
                  src={b.imageUrl}
                  // Decorative: the card label below names the brand.
                  alt=""
                  className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-primary/10">
                  <span className="font-theme-display text-2xl font-bold tracking-widest text-primary">
                    {b.name}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-1.5 p-4">
              <p className="font-theme-display text-base font-bold tracking-wide text-foreground transition-colors group-hover:text-primary">
                {b.name}
              </p>
              {b.tagline && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {b.tagline}
                </p>
              )}
              <div className="flex items-center gap-1 pt-1 text-xs font-semibold text-primary fq-caps transition-transform group-hover:translate-x-1">
                <span>{t(locale, "Explore Collection", "কালেকশন দেখুন")}</span>
                <span aria-hidden="true">→</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

/* -------------------------------------------------------- rewards_club */

const RewardsClub: WidgetComponent = (ctx) => {
  const { str, Heading, locale } = ctx;
  const tiers = [
    { name: str("tier1Name"), points: str("tier1Points") },
    { name: str("tier2Name"), points: str("tier2Points") },
    { name: str("tier3Name"), points: str("tier3Points") },
  ].filter((tier) => tier.name);
  return (
    <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
      <Eyebrow text={t(locale, "Membership", "সদস্যপদ")} />
      <Heading className="font-bangla-display text-2xl font-bold">
        {str("heading") || t(locale, "My Rewards", "আমার রিওয়ার্ড")}
      </Heading>
      {str("body") && (
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {str("body")}
        </p>
      )}
      {tiers.length > 0 && (
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {tiers.map((tier) => (
            <li
              key={tier.name}
              className="rounded-fq-md border border-border bg-background p-4"
            >
              <p className="text-sm font-semibold">{tier.name}</p>
              {tier.points && (
                <p className="money mt-1 text-xs text-muted-foreground">
                  {tier.points}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <Cta label={str("buttonLabel")} href={str("buttonHref")} />
    </section>
  );
};

/* -------------------------------------------------------- wedding_shop */

const WeddingShop: WidgetComponent = (ctx) => {
  const { str, Heading } = ctx;
  const collections = [
    { name: str("c1Name"), href: str("c1Href") },
    { name: str("c2Name"), href: str("c2Href") },
    { name: str("c3Name"), href: str("c3Href") },
  ].filter((c) => c.name);
  return (
    <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
      <Heading className="font-bangla-display text-2xl font-bold">
        {str("heading")}
      </Heading>
      {str("body") && (
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {str("body")}
        </p>
      )}
      {collections.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {collections.map((c) => (
            <a
              key={c.name}
              href={c.href || "#"}
              className="group rounded-fq-md border border-border bg-background p-4 transition-colors hover:border-primary/40"
            >
              <p className="text-sm font-semibold">{c.name}</p>
              <p aria-hidden="true" className="mt-2 text-primary">
                →
              </p>
            </a>
          ))}
        </div>
      )}
      <Cta label={str("buttonLabel")} href={str("buttonHref")} />
    </section>
  );
};

/* -------------------------------------------------------- gift_finder */

const GiftFinder: WidgetComponent = (ctx) => {
  const { str, Heading } = ctx;
  const occasions = [
    { label: str("o1Label"), query: str("o1Query") },
    { label: str("o2Label"), query: str("o2Query") },
    { label: str("o3Label"), query: str("o3Query") },
  ].filter((o) => o.label);
  return (
    <section className="rounded-fq-lg border border-border bg-card p-6 sm:p-8">
      <Heading className="font-bangla-display text-2xl font-bold">
        {str("heading")}
      </Heading>
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
              href={`/search?q=${encodeURIComponent(o.query || "")}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:border-primary/40"
            >
              {o.label}
            </a>
          ))}
        </div>
      )}
      <Cta label={str("buttonLabel")} href={str("buttonHref")} />
    </section>
  );
};

export const APPAREL_WIDGETS: Record<
  Extract<
    SectionType,
    | "editorial_hero"
    | "lookbook"
    | "shoppable_image"
    | "split_feature"
    | "collection_story"
    | "ugc_gallery"
    | "social_strip"
    | "store_locator"
    | "size_selector"
    | "size_guide"
    | "fit_note"
    | "back_in_stock"
    | "care_panel"
    | "sustain_badge"
    | "complete_the_look"
    | "wishlist_button"
    | "circle_categories"
    | "subbrand_spotlight"
    | "rewards_club"
    | "wedding_shop"
    | "gift_finder"
  >,
  WidgetComponent
> = {
  editorial_hero: EditorialHero,
  lookbook: Lookbook,
  shoppable_image: ShoppableImage,
  split_feature: SplitFeature,
  collection_story: CollectionStory,
  ugc_gallery: UgcGallery,
  social_strip: SocialStrip,
  store_locator: StoreLocator,
  size_selector: SizeSelector,
  size_guide: SizeGuide,
  fit_note: FitNote,
  back_in_stock: BackInStock,
  care_panel: CarePanel,
  sustain_badge: SustainBadge,
  complete_the_look: CompleteTheLook,
  wishlist_button: WishlistButton,
  circle_categories: CircleCategories,
  subbrand_spotlight: SubbrandSpotlight,
  rewards_club: RewardsClub,
  wedding_shop: WeddingShop,
  gift_finder: GiftFinder,
};

export { TileSkeleton };
