import { publicClient } from "./pricing.server";
import { log, observe } from "./observability.server";
import {
  templateOf,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "./builder-ast";
import { publishedTheme } from "./themes.server";

/**
 * Public variant rows for storefront reads.
 *
 * `product_variants` currently exposes no public/anon SELECT policy (only
 * tenant member reads), so the anon join inside product queries resolves to
 * `[]` for shoppers: every price renders 0.00 and everything shows out of
 * stock. Until the public policy lands via migrations (`20260919050000`),
 * this fetches the same rows through the service role. Exposure is identical
 * to the intended policy: callers only ever pass IDs of active products of
 * an already-verified active merchant. Never throws — on failure the page
 * keeps today's behavior (empty variants) instead of 500ing the storefront.
 */
export type PublicVariant = {
  product_id: string;
  id: string;
  name: string;
  sku: string | null;
  price_amount_minor_int: number;
  compare_at_amount_minor_int: number | null;
  stock_quantity: number;
};

export function mergePublicVariants<
  P extends { id: string; product_variants?: unknown },
>(
  products: P[],
  rows: PublicVariant[],
): (P & { product_variants: PublicVariant[] })[] {
  const byProduct = new Map<string, PublicVariant[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  return products.map((p) => ({
    ...p,
    product_variants: byProduct.get(p.id) ?? [],
  }));
}

export async function fetchPublicVariants(
  productIds: string[],
): Promise<PublicVariant[]> {
  return fetchPublicVariantsBy("product_id", productIds);
}

/** Same rows by variant id (cart/checkout lines reference variants). */
export async function fetchPublicVariantsById(
  variantIds: string[],
): Promise<PublicVariant[]> {
  return fetchPublicVariantsBy("id", variantIds);
}

async function fetchPublicVariantsBy(
  column: "product_id" | "id",
  values: string[],
): Promise<PublicVariant[]> {
  if (values.length === 0) return [];
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("product_variants")
      .select(
        "product_id, id, name, sku, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity",
      )
      .in(column, values);
    if (error || !data) return [];
    return data as PublicVariant[];
  } catch {
    return [];
  }
}

/**
 * Published layout + tokens for a store template, or null when nothing is
 * published. Served from the tenant-keyed storefront cache, which the publish /
 * rollback / sweep paths purge, so a shopper never lands on a stale page.
 */
async function loadPublished(
  merchantId: string,
  template: TemplateKey = "index",
): Promise<{
  ast: ThemeAst;
  tokens: ThemeTokens;
  themeKey: string | null;
  versionId: string;
} | null> {
  // Phase 8.7: render time is tracked per template, which is the unit a
  // merchant experiences and the unit the cache is keyed by.
  const started = Date.now();
  const theme = await publishedTheme(publicClient(), merchantId);
  observe("framique_template_render_ms", Date.now() - started, { template });
  if (!theme) return null;
  const ast = templateOf(theme.templates, template);
  // A theme that publishes no header/footer for a secondary template (search,
  // cart, checkout) borrows the home template's chrome, so a shopper never
  // lands on a page without the store's navigation or its policy links.
  const home =
    template === "index" ? ast : templateOf(theme.templates, "index");
  const withChrome = {
    header: ast.header.length ? ast.header : home.header,
    main: ast.main,
    footer: ast.footer.length ? ast.footer : home.footer,
  };
  return {
    ast: withChrome,
    tokens: theme.tokens,
    themeKey: theme.themeKey,
    versionId: theme.versionId,
  };
}

/**
 * Published `page` template for a tenant, used by content pages.
 *
 * Phase 17: when the page pins a theme (`themeId`) that theme's published
 * `page` template wins; an unpublished or deleted pin falls back to the
 * store's active theme so the page still renders.
 */
export async function loadPageTemplate(
  merchantId: string,
  themeId?: string | null,
) {
  if (themeId) {
    const { publishedThemeById } = await import("./themes.server");
    const pinned = await publishedThemeById(
      publicClient(),
      merchantId,
      themeId,
    );
    if (pinned)
      return {
        ast: templateOf(pinned.templates, "page"),
        tokens: pinned.tokens,
        themeKey: pinned.themeKey,
        versionId: pinned.versionId,
      };
  }
  return loadPublished(merchantId, "page");
}

/**
 * Theme chrome for a functional storefront page (search, cart, checkout).
 *
 * These routes own their own data — the catalogue query, the live cart — so
 * all they need from the theme is the published layout, the tokens and the
 * tenant identity. Kept deliberately small: no catalogue read, no SEO join.
 */
export async function loadStoreChrome(slug: string, template: TemplateKey) {
  const db = publicClient();
  const { data: merchant } = await db
    .from("merchants")
    .select("id, name, slug, currency_code")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) return null;

  const [theme, siteKit, menus] = await Promise.all([
    loadPublished(merchant.id, template),
    import("./search-console.server").then((m) =>
      m.storefrontSiteKit(merchant.id),
    ),
    // Phase 16 T4: dashboard-designed nav menus ride every chrome payload so
    // the header/footer render the merchant's menus on every template.
    import("./menus/menu.server").then((m) => m.loadStoreMenus(merchant.id)),
  ]);

  // Installed plugins for footer mounts + placed app-blocks (fail-safe
  // to [] inside the helper, so a plugin read can never break the render).
  const { listStorefrontPlugins } = await import("./plugins.server");
  const installedPlugins = await listStorefrontPlugins(merchant.id);

  return {
    merchant,
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
    siteKit,
    menus,
    installedPlugins,
  };
}

/**
 * One published collection plus its products, wearing the theme's published
 * `collection` template. Falls back to the store's own chrome when the theme
 * publishes no collection sections.
 */
export async function loadStoreCollection(
  slug: string,
  collectionSlug: string,
) {
  const db = publicClient();
  const { data: merchant } = await db
    .from("merchants")
    .select("id, name, slug, currency_code")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) return null;

  const { data: collection } = await db
    .from("collections")
    .select("id, name, slug, description, collection_products(product_id)")
    .eq("merchant_id", merchant.id)
    .eq("slug", collectionSlug)
    .eq("is_published", true)
    .maybeSingle();
  if (!collection) return null;

  const ids = (collection.collection_products ?? []).map((cp) => cp.product_id);
  const [{ data: products }, theme, { data: settings }] = await Promise.all([
    ids.length
      ? db
          .from("products")
          .select("id, title, slug, description, image_url")
          .eq("merchant_id", merchant.id)
          .eq("status", "active")
          .in("id", ids)
          .limit(60)
      : Promise.resolve({ data: [] as never[] }),
    loadPublished(merchant.id, "collection"),
    db
      .from("merchant_settings")
      .select("tagline")
      .eq("merchant_id", merchant.id)
      .maybeSingle(),
  ]);

  const { resolveSeo } = await import("./seo.server");
  const { resolveSeoWithTemplate } = await import("./template-seo.server");
  const entitySeo =
    (await resolveSeo(merchant.id, "collection", collection.id)) ??
    (await resolveSeo(merchant.id, "store", null));
  const seo = await resolveSeoWithTemplate(
    merchant.id,
    "collection",
    entitySeo,
  );

  const { storefrontSiteKit } = await import("./search-console.server");
  const siteKit = await storefrontSiteKit(merchant.id);
  const { loadStoreMenus } = await import("./menus/menu.server");
  const { listStorefrontPlugins } = await import("./plugins.server");

  return {
    merchant,
    collection: {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
    },
    products: mergePublicVariants(
      products ?? [],
      await fetchPublicVariants((products ?? []).map((p) => p.id)),
    ),
    settings,
    seo,
    siteKit,
    menus: await loadStoreMenus(merchant.id),
    installedPlugins: await listStorefrontPlugins(merchant.id),
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
  };
}

export type StorefrontPreview = { merchantId: string; themeId: string } | null;

/**
 * Resolve the index theme, preferring a verified draft preview. The preview
 * token is validated by the caller; the merchant binding is re-checked here
 * so a token minted for one tenant can never render another tenant's draft.
 * Preview responses must never enter the shared storefront cache (see
 * withStorefrontCache) and are always noindex (see the route head).
 */
async function resolveIndexTheme(
  merchantId: string,
  preview: StorefrontPreview,
) {
  if (preview && preview.merchantId === merchantId) {
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { previewTheme } = await import("./themes.server");
      const { templateOf } = await import("./builder-ast");
      const draft = await previewTheme(
        supabaseAdmin as never,
        merchantId,
        preview.themeId,
      );
      if (draft) {
        return {
          ast: templateOf(draft.templates, "index"),
          tokens: draft.tokens,
          themeKey: draft.themeKey,
          versionId: null as string | null,
          preview: true as const,
        };
      }
    } catch (err) {
      // Any preview failure degrades to the published theme, never to nothing —
      // but the reason is logged: silent fallback hides data bugs (Sep 2026).
      // NOTE: log is a STATIC import here. Never switch this to a dynamic
      // import: Rolldown mangles dynamic re-export chains (observability's
      // `log` alias resolved to the wrong export at runtime), which would
      // throw inside this catch and mask the original error.
      try {
        log("warn", "storefront.preview_failed", {
          message: String(err).slice(0, 200),
        });
      } catch {
        // Logging must never break the storefront.
      }
    }
  }
  const published = await loadPublished(merchantId, "index");
  return published ? { ...published, preview: false as const } : null;
}

export async function loadStorefront(
  slug: string,
  preview: StorefrontPreview = null,
) {
  // Perf batch: the homepage costs ~13 DB round trips. Cache the whole
  // payload under the tenant prefix (purgeStorefront clears it on
  // publish/install/import). Preview drafts are private — never cached.
  // The one extra merchant lookup per call replaces thirteen on a hit.
  if (!preview) {
    const db = publicClient();
    const { data: merchant } = await db
      .from("merchants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return null;
    const { cached } = await import("./cache.server");
    const { tenantCachePrefix } = await import("./storefront-cache");
    return cached(
      `${tenantCachePrefix(merchant.id)}index`,
      60,
      () => loadStorefrontUncached(slug, null),
      { shared: true, staleSeconds: 300 },
    );
  }
  return loadStorefrontUncached(slug, preview);
}

async function loadStorefrontUncached(
  slug: string,
  preview: StorefrontPreview = null,
) {
  const db = publicClient();
  const { data: merchant, error } = await db
    .from("merchants")
    .select("id, name, slug, currency_code, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!merchant) return null;

  const [
    { data: settings },
    { data: products },
    { data: categories },
    { data: collections },
    theme,
  ] = await Promise.all([
    db
      .from("merchant_settings")
      .select(
        "tagline, cod_enabled, mfs_enabled, shipping_flat_minor_int, free_shipping_threshold_minor_int, setup_steps",
      )
      .eq("merchant_id", merchant.id)
      .maybeSingle(),
    db
      .from("products")
      .select("id, title, slug, description, image_url, category_id")
      .eq("merchant_id", merchant.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(48),
    db
      .from("categories")
      .select("id, name, slug")
      .eq("merchant_id", merchant.id)
      .order("name"),
    db
      .from("collections")
      .select("id, name, slug, collection_products(product_id)")
      .eq("merchant_id", merchant.id)
      .eq("is_published", true)
      .order("position"),
    resolveIndexTheme(merchant.id, preview),
  ]);

  // Phase 3: entity SEO first, the builder's per-template record behind it.
  // Never throws: a failed template read leaves the entity override in charge.
  // Perf batch 2: the four merchant-scoped resolutions below are independent
  // of each other — run them concurrently instead of sequentially.
  const { resolveSeo } = await import("./seo.server");
  const { resolveSeoWithTemplate } = await import("./template-seo.server");
  const { publishedCustomCode } = await import("./custom-code.server");
  const { storefrontSiteKit } = await import("./search-console.server");
  const { collectWidgetRequests, EMPTY_BUNDLE } = await import("./widget-data");
  const widgetBundle = theme?.ast
    ? collectWidgetRequests(theme.ast)
    : EMPTY_BUNDLE;
  const [seo, customCode, siteKit, widgetData, menus] = await Promise.all([
    (async () =>
      resolveSeoWithTemplate(
        merchant.id,
        "index",
        await resolveSeo(merchant.id, "store", null),
      ))(),
    // Phase 4: the published custom-code snapshot for the live theme version.
    // Null when nothing is published, the merchant disabled it, or the platform
    // owner pulled the kill switch for this tenant.
    publishedCustomCode(merchant.id),
    // Phase 5: verification metas + the consent-gated analytics plan for this
    // tenant. Cached, never throws, and never carries the chosen Search Console
    // property into a shopper's browser.
    storefrontSiteKit(merchant.id),
    // Phase 0.3: every data widget in the published layout is resolved here, in
    // one batched call, and shipped inside the SSR payload — the client reads
    // rows from the map instead of refetching on hydrate.
    (async () => {
      if (widgetBundle.requests.length === 0) return {};
      const { resolveWidgetData } = await import("./widget-data.server");
      const { currentRequestHost, storeLinkBase } =
        await import("./storefront-host.server");
      return resolveWidgetData(merchant.id, widgetBundle, undefined, {
        base: storeLinkBase(currentRequestHost(), merchant.slug),
      });
    })(),
    // Phase 16 T4: dashboard-designed nav menus, canonical (root-shaped)
    // hrefs — each render site rebases for its host shape client-side.
    import("./menus/menu.server").then((m) => m.loadStoreMenus(merchant.id)),
  ]);

  // Perf batch: variant rows and homepage slug are independent — fetch
  // together instead of serially.
  const [variantRows, homepageSlug] = await Promise.all([
    fetchPublicVariants((products ?? []).map((p) => p.id)),
    resolveHomepageSlug(
      db,
      merchant.id,
      (settings as { setup_steps?: unknown } | null)?.setup_steps,
    ),
  ]);
  let resolvedProducts = mergePublicVariants(products ?? [], variantRows);
  let resolvedCategories = categories ?? [];
  let resolvedCollections = collections ?? [];

  if (
    resolvedProducts.length === 0 ||
    resolvedCategories.length === 0 ||
    resolvedCollections.length === 0
  ) {
    const { demoCatalogFor } = await import("./demo-catalog");
    const demo = demoCatalogFor(theme?.themeKey ?? "bazaar");
    if (resolvedProducts.length === 0) {
      resolvedProducts = demo.products.map((dp, idx) => ({
        id: `demo-${dp.slug}`,
        title: dp.title,
        slug: dp.slug,
        description: dp.description,
        image_url: dp.image_url ?? null,
        category_id: null,
        product_variants: dp.variants.map((v, vIdx) => ({
          id: `demo-var-${dp.slug}-${vIdx}`,
          name: v.name,
          price_amount_minor_int: v.price,
          compare_at_amount_minor_int: v.compare_at ?? null,
          stock_quantity: v.stock ?? 10,
        })),
      })) as any;
    }
    if (resolvedCategories.length === 0) {
      resolvedCategories = demo.categories.map((c) => ({
        id: `demo-${c.slug}`,
        name: c.name,
        slug: c.slug,
      })) as any;
    }
    if (resolvedCollections.length === 0) {
      resolvedCollections = demo.collections.map((c) => ({
        id: `demo-${c.slug}`,
        name: c.name,
        slug: c.slug,
        collection_products: [],
      })) as any;
    }
  }

  // CMS-designated homepage: resolved alongside variants above. Unset,
  // draft, trashed or deleted falls back to the theme index template
  // below — never a broken `/`.

  // Installed plugins for footer mounts + placed app-blocks (fail-safe
  // to [] inside the helper, so a plugin read can never break the render).
  const { listStorefrontPlugins } = await import("./plugins.server");
  const installedPlugins = await listStorefrontPlugins(merchant.id);

  return {
    merchant,
    seo,
    settings,
    products: resolvedProducts,
    categories: resolvedCategories,
    collections: resolvedCollections,
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
    preview: theme?.preview ?? false,
    widgetBundle,
    widgetData,
    customCode,
    siteKit,
    homepageSlug,
    menus,
    installedPlugins,
  };
}

/** Slug of the merchant's designated homepage page, when it is publicly visible. */
async function resolveHomepageSlug(
  db: ReturnType<typeof publicClient>,
  merchantId: string,
  setupSteps: unknown,
): Promise<string | null> {
  const raw =
    setupSteps && typeof setupSteps === "object"
      ? (setupSteps as Record<string, unknown>).homepage_page_id
      : null;
  if (
    typeof raw !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  )
    return null;
  try {
    const { data: page } = await db
      .from("storefront_pages")
      .select("slug")
      .eq("merchant_id", merchantId)
      .eq("id", raw)
      .eq("is_published", true)
      .neq("status", "trash")
      .is("deleted_at", null)
      .maybeSingle();
    return (page as { slug?: unknown } | null)?.slug &&
      typeof (page as { slug: unknown }).slug === "string"
      ? ((page as { slug: string }).slug as string)
      : null;
  } catch {
    return null;
  }
}

export async function loadStoreProduct(slug: string, productSlug: string) {
  const db = publicClient();
  const { data: merchant } = await db
    .from("merchants")
    .select("id, name, slug, currency_code")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) return null;

  const { data: product } = await db
    .from("products")
    .select("id, title, slug, description, image_url")
    .eq("merchant_id", merchant.id)
    .eq("slug", productSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!product) return null;
  const [productResolved] = mergePublicVariants(
    [product],
    await fetchPublicVariants([product.id]),
  );

  // Phase 7.2: reviews and delivery terms feed the Product/Offer graph, so the
  // rich result reflects the same numbers the page shows a shopper.
  const [{ data: settings }, theme, { data: reviews }] = await Promise.all([
    db
      .from("merchant_settings")
      .select(
        "cod_enabled, mfs_enabled, shipping_flat_minor_int, free_shipping_threshold_minor_int",
      )
      .eq("merchant_id", merchant.id)
      .maybeSingle(),
    loadPublished(merchant.id, "product"),
    db
      .from("product_reviews")
      .select("author_name, title, body, rating, published_at")
      .eq("merchant_id", merchant.id)
      .eq("product_id", product.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(20),
  ]);

  const { resolveSeo } = await import("./seo.server");
  const { resolveSeoWithTemplate } = await import("./template-seo.server");
  const entitySeo =
    (await resolveSeo(merchant.id, "product", product.id)) ??
    (await resolveSeo(merchant.id, "store", null));
  const seo = await resolveSeoWithTemplate(merchant.id, "product", entitySeo);

  const { storefrontSiteKit } = await import("./search-console.server");
  const siteKit = await storefrontSiteKit(merchant.id);
  const { loadStoreMenus } = await import("./menus/menu.server");
  const { listStorefrontPlugins } = await import("./plugins.server");

  return {
    merchant,
    product: productResolved,
    seo,
    settings,
    siteKit,
    menus: await loadStoreMenus(merchant.id),
    installedPlugins: await listStorefrontPlugins(merchant.id),
    reviews: (reviews ?? []).map((r) => ({
      author: r.author_name ?? "",
      rating: Number(r.rating) || 0,
      title: r.title,
      body: r.body,
      published_at: r.published_at,
    })),
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
  };
}

/** Platform-level: slug of the store featured as the public demo. Never used to
 * resolve a shopper's tenant — storefront tenancy always comes from the URL slug. */
export async function featuredStoreSlug() {
  const db = publicClient();
  const { data } = await db
    .from("merchants")
    .select("slug")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.slug ?? null;
}

/** Legacy single-shop URL support: derive the owning tenant from the record itself. */
export async function locateProduct(productId: string) {
  const db = publicClient();
  const { data: product } = await db
    .from("products")
    .select("slug, merchant_id")
    .eq("id", productId)
    .eq("status", "active")
    .maybeSingle();
  if (!product) return null;

  const { data: merchant } = await db
    .from("merchants")
    .select("slug")
    .eq("id", product.merchant_id)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) return null;

  return { storeSlug: merchant.slug, productSlug: product.slug };
}

export async function locateOrder(orderId: string) {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("merchant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const db = publicClient();
  const { data: merchant } = await db
    .from("merchants")
    .select("slug")
    .eq("id", order.merchant_id)
    .maybeSingle();
  return merchant?.slug ?? null;
}
