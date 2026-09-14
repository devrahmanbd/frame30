/**
 * Phase 3.2 — shared taxonomy registry for inspector props.
 *
 * A `taxonomy` field stores a stable slug, never a label. The inspector shows
 * the admin's language, the storefront shows the shopper's — same stored value.
 */
import { BEAUTY_TAXONOMY } from "./beauty-taxonomy";
import type { Locale } from "./bitext";

export type TaxonomySource = "skinType" | "concern" | "undertone" | "finish" | "brand" | "category";

export type TaxonomyOption = { value: string; en: string; bn: string };

const beauty = (kind: string): TaxonomyOption[] =>
  BEAUTY_TAXONOMY.filter((term) => term.kind === kind).map((term) => ({
    value: term.slug,
    en: term.en,
    bn: term.bn,
  }));

/**
 * Brand and category are merchant data; these are the platform defaults the
 * inspector falls back to when a store has not synced its own list yet.
 */
const BRANDS: TaxonomyOption[] = [
  { value: "house", en: "House brand", bn: "নিজস্ব ব্র্যান্ড" },
  { value: "imported", en: "Imported", bn: "আমদানি" },
  { value: "local", en: "Local", bn: "দেশীয়" },
];

const CATEGORIES: TaxonomyOption[] = [
  { value: "apparel", en: "Apparel", bn: "পোশাক" },
  { value: "electronics", en: "Electronics", bn: "ইলেকট্রনিকস" },
  { value: "beauty", en: "Beauty", bn: "বিউটি" },
  { value: "home", en: "Home", bn: "হোম" },
  { value: "grocery", en: "Grocery", bn: "গ্রোসারি" },
];

export const TAXONOMY_SOURCES: TaxonomySource[] = [
  "skinType",
  "concern",
  "undertone",
  "finish",
  "brand",
  "category",
];

export function taxonomyOptions(source: TaxonomySource): TaxonomyOption[] {
  switch (source) {
    case "skinType":
      return beauty("skin_type");
    case "concern":
      return beauty("concern");
    case "undertone":
      return beauty("undertone");
    case "finish":
      return beauty("finish");
    case "brand":
      return BRANDS;
    case "category":
      return CATEGORIES;
    default:
      return [];
  }
}

/** Bilingual label for a stored slug; unknown slugs echo back untouched. */
export function taxonomyLabel(source: TaxonomySource, value: string, locale: Locale): string {
  const option = taxonomyOptions(source).find((entry) => entry.value === value);
  if (!option) return value;
  return locale === "bn" ? option.bn : option.en;
}

export function isTaxonomyValue(source: TaxonomySource, value: string): boolean {
  return taxonomyOptions(source).some((option) => option.value === value);
}
