/**
 * Task 3 TDD fixture: ACTIVE-theme store renders complete content with
 * default chrome (ruling 2026-09-23: themeless fallback = builder content +
 * default chrome, zero tokens).
 *
 * An ACTIVE theme used to own the page (AST sections + token CSS). After the
 * purge the storefront must ignore both and render the route's own complete
 * content inside the default chrome.
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

// ACTIVE-theme fixture: a published theme with header/main/footer sections
// plus brand tokens. Themeless contract must ignore both.
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

function renderActiveThemeStore() {
  return renderToStaticMarkup(
    createElement(ThemeChrome as never, {
      template: "index",
      // Legacy ACTIVE-theme payload: post-purge chrome must ignore it.
      ast: activeAst,
      tokens: { ...DEFAULT_TOKENS, brand: "#b00020" },
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

describe("ThemeChrome themeless contract (ACTIVE-theme fixture)", () => {
  it("renders complete route content with default chrome", () => {
    const html = renderActiveThemeStore();
    // Complete content: the route's own fallback, not a blank page.
    expect(html).toContain("Demo Store catalog");
    expect(html).toContain("Complete shopper content");
    // Default chrome: the store header survives the purge.
    expect(html).toContain("Default store header");
  });

  it("applies zero theme tokens and zero theme template sections", () => {
    const html = renderActiveThemeStore();
    // Theme template sections must not own the page anymore.
    expect(html).not.toContain("THEME HERO — must not own the page");
    // Zero tokens: no token CSS variables, no theme asset stylesheet.
    expect(html).not.toContain("--fq-");
    expect(html).not.toContain("data-fq-theme-assets");
    // Brand colour from the ACTIVE theme must not leak into markup.
    expect(html).not.toContain("#b00020");
    expect(html).not.toContain("b00020");
  });
});
