/**
 * Storefront host wiring — the page/homepage views own the tenant's
 * authorized twin registry.
 *
 * `StudioNodes.registry.test.tsx` pins the mechanism (threaded registry →
 * sandboxed island; absent registry → explicit fail-closed recovery). This
 * suite pins the HOSTS: the storefront views build the tray registry from
 * the server-authorized `installedPlugins` payload and thread it (+ the
 * active theme key) through ThemeChrome/StudioNodes, so an authored plugin
 * twin renders the island instead of the def-less miss. The payload is
 * exactly what the loader returns; no editor exists on this surface.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/acme/pages/x" } }),
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

import { PageView } from "./PageView";
import { StoreHomepage } from "./StoreHomepage";
import {
  appBlockNodeForPlugin,
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import type { StudioNode } from "@/lib/studio/model";

const REVIEW_KEY = "plugin:acme/reviews";

const FIELDS = [
  { key: "title", label: "Title", kind: "text", default: "Untitled", max: 40 },
] as unknown as WidgetDef["propsSchema"]["fields"];

function pluginDef(id: string): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: JSON.parse(JSON.stringify(FIELDS)) },
    renderer: "sandbox",
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function installsFor(pluginId: string, widgetKey: string): InstalledPlugin[] {
  return [
    {
      installId: `install-${pluginId}`,
      manifest: {
        id: pluginId,
        name: `${pluginId} app`,
        version: "1.2.0",
        api: "^3.0.0",
        permissions: ["render_storefront"],
        widgets: [
          {
            key: widgetKey,
            label: `Label ${widgetKey}`,
            slots: ["main"],
            entry: `framique.mount("${pluginId.toUpperCase()}-STOREFRONT")`,
            height: 200,
            propsSchema: JSON.parse(JSON.stringify(FIELDS)),
          },
        ],
        hooks: [],
        settings: [],
        i18n: { en: {}, bn: {} },
        budget: { jsKb: 10, mainThreadMs: 5 },
      },
      grantedScopes: ["render_storefront"],
      settings: {} as InstalledPlugin["settings"],
      enabled: true,
    },
  ];
}

function twin(
  widgetKey: string,
  props: Record<string, unknown> = {},
  reg: UnifiedRegistry,
): StudioNode {
  const built = buildExtensionInsert(reg, {
    widgetKey,
    slot: "main",
    generateId: () => `page-${widgetKey.replace(/[^a-z]/gi, "")}`,
  });
  if (!built.ok) {
    const fallback = appBlockNodeForPlugin(widgetKey);
    fallback.settings = {
      ...fallback.settings,
      ...props,
      extensionInstanceId: fallback.id,
      extensionApi: "3.1.0",
    };
    return fallback;
  }
  return studioNodeForExtension({
    ...built.node,
    props: { ...built.node.props, ...props },
  });
}

/** The exact payload shape both storefront loaders return. */
function payload(
  studioNodes: StudioNode[],
  installedPlugins: InstalledPlugin[],
): Record<string, unknown> {
  return {
    merchant: { id: "m1", name: "Acme", slug: "acme" },
    page: {
      title: "Plugin page",
      slug: "plugin-page",
      excerpt: null,
      updated_at: "2026-10-17T00:00:00.000Z",
      theme_id: null,
    },
    html: "",
    isBuilder: false,
    studioNodes,
    customCss: null,
    nav: [],
    menus: { header: [], footer: [], mobile: [] },
    ast: null,
    tokens: {},
    themeKey: null,
    siteKit: null,
    installedPlugins,
    origin: "http://localhost:3020",
  };
}

function render(tree: ReactElement): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: tree,
    }),
  );
}

describe("Storefront view twin wiring (authorized registry threading)", () => {
  it("PageView threads the tenant registry so the twin renders the island", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const node = twin(REVIEW_KEY, { title: "Page twin" }, reg);
    const html = render(
      createElement(PageView, {
        data: payload([node], installsFor("acme", "reviews")) as never,
      }),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("Page twin");
    expect(html).toContain("ACME-STOREFRONT");
    expect(html).not.toContain("Widget preview unavailable");
  });

  it("StoreHomepage threads the tenant registry so the twin renders the island", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const node = twin(REVIEW_KEY, { title: "Home twin" }, reg);
    const html = render(
      createElement(StoreHomepage, {
        home: payload([node], installsFor("acme", "reviews")) as never,
        slug: "acme",
      }),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain("Home twin");
    expect(html).toContain("ACME-STOREFRONT");
    expect(html).not.toContain("Widget preview unavailable");
  });

  it("still fails closed with no installs for the twin (never another owner)", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const node = twin(REVIEW_KEY, { title: "Page twin" }, reg);
    const html = render(
      createElement(PageView, {
        data: payload([node], []) as never,
      }),
    );
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });
});
