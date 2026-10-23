/**
 * `/store/<slug>/blog/category/<termSlug>` — the merchant-scoped category
 * archive (Batch B, gap 3).
 *
 * The deferred route the programme always named: the theme's
 * `archive_category` composition, served STOREFRONT-side. The platform
 * keeps every authority — the loader is a server function (rate-limited,
 * tenant-resolved server-side), the composition is resolved through the ONE
 * resolver (`resolveTemplateForHost`, `mode: "published"`, `host:
 * "storefront"`), and the listing is the SAME reader the store-less
 * taxonomy routes use, scoped to this merchant.
 *
 * The `$termSlug` param (not a second `$slug`) keeps the route's typed
 * grammar unambiguous next to `/store/$slug/blog/`.
 *
 * Unknown store, inactive store or unknown term for THIS store →
 * `notFound()`. Never another merchant's same-named category, never an
 * empty-but-200 archive (the phase-3 soft-404 rule).
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { storeBlogArchiveFn } from "@/lib/store-blog-archive.functions";
import {
  archiveHead,
  blogPagePath,
  breadcrumbJsonLd,
} from "@/lib/blog-taxonomy";
import { storeArticleCanonical } from "@/lib/store-blog-head";
import { useLang } from "@/lib/i18n";
import { archiveContextFrom } from "@/lib/archive-context";
import { ArchiveView } from "@/components/store/ArchiveView";
import { StoreHeader } from "@/components/store/StoreHeader";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";

export const Route = createFileRoute("/store/$slug/blog/category/$termSlug")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).max(500).optional(),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    let data;
    try {
      data = await storeBlogArchiveFn({
        data: {
          slug: params.slug,
          termSlug: params.termSlug,
          page: deps.page,
        },
      });
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry; only a null payload below becomes a 404.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Category not found" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { archive, merchant, origin, settings, basePath } = loaderData;
    const { term, paging } = archive;
    const { meta, links } = archiveHead({
      origin,
      basePath,
      titleEn: term.meta_title ?? term.name_en ?? term.name,
      description:
        term.meta_description ??
        term.description ??
        `${term.name} — ${merchant.name}`,
      paging,
      indexable: term.robots_index !== false,
      imageUrl: term.cover_image_url ?? null,
      siteName: merchant.name,
    });
    // The store-scoped CollectionPage graph: the merchant's OWN canonicals.
    // (`listingJsonLd` hardcodes `/blog/*` platform paths and stays
    // global-mode-only by design — the same rule `storeListingHead` names.)
    const start = paging.from;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: term.name,
      description: term.description ?? undefined,
      url: absolutePath(origin, blogPagePath(basePath, paging.page)),
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: paging.total,
        itemListElement: archive.articles.map((article, index) => ({
          "@type": "ListItem",
          position: start + index + 1,
          url: storeArticleCanonical(origin, settings, {
            slug: article.slug,
            publishedAt: article.publishedAt,
            categorySlug: article.category?.slug ?? null,
          }),
          name: article.title,
        })),
      },
    };
    return {
      meta,
      links,
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbJsonLd(origin, [
              // Manual store crumbs: `archiveCrumbs` bakes the platform's
              // `/blog/...` paths, and this surface's crumbs are STORE paths.
              { name: merchant.name, path: "/" },
              { name: "Blog", path: `/store/${merchant.slug}/blog` },
              { name: term.name, path: basePath },
            ]),
          ),
        },
      ],
    };
  },
  notFoundComponent: () => <MissingStoreArchive />,
  component: StoreCategoryArchivePage,
  errorComponent: StorefrontError,
});

/** Same rule as `absolute()` in the head helpers, without importing it. */
function absolutePath(origin: string | null, path: string): string {
  return origin ? `${origin}${path}` : path;
}

function MissingStoreArchive() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {t("Category not found", "ক্যাটাগরি পাওয়া যায়নি")}
      </h1>
      <Link
        to="/store/$slug/blog"
        params={{ slug }}
        className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-primary underline"
      >
        {t("Browse the blog", "ব্লগ দেখুন")}
      </Link>
    </main>
  );
}

function StoreCategoryArchivePage() {
  const data = Route.useLoaderData();
  const { t, lang } = useLang();
  const { term } = data.archive;
  const heading = lang === "bn" ? term.name : term.name_en || term.name;

  const facets = data.archive.children.length
    ? data.archive.children.map((child) => ({
        slug: child.slug,
        name: child.name,
        kind: "category" as const,
        count: child.article_count ?? 0,
      }))
    : data.archive.facets;

  // The route-owned context — DERIVED from the loader's own output, never
  // re-queried (`src/lib/archive-context.ts`), the same construction the
  // store-less category route uses.
  const context = archiveContextFrom({
    kind: "category",
    term,
    articles: data.archive.articles,
    facets,
    paging: data.archive.paging,
    ancestry: data.archive.ancestry,
  });

  const basePath = data.basePath;

  return (
    <>
      {/* The store's chrome: this is a STOREFRONT surface, so it carries the
          store's header — the same one the blog index, cart, account, search
          and page routes render. */}
      <StoreHeader
        slug={data.merchant.slug}
        name={data.merchant.name}
        menus={data.menus}
        themeKey={data.themeKey}
      />
      <ArchiveView
        kind="category"
        context={context}
        // The SERVER-RESOLVED `archive_category` composition (gap 3): through
        // `resolveTemplateForHost` in the loader, never a client resolve.
        ast={data.ast}
        tokens={data.tokens}
        themeKey={data.themeKey}
        storeSlug={data.merchant.slug}
        storeName={data.merchant.name}
        feed={{
          articles: data.archive.articles,
          facets,
          paging: data.archive.paging,
          activeSlug: term.slug,
          basePath: (page: number) =>
            page > 1 ? `${basePath}?page=${page}` : basePath,
        }}
        header={
          <>
            <nav
              aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
              className="mb-4 text-xs text-muted-foreground"
            >
              <Link
                to="/store/$slug/blog"
                params={{ slug: data.merchant.slug }}
                className="underline"
              >
                {t("Blog", "ব্লগ")}
              </Link>
              {data.archive.ancestry.map((crumb) => (
                <span key={crumb.id}>
                  <span aria-hidden> / </span>
                  {crumb.id === term.id ? (
                    <span aria-current="page">{crumb.name}</span>
                  ) : (
                    <Link
                      to="/store/$slug/blog/category/$termSlug"
                      params={{
                        slug: data.merchant.slug,
                        termSlug: crumb.slug,
                      }}
                      className="underline"
                    >
                      {crumb.name}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
            <header className="mb-8 border-b border-border pb-6">
              <h1 className="font-bangla-display text-3xl font-semibold">
                {heading}
              </h1>
              {term.description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {term.description}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `${data.archive.paging.total} articles`,
                  `${data.archive.paging.total}টি লেখা`,
                )}
              </p>
            </header>
          </>
        }
        empty={
          <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            {data.archive.paging.overrun
              ? t("That page does not exist yet.", "এই পেজটি এখনো নেই।")
              : t(
                  "No articles in this category yet.",
                  "এই ক্যাটাগরিতে এখনো কোনো লেখা নেই।",
                )}
          </p>
        }
      />
    </>
  );
}
