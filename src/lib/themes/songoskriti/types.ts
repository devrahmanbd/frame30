import type { PropValue, Section, SectionType } from "../../builder-ast";

/**
 * Builder callback the engine supplies (id assignment, validation).
 * Tests pass a trivial `(type, props) => ({ id: type, type, props })` stub.
 */
export type SectionBuilder = (
  type: SectionType,
  props?: Record<string, PropValue>,
) => Section;

/**
 * Design intent: the 8 homepage section types from spec §2, in order.
 * Every one resolves via `catalogEntry` (the five heritage gap entries
 * landed in Task 2, so no stand-ins remain).
 */
export const HOMEPAGE_SECTION_TYPES = [
  "announcement_bar",
  "hero_carousel",
  "circle_categories",
  "finder_row",
  "product_rail",
  "craft_story",
  "testimonials",
  "trust_footer",
] as const;

export type IntendedHomepageType = (typeof HOMEPAGE_SECTION_TYPES)[number];
