/**
 * Shared article rendering surface.
 *
 * Both the legacy `/blog/$slug` route and the pattern-driven permalink
 * resolver render through this component, so a merchant who switches to
 * `/journal/%year%/%month%/%slug%` gets a byte-identical page instead of a
 * second, slowly diverging copy of the template.
 */
import { Link } from "@tanstack/react-router";
import { ArticleBody } from "@/components/store/ArticleBody";
import { useLang } from "@/lib/i18n";

export type ArticleViewData = {
  article: {
    title: string;
    excerpt?: string | null;
    body?: unknown;
    cover_image_url?: string | null;
    tags?: string[] | null;
    published_at?: string | null;
    reading_minutes?: number | null;
    author?: { slug: string; displayName: string; displayNameEn: string | null } | null;
  };
  merchant?: { name?: string | null; slug?: string | null } | null;
};

export function ArticleView({ article, merchant }: ArticleViewData) {
  const { t } = useLang();
  const published = article.published_at
    ? new Date(article.published_at).toLocaleDateString("en-BD", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <article>
        <header className="space-y-3">
          <h1 className="font-bangla-display text-3xl font-semibold leading-tight">{article.title}</h1>
          <p className="text-sm text-muted-foreground">
            {article.author ? <Link to="/blog/author/$slug" params={{ slug: article.author.slug }} className="hover:underline">{article.author.displayNameEn || article.author.displayName}</Link> : merchant?.name}
            {published ? ` · ${published}` : ""}
            {article.reading_minutes ? ` · ${article.reading_minutes} min read` : ""}
          </p>
          {(article.tags ?? []).length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {(article.tags ?? []).map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </header>

        {article.cover_image_url && (
          <img
            src={article.cover_image_url}
            alt={article.title}
            /* Reserve the 16:9 box before the bytes land: a cover image that
             * pops in after the text has painted shifts the whole article. */
            width={1200}
            height={675}
            loading="lazy"
            decoding="async"
            className="mt-6 aspect-[16/9] w-full rounded-fq-md border border-border object-cover"
          />

        )}

        {article.excerpt && <p className="mt-6 text-base text-muted-foreground">{article.excerpt}</p>}

        <ArticleBody body={article.body as never} className="mt-6" />
      </article>

      {merchant?.slug && (
        <Link
          to="/store/$slug"
          params={{ slug: merchant.slug }}
          className="mt-10 inline-block text-sm text-primary underline"
        >
          {t(`View ${merchant.name} store`, `${merchant.name} স্টোর দেখুন`)}
        </Link>
      )}
    </main>
  );
}
