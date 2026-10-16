/**
 * Theme-runtime capability grants (NEW lane — theme bridge v2).
 *
 * Least-privilege install-time grants for full custom merchant themes. A
 * theme is NOT a marketplace widget: it renders the whole storefront, so it
 * gets its own method vocabulary (`storefront.read`, `variant.select`,
 * `cart.add`, `navigate`) and its own scope strings (`theme:*`), deliberately
 * disjoint from `WIDGET_API` / widget scopes in `marketplace-scopes.ts`.
 * Sharing that vocabulary would let a theme inherit widget grants (and vice
 * versa) across lanes — the two authorizers must never consult each other's
 * tables.
 *
 * Default-deny: `buildThemeGrants({})` grants nothing. Every grant names its
 * scope plus its bounds; bounds marked SERVER are enforced again on the
 * server (see the SERVER CONTRACT in `bridge-v2.ts`) because anything the
 * frame sends is attacker-controlled.
 */

export const THEME_METHODS = {
  "storefront.read": {
    scope: "theme:storefront:read",
    write: false,
    bounds:
      "Read-only public storefront data (shop profile, published catalog rows). No PII, no orders, no customers.",
  },
  "variant.select": {
    scope: "theme:variant:select",
    write: false,
    bounds:
      "Resolve a shopper-chosen variant for display. Price/stock truth stays server-side (SERVER).",
  },
  "cart.add": {
    scope: "theme:cart:add",
    write: true,
    bounds:
      "variantId + quantity (1-99) + optional promoCode only. Price, stock, tenant and payment fields are never passable; the server reprices from its own catalog (SERVER).",
  },
  navigate: {
    scope: "theme:navigate",
    write: false,
    bounds:
      "Same-store absolute paths or explicitly allowlisted https origins only. No javascript:/data:/blob: targets, no protocol-relative URLs.",
  },
} as const;

export type ThemeMethod = keyof typeof THEME_METHODS;

export function themeScopeFor(method: string): string | null {
  const def = (THEME_METHODS as Record<string, { scope: string }>)[method];
  return def ? def.scope : null;
}

/** Canonical granted-scope list for a method (single scope per method). */
export function themeRequiredScope(method: ThemeMethod): string {
  return THEME_METHODS[method].scope;
}

// ------------------------------------------------------------ grant set

export type ThemeGrantOptions = {
  storefrontRead?: boolean;
  variantSelect?: boolean;
  cartAdd?: boolean;
  navigate?: boolean;
  /** Exact https origins the theme may navigate to (empty = same-store paths only). */
  navigateAllowlist?: readonly string[];
};

export type ThemeGrantSet = {
  /** Scope strings the install holds. Empty by default (default-deny). */
  granted: string[];
  /** Normalized allowlist carried with the `theme:navigate` grant. */
  navigateAllowlist: string[];
};

/**
 * Least-privilege grant constructor. Every flag defaults to false; only
 * explicitly enabled capabilities appear in `granted`. The allowlist is kept
 * even when `navigate` is off so enabling later cannot inherit a stale list
 * silently — authorization still denies without the scope.
 */
export function buildThemeGrants(opts: ThemeGrantOptions = {}): ThemeGrantSet {
  const granted: string[] = [];
  if (opts.storefrontRead === true)
    granted.push(THEME_METHODS["storefront.read"].scope);
  if (opts.variantSelect === true)
    granted.push(THEME_METHODS["variant.select"].scope);
  if (opts.cartAdd === true) granted.push(THEME_METHODS["cart.add"].scope);
  if (opts.navigate === true) granted.push(THEME_METHODS["navigate"].scope);
  return {
    granted,
    navigateAllowlist: normalizeAllowlist(opts.navigateAllowlist),
  };
}

/**
 * Revocation constructor: strips every granted scope so a revoked or
 * kill-switched install authorizes nothing, while preserving the normalized
 * navigate allowlist (same pattern as `buildThemeGrants` — the allowlist
 * alone never authorizes, so re-granting later cannot inherit a stale list
 * silently). Never mutates its input; revoking an empty set stays empty.
 * The bridge maps the revoked set to per-call `scope_denied`, and hosts
 * with a liveness signal pass `suspended: true` in the auth context for the
 * explicit `suspended` refusal instead.
 */
export function revokeThemeGrants(set: ThemeGrantSet): ThemeGrantSet {
  return {
    granted: [],
    navigateAllowlist: [...(set?.navigateAllowlist ?? [])],
  };
}

function normalizeAllowlist(input: readonly string[] | undefined): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const origin = raw.trim().toLowerCase();
    if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(origin) && !out.includes(origin))
      out.push(origin);
  }
  return out;
}

// ------------------------------------------------------------ navigation

const BLOCKED_SCHEMES = /^(javascript|data|blob|vbscript|file|ftp):/i;

/** Control characters have no business in a navigation target. */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

/**
 * Allowlist check for `navigate` targets. Accepts same-store absolute paths
 * (`/products/x`) and absolute https URLs whose origin is allowlisted.
 * Rejects everything else: exotic schemes, protocol-relative URLs, bare
 * relative paths (no base to resolve against inside the null-origin frame),
 * and non-https origins. Pure — unit-testable, no DOM.
 */
export function isNavigationAllowed(
  href: unknown,
  allowlist: readonly string[],
): boolean {
  if (typeof href !== "string") return false;
  const target = href.trim();
  if (!target || target.length > 2048) return false;
  if (hasControlChars(target)) return false;
  if (BLOCKED_SCHEMES.test(target)) return false;
  if (target.startsWith("//")) return false;
  if (target.startsWith("/")) return true;
  const m = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/.*)?$/i.exec(target);
  if (!m) return false;
  const origin = target.slice(0, target.length - (m[2] ?? "").length);
  return (allowlist as readonly string[]).includes(origin.toLowerCase());
}

// ------------------------------------------------------------ forbidden fields

/**
 * Keys a theme must never be able to push through the bridge. Normalized
 * before comparison (lowercase, strip `_`/`-`), so `tenantId`, `tenant_id`
 * and `tenant-id` are one rule. Price-affecting fields are here because the
 * server reprices every commerce action from its own catalog; tenant/payment
 * fields are here because cross-tenant and payment-state forgery are the two
 * attacks this lane exists to contain. `merchant`/`merchantId` are here
 * because the tenant is resolved server-side from the URL slug / session,
 * never from bridge params — a merchant field over the bridge is a
 * cross-tenant probe by definition.
 */
const FORBIDDEN_PARAM_KEYS = new Set([
  "price",
  "prices",
  "amount",
  "total",
  "subtotal",
  "discount",
  "currency",
  "stock",
  "inventory",
  "inventoryquantity",
  "tenant",
  "tenantid",
  "shopid",
  "storeid",
  "merchant",
  "merchantid",
  "secret",
  "secrets",
  "apikey",
  "token",
  "tokens",
  "accesstoken",
  "paymentstatus",
  "paymenttoken",
  "paymentid",
  "orderstatus",
  "password",
  "card",
  "cardnumber",
  "cvv",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function isForbiddenParamKey(key: string): boolean {
  return FORBIDDEN_PARAM_KEYS.has(normalizeKey(key));
}

const MAX_SCAN_DEPTH = 8;
const MAX_SCAN_KEYS = 512;

/**
 * Deep scan for forbidden keys in bridge params. Returns the offending key
 * paths (`cart.price`, `items[0].tenantId`). Cycle-safe (tracks visited
 * objects) and bounded (depth + key caps) so a hostile payload cannot turn
 * the scan itself into a DoS vector. The bridge REJECTS on any hit
 * (`theme.forbidden_field`); `sanitizeThemeParams` below is the second layer
 * for the host path.
 */
export function findForbiddenFields(value: unknown): string[] {
  const hits: string[] = [];
  const seen = new Set<object>();
  let scanned = 0;
  const walk = (node: unknown, path: string, depth: number): void => {
    if (hits.length > 64 || scanned > MAX_SCAN_KEYS || depth > MAX_SCAN_DEPTH)
      return;
    if (Array.isArray(node)) {
      if (seen.has(node)) return;
      seen.add(node);
      node.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    if (node && typeof node === "object") {
      if (seen.has(node)) return;
      seen.add(node);
      for (const key of Object.keys(node)) {
        scanned++;
        if (scanned > MAX_SCAN_KEYS) return;
        const childPath = path ? `${path}.${key}` : key;
        if (isForbiddenParamKey(key)) {
          hits.push(childPath);
          continue;
        }
        walk((node as Record<string, unknown>)[key], childPath, depth + 1);
      }
    }
  };
  walk(value, "", 0);
  return hits;
}

export function containsForbiddenFields(value: unknown): boolean {
  return findForbiddenFields(value).length > 0;
}

export type SanitizedParams = {
  /** Deep copy of `params` with every forbidden subtree removed. */
  clean: unknown;
  /** Key paths that were stripped (for logging; never echoed to the frame). */
  stripped: string[];
};

/**
 * Defense-in-depth sanitizer applied to admitted params before they reach
 * the host `onCall`. The bridge already rejects envelopes carrying forbidden
 * fields — this covers the case where a future method legitimately accepts a
 * wider shape. `__proto__` keys are dropped outright (prototype pollution).
 */
export function sanitizeThemeParams(params: unknown): SanitizedParams {
  const stripped: string[] = [];
  const seen = new Map<object, unknown>();
  const walk = (node: unknown, path: string, depth: number): unknown => {
    if (depth > MAX_SCAN_DEPTH) return undefined;
    if (Array.isArray(node)) {
      if (seen.has(node)) return seen.get(node);
      const out: unknown[] = [];
      seen.set(node, out);
      node.forEach((item, i) => {
        out.push(walk(item, `${path}[${i}]`, depth + 1));
      });
      return out;
    }
    if (node && typeof node === "object") {
      if (seen.has(node)) return seen.get(node);
      const out: Record<string, unknown> = {};
      seen.set(node, out);
      for (const key of Object.keys(node)) {
        if (key === "__proto__") {
          stripped.push(path ? `${path}.${key}` : key);
          continue;
        }
        const childPath = path ? `${path}.${key}` : key;
        if (isForbiddenParamKey(key)) {
          stripped.push(childPath);
          continue;
        }
        const cleaned = walk(
          (node as Record<string, unknown>)[key],
          childPath,
          depth + 1,
        );
        if (cleaned !== undefined) out[key] = cleaned;
      }
      return out;
    }
    return node;
  };
  return { clean: walk(params, "", 0), stripped };
}
