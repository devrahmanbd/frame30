/**
 * Theme preview demo data — TDD: every collected request resolves rows so
 * data widgets never skeleton-spin in preview.
 */
import { describe, expect, it } from "vitest";
import { collectWidgetRequests } from "./widget-data";
import { previewDemoMap } from "./preview-demo-data";
import { BLUEPRINT_PRESETS } from "./theme-blueprints";

describe("previewDemoMap (bazaar)", () => {
  const preset = BLUEPRINT_PRESETS.find((p) => p.key === "bazaar")!;
  const bundle = collectWidgetRequests(preset.templates.index);

  it("resolves rows for every collected request", () => {
    const map = previewDemoMap(bundle, "bazaar");
    for (const req of bundle.requests) {
      expect(map[req.key]?.length ?? 0, req.key).toBeGreaterThan(0);
    }
  });

  it("rows link into the store with priced BDT products and images", () => {
    const map = previewDemoMap(bundle, "bazaar");
    const rows = Object.values(map).flat();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows.slice(0, 20)) {
      expect(row.title).toBeTruthy();
      expect(row.href ?? "").toMatch(/^\/(p|c|search)/);
      // Collection rows (taxonomy) carry no price — only products do.
      if ((row.href ?? "").startsWith("/p/")) {
        expect(row.priceMinor ?? 0).toBeGreaterThan(0);
        expect(row.imageUrl ?? "").toContain("/api/public/ph/");
      }
    }
  });

  it("taxonomy requests resolve to collections, not products", () => {
    const map = previewDemoMap(
      { requests: [{ key: "k", source: "taxonomy", params: { limit: 6 } }], byNode: {} },
      "clothing-heritage",
    );
    const rows = map["k"] ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.href ?? "").toMatch(/^\/c\//);
    }
  });

  it("falls back to a catalog for unknown theme keys", () => {
    const map = previewDemoMap(bundle, "no-such-theme");
    expect(Object.values(map).flat().length).toBeGreaterThan(0);
  });
});
