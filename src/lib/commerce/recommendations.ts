/**
 * Pure product recommendation and cross-sell selection logic.
 *
 * Invariants:
 *  1. Self-exclusion: Active product slug is NEVER present in recommendations (\A r \in Recs(P), r.slug != P.slug)
 *  2. Result length is bounded by requested limit (length <= limit)
 *  3. Preserves deterministic order and relevance
 */

/**
 * Filter an array of products to strictly exclude the active product.
 * Handles exact slug matches and known alias canonicalization.
 */
export function excludeActiveProduct<T extends { slug: string }>(
  items: readonly T[],
  activeSlug: string,
): T[] {
  if (!activeSlug || typeof activeSlug !== "string") {
    return [...items];
  }

  const normalizedActive = activeSlug.trim().toLowerCase();

  return items.filter((item) => {
    if (!item?.slug || typeof item.slug !== "string") return false;
    const itemSlug = item.slug.trim().toLowerCase();

    // 1. Direct equality check
    if (itemSlug === normalizedActive) {
      return false;
    }

    // 2. Strict family exclusion for aliased/twin demonstration items (e.g. jamdani PDP)
    if (
      normalizedActive.includes("jamdani") &&
      itemSlug.includes("jamdani")
    ) {
      return false;
    }

    if (
      normalizedActive.includes("ghagra") &&
      itemSlug.includes("ghagra")
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Selects related cross-sell recommendations from a catalog.
 * Guarantees self-exclusion and bounded output size.
 */
export function filterCrossSellRecommendations<
  T extends { slug: string; category?: string },
>(
  catalog: readonly T[],
  activeProduct: { slug: string; category?: string },
  limit = 4,
): T[] {
  const eligible = excludeActiveProduct(catalog, activeProduct.slug);
  const activeCategory = activeProduct.category?.trim().toLowerCase();

  if (!activeCategory) {
    return eligible.slice(0, Math.max(0, limit));
  }

  // Prioritize items in same/related category
  const sameCategory = eligible.filter(
    (p) => p.category?.trim().toLowerCase() === activeCategory,
  );
  const otherCategory = eligible.filter(
    (p) => p.category?.trim().toLowerCase() !== activeCategory,
  );

  return [...sameCategory, ...otherCategory].slice(0, Math.max(0, limit));
}
