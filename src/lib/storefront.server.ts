import { publicClient } from "./pricing.server";
import { observe } from "./observability.server";
import { templateOf, type TemplateKey, type ThemeAst, type ThemeTokens } from "./builder-ast";
import { publishedTheme } from "./themes.server";

/**
 * Published layout + tokens for a store template, or null when nothing is
 * published. Served from the tenant-keyed storefront cache, which the publish /
 * rollback / sweep paths purge, so a shopper never lands on a stale page.
 */
async function loadPublished(
  merchantId: string,
  template: TemplateKey = "index",
): Promise<{ ast: ThemeAst; tokens: ThemeTokens; themeKey: string | null; versionId: string } | null> {
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
  const home = template === "index" ? ast : templateOf(theme.templates, "index");
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
export async function loadPageTemplate(merchantId: string, themeId?: string | null) {
  if (themeId) {
    const { publishedThemeById } = await import("./themes.server");
    const pinned = await publishedThemeById(publicClient(), merchantId, themeId);
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

  const [theme, siteKit] = await Promise.all([
    loadPublished(merchant.id, template),
    import("./search-console.server").then((m) => m.storefrontSiteKit(merchant.id)),
  ]);

  return {
    merchant,
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
    siteKit,
  };
}

/**
 * One published collection plus its products, wearing the theme's published
 * `collection` template. Falls back to the store's own chrome when the theme
 * publishes no collection sections.
 */
export async function loadStoreCollection(slug: string, collectionSlug: string) {
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
          .select(
            "id, title, slug, description, image_url, product_variants(id, name, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity)",
          )
          .eq("merchant_id", merchant.id)
          .eq("status", "active")
          .in("id", ids)
          .limit(60)
      : Promise.resolve({ data: [] as never[] }),
    loadPublished(merchant.id, "collection"),
    db.from("merchant_settings").select("tagline").eq("merchant_id", merchant.id).maybeSingle(),
  ]);

  const { resolveSeo } = await import("./seo.server");
  const { resolveSeoWithTemplate } = await import("./template-seo.server");
  const entitySeo =
    (await resolveSeo(merchant.id, "collection", collection.id)) ??
    (await resolveSeo(merchant.id, "store", null));
  const seo = await resolveSeoWithTemplate(merchant.id, "collection", entitySeo);

  const { storefrontSiteKit } = await import("./search-console.server");
  const siteKit = await storefrontSiteKit(merchant.id);

  return {
    merchant,
    collection: { id: collection.id, name: collection.name, slug: collection.slug, description: collection.description },
    products: products ?? [],
    settings,
    seo,
    siteKit,
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
  };
}

export async function loadStorefront(slug: string) {
  const db = publicClient();
  const { data: merchant, error } = await db
    .from("merchants")
    .select("id, name, slug, currency_code, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!merchant) return null;

  const [{ data: settings }, { data: products }, { data: categories }, { data: collections }, theme] =
    await Promise.all([
      db
        .from("merchant_settings")
        .select("tagline, cod_enabled, mfs_enabled, shipping_flat_minor_int, free_shipping_threshold_minor_int")
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
      db
        .from("products")
        .select("id, title, slug, description, image_url, category_id, product_variants(id, name, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity)")
        .eq("merchant_id", merchant.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(48),
      db.from("categories").select("id, name, slug").eq("merchant_id", merchant.id).order("name"),
      db
        .from("collections")
        .select("id, name, slug, collection_products(product_id)")
        .eq("merchant_id", merchant.id)
        .eq("is_published", true)
        .order("position"),
      loadPublished(merchant.id, "index"),
    ]);

  // Phase 3: entity SEO first, the builder's per-template record behind it.
  // Never throws: a failed template read leaves the entity override in charge.
  const { resolveSeo } = await import("./seo.server");
  const { resolveSeoWithTemplate } = await import("./template-seo.server");
  const seo = await resolveSeoWithTemplate(
    merchant.id,
    "index",
    await resolveSeo(merchant.id, "store", null),
  );

  // Phase 4: the published custom-code snapshot for the live theme version.
  // Null when nothing is published, the merchant disabled it, or the platform
  // owner pulled the kill switch for this tenant.
  const { publishedCustomCode } = await import("./custom-code.server");
  const customCode = await publishedCustomCode(merchant.id);

  // Phase 5: verification metas + the consent-gated analytics plan for this
  // tenant. Cached, never throws, and never carries the chosen Search Console
  // property into a shopper's browser.
  const { storefrontSiteKit } = await import("./search-console.server");
  const siteKit = await storefrontSiteKit(merchant.id);

  // Phase 0.3: every data widget in the published layout is resolved here, in
  // one batched call, and shipped inside the SSR payload — the client reads
  // rows from the map instead of refetching on hydrate.
  const { collectWidgetRequests, EMPTY_BUNDLE } = await import("./widget-data");
  const widgetBundle = theme?.ast ? collectWidgetRequests(theme.ast) : EMPTY_BUNDLE;
  let widgetData = {};
  if (widgetBundle.requests.length > 0) {
    const { resolveWidgetData } = await import("./widget-data.server");
    widgetData = await resolveWidgetData(merchant.id, widgetBundle);
  }

  return {
    merchant,
    seo,
    settings,
    products: products ?? [],
    categories: categories ?? [],
    collections: collections ?? [],
    ast: theme?.ast ?? null,
    tokens: theme?.tokens ?? null,
    themeKey: theme?.themeKey ?? null,
    themeVersionId: theme?.versionId ?? null,
    widgetBundle,
    widgetData,
    customCode,
    siteKit,
  };
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
    .select("id, title, slug, description, image_url, product_variants(id, name, sku, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity)")
    .eq("merchant_id", merchant.id)
    .eq("slug", productSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!product) return null;

  // Phase 7.2: reviews and delivery terms feed the Product/Offer graph, so the
  // rich result reflects the same numbers the page shows a shopper.
  const [{ data: settings }, theme, { data: reviews }] = await Promise.all([
    db
      .from("merchant_settings")
      .select("cod_enabled, mfs_enabled, shipping_flat_minor_int, free_shipping_threshold_minor_int")
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
    (await resolveSeo(merchant.id, "product", product.id)) ?? (await resolveSeo(merchant.id, "store", null));
  const seo = await resolveSeoWithTemplate(merchant.id, "product", entitySeo);

  const { storefrontSiteKit } = await import("./search-console.server");
  const siteKit = await storefrontSiteKit(merchant.id);

  return {
    merchant,
    product,
    seo,
    settings,
    siteKit,
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

