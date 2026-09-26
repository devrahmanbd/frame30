/**
 * Manifest validation — mirrors the real gates in
 * `src/lib/plugin-manifest.ts` (`parseManifest`, `PLUGIN_BUDGET`,
 * `SERVER_HOOKS`, `BLOCK_SLOTS`).
 */
import { describe, expect, it } from "vitest";
import {
  BLOCK_SLOTS,
  PLUGIN_BUDGET,
  SERVER_HOOKS,
  parseManifest,
  parsePluginWidgetKey,
} from "../../../src/lib/plugin-manifest";
import manifestJson from "../manifest.json";
import { NAMESPACED_KEY, WIDGET_ENTRY } from "../src/widget";

const manifest = manifestJson as Record<string, unknown>;

describe("starter manifest passes the real gate", () => {
  it("parses clean with no errors", () => {
    const verdict = parseManifest(manifest);
    expect(verdict.ok).toBe(true);
  });

  it("id matches the manifest rule (lowercase, 3-40 chars)", () => {
    expect(manifest["id"]).toMatch(/^[a-z][a-z0-9-]{2,39}$/);
  });

  it("declares a budget inside PLUGIN_BUDGET", () => {
    const verdict = parseManifest(manifest);
    if (!verdict.ok) throw new Error("fixture must parse");
    expect(verdict.manifest.budget.jsKb).toBeLessThanOrEqual(
      PLUGIN_BUDGET.jsKb,
    );
    expect(verdict.manifest.budget.mainThreadMs).toBeLessThanOrEqual(
      PLUGIN_BUDGET.mainThreadMs,
    );
  });

  it("uses only documented block slots", () => {
    const verdict = parseManifest(manifest);
    if (!verdict.ok) throw new Error("fixture must parse");
    for (const w of verdict.manifest.widgets) {
      for (const slot of w.slots) expect(BLOCK_SLOTS).toContain(slot);
    }
  });

  it("uses only documented server hooks over HTTPS", () => {
    const verdict = parseManifest(manifest);
    if (!verdict.ok) throw new Error("fixture must parse");
    for (const hook of verdict.manifest.hooks) {
      expect(SERVER_HOOKS as readonly string[]).toContain(hook);
    }
    expect(verdict.manifest.hooksUrl).toMatch(/^https:\/\//);
  });

  it("ships the widget entry byte-for-byte with src/widget.ts", () => {
    const verdict = parseManifest(manifest);
    if (!verdict.ok) throw new Error("fixture must parse");
    expect(verdict.manifest.widgets[0]?.entry).toBe(WIDGET_ENTRY);
    expect(verdict.manifest.widgets[0]?.key).toBe("greeting");
  });

  it("namespaced key round-trips through the platform parser", () => {
    expect(parsePluginWidgetKey(NAMESPACED_KEY)).toEqual({
      pluginId: "starter-hello",
      widget: "greeting",
    });
  });
});

describe("starter manifest rejections mirror the real errors", () => {
  it("rejects a bad id", () => {
    const verdict = parseManifest({ ...manifest, id: "Bad_Id!" });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("id");
  });

  it("rejects an over-budget manifest", () => {
    const verdict = parseManifest({
      ...manifest,
      budget: { jsKb: PLUGIN_BUDGET.jsKb + 1, mainThreadMs: 10 },
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("budget.jsKb");
  });

  it("rejects an undocumented slot", () => {
    const verdict = parseManifest({
      ...manifest,
      widgets: [
        {
          key: "greeting",
          label: "Hello greeting",
          slots: ["sidebar"],
          entry: WIDGET_ENTRY,
        },
      ],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].slots");
  });

  it("rejects an invented hook", () => {
    const verdict = parseManifest({
      ...manifest,
      hooks: ["order.created", "server.exec"],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("hooks:server.exec");
  });

  it("rejects a non-HTTPS hooksUrl", () => {
    const verdict = parseManifest({
      ...manifest,
      hooksUrl: "http://example.com/framique-hooks",
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("hooksUrl");
  });

  it("rejects widgets without the render_storefront scope", () => {
    const verdict = parseManifest({
      ...manifest,
      permissions: ["read_shop"],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("permissions.render_storefront_required");
  });

  it("rejects dynamic code in the entry", () => {
    const verdict = parseManifest({
      ...manifest,
      widgets: [
        {
          key: "greeting",
          label: "Hello greeting",
          slots: ["main"],
          entry: "eval('steal')",
        },
      ],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].entry.dynamic_code");
  });
});
