import { useEffect, useReducer, useState } from "react";
import type {
  Breakpoint,
  PropValue,
  Section,
  SectionType,
  TemplateKey,
} from "@/lib/builder-ast";
import { resolveProps, resolveSkin, safeEmbedUrl } from "@/lib/builder-ast";
import { bnKey, textOf, type Locale } from "@/lib/bitext";
import { formatDisplayMoney, formatDisplayNumber } from "@/lib/money-display";
import type { WidgetRow } from "@/lib/widget-data";
import {
  flowReducer,
  flowResultUrl,
  canAdvance,
  progressOf,
  startFlow,
  type FlowStep,
} from "@/lib/flow-machine";
import { quoteBundle } from "@/lib/bundle-quote.functions";
import { ConsentChip } from "./primitives/ConsentChip";
import { Disclosure, Tabs } from "./primitives/Disclosure";
import { MediaFrame } from "./primitives/MediaFrame";
import { OverlayHost } from "./primitives/OverlayHost";
import { useSectionChannel } from "./useSectionChannel";
import { HtmlSandbox } from "./HtmlSandbox";
import { PluginBlock } from "./PluginBlock";
import { CHROME_WIDGETS } from "./chrome";
import { PDP_WIDGETS } from "./pdp";
import { COLLECTION_WIDGETS } from "./collection";
import { CART_WIDGETS } from "./cart";
import { ACCOUNT_WIDGETS } from "./account";
import { MERCH_WIDGETS, cardVariantOf } from "./merch";
import { APPAREL_WIDGETS } from "./apparel";
import { BEAUTY_WIDGETS } from "./beauty";
import { BEAUTY_HOME_WIDGETS } from "./beauty-home";
import { CIRCUIT_WIDGETS } from "./electronics";
import { BASIC_WIDGETS } from "./basics";
import { BLOG_WIDGETS } from "./blog";
import { HERITAGE_WIDGETS } from "./heritage";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import { SOMVABONA_WIDGETS } from "./somvabona";
import {
  ProductCard,
  ProductCardSkeleton,
  type CardVariant,
} from "./primitives/ProductCard";

/**
 * Phase 0.2 — one renderer per widget, addressed by a closed map.
 *
 * Every component here takes the same `WidgetCtx` and returns markup. None of
 * them may import a theme module: widgets read design tokens through CSS
 * variables and semantic utility classes only, which is what keeps one widget
 * set usable by Bazaar, Atelier, Circuit and Rupaboti alike. A test enforces it.
 */
export type WidgetCtx = {
  section: Section;
  str: (key: string) => string;
  bool: (key: string) => boolean;
  int: (key: string, fallback: number, min: number, max: number) => number;
  /** Phase 1.2: integer minor units → localised money string. Never divide. */
  money: (
    minor: number | string | null | undefined,
    currency?: string,
  ) => string;
  /** Rebase a root-relative store URL (like `/c/new-in`) for the current host environment. */
  link: (href: string) => string;
  /** `h1` when this node owns the page's primary heading, else `h2`. */
  Heading: "h1" | "h2";
  primary: boolean;
  editing: boolean;
  device?: Breakpoint;
  /** Phase 1.1: the language this render is for. Drives `str` and numerals. */
  locale: Locale;
  template?: TemplateKey;
  /**
   * Store the render belongs to. Namespaces the cross-section channel and is
   * the slug the bundle/total contract quotes against. Absent in the studio.
   */
  storeSlug?: string;

  /** Host-supplied live data for context widgets. */
  slot?: React.ReactNode;
  productSlot?: React.ReactNode;
  collectionSlot?: React.ReactNode;
  /**
   * Phase 0.3: rows resolved for this node by the single batched data call.
   * `pending` is true while that call is in flight, which is when a data
   * widget must render its box-model-identical skeleton.
   */
  data?: { rows?: WidgetRow[]; pending: boolean };
  /** Renders this node's children (containers only). */
  renderChildren: () => React.ReactNode;
  /**
   * Phase 0.5: editor-only inline text commit. Present only in the studio
   * canvas; the storefront never passes it, so published markup stays static.
   */
  inlineEdit?: (key: string, value: string) => void;
};

/**
 * Text that can be typed straight on the canvas when the studio supplies
 * `inlineEdit`. Outside the editor it renders as plain text.
 *
 * Phase 1.1: editing while the canvas is in বাংলা writes the `_bn` sibling, so
 * a merchant translates in place instead of hunting for the field.
 */
export function Editable({
  as: Tag = "span",
  value,
  field,
  ctx,
  className,
}: {
  as?: keyof React.JSX.IntrinsicElements;
  value: string;
  field: string;
  ctx: Pick<WidgetCtx, "editing" | "inlineEdit"> & { locale?: Locale };

  className?: string;
}) {
  const editable = ctx.editing && !!ctx.inlineEdit;
  const target = ctx.locale === "bn" ? bnKey(field) : field;
  const Component = Tag as React.ElementType;
  return (
    <Component
      className={[
        className,
        editable ? "outline-none focus:ring-2 focus:ring-primary" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...(editable
        ? {
            contentEditable: true,
            suppressContentEditableWarning: true,
            role: "textbox",
            tabIndex: 0,
            spellCheck: false,
            onClick: (event: React.MouseEvent) => event.stopPropagation(),
            onBlur: (event: React.FocusEvent<HTMLElement>) =>
              ctx.inlineEdit?.(target, event.currentTarget.textContent ?? ""),
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
              if (event.key === "Escape") event.currentTarget.blur();
            },
          }
        : {})}
    >
      {value}
    </Component>
  );
}

export type WidgetComponent = (ctx: WidgetCtx) => React.ReactNode;

/**
 * Reads resolved props for one node. `str` is locale-aware: when the prop has
 * a বাংলা sibling it resolves through the bilingual fallback chain, so widget
 * code never branches on language.
 */
export function widgetReader(
  section: Section,
  device?: Breakpoint,
  locale: Locale = "en",
) {
  const props: Record<string, PropValue> = resolveProps(section, device);
  return {
    str(key: string) {
      if (bnKey(key) in props) return textOf(props, key, locale);
      const value = props[key];
      return typeof value === "string" ? value : "";
    },
    bool(key: string) {
      return props[key] === true;
    },
    int(key: string, fallback: number, min: number, max: number) {
      const value = props[key];
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.trunc(n)));
    },
    money(minor: number | string | null | undefined, currency = "BDT") {
      return formatDisplayMoney(minor, { locale, currency });
    },
  };
}

/**
 * Shared renderer for every `collection`/`taxonomy` sourced widget. The
 * skeleton is box-model identical to the loaded state — same grid, same
 * aspect ratio, same text line heights — so hydration never shifts layout.
 */
function DataGrid({
  rows,
  pending,
  cols,
  ratio,
  locale,
  withPrice = false,
  variant,
  promise,
  showRating = false,
  showCount = true,
  density = "comfortable",
}: {
  rows?: WidgetRow[];
  pending: boolean;
  cols: number;
  ratio: "square" | "landscape";
  locale: Locale;
  withPrice?: boolean;
  /** Phase 2.2: grids render the one shared ProductCard. */
  variant?: CardVariant;
  promise?: string;
  showRating?: boolean;
  showCount?: boolean;
  density?: "comfortable" | "compact";
}) {
  const cardVariant: CardVariant =
    variant ?? (ratio === "landscape" ? "wide" : "standard");
  const grid = `${COLUMN_CLASS[cols] ?? COLUMN_CLASS[4]} ${density === "compact" ? "gap-2" : "gap-4"}`;
  if (pending || rows === undefined) {
    return (
      <ul className={grid} aria-hidden="true">
        {Array.from({ length: cols * 2 }, (_, i) => (
          <li key={i}>
            <ProductCardSkeleton variant={cardVariant} withPrice={withPrice} />
          </li>
        ))}
      </ul>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing to show here yet.</p>
    );
  }
  return (
    <ul className={grid}>
      {rows.map((row) => (
        <li key={row.id} className="h-full">
          <ProductCard
            row={row}
            locale={locale}
            variant={cardVariant}
            withPrice={withPrice}
            promise={promise}
            showRating={showRating}
          />
          {showCount && typeof row.count === "number" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDisplayNumber(row.count, { locale })}{" "}
              {locale === "bn" ? "পণ্য" : "items"}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Container column counts are a closed set so Tailwind can see the classes. */
const COLUMN_CLASS: Record<number, string> = {
  1: "grid grid-cols-1",
  2: "grid grid-cols-1 sm:grid-cols-2",
  3: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid grid-cols-2 lg:grid-cols-4",
};

function Countdown({
  endsAt,
  label,
  locale = "en",
}: {
  endsAt: string;
  label: string;
  locale?: Locale;
}) {
  const [left, setLeft] = useState<number>(
    () => Date.parse(endsAt) - Date.now(),
  );
  // Reduced motion gets the end time as text instead of a ticking clock.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setLeft(Date.parse(endsAt) - Date.now()),
      1000,
    );
    return () => clearInterval(id);
  }, [endsAt, reduced]);
  if (!Number.isFinite(left)) return null;
  const clamped = Math.max(0, left);
  if (reduced) {
    const ends = new Date(Date.parse(endsAt));
    return (
      <p className="rounded-fq-md border border-border bg-card px-4 py-2 text-sm">
        <span className="font-medium">{label}</span>{" "}
        <time dateTime={ends.toISOString()}>
          {ends.toLocaleString(locale === "bn" ? "bn-BD" : "en-GB")}
        </time>
      </p>
    );
  }
  const parts = [
    Math.floor(clamped / 86_400_000),
    Math.floor(clamped / 3_600_000) % 24,
    Math.floor(clamped / 60_000) % 60,
    Math.floor(clamped / 1000) % 60,
  ];
  return (
    <p className="rounded-fq-md border border-border bg-card px-4 py-2 text-sm tabular-nums">
      <span className="font-medium">{label}</span>{" "}
      <span aria-live="off">
        {parts.map((p) => String(p).padStart(2, "0")).join(":")}
      </span>
    </p>
  );
}

/** AST v3 containers own a subtree; the host renders children back into us. */
const Container: WidgetComponent = ({
  section,
  str,
  int,
  editing,
  renderChildren,
}) => {
  const columns = int("columns", 1, 1, 4);
  const width = str("maxW");
  const background = str("bg");
  const padY = int("padY", 0, 0, 160);
  const kids = section.children ?? [];
  return (
    <section
      className={[
        "w-full",
        width === "narrow"
          ? "mx-auto max-w-3xl"
          : width === "full"
            ? ""
            : "mx-auto max-w-[var(--theme-container,1200px)]",
        background === "surface"
          ? "bg-card"
          : background === "muted"
            ? "bg-muted"
            : "",
        str("align") === "center" ? "text-center" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ paddingTop: padY, paddingBottom: padY }}
    >
      <div
        className={COLUMN_CLASS[columns]}
        style={{ gap: int("gap", 24, 0, 64) }}
      >
        {renderChildren()}
      </div>
      {editing && kids.length === 0 && (
        <p className="rounded-fq-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Empty container — drag widgets in.
        </p>
      )}
    </section>
  );
};

/** Context widgets render host-supplied live data with an optional heading. */
const ContextSlot: WidgetComponent = ({ str, Heading, slot }) =>
  str("heading") ? (
    <section>
      <Heading className="mb-3 text-lg font-semibold">{str("heading")}</Heading>
      {slot}
    </section>
  ) : (
    <>{slot}</>
  );

/**
 * Phase 2.3 — product gallery. Authored images render as a swipeable,
 * keyboard-navigable gallery with thumbnails and tap-to-zoom; with no authored
 * images the host slot (live PDP media) renders exactly as before. The first
 * frame is eager and `fetchPriority="high"` because it is the PDP's LCP.
 *
 * Sliders lane: prev/next steppers (44px, bilingual), arrow-key navigation on
 * the carousel region, a polite live position announcement, token-only
 * surfaces, and zoom that animates only under `motion-safe` so reduced-motion
 * users get an instant, non-animated toggle.
 */
const ProductMedia: WidgetComponent = (ctx) => {
  const { str, bool, locale, slot } = ctx;
  const images = ["image1", "image2", "image3", "image4"]
    .map((k) => str(k))
    .filter(Boolean);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  if (images.length === 0) return <ContextSlot {...ctx} />;
  const ratio = str("ratio") || "1/1";
  const active = Math.min(index, images.length - 1);
  const alt =
    str("altText") || (locale === "bn" ? "পণ্যের ছবি" : "Product image");
  const step = (delta: number) => {
    setIndex((i) => (i + delta + images.length) % images.length);
    setZoomed(false);
  };
  const prevLabel = locale === "bn" ? "আগের ছবি" : "Previous image";
  const nextLabel = locale === "bn" ? "পরের ছবি" : "Next image";
  const position = `${formatDisplayNumber(active + 1, { locale })} / ${formatDisplayNumber(images.length, { locale })}`;
  const stepperBtn =
    "absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-lg leading-none shadow transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
  return (
    <section
      aria-roledescription="carousel"
      aria-label={alt}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
        else if (e.key === "Home") {
          setIndex(0);
          setZoomed(false);
        } else if (e.key === "End") {
          setIndex(images.length - 1);
          setZoomed(false);
        }
      }}
    >
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${alt} ${position}`}
        className="relative overflow-hidden rounded-fq-lg border border-border bg-muted"
        style={{ aspectRatio: ratio }}
      >
        <button
          type="button"
          onClick={() => bool("zoom") && setZoomed((z) => !z)}
          aria-label={
            bool("zoom")
              ? zoomed
                ? locale === "bn"
                  ? "জুম বন্ধ"
                  : "Zoom out"
                : locale === "bn"
                  ? "জুম করুন"
                  : "Zoom in"
              : alt
          }
          className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          style={{
            cursor: bool("zoom") ? "zoom-in" : "default",
          }}
        >
          <img
            src={images[active]!}
            alt={`${alt} ${active + 1}`}
            loading={active === 0 ? "eager" : "lazy"}
            fetchPriority={active === 0 ? "high" : "auto"}
            decoding="async"
            className={`h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-300 ${zoomed ? "motion-safe:scale-150" : ""}`}
          />
        </button>
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={prevLabel}
              className={`${stepperBtn} left-2`}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={nextLabel}
              className={`${stepperBtn} right-2`}
            >
              <span aria-hidden="true">›</span>
            </button>
            <p
              aria-hidden="true"
              className="absolute bottom-2 right-2 rounded-full bg-foreground/70 px-2 py-1 text-xs tabular-nums text-background"
            >
              {position}
            </p>
          </>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {locale === "bn" ? `ছবি ${position}` : `Image ${position}`}
      </p>
      {bool("showThumbnails") && images.length > 1 && (
        <div
          role="group"
          aria-label={locale === "bn" ? "থাম্বনেইল" : "Thumbnails"}
          className="mt-2 flex gap-2 overflow-x-auto pb-1"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`${alt} ${i + 1}`}
              aria-current={i === active}
              onClick={() => {
                setIndex(i);
                setZoomed(false);
              }}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-fq-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                i === active
                  ? "border-primary ring-1 ring-primary"
                  : "border-border"
              }`}
            >
              <img
                src={src}
                alt=""
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

/* ------------------------- Phase 1 — primitive consumers ------------------- */

/**
 * Quiz / finder. All state lives in the pure flow machine; the only output is
 * a shareable filter URL, so a result is linkable and back-button safe.
 */
const QuizWidget: WidgetComponent = ({ str, bool, locale, Heading }) => {
  // The machine owns the steps; the question copy stays beside it so the
  // primitive keeps knowing nothing about presentation.
  const authored = [1, 2, 3]
    .map((i) => ({
      label: str(`q${i}Label`),
      step: {
        key: str(`q${i}Key`) || `q${i}`,
        choices: str(`q${i}Choices`)
          .split(",")
          .map((raw) => raw.trim())
          .filter(Boolean)
          .map((value) => ({ value, label: value })),
        multiple: bool(`q${i}Multiple`),
        required: true,
      } satisfies FlowStep,
    }))
    .filter((entry) => entry.label && entry.step.choices.length > 0);
  const steps: FlowStep[] = authored.map((entry) => entry.step);

  const [state, dispatch] = useReducer(
    (
      current: ReturnType<typeof startFlow>,
      event: Parameters<typeof flowReducer>[2],
    ) => flowReducer(steps, current, event),
    undefined,
    startFlow,
  );

  if (steps.length === 0) return null;
  const current = authored[Math.min(state.index, authored.length - 1)]!;
  const step = current.step;
  const picked = state.answers[step.key] ?? [];
  const progress = progressOf(steps, state);
  const resultUrl = flowResultUrl(str("resultBase") || "/", state.answers);

  return (
    <section className="rounded-fq-lg border border-border bg-card p-6">
      {str("heading") && (
        <Heading className="text-lg font-semibold">{str("heading")}</Heading>
      )}
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={locale === "bn" ? "অগ্রগতি" : "Progress"}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-fq-sm bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>

      <fieldset className="mt-4 border-0 p-0">
        <legend className="text-sm font-medium">{current.label}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {step.choices.map((choice) => {
            const active = picked.includes(choice.value);
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  dispatch({
                    kind: "answer",
                    step: step.key,
                    value: choice.value,
                  })
                }
                className={`rounded-fq-md border px-3 py-1.5 text-sm ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => dispatch({ kind: "back" })}
          disabled={state.index === 0}
          className="rounded-fq-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {locale === "bn" ? "পেছনে" : "Back"}
        </button>
        {state.done || state.index === steps.length - 1 ? (
          <a
            href={resultUrl}
            aria-disabled={!canAdvance(steps, state)}
            className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {str("resultLabel") || "See results"}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => dispatch({ kind: "next" })}
            disabled={!canAdvance(steps, state)}
            className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {locale === "bn" ? "পরবর্তী" : "Next"}
          </button>
        )}
      </div>
      <ConsentChip
        props={{ consentText: str("consentText") }}
        locale={locale}
      />
    </section>
  );
};

/** Recently viewed: order comes from the cross-section channel, rows from the batch. */
const RecentlyViewedWidget: WidgetComponent = ({
  str,
  int,
  bool,
  Heading,
  data,
  locale,
  storeSlug,
}) => {
  const limit = int("limit", 6, 1, 12);
  const { ids, clear } = useSectionChannel(
    storeSlug ?? "preview",
    "recentlyViewed",
  );
  const rows = data?.rows ?? [];
  const ordered = ids
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is WidgetRow => !!row)
    .slice(0, limit);
  if (data?.pending) {
    return (
      <DataGrid pending cols={4} ratio="square" locale={locale} withPrice />
    );
  }
  if (ordered.length === 0) return null;
  return (
    <section>
      {str("heading") && (
        <Heading className="mb-3 text-lg font-semibold">
          {str("heading")}
        </Heading>
      )}
      <DataGrid
        rows={ordered}
        pending={false}
        cols={4}
        ratio="square"
        locale={locale}
        withPrice
      />
      {bool("showClear") && (
        <button
          type="button"
          onClick={clear}
          className="mt-3 rounded-fq-md border border-border px-3 py-1.5 text-sm"
        >
          {locale === "bn" ? "মুছে ফেলুন" : "Clear"}
        </button>
      )}
    </section>
  );
};

/** Quick view: the one overlay host, so focus and scroll behaviour never drift. */
const QuickViewWidget: WidgetComponent = ({ str, int, data, locale }) => {
  const [open, setOpen] = useState(false);
  const rows = (data?.rows ?? []).slice(0, int("limit", 6, 1, 24));
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-fq-md border border-border px-3 py-1.5 text-sm"
      >
        {str("buttonLabel") || "Quick view"}
      </button>
      <OverlayHost
        open={open}
        onClose={() => setOpen(false)}
        title={str("heading") || "Quick view"}
        side="right"
      >
        <DataGrid
          rows={rows}
          pending={data?.pending ?? false}
          cols={2}
          ratio="square"
          locale={locale}
          withPrice
        />
      </OverlayHost>
    </div>
  );
};

/**
 * Bundle/total contract: the item set posts to the server and the widget
 * renders the total it is handed. No client money math, by design.
 */
const BundleOfferWidget: WidgetComponent = ({
  str,
  Heading,
  locale,
  money,
  storeSlug,
}) => {
  const items = [1, 2, 3, 4]
    .map((i) => ({
      label: str(`i${i}Label`),
      variantId: str(`i${i}VariantId`),
    }))
    .filter((item) => item.label && item.variantId);
  const [picked, setPicked] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Any change to the set invalidates the server total rather than guessing it.
  useEffect(() => setTotal(null), [picked]);

  const submit = async () => {
    if (!storeSlug || picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const quote = await quoteBundle({
        data: {
          slug: storeSlug,
          items: picked.map((variantId) => ({ variantId, quantity: 1 })),
        },
      });
      setTotal(quote.totalMinor);
    } catch {
      setError(
        locale === "bn" ? "মূল্য আনা যায়নি" : "Could not price this bundle",
      );
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="rounded-fq-lg border border-border bg-card p-6">
      {str("heading") && (
        <Heading className="text-lg font-semibold">{str("heading")}</Heading>
      )}
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.variantId}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(item.variantId)}
                onChange={() =>
                  setPicked((current) =>
                    current.includes(item.variantId)
                      ? current.filter((v) => v !== item.variantId)
                      : [...current, item.variantId],
                  )
                }
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={submit}
        disabled={busy || picked.length === 0 || !storeSlug}
        className="mt-3 rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {str("buttonLabel") || "Calculate total"}
      </button>
      {total !== null && (
        <p className="money mt-3 text-base font-semibold" aria-live="polite">
          {money(total)}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="status">
          {error}
        </p>
      )}
    </section>
  );
};

/** Multi-slide hero. Slide one is the LCP candidate and always renders eager. */
const HeroWidget: WidgetComponent = ({ str, Heading, locale, section }) => {
  // Repeater-first (faq/trust_bar/lookbook precedent): studio `items` rows
  // win when present; scalar heading/image + s2/s3 pairs remain as the
  // fallback for theme-authored sections. Scalar rows copy the global
  // ctaLabel/ctaHref and keep subheading on slide 1 only, reproducing the
  // current global-CTA + first-slide-subheading behavior exactly.
  const itemRows = Array.isArray(section.props.items)
    ? section.props.items
        .map((row) => ({
          heading: typeof row.heading === "string" ? row.heading : "",
          image: typeof row.image === "string" ? row.image : "",
          subheading: typeof row.subheading === "string" ? row.subheading : "",
          ctaLabel: typeof row.ctaLabel === "string" ? row.ctaLabel : "",
          ctaHref: typeof row.ctaHref === "string" ? row.ctaHref : "",
        }))
        .filter((row) => row.heading || row.image)
    : [];
  const slides =
    itemRows.length > 0
      ? itemRows
      : [
          {
            heading: str("heading"),
            image: str("image"),
            subheading: str("subheading"),
            ctaLabel: str("ctaLabel"),
            ctaHref: str("ctaHref"),
          },
          {
            heading: str("s2Heading"),
            image: str("s2Image"),
            subheading: "",
            ctaLabel: str("ctaLabel"),
            ctaHref: str("ctaHref"),
          },
          {
            heading: str("s3Heading"),
            image: str("s3Image"),
            subheading: "",
            ctaLabel: str("ctaLabel"),
            ctaHref: str("ctaHref"),
          },
        ].filter((slide, index) => index === 0 || slide.heading || slide.image);
  const [index, setIndex] = useState(0);
  const active = slides[Math.min(index, slides.length - 1)]!;
  return (
    <section
      className={`overflow-hidden rounded-fq-lg border border-border bg-info-soft ${
        str("align") === "center" ? "text-center" : ""
      }`}
    >
      {active.image && (
        <MediaFrame
          src={active.image}
          alt={active.heading}
          ratio="wide"
          eager={index === 0}
          className="rounded-none"
          sizes="100vw"
        />
      )}
      <div className="p-8">
        <Heading className="font-bangla-display text-3xl font-bold sm:text-4xl">
          {active.heading}
        </Heading>
        {index === 0 && active.subheading && (
          <p className="mt-2 max-w-xl text-muted-foreground">
            {active.subheading}
          </p>
        )}
        {active.ctaLabel && (
          <a
            href={active.ctaHref || "#"}
            className="mt-4 inline-block rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {active.ctaLabel}
          </a>
        )}
        {slides.length > 1 && (
          <div
            className="mt-4 flex gap-2"
            role="group"
            aria-label={locale === "bn" ? "স্লাইড" : "Slides"}
          >
            {slides.map((slide, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                aria-label={`${locale === "bn" ? "স্লাইড" : "Slide"} ${i + 1}`}
                className={`h-11 w-11 rounded-fq-md border border-border text-xs tabular-nums ${
                  i === index ? "bg-primary text-primary-foreground" : "bg-card"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * The closed renderer map. `Record<SectionType, WidgetComponent>` means a new
 * widget type cannot compile until its renderer exists.
 */
export const WIDGET_COMPONENTS: Record<SectionType, WidgetComponent> = {
  // Phase 2.1 — bars, navigation, search and account/cart.
  ...CHROME_WIDGETS,
  // Phase 2.2 — merchandising.
  ...MERCH_WIDGETS,
  // Phase 2.3 — product detail page.
  ...PDP_WIDGETS,
  // Phase 2.4 — collection / search.
  ...COLLECTION_WIDGETS,
  // Phase 2.5 — cart / checkout / account.
  ...CART_WIDGETS,
  // Account template (shopper-scoped): orders_list, profile_card.
  ...ACCOUNT_WIDGETS,
  // Phase 2.6 — Atelier (apparel).
  ...APPAREL_WIDGETS,
  // Phase 9 — Heritage (clothing).
  ...HERITAGE_WIDGETS,
  // Songoskriti heritage gap pack.
  ...SONGOSKRITI_WIDGETS,
  // Somvabona everyday-ethnic pack (spec 2026-09-25 §3).
  ...SOMVABONA_WIDGETS,

  container: Container,
  columns: Container,

  divider: ({ str, int }) => {
    const padY = int("padY", 24, 0, 96);
    return (
      <div style={{ paddingTop: padY, paddingBottom: padY }}>
        {str("label") ? (
          <p className="flex items-center gap-3 text-xs fq-caps text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {str("label")}
            <span className="h-px flex-1 bg-border" />
          </p>
        ) : (
          <hr className="border-border" />
        )}
      </div>
    );
  },

  // Storefront contact channel as a placeable block. Fail closed with no
  // phone (never a dead wa.me link); digits-only, greeting encoded.
  whatsapp_button: ({ str }) => {
    const phone = str("phone_number").replace(/[^0-9]/g, "");
    if (!phone) return null;
    const greet =
      str("greeting_message") || "Hello! I am interested in your products.";
    const href = `https://wa.me/${phone}?text=${encodeURIComponent(greet)}`;
    const label = str("label") || "Chat on WhatsApp";
    const size = str("size");
    const dim = size === "sm" ? 44 : size === "lg" ? 64 : 56;
    const glyph = (
      <svg
        width={dim - 16}
        height={dim - 16}
        viewBox="0 0 512 512"
        fill="none"
        aria-hidden
      >
        <path
          style={{ fill: "var(--color-primary-foreground)" }}
          d="M1.1 509.4L37 378.6C14.8 340.2 3.2 296.7 3.3 252.4C3.3 113.2 116.6 0 255.8 0c67.5 0 130.9 26.3 178.6 74s73.9 111.1 73.9 178.6C508.2 391.8 394.9 505 255.8 505h-.1c-42.3 0-83.8-10.6-120.7-30.7z"
        />
        <path
          style={{ fill: "var(--color-whatsapp)" }}
          d="M255.8 42.6c-115.8 0-209.9 94.1-210 209.8c0 39.5 11.2 78.2 32.2 111.7l5 7.9l-21.2 77.4l79.4-20.8l7.7 4.5c32.2 19.1 69.2 29.2 106.8 29.2h.1c115.7 0 209.8-94.1 209.9-209.8c.2-55.7-21.9-109.1-61.4-148.4c-39.3-39.4-92.8-61.6-148.5-61.5"
        />
        <path
          style={{ fill: "var(--color-primary-foreground)" }}
          fillRule="evenodd"
          d="M192.7 146.9c-4.7-10.5-9.7-10.7-14.2-10.9l-12.1-.1c-4.2 0-11 1.6-16.8 7.9s-22.1 21.6-22.1 52.6s22.6 61 25.8 65.2s43.6 69.9 107.8 95.2c53.3 21 64.1 16.8 75.7 15.8c11.6-1.1 37.3-15.3 42.6-30s5.3-27.4 3.7-30s-5.8-4.2-12.1-7.4s-37.3-18.4-43.1-20.5s-10-3.2-14.2 3.2c-4.2 6.3-16.3 20.5-20 24.7s-7.4 4.7-13.7 1.6c-6.3-3.2-26.6-9.8-50.7-31.3c-18.8-16.7-31.4-37.4-35.1-43.7s-.4-9.7 2.8-12.9c2.8-2.8 6.3-7.4 9.5-11.1s4.2-6.3 6.3-10.5s1.1-7.9-.5-11.1c-1.8-3-14-34.2-19.6-46.7"
        />
      </svg>
    );
    if (str("style") === "bar") {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener"
          aria-label={label}
          className="inline-flex items-center gap-2.5 rounded-full bg-whatsapp px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline"
        >
          {glyph}
          <span>{label}</span>
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        aria-label={label}
        className="inline-flex items-center justify-center rounded-full"
        style={{ width: dim, height: dim }}
      >
        {glyph}
      </a>
    );
  },

  // Phase 2.2: multi-slide hero. The first slide is the LCP candidate, so its
  // media is eager and never lazy; extra slides advance only on user action,
  // which keeps it safe under prefers-reduced-motion.
  hero: HeroWidget,

  heading: ({ str, primary, editing, inlineEdit, locale }) => {
    const Tag = primary ? "h1" : str("level") === "h3" ? "h3" : "h2";
    return (
      <Editable
        as={Tag}
        field="text"
        value={str("text")}
        ctx={{ editing, inlineEdit, locale }}
        className={`font-bangla-display block text-2xl font-semibold ${
          str("align") === "center" ? "text-center" : ""
        }`}
      />
    );
  },

  rich_text: ({ str, Heading, editing, inlineEdit, locale }) => (
    <section className="rounded-fq-lg border border-border bg-card p-6">
      {str("heading") && (
        <Heading className="text-lg font-semibold">{str("heading")}</Heading>
      )}
      <Editable
        as="p"
        field="body"
        value={str("body")}
        ctx={{ editing, inlineEdit, locale }}
        className="mt-2 block whitespace-pre-line text-sm text-muted-foreground"
      />
    </section>
  ),

  html: ({ str }) => {
    // Phase 4: plain copy renders inline; authored markup goes to the sandbox
    // frame so it can never reach the storefront DOM, cookies or storage.
    const markup = str("markup");
    return (
      <div className="space-y-3">
        {str("body") && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {str("body")}
          </p>
        )}
        {markup && <HtmlSandbox markup={markup} title="Custom HTML" />}
      </div>
    );
  },

  plugin_block: ({ str, int, editing }) => (
    // Phase 5: plugin widgets render in a sandboxed island, never inline.
    <PluginBlock
      pluginKey={str("pluginKey")}
      height={int("height", 320, 80, 1200)}
      editing={editing}
    />
  ),

  image: ({ str }) => {
    const src = str("src");
    if (!src) return null;
    const declared = str("ratio");
    const ratio =
      declared === "1/1" ? "square" : declared === "4/3" ? "landscape" : "wide";
    return (
      <figure className="overflow-hidden rounded-fq-lg border border-border">
        {/* Phase 1.3: MediaFrame reserves the box before the bytes land. */}
        <MediaFrame
          src={src}
          alt={str("alt")}
          ratio={ratio}
          sizes="(max-width: 768px) 100vw, 1200px"
          className="rounded-none"
        />
        {str("caption") && (
          <figcaption className="px-3 py-2 text-xs text-muted-foreground">
            {str("caption")}
          </figcaption>
        )}
      </figure>
    );
  },

  video: ({ str }) => {
    // Defence in depth: the parser already rejects non-allowlisted hosts, and
    // the renderer refuses to frame anything that is not on the list either.
    const src = safeEmbedUrl(str("src"));
    if (!src) return null;
    return (
      <div className="overflow-hidden rounded-fq-lg border border-border">
        <iframe
          src={src}
          title={str("title") || "Video"}
          loading="lazy"
          allow="accelerometer; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          className="aspect-video w-full"
        />
      </div>
    );
  },

  banner: ({ str }) => {
    const tone = str("tone");
    const cls =
      tone === "warn"
        ? "bg-warning-soft text-warning-foreground"
        : tone === "success"
          ? "bg-success-soft text-success-foreground"
          : "bg-info-soft text-foreground";
    return (
      <div className={`rounded-fq-md px-4 py-2 text-sm ${cls}`}>
        {str("text")}
      </div>
    );
  },

  feature_row: ({ str }) => (
    <ul className="grid gap-3 sm:grid-cols-3">
      {["itemOne", "itemTwo", "itemThree"].map((key) => (
        <li
          key={key}
          className="rounded-fq-md border border-border bg-card p-4 text-sm"
        >
          {str(key)}
        </li>
      ))}
    </ul>
  ),

  testimonial: ({ str }) => (
    <figure className="rounded-fq-lg border border-border bg-card p-6">
      <blockquote className="text-sm italic">{str("quote")}</blockquote>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        {str("author")}
      </figcaption>
    </figure>
  ),

  // Phase 1.3: one Disclosure primitive, so FAQ, spec groups and size guides
  // all share the same keyboard and ARIA behaviour.
  faq: ({ str, Heading, section }) => {
    // Repeater-first: studio `items` rows win when present, scalar q1/a1…
    // pairs remain as the fallback for theme-authored sections.
    const itemRows = Array.isArray(section.props.items)
      ? section.props.items
          .map((row) => ({
            q: typeof row.question === "string" ? row.question : "",
            a: typeof row.answer === "string" ? row.answer : "",
          }))
          .filter((row) => row.q)
      : [];
    const rows =
      itemRows.length > 0
        ? itemRows
        : [1, 2, 3]
            .map((i) => ({ q: str(`q${i}`), a: str(`a${i}`) }))
            .filter((row) => row.q);
    if (!rows.length) return null;
    return (
      <section className="rounded-fq-lg border border-border bg-card p-6">
        {str("heading") && (
          <Heading className="mb-3 text-lg font-semibold">
            {str("heading")}
          </Heading>
        )}
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <Disclosure key={row.q} summary={row.q}>
              {row.a}
            </Disclosure>
          ))}
        </div>
      </section>
    );
  },

  countdown: ({ str, locale, data }) => {
    // Phase 2.2: when the node is data-bound, the deal row owns the deadline.
    const bound = data?.rows?.find(
      (row) => row.subtitle && !Number.isNaN(Date.parse(row.subtitle)),
    );
    const endsAt = bound?.subtitle ?? str("endsAt");
    if (Number.isNaN(Date.parse(endsAt))) return null;
    return <Countdown endsAt={endsAt} label={str("label")} locale={locale} />;
  },

  // Phase 2.6 [U]: pauses on hover, and under `prefers-reduced-motion` the
  // `motion-safe:` guard leaves the text static rather than scrolling.
  marquee: ({ str, int, bool }) => (
    <div className="group overflow-hidden rounded-fq-md border border-border bg-card">
      <p
        className={[
          "whitespace-nowrap px-4 py-2 text-sm",
          "motion-safe:animate-[fq-marquee_var(--fq-marquee)_linear_infinite]",
          bool("pauseOnHover")
            ? "group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
            : "",
        ].join(" ")}
        style={{ ["--fq-marquee" as string]: `${int("speed", 30, 5, 120)}s` }}
      >
        {str("text")}
      </p>
    </div>
  ),

  newsletter: ({ str, Heading, section, locale }) => (
    <section className="rounded-fq-lg border border-border bg-card p-6">
      <Heading className="text-lg font-semibold">{str("heading")}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">{str("body")}</p>
      <form
        className="mt-3 flex flex-wrap gap-2"
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
          className="min-w-[16rem] flex-1 rounded-fq-md border border-border px-3 py-2 text-sm"
          placeholder="you@example.com"
        />
        <button
          type="submit"
          className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {str("buttonLabel") || "Subscribe"}
        </button>
      </form>
      {/* Contact capture always carries consent copy — enforced by test. */}
      <ConsentChip
        props={{ consentText: str("consentText") }}
        locale={locale}
      />
    </section>
  ),

  spacer: ({ int }) => (
    <div aria-hidden="true" style={{ height: int("size", 32, 8, 160) }} />
  ),

  product_grid: ({ str, int, bool, Heading, productSlot, data, locale }) => {
    const cols = int("columns", 4, 2, 4);
    // Widget skin (spec 2026-09-25): cards (default, current DataGrid grid
    // byte-identical) and rows (stacked full-width list). Heading, host slot
    // override, skeleton parity, empty state, bn/en copy and a11y stay
    // common — only the list composition forks.
    const skin = resolveSkin("product_grid", str("skin"));
    const heading = str("heading") ? (
      <Heading className="mb-3 text-lg font-semibold">
        {str("heading")}
      </Heading>
    ) : null;
    const pending = data?.pending ?? false;
    const rowsList = data?.rows ?? [];
    const rowsBody =
      pending || data?.rows === undefined ? (
        <ul className="space-y-3" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <ProductCardSkeleton variant="wide" withPrice />
            </li>
          ))}
        </ul>
      ) : rowsList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show here yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rowsList.map((row) => (
            <li key={row.id}>
              <ProductCard
                row={row}
                locale={locale}
                variant="wide"
                withPrice
                promise={str("promise") || undefined}
                showRating={bool("showRating")}
              />
            </li>
          ))}
        </ul>
      );
    return (
      <section>
        {heading}
        {productSlot ??
          (skin === "rows" ? (
            rowsBody
          ) : (
            <DataGrid
              rows={data?.rows}
              pending={pending}
              cols={cols}
              ratio="square"
              locale={locale}
              withPrice
              variant={cardVariantOf(str("cardVariant"))}
              density={str("density") === "compact" ? "compact" : "comfortable"}
              promise={str("promise") || undefined}
              showRating={bool("showRating")}
            />
          ))}
      </section>
    );
  },

  collection_grid: ({
    str,
    int,
    bool,
    Heading,
    collectionSlot,
    data,
    locale,
  }) => {
    const cols = int("columns", 4, 2, 4);
    return (
      <section>
        {str("heading") && (
          <Heading className="mb-3 text-lg font-semibold">
            {str("heading")}
          </Heading>
        )}
        {collectionSlot ?? (
          <DataGrid
            rows={data?.rows}
            pending={data?.pending ?? false}
            cols={cols}
            ratio="landscape"
            locale={locale}
            variant={cardVariantOf(str("cardVariant"), "wide")}
            showCount={bool("showCount")}
          />
        )}
      </section>
    );
  },

  /* ----------------------- Phase 1 — shared primitives --------------------- */

  tabs: ({ str }) => {
    const items = [1, 2, 3]
      .map((i) => ({
        key: `t${i}`,
        label: str(`t${i}Label`),
        content: str(`t${i}Body`),
      }))
      .filter((item) => item.label);
    if (!items.length) return null;
    return <Tabs items={items} />;
  },

  accordion: ({ str, bool, Heading }) => {
    const items = [1, 2, 3]
      .map((i) => ({ title: str(`i${i}Title`), body: str(`i${i}Body`) }))
      .filter((item) => item.title);
    if (!items.length) return null;
    return (
      <section className="rounded-fq-lg border border-border bg-card p-2">
        {str("heading") && (
          <Heading className="px-3 pt-2 text-lg font-semibold">
            {str("heading")}
          </Heading>
        )}
        <div className="divide-y divide-border">
          {items.map((item, index) => (
            <Disclosure
              key={item.title}
              summary={item.title}
              defaultOpen={index === 0 && bool("openFirst")}
            >
              {item.body}
            </Disclosure>
          ))}
        </div>
      </section>
    );
  },

  sticky_bar: ({ str }) => {
    if (!str("text") && !str("ctaLabel")) return null;
    const top = str("position") === "top";
    return (
      <div
        className={`sticky z-30 flex flex-wrap items-center justify-between gap-3 rounded-fq-md border border-border bg-card px-4 py-2 text-sm ${
          top ? "top-0" : "bottom-0"
        }`}
      >
        <span className="min-w-0">{str("text")}</span>
        {str("ctaLabel") && (
          <a
            href={str("ctaHref") || "#"}
            className="rounded-fq-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            {str("ctaLabel")}
          </a>
        )}
      </div>
    );
  },

  quiz: QuizWidget,
  recently_viewed: RecentlyViewedWidget,
  quick_view: QuickViewWidget,
  bundle_offer: BundleOfferWidget,

  breadcrumb: ContextSlot,
  product_media: ProductMedia,
  price_block: ContextSlot,
  add_to_cart: ContextSlot,
  product_meta: ContextSlot,
  page_content: ContextSlot,

  // Phase 7 — Elementor-grade layout primitives (button, icon, form, menu, logo, carousel).
  ...BASIC_WIDGETS,
  ...BLOG_WIDGETS,

  // Phase 2.7 — Circuit (electronics), including the upgraded spec table.
  ...CIRCUIT_WIDGETS,
  ...BEAUTY_WIDGETS,
  // Rupaboti homepage gap set: badges, packs and taxonomy rails.
  ...BEAUTY_HOME_WIDGETS,
};
