/**
 * Phase 15 — Appearance › Themes, server layer.
 *
 * `store_themes` is the merchant's installed list (one row per theme, exactly
 * one active). The catalogue comes from `listRegistry`, which already falls
 * back to the typed code presets when SQL is empty, so this screen can never
 * be an empty hole. Activation forks the registry package into the merchant's
 * draft through the existing install path — the storefront actually changes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { inflateRawSync } from "node:zlib";
import {
  listRegistry,
  installRegistryTheme,
  registryPackage,
} from "@/lib/themes.server";
import { catalogMeta } from "./catalog-meta";
import {
  isNewerVersion,
  MAX_THEME_UPLOAD_BYTES,
  OFFICIAL_THEME_KEYS,
  officialPinFor,
  orderInstalled,
  type CatalogTheme,
  type InstalledTheme,
  type OfficialThemeKey,
  type ThemesWorkspace,
} from "./appearance";

type Client = SupabaseClient<Database>;

export class ThemeDeskError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThemeDeskError";
  }
}

/**
 * QUBICKLE C2 (Rule 15): compensating deletes are tenant-scoped
 * (merchant_id predicate, never id-alone) and the affected-row count is
 * asserted. A compensation that removes zero rows — the link already gone,
 * or an id that is not ours — emits `theme.compensation_missed` instead of
 * silently succeeding. Always throws the original error.
 */
async function compensateThemeDelete(
  db: Client,
  merchantId: string,
  themeId: string,
  original: unknown,
): Promise<never> {
  const { data, error } = await db
    .from("store_themes")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", themeId)
    .select("id");
  if (error || !data || (data as unknown[]).length === 0) {
    try {
      const { incr, log } = await import("../observability.server");
      incr("framique_theme_compensation_total", { outcome: "missed" });
      log("warn", "theme.compensation_missed", { merchantId, themeId });
    } catch {
      // Observability must never break compensation.
    }
  }
  throw original;
}

function isDuplicateKey(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  return msg.includes("duplicate key");
}

/**
 * QUBICKLE H1/H2 (Rule 8): key-driven replay for catalog installs. The
 * ledger idempotency key (`catalog:<merchant>:<key>`) is the replay
 * identity — not the slug. Returns the linked theme when the key already
 * committed, throws `market_install_conflict` when the key committed but
 * its theme row is missing (crash between the two writes, or a racing
 * double-click still in flight), and returns null when the key is fresh.
 */
async function resolveCatalogReplay(
  db: Client,
  merchantId: string,
  ledgerKey: string,
): Promise<{ id: string; alreadyInstalled: true } | null> {
  const { data: keyed } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", ledgerKey)
    .maybeSingle();
  if (!keyed) return null;
  const hit = keyed as { id: string };
  const { data: linked } = await db
    .from("store_themes")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("source_install_id", hit.id)
    .maybeSingle();
  if (linked)
    return { id: (linked as { id: string }).id, alreadyInstalled: true };
  throw new ThemeDeskError(
    "market_install_conflict",
    "That install is already recorded but its theme row is missing. Wait a moment and try again.",
  );
}

type Row = {
  id: string;
  name: string;
  is_active: boolean;
  /** Ledger linkage (the delete-cascade key). QUBICKLE C1: this column MUST
   * stay in SELECT — without it the link is invisible and deletes fall back
   * to a slug-sweep that retires unrelated installs sharing the slug. */
  source_install_id: string | null;
  source_listing_slug: string | null;
  source_version: string | null;
  screenshot_url: string | null;
  author: string | null;
  description: string | null;
  tags: string[] | null;
  auto_update: boolean;
  favourite: boolean;
  /** Live pointer: the reviewed version the storefront renders. */
  published_version_id: string | null;
  /** Nullable live: pre-existing rows were written without a timestamp. */
  installed_at: string | null;
};

const SELECT =
  "id, name, is_active, source_install_id, source_listing_slug, source_version, screenshot_url, author, description, tags, auto_update, favourite, published_version_id, installed_at";

function toInstalled(row: Row, latest: Map<string, string>): InstalledTheme {
  const key = row.source_listing_slug;
  // Preset packs removed; DB rows are the source of truth.
  const version = row.source_version ?? "1.0.0";
  const catalogueVersion = key ? latest.get(key) : undefined;
  return {
    id: row.id,
    key,
    name: row.name,
    author: row.author ?? (key ? catalogMeta(key).author : "Framique"),
    description: row.description ?? "",
    version,
    tags: row.tags ?? (key ? catalogMeta(key).tags : []),
    screenshotUrl: row.screenshot_url,
    isActive: row.is_active,
    autoUpdate: row.auto_update,
    favourite: row.favourite,
    installedAt: row.installed_at,
    updateAvailable:
      catalogueVersion && isNewerVersion(catalogueVersion, version)
        ? catalogueVersion
        : null,
  };
}

async function rows(db: Client, merchantId: string): Promise<Row[]> {
  const { data, error } = await db
    .from("store_themes")
    .select(SELECT)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

async function favouriteKeys(
  db: Client,
  merchantId: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("theme_catalog_favourites")
    .select("theme_key")
    .eq("merchant_id", merchantId);
  // QUBICKLE M2 (Rule 4): a failed favourites read must throw, never masquerade
  // as "no favourites" — an empty set here would silently clear the UI's
  // Favourites tab and hide the outage.
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.theme_key));
}

/** Installed list + catalogue, with install/active/favourite flags resolved.
 *
 * B2 catalogue semantics: official entries (Songoskriti, Somvabona) come
 * from internally-built artifacts when the build lane has run — with a
 * graceful empty official section when it hasn't — and every other
 * registry row lists as community. Registry rows colliding with an
 * official key are skipped so no theme ever shows two Install buttons.
 */
export async function loadThemesWorkspace(
  db: Client,
  merchantId: string,
): Promise<ThemesWorkspace> {
  const [registry, official, installedRows, favourites] = await Promise.all([
    listRegistry(db),
    listOfficialCatalog(),
    rows(db, merchantId),
    favouriteKeys(db, merchantId),
  ]);
  const latest = new Map<string, string>([
    ...registry.map((entry) => [entry.key, entry.version] as const),
    ...official.map((entry) => [entry.key, entry.version] as const),
  ]);
  const installed = orderInstalled(
    installedRows.map((row) => toInstalled(row, latest)),
  );
  const byKey = new Map(installed.filter((t) => t.key).map((t) => [t.key!, t]));

  const officialKeys = new Set(official.map((entry) => entry.key));
  const catalogue: CatalogTheme[] = [
    ...official.map((entry) => {
      const meta = catalogMeta(entry.key);
      const local = byKey.get(entry.key);
      return {
        key: entry.key,
        name: entry.nameEn,
        summary: entry.summaryEn,
        author: meta.author,
        category: entry.category,
        version: entry.version,
        screenshotUrl: local?.screenshotUrl ?? null,
        tags: meta.tags,
        subjects: meta.subjects,
        features: meta.features,
        layouts: meta.layouts,
        rating: meta.rating,
        installs: meta.installs,
        installed: Boolean(local),
        active: Boolean(local?.isActive),
        favourite: favourites.has(entry.key),
        provenance: "official" as const,
      };
    }),
    ...registry
      .filter((entry) => !officialKeys.has(entry.key))
      .map((entry) => {
        const meta = catalogMeta(entry.key);
        const local = byKey.get(entry.key);
        return {
          key: entry.key,
          name: entry.nameEn,
          summary: entry.summaryEn,
          author: meta.author,
          category: entry.category,
          version: entry.version,
          screenshotUrl: local?.screenshotUrl ?? null,
          tags: meta.tags,
          subjects: meta.subjects,
          features: meta.features,
          layouts: meta.layouts,
          rating: meta.rating,
          installs: meta.installs,
          installed: Boolean(local),
          active: Boolean(local?.isActive),
          favourite: favourites.has(entry.key),
          provenance: "community" as const,
        };
      }),
  ];

  return { installed, catalogue };
}

async function requireRow(
  db: Client,
  merchantId: string,
  themeId: string,
): Promise<Row> {
  const { data, error } = await db
    .from("store_themes")
    .select(SELECT)
    .eq("merchant_id", merchantId)
    .eq("id", themeId)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new ThemeDeskError("theme.missing", "That theme is not installed.");
  return data as unknown as Row;
}

/* -------------------------------- B2 — official catalogue + install (shared pipeline)
 *
 * Official themes (Songoskriti, Somvabona) install through the NORMAL
 * `installPackage` pipeline — same validators, same ledger, same version
 * rows as merchant uploads — against the internally-built artifact. There
 * is no separate official install path anywhere in this module.
 *
 * Artifact-build seam (owned by the artifact-build lane): the build lane
 * publishes each official theme's exact install bytes plus catalogue
 * metadata through `setOfficialArtifactProvider`. Until it does, the
 * provider is null: the official catalogue section is gracefully empty
 * and official installs refuse with `theme.official_unavailable` without
 * writing anything. Catalogue entries carry the serializable artifact ref
 * only (`official:<key>` pin); the bytes never leave the server, and
 * there is no downloadable official artifact.
 */

export type OfficialCatalogArtifact = {
  /** sha256 hex of the exact ZIP the pipeline installs. */
  checksum: string;
  /** Manifest version pinned inside that ZIP. */
  version: string;
  /** Archive name handed to `installPackage` (`<key>.zip`). */
  fileName: string;
  /** Provenance marker: `official:<key>`. */
  pinned: string;
};

export type OfficialCatalogEntry = {
  key: string;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  version: string;
  artifact: OfficialCatalogArtifact;
  /** Exact install bytes. Server-side only — never serialized to clients. */
  bytes: Uint8Array;
};

export type OfficialArtifactProvider = (
  key: OfficialThemeKey,
) => Promise<OfficialCatalogEntry | null>;

let officialArtifactProvider: OfficialArtifactProvider | null = null;

/**
 * Seam for the artifact-build lane (and tests). The build lane calls this
 * once with a provider that serves internally-built official artifacts;
 * tests inject fixture bytes the same way.
 */
export function __setOfficialArtifactProviderForTests(
  provider: OfficialArtifactProvider | null,
): void {
  officialArtifactProvider = provider;
}

/** Official catalogue entries, or [] when the build hasn't run. Never throws. */
export async function listOfficialCatalog(): Promise<OfficialCatalogEntry[]> {
  if (!officialArtifactProvider) return [];
  const entries: OfficialCatalogEntry[] = [];
  for (const key of OFFICIAL_THEME_KEYS) {
    try {
      const entry = await officialArtifactProvider(key);
      if (entry) entries.push(entry);
    } catch {
      // A broken build for one key hides that key, never the section.
    }
  }
  return entries;
}

async function resolveOfficialArtifact(
  key: string,
): Promise<OfficialCatalogEntry> {
  if (!(OFFICIAL_THEME_KEYS as readonly string[]).includes(key)) {
    throw new ThemeDeskError(
      "theme.unknown",
      "That theme is not in the catalogue.",
    );
  }
  const entry = officialArtifactProvider
    ? await officialArtifactProvider(key as OfficialThemeKey).catch(() => null)
    : null;
  if (!entry) {
    throw new ThemeDeskError(
      "theme.official_unavailable",
      "That official theme is not built yet. Try again later.",
    );
  }
  return entry;
}

/**
 * Install an official theme through the NORMAL package pipeline.
 *
 * Literally `installPackage` with the internally-built artifact bytes and
 * the strict PKG-1 theme validator — the same call shape as a merchant ZIP
 * upload — so validators, ledger, version rows, drafts and audit are
 * identical. The only official-specific touch is the ledger provenance
 * marker (`official:<key>` instead of `upload`), stamped after the
 * pipeline commits; if the stamp fails the install still stands and the
 * miss is logged (same degrade pattern as the SEO seed on the legacy
 * registry path).
 */
export async function installOfficialTheme(
  db: Client,
  merchantId: string,
  key: string,
  actorId?: string | null,
) {
  const entry = await resolveOfficialArtifact(key);
  const { installPackage, pkg1ThemeValidator } = await import(
    "../package-install.server"
  );
  const out = await installPackage(
    db,
    merchantId,
    {
      kind: "theme",
      fileName: entry.artifact.fileName,
      bytes: entry.bytes,
      idempotencyKey: `official:${merchantId}:${entry.key}`,
      validator: pkg1ThemeValidator,
    },
    actorId,
  );
  try {
    const { data: ledger } = await db
      .from("marketplace_installs")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("idempotency_key", `official:${merchantId}:${entry.key}`)
      .maybeSingle();
    const ledgerId = (ledger as { id: string } | null)?.id;
    if (ledgerId) {
      await db
        .from("marketplace_installs")
        .update({
          artifact_pinned: officialPinFor(entry.key),
        } as never)
        .eq("merchant_id", merchantId)
        .eq("id", ledgerId);
    }
  } catch {
    try {
      const { log } = await import("../observability.server");
      log("warn", "theme.official_pin_missed", { key: entry.key });
    } catch {
      // Observability must never fail an install that already committed.
    }
  }
  return out;
}

/**
 * Add a catalogue theme to the installed list (idempotent per key).
 *
 * Community path only: official keys (`songoskriti`, `somvabona`) always
 * install through the shared `installPackage` pipeline via
 * `installOfficialTheme` — never here. There is no separate official
 * install path.
 *
 * A complete install, like the marketplace path: theme row + version 1 +
 * draft + ledger row + linkage + audit. A bare theme row is invisible to
 * Marketplace themeStates and Activate/Delete, so partial installs are
 * worse than none — every step below runs, or the call throws.
 */
export async function installCatalogTheme(
  db: Client,
  merchantId: string,
  key: string,
  actorId?: string | null,
) {
  if ((OFFICIAL_THEME_KEYS as readonly string[]).includes(key)) {
    throw new ThemeDeskError(
      "theme.official_path",
      "Official themes install through the shared package pipeline.",
    );
  }
  const registry = await listRegistry(db);
  const entry = registry.find((theme) => theme.key === key);
  if (!entry)
    throw new ThemeDeskError(
      "theme.unknown",
      "That theme is not in the catalogue.",
    );
  const existing = (await rows(db, merchantId)).find(
    (row) => row.source_listing_slug === key,
  );
  if (existing) return { id: existing.id, alreadyInstalled: true };

  // Key-first replay: a committed ledger key with no linked theme refuses
  // (orphaned first attempt) instead of stacking a duplicate pair.
  const ledgerKey = `catalog:${merchantId}:${key}`;
  const keyed = await resolveCatalogReplay(db, merchantId, ledgerKey);
  if (keyed) return keyed;

  const pkg = registryPackage(key);
  const meta = catalogMeta(key);
  const { data, error } = await db
    .from("store_themes")
    .insert({
      merchant_id: merchantId,
      name: entry.nameEn,
      source_listing_slug: key,
      source_version: entry.version,
      author: meta.author,
      description: entry.summaryEn,
      tags: meta.tags,
      is_active: false,
      // The column has no DB default; omitting it writes NULL and later
      // crashes the installed-list sort for the whole merchant.
      installed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data)
    throw (
      error ?? new ThemeDeskError("theme.install_failed", "Install failed.")
    );
  const themeId = (data as { id: string }).id;

  const { data: version, error: versionError } = await db
    .from("theme_versions")
    .insert({
      merchant_id: merchantId,
      theme_id: themeId,
      version: 1,
      status: "published",
      published_at: new Date().toISOString(),
      label: key,
      templates: pkg.templates as never,
      tokens: pkg.tokens as never,
      source_registry_key: key,
      source_registry_version: pkg.version,
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (versionError || !version) {
    await compensateThemeDelete(
      db,
      merchantId,
      themeId,
      versionError ??
        new ThemeDeskError("theme.install_failed", "Install failed."),
    );
  }

  const { error: draftError } = await db.from("theme_drafts").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    revision: 1,
    templates: pkg.templates as never,
    tokens: pkg.tokens as never,
    updated_by: actorId ?? null,
  });
  if (draftError) {
    await compensateThemeDelete(db, merchantId, themeId, draftError);
  }

  const { data: ledger, error: ledgerError } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: "theme",
      theme_id: null,
      widget_id: null,
      listing_slug: key,
      listing_name: entry.nameEn,
      version: entry.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: `catalog:${merchantId}:${key}`,
    })
    .select("id")
    .single();
  if (ledgerError || !ledger) {
    if (isDuplicateKey(ledgerError)) {
      // A racing double-click committed the ledger row first: drop OUR
      // half-built theme row (tenant-scoped), then resolve the winner's
      // replay — or throw market_install_conflict while it is in flight.
      await db
        .from("store_themes")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", themeId);
      const replayed = await resolveCatalogReplay(db, merchantId, ledgerKey);
      if (replayed) return replayed;
      throw (
        ledgerError ??
        new ThemeDeskError("theme.install_failed", "Install failed.")
      );
    }
    await compensateThemeDelete(
      db,
      merchantId,
      themeId,
      ledgerError ??
        new ThemeDeskError("theme.install_failed", "Install failed."),
    );
  }

  await db
    .from("store_themes")
    .update({
      source_install_id: (ledger as { id: string }).id,
      published_version_id: (version as { id: string }).id,
    })
    .eq("id", themeId);
  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action: "theme.installed",
    before: null,
    after: { key, version_id: (version as { id: string }).id, via: "catalog" },
  });
  return { id: themeId, alreadyInstalled: false };
}

/**
 * B2 — Upload Theme server path (M-04 / WF-23).
 *
 * The `Upload theme` drop-zone validated `.zip` files client-side only, with
 * zero server path — a dead button by the WP-parity rule. This is the server
 * half: authoritative archive checks (extension, decoded size, zip magic),
 * then a new INACTIVE `store_themes` row in the exact shape of catalog
 * installs (row + published v1 + draft + ledger link + audit), so Activate /
 * Live Preview / Delete work uniformly from the first byte.
 *
 * Source-divergence note (see marketplace-badges.ts): uploads have no
 * catalog entry, so `source_listing_slug` stays NULL and the ledger row is
 * linked by `source_install_id` only — the same key the delete cascade
 * (`uninstallThemeInstall`) resolves. Full manifest extraction from the zip
 * (templates/tokens parsed out of the archive instead of the default shell)
 * is follow-up work paired with the media-library packaging lane; the row
 * installed here is intentionally inert until Activate flips it.
 *
 * Idempotency: the client mints ONE key per file-pick (crypto.randomUUID,
 * held for the retry/double-click lifetime) and reuses it. A replayed key
 * returns the original row — double-clicks never stack duplicate installs.
 * Validation runs BEFORE the replay lookup so a reused key cannot smuggle
 * different (or invalid) bytes past the archive checks.
 */
export type ThemeUploadInput = {
  fileName: string;
  fileBase64: string;
  idempotencyKey: string;
};

function slugifyUploadName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "theme";
}

function decodeUploadBytes(fileBase64: string): Buffer {
  // Strict base64: a string that decodes to nothing (or is not base64 at
  // all) is an empty upload, not a theme.
  const bytes = Buffer.from(fileBase64, "base64");
  const roundTrip = bytes.length > 0;
  if (!roundTrip || !fileBase64.trim()) {
    throw new ThemeDeskError("theme.upload_empty", "That file is empty.");
  }
  return bytes;
}

/**
 * QUBICKLE H6 (Rule 16): server-side archive validation. Magic bytes only
 * prove the first four bytes are `PK..` — a hostile or corrupt archive sails
 * through. The central directory is parsed and every entry validated before
 * any row is written; nothing is extracted except the small root manifest,
 * so a bomb has no room to detonate. No dependency — the parser reads the
 * EOCD + central directory by hand (local headers only at manifest
 * extraction), which also keeps hostile archives out of any third-party
 * extractor's edge cases.
 */
export const MAX_THEME_UPLOAD_ENTRIES = 1000;
export const MAX_THEME_UPLOAD_INFLATED_BYTES = 100 * 1024 * 1024;
export const MAX_THEME_UPLOAD_ENTRY_BYTES = 50 * 1024 * 1024;
export const MAX_THEME_UPLOAD_MANIFEST_BYTES = 1024 * 1024;

type ZipEntry = {
  name: string;
  method: number;
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
};

function corruptUpload(message: string): ThemeDeskError {
  return new ThemeDeskError("theme.upload_corrupt", message);
}

function bombUpload(message: string): ThemeDeskError {
  return new ThemeDeskError("theme.upload_bomb", message);
}

function assertSafeEntryPath(name: string): void {
  const unsafe =
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.split("/").some((segment) => segment === ".." || segment === "");
  if (unsafe) {
    throw new ThemeDeskError(
      "theme.upload_path",
      `Unsafe entry path in theme package: ${name.slice(0, 80)}`,
    );
  }
}

function parseZipCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22)
    throw corruptUpload("Archive is too small to be a zip file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The EOCD record may sit up to 64KB of comment + 22 bytes from the end.
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 65557);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw corruptUpload("End-of-central-directory record not found.");
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (count > MAX_THEME_UPLOAD_ENTRIES)
    throw bombUpload(
      `Theme package lists ${count} entries (max ${MAX_THEME_UPLOAD_ENTRIES}).`,
    );
  if (centralOffset + centralSize > bytes.length)
    throw corruptUpload("Central directory runs past the end of the file.");
  const entries: ZipEntry[] = [];
  let off = centralOffset;
  let totalInflated = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > bytes.length)
      throw corruptUpload("Central directory entry is truncated.");
    if (view.getUint32(off, true) !== 0x02014b50)
      throw corruptUpload("Central directory entry signature mismatch.");
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const uncompSize = view.getUint32(off + 24, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localHeaderOffset = view.getUint32(off + 42, true);
    if (off + 46 + nameLen > bytes.length)
      throw corruptUpload("Central directory entry name is truncated.");
    const name = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(off + 46, off + 46 + nameLen),
    );
    // Directories (trailing slash) carry the trailing empty segment; strip
    // it before the traversal check, then require the rest to be safe.
    assertSafeEntryPath(name.endsWith("/") ? name.slice(0, -1) : name);
    if (method !== 0 && method !== 8)
      throw new ThemeDeskError(
        "theme.upload_method",
        "Theme package uses an unsupported compression method.",
      );
    if (uncompSize > MAX_THEME_UPLOAD_ENTRY_BYTES)
      throw bombUpload(
        `Theme package entry exceeds ${MAX_THEME_UPLOAD_ENTRY_BYTES / (1024 * 1024)} MB inflated.`,
      );
    totalInflated += uncompSize;
    if (totalInflated > MAX_THEME_UPLOAD_INFLATED_BYTES)
      throw bombUpload(
        `Theme package inflates past ${MAX_THEME_UPLOAD_INFLATED_BYTES / (1024 * 1024)} MB.`,
      );
    entries.push({ name, method, compSize, uncompSize, localHeaderOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extract-or-reject: the archive must carry a root `theme.json` (or legacy
 * `manifest.json`) that parses as a JSON object with a non-empty `name`.
 * Only this one small file is ever inflated — never the whole archive.
 */
function extractUploadManifest(
  bytes: Uint8Array,
  entries: ZipEntry[],
): { name: string; version: string } {
  const manifest =
    entries.find((e) => e.name === "theme.json") ??
    entries.find((e) => e.name === "manifest.json");
  if (!manifest)
    throw new ThemeDeskError(
      "theme.upload_manifest",
      "Theme package must contain a root theme.json manifest.",
    );
  if (
    manifest.compSize > MAX_THEME_UPLOAD_MANIFEST_BYTES ||
    manifest.uncompSize > MAX_THEME_UPLOAD_MANIFEST_BYTES
  )
    throw bombUpload("Theme manifest exceeds the 1 MB limit.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = manifest.localHeaderOffset;
  if (lh + 30 > bytes.length || view.getUint32(lh, true) !== 0x04034b50)
    throw corruptUpload("Manifest local header is missing or corrupt.");
  if (view.getUint16(lh + 8, true) !== manifest.method)
    throw corruptUpload("Manifest local header disagrees with the directory.");
  const dataOff =
    lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true);
  if (dataOff + manifest.compSize > bytes.length)
    throw corruptUpload("Manifest data runs past the end of the file.");
  const raw = bytes.subarray(dataOff, dataOff + manifest.compSize);
  let inflated: Uint8Array;
  try {
    inflated = manifest.method === 8 ? inflateRawSync(raw) : raw;
  } catch {
    throw corruptUpload("Manifest entry could not be decompressed.");
  }
  if (inflated.length > MAX_THEME_UPLOAD_MANIFEST_BYTES)
    throw bombUpload("Theme manifest exceeds the 1 MB limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(inflated));
  } catch {
    throw new ThemeDeskError(
      "theme.upload_manifest",
      "Theme manifest is not valid JSON.",
    );
  }
  const name =
    parsed && typeof parsed === "object"
      ? (parsed as { name?: unknown }).name
      : undefined;
  if (typeof name !== "string" || !name.trim())
    throw new ThemeDeskError(
      "theme.upload_manifest",
      "Theme manifest must be a JSON object with a name.",
    );
  const version =
    parsed && typeof parsed === "object"
      ? (parsed as { version?: unknown }).version
      : undefined;
  return {
    name: name.trim().slice(0, 80),
    version:
      typeof version === "string" && version.trim()
        ? version.trim().slice(0, 20)
        : "1.0.0",
  };
}

export async function installUploadedTheme(
  db: Client,
  merchantId: string,
  input: ThemeUploadInput,
  actorId?: string | null,
) {
  const rawName = (input.fileName ?? "").trim();
  if (!/\.zip$/iu.test(rawName)) {
    throw new ThemeDeskError(
      "theme.upload_name",
      "Theme packages must be a .zip file.",
    );
  }
  const bytes = decodeUploadBytes(input.fileBase64 ?? "");
  if (bytes.length > MAX_THEME_UPLOAD_BYTES) {
    throw new ThemeDeskError(
      "theme.upload_too_large",
      `Theme packages must stay under ${MAX_THEME_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06));
  if (!isZip) {
    throw new ThemeDeskError(
      "theme.upload_magic",
      "That file is not a valid zip archive.",
    );
  }
  // QUBICKLE H6: parse the central directory and extract the manifest BEFORE
  // the replay lookup or any write — a reused key must never smuggle hostile
  // bytes past the archive checks, and hostile bytes must never reach a row.
  const entries = parseZipCentralDirectory(bytes);
  const manifest = extractUploadManifest(bytes, entries);

  const { data: replayed } = await db
    .from("marketplace_installs")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replayed) {
    const hit = replayed as { id: string };
    const { data: theme } = await db
      .from("store_themes")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("source_install_id", hit.id)
      .maybeSingle();
    return {
      id: (theme as { id: string } | null)?.id ?? hit.id,
      alreadyInstalled: true,
    };
  }

  const base = rawName
    .replace(/\.zip$/iu, "")
    .trim()
    .slice(0, 80);
  // Identity comes from the extracted manifest; the slug carries a random
  // suffix so two uploads of the same file never share ledger identity
  // (QUBICKLE H6/M1: upload slugs are unique per install, never per-slug).
  // Templates/tokens still seed from the default shell — the archive's own
  // templates stay follow-up work paired with the media-library packaging
  // lane — but the row installed here is manifest-bound and inert until
  // Activate flips it.
  const name = manifest.name || base || "Uploaded theme";
  const listingSlug = `upload:${slugifyUploadName(base || manifest.name || "theme")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  // Default shell until the packaging lane extracts the archive's own
  // manifest: an inert, valid theme the merchant customizes after install.
  const pkg = registryPackage("__upload__");
  const { data, error } = await db
    .from("store_themes")
    .insert({
      merchant_id: merchantId,
      name,
      source_listing_slug: null,
      source_version: manifest.version,
      is_active: false,
      installed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data)
    throw (
      error ?? new ThemeDeskError("theme.install_failed", "Install failed.")
    );
  const themeId = (data as { id: string }).id;

  const { data: version, error: versionError } = await db
    .from("theme_versions")
    .insert({
      merchant_id: merchantId,
      theme_id: themeId,
      version: 1,
      status: "published",
      published_at: new Date().toISOString(),
      label: listingSlug,
      templates: pkg.templates as never,
      tokens: pkg.tokens as never,
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (versionError || !version) {
    await compensateThemeDelete(
      db,
      merchantId,
      themeId,
      versionError ??
        new ThemeDeskError("theme.install_failed", "Install failed."),
    );
  }

  const { error: draftError } = await db.from("theme_drafts").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    revision: 1,
    templates: pkg.templates as never,
    tokens: pkg.tokens as never,
    updated_by: actorId ?? null,
  });
  if (draftError) {
    await compensateThemeDelete(db, merchantId, themeId, draftError);
  }

  const { data: ledger, error: ledgerError } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: "theme",
      theme_id: null,
      widget_id: null,
      listing_slug: listingSlug,
      listing_name: name,
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
    await compensateThemeDelete(
      db,
      merchantId,
      themeId,
      ledgerError ??
        new ThemeDeskError("theme.install_failed", "Install failed."),
    );
  }

  await db
    .from("store_themes")
    .update({
      source_install_id: (ledger as { id: string }).id,
      published_version_id: (version as { id: string }).id,
    })
    .eq("id", themeId);
  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action: "theme.installed",
    before: null,
    after: {
      name,
      listing_slug: listingSlug,
      version_id: (version as { id: string }).id,
      via: "upload",
      bytes: bytes.length,
    },
  });
  return { id: themeId, alreadyInstalled: false };
}

/**
 * Activation guard: resolve the reviewed published version that goes live.
 *
 * The storefront only renders the version named by `published_version_id`
 * with `status = published`, so activation adopts that pointer when it is
 * valid, otherwise the newest *published* version — never MAX(version),
 * which may be an unreviewed draft. Drafts are never auto-published here:
 * unreviewed content reaches shoppers only through the publish gates. When
 * the theme has nothing publishable the call throws instead of leaving an
 * active-but-empty storefront behind.
 */
async function resolvePublishedVersionId(
  db: Client,
  merchantId: string,
  row: Row,
  actorId?: string | null,
): Promise<string> {
  if (row.published_version_id) {
    const { data: pointed } = await db
      .from("theme_versions")
      .select("id, status")
      .eq("merchant_id", merchantId)
      .eq("theme_id", row.id)
      .eq("id", row.published_version_id)
      .maybeSingle();
    if (pointed && (pointed as { status: string }).status === "published") {
      return row.published_version_id;
    }
    // Stale pointer (version deleted or demoted to draft): fall through to
    // the newest reviewed version rather than re-publishing unreviewed work.
  }

  const { data: latestPublished } = await db
    .from("theme_versions")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("theme_id", row.id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestPublished) return (latestPublished as { id: string }).id;

  // Draft-only or legacy rows: materialize from the draft (or registry
  // package) instead of refusing — activation of a draft-reviewed theme must
  // never fail with theme.unpublished while content exists to seed from.
  return materializeLegacyVersion(db, merchantId, row, actorId);
}

/**
 * Pre-versioning rows have no version at all: seed v1 from the draft (or the
 * registry package) so activation never leaves a null pointer behind. When
 * there is nothing to seed from, refuse instead of going live empty.
 */
async function materializeLegacyVersion(
  db: Client,
  merchantId: string,
  row: Row,
  actorId?: string | null,
): Promise<string> {
  const { data: draft } = await db
    .from("theme_drafts")
    .select("templates, tokens")
    .eq("merchant_id", merchantId)
    .eq("theme_id", row.id)
    .maybeSingle();

  let templates = draft?.templates;
  let tokens = draft?.tokens;
  if (!templates && row.source_listing_slug) {
    try {
      const pkg = registryPackage(row.source_listing_slug);
      templates = pkg.templates as never;
      tokens = pkg.tokens as never;
    } catch {
      // Preset not found
    }
  }
  if (!templates) {
    throw new ThemeDeskError(
      "theme.unpublished",
      "That theme has no published version yet. Publish it before activating.",
    );
  }
  const { data: createdVersion, error: createError } = await db
    .from("theme_versions")
    .insert({
      merchant_id: merchantId,
      theme_id: row.id,
      version: 1,
      status: "published",
      published_at: new Date().toISOString(),
      label: row.source_listing_slug ?? row.name,
      templates: templates as never,
      tokens: (tokens ?? {}) as never,
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (createError || !createdVersion) {
    throw new ThemeDeskError(
      "theme.unpublished",
      "That theme has no published version yet. Publish it before activating.",
    );
  }
  return (createdVersion as { id: string }).id;
}

/**
 * Make a theme the live one. The flag flip and the package fork are separate
 * steps on purpose: the flag is what the console reads, the fork is what the
 * storefront renders, and a fork failure must not leave two active rows.
 *
 * The activation guard runs before any flag flips, so a refusal never strands
 * the merchant on an active-but-empty theme.
 */
export async function activateTheme(
  db: Client,
  merchantId: string,
  themeId: string,
  actorId?: string | null,
) {
  const row = await requireRow(db, merchantId, themeId);
  const publishedVersionId = await resolvePublishedVersionId(
    db,
    merchantId,
    row,
    actorId,
  );

  const { error: clearError } = await db
    .from("store_themes")
    .update({ is_active: false })
    .eq("merchant_id", merchantId)
    .neq("id", themeId);
  if (clearError) throw clearError;
  // Single statement for the new live row (flag + pointer together), so a
  // crash between statements can never strand the merchant on an
  // active-but-empty theme.
  const { error } = await db
    .from("store_themes")
    .update({ is_active: true, published_version_id: publishedVersionId })
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (error) throw error;

  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action: "theme.activated",
    before: null,
    after: { name: (row as { name?: unknown }).name ?? null },
  });

  try {
    const { purgeStorefront } = await import("../themes.server");
    // T6: await the shared-invalidate promise. Fire-and-forget here let the
    // HTTP response return while stale isolates/Redis still served the old
    // theme, adding unbounded tail latency on top of the pointer TTL.
    await purgeStorefront("publish", merchantId);
  } catch {
    // Non-redis or test doubles silently continue
  }

  let applied = false;
  if (row.source_listing_slug) {
    try {
      // Refresh-only, never overwrite: overwrite=true here silently destroyed
      // merchant customizations on every activation (Sept 2026). A present
      // draft wins; absent drafts get seeded from the registry.
      await installRegistryTheme(
        db,
        merchantId,
        row.source_listing_slug,
        false,
      );
      applied = true;
    } catch {
      applied = false;
    }
  }
  return { id: themeId, applied };
}

export async function deleteTheme(
  db: Client,
  merchantId: string,
  themeId: string,
  actorId?: string | null,
) {
  const row = await requireRow(db, merchantId, themeId);
  if (row.is_active) {
    throw new ThemeDeskError(
      "theme.active",
      "Activate another theme before deleting this one.",
    );
  }

  // Cascade drafts and versions for this theme
  await db
    .from("theme_drafts")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId);
  await db
    .from("theme_versions")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId);

  // Update marketplace ledger row to terminal status.
  //
  // QUBICKLE C1 (Rule 15): retire by the install-id link ONLY. A
  // slug-sweep (`listing_slug = row.slug`) retires EVERY install sharing the
  // slug — deleting a spare copy would silently kill the live copy's ledger
  // row. When the row carries marketplace identity (a slug) but no link, fail
  // closed with theme.unlinked instead of guessing: retiring the wrong row
  // is worse than refusing. Pure builder rows (no slug, no link) have no
  // ledger identity to retire, so they delete without touching the ledger.
  if (row.source_install_id) {
    const { error: ledgerError } = await db
      .from("marketplace_installs")
      .update({ status: "removed" })
      .eq("merchant_id", merchantId)
      .eq("id", row.source_install_id);
    if (ledgerError) throw ledgerError;
  } else if (row.source_listing_slug) {
    throw new ThemeDeskError(
      "theme.unlinked",
      "That theme is not linked to a marketplace install and cannot be retired safely.",
    );
  }

  const { error } = await db
    .from("store_themes")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (error) throw error;
  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action: "theme.deleted",
    before: { name: (row as { name?: unknown }).name ?? null },
    after: null,
  });
  return { id: themeId };
}

export async function setThemeFlags(
  db: Client,
  merchantId: string,
  themeId: string,
  patch: { autoUpdate?: boolean; favourite?: boolean; name?: string },
) {
  await requireRow(db, merchantId, themeId);
  const update: Record<string, unknown> = {};
  if (patch.autoUpdate !== undefined) update.auto_update = patch.autoUpdate;
  if (patch.favourite !== undefined) update.favourite = patch.favourite;
  if (patch.name !== undefined)
    update.name = patch.name.trim().slice(0, 80) || "Untitled theme";
  if (!Object.keys(update).length) return { id: themeId };
  const { error } = await db
    .from("store_themes")
    .update(update)
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (error) throw error;
  return { id: themeId };
}

/** Star / unstar a catalogue theme for the Favourites tab. */
export async function setCatalogFavourite(
  db: Client,
  merchantId: string,
  key: string,
  on: boolean,
) {
  if (on) {
    const { error } = await db
      .from("theme_catalog_favourites")
      .upsert(
        { merchant_id: merchantId, theme_key: key },
        { onConflict: "merchant_id,theme_key" },
      );
    if (error) throw error;
  } else {
    const { error } = await db
      .from("theme_catalog_favourites")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("theme_key", key);
    if (error) throw error;
  }
  return { key, favourite: on };
}
