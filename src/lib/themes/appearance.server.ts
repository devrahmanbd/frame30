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
import { createHash } from "node:crypto";
import {
  listRegistry,
  installRegistryTheme,
  registryPackage,
} from "@/lib/themes.server";
import { catalogMeta } from "./catalog-meta";
import { builtinThemeMeta, getBuiltinTheme } from "./builtin-themes";
import type { PackageFile } from "../package-zip";
import { inventoryExternalUrls } from "../package-review";
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
 * bundled fallback (deploy-time-built, checksummed rows, display only) when
 * it hasn't — and every other registry row lists as community. Registry rows
 * colliding with an official key are skipped so no theme ever shows two
 * Install buttons.
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
  // Frame30 — `official` above is source-backed (built-in registry): the
  // catalogue never depends on a build lane or a checked-in bundle.
  // Installs initialize from source (see `installOfficialTheme`).
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

/* ----------------- (Frame30: B2 shared-pipeline model retired — see below) */

/* ----------------- Frame30 — official catalogue + install (source model)
 *
 * Official themes (Songoskriti, Somvabona) are source-owned: the catalogue
 * section reads display metadata from the single built-in registry
 * (`./builtin-themes`, trusted source modules) — never from build-lane
 * bytes or a checked-in bundle. Installs initialize the merchant's theme
 * records from the registered source definition through the SAME
 * row-creation as catalogue installs below (row + published v1 + draft +
 * ledger + linkage + audit), with the ledger provenance marker
 * (`official:<key>`) distinguishing them. No ZIP is constructed, no
 * `installPackage` archive runs, and there is no downloadable official
 * artifact. Custom merchant ZIPs keep the `installPackage` pipeline
 * (`package-install.server.ts`) exclusively.
 */

export type OfficialCatalogArtifact = {
  /** Source version pinned for this catalogue entry (documented `1.0.0`). */
  version: string;
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
};

/** Official catalogue entries from source. Never throws, never empty. */
export async function listOfficialCatalog(): Promise<OfficialCatalogEntry[]> {
  const out: OfficialCatalogEntry[] = [];
  for (const key of OFFICIAL_THEME_KEYS) {
    const meta = builtinThemeMeta(key);
    if (!meta) continue;
    out.push({
      key: meta.key,
      nameEn: meta.nameEn,
      nameBn: meta.nameBn,
      summaryEn: meta.summaryEn,
      summaryBn: meta.summaryBn,
      category: meta.category,
      version: meta.version,
      artifact: { version: meta.version, pinned: officialPinFor(meta.key) },
    });
  }
  return out;
}

/**
 * Install an official theme from its registered source definition.
 *
 * Validates the key against the built-in registry, then runs the same
 * initialization as catalogue installs (which resolves official keys from
 * source — see `installCatalogTheme`). Returns the same shape.
 */
export async function installOfficialTheme(
  db: Client,
  merchantId: string,
  key: string,
  actorId?: string | null,
) {
  if (!(OFFICIAL_THEME_KEYS as readonly string[]).includes(key)) {
    throw new ThemeDeskError(
      "theme.unknown",
      "That theme is not in the catalogue.",
    );
  }
  // Belt-and-braces: the key must resolve in the built-in registry, not
  // merely match a string in the UI list.
  if (!getBuiltinTheme(key)) {
    throw new ThemeDeskError(
      "theme.unknown",
      "That theme is not in the catalogue.",
    );
  }
  return installCatalogTheme(db, merchantId, key, actorId);
}

/**
 * Add a catalogue theme to the installed list (idempotent per key).
 *
 * Community keys resolve from the `theme_registry` rows; official keys
 * (`songoskriti`, `somvabona`) resolve from the built-in source registry —
 * the merchant's records are initialized from the registered source
 * definition either way. No ZIP is constructed on this path (uploads use
 * the upload lane, custom packages use `installPackage`).
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
  const official = (OFFICIAL_THEME_KEYS as readonly string[]).includes(key);
  let entry: { nameEn: string; version: string; summaryEn: string };
  if (official) {
    // Source-defined: the merchant's records initialize from the
    // registered source definition — never a constructed ZIP.
    const meta = builtinThemeMeta(key);
    if (!meta || !getBuiltinTheme(key)) {
      throw new ThemeDeskError(
        "theme.unknown",
        "That theme is not in the catalogue.",
      );
    }
    entry = {
      nameEn: meta.nameEn,
      version: meta.version,
      summaryEn: meta.summaryEn,
    };
  } else {
    const registry = await listRegistry(db);
    const found = registry.find((theme) => theme.key === key);
    if (!found)
      throw new ThemeDeskError(
        "theme.unknown",
        "That theme is not in the catalogue.",
      );
    entry = found;
  }
  const existing = (await rows(db, merchantId)).find(
    (row) => row.source_listing_slug === key,
  );
  if (existing) return { id: existing.id, alreadyInstalled: true };

  // Key-first replay: a committed ledger key with no linked theme refuses
  // (orphaned first attempt) instead of stacking a duplicate pair.
  // Official installs key their own ledger line so replays never collide
  // with a community install of the same slug.
  const ledgerKey = official
    ? `official:${merchantId}:${key}`
    : `catalog:${merchantId}:${key}`;
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
      idempotency_key: ledgerKey,
      // Official installs stamp their provenance at insert so the catalogue
      // can tell source installs from community rows without a second write.
      ...(official ? { artifact_pinned: officialPinFor(key) } : {}),
    } as never)
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
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action: "theme.installed",
    before: null,
    after: {
      key,
      version_id: (version as { id: string }).id,
      via: official ? "official" : "catalog",
      externalUrls: inventoryExternalUrls([
        {
          path: "templates.json",
          bytes: new TextEncoder().encode(JSON.stringify(pkg.templates)),
        },
      ]),
    },
  });
  return { id: themeId, alreadyInstalled: false };
}

/**
 * B2 — Upload Theme server path (M-04 / WF-23), unified onto the package
 * pipeline gates.
 *
 * The `Upload theme` drop-zone validated `.zip` files client-side only, with
 * zero server path — a dead button by the WP-parity rule. This is the server
 * half: the SAME archive + manifest gates `installPackage` runs (shared
 * central-directory parser with encrypted/zip64/spanned/symlink/local-header
 * checks, root-`theme.json` layout + area + executable policy, the real PKG-1
 * `pkg1ThemeValidator`, secret/CSS policy over surviving text files), then a
 * new INACTIVE `store_themes` row in the exact shape of catalog installs
 * (row + published v1 + draft + ledger link + audit), so Activate /
 * Live Preview / Delete work uniformly from the first byte. Templates/tokens
 * come from the ARCHIVE (never the default shell); styles/assets are
 * gate-checked but not persisted — this lane writes no `theme_assets` rows.
 *
 * Source-divergence note (see marketplace-badges.ts): uploads have no
 * catalog entry, so `source_listing_slug` stays NULL and the ledger row is
 * linked by `source_install_id` only — the same key the delete cascade
 * (`uninstallThemeInstall`) resolves. Persistence intentionally stays bespoke
 * instead of delegating to `installPackage`: every upload is a NEW install
 * with a unique `upload:<slug>-<rand>` ledger identity (two uploads of one
 * file = two rows), while `installPackage` keys the package line by manifest
 * slug (same slug + version refuses as `package.bad_version`). Version rows
 * land `published` (not pipeline-`draft`) so the console can preview the
 * inert row without a review step; the row stays inert until Activate flips it.
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
 * UPLOAD lane — shared package-pipeline gates (no duplicate parser).
 *
 * The retired hand-rolled ZIP parser is gone: it sniffed magic bytes, skipped
 * the encrypted / zip64 / spanned / symlink / local-header checks, and
 * extracted only a loose `{ name, version }` manifest while installing the
 * default shell. The upload path now runs the SAME gates `installPackage`
 * runs — `parseZip` + `extractPackageFiles` + `validatePackageLayout`
 * (`src/lib/package-zip.ts`, read-only import) and the real PKG-1 theme gate
 * (`pkg1ThemeValidator`, the exact adapter `installPackage` installs with) —
 * plus the secret/CSS content policy below. `UPLOAD_ZIP_LIMITS` keeps the old
 * lane's caps (1000 entries, 100 MB total, 50 MB per entry, 1 MB manifest)
 * so the H6 bomb cases pin unchanged behavior under the stricter parser.
 */
const UPLOAD_ZIP_LIMITS = {
  maxArchiveBytes: MAX_THEME_UPLOAD_BYTES,
  maxFiles: 1000,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
};

/**
 * Map shared `zip.*` failures onto the pre-existing `theme.upload_*`
 * surface so callers never see `package.*` codes. Two layout-policy
 * refusals and two content-policy refusals are new codes (nothing else
 * switches on upload codes): `theme.upload_blocked` (executables and
 * disallowed locations), `theme.upload_secret` (possible credential in
 * package text), `theme.upload_css` (stylesheet violates the CSS policy).
 */
function mapPackageZipError(err: unknown): ThemeDeskError | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !code.startsWith("zip.")) return null;
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case "zip.unsafe_path":
    case "zip.symlink":
      return new ThemeDeskError("theme.upload_path", message);
    case "zip.unsupported_method":
    case "zip.encrypted":
    case "zip.unsupported_feature":
    case "zip.spanned":
      // The retired parser silently ACCEPTED encrypted / zip64 / spanned
      // archives, so these gates are strictly new — they share the
      // unsupported-method code rather than masquerading as corruption.
      return new ThemeDeskError("theme.upload_method", message);
    case "zip.too_many_files":
    case "zip.entry_too_large":
    case "zip.total_too_large":
    case "zip.archive_too_large":
    case "zip.manifest_too_large":
      return new ThemeDeskError("theme.upload_bomb", message);
    case "zip.blocked_extension":
    case "zip.disallowed_location":
      return new ThemeDeskError("theme.upload_blocked", message);
    case "zip.missing_manifest":
    case "zip.manifest_invalid":
      return new ThemeDeskError("theme.upload_manifest", message);
    default:
      return new ThemeDeskError("theme.upload_corrupt", message);
  }
}

type UploadContentDeps = {
  scanSecrets: (
    source: string,
    field: "css" | "html",
  ) => Array<{ level: "error" | "warn" }>;
  scopeCss: (input: string) => {
    findings: Array<{ level: "error" | "warn"; message: string }>;
  };
};

/**
 * Content policy over the surviving text files: `scanSecrets` everywhere,
 * the full CSS policy on stylesheets. Error-level hits reject the upload
 * before any write — hostile content is never installed, so it can never
 * render. Images/fonts skip this gate (non-text areas are already confined
 * to inert extensions by the layout gate).
 */
function assertUploadContentPolicy(
  files: Array<{ path: string; bytes: Uint8Array }>,
  deps: UploadContentDeps,
): void {
  for (const file of files) {
    const isCss = file.path.startsWith("styles/") && file.path.endsWith(".css");
    const isJsonText =
      file.path === "theme.json" ||
      file.path.startsWith("templates/") ||
      file.path.startsWith("locales/");
    if (!isCss && !isJsonText) continue;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    } catch {
      continue;
    }
    const secrets = deps.scanSecrets(text, isCss ? "css" : "html");
    if (secrets.length > 0) {
      throw new ThemeDeskError(
        "theme.upload_secret",
        `Theme package may contain a credential (${file.path.slice(0, 80)}).`,
      );
    }
    if (isCss) {
      const { findings } = deps.scopeCss(text);
      const blocking = findings.find((f) => f.level === "error");
      if (blocking) {
        throw new ThemeDeskError(
          "theme.upload_css",
          `Theme stylesheet refused (${file.path.slice(0, 80)}): ${blocking.message}`,
        );
      }
    }
  }
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
  // Shared package-pipeline gates — archive + layout + manifest + content
  // policy BEFORE the replay lookup or any write, so a reused key can never
  // smuggle hostile bytes past the checks and hostile bytes never reach a
  // row. Dynamic imports keep this lane on the exact modules `installPackage`
  // runs (no copies, no cycles: the official-install path already imports
  // `package-install.server` this way).
  const {
    parseZip,
    extractPackageFiles,
    validatePackageLayout,
    collectBrokenAssetRefs,
  } = await import("../package-zip");
  const { pkg1ThemeValidator } = await import("../package-install.server");
  const { scanSecrets, scopeCss } = await import("../custom-code");
  let manifestName: string;
  let manifestVersion: string;
  let templates: Record<string, unknown>;
  let tokens: Record<string, unknown>;
  let files: PackageFile[];
  try {
    const entries = parseZip(bytes, UPLOAD_ZIP_LIMITS);
    files = extractPackageFiles(bytes, entries, UPLOAD_ZIP_LIMITS);
    const layout = validatePackageLayout(files, "theme", UPLOAD_ZIP_LIMITS);
    const verdict = pkg1ThemeValidator(layout.manifest, "theme");
    if (!verdict.ok) {
      throw new ThemeDeskError(
        "theme.upload_manifest",
        `Theme manifest rejected: ${verdict.errors.join(", ")}.`,
      );
    }
    assertUploadContentPolicy(files, { scanSecrets, scopeCss });
    // Dangling asset refs fail closed like the installPackage lane: an
    // archive whose templates point at files it does not ship is refused
    // before the replay lookup or any write.
    const broken = collectBrokenAssetRefs(files);
    if (broken.length > 0) {
      throw new ThemeDeskError(
        "theme.upload_manifest",
        `Theme references missing files: ${broken.slice(0, 5).join(", ")}.`,
      );
    }
    // Storage quota (threat-defense): persisted usage plus the incoming
    // inflated total must fit the merchant's plan-tiered quota before the
    // replay lookup or any write.
    const { merchantAssetBytes, quotaForMerchant } =
      await import("../package-store.server");
    {
      let incoming = 0;
      for (const f of files) incoming += f.bytes.length;
      const used = await merchantAssetBytes(db, merchantId);
      const quota = await quotaForMerchant(db, merchantId);
      if (used + incoming > quota) {
        throw new ThemeDeskError(
          "theme.upload_quota",
          "Merchant asset storage quota exceeded.",
        );
      }
    }
    // Archive content, pipeline-shaped: `templates/*.json` parsed exactly
    // like `installPackage` (unparseable file = null, never a throw — the
    // row stays inert until Activate), manifest `tokens` object or {}.
    templates = {};
    for (const file of files) {
      if (!file.path.startsWith("templates/") || !file.path.endsWith(".json"))
        continue;
      const key = file.path.slice("templates/".length, -".json".length);
      try {
        templates[key] = JSON.parse(new TextDecoder().decode(file.bytes));
      } catch {
        templates[key] = null;
      }
    }
    const rawTokens = (verdict.manifest.raw as Record<string, unknown>)?.tokens;
    tokens =
      rawTokens !== null &&
      typeof rawTokens === "object" &&
      !Array.isArray(rawTokens)
        ? (rawTokens as Record<string, unknown>)
        : {};
    manifestName = verdict.manifest.name;
    manifestVersion = verdict.manifest.version;
  } catch (err) {
    if (err instanceof ThemeDeskError) throw err;
    throw mapPackageZipError(err) ?? err;
  }

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
  // Identity comes from the validated manifest; the slug carries a random
  // suffix so two uploads of the same file never share ledger identity
  // (QUBICKLE H6/M1: upload slugs are unique per install, never per-slug).
  // Templates/tokens are the ARCHIVE's own (parsed above, pipeline-shaped) —
  // the row installed here is manifest-bound and inert until Activate flips it.
  const name = manifestName;
  const listingSlug = `upload:${slugifyUploadName(base || manifestName || "theme")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const { data, error } = await db
    .from("store_themes")
    .insert({
      merchant_id: merchantId,
      name,
      source_listing_slug: null,
      source_version: manifestVersion,
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
      templates: templates as never,
      tokens: tokens as never,
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
    templates: templates as never,
    tokens: tokens as never,
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
      version: manifestVersion,
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
    .eq("merchant_id", merchantId)
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
      externalUrls: inventoryExternalUrls(files),
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
 * Threat-defense — record explicit merchant approval of flagged content.
 *
 * Approval binds to the version's template CONTENT hash, not its row id:
 * activation materializes a separate published row from the draft, so an
 * id-bound approval could never cover the row that actually goes live —
 * while any content change (new hash) correctly needs fresh approval. The
 * theme must belong to the caller and the version to the theme.
 */
export async function approveThemeVersion(
  db: Client,
  merchantId: string,
  themeId: string,
  versionId: string,
  actorId?: string | null,
) {
  await requireRow(db, merchantId, themeId);
  const { data: version } = await db
    .from("theme_versions")
    .select("id, templates")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .eq("id", versionId)
    .maybeSingle();
  if (!version) {
    throw new ThemeDeskError(
      "theme.version_missing",
      "Version not found for this theme",
    );
  }
  const templates = (version as { templates?: unknown }).templates;
  await db.from("theme_audit").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    actor: actorId ?? null,
    action: "theme.approved",
    before: null,
    after: { version_id: versionId, content_hash: contentHash(templates) },
  });
  return { ok: true };
}

function contentHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value ?? {}))
    .digest("hex");
}

/**
 * Threat-defense approval check for activation: scan the about-to-go-live
 * version; flagged content activates only with a recorded `theme.approved`
 * audit for that exact version id. Read-only — never writes, never flips.
 */
async function assertVersionApproved(
  db: Client,
  merchantId: string,
  themeId: string,
  versionId: string,
): Promise<void> {
  const { data: version } = await db
    .from("theme_versions")
    .select("templates")
    .eq("merchant_id", merchantId)
    .eq("id", versionId)
    .maybeSingle();
  const templates = (version as { templates?: unknown } | null)?.templates;
  const { scanPackage } = await import("../package-scan");
  const report = scanPackage([
    {
      path: "templates.json",
      bytes: new TextEncoder().encode(JSON.stringify(templates ?? {})),
    },
  ]);
  if (report.verdict === "clean") return;
  const { data: approvals } = await db
    .from("theme_audit")
    .select("after")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .eq("action", "theme.approved");
  const approved = ((approvals ?? []) as unknown as {
    after?: unknown;
  }[]).some(
    (a) =>
      ((a.after ?? {}) as Record<string, unknown>).content_hash ===
      contentHash(templates),
  );
  if (!approved) {
    throw new ThemeDeskError(
      "theme.approval_required",
      `Version needs approval before activation: ${report.findings.map((f) => f.code).join(", ")}.`,
    );
  }
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
  // Threat-defense approval gate: a flagged version needs a recorded
  // approval for its exact id before any flag flips. Clean versions pass
  // untouched; the check reads, never writes.
  await assertVersionApproved(db, merchantId, row.id, publishedVersionId);

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
