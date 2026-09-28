/**
 * Themeless reader blog (theme purge Task 3).
 *
 * Renders the live articles with default chrome — no theme blog template,
 * no preset tokens. The hand-written grid is the page, so the blog is never
 * blank. `themeKey` is forwarded to ThemeChrome (fix round: no dead prop);
 * with a null AST it changes nothing today, and the render stays generic
 * for every key by design — pinned in BlogArchiveTheme.test.tsx.
 */
import type { ReactNode } from "react";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { ArticleGrid, Pager } from "@/components/store/BlogList";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";

export function BlogArchiveTheme({
  feed,
  header,
  empty,
  themeKey,
}: {
  feed: BlogFeed;
  /** Breadcrumb + h1 + intro copy owned by the route (blog is a route-h1 template). */
  header: ReactNode;
  empty: ReactNode;
  themeKey?: string | null;
}) {
  return (
    <BlogFeedProvider value={feed}>
      <ThemeChrome
        template="blog"
        ast={null}
        tokens={null}
        themeKey={themeKey ?? null}
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
