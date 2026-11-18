/**
 * Taxonomy and Category Isolation predicates for Framique.
 *
 * Invariant: Products assigned to specific heritage craft taxonomies (e.g. Sarees)
 * must remain strictly isolated from cross-department contamination (e.g. Tunics, Panjabi, Kids).
 */

export const SAREE_CATEGORIES = [
  "sarees",
  "saree",
  "jamdani",
  "tangail",
  "katan",
] as const;

export const DISALLOWED_APPAREL_IN_SAREES = [
  "tunics",
  "tunic",
  "panjabi",
  "mens",
  "men",
  "kids",
  "girls",
  "boys",
  "quilts",
  "quilt",
  "ghagra",
] as const;

/**
 * Returns true if the given category string denotes an authentic saree product.
 */
export function isSareeCategory(category: string | undefined | null): boolean {
  if (!category || typeof category !== "string") return false;
  const c = category.trim().toLowerCase();
  return SAREE_CATEGORIES.some((s) => c === s || c.includes(s));
}

/**
 * Returns true if the product belongs to a prohibited category or carries a prohibited tag
 * that contaminates the saree collection.
 * Uses exact token matching so that "women" is NOT treated as "men".
 */
export function isDisallowedInSarees(
  category: string | undefined | null,
  tags: readonly string[] = [],
): boolean {
  const normCategory = (category ?? "").trim().toLowerCase();
  const normTags = tags.map((t) => t.trim().toLowerCase());

  for (const disallowed of DISALLOWED_APPAREL_IN_SAREES) {
    // Exact category match
    if (normCategory === disallowed) {
      return true;
    }
    // Tag matches disallowed token
    if (normTags.includes(disallowed)) {
      return true;
    }
  }

  // Tunic / Panjabi / Quilt partial substring matches
  if (
    normCategory.includes("tunic") ||
    normCategory.includes("panjabi") ||
    normCategory.includes("quilt") ||
    normCategory.includes("ghagra")
  ) {
    return true;
  }

  return false;
}

/**
 * Checks that an item satisfies the Saree taxonomy isolation property:
 * either it is a valid saree category and carries no disallowed attributes,
 * or it is not admitted into the saree collection.
 */
export function assertSareeTaxonomyIsolation(
  category: string | undefined | null,
  tags: readonly string[] = [],
): boolean {
  if (isDisallowedInSarees(category, tags)) {
    return false;
  }
  return true;
}
