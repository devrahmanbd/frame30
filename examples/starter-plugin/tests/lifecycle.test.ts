/**
 * Lifecycle — mirrors the real resolution and consent gates in
 * `src/lib/plugin-manifest.ts` (`resolvePluginWidget`, `pluginTrayEntries`,
 * `permissionDiff`). Suspend/resume, the kill switch, and uninstall all fold
 * into the `enabled` flag and the installed list, so every lifecycle state
 * below is asserted through the same two functions the tray, canvas, and
 * storefront use.
 */
import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  parseManifest,
  parsePluginWidgetKey,
  permissionDiff,
  pluginTrayEntries,
  resolvePluginWidget,
  type InstalledPlugin,
} from "../../../src/lib/plugin-manifest";
import manifestJson from "../manifest.json";
import { NAMESPACED_KEY } from "../src/widget";

function installed(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  const verdict = parseManifest(manifestJson);
  if (!verdict.ok) throw new Error(verdict.errors.join(","));
  return {
    installId: "install-starter",
    manifest: verdict.manifest,
    grantedScopes: verdict.manifest.permissions,
    settings: defaultSettings(verdict.manifest.settings),
    enabled: true,
    ...overrides,
  };
}

describe("starter lifecycle through the shared resolver", () => {
  it("install: the namespaced widget key resolves", () => {
    expect(parsePluginWidgetKey(NAMESPACED_KEY)).toEqual({
      pluginId: "starter-hello",
      widget: "greeting",
    });
    const res = resolvePluginWidget(NAMESPACED_KEY, [installed()]);
    expect(res.ok).toBe(true);
  });

  it("consent: the grant is a subset of the manifest permissions", () => {
    const plugin = installed();
    for (const scope of plugin.grantedScopes) {
      expect(plugin.manifest.permissions).toContain(scope);
    }
  });

  it("consent: widening permissions on update requires a fresh screen", () => {
    const diff = permissionDiff(["read_shop"], ["read_shop", "read_customers"]);
    expect(diff.added).toEqual(["read_customers"]);
    expect(diff.requiresConsent).toBe(true);
  });

  it("disable (merchant pause, suspend, or kill switch): resolves to disabled", () => {
    const res = resolvePluginWidget(NAMESPACED_KEY, [
      installed({ enabled: false }),
    ]);
    expect(res).toEqual({
      ok: false,
      reason: "disabled",
      pluginId: "starter-hello",
    });
  });

  it("incompatible builder API: resolves to incompatible, never a crash", () => {
    const plugin = installed();
    const res = resolvePluginWidget(NAMESPACED_KEY, [
      { ...plugin, manifest: { ...plugin.manifest, api: "^2.0.0" } },
    ]);
    expect(res).toEqual({
      ok: false,
      reason: "incompatible",
      pluginId: "starter-hello",
    });
  });

  it("unknown widget and unknown plugin fail with labels", () => {
    expect(
      resolvePluginWidget("plugin:starter-hello/ghost", [installed()]),
    ).toEqual({
      ok: false,
      reason: "unknown_widget",
      pluginId: "starter-hello",
    });
    expect(
      resolvePluginWidget("plugin:ghost-app/greeting", [installed()]),
    ).toEqual({
      ok: false,
      reason: "not_installed",
      pluginId: "ghost-app",
    });
    expect(resolvePluginWidget("greeting", [installed()])).toEqual({
      ok: false,
      reason: "bad_key",
    });
  });

  it("uninstall (purge deletes the row): the key stops resolving", () => {
    expect(resolvePluginWidget(NAMESPACED_KEY, [])).toEqual({
      ok: false,
      reason: "not_installed",
      pluginId: "starter-hello",
    });
  });
});

describe("starter tray entries", () => {
  it("lists the widget for its declared slot", () => {
    expect(pluginTrayEntries([installed()], "main")).toEqual([
      {
        key: NAMESPACED_KEY,
        label: "Hello greeting",
        pluginName: "Starter Hello",
      },
    ]);
    expect(pluginTrayEntries([installed()], "footer")).toEqual([]);
  });

  it("hides disabled plugins from every slot", () => {
    const off = installed({ enabled: false });
    expect(pluginTrayEntries([off], "main")).toEqual([]);
  });
});
