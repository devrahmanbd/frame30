/**
 * Frame30 — tenant-aware extension registry for the REAL editor path
 * (`content/editor.tsx` → `EditorShell` → `StudioBuilder`).
 *
 * The route builds ONE registry from its server-authorized installed plugins
 * PLUS the active approved theme's Level B defs (projection fail-closes to
 * plugins-only) and threads it through `studioSeamProps`/`extensionRegistry`
 * to StudioBuilder; the projected `DevThemeBinding` (or explicit absent)
 * rides alongside so canvas/inspector/preview share one build.
 *
 * Tenant isolation: the registry derives only from this tenant's authorized
 * installs + active approved theme — nothing is written to the shared
 * singleton, and foreign/unapproved defs never resolve.
 */
import { describe, expect, it } from "vitest";
import { DEV_THEME_RUNTIME_VERSION } from "@/lib/dev-theme-manifest";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import {
  getWidget,
  listWidgets,
  resolveWidget,
  widgetIds,
} from "@/lib/unified-widget-registry";
import {
  buildEditorExtensionRegistry,
  denyEditorDevThemeCalls,
  resolveEditorDevThemeBinding,
} from "./editor-registry";

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

function bindingInputs(over: Record<string, unknown> = {}) {
  return {
    assetOrigin: "https://assets.example.test",
    theme: { name: "aurora-lookbook", version: "1.0.0" },
    granted: ["theme:commerce.read"],
    navigateAllowlist: ["https://evil.example.test"],
    fingerprint: "0".repeat(64),
    ...over,
  };
}

describe("editor extension registry — authorized content", () => {
  it("resolves this tenant's installed plugin widgets", () => {
    const registry = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    const resolved = registry.resolveWidget("plugin:acme/reviews");
    expect(resolved.ok).toBe(true);
  });

  it("registers the active approved theme's Level B defs alongside plugins", () => {
    const registry = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: "aurora-lookbook",
      approvedDevManifest: themeManifest(),
      isActive: true,
    });
    expect(registry.resolveWidget("plugin:acme/reviews").ok).toBe(true);
    const themed = registry.resolveWidget("theme:aurora-lookbook/hero");
    expect(themed.ok).toBe(true);
    if (themed.ok) {
      expect(themed.def.namespace).toBe("theme");
      expect(themed.def.version).toBe("1.0.0");
    }
  });

  it("fail-closes to plugins-only when the theme projection is absent", () => {
    for (const input of [
      { themeKey: null, approvedDevManifest: null, isActive: false },
      {
        themeKey: "aurora-lookbook",
        approvedDevManifest: null,
        isActive: true,
      },
      {
        themeKey: "aurora-lookbook",
        approvedDevManifest: { bogus: true },
        isActive: true,
      },
    ]) {
      const registry = buildEditorExtensionRegistry({
        installedPlugins: [pluginInstall("acme")],
        ...input,
      });
      expect(registry.resolveWidget("plugin:acme/reviews").ok).toBe(true);
      expect(registry.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(
        false,
      );
    }
  });

  it("excludes foreign theme defs (manifest for another theme)", () => {
    const registry = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: "aurora-lookbook",
      approvedDevManifest: themeManifest({ id: "nocturne-elsewhere" }),
      isActive: true,
    });
    expect(registry.resolveWidget("plugin:acme/reviews").ok).toBe(true);
    expect(registry.resolveWidget("theme:nocturne-elsewhere/hero").ok).toBe(
      false,
    );
    expect(registry.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(false);
  });

  it("excludes inactive theme defs", () => {
    const registry = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: "aurora-lookbook",
      approvedDevManifest: themeManifest(),
      isActive: false,
    });
    expect(registry.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(false);
  });

  it("excludes disabled and incompatible installs", () => {
    const registry = buildEditorExtensionRegistry({
      installedPlugins: [
        pluginInstall("paused", { enabled: false }),
        pluginInstall("legacy", { api: "^1.0.0" }),
      ],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    expect(registry.resolveWidget("plugin:paused/reviews").ok).toBe(false);
    expect(registry.resolveWidget("plugin:legacy/reviews").ok).toBe(false);
  });

  it("never throws on hostile input and still serves the static tiers", () => {
    const registry = buildEditorExtensionRegistry(
      null as unknown as Parameters<typeof buildEditorExtensionRegistry>[0],
    );
    expect(() => registry.widgetIds()).not.toThrow();
    expect(registry.widgetIds().length).toBeGreaterThan(0);
  });
});

describe("editor dev-theme binding — present/absent semantics", () => {
  it("completes valid server-projected inputs with the deny-all editor host", async () => {
    const binding = resolveEditorDevThemeBinding(bindingInputs());
    expect(binding).toBeDefined();
    expect(binding?.assetOrigin).toBe("https://assets.example.test");
    expect(binding?.theme).toEqual({
      name: "aurora-lookbook",
      version: "1.0.0",
    });
    // Least-privilege is stricter than the server grant: no scopes, no
    // navigation targets — the server's broader grant never rides along.
    expect(binding?.granted).toEqual([]);
    expect(binding?.navigateAllowlist).toEqual([]);
    await expect(binding!.onCall("theme.cart.add", {})).rejects.toThrow(
      "theme.denied",
    );
  });

  it("the deny-all host refuses every call without side effects", async () => {
    await expect(denyEditorDevThemeCalls()).rejects.toThrow("theme.denied");
  });

  it("yields explicit absent for unprojected or malformed inputs", () => {
    expect(resolveEditorDevThemeBinding(null)).toBeUndefined();
    expect(resolveEditorDevThemeBinding(undefined)).toBeUndefined();
    expect(
      resolveEditorDevThemeBinding(bindingInputs({ assetOrigin: "" })),
    ).toBeUndefined();
    expect(
      resolveEditorDevThemeBinding(bindingInputs({ assetOrigin: 42 })),
    ).toBeUndefined();
    expect(
      resolveEditorDevThemeBinding(bindingInputs({ theme: null })),
    ).toBeUndefined();
    expect(
      resolveEditorDevThemeBinding(
        bindingInputs({ theme: { name: "", version: "1.0.0" } }),
      ),
    ).toBeUndefined();
    expect(
      resolveEditorDevThemeBinding(
        bindingInputs({ theme: { name: "aurora-lookbook" } }),
      ),
    ).toBeUndefined();
    expect(resolveEditorDevThemeBinding({ hostile: true })).toBeUndefined();
  });
});

describe("editor registry — tenant isolation vectors", () => {
  it("never writes tenant defs to the shared singleton", () => {
    const before = widgetIds();
    const registry = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: "aurora-lookbook",
      approvedDevManifest: themeManifest(),
      isActive: true,
    });
    expect(registry.resolveWidget("plugin:acme/reviews").ok).toBe(true);
    expect(registry.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(true);
    expect(widgetIds()).toEqual(before);
    expect(getWidget("plugin:acme/reviews")).toBeUndefined();
    expect(getWidget("theme:aurora-lookbook/hero")).toBeUndefined();
    expect(resolveWidget("plugin:acme/reviews").ok).toBe(false);
    expect(listWidgets().find((d) => d.id === "plugin:acme/reviews")).toBe(
      undefined,
    );
  });

  it("keeps two tenants' registries disjoint", () => {
    const tenantA = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("acme")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    const tenantB = buildEditorExtensionRegistry({
      installedPlugins: [pluginInstall("globex")],
      themeKey: null,
      approvedDevManifest: null,
      isActive: false,
    });
    expect(tenantA.resolveWidget("plugin:acme/reviews").ok).toBe(true);
    expect(tenantA.resolveWidget("plugin:globex/reviews").ok).toBe(false);
    expect(tenantB.resolveWidget("plugin:globex/reviews").ok).toBe(true);
    expect(tenantB.resolveWidget("plugin:acme/reviews").ok).toBe(false);
  });

  it("keeps two tenants' theme defs disjoint", () => {
    const tenantA = buildEditorExtensionRegistry({
      installedPlugins: [],
      themeKey: "aurora-lookbook",
      approvedDevManifest: themeManifest(),
      isActive: true,
    });
    const tenantB = buildEditorExtensionRegistry({
      installedPlugins: [],
      themeKey: "nocturne-elsewhere",
      approvedDevManifest: themeManifest({
        id: "nocturne-elsewhere",
        sections: [{ key: "cover", slot: "main", component: "Cover" }],
      }),
      isActive: true,
    });
    expect(tenantA.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(true);
    expect(tenantA.resolveWidget("theme:nocturne-elsewhere/cover").ok).toBe(
      false,
    );
    expect(tenantB.resolveWidget("theme:nocturne-elsewhere/cover").ok).toBe(
      true,
    );
    expect(tenantB.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(false);
  });
});
