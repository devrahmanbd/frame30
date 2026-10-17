/**
 * Route-owned content — authored page bodies are never swallowed by a
 * theme's demo copy.
 *
 * `page_content` is the context section a theme's page template uses to
 * frame the route's body. The official themes ship demo page/blog copy
 * WITHOUT that section (their demo articles are showcase content for the
 * preview lane); live, the route's own body must win: when the theme's main
 * does not declare the slot, the route fallback renders in place of the
 * theme main while chrome (header/footer), tokens and CSS still render.
 * Routes that name no content slot (cart, checkout, search) are untouched —
 * their templates drive the body through live-data widgets.
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
import type { Section } from "@/lib/builder-ast";

const demoHeading = (): Section => ({
  id: "demo-heading",
  type: "heading",
  props: { text: "theme-demo-headline" },
});
const pageContentSlot = (): Section => ({
  id: "content-slot",
  type: "page_content",
  props: {},
});

/** Render a page template whose route names `page_content` as its body slot. */
function render(main: Section[], withContentSlot = true): string {
  return renderToStaticMarkup(
    createElement(ThemeChrome, {
      template: "page",
      ast: {
        header: [{ id: "h", type: "heading", props: { text: "store-header" } }],
        main,
        footer: [{ id: "f", type: "heading", props: { text: "store-footer" } }],
      },
      tokens: null,
      merchantId: null,
      siteKit: null,
      ...(withContentSlot ? { contentSlot: "page_content" } : {}),
      contextSlots: {
        page_content: createElement("div", null, "authored-body"),
      },
      fallback: createElement("div", null, "route-fallback"),
    } as never),
  );
}

describe("ThemeChrome route-owned content", () => {
  it("renders the route fallback when the theme main lacks the content slot", () => {
    const html = render([demoHeading()]);
    expect(html).toContain("route-fallback");
    expect(html).not.toContain("theme-demo-headline");
    // Site chrome survives the fallback body.
    expect(html).toContain("store-header");
    expect(html).toContain("store-footer");
  });

  it("renders the theme main (slot filled with the route body) when declared", () => {
    const html = render([demoHeading(), pageContentSlot()]);
    expect(html).toContain("authored-body");
    expect(html).toContain("theme-demo-headline");
    expect(html).not.toContain("route-fallback");
  });

  it("keeps legacy behavior for routes that name no content slot", () => {
    const html = render([demoHeading()], false);
    expect(html).toContain("theme-demo-headline");
    expect(html).not.toContain("route-fallback");
  });
});
