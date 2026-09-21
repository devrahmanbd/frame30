import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import {
  getStoreCollection,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";

/**
 * Custom-host collection page (`microscrop.shop/c/<slug>`).
 *
 * Host-gated like `/p/$productSlug`: resolves the request host, serves the
 * merchant collection. Same-route SSR + hydration (no rewrite).
 */
export const Route = createFileRoute("/c/$collectionSlug")({
  loader: async ({ params }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (!host) throw notFound();
    const data = await getStoreCollection({
      data: { slug: host.merchantSlug, collectionSlug: params.collectionSlug },
    });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Collection unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title =
      loaderData.seo?.metaTitle ||
      `${loaderData.collection.name} — ${loaderData.merchant.name}`;
    const description =
      loaderData.seo?.metaDescription ||
      loaderData.collection.description ||
      `Shop ${loaderData.collection.name} at ${loaderData.merchant.name}.`;
    const canonicalPath = `/c/${loaderData.collection.slug}`;
    const canonical = loaderData.origin
      ? `${loaderData.origin}${canonicalPath}`
      : canonicalPath;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
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
  const { merchant, collection, products, settings, ast, tokens, siteKit, menus } =
    Route.useLoaderData();
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

  const hasProductGrid = ast
    ? flattenAst(ast).some((s) => s.type === "product_grid")
    : false;

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
      {...(hasProductGrid ? {} : { collectionSlot: grid })}
      fallback={grid}
    />
  );
}
