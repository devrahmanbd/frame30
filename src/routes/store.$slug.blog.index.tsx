/**
 * Path-shape tenant blog index (`/store/<slug>/blog`).
 *
 * Local-dev parity for the custom-host `/blog` surface: thin over the same
 * `storeBlogIndexFn`, same store canonicals. On platform hosts the server
 * gate (`isBlockedPathStorefront` in `server.ts`) answers before SSR, so
 * this only ever serves on loopback dev — never platform-trust hosting.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
import { storeBlogIndexFn } from "@/lib/store-blog.functions";
import { getStoreChrome } from "@/lib/storefront.functions";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
import { storeBlogBasePath, storeListingHead } from "@/lib/store-blog-head";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/blog/")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).max(500).optional(),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    let store;
    try {
      store = await storeBlogIndexFn({
        data: { slug: params.slug, page: deps.page },
      });
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry; only a null payload below becomes a 404.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
    if (!store) throw notFound();
    // The theme's `blog_listing` composition (Batch C) — the CLOSED variant
    // of the `blog` key this surface renders. This route carries a STORE
    // SLUG, so it can resolve a theme at all (`getStoreChrome` needs one);
    // with no authored composition the resolution is null and the platform's
    // own grid renders — never the homepage.
    const chrome = await getStoreChrome({
      data: { slug: params.slug, template: "blog", variant: "listing" },
    }).catch(() => null);
    return { ...store, chrome };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Blog unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    const merchantName =
      loaderData.listing.articles[0]?.merchantName ?? loaderData.merchantSlug;
    const { meta, links, scripts } = storeListingHead({
      origin: loaderData.origin,
      settings: loaderData.settings,
      merchantName,
      paging: loaderData.listing.paging,
      articles: loaderData.listing.articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        publishedAt: a.publishedAt,
        categorySlug: a.category?.slug ?? null,
      })),
    });
    return { meta, links, scripts };
  },
  component: StoreBlogIndexPage,
  errorComponent: StorefrontError,
});

function StoreBlogIndexPage() {
  const data = Route.useLoaderData();
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
      ast={data.chrome?.ast ?? null}
      tokens={data.chrome?.tokens ?? null}
      themeKey={data.chrome?.themeKey ?? null}
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
