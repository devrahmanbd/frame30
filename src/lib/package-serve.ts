/**
 * PKG serving — pure half of the `/pkg/<merchant>/<name>?v=<hash8>` route
 * (`src/routes/pkg.$.ts`, the only writer/reader of this module besides
 * its test).
 *
 * `versionedAssetUrl` (`src/lib/package-store.server.ts`) mints these URLs
 * and stores them on `theme_assets.url`; this module decides what the
 * route serves for them. Public by design (a storefront `<link>` or
 * `fetch` carries no bearer token), so there is no session check here —
 * the guards are:
 *
 * 1. Merchant match: the lookup is scoped to the merchant in the URL path
 *    (`.eq("merchant_id", merchantId).eq("name", name)`), and `resolve`
 *    re-checks the row. A merchant-B asset addressed under merchant-A's
 *    prefix misses and 404s — there is no cross-tenant read.
 * 2. Traversal-safe decode: every path segment is decoded exactly once and
 *    rejected when it is empty, `.`/`..`, or still carries a separator
 *    after decoding (`%2F`, `%5C`, NUL). The asset name must additionally
 *    match a per-version namespace (`themes/<id>/assets/…` or
 *    `plugins/<slug>/<artifact8>/assets/…`), so `..` can never escape it.
 * 3. Content policy: only stored text kinds (`css`, `json`) are served,
 *    inline, with `nosniff`. Images, fonts and SVG are refused (404) —
 *    binary package rows hold no servable bytes (`content` is null for
 *    them), and an SVG must never execute as an inline document on the
 *    platform origin (stored-XSS via a package SVG).
 *
 * `?v=` is a collision-safe cache-buster, NOT authorization: the short
 * hash is 32-bit FNV-1a and the asset bytes of enabled rows are public
 * either way. The route still requires it present and well-formed, and
 * pins it against the stored `url`, so a stale or forged value cannot
 * poison a shared cache under an immutable directive.
 */

const MERCHANT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cache-buster shape minted by `versionedAssetUrl` (8 lowercase hex). */
const VERSION_HASH = /^[0-9a-f]{8}$/;

/**
 * Per-version namespaces minted by `themeVersionPrefix` /
 * `pluginVersionPrefix`. Version ids and slugs never contain `/` or `..`
 * (their constructors throw), so one-or-more non-slash chars per segment
 * is exact.
 */
const ASSET_NAME =
  /^(?:themes\/[^/]+\/assets\/.+|plugins\/[^/]+\/[0-9a-f]{8}\/assets\/.+)$/;

/** Upper bound: legacy custom-asset names cap at 80; versioned rows carry
 * a namespace prefix, so allow headroom without opening a DoS vector. */
const MAX_NAME_LENGTH = 512;

export type PkgTarget = {
  merchantId: string;
  /** DB row name, e.g. `themes/<version-id>/assets/styles/skins.css`. */
  name: string;
};

/**
 * Split + single-decode the `/pkg/` splat. Returns null for anything that
 * is not exactly `<merchant-uuid>/<namespaced-asset-path>`.
 */
export function parsePkgSplat(splat: string): PkgTarget | null {
  const raw = splat.split("/").filter(Boolean);
  if (raw.length < 2) return null;
  const parts: string[] = [];
  for (const segment of raw) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      return null;
    }
    parts.push(decoded);
  }
  const merchantId = parts[0]!;
  if (!MERCHANT_UUID.test(merchantId)) return null;
  const name = parts.slice(1).join("/");
  if (name.length > MAX_NAME_LENGTH) return null;
  if (!ASSET_NAME.test(name) || name.includes("..")) return null;
  return { merchantId, name };
}

/** `?v=` value: present and well-formed, else null. */
export function parsePkgVersion(raw: string | null): string | null {
  if (!raw || !VERSION_HASH.test(raw)) return null;
  return raw;
}

/** Text kinds the route serves inline. Everything else is refused. */
export function isServablePkgKind(kind: string): boolean {
  return kind === "css" || kind === "json";
}

export function pkgContentType(kind: string): string {
  if (kind === "css") return "text/css; charset=utf-8";
  return "application/json; charset=utf-8";
}

export type PkgRow = {
  merchant_id: string;
  name: string;
  kind: string;
  content: string | null;
  url: string | null;
  enabled: boolean;
};

export type PkgOutcome =
  | { status: 200; body: string; headers: Record<string, string> }
  | { status: 404; reason: string };

/**
 * Authorize + shape the response for one stored row. `row` must come from
 * a merchant-scoped lookup (`.eq("merchant_id", target.merchantId)`); the
 * merchant/name re-checks below are defense in depth for callers that
 * query by name alone.
 */
export function resolvePkgAsset(
  target: PkgTarget,
  version: string | null,
  row: PkgRow | null,
): PkgOutcome {
  if (!version) return { status: 404, reason: "bad_version" };
  if (!row) return { status: 404, reason: "missing" };
  if (row.merchant_id !== target.merchantId || row.name !== target.name) {
    return { status: 404, reason: "mismatch" };
  }
  if (!row.enabled) return { status: 404, reason: "disabled" };
  // Pin the exact minted URL so a stale/forged `?v=` cannot ride an
  // immutable cache directive. Legacy rows without a stored URL skip
  // the pin (format check above still applies).
  if (row.url !== null && !row.url.endsWith(`?v=${version}`)) {
    return { status: 404, reason: "stale_version" };
  }
  // SVG, images and fonts are never served inline: binary rows hold no
  // bytes, and an inline SVG on the platform origin would be stored XSS.
  if (!isServablePkgKind(row.kind)) return { status: 404, reason: "refused_kind" };
  if (row.content === null) return { status: 404, reason: "empty" };
  return {
    status: 200,
    body: row.content,
    headers: {
      "content-type": pkgContentType(row.kind),
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
    },
  };
}
