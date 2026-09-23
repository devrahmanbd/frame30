import { describe, expect, it } from "vitest";
import { catalogEntry } from "../../builder-ast";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("songoskriti wiring", () => {
  it("locks brand tokens", () => {
    expect(SONGOSKRITI_TOKENS.brand).toBe("#8A3B1F");
    expect(SONGOSKRITI_TOKENS.surface).toBe("#FAF8F5");
  });

  it("declares 8 homepage sections in spec order", () => {
    expect([...HOMEPAGE_SECTION_TYPES]).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "finder_row",
      "product_rail",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
  });

  it("homepage builds 8 sections, every type resolvable in the catalog", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    expect(sections).toHaveLength(8);
    for (const section of sections) {
      expect(
        catalogEntry(section.type),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }
    // Task 2: builders emit the intended names directly — no stand-ins.
    expect(sections.map((n) => n.type)).toEqual([...HOMEPAGE_SECTION_TYPES]);
    for (const retired of [
      "editorial_hero",
      "filter_chips",
      "collection_story",
      "testimonial",
      "trust_bar",
    ]) {
      expect(
        sections.map((n) => n.type),
        `${retired} stand-in must be gone`,
      ).not.toContain(retired);
    }
  });

  it("header and footer build non-empty chrome with catalog types", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const header = buildHeaderMain(s as never);
    const footer = buildFooterMain(s as never);
    expect(header.length).toBeGreaterThan(0);
    expect(footer.length).toBeGreaterThan(0);
    for (const section of [...header, ...footer]) {
      expect(catalogEntry(section.type)).toBeDefined();
    }
  });
});
