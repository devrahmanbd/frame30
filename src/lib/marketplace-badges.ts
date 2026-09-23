/**
 * Marketplace theme-card badge resolution (pure, client-safe).
 *
 * WordPress parity: `store_themes.is_active` is the ONLY source of Active.
 * The `marketplace_installs` ledger is a fallback for the Installed badge —
 * it must never confer Active on its own. A live ledger row with an inactive
 * (or missing) theme row means "installed, not live".
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
    if (listingId) return i.theme_id === listingId;
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
