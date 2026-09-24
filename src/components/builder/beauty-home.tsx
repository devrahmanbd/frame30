/**
 * Phase 2.8 — Rupaboti homepage gap widgets.
 *
 * Closes the distance between the builder registry and a beauty reference
 * homepage (theme-plan-beauty.md §5 `index`): the rails, badges and packs a
 * cosmetics storefront leads with. `mega_menu`, `trust_bar`, `product_rail`,
 * `tabs`, `countdown`, `newsletter` and the quiz/bundle set already exist, so
 * this module only adds what is genuinely missing:
 *
 * - `discount_badge` — the TK saving alongside the percent ProductCard shows.
 * - `combo_card` — a fixed multi-item pack whose combined total is quoted by
 *   the server (bundle/total contract: never summed on the client).
 * - `concern_rail` — a product rail bound to concern taxonomy terms.
 * - `ingredient_rail` — a product rail bound to key (Latin) ingredients.
 *
 * Rules inherited from the registry: no theme import, no raw colour, tokens
 * through semantic classes only; bilingual labels on every widget; sentence
 * case, no eyebrow labels, no numbered markers outside sequences; no motion
 * beyond the rail's native scroll; keyboard focus stays visible.
 */
import { useEffect, useState } from "react";
import type { SectionType } from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import { parseTerms, termLabel } from "@/lib/beauty-taxonomy";
import type { WidgetRow } from "@/lib/widget-data";
import { quoteBundle } from "@/lib/bundle-quote.functions";
import { ProductCard, ProductCardSkeleton } from "./primitives/ProductCard";
import { Rail } from "./primitives/Rail";
import { cardVariantOf } from "./merch";
import type { WidgetComponent } from "./widgets";

/** Built-in UI copy that is not merchant-authored. */
function t(locale: Locale, en: string, bn: string): string {
  return locale === "bn" ? bn : en;
}

function haystackOf(row: WidgetRow): string {
  return `${row.title} ${row.subtitle ?? ""} ${row.options ?? ""}`.toLowerCase();
}

/* ---------------------------------------------------------- discount_badge */

/**
 * Display-only saving math — the same status as ProductCard's percent: it
 * formats server-valued minor units for display and is never transmitted.
 */
export function discountParts(
  priceMinor?: number,
  compareAtMinor?: number,
): { amountMinor: number; percent: number } | null {
  if (
    typeof priceMinor !== "number" ||
    typeof compareAtMinor !== "number" ||
    !Number.isFinite(priceMinor) ||
    !Number.isFinite(compareAtMinor) ||
    compareAtMinor <= priceMinor
  )
    return null;
  return {
    amountMinor: compareAtMinor - priceMinor,
    percent: Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100),
  };
}

const DiscountBadge: WidgetComponent = ({ int, money, locale, str }) => {
  const parts = discountParts(
    int("priceMinor", 0, 0, 999_999_999),
    int("compareAtMinor", 0, 0, 999_999_999),
  );
  if (!parts) return null;
  const off = t(locale, "off", "ছাড়");
  return (
    <p className="m-0 inline-flex flex-wrap items-center gap-2">
      {str("label") ? (
        <span className="text-sm text-muted-foreground">{str("label")}</span>
      ) : null}
      <span className="rounded-fq-md bg-destructive/10 px-2 py-0.5 text-xs font-semibold tabular-nums">
        {money(parts.amountMinor)} {off}
      </span>
      <span className="rounded-fq-md bg-success-soft px-2 py-0.5 text-xs font-semibold tabular-nums">
        {parts.percent}% {off}
      </span>
    </p>
  );
};

/* ------------------------------------------------------------ concern_rail */

const ConcernRail: WidgetComponent = ({
  str,
  int,
  bool,
  Heading,
  data,
  locale,
}) => {
  const limit = int("limit", 12, 1, 24);
  const rows = data?.rows;
  const terms = parseTerms(str("terms"), "concern");

  if (data?.pending || rows === undefined) {
    return (
      <section>
        {str("heading") && (
          <Heading className="mb-3 text-lg font-semibold">
            {str("heading")}
          </Heading>
        )}
        <Rail
          label={
            str("heading") || t(locale, "Shop by concern", "সমস্যা অনুযায়ী")
          }
        >
          {Array.from({ length: 4 }, (_, i) => (
            <ProductCardSkeleton key={i} variant="compact" />
          ))}
        </Rail>
      </section>
    );
  }

  const matched =
    terms.length === 0
      ? rows.slice(0, limit)
      : rows
          .filter((row) =>
            terms.some((term) => haystackOf(row).includes(term.slug)),
          )
          .slice(0, limit);

  return (
    <section>
      {str("heading") && (
        <Heading className="mb-3 text-lg font-semibold">
          {str("heading")}
        </Heading>
      )}
      {terms.length > 0 && (
        <ul
          aria-label={t(locale, "Concerns", "সমস্যা")}
          className="m-0 mb-3 flex list-none flex-wrap gap-2 p-0"
        >
          {terms.map((term) => (
            <li
              key={term.slug}
              className="rounded-full border border-border px-3 py-1 text-sm"
            >
              {termLabel(term.slug, locale)}
            </li>
          ))}
        </ul>
      )}
      {matched.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {t(
            locale,
            "No products for these concerns yet.",
            "এই সমস্যার জন্য এখনো পণ্য নেই।",
          )}
        </p>
      ) : (
        <Rail
          label={
            str("heading") || t(locale, "Shop by concern", "সমস্যা অনুযায়ী")
          }
        >
          {matched.map((row) => (
            <ProductCard
              key={row.id}
              row={row}
              locale={locale}
              variant={cardVariantOf(str("cardVariant"), "compact")}
              withPrice
              showRating={bool("showRating")}
            />
          ))}
        </Rail>
      )}
    </section>
  );
};

/* --------------------------------------------------------- ingredient_rail */

/** Reads the authored `i1..i4` Name/Gloss pairs. Names stay Latin. */
function authoredIngredients(str: (key: string) => string) {
  return [1, 2, 3, 4]
    .map((i) => ({
      name: str(`i${i}Name`).trim(),
      gloss: str(`i${i}Gloss`).trim(),
    }))
    .filter((entry) => entry.name.length > 0);
}

const IngredientRail: WidgetComponent = ({
  str,
  int,
  Heading,
  data,
  locale,
}) => {
  const limit = int("limit", 12, 1, 24);
  const rows = data?.rows;
  const ingredients = authoredIngredients(str);

  if (data?.pending || rows === undefined) {
    return (
      <section>
        {str("heading") && (
          <Heading className="mb-3 text-lg font-semibold">
            {str("heading")}
          </Heading>
        )}
        <Rail
          label={
            str("heading") || t(locale, "Shop by ingredient", "উপাদান অনুযায়ী")
          }
        >
          {Array.from({ length: 4 }, (_, i) => (
            <ProductCardSkeleton key={i} variant="compact" />
          ))}
        </Rail>
      </section>
    );
  }

  if (ingredients.length === 0) return null;

  const names = ingredients.map((entry) => entry.name.toLowerCase());
  const matched = rows.filter((row) =>
    names.some((name) => haystackOf(row).includes(name)),
  );
  // Untagged catalogues still show the rail rather than a hole in the page.
  const shown = (matched.length > 0 ? matched : rows).slice(0, limit);

  return (
    <section>
      {str("heading") && (
        <Heading className="mb-3 text-lg font-semibold">
          {str("heading")}
        </Heading>
      )}
      <ul
        aria-label={t(locale, "Ingredients", "উপাদান")}
        className="m-0 mb-3 flex list-none flex-wrap gap-2 p-0"
      >
        {ingredients.map((entry) => (
          <li
            key={entry.name}
            className="rounded-full border border-border px-3 py-1 text-sm"
          >
            <span dir="ltr" lang="en">
              {entry.name}
            </span>
            {entry.gloss && (
              <span className="ms-2 text-xs text-muted-foreground">
                {entry.gloss}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Rail
        label={
          str("heading") || t(locale, "Shop by ingredient", "উপাদান অনুযায়ী")
        }
      >
        {shown.map((row) => (
          <ProductCard
            key={row.id}
            row={row}
            locale={locale}
            variant={cardVariantOf(str("cardVariant"), "compact")}
            withPrice
          />
        ))}
      </Rail>
    </section>
  );
};

/* -------------------------------------------------------------- combo_card */

/**
 * A fixed pack with one CTA. The combined total is quoted by the server once
 * the merchant-authored set is posted — this widget only counts items.
 * The CTA renders only when it has a working server path (variant IDs plus a
 * store), so a half-configured pack never shows a dead button.
 */
const ComboCard: WidgetComponent = ({
  str,
  int,
  Heading,
  data,
  locale,
  money,
  storeSlug,
}) => {
  const limit = int("limit", 3, 2, 6);
  const rows = (data?.rows ?? []).slice(0, limit);
  const variantIds = [1, 2, 3, 4]
    .map((i) => str(`i${i}VariantId`).trim())
    .filter(Boolean);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setTotal(null), [variantIds.join(",")]);

  if (data?.pending || data?.rows === undefined) {
    return (
      <section className="rounded-fq-lg border border-border bg-card p-4">
        {str("heading") && (
          <Heading className="mb-3 text-base font-semibold">
            {str("heading")}
          </Heading>
        )}
        <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <ProductCardSkeleton key={i} variant="compact" />
          ))}
        </div>
      </section>
    );
  }

  if (rows.length === 0) return null;
  const canQuote = !!storeSlug && variantIds.length > 0;

  const submit = async () => {
    if (!canQuote) return;
    setBusy(true);
    setError(null);
    try {
      const quote = await quoteBundle({
        data: {
          slug: storeSlug,
          items: variantIds.map((variantId) => ({ variantId, quantity: 1 })),
        },
      });
      setTotal(quote.totalMinor);
    } catch {
      setError(
        locale === "bn" ? "মূল্য আনা যায়নি" : "Could not price this combo",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-fq-lg border border-border bg-card p-4">
      {str("heading") && (
        <Heading className="text-base font-semibold">{str("heading")}</Heading>
      )}
      {str("body") && (
        <p className="mt-1 text-sm text-muted-foreground">{str("body")}</p>
      )}
      <ul className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-3">
        {rows.map((row) => (
          <li key={row.id} className="min-w-0">
            <ProductCard row={row} locale={locale} variant="compact" />
          </li>
        ))}
      </ul>
      {canQuote && (
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {str("buttonLabel") ||
            t(locale, "Add combo to cart", "কম্বো কার্টে যোগ করুন")}
        </button>
      )}
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
      {str("note") && (
        <p className="mt-2 text-xs text-muted-foreground">{str("note")}</p>
      )}
    </section>
  );
};

/* ---------------------------------------------------------------- registry */

export const BEAUTY_HOME_WIDGETS: Record<
  Extract<
    SectionType,
    "discount_badge" | "combo_card" | "concern_rail" | "ingredient_rail"
  >,
  WidgetComponent
> = {
  discount_badge: DiscountBadge,
  combo_card: ComboCard,
  concern_rail: ConcernRail,
  ingredient_rail: IngredientRail,
};
