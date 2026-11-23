import { always, extract } from "@antithesishq/bombadil";
import type { State } from "@antithesishq/bombadil/browser";

/**
 * Extracts collection page structure and product cards:
 * 1. Checks if current page is a collection view (/c/:slug).
 * 2. Checks secondary rails on collection views to ensure no self-collection duplicate rails exist.
 * 3. Checks cross-sell rails are preserved when authored.
 * 4. Checks that product cards rendered in the main grid have unique product links.
 */
const collectionState = extract((state: State) => {
  const doc = state.document;
  const win = state.window;
  const pathname = win?.location?.pathname ?? "";

  const isCollectionView = pathname.startsWith("/c/");
  const activeSlug = isCollectionView ? pathname.replace(/^\/c\//, "").split("/")[0] : null;

  if (!isCollectionView || !doc || !activeSlug) {
    return {
      isCollectionView: false,
      noDuplicateActiveRail: true,
      crossSellPreserved: true,
      uniqueProductCards: true,
    };
  }

  // 1. Check secondary recommendation rails on collection pages
  const rails = Array.from(doc.querySelectorAll("[data-section-type='product_rail'], [data-collection-rail]"));
  let duplicateRailFound = false;
  let crossSellPreserved = true;

  for (const rail of rails) {
    const railSlug = rail.getAttribute("data-collection-slug") || rail.getAttribute("data-target-slug");
    if (railSlug) {
      if (railSlug.toLowerCase() === activeSlug.toLowerCase()) {
        duplicateRailFound = true;
      }
    }
  }

  // Check if any heading inside secondary sections duplicates active collection title
  const activeTitle = doc.querySelector("h1")?.textContent?.trim().toLowerCase() || activeSlug;
  const secondaryRailHeadings = Array.from(
    doc.querySelectorAll("[data-section-type='product_rail'] h2, [data-section-type='product_rail'] h3")
  ).map((h) => h.textContent?.trim().toLowerCase() || "");

  for (const heading of secondaryRailHeadings) {
    if (heading && heading === activeTitle) {
      duplicateRailFound = true;
    }
  }

  // 2. Intentional cross-sell check: If a rail exists with a distinct target collection, it must remain rendered
  const crossSellRails = rails.filter((rail) => {
    const slug = rail.getAttribute("data-collection-slug") || rail.getAttribute("data-target-slug");
    return slug && slug.toLowerCase() !== activeSlug.toLowerCase();
  });
  for (const rail of crossSellRails) {
    if (rail.querySelectorAll("a, [data-product-card]").length === 0) {
      crossSellPreserved = false;
    }
  }

  // 3. Product card uniqueness in the main grid
  const gridCards = Array.from(
    doc.querySelectorAll("[data-testid='product-grid'] a[href*='/p/'], .product-grid a[href*='/p/']")
  );
  const cardHrefs = gridCards.map((a) => a.getAttribute("href")).filter(Boolean);
  const uniqueHrefs = new Set(cardHrefs);
  const uniqueProductCards = cardHrefs.length === uniqueHrefs.size;

  return {
    isCollectionView: true,
    noDuplicateActiveRail: !duplicateRailFound,
    crossSellPreserved,
    uniqueProductCards,
  };
});

export const no_duplicate_active_collection_rail = always(() => {
  return collectionState.current.noDuplicateActiveRail;
});

export const intentional_cross_sell_preserved = always(() => {
  return collectionState.current.crossSellPreserved;
});

export const unique_product_cards = always(() => {
  return collectionState.current.uniqueProductCards;
});
