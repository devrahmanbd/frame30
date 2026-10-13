/**
 * Level B WebGL capability proof — read-scoped commerce context.
 *
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §5.
 *
 * The platform hands catalogue data to theme code through these shapes and
 * nothing else: ids, titles, handles, images, options, and per-variant
 * availability flags. Display of catalogue amounts is host-owned — the host
 * formats values from server-quoted figures — so this module carries no
 * amount fields by construction, and the showcase proof scans theme source
 * to keep it that way (`webgl-product-showcase.test.ts`: commerce-context
 * purity). Collection membership is id lists only, paged by the host.
 */

export type ShowcaseVariant = {
  id: string;
  title: string;
  available: boolean;
};

export type ShowcaseProduct = {
  id: string;
  title: string;
  handle: string;
  images: string[];
  options: string[];
  variants: ShowcaseVariant[];
};

export type ShowcaseCollection = {
  id: string;
  title: string;
  handle: string;
  productIds: string[];
};

/** Read model only. Writes (cart bridge) are out of scope for this slice. */
export type ShowcaseCommerceContext = {
  products: ShowcaseProduct[];
  collections: ShowcaseCollection[];
};

/**
 * Resolve merchant-picked ids against the host context. Order follows the
 * merchant selection; unknown ids are skipped; duplicates collapse to one.
 * Never throws on malformed input — an empty rail renders instead.
 */
export function findShowcaseProducts(
  commerce: ShowcaseCommerceContext,
  ids: unknown,
): ShowcaseProduct[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map(
    (commerce?.products ?? []).map((product) => [product.id, product]),
  );
  const seen = new Set<string>();
  const out: ShowcaseProduct[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string" || raw.length === 0 || seen.has(raw)) continue;
    seen.add(raw);
    const product = byId.get(raw);
    if (product) out.push(product);
  }
  return out;
}

/** True when at least one variant can be fulfilled today. */
export function isShowcaseProductAvailable(product: ShowcaseProduct): boolean {
  return product.variants.some((variant) => variant.available);
}
