import { describe, expect, it } from "vitest";
import { catalogEntry } from "../../builder-ast";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { SONGOSKRITI_TOKENS } from "./tokens";
import {
  HOMEPAGE_SECTION_TYPES,
  MISSING_TYPES,
  STAND_IN_MAP,
} from "./types";

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
    // Stand-ins resolve 1:1 with the intended order until Task 2 lands.
    expect(sections.map((n) => n.type)).toEqual(
      HOMEPAGE_SECTION_TYPES.map((t) => STAND_IN_MAP[t] ?? t),
    );
  });

  it("reports the 5 missing catalog types as Task 2 input", () => {
    expect([...MISSING_TYPES]).toEqual([
      "hero_carousel",
      "finder_row",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
    for (const missing of MISSING_TYPES) {
      expect(
        catalogEntry(missing as never),
        `${missing} must stay missing until Task 2`,
      ).toBeUndefined();
      const standIn = STAND_IN_MAP[missing];
      expect(standIn, `${missing} needs a stand-in`).toBeDefined();
      expect(catalogEntry(standIn)).toBeDefined();
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
