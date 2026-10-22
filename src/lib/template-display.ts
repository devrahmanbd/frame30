/**
 * Human-facing template names.
 *
 * Shopper copy must never print a raw template key (`blog_article`,
 * `archive`). The storefront host names a declined template in prose, so the
 * label lives in a dependency-light module the storefront can import without
 * pulling the preview registry (which imports every theme).
 */
import type { TemplateKey } from "./builder-ast";

export const TEMPLATE_DISPLAY_NAME: Record<TemplateKey, string> = {
  index: "Home",
  product: "Product",
  collection: "Collection",
  account: "Account",
  search: "Search results",
  cart: "Cart",
  checkout: "Checkout",
  blog: "Blog",
  page: "Page",
  archive: "Archive",
};

/** The human label for a template key (`search` → `Search results`). */
export function templateDisplayName(template: TemplateKey): string {
  return TEMPLATE_DISPLAY_NAME[template] ?? template;
}
