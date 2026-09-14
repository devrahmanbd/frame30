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
  type WidgetDataBundle,
  type WidgetDataMap,
  type WidgetDataRequest,
  type WidgetRow,
} from "./widget-data";
import type { WidgetDataSource } from "./widget-registry";

export type SourceLoader = (
  merchantId: string,
  requests: WidgetDataRequest[],
) => Promise<Record<string, WidgetRow[]>>;

export type SourceLoaders = Partial<Record<WidgetDataSource, SourceLoader>>;

type VariantRow = {
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
};

function minPrice(variants: VariantRow[]): number {
  if (variants.length === 0) return 0;
  return Math.min(...variants.map((v) => Number(v.price_amount_minor_int) || 0));
}

function sortProducts(rows: ProductRow[], sort: string): ProductRow[] {
  const out = [...rows];
  if (sort === "price_asc") out.sort((a, b) => minPrice(a.product_variants ?? []) - minPrice(b.product_variants ?? []));
  else if (sort === "price_desc") out.sort((a, b) => minPrice(b.product_variants ?? []) - minPrice(a.product_variants ?? []));
  else if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out;
}

/**
 * Products for every `collection`-sourced widget. A single query fetches the
 * widest window any request asked for; per-request filtering, sorting and
 * slicing then happen in memory.
 */
const loadCollectionSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const window = Math.min(
    MAX_WIDGET_ROWS,
    Math.max(...requests.map((r) => Number(r.params["limit"]) || 12)),
  );
  const wantsHandles = requests.some((r) => typeof r.params["collection"] === "string");

  const [{ data: products }, collections] = await Promise.all([
    db
      .from("products")
      .select(
        "id, title, slug, image_url, created_at, product_variants(price_amount_minor_int, compare_at_amount_minor_int, stock_quantity), collection_products(collection_id)",
      )
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(MAX_WIDGET_ROWS),
    wantsHandles
      ? db.from("collections").select("id, slug").eq("merchant_id", merchantId).eq("is_published", true)
      : Promise.resolve({ data: [] as { id: string; slug: string }[] }),
  ]);

  const handleToId = new Map((collections.data ?? []).map((c) => [c.slug, c.id]));
  const rows = (products ?? []) as ProductRow[];
  const out: Record<string, WidgetRow[]> = {};

  for (const request of requests) {
    const limit = Math.min(MAX_WIDGET_ROWS, Math.max(1, Number(request.params["limit"]) || window));
    const handle = request.params["collection"];
    let scoped = rows;
    if (typeof handle === "string") {
      const collectionId = handleToId.get(handle);
      scoped = collectionId
        ? rows.filter((p) => (p.collection_products ?? []).some((cp) => cp.collection_id === collectionId))
        : [];
    }
    out[request.key] = sortProducts(scoped, String(request.params["sort"] ?? "newest"))
      .slice(0, limit)
      .map((p) => {
        const variants = p.product_variants ?? [];
        const compare = variants
          .map((v) => Number(v.compare_at_amount_minor_int) || 0)
          .filter((n) => n > 0);
        return {
          id: p.id,
          title: p.title,
          href: p.slug,
          imageUrl: p.image_url,
          priceMinor: minPrice(variants),
          ...(compare.length ? { compareAtMinor: Math.max(...compare) } : {}),
          inStock: variants.some((v) => v.stock_quantity > 0),
        } satisfies WidgetRow;
      });
  }
  return out;
};


/**
 * Brands for `taxonomy` requests that ask for `kind=brand`. Collections and
 * brands share the loader so a page with both still costs one round trip.
 */
const loadBrands = async (merchantId: string, requests: WidgetDataRequest[]) => {
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
    const limit = Math.min(MAX_WIDGET_ROWS, Math.max(1, Number(request.params["limit"]) || 12));
    out[request.key] = rows.slice(0, limit).map((b) => ({
      id: b.id,
      title: b.name,
      href: b.slug,
      imageUrl: (b as { logo_url?: string | null }).logo_url ?? null,
    }));
  }
  return out;
};

/** Published collections for every `taxonomy`-sourced widget, in one query. */
const loadTaxonomySource: SourceLoader = async (merchantId, requests) => {
  const brandRequests = requests.filter((r) => r.params["kind"] === "brand");
  const collectionRequests = requests.filter((r) => r.params["kind"] !== "brand");
  if (brandRequests.length > 0) {
    const [brands, rest] = await Promise.all([
      loadBrands(merchantId, brandRequests),
      collectionRequests.length > 0
        ? loadTaxonomySource(merchantId, collectionRequests)
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
  const rows = data ?? [];
  const out: Record<string, WidgetRow[]> = {};
  for (const request of requests) {
    const limit = Math.min(MAX_WIDGET_ROWS, Math.max(1, Number(request.params["limit"]) || 8));
    out[request.key] = rows.slice(0, limit).map((c) => ({
      id: c.id,
      title: c.name,
      href: c.slug,
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
const loadVariantSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const handles = [...new Set(requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean))];
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
    const variants = [...(product?.product_variants ?? [])].sort((a, b) => a.position - b.position);
    out[request.key] = variants.slice(0, MAX_WIDGET_ROWS).map((v) => ({
      id: v.id,
      title: product?.title ?? v.name,
      options: v.name,
      href: product?.slug,
      imageUrl: product?.image_url ?? null,
      priceMinor: Number(v.price_amount_minor_int) || 0,
      ...(Number(v.compare_at_amount_minor_int) > 0
        ? { compareAtMinor: Number(v.compare_at_amount_minor_int) }
        : {}),
      currency: v.currency_code,
      inStock: v.stock_quantity > 0,
      count: v.stock_quantity,
    } satisfies WidgetRow));
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
  const handles = [...new Set(requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean))];
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
        .select("id, product_id, author_name, title, body, rating, verified_purchase, created_at")
        .eq("merchant_id", merchantId)
        .eq("status", "published")
        .in("product_id", ids)
        .order("created_at", { ascending: false })
        .limit(MAX_WIDGET_ROWS * 2)
    : { data: [] as never[] };
  for (const request of requests) {
    const productId = idBySlug.get(String(request.params["handle"] ?? ""));
    const rows = (reviews ?? []).filter((r) => r.product_id === productId);
    out[request.key] = rows.slice(0, MAX_WIDGET_ROWS).map((r) => ({
      id: r.id,
      title: r.title || r.author_name,
      subtitle: r.author_name,
      body: r.body,
      rating: Number(r.rating) || 0,
      verified: r.verified_purchase === true,
      date: r.created_at,
    } satisfies WidgetRow));
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
const loadFacetsSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const [{ data: products }, { data: categories }] = await Promise.all([
    db
      .from("products")
      .select("id, category_id, product_kind, product_variants(stock_quantity)")
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .limit(500),
    db.from("categories").select("id, name, slug").eq("merchant_id", merchantId).order("name"),
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
    if (product.category_id) byCategory.set(product.category_id, (byCategory.get(product.category_id) ?? 0) + 1);
    const kind = product.product_kind ?? "physical";
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    if ((product.product_variants ?? []).some((v) => v.stock_quantity > 0)) inStock += 1;
  }

  const categoryRows: WidgetRow[] = [...byCategory.entries()]
    .flatMap(([id, count]): WidgetRow[] => {
      const category = catById.get(id);
      if (!category) return [];
      return [{ id: category.slug, title: category.name, href: category.slug, count, subtitle: "category" }];
    })
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const kindRows: WidgetRow[] = [...byKind.entries()]
    .map(([kind, count]) => ({ id: kind, title: kind, href: kind, count, subtitle: "kind" }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const stockRow: WidgetRow = { id: "1", title: "in_stock", count: inStock, subtitle: "stock" };

  const out: Record<string, WidgetRow[]> = {};
  for (const request of requests) {
    const limit = Math.min(MAX_WIDGET_ROWS, Math.max(1, Number(request.params["limit"]) || 12));
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
  const out: Record<string, WidgetRow[]> = Object.fromEntries(requests.map((r) => [r.key, [] as WidgetRow[]]));
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
  const handles = [...new Set(requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean))];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(requests.map((r) => [r.key, [] as WidgetRow[]]));
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
        const value = typeof row.value === "string" ? row.value : JSON.stringify(row.value ?? "");
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
  const handles = [...new Set(requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean))];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(requests.map((r) => [r.key, [] as WidgetRow[]]));
  if (handles.length === 0) return out;

  const { data: products } = await db
    .from("products")
    .select("id, slug, product_variants(price_amount_minor_int, currency_code, position)")
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
      const bp = Number(typeof row.value === "string" ? row.value.replace(/[^\d.-]/g, "") : row.value);
      return { bank: (bank ?? "").trim(), tenure: Number(tenure), bp: Number.isFinite(bp) ? bp : 0 };
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
      .map((plan) => ({
        id: emiPlanKey(plan),
        title: plan.bank,
        options: String(plan.tenureMonths),
        priceMinor: plan.perMonthMinor,
        compareAtMinor: plan.totalMinor,
        ...(currency ? { currency } : {}),
        count: plan.tenureMonths,
        unit: "months",
      } satisfies WidgetRow));
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
const loadProductSource: SourceLoader = async (merchantId, requests) => {
  const db = publicClient();
  const handles = [...new Set(requests.map((r) => String(r.params["handle"] ?? "")).filter(Boolean))];
  const out: Record<string, WidgetRow[]> = Object.fromEntries(requests.map((r) => [r.key, [] as WidgetRow[]]));
  if (handles.length === 0) return out;

  const { data: products } = await db
    .from("products")
    .select("id, slug, title, image_url, product_variants(price_amount_minor_int, currency_code)")
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
        href: `/products/${product.slug}`,
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

const lastGoodKey = (tenantId: string, requestKey: string) => `${tenantId}\u0000${requestKey}`;

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
export function lastGoodRows(tenantId: string, requestKey: string): WidgetRow[] {
  return lastGood.get(lastGoodKey(tenantId, requestKey)) ?? [];
}

/** Test/ops seam: drop the fallback cache (a whole tenant, or everything). */
export function clearLastGood(tenantId?: string) {
  if (!tenantId) return void lastGood.clear();
  for (const key of [...lastGood.keys()]) if (key.startsWith(`${tenantId}\u0000`)) lastGood.delete(key);
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
  opts: { timeoutMs?: number } = {},
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
  for (const request of bundle.requests) if (!unique.has(request.key)) unique.set(request.key, request);

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
      if (!loader) return Object.fromEntries(requests.map((r) => [r.key, [] as WidgetRow[]]));
      const sourceStarted = Date.now();
      try {
        const rows = await withTimeout(loader(tenantId, requests), timeoutMs);
        observe("framique_widget_resolver_ms", Date.now() - sourceStarted, { source });
        incr("framique_widget_resolver_total", { source, outcome: "ok" });
        rememberLastGood(tenantId, rows);
        return rows;
      } catch (error) {
        const outcome = error instanceof ResolverTimeout ? "timeout" : "error";
        observe("framique_widget_resolver_ms", Date.now() - sourceStarted, { source });
        incr("framique_widget_resolver_total", { source, outcome });
        // A failing source degrades to its last good payload, and to empty rows
        // only when there has never been one — never to a thrown render.
        const fallback = Object.fromEntries(
          requests.map((r) => [r.key, lastGoodRows(tenantId, r.key)]),
        );
        if (Object.values(fallback).some((rows) => rows.length > 0)) {
          incr("framique_widget_resolver_total", { source, outcome: "last_good" });
        }
        return fallback;
      }
    }),
  );
  for (const chunk of results) Object.assign(map, chunk);
  for (const request of unique.values()) map[request.key] ??= [];
  observe("framique_widget_resolver_ms", Date.now() - startedAt, { source: "batch" });
  return map;
}

/** Convenience for storefront loaders that already hold a parsed template. */
export async function resolveTemplateData(merchantId: string, bundle: WidgetDataBundle) {
  return resolveWidgetData(merchantId, bundle);
}

