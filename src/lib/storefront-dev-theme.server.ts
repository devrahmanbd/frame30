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
 *   UX, not access control; data loads re-check server-side) plus a
 *   server-repriced `cart.add` (validated add-request truth for the host
 *   cart — tenant from the URL slug, price/stock/currency from live catalog
 *   rows, frame prices rejected as `theme.forbidden_field`; the bridge
 *   never creates orders or stock movements, and the host must re-reprice
 *   via `priceCart` before checkout). Every allowed call revalidates
 *   against live DB rows for this merchant; forbidden keys (price/tenant/
 *   payment — `findForbiddenFields`, same table as the bridge) reject with
 *   `theme.forbidden_field`; unknown methods reject with `theme.denied`.
 *   Writes never trust the frame: quantity is range-bound (1–99), the price
 *   is always the live catalog price, and cross-tenant variant ids fail
 *   closed with `theme.not_found`.
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
  "cart.add",
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
    case "cart.add": {
      // Server-repriced write: variantId + quantity only (promoCode
      // optional, ignored here — the host applies coupons via `priceCart`).
      // Mirrors the bridge's own `paramsValid` for `cart.add` (duplicated
      // on purpose: the server never trusts the client's verdict). Any
      // price-like field already refused above (`theme.forbidden_field`).
      if (!isPlainRecord(params)) return "theme.invalid_params";
      const { variantId, quantity, promoCode } = params as {
        variantId?: unknown;
        quantity?: unknown;
        promoCode?: unknown;
      };
      if (!isNonEmptyString(variantId)) return "theme.invalid_params";
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        return "theme.invalid_params";
      }
      if (promoCode !== undefined && !isNonEmptyString(promoCode, 64)) {
        return "theme.invalid_params";
      }
      return null;
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
    if (
      typeof row.source_listing_slug !== "string" ||
      !row.source_listing_slug.trim()
    ) {
      return null;
    }
    if (
      typeof row.source_install_id !== "string" ||
      !row.source_install_id.trim()
    ) {
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
    const publishedChecksums = (
      (versions ?? []) as {
        checksum?: unknown;
        status?: unknown;
      }[]
    )
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
 * only (no PII, orders, or customers). `cart.add` is a server-repriced
 * validated add-request (live price × validated quantity, cross-tenant ids
 * fail closed): the bridge never creates orders or stock movements, and the
 * host must re-reprice via `priceCart` before checkout. Unknown methods
 * deny. Never leaks merchant secrets.
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
    const list = (
      (products ?? []) as {
        id: string;
        title: string;
        slug: string;
        image_url?: unknown;
      }[]
    ).map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
    }));
    return {
      shop: {
        name: shop.name,
        slug: shop.slug,
        currency:
          typeof shop.currency_code === "string" ? shop.currency_code : "BDT",
      },
      products: list,
    };
  }

  // variant.select — display truth only. Price/stock come from the live
  // variant row for THIS merchant; any price-like field in params already
  // refused above (`theme.forbidden_field`). Never returns cost or supplier
  // fields — only shopper-visible display data.
  // cart.add — server-repriced validated add-request for the host cart.
  // Tenant from the URL slug (re-checked below: the variant must belong to
  // an active product of THIS merchant); price/currency/stock from live
  // rows (never from the frame — forbidden fields already refused, and the
  // response price is ALWAYS the live catalog price × the validated
  // quantity). No orders, no stock movements, no PII: the host applies the
  // returned truth to its live cart and re-reprices via `priceCart` before
  // checkout. promoCode is accepted but ignored here (host coupon flow
  // owns it). Cross-tenant or unknown ids fail closed (`theme.not_found`).
  if (method === "cart.add") {
    const { variantId, quantity } = params as {
      variantId?: unknown;
      quantity?: unknown;
    };
    const wanted = typeof variantId === "string" ? variantId : "";
    const qty = typeof quantity === "number" ? quantity : 0;
    const { data: variants } = await db
      .from("product_variants")
      .select("id, product_id, name, price_amount_minor_int, stock_quantity")
      .eq("id", wanted)
      .limit(5);
    const rows = (
      (variants ?? []) as {
        id: string;
        product_id: string;
        name: string;
        price_amount_minor_int: number;
        stock_quantity: number;
      }[]
    ).slice(0, 5);
    const { data: products } = await db
      .from("products")
      .select("id")
      .eq("merchant_id", shop.id)
      .eq("status", "active")
      .in(
        "id",
        rows.map((r) => r.product_id),
      );
    const owned = new Set(
      ((products ?? []) as { id: string }[]).map((p) => p.id),
    );
    const hit = rows.find((r) => owned.has(r.product_id));
    if (!hit) deny("theme.not_found");
    const priceMinor = hit!.price_amount_minor_int;
    return {
      cart: {
        variantId: hit!.id,
        productId: hit!.product_id,
        name: hit!.name,
        quantity: qty,
        priceMinor,
        lineTotalMinor: priceMinor * qty,
        currency:
          typeof shop.currency_code === "string" ? shop.currency_code : "BDT",
        inStock: hit!.stock_quantity > 0,
      },
    };
  }
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
    const rows = (
      (variants ?? []) as {
        id: string;
        product_id: string;
        name: string;
        price_amount_minor_int: number;
        stock_quantity: number;
      }[]
    ).slice(0, 5);
    // Tenant re-check: the variant must belong to an active product of THIS
    // merchant — a cross-tenant id fails closed here, never via params.
    const { data: products } = await db
      .from("products")
      .select("id")
      .eq("merchant_id", shop.id)
      .eq("status", "active")
      .in(
        "id",
        rows.map((r) => r.product_id),
      );
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
  const found = product as unknown as {
    id: string;
    title: string;
    slug: string;
  };
  const { data: variants } = await db
    .from("product_variants")
    .select("id, product_id, name, price_amount_minor_int, stock_quantity")
    .eq("product_id", found.id)
    .limit(20);
  return {
    product: { id: found.id, title: found.title, slug: found.slug },
    variants: (
      (variants ?? []) as {
        id: string;
        product_id: string;
        name: string;
        price_amount_minor_int: number;
        stock_quantity: number;
      }[]
    ).map((v) => ({
      id: v.id,
      name: v.name,
      priceMinor: v.price_amount_minor_int,
      inStock: v.stock_quantity > 0,
    })),
  };
}

/* ------------------------------------------- homepage isolated-theme gate */

/**
 * Serializable isolated-theme inputs for the PUBLISHED store homepage.
 *
 * Pure gate over loader data the route already holds (no new DB read):
 * - Preview drafts never leak (`preview === true` → null — the preview
 *   branch of `resolveIndexTheme` omits the binding, and this re-checks).
 * - CMS-pinned pages never inherit the active theme's binding
 *   (`page.theme_id` set → null — `loadPageTemplate` stays placeholder for
 *   pinned, possibly inactive, themes; fail-closed, never a default).
 * - Malformed binding inputs (unapproved/inactive/missing → the loader's
 *   projection already yielded null) → null, so the host keeps the classic
 *   renderer. The route completes the returned inputs with its own `onCall`
 *   (server-revalidating, live-suspended per envelope) to form ThemeChrome's
 *   `isolatedTheme` mount.
 */
export type PublishedStorefrontIsolatedInputs = {
  assetOrigin: string;
  name: string;
  version: string;
  granted: string[];
  navigateAllowlist: string[];
};

const ISOLATED_NAME_RE = /^[a-z0-9-]{1,64}$/;
const ISOLATED_VERSION_RE =
  /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[a-z0-9.-]{1,32})?$/i;
const ISOLATED_ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const ISOLATED_LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function resolvePublishedStorefrontIsolatedInputs(
  input: unknown,
): PublishedStorefrontIsolatedInputs | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      return null;
    const { preview, pageThemeId, binding } = input as {
      preview?: unknown;
      pageThemeId?: unknown;
      binding?: unknown;
    };
    // Published document only: preview (draft) responses never mount.
    if (preview === true) return null;
    // Pinned pages stay placeholder: the pin may name an inactive theme.
    if (
      pageThemeId !== undefined &&
      pageThemeId !== null &&
      !(typeof pageThemeId === "string" && !pageThemeId.trim())
    ) {
      if (typeof pageThemeId === "string" && pageThemeId.trim()) return null;
    }
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      return null;
    }
    const b = binding as {
      assetOrigin?: unknown;
      theme?: unknown;
      granted?: unknown;
      navigateAllowlist?: unknown;
    };
    if (
      typeof b.assetOrigin !== "string" ||
      (!ISOLATED_ORIGIN_RE.test(b.assetOrigin) &&
        !ISOLATED_LOCAL_ORIGIN_RE.test(b.assetOrigin))
    ) {
      return null;
    }
    const t = b.theme as { name?: unknown; version?: unknown } | null;
    if (
      !t ||
      typeof t.name !== "string" ||
      typeof t.version !== "string" ||
      !ISOLATED_NAME_RE.test(t.name) ||
      !ISOLATED_VERSION_RE.test(t.version)
    ) {
      return null;
    }
    if (
      !Array.isArray(b.granted) ||
      !b.granted.every((s) => typeof s === "string")
    ) {
      return null;
    }
    const allowlist = Array.isArray(b.navigateAllowlist)
      ? b.navigateAllowlist.filter((e): e is string => typeof e === "string")
      : [];
    return {
      assetOrigin: b.assetOrigin,
      name: t.name,
      version: t.version,
      granted: [...(b.granted as string[])],
      navigateAllowlist: [...allowlist],
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ suspension */

const LIVE_INSTALL_STATUSES = new Set(["installed", "trial"]);
/**
 * Live revocation liveness for the storefront host: true when the PUBLISHED
 * active theme's install is NOT live (missing ledger row, non-live status,
 * or any read failure — fail closed). The route's `onCall` evaluates this
 * per envelope and passes it as `suspended` to
 * `resolveStorefrontDevThemeCall`, so mid-session revocation refuses the
 * next bridge call as `theme.suspended` without remounting. Never throws —
 * every gap (unknown slug, inactive merchant, unlinked theme, DB error)
 * yields `true` (suspended: deny, loudly, with an explicit wire error).
 */
export async function loadStorefrontDevThemeSuspension(
  db: Client,
  slug: string,
): Promise<boolean> {
  try {
    if (typeof slug !== "string" || !slug.trim()) return true;
    const { data: merchant } = await db
      .from("merchants")
      .select("id")
      .eq("slug", slug.trim())
      .eq("status", "active")
      .maybeSingle();
    const merchantId = (merchant as unknown as { id?: unknown } | null)?.id;
    if (typeof merchantId !== "string" || !merchantId) return true;
    const { data: themeRow } = await db
      .from("store_themes")
      .select("id, source_install_id")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .maybeSingle();
    const installId = (
      themeRow as unknown as { source_install_id?: unknown } | null
    )?.source_install_id;
    if (typeof installId !== "string" || !installId) return true;
    const { data: install } = await db
      .from("marketplace_installs")
      .select("status")
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .maybeSingle();
    const status = (install as unknown as { status?: unknown } | null)?.status;
    return typeof status !== "string" || !LIVE_INSTALL_STATUSES.has(status);
  } catch {
    return true;
  }
}
