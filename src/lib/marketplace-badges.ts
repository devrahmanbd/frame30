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
