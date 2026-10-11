/**
 * PKG-2 — package install pipeline (upload bytes → live package).
 *
 * Stages: validate archive (package-zip) → validate manifest (PKG-1
 * boundary, see below) → dependency/API check → store immutable artifact
 * (content-addressed sha256) → register version (theme_versions pattern) →
 * preview → activate/enable → uninstall.
 *
 * Reuse: `store_themes` + `theme_versions` + `theme_drafts` carry the
 * theme version line exactly like the catalog/upload lanes;
 * `marketplace_installs` is the install ledger; `theme_assets` holds the
 * per-version namespaced blobs (package-store.server); `theme_audit` is the
 * audit trail. Tenant isolation is merchant-scoped predicates throughout
 * plus `assertTenantId` at every entry.
 *
 * --- PKG-1 boundary (manifest validators) ---
 * The PKG-1 theme lane (`src/lib/theme-package.ts`, read-only import below)
 * has landed, and the plugin-manifest lane (`parseManifest`, adapted via
 * `pkg1PluginValidator` in `src/lib/plugin-package.ts`) has converged on the
 * same install-pipeline `validator` seam. Strict validation is now the
 * mandatory default: `resolveValidator` dispatches per kind to
 * `pkg1ThemeValidator` (themes) / `pkg1PluginValidator` (plugins) unless a
 * caller passes an explicit per-call `validator` or a process-wide override
 * was registered via `setPackageManifestValidator()` (tests use this seam).
 * `stubManifestValidator` is retained only as an explicit opt-in for tests
 * and as the non-theme fallback inside `pkg1ThemeValidator` — it is no
 * longer on the default path.
 *
 * --- CONFLICT lane (namespace + dependency-range gates) ---
 * Claim extraction + pairwise scan live in `src/lib/package-conflicts.ts`
 * (pure, read-only import): plugin installs run `assertNoNamespaceConflicts`
 * before any side effect and `setPluginPackageEnabled` re-scans on enable;
 * `assertDependencies` enforces carried version ranges (proven mismatch =
 * `package.dependency_conflict`). Theme installs/activations skip the
 * namespace scan by design (no globally-exclusive theme surface —
 * single-active invariant, themeKey-scoped presentations, per-version
 * asset namespaces).
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertTenantId } from "./tenant-scope";
import { checkApiCompatibility } from "./registry-version";
import { validateThemeManifest } from "./theme-package";
import { pkg1PluginValidator } from "./plugin-package";
import {
  collectBrokenAssetRefs,
  extractPackageFiles,
  manifestNameFor,
  parseZip,
  validatePackageLayout,
  type PackageFile,
  type PackageKind,
  type ZipLimits,
} from "./package-zip";
import {
  deleteVersionAssets,
  listVersionAssets,
  merchantAssetBytes,
  MERCHANT_ASSET_QUOTA_BYTES,
  pluginVersionPrefix,
  saveVersionAssets,
  themeVersionPrefix,
} from "./package-store.server";
import {
  coversWidening,
  diffCapabilities,
  themeSignals,
} from "./package-review";
import {
  checkDependencyRanges,
  extractFileClaims,
  extractPluginClaims,
  mergeClaims,
  scanNamespaceConflicts,
  type ConflictPackage,
} from "./package-conflicts";

export type { PackageKind };

type Client = SupabaseClient<Database>;
type Loose = SupabaseClient<never>;

export class PackageInstallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PackageInstallError";
  }
}

/**
 * Threat-defense storage quota: persisted usage plus the incoming inflated
 * file total must fit `MERCHANT_ASSET_QUOTA_BYTES`. Call only on paths that
 * persist (replays skip it — they write nothing).
 */
async function assertStorageQuota(
  db: Client,
  merchantId: string,
  files: PackageFile[],
): Promise<void> {
  let incoming = 0;
  for (const f of files) incoming += f.bytes.length;
  const used = await merchantAssetBytes(db, merchantId);
  if (used + incoming > MERCHANT_ASSET_QUOTA_BYTES) {
    throw new PackageInstallError(
      "package.over_quota",
      "Merchant asset storage quota exceeded.",
    );
  }
}

/* ------------------------------------------------- PKG-1 validator boundary */

export type PackageDependency = {
  slug: string;
  kind?: string;
  /**
   * CONFLICT lane: wanted version range (exact `1.2.0`, caret `^1.2.0` or
   * pair `>=1.2.0 <2.0.0`). Absent = presence suffices (legacy). Carried
   * from `pluginDependencies[].version` (themes) and `{ slug, version }`
   * objects (plugins); enforced in `assertDependencies`.
   */
  version?: string;
};

export type ValidatedPackageManifest = {
  slug: string;
  name: string;
  version: string;
  api?: string;
  dependencies: PackageDependency[];
  raw: Record<string, unknown>;
};

export type ManifestValidator = (
  manifest: unknown,
  kind: PackageKind,
) => { ok: true; manifest: ValidatedPackageManifest } | { ok: false; errors: string[] };

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

export function slugifyPackageName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "package";
}

/** Legacy shape gate — explicit opt-in only (tests); no longer the default. */
export function stubManifestValidator(
  manifest: unknown,
  _kind: PackageKind,
): ReturnType<ManifestValidator> {
  const raw = (manifest ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("name");
  else if (name.length > 80) errors.push("name_too_long");
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  if (!SEMVER_RE.test(version)) errors.push("version");
  const api = raw.api === undefined ? undefined : String(raw.api).trim();
  if (raw.api !== undefined && !api) errors.push("api");
  const dependencies: PackageDependency[] = [];
  if (raw.dependencies !== undefined) {
    if (!Array.isArray(raw.dependencies)) errors.push("dependencies");
    else {
      for (const dep of raw.dependencies) {
        const slug =
          typeof dep === "string"
            ? dep.trim()
            : typeof (dep as { slug?: unknown } | null)?.slug === "string"
              ? String((dep as { slug: unknown }).slug).trim()
              : "";
        if (!slug) {
          errors.push("dependencies.slug");
          break;
        }
        const version =
          typeof (dep as { version?: unknown } | null)?.version === "string"
            ? String((dep as { version: unknown }).version).trim()
            : "";
        dependencies.push(version ? { slug, version } : { slug });
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  const slug =
    typeof raw.slug === "string" && raw.slug.trim()
      ? slugifyPackageName(raw.slug)
      : slugifyPackageName(name);
  return {
    ok: true,
    manifest: { slug, name: name.slice(0, 80), version, api, dependencies, raw },
  };
}

let globalValidator: ManifestValidator | null = null;

/** PKG-1 startup seam: registers the real validators once that lane lands. */
export function setPackageManifestValidator(fn: ManifestValidator | null): void {
  globalValidator = fn;
}

/**
 * Read-only adapter over the landed PKG-1 theme gate
 * (`validateThemeManifest` in `src/lib/theme-package.ts`, never edited here).
 * Maps `key` → slug and `plugin:` refs (`plugin:{id}` / `plugin:{id}/{w}`) →
 * bare slugs the dependency checker resolves against the install ledger.
 * Plugin packages run the real plugin gate by default (see
 * `defaultStrictValidator`); the stub fallback below only applies when this
 * adapter itself is invoked directly with a non-theme kind.
 */
export function pkg1ThemeValidator(
  manifest: unknown,
  kind: PackageKind,
): ReturnType<ManifestValidator> {
  if (kind !== "theme") return stubManifestValidator(manifest, kind);
  const verdict = validateThemeManifest(manifest);
  if (!verdict.ok) return { ok: false, errors: verdict.errors };
  const m = verdict.manifest;
  const dependencies: PackageDependency[] = [];
  for (const dep of m.pluginDependencies) {
    const slug = dep.ref
      .replace(/^plugin:/, "")
      .split("/")[0]!
      .trim();
    // CONFLICT lane: carry the declared range — `assertDependencies`
    // enforces it against the ledger (proven mismatch fails closed).
    if (slug) dependencies.push({ slug, version: dep.version });
  }
  const raw = (manifest ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    manifest: {
      slug: m.key,
      name: m.name,
      version: m.version,
      api: m.api,
      dependencies,
      raw,
    },
  };
}

function resolveValidator(explicit?: ManifestValidator): ManifestValidator {
  return explicit ?? globalValidator ?? defaultStrictValidator;
}

/**
 * SWITCHOVER-1: strict-by-default dispatcher. Themes run the real PKG-1
 * theme gate, plugins run the real plugin gate (`parseManifest` adapter).
 * Kept as a named `ManifestValidator` so the explicit per-call `validator`
 * option and the `setPackageManifestValidator()` process-wide override keep
 * working as opt-out seams (tests rely on both).
 */
function defaultStrictValidator(
  manifest: unknown,
  kind: PackageKind,
): ReturnType<ManifestValidator> {
  if (kind === "plugin") {
    return (pkg1PluginValidator as ManifestValidator)(manifest, kind);
  }
  return pkg1ThemeValidator(manifest, kind);
}

/* ------------------------------------------------------------------ helpers */

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function artifactIdFor(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text;
  } catch {
    return null;
  }
}

function templatesOf(files: PackageFile[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of files) {
    if (!f.path.startsWith("templates/") || !f.path.endsWith(".json")) continue;
    const key = f.path.slice("templates/".length, -".json".length);
    try {
      out[key] = JSON.parse(new TextDecoder().decode(f.bytes));
    } catch {
      out[key] = null;
    }
  }
  return out;
}

type ThemeRow = {
  id: string;
  name: string;
  is_active: boolean;
  source_install_id: string | null;
  source_listing_slug: string | null;
  source_version: string | null;
  published_version_id: string | null;
};

type VersionRow = {
  id: string;
  version: number;
  status: string;
  templates: unknown;
  tokens: unknown;
  rollback_of?: string | null;
};

async function requireOwnedTheme(
  db: Client,
  merchantId: string,
  themeId: string,
): Promise<ThemeRow> {
  const { data } = await db
    .from("store_themes")
    .select("id, name, is_active, source_install_id, source_listing_slug, source_version, published_version_id")
    .eq("merchant_id", merchantId)
    .eq("id", themeId)
    .maybeSingle();
  const row = data as unknown as ThemeRow | null;
  if (!row) {
    throw new PackageInstallError("package.not_found", "Package not found for this merchant.");
  }
  return row;
}

async function requireOwnedVersion(
  db: Client,
  merchantId: string,
  versionId: string,
): Promise<VersionRow & { theme_id: string; merchant_id: string }> {
  const { data } = await db
    .from("theme_versions")
    .select("id, theme_id, version, status, templates, tokens, rollback_of")
    .eq("merchant_id", merchantId)
    .eq("id", versionId)
    .maybeSingle();
  const row = data as unknown as (VersionRow & { theme_id: string; merchant_id: string }) | null;
  if (!row) {
    throw new PackageInstallError("package.not_found", "Package version not found for this merchant.");
  }
  return row;
}

async function nextVersionNumber(db: Client, merchantId: string, themeId: string): Promise<number> {
  const { data } = await db
    .from("theme_versions")
    .select("version")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const top = data as unknown as { version: number } | null;
  return (top?.version ?? 0) + 1;
}

async function upsertDraft(
  db: Client,
  merchantId: string,
  themeId: string,
  templates: unknown,
  tokens: unknown,
): Promise<void> {
  const { data: existing } = await db
    .from("theme_drafts")
    .select("revision")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .maybeSingle();
  const found = existing as unknown as { revision: number } | null;
  if (found) {
    const { error } = await db
      .from("theme_drafts")
      .update({ templates: templates as never, tokens: tokens as never, revision: found.revision + 1 } as never)
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId);
    if (error) throw new PackageInstallError("package.install_failed", error.message);
    return;
  }
  const { error } = await db.from("theme_drafts").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    revision: 1,
    templates: templates as never,
    tokens: tokens as never,
  });
  if (error) throw new PackageInstallError("package.install_failed", error.message);
}

async function audit(
  db: Client,
  merchantId: string,
  themeId: string | null,
  actorId: string | null | undefined,
  action: string,
  after: Record<string, unknown>,
): Promise<void> {
  await (db as unknown as Loose).from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action,
    before: null,
    after,
  } as never);
}

/* --------------------------------------- artifact-column persistence (FOLLOW-UP) */

/**
 * Persisted artifact identity (see
 * supabase/migrations/20260928000002_marketplace_install_artifacts.sql):
 * the sha256 of the exact ZIP the pipeline installed, the manifest version
 * pinned inside it, and a provenance label (`upload` for direct ZIP uploads;
 * the marketplace lane overwrites with listing identity + `manifest` /
 * `version:<id>` labels). NULL on any column = legacy fallback (ledger-only
 * install or a pre-migration row) — readers treat NULL as "artifact unknown".
 */

/** True when the failure is "the artifact columns don't exist yet" — never for real errors. */
export function isMissingArtifactColumnError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : (
      (err as { message?: string } | null)?.message ?? String(err ?? "")
    );
  if (!/artifact_(checksum|version|pinned)/i.test(msg)) return false;
  return /column|schema cache|PGRST204|42703|does not exist/i.test(msg);
}

function withoutArtifactColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...row };
  delete out.artifact_checksum;
  delete out.artifact_version;
  delete out.artifact_pinned;
  return out;
}

/**
 * Optimistic ledger insert first, retry without artifact columns on a
 * missing-column failure — installs succeed on pre-migration DBs with NULL
 * (legacy) artifact identity, same degrade pattern as the recurring/term
 * columns in marketplace-install.server.ts. Non-column errors rethrow so
 * callers keep their compensation paths.
 */
async function insertInstallLedger(
  db: Client,
  row: Record<string, unknown>,
): Promise<{ id: string; degraded: boolean }> {
  try {
    const { data, error } = await db
      .from("marketplace_installs")
      .insert(row as never)
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("ledger insert failed");
    return { id: (data as unknown as { id: string }).id, degraded: false };
  } catch (err) {
    if (!isMissingArtifactColumnError(err)) throw err;
    const { data, error } = await db
      .from("marketplace_installs")
      .insert(withoutArtifactColumns(row) as never)
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("ledger insert failed");
    return { id: (data as unknown as { id: string }).id, degraded: true };
  }
}

type PluginInstallRow = {
  id: string;
  kind: string;
  listing_slug: string;
  listing_name?: string | null;
  version: string;
  status?: string;
  artifact_checksum?: string | null;
  artifact_version?: string | null;
  artifact_pinned?: string | null;
};

/**
 * Feature-detected install-row read: artifact columns when the migration has
 * landed, legacy shape without them otherwise. Never throws for a missing
 * column — a NULL artifact identity is the documented legacy fallback.
 */
async function readPluginInstallRow(
  db: Client,
  merchantId: string,
  installId: string,
): Promise<PluginInstallRow | null> {
  try {
    const { data, error } = await db
      .from("marketplace_installs")
      .select(
        "id, kind, listing_slug, listing_name, version, status, artifact_checksum, artifact_version, artifact_pinned",
      )
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as PluginInstallRow | null;
  } catch (err) {
    if (!isMissingArtifactColumnError(err)) throw err;
    const { data } = await db
      .from("marketplace_installs")
      .select("id, kind, listing_slug, listing_name, version, status")
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .maybeSingle();
    if (!data) return null;
    return {
      ...(data as unknown as PluginInstallRow),
      artifact_checksum: null,
      artifact_version: null,
      artifact_pinned: null,
    };
  }
}

/**
 * Segment-exact artifact8 match for a plugin asset name
 * (`plugins/<slug>/<artifact8>/assets/...`). The slug segment is never
 * inspected, so a manifest-slug namespace is attributable by checksum alone —
 * and a slug that happens to contain hex text can never false-positive.
 */
function pluginAssetArtifact8(name: string): string | null {
  const segs = name.split("/");
  if (segs.length < 4 || segs[0] !== "plugins" || segs[3] !== "assets")
    return null;
  const candidate = segs[2] ?? "";
  return /^[0-9a-f]{8}$/.test(candidate) ? candidate : null;
}

/* ------------------------------------------------------------------ install */

export type InstallPackageInput = {
  kind: PackageKind;
  fileName: string;
  /** Raw archive bytes (preferred) or base64. */
  bytes?: Uint8Array;
  fileBase64?: string;
  idempotencyKey: string;
  validator?: ManifestValidator;
  limits?: ZipLimits;
  /**
   * Threat-defense re-consent for updates that widen capabilities
   * (see `diffCapabilities`): every added item must appear here by exact
   * match, else the update fails with `package.consent_required`. Fresh
   * installs never need it — the install itself is the consent.
   */
  consentScopes?: string[];
};

export type InstallPackageResult = {
  packageId: string;
  versionId: string;
  version: string;
  versionNumber: number;
  artifactId: string;
  alreadyInstalled: boolean;
  updated: boolean;
};

function inputBytes(input: InstallPackageInput): Uint8Array {
  if (input.bytes) return input.bytes;
  if (input.fileBase64) {
    if (!input.fileBase64.trim())
      throw new PackageInstallError("package.empty", "That file is empty.");
    return Buffer.from(input.fileBase64, "base64");
  }
  throw new PackageInstallError("package.empty", "That file is empty.");
}

/**
 * Full pipeline for theme packages: validate → artifact → version →
 * preview-ready draft. Plugin packages share validation + ledger + asset
 * namespacing (see {@link installPluginPackage}); version history for
 * plugins is successive ledger rows, not theme_versions.
 */
export async function installPackage(
  db: Client,
  merchantId: string,
  input: InstallPackageInput,
  actorId?: string | null,
): Promise<InstallPackageResult> {
  assertTenantId(merchantId, "installPackage");
  if (input.kind !== "theme") {
    return installPluginPackage(db, merchantId, input, actorId);
  }
  if (!/\.zip$/iu.test((input.fileName ?? "").trim())) {
    throw new PackageInstallError("package.bad_name", "Packages must be a .zip file.");
  }
  if (!input.idempotencyKey) {
    throw new PackageInstallError("package.bad_key", "An idempotency key is required.");
  }
  const bytes = inputBytes(input);

  // 1. archive → 2. layout (manifest at root, area rules).
  const entries = parseZip(bytes, input.limits);
  const files = extractPackageFiles(bytes, entries, input.limits);
  const layout = validatePackageLayout(files, "theme", input.limits);

  // 3. manifest (PKG-1 seam) → 4. dependency/API → 5. presentation refs.
  const validator = resolveValidator(input.validator);
  const verdict = validator(layout.manifest, "theme");
  if (!verdict.ok) {
    const badVersion = verdict.errors.some((e) => e === "version");
    throw new PackageInstallError(
      badVersion ? "package.bad_version" : "package.manifest_invalid",
      `Package manifest rejected: ${verdict.errors.join(",")}`,
    );
  }
  const manifest = verdict.manifest;
  const api = checkApiCompatibility(manifest.api);
  if (!api.ok) {
    throw new PackageInstallError("package.api_incompatible", api.message);
  }
  await assertDependencies(db, merchantId, manifest.dependencies);
  const broken = collectBrokenAssetRefs(files);
  if (broken.length) {
    throw new PackageInstallError(
      "package.broken_ref",
      `Templates reference missing files: ${broken.slice(0, 5).join(",")}`,
    );
  }

  // 6. immutable artifact identity (content-addressed).
  const artifactId = artifactIdFor(bytes);

  // Idempotency: a committed key replays, never stacks.
  const { data: replayed } = await db
    .from("marketplace_installs")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replayed) {
    const hit = replayed as unknown as { id: string };
    const { data: linked } = await db
      .from("store_themes")
      .select("id, source_version, published_version_id")
      .eq("merchant_id", merchantId)
      .eq("source_install_id", hit.id)
      .maybeSingle();
    const theme = linked as unknown as { id: string; source_version: string } | null;
    if (!theme) {
      throw new PackageInstallError("package.install_conflict", "Install recorded but the package row is missing.");
    }
    const { data: vrow } = await db
      .from("theme_versions")
      .select("id, version")
      .eq("merchant_id", merchantId)
      .eq("theme_id", theme.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const v = vrow as unknown as { id: string; version: number } | null;
    return {
      packageId: theme.id,
      versionId: v?.id ?? "",
      version: theme.source_version,
      versionNumber: v?.version ?? 0,
      artifactId,
      alreadyInstalled: true,
      updated: false,
    };
  }

  // New version vs update: same manifest slug = same package line.
  // Storage quota (threat-defense): replays above write nothing and skip
  // this; fresh installs and updates persist `files`, so usage plus the
  // incoming inflated total must fit the merchant quota first.
  await assertStorageQuota(db, merchantId, files);
  // Storage quota (threat-defense): replays above write nothing and skip
  // this; fresh installs and updates persist `files`, so usage plus the
  // incoming inflated total must fit the merchant quota first.
  const { data: existingTheme } = await db
    .from("store_themes")
    .select("id, name, is_active, source_install_id, source_listing_slug, source_version, published_version_id")
    .eq("merchant_id", merchantId)
    .eq("source_listing_slug", manifest.slug)
    .maybeSingle();
  const prev = existingTheme as unknown as ThemeRow | null;
  if (prev?.source_version && compareSemver(manifest.version, prev.source_version) <= 0) {
    throw new PackageInstallError(
      "package.bad_version",
      `Version ${manifest.version} is not newer than installed ${prev.source_version}.`,
    );
  }

  const templates = templatesOf(files);
  // Update widening consent (threat-defense): a new version that adds
  // external hosts or custom HTML over the installed line needs explicit
  // re-consent covering every addition. Fresh installs (no prev) and
  // non-widening updates pass untouched.
  if (prev) {
    const { data: latest } = await db
      .from("theme_versions")
      .select("templates")
      .eq("merchant_id", merchantId)
      .eq("theme_id", prev.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const oldTemplates = (latest as { templates?: unknown } | null)?.templates;
    const diff = diffCapabilities(
      { permissions: [], ...themeSignals(oldTemplates) },
      { permissions: [], ...themeSignals(templates) },
    );
    if (diff.widened && !coversWidening(diff.added, input.consentScopes)) {
      throw new PackageInstallError(
        "package.consent_required",
        `Update adds capabilities requiring re-consent: ${diff.added.slice(0, 5).join(", ")}.`,
      );
    }
  }
  // Official tokens ride inertly in theme.json (exporter writes them);
  // carry a plain-object snapshot into the version row, else default {}.
  const rawTokens = (manifest.raw as Record<string, unknown>)?.tokens;
  const tokens =
    rawTokens !== null &&
    typeof rawTokens === "object" &&
    !Array.isArray(rawTokens)
      ? (rawTokens as Record<string, unknown>)
      : {};

  let themeId: string;
  if (prev) {
    themeId = prev.id;
    const { error } = await db
      .from("store_themes")
      .update({ name: manifest.name, source_version: manifest.version } as never)
      .eq("merchant_id", merchantId)
      .eq("id", themeId);
    if (error) throw new PackageInstallError("package.install_failed", error.message);
  } else {
    const { data, error } = await db
      .from("store_themes")
      .insert({
        merchant_id: merchantId,
        name: manifest.name,
        source_listing_slug: manifest.slug,
        source_version: manifest.version,
        is_active: false,
        installed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new PackageInstallError("package.install_failed", error instanceof Error ? error.message : "Install failed.");
    }
    themeId = (data as unknown as { id: string }).id;
  }

  const versionNumber = await nextVersionNumber(db, merchantId, themeId);
  const { data: version, error: versionError } = await db
    .from("theme_versions")
    .insert({
      merchant_id: merchantId,
      theme_id: themeId,
      version: versionNumber,
      status: "draft",
      label: `${manifest.slug}@${manifest.version}`,
      templates: templates as never,
      tokens: tokens as never,
      checksum: artifactId,
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (versionError || !version) {
    if (!prev) {
      await db.from("store_themes").delete().eq("merchant_id", merchantId).eq("id", themeId);
    }
    throw new PackageInstallError("package.install_failed", "Version registration failed.");
  }
  const versionId = (version as unknown as { id: string }).id;

  await upsertDraft(db, merchantId, themeId, templates, tokens);

  // Per-version asset namespace — same relPath in v1/v2 never collides.
  const prefix = themeVersionPrefix(versionId);
  const assetFiles = files
    .filter((f) => f.path !== manifestNameFor("theme"))
    .map((f) => ({
      relPath: f.path,
      bytes: f.bytes,
      text:
        f.path.startsWith("templates/") || f.path.startsWith("locales/") || f.path.endsWith(".css")
          ? decodeText(f.bytes)
          : null,
    }));
  const stored = await saveVersionAssets(db, merchantId, { themeId, prefix, files: assetFiles });

  let ledgerId: string;
  try {
    ({ id: ledgerId } = await insertInstallLedger(db, {
      merchant_id: merchantId,
      kind: "theme",
      theme_id: null,
      widget_id: null,
      listing_slug: manifest.slug,
      listing_name: manifest.name,
      version: manifest.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: input.idempotencyKey,
      // Direct-upload provenance: the exact bytes just hashed. The
      // marketplace lane overwrites these with listing identity + pin label;
      // pre-migration DBs keep NULL (legacy fallback).
      artifact_checksum: artifactId,
      artifact_version: manifest.version,
      artifact_pinned: "upload",
    }));
  } catch {
    throw new PackageInstallError("package.install_failed", "Ledger write failed.");
  }
  if (!prev) {
    await db
      .from("store_themes")
      .update({ source_install_id: ledgerId } as never)
      .eq("merchant_id", merchantId)
      .eq("id", themeId);
  }
  await audit(db, merchantId, themeId, actorId, prev ? "package.updated" : "package.installed", {
    slug: manifest.slug,
    version: manifest.version,
    version_id: versionId,
    artifact: artifactId.slice(0, 12),
    assets: stored.length,
  });
  return {
    packageId: themeId,
    versionId,
    version: manifest.version,
    versionNumber,
    artifactId,
    alreadyInstalled: false,
    updated: Boolean(prev),
  };
}

/**
 * CONFLICT lane — presence + version-range gate over the install ledger.
 * One query for every wanted slug (live rows only); `checkDependencyRanges`
 * decides. Absent = `package.missing_dependency` (message unchanged);
 * parseably out-of-range = `package.dependency_conflict` (fail closed).
 * Legacy rows without a version never mismatch (presence suffices).
 */
async function assertDependencies(
  db: Client,
  merchantId: string,
  deps: PackageDependency[],
): Promise<void> {
  if (!deps.length) return;
  const slugs = [...new Set(deps.map((d) => d.slug))];
  const { data } = await db
    .from("marketplace_installs")
    .select("listing_slug, version")
    .eq("merchant_id", merchantId)
    .in("listing_slug", slugs)
    .in("status", ["installed", "trial"]);
  const installed = ((data ?? []) as unknown as { listing_slug: string; version: string }[]).map(
    (r) => ({ slug: r.listing_slug, version: r.version }),
  );
  const verdict = checkDependencyRanges(deps, installed);
  if (verdict.ok) return;
  if (verdict.missing.length) {
    throw new PackageInstallError(
      "package.missing_dependency",
      `Missing dependency: ${verdict.missing[0]}`,
    );
  }
  const m = verdict.mismatched[0]!;
  throw new PackageInstallError(
    "package.dependency_conflict",
    `Dependency version conflict: ${m.slug} wants ${m.want} (installed ${m.got}) [dependency.version:${m.slug}]`,
  );
}

/* --------------------------------------- CONFLICT lane — namespace scan */

type ProjectedPluginRow = {
  plugin_id: string;
  manifest: unknown;
  enabled?: boolean | null;
  suspended?: boolean | null;
};

/** True when the failure is "plugin_state is not migrated yet" — scan skips, never blocks legacy DBs. */
function isMissingProjectionTableError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : ((err as { message?: string } | null)?.message ?? String(err ?? ""));
  if (!/plugin_state/i.test(msg)) return false;
  return /column|schema cache|PGRST204|42703|does not exist|relation.*not exist/i.test(msg);
}

function claimsOfProjected(row: ProjectedPluginRow, versionFallback: string): ConflictPackage | null {
  try {
    if (!row || typeof row.plugin_id !== "string" || !row.plugin_id) return null;
    const raw = (row.manifest ?? {}) as Record<string, unknown>;
    const version =
      typeof raw.version === "string" && raw.version.trim() ? raw.version.trim() : versionFallback;
    return { slug: row.plugin_id, kind: "plugin", version, claims: extractPluginClaims(raw) };
  } catch {
    return null;
  }
}

/**
 * Fail-closed namespace scan for plugin installs/enables. Candidate claims
 * (manifest + files) are checked against the merchant's projected plugin
 * manifests (`plugin_state`, the reviewed-manifest projection — invalid rows
 * degrade to empty claims, never throw). Paused/suspended holders are
 * inert and excluded here; the enable path re-scans on every flip, so two
 * swap/holder plugins can never both go live. Direct-pipeline installs
 * without a projected row contribute no claims (their install-path scan +
 * consent already covered them); a missing `plugin_state` table degrades to
 * no holders (legacy DBs install unimpeded). Anything else failing on the
 * read fails the install (`package.install_failed`) — the scan must prove
 * safety, never assume it.
 *
 * Theme installs/activations intentionally skip this scan: themes hold no
 * globally-exclusive surface (templates/routes overlap under the
 * single-active invariant; presentations are themeKey-scoped; assets are
 * per-version namespaced; dressing refs are not ownership).
 */
async function assertNoNamespaceConflicts(
  db: Client,
  merchantId: string,
  candidate: ConflictPackage,
): Promise<void> {
  let rows: ProjectedPluginRow[];
  try {
    const { data, error } = await (db as unknown as Loose)
      .from("plugin_state")
      .select("plugin_id, manifest, enabled, suspended")
      .eq("merchant_id", merchantId);
    if (error) throw error;
    rows = ((data ?? []) as unknown as ProjectedPluginRow[]).filter(
      (r) => r && typeof r.plugin_id === "string",
    );
  } catch (err) {
    if (isMissingProjectionTableError(err)) return;
    throw new PackageInstallError("package.install_failed", "Plugin projection read failed.");
  }
  const installed = rows
    .filter((r) => r.plugin_id !== candidate.slug && r.enabled !== false && r.suspended !== true)
    .map((r) => claimsOfProjected(r, ""))
    .filter((c): c is ConflictPackage => c !== null);
  const verdict = scanNamespaceConflicts(candidate, installed);
  if (!verdict.ok) {
    throw new PackageInstallError(
      "package.namespace_conflict",
      `Namespace conflict: ${verdict.conflicts.map((c) => c.code).join(",")} (held by ${[...new Set(verdict.conflicts.map((c) => c.holder))].join(",")})`,
    );
  }
}

/* ------------------------------------------------------- plugin install path */

export type InstallPluginResult = {
  installId: string;
  slug: string;
  version: string;
  artifactId: string;
  prefix: string;
  alreadyInstalled: boolean;
  enabled: boolean;
};

async function installPluginPackage(
  db: Client,
  merchantId: string,
  input: InstallPackageInput,
  actorId?: string | null,
): Promise<InstallPackageResult> {
  if (!/\.zip$/iu.test((input.fileName ?? "").trim())) {
    throw new PackageInstallError("package.bad_name", "Packages must be a .zip file.");
  }
  if (!input.idempotencyKey) {
    throw new PackageInstallError("package.bad_key", "An idempotency key is required.");
  }
  const bytes = inputBytes(input);
  const entries = parseZip(bytes, input.limits);
  const files = extractPackageFiles(bytes, entries, input.limits);
  const layout = validatePackageLayout(files, "plugin", input.limits);
  const validator = resolveValidator(input.validator);
  const verdict = validator(layout.manifest, "plugin");
  if (!verdict.ok) {
    const badVersion = verdict.errors.some((e) => e === "version");
    throw new PackageInstallError(
      badVersion ? "package.bad_version" : "package.manifest_invalid",
      `Package manifest rejected: ${verdict.errors.join(",")}`,
    );
  }
  const manifest = verdict.manifest;
  const api = checkApiCompatibility(manifest.api);
  if (!api.ok) throw new PackageInstallError("package.api_incompatible", api.message);
  await assertDependencies(db, merchantId, manifest.dependencies);
  // CONFLICT lane: candidate (manifest + file claims) vs live projected
  // holders. Runs before any side effect (assets/ledger below) — a
  // conflicting swap/hook claim fails here with zero partial state.
  await assertNoNamespaceConflicts(db, merchantId, {
    slug: manifest.slug,
    kind: "plugin",
    version: manifest.version,
    claims: mergeClaims(extractPluginClaims(manifest.raw), extractFileClaims(files)),
  });
  const broken = collectBrokenAssetRefs(files);
  if (broken.length) {
    throw new PackageInstallError(
      "package.broken_ref",
      `Templates reference missing files: ${broken.slice(0, 5).join(",")}`,
    );
  }
  const artifactId = artifactIdFor(bytes);

  const { data: replayed } = await db
    .from("marketplace_installs")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replayed) {
    const hit = replayed as unknown as { id: string };
    return {
      packageId: hit.id,
      versionId: hit.id,
      version: manifest.version,
      versionNumber: 1,
      artifactId,
      alreadyInstalled: true,
      updated: false,
    };
  }

  const prefix = pluginVersionPrefix(manifest.slug, artifactId.slice(0, 8));
  // Storage quota (threat-defense): same rule as the theme flow — replays
  // write nothing; fresh installs and updates must fit the quota first.
  await assertStorageQuota(db, merchantId, files);
  // Update widening consent (threat-defense): a new version that adds
  // manifest permissions over the installed plugin_state row needs explicit
  // re-consent. Fresh installs (no row) and non-widening updates pass.
  // (The host projection in upsertPlugin enforces the same rule at enable
  // time; this stops widened bytes from landing at all.)
  {
    const { data: installed } = await db
      .from("plugin_state")
      .select("manifest")
      .eq("merchant_id", merchantId)
      .eq("plugin_id", manifest.slug)
      .maybeSingle();
    const raw = (installed as { manifest?: unknown } | null)?.manifest as
      | { permissions?: unknown }
      | null
      | undefined;
    const oldPerms = Array.isArray(raw?.permissions)
      ? raw.permissions.filter((p): p is string => typeof p === "string")
      : null;
    if (oldPerms !== null) {
      const rawNew = manifest.raw as { permissions?: unknown };
      const newPerms = Array.isArray(rawNew.permissions)
        ? rawNew.permissions.filter((p): p is string => typeof p === "string")
        : [];
      const diff = diffCapabilities(
        { permissions: oldPerms, externalHosts: [], customHtml: false },
        { permissions: newPerms, externalHosts: [], customHtml: false },
      );
      if (diff.widened && !coversWidening(diff.added, input.consentScopes)) {
        throw new PackageInstallError(
          "package.consent_required",
          `Update adds capabilities requiring re-consent: ${diff.added.slice(0, 5).join(", ")}.`,
        );
      }
    }
  }
  // K3 atomicity: assets land BEFORE the ledger row, so a mid-install kill
  // must never strand a partial namespace. A failed asset save compensates
  // the prefix it just wrote (best-effort) before the original stage error
  // propagates — the failure-injection suite pins each stage to clean state.
  try {
    await saveVersionAssets(
      db,
      merchantId,
      {
        themeId: null,
        prefix,
        files: files
          .filter((f) => f.path !== manifestNameFor("plugin"))
          .map((f) => ({ relPath: f.path, bytes: f.bytes, text: decodeText(f.bytes) })),
      },
    );
  } catch (e) {
    await deleteVersionAssets(db, merchantId, prefix).catch(() => null);
    throw e;
  }
  let pluginLedgerId: string;
  try {
    ({ id: pluginLedgerId } = await insertInstallLedger(db, {
      merchant_id: merchantId,
      kind: "widget",
      theme_id: null,
      widget_id: null,
      listing_slug: manifest.slug,
      listing_name: manifest.name,
      version: manifest.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: input.idempotencyKey,
      // Direct-upload provenance (same contract as the theme path above).
      artifact_checksum: artifactId,
      artifact_version: manifest.version,
      artifact_pinned: "upload",
    }));
  } catch {
    await deleteVersionAssets(db, merchantId, prefix).catch(() => null);
    throw new PackageInstallError("package.install_failed", "Ledger write failed.");
  }
  // K3 atomicity: the audit write is part of the install transaction. A
  // thrown audit failure compensates ledger + assets so a surfaced error
  // never masks a live-but-unaudited install (callers retry on throw; a
  // standing row would double-install). Error-OBJECT audit failures stay
  // best-effort under the pre-existing audit() contract (it never throws).
  try {
    await audit(db, merchantId, null, actorId, "package.installed", {
      slug: manifest.slug,
      version: manifest.version,
      artifact: artifactId.slice(0, 12),
    });
  } catch (e) {
    try {
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", pluginLedgerId);
    } catch {
      /* compensation is best-effort; the audit error below is the signal */
    }
    await deleteVersionAssets(db, merchantId, prefix).catch(() => null);
    throw e;
  }
  return {
    packageId: pluginLedgerId,
    versionId: pluginLedgerId,
    version: manifest.version,
    versionNumber: 1,
    artifactId,
    alreadyInstalled: false,
    updated: false,
  };
}

/** Enable/disable a plugin package install (ledger status flip + audit). */
export async function setPluginPackageEnabled(
  db: Client,
  merchantId: string,
  installId: string,
  enabled: boolean,
  actorId?: string | null,
): Promise<{ ok: true; status: string }> {
  assertTenantId(merchantId, "setPluginPackageEnabled");
  const { data } = await db
    .from("marketplace_installs")
    .select("id, kind, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  const row = data as unknown as { id: string; kind: string; listing_slug: string } | null;
  if (!row || row.kind !== "widget") {
    throw new PackageInstallError("package.not_found", "Plugin install not found for this merchant.");
  }
  // CONFLICT lane (activate): enabling re-scans — the candidate's projected
  // manifest (when the marketplace lane projected one via upsertPlugin)
  // against every other live holder. Disables never conflict. Installs
  // without a projected row skip (install-path scan + consent covered them).
  if (enabled) {
    const projected = await (async (): Promise<ConflictPackage | null> => {
      try {
        const { data: prow, error } = await (db as unknown as Loose)
          .from("plugin_state")
          .select("plugin_id, manifest, enabled, suspended")
          .eq("merchant_id", merchantId)
          .eq("plugin_id", row.listing_slug)
          .maybeSingle();
        if (error) throw error;
        return claimsOfProjected((prow ?? null) as unknown as ProjectedPluginRow, "");
      } catch (err) {
        if (isMissingProjectionTableError(err)) return null;
        throw new PackageInstallError("package.install_failed", "Plugin projection read failed.");
      }
    })();
    if (projected) await assertNoNamespaceConflicts(db, merchantId, projected);
  }
  const status = enabled ? "installed" : "paused";
  const { error } = await db
    .from("marketplace_installs")
    .update({ status } as never)
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new PackageInstallError("package.install_failed", error.message);
  await audit(db, merchantId, null, actorId, enabled ? "package.enabled" : "package.disabled", {
    slug: row.listing_slug,
  });
  return { ok: true, status };
}

/* ------------------------------------------------- plugin rollback (K3) */

export type RollbackPluginResult = {
  /** New ledger row id — the restored live row (append-only, like themes). */
  packageId: string;
  /** Same as packageId: plugin history versions ARE ledger rows. */
  versionId: string;
  /** Manifest version restored from the target artifact. */
  version: string;
  /** Restored artifact checksum — equals the target's by construction. */
  artifactId: string | null;
  /** Explicit previous/rollback relationship (not just an enable flip). */
  rollbackOf: string;
  /** Sibling rows parked to `paused` so exactly one row stays live. */
  superseded: string[];
};

/**
 * K3 — plugin rollback-to-prior-artifact (theme `rollbackPackage` parity).
 *
 * Plugin history is successive ledger rows, so — like the theme lane minting
 * a new `theme_versions` row with `rollback_of` — a rollback mints a NEW
 * ledger row carrying the target's immutable artifact identity
 * (`artifact_checksum`/`artifact_version`; NULL stays NULL for legacy rows)
 * and records the explicit relationship in TWO places, never just an enable
 * flip: `previous_snapshot.rollback_of` on the new row plus a
 * `package.rolled_back` audit row (`{ from, to, rollback_of }`).
 *
 * Content equality holds structurally: plugin assets are immutable under
 * `plugins/<slug>/<artifact8>/…`, so the restored row addresses the exact
 * bytes the target installed — nothing is copied or mutated.
 *
 * Activation: every other live (`installed`/`trial`) row for the same slug
 * parks to `paused` (their prior statuses ride in
 * `previous_snapshot.rolled_from` for forensics), leaving the new row the
 * single live install. History stays append-only. The host projection
 * (`plugin_state` via `upsertPlugin`) is the caller's next step, mirroring
 * the theme lane's draft upsert.
 *
 * Atomicity matches the install path: a ledger failure restores parked
 * siblings before throwing; an audit throw compensates the new row +
 * restores siblings. Tenant-scoped throughout (`assertTenantId` + merchant
 * predicates); cross-merchant targets read as `package.not_found`.
 */
export async function rollbackPluginPackage(
  db: Client,
  merchantId: string,
  targetInstallId: string,
  actorId?: string | null,
  opts?: { idempotencyKey?: string },
): Promise<RollbackPluginResult> {
  assertTenantId(merchantId, "rollbackPluginPackage");
  const target = await readPluginInstallRow(db, merchantId, targetInstallId);
  if (!target || target.kind !== "widget") {
    throw new PackageInstallError(
      "package.not_found",
      "Plugin install not found for this merchant.",
    );
  }
  const slug = target.listing_slug;
  const checksum =
    typeof target.artifact_checksum === "string" &&
    /^[a-f0-9]{64}$/i.test(target.artifact_checksum)
      ? target.artifact_checksum.toLowerCase()
      : null;

  const { data: siblings } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("listing_slug", slug)
    .eq("kind", "widget");
  const live = ((siblings ?? []) as unknown as { id: string; status?: string }[]).filter(
    (r) => r.status === "installed" || r.status === "trial",
  );
  const parkedPrior = live.map((r) => ({ id: r.id, status: r.status ?? null }));

  if (live.length) {
    const { error } = await db
      .from("marketplace_installs")
      .update({ status: "paused" } as never)
      .eq("merchant_id", merchantId)
      .eq("listing_slug", slug)
      .eq("kind", "widget")
      .in("status", ["installed", "trial"]);
    if (error) throw new PackageInstallError("package.install_failed", error.message);
  }

  const restoreSiblings = async (): Promise<void> => {
    for (const s of parkedPrior) {
      try {
        await db
          .from("marketplace_installs")
          .update({ status: s.status ?? "installed" } as never)
          .eq("merchant_id", merchantId)
          .eq("id", s.id);
      } catch {
        /* best-effort; the rollback error below is the signal */
      }
    }
  };

  let newId: string;
  try {
    ({ id: newId } = await insertInstallLedger(db, {
      merchant_id: merchantId,
      kind: "widget",
      theme_id: null,
      widget_id: null,
      listing_slug: slug,
      listing_name: target.listing_name ?? slug,
      version: target.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key:
        opts?.idempotencyKey ?? `rollback:${targetInstallId}:${Date.now()}`,
      // Explicit previous/rollback relationship (the enable flip alone is
      // not the record): rollback_of + the parked live rows + the exact
      // artifact identity restored.
      previous_snapshot: {
        rollback_of: targetInstallId,
        rolled_from: parkedPrior,
        artifact_checksum: checksum,
        artifact_version: target.artifact_version ?? null,
        version: target.version,
      } as never,
      artifact_checksum: checksum,
      artifact_version: target.artifact_version ?? null,
      artifact_pinned: target.artifact_pinned ?? null,
    }));
  } catch (e) {
    await restoreSiblings();
    if (e instanceof PackageInstallError) throw e;
    throw new PackageInstallError("package.install_failed", "Ledger write failed.");
  }

  try {
    await audit(db, merchantId, null, actorId, "package.rolled_back", {
      slug,
      from: targetInstallId,
      to: newId,
      rollback_of: targetInstallId,
      artifact: checksum ? checksum.slice(0, 12) : null,
      superseded: parkedPrior.map((s) => s.id),
    });
  } catch (e) {
    try {
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", newId);
    } catch {
      /* best-effort; the audit error below is the signal */
    }
    await restoreSiblings();
    throw e;
  }
  return {
    packageId: newId,
    versionId: newId,
    version: target.version,
    artifactId: checksum,
    rollbackOf: targetInstallId,
    superseded: parkedPrior.map((s) => s.id),
  };
}

/* ------------------------------------------------------------------ preview */

export type PackagePreview = {
  packageId: string;
  versionId: string;
  version: string;
  templates: unknown;
  tokens: unknown;
  assets: { path: string; url: string | null; kind: string }[];
};

/**
 * Preview support: read an owned version's payload without touching the live
 * pointer (`published_version_id`) or any cache. Fails closed across tenants.
 */
export async function previewPackage(
  db: Client,
  merchantId: string,
  versionId: string,
): Promise<PackagePreview> {
  assertTenantId(merchantId, "previewPackage");
  const version = await requireOwnedVersion(db, merchantId, versionId);
  const theme = await requireOwnedTheme(db, merchantId, version.theme_id);
  const assets = await listVersionAssets(db, merchantId, themeVersionPrefix(versionId));
  return {
    packageId: theme.id,
    versionId,
    version: theme.source_version ?? "",
    templates: version.templates,
    tokens: version.tokens,
    assets: assets.map((a) => ({ path: a.relPath, url: a.url, kind: a.kind })),
  };
}

/* ------------------------------------------------------------------ activate */

export async function activatePackage(
  db: Client,
  merchantId: string,
  themeId: string,
  versionId: string | null,
  actorId?: string | null,
): Promise<{ packageId: string; versionId: string }> {
  assertTenantId(merchantId, "activatePackage");
  const theme = await requireOwnedTheme(db, merchantId, themeId);
  let target = versionId;
  if (!target) {
    if (!theme.published_version_id) {
      throw new PackageInstallError("package.not_found", "No published version to activate.");
    }
    target = theme.published_version_id;
  }
  const version = await requireOwnedVersion(db, merchantId, target);
  if (version.theme_id !== themeId) {
    throw new PackageInstallError("package.not_found", "Version does not belong to this package.");
  }
  const { error: clearError } = await db
    .from("store_themes")
    .update({ is_active: false } as never)
    .eq("merchant_id", merchantId)
    .neq("id", themeId);
  if (clearError) throw new PackageInstallError("package.install_failed", clearError.message);
  const { error } = await db
    .from("store_themes")
    .update({ is_active: true, published_version_id: target } as never)
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (error) throw new PackageInstallError("package.install_failed", error.message);
  const { error: statusError } = await db
    .from("theme_versions")
    .update({ status: "published", published_at: new Date().toISOString() } as never)
    .eq("merchant_id", merchantId)
    .eq("id", target);
  if (statusError) throw new PackageInstallError("package.install_failed", statusError.message);
  await audit(db, merchantId, themeId, actorId, "package.activated", { version_id: target });
  return { packageId: themeId, versionId: target };
}

/* ------------------------------------------------------------------ rollback */

export async function rollbackPackage(
  db: Client,
  merchantId: string,
  themeId: string,
  targetVersionId: string,
  actorId?: string | null,
): Promise<{ packageId: string; versionId: string; versionNumber: number }> {
  assertTenantId(merchantId, "rollbackPackage");
  const theme = await requireOwnedTheme(db, merchantId, themeId);
  const target = await requireOwnedVersion(db, merchantId, targetVersionId);
  if (target.theme_id !== themeId) {
    throw new PackageInstallError("package.not_found", "Version does not belong to this package.");
  }
  // History is append-only: the rollback is a NEW version carrying the
  // target's content (theme_versions.rollback_of), never a pointer rewind —
  // the same shape as themes.server.ts `rollbackVersion`.
  const versionNumber = await nextVersionNumber(db, merchantId, themeId);
  const { data, error } = await db
    .from("theme_versions")
    .insert({
      merchant_id: merchantId,
      theme_id: themeId,
      version: versionNumber,
      status: "published",
      published_at: new Date().toISOString(),
      rollback_of: targetVersionId,
      label: `rollback-to-${target.version}`,
      templates: target.templates as never,
      tokens: target.tokens as never,
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new PackageInstallError("package.install_failed", "Rollback version failed.");
  }
  const newId = (data as unknown as { id: string }).id;
  const { error: clearError } = await db
    .from("store_themes")
    .update({ is_active: false } as never)
    .eq("merchant_id", merchantId)
    .neq("id", themeId);
  if (clearError) throw new PackageInstallError("package.install_failed", clearError.message);
  const { error: pointError } = await db
    .from("store_themes")
    .update({ is_active: true, published_version_id: newId } as never)
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (pointError) throw new PackageInstallError("package.install_failed", pointError.message);
  await upsertDraft(db, merchantId, themeId, target.templates, target.tokens);
  void theme;
  await audit(db, merchantId, themeId, actorId, "package.rolled_back", {
    from: targetVersionId,
    to: newId,
  });
  return { packageId: themeId, versionId: newId, versionNumber };
}

/* ----------------------------------------------------------------- uninstall */

export async function uninstallPackage(
  db: Client,
  merchantId: string,
  themeId: string,
  actorId?: string | null,
): Promise<{ ok: true; removedAssets: number }> {
  assertTenantId(merchantId, "uninstallPackage");
  const theme = await requireOwnedTheme(db, merchantId, themeId);
  if (theme.is_active) {
    throw new PackageInstallError(
      "package.active",
      "Activate another package before uninstalling this one.",
    );
  }
  const { data: versions } = await db
    .from("theme_versions")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId);
  let removedAssets = 0;
  for (const v of ((versions ?? []) as unknown as { id: string }[])) {
    // Artifact removal is namespace-scoped: other packages' `themes/<other>/`
    // rows and other tenants' rows are never matched.
    removedAssets += (await deleteVersionAssets(db, merchantId, themeVersionPrefix(v.id))).removed;
  }
  await db.from("theme_drafts").delete().eq("merchant_id", merchantId).eq("theme_id", themeId);
  await db.from("theme_versions").delete().eq("merchant_id", merchantId).eq("theme_id", themeId);
  await db
    .from("marketplace_installs")
    .update({ status: "removed" } as never)
    .eq("merchant_id", merchantId)
    .eq("listing_slug", theme.source_listing_slug ?? "")
    .eq("kind", "theme");
  const { error } = await db
    .from("store_themes")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (error) throw new PackageInstallError("package.install_failed", error.message);
  await audit(db, merchantId, null, actorId, "package.uninstalled", {
    slug: theme.source_listing_slug,
    removed_assets: removedAssets,
  });
  return { ok: true, removedAssets };
}

/** Plugin uninstall: ledger row to terminal + its asset namespace wiped. */
export async function uninstallPluginPackage(
  db: Client,
  merchantId: string,
  installId: string,
  actorId?: string | null,
): Promise<{ ok: true; removedAssets: number }> {
  assertTenantId(merchantId, "uninstallPluginPackage");
  const row = await readPluginInstallRow(db, merchantId, installId);
  if (!row || row.kind !== "widget") {
    throw new PackageInstallError("package.not_found", "Plugin install not found for this merchant.");
  }
  if ((row as unknown as { status?: string }).status === "removed") {
    return { ok: true, removedAssets: 0 };
  }
  // Wipe every asset namespace minted for this install by this merchant.
  // Pipeline installs namespace by MANIFEST slug
  // (`plugins/<manifest-slug>/<artifact8>/…`, see installPluginPackage) while
  // the ledger carries the LISTING slug (marketplace-install.server.ts
  // patches listing identity after the pipeline write) — the two diverge
  // whenever a listing is published under a different slug than the plugin
  // id. Both are covered: the ledger-slug prefix (every artifact version ever
  // installed under this listing) plus the stored-checksum suffix (the exact
  // manifest-slug namespace, attributable without knowing the slug). Legacy
  // rows (NULL checksum) keep the ledger-slug wipe only — best effort, never
  // a sibling or cross-tenant match (merchant_id predicates every row).
  const checksum =
    typeof row.artifact_checksum === "string" &&
    /^[a-f0-9]{64}$/i.test(row.artifact_checksum)
      ? row.artifact_checksum.toLowerCase()
      : null;
  const artifact8 = checksum ? checksum.slice(0, 8) : null;
  const ledgerPrefix = `plugins/${row.listing_slug}/`;
  const { data: assets } = await (db as unknown as Loose)
    .from("theme_assets")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .limit(1000);
  const mine = ((assets ?? []) as unknown as { id: string; name: string }[]).filter(
    (a) =>
      a.name.startsWith(ledgerPrefix) ||
      (artifact8 !== null && pluginAssetArtifact8(a.name) === artifact8),
  );
  for (const a of mine) {
    await (db as unknown as Loose)
      .from("theme_assets")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", a.id);
  }
  const { error } = await db
    .from("marketplace_installs")
    .update({ status: "removed" } as never)
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new PackageInstallError("package.install_failed", error.message);
  await audit(db, merchantId, null, actorId, "package.uninstalled", {
    slug: row.listing_slug,
    removed_assets: mine.length,
  });
  return { ok: true, removedAssets: mine.length };
}
