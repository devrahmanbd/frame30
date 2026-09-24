import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { resolvePathFn } from "@/lib/url-resolve.functions";
import { ArticleView } from "@/components/store/ArticleView";
import { PluginLayer } from "@/components/store/PluginLayer";
import {
  CollectionEntityView,
  PageEntityView,
  ProductEntityView,
} from "@/components/store/PermalinkEntityViews";
import { useLang } from "@/lib/i18n";

/**
 * Catch-all permalink resolver.
 *
 * Matched last, after every literal route, so it only ever sees paths the app
 * does not otherwise serve. It turns merchant-owned permalink patterns
 * (`/journal/2026/08/jute-bags`, `/shop/sarees`) into real pages, honours
 * the redirect table, and records genuine misses into the 404 queue that
 * the permalink desk promotes into redirects.
 *
 * Articles render here; products, collections and pages resolve through the
 * same tenant-scoped match and render the shared entity views below. A
 * resolution without a merchant host (platform domain, no tenant signal)
 * is refused — entities must never leak across tenants.
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
    if (result.target) {
      const { kind, slug, merchantSlug, canonicalPath } = result.target;
      const { resolveStorefrontHostFn } =
        await import("@/lib/storefront.functions");
      let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
      try {
        host = await resolveStorefrontHostFn();
      } catch {
        host = null;
      }
      // Custom hosts only: the entity's merchant must own this host, or the
      // page would serve one tenant's catalogue on another surface.
      if (
        !host ||
        !merchantSlug ||
        host.merchantSlug !== merchantSlug ||
        (kind !== "product" && kind !== "collection" && kind !== "page")
      ) {
        throw notFound();
      }
      if (kind === "product") {
        const { getStoreProduct } = await import(
          "@/lib/storefront.functions"
        );
        const data = await getStoreProduct({
          data: { slug: merchantSlug, productSlug: slug },
        });
        if (!data) throw notFound();
        return { kind: "product" as const, data, canonicalPath, params };
      }
      if (kind === "collection") {
        const { getStoreCollection } = await import(
          "@/lib/storefront.functions"
        );
        const data = await getStoreCollection({
          data: { slug: merchantSlug, collectionSlug: slug },
        });
        if (!data) throw notFound();
        return { kind: "collection" as const, data, canonicalPath, params };
      }
      const { getStorePageFn } = await import(
        "@/lib/storefront-search.functions"
      );
      const data = await getStorePageFn({
        data: { slug: merchantSlug, pageSlug: slug },
      });
      if (!data) throw notFound();
      return { kind: "page" as const, data, canonicalPath, params };
    }
    if (result.resolution.type === "gone" || !result.article) throw notFound();
    return {
      kind: "article" as const,
      ...result.article,
      canonicalPath: path,
      params,
    };
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
    if (loaderData.kind === "article") {
      return articleHead(loaderData);
    }
    return entityHead(loaderData);
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
function articleHead(loaderData: {
  article: {
    canonical?: string | null;
    meta_title?: string | null;
    title: string;
    meta_description?: string | null;
    excerpt?: string | null;
    robots?: string;
    cover_image_url?: string | null;
  };
  merchant?: { name?: string | null } | null;
  origin?: string | null;
  canonicalPath: string;
}) {
  const { article, merchant } = loaderData;
  const origin = loaderData.origin ?? null;
  const selfPath = article.canonical || loaderData.canonicalPath;
  const absolute = origin ? `${origin}${selfPath}` : selfPath;
  const title =
    article.meta_title ?? `${article.title} — ${merchant?.name ?? "Framique"}`;
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
}

function entityHead(loaderData: {
  kind: "product" | "collection" | "page";
  data: {
    merchant: { name: string };
    origin?: string | null;
  } & (
    | { collection: { name: string; description?: string | null } }
    | { product: { title: string; description?: string | null } }
    | { page: { title: string } }
  );
  canonicalPath: string;
}) {
  const { data } = loaderData;
  const origin = "origin" in data ? (data.origin as string | null) : null;
  const absolute = origin ? `${origin}${loaderData.canonicalPath}` : loaderData.canonicalPath;
  const name =
    "collection" in data
      ? data.collection.name
      : "product" in data
        ? data.product.title
        : data.page.title;
  const title = `${name} — ${data.merchant.name}`;
  return {
    meta: [
      { title },
      { property: "og:title", content: title },
      { property: "og:type", content: "website" },
      { property: "og:url", content: absolute },
    ],
    links: [{ rel: "canonical", href: absolute }],
  };
}

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
  if (loaderData.kind === "article") {
    return (
      <ArticleView article={loaderData.article} merchant={loaderData.merchant} />
    );
  }
  const plugins =
    "installedPlugins" in loaderData.data
      ? (loaderData.data.installedPlugins as never)
      : [];
  if (loaderData.kind === "product") {
    return (
      <PluginLayer plugins={plugins}>
        <ProductEntityView data={loaderData.data} />
      </PluginLayer>
    );
  }
  if (loaderData.kind === "collection") {
    return (
      <PluginLayer plugins={plugins}>
        <CollectionEntityView data={loaderData.data} />
      </PluginLayer>
    );
  }
  return (
    <PluginLayer plugins={plugins}>
      <PageEntityView data={loaderData.data} />
    </PluginLayer>
  );
}
