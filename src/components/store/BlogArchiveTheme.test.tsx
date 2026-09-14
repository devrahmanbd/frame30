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
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ to, params, children, ...rest }: Record<string, unknown> & { children?: unknown }) => {
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
  paging: { page: 1, total: 1, pages: 1, from: 0, to: 0, overrun: false, prev: null, next: null },
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
});

