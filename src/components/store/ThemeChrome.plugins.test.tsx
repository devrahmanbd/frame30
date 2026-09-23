/**
 * ThemeChrome plugin wiring — TDD: installed footer-slot plugins mount on
 * every storefront render (themed and themeless); without installs the chrome
 * renders zero mount points.
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
    // Navigation is not under test; render links as plain anchors.
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
import type { InstalledPlugin } from "@/lib/plugin-manifest";

const WA: InstalledPlugin = {
  installId: "i-wa",
  manifest: {
    id: "whatsapp-chat",
    name: "WhatsApp Quick Chat",
    version: "1.2.0",
    api: "^3.0.0",
    permissions: ["render_storefront"],
    widgets: [
      {
        key: "chat_bubble",
        label: "WhatsApp Chat Bubble",
        slots: ["footer"],
        entry: "framique.mount(document.createElement('div'))",
        height: 80,
      },
    ],
    hooks: [],
    settings: [],
    budget: { jsKb: 35, mainThreadMs: 15 },
    i18n: { en: {}, bn: {} },
  },
  grantedScopes: ["render_storefront"],
  settings: { phone_number: "8801712345678" },
  enabled: true,
};

const EMPTY_AST = { header: [], main: [], footer: [] };

function render(installedPlugins: InstalledPlugin[], themed: boolean) {
  return renderToStaticMarkup(
    createElement(ThemeChrome, {
      template: "index",
      ast: themed ? EMPTY_AST : null,
      tokens: themed ? {} : null,
      storeSlug: "s1",
      storeName: "S One",
      merchantId: null,
      siteKit: null,
      fallback: createElement("div", null, "fallback-body"),
      installedPlugins,
    } as never),
  );
}

describe("ThemeChrome plugin mounts", () => {
  it("mounts footer widgets on the themeless welcome page", () => {
    const html = render([WA], false);
    expect(html).toContain("Welcome to Framique");
    expect(html).toContain('data-plugin-widget="chat_bubble"');
  });

  it("mounts footer widgets on themed pages", () => {
    const html = render([WA], true);
    expect(html).toContain("fallback-body");
    expect(html).toContain('data-plugin-widget="chat_bubble"');
  });

  it("renders no mount points without installs", () => {
    expect(render([], false)).not.toContain("data-plugin-widget");
    expect(render([], true)).not.toContain("data-plugin-widget");
  });
});
