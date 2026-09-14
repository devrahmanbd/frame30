/**
 * Reader-side listing primitives, shared by `/blog` and every term archive.
 *
 * One implementation on purpose: the card markup, the pagination `<nav>` and the
 * archive rail all carry SEO-relevant structure (heading levels, `rel=prev/next`
 * on real anchors, no client-only links), and a second copy is how the two
 * surfaces drift apart. Everything here is a pure server-renderable component —
 * no effects, no browser globals — so listings ship complete in the first byte.
 *
 * Accessibility contract: cards are `<article>` under a real heading, the pager
 * is a labelled `<nav>` with the current page marked `aria-current`, and every
 * hit target clears 44px.
 */
import { Link } from "@tanstack/react-router";
import { termArchivePath, pageWindow, type Paging, type TermKind } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";

export type BlogCardData = {
  slug: string;
  title: string;
  titleEn: string | null;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  merchantName: string | null;
  merchantSlug: string | null;
  category: { slug: string; name: string } | null;
  readingMinutes?: number;
  author?: { slug: string; displayName: string; displayNameEn: string | null } | null;
};

function formatDate(value: string | null, lang: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // Fixed UTC timezone: the server and the client must format identically or
  // hydration mismatches on every card.
  return date.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ArticleGrid({ articles }: { articles: BlogCardData[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article, index) => (
        <BlogCard key={article.slug} article={article} priority={index < 3} />
      ))}
    </div>
  );
}

function BlogCard({ article, priority }: { article: BlogCardData; priority: boolean }) {
  const { t, lang } = useLang();
  const published = formatDate(article.publishedAt, lang);
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      {article.coverImageUrl ? (
        <Link to="/blog/$slug" params={{ slug: article.slug }} className="block aspect-[16/9] overflow-hidden">
          <img
            src={article.coverImageUrl}
            alt=""
            /* Decorative: the accessible name is the heading link below. */
            width={640}
            height={360}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {article.category ? (
          <Link
            to="/blog/category/$slug"
            params={{ slug: article.category.slug }}
            className="w-fit rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground"
          >
            {article.category.name}
          </Link>
        ) : null}
        <h2 className="font-bangla-display text-lg font-semibold leading-snug">
          <Link to="/blog/$slug" params={{ slug: article.slug }} className="hover:text-primary">
            {article.title}
          </Link>
        </h2>
        {article.excerpt ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>
        ) : null}
        <footer className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
          {article.author ? (
            <Link to="/blog/author/$slug" params={{ slug: article.author.slug }} className="hover:text-foreground hover:underline">
              {article.author.displayNameEn || article.author.displayName}
            </Link>
          ) : article.merchantName ? <span>{article.merchantName}</span> : null}
          {(article.author || article.merchantName) && published ? <span aria-hidden>·</span> : null}
          {published ? (
            <time dateTime={article.publishedAt ?? undefined}>{published}</time>
          ) : (
            <span>{t("Unpublished", "অপ্রকাশিত")}</span>
          )}
          {article.readingMinutes ? (
            <><span aria-hidden>·</span><span>{t(`${article.readingMinutes} min read`, `${article.readingMinutes} মিনিট`)}</span></>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

/**
 * Archive rail. Kept to the terms that actually have published articles, because
 * linking an empty (`noindex`) archive spends crawl budget on a dead end.
 */
export function ArchiveRail({
  facets,
  activeSlug,
}: {
  facets: { slug: string; name: string; kind: TermKind; count: number }[];
  activeSlug?: string;
}) {
  const { t } = useLang();
  if (!facets.length) return null;
  return (
    <nav aria-label={t("Browse by topic", "বিষয় অনুযায়ী দেখুন")} className="mb-8 flex flex-wrap gap-2">
      {facets.map((facet) => {
        const active = facet.slug === activeSlug;
        return (
          <Link
            key={`${facet.kind}:${facet.slug}`}
            to={facet.kind === "tag" ? "/blog/tag/$slug" : "/blog/category/$slug"}
            params={{ slug: facet.slug }}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{facet.name}</span>
            <span className="text-[11px] opacity-70">{facet.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Pagination.
 *
 * Real `<a>` hrefs (not buttons) so crawlers can follow the chain, and the
 * window collapses with gaps rather than rendering 200 links on a big blog.
 */
export function Pager({ paging, basePath }: { paging: Paging; basePath: (page: number) => string }) {
  const { t } = useLang();
  if (paging.lastPage <= 1) return null;
  return (
    <nav aria-label={t("Pagination", "পেজিনেশন")} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {paging.prevPath ? (
        <a href={paging.prevPath} rel="prev" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm">
          {t("Previous", "আগের")}
        </a>
      ) : null}
      {pageWindow(paging.page, paging.lastPage).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <a
            key={entry}
            href={basePath(entry)}
            aria-current={entry === paging.page ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 text-sm ${
              entry === paging.page ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {entry}
          </a>
        ),
      )}
      {paging.nextPath ? (
        <a href={paging.nextPath} rel="next" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm">
          {t("Next", "পরের")}
        </a>
      ) : null}
    </nav>
  );
}

export { termArchivePath };