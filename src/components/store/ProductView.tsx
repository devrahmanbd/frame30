import { useEffect, useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { SupportWidget } from "@/components/store/SupportWidget";
import { fmtMinor } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { trackEvent } from "@/lib/traffic-client";
import { useSectionChannel } from "@/components/builder/useSectionChannel";
import { useLang } from "@/lib/i18n";
import {
  ProductConversion,
  ScarcityBadge,
} from "@/components/store/ConversionSurfaces";
import type { getStoreProduct } from "@/lib/storefront.functions";

export type ProductPayload = Exclude<Awaited<ReturnType<typeof getStoreProduct>>, null>;

export function ProductNotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Product not found", "পণ্যটি পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

export function ProductView({ data }: { data: ProductPayload }) {
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
  } = data;
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

  const themed = ast && ast.main.length > 0 ? ast : null;
  const sections = themed
    ? [...themed.header, ...themed.main, ...themed.footer]
    : [];
  const hasPriceBlock = sections.some((s) => s.type === "price_block");

  const media = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <div className="overflow-hidden rounded-fq-lg bg-muted">
        <StoreImage
          image={product.image ?? null}
          fallbackSrc={product.image_url}
          alt={product.title}
          seed={product.id}
          sizes="(max-width: 1024px) 50vw, 500px"
          className="aspect-square size-full object-cover"
          priority
        />
      </div>
      {variants.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {variants.slice(0, 4).map((v) => (
            <button
              key={v.id}
              onClick={() => setVariantId(v.id)}
              type="button"
              className={`aspect-square overflow-hidden rounded-fq-md border-2 ${variantId === v.id ? "border-primary" : "border-transparent"}`}
            >
              <StoreImage
                image={v.image ?? null}
                fallbackSrc={v.image_url ?? product.image_url}
                alt={v.sku ?? product.title}
                seed={v.id}
                sizes="100px"
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const priceMinor = Number(variant?.price_amount_minor_int ?? 0);
  const retailMinor = variant?.retail_price_minor_int
    ? Number(variant.retail_price_minor_int)
    : null;
  const inStock = Number(variant?.stock_quantity ?? 0) > 0;

  const titleLockup = (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-bangla-display text-2xl font-semibold sm:text-3xl">
          {product.title}
        </h1>
        {variant?.sku && (
          <p className="font-mono text-sm text-muted-foreground">
            {variant.sku}
          </p>
        )}
      </div>
      <div className="flex items-baseline gap-3">
        <p className="money text-2xl font-bold">
          {fmtMinor(priceMinor, merchant.currency_code)}
        </p>
        {retailMinor && retailMinor > priceMinor && (
          <p className="money text-lg text-muted-foreground line-through">
            {fmtMinor(retailMinor, merchant.currency_code)}
          </p>
        )}
      </div>
      <ScarcityBadge stock={Number(variant?.stock_quantity ?? 0)} />
      {product.description && (
        <div className="prose prose-sm dark:prose-invert">
          {product.description}
        </div>
      )}
    </div>
  );

  const buyLockup = (
    <div className="space-y-4">
      <ProductConversion
        product={product}
        variant={variant}
        merchant={merchant}
        priceMinor={priceMinor}
        retailMinor={retailMinor}
        onAdd={() => {
          if (variant) {
            add({ variantId: variant.id, quantity: 1 });
            setAdded(true);
            setTimeout(() => setAdded(false), 2000);
          }
        }}
        added={added}
      />
    </div>
  );

  const inner = (
    <main className="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16">
        {media}
        <div className="mt-8 lg:mt-0">
          <div className="sticky top-24 space-y-8">
            {titleLockup}
            {buyLockup}
          </div>
        </div>
      </div>
    </main>
  );

  return (
    <ThemeChrome
      merchant={merchant}
      settings={settings}
      ast={ast}
      tokens={tokens}
      menus={menus}
      siteKit={siteKit}
      productLockups={
        hasPriceBlock ? undefined : { title: titleLockup, buy: buyLockup }
      }
    >
      <StoreHeader />
      {inner}
      <PluginLayer
        plugins={installedPlugins}
        context={{ kind: "product", id: product.id }}
      />
      <SupportWidget merchant={merchant} settings={settings} />
    </ThemeChrome>
  );
}
