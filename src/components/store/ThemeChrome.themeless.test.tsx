/**
 * Task 3 TDD fixture, updated at main-merge (PR #20 gate wins):
 * every store is themeless after the purge, so the server passes no
 * ast/tokens and every route serves the single shared welcome page.
 * A legacy explicit ast still renders the fallback branch (dead path),
 * with zero tokens either way.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Router + cart + i18n touch ThemeChrome's tree; stub to unit scope.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo" } }),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={typeof to === "string" ? to : "/"}>{children}</a>
    ),
  };
});
vi.mock("@/components/builder/CartContext", () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLiveCart: () => ({ lines: [], add: () => {} }),
  useCartContext: () => ({ lines: [], add: () => {} }),
  openCartDrawer: () => false,
  useCartDrawerOpener: () => {},
}));
vi.mock("@/components/store/VitalsReporter", () => ({
  VitalsReporter: () => null,
}));
vi.mock("@/components/store/TrafficReporter", () => ({
  TrafficReporter: () => null,
}));
vi.mock("@/components/store/SiteKitTags", () => ({
  SiteKitSurface: () => null,
}));

const { ThemeChrome } = await import("./ThemeChrome");
const { DEFAULT_TOKENS } = await import("@/lib/builder-ast");

// Legacy ACTIVE-theme payload: post-purge server never sends this.
const activeAst = {
  header: [
    { id: "h-theme", type: "header", props: { heading: "THEME HEADER" } },
  ],
  main: [
    {
      id: "m-theme",
      type: "hero",
      props: { heading: "THEME HERO — must not own the page" },
    },
  ],
  footer: [
    { id: "f-theme", type: "footer", props: { heading: "THEME FOOTER" } },
  ],
} as unknown as import("@/lib/builder-ast").ThemeAst;

function renderStore(ast: unknown, tokens: unknown) {
  return renderToStaticMarkup(
    createElement(ThemeChrome as never, {
      template: "index",
      ast,
      tokens,
      storeSlug: "demo-store",
      merchantId: "00000000-0000-0000-0000-000000000000",
      siteKit: null,
      chrome: createElement("header", null, "Default store header"),
      fallback: createElement(
        "div",
        null,
        createElement("h1", null, "Demo Store catalog"),
        createElement("p", null, "Complete shopper content"),
      ),
    } as never),
  );
}

describe("ThemeChrome themeless gate (server reality: no ast/tokens)", () => {
  it("serves the single welcome page with zero theme tokens", () => {
    const html = renderStore(null, null);
    expect(html).toContain("Welcome to Framique");
    expect(html).not.toContain("Demo Store catalog");
    expect(html).not.toContain("--fq-");
    expect(html).not.toContain("data-fq-theme-assets");
  });

  it("legacy explicit ast renders the fallback branch, still token-free", () => {
    const html = renderStore(activeAst, {
      ...DEFAULT_TOKENS,
      brand: "#b00020",
    });
    expect(html).toContain("Demo Store catalog");
    expect(html).not.toContain("THEME HERO — must not own the page");
    expect(html).not.toContain("--fq-");
    expect(html).not.toContain("#b00020");
    expect(html).not.toContain("b00020");
  });
});
