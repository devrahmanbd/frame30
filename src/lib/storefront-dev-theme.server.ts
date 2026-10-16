/**
 * Storefront Level B — public-safe projection + server-revalidating bridge.
 *
 * PUBLIC path only (shoppers). Never reads drafts, never mints a binding for
 * anything but the PUBLISHED active theme's approved release. The trust chain
 * is READ, never reimplemented:
 * - Projection delegates to the REAL `loadDevThemeProjection` in
 *   `themes.server` (published + approve-bound fingerprint per
 *   `resolveDevThemeActivation`, dual-checksum corroboration, byte-bound
 *   descriptor). Anything else yields null → the host keeps the explicit
 *   placeholder. Draft rows (`theme_drafts`) are never read here; published
 *   version checksums ONLY supply the corroboration set, so a draft-only
 *   fingerprint can never satisfy the loader.
 * - Bridge (`onCall` server half, `resolveStorefrontDevThemeCall`): the frame
 *   is untrusted input. Every call is revalidated server-side on EACH
 *   invocation against the live catalog for THIS slug's merchant (tenant from
 *   the URL slug, never from params; prices/stock from the database, never
 *   from the frame; no PII/orders/customers ever returned).
 *
 * onCall design (the middle between deny-all and allow-all):
 * - Deny-all would silently break commerce rendering: a theme that cannot
 *   `storefront.read` / `variant.select` cannot render product truth and the
 *   page goes blank. Commerce needs reads.
 * - Allow-all is default-allow: the frame could invent prices, forge tenant
 *   or payment fields, or trigger writes the server never repriced.
 * - Middle (this module): an explicit allow-list of READ-ONLY commerce
 *   methods (`storefront.read`, `variant.select`) plus constrained
 *   `navigate` (same-store paths or explicitly allowlisted https origins —
 *   UX, not access control; data loads re-check server-side). Every allowed
 *   call revalidates against live DB rows for this merchant; forbidden keys
 *   (price/tenant/payment — `findForbiddenFields`, same table as the bridge)
 *   reject with `theme.forbidden_field`; unknown methods and ALL commerce
 *   writes (`cart.add`) reject with `theme.denied`. Writes must travel the
 *   host cart UI, which reprices via `priceCart` from the server catalog —
 *   the bridge never creates orders, quotes, or stock movements. Even when an
 *   install's granted scopes include `theme:cart:add`, this host denies the
 *   bridge write: grants name what the install holds, the host decides what
 *   the frame may execute.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  findForbiddenFields,
  isNavigationAllowed,
} from "@/components/theme-runtime/capabilities";
import type { DevThemeProjection } from "./themes.server";

type Client = SupabaseClient<Database>;

/* ------------------------------------------------------------ allow-list */

export const STOREFRONT_DEV_THEME_METHODS = [
  "storefront.read",
  "variant.select",
  "navigate",
] as const;

export type StorefrontDevThemeMethod =
  (typeof STOREFRONT_DEV_THEME_METHODS)[number];

export function isStorefrontDevThemeMethod(
  method: unknown,
): method is StorefrontDevThemeMethod {
  return (
    typeof method === "string" &&
    (STOREFRONT_DEV_THEME_METHODS as readonly string[]).includes(method)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, max = 128): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    new TextEncoder().encode(value).length <= max * 4
  );
}

/**
 * Shape gate for one bridge call, mirroring the bridge's own `paramsValid`
 * (duplicated on purpose: the server never trusts the client's verdict).
 * Returns the `theme.*` error string on refusal, or null when the shape is
 * admissible (forbidden-field and allow-list checks happen alongside).
 */
export function validateStorefrontDevThemeParams(
  method: string,
  params: unknown,
): string | null {
  const forbidden = findForbiddenFields(params);
  if (forbidden.length > 0) return "theme.forbidden_field";
  switch (method) {
    case "storefront.read": {
      if (params === undefined) return null;
      if (!isPlainRecord(params)) return "theme.invalid_params";
      const { fields } = params as { fields?: unknown };
      if (fields === undefined) return null;
      if (
        !Array.isArray(fields) ||
        fields.length > 32 ||
        !fields.every((f) => isNonEmptyString(f, 64))
      ) {
        return "theme.invalid_params";
      }
      return null;
    }
    case "variant.select": {
      if (!isPlainRecord(params)) return "theme.invalid_params";
      const { variantId, productId } = params as {
        variantId?: unknown;
        productId?: unknown;
      };
      if (
        (variantId !== undefined && isNonEmptyString(variantId)) ||
        (productId !== undefined && isNonEmptyString(productId))
      ) {
        return null;
      }
      return "theme.invalid_params";
    }
    case "navigate": {
      if (!isPlainRecord(params)) return "theme.invalid_params";
      const { href } = params as { href?: unknown };
      if (typeof href !== "string" || !href || href.length > 2048) {
        return "theme.invalid_params";
      }
      return null;
    }
    default:
      return "theme.denied";
  }
}

/* ------------------------------------------------------------ projection */

/**
 * Public projection for the PUBLISHED active theme ONLY. Reads the active
 * `store_themes` row, corroborates with PUBLISHED `theme_versions` checksums
 * only (drafts never enter the set), then delegates to the REAL
 * `loadDevThemeProjection`. Every gap yields null — inactive, unlinked,
 * unpublished, unapproved, tampered, or unlisted-origin. Never throws.
 */
export async function loadPublishedDevThemeProjection(
  db: Client,
  merchantId: string,
): Promise<DevThemeProjection | null> {
  try {
    if (typeof merchantId !== "string" || !merchantId.trim()) return null;
    const { data: themeRow, error: themeError } = await db
      .from("store_themes")
      .select("id, is_active, source_listing_slug, source_install_id")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .maybeSingle();
    if (themeError || !themeRow) return null;
    const row = themeRow as unknown as {
      id?: unknown;
      is_active?: unknown;
      source_listing_slug?: unknown;
      source_install_id?: unknown;
    };
    if (row.is_active !== true) return null;
    if (typeof row.id !== "string" || !row.id) return null;
    if (typeof row.source_listing_slug !== "string" || !row.source_listing_slug.trim()) {
      return null;
    }
    if (typeof row.source_install_id !== "string" || !row.source_install_id.trim()) {
      return null;
    }
    // Published-only corroboration: draft checksums never satisfy the loader,
    // so draft/unapproved bytes can never project to shoppers.
    const { data: versions, error: versionsError } = await db
      .from("theme_versions")
      .select("checksum, status")
      .eq("merchant_id", merchantId)
      .eq("theme_id", row.id);
    if (versionsError) return null;
    const publishedChecksums = ((versions ?? []) as {
      checksum?: unknown;
      status?: unknown;
    }[])
      .filter((v) => v.status === "published" && typeof v.checksum === "string")
      .map((v) => v.checksum as string);
    if (publishedChecksums.length === 0) return null;
    const { loadDevThemeProjection } = await import("./themes.server");
    return await loadDevThemeProjection(db, merchantId, {
      themeId: row.id,
      isActive: true,
      sourceKey: (row.source_listing_slug as string).trim(),
      sourceInstallId: row.source_install_id as string,
      versionChecksums: publishedChecksums,
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ server calls */

export class StorefrontDevThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorefrontDevThemeError";
  }
}

function deny(message: string): never {
  throw new StorefrontDevThemeError(message);
}

type MerchantRow = {
  id: string;
  name: string;
  slug: string;
  currency_code?: unknown;
};

/**
 * Server half of the storefront `onCall`. Revalidates EVERY call against
 * live rows for THIS slug's merchant: tenant from the URL slug (never from
 * params), prices/stock from the catalog (never from the frame), public rows
 * only (no PII, orders, or customers). Commerce writes (`cart.add`) and
 * unknown methods deny — writes travel the host cart UI with server
 * repricing, never the bridge. Never leaks merchant secrets.
 */
export async function resolveStorefrontDevThemeCall(
  db: Client,
  slug: string,
  method: string,
  params: unknown,
  opts?: {
    navigateAllowlist?: readonly string[];
    /**
     * Kill-switch / revocation liveness for the bridge-call authorization
     * path: when true the call is denied as `theme.suspended` BEFORE any
     * database read (no merchant, catalog, or variant row is touched) and
     * before shape checks — a suspended install authorizes nothing, with an
     * explicit wire error instead of a silent stale frame.
     */
    suspended?: boolean;
  },
): Promise<unknown> {
  if (opts?.suspended === true) deny("theme.suspended");
  if (typeof slug !== "string" || !slug.trim()) deny("theme.denied");
  if (!isStorefrontDevThemeMethod(method)) deny("theme.denied");
  const shapeError = validateStorefrontDevThemeParams(method, params);
  if (shapeError) deny(shapeError);

  const { data: merchant, error: merchantError } = await db
    .from("merchants")
    .select("id, name, slug, currency_code")
    .eq("slug", slug.trim())
    .eq("status", "active")
    .maybeSingle();
  if (merchantError || !merchant) deny("theme.denied");
  const shop = merchant as unknown as MerchantRow;

  if (method === "navigate") {
    const href = (params as Record<string, unknown>).href as unknown;
    const allowed = isNavigationAllowed(href, opts?.navigateAllowlist ?? []);
    if (!allowed) deny("theme.navigation_denied");
    return { allowed: true };
  }

  if (method === "storefront.read") {
    const { data: products } = await db
      .from("products")
      .select("id, title, slug, image_url")
      .eq("merchant_id", shop.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(24);
    const list = ((products ?? []) as {
      id: string;
      title: string;
      slug: string;
      image_url?: unknown;
    }[]).map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
    }));
    return {
      shop: {
        name: shop.name,
        slug: shop.slug,
        currency: typeof shop.currency_code === "string" ? shop.currency_code : "BDT",
      },
      products: list,
    };
  }

  // variant.select — display truth only. Price/stock come from the live
  // variant row for THIS merchant; any price-like field in params already
  // refused above (`theme.forbidden_field`). Never returns cost or supplier
  // fields — only shopper-visible display data.
  const { variantId, productId } = params as {
    variantId?: unknown;
    productId?: unknown;
  };
  const wantedVariant =
    typeof variantId === "string" && variantId ? variantId : null;
  const wantedProduct =
    typeof productId === "string" && productId ? productId : null;
  if (wantedVariant) {
    const { data: variants } = await db
      .from("product_variants")
      .select("id, product_id, name, price_amount_minor_int, stock_quantity")
      .eq("id", wantedVariant)
      .limit(5);
    const rows = ((variants ?? []) as {
      id: string;
      product_id: string;
      name: string;
      price_amount_minor_int: number;
      stock_quantity: number;
    }[]).slice(0, 5);
    // Tenant re-check: the variant must belong to an active product of THIS
    // merchant — a cross-tenant id fails closed here, never via params.
    const { data: products } = await db
      .from("products")
      .select("id")
      .eq("merchant_id", shop.id)
      .eq("status", "active")
      .in("id", rows.map((r) => r.product_id));
    const owned = new Set(
      ((products ?? []) as { id: string }[]).map((p) => p.id),
    );
    const hit = rows.find((r) => owned.has(r.product_id));
    if (!hit) deny("theme.not_found");
    return {
      variant: {
        id: hit!.id,
        productId: hit!.product_id,
        name: hit!.name,
        priceMinor: hit!.price_amount_minor_int,
        inStock: hit!.stock_quantity > 0,
      },
    };
  }
  const { data: product } = await db
    .from("products")
    .select("id, title, slug")
    .eq("merchant_id", shop.id)
    .eq("id", wantedProduct as string)
    .eq("status", "active")
    .maybeSingle();
  if (!product) deny("theme.not_found");
  const found = product as unknown as { id: string; title: string; slug: string };
  const { data: variants } = await db
    .from("product_variants")
    .select("id, product_id, name, price_amount_minor_int, stock_quantity")
    .eq("product_id", found.id)
    .limit(20);
  return {
    product: { id: found.id, title: found.title, slug: found.slug },
    variants: ((variants ?? []) as {
      id: string;
      product_id: string;
      name: string;
      price_amount_minor_int: number;
      stock_quantity: number;
    }[]).map((v) => ({
      id: v.id,
      name: v.name,
      priceMinor: v.price_amount_minor_int,
      inStock: v.stock_quantity > 0,
    })),
  }
}
