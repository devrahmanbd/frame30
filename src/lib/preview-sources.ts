/**
 * Preview theme registry — the composition root for theme previews.
 *
 * This map is the composition root for theme previews: official themes
 * resolve from the single built-in registry (`themes/builtin-themes`,
 * trusted source modules). Adding a theme means a new folder under
 * `lib/themes` exporting a preview source plus one entry there. The engine
 * (`theme-preview-nav`) never names a theme, and themes never import engine
 * behavior — they only implement its port type.
 *
 * K2 — installed artifact authoritative: when the caller passes a merchant
 * installed set (array, even empty) resolution and listing come ONLY from
 * that set and uninstalled/unknown keys fail closed to null (route 404s,
 * never a silent wrong theme).
 *
 * O2 — source-free runtime graph: this module never imports theme source.
 * The static table below holds ONLY build-time-registered factories —
 * build tooling and tests (build-time contexts) import theme preview
 * modules directly and publish their factories through
 * `registerStaticPreviewSource`. Legacy null/undefined callers with no
 * merchant context resolve from the registered table; unregistered keys
 * fail closed to null. Merchant-aware callers MUST pass the installed set.
 */
import type { PreviewThemeSource } from "./theme-preview-nav";
import { getBuiltinTheme, builtinThemeKeys } from "./themes/builtin-themes";
import {
  parseTemplates,
  parseTokens,
  templateOf,
  type TemplateKey,
} from "./builder-ast";
import {
  applyVariationTokens,
  variationForKey,
  type ThemeVariation,
} from "./theme-variations";

/* ------------------------- build-time static sources ------------------- */

export type StaticPreviewSourceFactory = (
  variationKey?: string,
) => PreviewThemeSource;

/**
 * Build-time-only static sources. Theme source modules are NEVER imported
 * here, so the runtime import graph stays source-free. Build tooling and
 * tests (build-time contexts) import theme preview modules directly and
 * publish their factories through `registerStaticPreviewSource`; production
 * runtime resolves merchant previews exclusively from installed artifacts
 * and unregistered keys fail closed to null.
 */
const STATIC_SOURCES: Record<string, StaticPreviewSourceFactory> = {};

export function registerStaticPreviewSource(
  key: string,
  factory: StaticPreviewSourceFactory,
): void {
  const clean = typeof key === "string" ? key.trim() : "";
  if (!clean || typeof factory !== "function") return;
  STATIC_SOURCES[clean] = factory;
}

/* ------------------------- installed package discovery ---------------- */

export type InstalledPreviewArtifact = {
  /** Discovery key: the package slug (`store_themes.source_listing_slug`). */
  key: string;
  themeName?: string | null;
  author?: string | null;
  /** Artifact content: the installed version row's `tokens` / `templates`. */
  tokens?: unknown;
  templates?: unknown;
  variations?: ThemeVariation[] | null;
};

/**
 * Anything a caller may pass as the installed set: bare slugs, keyed rows,
 * or full artifacts. Garbage entries (null, blank, non-string keys) are
 * ignored — discovery never throws on untrusted input.
 */
export type InstalledThemeRef =
  | string
  | { key?: unknown }
  | InstalledPreviewArtifact
  | null
  | undefined;

/** Normalized discovery key for one installed entry, or null to skip it. */
export function installedThemeKeyOf(entry: unknown): string | null {
  const raw =
    typeof entry === "string"
      ? entry
      : (entry as { key?: unknown } | null | undefined)?.key;
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key ? key : null;
}

/** First installed entry carrying artifact content for `key`, if any. */
function installedArtifactFor(
  installed: readonly InstalledThemeRef[],
  key: string,
): InstalledPreviewArtifact | null {
  for (const entry of installed) {
    if (!entry || typeof entry !== "object") continue;
    if (installedThemeKeyOf(entry) !== key) continue;
    return entry as InstalledPreviewArtifact;
  }
  return null;
}

/**
 * Preview source synthesized from an installed version's artifact content.
 * Tokens parse through the same gate as drafts; templates serve their
 * stored AST per template (un-authored templates return null so the engine
 * synthesizes its generic demo body — same contract as built-in sources).
 * The requested variation applies over the stored base tokens; unknown
 * keys fall back to the base, never throw.
 */
function installedPreviewSource(
  artifact: InstalledPreviewArtifact,
  variationKey?: string,
): PreviewThemeSource {
  const variations = Array.isArray(artifact.variations)
    ? artifact.variations
    : [];
  const base = parseTokens(artifact.tokens);
  const variation = variationForKey(variations, variationKey);
  const templates = parseTemplates(artifact.templates);
  const themeName =
    typeof artifact.themeName === "string" && artifact.themeName.trim()
      ? artifact.themeName.trim().slice(0, 80)
      : artifact.key;
  const author =
    typeof artifact.author === "string" && artifact.author.trim()
      ? artifact.author.trim().slice(0, 80)
      : "Merchant";
  return {
    key: artifact.key,
    themeName,
    author,
    tokens: applyVariationTokens(base, variation),
    variations,
    header: (template: TemplateKey) => templateOf(templates, template).header,
    footer: (template: TemplateKey) => templateOf(templates, template).footer,
    main: (template: TemplateKey) => {
      const main = templateOf(templates, template).main;
      return main.length ? main : null;
    },
  };
}

export function previewSourceFor(
  key: string,
  variationKey?: string,
  installed?: readonly InstalledThemeRef[] | null,
): PreviewThemeSource | null {
  // K2: installed authoritative. Merchant context (array, even empty) resolves
  // ONLY from the installed set — uninstalled keys fail closed to null, never
  // the static source (no silent wrong theme). Legacy null/undefined (no
  // merchant context, build tooling) resolves from the build-time-registered
  // static table; unregistered keys fail closed to null.
  if (installed !== null && installed !== undefined) {
    const artifact = installedArtifactFor(installed, key);
    return artifact ? installedPreviewSource(artifact, variationKey) : null;
  }
  const factory = STATIC_SOURCES[key];
  if (factory) return factory(variationKey);
  // Frame30: official themes resolve from trusted source modules through the
  // single built-in registry — no build-time registration or bundle needed.
  const builtin = getBuiltinTheme(key);
  if (builtin) return builtin.source(variationKey);
  return null;
}

/** Installed keys when merchant context present; built-in official keys for legacy null/undefined. */
export function previewSourceKeys(
  installed?: readonly InstalledThemeRef[] | null,
): string[] {
  if (installed === null || installed === undefined) {
    // Frame30: built-in registry is authoritative for legacy callers; static
    // overrides (tests/build tooling) join, never replace.
    const keys = [...builtinThemeKeys()];
    for (const k of Object.keys(STATIC_SOURCES)) {
      if (!keys.includes(k as never)) keys.push(k);
    }
    return keys;
  }
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const entry of installed) {
    const key = installedThemeKeyOf(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/** Default demo theme for merchant-less storefront URLs. First registered. */
export function defaultPreviewKey(): string {
  return previewSourceKeys()[0] ?? "songoskriti";
}

/**
 * Demo target for a merchant-less storefront permalink (/c/*, /p/* on a
 * platform host): the theme preview renders it with demo data instead of
 * a dead "not found" page. Actions stay blocked, page stays noindex.
 */
export function demoPreviewTarget(
  key: string,
  template: TemplateKey,
  slug: string,
): string {
  const clean = slug.trim().toLowerCase().slice(0, 80);
  return `/theme-preview/${key}?template=${template}&focus=${encodeURIComponent(clean)}`;
}
