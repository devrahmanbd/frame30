/**
 * Elements panel Plugins group — extension-update affordance (TDD).
 *
 * Audit finding: `resolvePluginWidget` reasons plus the `version_pin` /
 * `auto_updates` install state never surface in the builder, so merchants
 * cannot tell a disabled plugin from an incompatible one or reach the
 * update/enable flows. The fix is display-only (no pipeline changes):
 * entries may carry the resolve reason, pin, auto-updates flag and
 * Update/Enable deep-links; entries without them render exactly as before
 * (`pluginEntryStatus` returns null → legacy button path).
 */
import { describe, expect, it } from "vitest";
import { pluginEntryStatus } from "./StudioBuilder";

describe("pluginEntryStatus", () => {
  it("returns null for legacy entries (tray renders byte-identically)", () => {
    expect(
      pluginEntryStatus({ key: "plugin:acme/reviews", label: "Reviews" }),
    ).toBeNull();
    expect(
      pluginEntryStatus({
        key: "plugin:acme/reviews",
        label: "Reviews",
        pluginName: "Acme",
      }),
    ).toBeNull();
  });

  it("maps every resolvePluginWidget reason to merchant copy", () => {
    const reasons = [
      "bad_key",
      "not_installed",
      "unknown_widget",
      "incompatible",
      "disabled",
    ] as const;
    for (const resolveReason of reasons) {
      const status = pluginEntryStatus({
        key: "k",
        label: "L",
        resolveReason,
      });
      expect(status?.reasonLabel, resolveReason).toBeTruthy();
    }
    expect(
      pluginEntryStatus({ key: "k", label: "L", resolveReason: "disabled" })
        ?.reasonLabel,
    ).toMatch(/enable/i);
    expect(
      pluginEntryStatus({
        key: "k",
        label: "L",
        resolveReason: "incompatible",
      })?.reasonLabel,
    ).toMatch(/update/i);
  });

  it("falls back to a safe label on hostile reasons", () => {
    const status = pluginEntryStatus({
      key: "k",
      label: "L",
      resolveReason: "bogus" as never,
    });
    expect(status?.reasonLabel).toBeTruthy();
  });

  it("surfaces version_pin as a pinned-version label", () => {
    expect(
      pluginEntryStatus({ key: "k", label: "L", versionPin: "1.2.3" })
        ?.pinLabel,
    ).toMatch(/1\.2\.3/);
    expect(
      pluginEntryStatus({ key: "k", label: "L", versionPin: "  " })?.pinLabel ??
        null,
    ).toBeNull();
    expect(
      pluginEntryStatus({ key: "k", label: "L", versionPin: null })?.pinLabel ??
        null,
    ).toBeNull();
  });

  it("surfaces auto_updates state without owning the toggle", () => {
    expect(
      pluginEntryStatus({ key: "k", label: "L", autoUpdates: true })?.autoLabel,
    ).toMatch(/on/i);
    expect(
      pluginEntryStatus({ key: "k", label: "L", autoUpdates: false })
        ?.autoLabel,
    ).toMatch(/off/i);
    expect(
      pluginEntryStatus({ key: "k", label: "L" })?.autoLabel ?? null,
    ).toBeNull();
  });

  it("keeps Update/Enable deep-links only when an href is provided", () => {
    const status = pluginEntryStatus({
      key: "k",
      label: "L",
      resolveReason: "disabled",
      updateHref: "/plugins/acme/update",
      enableHref: "/plugins/acme/enable",
    });
    expect(status?.updateHref).toBe("/plugins/acme/update");
    expect(status?.enableHref).toBe("/plugins/acme/enable");
    const bare = pluginEntryStatus({
      key: "k",
      label: "L",
      resolveReason: "disabled",
    });
    expect(bare?.updateHref).toBeNull();
    expect(bare?.enableHref).toBeNull();
  });
});
