/**
 * Dynamic tags — bind any text, image or link control to live data.
 *
 * A control's value may contain `{{product.title}}` or, with a fallback,
 * `{{product.sku|No SKU}}`. Resolution happens at render time against the
 * context the template host supplies, so the same widget works on a product
 * page, in a loop item, and in the studio preview (where sample values stand
 * in for real rows).
 *
 * Unknown tags resolve to their fallback, never to the raw braces — a shopper
 * must never see template syntax.
 */
import type { PropValue } from "./builder-ast";

export type DynamicContext = {
  site?: { title?: string | null; tagline?: string | null };
  product?: {
    title?: string | null;
    price?: string | null;
    comparePrice?: string | null;
    sku?: string | null;
    stock?: number | string | null;
    image?: string | null;
    url?: string | null;
    description?: string | null;
  };
  collection?: { title?: string | null; description?: string | null; count?: number | null; url?: string | null };
  page?: { title?: string | null; excerpt?: string | null; url?: string | null };
  article?: {
    title?: string | null;
    excerpt?: string | null;
    author?: string | null;
    date?: string | null;
    image?: string | null;
    url?: string | null;
  };
  customer?: { name?: string | null; email?: string | null };
  cart?: { count?: number | null; total?: string | null };
};

/** Everything a merchant can pick from the tag menu, grouped for the UI. */
export const DYNAMIC_TAGS: { value: string; label: string; group: string }[] = [
  { value: "site.title", label: "Site title", group: "Site" },
  { value: "site.tagline", label: "Site tagline", group: "Site" },
  { value: "product.title", label: "Product title", group: "Product" },
  { value: "product.price", label: "Product price", group: "Product" },
  { value: "product.comparePrice", label: "Compare-at price", group: "Product" },
  { value: "product.sku", label: "Product SKU", group: "Product" },
  { value: "product.stock", label: "Stock quantity", group: "Product" },
  { value: "product.image", label: "Featured image", group: "Product" },
  { value: "product.url", label: "Product link", group: "Product" },
  { value: "product.description", label: "Product description", group: "Product" },
  { value: "collection.title", label: "Collection title", group: "Collection" },
  { value: "collection.description", label: "Collection description", group: "Collection" },
  { value: "collection.count", label: "Products in collection", group: "Collection" },
  { value: "collection.url", label: "Collection link", group: "Collection" },
  { value: "page.title", label: "Page title", group: "Page" },
  { value: "page.excerpt", label: "Page excerpt", group: "Page" },
  { value: "article.title", label: "Post title", group: "Blog" },
  { value: "article.excerpt", label: "Post excerpt", group: "Blog" },
  { value: "article.author", label: "Post author", group: "Blog" },
  { value: "article.date", label: "Post date", group: "Blog" },
  { value: "article.image", label: "Post image", group: "Blog" },
  { value: "article.url", label: "Post link", group: "Blog" },
  { value: "customer.name", label: "Customer name", group: "Customer" },
  { value: "cart.count", label: "Items in cart", group: "Cart" },
  { value: "cart.total", label: "Cart total", group: "Cart" },
];

const TAG_KEYS = new Set(DYNAMIC_TAGS.map((tag) => tag.value));

/** `{{ group.field | fallback }}` — whitespace tolerant, fallback optional. */
const TAG_RE = /\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*(?:\|([^}]*))?\}\}/g;

export function hasDynamicTag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  TAG_RE.lastIndex = 0;
  return TAG_RE.test(value);
}

/** Composes the tag literal an inspector control inserts. */
export function dynamicTag(key: string, fallback?: string): string {
  return fallback ? `{{${key}|${fallback}}}` : `{{${key}}}`;
}

function lookup(key: string, ctx: DynamicContext): string | null {
  if (!TAG_KEYS.has(key)) return null;
  const [group, field] = key.split(".") as [keyof DynamicContext, string];
  const bag = ctx[group] as Record<string, unknown> | undefined;
  const value = bag?.[field];
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

/** Replaces every tag in one string. Falls back per tag, never per string. */
export function resolveDynamicText(input: string, ctx: DynamicContext): string {
  if (!input.includes("{{")) return input;
  return input.replace(TAG_RE, (_match, key: string, fallback?: string) => {
    const resolved = lookup(key.trim(), ctx);
    if (resolved !== null) return resolved;
    return (fallback ?? "").trim();
  });
}

/**
 * Resolves every string prop of one node. Arrays of rows (repeaters) are
 * resolved one level deep, which is where authored copy lives.
 */
export function resolveDynamicProps(
  props: Record<string, PropValue>,
  ctx: DynamicContext,
): Record<string, PropValue> {
  let changed = false;
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string" && value.includes("{{")) {
      const next = resolveDynamicText(value, ctx);
      changed ||= next !== value;
      out[key] = next;
      continue;
    }
    if (Array.isArray(value)) {
      let rowChanged = false;
      const rows = value.map((row) => {
        if (!row || typeof row !== "object") return row;
        const nextRow: Record<string, PropValue> = { ...(row as Record<string, PropValue>) };
        for (const [rk, rv] of Object.entries(nextRow)) {
          if (typeof rv === "string" && rv.includes("{{")) {
            const next = resolveDynamicText(rv, ctx);
            if (next !== rv) {
              nextRow[rk] = next;
              rowChanged = true;
            }
          }
        }
        return nextRow;
      });
      if (rowChanged) {
        changed = true;
        out[key] = rows as PropValue;
        continue;
      }
    }
    out[key] = value;
  }
  return changed ? out : props;
}

/** Sample values so the studio canvas shows something readable, never braces. */
export const SAMPLE_DYNAMIC_CONTEXT: DynamicContext = {
  site: { title: "Your store", tagline: "Fast delivery across Bangladesh" },
  product: {
    title: "Sample product",
    price: "৳1,250",
    comparePrice: "৳1,600",
    sku: "SKU-001",
    stock: 12,
    description: "A sample description shown while you design.",
  },
  collection: { title: "Sample collection", count: 24 },
  page: { title: "Sample page", excerpt: "A short summary." },
  article: { title: "Sample post", author: "Editor", date: "2026-01-01", excerpt: "A short summary." },
  customer: { name: "Shopper" },
  cart: { count: 2, total: "৳2,500" },
};
