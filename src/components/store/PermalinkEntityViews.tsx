/**
 * Entity views for custom-base permalinks served through the catch-all.
 *
 * When a merchant moves off `/c/`, `/p/`, `/pages`, the static file routes
 * no longer match and the `$` catch-all takes over. These views render the
 * resolved entity with the same chrome + data contracts as the static
 * routes (ThemeChrome, StoreHeader, PluginLayer) in compact form. The
 * static routes are untouched — this file only serves URLs they cannot.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import type { getStoreCollection, getStoreProduct } from "@/lib/storefront.functions";
import type { getStorePageFn } from "@/lib/storefront-search.functions";

type CollectionData = NonNullable<Awaited<ReturnType<typeof getStoreCollection>>>;
type ProductData = NonNullable<Awaited<ReturnType<typeof getStoreProduct>>>;
type PageData = NonNullable<Awaited<ReturnType<typeof getStorePageFn>>>;

export function CollectionEntityView({ data }: { data: CollectionData }) {
  const { t } = useLang();
  const { merchant, collection, products, settings, ast, tokens, siteKit, menus } =
    data;
  const slug = merchant.slug;
  const grid = (
    <>
      <h1 className="font-bangla-display text-2xl font-semibold sm:text-3xl">
        {collection.name}
      </h1>
      {collection.description && (
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {collection.description}
        </p>
      )}
      {products.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          {t(
            "No products in this collection yet.",
            "এই কালেকশনে এখনো কোনো পণ্য নেই।",
          )}
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const variants = p.product_variants ?? [];
            const min = variants.length
              ? Math.min(
                  ...variants.map((v) => Number(v.price_amount_minor_int)),
                )
              : 0;
            const inStock = variants.some((v) => v.stock_quantity > 0);
            return (
              <li key={p.id}>
                <Link
                  to="/p/$productSlug"
                  params={{ productSlug: p.slug }}
                  className="group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="aspect-square bg-muted">
                    <StoreImage
                      image={p.image ?? null}
                      fallbackSrc={p.image_url}
                      alt={p.title}
                      seed={p.id}
                      sizes="(max-width: 768px) 50vw, 300px"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <h2 className="line-clamp-2 text-sm font-medium">
                      {p.title}
                    </h2>
                    <p className="money mt-1 text-sm font-semibold">
                      {fmtMinor(min, merchant.currency_code)}
                    </p>
                    <p
                      className={`mt-1 text-xs ${inStock ? "text-success-foreground" : "text-danger-foreground"}`}
                    >
                      {inStock
                        ? t("In stock", "স্টকে আছে")
                        : t("Out of stock", "স্টক নেই")}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
  return (
    <ThemeChrome
      template="collection"
      ast={ast}
      tokens={tokens}
      storeSlug={slug}
      merchantId={merchant.id}
      siteKit={siteKit}
      ownsPrimary
      chrome={
        <StoreHeader
          slug={slug}
          name={merchant.name}
          tagline={settings?.tagline}
          menus={menus}
        />
      }
      productSlot={grid}
      collectionSlot={grid}
      fallback={grid}
    />
  );
}

export function ProductEntityView({ data }: { data: ProductData }) {
  const { t } = useLang();
  const { merchant, product, settings, ast, tokens, siteKit, menus } = data;
  const variants = product.product_variants ?? [];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const { add } = useCart(merchant.slug);
  const [added, setAdded] = useState(false);

  const fallback = (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-fq-lg border border-border bg-muted">
        <StoreImage
          image={product.image ?? null}
          fallbackSrc={product.image_url}
          alt={product.title}
          seed={product.id}
          priority
          sizes="(max-width: 768px) 100vw, 600px"
          className="size-full object-cover"
        />
      </div>
      <div>
        <h1 className="font-bangla-display text-2xl font-bold sm:text-3xl">
          {product.title}
        </h1>
        <p className="money mt-3 text-2xl font-semibold">
          {fmtMinor(
            Number(variant?.price_amount_minor_int ?? 0),
            merchant.currency_code,
          )}
        </p>
        {variants.length > 1 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">
              {t("Variant", "ভ্যারিয়েন্ট")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={v.id === variant?.id}
                  className={`min-h-11 rounded-fq-md border px-3 text-sm ${
                    v.id === variant?.id
                      ? "border-primary bg-info-soft text-info-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!variant || variant.stock_quantity <= 0}
            onClick={() => {
              if (!variant) return;
              add(variant.id, 1);
              setAdded(true);
            }}
            className="min-h-12 rounded-fq-md bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t("Add to cart", "কার্টে যোগ করুন")}
          </button>
          <Link
            to="/checkout"
            className="min-h-12 rounded-fq-md border border-border px-6 text-sm font-medium leading-[3rem]"
          >
            {t("Checkout", "চেকআউট")}
          </Link>
        </div>
        <p
          aria-live="polite"
          className="mt-2 h-5 text-sm text-success-foreground"
        >
          {added ? t("Added to cart", "কার্টে যোগ হয়েছে") : ""}
        </p>
        {product.description && (
          <p className="mt-6 whitespace-pre-line leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <ThemeChrome
      template="product"
      storeSlug={merchant.slug}
      merchantId={merchant.id}
      ast={ast}
      tokens={tokens}
      siteKit={siteKit}
      chrome={
        <StoreHeader slug={merchant.slug} name={merchant.name} menus={menus} />
      }
      fallback={fallback}
    />
  );
}

export function PageEntityView({ data }: { data: PageData }) {
  const { t } = useLang();
  const { merchant, page, html, ast, tokens, siteKit, menus } = data;
  return (
    <ThemeChrome
      template="page"
      storeSlug={merchant.slug}
      merchantId={merchant.id}
      ast={ast}
      tokens={tokens}
      siteKit={siteKit}
      ownsPrimary
      chrome={
        <StoreHeader slug={merchant.slug} name={merchant.name} menus={menus} />
      }
      fallback={
        <article>
          <h1 className="font-bangla-display text-3xl font-bold">
            {page.title}
          </h1>
          {page.excerpt && (
            <p className="mt-2 text-muted-foreground">{page.excerpt}</p>
          )}
          <div
            className="fq-prose mt-6 space-y-4 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      }
    />
  );
}
