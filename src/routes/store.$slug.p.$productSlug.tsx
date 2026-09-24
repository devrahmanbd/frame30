import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { SupportWidget } from "@/components/store/SupportWidget";
import { getStoreProduct } from "@/lib/storefront.functions";
import { handleMissingStoreUrl } from "@/lib/missing-url";
import { fmtMinor } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { trackEvent } from "@/lib/traffic-client";
import { useSectionChannel } from "@/components/builder/useSectionChannel";
import { useLang } from "@/lib/i18n";
import { buildProductHead } from "@/lib/theme-seo";
import { verificationTags } from "@/lib/search-console";
import {
  ProductConversion,
  ScarcityBadge,
} from "@/components/store/ConversionSurfaces";

export const Route = createFileRoute("/store/$slug/p/$productSlug")({
  loader: async ({ params }) => {
    const data = await getStoreProduct({
      data: { slug: params.slug, productSlug: params.productSlug },
    });
    if (!data)
      throw await handleMissingStoreUrl(
        params.slug,
        `/store/${params.slug}/p/${params.productSlug}`,
      );
    return data;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Product unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const variants = loaderData.product.product_variants ?? [];
    const cheapest = variants
      .map((v) => Number(v.price_amount_minor_int ?? 0))
      .sort((x, y) => x - y)[0];
    const base = buildProductHead({
      origin: loaderData.origin,
      path: `/store/${params.slug}/p/${loaderData.product.slug}`,
      storePath: `/store/${params.slug}`,
      storeName: loaderData.merchant.name,
      themeKey: loaderData.themeKey,
      seo: loaderData.seo,
      product: {
        title: loaderData.product.title,
        slug: loaderData.product.slug,
        description: loaderData.product.description,
        image_url: loaderData.product.image_url,
        sku: variants[0]?.sku ?? null,
      },
      currency: loaderData.merchant.currency_code,
      priceMinor: cheapest ?? 0,
      inStock: variants.some((v) => Number(v.stock_quantity ?? 0) > 0),
      // Phase 7.2: rating, reviews, returns and delivery terms come from the
      // same rows the page renders — never invented for the crawler.
      reviews: loaderData.reviews ?? [],
      returnPolicy: { days: 7, fees: "shopper" },
      shipping: {
        flatMinor: Number(loaderData.settings?.shipping_flat_minor_int ?? 0),
        freeThresholdMinor:
          loaderData.settings?.free_shipping_threshold_minor_int ?? null,
      },
    });
    return {
      ...base,
      meta: [
        ...(base.meta ?? []),
        ...verificationTags(loaderData.siteKit.verification),
      ],
    };
  },
  component: ProductDetail,
  notFoundComponent: ProductNotFound,
});

function ProductNotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Product not found", "পণ্যটি পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

function ProductDetail() {
  const { t } = useLang();
  const {
    merchant,
    product,
    settings,
    ast,
    tokens,
    siteKit,
    menus,
    installedPlugins,
  } = Route.useLoaderData();
  const variants = product.product_variants ?? [];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const { add } = useCart(merchant.slug);
  const [added, setAdded] = useState(false);
  // Feeds the cross-section channel that `recently_viewed` reads; capped and
  // per-store, so it survives navigation without a refetch.
  const recentlyViewed = useSectionChannel(merchant.slug, "recentlyViewed");
  const pushRecent = recentlyViewed.push;
  useEffect(() => {
    pushRecent(product.id);
  }, [pushRecent, product.id]);

  // Funnel step: product views. Recorded once per product, never with anything
  // that identifies the shopper.
  useEffect(() => {
    trackEvent({
      entity: "product",
      action: "view",
      payload: { slug: product.slug },
    });
  }, [product.slug]);

  const themed = ast && ast.main.length > 0 ? ast : null;
  const sections = themed
    ? [...themed.header, ...themed.main, ...themed.footer]
    : [];
  const hasPriceBlock = sections.some((s) => s.type === "price_block");

  const media = (
    <div className="aspect-[3/4] w-full overflow-hidden bg-muted/20">
      <StoreImage
        image={product.image ?? null}
        fallbackSrc={product.image_url}
        alt={product.title}
        seed={product.id}
        priority
        sizes="(max-width: 768px) 100vw, 600px"
        className="size-full object-cover object-top"
      />
    </div>
  );

  const priceBlock = (
    <div className="mb-6">
      <h1 className="font-bangla-display text-2xl sm:text-3xl lg:text-4xl leading-tight text-foreground/90 font-medium">
        {product.title}
      </h1>
      <p className="money mt-4 text-xl font-semibold tracking-wide text-foreground">
        {fmtMinor(
          Number(variant?.price_amount_minor_int ?? 0),
          merchant.currency_code,
        )}
      </p>
      <p className="mt-1.5 text-[11px] font-medium tracking-wider fq-caps text-muted-foreground">
        VAT included. Free shipping available.
      </p>
      <div className="mt-6">
        <ScarcityBadge stock={Number(variant?.stock_quantity ?? 0)} />
      </div>
    </div>
  );

  const addToCart = (
    <div className="mt-8">
      {variants.length > 1 && (
        <fieldset className="mb-8 border-t border-border/60 pt-6">
          <legend className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground mb-4">
            {t("Select Variant", "ভ্যারিয়েন্ট বেছে নিন")}
          </legend>
          <div className="flex flex-wrap gap-3">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={v.id === variant?.id}
                className={`min-h-12 min-w-16 px-5 text-[13px] font-medium tracking-wide transition-colors border ${
                  v.id === variant?.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-transparent text-foreground hover:border-foreground/40"
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-4">
        <button
          type="button"
          disabled={!variant || variant.stock_quantity <= 0}
          onClick={() => {
            if (!variant) return;
            add(variant.id, 1);
            setAdded(true);
          }}
          className="min-h-14 w-full bg-foreground px-8 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {(variant?.stock_quantity ?? 0) > 0
            ? t("Add to Bag", "ব্যাগ-এ যোগ করুন")
            : t("Out of Stock", "স্টক নেই")}
        </button>
        <Link
          to="/store/$slug/checkout"
          params={{ slug: merchant.slug }}
          className="min-h-14 flex items-center justify-center w-full border border-border px-8 text-[13px] font-bold fq-caps tracking-widest text-foreground hover:bg-muted/50 transition-colors"
        >
          {t("Checkout Now", "এখনই চেকআউট করুন")}
        </Link>
      </div>

      <p
        aria-live="polite"
        className="mt-3 h-5 text-[13px] font-medium text-success-foreground"
      >
        {added ? t("Added to your bag", "আপনার ব্যাগে যোগ হয়েছে") : ""}
      </p>

      <ul className="mt-8 flex flex-wrap items-center gap-3 text-[11px] font-semibold fq-caps tracking-widest text-muted-foreground">
        {(settings?.cod_enabled ?? true) && (
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/20"></span>
            Cash on Delivery
          </li>
        )}
        {(settings?.mfs_enabled ?? true) && (
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/20"></span>
            bKash / Nagad
          </li>
        )}
      </ul>
    </div>
  );

  const meta = product.description ? (
    <div className="mt-12 border-t border-border/60 pt-8">
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground mb-4">
        {t("Product Details", "পণ্যের বিবরণ")}
      </h2>
      <p className="whitespace-pre-line leading-relaxed text-muted-foreground text-[13.5px]">
        {product.description}
      </p>
    </div>
  ) : null;

  const breadcrumb = (
    <nav
      aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
      className="text-xs text-muted-foreground"
    >
      <Link
        to="/store/$slug"
        search={{ preview_token: undefined }}
        params={{ slug: merchant.slug }}
        className="underline"
      >
        {merchant.name}
      </Link>
      <span aria-hidden> / </span>
      <span>{product.title}</span>
    </nav>
  );

  // Below-the-fold conversion surfaces: hydrated client-side so the priced,
  // indexable part of the page never waits on personalisation.
  const conversion = (
    <ProductConversion
      slug={merchant.slug}
      productId={product.id}
      currency={merchant.currency_code}
    />
  );

  const fallback = (
    <div className="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">{breadcrumb}</div>
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16 items-start">
        <div className="sticky top-24">{media}</div>
        <div className="py-2">
          {priceBlock}
          {addToCart}
          {meta}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PluginLayer plugins={installedPlugins}>
        <ThemeChrome
          template="product"
          storeSlug={merchant.slug}
          merchantId={merchant.id}
          ast={ast}
          tokens={tokens}
          siteKit={siteKit}
          ownsPrimary={hasPriceBlock}
          chrome={
            <>
              <StoreHeader
                slug={merchant.slug}
                name={merchant.name}
                menus={menus}
              />
              {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
              {/* <SupportWidget slug={merchant.slug} /> */}
            </>
          }
          contextSlots={{
            breadcrumb,
            product_media: media,
            price_block: priceBlock,
            add_to_cart: addToCart,
            product_meta: meta,
          }}
          fallback={fallback}
        />
      </PluginLayer>
      <div className="mx-auto max-w-6xl px-4 pb-16">{conversion}</div>
    </>
  );
}
