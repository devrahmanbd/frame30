/**
 * Store-slug context for storefront widget cards (Phase1-T1).
 *
 * SectionRenderer provides the tenant slug for every widget tree; ProductCard
 * gates interactive affordances (wishlist heart, Quick View) on it so a card
 * rendered outside a store context — tests, previews, static embeds — stays a
 * plain anchor with no router/query hooks mounted.
 */
import { createContext, useContext } from "react";

export const StoreSlugContext = createContext<string | null>(null);

/** Current store slug, or null when rendered outside a store context. */
export function useStoreSlug(): string | null {
  return useContext(StoreSlugContext);
}
