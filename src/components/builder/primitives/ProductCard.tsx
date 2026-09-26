/**
 * Nakhrali-grade product card (Songoskriti redesign 2026-09-26).
 *
 * Visual model: nakhrali.com — dual-image crossfade on hover, sliding
 * "Shop Now" overlay that lifts from below, centered serif typography,
 * zero border/shadow, pure editorial flat presentation.
 *
 * Phase1-T1 motion phase 1:
 * - CSS-only staggered crossfade across up to three secondary images
 *   (LAYER_DELAYS) — no JS hover state on the card itself.
 * - Quick View dialog trigger; OverlayHost owns focus trap and modal role.
 * - Wishlist heart with an optimistic count badge (useWishlistCard).
 * - Merch badges: sale ribbon owns the top-left corner; rank/custom badges
 *   displace to bottom-left when a sale ribbon is present; sponsored,
 *   online-exclusive and low-stock chips stack in the right column.
 *
 * Architecture preserved:
 * - data-part hooks (badge/title/price/promise) untouched — skins.css still works.
 * - All prop signatures byte-identical to the old card.
 * - ProductCardSkeleton is box-model-identical (same aspect ratio, same padding).
 * - Money arrives as server-valued minor units, formatted here only.
 * - No theme import — colours via semantic token classes only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDisplayMoney, formatDisplayNumber } from "@/lib/money-display";
import { fmtMinor } from "@/lib/money";
import { useCart } from "@/lib/cart";
import type { Locale } from "@/lib/bitext";
import type { WidgetRow } from "@/lib/widget-data";
import { placeholderSeed } from "@/lib/placeholder";
import { TILE_BASE } from "@/components/store/ProductTileArt";
import { Eye, Heart } from "@/components/icons/tabler";
import { getStoreProduct } from "@/lib/storefront.functions";
import { useStoreSlug } from "@/lib/store-slug-context";
import { useWishlistCard } from "@/lib/wishlist-card";
import { OverlayHost } from "./OverlayHost";
import { QtyStepper } from "./QtyStepper";

export type CardVariant = "standard" | "compact" | "wide" | "editorial";

/** Discount percentage from server-valued minor units. Display only. */
export function savePercent(
  priceMinor?: number,
  compareAtMinor?: number,
): number | null {
  if (!priceMinor || !compareAtMinor || compareAtMinor <= priceMinor)
    return null;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}

/** Aspect ratio class per variant — portrait for fashion, landscape for wide. */
const ASPECT: Record<CardVariant, string> = {
  standard: "aspect-[3/4]",
  compact: "aspect-[3/4]",
  wide: "aspect-[4/3]",
  editorial: "aspect-[3/4]",
};

/**
 * Phase1-T1 — reveal language shared by the wishlist heart and the Quick View
 * trigger: hidden until the card is hovered or keyboard-focused, and always
 * visible on touch devices where hover never fires. Static class literals so
 * Tailwind's scanner picks them up.
 */
const REVEAL =
  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none";

/** Per-layer hover delays for the staggered crossfade (250/500/750ms). */
const LAYER_DELAYS = ["delay-[250ms]", "delay-[500ms]", "delay-[750ms]"];

/** Stock at or below this count renders the low-stock chip. */
const LOW_STOCK_AT = 5;

/** Quick View dialog body — product data loads only while the dialog is open. */
export function QuickViewBody({
  storeSlug,
  handle,
  locale,
}: {
  storeSlug: string;
  handle: string;
  locale: Locale;
}) {
  const fetchProduct = useServerFn(getStoreProduct);
  const productQuery = useQuery({
    queryKey: ["store", "product", storeSlug, handle],
    queryFn: () =>
      fetchProduct({ data: { slug: storeSlug, productSlug: handle } }),
  });
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(1);
  const { add } = useCart(storeSlug);

  if (productQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {locale === "bn" ? "লোড হচ্ছে…" : "Loading…"}
      </p>
    );
  }

  const data = productQuery.data;
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        {locale === "bn" ? "পণ্যটি পাওয়া যায়নি" : "Product not found"}
      </p>
    );
  }

  const variants = data.product.product_variants ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const outOfStock = (variant?.stock_quantity ?? 0) <= 0;

  return (
    <div className="grid gap-4 bg-[#f5f3f0] sm:grid-cols-2">
      <img
        src={data.product.image_url ?? undefined}
        alt={data.product.title}
        loading="lazy"
        decoding="async"
        className="aspect-[3/4] w-full object-cover"
        style={{ backgroundColor: TILE_BASE }}
      />
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium">{data.product.title}</p>
        <p className="text-sm">
          {fmtMinor(
            Number(variant?.price_amount_minor_int ?? 0),
            data.merchant.currency_code,
          )}
        </p>
        {variants.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === (variant?.id ?? "")}
                onClick={() => setVariantId(v.id)}
                className="min-h-11 rounded-fq-md border border-border px-3 text-sm"
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
        <QtyStepper
          value={qty}
          max={variant?.stock_quantity}
          label={locale === "bn" ? "পরিমাণ" : "Quantity"}
          locale={locale === "bn" ? "bn" : "en"}
          onChange={setQty}
          disabled={outOfStock}
        />
        <button
          type="button"
          className="min-h-11 rounded-fq-md bg-foreground px-4 text-sm text-background disabled:opacity-50"
          disabled={outOfStock}
          onClick={() => {
            if (variant) add(variant.id, qty);
          }}
        >
          {locale === "bn" ? "কার্টে যোগ করুন" : "Add to cart"}
        </button>
      </div>
    </div>
  );
}

/** Quick View trigger + dialog mount. Rendered only with store + handle. */
function QuickViewControl({
  storeSlug,
  handle,
  locale,
}: {
  storeSlug: string;
  handle: string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const label = locale === "bn" ? "কুইক ভিউ" : "Quick View";
  return (
    <>
      <button
        type="button"
        data-part="quick-view"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`absolute left-1/2 top-1/2 z-30 inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm transition-opacity duration-[250ms] ${REVEAL}`}
      >
        <Eye className="size-4" strokeWidth={1.5} />
      </button>
      {open && (
        <OverlayHost
          open
          onClose={() => setOpen(false)}
          title={label}
          closeLabel={locale === "bn" ? "বন্ধ করুন" : "Close"}
        >
          <QuickViewBody
            storeSlug={storeSlug}
            handle={handle}
            locale={locale}
          />
        </OverlayHost>
      )}
    </>
  );
}

/** Wishlist heart with optimistic count badge. Rendered only with store + variant. */
function WishlistHeart({
  storeSlug,
  variantId,
  locale,
}: {
  storeSlug: string;
  variantId: string;
  locale: Locale;
}) {
  const { saved, count, onClick } = useWishlistCard({
    slug: storeSlug,
    variantId,
  });
  const label =
    locale === "bn"
      ? saved
        ? "উইশলিস্টে সংরক্ষিত"
        : "উইশলিস্টে সংরক্ষণ করুন"
      : saved
        ? "Saved to wishlist"
        : "Save to wishlist";
  return (
    <button
      type="button"
      data-part="wishlist"
      aria-pressed={saved ? "true" : "false"}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm transition-opacity duration-[250ms] ${REVEAL}`}
    >
      <Heart
        className="size-4"
        strokeWidth={1.5}
        fill={saved ? "currentColor" : "none"}
      />
      {count > 0 && (
        <span
          data-part="wishlist-count"
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-none tabular-nums text-background"
        >
          {formatDisplayNumber(count, { locale })}
        </span>
      )}
    </button>
  );
}

export function ProductCard({
  row,
  locale,
  variant = "standard",
  withPrice = true,
  rank,
  badgeLabel,
  promise,
  showRating = false,
  sponsored = false,
  eager = false,
}: {
  row: WidgetRow;
  locale: Locale;
  variant?: CardVariant;
  withPrice?: boolean;
  /** 1-based position, rendered as a numbered badge by `rank_list`. */
  rank?: number;
  badgeLabel?: string;
  promise?: string;
  showRating?: boolean;
  sponsored?: boolean;
  eager?: boolean;
}) {
  const save = savePercent(row.priceMinor, row.compareAtMinor);
  const storeSlug = useStoreSlug();
  const imageUrls = row.imageUrls ?? [];
  const stockCount = row.stockCount;
  const lowStockCount =
    typeof stockCount === "number" &&
    stockCount > 0 &&
    stockCount <= LOW_STOCK_AT
      ? stockCount
      : null;
  const exclusive = row.tags?.includes("online-exclusive") === true;
  /** Sale ribbon owns the top-left corner; rank/custom badges displace. */
  const badgeSlot = save !== null ? "left-3 bottom-3" : "left-3 top-3";

  return (
    <article className="group relative flex h-full w-full max-w-full flex-col bg-transparent border-none shadow-none overflow-visible">
      {/* ── Image frame ── */}
      <div
        className="relative block w-full overflow-hidden bg-[#f5f3f0]"
        style={{ aspectRatio: variant === "wide" ? "4/3" : "3/4" }}
      >
        <a
          href={row.href ?? "#"}
          className="absolute inset-0 block overflow-hidden"
          tabIndex={-1}
          aria-hidden="true"
        >
          {/* Primary image */}
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt={row.title}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-all duration-[1200ms] ease-out opacity-100 group-hover:scale-[1.04] motion-reduce:transition-none"
              style={{ backgroundColor: TILE_BASE }}
            />
          ) : (
            /* Deterministic placeholder tile */
            <img
              src={`/api/public/ph/${placeholderSeed(row.id)}`}
              alt={row.title}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-all duration-[1200ms] ease-out opacity-100 group-hover:scale-[1.04] motion-reduce:transition-none"
              style={{ backgroundColor: TILE_BASE }}
            />
          )}

          {/* Secondary layers — staggered crossfade in on group hover */}
          {imageUrls.map((src, index) => (
            <img
              key={`${row.id}-${index}`}
              src={src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[250ms] ease-in-out opacity-0 group-hover:opacity-100 motion-reduce:transition-none ${LAYER_DELAYS[Math.min(index, LAYER_DELAYS.length - 1)] ?? ""}`}
            />
          ))}

          {/* "Shop Now" overlay — pure CSS lift, no JS state */}
          <div
            className="absolute inset-x-0 bottom-0 flex justify-center pb-5 opacity-0 translate-y-3 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none"
            aria-hidden="true"
          >
            <span className="bg-white/90 backdrop-blur-sm px-6 py-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-foreground shadow-sm">
              {locale === "bn" ? "কিনুন" : "Shop Now"}
            </span>
          </div>
        </a>

        {/* Sale ribbon — owns the top-left corner */}
        {save !== null && (
          <span
            data-part="badge"
            className="absolute left-3 top-3 z-10 bg-foreground px-2 py-0.5 text-[10px] font-semibold tabular-nums text-background"
          >
            {badgeLabel ? `${badgeLabel} ` : ""}−
            {formatDisplayNumber(save, { locale })}%
          </span>
        )}

        {/* Rank badge (or custom string badge) — displaces when a sale exists */}
        {typeof rank === "number" ? (
          <span
            data-part="badge"
            className={`absolute z-10 bg-[#1a1a1a] px-2 py-0.5 text-[9px] font-semibold tracking-wider uppercase tabular-nums text-white ${badgeSlot}`}
          >
            {formatDisplayNumber(rank, { locale })}
          </span>
        ) : (
          badgeLabel &&
          save === null && (
            <span
              data-part="badge"
              className={`absolute z-10 bg-[#1a1a1a] px-2 py-1 text-[9px] font-semibold tracking-wider uppercase text-white ${badgeSlot}`}
            >
              {badgeLabel}
            </span>
          )
        )}

        {/* Right column — wishlist heart, then editorial chips */}
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5">
          {storeSlug && row.variantId && (
            <WishlistHeart
              storeSlug={storeSlug}
              variantId={row.variantId}
              locale={locale}
            />
          )}
          {sponsored && (
            <span
              data-part="badge"
              className="bg-background/80 backdrop-blur-sm px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {locale === "bn" ? "স্পনসর্ড" : "Sponsored"}
            </span>
          )}
          {exclusive && (
            <span
              data-part="badge"
              className="bg-background/80 backdrop-blur-sm px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {locale === "bn" ? "অনলাইন একচেটিয়া" : "Online exclusive"}
            </span>
          )}
          {lowStockCount !== null && (
            <span
              data-part="badge"
              className="bg-background/80 backdrop-blur-sm px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {locale === "bn"
                ? `মাত্র ${formatDisplayNumber(lowStockCount, { locale })} টি বাকি`
                : `Only ${formatDisplayNumber(lowStockCount, { locale })} left`}
            </span>
          )}
        </div>

        {/* Quick View trigger — needs store context and a product handle */}
        {storeSlug && row.handle && (
          <QuickViewControl
            storeSlug={storeSlug}
            handle={row.handle}
            locale={locale}
          />
        )}
      </div>

      {/* ── Text body — left aligned editorial ── */}
      <a
        href={row.href ?? "#"}
        className="flex flex-col items-start text-left mt-3 px-1 gap-0.5 min-w-0 flex-1"
      >
        <p
          data-part="title"
          className="line-clamp-2 font-sans text-[13px] font-medium leading-snug text-[#1a1a1a] group-hover:text-[#1a1a1a]/70 transition-colors duration-300 motion-reduce:transition-none"
        >
          {row.title}
        </p>

        {withPrice && typeof row.priceMinor === "number" && (
          <p
            data-part="price"
            className="money flex flex-wrap items-baseline justify-start gap-2 text-[13px] font-normal text-[#1a1a1a] mt-0.5"
          >
            <span>
              {formatDisplayMoney(row.priceMinor, {
                locale,
                currency: row.currency ?? "BDT",
              })}
            </span>
            {typeof row.compareAtMinor === "number" &&
              row.compareAtMinor > (row.priceMinor ?? 0) && (
                <s className="text-[12px] text-[#1a1a1a]/40">
                  {formatDisplayMoney(row.compareAtMinor, {
                    locale,
                    currency: row.currency ?? "BDT",
                  })}
                </s>
              )}
          </p>
        )}

        {showRating && (
          <p className="text-[11px] text-foreground/40" aria-hidden="true">
            ★★★★★
          </p>
        )}

        {promise && (
          <p
            data-part="promise"
            className="line-clamp-1 text-[10px] font-semibold uppercase tracking-wider text-[#1a1a1a]/50 mt-1"
          >
            {promise}
          </p>
        )}

        {row.inStock === false && (
          <p className="text-[11px] font-medium text-foreground/40">
            {locale === "bn" ? "স্টক নেই" : "Out of stock"}
          </p>
        )}
      </a>
    </article>
  );
}

/** Box-model-identical placeholder skeleton. Same aspect ratio, same padding. */
export function ProductCardSkeleton({
  variant = "standard",
  withPrice = true,
}: {
  variant?: CardVariant;
  withPrice?: boolean;
}) {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div
        className={`w-full ${ASPECT[variant]} animate-pulse bg-muted/60`}
        style={{ aspectRatio: variant === "wide" ? "4/3" : "3/4" }}
      />
      <div className="mt-4 flex flex-col items-center gap-2 w-full px-2">
        <div className="h-3.5 w-3/4 animate-pulse rounded-sm bg-muted/60" />
        {withPrice && (
          <div className="h-3 w-1/3 animate-pulse rounded-sm bg-muted/60" />
        )}
      </div>
    </div>
  );
}
