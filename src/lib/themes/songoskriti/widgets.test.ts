/**
 * Task 2 audit: every homepage section type (spec §2 rhythm) must resolve
 * via `catalogEntry` (storefront renderer lookup) and `WIDGET_BY_KEY`
 * (studio panel). RED until the five gap entries land in both catalogs.
 */
import { describe, expect, it } from "vitest";
import { catalogEntry, type SectionType } from "../../builder-ast";
import { WIDGET_BY_KEY } from "../../studio/catalog";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("songoskriti widget gap audit", () => {
  for (const type of HOMEPAGE_SECTION_TYPES) {
    const key = type as SectionType;
    it(`${type} resolves in the builder catalog`, () => {
      expect(catalogEntry(key)).toBeDefined();
    });
    it(`${type} resolves in the studio catalog`, () => {
      expect(WIDGET_BY_KEY[type]).toBeDefined();
    });
  }
});
