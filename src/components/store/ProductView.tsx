import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { fmtMinor } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { trackEvent } from "@/lib/traffic-client";
import { useSectionChannel } from "@/components/builder/useSectionChannel";
import { useLang } from "@/lib/i18n";
import { isCustomHostPath } from "@/lib/storefront-url";
import {
  ProductConversion,
  ScarcityBadge,
} from "@/components/store/ConversionSurfaces";
import type { getStoreProduct } from "@/lib/storefront.functions";
import { WishlistHeart } from "@/components/builder/primitives/ProductCard";
import { ChevronDown } from "lucide-react";

export type ProductPayload = Exclude<
  Awaited<ReturnType<typeof getStoreProduct>>,
  null
>;

// -----------------------------------------------------------------------------
// Extracted Editorial Commerce Components
// -----------------------------------------------------------------------------

export function ProductGallery({
  product,
}: {
  product: ProductPayload["product"];
}) {
  return (
    <div className="relative w-full overflow-hidden bg-[var(--theme-surface,#f5f3f0)] aspect-[3/4] sm:aspect-[4/5] md:aspect-auto md:h-[calc(100vh-6rem)] md:sticky md:top-24">
      <StoreImage
        image={product.image ?? null}
        fallbackSrc={product.image_url}
        alt={product.title}
        seed={product.id}
        priority
        sizes="(max-width: 768px) 100vw, 60vw"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

export function ProductInfo({
  product,
}: {
  product: ProductPayload["product"];
}) {
  const shortDesc = product.description?.split("\n").filter((l) => l.trim().length > 0)[0];
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-[32px] sm:text-[40px] font-medium tracking-tight text-foreground leading-[1.1]">
        {product.title}
      </h1>
      {shortDesc && (
        <p className="text-base text-muted-foreground leading-relaxed max-w-prose">
          {shortDesc}
        </p>
      )}
    </div>
  );
}

export function PriceBlock({
  variant,
  currencyCode,
}: {
  variant: NonNullable<ProductPayload["product"]["product_variants"]>[number] | undefined;
  currencyCode: string;
}) {
  const price = variant?.price_amount_minor_int ?? 0;
  const compareAt = variant?.compare_at_amount_minor_int;
  
  return (
    <div className="flex flex-col border-b border-border pb-6 mt-6">
      <div className="flex items-baseline gap-3">
        <p className="font-sans text-2xl font-medium tracking-tight text-foreground">
          {fmtMinor(Number(price), currencyCode)}
        </p>
        {compareAt && compareAt > price && (
          <p className="font-sans text-lg text-muted-foreground line-through decoration-muted-foreground/50">
            {fmtMinor(Number(compareAt), currencyCode)}
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        VAT included. Delivery calculated at checkout.
      </p>
      <ScarcityBadge stock={Number(variant?.stock_quantity ?? 0)} />
    </div>
  );
}

export function VariantSelector({
  variants,
  variantId,
  setVariantId,
}: {
  variants: NonNullable<ProductPayload["product"]["product_variants"]>;
  variantId: string;
  setVariantId: (id: string) => void;
}) {
  if (variants.length <= 1) return null;
  return (
    <fieldset className="mt-8">
      <legend className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Select Variant
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVariantId(v.id)}
            aria-pressed={v.id === variantId}
            className={`min-h-12 min-w-16 px-4 py-2 border transition-all ${
              v.id === variantId
                ? "border-foreground bg-foreground text-background font-medium shadow-sm"
                : "border-border bg-transparent text-foreground hover:border-foreground/40"
            }`}
          >
            {v.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function AddToCart({
  variant,
  merchant,
  custom,
  add,
  added,
  setAdded,
  settings,
}: {
  variant: NonNullable<ProductPayload["product"]["product_variants"]>[number] | undefined;
  merchant: ProductPayload["merchant"];
  custom: boolean;
  add: (id: string, qty: number) => void;
  added: boolean;
  setAdded: (v: boolean) => void;
  settings: ProductPayload["settings"];
}) {
  const { t } = useLang();
  const [qty, setQty] = useState(1);
  const stock = variant?.stock_quantity ?? 0;

  return (
    <div className="mt-8">
      <p
        className={`mb-4 text-sm font-medium ${
          stock > 0 ? "text-success-foreground" : "text-danger-foreground"
        }`}
      >
        {stock > 0
          ? t(`${stock} in stock`, `স্টকে ${stock} টি`)
          : t("Out of stock", "স্টক নেই")}
      </p>

      <div className="flex flex-wrap gap-3 items-center">
        {stock > 0 && (
          <div className="flex h-14 w-32 items-center border border-border">
            <button
              type="button"
              className="flex-1 h-full text-muted-foreground hover:text-foreground text-lg"
              onClick={() => setQty(Math.max(1, qty - 1))}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="flex-1 text-center font-medium text-sm tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              className="flex-1 h-full text-muted-foreground hover:text-foreground text-lg"
              onClick={() => setQty(Math.min(stock, qty + 1))}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={!variant || stock <= 0}
          onClick={() => {
            if (!variant) return;
            add(variant.id, qty);
            setAdded(true);
          }}
          className="h-14 flex-1 bg-foreground px-8 text-sm font-medium tracking-wider uppercase text-background disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {t("Add to cart", "কার্টে যোগ করুন")}
        </button>
        <div className="h-14 w-14 flex items-center justify-center border border-border group/btn cursor-pointer hover:border-foreground transition-colors">
          <WishlistHeart storeSlug={merchant.slug} variantId={variant?.id} locale="en" />
        </div>
      </div>
      <p
        aria-live="polite"
        className="mt-3 h-5 text-sm text-success-foreground font-medium"
      >
        {added ? t("Added to cart", "কার্টে যোগ হয়েছে") : ""}
      </p>

      <div className="mt-8 space-y-3 rounded border border-border bg-[var(--theme-surface,#f5f3f0)] p-4 text-sm">
        {(settings?.shipping_flat_minor_int ?? 0) > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-foreground">Delivery:</span>
            <span className="text-muted-foreground">Nationwide shipping available.</span>
          </div>
        )}
        {(settings?.cod_enabled ?? true) && (
          <div className="flex gap-2">
            <span className="font-semibold text-foreground">Payment:</span>
            <span className="text-muted-foreground">Cash on Delivery accepted.</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="font-semibold text-foreground">Returns:</span>
          <span className="text-muted-foreground">7-day easy returns policy.</span>
        </div>
      </div>
    </div>
  );
}

export function ProductDetails({
  product,
}: {
  product: {
    description?: string | null;
    tags?: string[] | null;
    category_id?: string | null;
  };
}) {
  const { t } = useLang();
  const [openDetails, setOpenDetails] = useState(true);
  const [openCare, setOpenCare] = useState(false);

  return (
    <div className="mt-12 border-t border-border">
      {product.description && (
        <details
          className="group border-b border-border"
          open={openDetails}
          onClick={(e) => {
            e.preventDefault();
            setOpenDetails(!openDetails);
          }}
        >
          <summary className="flex cursor-pointer items-center justify-between py-5 text-sm font-semibold uppercase tracking-wider text-foreground hover:text-foreground/80">
            {t("Details", "বিস্তারিত")}
            <ChevronDown className={`size-4 transition-transform duration-300 ${openDetails ? "rotate-180" : ""}`} />
          </summary>
          <div className="pb-6">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground mb-4">
              {product.description}
            </p>
            {((product.tags?.length ?? 0) > 0 || product.category_id) && (
              <div className="grid grid-cols-2 gap-4 text-sm mt-6 border-t pt-4">
                {product.category_id && (
                  <div>
                    <span className="block font-medium text-foreground mb-1">Category</span>
                    <span className="text-muted-foreground capitalize">{product.category_id.replace(/-/g, ' ')}</span>
                  </div>
                )}
                {product.tags && product.tags.length > 0 && (
                  <div>
                    <span className="block font-medium text-foreground mb-1">Attributes</span>
                    <span className="text-muted-foreground capitalize">{product.tags.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      )}

      <details
        className="group border-b border-border"
        open={openCare}
        onClick={(e) => {
          e.preventDefault();
          setOpenCare(!openCare);
        }}
      >
        <summary className="flex cursor-pointer items-center justify-between py-5 text-sm font-semibold uppercase tracking-wider text-foreground hover:text-foreground/80">
          {t("Care Instructions", "যত্ন")}
          <ChevronDown className={`size-4 transition-transform duration-300 ${openCare ? "rotate-180" : ""}`} />
        </summary>
        <div className="pb-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            Dry clean only. Store in a cool, dry place. Keep away from direct sunlight.
          </p>
        </div>
      </details>
    </div>
  );
}

export function ProductCraftStory({
  description,
}: {
  description: string | null;
}) {
  const { t } = useLang();
  
  if (!description) return null;
  
  // Only show craft story if the product description mentions handloom/jamdani/silk
  const descLower = description.toLowerCase();
  const hasCraft = ["jamdani", "handloom", "heritage", "silk"].some(word => descLower.includes(word));
  if (!hasCraft) return null;

  return (
    <section className="mt-24 mb-12 border-t border-border pt-16">
      <div className="grid md:grid-cols-[1fr_1fr] gap-12 lg:gap-24 items-center">
        <div className="order-2 md:order-1 space-y-6 max-w-lg">
          <h2 className="font-serif text-3xl sm:text-4xl text-foreground">
            {t("The Weave", "বুনন")}
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Authentic hand-loomed heritage, crafted by master artisans over hundreds of hours. 
            Each piece carries the legacy of traditional weaving techniques, utilizing fine mulberry 
            silk and precise geometric motifs that have been passed down through generations.
          </p>
        </div>
        <div className="order-1 md:order-2">
          <div className="aspect-[4/5] bg-[var(--theme-surface)] overflow-hidden">
            <img 
              src="/ph/songoskriti/hero_artisans_1790373071919.jpg" 
              alt="Artisan weaving jamdani" 
              className="w-full h-full object-cover grayscale opacity-90 mix-blend-multiply"
              onError={(e) => {
                // Fallback if image not found in public dir
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------

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
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);
  const {
    merchant,
    product,
    ast,
    tokens,
    siteKit,
    menus,
    installedPlugins,
    settings,
  } = data;
  
  const variants = product.product_variants ?? [];
  const [variantId, setVariantId] = useState(() => variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [added, setAdded] = useState(false);
  const { add } = useCart(merchant.slug);

  const variantChannel = useSectionChannel(merchant.slug, "variant");
  
  useEffect(() => {
    if (!variants || variants.length === 0) return;
    const variantIndex = variants.findIndex(v => v.id === variantId);
    variantChannel.clear();
    if (variantIndex >= 0) {
      variantChannel.push(variantIndex.toString());
    }
  }, [variantId, variants, merchant.slug]);

  useEffect(() => {
    trackEvent({
      entity: "product",
      action: "view",
      currencyCode: merchant.currency_code,
      valueMinorInt: variant?.price_amount_minor_int,
      payload: {
        item_id: product.id,
        item_name: product.title,
      },
    });
  }, [merchant.currency_code, product.id, product.title, variant?.price_amount_minor_int]);

  const hasPriceBlock = ast?.main?.some((s) => s.type === "price_block") ?? false;

  const media = <ProductGallery product={product} />;

  const priceBlock = <PriceBlock variant={variant} currencyCode={merchant.currency_code} />;

  const meta = <ProductInfo product={product} />;
  
  const pageContent = <ProductDetails product={{ description: product.description, tags: (product as any).tags, category_id: (product as any).category_id }} />;

  const addToCart = (
    <div>
      <VariantSelector variants={variants} variantId={variantId} setVariantId={setVariantId} />
      <AddToCart
        variant={variant}
        merchant={merchant}
        custom={custom}
        add={add}
        added={added}
        setAdded={setAdded}
        settings={settings}
      />
    </div>
  );

  const breadcrumb = (
    <nav
      aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
      className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6"
    >
      {custom ? (
        <Link to="/" className="hover:text-foreground transition-colors">
          {merchant.name}
        </Link>
      ) : (
        <Link
          to="/store/$slug"
          search={{ preview_token: undefined }}
          params={{ slug: merchant.slug }}
          className="hover:text-foreground transition-colors"
        >
          {merchant.name}
        </Link>
      )}
      <span aria-hidden className="mx-2"> / </span>
      <span className="text-foreground">{product.title}</span>
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
    <div className="mx-auto max-w-[var(--fq-container,1440px)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-12 lg:gap-16 md:grid-cols-[60fr_40fr] items-start">
        {media}
        <div className="w-full max-w-xl">
          {breadcrumb}
          {meta}
          {priceBlock}
          {addToCart}
          {pageContent}
        </div>
      </div>
      <ProductCraftStory description={product.description} />
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
            <StoreHeader
              slug={merchant.slug}
              name={merchant.name}
              menus={menus}
            />
          }
          contextSlots={{
            breadcrumb,
            product_media: media,
            price_block: priceBlock,
            add_to_cart: addToCart,
            product_meta: meta,
            page_content: pageContent,
          }}
          fallback={fallback}
        />
      </PluginLayer>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16">{conversion}</div>
    </>
  );
}
