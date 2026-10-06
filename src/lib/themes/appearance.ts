/**
 * Phase 15 — Appearance › Themes, pure layer.
 *
 * Everything here is deterministic and dependency-free so the themes screen,
 * the install screen and the server layer share one vocabulary: what an
 * installed theme is, what a catalogue theme is, how the feature filter and
 * the search box narrow a catalogue, and what makes an uploaded `.zip`
 * acceptable. No Supabase, no React — the tests drive this file directly.
 */

/* ------------------------------------------------------------------ models */

export type InstalledTheme = {
  id: string;
  /** Registry key when the theme came from the catalogue, else null. */
  key: string | null;
  name: string;
  author: string;
  description: string;
  version: string;
  tags: string[];
  screenshotUrl: string | null;
  isActive: boolean;
  autoUpdate: boolean;
  favourite: boolean;
  /** Null for rows written before install timestamps were recorded. */
  installedAt: string | null;
  /** Newer catalogue version available for `key`, when one exists. */
  updateAvailable: string | null;
};

export type CatalogTheme = {
  key: string;
  name: string;
  summary: string;
  author: string;
  category: string;
  version: string;
  screenshotUrl: string | null;
  tags: string[];
  subjects: string[];
  features: string[];
  layouts: string[];
  rating: number;
  installs: number;
  /** Present in the merchant's installed list already. */
  installed: boolean;
  /** Installed *and* active. */
  active: boolean;
  favourite: boolean;
  /**
   * B2 — catalogue provenance. `official` = Framique-built (Songoskriti,
   * Somvabona) installed through the normal `installPackage` pipeline
   * against the internally-built artifact; `community` = registry / third
   * party. The catalogue renders them as separate sections.
   */
  provenance: ThemeProvenance;
};

/* ------------------------------------------------- catalogue provenance (B2)
 *
 * Official / Community / Upload model (proposal
 * `official-packages-builtin-model`): the catalogue has an Official
 * section (exactly the two built themes — no third vapor theme exists),
 * a Community section, and an Upload Theme entry. Official entries carry
 * an artifact ref (checksum + `official:<key>` pin); the bytes behind
 * the ref stay server-side and are never downloadable.
 */

/** Framique-built themes. Exactly these two — no OceanBlue source exists. */
export const OFFICIAL_THEME_KEYS = [
  "songoskriti",
  "somvabona",
] as const;

export type OfficialThemeKey = (typeof OFFICIAL_THEME_KEYS)[number];

export type ThemeProvenance = "official" | "community";

/** Ledger/catalogue pin for an official artifact: `official:<key>`. */
export const OFFICIAL_PIN_PREFIX = "official:";

export function officialPinFor(key: string): string {
  return `${OFFICIAL_PIN_PREFIX}${key}`;
}

/** True for the two official keys only — a third catalogue key is never official. */
export function isOfficialThemeKey(key: string): key is OfficialThemeKey {
  return (OFFICIAL_THEME_KEYS as readonly string[]).includes(key);
}

/**
 * Serializable artifact identity surfaced on official catalogue entries.
 * Mirrors the plugin `ListingArtifactRef` contract: checksum of the exact
 * ZIP the pipeline installs, the manifest version pinned inside it, the
 * archive name handed to `installPackage`, and the `official:<key>` pin.
 * The bytes themselves stay server-side (build-lane owned, never exposed).
 */
export type OfficialArtifactRef = {
  checksum: string;
  version: string;
  fileName: string;
  pinned: string;
};

export function officialArtifactRef(
  key: OfficialThemeKey,
  version: string,
  checksum: string,
): OfficialArtifactRef {
  return {
    checksum,
    version,
    fileName: `${key}.zip`,
    pinned: officialPinFor(key),
  };
}

export type CatalogSections = {
  official: CatalogTheme[];
  community: CatalogTheme[];
};

/**
 * Split a catalogue into its Official / Community sections. Official
 * entries come first in `OFFICIAL_THEME_KEYS` order (Songoskriti, then
 * Somvabona); community keeps catalogue order. Either section may be
 * empty — an empty official section renders the graceful "not built yet"
 * empty-state, never a hole in the screen.
 */
export function sectionCatalogue(themes: CatalogTheme[]): CatalogSections {
  const official = themes
    .filter((t) => t.provenance === "official")
    .sort(
      (a, b) =>
        OFFICIAL_THEME_KEYS.indexOf(a.key as OfficialThemeKey) -
        OFFICIAL_THEME_KEYS.indexOf(b.key as OfficialThemeKey),
    );
  const community = themes.filter((t) => t.provenance !== "official");
  return { official, community };
}

export type ThemesWorkspace = {
  installed: InstalledTheme[];
  catalogue: CatalogTheme[];
};

/* -------------------------------------------------------- feature taxonomy */

export type FilterGroup = {
  id: "subjects" | "features" | "layouts";
  label: string;
  options: string[];
};

/** WordPress' three-column "Feature filter" drawer, in our vocabulary. */
export const FEATURE_FILTERS: FilterGroup[] = [
  {
    id: "subjects",
    label: "Subject",
    options: [
      "fashion",
      "electronics",
      "grocery",
      "beauty",
      "home",
      "b2b",
      "marketplace",
      "single product",
      "food",
      "services",
    ],
  },
  {
    id: "features",
    label: "Features",
    options: [
      "quick view",
      "mega menu",
      "sticky header",
      "product filters",
      "wishlist",
      "reviews",
      "dark mode",
      "rtl ready",
      "bangla ready",
      "accessibility ready",
      "block patterns",
      "custom colours",
    ],
  },
  {
    id: "layouts",
    label: "Layout",
    options: [
      "grid",
      "list",
      "sidebar left",
      "sidebar right",
      "full width",
      "boxed",
      "one column",
      "two column",
    ],
  },
];

export type FeatureSelection = {
  subjects: string[];
  features: string[];
  layouts: string[];
};

export const EMPTY_SELECTION: FeatureSelection = {
  subjects: [],
  features: [],
  layouts: [],
};

export function selectionCount(selection: FeatureSelection): number {
  return (
    selection.subjects.length +
    selection.features.length +
    selection.layouts.length
  );
}

export function toggleFeature(
  selection: FeatureSelection,
  group: FilterGroup["id"],
  option: string,
): FeatureSelection {
  const current = selection[group];
  const next = current.includes(option)
    ? current.filter((entry) => entry !== option)
    : [...current, option];
  return { ...selection, [group]: next };
}

/* ------------------------------------------------------------ search + sort */

function haystack(theme: CatalogTheme): string {
  return [
    theme.name,
    theme.summary,
    theme.author,
    theme.category,
    ...theme.tags,
    ...theme.features,
  ]
    .join(" ")
    .toLowerCase();
}

/** Whitespace-separated AND search, same feel as the WordPress search box. */
export function searchCatalog(
  themes: CatalogTheme[],
  query: string,
): CatalogTheme[] {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return themes;
  return themes.filter((theme) => {
    const text = haystack(theme);
    return terms.every((term) => text.includes(term));
  });
}

export function searchInstalled(
  themes: InstalledTheme[],
  query: string,
): InstalledTheme[] {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return themes;
  return themes.filter((theme) => {
    const text = [theme.name, theme.author, theme.description, ...theme.tags]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** Every selected option must be present — WordPress' filter is an AND. */
export function filterCatalog(
  themes: CatalogTheme[],
  selection: FeatureSelection,
): CatalogTheme[] {
  if (selectionCount(selection) === 0) return themes;
  return themes.filter(
    (theme) =>
      selection.subjects.every((entry) => theme.subjects.includes(entry)) &&
      selection.features.every((entry) => theme.features.includes(entry)) &&
      selection.layouts.every((entry) => theme.layouts.includes(entry)),
  );
}

export type CatalogTab = "popular" | "latest" | "favourites";

export const CATALOG_TABS: { id: CatalogTab; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "latest", label: "Latest" },
  { id: "favourites", label: "Favourites" },
];

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when `candidate` is strictly newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersion(candidate, current) > 0;
}

export function sortCatalog(
  themes: CatalogTheme[],
  tab: CatalogTab,
): CatalogTheme[] {
  const list = themes.slice();
  if (tab === "favourites") return list.filter((theme) => theme.favourite);
  if (tab === "latest") {
    return list.sort(
      (a, b) =>
        compareVersion(b.version, a.version) || a.name.localeCompare(b.name),
    );
  }
  return list.sort(
    (a, b) =>
      b.installs - a.installs ||
      b.rating - a.rating ||
      a.name.localeCompare(b.name),
  );
}

/** Search → filter → tab sort, in the order the install screen applies them. */
export function catalogView(
  themes: CatalogTheme[],
  options: { query?: string; selection?: FeatureSelection; tab?: CatalogTab },
): CatalogTheme[] {
  const searched = searchCatalog(themes, options.query ?? "");
  const filtered = filterCatalog(
    searched,
    options.selection ?? EMPTY_SELECTION,
  );
  return sortCatalog(filtered, options.tab ?? "popular");
}

/**
 * Catalogue curation, retired with the B2 Official/Community model.
 *
 * The install screen now sections the catalogue by provenance (official
 * vs community) instead of an allowlist: registry rows are DB-curated and
 * official entries arrive only with their built artifact. Every catalogue
 * entry passes through, so an installed theme is always manageable.
 */
export const VISIBLE_THEME_KEYS: ReadonlySet<string> = new Set([]);

/** Installed grid: every installed row stays manageable (never strand). */
export function visibleInstalled(themes: InstalledTheme[]): InstalledTheme[] {
  return themes.slice();
}

/** Catalogue: allowlisted keys only. */
export function visibleCatalogue(themes: CatalogTheme[]): CatalogTheme[] {
  return themes.slice();
}

/* ------------------------------------------------------- gallery keys
 *
 * K2 — installed artifact authoritative.
 *
 * The preview gallery lists merchant-installed package keys ONLY when the
 * caller passes a merchant installed set (array, even empty): uninstalled
 * catalogue/source keys fail closed (disappear, never a silent wrong-theme
 * link). Legacy null/undefined callers with no merchant context (build
 * tooling, merchant-less fallbacks) list catalogue keys. Malformed rows
 * (null, blank, non-string keys, even a non-array container) are skipped —
 * the listing never throws on untrusted input.
 */
export function galleryKeys(
  catalogue: readonly unknown[] | null | undefined,
  installed: readonly unknown[] | null | undefined,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (entry: unknown) => {
    const raw =
      typeof entry === "string"
        ? entry
        : (entry as { key?: unknown } | null | undefined)?.key;
    if (typeof raw !== "string") return;
    const key = raw.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  // K2: merchant context (installed array, even empty) lists installed ONLY —
  // catalogue/source keys fail closed. Legacy null/undefined installed lists
  // catalogue keys for build tooling / merchant-less fallbacks.
  if (Array.isArray(installed)) {
    for (const entry of installed) push(entry);
    return keys;
  }
  for (const entry of Array.isArray(catalogue) ? catalogue : []) push(entry);
  return keys;
}

/** Active theme first, then favourites, then newest install. */
export function orderInstalled(themes: InstalledTheme[]): InstalledTheme[] {
  // installedAt can be null for rows written before the column was reliably
  // set — a null must sort, never throw (it once blanked the whole screen).
  const at = (t: InstalledTheme) => t.installedAt ?? "";
  return themes
    .slice()
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        Number(b.favourite) - Number(a.favourite) ||
        at(b).localeCompare(at(a)) ||
        a.name.localeCompare(b.name),
    );
}

/* ------------------------------------------------------------- screenshots */

const PLATE_HUES = [250, 190, 24, 300, 140, 12, 210, 84];

/** Deterministic gradient plate for a theme without a screenshot. */
export function screenshotPlate(seed: string): {
  from: string;
  to: string;
  angle: number;
} {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1)
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = PLATE_HUES[hash % PLATE_HUES.length]!;
  const second = PLATE_HUES[(hash >>> 3) % PLATE_HUES.length]!;
  return {
    from: `oklch(0.62 0.14 ${hue})`,
    to: `oklch(0.42 0.10 ${second})`,
    angle: 120 + (hash % 5) * 12,
  };
}

export function themeInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return "TH";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/* ----------------------------------------------------------------- uploads */

export const MAX_THEME_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadCheck =
  { ok: true; name: string } | { ok: false; reason: string };

/** Front-of-house validation for the `.zip` drop-zone on the install screen. */
export function validateThemeUpload(file: {
  name: string;
  size: number;
}): UploadCheck {
  const name = file.name.trim();
  if (!name) return { ok: false, reason: "The file needs a name." };
  if (!/\.zip$/iu.test(name))
    return { ok: false, reason: "Theme packages must be a .zip file." };
  if (file.size <= 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_THEME_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `Theme packages must stay under ${MAX_THEME_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }
  return { ok: true, name };
}

/** Human label for a byte count, used by the drop-zone helper line. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------- navigation */

/** Index of `id` in `list`, wrapped, for the `‹ ›` arrows in the details modal. */
export function neighbourTheme<T extends { id?: string; key?: string | null }>(
  list: T[],
  current: T,
  direction: -1 | 1,
): T | null {
  if (list.length < 2) return null;
  const index = list.indexOf(current);
  if (index < 0) return null;
  const next = (index + direction + list.length) % list.length;
  return list[next] ?? null;
}

/* ----------------------------------------------------------------- preview */

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const PREVIEW_WIDTHS: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 810,
  mobile: 390,
};

export function previewUrl(
  storeSlug: string,
  themeKey: string | null,
  device: PreviewDevice,
): string {
  // Live preview must show the whole theme with demo content. The old
  // `/store/<slug>?preview_theme=` shape answers bare 404 on platform
  // hosts since the custom-domain cutover (empty iframe). Point at the
  // public blueprint preview instead, which renders tokens + sections
  // with demo rows. Keyless (custom-upload) themes keep the legacy
  // store URL — same as before, no worse.
  if (themeKey) {
    const params = new URLSearchParams({ preview_device: device });
    return `/theme-preview/${themeKey}?${params.toString()}`;
  }
  const params = new URLSearchParams({ preview_device: device });
  return `/store/${storeSlug}?${params.toString()}`;
}
