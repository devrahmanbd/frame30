import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { resolvePathFn } from "@/lib/url-resolve.functions";
import { ArticleView } from "@/components/store/ArticleView";
import { useLang } from "@/lib/i18n";

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
      throw redirect({ href: result.resolution.to, statusCode: result.resolution.status === 302 ? 302 : 301 });
    }
    if (result.resolution.type === "gone" || !result.article) throw notFound();
    return { ...result.article, canonicalPath: path, params };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Page not found" }, { name: "robots", content: "noindex" }] };
    }
    const { article, merchant } = loaderData;
    const title = article.meta_title ?? `${article.title} — ${merchant?.name ?? "Framique"}`;
    const description =
      article.meta_description ?? article.excerpt ?? `${article.title} — ব্লগ পোস্ট`;
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
      links: article.canonical ? [{ rel: "canonical", href: article.canonical }] : [],
    };
  },
  errorComponent: () => <CatchAllMessage titleEn="Could not load page" titleBn="পেজটি লোড করা যায়নি" />,
  notFoundComponent: () => <CatchAllMessage titleEn="Page not found" titleBn="পেজটি পাওয়া যায়নি" />,
  component: ResolvedPage,
});

function CatchAllMessage({ titleEn, titleBn }: { titleEn: string; titleBn: string }) {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">{t(titleEn, titleBn)}</h1>
      <Link to="/" className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-primary underline">
        {t("Back to home", "হোমে ফিরে যান")}
      </Link>
    </main>
  );
}

function ResolvedPage() {
  const { article, merchant } = Route.useLoaderData();
  return <ArticleView article={article} merchant={merchant} />;
}
