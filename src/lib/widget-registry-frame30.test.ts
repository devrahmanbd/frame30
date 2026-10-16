/**
 * Frame30 — Pass 2 (RED→GREEN): ONE authoritative registry.
 *
 * Single `createWidgetRegistry` lineage; legacy shims documented, not
 * competing. Tenant isolation (disjoint factories), ownership validation
 * (plugin/theme ids require owner/widget parts), version/API gates,
 * cache invalidation on update (no stale reads), safe states with explicit
 * reasons (disabled/missing/suspended/incompatible — never substitution).
 */
import { describe, expect, it } from "vitest";
import {
  createWidgetRegistry,
  fromPluginManifest,
  buildTrayRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import type { InstalledPlugin } from "./plugin-manifest";

const ENTRY = "framique.mount(document.createTextNode('x'))";

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
  opts: { enabled?: boolean; suspended?: boolean; api?: string } = {},
): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version: "1.2.0",
      api: opts.api ?? "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "reviews",
          label: "Reviews",
          slots: ["main"],
          entry: ENTRY,
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
    ...(opts.suspended === true ? { suspended: true as const } : {}),
  };
}

describe("Pass2 — single lineage + ownership", () => {
  it("documents the single lineage (factory + documented shims)", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/unified-widget-registry.ts", "utf8"),
    );
    expect(src).toContain("createWidgetRegistry");
    expect(src.toLowerCase()).toContain("legacy");
    expect(src.toLowerCase()).toContain("singleton");
  });

  it("rejects plugin/theme ids without owner/widget parts", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget({
        ...builtinDef("plugin:acme"),
        namespace: "plugin",
      }).ok,
    ).toBe(false);
    expect(
      reg.registerWidget({
        ...builtinDef("theme:lonely"),
        namespace: "theme",
      }).ok,
    ).toBe(false);
    expect(
      reg.registerWidget({
        ...builtinDef("plugin:acme/reviews"),
        namespace: "plugin",
      }).ok,
    ).toBe(true);
  });

  it("keeps two tenant registries disjoint", () => {
    const a = createWidgetRegistry();
    const b = createWidgetRegistry();
    expect(
      a.registerWidget({
        ...builtinDef("plugin:acme/reviews"),
        namespace: "plugin",
      }).ok,
    ).toBe(true);
    expect(b.resolveWidget("plugin:acme/reviews").ok).toBe(false);
    expect(a.resolveWidget("plugin:acme/reviews").ok).toBe(true);
  });

  it("suspended installs contribute nothing to the adapter", () => {
    expect(
      fromPluginManifest([pluginInstall("acme", { suspended: true })]),
    ).toEqual([]);
    expect(fromPluginManifest([pluginInstall("acme")])).toHaveLength(1);
  });
});

describe("Pass2 — safe states + cache invalidation", () => {
  it("suspend yields an explicit suspended miss, never a substitution", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget({ ...builtinDef("builtin:faq"), slots: ["main"] }).ok,
    ).toBe(true);
    expect(reg.suspendWidget("builtin:faq").ok).toBe(true);
    const miss = reg.resolveWidget("builtin:faq", { data: { keep: 1 } });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("suspended");
      expect(miss.missing.preservedData).toEqual({ keep: 1 });
      expect("def" in (miss as Record<string, unknown>)).toBe(false);
    }
    expect(reg.unsuspendWidget("builtin:faq").ok).toBe(true);
    expect(reg.resolveWidget("builtin:faq").ok).toBe(true);
  });

  it("update invalidates reads: resolve tracks the newest version", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget(builtinDef("builtin:hero", "1.0.0"));
    expect(reg.resolveWidget("builtin:hero").ok).toBe(true);
    const before = reg.getWidget("builtin:hero");
    reg.registerWidget({ ...builtinDef("builtin:hero", "2.0.0"), label: "V2" });
    const after = reg.resolveWidget("builtin:hero");
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.def.version).toBe("2.0.0");
      expect(after.def.label).toBe("V2");
    }
    expect(before?.version).toBe("1.0.0");
    // Pinned reads still address retained versions.
    const pinned = reg.resolveWidget("builtin:hero", { version: "1.0.0" });
    expect(pinned.ok && pinned.ok ? pinned.def.version : "").toBe("1.0.0");
  });

  it("buildTrayRegistry carries contract fields without cross-tenant leaks", () => {
    const trayA = buildTrayRegistry([pluginInstall("acme")]);
    const trayB = buildTrayRegistry([pluginInstall("globex")]);
    expect(trayA.resolveWidget("plugin:acme/reviews").ok).toBe(true);
    expect(trayA.resolveWidget("plugin:globex/reviews").ok).toBe(false);
    expect(trayB.resolveWidget("plugin:globex/reviews").ok).toBe(true);
    expect(trayB.resolveWidget("plugin:acme/reviews").ok).toBe(false);
  });
});
