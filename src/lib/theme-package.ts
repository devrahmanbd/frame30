/**
 * PKG-1 — theme/plugin package manifest + validation (theme side).
 *
 * Pure module: no network, no database, no React. A third-party theme ships
 * as a data-only JSON package (tokens + templates + manifest) and this is
 * the single gate the review pipeline, the install flow and the host all
 * run — the real module behind the `docs/themes/packages.md` spec, which
 * names `src/lib/theme-package.ts` / `validateThemePackage`.
 *
 * Data-only rule: NOTHING in this format executes. Names, descriptions and
 * asset paths are scanned for executable content (`EXECUTABLE_RE`), asset
 * file extensions are denied executables (`EXECUTABLE_ASSET_EXTS`), and
 * there is intentionally no `entry` / `code` / `script` field anywhere —
 * unlike plugin widgets, which run inside the sandboxed island behind
 * `render_storefront` (`src/lib/plugin-manifest.ts`), a theme only ever
 * declares tokens, templates and presentation claims the engine renders.
 *
 * Guard reuse (byte-identical semantics, no drift):
 * - slug / semver / API-range shapes mirror `plugin-manifest.ts:292-330`
 *   (`ID_RE` / `KEY_RE` / `satisfiesApiRange`) and
 *   `marketplace-scopes.ts:152-166` (`parseSemver`);
 * - `templates` keys are a subset of `TEMPLATE_KEYS`
 *   (`src/lib/builder-ast.ts:46-59`);
 * - `supportedWidgets` must all exist in the closed widget catalogue
 *   (`WIDGET_TYPES` in `src/lib/widget-registry.ts:951`, itself keyed by the
 *   closed `SectionType` enum in `src/lib/builder-ast.ts:212`);
 * - `capabilities` reuse the closed `SCOPES` vocabulary
 *   (`src/lib/marketplace-scopes.ts:24-105`) restricted to the read-only
 *   theme subset below — a theme never mutates and never sees PII;
 * - plugin dependency refs reuse the `plugin:{id}` / `plugin:{id}/{widget}`
 *   shapes from `pluginWidgetKey` / `parsePluginWidgetKey`
 *   (`src/lib/plugin-manifest.ts:295-306`).
 *
 * Fail-closed: `validateThemeManifest` never throws — malformed input,
 * duplicate/invalid ids, unsupported API ranges, unknown widgets,
 * unknown capabilities, invalid presentation contracts and invalid
 * widget/plugin references all return `{ ok: false, errors }` with stable
 * reason codes. Anything unexpected inside the gate degrades to
 * `manifest.invalid`.
 */

import { TEMPLATE_KEYS, type TemplateKey } from "./builder-ast";
import type { SectionType } from "./builder-ast";
import { WIDGET_TYPES } from "./widget-registry";
import { BUILDER_API_VERSION, satisfiesApiRange } from "./plugin-manifest";
import { normalizeScopes, parseSemver } from "./marketplace-scopes";

export { BUILDER_API_VERSION };

/** Builder API range officially shipped themes are built against. */
export const THEME_API_RANGE = "^3.0.0";

/** Theme slug: 1–60 chars, lowercase alnum + hyphen (cf. packages.md). */
export const THEME_KEY_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * Closed presentation-surface vocabulary — WHERE a theme may present.
 * - `widget`: per-widget presentations via `registerThemePresentation`
 *   (`src/lib/theme-presentations.ts`).
 * - `header`: header-slot composition / chrome.
 * - `menu`: navigation menu bindings (menu pick bindings: menuId / handles /
 *   pages / query — see `docs/themes/presentation-primitives.md` §6).
 * - `announcement`: announcement-bar chrome around the shared
 *   `AnnouncementBar` surface.
 * - `footer`: footer presentation over `FooterData`
 *   (`src/components/store/StoreFooterMenus.tsx`).
 */
export const PRESENTATION_SURFACES = [
  "widget",
  "header",
  "menu",
  "announcement",
  "footer",
] as const;
export type PresentationSurface = (typeof PRESENTATION_SURFACES)[number];

/** Closed locale vocabulary — mirrors `LOCALES` (`src/lib/bitext.ts:13`). */
export const THEME_LOCALES = ["en", "bn"] as const;
export type ThemeLocale = (typeof THEME_LOCALES)[number];

/**
 * Closed theme-capability vocabulary — WHAT a data-only package may use.
 * A strict read-only subset of `SCOPES`
 * (`src/lib/marketplace-scopes.ts:24-105`); every other scope is rejected
 * (`capabilities.forbidden:*`), because a theme never mutates store data:
 * - `read_shop`: read the store profile (name, currency, locale, theme
 *   tokens) — token resolution is per store.
 * - `read_products`: read the published catalog — product widgets
 *   (grids, rails, cards) render catalog rows.
 * - `read_menus`: read navigation menus — menu/footer bindings render
 *   menu rows the engine turns into markup.
 * - `render_storefront`: render the theme's own presentations inside the
 *   published theme. Mandatory for every package (a theme that cannot
 *   render is malformed), mirroring the
 *   `permissions.render_storefront_required` rule in
 *   `src/lib/plugin-manifest.ts:484-489`.
 *
 * Explicitly excluded (rejected as forbidden): every `write_*` scope
 * (themes never mutate), `read_orders` / `read_customers` (PII — themes
 * never see orders or contacts), `write_analytics`, and `replace_menus`
 * (full nav-renderer swaps stay on the review-gated plugin path behind
 * `decideMenuRenderer`).
 */
export const THEME_CAPABILITIES = [
  "read_shop",
  "read_products",
  "read_menus",
  "render_storefront",
] as const;
export type ThemeCapability = (typeof THEME_CAPABILITIES)[number];

/** A themeable plugin dependency: a `plugin:` ref plus a version range. */
export type ThemePluginDependency = {
  /**
   * Whole plugin (`plugin:{pluginId}`) or one themeable widget
   * (`plugin:{pluginId}/{widget}`), with the same slug shapes as
   * `pluginWidgetKey` / `parsePluginWidgetKey`
   * (`src/lib/plugin-manifest.ts:295-306`).
   */
  ref: string;
  /** Exact semver (`1.2.0`), caret (`^1.2.0`) or pair (`>=1.2.0 <2.0.0`). */
  version: string;
};

/** One content-addressed asset: a portable relative path plus its sha256. */
export type ThemeAssetEntry = {
  /** Portable relative path (`images/hero.webp`) — never absolute, never `..`. */
  path: string;
  /** Lowercase hex sha256 (64 chars) of the asset bytes. */
  sha256: string;
};

export type ThemeManifest = {
  /** Package slug, 1–60 chars (`THEME_KEY_RE`). Never renamed after publish. */
  key: string;
  /** Display names (both required — cf. packages.md `nameEn` / `nameBn`). */
  name: string;
  nameBn: string;
  /** Semver (`1.0.0`). Bump on every resubmission. */
  version: string;
  /**
   * Builder API range. Must cover the running builder (`^3.0.0` line) —
   * same caret / `>=a <b` semantics as plugins (`satisfiesApiRange`).
   */
  api: string;
  /** Marketplace display author. */
  author?: string;
  /** One-line summaries (EN + optional BN). */
  description?: string;
  descriptionBn?: string;
  /** Declared template keys shipped — a subset of `TEMPLATE_KEYS`. */
  templates: TemplateKey[];
  /** Core widgets the theme dresses — every entry must exist in the catalog. */
  supportedWidgets: SectionType[];
  /** Themeable (`plugin:`) plugin widgets this theme dresses. */
  pluginDependencies: ThemePluginDependency[];
  /** Surfaces the theme claims — closed `PRESENTATION_SURFACES`. */
  presentationSurfaces: PresentationSurface[];
  /** Storefront locales shipped — closed `THEME_LOCALES`. */
  locales: ThemeLocale[];
  /** Content-addressed asset list (images, fonts, skin sheets). */
  assetManifest: ThemeAssetEntry[];
  /** Closed `THEME_CAPABILITIES` (always includes `render_storefront`). */
  capabilities: ThemeCapability[];
};

export type ThemeVerdict =
  | { ok: true; manifest: ThemeManifest; warnings: string[] }
  | { ok: false; errors: string[] };

const TEMPLATE_SET = new Set<string>(TEMPLATE_KEYS as readonly string[]);
const WIDGET_SET = new Set<string>(WIDGET_TYPES as readonly string[]);
const SURFACE_SET = new Set<string>(PRESENTATION_SURFACES as readonly string[]);
const LOCALE_SET = new Set<string>(THEME_LOCALES as readonly string[]);
const CAPABILITY_SET = new Set<string>(THEME_CAPABILITIES as readonly string[]);

/** Whole-plugin ref (`plugin:{id}`), slug shape per `plugin-manifest.ts:292`. */
const PLUGIN_REF_RE = /^plugin:[a-z][a-z0-9-]{2,39}$/;
/** Single-widget ref (`plugin:{id}/{widget}`), per `:302-306`. */
const PLUGIN_WIDGET_REF_RE =
  /^plugin:[a-z][a-z0-9-]{2,39}\/[a-z][a-z0-9_-]{1,39}$/;

const CARET_RANGE_RE = /^\^(\d+\.\d+\.\d+)$/;
const PAIR_RANGE_RE = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/;

/**
 * Executable-content ban for every free-text field in the format. Mirrors
 * the sanitiser pins (`src/lib/builder-ast.ts:7396`: `javascript:` /
 * `vbscript:` / `data:text/html` + non-`https:` frames) and the bundle gate
 * (`src/lib/marketplace-scopes.ts:227-234`: dynamic-code patterns). Any
 * markup tag that can execute plus inline-handler attributes fail the gate.
 */
const EXECUTABLE_RE =
  /<\s*(script|iframe|object|embed|form)\b|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|\bimport\s*\(|\beval\s*\(|new\s+Function|on[a-z]+\s*=/i;

/**
 * Asset extensions that can execute or bootstrap execution. Denied at the
 * package boundary — assets are images, fonts and token-scoped skin
 * sheets, never code. (SVG is intentionally allowed: it renders through
 * the same sanitised media pipeline as catalog imagery.)
 */
const EXECUTABLE_ASSET_EXTS = new Set([
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "html",
  "htm",
  "php",
  "sh",
  "py",
  "rb",
  "pl",
  "exe",
  "dll",
  "so",
]);

const SHA256_RE = /^[0-9a-f]{64}$/;
const PATH_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const MAX_NAME_LEN = 80;
const MAX_DESCRIPTION_LEN = 500;
const MAX_AUTHOR_LEN = 120;
const MAX_PATH_LEN = 256;

export function isPresentationSurface(
  value: unknown,
): value is PresentationSurface {
  return (
    typeof value === "string" &&
    (SURFACE_SET as ReadonlySet<string>).has(value)
  );
}

export function isThemeLocale(value: unknown): value is ThemeLocale {
  return (
    typeof value === "string" && (LOCALE_SET as ReadonlySet<string>).has(value)
  );
}

export function isThemeCapability(value: unknown): value is ThemeCapability {
  return (
    typeof value === "string" &&
    (CAPABILITY_SET as ReadonlySet<string>).has(value)
  );
}

/** Exact semver, caret range or `>=a <b` pair — the shapes `satisfiesApiRange` reads. */
function isVersionRange(value: string): boolean {
  const v = value.trim();
  return (
    parseSemver(v) !== null ||
    CARET_RANGE_RE.test(v) ||
    PAIR_RANGE_RE.test(v)
  );
}

function assetPathIssue(path: string): "path" | "executable" | null {
  if (!path || path.length > MAX_PATH_LEN) return "path";
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0"))
    return "path";
  const segments = path.split("/");
  // No empty segments (rejects `//`, leading/trailing `/`) and no
  // self/parent traversal — the manifest can never escape its package root.
  if (
    segments.some((s) => s === "" || s === "." || s === "..") ||
    segments.some((s) => !PATH_SEGMENT_RE.test(s))
  ) {
    return "path";
  }
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (!path.includes(".") || EXECUTABLE_ASSET_EXTS.has(ext)) return "executable";
  return null;
}

/** The single gate the review pipeline, install flow and host all run. */
export function validateThemeManifest(input: unknown): ThemeVerdict {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, errors: ["manifest.invalid"] };
    }
    const errors: string[] = [];
    const warnings: string[] = [];
    const raw = input as Record<string, unknown>;

    // --- key (slug, 1–60; normalised exactly like plugin ids) ---
    const key = String(raw.key ?? "")
      .trim()
      .toLowerCase();
    if (!THEME_KEY_RE.test(key) || key.endsWith("-")) errors.push("key");

    // --- bilingual display names (both required) ---
    const nameRaw = raw.name;
    const name =
      typeof nameRaw === "string" ? nameRaw.trim() : "";
    if (!name) errors.push("name");
    else if (name.length > MAX_NAME_LEN) errors.push("name.too_long");
    else if (EXECUTABLE_RE.test(name)) errors.push("name.executable");

    const nameBnRaw = raw.nameBn;
    const nameBn =
      typeof nameBnRaw === "string" ? nameBnRaw.trim() : "";
    if (!nameBn) errors.push("nameBn");
    else if (nameBn.length > MAX_NAME_LEN) errors.push("nameBn.too_long");
    else if (EXECUTABLE_RE.test(nameBn)) errors.push("nameBn.executable");

    // --- version (strict semver) ---
    const version =
      typeof raw.version === "string" ? raw.version.trim() : "";
    if (!parseSemver(version)) errors.push("version");

    // --- api (builder range; must cover the running builder) ---
    const api = typeof raw.api === "string" ? raw.api.trim() : "";
    if (!api) errors.push("api");
    else if (!CARET_RANGE_RE.test(api) && !PAIR_RANGE_RE.test(api))
      errors.push("api_range_invalid");
    else if (!satisfiesApiRange(api)) errors.push("api_incompatible");

    // --- author (optional display string) ---
    let author: string | undefined;
    if (raw.author !== undefined) {
      if (typeof raw.author !== "string" || !raw.author.trim())
        errors.push("author");
      else if (raw.author.trim().length > MAX_AUTHOR_LEN)
        errors.push("author.too_long");
      else if (EXECUTABLE_RE.test(raw.author)) errors.push("author.executable");
      else author = raw.author.trim();
    }

    // --- descriptions (optional; BN gap warns like plugin i18n parity) ---
    let description: string | undefined;
    if (raw.description !== undefined) {
      if (typeof raw.description !== "string" || !raw.description.trim())
        errors.push("description");
      else if (raw.description.trim().length > MAX_DESCRIPTION_LEN)
        errors.push("description.too_long");
      else if (EXECUTABLE_RE.test(raw.description))
        errors.push("description.executable");
      else description = raw.description.trim();
    }
    let descriptionBn: string | undefined;
    if (raw.descriptionBn !== undefined) {
      if (typeof raw.descriptionBn !== "string" || !raw.descriptionBn.trim())
        errors.push("descriptionBn");
      else if (raw.descriptionBn.trim().length > MAX_DESCRIPTION_LEN)
        errors.push("descriptionBn.too_long");
      else if (EXECUTABLE_RE.test(raw.descriptionBn))
        errors.push("descriptionBn.executable");
      else descriptionBn = raw.descriptionBn.trim();
    }
    if (description && !descriptionBn)
      warnings.push("description.bn_missing");

    // --- templates (non-empty subset of TEMPLATE_KEYS) ---
    const templates: TemplateKey[] = [];
    if (!Array.isArray(raw.templates) || raw.templates.length === 0) {
      errors.push("templates");
    } else {
      const unknown: string[] = [];
      for (const t of raw.templates) {
        const k = String(t);
        if (!TEMPLATE_SET.has(k)) {
          if (!unknown.includes(k)) unknown.push(k);
          continue;
        }
        if ((templates as string[]).includes(k)) {
          errors.push(`templates.duplicate:${k}`);
          continue;
        }
        templates.push(k as TemplateKey);
      }
      if (unknown.length) errors.push(`templates:${unknown.join(",")}`);
    }

    // --- supportedWidgets (every entry must exist in the catalog) ---
    const supportedWidgets: SectionType[] = [];
    if (raw.supportedWidgets !== undefined) {
      if (!Array.isArray(raw.supportedWidgets)) {
        errors.push("supportedWidgets");
      } else {
        const unknown: string[] = [];
        for (const w of raw.supportedWidgets) {
          const k = String(w);
          if (!WIDGET_SET.has(k)) {
            if (!unknown.includes(k)) unknown.push(k);
            continue;
          }
          if ((supportedWidgets as string[]).includes(k)) {
            errors.push(`supportedWidgets.duplicate:${k}`);
            continue;
          }
          supportedWidgets.push(k as SectionType);
        }
        if (unknown.length)
          errors.push(`supportedWidgets:${unknown.join(",")}`);
      }
    }

    // --- pluginDependencies (`plugin:` refs + version ranges) ---
    const pluginDependencies: ThemePluginDependency[] = [];
    if (raw.pluginDependencies !== undefined) {
      if (!Array.isArray(raw.pluginDependencies)) {
        errors.push("pluginDependencies");
      } else {
        raw.pluginDependencies.forEach((d, i) => {
          const r = (d ?? {}) as Record<string, unknown>;
          const ref = typeof r.ref === "string" ? r.ref.trim() : "";
          const ver = typeof r.version === "string" ? r.version.trim() : "";
          let bad = false;
          if (
            !ref ||
            (!PLUGIN_REF_RE.test(ref) && !PLUGIN_WIDGET_REF_RE.test(ref))
          ) {
            errors.push(`dependencies[${i}].ref`);
            bad = true;
          }
          if (!ver || !isVersionRange(ver)) {
            errors.push(`dependencies[${i}].version`);
            bad = true;
          }
          if (!bad) {
            if (pluginDependencies.some((x) => x.ref === ref)) {
              errors.push(`dependencies.duplicate:${ref}`);
              return;
            }
            pluginDependencies.push({ ref, version: ver });
          }
        });
      }
    }

    // --- presentationSurfaces (non-empty closed vocabulary) ---
    const presentationSurfaces: PresentationSurface[] = [];
    if (
      !Array.isArray(raw.presentationSurfaces) ||
      raw.presentationSurfaces.length === 0
    ) {
      errors.push("presentationSurfaces");
    } else {
      const unknown: string[] = [];
      for (const s of raw.presentationSurfaces) {
        const v = String(s);
        if (!SURFACE_SET.has(v)) {
          if (!unknown.includes(v)) unknown.push(v);
          continue;
        }
        if ((presentationSurfaces as string[]).includes(v)) {
          errors.push(`presentationSurfaces.duplicate:${v}`);
          continue;
        }
        presentationSurfaces.push(v as PresentationSurface);
      }
      if (unknown.length)
        errors.push(`presentationSurfaces:${unknown.join(",")}`);
    }

    // --- locales (non-empty closed vocabulary incl. en/bn) ---
    const locales: ThemeLocale[] = [];
    if (!Array.isArray(raw.locales) || raw.locales.length === 0) {
      errors.push("locales");
    } else {
      const unknown: string[] = [];
      for (const l of raw.locales) {
        const v = String(l);
        if (!LOCALE_SET.has(v)) {
          if (!unknown.includes(v)) unknown.push(v);
          continue;
        }
        if ((locales as string[]).includes(v)) {
          errors.push(`locales.duplicate:${v}`);
          continue;
        }
        locales.push(v as ThemeLocale);
      }
      if (unknown.length) errors.push(`locales:${unknown.join(",")}`);
    }

    // --- assetManifest (paths + sha256, no executables, no dupes) ---
    const assetManifest: ThemeAssetEntry[] = [];
    if (raw.assetManifest !== undefined) {
      if (!Array.isArray(raw.assetManifest)) {
        errors.push("assetManifest");
      } else {
        raw.assetManifest.forEach((a, i) => {
          const r = (a ?? {}) as Record<string, unknown>;
          const path = typeof r.path === "string" ? r.path.trim() : "";
          const sha =
            typeof r.sha256 === "string"
              ? r.sha256.trim().toLowerCase()
              : "";
          const issue = assetPathIssue(path);
          if (issue === "executable")
            errors.push(`assetManifest[${i}].path.executable`);
          else if (issue) errors.push(`assetManifest[${i}].path`);
          if (!SHA256_RE.test(sha)) errors.push(`assetManifest[${i}].sha256`);
          if (!issue && SHA256_RE.test(sha)) {
            if (assetManifest.some((x) => x.path === path)) {
              errors.push(`assetManifest.duplicate:${path}`);
              return;
            }
            assetManifest.push({ path, sha256: sha });
          }
        });
      }
    }

    // --- capabilities (closed read-only allowlist; render_storefront required) ---
    let capabilities: ThemeCapability[] = [];
    if (raw.capabilities === undefined) {
      errors.push("capabilities");
    } else {
      const { scopes, unknown } = normalizeScopes(raw.capabilities);
      if (unknown.length) errors.push(`capabilities:${unknown.join(",")}`);
      const forbidden = scopes.filter((s) => !CAPABILITY_SET.has(s));
      if (forbidden.length)
        errors.push(`capabilities.forbidden:${forbidden.join(",")}`);
      capabilities = scopes.filter((s): s is ThemeCapability =>
        CAPABILITY_SET.has(s),
      );
      if (!capabilities.includes("render_storefront")) {
        errors.push("capabilities.render_storefront_required");
      }
    }

    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      warnings,
      manifest: {
        key,
        name,
        nameBn,
        version,
        api,
        ...(author ? { author } : {}),
        ...(description ? { description } : {}),
        ...(descriptionBn ? { descriptionBn } : {}),
        templates,
        supportedWidgets,
        pluginDependencies,
        presentationSurfaces,
        locales,
        assetManifest,
        capabilities,
      },
    };
  } catch {
    return { ok: false, errors: ["manifest.invalid"] };
  }
}

/**
 * Spec-name alias for the `docs/themes/packages.md` reference
 * (`validateThemePackage` in `src/lib/theme-package.ts`). Identical gate,
 * one implementation — the canonical name is `validateThemeManifest`.
 */
export const validateThemePackage = validateThemeManifest;
