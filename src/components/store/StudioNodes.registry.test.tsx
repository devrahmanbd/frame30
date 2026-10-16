/**
 * Frame30 storefront twins (TDD, pass 1).
 *
 * The storefront renders studio trees through `StudioNodes` with NO editor.
 * Twins must resolve against the server-authorized registry threaded through
 * `StudioNodes` → `StudioWidget` (same authorized defs as the canvas, never
 * the def-less fallback), and twin misses must render the explicit
 * fail-closed recovery — never silent null, never another owner's widget.
 * Legacy nodes stay byte-identical with or without the new props.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioNodes } from "./StudioNodes";
import { PluginProvider } from "@/components/builder/PluginContext";
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
const OTHER_KEY = "plugin:other/widget";

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
    generateId: () => `store-${widgetKey.replace(/[^a-z]/gi, "")}`,
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

function storefrontHtml(
  nodes: StudioNode[],
  plugins: InstalledPlugin[],
  opts: { registry?: UnifiedRegistry; themeKey?: string | null } = {},
): string {
  return renderToStaticMarkup(
    createElement(PluginProvider, {
      plugins,
      children: createElement(StudioNodes, {
        nodes,
        ...(opts.registry ? { registry: opts.registry } : {}),
        ...(opts.themeKey ? { themeKey: opts.themeKey } : {}),
      }),
    }),
  );
}

describe("StudioNodes storefront twins — authorized registry threading", () => {
  it("resolves a twin island through the threaded registry (not the def-less fallback)", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const node = twin(REVIEW_KEY, { title: "Storefront twin" }, reg);
    const html = storefrontHtml([node], installsFor("acme", "reviews"), {
      registry: reg,
    });
    expect(html).toContain("<iframe");
    expect(html).toContain("Storefront twin");
    expect(html).toContain("ACME-STOREFRONT");
    expect(html).not.toContain("Widget preview unavailable");
  });

  it("misses to the explicit recovery instead of null (fail-closed, never silent)", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    // No registry threaded (legacy bare composition): the twin misses the
    // def-less fallback — the storefront surface shows the recovery, not "".
    const bare = storefrontHtml(
      [twin(REVIEW_KEY, { title: "Hi" }, reg)],
      installsFor("acme", "reviews"),
    );
    expect(bare).not.toBe("");
    expect(bare).toContain("Widget preview unavailable");
    expect(bare).not.toContain("<iframe");
    // Unknown key against the authorized registry: same explicit recovery.
    const unknown = storefrontHtml(
      [twin("plugin:ghost/missing", {}, registryWith([]))],
      [],
      { registry: registryWith([]) },
    );
    expect(unknown).not.toBe("");
    expect(unknown).toContain("Widget preview unavailable");
    expect(unknown).not.toContain("<iframe");
  });

  it("never renders another owner's widget on a miss (no silent wrong-widget)", () => {
    const reg = registryWith([pluginDef(OTHER_KEY)]);
    const node = twin(REVIEW_KEY, { title: "Mine" }, reg);
    const html = storefrontHtml([node], installsFor("other", "widget"), {
      registry: reg,
    });
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("OTHER-STOREFRONT");
  });

  it("threads the registry through containers (nested twins resolve)", () => {
    const reg = registryWith([pluginDef(REVIEW_KEY)]);
    const inner = twin(REVIEW_KEY, { title: "Nested twin" }, reg);
    const html = storefrontHtml(
      [
        {
          id: "c1",
          el: "container",
          settings: {},
          children: [inner],
        },
      ],
      installsFor("acme", "reviews"),
      { registry: reg },
    );
    expect(html).toContain("Nested twin");
    expect(html).toContain("<iframe");
  });

  it("legacy nodes render byte-identically with or without the new props", () => {
    const nodes: StudioNode[] = [
      { id: "h1", el: "heading", settings: { text: "Hello", level: 2 } },
      { id: "t1", el: "text", settings: { text: "World" } },
    ];
    const bare = storefrontHtml(nodes, []);
    const wired = storefrontHtml(nodes, installsFor("acme", "reviews"), {
      registry: registryWith([pluginDef(REVIEW_KEY)]),
      themeKey: "proof-alpha",
    });
    expect(bare).toContain("Hello");
    expect(wired).toBe(bare);
  });

  it("legacy app-blocks keep their live resolution beside twins", () => {
    const legacy = {
      id: "b1",
      el: "app-block",
      settings: { pluginKey: REVIEW_KEY, height: 200 },
    } as StudioNode;
    const html = storefrontHtml([legacy], installsFor("acme", "reviews"), {
      registry: registryWith([pluginDef(REVIEW_KEY)]),
    });
    expect(html).toContain("<iframe");
    expect(html).not.toContain("Widget preview unavailable");
  });
});
