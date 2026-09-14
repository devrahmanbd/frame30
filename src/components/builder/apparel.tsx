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
import { UnitToggle, convertCm, type SizeUnit } from "./primitives/UnitToggle";
import { useSectionChannel } from "./useSectionChannel";
import { altKey, sizesAttr, sizesKey } from "@/lib/media";

function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

function Eyebrow({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mb-2 text-[11px] fq-caps tracking-[0.16em] text-muted-foreground">{text}</p>
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

function TileSkeleton({ count = 4, ratio = "aspect-[3/4]" }: { count?: number; ratio?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${ratio} animate-pulse rounded-fq-md bg-muted`} aria-hidden="true" />
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
    <div className={split ? "" : "rounded-fq-lg border border-border bg-card p-6 shadow-fq-sm"}>
      <Eyebrow text={str("eyebrow")} />
      <Heading className="text-3xl font-semibold leading-tight md:text-5xl">{str("heading")}</Heading>
      {str("body") && <p className="mt-3 max-w-prose text-sm text-muted-foreground">{str("body")}</p>}
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
      <div className="relative -mt-16 px-4 md:-mt-24 md:max-w-md md:px-8">{copy}</div>
    </section>
  );
};

/* -------------------------------------------------------------- lookbook */

const Lookbook: WidgetComponent = (ctx) => {
  const { str, bool, Heading } = ctx;
  const offset = bool("offset");
  const tiles = [1, 2, 3, 4]
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
      {str("heading") && <Heading className="mb-4 text-lg font-semibold">{str("heading")}</Heading>}
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile, index) => {
          const body = (
            <MediaFrame src={tile.src} alt={tile.alt} ratio={tile.ratio} className="rounded-fq-md" eager={index === 0} />
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
    <section aria-label={str("heading") || t(locale, "Shop the look", "লুক কিনুন")}>
      {str("heading") && <Heading className="mb-3 text-lg font-semibold">{str("heading")}</Heading>}
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
                label={t(locale, `Show ${pin.row.title}`, `${pin.row.title} দেখুন`)}
              >
                <a href={pin.row.href ?? "#"} className="flex items-center gap-2">
                  <MediaFrame
                    src={pin.row.imageUrl}
                    alt=""
                    ratio="square"
                    className="w-14 shrink-0 rounded-fq-sm"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{pin.row.title}</span>
                    {pin.row.priceMinor !== undefined && (
                      <span className="block text-xs tabular-nums text-muted-foreground">
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
        {str("body") && <p className="mt-3 max-w-prose text-sm text-muted-foreground">{str("body")}</p>}
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
      {bool("scrim") && <div aria-hidden="true" className="absolute inset-0 bg-foreground/40" />}
      <div className="absolute inset-0 flex items-end p-6 md:p-10">
        <div className="max-w-xl text-background">
          <Eyebrow text={str("eyebrow")} />
          <Heading className="text-2xl font-semibold md:text-4xl">{str("heading")}</Heading>
          {str("body") && <p className="mt-3 text-sm opacity-90">{str("body")}</p>}
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
    <section aria-label={str("heading") || t(locale, "Customer gallery", "ক্রেতাদের ছবি")}>
      {str("heading") && <Heading className="mb-3 text-lg font-semibold">{str("heading")}</Heading>}
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {data?.pending
          ? Array.from({ length: limit }, (_, i) => (
              <li key={i}>
                <div className="aspect-square animate-pulse rounded-fq-md bg-muted" aria-hidden="true" />
              </li>
            ))
          : rows.map((row) => (
              <li key={row.id}>
                <a href={row.href ?? "#"}>
                  <MediaFrame src={row.imageUrl} alt={row.title} ratio="square" className="rounded-fq-md" />
                </a>
              </li>
            ))}
      </ul>
      {str("note") && <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p>}
    </section>
  );
};

/* ---------------------------------------------------------- social_strip */

const SocialStrip: WidgetComponent = (ctx) => {
  const { str, Heading } = ctx;
  const images = [1, 2, 3, 4, 5, 6].map((n) => str(`i${n}Image`)).filter(Boolean);
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
          <MediaFrame key={i} src={src} alt="" ratio="square" className="w-40 rounded-fq-md" />
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
    <section aria-label={str("heading") || t(locale, "Stores", "দোকান")}>
      {str("heading") && <Heading className="mb-3 text-lg font-semibold">{str("heading")}</Heading>}
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <li key={store.name} className="rounded-fq-md border border-border bg-card p-4">
            <p className="text-sm font-semibold">{store.name}</p>
            {store.address && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{store.address}</p>
            )}
            {store.hours && <p className="mt-1 text-xs text-muted-foreground">{store.hours}</p>}
            {store.phone && (
              <a href={`tel:${store.phone}`} className="mt-2 inline-flex min-h-11 items-center text-sm underline">
                {store.phone}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

/* --------------------------------------------------------- size_selector */

/** Variant rows whose option path looks like a size, in catalogue order. */
export function sizeRows(rows: WidgetRow[] | undefined): WidgetRow[] {
  return (rows ?? []).filter((row) => (row.options ?? row.title).trim().length > 0);
}

const SizeSelector: WidgetComponent = (ctx) => {
  const { str, data, locale } = ctx;
  const [selected, setSelected] = useState<string | null>(null);
  const rows = sizeRows(data?.rows);

  if (data?.pending) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-11 w-14 animate-pulse rounded-fq-md bg-muted" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(locale, "Sizes appear once the product is connected.", "পণ্য যুক্ত হলে সাইজ দেখা যাবে।")}
      </p>
    );
  }

  return (
    <section aria-label={str("heading") || t(locale, "Size", "সাইজ")}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">{str("heading") || t(locale, "Size", "সাইজ")}</p>
        {str("guideLabel") && (
          <a href="#size-guide" className="text-sm underline">
            {str("guideLabel")}
          </a>
        )}
      </div>
      <div role="radiogroup" aria-label={str("heading") || "Size"} className="flex flex-wrap gap-2">
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
                "min-h-11 min-w-11 rounded-fq-md border px-3 text-sm",
                selected === row.id ? "border-primary bg-primary text-primary-foreground" : "border-border",
                out ? "line-through opacity-60" : "",
              ].join(" ")}
            >
              {label}
              {out && <span className="sr-only"> — {t(locale, "out of stock", "স্টক নেই")}</span>}
            </button>
          );
        })}
      </div>
      {selected && rows.find((row) => row.id === selected)?.inStock === false && (
        <a href="#back-in-stock" className="mt-3 inline-flex min-h-11 items-center text-sm underline">
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
  const [unit, setUnit] = useState<SizeUnit>(str("unit") === "in" ? "in" : "cm");

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
          <UnitToggle unit={unit} onChange={setUnit} label={t(locale, "Units", "একক")} />
        </div>
        <DataTable
          caption={str("heading")}
          columns={columns}
          rows={rows}
          stickyFirstColumn
        />
        {str("note") && <p className="mt-3 text-xs text-muted-foreground">{str("note")}</p>}
      </OverlayHost>
    </section>
  );
};

/* -------------------------------------------------------------- fit_note */

const FIT_LABELS: Record<string, { en: string; bn: string }> = {
  small: { en: "Runs small — consider sizing up", bn: "একটু ছোট — বড় সাইজ নিন" },
  true: { en: "True to size", bn: "সঠিক মাপ" },
  large: { en: "Runs large — consider sizing down", bn: "একটু বড় — ছোট সাইজ নিন" },
};

const FitNote: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const fit = FIT_LABELS[str("fit")] ?? FIT_LABELS["true"]!;
  return (
    <p className="rounded-fq-md border border-border bg-muted/40 p-3 text-sm">
      <span className="font-medium">{t(locale, fit.en, fit.bn)}</span>
      {str("note") && <span className="text-muted-foreground"> · {str("note")}</span>}
      {(str("modelHeight") || str("modelSize")) && (
        <span className="block text-xs text-muted-foreground">
          {t(locale, "Model", "মডেল")}: {str("modelHeight")} {str("modelSize") && `· ${str("modelSize")}`}
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
    <section id="back-in-stock" className="rounded-fq-md border border-border bg-card p-4">
      <p className="text-sm font-semibold">{str("heading")}</p>
      {str("body") && <p className="mt-1 text-sm text-muted-foreground">{str("body")}</p>}
      <form className="mt-3 flex flex-wrap gap-2" method="post" action="#back-in-stock">
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
      <ConsentChip props={{ consentText: str("consentText") }} locale={locale} />
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
            <dt className="font-medium">{t(locale, "Composition", "উপাদান")}</dt>
            <dd className="m-0 text-muted-foreground">{str("composition")}</dd>
          </div>
        )}
        {str("care") && (
          <div>
            <dt className="font-medium">{t(locale, "Care", "যত্ন")}</dt>
            <dd className="m-0 whitespace-pre-line text-muted-foreground">{str("care")}</dd>
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
    <section aria-label={str("heading") || t(locale, "Sustainability", "টেকসইতা")}>
      {str("heading") && <p className="mb-2 text-sm font-medium">{str("heading")}</p>}
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
          ? Array.from({ length: limit }, (_, i) => <ProductCardSkeleton key={i} variant="compact" />)
          : rows.map((row) => (
              <ProductCard key={row.id} row={row} locale={locale} variant="compact" />
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
      {saved ? str("savedLabel") || t(locale, "Saved", "সংরক্ষিত") : str("addLabel") || t(locale, "Save", "সংরক্ষণ")}
      {bool("showCount") && ids.length > 0 && (
        <span className="tabular-nums text-muted-foreground">({ids.length})</span>
      )}
    </button>
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
};

export { TileSkeleton };
