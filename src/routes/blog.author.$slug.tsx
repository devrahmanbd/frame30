import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { authorArchiveFn } from "@/lib/blog-reader.functions";
import { personJsonLd } from "@/lib/blog-reader";
import { archiveHead } from "@/lib/blog-taxonomy";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/blog/author/$slug")({
  validateSearch: z.object({ page: z.coerce.number().int().min(1).max(200).optional() }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    const data = await authorArchiveFn({ data: { slug: params.slug, page: deps.page } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Author not found — Framique" }, { name: "robots", content: "noindex" }] };
    const { author, paging } = loaderData;
    const path = `/blog/author/${encodeURIComponent(author.slug)}`;
    const { meta, links } = archiveHead({
      basePath: path,
      titleEn: `${author.displayNameEn || author.displayName} — author`,
      description: author.bioEn || author.bio || `Articles written by ${author.displayNameEn || author.displayName}.`,
      paging,
      indexable: true,
      imageUrl: author.avatarUrl,
      siteName: "Framique",
    });
    return { meta, links, scripts: [{ type: "application/ld+json", children: JSON.stringify(personJsonLd("", author)) }] };
  },
  notFoundComponent: AuthorMissing,
  component: AuthorPage,
});

function AuthorMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t("Author not found", "লেখককে পাওয়া যায়নি")}</h1>
      <Link to="/blog" className="mt-4 inline-flex min-h-11 items-center justify-center text-primary underline">
        {t("Browse the blog", "ব্লগ দেখুন")}
      </Link>
    </main>
  );
}

function AuthorPage() {
  const data = Route.useLoaderData();
  const { t } = useLang();
  const { author } = data;
  return (
    <BlogArchiveTheme
      feed={{
        articles: data.articles,
        facets: [],
        paging: data.paging,
        basePath: (page: number) =>
          `/blog/author/${encodeURIComponent(author.slug)}${page > 1 ? `?page=${page}` : ""}`,
      }}
      header={
        <header className="mb-10 flex max-w-3xl items-start gap-5 border-b border-border pb-8">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt="" width={96} height={96} className="size-24 rounded-full object-cover" />
          ) : null}
          <div>
            <p className="text-xs font-medium text-primary">{t("Author", "লেখক")}</p>
            <h1 className="mt-1 text-3xl font-semibold">{author.displayNameEn || author.displayName}</h1>
            {author.roleTitle ? <p className="mt-1 text-sm text-muted-foreground">{author.roleTitle}</p> : null}
            {author.bioEn || author.bio ? (
              <p className="mt-3 text-muted-foreground">{author.bioEn || author.bio}</p>
            ) : null}
          </div>
        </header>
      }
      empty={<p className="py-12 text-muted-foreground">{t("No published articles yet.", "এখনো প্রকাশিত লেখা নেই।")}</p>}
    />
  );
}