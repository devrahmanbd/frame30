/**
 * Unified widget registry — core contract tests (RED-first).
 *
 * Covers: registration/validation, legacy bare-id grandfathering, duplicate
 * id+version handling with rollback, resolve/missing semantics (never throws,
 * never deletes data), enable/disable/update/remove, privilege-drop on
 * registration, adapters over the three source systems, and fixture page
 * ASTs built from real builtin ids proving saved pages keep working.
 */
import { describe, expect, it } from "vitest";
import {
  GENERIC_WIDGETS,
  WIDGET_COMPONENTS,
} from "../components/builder/widgets";
import { WIDGETS as STUDIO_CATALOG } from "./studio/catalog";
import {
  BUILDER_API_VERSION,
  pluginWidgetKey,
  type InstalledPlugin,
} from "./plugin-manifest";
import {
  createWidgetRegistry,
  fromBuiltinWidgets,
  fromPluginManifest,
  fromStudioCatalog,
  type WidgetDef,
} from "./unified-widget-registry";

function builtinDef(id: string, version = "1.0.0"): WidgetDef {
  return {
    id,
    namespace: "builtin",
    version,
    label: `Label ${id}`,
    category: "general",
    slots: [],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "builtin",
  };
}

function pluginInstall(
  id: string,
  opts: { api?: string; enabled?: boolean; version?: string } = {},
): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version: opts.version ?? "1.2.0",
      api: opts.api ?? "^3.0.0",
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
    enabled: opts.enabled ?? true,
  };
}

describe("unified registry — registration and validation", () => {
  it("registers a valid namespaced def", () => {
    const reg = createWidgetRegistry();
    const verdict = reg.registerWidget(builtinDef("builtin:hero"));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.def.id).toBe("builtin:hero");
      expect(verdict.deprecatedId).toBe(false);
    }
  });

  it("rejects malformed ids without throwing", () => {
    const reg = createWidgetRegistry();
    for (const bad of [
      "",
      "   ",
      "Has Spaces",
      "Builtin:hero",
      "builtin:",
      ":hero",
      "other:hero",
      "builtin:hero!!",
      42,
      null,
      undefined,
      {},
    ]) {
      const verdict = reg.registerWidget(builtinDef(bad as string));
      expect(verdict.ok).toBe(false);
    }
  });

  it("grandfathers legacy bare builtin ids with a deprecation flag", () => {
    const reg = createWidgetRegistry();
    const verdict = reg.registerWidget(builtinDef("hero"));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.deprecatedId).toBe(true);
    expect(reg.isDeprecatedId("hero")).toBe(true);
    expect(reg.isDeprecatedId("builtin:hero")).toBe(false);
  });

  it("rejects a namespace/id mismatch", () => {
    const reg = createWidgetRegistry();
    const def = builtinDef("builtin:hero");
    const verdict = reg.registerWidget({ ...def, namespace: "plugin" });
    expect(verdict.ok).toBe(false);
  });

  it("rejects bad versions, renderers and prop kinds", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget({ ...builtinDef("builtin:a"), version: "x" }).ok,
    ).toBe(false);
    expect(
      reg.registerWidget({
        ...builtinDef("builtin:a"),
        renderer: "iframe" as never,
      }).ok,
    ).toBe(false);
    expect(
      reg.registerWidget({
        ...builtinDef("builtin:a"),
        propsSchema: { fields: [{ key: "x", label: "X", kind: "slider" }] },
      } as unknown as WidgetDef).ok,
    ).toBe(false);
  });

  it("duplicate id+version overwrites in place; newer wins; old retained", () => {
    const reg = createWidgetRegistry();
    expect(reg.registerWidget(builtinDef("builtin:hero", "1.0.0")).ok).toBe(
      true,
    );
    const relabel = reg.registerWidget({
      ...builtinDef("builtin:hero", "1.0.0"),
      label: "Hero relabelled",
    });
    expect(relabel.ok).toBe(true);
    expect(reg.resolveWidget("builtin:hero").ok).toBe(true);

    expect(reg.registerWidget(builtinDef("builtin:hero", "2.0.0")).ok).toBe(
      true,
    );
    // Out-of-order sync of an older version: retained, latest stays the max.
    expect(reg.registerWidget(builtinDef("builtin:hero", "1.5.0")).ok).toBe(
      true,
    );

    const latest = reg.resolveWidget("builtin:hero");
    expect(latest.ok && latest.ok ? latest.def.version : "").toBe("2.0.0");
    const pinned = reg.resolveWidget("builtin:hero", { version: "1.0.0" });
    expect(pinned.ok && pinned.ok ? pinned.def.version : "").toBe("1.0.0");
    const mid = reg.resolveWidget("builtin:hero", { version: "1.5.0" });
    expect(mid.ok && mid.ok ? mid.def.version : "").toBe("1.5.0");
  });

  it("rolls back to a retained version without losing the newer one", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget(builtinDef("builtin:hero", "1.0.0"));
    reg.registerWidget(builtinDef("builtin:hero", "2.0.0"));
    expect(reg.rollbackWidget("builtin:hero", "1.0.0").ok).toBe(true);
    const resolved = reg.resolveWidget("builtin:hero");
    expect(resolved.ok && resolved.ok ? resolved.def.version : "").toBe(
      "1.0.0",
    );
    expect(reg.rollbackWidget("builtin:hero", "9.9.9").ok).toBe(false);
    expect(reg.rollbackWidget("builtin:nope", "1.0.0").ok).toBe(false);
  });
});

describe("unified registry — resolve and missing semantics", () => {
  it("never throws and preserves data for unknown ids", () => {
    const reg = createWidgetRegistry();
    for (const bad of [undefined, null, 42, {}, "", "   ", "builtin:ghost"]) {
      let result: unknown;
      expect(() => {
        result = reg.resolveWidget(bad as string, { data: { keep: 1 } });
      }).not.toThrow();
      const miss = result as {
        ok: boolean;
        missing: { preservedData: unknown };
      };
      expect(miss.ok).toBe(false);
      expect(miss.missing.preservedData).toEqual({ keep: 1 });
    }
  });

  it("maps absent plugin-namespaced ids to uninstalled", () => {
    const reg = createWidgetRegistry();
    const result = reg.resolveWidget("plugin:ghost/widget");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing.reason).toBe("uninstalled");
  });

  it("disable yields a disabled placeholder with data; enable restores", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget(builtinDef("builtin:faq"));
    expect(reg.disableWidget("builtin:faq").ok).toBe(true);
    const data = { q1: "When?", a1: "Soon." };
    const miss = reg.resolveWidget("builtin:faq", { data });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("disabled");
      expect(miss.missing.preservedData).toEqual(data);
    }
    expect(reg.enableWidget("builtin:faq").ok).toBe(true);
    expect(reg.resolveWidget("builtin:faq").ok).toBe(true);
  });

  it("flags incompatible defs against the builder api without throwing", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget({
      ...builtinDef("builtin:fancy"),
      minBuilderApi: "99.0.0",
    });
    const miss = reg.resolveWidget("builtin:fancy", {
      builderApi: BUILDER_API_VERSION,
      data: { draft: true },
    });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("incompatible");
      expect(miss.missing.preservedData).toEqual({ draft: true });
    }
  });

  it("removal keeps data as a placeholder and leaves other pages intact", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget(builtinDef("builtin:hero"));
    reg.registerWidget(builtinDef("builtin:faq"));
    // Two referencing pages share the registry.
    const pageA = ["builtin:hero", "builtin:faq"];
    const pageB = ["builtin:faq"];
    expect(reg.removeWidget("builtin:hero").ok).toBe(true);
    const data = { heading: "Sale" };
    const gone = reg.resolveWidget(pageA[0]!, { data });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.missing.preservedData).toEqual(data);
    for (const id of pageB) expect(reg.resolveWidget(id).ok).toBe(true);
    expect(reg.resolveWidget("builtin:faq").ok).toBe(true);
    expect(reg.removeWidget("builtin:ghost").ok).toBe(false);
  });

  it("unknown pinned versions miss with data preserved", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget(builtinDef("builtin:hero", "1.0.0"));
    const miss = reg.resolveWidget("builtin:hero", {
      version: "3.0.0",
      data: { v: 3 },
    });
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.missing.preservedData).toEqual({ v: 3 });
  });
});

describe("unified registry — registration grants no runtime privilege", () => {
  it("drops scopes/permissions/capabilities/entry keys from a hostile def", () => {
    const reg = createWidgetRegistry();
    const hostile = {
      ...builtinDef("builtin:evil"),
      scopes: ["render_storefront", "replace_menus"],
      permissions: ["read_shop"],
      capabilities: ["admin"],
      entry: "evil-entry.js",
    };
    const verdict = reg.registerWidget(hostile as unknown as WidgetDef);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      for (const key of ["scopes", "permissions", "capabilities", "entry"]) {
        expect(key in verdict.def).toBe(false);
      }
      expect(Object.keys(verdict.def).sort()).toEqual(
        [
          "category",
          "defaults",
          "id",
          "label",
          "namespace",
          "propsSchema",
          "renderer",
          "slots",
          "version",
        ].sort(),
      );
    }
    const resolved = reg.resolveWidget("builtin:evil");
    if (resolved.ok) {
      expect("entry" in resolved.def).toBe(false);
      expect("scopes" in resolved.def).toBe(false);
    } else {
      throw new Error("expected builtin:evil to resolve");
    }
  });
});

describe("unified registry — builtin adapter", () => {
  it("maps every key of the exported renderer maps", () => {
    const defs = fromBuiltinWidgets();
    const ids = new Set(defs.map((d) => d.id));
    for (const key of Object.keys(WIDGET_COMPONENTS)) {
      expect(ids.has(`builtin:${key}`)).toBe(true);
    }
    for (const key of Object.keys(GENERIC_WIDGETS)) {
      expect(ids.has(`builtin:${key}`)).toBe(true);
    }
    expect(defs.length).toBeGreaterThanOrEqual(100);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    for (const def of defs) {
      expect(def.namespace).toBe("builtin");
      expect(def.renderer).toBe("builtin");
      // Legacy-unvalidated old path: no per-widget schema is synthesised here.
      expect(def.propsSchema).toEqual({ fields: [] });
    }
  });

  it("is read-only over the source maps", () => {
    const before = Object.keys(WIDGET_COMPONENTS).join(",");
    fromBuiltinWidgets();
    expect(Object.keys(WIDGET_COMPONENTS).join(",")).toBe(before);
  });

  it("saved page ASTs with real bare builtin ids keep resolving", () => {
    const realIds = [
      "hero",
      "product_grid",
      "faq",
      "image",
      "heading",
      "container",
    ];
    for (const id of realIds) {
      expect(
        `builtin:${id}` in WIDGET_COMPONENTS || id in WIDGET_COMPONENTS,
      ).toBe(true);
    }
    const reg = createWidgetRegistry();
    for (const def of fromBuiltinWidgets()) reg.registerWidget(def);
    // Fixture saved-page AST: bare `type` values as stored before unification.
    const pageAst = realIds.map((type, i) => ({
      id: `node-${i}`,
      type,
      props: { heading: `Saved ${type}` },
    }));
    for (const node of pageAst) {
      const bare = reg.resolveWidget(node.type, { data: node.props });
      expect(bare.ok).toBe(true);
      const namespaced = reg.resolveWidget(`builtin:${node.type}`);
      expect(namespaced.ok).toBe(true);
    }
  });
});

describe("unified registry — studio catalog adapter", () => {
  it("maps every studio WIDGETS entry with its defaults", () => {
    const defs = fromStudioCatalog();
    expect(defs.length).toBe(STUDIO_CATALOG.length);
    const byId = new Map(defs.map((d) => [d.id, d]));
    for (const entry of STUDIO_CATALOG) {
      const def = byId.get(`studio:${entry.key}`);
      expect(def).toBeDefined();
      expect(def!.label).toBe(entry.label);
      expect(def!.category).toBe(entry.category);
      expect(def!.defaults).toEqual(entry.defaults);
      expect(def!.namespace).toBe("studio");
      expect(def!.renderer).toBe("custom");
    }
  });
});

describe("unified registry — plugin manifest adapter", () => {
  it("mirrors resolver filtering: skips disabled and incompatible installs", () => {
    const key = pluginWidgetKey("acme", "reviews");
    const enabled = fromPluginManifest([pluginInstall("acme")]);
    expect(enabled.map((d) => d.id)).toContain(key);
    expect(enabled[0]!.renderer).toBe("sandbox");
    expect(enabled[0]!.namespace).toBe("plugin");

    const disabled = fromPluginManifest([
      pluginInstall("acme", { enabled: false }),
    ]);
    expect(disabled).toEqual([]);

    const ancient = fromPluginManifest([
      pluginInstall("acme", { api: "^1.0.0" }),
    ]);
    expect(ancient).toEqual([]);
  });

  it("carries the manifest version and a parsed min builder api", () => {
    const defs = fromPluginManifest([
      pluginInstall("acme", { version: "2.3.0" }),
    ]);
    expect(defs[0]!.version).toBe("2.3.0");
    expect(defs[0]!.minBuilderApi).toBe("3.0.0");
  });
});
