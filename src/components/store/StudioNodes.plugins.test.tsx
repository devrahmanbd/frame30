/**
 * StudioNodes app-block resolution — pins the storefront contract: placed
 * plugin blocks resolve through the provider (sandbox island when installed,
 * labelled placeholder without it). ThemeChrome supplies the provider, so
 * this test proves placed blocks need no other wiring on live pages.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioNodes } from "./StudioNodes";
import { PluginProvider } from "@/components/builder/PluginContext";
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
  settings: {},
  enabled: true,
};

const BLOCK = {
  id: "b1",
  el: "app-block",
  settings: { pluginKey: "plugin:whatsapp-chat/chat_bubble", height: 80 },
};

describe("StudioNodes app-block", () => {
  it("renders the sandbox island when the plugin is provided", () => {
    const html = renderToStaticMarkup(
      createElement(PluginProvider, {
        plugins: [WA],
        children: createElement(StudioNodes, { nodes: [BLOCK] }),
      }),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain('data-plugin="whatsapp-chat"');
  });

  it("renders a placeholder without the provider (fail-safe, never a crash)", () => {
    const html = renderToStaticMarkup(
      createElement(StudioNodes, { nodes: [BLOCK] }),
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("not installed");
  });
});
