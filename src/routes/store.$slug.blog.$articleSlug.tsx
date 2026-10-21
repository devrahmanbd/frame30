/**
 * Path-shape tenant article (`/store/<slug>/blog/<article>`).
 *
 * Local-dev parity for the custom-host `/blog/<slug>` surface: thin over the
 * same pattern-aware `storeBlogArticleFn`, same store canonicals. On platform
 * hosts the server gate (`isBlockedPathStorefront` in `server.ts`) answers
 * before SSR, so this only ever serves on loopback dev.
 *
 * **Batch D (2026-10-21) — the two path parameters are now DISTINCT.** The
 * route used to be `/store/$slug/blog/$slug`: TanStack Router matches both
 * segments into the SAME `params.slug` key, so only ONE slug survived and the
 * loader read the STORE slug as the ARTICLE slug. `storeBlogContext` then
 * looked up a merchant by the article's slug, found none, and the route
 * answered **404 for every article** (measured on the throwaway stack: the
 * article row was visible to the same anon query the loader makes, and the
 * route still 404'd). The file and the path parameter are renamed to
 * `$articleSlug`; the URL shape is unchanged (`/store/<slug>/blog/<article>`).
 *
 * **Batch C — the theme's `blog_article` composition.** This route carries a
 * STORE SLUG, so it can resolve a theme at all (`getStoreChrome` needs one).
 * The CLOSED variant of the `blog` key for the article detail is
 * `blog_article`; the resolution falls back to the base `blog` body, and
 * when the theme authored neither, the platform's own article render is what
 * a shopper gets — never the homepage.
 *
 * The article's title, excerpt, cover and body are ROUTE context: they flow
 * through the theme's route-owned body slot (`page_content`), the same slot
 * the authored page and the account dashboard use. The theme contributes the
 * frame around them.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArticleView } from "@/components/store/ArticleView";
import { ShareControls } from "@/components/public/ShareControls";
import {
  storeBlogArticleFn,
  storeBlogIndexFn,
} from "@/lib/store-blog.functions";
import { getStoreChrome } from "@/lib/storefront.functions";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreHeader } from "@/components/store/StoreHeader";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
import { storeArticleHead } from "@/lib/store-blog-head";
import { articleOutline } from "@/lib/blog-reader";
import { paging } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/blog/$articleSlug")({
  loader: async ({ params }) => {
    let store;
    try {
      store = await storeBlogArticleFn({
        data: { slug: params.slug, articleSlug: params.articleSlug },
      });
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry; only a null payload below becomes a 404.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
    if (!store) throw notFound();
    // The theme's `blog_article` composition (Batch C), or the base `blog`
    // body, or nothing at all — in which case the platform's own article
    // render is what a shopper gets.
    const chrome = await getStoreChrome({
      data: { slug: params.slug, template: "blog", variant: "article" },
    }).catch(() => null);
    // The store's OTHER articles — the feed the theme's related-content
    // rail reads. Without it the widget would render the engine's synthetic
    // sample rows on a live page, so it is best-effort: a failure degrades
    // to an empty feed, never to a crash.
    const related = await storeBlogIndexFn({
      data: { slug: params.slug, page: 1 },
    }).catch(() => null);
    return { ...store, chrome, related };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Article not found" },
          { name: "robots", content: "noindex" },
        ],
      };
    const merchantName =
      loaderData.article.merchant?.name ?? loaderData.merchantSlug;
    const { meta, links, scripts } = storeArticleHead({
      origin: loaderData.origin,
      settings: loaderData.settings,
      merchantName,
      article: loaderData.article,
    });
    return { meta, links, scripts };
  },
  component: StoreBlogArticlePage,
  errorComponent: StorefrontError,
  notFoundComponent: StoreBlogNotFound,
});

function StoreBlogNotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {t("Article not found", "লেখাটি পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

/** The store's articles, minus the one being read. */
function relatedFeed(
  related: Awaited<ReturnType<typeof storeBlogIndexFn>> | null,
  currentSlug: string,
  basePath: string,
): BlogFeed {
  return {
    articles: (related?.listing.articles ?? []).filter(
      (a) => a.slug !== currentSlug,
    ),
    facets: related?.listing.facets ?? [],
    paging: related?.listing.paging ?? paging(() => basePath, 1, 0),
    basePath: (page: number) =>
      page > 1 ? `${basePath}?page=${page}` : basePath,
  };
}

function StoreBlogArticlePage() {
  const data = Route.useLoaderData();
  const { t } = useLang();
  const { article } = data;
  const merchantName = article.merchant?.name ?? data.merchantSlug;
  const outline = articleOutline(article.body ?? "");

  // The route's own body — the article. It flows through the theme's
  // route-owned body slot when the theme publishes a `blog_article`
  // composition, and it IS the fallback when the theme publishes none.
  const body = (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 pb-16">
      <ArticleView
        article={{
          title: article.title,
          excerpt: article.excerpt,
          body: article.body,
          cover_image_url: article.coverImageUrl,
          published_at: article.publishedAt,
          reading_minutes: outline.readingMinutes,
          author: null,
        }}
        merchant={{
          name: merchantName,
          slug: article.merchant?.slug ?? data.merchantSlug,
        }}
      />
      <ShareControls slug={article.slug} title={article.title} />
      <nav aria-label={t("More articles", "আরও লেখা")}>
        <a
          href={`/store/${data.merchantSlug}/blog`}
          className="inline-flex min-h-11 items-center text-sm text-primary underline"
        >
          {t(`More from ${merchantName}`, `${merchantName}-এর আরও লেখা`)}
        </a>
      </nav>
    </div>
  );

  return (
    <BlogFeedProvider
      value={relatedFeed(
        data.related,
        article.slug,
        `/store/${data.merchantSlug}/blog`,
      )}
    >
      {/* The store's chrome (Batch D, self-critique fix 1): the article is a
          STOREFRONT surface, so it carries the store's header — the same one
          the cart, account, search, checkout and page routes render. */}
      <StoreHeader
        slug={data.merchantSlug}
        name={merchantName}
        menus={data.chrome?.menus ?? []}
        themeKey={data.chrome?.themeKey ?? null}
      />
      <ThemeChrome
        template="blog"
        ast={data.chrome?.ast ?? null}
        tokens={data.chrome?.tokens ?? null}
        themeKey={data.chrome?.themeKey ?? null}
        storeSlug={data.merchantSlug}
        contentSlot="page_content"
        contextSlots={{
          // The route-owned body slot: the article.
          page_content: body,
          // The blog pack: the terms rail, the listing and the pager.
          blog_terms: null,
          blog_archive: null,
          blog_pager: null,
        }}
        ownsPrimary
        containerClassName="mx-auto max-w-6xl px-4 py-8"
        fallback={body}
      />
    </BlogFeedProvider>
  );
}
