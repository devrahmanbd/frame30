import { useState, useEffect } from "react";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { publicArticlePageFn, publicArticleResolutionFn } from "@/lib/blog-reader.functions";
import { articleJsonLd, articleOutline } from "@/lib/blog-reader";
import { breadcrumbJsonLd, termArchivePath } from "@/lib/blog-taxonomy";
import { ArticleView } from "@/components/store/ArticleView";
import { ArticleGrid } from "@/components/store/BlogList";
import { NewsletterBlock } from "@/components/public/NewsletterForm";
import { ShareControls } from "@/components/public/ShareControls";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const result = await publicArticlePageFn({ data: { slug: params.slug } });
    if (!result) {
      const resolution = await publicArticleResolutionFn({ data: { slug: params.slug } });
      if (resolution.type === "redirect") throw redirect({ href: resolution.to, statusCode: resolution.status });
      if (resolution.type === "gone") throw new Response("Gone", { status: 410 });
      throw notFound();
    }
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Article not found — Framique" }, { name: "robots", content: "noindex" }] };
    const { article, merchant, author, category } = loaderData;
    const title = article.meta_title ?? `${article.title} — Framique`;
    const description = article.meta_description ?? article.excerpt ?? article.title;
    const canonical = article.canonical || `/blog/${article.slug}`;
    const meta = [
      { title }, { name: "description", content: description }, { name: "robots", content: article.robots },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "article" }, { property: "og:url", content: canonical },
      { name: "twitter:card", content: article.cover_image_url ? "summary_large_image" : "summary" },
      { property: "article:published_time", content: article.published_at ?? "" },
      { property: "article:modified_time", content: article.updated_at ?? article.published_at ?? "" },
    ];
    if (article.cover_image_url?.startsWith("https://")) meta.push({ property: "og:image", content: article.cover_image_url }, { name: "twitter:image", content: article.cover_image_url });
    const crumbs = [{ name: "Blog", path: "/blog" }, ...(category ? [{ name: category.name, path: termArchivePath("category", category.slug) }] : []), { name: article.title, path: `/blog/${article.slug}` }];
    return {
      meta,
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(articleJsonLd({ slug: article.slug, title: article.title, description, image: article.cover_image_url, publishedAt: article.published_at, updatedAt: article.updated_at, author, publisher: merchant?.name ?? "Framique", readingMinutes: article.reading_minutes ?? 1 })) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd(null, crumbs)) },
      ],
    };
  },
  errorComponent: () => <BlogMessage titleEn="Could not load article" titleBn="লেখাটি লোড করা যায়নি" />,
  notFoundComponent: () => <BlogMessage titleEn="Article not found" titleBn="লেখাটি পাওয়া যায়নি" />,
  component: ArticlePage,
});

function BlogMessage({ titleEn, titleBn }: { titleEn: string; titleBn: string }) {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">{t(titleEn, titleBn)}</h1>
      <Link to="/blog" className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-primary underline">
        {t("Browse the blog", "ব্লগ দেখুন")}
      </Link>
    </main>
  );
}

function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setProgress(Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100)));
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-1 z-50 pointer-events-none bg-border/20"
    >
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function ArticlePage() {
  const data = Route.useLoaderData();
  const { t } = useLang();
  const outline = articleOutline(data.article.body ?? "");
  return <>
    <ReadingProgressBar />
    <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <ArticleView article={{ ...data.article, author: data.author, reading_minutes: outline.readingMinutes }} merchant={data.merchant} />
      {outline.toc.length > 1 ? (
        <aside className="pt-6 lg:pt-10">
          <nav
            aria-label={t("On this page", "এই পাতায়")}
            className="rounded-fq-md border border-border/70 bg-card/60 p-4 lg:rounded-none lg:border-l lg:border-t-0 lg:border-r-0 lg:border-b-0 lg:bg-transparent lg:p-0 lg:pl-4 lg:sticky lg:top-24"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("On this page", "এই পাতায়")}
            </p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              {outline.toc.map((item) => (
                <li key={item.id} className={item.level > 2 ? "pl-3" : ""}>
                  <a href={`#${item.id}`} className="fq-tap hover:text-primary transition-colors block py-0.5">
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      ) : null}
    </div>
    <div className="mx-auto max-w-3xl space-y-10 px-4 pb-16">
      <ShareControls slug={data.article.slug} title={data.article.title} />
      {data.author ? <section className="flex gap-4 border-y border-border py-6">{data.author.avatarUrl ? <img src={data.author.avatarUrl} alt="" width={64} height={64} className="size-16 rounded-full object-cover" /> : null}<div><p className="text-xs text-muted-foreground">{t("Written by", "লিখেছেন")}</p><Link to="/blog/author/$slug" params={{ slug: data.author.slug }} className="font-semibold hover:text-primary">{data.author.displayNameEn || data.author.displayName}</Link>{data.author.bio ? <p className="mt-1 text-sm text-muted-foreground">{data.author.bio}</p> : null}</div></section> : null}
      <nav aria-label={t("More articles", "আরও লেখা")} className="grid gap-4 sm:grid-cols-2">{data.previous ? <Link to="/blog/$slug" params={{ slug: data.previous.slug }} className="border-l border-border p-4"><span className="text-xs text-muted-foreground">{t("Previous", "আগের")}</span><span className="mt-1 block font-medium">{data.previous.title}</span></Link> : <span />}{data.next ? <Link to="/blog/$slug" params={{ slug: data.next.slug }} className="border-r border-border p-4 text-right"><span className="text-xs text-muted-foreground">{t("Next", "পরের")}</span><span className="mt-1 block font-medium">{data.next.title}</span></Link> : null}</nav>
      {data.related.length ? <section><h2 className="mb-5 text-xl font-semibold">{t("Related reading", "সম্পর্কিত লেখা")}</h2><ArticleGrid articles={data.related} /></section> : null}
      <NewsletterBlock source="blog_end" />
    </div>
  </>;
}