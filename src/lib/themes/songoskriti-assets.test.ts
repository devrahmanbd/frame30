import { describe, expect, it } from "vitest";
// Plain .mjs module — imported across runners, so it must stay dependency-free.
import {
  ASSETS,
  BUDGETS,
} from "../../../scripts/songoskriti-assets-manifest.mjs";

describe("songoskriti asset manifest", () => {
  it("declares 21 unique theme assets with a valid format and extension", () => {
    expect(ASSETS).toHaveLength(21);
    const names = ASSETS.map((a) => a.name);
    expect(new Set(names).size).toBe(21);
    for (const a of ASSETS) {
      const ext = a.name.slice(a.name.lastIndexOf(".") + 1);
      const expected = ext === "jpg" ? "jpeg" : ext;
      expect(a.format).toBe(expected);
      expect(a.name).toMatch(/^[a-z0-9-]+\.(png|jpg|svg)$/);
    }
  });
  it("gives every generated asset a prompt and every raster a floor", () => {
    for (const a of ASSETS) {
      if (a.format === "svg") {
        expect(a.minWidth).toBeNull();
        expect(a.minHeight).toBeNull();
        expect(a.generated).toBe(false);
        continue;
      }
      expect(a.minWidth).toBeGreaterThan(0);
      expect(a.minHeight).toBeGreaterThan(0);
      expect(a.generated).toBe(true);
      expect(a.prompt && a.prompt.length).toBeGreaterThan(20);
      expect(a.aspect).toMatch(/^\d+:\d+$/);
    }
  });
  it("pins the size budgets", () => {
    expect(BUDGETS.maxFileBytes).toBe(3_000_000);
    expect(BUDGETS.maxTotalBytes).toBe(28_000_000);
    expect(BUDGETS.maxBytesPerPixel.png).toBe(2);
    expect(BUDGETS.maxBytesPerPixel.jpeg).toBe(1);
  });
});
