import type { PropValue, Section } from "../../builder-ast";

/**
 * Builder callback the engine supplies (id assignment, validation).
 *
 * Kept catalog-loose on purpose: the five Somvabona widget keys
 * (`trust_marquee`, `price_buckets`, `occasion_matrix`, `urgency_rail`,
 * `rating_stars`) land in the `SectionType` union with the Batch 2 catalog
 * entries, and this alias widens to the shared `SectionBuilder` then. Until
 * that batch, blueprints typecheck without touching the closed renderer and
 * help records. Call sites holding a `SectionType`-narrow builder pass it
 * through an `as never` adapter (same convention as the theme tests).
 */
export type SomvabonaBuilder = (
  type: string,
  props?: Record<string, PropValue>,
) => Section;

/**
 * Design intent: the 10 homepage section types from spec §2, in order.
 * Everyday-ethnic franchise retail: offer marquee, shoppable hero, proof
 * strip, category tiles, price buckets, TWO urgency rails, occasion matrix,
 * flagship outlets (franchise proof), craft story below the fold, then
 * testimonials. Prices, ratings, dispatch promises and store presence lead;
 * craft storytelling closes.
 */
export const HOMEPAGE_SECTION_TYPES = [
  "announcement_bar",
  "hero_carousel",
  "trust_marquee",
  "circle_categories",
  "price_buckets",
  "urgency_rail",
  "occasion_matrix",
  "store_locator",
  "craft_story",
  "testimonials",
] as const;

export type SomvabonaHomepageType = (typeof HOMEPAGE_SECTION_TYPES)[number];
