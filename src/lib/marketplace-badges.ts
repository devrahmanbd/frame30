/**
 * Marketplace theme-card badge resolution (pure, client-safe).
 *
 * WordPress parity: `store_themes.is_active` is the ONLY source of Active.
 * The `marketplace_installs` ledger is a fallback for the Installed badge —
 * it must never confer Active on its own. A live ledger row with an inactive
 * (or missing) theme row means "installed, not live".
 *
 * B2 decisions (Sept 2026, WordPress-parity tails):
 * - "paused counts as Installed" is INTENTIONAL, not a bug: pausing is
 *   WordPress's "deactivate but keep files" — the package is still present,
 *   so the card shows Installed (never Active; Active needs the row flag).
 *   Terminal states (`removed`, `rolled_back`, `uninstalling`, `purged`)
 *   are the only ones that clear the badge.
 * - Source coherence: `store_themes` carries TWO pointers that answer
 *   different questions. `source_listing_slug` is catalog identity ("which
 *   registry entry seeded this row"); `source_install_id` is ledger linkage
 *   ("which purchase/install event owns this row", the delete-cascade key).
 *   Catalog installs write `theme_id: NULL` on the ledger row, so matching
 *   ledger rows by `theme_id` alone misses every catalog install — the slug
 *   fallback below is the coherent read path, not a second source of truth.
 *
 * QUBICKLE M1 — single-writer contract for the ledger NULL divergence
 * (Rule 11/13, Sept 2026). Exactly one writer owns each nullable ledger
 * pointer, and readers must respect the pairing:
 * - Third-party installs (marketplace-install.server.ts `installListing`)
 *   write `theme_id = listing.id` / `widget_id = listing.id`.
 * - Catalog installs (themes/appearance.server.ts `installCatalogTheme`)
 *   write `theme_id = NULL`, `widget_id = NULL`; identity lives ONLY in
 *   `listing_slug`, linkage ONLY in `store_themes.source_install_id`.
 * - Upload installs write a synthetic `listing_slug = upload:<slug>-<rand>`
 *   unique per install; identity is per-row, never per-slug.
 * - Builtin widget installs write `theme_id = NULL`, `widget_id = NULL`
 *   with the builtin id in `listing_slug`.
 * Readers: badge Installed matches `theme_id = listingId OR
 * `listing_slug = slug` (see hasLiveLedger); deletes resolve by
 * `source_install_id` and NEVER by slug-sweep (C1). Any new writer that
 * adds a third NULL convention must update this contract, not silently
 * extend it.
 */

export type ThemeStateRef = {
  slug: string;
  themeId: string;
  isActive: boolean;
};

export type InstallRef = {
  theme_id?: string | null;
  widget_id?: string | null;
  listing_slug?: string | null;
  status: string;
};

/** Ledger rows in these states count as "installed" for badges and actions. */
export function isLiveInstallStatus(status: string): boolean {
  return status === "installed" || status === "trial" || status === "paused";
}

/**
 * QUBICKLE H5 — status is not enough: an expired trial is lapsed, never
 * live, even while its row still reads `trial` (lazy-lapse in
 * marketplace-install.server.ts parks it on terminal `lapsed`; this helper
 * is the read-side guard for callers that already hold the row).
 */
export function isInstallLive(
  status: string,
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!isLiveInstallStatus(status)) return false;
  if (status !== "trial" || !expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry > nowMs;
}

function hasLiveLedger(
  installs: readonly InstallRef[],
  slug: string,
  listingId: string | null | undefined,
  builtin: boolean,
): boolean {
  return installs.some((i) => {
    if (!isLiveInstallStatus(i.status)) return false;
    if (builtin) return i.listing_slug === slug;
    // Third-party installs carry theme_id = the listing id, but catalog
    // installs write theme_id NULL (identity lives in listing_slug). Match
    // either — a slug-matching live row is the same install event.
    if (listingId) return i.theme_id === listingId || i.listing_slug === slug;
    return i.listing_slug === slug;
  });
}

export function resolveThemeBadge(
  slug: string,
  opts: {
    themeStates: readonly ThemeStateRef[];
    installs: readonly InstallRef[];
    listingId?: string | null;
    builtin?: boolean;
  },
): "active" | "installed" | null {
  const state = opts.themeStates.find((s) => s.slug === slug);
  // Row state wins: only `store_themes.is_active` confers Active. The
  // ledger is fallback for Installed and must never activate on its own.
  if (state?.isActive) return "active";
  if (state) return "installed";
  const live = hasLiveLedger(
    opts.installs,
    slug,
    opts.listingId,
    opts.builtin ?? false,
  );
  if (live) return "installed";
  return null;
}
