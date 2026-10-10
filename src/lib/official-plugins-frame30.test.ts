/**
 * Frame30 §4 — official plugins stay source-registered.
 *
 * The three official plugins resolve from in-repo source
 * (`officialPluginSource` manif­ests); custom merchant ZIPs keep the
 * `installPackage` pipeline exclusively. Built-in status never bypasses
 * tenant authorization (all mutation fns carry `plugins.update`).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import {
  OFFICIAL_PLUGIN_KEYS,
  getOfficialPlugin,
  isOfficialPluginKey,
} from "./official-plugins";

describe("frame30 official plugins source-registered", () => {
  it("names exactly the three official keys", () => {
    expect([...OFFICIAL_PLUGIN_KEYS]).toEqual([
      "product-reviews",
      "store-analytics",
      "whatsapp-chat",
    ]);
  });
  it("every official key resolves to a source manifest (no bytes built)", () => {
    for (const key of OFFICIAL_PLUGIN_KEYS) {
      const entry = getOfficialPlugin(key)!;
      expect(entry.key).toBe(key);
      expect(entry.manifest).toMatchObject({ id: key });
      expect(entry).not.toHaveProperty("bytes");
      expect(isOfficialPluginKey(key)).toBe(true);
    }
  });
  it("anything else is never official", () => {
    expect(getOfficialPlugin("vapor")).toBeNull();
    expect(getOfficialPlugin("whatsapp-chat-extra")).toBeNull();
    expect(isOfficialPluginKey("loyalty-lite")).toBe(false);
  });
  it("plugin mutations stay behind tenant authorization", () => {
    const src = fs.readFileSync(
      "/opt/frame28/src/lib/plugins.functions.ts",
      "utf8",
    );
    for (const fn of [
      "pluginInstallFn",
      "pluginToggleFn",
      "pluginUninstallFn",
      "pluginSettingsSaveFn",
    ]) {
      expect(src).toContain(fn);
    }
    expect(src).toContain('requirePermission("plugins.update")');
  });
});
