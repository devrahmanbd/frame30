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
import { presetByKey } from "@/lib/theme-presets";
import { catalogMeta } from "./catalog-meta";
import {
  isNewerVersion,
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
  installed_at: string;
};

const SELECT =
  "id, name, is_active, source_listing_slug, source_version, screenshot_url, author, description, tags, auto_update, favourite, installed_at";

function toInstalled(row: Row, latest: Map<string, string>): InstalledTheme {
  const key = row.source_listing_slug;
  const preset = key ? presetByKey(key) : undefined;
  const version = row.source_version ?? preset?.version ?? "1.0.0";
  const catalogueVersion = key ? latest.get(key) : undefined;
  return {
    id: row.id,
    key,
    name: row.name,
    author: row.author ?? (key ? catalogMeta(key).author : "Framique"),
    description: row.description ?? preset?.summaryEn ?? "",
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
      status: "draft",
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
 * Make a theme the live one. The flag flip and the package fork are separate
 * steps on purpose: the flag is what the console reads, the fork is what the
 * storefront renders, and a fork failure must not leave two active rows.
 */
export async function activateTheme(
  db: Client,
  merchantId: string,
  themeId: string,
  actorId?: string | null,
) {
  const row = await requireRow(db, merchantId, themeId);
  const { error: clearError } = await db
    .from("store_themes")
    .update({ is_active: false })
    .eq("merchant_id", merchantId)
    .neq("id", themeId);
  if (clearError) throw clearError;
  const { error } = await db
    .from("store_themes")
    .update({ is_active: true })
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
