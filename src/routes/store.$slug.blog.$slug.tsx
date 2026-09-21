/**
 * Path-shape tenant article (`/store/<slug>/blog/<slug>`).
 *
 * Local-dev parity for the custom-host `/blog/<slug>` surface: thin over the
 * same pattern-aware `storeBlogArticleFn`, same store canonicals. On platform
 * hosts the server gate (`isBlockedPathStorefront` in `server.ts`) answers
 * before SSR, so this only ever serves on loopback dev.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArticleView } from "@/components/store/ArticleView";
import { ShareControls } from "@/components/public/ShareControls";
import { storeBlogArticleFn } from "@/lib/store-blog.functions";
import { storeArticleHead } from "@/lib/store-blog-head";
import { articleOutline } from "@/lib/blog-reader";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/blog/$slug")({
  loader: async ({ params }) => {
    const store = await storeBlogArticleFn({
      data: { slug: params.slug, articleSlug: params.slug },
    });
    if (!store) throw notFound();
    return store;
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

function StoreBlogArticlePage() {
  const data = Route.useLoaderData();
  const { t } = useLang();
  const { article } = data;
  const merchantName = article.merchant?.name ?? data.merchantSlug;
  const outline = articleOutline(article.body ?? "");
  return (
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
}
