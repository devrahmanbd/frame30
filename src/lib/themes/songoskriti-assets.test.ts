import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Plain .mjs module — imported across runners, so it must stay dependency-free.
import {
  ASSETS,
  BUDGETS,
} from "../../../scripts/songoskriti-assets-manifest.mjs";
import {
  imageInfo,
  sha256,
  fileInfo,
} from "../../../scripts/songoskriti-assets-image.mjs";
import expectation from "../../../scripts/songoskriti-assets-expected.json";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ASSET_DIR = resolve(ROOT, "public/ph/songoskriti");

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

describe("songoskriti asset bytes", () => {
  it("decodes PNG and JPEG geometry from the bytes alone", () => {
    const png = imageInfo(readFileSync(resolve(ASSET_DIR, "cat-women.png")));
    expect(png.format).toBe("png");
    expect(png.width).toBe(1024);
    expect(png.height).toBe(1024);
    const jpeg = imageInfo(
      readFileSync(resolve(ASSET_DIR, "hero-festive.jpg")),
    );
    expect(jpeg.format).toBe("jpeg");
    expect(jpeg.width).toBe(1376);
    expect(jpeg.height).toBe(768);
    const svg = imageInfo(readFileSync(resolve(ASSET_DIR, "logo-lockup.svg")));
    expect(svg.format).toBe("svg");
  });

  it("the expectation matches the shipped bytes exactly", () => {
    expect(expectation.assets).toHaveLength(21);
    for (const rec of expectation.assets) {
      const info = fileInfo(resolve(ASSET_DIR, rec.name));
      expect(info, rec.name).not.toBeNull();
      expect(info?.format).toBe(rec.format);
      expect(info?.width).toBe(rec.width);
      expect(info?.height).toBe(rec.height);
      expect(info?.sha256).toBe(rec.sha256);
    }
  });

  it("the expectation and the manifest name the same set", () => {
    expect(expectation.assets.map((a) => a.name).sort()).toEqual(
      ASSETS.map((a) => a.name).sort(),
    );
  });
});
