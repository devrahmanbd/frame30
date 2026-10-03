/**
 * Phase 0.3 — the batched widget data resolver.
 *
 * One call per render. Requests are grouped by source and each source loader
 * runs exactly once with every request it owns, so N product grids cost one
 * query, not N. Loaders are injectable, which is how the "exactly one data
 * call" guarantee is asserted in tests.
 */
import { publicClient } from "./pricing.server";
import { incr, observe } from "./observability.server";
import { assertTenantId } from "./tenant-scope";
import { emiPlan, emiPlanKey, isEmiTenure } from "./emi";
import {
  MAX_WIDGET_ROWS,
  storeHref,
  type WidgetDataBundle,
  type WidgetDataMap,
  type WidgetDataRequest,
  type WidgetRow,
} from "./widget-data";
import type { WidgetDataSource } from "./widget-registry";

export type SourceLoader = (
  merchantId: string,
  requests: WidgetDataRequest[],
  ctx?: { base: string },
) => Promise<Record<string, WidgetRow[]>>;

export type SourceLoaders = Partial<Record<WidgetDataSource, SourceLoader>>;

type VariantRow = {
  /** Present on DB rows; demo catalogue constructs variants without it. */
  id?: string;
  price_amount_minor_int: number | string;
  compare_at_amount_minor_int: number | string | null;
  stock_quantity: number;
};

type ProductRow = {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  created_at: string;
  product_variants: VariantRow[] | null;
  collection_products?: { collection_id: string }[] | null;
  /** Merch tags (`online-exclusive` drives the card's exclusive chip). */
  tags?: string[] | null;
  /** Demo-catalogue rows have no real handle/variant to favourite. */
  demo?: boolean;
};

function minPrice(variants: VariantRow[]): number {
  if (variants.length === 0) return 0;
  return Math.min(
    ...variants.map((v) => Number(v.price_amount_minor_int) || 0),
  );
}

function sortProducts(rows: ProductRow[], sort: string): ProductRow[] {
  const out = [...rows];
  if (sort === "price_asc")
    out.sort(
      (a, b) =>
        minPrice(a.product_variants ?? []) - minPrice(b.product_variants ?? []),
    );
  else if (sort === "price_desc")
    out.sort(
      (a, b) =>
        minPrice(b.product_variants ?? []) - minPrice(a.product_variants ?? []),
    );
  else if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out;
}

/**
 * Lane H — behavior ranking for `recommended` merch rails.
 *
 * A `product_rail` / `urgency_rail` whose `source` prop is `recommended` used
 * to resolve exactly like `collection` (newest first): the merch `source`
 * select offers collection / bestsellers / recommended, but the resolver
 * ignored the value, so `recommended` had no ranking behind it. This section
 * ranks the already-fetched product window by observed shopper behavior:
 *
 * - product views (`analytics_events` entity=product action=view,
 *   `payload.item_id`) — weight 1,
 * - cart adds (`analytics_events` entity=cart action=add,
 *   `payload.variantId` mapped to its product) — weight 3,
 * - order co-occurrence (`order_items` sharing an `order_id`, counted per
 *   product through its variants) — weight 5.
 *
 * Every signal read is merchant-scoped and bounded (BEHAVIOR_BOUNDS), the
 * snapshot is cached per merchant with no session key, visitor hash or other
 * PII in the cache key, and the selected columns never include an identifier
 * (no `visitor_hash`, `session_key`, email or phone). When every signal is
 * cold the rail falls back to bestseller velocity (order quantities), and when
 * that is cold too it keeps collection (newest) order — a rail never renders
 * empty just because behavior is missing.
 *
 * Same source key, zero theme changes: the `WidgetDataSource` stays
 * `collection` and the request key is untouched; only the in-memory order of
 * the already-fetched window changes.
 *
 * RPC-first follow-up: when `public.rail_behavior_scores`
 * (supabase/pending/rail_behavior_scores.sql) is applied, the snapshot comes
 * from one security-definer call whose weights/bounds mirror
 * BEHAVIOR_WEIGHTS/BEHAVIOR_BOUNDS. Until then `loadBehaviorSignals`
 * feature-detects the missing function and runs the inline reads below —
 * same signals, same ranker.
 */

/** Hard bounds on every behavior read — a busy store costs the same as a new one. */
export const BEHAVIOR_BOUNDS = {
  /** `analytics_events` rows scanned per merchant snapshot. */
  events: 500,
  /** `order_items` rows scanned per merchant snapshot. */
  items: 1000,
  /** Variant ids resolved to products per snapshot. */
  variants: 2000,
  /** Behavior answers change slowly; cache the snapshot per merchant. */
  ttlSeconds: 300,
  staleSeconds: 600,
} as const;

/** View < cart add < bought-together: intent strength, not money math.
 * Mirrored in SQL by supabase/pending/rail_behavior_scores.sql
 * (_view_w/_cart_w/_co_w) — change both together. */
export const BEHAVIOR_WEIGHTS = { view: 1, cart: 3, coPurchase: 5 } as const;

export type BehaviorSignals = {
  /** Product id → view count. */
  views: Map<string, number>;
  /** Product id → cart-add count. */
  carts: Map<string, number>;
  /** Product id → orders where it appeared alongside another product. */
  co: Map<string, number>;
  /** Product id → ordered units (bestseller velocity + cold fallback). */
  velocity: Map<string, number>;
  /**
   * Product id → RPC-weighted total (`rail_behavior_scores.score`).
   * Populated only on the RPC path; the inline path leaves it empty and the
   * ranker falls back to views/carts/co above.
   */
  scores: Map<string, number>;
};

export function emptyBehaviorSignals(): BehaviorSignals {
  return {
    views: new Map(),
    carts: new Map(),
    co: new Map(),
    velocity: new Map(),
    scores: new Map(),
  };
}

/**
 * Cache key for one merchant's behavior snapshot. Tenant id only — never a
 * session key, visitor hash or any other shopper identifier.
 */
export function behaviorCacheKey(merchantId: string): string {
  return `rail:behavior:${merchantId}`;
}

/** Weighted intent score for one product. Pure, so ranking stays unit-testable.
 * Prefers the RPC-weighted total when the snapshot came from
 * `rail_behavior_scores`; otherwise combines the inline signal maps. */
export function behaviorScore(
  signals: BehaviorSignals,
  productId: string,
): number {
  const rpc = signals.scores.get(productId);
  if (rpc !== undefined) return rpc;
  return (
    (signals.views.get(productId) ?? 0) * BEHAVIOR_WEIGHTS.view +
    (signals.carts.get(productId) ?? 0) * BEHAVIOR_WEIGHTS.cart +
    (signals.co.get(productId) ?? 0) * BEHAVIOR_WEIGHTS.coPurchase
  );
}

type BehaviorAdmin = {
  from: (table: string) => any;
  rpc?: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

async function behaviorAdmin(provided?: BehaviorAdmin): Promise<BehaviorAdmin> {
  if (provided) return provided;
  // Product views, cart adds and order lines expose no public/anon SELECT
  // policy (same reason `fetchPublicVariants` goes through the service role in
  // `storefront.server.ts`): the anon storefront read would resolve to `[]`
  // and every rail would look cold. Resolve through the service role with
  // merchant-scoped, bounded aggregate reads. Exposure matches the intended
  // public policy: only product ids and counts cross the boundary — never a
  // session key, visitor hash, email or phone.
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as BehaviorAdmin;
}

/**
 * One row of `public.rail_behavior_scores` (supabase/pending/
 * rail_behavior_scores.sql, UNAPPLIED). `velocity` rides along so the
 * bestseller fallback keeps working on the RPC path.
 */
export type RailScoreRow = {
  product_id: string;
  score: number | string;
  velocity?: number | string | null;
};

/** True when the failure is "rail_behavior_scores doesn't exist yet" — never for real errors. */
export function isMissingRailScoresError(err: unknown): boolean {
  const record =
    typeof err === "object" && err !== null
      ? (err as Record<string, unknown>)
      : {};
  const code = String(record["code"] ?? "");
  const message =
    typeof record["message"] === "string"
      ? record["message"]
      : String(err ?? "");
  const haystack = `${code} ${message}`;
  if (!/rail_behavior_scores/i.test(haystack)) return false;
  return /does not exist|not found|schema cache|PGRST202|42883|Could not find the function/i.test(
    haystack,
  );
}

/**
 * One merchant's behavior snapshot from the `rail_behavior_scores` RPC.
 * Returns `null` when the RPC is unavailable (missing migration, no rpc
 * surface, any error) or malformed so the caller falls back to the inline
 * aggregate reads below. An empty-but-successful result is a real cold
 * snapshot, not a miss — it returns empty signals without further reads.
 */
async function loadRpcBehaviorScores(
  merchantId: string,
  db: BehaviorAdmin,
): Promise<BehaviorSignals | null> {
  try {
    if (typeof db.rpc !== "function") return null;
    const { data, error } = await db.rpc("rail_behavior_scores", {
      _merchant_id: merchantId,
    });
    if (error || !Array.isArray(data)) return null;
    const signals = emptyBehaviorSignals();
    for (const row of data as RailScoreRow[]) {
      const raw = row?.product_id;
      const id =
        typeof raw === "string" ? raw : raw == null ? "" : String(raw);
      if (!id) continue;
      signals.scores.set(id, Math.max(0, Number(row.score) || 0));
      const velocity = Math.max(0, Number(row.velocity) || 0);
      if (velocity > 0) signals.velocity.set(id, velocity);
    }
    return signals;
  } catch {
    return null;
  }
}

/**
 * One merchant's behavior snapshot. Bounded (every read carries a limit),
 * merchant-scoped, and total on failure: a denied or missing table degrades
 * to empty signals, which the ranker treats as cold, never as an error.
 *
 * RPC-first: when the `rail_behavior_scores` migration has been applied the
 * aggregates come from one security-definer call (SQL-pinned exposure: only
 * product ids, scores and velocities cross the boundary). When the RPC is
 * missing the snapshot falls back to the inline merchant-scoped reads below,
 * so behavior rails keep working before and after the migration.
 */
export async function loadBehaviorSignals(
  merchantId: string,
  admin?: BehaviorAdmin,
): Promise<BehaviorSignals> {
  const signals = emptyBehaviorSignals();
  try {
    const db = await behaviorAdmin(admin);

    // Feature-detect like the kb pattern: RPC when applied, inline before.
    const viaRpc = await loadRpcBehaviorScores(merchantId, db);
    if (viaRpc) return viaRpc;

    const [{ data: events }, { data: items }] = await Promise.all([
      db
        .from("analytics_events")
        .select("entity, action, payload")
        .eq("merchant_id", merchantId)
        .in("entity", ["product", "cart"])
        .order("occurred_at", { ascending: false })
        .limit(BEHAVIOR_BOUNDS.events),
      db
        .from("order_items")
        .select("order_id, variant_id, quantity")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(BEHAVIOR_BOUNDS.items),
    ]);

    const cartVariantIds: string[] = [];
    for (const event of (events ?? []) as {
      entity: string;
      action: string;
      payload?: Record<string, unknown> | null;
    }[]) {
      if (event.entity === "product" && event.action === "view") {
        const id = (event.payload as Record<string, unknown> | null)?.[
          "item_id"
        ];
        if (typeof id === "string" && id) {
          signals.views.set(id, (signals.views.get(id) ?? 0) + 1);
        }
      } else if (event.entity === "cart" && event.action === "add") {
        const id = (event.payload as Record<string, unknown> | null)?.[
          "variantId"
        ];
        if (typeof id === "string" && id) cartVariantIds.push(id);
      }
    }

    const itemRows = ((items ?? []) as {
      order_id: string;
      variant_id: string | null;
      quantity: number | string | null;
    }[]).filter((r) => typeof r.variant_id === "string" && r.variant_id);
    const variantIds = [
      ...new Set([
        ...cartVariantIds,
        ...itemRows.map((r) => r.variant_id as string),
      ]),
    ].slice(0, BEHAVIOR_BOUNDS.variants);

    const variantToProduct = new Map<string, string>();
    if (variantIds.length > 0) {
      const { data: variants } = await db
        .from("product_variants")
        .select("id, product_id")
        .eq("merchant_id", merchantId)
        .in("id", variantIds)
        .limit(Math.min(variantIds.length, BEHAVIOR_BOUNDS.variants));
      for (const v of (variants ?? []) as {
        id: string;
        product_id: string;
      }[]) {
        if (v.id && v.product_id) variantToProduct.set(v.id, v.product_id);
      }
    }

    for (const variantId of cartVariantIds) {
      const productId = variantToProduct.get(variantId);
      if (productId)
        signals.carts.set(productId, (signals.carts.get(productId) ?? 0) + 1);
    }

    const orderProducts = new Map<string, Set<string>>();
    for (const row of itemRows) {
      const productId = variantToProduct.get(row.variant_id as string);
      if (!productId) continue;
      signals.velocity.set(
        productId,
        (signals.velocity.get(productId) ?? 0) +
          Math.max(0, Number(row.quantity) || 0),
      );
      const set = orderProducts.get(row.order_id) ?? new Set<string>();
      set.add(productId);
      orderProducts.set(row.order_id, set);
    }
    for (const products of orderProducts.values()) {
      if (products.size < 2) continue;
      for (const productId of products)
        signals.co.set(productId, (signals.co.get(productId) ?? 0) + 1);
    }
  } catch {
    // Cold by default: the ranker falls back below.
  }
  return signals;
}

/**
 * Cached behavior snapshot for one merchant's rails. The key carries the
 * tenant id and nothing else — no session key, no visitor hash, no PII.
 */
export async function cachedBehaviorSignals(
  merchantId: string,
  admin?: BehaviorAdmin,
): Promise<BehaviorSignals> {
  const { cached } = await import("./cache.server");
  try {
    return await cached<BehaviorSignals>(
      behaviorCacheKey(merchantId),
      BEHAVIOR_BOUNDS.ttlSeconds,
      () => loadBehaviorSignals(merchantId, admin),
      { staleSeconds: BEHAVIOR_BOUNDS.staleSeconds },
    );
  } catch {
    return emptyBehaviorSignals();
  }
}

/**
 * Reorders an already-fetched product window. Stable: ties and unscored rows
 * keep their incoming (collection/newest) relative order, and the output
 * never grows — the caller still slices to the requested limit.
 *
 * - `recommended`: behavior score first, bestseller velocity when behavior
 *   is cold, collection order when both are cold.
 * - `bestsellers`: velocity first, collection order when cold.
 */
export function rankRailRows<T extends { id: string }>(
  rows: T[],
  signals: BehaviorSignals,
  kind: "recommended" | "bestsellers",
): { rows: T[]; mode: "behavior" | "bestseller" | "collection" } {
  const hasBehavior = rows.some((r) => behaviorScore(signals, r.id) > 0);
  if (kind === "recommended" && hasBehavior) {
    const decorated = rows.map((row, index) => ({ row, index }));
    decorated.sort(
      (a, b) =>
        behaviorScore(signals, b.row.id) - behaviorScore(signals, a.row.id) ||
        a.index - b.index,
    );
    return { rows: decorated.map((d) => d.row), mode: "behavior" };
  }
  const hasVelocity = rows.some((r) => (signals.velocity.get(r.id) ?? 0) > 0);
  if (hasVelocity) {
    const decorated = rows.map((row, index) => ({ row, index }));
    decorated.sort(
      (a, b) =>
        (signals.velocity.get(b.row.id) ?? 0) -
          (signals.velocity.get(a.row.id) ?? 0) || a.index - b.index,
    );
    return { rows: decorated.map((d) => d.row), mode: "bestseller" };
  }
  return { rows, mode: "collection" };
}

/**
 * Merchant display currency for stamping collection-sourced rail rows. One
 * bounded single-row read; `BDT` when the merchant row is missing so rails
 * keep rendering instead of failing the batch.
 */
async function loadMerchantCurrency(
  merchantId: string,
  db: { from: (table: string) => any },
): Promise<string> {
  try {
    const { data } = await db
      .from("merchants")
      .select("currency_code")
      .eq("id", merchantId)
      .maybeSingle();
    const code = (data as { currency_code?: unknown } | null)?.currency_code;
    return typeof code === "string" && code.trim() ? code.trim() : "BDT";
  } catch {
    return "BDT";
  }
}

/**
 * Products for every `collection`-sourced widget. A single query fetches the
 * widest window any request asked for; per-request filtering, sorting and
 * slicing then happen in memory.
 */
const loadCollectionSource: SourceLoader = async (
  merchantId,
  requests,
  ctx,
) => {
  const base = ctx?.base ?? "";
  const db = publicClient();
  const window = Math.min(
    MAX_WIDGET_ROWS,
    Math.max(...requests.map((r) => Number(r.params["limit"]) || 12)),
  );
  const wantsHandles = requests.some(
    (r) => typeof r.params["collection"] === "string",
  );

  const [{ data: products }, collections] = await Promise.all([
    db
      .from("products")
      .select(
        "id, title, slug, image_url, created_at, tags, product_variants(id, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity), collection_products(collection_id)",
      )
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(MAX_WIDGET_ROWS),
    wantsHandles
      ? db
          .from("collections")
          .select("id, slug")
          .eq("merchant_id", merchantId)
          .eq("is_published", true)
      : Promise.resolve({ data: [] as { id: string; slug: string }[] }),
  ]);

  const handleToId = new Map(
    (collections.data ?? []).map((c) => [c.slug, c.id]),
  );
  let rows = (products ?? []) as ProductRow[];
  if (rows.length === 0) {
    const { demoCatalogFor } = await import("./demo-catalog");
    const demo = demoCatalogFor("handloom");
    rows = demo.products.map((dp) => ({
      id: `demo-${dp.slug}`,
      title: dp.title,
      slug: dp.slug,
      image_url: dp.image_url ?? null,
      created_at: new Date().toISOString(),
      tags: dp.tags ?? [],
      demo: true,
      product_variants: dp.variants.map((v) => ({
        price_amount_minor_int: v.price,
        compare_at_amount_minor_int: v.compare_at ?? null,
        stock_quantity: v.stock ?? 10,
      })),
      collection_products: dp.collections.map((c) => ({
        collection_id: c,
      })),
    }));
  }
  const out: Record<string, WidgetRow[]> = {};

  // Lane H: the merch `source` prop (collection / bestsellers / recommended)
  // travels as a request param. Only `recommended` / `bestsellers` need the
  // behavior snapshot; plain collection rails skip those reads entirely.
  // Currency stamps every row regardless: `ProductCard` already formats via
  // `formatDisplayMoney` with `row.currency`, but collection-sourced rows
  // never carried one, so non-BDT stores rendered ৳.
  const needsRanking = requests.some(
    (r) =>
      r.params["source"] === "recommended" ||
      r.params["source"] === "bestsellers",
  );
  const [currency, signals] = await Promise.all([
    loadMerchantCurrency(merchantId, db),
    needsRanking
      ? cachedBehaviorSignals(merchantId)
      : Promise.resolve(emptyBehaviorSignals()),
  ]);

  for (const request of requests) {
    const limit = Math.min(
      MAX_WIDGET_ROWS,
      Math.max(1, Number(request.params["limit"]) || window),
    );
    const handle = request.params["collection"];
    let scoped = rows;
    if (typeof handle === "string") {
      const collectionId = handleToId.get(handle);
      scoped = collectionId
        ? rows.filter((p) =>
            (p.collection_products ?? []).some(
              (cp) => cp.collection_id === collectionId,
            ),
          )
        : [];
    }
    const merchSource = request.params["source"];
    let ordered = sortProducts(
      scoped,
      String(request.params["sort"] ?? "newest"),
    );
    if (merchSource === "recommended" || merchSource === "bestsellers") {
      ordered = rankRailRows(ordered, signals, merchSource).rows;
    }
    out[request.key] = ordered
      .slice(0, limit)
      .map((p) => {
        const variants = p.product_variants ?? [];
        const compare = variants
          .map((v) => Number(v.compare_at_amount_minor_int) || 0)
          .filter((n) => n > 0);
        const firstInStock = variants.find((v) => v.stock_quantity > 0);
        return {
          id: p.id,
          title: p.title,
          href: storeHref(base, "product", p.slug),
          imageUrl: p.image_url,
          priceMinor: minPrice(variants),
          currency,
          ...(compare.length ? { compareAtMinor: Math.max(...compare) } : {}),
          inStock: variants.some((v) => v.stock_quantity > 0),
          // Phase1-T1: total stock powers the low-stock chip; tags power the
          // online-exclusive chip. Demo rows get no handle/variantId so their
          // cards render without the wishlist heart or Quick View trigger.
          stockCount: variants.reduce(
            (sum, v) => sum + Math.max(0, v.stock_quantity),
            0,
          ),
          tags: p.tags ?? [],
          ...(p.demo
            ? { variantId: undefined }
            : { handle: p.slug, variantId: firstInStock?.id }),
        } satisfies WidgetRow;
      });
  }
  return out;
};

/**
 * Brands for `taxonomy` requests that ask for `kind=brand`. Collections and
 * brands share the loader so a page with both still costs one round trip.
 */
const loadBrands = async (
  merchantId: string,
  requests: WidgetDataRequest[],
  base = "",
) => {
  const db = publicClient();
  const { data } = await db
    .from("brands")
    .select("id, name, slug, logo_url")
    .eq("merchant_id", merchantId)
    .order("name")
    .limit(MAX_WIDGET_ROWS);
  const rows = data ?? [];
  const out: Record<string, WidgetRow[]> = {};
  for (const request of requests) {
    const limit = Math.min(
      MAX_WIDGET_ROWS,
      Math.max(1, Number(request.params["limit"]) || 12),
    );
    out[request.key] = rows.slice(0, limit).map((b) => ({
      id: b.id,
      title: b.name,
      href: storeHref(base, "brand", b.name),
      imageUrl: (b as { logo_url?: string | null }).logo_url ?? null,
    }));
  }
  return out;
};

/** Published collections for every `taxonomy`-sourced widget, in one query. */
const loadTaxonomySource: SourceLoader = async (merchantId, requests, ctx) => {
  const base = ctx?.base ?? "";
  const brandRequests = requests.filter((r) => r.params["kind"] === "brand");
  const collectionRequests = requests.filter(
    (r) => r.params["kind"] !== "brand",
  );
  if (brandRequests.length > 0) {
    const [brands, rest] = await Promise.all([
      loadBrands(merchantId, brandRequests, base),
      collectionRequests.length > 0
        ? loadTaxonomySource(merchantId, collectionRequests, ctx)
        : Promise.resolve({} as Record<string, WidgetRow[]>),
    ]);
    return { ...rest, ...brands };
  }
  const db = publicClient();
  const { data } = await db
    .from("collections")
    .select("id, name, slug, collection_products(product_id)")
    .eq("merchant_id", merchantId)
    .eq("is_published", true)
    .order("position")
    .limit(MAX_WIDGET_ROWS);
  let rows = data ?? [];
  if (rows.length === 0) {
    const { demoCatalogFor } = await import("./demo-catalog");
    const demo = demoCatalogFor("handloom");
    rows = demo.collections.map((c) => ({
      id: `demo-${c.slug}`,
      name: c.name,
      slug: c.slug,
      collection_products: [],
    })) as any;
  }
  const out: Record<string, WidgetRow[]> = {};
  for (const request of requests) {
    const limit = Math.min(
      MAX_WIDGET_ROWS,
      Math.max(1, Number(request.params["limit"]) || 8),
    );
    out[request.key] = rows.slice(0, limit).map((c) => ({
      id: c.id,
      title: c.name,
      href: storeHref(base, "collection", c.slug),
      count: (c.collection_products ?? []).length,
    }));
  }
  return out;
};

/**
 * Phase 2.2: `manual` and `recommendation` are product sets too, so they run
 * through the same product query instead of adding a second round trip.
 * `recommendation` orders by discount depth; `manual` keeps catalogue order.
 */
const loadRecommendationSource: SourceLoader = async (merchantId, requests) => {
  const base = await loadCollectionSource(merchantId, requests);
  const out: Record<string, WidgetRow[]> = {};
  for (const request of requests) {
    const rows = [...(base[request.key] ?? [])];
    rows.sort((a, b) => discountOf(b) - discountOf(a));
    out[request.key] = rows;
  }
  return out;
};

function discountOf(row: WidgetRow): number {
  const price = row.priceMinor ?? 0;
  const compare = row.compareAtMinor ?? 0;
  return compare > price ? compare - price : 0;
}

/**
 * Phase 2.3 — variants for one product, shared by the buy box, variant
 * picker, stock line and sticky bar. Every request that names the same
 * handle collapses into a single query.
 */
const loadVariantSource: SourceLoader = async (merchantId, requests, ctx) => {
  const base = ctx?.base ?? "";
  const db = publicClient();
  const handles = [
    ...new Set(
      requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean),
    ),
  ];
  const out: Record<string, WidgetRow[]> = {};
  if (handles.length === 0) {
    for (const request of requests) out[request.key] = [];
    return out;
  }
  const { data } = await db
    .from("products")
    .select(
      "id, slug, title, image_url, product_variants(id, name, price_amount_minor_int, compare_at_amount_minor_int, currency_code, stock_quantity, position)",
    )
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .in("slug", handles);
  const bySlug = new Map((data ?? []).map((p) => [p.slug, p]));
  for (const request of requests) {
    const product = bySlug.get(String(request.params["handle"] ?? ""));
    const variants = [...(product?.product_variants ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    out[request.key] = variants.slice(0, MAX_WIDGET_ROWS).map(
      (v) =>
        ({
          id: v.id,
          title: product?.title ?? v.name,
          options: v.name,
          href: storeHref(base, "variant", product?.slug ?? ""),
          imageUrl: product?.image_url ?? null,
          priceMinor: Number(v.price_amount_minor_int) || 0,
          ...(Number(v.compare_at_amount_minor_int) > 0
            ? { compareAtMinor: Number(v.compare_at_amount_minor_int) }
            : {}),
          currency: v.currency_code,
          inStock: v.stock_quantity > 0,
          count: v.stock_quantity,
        }) satisfies WidgetRow,
    );
  }
  return out;
};

/**
 * Phase 2.3 — published reviews for one product. `rating_summary` and
 * `review_list` share the same rows: the summary aggregates them client-side
 * rather than costing a second query.
 */
const loadReviewSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const handles = [
    ...new Set(
      requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean),
    ),
  ];
  const out: Record<string, WidgetRow[]> = {};
  if (handles.length === 0) {
    for (const request of requests) out[request.key] = [];
    return out;
  }
  const { data: products } = await db
    .from("products")
    .select("id, slug")
    .eq("merchant_id", merchantId)
    .in("slug", handles);
  const idBySlug = new Map((products ?? []).map((p) => [p.slug, p.id]));
  const ids = [...idBySlug.values()];
  const { data: reviews } = ids.length
    ? await db
        .from("product_reviews")
        .select(
          "id, product_id, author_name, title, body, rating, verified_purchase, created_at",
        )
        .eq("merchant_id", merchantId)
        .eq("status", "published")
        .in("product_id", ids)
        .order("created_at", { ascending: false })
        .limit(MAX_WIDGET_ROWS * 2)
    : { data: [] as never[] };
  for (const request of requests) {
    const productId = idBySlug.get(String(request.params["handle"] ?? ""));
    const rows = (reviews ?? []).filter((r) => r.product_id === productId);
    out[request.key] = rows.slice(0, MAX_WIDGET_ROWS).map(
      (r) =>
        ({
          id: r.id,
          title: r.title || r.author_name,
          subtitle: r.author_name,
          body: r.body,
          rating: Number(r.rating) || 0,
          verified: r.verified_purchase === true,
          date: r.created_at,
        }) satisfies WidgetRow,
    );
  }
  return out;
};

/**
 * Phase 2.3 — shopper questions. No question store exists yet, so the source
 * resolves empty and `product_qna` falls back to its authored entries. The
 * request still rides the same batch, so wiring a store later costs no extra
 * round trip.
 */
const loadQnaSource: SourceLoader = async (_merchantId, requests) =>
  Object.fromEntries(requests.map((r) => [r.key, [] as WidgetRow[]]));

/**
 * Phase 2.4 — facet counts for the collection surface. One products query
 * feeds every facet widget on the page: the sidebar, the chips and the
 * toolbar all read the same rows, so filtering never costs a second trip.
 *
 * `subtitle` carries the facet group (`category` / `kind` / `stock`), which
 * keeps the row shape theme-neutral: no widget reads a source-specific column.
 */
const loadFacetsSource: SourceLoader = async (merchantId, requests, ctx) => {
  const base = ctx?.base ?? "";
  const db = publicClient();
  const [{ data: products }, { data: categories }] = await Promise.all([
    db
      .from("products")
      .select("id, category_id, product_kind, product_variants(stock_quantity)")
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .limit(500),
    db
      .from("categories")
      .select("id, name, slug")
      .eq("merchant_id", merchantId)
      .order("name"),
  ]);

  type P = {
    id: string;
    category_id: string | null;
    product_kind: string | null;
    product_variants: { stock_quantity: number }[] | null;
  };
  const rows = (products ?? []) as P[];
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));

  const byCategory = new Map<string, number>();
  const byKind = new Map<string, number>();
  let inStock = 0;
  for (const product of rows) {
    if (product.category_id)
      byCategory.set(
        product.category_id,
        (byCategory.get(product.category_id) ?? 0) + 1,
      );
    const kind = product.product_kind ?? "physical";
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    if ((product.product_variants ?? []).some((v) => v.stock_quantity > 0))
      inStock += 1;
  }

  const categoryRows: WidgetRow[] = [...byCategory.entries()]
    .flatMap(([id, count]): WidgetRow[] => {
      const category = catById.get(id);
      if (!category) return [];
      return [
        {
          id: category.slug,
          title: category.name,
          href: storeHref(base, "category", category.slug),
          count,
          subtitle: "category",
        },
      ];
    })
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const kindRows: WidgetRow[] = [...byKind.entries()]
    .map(([kind, count]) => ({
      id: kind,
      title: kind,
      href: storeHref(base, "brand", kind),
      count,
      subtitle: "kind",
    }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const stockRow: WidgetRow = {
    id: "1",
    title: "in_stock",
    count: inStock,
    subtitle: "stock",
  };

  const out: Record<string, WidgetRow[]> = {};
  for (const request of requests) {
    const limit = Math.min(
      MAX_WIDGET_ROWS,
      Math.max(1, Number(request.params["limit"]) || 12),
    );
    out[request.key] = [
      ...categoryRows.slice(0, limit),
      ...kindRows.slice(0, limit),
      stockRow,
      { id: "total", title: "total", count: rows.length, subtitle: "total" },
    ];
  }
  return out;
};

/**
 * Phase 2.5 — one order row per tracker. The row is deliberately thin: an
 * order number in `title`, the raw status in `subtitle` (the widget maps it to
 * a stage) and a human note in `body`. No money crosses this boundary, because
 * an order total shown next to a live cart must come from the order record the
 * shopper already paid against, not a re-quote.
 */
const loadOrderSource: SourceLoader = async (merchantId, requests) => {
  const numbers = [
    ...new Set(
      requests
        .map((request) => String(request.params?.["orderNumber"] ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  ];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(
    requests.map((r) => [r.key, [] as WidgetRow[]]),
  );
  if (numbers.length === 0) return out;

  const db = publicClient();
  const { data } = await db
    .from("orders")
    .select("id, order_number, status, city, created_at")
    .eq("merchant_id", merchantId)
    .in("order_number", numbers)
    .limit(MAX_WIDGET_ROWS);

  const byNumber = new Map((data ?? []).map((row) => [row.order_number, row]));
  for (const request of requests) {
    const wanted = String(request.params?.["orderNumber"] ?? "").trim();
    const row = byNumber.get(wanted);
    if (!row) continue;
    out[request.key] = [
      {
        id: row.id,
        title: row.order_number,
        subtitle: row.status,
        body: row.city,
        date: row.created_at,
      },
    ];
  }
  return out;
};

/**
 * Phase 2.7 — grouped spec rows for one product, read from product metafields
 * in the `spec` namespace. A key may be written `Group/Label`; the group is
 * split out so `spec_table` can collapse by section without a second table.
 */
const loadSpecsSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const handles = [
    ...new Set(
      requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean),
    ),
  ];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(
    requests.map((r) => [r.key, [] as WidgetRow[]]),
  );
  if (handles.length === 0) return out;

  const { data: products } = await db
    .from("products")
    .select("id, slug")
    .eq("merchant_id", merchantId)
    .in("slug", handles);
  const idBySlug = new Map((products ?? []).map((p) => [p.slug, p.id]));
  const ids = [...idBySlug.values()];
  if (ids.length === 0) return out;

  const { data: rows } = await db
    .from("metafields")
    .select("id, owner_id, key, value")
    .eq("merchant_id", merchantId)
    .eq("owner_type", "product")
    .eq("namespace", "spec")
    .in("owner_id", ids)
    .limit(MAX_WIDGET_ROWS * 4);

  for (const request of requests) {
    const productId = idBySlug.get(String(request.params["handle"] ?? ""));
    if (!productId) continue;
    out[request.key] = (rows ?? [])
      .filter((row) => row.owner_id === productId)
      .slice(0, MAX_WIDGET_ROWS)
      .map((row) => {
        const [head, tail] = String(row.key).split("/");
        const label = (tail ?? head ?? "").trim();
        const value =
          typeof row.value === "string"
            ? row.value
            : JSON.stringify(row.value ?? "");
        return {
          id: row.id,
          title: label,
          ...(tail ? { group: (head ?? "").trim() } : {}),
          valueText: value.replace(/^"|"$/g, ""),
        } satisfies WidgetRow;
      });
  }
  return out;
};

/**
 * Phase 2.7 — EMI plans for one product. The instalment is computed here, in
 * integer minor units, so no widget ever multiplies money. Rates come from the
 * merchant's `emi` metafields (`Bank/tenure` → basis points); with no rows
 * configured the source resolves empty and the widget shows its empty state
 * rather than inventing a rate.
 */
const loadFinanceSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const handles = [
    ...new Set(
      requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean),
    ),
  ];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(
    requests.map((r) => [r.key, [] as WidgetRow[]]),
  );
  if (handles.length === 0) return out;

  const { data: products } = await db
    .from("products")
    .select(
      "id, slug, product_variants(price_amount_minor_int, currency_code, position)",
    )
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .in("slug", handles);
  const bySlug = new Map((products ?? []).map((p) => [p.slug, p]));

  const { data: rates } = await db
    .from("metafields")
    .select("id, key, value")
    .eq("merchant_id", merchantId)
    .eq("owner_type", "merchant")
    .eq("namespace", "emi")
    .limit(MAX_WIDGET_ROWS);

  const plans = (rates ?? [])
    .map((row) => {
      const [bank, tenure] = String(row.key).split("/");
      const bp = Number(
        typeof row.value === "string"
          ? row.value.replace(/[^\d.-]/g, "")
          : row.value,
      );
      return {
        bank: (bank ?? "").trim(),
        tenure: Number(tenure),
        bp: Number.isFinite(bp) ? bp : 0,
      };
    })
    .filter((plan) => plan.bank && isEmiTenure(plan.tenure));

  for (const request of requests) {
    const product = bySlug.get(String(request.params["handle"] ?? ""));
    if (!product) continue;
    const prices = (product.product_variants ?? [])
      .map((v) => Number(v.price_amount_minor_int) || 0)
      .filter((v) => v > 0);
    const price = prices.length ? Math.min(...prices) : 0;
    if (price <= 0) continue;
    const currency = product.product_variants?.[0]?.currency_code;
    out[request.key] = plans
      .map((plan) => emiPlan(price, plan.tenure, plan.bp, plan.bank))
      .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
      .sort((a, b) => a.tenureMonths - b.tenureMonths)
      .slice(0, MAX_WIDGET_ROWS)
      .map(
        (plan) =>
          ({
            id: emiPlanKey(plan),
            title: plan.bank,
            options: String(plan.tenureMonths),
            priceMinor: plan.perMonthMinor,
            compareAtMinor: plan.totalMinor,
            ...(currency ? { currency } : {}),
            count: plan.tenureMonths,
            unit: "months",
          }) satisfies WidgetRow,
      );
  }
  return out;
};

/**
 * Phase 2.8 — one product row by handle, priced by the server.
 *
 * Backs `refill_widget` and `loyalty_strip`: both need a price or an accrual
 * value that the client must never derive, so the row carries the already
 * computed minor-unit figures and the widget only prints them.
 */
const loadProductSource: SourceLoader = async (merchantId, requests, ctx) => {
  const base = ctx?.base ?? "";
  const db = publicClient();
  const handles = [
    ...new Set(
      requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean),
    ),
  ];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(
    requests.map((r) => [r.key, [] as WidgetRow[]]),
  );
  if (handles.length === 0) return out;

  const { data: products } = await db
    .from("products")
    .select(
      "id, slug, title, image_url, product_variants(price_amount_minor_int, currency_code)",
    )
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .in("slug", handles);
  const bySlug = new Map((products ?? []).map((p) => [p.slug, p]));

  for (const request of requests) {
    const product = bySlug.get(String(request.params["handle"] ?? ""));
    if (!product) continue;
    const prices = (product.product_variants ?? [])
      .map((v) => Number(v.price_amount_minor_int) || 0)
      .filter((v) => v > 0);
    const price = prices.length ? Math.min(...prices) : 0;
    out[request.key] = [
      {
        id: product.id,
        title: product.title,
        href: storeHref(base, "product", product.slug),
        ...(product.image_url ? { imageUrl: product.image_url } : {}),
        ...(price > 0 ? { priceMinor: price } : {}),
        ...(product.product_variants?.[0]?.currency_code
          ? { currency: product.product_variants[0].currency_code }
          : {}),
      } satisfies WidgetRow,
    ];
  }
  return out;
};

export const DEFAULT_LOADERS: SourceLoaders = {
  collection: loadCollectionSource,
  taxonomy: loadTaxonomySource,
  manual: loadCollectionSource,
  recommendation: loadRecommendationSource,
  variants: loadVariantSource,
  reviews: loadReviewSource,
  qna: loadQnaSource,
  facets: loadFacetsSource,
  order: loadOrderSource,
  specs: loadSpecsSource,
  finance: loadFinanceSource,
  product: loadProductSource,
};

/* ------------------------------------------------- Phase 7 resolver fail-safe */

/** A source that has not answered by now is treated as unavailable. */
export const RESOLVER_TIMEOUT_MS = 2500;

/**
 * Last successful payload per `tenant · request key`. A source that times out
 * or throws serves the previous good rows instead of an empty rail, so a
 * transient database blip degrades to slightly stale content rather than a page
 * that looks empty. Bounded, per-isolate, and never crosses tenants because the
 * tenant id is the first key segment.
 */
const LAST_GOOD_MAX = 500;
const lastGood = new Map<string, WidgetRow[]>();

const lastGoodKey = (tenantId: string, requestKey: string) =>
  `${tenantId}\u0000${requestKey}`;

function rememberLastGood(tenantId: string, rows: Record<string, WidgetRow[]>) {
  for (const [key, value] of Object.entries(rows)) {
    if (!value?.length) continue;
    const composed = lastGoodKey(tenantId, key);
    lastGood.delete(composed);
    lastGood.set(composed, value);
  }
  while (lastGood.size > LAST_GOOD_MAX) {
    const oldest = lastGood.keys().next().value;
    if (oldest === undefined) break;
    lastGood.delete(oldest);
  }
}

/** Cached last-good rows for one request, or `[]` when nothing was ever good. */
export function lastGoodRows(
  tenantId: string,
  requestKey: string,
): WidgetRow[] {
  return lastGood.get(lastGoodKey(tenantId, requestKey)) ?? [];
}

/** Test/ops seam: drop the fallback cache (a whole tenant, or everything). */
export function clearLastGood(tenantId?: string) {
  if (!tenantId) return void lastGood.clear();
  for (const key of [...lastGood.keys()])
    if (key.startsWith(`${tenantId}\u0000`)) lastGood.delete(key);
}

class ResolverTimeout extends Error {
  constructor() {
    super("widget resolver timed out");
    this.name = "ResolverTimeout";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ResolverTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

/**
 * Resolve a whole template's data in one pass. Unknown or unimplemented
 * sources resolve to an empty array — a missing loader never throws and never
 * blanks the page. A slow or failing source falls back to its last good
 * payload, and only then to empty rows.
 */
export async function resolveWidgetData(
  merchantId: string,
  bundle: WidgetDataBundle,
  loaders: SourceLoaders = DEFAULT_LOADERS,
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<WidgetDataMap> {
  if (bundle.requests.length === 0) return {};
  // Phase 8.4: isolation is enforced here, at the only place that turns a
  // template into queries. The renderer never sees a tenant id at all.
  const tenantId = assertTenantId(merchantId, "resolveWidgetData");
  const startedAt = Date.now();
  const timeoutMs = opts.timeoutMs ?? RESOLVER_TIMEOUT_MS;

  // Request-scoped dedupe: the bundle is already de-duplicated, but a caller
  // may hand-assemble requests, so collapse by key again before querying.
  const unique = new Map<string, WidgetDataRequest>();
  for (const request of bundle.requests)
    if (!unique.has(request.key)) unique.set(request.key, request);

  const grouped = new Map<WidgetDataSource, WidgetDataRequest[]>();
  for (const request of unique.values()) {
    const list = grouped.get(request.source);
    if (list) list.push(request);
    else grouped.set(request.source, [request]);
  }

  const map: WidgetDataMap = {};
  const results = await Promise.all(
    [...grouped.entries()].map(async ([source, requests]) => {
      const loader = loaders[source];
      if (!loader)
        return Object.fromEntries(
          requests.map((r) => [r.key, [] as WidgetRow[]]),
        );
      const sourceStarted = Date.now();
      try {
        const rows = await withTimeout(
          loader(tenantId, requests, { base: opts.base ?? "" }),
          timeoutMs,
        );
        observe("framique_widget_resolver_ms", Date.now() - sourceStarted, {
          source,
        });
        incr("framique_widget_resolver_total", { source, outcome: "ok" });
        rememberLastGood(tenantId, rows);
        return rows;
      } catch (error) {
        const outcome = error instanceof ResolverTimeout ? "timeout" : "error";
        observe("framique_widget_resolver_ms", Date.now() - sourceStarted, {
          source,
        });
        incr("framique_widget_resolver_total", { source, outcome });
        // A failing source degrades to its last good payload, and to empty rows
        // only when there has never been one — never to a thrown render.
        const fallback = Object.fromEntries(
          requests.map((r) => [r.key, lastGoodRows(tenantId, r.key)]),
        );
        if (Object.values(fallback).some((rows) => rows.length > 0)) {
          incr("framique_widget_resolver_total", {
            source,
            outcome: "last_good",
          });
        }
        return fallback;
      }
    }),
  );
  for (const chunk of results) Object.assign(map, chunk);
  for (const request of unique.values()) map[request.key] ??= [];
  observe("framique_widget_resolver_ms", Date.now() - startedAt, {
    source: "batch",
  });
  return map;
}

/** Convenience for storefront loaders that already hold a parsed template. */
export async function resolveTemplateData(
  merchantId: string,
  bundle: WidgetDataBundle,
  opts: { timeoutMs?: number; base?: string } = {},
) {
  return resolveWidgetData(merchantId, bundle, undefined, opts);
}
