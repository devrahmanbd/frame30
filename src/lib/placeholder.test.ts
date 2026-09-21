/**
 * Local SVG product placeholder — TDD: determinism, safety, content-type.
 *
 * Replaces hotlinked Unsplash demo imagery: every imageless product renders
 * a brand-toned monogram SVG served from `/api/public/ph/<seed>`.
 */
import { describe, expect, it } from "vitest";
import { placeholderSvg, placeholderSeed } from "./placeholder";

describe("placeholderSvg", () => {
  it("is deterministic per seed", () => {
    expect(placeholderSvg("jamdani-saree")).toBe(
      placeholderSvg("jamdani-saree"),
    );
    expect(placeholderSvg("jamdani-saree")).not.toBe(placeholderSvg("panjabi"));
  });

  it("emits cacheable SVG with the product initial and no scripts", () => {
    const svg = placeholderSvg("Tangail Taant Saree");
    expect(svg).toContain("<svg");
    expect(svg).toContain(">T<");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("onload");
  });

  it("keeps the monogram compact so wide crops never blow it full-bleed", () => {
    const svg = placeholderSvg("Woven with patience");
    expect(svg).not.toMatch(/font-size="([2-9]\d\d|[1-9]\d{3,})/);
    expect(svg).toContain("<pattern");
  });

  it("sanitizes hostile seeds", () => {
    const svg = placeholderSvg('../../etc/passwd"><script>alert(1)</script>');
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("../");
    expect(svg).toContain("<svg");
  });

  it("derives a stable slug seed", () => {
    expect(placeholderSeed("  Jamdani Saree! ")).toBe("jamdani-saree");
    expect(placeholderSeed("")).toBe("product");
  });
});
