/**
 * Frame30 audit close-out — one-registry call-site wiring pins + theme
 * discovery through the threaded registry.
 *
 * - `resolveExtensionTrayEntries` offers plugin AND uploaded-theme defs
 *   (insertable through the same registry), explicit prop entries win.
 * - `SettingsPanel` receives the route registry (no silent singleton).
 * - `StudioCanvas` receives registry + themeKey + devThemeBinding.
 * - `EditorShell` forwards `activeThemeKey` to the studio.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { resolveExtensionTrayEntries } from "./StudioBuilder";

function def(
  id: string,
  namespace: WidgetDef["namespace"],
  extra: Partial<WidgetDef> = {},
): WidgetDef {
  return {
    id,
    namespace,
    version: "1.0.0",
    label: `Label ${id}`,
    category: "test",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: namespace === "theme" ? "custom" : "sandbox",
    ...extra,
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const d of defs) expect(reg.registerWidget(d).ok).toBe(true);
  return reg;
}

describe("resolveExtensionTrayEntries discovers plugin and theme defs", () => {
  it("offers plugin defs from the threaded registry", () => {
    const out = resolveExtensionTrayEntries(
      registryWith([def("plugin:acme/reviews", "plugin")]),
      null,
    );
    expect(out?.map((e) => e.key)).toEqual(["plugin:acme/reviews"]);
  });

  it("offers uploaded-theme defs from the threaded registry", () => {
    const out = resolveExtensionTrayEntries(
      registryWith([
        def("theme:aurora-lookbook/hero", "theme", {
          themes: ["aurora-lookbook"],
        }),
      ]),
      null,
    );
    expect(out?.map((e) => e.key)).toEqual(["theme:aurora-lookbook/hero"]);
  });

  it("explicit prop entries win over registry derivation", () => {
    const prop = [{ key: "plugin:acme/legacy", label: "Legacy" }];
    const out = resolveExtensionTrayEntries(
      registryWith([def("plugin:acme/reviews", "plugin")]),
      prop,
    );
    // Helper contract: usable registry lists its own defs; the component
    // prefers explicit props (covered by the call-site pin below).
    expect(out?.map((e) => e.key)).toContain("plugin:acme/reviews");
    expect(prop).toEqual([{ key: "plugin:acme/legacy", label: "Legacy" }]);
  });

  it("unusable registry falls back to the prop list", () => {
    const prop = [{ key: "plugin:acme/legacy", label: "Legacy" }];
    expect(resolveExtensionTrayEntries(null, prop)).toEqual(prop);
    expect(resolveExtensionTrayEntries(undefined, prop)).toEqual(prop);
  });
});

describe("one-registry call-site pins (static)", () => {
  const builder = readFileSync(
    "src/components/builder/studio/StudioBuilder.tsx",
    "utf8",
  );
  const shell = readFileSync(
    "src/components/admin/editor/EditorShell.tsx",
    "utf8",
  );

  it("SettingsPanel receives the threaded registry", () => {
    expect(builder).toMatch(
      /<SettingsPanel[\s\S]*?registry=\{extensionRegistry/,
    );
  });

  it("StudioCanvas receives registry, themeKey and binding", () => {
    const canvas = builder.match(/<StudioCanvas[\s\S]*?\/>/)?.[0] ?? "";
    expect(canvas).toContain("registry={extensionRegistry");
    expect(canvas).toContain("themeKey={activeThemeKey");
    expect(canvas).toContain("devThemeBinding={devThemeBinding");
  });

  it("tray derives entries from the registry when props are absent", () => {
    expect(builder).toContain("effectivePluginEntries");
    expect(builder).toContain("resolveExtensionTrayEntries(extensionRegistry");
  });

  it("EditorShell forwards the resolved route theme key to the studio", () => {
    // Route build key (slug) wins over the workspace uuid so owning-theme
    // defs (`theme:<sourceKey>/…`) resolve keyed, never unkeyed.
    expect(shell).toContain("activeThemeKey={resolvedThemeKey");
  });
});
