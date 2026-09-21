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
 *
 * Dual-mode (T5+D3): on a custom host (an active `merchant_domains` row) this
 * route serves that merchant's tenant listing with store canonicals (absolute
 * store URLs against the request origin); everywhere else the global behavior
 * below is unchanged. A resolved host with no tenant data is a genuine 404 —
 * the global index must never bleed another merchant's bylines onto a store
 * domain. Platform RSS alternates and `listingJsonLd` stay global-mode-only;
 * the store branch advertises the merchant's own permalink URLs instead.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { blogIndexFn } from "@/lib/blog-taxonomy.functions";
import { archiveHead, blogIndexPath, listingJsonLd } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
import { blogSearchFn } from "@/lib/blog-reader.functions";
import { resolveStorefrontHostFn } from "@/lib/storefront.functions";
import { storeBlogIndexFn } from "@/lib/store-blog.functions";
import { storeBlogBasePath, storeListingHead } from "@/lib/store-blog-head";
import { Button } from "@/components/ui/button";
import { MarketingPlaceholderImage } from "@/components/public/MarketingPlaceholderImage";

export const Route = createFileRoute("/blog/")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).max(500).optional(),
    q: z.string().max(120).optional(),
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 1,
    q: search.q?.trim() ?? "",
  }),
  loader: async ({ deps }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (host) {
      // Tenant search is out of scope: a query on a store domain serves the
      // tenant listing rather than leaking the global index onto it.
      const store = await storeBlogIndexFn({
        data: { slug: host.merchantSlug, page: deps.page },
      });
      if (!store) throw new Response("Not Found", { status: 404 });
      return { kind: "store" as const, ...store };
    }
    const data = deps.q
      ? await blogSearchFn({ data: { query: deps.q, page: deps.page } })
      : await blogIndexFn({ data: { page: deps.page } });
    return { kind: "global" as const, data };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Blog — Framique" },
          { name: "robots", content: "noindex" },
        ],
      };
    if (loaderData.kind === "store") {
      const { listing, settings, origin } = loaderData;
      const merchantName =
        listing.articles[0]?.merchantName ?? loaderData.merchantSlug;
      const { meta, links, scripts } = storeListingHead({
        origin,
        settings,
        merchantName,
        paging: listing.paging,
        articles: listing.articles.map((a) => ({
          slug: a.slug,
          title: a.title,
          publishedAt: a.publishedAt,
          categorySlug: a.category?.slug ?? null,
        })),
      });
      return { meta, links, scripts };
    }
    const { meta, links } = archiveHead({
      basePath: "/blog",
      titleEn: "Blog",
      description:
        "Commerce guides, product stories and platform updates from Framique merchants.",
      paging: loaderData.data.paging,
      indexable: true,
      siteName: "Framique",
    });
    return {
      meta,
      links: [
        ...links,
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: "Framique Blog RSS",
          href: "/blog.xml",
        },
        {
          rel: "alternate",
          type: "application/atom+xml",
          title: "Framique Blog Atom",
          href: "/blog.atom",
        },
        {
          rel: "alternate",
          type: "application/feed+json",
          title: "Framique Blog JSON Feed",
          href: "/blog.json",
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            listingJsonLd({
              path: "/blog",
              name: "Framique Blog",
              articles: loaderData.data.articles.map((a) => ({
                slug: a.slug,
                title: a.title,
              })),
              paging: loaderData.data.paging,
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

  if (data.kind === "store") {
    return <StoreBlogIndexPage data={data} />;
  }

  const basePath = search.q
    ? (page: number) =>
        `/blog?q=${encodeURIComponent(search.q ?? "")}${page > 1 ? `&page=${page}` : ""}`
    : blogIndexPath;

  return (
    <BlogArchiveTheme
      feed={{
        articles: data.data.articles,
        facets: "facets" in data.data ? data.data.facets : [],
        paging: data.data.paging,
        basePath,
      }}
      header={
        <>
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="font-bangla-display text-3xl font-semibold">
              {t("Blog", "ব্লগ")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t(
                "Guides, product stories and updates from stores building on Framique.",
                "ফ্রেমিকে তৈরি দোকানগুলোর গাইড, পণ্যের গল্প আর আপডেট।",
              )}
            </p>
            {data.data.paging.total > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `${data.data.paging.total} articles`,
                  `${data.data.paging.total}টি লেখা`,
                )}
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
                  "বাংলাদেশি মার্চেন্টদের জন্য ফাইন্যান্সিয়াল প্লেবুক ও লজিস্টিকস বিশ্লেষণ।",
                )}
              />
            </div>
          ) : null}

          <form
            action="/blog"
            method="get"
            role="search"
            className="mb-8 flex flex-col sm:flex-row max-w-xl gap-2"
          >
            <label htmlFor="blog-search" className="sr-only">
              {t("Search articles", "লেখা খুঁজুন")}
            </label>
            <input
              id="blog-search"
              name="q"
              defaultValue={search.q ?? ""}
              maxLength={80}
              placeholder={t(
                "Search guides and updates",
                "গাইড ও আপডেট খুঁজুন",
              )}
              className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto bg-primary text-primary-foreground font-semibold px-6"
            >
              {t("Search", "খুঁজুন")}
            </Button>
          </form>
        </>
      }
      empty={
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {data.data.paging.overrun
            ? t("That page does not exist yet.", "এই পেজটি এখনো নেই।")
            : t(
                "No articles published yet.",
                "এখনো কোনো লেখা প্রকাশ করা হয়নি।",
              )}
        </p>
      }
    />
  );
}

function StoreBlogIndexPage({
  data,
}: {
  data: Extract<ReturnType<typeof Route.useLoaderData>, { kind: "store" }>;
}) {
  const { t } = useLang();
  const merchantName =
    data.listing.articles[0]?.merchantName ?? data.merchantSlug;
  const basePath = storeBlogBasePath(data.settings);

  return (
    <BlogArchiveTheme
      feed={{
        articles: data.listing.articles,
        facets: data.listing.facets,
        paging: data.listing.paging,
        basePath: (page: number) =>
          page > 1 ? `${basePath}?page=${page}` : basePath,
      }}
      header={
        <header className="mb-8 border-b border-border pb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {merchantName}
          </p>
          <h1 className="mt-1 font-bangla-display text-3xl font-semibold">
            {t("Blog", "ব্লগ")}
          </h1>
          {data.listing.paging.total > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                `${data.listing.paging.total} articles`,
                `${data.listing.paging.total}টি লেখা`,
              )}
            </p>
          ) : null}
        </header>
      }
      empty={
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {data.listing.paging.overrun
            ? t("That page does not exist yet.", "এই পেজটি এখনো নেই।")
            : t(
                "No articles published yet.",
                "এখনো কোনো লেখা প্রকাশ করা হয়নি।",
              )}
        </p>
      }
    />
  );
}
