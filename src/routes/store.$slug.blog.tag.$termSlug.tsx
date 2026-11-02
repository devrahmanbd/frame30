import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { storeBlogArchiveFn } from "@/lib/store-blog-archive.functions";
import {
  archiveHead,
  blogPagePath,
  breadcrumbJsonLd,
} from "@/lib/blog-taxonomy";
import { storeArticleCanonical } from "@/lib/store-blog-head";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
import { StoreTermArchiveView } from "@/components/store/StoreTermArchiveView";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute(
  "/store/$slug/blog/tag/$termSlug",
)({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).max(500).optional(),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    let data: Awaited<ReturnType<typeof storeBlogArchiveFn>>;
    try {
      data = await storeBlogArchiveFn({
        data: {
          slug: params.slug,
          termSlug: params.termSlug,
          page: deps.page,
          kind: "tag",
          surface: "store",
        },
      });
    } catch (err) {
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
          { title: "Tag not found" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { archive, merchant, origin, settings, basePath } = loaderData;
    const { term, paging } = archive;
    const { meta, links } = archiveHead({
      origin,
      basePath,
      titleEn: term.meta_title ?? `${term.name_en ?? term.name} articles`,
      description:
        term.meta_description ??
        term.description ??
        `Articles tagged ${term.name} — ${merchant.name}`,
      paging,
      indexable: term.robots_index !== false,
      imageUrl: term.cover_image_url ?? null,
      siteName: merchant.name,
    });
    const start = paging.from;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: term.name,
      description: term.description ?? undefined,
      url: origin ? `${origin}${blogPagePath(basePath, paging.page)}` : basePath,
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
              { name: merchant.name, path: "/" },
              { name: "Blog", path: `/store/${merchant.slug}/blog` },
              { name: term.name, path: basePath },
            ]),
          ),
        },
      ],
    };
  },
  notFoundComponent: () => <MissingStoreTagArchive />,
  component: StoreTagArchivePage,
  errorComponent: StorefrontError,
});

function MissingStoreTagArchive() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {t("Tag not found", "ট্যাগ পাওয়া যায়নি")}
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

function StoreTagArchivePage() {
  const data = Route.useLoaderData();
  return <StoreTermArchiveView data={data} kind="tag" surface="store" />;
}
