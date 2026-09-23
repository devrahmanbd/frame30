/**
 * Site-wide footer mounts — TDD: every enabled plugin contributing a
 * `footer`-slot widget gets exactly one mount point; disabled plugins,
 * main/header-only widgets, and empty installs render nothing. SSR emits
 * mount-point divs (never the sandbox iframe: no `window` at render time,
 * no hydration mismatch).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PluginFooterMounts,
  footerMountKeys,
} from "./PluginFooterMounts";
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
  settings: { phone_number: "8801712345678" },
  enabled: true,
};

const LOYALTY: InstalledPlugin = {
  installId: "i-lo",
  manifest: {
    id: "loyalty-lite",
    name: "Loyalty Lite",
    version: "1.2.0",
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "points_bar",
        label: "Shopper Points Bar",
        slots: ["main", "header"],
        entry: "framique.mount(document.createElement('div'))",
        height: 120,
      },
    ],
    hooks: [],
    settings: [],
    budget: { jsKb: 45, mainThreadMs: 20 },
    i18n: { en: {}, bn: {} },
  },
  grantedScopes: ["read_shop", "render_storefront"],
  settings: {},
  enabled: true,
};

describe("footerMountKeys", () => {
  it("selects footer-slot widgets of enabled plugins only", () => {
    expect(footerMountKeys([WA, LOYALTY])).toEqual([
      "plugin:whatsapp-chat/chat_bubble",
    ]);
  });

  it("skips disabled plugins", () => {
    expect(footerMountKeys([{ ...WA, enabled: false }])).toEqual([]);
  });

  it("is empty with no installs", () => {
    expect(footerMountKeys([])).toEqual([]);
  });
});

describe("PluginFooterMounts", () => {
  function render(plugins: InstalledPlugin[]) {
    return renderToStaticMarkup(
      createElement(PluginProvider, {
        plugins,
        children: createElement(PluginFooterMounts, null),
      }),
    );
  }

  it("renders a mount point per footer widget, never an iframe on the server", () => {
    const html = render([WA, LOYALTY]);
    expect(html).toContain('data-plugin-widget="chat_bubble"');
    expect(html).toContain('data-plugin="whatsapp-chat"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("points_bar");
  });

  it("renders nothing without footer widgets", () => {
    expect(render([LOYALTY])).toBe("");
    expect(render([])).toBe("");
    expect(render([{ ...WA, enabled: false }])).toBe("");
  });
});
