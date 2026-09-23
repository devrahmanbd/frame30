/**
 * Decoupled plugin layer — TDD: plugin rendering is independent of themes.
 * `PluginLayer` owns the provider + footer mounts; any theme chrome (or
 * none) renders inside it unchanged. Theme rewrites can never touch plugin
 * files because no theme file imports this module.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PluginLayer } from "./PluginLayer";
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

function FakeTheme({ name }: { name: string }) {
  return createElement("div", { "data-theme": name }, `${name} chrome`);
}

describe("PluginLayer", () => {
  it("mounts footer widgets around any theme chrome", () => {
    for (const theme of ["bazaar", "songoskriti", "none"]) {
      const html = renderToStaticMarkup(
        createElement(PluginLayer, {
          plugins: [WA],
          children: createElement(FakeTheme, { name: theme }),
        }),
      );
      expect(html).toContain(`${theme} chrome`);
      expect(html).toContain('data-plugin-widget="chat_bubble"');
      expect(html).not.toContain("<iframe");
    }
  });

  it("renders children alone without installs", () => {
    const html = renderToStaticMarkup(
      createElement(PluginLayer, {
        plugins: [],
        children: createElement(FakeTheme, { name: "bazaar" }),
      }),
    );
    expect(html).toContain("bazaar chrome");
    expect(html).not.toContain("data-plugin-widget");
  });

  it("mounts nothing for disabled plugins", () => {
    const html = renderToStaticMarkup(
      createElement(PluginLayer, {
        plugins: [{ ...WA, enabled: false }],
        children: createElement(FakeTheme, { name: "songoskriti" }),
      }),
    );
    expect(html).toContain("songoskriti chrome");
    expect(html).not.toContain("data-plugin-widget");
  });
});
