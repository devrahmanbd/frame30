/**
 * Level B thin vertical slice — read-scoped commerce context.
 *
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §5.
 *
 * The platform hands catalogue data to theme code through these shapes and
 * nothing else: ids, titles, handles, images, options, and per-variant
 * availability flags. Display of catalogue amounts is host-owned — the host
 * formats values from server-quoted figures — so this module carries no
 * amount fields by construction, and the section proof scans theme source
 * to keep it that way (`animated-product-section.test.ts`: commerce-context
 * purity). Collection membership is id lists only, paged by the host.
 */

export type SliceVariant = {
  id: string;
  title: string;
  available: boolean;
};

export type SliceProduct = {
  id: string;
  title: string;
  handle: string;
  images: string[];
  options: string[];
  variants: SliceVariant[];
};

export type SliceCollection = {
  id: string;
  title: string;
  handle: string;
  productIds: string[];
};

/** Read model only. Writes (cart bridge) are out of scope for this slice. */
export type SliceCommerceContext = {
  products: SliceProduct[];
  collections: SliceCollection[];
};

/**
 * Resolve merchant-picked ids against the host context. Order follows the
 * merchant selection; unknown ids are skipped; duplicates collapse to one.
 * Never throws on malformed input — an empty rail renders instead.
 */
export function findSliceProducts(
  commerce: SliceCommerceContext,
  ids: unknown,
): SliceProduct[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map(
    (commerce?.products ?? []).map((product) => [product.id, product]),
  );
  const seen = new Set<string>();
  const out: SliceProduct[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string" || raw.length === 0 || seen.has(raw)) continue;
    seen.add(raw);
    const product = byId.get(raw);
    if (product) out.push(product);
  }
  return out;
}

/** True when at least one variant can be fulfilled today. */
export function isSliceProductAvailable(product: SliceProduct): boolean {
  return product.variants.some((variant) => variant.available);
}
