/**
 * Regression guard for the themed blog.
 *
 * `SectionRenderer` drops any catalogue *context* widget whose slot is missing,
 * and the blog widgets take their rows from `BlogFeedProvider` rather than a
 * slot — so forgetting to declare them in `contextSlots` renders an archive with
 * a heading and no posts (exactly the bug this test was written for).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// `Link` needs a live router; this suite is about which widgets render, so the
// router is stubbed down to the anchor it would emit.
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

const { BlogArchiveTheme } = await import("./BlogArchiveTheme");

const feed = {
  articles: [
    {
      slug: "how-jamdani-is-woven",
      title: "How a jamdani saree is woven",
      titleEn: null,
      excerpt: "Two weavers, one loom, six weeks.",
      coverImageUrl: null,
      publishedAt: "2026-08-28T00:00:00.000Z",
      merchantName: "Frame19 Demo Store",
      merchantSlug: "frame19-demo",
      category: null,
    },
  ],
  facets: [],
  paging: {
    page: 1,
    total: 1,
    pages: 1,
    from: 0,
    to: 0,
    overrun: false,
    prev: null,
    next: null,
  },
  basePath: (page: number) => (page > 1 ? `/blog?page=${page}` : "/blog"),
} as unknown as Parameters<typeof BlogArchiveTheme>[0]["feed"];

describe("BlogArchiveTheme", () => {
  it("renders the live article rows through the theme's blog template", () => {
    const html = renderToStaticMarkup(
      <BlogArchiveTheme
        feed={feed}
        header={<h1>Blog</h1>}
        empty={<p>No articles published yet.</p>}
      />,
    );
    expect(html).toContain("How a jamdani saree is woven");
    expect(html).toContain("/blog/how-jamdani-is-woven");
    expect(html).not.toContain("No articles published yet.");
  });

  it("forwards themeKey to ThemeChrome; with NO composition every key renders identically", () => {
    // Fix round: the prop was accepted but dropped. It is now forwarded;
    // with a null AST the blog has no themed sections, so every key —
    // including songoskriti — renders byte-identical generic markup.
    //
    // Batch C: the OLD title of this pin said "generic by design", which
    // was the wrong BASIS — the platform reader surfaces are store-less,
    // not themeless. The assertion is unchanged and still true; the two
    // cases below pin the OPPOSITE behaviour, which is the new truth: with
    // a composition resolved, the theme's body wraps the same articles.
    const render = (themeKey?: string | null) =>
      renderToStaticMarkup(
        <BlogArchiveTheme
          feed={feed}
          header={<h1>Blog</h1>}
          empty={<p>No articles published yet.</p>}
          themeKey={themeKey}
        />,
      );
    const unkeyed = render();
    const themed = render("songoskriti");
    const foreign = render("bazaar");
    expect(themed).toBe(unkeyed);
    expect(foreign).toBe(unkeyed);
    expect(themed).toContain("How a jamdani saree is woven");
  });

  // Batch C — the pin is REVERSED, and it is STRONGER than the one it
  // replaces. The old pin said "the blog is themeless by design"; the
  // measured basis is that the platform reader surfaces are STORE-LESS,
  // not themeless: a merchant-scoped caller carries a store slug, resolves
  // the theme's `blog` composition, and wears it around the SAME articles.
  it("renders the platform's grid byte-identically when NO composition is resolved", () => {
    // No AST at all — the platform's own surface. The grid is the page.
    const grid = renderToStaticMarkup(
      <BlogArchiveTheme
        feed={feed}
        header={<h1>Blog</h1>}
        empty={<p>No articles published yet.</p>}
      />,
    );
    // An explicit null AST is the SAME render — the default is the grid.
    const explicitNull = renderToStaticMarkup(
      <BlogArchiveTheme
        feed={feed}
        header={<h1>Blog</h1>}
        empty={<p>No articles published yet.</p>}
        ast={null}
        tokens={null}
      />,
    );
    expect(explicitNull).toBe(grid);
    // The grid carries the article row and the pager.
    expect(grid).toContain("How a jamdani saree is woven");
    expect(grid).toContain("/blog/how-jamdani-is-woven");
  });

  it("wears the theme's composition around the SAME articles when one is resolved", () => {
    const themed = renderToStaticMarkup(
      <BlogArchiveTheme
        feed={feed}
        header={<h1>Blog</h1>}
        empty={<p>No articles published yet.</p>}
        ast={{
          header: [],
          main: [
            {
              id: "opening-1",
              type: "heading",
              props: { text: "Browse the journal" },
            },
            {
              // The pack's listing widget: it reads the SAME feed the
              // platform's grid reads, through the SAME provider.
              id: "archive-1",
              type: "blog_archive",
              props: {
                heading: "From the journal",
                layout: "magazine",
                columns: 3,
                limit: 9,
                showCover: true,
                showExcerpt: true,
                showMeta: true,
              },
            },
          ],
          footer: [],
        }}
        tokens={null}
        themeKey="songoskriti"
      />,
    );
    // The theme's composition rendered …
    expect(themed).toContain("Browse the journal");
    // … around the SAME article the platform's grid renders. The feed is
    // still the platform's: the theme never re-authors the data.
    expect(themed).toContain("How a jamdani saree is woven");
    expect(themed).toContain("/blog/how-jamdani-is-woven");
  });
});
