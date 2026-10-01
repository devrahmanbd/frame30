/**
 * Re-exported from builder-ast (neutral ground) so theme modules keep
 * their existing import path while the engine shares the same type
 * without importing any theme folder.
 */
export type { SectionBuilder } from "../../builder-ast";

/**
 * Design intent: the 14 homepage section types from spec §3, in order.
 * Maroon studied-DNA rhythm: hero carousel (4 photographic slides) leads;
 * visual category tiles and Shop-by-Color carry discovery; Most Loved /
 * Recommended rails prove demand; maroon campaign split, trust marquee,
 * editorial story, single testimonial, locator and newsletter close.
 * Header/footer chrome types (announcement_bar, footer_sitemap,
 * payment_icons) tail the list for the chrome builders. Every one
 * resolves via `catalogEntry`.
 */
export const HOMEPAGE_V2_SECTION_TYPES = [
  "hero_carousel",
  "circle_categories",
  "product_rail",
  "split_feature",
  "product_rail",
  "circle_categories",
  "trust_marquee",
  "collection_story",
  "testimonials",
  "store_locator",
  "newsletter",
  "announcement_bar",
  "footer_sitemap",
  "payment_icons",
] as const;

export type IntendedHomepageV2Type = (typeof HOMEPAGE_V2_SECTION_TYPES)[number];
