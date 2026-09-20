/**
 * Theme import RPCs — granular, idempotent imports for slides, media,
 * products, and posts. Each wrapper delegates to a SECURITY DEFINER SQL
 * function that enforces auth and merchant ownership at the database level.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertTenantId } from "./tenant-scope";
import { incr, log, withSpan } from "./observability.server";
import { rateLimit } from "./rate-limit.server";
import { purgeStorefront } from "./themes.server";

type Client = SupabaseClient<Database>;

class ImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

type ImportResult = {
  status: "imported" | "noop";
  imported: boolean;
  count: number;
};

function importResult(raw: unknown): ImportResult {
  const r = raw as Record<string, unknown>;
  return {
    status: (r.status as string) === "imported" ? "imported" : "noop",
    imported: Boolean(r.imported),
    count: Number(r.count ?? 0),
  };
}

/**
 * Import hero_carousel slide data from the theme blueprint into the
 * merchant's theme draft. Idempotent: skipped if slides already exist.
 */
export async function importThemeSlides(
  db: Client,
  merchantId: string,
  themeKey: string,
): Promise<ImportResult> {
  assertTenantId(merchantId, "importThemeSlides");
  await rateLimit("theme.import_slides", merchantId);
  return withSpan("theme.import_slides", async () => {
    const { data, error } = await (
      db as unknown as {
        rpc: (
          n: string,
          a: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("import_theme_slides", {
      _merchant_id: merchantId,
      _theme_key: themeKey,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "import_failed";
      throw new ImportError(msg.split(" ")[0] ?? "import_failed", msg);
    }
    const result = importResult(data);
    incr("framique_theme_import_total", {
      action: "slides",
      result: result.imported ? "ok" : "noop",
    });
    log("info", "theme.import_slides", {
      merchant_id: merchantId,
      key: themeKey,
      ...result,
    });
    if (result.imported) purgeStorefront("import_slides", merchantId);
    return result;
  });
}

/**
 * Create placeholder media_assets entries for the theme's demo images.
 * Idempotent: skips if the merchant already has demo media for this theme.
 */
export async function importThemeMedia(
  db: Client,
  merchantId: string,
  themeKey: string,
): Promise<ImportResult> {
  assertTenantId(merchantId, "importThemeMedia");
  await rateLimit("theme.import_media", merchantId);
  return withSpan("theme.import_media", async () => {
    const { data, error } = await (
      db as unknown as {
        rpc: (
          n: string,
          a: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("import_theme_media", {
      _merchant_id: merchantId,
      _theme_key: themeKey,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "import_failed";
      throw new ImportError(msg.split(" ")[0] ?? "import_failed", msg);
    }
    const result = importResult(data);
    incr("framique_theme_import_total", {
      action: "media",
      result: result.imported ? "ok" : "noop",
    });
    log("info", "theme.import_media", {
      merchant_id: merchantId,
      key: themeKey,
      ...result,
    });
    if (result.imported) purgeStorefront("import_media", merchantId);
    return result;
  });
}

/**
 * Import demo products and variants from the theme's demo catalog.
 * Accepts the catalog JSONB (from the TypeScript DemoCatalog type).
 * Idempotent: skips if the merchant already has demo products for this theme.
 */
export async function importThemeProducts(
  db: Client,
  merchantId: string,
  themeKey: string,
  catalog: Record<string, unknown>,
): Promise<ImportResult> {
  assertTenantId(merchantId, "importThemeProducts");
  await rateLimit("theme.import_products", merchantId);
  return withSpan("theme.import_products", async () => {
    const { data, error } = await (
      db as unknown as {
        rpc: (
          n: string,
          a: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("import_theme_products", {
      _merchant_id: merchantId,
      _theme_key: themeKey,
      _catalog: catalog,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "import_failed";
      throw new ImportError(msg.split(" ")[0] ?? "import_failed", msg);
    }
    const result = importResult(data);
    incr("framique_theme_import_total", {
      action: "products",
      result: result.imported ? "ok" : "noop",
    });
    log("info", "theme.import_products", {
      merchant_id: merchantId,
      key: themeKey,
      ...result,
    });
    if (result.imported) purgeStorefront("import_products", merchantId);
    return result;
  });
}

/**
 * Import demo blog articles and storefront pages for the theme.
 * Idempotent: skips if the merchant already has demo posts for this theme.
 */
export async function importThemePosts(
  db: Client,
  merchantId: string,
  themeKey: string,
): Promise<ImportResult> {
  assertTenantId(merchantId, "importThemePosts");
  await rateLimit("theme.import_posts", merchantId);
  return withSpan("theme.import_posts", async () => {
    const { data, error } = await (
      db as unknown as {
        rpc: (
          n: string,
          a: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("import_theme_posts", {
      _merchant_id: merchantId,
      _theme_key: themeKey,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "import_failed";
      throw new ImportError(msg.split(" ")[0] ?? "import_failed", msg);
    }
    const result = importResult(data);
    incr("framique_theme_import_total", {
      action: "posts",
      result: result.imported ? "ok" : "noop",
    });
    log("info", "theme.import_posts", {
      merchant_id: merchantId,
      key: themeKey,
      ...result,
    });
    if (result.imported) purgeStorefront("import_posts", merchantId);
    return result;
  });
}

/**
 * Import all demo content for a theme: slides, media, products, then posts.
 * Idempotent: each sub-import skips independently if its data already exists.
 */
export async function importThemeAll(
  db: Client,
  merchantId: string,
  themeKey: string,
): Promise<{
  slides: ImportResult;
  media: ImportResult;
  products: ImportResult;
  posts: ImportResult;
  totalImported: number;
}> {
  assertTenantId(merchantId, "importThemeAll");
  await rateLimit("theme.import_all", merchantId);
  return withSpan("theme.import_all", async () => {
    const { demoCatalogFor } = await import("./demo-catalog");
    const catalog = demoCatalogFor(themeKey);

    const slides = await importThemeSlides(db, merchantId, themeKey);
    const media = await importThemeMedia(db, merchantId, themeKey);
    const products = await importThemeProducts(
      db,
      merchantId,
      themeKey,
      catalog as unknown as Record<string, unknown>,
    );
    const posts = await importThemePosts(db, merchantId, themeKey);

    const totalImported =
      (slides.imported ? 1 : 0) +
      (media.imported ? 1 : 0) +
      (products.imported ? 1 : 0) +
      (posts.imported ? 1 : 0);

    incr("framique_theme_import_total", {
      action: "all",
      result: totalImported > 0 ? "ok" : "noop",
    });
    log("info", "theme.import_all", {
      merchant_id: merchantId,
      key: themeKey,
      slides: slides.status,
      media: media.status,
      products: products.status,
      posts: posts.status,
      totalImported,
    });
    if (totalImported > 0) purgeStorefront("import_all", merchantId);

    return { slides, media, products, posts, totalImported };
  });
}
