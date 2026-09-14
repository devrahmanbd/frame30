/**
 * Storefront collection page.
 *
 * The active theme's published `collection` template owns the layout; this
 * route only supplies the collection's live products to the theme's widgets
 * and keeps a plain grid as the fallback when nothing is published.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { getStoreCollection } from "@/lib/storefront.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";

export const Route = createFileRoute("/store/$slug/c/$collectionSlug")({
  loader: async ({ params }) => {
    const data = await getStoreCollection({
      data: { slug: params.slug, collectionSlug: params.collectionSlug },
    });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Collection unavailable" }, { name: "robots", content: "noindex" }] };
    }
    const title =
      loaderData.seo?.metaTitle || `${loaderData.collection.name} — ${loaderData.merchant.name}`;
    const description =
      loaderData.seo?.metaDescription ||
      loaderData.collection.description ||
      `Shop ${loaderData.collection.name} at ${loaderData.merchant.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CollectionPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Collection not found</h1>
    </main>
  ),
});

function CollectionPage() {
  const { t } = useLang();
  const { merchant, collection, products, settings, ast, tokens, siteKit } = Route.useLoaderData();
  const slug = merchant.slug;

  const grid = (
    <>
      <h1 className="font-bangla-display text-2xl font-semibold sm:text-3xl">{collection.name}</h1>
      {collection.description && (
        <p className="mt-2 max-w-2xl text-muted-foreground">{collection.description}</p>
      )}
      {products.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          {t("No products in this collection yet.", "এই কালেকশনে এখনো কোনো পণ্য নেই।")}
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const variants = p.product_variants ?? [];
            const min = variants.length
              ? Math.min(...variants.map((v) => Number(v.price_amount_minor_int)))
              : 0;
            const inStock = variants.some((v) => v.stock_quantity > 0);
            return (
              <li key={p.id}>
                <Link
                  to="/store/$slug/p/$productSlug"
                  params={{ slug, productSlug: p.slug }}
                  className="group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="aspect-square bg-muted">
                    <StoreImage
                      image={p.image ?? null}
                      fallbackSrc={p.image_url}
                      alt={p.title}
                      sizes="(max-width: 768px) 50vw, 300px"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <h2 className="line-clamp-2 text-sm font-medium">{p.title}</h2>
                    <p className="money mt-1 text-sm font-semibold">
                      {fmtMinor(min, merchant.currency_code)}
                    </p>
                    <p
                      className={`mt-1 text-xs ${inStock ? "text-success-foreground" : "text-danger-foreground"}`}
                    >
                      {inStock ? t("In stock", "স্টকে আছে") : t("Out of stock", "স্টক নেই")}
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

  // A theme's collection template can carry a product grid, a collection grid,
  // or both. Feeding this collection's products into *both* slots printed the
  // page twice (two h1s, two grids), so the live rows go to the product grid
  // and only fall back to the collection grid when the template has no
  // product grid at all.
  const hasProductGrid = ast ? flattenAst(ast).some((s) => s.type === "product_grid") : false;

  return (
    <ThemeChrome
      template="collection"
      ast={ast}
      tokens={tokens}
      storeSlug={slug}
      merchantId={merchant.id}
      siteKit={siteKit}
      ownsPrimary
      chrome={<StoreHeader slug={slug} name={merchant.name} tagline={settings?.tagline} />}
      productSlot={grid}
      {...(hasProductGrid ? {} : { collectionSlot: grid })}
      fallback={grid}
    />
  );

}
