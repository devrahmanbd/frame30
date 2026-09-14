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
import { archiveCrumbs, archiveHead, breadcrumbJsonLd, listingJsonLd, termArchivePath } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";

export const Route = createFileRoute("/blog/category/$slug")({
  validateSearch: z.object({ page: z.coerce.number().int().min(1).max(500).optional() }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    const data = await blogArchiveFn({
      data: { kind: "category", slug: params.slug, page: deps.page },
    });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Category not found — Framique" }, { name: "robots", content: "noindex" }] };
    }
    const { term, paging } = loaderData;
    const basePath = termArchivePath("category", term.slug);
    const { meta, links } = archiveHead({
      basePath,
      titleEn: term.meta_title ?? term.name_en ?? term.name,
      description: term.meta_description ?? term.description ?? `${term.name} — articles`,
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
              articles: loaderData.articles.map((a) => ({ slug: a.slug, title: a.title })),
              paging,
            }),
          ),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbJsonLd(null, archiveCrumbs(loaderData.ancestry, term.id, { blog: "Blog" })),
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
      <Link to="/blog" className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-primary underline">
        {t("Browse the blog", "ব্লগ দেখুন")}
      </Link>
    </main>
  );
}

function CategoryArchive() {
  const data = Route.useLoaderData();
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

  return (
    <BlogArchiveTheme
      feed={{
        articles: data.articles,
        facets,
        paging: data.paging,
        activeSlug: term.slug,
        basePath: (page: number) => termArchivePath("category", term.slug, page),
      }}
      header={
        <>
          <nav aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")} className="mb-4 text-xs text-muted-foreground">
            <Link to="/blog" className="underline">
              {t("Blog", "ব্লগ")}
            </Link>
            {data.ancestry.map((crumb) => (
              <span key={crumb.id}>
                <span aria-hidden> / </span>
                {crumb.id === term.id ? (
                  <span aria-current="page">{crumb.name}</span>
                ) : (
                  <Link to="/blog/category/$slug" params={{ slug: crumb.slug }} className="underline">
                    {crumb.name}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="font-bangla-display text-3xl font-semibold">{heading}</h1>
            {term.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{term.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`${data.paging.total} articles`, `${data.paging.total}টি লেখা`)}
            </p>
          </header>
        </>
      }
      empty={
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {t("No articles in this category yet.", "এই ক্যাটাগরিতে এখনো কোনো লেখা নেই।")}
        </p>
      }
    />
  );
}
