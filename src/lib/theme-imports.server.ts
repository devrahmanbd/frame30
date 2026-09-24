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

/* ---------------------------------- D1: overwrite preflight ----------- */

/** Fixed demo seeds (mirror the SQL seed inserts — keep in sync). */
const DEMO_ARTICLE_SLUGS = [
  "demo-master-weavers",
  "demo-nakshi-kantha",
  "demo-festive-collection",
];
const DEMO_PAGE_SLUGS = ["about", "shipping-info"];
const DEMO_MEDIA_FILES = Array.from(
  { length: 6 },
  (_, i) => `demo_media_${i}.webp`,
);

export type ImportConflictKind =
  "products" | "collections" | "pages" | "posts" | "media";

export type ImportConflict = { kind: ImportConflictKind; slugs: string[] };

/** Sorted intersection of demo and existing slugs (trimmed, deduped). */
export function matchConflicts(
  demoSlugs: string[],
  existingSlugs: Array<string | null | undefined>,
): string[] {
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase().replace(/^\/+/, "");
  const existing = new Set(existingSlugs.map(norm).filter((s) => s.length > 0));
  const out = new Set<string>();
  for (const raw of demoSlugs) {
    const s = norm(raw);
    if (s.length > 0 && existing.has(s)) out.add(s);
  }
  return [...out].sort();
}

async function existingSlugs(
  db: Client,
  merchantId: string,
  table: "products" | "collections" | "storefront_pages" | "articles",
  column: "slug",
): Promise<string[]> {
  const { data } = await (
    db as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => Promise<{ data: { slug: string }[] | null }>;
        };
      };
    }
  )
    .from(table)
    .select(column)
    .eq("merchant_id", merchantId);
  return (data ?? []).map((r) => r.slug);
}

/**
 * Overwrite means "replace the current demo with this theme's demo":
 * conflicting real rows are deleted by removeImportConflicts, and any
 * pre-existing is_demo rows are purged — otherwise the SQL idempotency
 * guard (any is_demo product exists → noop) silently swallows the import
 * whenever slugs don't collide (e.g. switching themes).
 */
async function purgeExistingDemo(db: Client, merchantId: string) {
  const { purgeDemoContent } = await import("./themes.server");
  await purgeDemoContent(db, merchantId);
}

/**
 * Conflict preflight: which existing rows (demo OR merchant-owned) would be
 * overwritten by a demo import because slugs/filenames match. Read-only.
 */
export async function importPreflight(
  db: Client,
  merchantId: string,
  themeKey: string,
): Promise<{ conflicts: ImportConflict[]; total: number }> {
  assertTenantId(merchantId, "importPreflight");
  const { demoCatalogFor } = await import("./demo-catalog");
  const catalog = demoCatalogFor(themeKey);
  const [products, collections, pages, posts, mediaAssets] = await Promise.all([
    existingSlugs(db, merchantId, "products", "slug"),
    existingSlugs(db, merchantId, "collections", "slug"),
    existingSlugs(db, merchantId, "storefront_pages", "slug"),
    existingSlugs(db, merchantId, "articles", "slug"),
    (async () => {
      const { data } = await (
        db as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                k: string,
                v: string,
              ) => Promise<{ data: { file_name: string }[] | null }>;
            };
          };
        }
      )
        .from("media_assets")
        .select("file_name")
        .eq("merchant_id", merchantId);
      return (data ?? []).map((r) => r.file_name);
    })(),
  ]);
  const all: ImportConflict[] = [
    {
      kind: "products",
      slugs: matchConflicts(
        catalog.products.map((p) => p.slug),
        products,
      ),
    },
    {
      kind: "collections",
      slugs: matchConflicts(
        catalog.collections.map((c) => c.slug),
        collections,
      ),
    },
    { kind: "pages", slugs: matchConflicts(DEMO_PAGE_SLUGS, pages) },
    { kind: "posts", slugs: matchConflicts(DEMO_ARTICLE_SLUGS, posts) },
    { kind: "media", slugs: matchConflicts(DEMO_MEDIA_FILES, mediaAssets) },
  ];
  const conflicts = all.filter((c) => c.slugs.length > 0);
  return {
    conflicts,
    total: conflicts.reduce((n, c) => n + c.slugs.length, 0),
  };
}

async function deleteWhereSlugIn(
  db: Client,
  merchantId: string,
  table: string,
  slugs: string[],
  column = "slug",
): Promise<void> {
  if (slugs.length === 0) return;
  const { error } = await (
    db as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (
            k: string,
            v: string,
          ) => {
            in: (k: string, v: string[]) => Promise<{ error: unknown }>;
          };
        };
      };
    }
  )
    .from(table)
    .delete()
    .eq("merchant_id", merchantId)
    .in(column, slugs);
  if (error) throw error;
}

/**
 * Remove exactly the conflicting rows (FK order: links → variants →
 * products → collections/categories, then pages/posts/media) so a re-import
 * overwrites instead of nooping. Merchant rows that do NOT collide are
 * never touched.
 */
export async function removeImportConflicts(
  db: Client,
  merchantId: string,
  conflicts: ImportConflict[],
): Promise<void> {
  assertTenantId(merchantId, "removeImportConflicts");
  const byKind = (kind: ImportConflictKind): string[] =>
    conflicts.find((c) => c.kind === kind)?.slugs ?? [];
  const productSlugs = byKind("products");
  if (productSlugs.length > 0) {
    const { data: rows } = await (
      db as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              in: (
                k: string,
                v: string[],
              ) => Promise<{ data: { id: string }[] | null }>;
            };
          };
        };
      }
    )
      .from("products")
      .select("id")
      .eq("merchant_id", merchantId)
      .in("slug", productSlugs);
    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length > 0) {
      const raw = db as unknown as {
        from: (t: string) => {
          delete: () => {
            eq: (
              k: string,
              v: string,
            ) => {
              in: (k: string, v: string[]) => Promise<{ error: unknown }>;
            };
          };
        };
      };
      await raw
        .from("collection_products")
        .delete()
        .eq("merchant_id", merchantId)
        .in("product_id", ids);
      await raw
        .from("product_variants")
        .delete()
        .eq("merchant_id", merchantId)
        .in("product_id", ids);
      await raw
        .from("products")
        .delete()
        .eq("merchant_id", merchantId)
        .in("id", ids);
    }
  }
  await deleteWhereSlugIn(db, merchantId, "collections", byKind("collections"));
  // Categories share product-category slugs in some catalogs; only remove
  // categories whose slug collides with a demo *category* slug is out of
  // scope here (products carry the link) — collections covered above.
  await deleteWhereSlugIn(db, merchantId, "storefront_pages", byKind("pages"));
  await deleteWhereSlugIn(db, merchantId, "articles", byKind("posts"));
  const media = byKind("media");
  if (media.length > 0) {
    // Capture storage paths BEFORE deleting the rows that reference them.
    const { data: assetRows } = await (
      db as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              in: (
                k: string,
                v: string[],
              ) => Promise<{ data: { storage_path: string }[] | null }>;
            };
          };
        };
      }
    )
      .from("media_assets")
      .select("storage_path")
      .eq("merchant_id", merchantId)
      .in("file_name", media);
    await deleteWhereSlugIn(db, merchantId, "media_assets", media, "file_name");
    // Storage objects are removed best-effort; a missing object is not fatal.
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const paths = (assetRows ?? [])
        .map((r) => r.storage_path)
        .filter(Boolean);
      if (paths.length > 0)
        await supabaseAdmin.storage.from("media").remove(paths);
    } catch {
      // best-effort only
    }
  }
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
  overwrite = false,
  alreadyPurged = false,
): Promise<ImportResult> {
  if (overwrite) {
    const pre = await importPreflight(db, merchantId, themeKey);
    await removeImportConflicts(
      db,
      merchantId,
      pre.conflicts.filter((c) => c.kind === "media"),
    );
    if (!alreadyPurged) await purgeExistingDemo(db, merchantId);
  }
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
  overwrite = false,
  alreadyPurged = false,
): Promise<ImportResult> {
  if (overwrite) {
    const pre = await importPreflight(db, merchantId, themeKey);
    await removeImportConflicts(
      db,
      merchantId,
      pre.conflicts.filter(
        (c) => c.kind === "products" || c.kind === "collections",
      ),
    );
    if (!alreadyPurged) await purgeExistingDemo(db, merchantId);
  }
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
    if (result.imported) {
      // Demo collections must be visible: writers leave is_published
      // false by default, which 404s every /c/* page and drops them
      // from the sitemap despite advertised links. Publish exactly the
      // catalog's slugs — merchant-owned collections untouched.
      const slugs = Array.isArray(
        (catalog as Record<string, unknown>)["collections"],
      )
        ? (
            (catalog as Record<string, unknown>)["collections"] as Array<
              Record<string, unknown>
            >
          )
            .map((c) => c["slug"])
            .filter((s): s is string => typeof s === "string" && s.length > 0)
        : [];
      if (slugs.length > 0) {
        await (
          db as unknown as {
            from: (t: string) => {
              update: (v: Record<string, unknown>) => {
                eq: (
                  k: string,
                  v: unknown,
                ) => {
                  in: (k: string, v: unknown[]) => Promise<unknown>;
                };
              };
            };
          }
        )
          .from("collections")
          .update({ is_published: true })
          .eq("merchant_id", merchantId)
          .in("slug", slugs);
      }
      purgeStorefront("import_products", merchantId);
    }
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
  overwrite = false,
  alreadyPurged = false,
): Promise<ImportResult> {
  if (overwrite) {
    const pre = await importPreflight(db, merchantId, themeKey);
    await removeImportConflicts(
      db,
      merchantId,
      pre.conflicts.filter((c) => c.kind === "posts" || c.kind === "pages"),
    );
    if (!alreadyPurged) await purgeExistingDemo(db, merchantId);
  }
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
  overwrite = false,
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

    if (overwrite) await purgeExistingDemo(db, merchantId);
    const slides = await importThemeSlides(db, merchantId, themeKey);
    const media = await importThemeMedia(
      db,
      merchantId,
      themeKey,
      overwrite,
      true,
    );
    const products = await importThemeProducts(
      db,
      merchantId,
      themeKey,
      catalog as unknown as Record<string, unknown>,
      overwrite,
      true,
    );
    const posts = await importThemePosts(
      db,
      merchantId,
      themeKey,
      overwrite,
      true,
    );

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
