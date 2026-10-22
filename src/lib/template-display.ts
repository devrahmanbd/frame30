/**
 * Human-facing template names — the STOREFRONT's copy.
 *
 * Shopper copy must never print a raw template key (`blog_article`,
 * `archive`). The storefront host names a declined template in prose, so the
 * label lives in a dependency-light module the storefront can import without
 * pulling the preview registry (which imports every theme).
 *
 * **Which map is authoritative.** The editor's own `TEMPLATE_LABEL`
 * (`src/routes/_authenticated/dashboard/builder.tsx`) is the SOURCE of these
 * English names; this map is the storefront's copy of them, kept in step by
 * the repo's own label-map contract
 * (`src/lib/template-key-contract.test.ts` — "the label maps"), which
 * enumerates EVERY per-template label map and asserts they carry the same
 * keys and agree on the English name. A new template key that misses this
 * map fails that contract instead of silently printing the raw key.
 *
 * The names are **English-only**: the platform has bilingual labels
 * available (`TEMPLATE_LABEL`'s `bn`), but this programme authors no Bangla
 * copy (the plan's Global Constraints), so the storefront's declined-template
 * copy stays English — the same trade the demo marker makes.
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
