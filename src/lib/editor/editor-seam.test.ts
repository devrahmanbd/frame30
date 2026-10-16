/**
 * Frame30 lane (wiring side) — editor seam helpers.
 *
 * Pass 1 (implement): same-instance guards, theme-key resolution, save
 * canonicalization, preview resolution. Pass 3 (adversarial): hostile seam
 * inputs, mid-session switches. Every helper is pure and never throws.
 */
import { describe, expect, it } from "vitest";
import { DEV_THEME_RUNTIME_VERSION } from "@/lib/dev-theme-manifest";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { emptyStudioDoc, type StudioDoc } from "@/lib/studio/model";
import {
  buildEditorExtensionRegistry,
  resolveEditorDevThemeBinding,
} from "./editor-registry";
import {
  canonicalizeEditorDocForSave,
  deriveEditorPluginEntries,
  describeEditorRegistryRecovery,
  didEditorRegistrySwitch,
  editorExtensionWidgetKeyOf,
  editorRegistryFingerprint,
  isEditorExtensionNode,
  isUsableEditorRegistry,
  previewEditorExtensionNodes,
  resolveEditorThemeKey,
  sanitizeEditorExtensionNode,
  sanitizeEditorExtensionProps,
  selectEditorRegistry,
} from "./editor-seam";

function pluginInstall(id: string): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version: "1.2.0",
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "reviews",
          label: "Reviews",
          slots: ["main"],
          entry: "reviews-entry.js",
          height: 320,
        },
      ],
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: {},
    enabled: true,
  };
}

function themeManifest(over: Record<string, unknown> = {}) {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
    ...over,
  };
}

function schemaDef(
  id: string,
  namespace: WidgetDef["namespace"] = "plugin",
): WidgetDef {
  return {
    id,
    namespace,
    version: "1.0.0",
    label: `Label ${id}`,
    category: "test",
    slots: ["main"],
    defaults: { title: "Default title", count: 3 },
    propsSchema: {
      fields: [
        { key: "title", kind: "text", label: "Title" },
        { key: "count", kind: "number", label: "Count" },
      ] as unknown as WidgetDef["propsSchema"]["fields"],
    },
    renderer: "sandbox",
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const d of defs) reg.registerWidget(d);
  return reg;
}

function extensionNode(
  widgetKey: string,
  props: Record<string, unknown> = {},
  id = "node-1",
): import("@/lib/studio/model").StudioNode {
  return {
    id,
    el: "app-block",
    settings: {
      pluginKey: widgetKey,
      extensionInstanceId: id,
      extensionApi: "3.0.0",
      ...props,
    },
  };
}

describe("selectEditorRegistry — same instance, never a rebuild", () => {
  it("passes the authorized instance through by reference", () => {
    const authorized = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    expect(selectEditorRegistry(authorized)).toBe(authorized);
    expect(isUsableEditorRegistry(authorized)).toBe(true);
  });

  it("selects hostile/foreign seam inputs to explicit absent", () => {
    for (const hostile of [
      null,
      undefined,
      {},
      { resolveWidget: null },
      { resolveWidget: () => {}, listWidgets: "nope" },
      { listWidgets: () => [] },
      42,
      "registry",
      [],
    ]) {
      expect(isUsableEditorRegistry(hostile)).toBe(false);
      expect(selectEditorRegistry(hostile)).toBeNull();
    }
  });

  it("a throwing registry falls back safely", () => {
    const throwing = {
      resolveWidget: () => {
        throw new Error("boom");
      },
      listWidgets: () => {
        throw new Error("boom");
      },
    };
    expect(isUsableEditorRegistry(throwing)).toBe(true);
    expect(selectEditorRegistry(throwing)).toBe(throwing);
    expect(editorRegistryFingerprint(throwing)).toBe("unknown");
  });
});

describe("deriveEditorPluginEntries — contract shape unchanged", () => {
  it("prefers the first prop, falls back to the alias, defaults empty", () => {
    const a = [{ key: "a", label: "A" }];
    const b = [{ key: "b", label: "B" }];
    expect(deriveEditorPluginEntries(a, b)).toBe(a);
    expect(deriveEditorPluginEntries(undefined, b)).toBe(b);
    expect(deriveEditorPluginEntries(null, null)).toEqual([]);
    expect(deriveEditorPluginEntries(undefined, undefined)).toEqual([]);
  });

  it("hostile inputs yield empty, never throws", () => {
    expect(deriveEditorPluginEntries("nope" as unknown as never)).toEqual([]);
    expect(deriveEditorPluginEntries(42 as unknown as never)).toEqual([]);
    expect(deriveEditorPluginEntries(null, 42 as unknown as never)).toEqual([]);
  });
});

describe("resolveEditorThemeKey — one keyed resolution", () => {
  it("prefers the route build key over doc/active ids", () => {
    expect(
      resolveEditorThemeKey({
        routeThemeKey: "aurora-lookbook",
        docThemeId: "uuid-doc",
        activeThemeId: "uuid-active",
      }),
    ).toBe("aurora-lookbook");
    expect(
      resolveEditorThemeKey({ docThemeId: "uuid-doc", activeThemeId: "x" }),
    ).toBe("uuid-doc");
    expect(resolveEditorThemeKey({ activeThemeId: "uuid-active" })).toBe(
      "uuid-active",
    );
  });

  it("trims and falls back on blank/hostile, never throws", () => {
    expect(
      resolveEditorThemeKey({
        routeThemeKey: "  ",
        docThemeId: "",
        activeThemeId: "  uuid-active  ",
      }),
    ).toBe("uuid-active");
    expect(resolveEditorThemeKey(null)).toBeNull();
    expect(resolveEditorThemeKey(undefined)).toBeNull();
    expect(
      resolveEditorThemeKey({ routeThemeKey: 42, docThemeId: null }),
    ).toBeNull();
    expect(
      resolveEditorThemeKey("hostile" as unknown as { routeThemeKey: string }),
    ).toBeNull();
  });
});

describe("fingerprint + switch + recovery", () => {
  it("is stable across content-identical rebuilds", () => {
    const a = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    const b = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    expect(a).not.toBe(b);
    expect(editorRegistryFingerprint(a)).toBe(editorRegistryFingerprint(b));
    expect(didEditorRegistrySwitch(a, b)).toBe(false);
    expect(describeEditorRegistryRecovery(a, b)).toEqual({
      switched: false,
      recovery: "none",
    });
  });

  it("detects theme change and plugin disable with explicit recovery", () => {
    const before = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: "aurora-lookbook",
      approvedDevManifest: themeManifest(),
      isActive: true,
    });
    const afterThemeGone = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    expect(didEditorRegistrySwitch(before, afterThemeGone)).toBe(true);
    expect(describeEditorRegistryRecovery(before, afterThemeGone)).toEqual({
      switched: true,
      recovery: "remount-canvas",
    });

    const pluginsOnly = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    const emptied = buildEditorExtensionRegistry({
      installedPlugins: [],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    expect(didEditorRegistrySwitch(pluginsOnly, emptied)).toBe(true);
  });

  it("absent vs absent is not a switch; hostile never throws", () => {
    expect(didEditorRegistrySwitch(null, undefined)).toBe(false);
    expect(editorRegistryFingerprint(null)).toBe("absent");
    expect(describeEditorRegistryRecovery(null, { hostile: true })).toEqual({
      switched: false,
      recovery: "none",
    });
  });
});

describe("extension node identity", () => {
  it("detects envelope twins and reads the widget key", () => {
    const node = extensionNode("plugin:acme/reviews");
    expect(isEditorExtensionNode(node)).toBe(true);
    expect(editorExtensionWidgetKeyOf(node)).toBe("plugin:acme/reviews");
    expect(isEditorExtensionNode({ el: "app-block", settings: {} })).toBe(
      false,
    );
    expect(isEditorExtensionNode({ el: "heading", settings: {} })).toBe(false);
    expect(isEditorExtensionNode(null)).toBe(false);
    expect(editorExtensionWidgetKeyOf(null)).toBe("");
    expect(editorExtensionWidgetKeyOf({ settings: null })).toBe("");
  });
});

describe("sanitizeEditorExtensionProps — validated, no loss, no bleed", () => {
  it("keeps known props, strips unknown/hostile, fills schema keys", () => {
    const def = schemaDef("plugin:acme/reviews");
    const clean = sanitizeEditorExtensionProps(
      {
        title: "Hello",
        count: 7,
        evil: "drop me",
        __proto__: { polluted: true },
        constructor: "drop",
      },
      def,
    );
    expect(clean.title).toBe("Hello");
    expect(clean.count).toBe(7);
    expect(clean).not.toHaveProperty("evil");
    expect(clean).not.toHaveProperty("__proto__");
    expect(clean).not.toHaveProperty("constructor");
    expect("title" in clean && "count" in clean).toBe(true);
  });

  it("returns fresh objects per call (no shared references)", () => {
    const def = schemaDef("plugin:acme/reviews");
    const a = sanitizeEditorExtensionProps({ title: "x" }, def);
    const b = sanitizeEditorExtensionProps({ title: "x" }, def);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("empty-schema defs keep authored props verbatim (cloned)", () => {
    const def = {
      defaults: { keep: "me" },
      propsSchema: { fields: [] },
    };
    const raw = { keep: "mine", extra: "yours" };
    const clean = sanitizeEditorExtensionProps(raw, def);
    expect(clean.keep).toBe("mine");
    expect(clean.extra).toBe("yours");
    expect(clean).not.toBe(raw);
  });

  it("never merges install-global settings and never throws", () => {
    const def = schemaDef("plugin:acme/reviews");
    const clean = sanitizeEditorExtensionProps(null, def);
    expect(typeof clean).toBe("object");
    expect(sanitizeEditorExtensionProps("hostile", null)).toEqual({});
  });
});

describe("sanitizeEditorExtensionNode + canonicalize — save path", () => {
  it("validates extension twins and preserves the envelope", () => {
    const registry = registryWith([schemaDef("plugin:acme/reviews")]);
    const node = extensionNode(
      "plugin:acme/reviews",
      { title: "Kept", count: 9, dropped: "gone" },
      "n1",
    );
    const clean = sanitizeEditorExtensionNode(node, registry);
    expect(clean).not.toBe(node);
    expect(clean.id).toBe("n1");
    expect(clean.settings.pluginKey).toBe("plugin:acme/reviews");
    expect(clean.settings.extensionInstanceId).toBe("n1");
    expect(clean.settings.title).toBe("Kept");
    expect(clean.settings).not.toHaveProperty("dropped");
    // Input untouched (no mutation).
    expect(node.settings).toHaveProperty("dropped");
  });

  it("misses preserve verbatim for recovery (never drops data)", () => {
    const registry = registryWith([schemaDef("plugin:acme/reviews")]);
    const ghost = extensionNode(
      "plugin:acme/missing",
      { title: "Authored" },
      "g1",
    );
    const clean = sanitizeEditorExtensionNode(ghost, registry);
    expect(clean.settings.pluginKey).toBe("plugin:acme/missing");
    expect(clean.settings.title).toBe("Authored");
    expect(clean.settings.extensionInstanceId).toBe("g1");
  });

  it("unusable registry preserves every node, legacy untouched", () => {
    const legacy = {
      id: "h1",
      el: "heading",
      settings: { text: "Hi" },
    } as import("@/lib/studio/model").StudioNode;
    const clean = sanitizeEditorExtensionNode(
      extensionNode("plugin:acme/reviews", { title: "T" }, "n9"),
      null,
    );
    expect(clean.settings.title).toBe("T");
    expect(sanitizeEditorExtensionNode(legacy, null)).toBe(legacy);
  });

  it("canonicalizes root + slots without mutation or global bleed", () => {
    const registry = registryWith([schemaDef("plugin:acme/reviews")]);
    const doc: StudioDoc = {
      ...emptyStudioDoc("T"),
      root: [
        extensionNode(
          "plugin:acme/reviews",
          { title: "R", count: 1, junk: "x" },
          "r1",
        ),
        { id: "h1", el: "heading", settings: { text: "Hi" } },
      ],
      header: [extensionNode("plugin:acme/reviews", { title: "H" }, "h9")],
      footer: [],
    };
    const clean = canonicalizeEditorDocForSave(doc, registry)!;
    expect(clean).not.toBe(doc);
    expect(clean.root[0]!.settings.title).toBe("R");
    expect(clean.root[0]!.settings).not.toHaveProperty("junk");
    expect(clean.root[1]).toBe(doc.root[1]);
    expect(clean.header![0]!.settings.title).toBe("H");
    // Source doc untouched.
    expect(doc.root[0]!.settings).toHaveProperty("junk");
    expect(canonicalizeEditorDocForSave(null, registry)).toBeNull();
  });
});

describe("previewEditorExtensionNodes — same registry, not disconnected", () => {
  it("resolves through the passed instance (identity matters)", () => {
    const authorized = registryWith([schemaDef("plugin:acme/reviews")]);
    const foreign = registryWith([schemaDef("plugin:globex/reviews")]);
    const doc: StudioDoc = {
      ...emptyStudioDoc("T"),
      root: [extensionNode("plugin:acme/reviews", {}, "p1")],
    };
    const viaAuthorized = previewEditorExtensionNodes(doc, authorized, "k");
    expect(viaAuthorized).toEqual([
      { nodeId: "p1", widgetKey: "plugin:acme/reviews", ok: true },
    ]);
    const viaForeign = previewEditorExtensionNodes(doc, foreign, "k");
    expect(viaForeign[0]).toMatchObject({
      nodeId: "p1",
      widgetKey: "plugin:acme/reviews",
      ok: false,
    });
    expect(typeof viaForeign[0]!.reason).toBe("string");
  });

  it("skips legacy nodes, walks slots, never throws on hostile", () => {
    const registry = registryWith([schemaDef("plugin:acme/reviews")]);
    const doc: StudioDoc = {
      ...emptyStudioDoc("T"),
      root: [{ id: "h1", el: "heading", settings: { text: "Hi" } }],
      header: [extensionNode("plugin:acme/missing", {}, "m1")],
    };
    const out = previewEditorExtensionNodes(doc, registry, "k");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ nodeId: "m1", ok: false });
    expect(previewEditorExtensionNodes(null, registry, "k")).toEqual([]);
    expect(previewEditorExtensionNodes(null, null, "k")).toEqual([]);
    expect(
      previewEditorExtensionNodes(
        { hostile: true } as unknown as StudioDoc,
        registry,
        "k",
      ),
    ).toEqual([]);
  });
});

describe("binding stays deny-all alongside the registry", () => {
  it("a valid projection completes with the editor host", async () => {
    const binding = resolveEditorDevThemeBinding({
      assetOrigin: "https://assets.example.test",
      theme: { name: "aurora-lookbook", version: "1.0.0" },
    });
    expect(binding?.granted).toEqual([]);
    await expect(binding!.onCall("theme.cart.add", {})).rejects.toThrow(
      "theme.denied",
    );
  });
});
