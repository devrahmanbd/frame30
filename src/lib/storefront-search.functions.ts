import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MAX_TERM_LENGTH, PRODUCT_KINDS_FILTER, SORTS } from "./storefront-search";

const paramsSchema = z.object({
  slug: z.string().min(1).max(80),
  q: z.string().max(MAX_TERM_LENGTH).default(""),
  category: z.string().max(63).nullish(),
  collection: z.string().max(63).nullish(),
  kind: z.enum(PRODUCT_KINDS_FILTER).nullish(),
  min: z.number().int().min(0).nullish(),
  max: z.number().int().min(0).nullish(),
  stock: z.boolean().default(false),
  sort: z.enum(SORTS).default("relevance"),
  page: z.number().int().min(1).max(21).default(1),
});

export const searchStorefrontFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => paramsSchema.parse(d))
  .handler(async ({ data }) => {
    const { normalizeSearchParams } = await import("./storefront-search");
    const { runStorefrontSearch } = await import("./storefront-search.server");
    const { requestFingerprint } = await import("./identity.server");

    const params = normalizeSearchParams({
      q: data.q,
      category: data.category ?? null,
      collection: data.collection ?? null,
      kind: data.kind ?? null,
      min: data.min ?? null,
      max: data.max ?? null,
      stock: data.stock,
      sort: data.sort,
      page: data.page,
    });
    // Never store a raw shopper IP: the limiter only needs a stable hashed subject.
    const { ipHash } = await requestFingerprint();
    return runStorefrontSearch(data.slug, params, ipHash);
  });

export const getStorePageFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1).max(80), pageSlug: z.string().min(1).max(63) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStorePage, listStorePageNav } = await import("./storefront-search.server");
    const { renderPageMarkdown } = await import("./storefront-search");
    const found = await loadStorePage(data.slug, data.pageSlug);
    if (!found) return null;
    const { loadPageTemplate } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const { storefrontSiteKit } = await import("./search-console.server");
    const { storefrontThemeCss } = await import("./themes/assets.server");
    const themeId = found.page.theme_id ?? null;
    const [nav, theme, siteKit, customCss] = await Promise.all([
      listStorePageNav(found.merchant.id),
      loadPageTemplate(found.merchant.id, themeId),
      storefrontSiteKit(found.merchant.id),
      storefrontThemeCss(found.merchant.id, themeId),
    ]);
    // Phase 14/17: a page authored in the builder stores its document inside
    // the markdown column; rendering it through the markdown renderer would
    // print the JSON. The builder renderer escapes every author value itself.
    const { isBuilderBody, parseBuilderBody, renderBuilderHtml } = await import("./page-builder");
    const builderDoc = isBuilderBody(found.page.body_markdown)
      ? parseBuilderBody(found.page.body_markdown)
      : null;
    // Product blocks are data-backed: resolve them against the live catalogue
    // instead of the snapshot that was saved with the page.
    let builderProducts = {};
    if (builderDoc) {
      const { resolveBuilderProducts } = await import("./builder-products.server");
      builderProducts = await resolveBuilderProducts(found.merchant.id, data.slug, builderDoc);
    }
    return {
      ...found,
      html: builderDoc
        ? renderBuilderHtml(builderDoc, builderProducts)
        : renderPageMarkdown(found.page.body_markdown),
      isBuilder: Boolean(builderDoc),
      customCss,
      nav,
      ast: theme?.ast ?? null,
      tokens: theme?.tokens ?? null,
      themeKey: theme?.themeKey ?? null,
      siteKit,
      origin: requestOrigin(),
    };
  });

export const pagesDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadPagesDesk } = await import("./storefront-search.server");
    return loadPagesDesk(context.supabase, data.merchantId);
  });

const pageInputSchema = z.object({
  merchantId: z.string().uuid(),
  id: z.string().uuid().nullish(),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/, "slug.shape"),
  title: z.string().min(2).max(160),
  excerpt: z.string().max(300).default(""),
  bodyMarkdown: z.string().max(40000).default(""),
  metaTitle: z.string().max(60).default(""),
  metaDescription: z.string().max(160).default(""),
  robots: z.enum(["index,follow", "noindex,follow", "noindex,nofollow"]).default("index,follow"),
  isPublished: z.boolean().default(false),
  showInNav: z.boolean().default(true),
  position: z.number().int().min(0).max(999).default(0),
});

export const savePageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pageInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { savePage } = await import("./storefront-search.server");
    await savePage(context.supabase, data.merchantId, { ...data, id: data.id ?? null });
    return { ok: true };
  });

export const archivePageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ merchantId: z.string().uuid(), pageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { archivePage } = await import("./storefront-search.server");
    await archivePage(context.supabase, data.merchantId, data.pageId);
    return { ok: true };
  });
