/**
 * Demo theme fixture — read-scoped commerce context.
 *
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §5.
 *
 * The platform hands catalogue data to theme code through these shapes and
 * nothing else: ids, titles, handles, images, options, and per-variant
 * readiness flags. Rendering of catalogue figures stays host-owned — the
 * host formats values from server-quoted figures — so this module carries
 * no figure fields by construction, and the cards proof scans theme source
 * to keep it that way (`product-cards.test.ts`: commerce-context purity).
 * Collection membership is id lists only, paged by the host. Writes travel
 * the scoped bridge (`product-cards.ts` envelope builders); this module is
 * the read side only.
 */

export type DemoVariant = {
  id: string;
  title: string;
  available: boolean;
};

export type DemoProduct = {
  id: string;
  title: string;
  handle: string;
  images: string[];
  options: string[];
  variants: DemoVariant[];
};

export type DemoCollection = {
  id: string;
  title: string;
  handle: string;
  productIds: string[];
};

/**
 * Read model only. Cart lines are written through the scoped bridge
 * envelopes in `product-cards.ts`, never through this context.
 */
export type DemoCommerceContext = {
  products: DemoProduct[];
  collections: DemoCollection[];
};

/**
 * Resolve merchant-picked ids against the host context. Order follows the
 * merchant selection; unknown ids are skipped; duplicates collapse to one.
 * Never throws on malformed input — an empty rail renders instead.
 */
export function findDemoProducts(
  commerce: DemoCommerceContext,
  ids: unknown,
): DemoProduct[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map(
    (commerce?.products ?? []).map((product) => [product.id, product]),
  );
  const seen = new Set<string>();
  const out: DemoProduct[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string" || raw.length === 0 || seen.has(raw)) continue;
    seen.add(raw);
    const product = byId.get(raw);
    if (product) out.push(product);
  }
  return out;
}

/** True when at least one variant can be fulfilled today. */
export function isDemoProductAvailable(product: DemoProduct): boolean {
  return product.variants.some((variant) => variant.available);
}

/** Variant ids in catalogue order (feeds the selector options). */
export function demoVariantIds(product: DemoProduct): string[] {
  return product.variants.map((variant) => variant.id);
}
