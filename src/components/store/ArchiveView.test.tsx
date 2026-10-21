/**
 * Task 2 — the shared archive host.
 *
 * The host has ONE job it must never get wrong: a theme that authors no
 * archive body must see the platform's grid, and NEVER another template's
 * body. `resolveTemplate`'s fallback chain ends at `page` and then `index`,
 * so a bare `resolveTemplate(templates, "archive")` would hand an old
 * theme's PAGE composition — or the HOMEPAGE — to the archive. This suite
 * pins the rule:
 *
 * 1. no authored archive body -> the platform's grid;
 * 2. an authored archive body -> the theme's composition around the SAME
 *    records, in the SAME order;
 * 3. a theme whose only other template is `page` -> the GRID, not the page
 *    composition;
 * 4. the no-theme render is BYTE-IDENTICAL to today's `BlogArchiveTheme`
 *    render — the fallback is delegated, so it is identical by construction,
 *    and the test pins that fact;
 * 5. an unknown kind -> the explicit unsupported panel;
 * 6. an unresolved term -> the explicit not-found state.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// `Link` needs a live router; this suite is about which body renders, so
// the router is stubbed down to the anchor it would emit (the same stub
// `BlogArchiveTheme.test.tsx` uses).
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
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

const { ArchiveView } = await import("./ArchiveView");
const { BlogArchiveTheme } = await import("./BlogArchiveTheme");
const { archiveContextFrom } = await import("@/lib/archive-context");
import type { TemplateKey, ThemeAst } from "@/lib/builder-ast";

const ARTICLES = [
  {
    slug: "how-jamdani-is-woven",
    title: "How a jamdani saree is woven",
    titleEn: null,
    excerpt: "Two weavers, one loom, six weeks.",
    coverImageUrl: null,
    publishedAt: "2026-08-28T00:00:00.000Z",
    merchantName: "Songoskriti",
    merchantSlug: "songoskriti",
    category: null,
  },
  {
    slug: "the-loom-and-the-lake",
    title: "The loom and the lake",
    titleEn: null,
    excerpt: null,
    coverImageUrl: null,
    publishedAt: "2026-09-01T00:00:00.000Z",
    merchantName: "Songoskriti",
    merchantSlug: "songoskriti",
    category: null,
  },
];

const feed = {
  articles: ARTICLES,
  facets: [],
  paging: {
    page: 1,
    pageSize: 12,
    total: 2,
    lastPage: 1,
    from: 0,
    to: 1,
    overrun: false,
    prevPath: null,
    nextPath: null,
  },
  basePath: (page: number) =>
    page > 1 ? `/blog/category/jamdani?page=${page}` : "/blog/category/jamdani",
} as unknown as Parameters<typeof ArchiveView>[0]["feed"];

const context = archiveContextFrom({
  kind: "category",
  term: { id: "term-1", slug: "jamdani", name: "Jamdani", name_en: "Jamdani" },
  articles: ARTICLES,
  facets: [],
  paging: feed.paging,
  ancestry: [],
});

const header = <h1>Jamdani</h1>;
const empty = <p>No articles in this category yet.</p>;

/** An authored archive body — one blog-pack listing section. */
const archiveTemplates: Partial<Record<TemplateKey, ThemeAst>> = {
  archive: {
    header: [],
    main: [{ id: "archive-1", type: "blog_archive", props: {} }],
    footer: [],
  },
};

/** A theme whose only other body is the `page` composition. */
const pageOnlyTemplates: Partial<Record<TemplateKey, ThemeAst>> = {
  page: {
    header: [],
    main: [
      { id: "page-1", type: "page_content", props: {} },
      { id: "page-2", type: "heading", props: { text: "PAGE BODY" } },
    ],
    footer: [],
  },
};

function render(props: Partial<Parameters<typeof ArchiveView>[0]> = {}) {
  return renderToStaticMarkup(
    <ArchiveView
      kind="category"
      context={context}
      feed={feed}
      header={header}
      empty={empty}
      {...props}
    />,
  );
}

/** The slugs the render shows, in the order it shows them. */
function slugsOf(html: string): string[] {
  return [...html.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)].map((m) => m[1]!);
}

describe("the archive host — the theme resolution is a rule, not a call", () => {
  it("renders the PLATFORM GRID when no archive body is authored", () => {
    const html = render();
    expect(html).toContain("How a jamdani saree is woven");
    expect(html).toContain("the-loom-and-the-lake");
    expect(html).not.toContain("This archive is not supported");
  });

  it("renders the theme's composition when one IS authored", () => {
    const html = render({ templates: archiveTemplates });
    expect(html).toContain("How a jamdani saree is woven");
    // The theme's own body — the blog pack — is what renders the records.
    expect(html).toContain("data-fq-node");
  });

  it("a theme whose only other template is `page` renders the GRID, not the page composition", () => {
    // The forbidden case: `resolveTemplate` would fall back base -> page ->
    // index, so a bare call would hand the archive the page's body.
    const html = render({ templates: pageOnlyTemplates });
    expect(html).toContain("How a jamdani saree is woven");
    expect(html).not.toContain("PAGE BODY");
  });

  it("a theme with only the homepage renders the GRID, not the homepage body", () => {
    const html = render({
      templates: {
        index: {
          header: [],
          main: [
            {
              id: "index-1",
              type: "heading",
              props: { text: "HOMEPAGE BODY" },
            },
          ],
          footer: [],
        },
      } satisfies Partial<Record<TemplateKey, ThemeAst>>,
    });
    expect(html).toContain("How a jamdani saree is woven");
    expect(html).not.toContain("HOMEPAGE BODY");
  });
});

describe("the archive host — the fallback is honest", () => {
  it("the authored and the un-authored render show the SAME slugs in the SAME order", () => {
    const plain = slugsOf(render());
    const themed = slugsOf(render({ templates: archiveTemplates }));
    expect(plain).toEqual(["how-jamdani-is-woven", "the-loom-and-the-lake"]);
    expect(themed).toEqual(plain);
  });

  it("the no-theme render is BYTE-IDENTICAL to today's BlogArchiveTheme render", () => {
    // The fallback is DELEGATED, so it is identical by construction — and
    // the test pins that fact.
    const delegated = renderToStaticMarkup(
      <BlogArchiveTheme feed={feed} header={header} empty={empty} />,
    );
    expect(render()).toBe(delegated);
  });
});

describe("the archive host — the explicit states", () => {
  it("an unknown kind renders the explicit unsupported panel, never the grid", () => {
    const html = render({ kind: "collection" });
    expect(html).toContain("This archive is not supported");
    expect(html).not.toContain("How a jamdani saree is woven");
  });

  it("an unresolved term renders the explicit not-found state, never an empty archive", () => {
    const html = render({ context: null });
    expect(html).toContain("Archive not found");
    expect(html).not.toContain("How a jamdani saree is woven");
  });
});
