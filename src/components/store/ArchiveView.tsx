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
import { stripArchiveEmptyState } from "@/lib/archive-ast";
import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
import { CollectionQueryProvider } from "@/components/builder/collection";
import { ArticleGrid, Pager } from "@/components/store/BlogList";
import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreSlugContext } from "@/lib/store-slug-context";
import { normalizeSearchParams } from "@/lib/storefront-search";

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
  /**
   * The `archive` composition, resolved SERVER-SIDE through
   * `resolveTemplateForHost` (`mode: "published"`, `host: "storefront"`)
   * by the merchant-scoped route (`/store/<slug>/blog/category/<termSlug>`).
   * Preferred over the client-side `resolveArchiveBody(templates)` when
   * present; the store-less routes pass neither and keep the platform grid.
   */
  ast?: ThemeAst | null;
  /** The theme's tokens, when a theme IS resolved. */
  tokens?: ThemeTokens | null;
  /** The merchant theme key, when a theme IS resolved. */
  themeKey?: string | null;
  /** The store slug when this archive serves a merchant storefront. */
  storeSlug?: string | null;
  /**
   * The merchant's DISPLAY name — the declined-template frame labels
   * itself in the store's own voice (`ThemeChrome`'s
   * `storeName ?? storeSlug`). Absent in themeless and store-less hosts,
   * where no frame renders.
   */
  storeName?: string | null;
};

/**
 * The archive's ALWAYS-granted functional slots. The theme's body is built
 * from these five plus `empty_state`, which is the ONE conditional grant:
 * the theme's authored empty panel must render only when the feed is empty,
 * exactly as Search grants its empty state (`store.$slug.search.tsx`). A
 * live listing must never carry "Nothing in this archive yet" underneath it
 * (Swarm 4 review §(u.5)).
 */
const ARCHIVE_SLOTS: Partial<Record<SectionType, ReactNode>> = {
  category_header: null,
  blog_terms: null,
  blog_archive: null,
  blog_pager: null,
  pagination: null,
};

/**
 * The theme's authored archive body, or null.
 *
 * The BASE key only — this client-side path serves the three store-less
 * routes, which carry no store subject and resolve no theme. The VARIANT
 * (`archive_category`, and its tag/author siblings when they land) is
 * resolved SERVER-SIDE through `resolveTemplateForHost` by the
 * merchant-scoped route and arrives here through the `ast` prop — a
 * stored-AST host never ships the theme's template map to the client to
 * re-resolve it.
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
  ast: composedAst,
  tokens,
  themeKey,
  storeSlug,
  storeName,
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

  // The server-resolved composition wins (the merchant-scoped route resolves
  // it through `resolveTemplateForHost`); the client-side resolve stays for
  // the store-less routes' legacy `templates` path.
  const ast = composedAst ?? resolveArchiveBody(templates);
  // The empty state's context grant is only half the contract: the theme
  // authors `empty_state` as an ordinary section, so the live body is
  // stripped of it below while this grant is also withheld.
  const archiveSlots: Partial<Record<SectionType, ReactNode>> = {
    ...ARCHIVE_SLOTS,
    ...(feed.articles.length === 0 ? { empty_state: null } : {}),
  };
  // The collection query the theme's `pagination` widget reads: the
  // ARCHIVE's own total, base path and page size, never the search demo's
  // 24 — a pager windowed at the wrong size links past the real last page
  // (gap 4).
  const collectionQuery = {
    params: normalizeSearchParams({ page: feed.paging.page }),
    total: feed.paging.total,
    basePath: feed.basePath(1),
    pageSize: feed.paging.pageSize,
  };
  if (!ast) {
    // The platform's grid — DELEGATED, not re-implemented, so the fallback
    // is byte-identical to the grid the platform has always served. The
    // store-slug provider only re-points the cards' category chips at the
    // merchant-scoped archive; no ThemeChrome here, so a themeless store
    // keeps the grid (never the StoreWelcome frame).
    return (
      <BlogFeedProvider value={feed}>
        <CollectionQueryProvider value={collectionQuery}>
          <StoreSlugContext.Provider value={storeSlug ?? null}>
            <BlogArchiveTheme
              feed={feed}
              header={header}
              empty={empty}
              themeKey={themeKey ?? null}
            />
          </StoreSlugContext.Provider>
        </CollectionQueryProvider>
      </BlogFeedProvider>
    );
  }

  // The theme's archive composition, around the SAME records the grid
  // would have rendered. `storeSlug` enters ThemeChrome only HERE — with a
  // composed body the store is themed, so the storefront side effects
  // (store linkBase, per-store language scope, the live-cart scope, the
  // SectionRenderer slug context) are standard storefront behaviour.
  const renderAst =
    feed.articles.length === 0
      ? ast
      : { ...ast, main: stripArchiveEmptyState(ast.main) };
  return (
    <BlogFeedProvider value={feed}>
      <CollectionQueryProvider value={collectionQuery}>
        <StoreSlugContext.Provider value={storeSlug ?? null}>
          <ThemeChrome
            template="archive"
            ast={renderAst}
            tokens={tokens ?? null}
            themeKey={themeKey ?? null}
            storeSlug={storeSlug ?? undefined}
            storeName={storeName ?? undefined}
            chrome={
              <div className="mx-auto max-w-6xl px-4 pt-12">{header}</div>
            }
            ownsPrimary
            containerClassName="mx-auto max-w-6xl px-4 py-8"
            contextSlots={archiveSlots}
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
        </StoreSlugContext.Provider>
      </CollectionQueryProvider>
    </BlogFeedProvider>
  );
}
