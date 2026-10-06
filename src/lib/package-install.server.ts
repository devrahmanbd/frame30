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
 * has landed; the plugin-manifest lane (`parseManifest`) predates it. Until
 * both lanes agree on one package-manifest shape, manifests are checked by
 * `stubManifestValidator` (shape + semver + api-string + dependency list
 * only). The seam is explicit:
 *   1. per-call `validator` option (tests + callers use this), else
 *   2. a process-wide override via `setPackageManifestValidator()` — call
 *      it with `pkg1ThemeValidator` at startup to enforce the real PKG-1
 *      theme gate, else
 *   3. the stub below.
 * TODO(PKG-1): flip the default to `pkg1ThemeValidator` (themes) once the
 * plugin-manifest shape converges, then delete `stubManifestValidator`.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertTenantId } from "./tenant-scope";
import { checkApiCompatibility } from "./registry-version";
import { validateThemeManifest } from "./theme-package";
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
  pluginVersionPrefix,
  saveVersionAssets,
  themeVersionPrefix,
} from "./package-store.server";

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

/* ------------------------------------------------- PKG-1 validator boundary */

export type PackageDependency = { slug: string; kind?: string };

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

/** Minimal shape gate until the PKG-1 validators land (see header TODO). */
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
        dependencies.push({ slug });
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
 * Plugin packages stay on the stub until the manifest shapes converge.
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
    if (slug) dependencies.push({ slug });
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
  return explicit ?? globalValidator ?? stubManifestValidator;
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

  const { data: ledger, error: ledgerError } = await db
    .from("marketplace_installs")
    .insert({
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
    })
    .select("id")
    .single();
  if (ledgerError || !ledger) {
    throw new PackageInstallError("package.install_failed", "Ledger write failed.");
  }
  if (!prev) {
    await db
      .from("store_themes")
      .update({ source_install_id: (ledger as unknown as { id: string }).id } as never)
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

async function assertDependencies(
  db: Client,
  merchantId: string,
  deps: PackageDependency[],
): Promise<void> {
  for (const dep of deps) {
    const { data } = await db
      .from("marketplace_installs")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("listing_slug", dep.slug)
      .in("status", ["installed", "trial"])
      .limit(1)
      .maybeSingle();
    if (!data) {
      throw new PackageInstallError(
        "package.missing_dependency",
        `Missing dependency: ${dep.slug}`,
      );
    }
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
  const { data: ledger, error } = await db
    .from("marketplace_installs")
    .insert({
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
    })
    .select("id")
    .single();
  if (error || !ledger) {
    await deleteVersionAssets(db, merchantId, prefix).catch(() => null);
    throw new PackageInstallError("package.install_failed", "Ledger write failed.");
  }
  await audit(db, merchantId, null, actorId, "package.installed", {
    slug: manifest.slug,
    version: manifest.version,
    artifact: artifactId.slice(0, 12),
  });
  return {
    packageId: (ledger as unknown as { id: string }).id,
    versionId: (ledger as unknown as { id: string }).id,
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
  const { data } = await db
    .from("marketplace_installs")
    .select("id, kind, listing_slug, version")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  const row = data as unknown as { id: string; kind: string; listing_slug: string; version: string } | null;
  if (!row || row.kind !== "widget") {
    throw new PackageInstallError("package.not_found", "Plugin install not found for this merchant.");
  }
  if ((row as unknown as { status?: string }).status === "removed") {
    return { ok: true, removedAssets: 0 };
  }
  // Wipe every asset namespace minted for this slug by this merchant. The
  // prefix is slug-scoped, so sibling plugins (`plugins/<other>/…`) and
  // other tenants are never matched.
  const { data: assets } = await (db as unknown as Loose)
    .from("theme_assets")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .limit(1000);
  const mine = ((assets ?? []) as unknown as { id: string; name: string }[]).filter((a) =>
    a.name.startsWith(`plugins/${row.listing_slug}/`),
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
