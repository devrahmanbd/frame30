/**
 * `/blog` — the paginated reader index.
 *
 * Before this route existed every article was an orphan: `/blog/<slug>` pages
 * with nothing linking to them, which is both a crawl problem (§6 orphan
 * findings) and a reader problem (no way in). The listing is the hub.
 *
 * SEO decisions live in `blog-taxonomy.ts` so this file stays presentational:
 * page 1 canonicalises to `/blog`, page N to `?page=N`, prev/next are emitted,
 * an empty or overrun page is `noindex,follow`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { blogIndexFn } from "@/lib/blog-taxonomy.functions";
import { archiveHead, blogIndexPath, listingJsonLd } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
import { blogSearchFn } from "@/lib/blog-reader.functions";
import { Button } from "@/components/ui/button";
import { MarketingPlaceholderImage } from "@/components/public/MarketingPlaceholderImage";

export const Route = createFileRoute("/blog/")({
  validateSearch: z.object({ page: z.coerce.number().int().min(1).max(500).optional(), q: z.string().max(120).optional() }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, q: search.q?.trim() ?? "" }),
  loader: ({ deps }) => deps.q ? blogSearchFn({ data: { query: deps.q, page: deps.page } }) : blogIndexFn({ data: { page: deps.page } }),
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Blog — Framique" }, { name: "robots", content: "noindex" }] };
    const { meta, links } = archiveHead({
      basePath: "/blog",
      titleEn: "Blog",
      description:
        "Commerce guides, product stories and platform updates from Framique merchants.",
      paging: loaderData.paging,
      indexable: true,
      siteName: "Framique",
    });
    return {
      meta,
      links: [...links, { rel: "alternate", type: "application/rss+xml", title: "Framique Blog RSS", href: "/blog.xml" }, { rel: "alternate", type: "application/atom+xml", title: "Framique Blog Atom", href: "/blog.atom" }, { rel: "alternate", type: "application/feed+json", title: "Framique Blog JSON Feed", href: "/blog.json" }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            listingJsonLd({
              path: "/blog",
              name: "Framique Blog",
              articles: loaderData.articles.map((a) => ({ slug: a.slug, title: a.title })),
              paging: loaderData.paging,
            }),
          ),
        },
      ],
    };
  },
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const { t } = useLang();

  const basePath = search.q
    ? (page: number) => `/blog?q=${encodeURIComponent(search.q ?? "")}${page > 1 ? `&page=${page}` : ""}`
    : blogIndexPath;

  return (
    <BlogArchiveTheme
      feed={{
        articles: data.articles,
        facets: "facets" in data ? data.facets : [],
        paging: data.paging,
        basePath,
      }}
      header={
        <>
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="font-bangla-display text-3xl font-semibold">{t("Blog", "ব্লগ")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t(
                "Guides, product stories and updates from stores building on Framique.",
                "ফ্রেমিকে তৈরি দোকানগুলোর গাইড, পণ্যের গল্প আর আপডেট।",
              )}
            </p>
            {data.paging.total > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${data.paging.total} articles`, `${data.paging.total}টি লেখা`)}
              </p>
            ) : null}
          </header>

          {!search.q && (!search.page || search.page === 1) ? (
            <div className="mb-8 overflow-hidden rounded-fq-lg border border-border/80 bg-card">
              <MarketingPlaceholderImage
                alt="Prompt: Sophisticated 3D editorial illustration of a financial ledger book open beside a smartphone showing digital bKash Taka transfers, surrounded by miniature shipping boxes and courier receipts, warm studio lighting, 8k resolution, aspect ratio 16:9."
                aspect="16/9"
                badge={t("Merchant Playbook", "মার্চেন্ট প্লেবুক")}
                caption={t(
                  "Frameworks, financial playbooks, and logistics analysis for Bangladesh merchants.",
                  "বাংলাদেশি মার্চেন্টদের জন্য ফাইন্যান্সিয়াল প্লেবুক ও লজিস্টিকস বিশ্লেষণ।"
                )}
              />
            </div>
          ) : null}

          <form action="/blog" method="get" role="search" className="mb-8 flex flex-col sm:flex-row max-w-xl gap-2">
            <label htmlFor="blog-search" className="sr-only">{t("Search articles", "লেখা খুঁজুন")}</label>
            <input
              id="blog-search"
              name="q"
              defaultValue={search.q ?? ""}
              maxLength={80}
              placeholder={t("Search guides and updates", "গাইড ও আপডেট খুঁজুন")}
              className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button type="submit" className="min-h-11 w-full sm:w-auto bg-primary text-primary-foreground font-semibold px-6">{t("Search", "খুঁজুন")}</Button>
          </form>
        </>
      }
      empty={
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {data.paging.overrun
            ? t("That page does not exist yet.", "এই পেজটি এখনো নেই।")
            : t("No articles published yet.", "এখনো কোনো লেখা প্রকাশ করা হয়নি।")}
        </p>
      }
    />
  );
}
