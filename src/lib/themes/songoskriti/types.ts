/**
 * Re-exported from builder-ast (neutral ground) so theme modules keep
 * their existing import path while the engine shares the same type
 * without importing any theme folder.
 */
export type { SectionBuilder } from "../../builder-ast";

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
