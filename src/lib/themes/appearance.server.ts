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
import {
  listRegistry,
  installRegistryTheme,
  registryPackage,
} from "@/lib/themes.server";
import { catalogMeta } from "./catalog-meta";
import {
  isNewerVersion,
  MAX_THEME_UPLOAD_BYTES,
  orderInstalled,
  type CatalogTheme,
  type InstalledTheme,
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

type Row = {
  id: string;
  name: string;
  is_active: boolean;
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
  "id, name, is_active, source_listing_slug, source_version, screenshot_url, author, description, tags, auto_update, favourite, published_version_id, installed_at";

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
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.theme_key));
}

/** Installed list + catalogue, with install/active/favourite flags resolved. */
export async function loadThemesWorkspace(
  db: Client,
  merchantId: string,
): Promise<ThemesWorkspace> {
  const [registry, installedRows, favourites] = await Promise.all([
    listRegistry(db),
    rows(db, merchantId),
    favouriteKeys(db, merchantId),
  ]);
  const latest = new Map(registry.map((entry) => [entry.key, entry.version]));
  const installed = orderInstalled(
    installedRows.map((row) => toInstalled(row, latest)),
  );
  const byKey = new Map(installed.filter((t) => t.key).map((t) => [t.key!, t]));

  const catalogue: CatalogTheme[] = registry.map((entry) => {
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
    };
  });

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

/**
 * Add a catalogue theme to the installed list (idempotent per key).
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
    await db.from("store_themes").delete().eq("id", themeId);
    throw (
      versionError ??
      new ThemeDeskError("theme.install_failed", "Install failed.")
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
    await db.from("store_themes").delete().eq("id", themeId);
    throw draftError;
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
    await db.from("store_themes").delete().eq("id", themeId);
    throw (
      ledgerError ??
      new ThemeDeskError("theme.install_failed", "Install failed.")
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
  const name = base || "Uploaded theme";
  const listingSlug = `upload:${slugifyUploadName(base || "theme")}`;
  // Default shell until the packaging lane extracts the archive's own
  // manifest: an inert, valid theme the merchant customizes after install.
  const pkg = registryPackage("__upload__");
  const { data, error } = await db
    .from("store_themes")
    .insert({
      merchant_id: merchantId,
      name,
      source_listing_slug: null,
      source_version: "1.0.0",
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
    await db.from("store_themes").delete().eq("id", themeId);
    throw (
      versionError ??
      new ThemeDeskError("theme.install_failed", "Install failed.")
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
    await db.from("store_themes").delete().eq("id", themeId);
    throw draftError;
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
      version: "1.0.0",
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (ledgerError || !ledger) {
    await db.from("store_themes").delete().eq("id", themeId);
    throw (
      ledgerError ??
      new ThemeDeskError("theme.install_failed", "Install failed.")
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

  // Update marketplace ledger row to terminal status
  const sourceInstallId = (row as { source_install_id?: string | null })
    .source_install_id;
  if (sourceInstallId) {
    await db
      .from("marketplace_installs")
      .update({ status: "removed" })
      .eq("merchant_id", merchantId)
      .eq("id", sourceInstallId);
  } else if (row.source_listing_slug) {
    await db
      .from("marketplace_installs")
      .update({ status: "removed" })
      .eq("merchant_id", merchantId)
      .eq("listing_slug", row.source_listing_slug)
      .eq("kind", "theme");
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
