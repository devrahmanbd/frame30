/**
 * Re-exported from builder-ast (neutral ground) so theme modules keep
 * their existing import path while the engine shares the same type
 * without importing any theme folder.
 */
export type { SectionBuilder } from "../../builder-ast";

/**
 * Design intent: the homepage main section types from spec §3, in order.
 * Big-catalog discovery rhythm (Biba-scale IA): announcement and hero lead; hero carousel shops three campaigns; visual category tiles
 * and Shop-by-Color carry discovery; Most Loved / Bestsellers rails prove
 * demand; trust strip, story, single testimonial, locator and newsletter
 * close. Every one resolves via `catalogEntry`.
 */
export const HOMEPAGE_SECTION_TYPES = [
  "hero_carousel",
  "circle_categories",
  "product_rail",
  "split_feature",
  "trust_marquee",
  "collection_story",
  "testimonials",
  "store_locator",
  "newsletter",
] as const;

export type IntendedHomepageType = (typeof HOMEPAGE_SECTION_TYPES)[number];
