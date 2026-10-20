/**
 * Phase 1 — the CMS page route and the CMS-designated homepage both render
 * the MERCHANT's body inside the theme's layout.
 *
 * The theme's `page` template used to carry its own demo copy ("Size guide"
 * / "How to measure" / "Demo article") and declared no `page_content` slot.
 * Two consequences, both merchant-visible:
 *
 *  - the CMS page route (`PageView`, which names `contentSlot="page_content"`)
 *    made `ThemeChrome` skip the theme's layout entirely and render the
 *    route's fallback instead;
 *  - the CMS-designated homepage (`StoreHomepage`, which names no
 *    `contentSlot`) rendered the theme's demo copy in place of the
 *    merchant's body.
 *
 * Both hosts flow their real body through the same `page_content` context
 * slot. The theme's template now declares it, so the theme's layout renders
 * AND the merchant's body renders inside it — exactly one `<h1>`, and none of
 * the old demo copy.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useRouterState: () => ({
      location: { pathname: "/store/acme/pages/about" },
    }),
    Link: (p: Record<string, unknown>) => {
      const { to, children, ...rest } = p as {
        to?: unknown;
        children?: unknown;
        [k: string]: unknown;
      };
      return h(
        "a",
        {
          href: typeof to === "string" ? to : "/",
          ...rest,
        },
        children as never,
      );
    },
  };
});

import { ThemeChrome } from "./ThemeChrome";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";
import type { SectionBuilder } from "@/lib/builder-ast";

/**
 * The plain builder the engine uses (`assemblePreviewTemplates`,
 * `src/lib/theme-preview-nav.ts:384-391`).
 */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The theme's real `page` AST, authored the way the engine authors it. */
function themePageAst() {
  const main = songoskritiPreviewSource().main("page", plainBuilder()) ?? [];
  return { header: [], main, footer: [] };
}

/** Count the occurrences of the literal `<h1` in the rendered markup. */
function h1Count(markup: string): number {
  return markup.split("<h1").length - 1;
}

describe("Songoskriti page template — the merchant's body wins", () => {
  it("renders the merchant's body inside the theme layout on the CMS page route", () => {
    const markup = renderToStaticMarkup(
      <ThemeChrome
        template="page"
        ast={themePageAst()}
        tokens={null}
        merchantId={null}
        siteKit={null}
        contentSlot="page_content"
        ownsPrimary={false}
        contextSlots={{
          breadcrumb: <nav>BREADCRUMB-MARKER</nav>,
          page_content: (
            <article>
              <h1>Merchant Title</h1>
              <p>MERCHANT-BODY-MARKER</p>
            </article>
          ),
        }}
        fallback={<div>ROUTE-FALLBACK-MARKER</div>}
      />,
    );

    expect(markup).toContain("MERCHANT-BODY-MARKER");
    expect(markup).toContain("BREADCRUMB-MARKER");
    expect(markup).not.toContain("ROUTE-FALLBACK-MARKER");
    expect(h1Count(markup)).toBe(1);
    expect(markup).not.toContain("Size guide");
    expect(markup).not.toContain("How to measure");
    expect(markup).not.toContain("Demo article");
  });

  it("renders the merchant's body on the CMS-designated homepage too", () => {
    // The `StoreHomepage` shape: `template="page"`, no `contentSlot` prop.
    const markup = renderToStaticMarkup(
      <ThemeChrome
        template="page"
        ast={themePageAst()}
        tokens={null}
        merchantId={null}
        siteKit={null}
        ownsPrimary
        contextSlots={{
          page_content: (
            <article>
              <h1>Merchant Title</h1>
              <p>MERCHANT-HOMEPAGE-MARKER</p>
            </article>
          ),
        }}
        fallback={<div>ROUTE-FALLBACK-MARKER</div>}
      />,
    );

    expect(markup).toContain("MERCHANT-HOMEPAGE-MARKER");
    expect(h1Count(markup)).toBe(1);
    expect(markup).not.toContain("Size guide");
    expect(markup).not.toContain("How to measure");
    expect(markup).not.toContain("Demo article");
  });
});
