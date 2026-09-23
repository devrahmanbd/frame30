import type {
  PropValue,
  Section,
  SectionType,
} from "../../builder-ast";

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
 * Five of these have no catalog entry yet (see MISSING_TYPES); the
 * builders below emit temporary stand-ins (see STAND_IN_MAP) until
 * Task 2 lands the real entries. At that point the builders switch to
 * the intended types with no test-shape change.
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

export type IntendedHomepageType =
  (typeof HOMEPAGE_SECTION_TYPES)[number];

/**
 * Intended types with NO entry in `catalogEntry` yet. Task 2 input:
 * append catalog entries for exactly these five names.
 */
export const MISSING_TYPES: readonly string[] = [
  "hero_carousel",
  "finder_row",
  "craft_story",
  "testimonials",
  "trust_footer",
];

/**
 * Closest existing catalog type for each missing intended type.
 * Temporary only — Task 2 replaces each stand-in with the real entry.
 * - hero_carousel -> editorial_hero (brand hero with copy + image)
 * - finder_row -> filter_chips (guided occasion filtering entry)
 * - craft_story -> collection_story (brand/craft storytelling)
 * - testimonials -> testimonial (single-quote unit; one per section keeps
 *   the "one voice per block" rhythm until the carousel entry lands)
 * - trust_footer -> trust_bar (delivery/returns/payment assurances)
 */
export const STAND_IN_MAP: Record<string, SectionType> = {
  announcement_bar: "announcement_bar",
  hero_carousel: "editorial_hero",
  circle_categories: "circle_categories",
  finder_row: "filter_chips",
  product_rail: "product_rail",
  craft_story: "collection_story",
  testimonials: "testimonial",
  trust_footer: "trust_bar",
};
