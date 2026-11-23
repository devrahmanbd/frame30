/**
 * Frame30 — Collection Template Merchandising Composition Contract
 *
 * Implements the authoritative collection section reconciliation rules:
 * 1. The active collection's main product grid is authoritative.
 * 2. Redundant recommendation rails referencing the active collection
 *    (e.g., "More to explore" or any rail targeting the same collection)
 *    are omitted to eliminate duplicate product cards on collection templates
 *    (such as /c/sarees and /c/festive).
 * 3. Intentional cross-sells targeting different collections (e.g. /c/girls
 *    recommending the 'kids' collection for "More Children's Wear")
 *    are strictly preserved.
 * 4. Blanket removal of all product rails is forbidden.
 * 5. Reconciles ThemePreviewFrame (preview) and CollectionView (production storefront)
 *    under a single, shared, verified contract.
 */

export interface MerchandisingSection {
  type: string;
  props?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Normalizes a collection slug or handle for robust case-insensitive comparison.
 */
export function normalizeCollectionSlug(slug: unknown): string {
  if (typeof slug !== "string") return "";
  return slug.trim().toLowerCase();
}

/**
 * Returns true if a given product_rail targets the same collection as the active collection
 * and represents a redundant secondary rail (e.g., "More to explore" or repeating collection).
 */
export function isRedundantCollectionRail(
  section: MerchandisingSection,
  activeCollectionSlug: string,
): boolean {
  if (section.type !== "product_rail") return false;

  const active = normalizeCollectionSlug(activeCollectionSlug);
  if (!active) return false;

  const railCollection = normalizeCollectionSlug(section.props?.["collection"]);
  if (!railCollection) {
    // If the rail has no collection specified, it either relies on focus context
    // or inherits the active collection. Redundant on collection templates.
    return true;
  }

  // If the rail explicitly targets the SAME collection that is already displayed
  // by the primary product grid, it is redundant and duplicates products.
  return railCollection === active;
}

/**
 * Filters a list of template sections for a collection page, omitting redundant
 * self-collection recommendation rails while preserving intentional cross-sells.
 */
export function filterCollectionSections<T extends MerchandisingSection>(
  sections: T[],
  activeCollectionSlug: string,
): T[] {
  return sections.filter((s) => !isRedundantCollectionRail(s, activeCollectionSlug));
}

/**
 * Authoritative storefront collection AST transformer:
 * - Omits template chrome that CollectionView renders natively (category_header, result_toolbar, etc.)
 * - Applies the shared merchandising composition rule: eliminates redundant self-collection rails
 *   while preserving intentional cross-sells (e.g. /c/girls cross-selling /c/kids).
 * - Strips redundant product_grid heading so the category header remains single source of truth.
 */
export function reconcileStorefrontCollectionSections<T extends MerchandisingSection>(
  sections: T[],
  activeCollectionSlug: string,
): T[] {
  return sections
    .filter(
      (s) =>
        s.type !== "category_header" &&
        s.type !== "result_toolbar" &&
        s.type !== "announcement_bar" &&
        s.type !== "breadcrumb" &&
        !isRedundantCollectionRail(s, activeCollectionSlug),
    )
    .map((s) =>
      s.type === "product_grid"
        ? ({ ...s, props: { ...(s.props || {}), heading: "", heading_bn: "" } } as T)
        : s,
    );
}
