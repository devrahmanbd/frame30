/**
 * Theme/plugin separation — the theme chrome renders no plugin markup and
 * accepts no plugin props. Plugin rendering belongs to `PluginLayer` alone,
 * so theme rewrites can never affect it. (Replaces the old wiring test that
 * asserted mounts inside ThemeChrome.)
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

const EMPTY_AST = { header: [], main: [], footer: [] };

describe("ThemeChrome theme/plugin separation", () => {
  it("renders no plugin markup on the themeless welcome page", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "index",
        ast: null,
        tokens: null,
        storeSlug: "s1",
        storeName: "S One",
        merchantId: null,
        siteKit: null,
        fallback: createElement("div", null, "fallback-body"),
      } as never),
    );
    expect(html).toContain("Welcome to Framique");
    expect(html).not.toContain("data-plugin");
    expect(html).not.toContain("PluginFooterMounts");
  });

  it("renders no plugin markup on themed pages", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "index",
        ast: EMPTY_AST,
        tokens: {},
        storeSlug: "s1",
        storeName: "S One",
        merchantId: null,
        siteKit: null,
        fallback: createElement("div", null, "fallback-body"),
      } as never),
    );
    expect(html).toContain("fallback-body");
    expect(html).not.toContain("data-plugin");
  });

  it("ignores plugin data even if passed (decoupling is behavioral)", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "index",
        ast: EMPTY_AST,
        tokens: {},
        storeSlug: "s1",
        storeName: "S One",
        merchantId: null,
        siteKit: null,
        fallback: createElement("div", null, "fallback-body"),
        installedPlugins: [
          {
            installId: "i-wa",
            manifest: {
              id: "whatsapp-chat",
              widgets: [
                {
                  key: "chat_bubble",
                  slots: ["footer"],
                  entry: "x",
                  height: 80,
                },
              ],
            },
            grantedScopes: ["render_storefront"],
            settings: {},
            enabled: true,
          },
        ],
      } as never),
    );
    expect(html).toContain("fallback-body");
    expect(html).not.toContain("data-plugin");
  });
});
