import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { resolvePathFn } from "@/lib/url-resolve.functions";
import { ArticleView } from "@/components/store/ArticleView";
import { ProductView } from "@/components/store/ProductView";
import { CollectionView } from "@/components/store/CollectionView";
import { PageView } from "@/components/store/PageView";
import { useLang } from "@/lib/i18n";
import { buildProductHead, buildPageHead } from "@/lib/theme-seo";
import { verificationTags } from "@/lib/search-console";

/**
 * Catch-all permalink resolver.
 *
 * Matched last, after every literal route, so it only ever sees paths the app
 * does not otherwise serve. It turns merchant-owned permalink patterns
 * (`/journal/2026/08/jute-bags`) into real pages, honours the redirect table,
 * and records genuine misses into the 404 queue that the permalink desk
 * promotes into redirects.
 */
export const Route = createFileRoute("/$")({
  loader: async ({ params, location }) => {
    const path = location.pathname;
    const result = await resolvePathFn({ data: { path } });
    if (result.resolution.type === "redirect") {
      throw redirect({
        href: result.resolution.to,
        statusCode: result.resolution.status === 302 ? 302 : 301,
      });
    }
    if (result.resolution.type === "gone" || result.resolution.type === "miss") throw notFound();

    if (result.target) {
      if (result.target.kind === "product") {
        const { getStoreProduct } = await import("@/lib/storefront.functions");
        const productData = await getStoreProduct({
          data: { slug: result.target.merchantSlug, productSlug: result.target.slug },
        });
        if (!productData) throw notFound();
        return { type: "product", data: productData, target: result.target } as const;
      }
      if (result.target.kind === "collection") {
        const { getStoreCollection } = await import("@/lib/storefront.functions");
        const collectionData = await getStoreCollection({
          data: { slug: result.target.merchantSlug, collectionSlug: result.target.slug },
        });
        if (!collectionData) throw notFound();
        return { type: "collection", data: collectionData, target: result.target } as const;
      }
      if (result.target.kind === "page") {
        const { getStorePageFn } = await import("@/lib/storefront-search.functions");
        const pageData = await getStorePageFn({
          data: { slug: result.target.merchantSlug, pageSlug: result.target.slug },
        });
        if (!pageData) throw notFound();
        return { type: "page", data: pageData, target: result.target } as const;
      }
    }

    if (!result.article) throw notFound();
    return { 
      type: "article", 
      article: result.article.article, 
      merchant: result.article.merchant, 
      canonicalPath: path, 
      origin: (result as any).origin 
    } as const;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Page not found" },
          { name: "robots", content: "noindex" },
        ],
      };
    }

    if (loaderData.type === "product") {
      const { data } = loaderData;
      const variants = data.product.product_variants ?? [];
      const cheapest = variants
        .map((v) => Number(v.price_amount_minor_int ?? 0))
        .sort((x, y) => x - y)[0];
      const base = buildProductHead({
        origin: data.origin,
        path: loaderData.target.canonicalPath,
        storePath: `/`,
        storeName: data.merchant.name,
        themeKey: data.themeKey,
        seo: data.seo,
        product: {
          title: data.product.title,
          slug: data.product.slug,
          description: data.product.description,
          image_url: data.product.image_url,
          sku: variants[0]?.sku ?? null,
        },
        currency: data.merchant.currency_code,
        priceMinor: cheapest ?? 0,
        inStock: variants.some((v) => Number(v.stock_quantity ?? 0) > 0),
        reviews: data.reviews ?? [],
        returnPolicy: { days: 7, fees: "shopper" },
        shipping: {
          flatMinor: Number(data.settings?.shipping_flat_minor_int ?? 0),
          freeThresholdMinor:
            data.settings?.free_shipping_threshold_minor_int ?? null,
        },
      });
      return {
        ...base,
        meta: [
          ...(base.meta ?? []),
          ...verificationTags(data.siteKit.verification),
        ],
      };
    }

    if (loaderData.type === "collection") {
      const { data } = loaderData;
      const title =
        data.seo?.metaTitle ||
        `${data.collection.name} — ${data.merchant.name}`;
      const description =
        data.seo?.metaDescription ||
        data.collection.description ||
        `Shop ${data.collection.name} at ${data.merchant.name}.`;
      const canonical = data.origin
        ? `${data.origin}${loaderData.target.canonicalPath}`
        : loaderData.target.canonicalPath;
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
    }

    if (loaderData.type === "page") {
      const { data } = loaderData;
      const base = buildPageHead({
        origin: (data as any).origin ?? "",
        path: loaderData.target.canonicalPath,
        storePath: `/`,
        storeName: data.merchant.name,
        themeKey: data.themeKey,
        robots: data.page.robots,
        noindex: (data.page.robots ?? "").startsWith("noindex"),
        seo: data.seo ?? null,
        page: data.page,
      });
      return {
        ...base,
        meta: [
          ...(base.meta ?? []),
          ...verificationTags(data.siteKit.verification),
        ],
      };
    }

    // article case
    const { article, merchant } = loaderData;
    const origin = loaderData.origin;
    const selfPath = article.canonical || loaderData.canonicalPath;
    const absolute = origin ? `${origin}${selfPath}` : selfPath;
    const title =
      article.meta_title ??
      `${article.title} — ${merchant?.name ?? "Framique"}`;
    const description =
      article.meta_description ??
      article.excerpt ??
      `${article.title} — ব্লগ পোস্ট`;
    const meta = [
      { title },
      { name: "description", content: description },
      { name: "robots", content: article.robots },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (article.cover_image_url?.startsWith("https://")) {
      meta.push(
        { property: "og:image", content: article.cover_image_url },
        { name: "twitter:image", content: article.cover_image_url },
      );
    }
    return {
      meta,
      links: [{ rel: "canonical", href: absolute }],
    };
  },
  errorComponent: () => (
    <CatchAllMessage
      titleEn="Could not load page"
      titleBn="পেজটি লোড করা যায়নি"
    />
  ),
  notFoundComponent: () => (
    <CatchAllMessage titleEn="Page not found" titleBn="পেজটি পাওয়া যায়নি" />
  ),
  component: ResolvedPage,
});

function CatchAllMessage({
  titleEn,
  titleBn,
}: {
  titleEn: string;
  titleBn: string;
}) {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {t(titleEn, titleBn)}
      </h1>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-primary underline"
      >
        {t("Back to home", "হোমে ফিরে যান")}
      </Link>
    </main>
  );
}

function ResolvedPage() {
  const loaderData = Route.useLoaderData();
  
  if (loaderData.type === "product") {
    return <ProductView data={loaderData.data} />;
  }
  if (loaderData.type === "collection") {
    return <CollectionView data={loaderData.data} />;
  }
  if (loaderData.type === "page") {
    return <PageView data={loaderData.data} />;
  }
  
  return <ArticleView article={loaderData.article} merchant={loaderData.merchant} />;
}
