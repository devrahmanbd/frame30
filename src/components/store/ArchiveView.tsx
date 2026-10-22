/**
 * The shared archive host.
 *
 * The content archive (Decision **D1'** — the archive key is REAL) has ONE
 * host, and this is it. It renders exactly one of two things:
 *
 * 1. **the theme's `archive` composition**, when the theme authors one —
 *    through `ThemeChrome`, with the archive's six functional slots
 *    granted; or
 * 2. **the platform's grid**, when it does not — DELEGATED to the existing
 *    `BlogArchiveTheme`, never re-implemented here, so the fallback is
 *    byte-identical to the grid the platform has always served.
 *
 * **The theme resolution is a rule, not a call.** `resolveTemplate` must
 * NOT be used bare: its fallback chain is `suffix -> slug -> base -> page
 * -> index` (`src/lib/builder-ast.ts`), so a theme that authors no archive
 * body would resolve to the PAGE composition or the HOMEPAGE composition —
 * both forbidden. Only a `"base"` match (or a `"suffix"` match, once the
 * closed variant vocabulary exists) is an authored archive body. Every
 * other match — `"page"`, `"index"`, `"empty"` — means NO archive body, and
 * the platform grid renders.
 *
 * The unknown-kind case and the unresolved-term case are EXPLICIT states:
 * a named panel, never the homepage, never a listing of some other kind and
 * never an empty-but-200 archive.
 */
import type { ReactNode } from "react";
import {
  resolveTemplate,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";
import { parseArchiveKind, type ArchiveContext } from "@/lib/archive-context";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
import { ArticleGrid, Pager } from "@/components/store/BlogList";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
import { ThemeChrome } from "@/components/store/ThemeChrome";

export type ArchiveViewProps = {
  /** The requested archive kind — validated against the closed vocabulary. */
  kind: string;
  /** The route-owned context. Null when the route resolved no term. */
  context: ArchiveContext | null;
  /** The platform's feed — the blog pack reads it, the grid renders it. */
  feed: BlogFeed;
  /** Breadcrumb + h1 + intro copy owned by the route. */
  header: ReactNode;
  /** What an empty archive shows. */
  empty: ReactNode;
  /** The theme's templates, when a theme IS resolved. */
  templates?: Partial<Record<TemplateKey, ThemeAst>> | null;
  /** The theme's tokens, when a theme IS resolved. */
  tokens?: ThemeTokens | null;
  /** The merchant theme key, when a theme IS resolved. */
  themeKey?: string | null;
};

/**
 * The archive's functional slots — the six the archive body is built from.
 * The grant set is EXACTLY those six, so the preview host and this host
 * agree and a slot the body does not use is never granted.
 */
const ARCHIVE_SLOTS: Partial<Record<SectionType, ReactNode>> = {
  category_header: null,
  blog_terms: null,
  blog_archive: null,
  blog_pager: null,
  pagination: null,
  empty_state: null,
};

/**
 * The theme's authored archive body, or null.
 *
 * The BASE key only, for now. The closed variant vocabulary DOES exist
 * (`TEMPLATE_VARIANTS` carries `archive: [category, tag, author]`,
 * `src/lib/template-variants.ts`), and `resolveVariantAst` is the one
 * resolver that honours it — but the archive's three variants are reached
 * through the **deferred merchant-scoped route**
 * (`/store/<slug>/blog/category/<slug>` and its two siblings), which does
 * not exist yet. The three store-less routes that DO exist today
 * (`/blog/category/$slug`, `/blog/tag/$slug`, `/blog/author/$slug`) carry no
 * store subject, resolve no theme and render the platform's grid, so there
 * is no variant for them to resolve. When the merchant-scoped route lands,
 * THIS function must resolve the VARIANT first and the base second — the
 * order `resolveVariantAst` already implements — or a theme's
 * `archive_category` composition would never render.
 */
function resolveArchiveBody(
  templates: Partial<Record<TemplateKey, ThemeAst>> | null | undefined,
): ThemeAst | null {
  if (!templates) return null;
  const resolved = resolveTemplate(templates, "archive");
  if (!resolved) return null;
  if (resolved.match !== "base" && resolved.match !== "suffix") return null;
  return resolved.ast;
}

/** A named panel — the explicit state, never a redirect and never a listing. */
function ArchiveNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
    </main>
  );
}

export function ArchiveView({
  kind,
  context,
  feed,
  header,
  empty,
  templates,
  tokens,
  themeKey,
}: ArchiveViewProps) {
  // The kind vocabulary is CLOSED. An unknown kind is an explicit state —
  // never the homepage, never a listing of some other kind.
  if (!parseArchiveKind(kind)) {
    return (
      <BlogFeedProvider value={feed}>
        <ArchiveNotice
          title="This archive is not supported"
          body="The platform serves a category, a tag and an author archive. This is not one of them."
        />
      </BlogFeedProvider>
    );
  }
  // An unresolved term is an explicit not-found state — never an
  // empty-but-200 archive.
  if (!context || context.state === "not-found") {
    return (
      <BlogFeedProvider value={feed}>
        <ArchiveNotice
          title="Archive not found"
          body="This archive does not exist. It may have been renamed, or it may never have existed."
        />
      </BlogFeedProvider>
    );
  }

  const ast = resolveArchiveBody(templates);
  if (!ast) {
    // The platform's grid — DELEGATED, not re-implemented, so the fallback
    // is byte-identical to the grid the platform has always served.
    return (
      <BlogFeedProvider value={feed}>
        <BlogArchiveTheme
          feed={feed}
          header={header}
          empty={empty}
          themeKey={themeKey ?? null}
        />
      </BlogFeedProvider>
    );
  }

  // The theme's archive composition, around the SAME records the grid
  // would have rendered.
  return (
    <BlogFeedProvider value={feed}>
      <ThemeChrome
        template="archive"
        ast={ast}
        tokens={tokens ?? null}
        themeKey={themeKey ?? null}
        chrome={<div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>}
        ownsPrimary
        containerClassName="mx-auto max-w-6xl px-4 py-8"
        contextSlots={ARCHIVE_SLOTS}
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
    </BlogFeedProvider>
  );
}
