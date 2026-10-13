/**
 * Widget presentation roundtrips — theme switching preserves instance data.
 *
 * The same authored instance resolved under two themes must carry identical
 * props with a presentation-only diff (override vs fallback, dressed vs
 * island, owner definition vs recoverable fallback). Recovery, enablement
 * and tray/gate agreement roundtrips close the loop.
 */
import { describe, expect, it } from "vitest";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import type { ExtensionNode } from "./builder-ast";
import type { InstalledPlugin } from "./plugin-manifest";
import {
  checkThemeCompatibility,
  dressingKey,
  resolvePresentation,
  themeTrayEntries,
} from "./widget-presentation";

function widgetDef(
  id: string,
  opts: {
    namespace: WidgetDef["namespace"];
    renderer?: WidgetDef["renderer"];
    themes?: string[];
    defaults?: Record<string, unknown>;
    version?: string;
  },
): WidgetDef {
  return {
    id,
    namespace: opts.namespace,
    version: opts.version ?? "1.0.0",
    label: `Label ${id}`,
    category: "general",
    slots: ["main"],
    defaults: opts.defaults ?? {},
    propsSchema: { fields: [] },
    renderer: opts.renderer ?? "builtin",
    ...(opts.themes ? { themes: [...opts.themes] } : {}),
  };
}

function extensionNode(
  widgetKey: string,
  props: Record<string, unknown>,
  extra: Partial<ExtensionNode> = {},
): ExtensionNode {
  const scope = widgetKey.split(":")[1] ?? "";
  const kind: ExtensionNode["owner"]["kind"] = widgetKey.startsWith("theme:")
    ? "theme"
    : widgetKey.startsWith("plugin:")
      ? "plugin"
      : "builtin";
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "ext-1",
    owner: {
      kind,
      id: scope.split("/")[0] ?? "",
    },
    widgetKey,
    apiVersion: "3.1.0",
    props,
    ...extra,
  };
}

function themeablePlugin(): InstalledPlugin {
  return {
    installId: "inst-acme",
    manifest: {
      id: "acme",
      name: "Acme plugin",
      version: "1.2.0",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "faq",
          label: "FAQ",
          slots: ["main"],
          entry: "faq-entry.js",
          themeable: { version: 1 as const, schema: "schema:ref" },
        },
      ],
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: { heading: "Help" },
    enabled: true,
  };
}

/* --------------------------------------- theme switch keeps instance props */

describe("widget-presentation roundtrip — theme switching", () => {
  it("same builtin instance: identical props, presentation-only diff", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget(
        widgetDef("builtin:hero", {
          namespace: "builtin",
          defaults: { heading: "Hi" },
        }),
      ).ok,
    ).toBe(true);
    const node = extensionNode("builtin:hero", {
      heading: "Sale",
      limit: 4,
    });

    const underOverride = resolvePresentation({
      widgetId: node,
      themeKey: "songoskriti",
      registry: reg,
      themeOverrides: { songoskriti: ["builtin:hero"] },
    });
    const underFallback = resolvePresentation({
      widgetId: node,
      themeKey: "somvabona",
      registry: reg,
      themeOverrides: { songoskriti: ["builtin:hero"] },
    });
    if (
      !underOverride.ok ||
      underOverride.mode !== "native-builtin" ||
      !underFallback.ok ||
      underFallback.mode !== "native-builtin"
    ) {
      throw new Error("expected native-builtin on both themes");
    }
    expect(underOverride.presentation).toBe("theme-override");
    expect(underFallback.presentation).toBe("core-default");
    expect(underOverride.props).toEqual(underFallback.props);
    expect(underOverride.props).toEqual({ heading: "Sale", limit: 4 });
    expect(underOverride.def).toEqual(underFallback.def);
  });

  it("honours the ExtensionNode version pin under both themes", () => {
    const reg = createWidgetRegistry();
    for (const version of ["1.0.0", "2.0.0"]) {
      expect(
        reg.registerWidget(
          widgetDef("builtin:hero", {
            namespace: "builtin",
            version,
            defaults: { heading: `v${version}` },
          }),
        ).ok,
      ).toBe(true);
    }
    const node = extensionNode(
      "builtin:hero",
      { heading: "Pinned" },
      { version: "1.0.0" },
    );
    for (const themeKey of ["songoskriti", "somvabona"]) {
      const result = resolvePresentation({
        widgetId: node,
        themeKey,
        registry: reg,
      });
      if (!result.ok || result.mode !== "native-builtin") {
        throw new Error("expected native-builtin");
      }
      expect(result.def.version).toBe("1.0.0");
      expect(result.props).toEqual({ heading: "Pinned" });
    }
  });

  it("theme-owned fallback recovers byte-identically under the owner", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget(
        widgetDef("theme:songoskriti/finder", {
          namespace: "theme",
          renderer: "custom",
          themes: ["songoskriti"],
        }),
      ).ok,
    ).toBe(true);
    const props = { title: "Find craft", limit: 8 };
    const node = extensionNode("theme:songoskriti/finder", props);

    const away = resolvePresentation({
      widgetId: node,
      themeKey: "somvabona",
      registry: reg,
    });
    if (!away.ok || away.mode !== "theme-owned") {
      throw new Error("expected theme-owned fallback");
    }
    expect(away.presentation).toBe("recoverable-fallback");
    expect(away.renderer).toBeNull();

    const home = resolvePresentation({
      widgetId: node,
      themeKey: "songoskriti",
      registry: reg,
    });
    if (!home.ok || home.mode !== "theme-owned") {
      throw new Error("expected theme-owned definition");
    }
    expect(home.presentation).toBe("owner-definition");
    expect(home.props).toEqual(away.props);
    expect(home.props).toEqual(props);
  });

  it("official widgets resolve identically under both themes", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget(
        widgetDef("plugin:product-reviews/summary", {
          namespace: "plugin",
          renderer: "sandbox",
        }),
      ).ok,
    ).toBe(true);
    const props = { limit: 6 };
    const first = resolvePresentation({
      widgetId: "plugin:product-reviews/summary",
      themeKey: "songoskriti",
      registry: reg,
      props,
    });
    const second = resolvePresentation({
      widgetId: "plugin:product-reviews/summary",
      themeKey: "somvabona",
      registry: reg,
      props,
    });
    if (
      !first.ok ||
      first.mode !== "official" ||
      !second.ok ||
      second.mode !== "official"
    ) {
      throw new Error("expected official on both themes");
    }
    expect(first.impl).toEqual(second.impl);
    expect(first.props).toEqual(second.props);
  });

  it("Class B dressed vs island: same data, presentation-only diff", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget(
        widgetDef("plugin:acme/faq", {
          namespace: "plugin",
          renderer: "sandbox",
        }),
      ).ok,
    ).toBe(true);
    const data = { heading: "Declared" };
    const dressed = resolvePresentation({
      widgetId: "plugin:acme/faq",
      themeKey: "songoskriti",
      registry: reg,
      installedPlugins: [themeablePlugin()],
      dressedPresentations: new Set([
        dressingKey("songoskriti", "plugin:acme/faq"),
      ]),
      publicData: data,
    });
    const island = resolvePresentation({
      widgetId: "plugin:acme/faq",
      themeKey: "somvabona",
      registry: reg,
      installedPlugins: [themeablePlugin()],
      publicData: data,
    });
    if (
      !dressed.ok ||
      dressed.mode !== "plugin-themeable" ||
      !island.ok ||
      island.mode !== "plugin-themeable"
    ) {
      throw new Error("expected plugin-themeable on both themes");
    }
    expect(dressed.dressed).toBe(true);
    expect(island.dressed).toBe(false);
    expect(dressed.data).toEqual(island.data);
  });
});

/* -------------------------------------------- miss, enablement and detail */

describe("widget-presentation roundtrip — misses and gates", () => {
  it("unknown ids preserve authored props byte-identically", () => {
    const reg = createWidgetRegistry();
    const props = { heading: "Sale", rows: [{ a: 1 }] };
    const miss = resolvePresentation({
      widgetId: "builtin:ghost",
      themeKey: "songoskriti",
      registry: reg,
      props,
    });
    if (miss.ok) throw new Error("expected a miss");
    expect(miss.preservedProps).toEqual(props);
    expect(miss.placeholder).toBe(true);
    expect(miss.renderer).toBeNull();
  });

  it("disable → miss → enable → hit roundtrips through resolution and gate", () => {
    const reg: UnifiedRegistry = createWidgetRegistry();
    expect(
      reg.registerWidget(widgetDef("builtin:faq", { namespace: "builtin" })).ok,
    ).toBe(true);

    const hit = resolvePresentation({
      widgetId: "builtin:faq",
      themeKey: "songoskriti",
      registry: reg,
    });
    expect(hit.ok).toBe(true);

    expect(reg.disableWidget("builtin:faq").ok).toBe(true);
    const miss = resolvePresentation({
      widgetId: "builtin:faq",
      themeKey: "songoskriti",
      registry: reg,
      props: { q1: "When?" },
    });
    if (miss.ok) throw new Error("expected a miss");
    expect(miss.reason).toBe("disabled");
    expect(miss.preservedProps).toEqual({ q1: "When?" });
    expect(
      checkThemeCompatibility("songoskriti", ["builtin:faq"], {
        registry: reg,
      }).results,
    ).toEqual([
      { widgetId: "builtin:faq", compatible: false, reason: "disabled" },
    ]);

    expect(reg.enableWidget("builtin:faq").ok).toBe(true);
    expect(
      resolvePresentation({
        widgetId: "builtin:faq",
        themeKey: "songoskriti",
        registry: reg,
      }).ok,
    ).toBe(true);
    expect(
      checkThemeCompatibility("songoskriti", ["builtin:faq"], {
        registry: reg,
      }).results,
    ).toEqual([
      { widgetId: "builtin:faq", compatible: true, reason: "compatible" },
    ]);
  });

  it("every tray entry reports compatible in the gate", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget(
        widgetDef("theme:songoskriti/finder", {
          namespace: "theme",
          renderer: "custom",
          themes: ["songoskriti"],
        }),
      ).ok,
    ).toBe(true);
    const tray = themeTrayEntries("songoskriti", { registry: reg });
    if (!tray.ok) throw new Error("expected tray entries");
    expect(tray.entries.length).toBeGreaterThan(0);
    const report = checkThemeCompatibility(
      "songoskriti",
      tray.entries.map((e) => e.id),
      { registry: reg },
    );
    expect(
      report.results.every((r) => r.compatible && r.reason === "compatible"),
    ).toBe(true);
  });
});
