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
      "trust_bar",
      "department_grid",
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
    const dept = preset.templates.index.main.find(
      (s) => s.type === "department_grid",
    )!;
    expect(
      (dept.props["departments"] as unknown[]).length,
    ).toBeGreaterThanOrEqual(8);
    const textile = preset.templates.index.main.find(
      (s) => s.type === "textile_showcase",
    )!;
    expect(
      ((textile.props["items"] ?? textile.props["products"]) as unknown[])
        .length,
    ).toBeGreaterThanOrEqual(4);
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
