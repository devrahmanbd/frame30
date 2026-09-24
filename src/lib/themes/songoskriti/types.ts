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
 * Design intent: the 9 homepage section types from spec §2, in order.
 * Store-first rhythm (merchant order 2026-09-24: a store, not a luxury
 * brand — a reputed shop/franchise): assurance and product rails lead;
 * occasion finder follows the rails; flagship outlets prove the franchise
 * before the craft story; testimonials close below the fold.
 * Every one resolves via `catalogEntry` (the five heritage gap entries
 * landed in Task 2, so no stand-ins remain).
 */
export const HOMEPAGE_SECTION_TYPES = [
  "announcement_bar",
  "hero_carousel",
  "circle_categories",
  "trust_footer",
  "product_rail",
  "finder_row",
  "store_locator",
  "craft_story",
  "testimonials",
] as const;

export type IntendedHomepageType = (typeof HOMEPAGE_SECTION_TYPES)[number];
