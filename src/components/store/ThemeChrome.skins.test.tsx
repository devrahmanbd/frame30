/**
 * Lane B2-1 — ThemeChrome inlines only the skin CSS the rendered page uses.
 *
 * The server combines every enabled merchant asset per tenant; skin-scoped
 * rules for skins absent from this page's header/main/footer are dropped at
 * the host, where the rendered sections are known. Fail-open: unparseable
 * CSS inlines verbatim.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/" } }),
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
import { newSection } from "@/lib/builder-ast";

const CSS = [
  ".base{color:black}",
  '[data-widget="product_rail"][data-skin="editorial"]{color:red}',
  '[data-widget="product_rail"][data-skin="minimal"]{color:blue}',
].join("\n");

function chrome(
  ast: {
    header: ReturnType<typeof newSection>[];
    main: ReturnType<typeof newSection>[];
    footer: ReturnType<typeof newSection>[];
  },
  customCss: string | null = CSS,
) {
  return renderToStaticMarkup(
    createElement(ThemeChrome, {
      template: "index",
      ast,
      tokens: null,
      merchantId: null,
      siteKit: null,
      customCss,
      fallback: createElement("div", null, "fallback-body"),
    } as never),
  );
}

describe("ThemeChrome per-page skin filtering", () => {
  it("keeps used skin rules plus ordinary css, drops unused skins", () => {
    // product_rail defaults to the editorial skin (catalog default).
    const html = chrome({
      header: [],
      main: [newSection("product_rail")],
      footer: [],
    });
    expect(html).toContain(".base{color:black}");
    expect(html).toContain('[data-skin="editorial"]');
    expect(html).not.toContain('[data-skin="minimal"]');
  });

  it("counts header and footer sections, not just main", () => {
    const html = chrome({
      header: [{ ...newSection("product_rail"), props: { skin: "minimal" } }],
      main: [newSection("heading")],
      footer: [],
    });
    expect(html).toContain('[data-skin="minimal"]');
    expect(html).not.toContain('[data-skin="editorial"]');
  });

  it("a page with no skinned widgets keeps ordinary css only", () => {
    const html = chrome({
      header: [],
      main: [newSection("heading")],
      footer: [],
    });
    expect(html).toContain(".base{color:black}");
    expect(html).not.toContain("data-skin=");
  });

  it("css without skin selectors inlines byte-identical", () => {
    const html = chrome(
      { header: [], main: [newSection("heading")], footer: [] },
      ".plain{color:black}",
    );
    expect(html).toContain(".plain{color:black}");
  });

  it("renders no style element without custom css", () => {
    const html = chrome(
      { header: [], main: [newSection("product_rail")], footer: [] },
      null,
    );
    expect(html).not.toContain("data-fq-theme-assets");
  });
});
