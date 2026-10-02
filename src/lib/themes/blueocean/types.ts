export type { SectionBuilder } from "../../builder-ast";

export const HOMEPAGE_BLUEOCEAN_SECTION_TYPES = [
  "hero_carousel",
  "circle_categories",
  "product_rail",
  "split_feature",
  "product_rail",
  "circle_categories",
  "collection_grid",
  "trust_marquee",
  "collection_story",
  "testimonials",
  "store_locator",
  "newsletter",
] as const;

export type IntendedHomepageBlueoceanType =
  (typeof HOMEPAGE_BLUEOCEAN_SECTION_TYPES)[number];
