/**
 * B1 — internal official-artifact build (source themes → server-side rows).
 *
 * Pure module (no fs, no network, no database, no ZIP): the caller injects
 * the same on-disk inputs the exporter takes (`ExportOfficialThemeInput` —
 * `skins.css` text + `public/ph/<key>/*` bytes) and gets back a validated,
 * checksummed artifact whose payload maps 1:1 onto `theme_versions`-compatible
 * rows. The seed lane (`official-artifacts-seed.server.ts`) stores those rows;
 * nothing here ever writes a downloadable ZIP (`buildExportZip` is never
 * called) and no distributable artifact lands in the repo or `public/`.
 *
 * Pipeline (all fail-closed, existing gates reused read-only):
 * 1. `exportOfficialTheme` (theme-export.ts) renders source → package files.
 * 2. `validateThemeManifest` (theme-package.ts) accepts the manifest —
 *    the same gate the install pipeline runs, so a seeded row can never
 *    carry a manifest the pipeline would reject.
 * 3. `validatePackageLayout` + `collectBrokenAssetRefs` (package-zip.ts)
 *    accept the file list — same layout gate, minus the archive.
 * 4. Asset completeness is re-asserted here: every referenced basename is
 *    shipped, every `assetManifest` digest matches the shipped bytes, and no
 *    source-prefix (`/ph/`) string leaks into the stored payload.
 * 5. `checksum` = sha256 over the canonical payload (manifest + templates +
 *    tokens + styles + locales + per-asset digests). Same source → same
 *    checksum; the seed lane treats checksum as the idempotency key, so
 *    re-running the build/seed never stacks duplicate rows.
 *
 * Provenance: `toThemeVersionRow` stamps the official markers
 * (`source_registry_key` = theme key, `label` = `official:<key>@<version>`).
 * Merchant uploads carry NULL `source_listing_slug` / `source_registry_key`
 * (see `themes/appearance.server.ts`), so `provenanceOf` distinguishes
 * `official` / `catalog` / `upload` for catalogue display.
 */

import {
  exportOfficialTheme,
  sha256Hex,
  stableStringify,
  type ExportOfficialThemeInput,
  type OfficialThemeKey,
} from "./theme-export";
import { validateThemeManifest } from "./theme-package";
import {
  collectBrokenAssetRefs,
  validatePackageLayout,
  type PackageFile,
} from "./package-zip";

export type { ExportOfficialThemeInput, OfficialThemeKey };

export class OfficialArtifactError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OfficialArtifactError";
  }
}

function fail(code: string, message: string): never {
  throw new OfficialArtifactError(code, message);
}

/** Official theme keys, for provenance checks. Mirrors the exporter union. */
export const OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"] as const;

/** Version-row provenance for catalogue display. */
export type ArtifactProvenance = "official" | "catalog" | "upload";

/**
 * Provenance of a version/theme row: `official` when built from official
 * source (this lane), `upload` when no registry key is stamped (merchant
 * ZIP uploads leave it NULL), `catalog` for any other registry key.
 */
export function provenanceOf(row: {
  source_registry_key?: string | null;
}): ArtifactProvenance {
  const key = row?.source_registry_key ?? null;
  if (!key) return "upload";
  return (OFFICIAL_THEME_KEYS as readonly string[]).includes(key)
    ? "official"
    : "catalog";
}

/** True when the row was built from official source by this lane. */
export function isOfficialProvenance(row: {
  source_registry_key?: string | null;
}): boolean {
  return provenanceOf(row) === "official";
}

export type OfficialArtifactAsset = {
  /** Package path (`assets/<basename>`). */
  path: string;
  /** Lowercase hex sha256 of the asset bytes. */
  sha256: string;
  bytes: Uint8Array;
};

export type OfficialArtifact = {
  key: OfficialThemeKey;
  version: string;
  manifest: Record<string, unknown>;
  templates: Record<string, unknown>;
  tokens: Record<string, unknown>;
  /** Text of `styles/skins.css`. */
  styles: string;
  locales: Record<string, Record<string, string>>;
  assets: OfficialArtifactAsset[];
  /** Sorted basenames the templates reference (all shipped). */
  referencedAssets: string[];
  /** Non-fatal exporter notes, passed through. */
  warnings: string[];
  /** sha256 over the canonical payload — the idempotency key. */
  checksum: string;
};

function decodeJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail("official-artifact.invalid_json", `Unparseable package file: ${what}`);
  }
}

function decodeText(bytes: Uint8Array, what: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("official-artifact.invalid_text", `Undecodable package file: ${what}`);
  }
}

/** Canonical payload the checksum covers (bytes via per-file digests). */
function canonicalPayload(artifact: Omit<OfficialArtifact, "checksum">): string {
  return stableStringify({
    key: artifact.key,
    version: artifact.version,
    manifest: artifact.manifest,
    templates: artifact.templates,
    tokens: artifact.tokens,
    styles: artifact.styles,
    locales: artifact.locales,
    assets: artifact.assets.map((a) => ({ path: a.path, sha256: a.sha256 })),
  });
}

function checksumOf(artifact: Omit<OfficialArtifact, "checksum">): string {
  return sha256Hex(new TextEncoder().encode(canonicalPayload(artifact)));
}

/**
 * Build the validated official artifact from source inputs. Fail-closed:
 * anything the install pipeline would reject throws instead of producing
 * a row the pipeline could never have installed.
 */
export function buildOfficialArtifact(
  input: ExportOfficialThemeInput,
): OfficialArtifact {
  const exported = exportOfficialTheme(input);

  const verdict = validateThemeManifest(exported.manifest);
  if (!verdict.ok) {
    fail(
      "official-artifact.manifest_invalid",
      `Official manifest rejected: ${verdict.errors.join(",")}`,
    );
  }

  const files: PackageFile[] = exported.files.map((f) => ({
    path: f.path,
    bytes: f.bytes,
  }));
  try {
    validatePackageLayout(files, "theme");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail("official-artifact.layout_invalid", `Official layout rejected: ${message}`);
  }
  const broken = collectBrokenAssetRefs(files);
  if (broken.length > 0) {
    fail(
      "official-artifact.broken_ref",
      `Official templates reference missing files: ${broken.slice(0, 5).join(",")}`,
    );
  }

  const byPath = new Map(files.map((f) => [f.path, f.bytes]));
  const templates: Record<string, unknown> = {};
  for (const f of files) {
    if (f.path.startsWith("templates/") && f.path.endsWith(".json")) {
      const key = f.path.slice("templates/".length, -".json".length);
      templates[key] = decodeJson(f.bytes, f.path);
    }
  }
  if (Object.keys(templates).length === 0) {
    fail("official-artifact.no_templates", "Official package ships no templates.");
  }
  const stylesFile = byPath.get("styles/skins.css");
  if (!stylesFile) {
    fail("official-artifact.no_styles", "Official package ships no styles/skins.css.");
  }
  const styles = decodeText(stylesFile as Uint8Array, "styles/skins.css");
  const locales: Record<string, Record<string, string>> = {};
  for (const name of ["en", "bn"]) {
    const raw = byPath.get(`locales/${name}.json`);
    if (!raw) {
      fail("official-artifact.no_locales", `Official package ships no locales/${name}.json.`);
    }
    const parsed = decodeJson(raw as Uint8Array, `locales/${name}.json`);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("official-artifact.no_locales", `Official locales/${name}.json is not an object.`);
    }
    locales[name] = parsed as Record<string, string>;
  }

  // Asset completeness: every referenced basename shipped, every manifest
  // digest exact, no source-prefix leftovers in the stored payload.
  const assets: OfficialArtifactAsset[] = [];
  for (const f of files) {
    if (!f.path.startsWith("assets/")) continue;
    assets.push({ path: f.path, sha256: sha256Hex(f.bytes), bytes: f.bytes });
  }
  assets.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const shipped = new Set(assets.map((a) => a.path.slice("assets/".length)));
  const unshipped = exported.referencedAssets.filter((r) => !shipped.has(r));
  if (unshipped.length > 0) {
    fail(
      "official-artifact.incomplete",
      `Official package misses referenced assets: ${unshipped.slice(0, 5).join(",")}`,
    );
  }
  const manifestAssets = (
    (exported.manifest.assetManifest ?? []) as { path: string; sha256: string }[]
  ).filter((e) => e.path.startsWith("assets/"));
  const digestByPath = new Map(assets.map((a) => [a.path, a.sha256]));
  for (const entry of manifestAssets) {
    const actual = digestByPath.get(entry.path);
    if (!actual || actual !== entry.sha256.toLowerCase()) {
      fail(
        "official-artifact.digest_mismatch",
        `Official asset digest mismatch: ${entry.path}`,
      );
    }
  }
  const serialized = stableStringify({ templates, locales }) + styles;
  // Source-form bundles (runtime serving) legitimately carry /ph/ URLs;
  // only package-form payloads must be prefix-free.
  if (input.urlForm !== "source" && serialized.includes("/ph/")) {
    fail(
      "official-artifact.source_leak",
      "Official payload still references the private source prefix.",
    );
  }

  const tokensRaw = (exported.manifest as Record<string, unknown>).tokens;
  const tokens =
    tokensRaw && typeof tokensRaw === "object" && !Array.isArray(tokensRaw)
      ? (tokensRaw as Record<string, unknown>)
      : {};

  const partial: Omit<OfficialArtifact, "checksum"> = {
    key: exported.key,
    version: exported.version,
    manifest: exported.manifest as Record<string, unknown>,
    templates,
    tokens,
    styles,
    locales,
    assets,
    referencedAssets: exported.referencedAssets,
    warnings: exported.warnings,
  };
  return { ...partial, checksum: checksumOf(partial) };
}

/**
 * Recompute the checksum from artifact parts. Rebuild determinism
 * (`build → build → identical checksum`) is the idempotency proof the seed
 * lane relies on; this helper lets callers re-verify without rebuilding.
 */
export function verifyOfficialArtifactChecksum(artifact: OfficialArtifact): boolean {
  const { checksum, ...parts } = artifact;
  void checksum;
  return checksumOf(parts) === artifact.checksum;
}

export type ThemeVersionRowFields = {
  templates: Record<string, unknown>;
  tokens: Record<string, unknown>;
  checksum: string;
  label: string;
  source_registry_key: string;
  source_registry_version: string;
  status: "published";
};

/**
 * `theme_versions`-compatible row fields for a built artifact, official
 * provenance stamped (`source_registry_key` + `official:` label). The seed
 * lane adds the key columns (`merchant_id`, `theme_id`, `version`); the
 * install lanes keep reading `templates` / `tokens` / `checksum` exactly as
 * they do for pipeline-installed rows.
 */
export function toThemeVersionRow(artifact: OfficialArtifact): ThemeVersionRowFields {
  return {
    templates: artifact.templates,
    tokens: artifact.tokens,
    checksum: artifact.checksum,
    label: `official:${artifact.key}@${artifact.version}`,
    source_registry_key: artifact.key,
    source_registry_version: artifact.version,
    status: "published",
  };
}
