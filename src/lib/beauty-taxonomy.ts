/**
 * Phase 2.8 — beauty taxonomy.
 *
 * Skin type, concern and undertone are *terms*, not free text. Filters, the
 * quizzes and the PDP chips all read this one table, so a shopper who answers
 * "তৈলাক্ত" in the quiz lands on the same facet a merchant tagged the product
 * with. Every term carries both labels: Bangla beauty vocabulary is
 * first-class here, not a translation afterthought.
 */
import type { Locale } from "./bitext";

export type TaxonomyKind = "skin_type" | "concern" | "undertone" | "finish";

export type TaxonomyTerm = {
  /** Stable slug used in URLs and product tags. Never localised. */
  slug: string;
  kind: TaxonomyKind;
  en: string;
  bn: string;
};

export const BEAUTY_TAXONOMY: TaxonomyTerm[] = [
  { slug: "dry", kind: "skin_type", en: "Dry", bn: "শুষ্ক" },
  { slug: "oily", kind: "skin_type", en: "Oily", bn: "তৈলাক্ত" },
  { slug: "combination", kind: "skin_type", en: "Combination", bn: "মিশ্র" },
  { slug: "sensitive", kind: "skin_type", en: "Sensitive", bn: "সংবেদনশীল" },
  { slug: "normal", kind: "skin_type", en: "Normal", bn: "স্বাভাবিক" },

  { slug: "acne", kind: "concern", en: "Acne", bn: "ব্রণ" },
  { slug: "dark-spots", kind: "concern", en: "Dark spots", bn: "দাগ" },
  { slug: "ageing", kind: "concern", en: "Fine lines", bn: "বয়সের ছাপ" },
  { slug: "dullness", kind: "concern", en: "Dullness", bn: "নিস্তেজ ত্বক" },
  { slug: "dryness", kind: "concern", en: "Dryness", bn: "শুষ্কতা" },
  { slug: "pores", kind: "concern", en: "Large pores", bn: "বড় লোমকূপ" },

  { slug: "warm", kind: "undertone", en: "Warm", bn: "উষ্ণ" },
  { slug: "neutral", kind: "undertone", en: "Neutral", bn: "নিরপেক্ষ" },
  { slug: "cool", kind: "undertone", en: "Cool", bn: "শীতল" },

  { slug: "matte", kind: "finish", en: "Matte", bn: "ম্যাট" },
  { slug: "dewy", kind: "finish", en: "Dewy", bn: "ডিউয়ি" },
  { slug: "satin", kind: "finish", en: "Satin", bn: "স্যাটিন" },
];

export function termsOf(kind: TaxonomyKind): TaxonomyTerm[] {
  return BEAUTY_TAXONOMY.filter((term) => term.kind === kind);
}

export function findTerm(slug: string): TaxonomyTerm | null {
  return BEAUTY_TAXONOMY.find((term) => term.slug === slug) ?? null;
}

/** Bilingual label for a term slug; unknown slugs echo back untouched. */
export function termLabel(slug: string, locale: Locale): string {
  const term = findTerm(slug);
  if (!term) return slug;
  return locale === "bn" ? term.bn : term.en;
}

/** Parses a comma-separated authored list into known terms, order preserved. */
export function parseTerms(value: string, kind?: TaxonomyKind): TaxonomyTerm[] {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((slug) => findTerm(slug))
    .filter((term): term is TaxonomyTerm => !!term && (!kind || term.kind === kind));
}

/** The depth ladder a shade finder walks. Slugs stay stable across locales. */
export const SHADE_DEPTHS = [
  { slug: "fair", en: "Fair", bn: "ফর্সা" },
  { slug: "light", en: "Light", bn: "হালকা" },
  { slug: "medium", en: "Medium", bn: "মাঝারি" },
  { slug: "tan", en: "Tan", bn: "শ্যামলা" },
  { slug: "deep", en: "Deep", bn: "গাঢ়" },
] as const;

export type ShadeDepth = (typeof SHADE_DEPTHS)[number]["slug"];

export function depthLabel(slug: string, locale: Locale): string {
  const depth = SHADE_DEPTHS.find((entry) => entry.slug === slug);
  if (!depth) return slug;
  return locale === "bn" ? depth.bn : depth.en;
}
