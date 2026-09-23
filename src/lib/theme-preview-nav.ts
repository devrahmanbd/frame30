/**
 * In-preview navigation (Envato-style demo browsing).
 *
 * Links inside a theme preview point at live storefront permalinks
 * (`/c/<slug>`, `/p/<slug>`, …) which 404 on platform hosts — there is no
 * merchant there. Instead of escaping the frame, the preview maps demo
 * links onto its own template tabs so every tap shows authored demo
 * content. Unmapped links (external, tel:, mailto:, anchors) return null
 * and keep default browser behavior.
 */
import type { TemplateKey } from "./builder-ast";

export function previewTemplateForHref(href: string): TemplateKey | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return null;
  // Absolute platform URLs (StoreHeader links) resolve same as root paths.
  const path = raw.replace(/^https?:\/\/[^/]+/i, "").split("?")[0]!;
  if (path === "/") return "index";
  if (path === "/search") return "search";
  if (path === "/cart") return "cart";
  if (path === "/checkout") return "checkout";
  if (path === "/c" || path.startsWith("/c/")) return "collection";
  if (path === "/p" || path.startsWith("/p/")) return "product";
  if (path === "/collections" || path.startsWith("/collections/"))
    return "collection";
  if (path === "/products" || path.startsWith("/products/"))
    return "product";
  if (path === "/blog" || path.startsWith("/blog/")) return "blog";
  if (
    path === "/pages" ||
    path.startsWith("/pages/") ||
    path === "/page" ||
    path.startsWith("/page/")
  )
    return "page";
  return null;
}
