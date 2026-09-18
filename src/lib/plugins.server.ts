/**
 * Phase 5 — plugin host state.
 *
 * `plugin_state` is the merchant-side projection of a marketplace install: the
 * reviewed manifest pinned at install time, the scopes the merchant approved,
 * their settings, and an on/off flag. The platform kill switch
 * (`plugin_kill_switch`) is checked on the read path, so disabling a tenant
 * takes effect on the next render without touching any install rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { auditAction } from "./hardening.server";
import {
  defaultSettings,
  parseManifest,
  permissionDiff,
  validateSettings,
  type InstalledPlugin,
} from "./plugin-manifest";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, plugin_id, manifest, scopes, settings, enabled";

export async function killSwitchOn(db: Client, pluginId: string) {
  const { data } = await db
    .from("plugin_kill_switch")
    .select("disabled")
    .eq("plugin_id", pluginId)
    .maybeSingle();
  return data?.disabled === true;
}

/** Installed plugins for a merchant. Invalid manifests are skipped, never thrown. */
export async function listInstalledPlugins(
  db: Client,
  merchantId: string,
): Promise<InstalledPlugin[]> {
  const { data, error } = await db
    .from("plugin_state")
    .select(COLUMNS)
    .eq("merchant_id", merchantId);

  if (error || !data) return [];
  const out: InstalledPlugin[] = [];
  for (const row of (data as any[]) ?? []) {
    const verdict = parseManifest(row.manifest);
    if (!verdict.ok) continue;
    const killed = await killSwitchOn(db, row.plugin_id);
    const schema = verdict.manifest.settings;
    out.push({
      installId: row.id,
      manifest: verdict.manifest,
      grantedScopes: row.scopes ?? [],
      settings: validateSettings(schema, row.settings ?? defaultSettings(schema)).values,
      enabled: !killed && row.enabled !== false,
    });
  }
  return out;
}

export type UpsertInput = {
  manifest: unknown;
  grantedScopes: string[];
  installId?: string | null;
  /** Audited actor; when omitted the row is still written but unattributed. */
  actorId?: string | null;
};

/**
 * Install or update a plugin. An update that adds permissions is refused
 * unless the merchant re-consented to exactly those scopes.
 */
export async function upsertPlugin(db: Client, merchantId: string, input: UpsertInput) {
  const verdict = parseManifest(input.manifest);
  if (!verdict.ok) throw new Error(`plugin_manifest_invalid:${verdict.errors.join(",")}`);
  const manifest = verdict.manifest;

  const granted = Array.from(new Set(input.grantedScopes)).sort();
  const missing = manifest.permissions.filter((p) => !granted.includes(p));
  if (missing.length) throw new Error(`plugin_consent_required:${missing.join(",")}`);

  const { data: existing } = await db
    .from("plugin_state")
    .select(COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("plugin_id", manifest.id)
    .maybeSingle();

  const diff = permissionDiff((existing as any)?.scopes ?? [], manifest.permissions);
  const settings = existing
    ? validateSettings(manifest.settings, (existing as any).settings ?? {}).values
    : defaultSettings(manifest.settings);

  const payload = {
    merchant_id: merchantId,
    plugin_id: manifest.id,
    manifest: manifest as unknown as Json,
    scopes: manifest.permissions,
    settings: settings as unknown as Json,
    enabled: (existing as any)?.enabled ?? true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("plugin_state")
    .upsert(payload, { onConflict: "merchant_id,plugin_id" });
  if (error) {
    console.error("plugin_save_failed db error:", error);
    throw new Error(`plugin_save_failed: ${error.message}`);
  }

  // NOTE: resource_id is uuid-typed; the plugin slug rides in `changed`.
  await auditAction(db, merchantId, input.actorId ?? null, existing ? "plugin.updated" : "plugin.installed", "plugin", {
    plugin: manifest.id,
    version: manifest.version,
    scopes: manifest.permissions,
  }, input.installId ?? null);
  return { ok: true, pluginId: manifest.id, permissionDiff: diff, warnings: verdict.warnings };
}

export async function savePluginSettings(
  db: Client,
  merchantId: string,
  pluginId: string,
  values: unknown,
) {
  const { data: row } = await db
    .from("plugin_state")
    .select(COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .maybeSingle();
  if (!row) throw new Error("plugin_not_installed");
  const verdict = parseManifest(row.manifest);
  if (!verdict.ok) throw new Error("plugin_manifest_invalid");

  const checked = validateSettings(verdict.manifest.settings, values);
  if (checked.errors.length) throw new Error(`plugin_settings_invalid:${checked.errors.join(",")}`);

  const { error } = await db
    .from("plugin_state")
    .update({ settings: checked.values as unknown as Json })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_settings_save_failed");
  return { ok: true, settings: checked.values };
}

export async function setPluginEnabled(
  db: Client,
  merchantId: string,
  pluginId: string,
  enabled: boolean,
  actorId?: string | null,
) {
  const { error } = await db
    .from("plugin_state")
    .update({ enabled })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_toggle_failed");
  await auditAction(db, merchantId, actorId ?? null, enabled ? "plugin.enabled" : "plugin.disabled", "plugin", {
    plugin: pluginId,
  }, null);
}

export async function uninstallPlugin(
  db: Client,
  merchantId: string,
  pluginId: string,
  actorId?: string | null,
) {
  const { error } = await db
    .from("plugin_state")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_uninstall_failed");
  await auditAction(db, merchantId, actorId ?? null, "plugin.uninstalled", "plugin", {
    plugin: pluginId,
  }, null);
  return { ok: true };
}

/** Platform owner only — RLS refuses everyone else. */
export async function setPluginKillSwitch(
  db: Client,
  merchantId: string,
  disabled: boolean,
  reason: string | null,
  setBy: string | null,
) {
  const { error } = await db
    .from("plugin_kill_switch")
    .upsert(
      { merchant_id: merchantId, disabled, reason, set_by: setBy, updated_at: new Date().toISOString() },
      { onConflict: "merchant_id" },
    );
  if (error) throw new Error("plugin_kill_switch_failed");
  return { ok: true, disabled };
}
