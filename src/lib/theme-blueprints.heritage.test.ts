/**
 * clothing-heritage aarong parity — TDD: complete homepage, no empty contracts.
 */
import { describe, expect, it } from "vitest";
import { BLUEPRINT_PRESETS } from "./theme-blueprints";

describe("clothing-heritage aarong parity", () => {
  const preset = BLUEPRINT_PRESETS.find((p) => p.key === "clothing-heritage")!;

  it("homepage has no empty contract sections", () => {
    const types = preset.templates.index.main.map((s) => s.type);
    for (const need of [
      "hero_carousel",
      "circle_categories",
      "trust_bar",
      "product_rail",
      "collection_story",
      "lookbook",
      "textile_showcase",
      "wedding_shop",
      "gift_finder",
      "heritage_story",
      "editorial_banner",
      "testimonial_carousel",
      "rewards_club",
      "subbrand_spotlight",
      "marquee_strip",
    ]) {
      expect(types, need).toContain(need);
    }
    expect(types).not.toContain("department_grid");
    const circle = preset.templates.index.main.find(
      (s) => s.type === "circle_categories",
    )!;
    const tiles = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      title: String(circle.props[`c${n}Title`] ?? ""),
      href: String(circle.props[`c${n}Href`] ?? ""),
    }));
    expect(tiles.filter((t) => t.title && t.href)).toHaveLength(8);
    const textile = preset.templates.index.main.find(
      (s) => s.type === "textile_showcase",
    )!;
    expect(
      ((textile.props["items"] ?? textile.props["products"]) as unknown[])
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("rails use standard cards and sections breathe", () => {
    const rails = preset.templates.index.main.filter(
      (s) => s.type === "product_rail",
    );
    expect(rails.length).toBeGreaterThan(0);
    for (const rail of rails) {
      expect(rail.props["cardVariant"]).toBe("standard");
    }
    const airy = preset.templates.index.main.filter(
      (s) => Number(s.props["advPadY"] ?? 0) >= 40,
    ).length;
    expect(airy).toBeGreaterThanOrEqual(10);
  });

  it("brand is warm, not hard black, with AA contrast", () => {
    const hex = String(preset.tokens.brand ?? "");
    expect(hex.toLowerCase()).not.toBe("#1a1a1a");
    const lum = (c: string): number => {
      const v = [1, 3, 5].map((i) => {
        const s = parseInt(c.slice(i, i + 2), 16) / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
    };
    const l = lum(hex);
    const ratio = 1.05 / (l + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
  it("header has no duplicate language toggle", () => {
    const util = preset.templates.index.header.find(
      (s) => s.type === "utility_bar",
    )!;
    expect(util.props["showLanguage"]).toBe(false);
  });

  it("footer payment marks are comma-separated", () => {
    const pay = preset.templates.index.footer.find(
      (s) => s.type === "payment_icons",
    )!;
    expect(String(pay.props["marks"])).toContain(",");
  });
});
