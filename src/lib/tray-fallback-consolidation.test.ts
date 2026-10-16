/**
 * Frame30 consolidation — Pass 1 (TDD RED): single shared fallback builder,
 * explicit singleton opt-in with global-only enforcement, ONE EMPTY_REGISTRY.
 *
 * - `buildFallbackExtensionRegistry()` (unified-widget-registry) is the ONE
 *   canonical fallback builder: builtin + studio tiers, byte-identical to the
 *   three inline copies (StudioBuilder helper + inline duplicate,
 *   SectionRenderer inline) when the singleton is empty.
 * - `buildTrayRegistry` merges the shared singleton ONLY with explicit
 *   `includeSingleton: true`, filtered by a namespace allow-list
 *   (global-only: `plugin:` never merges by default; `theme:` merges only
 *   for allow-listed global owners).
 * - `EMPTY_REGISTRY` is the ONE shared fail-closed empty registry (frozen:
 *   mutations rejected, reads miss) instead of competing rebuilds on null.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFallbackExtensionRegistry,
  buildTrayRegistry,
  clearRegistry,
  createWidgetRegistry,
  EMPTY_REGISTRY,
  fromBuiltinWidgets,
  fromStudioCatalog,
  listWidgets as listSingletonWidgets,
  registerWidget as registerSingletonWidget,
  type WidgetDef,
} from "./unified-widget-registry";

function tenantPluginDef(id: string): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "sandbox",
  };
}

function themeDef(id: string): WidgetDef {
  return {
    id,
    namespace: "theme",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "content",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "custom",
  };
}

afterEach(() => {
  clearRegistry();
});

describe("Pass 1 — canonical fallback builder seeds the static tiers", () => {
  it("resolves builtin + studio tiers like every other tray source", () => {
    const fallback = buildFallbackExtensionRegistry();
    expect(fallback.resolveWidget("builtin:hero").ok).toBe(true);
    const studioId = fromStudioCatalog()[0]!.id;
    expect(fallback.resolveWidget(studioId).ok).toBe(true);
  });

  it("matches the legacy inline recipe id-for-id on an empty singleton", () => {
    expect(listSingletonWidgets()).toEqual([]);
    // Legacy inline recipe (StudioBuilder:1155 + SectionRenderer:180 shape):
    // fresh registry, builtin + studio adapters, best-effort singleton merge.
    const legacy = createWidgetRegistry();
    for (const def of [...fromBuiltinWidgets(), ...fromStudioCatalog()]) {
      legacy.registerWidget(def);
    }
    for (const def of listSingletonWidgets()) {
      legacy.registerWidget(def);
    }
    expect(buildFallbackExtensionRegistry().widgetIds()).toEqual(
      legacy.widgetIds(),
    );
  });

  it("matches the StudioBuilder helper outcome on an empty singleton", async () => {
    const { buildFallbackExtensionRegistry: studioFallback } =
      await import("@/components/builder/studio/StudioBuilder");
    expect(buildFallbackExtensionRegistry().widgetIds()).toEqual(
      studioFallback().widgetIds(),
    );
  });

  it("matches buildTrayRegistry minus the plugin tier on an empty singleton", () => {
    expect(buildFallbackExtensionRegistry().widgetIds()).toEqual(
      buildTrayRegistry([]).widgetIds(),
    );
  });
});

describe("Pass 1 — singleton merge is filtered by default, strict on opt-out", () => {
  it("merges allow-listed global theme defs by default (frozen callers keep them)", () => {
    expect(
      registerSingletonWidget(themeDef("theme:songoskriti/pass1-global")).ok,
    ).toBe(true);
    expect(
      buildTrayRegistry([]).resolveWidget("theme:songoskriti/pass1-global").ok,
    ).toBe(true);
    expect(
      buildFallbackExtensionRegistry().resolveWidget(
        "theme:songoskriti/pass1-global",
      ).ok,
    ).toBe(true);
  });

  it("merges NOTHING with explicit includeSingleton:false (strict isolation)", () => {
    expect(
      registerSingletonWidget(themeDef("theme:songoskriti/pass1-global")).ok,
    ).toBe(true);
    expect(
      buildTrayRegistry([], { includeSingleton: false }).resolveWidget(
        "theme:songoskriti/pass1-global",
      ).ok,
    ).toBe(false);
    expect(
      buildFallbackExtensionRegistry({ includeSingleton: false }).resolveWidget(
        "theme:songoskriti/pass1-global",
      ).ok,
    ).toBe(false);
  });

  it("never merges tenant defs by default (secure default)", () => {
    expect(
      registerSingletonWidget(tenantPluginDef("plugin:acme/reviews")).ok,
    ).toBe(true);
    expect(
      registerSingletonWidget(themeDef("theme:tenant-evil/pass1-custom")).ok,
    ).toBe(true);
    const tray = buildTrayRegistry([]);
    expect(tray.resolveWidget("plugin:acme/reviews").ok).toBe(false);
    expect(tray.resolveWidget("theme:tenant-evil/pass1-custom").ok).toBe(false);
  });

  it("merges an allow-listed global theme def when explicitly opted in", () => {
    expect(
      registerSingletonWidget(themeDef("theme:songoskriti/pass1-global")).ok,
    ).toBe(true);
    const tray = buildTrayRegistry([], { includeSingleton: true });
    expect(tray.resolveWidget("theme:songoskriti/pass1-global").ok).toBe(true);
    const fallback = buildFallbackExtensionRegistry({
      includeSingleton: true,
    });
    expect(fallback.resolveWidget("theme:songoskriti/pass1-global").ok).toBe(
      true,
    );
  });

  it("blocks tenant plugin defs on the singleton even when opted in", () => {
    expect(
      registerSingletonWidget(tenantPluginDef("plugin:acme/reviews")).ok,
    ).toBe(true);
    const tray = buildTrayRegistry([], { includeSingleton: true });
    expect(tray.resolveWidget("plugin:acme/reviews").ok).toBe(false);
  });

  it("blocks non-global theme owners on the singleton even when opted in", () => {
    expect(
      registerSingletonWidget(themeDef("theme:tenant-evil/pass1-custom")).ok,
    ).toBe(true);
    const tray = buildTrayRegistry([], { includeSingleton: true });
    expect(tray.resolveWidget("theme:tenant-evil/pass1-custom").ok).toBe(false);
  });

  it("honors a widened namespace allow-list explicitly (caller accepts risk)", () => {
    expect(
      registerSingletonWidget(tenantPluginDef("plugin:acme/reviews")).ok,
    ).toBe(true);
    const tray = buildTrayRegistry([], {
      includeSingleton: true,
      singletonNamespaces: ["plugin"],
    });
    expect(tray.resolveWidget("plugin:acme/reviews").ok).toBe(true);
  });

  it("honors a widened theme-owner allow-list explicitly", () => {
    expect(
      registerSingletonWidget(themeDef("theme:tenant-evil/pass1-custom")).ok,
    ).toBe(true);
    const tray = buildTrayRegistry([], {
      includeSingleton: true,
      singletonThemeOwners: ["tenant-evil"],
    });
    expect(tray.resolveWidget("theme:tenant-evil/pass1-custom").ok).toBe(true);
  });

  it("keeps two tenant trays disjoint under the singleton (no cross-tenant leak)", () => {
    expect(
      registerSingletonWidget(tenantPluginDef("plugin:acme/reviews")).ok,
    ).toBe(true);
    const trayA = buildTrayRegistry([], { includeSingleton: true });
    const trayB = buildTrayRegistry([], { includeSingleton: true });
    expect(trayA.resolveWidget("plugin:acme/reviews").ok).toBe(false);
    expect(trayB.resolveWidget("plugin:acme/reviews").ok).toBe(false);
    expect(trayA.widgetIds()).toEqual(trayB.widgetIds());
  });
});

describe("Pass 1 — ONE shared EMPTY_REGISTRY (frozen, fail-closed)", () => {
  it("is a singleton instance (no competing rebuilds)", async () => {
    const again = (await import("./unified-widget-registry")).EMPTY_REGISTRY;
    expect(again).toBe(EMPTY_REGISTRY);
  });

  it("reads miss/empty and rejects every mutation without throwing", () => {
    expect(EMPTY_REGISTRY.listWidgets()).toEqual([]);
    expect(EMPTY_REGISTRY.widgetIds()).toEqual([]);
    expect(EMPTY_REGISTRY.getWidget("builtin:hero")).toBeUndefined();
    expect(EMPTY_REGISTRY.isSuspended("builtin:hero")).toBe(false);
    expect(EMPTY_REGISTRY.isDeprecatedId("builtin:hero")).toBe(false);
    expect(
      EMPTY_REGISTRY.resolveWidget("builtin:hero", { data: { keep: 1 } }),
    ).toMatchObject({
      ok: false,
      missing: {
        reason: "unknown",
        preservedData: { keep: 1 },
        widgetId: "builtin:hero",
      },
    });
    expect(
      EMPTY_REGISTRY.registerWidget({
        id: "builtin:hero",
        namespace: "builtin",
        version: "1.0.0",
        label: "H",
        category: "c",
        slots: [],
        defaults: {},
        propsSchema: { fields: [] },
        renderer: "builtin",
      }),
    ).toMatchObject({ ok: false });
    expect(EMPTY_REGISTRY.enableWidget("builtin:hero")).toMatchObject({
      ok: false,
    });
    expect(EMPTY_REGISTRY.disableWidget("builtin:hero")).toMatchObject({
      ok: false,
    });
    expect(EMPTY_REGISTRY.suspendWidget("builtin:hero")).toMatchObject({
      ok: false,
    });
    expect(EMPTY_REGISTRY.unsuspendWidget("builtin:hero")).toMatchObject({
      ok: false,
    });
    expect(EMPTY_REGISTRY.updateWidget("builtin:hero", {})).toMatchObject({
      ok: false,
    });
    expect(EMPTY_REGISTRY.removeWidget("builtin:hero")).toMatchObject({
      ok: false,
    });
    expect(
      EMPTY_REGISTRY.rollbackWidget("builtin:hero", "1.0.0"),
    ).toMatchObject({ ok: false });
    expect(() => EMPTY_REGISTRY.clear()).not.toThrow();
    // Still empty after every rejected mutation.
    expect(EMPTY_REGISTRY.widgetIds()).toEqual([]);
  });

  it("never throws on garbage input", () => {
    expect(() =>
      EMPTY_REGISTRY.resolveWidget(null, "garbage" as never),
    ).not.toThrow();
    expect(EMPTY_REGISTRY.getWidget(null)).toBeUndefined();
    expect(EMPTY_REGISTRY.isSuspended(undefined)).toBe(false);
  });
});

describe("Pass 1 — tray builder never throws on hostile input", () => {
  it("coerces a non-array install list to the static tiers", () => {
    for (const hostile of [null, undefined, 42, "x", {}]) {
      let tray!: ReturnType<typeof buildTrayRegistry>;
      expect(() => {
        tray = buildTrayRegistry(hostile as never);
      }).not.toThrow();
      expect(tray.resolveWidget("builtin:hero").ok).toBe(true);
    }
  });

  it("ignores a non-array themeDefs without throwing", () => {
    const tray = buildTrayRegistry([], { themeDefs: "x" as never });
    expect(tray.resolveWidget("builtin:hero").ok).toBe(true);
  });
});
