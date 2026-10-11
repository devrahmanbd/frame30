/**
 * Plugin `i18n` dict + `validateSettings` text/textarea sinks.
 *
 * Chain under test (no mocks of the render path):
 *   raw manifest JSON → `parseManifest` (`src/lib/plugin-manifest.ts` — the
 *   dict passes through unfiltered by design) → `PluginSettingsForm`
 *   (schema-driven, core-rendered) → `renderToStaticMarkup`; validated
 *   values → `answerWidgetCall` bridge (`plugin.settings`) and the
 *   `WidgetSandbox` island.
 *
 * Trust boundary: the manifest gate does NOT filter i18n strings, so every
 * sink below must treat them as untrusted text. This file pins that.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultSettings,
  parseManifest,
  validateSettings,
  type InstalledPlugin,
  type PluginManifest,
  type SettingsValues,
} from "./plugin-manifest";
import { PluginSettingsForm } from "@/components/marketplace/PluginSettingsForm";
import {
  answerWidgetCall,
  WidgetSandbox,
} from "@/components/marketplace/WidgetSandbox";

const HOSTILE_LABEL = "<script>alert(1)</script>";
const HOSTILE_HANDLER = '"><img src=x onerror=alert(2)>';
const HOSTILE_JS = "javascript:alert(3)";
const HOSTILE_TPL = "{{evil.key}}";

function hostileManifest(): PluginManifest {
  const verdict = parseManifest({
    id: "evil-widget",
    name: `Evil ${HOSTILE_LABEL}`,
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["render_storefront"],
    widgets: [],
    hooks: [],
    settings: [
      { key: "title", label: "Title", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
      { key: "logo", label: "Logo", kind: "media" },
      { key: "link", label: "Link", kind: "url" },
    ],
    i18n: {
      en: {
        title: HOSTILE_LABEL,
        body: HOSTILE_HANDLER,
        logo: HOSTILE_JS,
        link: HOSTILE_TPL,
      },
      bn: { title: "শিরোনাম", body: "বিবরণ", logo: "লোগো", link: "লিংক" },
    },
    budget: {},
  });
  if (!verdict.ok)
    throw new Error(`manifest rejected: ${verdict.errors.join(",")}`);
  return verdict.manifest;
}

function installedWith(values: SettingsValues): InstalledPlugin {
  const manifest = hostileManifest();
  return {
    installId: "install-1",
    manifest,
    grantedScopes: ["render_storefront"],
    settings: { ...defaultSettings(manifest.settings), ...values },
    enabled: true,
  };
}

function formHtml(plugin: InstalledPlugin): string {
  return renderToStaticMarkup(
    createElement(PluginSettingsForm, { plugin, onSave: () => undefined }),
  );
}

describe("plugin i18n + settings sinks", () => {
  it("i18n dicts pass through the manifest gate unfiltered — render is the boundary", () => {
    const manifest = hostileManifest();
    expect(manifest.i18n.en["title"]).toBe(HOSTILE_LABEL);
    expect(manifest.i18n.en["body"]).toBe(HOSTILE_HANDLER);
    expect(manifest.i18n.en["logo"]).toBe(HOSTILE_JS);
    expect(manifest.i18n.en["link"]).toBe(HOSTILE_TPL);
  });

  it("settings form renders hostile i18n labels as escaped text nodes", () => {
    const html = formHtml(installedWith({}));
    expect(html).not.toContain("<script>");
    // The handler string survives only entity-escaped (`&gt;`), never as markup.
    expect(html).not.toContain("onerror=alert(2)>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("onerror=alert(2)&gt;");
  });

  it("hostile text/textarea setting values render escaped in inputs", () => {
    const html = formHtml(
      installedWith({ title: HOSTILE_LABEL, body: HOSTILE_HANDLER }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=alert(2)>");
    expect(html).toContain("&lt;script&gt;");
    // Template syntax in a value is inert text — no interpolation happens here.
    const tpl = formHtml(installedWith({ title: HOSTILE_TPL }));
    expect(tpl).toContain("{{evil.key}}");
    expect(tpl).not.toContain("<script>");
  });

  it("javascript: media/url values fail validation and never preview an image", () => {
    const manifest = hostileManifest();
    const checked = validateSettings(manifest.settings, {
      logo: HOSTILE_JS,
      link: HOSTILE_JS,
    });
    expect(checked.errors).toContain("logo.not_a_url");
    expect(checked.errors).toContain("link.not_a_url");
    const html = formHtml(installedWith({ logo: HOSTILE_JS }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=alert(2)>");
  });

  it("validateSettings text/textarea values flow only into covered sinks", () => {
    const manifest = hostileManifest();
    // Length-capped, markup preserved as data — the sinks above render it
    // escaped, the bridge below carries it as data.
    const checked = validateSettings(manifest.settings, {
      title: `${HOSTILE_LABEL} extra`,
      body: "x".repeat(5000),
    });
    expect(checked.errors).toEqual([]);
    expect(checked.values["title"]).toBe(`${HOSTILE_LABEL} extra`);
    expect(String(checked.values["body"])).toHaveLength(2000);
  });

  it("bridge serves validated settings as data inside the sandbox — never host DOM", async () => {
    const manifest = hostileManifest();
    const { values } = validateSettings(manifest.settings, {
      title: HOSTILE_LABEL,
      body: HOSTILE_HANDLER,
    });
    const ans = await answerWidgetCall(
      { v: 1, id: "1", method: "plugin.settings", params: {} },
      {
        settings: values,
        granted: ["render_storefront"],
        onCall: async () => ({}),
      },
    );
    expect(ans).toEqual({ result: values });
  });

  it("sandbox island escapes hostile manifest strings in the frame title", () => {
    const manifest = hostileManifest();
    const html = renderToStaticMarkup(
      createElement(WidgetSandbox, {
        title: `${manifest.name} — widget`,
        entry: "document.getElementById('root').textContent = 'hi';",
        grantedScopes: ["render_storefront"],
        settings: {},
        onCall: async () => ({}),
        height: 320,
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("sandbox=");
  });
});
