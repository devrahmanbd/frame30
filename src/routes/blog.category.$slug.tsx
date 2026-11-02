/**
 * `/blog/category/<slug>` — a category archive.
 *
 * Category and tag archives are separate route files rather than one
 * `$kind/$slug` route on purpose: the URL grammar becomes typed (a link cannot
 * fabricate a third kind), and each surface owns its own head copy and
 * breadcrumb shape.
 *
 * Unknown slug → `notFound()`. That is the one loud failure in the reader
 * surface: an indexable page that renders "nothing here" for a URL we never had
 * is a soft 404, which Search Console reports and Google eventually distrusts.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { blogArchiveFn } from "@/lib/blog-taxonomy.functions";
import {
  archiveCrumbs,
  archiveHead,
  breadcrumbJsonLd,
  listingJsonLd,
  termArchivePath,
} from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";
import { archiveContextFrom } from "@/lib/archive-context";
import { ArchiveView } from "@/components/store/ArchiveView";
import { resolveStorefrontHostFn } from "@/lib/storefront.functions";
import { storeBlogArchiveFn } from "@/lib/store-blog-archive.functions";
import { storeArticleCanonical } from "@/lib/store-blog-head";
import { StoreTermArchiveView } from "@/components/store/StoreTermArchiveView";

export const Route = createFileRoute("/blog/category/$slug")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).max(500).optional(),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (host) {
      const store = await storeBlogArchiveFn({
        data: {
          slug: host.merchantSlug,
          termSlug: params.slug,
          kind: "category",
          surface: "host",
          page: deps.page,
        },
      });
      if (!store) throw notFound();
      return { kind: "store" as const, ...store };
    }
    const data = await blogArchiveFn({
      data: { kind: "category", slug: params.slug, page: deps.page },
    });
    if (!data) throw notFound();
    return { kind: "global" as const, ...data };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Category not found — Framique" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    if (loaderData.kind === "store") {
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
      const start = paging.from;
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: term.name,
        description: term.description ?? undefined,
        url: origin
          ? `${origin}${basePath}${paging.page > 1 ? `?page=${paging.page}` : ""}`
          : basePath,
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
                { name: "Blog", path: "/blog" },
                { name: term.name, path: basePath },
              ]),
            ),
          },
        ],
      };
    }
    const { term, paging } = loaderData;
    const basePath = termArchivePath("category", term.slug);
    const { meta, links } = archiveHead({
      basePath,
      titleEn: term.meta_title ?? term.name_en ?? term.name,
      description:
        term.meta_description ?? term.description ?? `${term.name} — articles`,
      paging,
      indexable: term.robots_index !== false,
      imageUrl: term.cover_image_url ?? null,
      siteName: "Framique",
    });
    return {
      meta,
      links,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(
            listingJsonLd({
              path: basePath,
              name: term.name,
              description: term.description ?? undefined,
              articles: loaderData.articles.map((a) => ({
                slug: a.slug,
                title: a.title,
              })),
              paging,
            }),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbJsonLd(
              null,
              archiveCrumbs(loaderData.ancestry, term.id, { blog: "Blog" }),
            ),
          ),
        },
      ],
    };
  },
  notFoundComponent: () => <MissingArchive />,
  component: CategoryArchive,
});

function MissingArchive() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {t("Category not found", "ক্যাটাগরি পাওয়া যায়নি")}
      </h1>
      <Link
        to="/blog"
        className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-primary underline"
      >
        {t("Browse the blog", "ব্লগ দেখুন")}
      </Link>
    </main>
  );
}

function CategoryArchive() {
  const data = Route.useLoaderData();
  if (data.kind === "store") {
    return <StoreTermArchiveView data={data} kind="category" surface="host" />;
  }
  const { t, lang } = useLang();
  const { term } = data;
  const heading = lang === "bn" ? term.name : term.name_en || term.name;

  const facets = data.children.length
    ? data.children.map((child) => ({
        slug: child.slug,
        name: child.name,
        kind: "category" as const,
        count: child.article_count ?? 0,
      }))
    : data.facets;

  // The route-owned context — DERIVED from the loader's own output, never
  // re-queried (`src/lib/archive-context.ts`). The route carries NO store
  // subject, so it resolves no theme: the platform's grid is what this
  // surface serves (the archive key's storefront render path in this
  // programme is the editor and the theme preview host, both merchant-scoped
  // by construction).
  const context = archiveContextFrom({
    kind: "category",
    term: data.term,
    articles: data.articles,
    facets,
    paging: data.paging,
    ancestry: data.ancestry,
  });

  return (
    <ArchiveView
      kind="category"
      context={context}
      feed={{
        articles: data.articles,
        facets,
        paging: data.paging,
        activeSlug: term.slug,
        basePath: (page: number) =>
          termArchivePath("category", term.slug, page),
      }}
      header={
        <>
          <nav
            aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
            className="mb-4 text-xs text-muted-foreground"
          >
            <Link to="/blog" className="underline">
              {t("Blog", "ব্লগ")}
            </Link>
            {data.ancestry.map((crumb) => (
              <span key={crumb.id}>
                <span aria-hidden> / </span>
                {crumb.id === term.id ? (
                  <span aria-current="page">{crumb.name}</span>
                ) : (
                  <Link
                    to="/blog/category/$slug"
                    params={{ slug: crumb.slug }}
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
                `${data.paging.total} articles`,
                `${data.paging.total}টি লেখা`,
              )}
            </p>
          </header>
        </>
      }
      empty={
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {t(
            "No articles in this category yet.",
            "এই ক্যাটাগরিতে এখনো কোনো লেখা নেই।",
          )}
        </p>
      }
    />
  );
}
