/**
 * Phase 8 — the reader blog rendered through the theme host.
 *
 * `/blog` and every archive (category, tag, author) render the active theme's
 * `blog` template, so the listing carries the same header, footer, spacing and
 * tokens as the rest of the storefront and stays fully editable in the page
 * builder. The live articles reach the widgets through `BlogFeedProvider`; the
 * hand-written grid remains as the fallback when a theme publishes no blog
 * sections, so the blog is never blank because a template is missing.
 */
import type { ReactNode } from "react";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { ArticleGrid, Pager } from "@/components/store/BlogList";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
import { presetByKey, THEME_PRESETS } from "@/lib/theme-presets";

/** The platform blog wears the default published preset. */
function blogTheme(themeKey?: string) {
  return presetByKey(themeKey ?? "") ?? presetByKey("classic") ?? THEME_PRESETS[0]!;
}

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
  themeKey?: string;
}) {
  const preset = blogTheme(themeKey);
  return (
    <BlogFeedProvider value={feed}>
      <ThemeChrome
        template="blog"
        ast={preset.templates.blog}
        tokens={preset.tokens}
        chrome={<div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>}
        // The blog widgets are catalogue *context* widgets: `SectionRenderer`
        // drops any context widget whose slot is missing, so the archive, topic
        // and pager nodes have to be declared here even though their live rows
        // arrive through `BlogFeedProvider` rather than through a slot. Without
        // these three keys the themed blog renders an empty page.
        contextSlots={{ blog_archive: null, blog_terms: null, blog_pager: null }}
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
      {feed.articles.length ? null : <div className="mx-auto max-w-6xl px-4 pb-8">{empty}</div>}
    </BlogFeedProvider>
  );
}
