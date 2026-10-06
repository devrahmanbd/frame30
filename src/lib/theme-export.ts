/**
 * PKG-3 — official theme export (source tree → installable ZIP).
 *
 * Pure module (no fs, no network, no database): the caller injects the
 * on-disk inputs (`cssText` from `src/lib/themes/<key>/skins.css`,
 * `assets` from `public/ph/<key>/*`) and gets back the package file list
 * plus a deterministic ZIP writer. Byte sources stay caller-owned so this
 * module runs anywhere the sibling lanes run (node, vitest, edge).
 *
 * Source → package layout:
 * - `theme.json` — PKG-1 manifest fields (key/name/version/api/templates/
 *   supportedWidgets/presentationSurfaces/locales/assetManifest/
 *   capabilities) PLUS the source truth the pipeline needs to stay honest:
 *   `tokens`, `variations` and `presentation` claims. Unknown keys are
 *   inert to `validateThemeManifest` (it reads known fields only).
 * - `templates/<template>.json` — `{ header, main, footer }` AST per
 *   authored template (`ThemeAst` shape), rendered by the theme's own
 *   preview-source builders with deterministic section ids.
 * - `styles/skins.css` — the theme skin sheet, byte-identical.
 * - `assets/<basename>` — every image/font the templates reference,
 *   renamed off the source prefix (see mapping below).
 * - `locales/en.json` / `locales/bn.json` — exhaustive string tables
 *   extracted from the rewritten sections (`*_bn` twins → `bn.json`).
 *
 * Asset URL mapping (documented, namespaced-exempt from byte equality):
 *   source    `/ph/<theme>/<file>`  (authored in theme builders)
 *   package   `assets/<file>`       (relative; what templates ship)
 *   installed `themes/<versionId>/assets/assets/<file>` row, served at
 *   `/pkg/<merchant>/…?v=<hash8>`   (per-version namespace, pipeline-owned)
 * Parity compares on the package form; the served form is asserted only
 * through the mapping (suffix + byte length + text round-trip), never
 * byte equality.
 *
 * Asset-list normal form: source builders author multi-image props as one
 * comma-separated string (`ugc_gallery.images`, `store_locator.images`).
 * The install lane resolves references per string value
 * (`collectBrokenAssetRefs`: a whole string either resolves or dangles),
 * so a comma-joined multi-ref would dangle as one unit. The exporter
 * therefore splits strings whose every comma part is an `assets/` ref
 * into JSON arrays of single refs — the lane's unit of reference.
 * Parity compares modulo this normal form (documented, pinned by test).
 *
 * Layout constraint (no `presentation/` directory): `validatePackageLayout`
 * (`src/lib/package-zip.ts`, read-only) only admits `templates/`,
 * `styles/`, `assets/` and `locales/`, so presentation claims ride inside
 * `theme.json` (`presentationSurfaces` + the `presentation` extra) instead
 * of a top-level area. A literal `presentation/` dir would be rejected
 * with `zip.disallowed_location`.
 *
 * Determinism: files sorted by path, JSON via `stableStringify` (sorted
 * keys), ZIP entries stored (method 0) with fixed timestamps — identical
 * input yields identical bytes.
 */

import { createHash } from "node:crypto";
import {
  TEMPLATE_KEYS,
  type PropValue,
  type Section,
  type SectionBuilder,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "./builder-ast";
import { WIDGET_TYPES } from "./widget-registry";
import {
  PRESENTATION_SURFACES,
  THEME_API_RANGE,
} from "./theme-package";
import { SONGOSKRITI_TOKENS } from "./themes/songoskriti/tokens";
import { SONGOSKRITI_VARIATIONS } from "./themes/songoskriti/variations";
import {
  BRAND_NAME as SONGOSKRITI_NAME,
  BRAND_NAME_BN as SONGOSKRITI_NAME_BN,
} from "./themes/songoskriti/footer";
import { SONGOSKRITI_WIDGET_DEFAULTS } from "./themes/songoskriti/skins";
import { songoskritiPreviewSource } from "./themes/songoskriti/preview";
import { SOMVABONA_TOKENS } from "./themes/somvabona/tokens";
import { SOMVABONA_VARIATIONS } from "./themes/somvabona/variations";
import {
  BRAND_NAME as SOMVABONA_NAME,
  BRAND_NAME_BN as SOMVABONA_NAME_BN,
} from "./themes/somvabona/chrome";
import { SOMVABONA_WIDGET_DEFAULTS } from "./themes/somvabona/skins";
import { somvabonaPreviewSource } from "./themes/somvabona/preview";
import type { ThemeVariation } from "./theme-variations";

export type OfficialThemeKey = "songoskriti" | "somvabona";

export class ThemeExportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThemeExportError";
  }
}

function fail(code: string, message: string): never {
  throw new ThemeExportError(code, message);
}

/* ------------------------------------------------------------ metadata */

type OfficialThemeMeta = {
  name: string;
  nameBn: string;
  description: string;
  descriptionBn: string;
  tokens: ThemeTokens;
  variations: ThemeVariation[];
  skinDefaults: Record<string, Record<string, PropValue>>;
};

const OFFICIAL_THEMES: Record<OfficialThemeKey, OfficialThemeMeta> = {
  songoskriti: {
    name: SONGOSKRITI_NAME,
    nameBn: SONGOSKRITI_NAME_BN,
    description: "Heritage handloom storefront theme.",
    descriptionBn: "ঐতিহ্যবাহী হাতে বোনা পোশাকের স্টোরফ্রন্ট থিম।",
    tokens: SONGOSKRITI_TOKENS,
    variations: SONGOSKRITI_VARIATIONS,
    skinDefaults: SONGOSKRITI_WIDGET_DEFAULTS as Record<
      string,
      Record<string, PropValue>
    >,
  },
  somvabona: {
    name: SOMVABONA_NAME,
    nameBn: SOMVABONA_NAME_BN,
    description: "Everyday ethnic storefront theme.",
    descriptionBn: "প্রতিদিনের দেশি পোশাকের স্টোরফ্রন্ট থিম।",
    tokens: SOMVABONA_TOKENS,
    variations: SOMVABONA_VARIATIONS,
    skinDefaults: SOMVABONA_WIDGET_DEFAULTS as Record<
      string,
      Record<string, PropValue>
    >,
  },
};

/** Source asset prefix authored in theme builders: `/ph/<theme>/`. */
export function sourceAssetPrefix(key: OfficialThemeKey): string {
  return `/ph/${key}/`;
}

export function officialThemeTokens(key: OfficialThemeKey): ThemeTokens {
  return OFFICIAL_THEMES[key].tokens;
}

export function officialThemeVariations(
  key: OfficialThemeKey,
): ThemeVariation[] {
  return OFFICIAL_THEMES[key].variations;
}

/* ------------------------------------------------------- section render */

/**
 * Deterministic builder: ids are `template.slot.counter.type`, so two
 * renders of the same template are identical and diffable. The loose
 * Somvabona builder is adapted with `as never`, mirroring the theme's own
 * preview source convention.
 */
function deterministicBuilder(
  template: TemplateKey,
  slot: "header" | "main" | "footer",
): SectionBuilder {
  let n = 0;
  const build = (
    type: SectionType,
    props: Record<string, PropValue> = {},
  ): Section => ({
    id: `${template}.${slot}.${n++}.${type}`,
    type,
    props: { ...props },
  });
  return build as SectionBuilder;
}

/**
 * Render one template straight from the theme source (the parity baseline).
 * Returns null for templates the theme does not author — the preview
 * engine synthesizes those, and the package ships authored templates only.
 */
export function buildOfficialSections(
  key: OfficialThemeKey,
  template: TemplateKey,
): ThemeAst | null {
  const source =
    key === "songoskriti"
      ? songoskritiPreviewSource()
      : somvabonaPreviewSource();
  const main = (
    source.main as (
      template: TemplateKey,
      s: SectionBuilder,
    ) => Section[] | null
  )(template, deterministicBuilder(template, "main") as never as SectionBuilder);
  if (!main) return null;
  const header = source.header(
    template,
    deterministicBuilder(template, "header"),
  );
  const footer = source.footer(
    template,
    deterministicBuilder(template, "footer"),
  );
  return { header, main, footer };
}

/** Authored templates in canonical `TEMPLATE_KEYS` order. */
export function authoredTemplates(key: OfficialThemeKey): TemplateKey[] {
  return (TEMPLATE_KEYS as readonly TemplateKey[]).filter(
    (t) => buildOfficialSections(key, t) !== null,
  );
}

/* ------------------------------------------------------------- URL rewrite */

const BN_SUFFIX = "_bn";

/** Rewrite every `/ph/<theme>/` occurrence to the package form `assets/`. */
export function rewriteThemeUrls<T>(value: T, key: OfficialThemeKey): T {
  const prefix = sourceAssetPrefix(key);
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return node.includes(prefix)
        ? node.split(prefix).join("assets/")
        : node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(value) as T;
}

/**
 * Asset-list normal form (see module header): split a string into an array
 * of single refs when it is a comma-joined list of `assets/` refs. Single
 * refs and non-asset strings pass through untouched.
 */
export function normalizeAssetLists<T>(value: T): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      if (!node.includes("assets/") || !node.includes(",")) return node;
      const parts = node
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length > 1 && parts.every((p) => p.startsWith("assets/"))) {
        return parts;
      }
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(value) as T;
}

/**
 * Every source asset basename referenced anywhere in the (unrewritten)
 * AST: `/ph/<theme>/<file>` occurrences, including comma-separated image
 * lists. Sorted, deduplicated.
 */
export function collectSourceAssetRefs(
  ast: ThemeAst,
  key: OfficialThemeKey,
): string[] {
  const prefix = sourceAssetPrefix(key);
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      let i = node.indexOf(prefix);
      while (i >= 0) {
        const rest = node.slice(i + prefix.length);
        const end = rest.search(/["\s,]/);
        const file = (end < 0 ? rest : rest.slice(0, end)).trim();
        if (file) found.add(file);
        i = node.indexOf(prefix, i + prefix.length);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const item of Object.values(node as Record<string, unknown>)) {
        visit(item);
      }
    }
  };
  visit(ast);
  return [...found].sort();
}

/** All section types used across the (rewritten) ASTs. Sorted. */
export function collectUsedWidgets(asts: ThemeAst[]): string[] {
  const used = new Set<string>();
  const visit = (sections: Section[]): void => {
    for (const s of sections) {
      used.add(s.type);
      if (s.children) visit(s.children);
    }
  };
  for (const ast of asts) {
    visit(ast.header);
    visit(ast.main);
    visit(ast.footer);
  }
  return [...used].sort();
}

/* ------------------------------------------------------------- locales */

/**
 * Exhaustive string tables from the rewritten sections: `*_bn` twins go
 * to `bn`, every other string leaf goes to `en`. Keys are stable section
 * paths (`template.sectionId.prop`, with array indices for prop rows and
 * children). Sorted on emit for determinism.
 */
export function extractLocaleMaps(asts: Partial<Record<TemplateKey, ThemeAst>>): {
  en: Record<string, string>;
  bn: Record<string, string>;
} {
  const en = new Map<string, string>();
  const bn = new Map<string, string>();
  const leaf = (path: string, prop: string, value: unknown): void => {
    if (typeof value !== "string") return;
    const target = prop.endsWith(BN_SUFFIX) ? bn : en;
    target.set(`${path}.${prop}`, value);
  };
  const rows = (
    path: string,
    prop: string,
    value: PropValue,
  ): void => {
    if (!Array.isArray(value)) {
      leaf(path, prop, value);
      return;
    }
    value.forEach((row, i) => {
      for (const [rk, rv] of Object.entries(row)) {
        leaf(`${path}.${prop}[${i}]`, rk, rv);
      }
    });
  };
  const sections = (path: string, list: Section[]): void => {
    list.forEach((s) => {
      const base = `${path}.${s.id}`;
      for (const [k, v] of Object.entries(s.props)) rows(base, k, v);
      if (s.bp) {
        for (const [bp, over] of Object.entries(s.bp)) {
          for (const [k, v] of Object.entries(over ?? {})) {
            rows(`${base}.bp.${bp}`, k, v as PropValue);
          }
        }
      }
      if (s.children) sections(`${base}.children`, s.children);
    });
  };
  for (const [template, ast] of Object.entries(asts)) {
    if (!ast) continue;
    sections(`${template}.header`, (ast as ThemeAst).header);
    sections(`${template}.main`, (ast as ThemeAst).main);
    sections(`${template}.footer`, (ast as ThemeAst).footer);
  }
  const sorted = (m: Map<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const k of [...m.keys()].sort()) out[k] = m.get(k)!;
    return out;
  };
  return { en: sorted(en), bn: sorted(bn) };
}

/* --------------------------------------------------------------- hashing */

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** JSON with recursively sorted keys — stable bytes for identical input. */
export function stableStringify(value: unknown): string {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(node as Record<string, unknown>).sort()) {
        out[k] = sort((node as Record<string, unknown>)[k]);
      }
      return out;
    }
    return node;
  };
  return JSON.stringify(sort(value));
}

/* ------------------------------------------------------------- packaging */

/** Mirrors the `assets/` allowlist in `src/lib/package-zip.ts` (read-only). */
const PACKAGE_ASSET_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

const SAFE_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type ThemeAssetInput = {
  /** Source basename (`hero-festive.png`) — becomes `assets/<file>`. */
  file: string;
  bytes: Uint8Array;
};

export type ExportOfficialThemeInput = {
  key: OfficialThemeKey;
  /** Manifest + template payload version. Defaults to `1.0.0`. */
  version?: string;
  /** Text of `src/lib/themes/<key>/skins.css`. */
  cssText: string;
  /** Raw bytes of `public/ph/<key>/*`, keyed by basename. */
  assets: ThemeAssetInput[];
};

export type ExportedPackageFile = {
  path: string;
  bytes: Uint8Array;
};

export type OfficialThemeExport = {
  key: OfficialThemeKey;
  version: string;
  /** Package files, sorted by path. */
  files: ExportedPackageFile[];
  /** The parsed `theme.json` payload (same object that was serialized). */
  manifest: Record<string, unknown>;
  /** Non-fatal notes (skipped assets, dropped widgets). Empty is ideal. */
  warnings: string[];
  /** Sorted basenames the templates reference (all shipped). */
  referencedAssets: string[];
};

export const TEMPLATE_FILE_FORMAT = "official-theme-template/1";

/**
 * Build the package file list from source. Fail-closed: a template
 * reference with no supplied bytes throws `theme-export.missing_asset`
 * (never ship a dangling `assets/` ref — the install lane would reject it
 * as `package.broken_ref`). Supplied files outside the package asset
 * allowlist are skipped with a warning (e.g. `SOURCES.txt`).
 */
export function exportOfficialTheme(
  input: ExportOfficialThemeInput,
): OfficialThemeExport {
  const { key } = input;
  const meta = OFFICIAL_THEMES[key];
  const version = (input.version ?? "1.0.0").trim();
  if (!version) fail("theme-export.bad_version", "A version is required.");
  const warnings: string[] = [];

  // 1. Render every authored template, rewrite to package URL form, then
  // apply the asset-list normal form (comma strings → ref arrays).
  const rewritten = new Map<TemplateKey, ThemeAst>();
  for (const template of authoredTemplates(key)) {
    const ast = buildOfficialSections(key, template);
    if (!ast) continue;
    rewritten.set(
      template,
      normalizeAssetLists(rewriteThemeUrls(ast, key)),
    );
  }
  if (rewritten.size === 0) {
    fail("theme-export.no_templates", `Theme ${key} authors no templates.`);
  }

  // 2. Resolve the referenced asset set against the supplied bytes.
  const referenced = new Set<string>();
  for (const ast of rewritten.values()) {
    // Refs are collected from the pre-rewrite shape (same set either way —
    // the rewrite only swaps the prefix), so re-render is unnecessary:
    // scan the rewritten AST for the package form instead.
    const visit = (node: unknown): void => {
      if (typeof node === "string") {
        const marker = "assets/";
        let i = node.indexOf(marker);
        while (i >= 0) {
          const rest = node.slice(i + marker.length);
          const end = rest.search(/["\s,]/);
          const file = (end < 0 ? rest : rest.slice(0, end)).trim();
          if (file && !file.includes("/")) referenced.add(file);
          i = node.indexOf(marker, i + marker.length);
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (node && typeof node === "object") {
        for (const item of Object.values(node as Record<string, unknown>)) {
          visit(item);
        }
      }
    };
    visit(ast);
  }
  const referencedAssets = [...referenced].sort();

  const supplied = new Map<string, Uint8Array>();
  for (const asset of input.assets) {
    if (!SAFE_BASENAME_RE.test(asset.file)) {
      fail(
        "theme-export.unsafe_asset",
        `Refusing unsafe asset name: ${asset.file.slice(0, 80)}`,
      );
    }
    if (supplied.has(asset.file)) {
      warnings.push(`asset.duplicate:${asset.file}`);
    }
    supplied.set(asset.file, asset.bytes);
  }
  const shipped = new Map<string, Uint8Array>();
  for (const [file, bytes] of supplied) {
    const dot = file.lastIndexOf(".");
    const ext = dot < 0 ? "" : file.slice(dot).toLowerCase();
    if (!PACKAGE_ASSET_EXTS.has(ext)) {
      warnings.push(`asset.skipped:${file}`);
      continue;
    }
    shipped.set(file, bytes);
  }
  const missing = referencedAssets.filter((f) => !shipped.has(f));
  if (missing.length > 0) {
    fail(
      "theme-export.missing_asset",
      `Templates reference ${missing.length} missing asset(s): ${missing.slice(0, 5).join(",")}`,
    );
  }

  // 3. Manifest: PKG-1 fields first, source truth as inert extras.
  const astList = [...rewritten.values()];
  const usedWidgets = collectUsedWidgets(astList);
  const catalog = new Set<string>(WIDGET_TYPES as readonly string[]);
  const supportedWidgets = usedWidgets.filter((w) => catalog.has(w));
  for (const w of usedWidgets) {
    if (!catalog.has(w)) warnings.push(`widgets.dropped:${w}`);
  }
  const cssBytes = new TextEncoder().encode(input.cssText);
  const assetManifest: { path: string; sha256: string }[] = [
    ...[...shipped.entries()].map(([file, bytes]) => ({
      path: `assets/${file}`,
      sha256: sha256Hex(bytes),
    })),
    { path: "styles/skins.css", sha256: sha256Hex(cssBytes) },
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const manifest: Record<string, unknown> = {
    key,
    name: meta.name,
    nameBn: meta.nameBn,
    version,
    api: THEME_API_RANGE,
    author: "Framique",
    description: meta.description,
    descriptionBn: meta.descriptionBn,
    templates: [...rewritten.keys()],
    supportedWidgets,
    pluginDependencies: [],
    presentationSurfaces: [...PRESENTATION_SURFACES],
    locales: ["en", "bn"],
    assetManifest,
    capabilities: [
      "read_menus",
      "read_products",
      "read_shop",
      "render_storefront",
    ],
    tokens: meta.tokens,
    variations: meta.variations,
    presentation: {
      surfaces: [...PRESENTATION_SURFACES],
      claims: [
        { surface: "announcement", widget: "announcement_bar" },
        { surface: "menu", widget: "mega_menu" },
        { surface: "header", widget: "mega_menu" },
        { surface: "footer", widget: "footer_sitemap" },
      ],
      skinDefaults: meta.skinDefaults,
    },
  };

  // 4. Files, sorted by path for determinism.
  const enc = new TextEncoder();
  const files: ExportedPackageFile[] = [
    {
      path: "theme.json",
      bytes: enc.encode(stableStringify(manifest)),
    },
  ];
  for (const [template, ast] of rewritten) {
    files.push({
      path: `templates/${template}.json`,
      bytes: enc.encode(
        stableStringify({
          format: TEMPLATE_FILE_FORMAT,
          theme: key,
          template,
          packageVersion: version,
          header: ast.header,
          main: ast.main,
          footer: ast.footer,
        }),
      ),
    });
  }
  files.push({ path: "styles/skins.css", bytes: cssBytes });
  for (const [file, bytes] of [...shipped.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    files.push({ path: `assets/${file}`, bytes });
  }
  const localeAsts = Object.fromEntries(rewritten) as Partial<
    Record<TemplateKey, ThemeAst>
  >;
  const locales = extractLocaleMaps(localeAsts);
  files.push({
    path: "locales/en.json",
    bytes: enc.encode(stableStringify(locales.en)),
  });
  files.push({
    path: "locales/bn.json",
    bytes: enc.encode(stableStringify(locales.bn)),
  });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { key, version, files, manifest, warnings, referencedAssets };
}

/* ------------------------------------------------------------- zip writer */

/**
 * Deterministic stored ZIP (method 0) readable by `parseZip`
 * (`src/lib/package-zip.ts`, read-only): fixed DOS timestamp (0), UTF-8
 * flag, real CRC32, entries in path order. No compression — PNG/JPG
 * sources are already compressed, so deflate buys ~nothing and stored
 * keeps every byte reproducible.
 */
export function buildExportZip(
  files: readonly ExportedPackageFile[],
): Uint8Array {
  const sorted = [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const enc = new TextEncoder();
  const names = sorted.map((f) => Array.from(enc.encode(f.path)));
  // Single preallocated buffer: a number[] assembly would hold every byte
  // as a heap double (~8x) and OOM the worker on the 25 MB official art.
  let total = 22; // EOCD
  for (let i = 0; i < sorted.length; i++) {
    const nameLen = names[i]!.length;
    const size = sorted[i]!.bytes.length;
    total += 30 + nameLen + size; // local header + payload
    total += 46 + nameLen; // central entry
  }
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const put16 = (off: number, v: number): void => view.setUint16(off, v, true);
  const put32 = (off: number, v: number): void => view.setUint32(off, v, true);
  let off = 0;
  const localOffsets: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const raw = sorted[i]!.bytes;
    const name = names[i]!;
    const crc = crc32(raw);
    const localOffset = off;
    buf[off++] = 0x50; buf[off++] = 0x4b; buf[off++] = 0x03; buf[off++] = 0x04;
    put16(off, 20); off += 2;
    put16(off, 0x0800); off += 2;
    put16(off, 0); off += 2; // method: stored
    put16(off, 0); off += 2; // time
    put16(off, 0); off += 2; // date
    put32(off, crc); off += 4;
    put32(off, raw.length); off += 4;
    put32(off, raw.length); off += 4;
    put16(off, name.length); off += 2;
    put16(off, 0); off += 2; // extra length
    buf.set(name, off); off += name.length;
    buf.set(raw, off); off += raw.length;
    localOffsets.push(localOffset);
  }
  const centralOffset = off;
  for (let i = 0; i < sorted.length; i++) {
    const raw = sorted[i]!.bytes;
    const name = names[i]!;
    const crc = crc32(raw);
    buf[off++] = 0x50; buf[off++] = 0x4b; buf[off++] = 0x01; buf[off++] = 0x02;
    put16(off, 20); off += 2;
    put16(off, 20); off += 2;
    put16(off, 0x0800); off += 2;
    put16(off, 0); off += 2;
    put16(off, 0); off += 2;
    put16(off, 0); off += 2;
    put32(off, crc); off += 4;
    put32(off, raw.length); off += 4;
    put32(off, raw.length); off += 4;
    put16(off, name.length); off += 2;
    put16(off, 0); off += 2;
    put16(off, 0); off += 2;
    put16(off, 0); off += 2;
    put16(off, 0); off += 2;
    put32(off, 0); off += 4; // external attrs
    put32(off, localOffsets[i]!); off += 4;
    buf.set(name, off); off += name.length;
  }
  const centralSize = off - centralOffset;
  buf[off++] = 0x50; buf[off++] = 0x4b; buf[off++] = 0x05; buf[off++] = 0x06;
  put16(off, 0); off += 2;
  put16(off, 0); off += 2;
  put16(off, sorted.length); off += 2;
  put16(off, sorted.length); off += 2;
  put32(off, centralSize); off += 4;
  put32(off, centralOffset); off += 4;
  put16(off, 0); off += 2;
  return buf;
}

function crc32(data: Uint8Array): number {
  const holder = crc32 as unknown as { table?: number[] };
  let table = holder.table;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    holder.table = table;
  }
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
