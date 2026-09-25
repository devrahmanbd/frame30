import { Link, useRouterState } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";
import { rebaseMenuHref } from "@/lib/menus/menu";
import { isCustomHostPath } from "@/lib/storefront-url";
import type { getStoreCollection } from "@/lib/storefront.functions";

export type CollectionPayload = Exclude<Awaited<ReturnType<typeof getStoreCollection>>, null>;

export function CollectionView({ data }: { data: CollectionPayload }) {
  const { t } = useLang();
  const {
    merchant,
    collection,
    products,
    settings,
    ast,
    tokens,
    siteKit,
    menus,
    installedPlugins,
  } = data;
  const slug = merchant.slug;
  const categories = menus?.header?.slice(0, 10) ?? [];
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);

  const grid = (
    <>
      <div className="text-center md:text-left mb-10">
        <h1 className="font-bangla-display text-3xl font-semibold sm:text-4xl">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="mt-3 max-w-2xl text-muted-foreground md:mx-0 mx-auto">
            {collection.description}
          </p>
        )}
      </div>

      {categories.length > 0 && (
        <nav
          aria-label="Categories"
          className="mb-10 overflow-x-auto scrollbar-none border-b border-border/60 pb-4"
        >
          <ul className="flex items-center gap-8 min-w-max">
            {categories.map((node) => {
              if (!node.label) return null;
              const href = rebaseMenuHref(node.url || "#", custom ? "" : `/store/${slug}`);
              return (
                <li key={node.id}>
                  <a
                    href={href}
                    className="text-[13px] font-semibold tracking-wider fq-caps text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {node.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {products.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          {t(
            "No products in this collection yet.",
            "এই কালেকশনে এখনো কোনো পণ্য নেই।"
          )}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {products.map((p) => {
            const variants = p.product_variants ?? [];
            const min = variants.length
              ? Math.min(
                  ...variants.map((v) => Number(v.price_amount_minor_int))
                )
              : 0;
            const inStock = variants.some((v) => v.stock_quantity > 0);
            
            const cardBody = (
              <>
                <div className="aspect-[3/4] w-full overflow-hidden bg-muted/30">
                  <StoreImage
                    image={p.image ?? null}
                    fallbackSrc={p.image_url}
                    alt={p.title}
                    seed={p.id}
                    sizes="(max-width: 768px) 50vw, 300px"
                    className="size-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="mt-4">
                  <h2 className="text-[13px] font-medium leading-relaxed text-foreground/90">
                    {p.title}
                  </h2>
                  <p className="money mt-1 text-[13px] font-semibold tracking-wide">
                    {fmtMinor(min, merchant.currency_code)}
                  </p>
                  <p
                    className={`mt-1.5 text-[11px] font-medium fq-caps tracking-widest ${inStock ? "text-muted-foreground" : "text-danger-foreground"}`}
                  >
                    {inStock
                      ? t("Available", "স্টকে আছে")
                      : t("Out of stock", "স্টক নেই")}
                  </p>
                </div>
              </>
            );

            return (
              <li key={p.id}>
                {custom ? (
                  <Link
                    to="/p/$productSlug"
                    params={{ productSlug: p.slug }}
                    className="group block"
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <Link
                    to="/store/$slug/p/$productSlug"
                    params={{ slug, productSlug: p.slug }}
                    className="group block"
                  >
                    {cardBody}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const hasProductGrid = ast
    ? flattenAst(ast).some((s) => s.type === "product_grid")
    : false;

  return (
    <PluginLayer plugins={installedPlugins}>
      <ThemeChrome
        template="collection"
        ast={ast}
        tokens={tokens}
        storeSlug={slug}
        merchantId={merchant.id}
        siteKit={siteKit}
        ownsPrimary={custom}
        chrome={
          <StoreHeader
            slug={slug}
            name={merchant.name}
            tagline={settings?.tagline}
            menus={menus}
          />
        }
        productSlot={grid}
        {...(hasProductGrid ? {} : { collectionSlot: grid })}
        fallback={grid}
      />
    </PluginLayer>
  );
}
