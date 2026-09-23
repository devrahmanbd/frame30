/**
 * Themeless reader blog (theme purge Task 3).
 *
 * Renders the live articles with default chrome — no theme blog template,
 * no preset tokens. The hand-written grid is the page, so the blog is never
 * blank. `themeKey` is kept as an ignored optional for cross-track compat.
 */
import type { ReactNode } from "react";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { ArticleGrid, Pager } from "@/components/store/BlogList";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";

export function BlogArchiveTheme({
  feed,
  header,
  empty,
}: {
  feed: BlogFeed;
  /** Breadcrumb + h1 + intro copy owned by the route (blog is a route-h1 template). */
  header: ReactNode;
  empty: ReactNode;
  themeKey?: string;
}) {
  return (
    <BlogFeedProvider value={feed}>
      <ThemeChrome
        template="blog"
        chrome={<div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>}
        ownsPrimary
        containerClassName="mx-auto max-w-6xl px-4 py-8"
        fallback={
          feed.articles.length ? (
            <>
              <ArticleGrid articles={feed.articles} />
              <Pager paging={feed.paging} basePath={feed.basePath} />
            </>
          ) : (
            empty
          )
        }
      />
      {feed.articles.length ? null : (
        <div className="mx-auto max-w-6xl px-4 pb-8">{empty}</div>
      )}
    </BlogFeedProvider>
  );
}
