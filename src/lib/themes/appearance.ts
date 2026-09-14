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
  installedAt: string;
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
};

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

export type FeatureSelection = { subjects: string[]; features: string[]; layouts: string[] };

export const EMPTY_SELECTION: FeatureSelection = { subjects: [], features: [], layouts: [] };

export function selectionCount(selection: FeatureSelection): number {
  return selection.subjects.length + selection.features.length + selection.layouts.length;
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
  return [theme.name, theme.summary, theme.author, theme.category, ...theme.tags, ...theme.features]
    .join(" ")
    .toLowerCase();
}

/** Whitespace-separated AND search, same feel as the WordPress search box. */
export function searchCatalog(themes: CatalogTheme[], query: string): CatalogTheme[] {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return themes;
  return themes.filter((theme) => {
    const text = haystack(theme);
    return terms.every((term) => text.includes(term));
  });
}

export function searchInstalled(themes: InstalledTheme[], query: string): InstalledTheme[] {
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
export function filterCatalog(themes: CatalogTheme[], selection: FeatureSelection): CatalogTheme[] {
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

export function sortCatalog(themes: CatalogTheme[], tab: CatalogTab): CatalogTheme[] {
  const list = themes.slice();
  if (tab === "favourites") return list.filter((theme) => theme.favourite);
  if (tab === "latest") {
    return list.sort(
      (a, b) => compareVersion(b.version, a.version) || a.name.localeCompare(b.name),
    );
  }
  return list.sort(
    (a, b) => b.installs - a.installs || b.rating - a.rating || a.name.localeCompare(b.name),
  );
}

/** Search → filter → tab sort, in the order the install screen applies them. */
export function catalogView(
  themes: CatalogTheme[],
  options: { query?: string; selection?: FeatureSelection; tab?: CatalogTab },
): CatalogTheme[] {
  const searched = searchCatalog(themes, options.query ?? "");
  const filtered = filterCatalog(searched, options.selection ?? EMPTY_SELECTION);
  return sortCatalog(filtered, options.tab ?? "popular");
}

/** Active theme first, then favourites, then newest install. */
export function orderInstalled(themes: InstalledTheme[]): InstalledTheme[] {
  return themes
    .slice()
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        Number(b.favourite) - Number(a.favourite) ||
        b.installedAt.localeCompare(a.installedAt) ||
        a.name.localeCompare(b.name),
    );
}

/* ------------------------------------------------------------- screenshots */

const PLATE_HUES = [250, 190, 24, 300, 140, 12, 210, 84];

/** Deterministic gradient plate for a theme without a screenshot. */
export function screenshotPlate(seed: string): { from: string; to: string; angle: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
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

export type UploadCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Front-of-house validation for the `.zip` drop-zone on the install screen. */
export function validateThemeUpload(file: { name: string; size: number }): UploadCheck {
  const name = file.name.trim();
  if (!name) return { ok: false, reason: "The file needs a name." };
  if (!/\.zip$/iu.test(name)) return { ok: false, reason: "Theme packages must be a .zip file." };
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
  const params = new URLSearchParams({ preview_device: device });
  if (themeKey) params.set("preview_theme", themeKey);
  return `/store/${storeSlug}?${params.toString()}`;
}
