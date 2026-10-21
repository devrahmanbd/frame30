/**
 * The blog reader host.
 *
 * Two modes, one component:
 *
 * 1. **The platform's grid** — the default. With no AST the render is the
 *    hand-written grid the platform has always served: the live articles
 *    with default chrome, no theme blog template, no preset tokens. The
 *    grid is the page, so the blog is never blank.
 * 2. **The theme's `blog` composition** — when a MERCHANT-SCOPED caller
 *    resolves one (Batch C). The theme's body wraps the SAME articles: the
 *    platform still owns the feed, the route still owns the `<h1>`, and the
 *    theme contributes the composition around them.
 *
 * The store-less platform reader surfaces (`/blog`, `/blog/category/$slug`,
 * `/blog/tag/$slug`, `/blog/author/$slug`) carry no store slug and
 * therefore resolve no theme at all — they are STORE-LESS, not themeless.
 * `themeKey` is forwarded to ThemeChrome (fix round: no dead prop); with a
 * null AST it changes nothing today, and the render stays generic for every
 * key by design — pinned in BlogArchiveTheme.test.tsx.
 */
import type { ReactNode } from "react";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { ArticleGrid, Pager } from "@/components/store/BlogList";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
import type { ThemeAst, ThemeTokens } from "@/lib/builder-ast";

export function BlogArchiveTheme({
  feed,
  header,
  empty,
  themeKey,
  ast,
  tokens,
}: {
  feed: BlogFeed;
  /** Breadcrumb + h1 + intro copy owned by the route (blog is a route-h1 template). */
  header: ReactNode;
  empty: ReactNode;
  themeKey?: string | null;
  /**
   * The theme's `blog` composition (Batch C). ABSENT = the platform's own
   * grid — byte-identical to the render this component has always produced.
   * PRESENT = the theme's composition wraps the SAME articles.
   */
  ast?: ThemeAst | null;
  /** The theme's tokens, when a composition is present. */
  tokens?: ThemeTokens | null;
}) {
  return (
    <BlogFeedProvider value={feed}>
      <ThemeChrome
        template="blog"
        ast={ast ?? null}
        tokens={tokens ?? null}
        themeKey={themeKey ?? null}
        chrome={<div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>}
        ownsPrimary
        containerClassName="mx-auto max-w-6xl px-4 py-8"
        // The blog pack is a CONTEXT widget set (`blog_terms` /
        // `blog_archive` / `blog_pager`): the widgets take their rows from
        // the feed this host mounts, not from a slot the route grants. The
        // grant is what decides whether they render — without it a themed
        // blog would show a heading and no posts.
        contextSlots={{
          blog_terms: null,
          blog_archive: null,
          blog_pager: null,
        }}
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
