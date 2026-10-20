/**
 * The CMS page route keeps its sibling-page nav — and its container —
 * correct when a THEME renders the body.
 *
 * `PageView` renders a CMS page through one of two paths:
 *
 *  - **themed** — the theme's main declares the route's `page_content` slot,
 *    so `ThemeChrome` renders the theme's layout and the route's `fallback`
 *    is never rendered;
 *  - **unthemed** — the route's fallback renders the body, with the "More
 *    information" sibling-page nav as a sibling column of a two-column grid.
 *
 * When the Songoskriti page template started declaring `page_content`, every
 * Songoskriti CMS page took the themed path — which dropped the nav (the
 * merchant-visible regression this branch introduced) and left the grid's
 * `lg:grid-cols-[1fr_15rem]` reserving an EMPTY 15rem gutter at `lg+`,
 * because the themed container has a single child.
 *
 * These cases pin both halves of the fix against the ONE predicate that
 * decides the path (`themeRendersBody` — the predicate `ThemeChrome` itself
 * uses): the themed path renders the nav below the merchant's own content
 * and outside their article, and the unthemed path is unchanged.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Section, ThemeAst } from "@/lib/builder-ast";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useRouterState: () => ({
      location: { pathname: "/store/acme/pages/about" },
    }),
    // The store path's `Link` carries `params`; the mock resolves them so a
    // test can pin the URL the merchant's shopper is actually sent to.
    Link: (p: Record<string, unknown>) => {
      const { to, params, search, children, ...rest } = p as {
        to?: unknown;
        params?: unknown;
        search?: unknown;
        children?: unknown;
        [k: string]: unknown;
      };
      void search;
      const bag = (params ?? {}) as Record<string, string>;
      const href =
        typeof to === "string"
          ? to.replace(
              /\$([A-Za-z_][A-Za-z0-9_]*)/g,
              (_m, key: string) => bag[key] ?? "",
            )
          : "/";
      return h(
        "a",
        {
          href,
          ...rest,
        },
        children as never,
      );
    },
  };
});

import { PageView } from "./PageView";
import { themeRendersBody } from "@/lib/theme-body-slot";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";

const NAV = [
  { slug: "about", title: "About us" },
  { slug: "shipping", title: "Shipping" },
  { slug: "returns", title: "Returns" },
];

/** The plain builder the engine uses (`assemblePreviewTemplates`). */
function plainBuilder() {
  let n = 0;
  return (type: string, props: Record<string, unknown> = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The Songoskriti theme's REAL `page` main — it declares `page_content`. */
function songoskritiPageAst(): ThemeAst {
  const main =
    songoskritiPreviewSource().main("page", plainBuilder() as never) ??
    ([] as unknown as Section[]);
  return { header: [], main, footer: [] };
}

/** A theme main that does NOT declare the route's content slot. */
function themeMainWithoutSlot(): ThemeAst {
  return {
    header: [],
    main: [
      { id: "demo-heading", type: "heading", props: { text: "theme-demo" } },
    ],
    footer: [],
  };
}

/** A theme main whose content-slot section failed validation. */
function themeMainWithInvalidSlot(): ThemeAst {
  return {
    header: [],
    main: [
      {
        id: "broken-slot",
        type: "page_content",
        props: {},
        invalid: "unknown prop",
      },
    ],
    footer: [],
  };
}

/** The exact payload shape the storefront loader returns. */
function payload(ast: ThemeAst | null) {
  return {
    merchant: { id: "m1", name: "Acme", slug: "acme" },
    page: {
      title: "About us",
      slug: "about",
      excerpt: "Who we are",
      updated_at: "2026-10-20T00:00:00.000Z",
      theme_id: null,
    },
    html: "<p>MERCHANT-BODY-MARKER</p>",
    isBuilder: false,
    studioNodes: null,
    customCss: null,
    nav: NAV,
    menus: { header: [], footer: [], mobile: [] },
    ast,
    // Tokens present: a merchant with a theme always has them, and their
    // absence (with no AST either) is the separate themeless welcome page.
    tokens: {},
    themeKey: "songoskriti",
    siteKit: null,
    installedPlugins: [],
    origin: "http://localhost:3020",
  };
}

function render(ast: ThemeAst | null): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(PageView, {
        data: payload(ast) as never,
      }),
    }),
  );
}

/** The class list of the route's `<main>` container. */
function containerClass(markup: string): string {
  const match = /<main class="([^"]*)"/.exec(markup);
  expect(match, "the route renders a <main> container").not.toBeNull();
  return match![1]!;
}

/** The nav's markup, sliced out of the rendered page. */
function navMarkup(markup: string): string {
  const start = markup.indexOf("<aside");
  expect(start, "the page renders the sibling-page nav").toBeGreaterThan(-1);
  const end = markup.indexOf("</aside>", start);
  expect(end, "the nav is closed").toBeGreaterThan(-1);
  return markup.slice(start, end);
}

/**
 * The markup INSIDE the themed slot's spaced container — the wrapper that
 * holds the merchant's article AND the nav.
 *
 * `ThemeChrome` spaces the theme's own `main` children with the same
 * `space-y-8` class, so the container under test is the one whose content
 * opens with the merchant's `<article>`: the outer, theme-level container
 * holds the whole main, this one holds the slot value.
 *
 * The container's own close tag is found by counting `<div>`/`</div>`: the
 * merchant's body carries its own nested `<div>`, so the first `</div>`
 * after the opening tag is NOT the container's.
 */
function spacedContainerInner(markup: string): string {
  const open = /<div class="space-y-8"><article>/.exec(markup);
  expect(
    open,
    "the themed slot wraps the merchant's article and the nav in a spaced container",
  ).not.toBeNull();
  const start = open!.index + open![0].length;
  let depth = 1;
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = start;
  let match = tag.exec(markup);
  while (match !== null) {
    depth += match[0] === "<div" ? 1 : -1;
    if (depth === 0) return markup.slice(start, match.index);
    match = tag.exec(markup);
  }
  throw new Error("the spaced container is never closed");
}

describe("CMS page route — the sibling-page nav survives a themed body", () => {
  it("themed: renders the merchant's body AND the nav, with no reserved 15rem column", () => {
    const ast = songoskritiPageAst();
    const markup = render(ast);

    // The merchant's own body renders (the theme's layout, not the route's
    // fallback).
    expect(markup).toContain("MERCHANT-BODY-MARKER");
    // The nav is back — it was dropped by the themed path.
    expect(markup).toContain("More information");
    expect(navMarkup(markup)).toContain("About us");
    expect(navMarkup(markup)).toContain("Shipping");
    expect(navMarkup(markup)).toContain("Returns");

    // The empty gutter is gone: the container is single-column.
    expect(containerClass(markup)).not.toContain("grid-cols-[1fr_15rem]");
    expect(containerClass(markup)).not.toContain("grid");
    expect(containerClass(markup)).toBe("mx-auto max-w-5xl px-4 py-8");
  });

  it("themed: the nav sits BELOW the merchant's content and outside their article", () => {
    const markup = render(songoskritiPageAst());

    // Below the merchant's content.
    expect(markup.indexOf("MERCHANT-BODY-MARKER")).toBeLessThan(
      markup.indexOf("<aside"),
    );
    // Outside their article: the article closes before the nav opens.
    expect(markup.indexOf("</article>")).toBeLessThan(markup.indexOf("<aside"));
    // The merchant's content is not nested inside the nav.
    expect(navMarkup(markup)).not.toContain("MERCHANT-BODY-MARKER");
    // …and it is not mutated: the merchant's own h1 survives, exactly once.
    expect(markup.split("<h1").length - 1).toBe(1);
    expect(markup).toContain("About us</h1>");
  });

  it("themed: the nav sits INSIDE the spaced container; unthemed: it stays a grid sibling", () => {
    // ── THEMED ────────────────────────────────────────────────────────────
    // The context widget renders the slot value with no wrapper of its own,
    // so without a container the nav's `<aside>` starts exactly where the
    // merchant's article ends — flush against it. The slot value is wrapped
    // in the theme's own vertical-rhythm utility (`space-y-8`, the class
    // `ThemeChrome` spaces the theme's `main` children with) so the nav is
    // visually separated from the article.
    const themed = render(songoskritiPageAst());

    // The wrapper carries the spacing class and opens the container.
    expect(themed).toContain('<div class="space-y-8">');

    // The nav is INSIDE that container…
    const inner = spacedContainerInner(themed);
    expect(inner).toContain("<aside");
    expect(navMarkup(themed)).toBe(
      inner.slice(inner.indexOf("<aside"), inner.indexOf("</aside>")),
    );
    // …as a sibling of the merchant's article, never inside it: the article
    // closes first, then the nav opens.
    expect(inner.indexOf("</article>")).toBeLessThan(inner.indexOf("<aside"));
    // The merchant's content is untouched and not nested inside the nav.
    expect(inner).toContain("MERCHANT-BODY-MARKER");
    expect(navMarkup(themed)).not.toContain("MERCHANT-BODY-MARKER");

    // ── UNTHEMED ──────────────────────────────────────────────────────────
    // The fallback path is unchanged: the nav is a SIBLING `<aside>` in the
    // two-column grid, and no spaced container is introduced there.
    const unthemed = render(themeMainWithoutSlot());

    expect(containerClass(unthemed)).toBe(
      "mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]",
    );
    expect(unthemed).toMatch(/<\/div><aside/);
    expect(unthemed).not.toContain('<div class="space-y-8"><article>');
  });

  it("the themed path is the one the shared predicate names", () => {
    // The route's layout and the theme's own choice ask the SAME question:
    // `themeRendersBody` is imported, not re-derived.
    const ast = songoskritiPageAst();
    expect(themeRendersBody(ast, "page_content")).toBe(true);
    expect(themeRendersBody(themeMainWithoutSlot(), "page_content")).toBe(
      false,
    );
    expect(themeRendersBody(themeMainWithInvalidSlot(), "page_content")).toBe(
      false,
    );
    expect(themeRendersBody(null, "page_content")).toBe(false);
  });

  it("unthemed (a theme main without the content slot): the two-column container and the sibling nav are unchanged", () => {
    const markup = render(themeMainWithoutSlot());

    expect(markup).toContain("MERCHANT-BODY-MARKER");
    // The container still reserves the nav's column.
    expect(containerClass(markup)).toBe(
      "mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]",
    );
    // The nav is a SIBLING of the content column (the grid's second child),
    // not a child of the merchant's article.
    expect(markup).toMatch(/<\/div><aside/);
    expect(markup.indexOf("</article>")).toBeLessThan(markup.indexOf("<aside"));
    expect(navMarkup(markup)).not.toContain("MERCHANT-BODY-MARKER");
  });

  it("unthemed (no theme AST): unchanged", () => {
    const markup = render(null);

    expect(markup).toContain("MERCHANT-BODY-MARKER");
    expect(containerClass(markup)).toBe(
      "mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]",
    );
    expect(markup).toMatch(/<\/div><aside/);
  });

  it("unthemed (an invalid content-slot section): unchanged", () => {
    // The theme's slot section failed validation, so the theme does not
    // render the body — the route's fallback does, exactly as before.
    const markup = render(themeMainWithInvalidSlot());

    expect(markup).toContain("MERCHANT-BODY-MARKER");
    expect(containerClass(markup)).toBe(
      "mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]",
    );
    expect(markup).toMatch(/<\/div><aside/);
  });

  it("the nav's links point at the sibling pages, and the current page carries aria-current", () => {
    for (const markup of [
      render(songoskritiPageAst()),
      render(themeMainWithoutSlot()),
    ]) {
      const nav = navMarkup(markup);
      expect(nav).toContain('href="/store/acme/pages/shipping"');
      expect(nav).toContain('href="/store/acme/pages/returns"');
      expect(nav).toContain('href="/store/acme/pages/about"');
      // The page being viewed is the current one.
      expect(nav).toContain('aria-current="page"');
      // …and only that one.
      expect(nav.split('aria-current="page"').length - 1).toBe(1);
      // Each sibling page is listed exactly once (no duplicate nav).
      expect(nav.split('href="/store/acme/pages/shipping"').length - 1).toBe(1);
      expect(nav.split(">Shipping<").length - 1).toBe(1);
    }
  });
});
