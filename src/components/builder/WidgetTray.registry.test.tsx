/**
 * Frame30 task (A) — WidgetTray single-registry sourcing (TDD).
 *
 * The route builds ONE registry from its server-authorized installed plugins
 * and passes it in: listing and insertion read the injected registry, so the
 * tray can never offer a widget the preview cannot resolve. An absent or
 * invalid `registry` prop falls back to the per-render build (existing
 * callers unchanged, never a throw).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetTray } from "./WidgetTray";
import { PluginProvider } from "./PluginContext";
import { buildTrayRegistry } from "@/lib/unified-widget-registry";
import type { InstalledPlugin, PluginManifest } from "@/lib/plugin-manifest";
import type { SectionType } from "@/lib/builder-ast";

function installOf(
  id: string,
  name: string,
  widgetLabel: string,
): InstalledPlugin {
  const manifest: PluginManifest = {
    id,
    name,
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: widgetLabel,
        slots: ["main"],
        entry: "e.js",
        height: 200,
      },
    ],
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
    budget: { jsKb: 10, mainThreadMs: 5 },
  };
  return {
    installId: `install-${id}`,
    manifest,
    grantedScopes: ["render_storefront"],
    settings: {},
    enabled: true,
  };
}

function renderTray(opts: {
  plugins?: InstalledPlugin[];
  registry?: Parameters<typeof WidgetTray>[0]["registry"];
}): string {
  const noop = (_type: SectionType, _preset: string) => undefined;
  return renderToStaticMarkup(
    <PluginProvider plugins={opts.plugins ?? []}>
      <WidgetTray slot="main" onAdd={noop} registry={opts.registry} />
    </PluginProvider>,
  );
}

describe("WidgetTray single-registry sourcing", () => {
  it("lists from the injected route registry, not the context installs", () => {
    const routeRegistry = buildTrayRegistry([
      installOf("other", "Other App", "Other Widget"),
    ]);
    const html = renderTray({ plugins: [], registry: routeRegistry });
    expect(html).toContain("Other Widget");
  });

  it("falls back to the per-render build when no registry is passed", () => {
    const html = renderTray({
      plugins: [installOf("acme", "Acme App", "Acme Reviews")],
    });
    expect(html).toContain("Acme Reviews");
  });

  it("falls back without throwing on an invalid registry", () => {
    const html = renderTray({
      plugins: [installOf("acme", "Acme App", "Acme Reviews")],
      registry: {} as never,
    });
    expect(html).toContain("Acme Reviews");
  });
});
