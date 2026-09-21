/**
 * Theme preview demo data — TDD: every collected request resolves rows so
 * data widgets never skeleton-spin in preview.
 */
import { describe, expect, it } from "vitest";
import { collectWidgetRequests } from "./widget-data";
import { previewDemoMap } from "./preview-demo-data";
import { BLUEPRINT_PRESETS } from "./theme-blueprints";

describe("previewDemoMap (clothing-heritage)", () => {
  const preset = BLUEPRINT_PRESETS.find((p) => p.key === "clothing-heritage")!;
  const bundle = collectWidgetRequests(preset.templates.index);

  it("resolves rows for every collected request", () => {
    const map = previewDemoMap(bundle, "clothing-heritage");
    for (const req of bundle.requests) {
      expect(map[req.key]?.length ?? 0, req.key).toBeGreaterThan(0);
    }
  });

  it("rows link into the store with priced BDT products and images", () => {
    const map = previewDemoMap(bundle, "clothing-heritage");
    const rows = Object.values(map).flat();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows.slice(0, 20)) {
      expect(row.title).toBeTruthy();
      expect(row.href ?? "").toMatch(/^\/(p|c|search)/);
      expect(row.priceMinor ?? 0).toBeGreaterThan(0);
      expect(row.imageUrl ?? "").toContain("/api/public/ph/");
    }
  });

  it("falls back to a catalog for unknown theme keys", () => {
    const map = previewDemoMap(bundle, "no-such-theme");
    expect(Object.values(map).flat().length).toBeGreaterThan(0);
  });
});
