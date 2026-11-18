/**
 * Pure collection and catalog filtering functions.
 *
 * Used by preview frames, collection views, and property verification tests.
 */
import { excludeActiveProduct } from "./recommendations";
import { isSareeCategory, isDisallowedInSarees } from "./taxonomy";

export interface FilterableProduct {
  slug: string;
  category?: string;
  collections?: string[];
  tags?: string[];
}

/**
 * Matches category synonyms (e.g. women vs womens).
 */
export function matchesCategory(
  category: string | undefined,
  target: string,
): boolean {
  if (!category) return false;
  const c = category.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (c === t) return true;
  if (t === "womens" || t === "women") return c === "women" || c === "womens";
  if (t === "mens" || t === "men") return c === "men" || c === "mens";
  if (t === "jewelry" || t === "jewellery") return c === "jewelry" || c === "jewellery";
  if (t === "sarees" || t === "saree") return isSareeCategory(c);

  return false;
}

/**
 * Filters a list of products by collection slug with optional active item exclusion.
 */
export function filterCollectionProducts<T extends FilterableProduct>(
  products: readonly T[],
  collectionSlug: string,
  options?: {
    excludeSlug?: string;
    limit?: number;
  },
): T[] {
  const normSlug = collectionSlug.trim().toLowerCase();

  let filtered = [...products];

  // 1. Exclude active slug if specified
  if (options?.excludeSlug) {
    filtered = excludeActiveProduct(filtered, options.excludeSlug);
  }

  // 2. Collection-specific matching rules
  filtered = filtered.filter((p) => {
    // If filtering for sarees, enforce taxonomy isolation
    if (normSlug === "sarees" || normSlug === "saree") {
      if (isDisallowedInSarees(p.category, p.tags ?? [])) {
        return false;
      }
      return (
        isSareeCategory(p.category) ||
        p.collections?.includes("sarees") ||
        p.tags?.some((t) => t.toLowerCase().includes("saree"))
      );
    }

    // Standard collection taxonomy match
    return (
      p.collections?.includes(normSlug) ||
      matchesCategory(p.category, normSlug) ||
      p.tags?.includes(normSlug) ||
      ((normSlug === "women" || normSlug === "womens") &&
        p.tags?.includes("saree"))
    );
  });

  if (typeof options?.limit === "number" && options.limit > 0) {
    return filtered.slice(0, options.limit);
  }

  return filtered;
}
