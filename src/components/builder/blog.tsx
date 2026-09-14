/**
 * Phase 8 — blog archive widget pack.
 *
 * The reader listing (`/blog`, category, tag and author archives) is built out
 * of these three widgets instead of hand-written markup, so the blog wears the
 * active theme and a merchant can re-arrange it in the page builder exactly
 * like any other template.
 *
 * Live data arrives through `BlogFeedProvider`, which the reader routes mount
 * around the theme host. Without a provider (studio preview, a template being
 * designed before the first post) the widgets fall back to sample rows, so the
 * layout is visible while it is being authored.
 */
import { createContext, useContext } from "react";
import { Link } from "@tanstack/react-router";
import type { BlogCardData } from "@/components/store/BlogList";
import { ArchiveRail, Pager } from "@/components/store/BlogList";
import type { Paging, TermKind } from "@/lib/blog-taxonomy";
import type { WidgetComponent } from "./widgets";

export type BlogFeed = {
  articles: BlogCardData[];
  facets: { slug: string; name: string; kind: TermKind; count: number }[];
  paging: Paging;
  activeSlug?: string;
  basePath: (page: number) => string;
};

const BlogFeedContext = createContext<BlogFeed | null>(null);

export function BlogFeedProvider({ value, children }: { value: BlogFeed; children: React.ReactNode }) {
  return <BlogFeedContext.Provider value={value}>{children}</BlogFeedContext.Provider>;
}

export function useBlogFeed(): BlogFeed | null {
  return useContext(BlogFeedContext);
}

/** Sample rows used while a template is being designed. */
const SAMPLE: BlogCardData[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  slug: `sample-${n}`,
  title: `Sample article ${n}`,
  titleEn: null,
  excerpt: "A short summary of the article appears here once you publish a post.",
  coverImageUrl: null,
  publishedAt: null,
  merchantName: null,
  merchantSlug: null,
  category: null,
}));

const COL_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

function Cover({ article, className }: { article: BlogCardData; className: string }) {
  if (!article.coverImageUrl) return null;
  return (
    <Link to="/blog/$slug" params={{ slug: article.slug }} className={className}>
      <img
        src={article.coverImageUrl}
        alt=""
        width={640}
        height={360}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </Link>
  );
}

function Meta({ article }: { article: BlogCardData }) {
  const author = article.author?.displayNameEn || article.author?.displayName || article.merchantName;
  return (
    <p className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
      {author ? <span>{author}</span> : null}
      {article.publishedAt ? (
        <time dateTime={article.publishedAt}>
          {new Date(article.publishedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })}
        </time>
      ) : null}
      {article.readingMinutes ? <span>{article.readingMinutes} min read</span> : null}
    </p>
  );
}

function Card({
  article,
  showCover,
  showExcerpt,
  showMeta,
  lead = false,
}: {
  article: BlogCardData;
  showCover: boolean;
  showExcerpt: boolean;
  showMeta: boolean;
  lead?: boolean;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-fq-md border border-border bg-card">
      {showCover ? (
        <Cover article={article} className={`block overflow-hidden ${lead ? "aspect-[21/9]" : "aspect-[16/9]"}`} />
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
        <h3 className={`font-semibold leading-snug ${lead ? "text-2xl" : "text-lg"}`}>
          <Link to="/blog/$slug" params={{ slug: article.slug }} className="hover:text-primary">
            {article.title}
          </Link>
        </h3>
        {showExcerpt && article.excerpt ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>
        ) : null}
        {showMeta ? <Meta article={article} /> : null}
      </div>
    </article>
  );
}

const BlogArchiveWidget: WidgetComponent = ({ str, bool, int }) => {
  const feed = useBlogFeed();
  const heading = str("heading");
  const layout = str("layout") || "grid";
  const columns = int("columns", 3, 1, 4);
  const limit = int("limit", 9, 1, 24);
  const showCover = bool("showCover");
  const showExcerpt = bool("showExcerpt");
  const showMeta = bool("showMeta");
  const articles = (feed?.articles ?? SAMPLE).slice(0, limit);

  const body = () => {
    if (!articles.length) {
      return <p className="text-sm text-muted-foreground">{str("emptyText") || "No articles yet."}</p>;
    }
    if (layout === "list") {
      return (
        <div className="flex flex-col divide-y divide-border">
          {articles.map((article) => (
            <div key={article.slug} className="flex gap-4 py-4">
              {showCover && article.coverImageUrl ? (
                <Cover article={article} className="hidden w-40 shrink-0 overflow-hidden rounded-fq-md sm:block" />
              ) : null}
              <div className="flex flex-1 flex-col gap-1">
                <h3 className="text-lg font-semibold leading-snug">
                  <Link to="/blog/$slug" params={{ slug: article.slug }} className="hover:text-primary">
                    {article.title}
                  </Link>
                </h3>
                {showExcerpt && article.excerpt ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{article.excerpt}</p>
                ) : null}
                {showMeta ? <Meta article={article} /> : null}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (layout === "minimal") {
      return (
        <ul className="flex flex-col gap-2">
          {articles.map((article) => (
            <li key={article.slug} className="flex flex-wrap items-baseline gap-2">
              <Link
                to="/blog/$slug"
                params={{ slug: article.slug }}
                className="text-base font-medium hover:text-primary"
              >
                {article.title}
              </Link>
              {showMeta && article.publishedAt ? (
                <time dateTime={article.publishedAt} className="text-xs text-muted-foreground">
                  {new Date(article.publishedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}
                </time>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }
    if (layout === "magazine") {
      const [lead, ...rest] = articles;
      return (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {lead ? (
              <Card article={lead} showCover={showCover} showExcerpt={showExcerpt} showMeta={showMeta} lead />
            ) : null}
          </div>
          <div className="flex flex-col gap-4">
            {rest.slice(0, 4).map((article) => (
              <Card
                key={article.slug}
                article={article}
                showCover={false}
                showExcerpt={false}
                showMeta={showMeta}
              />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className={`grid gap-6 ${COL_CLASS[columns] ?? COL_CLASS[3]!}`}>
        {articles.map((article) => (
          <Card
            key={article.slug}
            article={article}
            showCover={showCover}
            showExcerpt={showExcerpt}
            showMeta={showMeta}
          />
        ))}
      </div>
    );
  };

  return (
    <section>
      {heading ? <h2 className="mb-4 text-xl font-semibold">{heading}</h2> : null}
      {body()}
    </section>
  );
};

const BlogTermsWidget: WidgetComponent = ({ str, bool }) => {
  const feed = useBlogFeed();
  const facets = feed?.facets ?? [];
  const heading = str("heading");
  const showCounts = bool("showCounts");
  if (!facets.length) return null;
  if (str("style") === "list") {
    return (
      <nav aria-label="Browse by topic">
        {heading ? <h2 className="mb-2 text-sm font-semibold">{heading}</h2> : null}
        <ul className="flex flex-col gap-1 text-sm">
          {facets.map((facet) => (
            <li key={`${facet.kind}:${facet.slug}`}>
              <Link
                to={facet.kind === "tag" ? "/blog/tag/$slug" : "/blog/category/$slug"}
                params={{ slug: facet.slug }}
                className="inline-flex min-h-11 items-center gap-2 hover:text-primary"
              >
                <span>{facet.name}</span>
                {showCounts ? <span className="text-xs text-muted-foreground">{facet.count}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <div>
      {heading ? <h2 className="mb-2 text-sm font-semibold">{heading}</h2> : null}
      <ArchiveRail facets={facets} {...(feed?.activeSlug ? { activeSlug: feed.activeSlug } : {})} />
    </div>
  );
};

const BlogPagerWidget: WidgetComponent = ({ str }) => {
  const feed = useBlogFeed();
  if (!feed) return null;
  const align = str("align") || "center";
  const justify = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";
  return (
    <div className={`flex ${justify}`}>
      <Pager paging={feed.paging} basePath={feed.basePath} />
    </div>
  );
};

export const BLOG_WIDGETS = {
  blog_archive: BlogArchiveWidget,
  blog_terms: BlogTermsWidget,
  blog_pager: BlogPagerWidget,
} satisfies Record<string, WidgetComponent>;
