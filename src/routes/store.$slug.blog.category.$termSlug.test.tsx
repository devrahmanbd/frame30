/**
 * Batch B, gap 3/4 — the merchant-scoped category archive route.
 *
 * The route module is NOT imported here: it pulls the whole server graph
 * (the server fn, the chrome loader, the router runtime). The WIRING is
 * asserted by reading the four sources as text — the same pattern as
 * `store.$slug.search-composition.test.tsx` — and the two BEHAVIOURS the
 * gaps claim are proven by rendering the shared archive host itself:
 *
 *   · gap 4 — the theme's `pagination` widget renders STOREFRONT-side with
 *     the archive's OWN page math (12 per page, the archive's base path),
 *     because `ArchiveView` mounts the collection query the widget reads;
 *   · gap 3 — inside a store context the category chips point at
 *     `/store/<slug>/blog/category/<term>`, and outside one they keep the
 *     platform-wide route byte-for-byte.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveTemplateForHost } from "@/lib/pipeline-resolver";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";
import type { SectionBuilder, TemplateKey, ThemeAst } from "@/lib/builder-ast";

// `Link` needs a live router; these legs are about which hrefs are emitted,
// so the router is stubbed down to the anchor it would emit.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/" } }),
    Link: ({
      to,
      params,
      children,
      ...rest
    }: Record<string, unknown> & { children?: unknown }) => {
      const path = String(to ?? "").replace(/\$(\w+)/g, (_m, key: string) =>
        String((params as Record<string, string> | undefined)?.[key] ?? ""),
      );
      return (
        <a href={path} {...(rest as Record<string, unknown>)}>
          {children as React.ReactNode}
        </a>
      );
    },
  };
});

const { ArchiveView } = await import("@/components/store/ArchiveView");
const { archiveContextFrom } = await import("@/lib/archive-context");

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(DIR, "..");
const read = (...parts: string[]): string =>
  readFileSync(join(SRC, ...parts), "utf8");

const ROUTE = read("routes", "store.$slug.blog.category.$termSlug.tsx");
const FN = read("lib", "store-blog-archive.functions.ts");
const LOADER = read("lib", "store-blog-archive.server.ts");
const READER = read("lib", "blog-index.server.ts");
const HOST = read("components", "store", "ArchiveView.tsx");

describe("store category archive route — the platform keeps every authority", () => {
  it("is a server-side route over the rate-limited, tenant-resolved fn", () => {
    expect(ROUTE).toContain('"/store/$slug/blog/category/$termSlug"');
    expect(ROUTE).toContain("storeBlogArchiveFn");
    expect(ROUTE).toContain("if (!data) throw notFound();");
    expect(ROUTE).toContain("isStorefrontInfrastructureError");
    expect(ROUTE).toContain("normalizeStorefrontLoaderError");
    expect(ROUTE).toContain("notFoundComponent");
    expect(ROUTE).toContain("errorComponent: StorefrontError");
    // No client fetch: the listing arrives through the loader only.
    expect(ROUTE).not.toMatch(/fetch\(|useQuery|axios/);
    // The fn carries the reader bucket and closed inputs — a server
    // function is a public endpoint, so the limit is IN the fn.
    expect(FN).toContain('enforceRateLimit("blog.read"');
    expect(FN).toContain("archiveSchema.parse");
    expect(FN).not.toContain("merchantId");
  });

  it("resolves the composition through resolveTemplateForHost — published, storefront, tenant-scoped", () => {
    expect(LOADER).toContain('loadStoreChrome(slug, "archive")');
    expect(LOADER).toContain("if (!chrome) return null;");
    expect(LOADER).toContain("resolveTemplateForHost({");
    expect(LOADER).toContain('template: "archive_category"');
    expect(LOADER).toContain("tenant: chrome.merchant.id");
    expect(LOADER).toContain('mode: "published"');
    expect(LOADER).toContain('host: "storefront"');
    // The home chrome is merged through the SAME resolver on `index` —
    // one resolution rule, never a second lookup.
    expect(LOADER).toContain('template: "index"');
    expect(LOADER).toMatch(/homeAst\?\.header/);
    // The client receives the resolved AST — never the theme's map.
    expect(LOADER).not.toMatch(/return \{[^}]*templates/s);
    // The NAMED decline (G3): a published theme WITHOUT an archive body
    // ships an empty-main body inside the store's chrome, so the host
    // renders the declined-template frame around the platform grid — never
    // a silent, unbranded grid and never the StoreWelcome panel.
    expect(LOADER).toContain(
      'main: resolution.status === "resolved" ? resolution.ast.main : [],',
    );
    // A live archive's serialized AST is stripped of the authored empty
    // panel (the DOM strip alone left the string in the payload; measured
    // §(u.6)). An empty feed keeps it.
    expect(LOADER).toContain("stripArchiveEmptyState(ast.main)");
    expect(LOADER).toContain("archive.articles.length > 0");
  });

  it("windows the listing through the tenant-scoped reader, 404 on an unknown term", () => {
    expect(LOADER).toContain('loadTermArchive("category", termSlug, page, {');
    expect(LOADER).toContain("merchantId: chrome.merchant.id");
    expect(LOADER).toContain("basePath: archiveBase");
    expect(LOADER).toContain("if (error instanceof TermNotFound) return null;");
    // The reader scopes term, facets and articles by merchant, and the
    // cache key is tenant-prefixed only when scoped.
    expect(
      READER.match(/if \(merchantId\) query = query\.eq\("merchant_id"/g),
    ).toHaveLength(2);
    expect(hasScopedArticlesWindow(READER)).toBe(true);
    expect(READER).toContain("`blog|archive|${opts.merchantId}|${kind}|");
  });

  it("serves the server-resolved composition through the shared host, store-scoped", () => {
    expect(ROUTE).toContain("ast={data.ast}");
    expect(ROUTE).toContain("storeSlug={data.merchant.slug}");
    // The declined frame's label reads the store's DISPLAY name.
    expect(ROUTE).toContain("storeName={data.merchant.name}");
    expect(ROUTE).toContain("<StoreHeader");
    // The head is the store's own: canonicals through the permalink
    // settings, store breadcrumb paths — never the platform `/blog/*`.
    expect(ROUTE).toContain("storeArticleCanonical");
    expect(ROUTE).toContain("breadcrumbJsonLd");
    expect(ROUTE).toContain("`/store/${merchant.slug}/blog`");
  });

  it("the host mounts the collection query the pagination widget reads (gap 4)", () => {
    expect(HOST).toContain("<CollectionQueryProvider value={collectionQuery}>");
    expect(HOST).toContain("total: feed.paging.total");
    expect(HOST).toContain("basePath: feed.basePath(1)");
    expect(HOST).toContain("pageSize: feed.paging.pageSize");
    // The store slug reaches ThemeChrome ONLY with a composed body, so a
    // themeless store keeps the grid (never the StoreWelcome frame).
    expect(HOST).toContain("storeSlug={storeSlug ?? undefined}");
    // …and the merchant's display name rides the same mount, so the
    // declined frame's label reads the store's own voice.
    expect(HOST).toContain("storeName={storeName ?? undefined}");
  });
});

/** True when the articles window carries the tenant filter. */
function hasScopedArticlesWindow(src: string): boolean {
  return src.includes('articlesQuery.eq("merchant_id", opts.merchantId)');
}

/* ------------------------------------------------------------------------ *
 * The BEHAVIOURS — the shared host rendered directly (server markup).
 * ------------------------------------------------------------------------ */

const article = (slug: string, categorySlug: string | null) =>
  ({
    slug,
    title: `Article ${slug}`,
    titleEn: null,
    excerpt: null,
    coverImageUrl: null,
    publishedAt: "2026-08-28T00:00:00.000Z",
    merchantName: "Acme Weaves",
    merchantSlug: "acme",
    category: categorySlug ? { slug: categorySlug, name: "Sarees" } : null,
    readingMinutes: 3,
    author: null,
  }) as unknown as Parameters<
    typeof ArchiveView
  >[0]["feed"]["articles"][number];

const pagingAt2 = {
  page: 2,
  pageSize: 12,
  total: 30, // 3 pages AT 12 — only 2 at the search default of 24.
  lastPage: 3,
  from: 12,
  to: 23,
  overrun: false,
  prevPath: "",
  nextPath: "",
} as unknown as Parameters<typeof ArchiveView>[0]["feed"]["paging"];

const term = {
  id: "t1",
  merchant_id: "m1",
  kind: "category",
  slug: "eid",
  name: "Eid",
  name_en: "Eid",
  description: null,
  parent_id: null,
  sort_order: 0,
  cover_image_url: null,
  meta_title: null,
  meta_description: null,
  robots_index: true,
  article_count: 30,
} as never;

function renderHost(options: {
  storeSlug?: string;
  storeName?: string;
  themed?: boolean;
  songoskriti?: boolean;
  declined?: boolean;
}): string {
  const base = options.storeSlug
    ? `/store/${options.storeSlug}/blog/category/eid`
    : "/blog/category/eid";
  const feed = {
    articles: [article("woven", "sarees")],
    facets: [
      { slug: "sarees", name: "Sarees", kind: "category" as const, count: 9 },
    ],
    paging: { ...pagingAt2, prevPath: base, nextPath: `${base}?page=3` },
    activeSlug: "eid",
    basePath: (page: number) => (page > 1 ? `${base}?page=${page}` : base),
  } as unknown as Parameters<typeof ArchiveView>[0]["feed"];
  const context = archiveContextFrom({
    kind: "category",
    term,
    articles: feed.articles,
    facets: feed.facets,
    paging: feed.paging,
    ancestry: [term],
  });
  const themedProps = options.themed
    ? {
        // A composition whose main is the platform's own `pagination`
        // widget — the exact seam gap 4 closes.
        ast: {
          header: [],
          main: [{ id: "p1", type: "pagination" as const, props: {} }],
          footer: [],
        },
        tokens: null,
      }
    : options.songoskriti
      ? {
          ast: songoskritiPublishedAst(),
          tokens: songoskritiPreviewSource().tokens,
          themeKey: "songoskriti",
        }
      : options.declined
        ? {
            ast: songoskritiDeclinedAst(),
            tokens: songoskritiPreviewSource().tokens,
            themeKey: "songoskriti",
          }
        : {};
  return renderToStaticMarkup(
    <ArchiveView
      kind="category"
      context={context}
      feed={feed}
      header={<h1>Eid</h1>}
      empty={<p>Nothing here.</p>}
      {...themedProps}
      {...(options.storeSlug ? { storeSlug: options.storeSlug } : {})}
      {...(options.storeName ? { storeName: options.storeName } : {})}
    />,
  );
}

describe("the archive host — storefront pager and store-scoped chips", () => {
  it("renders the theme's pagination widget with the ARCHIVE's own page math (gap 4)", () => {
    const html = renderHost({ storeSlug: "acme", themed: true });
    // The WIDGET's pager rendered at all — it reads the mounted collection
    // query, not the empty default (which renders null). `tabular-nums` is
    // the theme widget's link class; the platform's own `<Pager>` does not
    // emit it.
    expect(html).toContain("tabular-nums");
    expect(html).toContain("/store/acme/blog/category/eid?page=3");
    // The 12-per-page window: total 30 is THREE pages here and would be two
    // at the search default of 24 — the third page's existence IS the proof
    // that the page size was threaded.
    expect(html).not.toContain("/search");
  });

  it("points the category chips at the merchant-scoped archive inside a store", () => {
    const html = renderHost({ storeSlug: "acme" });
    expect(html).toContain('href="/store/acme/blog/category/sarees"');
    expect(html).not.toContain('href="/blog/category/sarees"');
  });

  it("keeps the platform-wide chip outside a store context", () => {
    const html = renderHost({});
    expect(html).toContain('href="/blog/category/sarees"');
    expect(html).not.toContain("/store/acme");
  });

  it("renders Songoskriti's published archive composition with the term's data and the store's chrome (gap 3)", () => {
    const html = renderHost({
      storeSlug: "songoskriti",
      storeName: "Songoskriti",
      songoskriti: true,
    });
    // The theme's OWN composition renders (the variant `archive_category`
    // resolved first, exactly as the loader resolves it): Songoskriti's
    // category band marks it — the themeKey's widget map rendered the band,
    // not a platform-generic widget.
    expect(html).toContain("data-collection-header");
    // The live feed has rows: the host strips the theme's authored empty
    // panel, so "Nothing in this archive yet" never sits under the listing
    // (Swarm 4 §(u.5)C).
    expect(html).not.toContain("Nothing in this archive yet");
    // The resolved body is EXACTLY the six functional slots the host
    // grants — the preview/storefront parity, taken from the SAME
    // resolution the render just used.
    expect(songoskritiMap().archive!.main.map((s) => s.type)).toEqual([
      "category_header",
      "blog_terms",
      "blog_archive",
      "blog_pager",
      "pagination",
      "empty_state",
    ]);
    // The term's ROUTE data flows through the platform's pack: the grid
    // shows the feed's article and the terms rail links the
    // MERCHANT-SCOPED archive (the store slug context reached the pack).
    expect(html).toContain("Article woven");
    expect(html).toContain('href="/store/songoskriti/blog/category/sarees"');
    // The store's chrome: the theme's design tokens and the merged home
    // footer (the theme authors no archive footer — it borrows the home
    // template's policy links through the SAME resolver).
    expect(html).toContain("--theme-accent");
    expect(html).toContain("#8B4513");
    expect(html).toContain("/pages/size-guide");
    // The STOREFRONT pager: the theme's `pagination` widget at the
    // archive's own base path — 30 at 12/page is THREE pages, so page 3
    // exists only because the page size was threaded through the mounted
    // collection query (gap 4, inside the theme composition too).
    expect(html).toContain("/store/songoskriti/blog/category/eid?page=3");
    expect(html).not.toContain("/search");
  });

  it("renders the NAMED declined frame around the platform grid for a theme without an archive body (gap 3)", () => {
    const html = renderHost({
      storeSlug: "songoskriti",
      storeName: "Songoskriti",
      declined: true,
    });
    // The decline is NAMED (the plan's G3): the frame states the template.
    expect(html).toContain('data-fq-theme-state="declined-template"');
    expect(html).toContain('data-fq-template="archive"');
    expect(html).toContain(
      "Songoskriti — this theme does not design the Archive page",
    );
    // …and the platform's grid renders INSIDE the frame: the feed's own
    // article, at the article route the platform owns.
    expect(html).toContain("Article woven");
    expect(html).toContain('href="/blog/woven"');
    // The theme's chrome and tokens survive the decline (an absent body is
    // not "no theme") — and the store's footer never left the page.
    expect(html).toContain("--theme-accent");
    expect(html).toContain("#8B4513");
    expect(html).toContain("/pages/size-guide");
    // …and the declined main is EMPTY, never a synthesised body.
    expect(songoskritiDeclinedAst().main).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * Gap 3 — the theme maps, resolved EXACTLY as the loader resolves them:
 * Songoskriti's own template map built in-test from the theme's source
 * builders, then `resolveTemplateForHost` (variant-first:
 * `archive_category` → its `archive` base) with the home chrome merged
 * through the SAME resolver. No hand-stub — the same rule as the loader.
 * ------------------------------------------------------------------------ */

/** The plain builder the engine uses. */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/**
 * Songoskriti's map — the home template and the `archive` body the theme
 * authors. The DECLINED map drops the archive key: absent, never empty.
 */
function songoskritiMap(withArchive = true): Record<string, ThemeAst> {
  const source = songoskritiPreviewSource();
  const body = (t: TemplateKey): ThemeAst => {
    const s = plainBuilder();
    return {
      header: source.header(t, s),
      main: source.main(t, s) ?? [],
      footer: source.footer(t, s),
    };
  };
  const map: Record<string, ThemeAst> = { index: body("index") };
  if (withArchive) map.archive = body("archive");
  return map;
}

/** The loader's merge, run on the SAME resolver. */
function resolveAsLoaderDoes(variants: Record<string, ThemeAst>): ThemeAst {
  const resolution = resolveTemplateForHost({
    template: "archive_category",
    variants,
    tenant: "merchant-songoskriti",
    mode: "published",
    host: "storefront",
    tokens: songoskritiPreviewSource().tokens,
  });
  const home = resolveTemplateForHost({
    template: "index",
    variants,
    tenant: "merchant-songoskriti",
    mode: "published",
    host: "storefront",
  });
  const homeAst = home.status === "resolved" ? home.ast : null;
  return {
    // Songoskriti's header builders author nothing (the nav is Store
    // Header's) and its footer never leaves an archive short of the store's
    // links: the loader borrows the home chrome through the SAME resolver.
    header:
      resolution.status === "resolved" && resolution.ast.header.length
        ? resolution.ast.header
        : (homeAst?.header ?? []),
    main: resolution.status === "resolved" ? resolution.ast.main : [],
    footer:
      resolution.status === "resolved" && resolution.ast.footer.length
        ? resolution.ast.footer
        : (homeAst?.footer ?? []),
  };
}

/** The published composition a resolver-resolved store archive receives. */
function songoskritiPublishedAst(): ThemeAst {
  return resolveAsLoaderDoes(songoskritiMap());
}

/** The composition a DECLINING theme ships: chrome, empty main. */
function songoskritiDeclinedAst(): ThemeAst {
  return resolveAsLoaderDoes(songoskritiMap(false));
}
