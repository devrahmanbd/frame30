import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { SupportWidget } from "@/components/store/SupportWidget";
import {
  getStoreProduct,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
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

/**
 * Custom-host product page (`microscrop.shop/p/<slug>`).
 *
 * Host-gated: resolves the request host to a merchant and serves its PDP.
 * Off custom hosts it 404s (platform hosts serve `/store/<slug>/p/...`;
 * the server gate 410s those). Same chrome + data as the path route, so
 * SPA hydration stays on this route instead of bouncing to notFound.
 */
export const Route = createFileRoute("/p/$productSlug")({
  loader: async ({ params }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (!host) throw notFound();
    const data = await getStoreProduct({
      data: { slug: host.merchantSlug, productSlug: params.productSlug },
    });
    if (!data)
      throw await handleMissingStoreUrl(
        host.merchantSlug,
        `/p/${params.productSlug}`,
      );
    return data;
  },
  head: ({ loaderData }) => {
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
      path: `/p/${loaderData.product.slug}`,
      storePath: `/`,
      storeName: loaderData.merchant.name,
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
  const { merchant, product, settings, siteKit, menus, installedPlugins } =
    Route.useLoaderData();
  const variants = product.product_variants ?? [];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const { add } = useCart(merchant.slug);
  const [added, setAdded] = useState(false);
  const recentlyViewed = useSectionChannel(merchant.slug, "recentlyViewed");
  const pushRecent = recentlyViewed.push;
  useEffect(() => {
    pushRecent(product.id);
  }, [pushRecent, product.id]);

  useEffect(() => {
    trackEvent({
      entity: "product",
      action: "view",
      payload: { slug: product.slug },
    });
  }, [product.slug]);

  const media = (
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
  );

  const priceBlock = (
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
      <p className="mt-1 text-xs text-muted-foreground">
        VAT shown at checkout
      </p>
      <ScarcityBadge stock={Number(variant?.stock_quantity ?? 0)} />
    </div>
  );

  const addToCart = (
    <div>
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

      <p
        className={`mt-4 text-sm ${
          (variant?.stock_quantity ?? 0) > 0
            ? "text-success-foreground"
            : "text-danger-foreground"
        }`}
      >
        {(variant?.stock_quantity ?? 0) > 0
          ? t(
              `${variant?.stock_quantity} in stock`,
              `স্টকে ${variant?.stock_quantity} টি`,
            )
          : t("Out of stock", "স্টক নেই")}
      </p>

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

      <ul className="mt-6 flex flex-wrap gap-2 text-xs">
        {(settings?.cod_enabled ?? true) && (
          <li className="rounded-full bg-warning-soft px-3 py-1 text-warning-foreground">
            COD
          </li>
        )}
        {(settings?.mfs_enabled ?? true) && (
          <li className="rounded-full bg-success-soft px-3 py-1 text-success-foreground">
            bKash / Nagad
          </li>
        )}
      </ul>
    </div>
  );

  const meta = product.description ? (
    <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
      {product.description}
    </p>
  ) : null;

  const breadcrumb = (
    <nav
      aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
      className="text-xs text-muted-foreground"
    >
      <Link to="/" className="underline">
        {merchant.name}
      </Link>
      <span aria-hidden> / </span>
      <span>{product.title}</span>
    </nav>
  );

  const conversion = (
    <ProductConversion
      slug={merchant.slug}
      productId={product.id}
      currency={merchant.currency_code}
    />
  );

  const fallback = (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="md:col-span-2">{breadcrumb}</div>
      {media}
      <div>
        {priceBlock}
        {addToCart}
        {meta && (
          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-sm font-semibold">
              {t("Description", "বিবরণ")}
            </h2>
            <div className="mt-2 text-sm">{meta}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <ThemeChrome
        template="product"
        storeSlug={merchant.slug}
        merchantId={merchant.id}
        siteKit={siteKit}
      installedPlugins={installedPlugins}
        ownsPrimary
        chrome={
          <>
            <StoreHeader slug={merchant.slug} name={merchant.name} menus={menus} />
            {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
            {/* <SupportWidget slug={merchant.slug} /> */}
          </>
        }
        fallback={fallback}
      />
      <div className="mx-auto max-w-6xl px-4 pb-16">{conversion}</div>
    </>
  );
}
