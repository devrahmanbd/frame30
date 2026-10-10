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
import { validateBundle } from "./marketplace-scopes";
import {
  defaultSettings,
  parseManifest,
  permissionDiff,
  validateSettings,
  type InstalledPlugin,
} from "./plugin-manifest";

type Client = SupabaseClient<Database>;

type PluginRow = {
  id: string;
  plugin_id: string;
  manifest: unknown;
  scopes: string[] | null;
  settings: unknown;
  enabled: boolean | null;
  auto_updates: boolean | null;
  suspended: boolean | null;
};

const COLUMNS =
  "id, plugin_id, manifest, scopes, settings, enabled, auto_updates, suspended, suspended_reason, suspended_at, version_pin, consented_by, manifest_version";

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

  // QUBICKLE M2 (Rule 4): a failed plugin read throws — callers that need a
  // storefront-safe fallback (listStorefrontPlugins) catch explicitly. A
  // silent [] here would masquerade as "no plugins installed".
  if (error) throw error;
  if (!data) return [];
  const out: InstalledPlugin[] = [];
  for (const row of (data as unknown as PluginRow[] | null) ?? []) {
    const verdict = parseManifest(row.manifest);
    if (!verdict.ok) continue;
    const killed = await killSwitchOn(db, row.plugin_id);
    const schema = verdict.manifest.settings;
    out.push({
      installId: row.id,
      manifest: verdict.manifest,
      grantedScopes: row.scopes ?? [],
      settings: validateSettings(
        schema,
        row.settings ?? defaultSettings(schema),
      ).values,
      enabled: !killed && row.enabled !== false && row.suspended !== true,
      autoUpdates: row.auto_updates === true,
    });
  }
  return out;
}

/**
 * Storefront-safe installed list for SSR payloads (footer mounts + placed
 * app-blocks). Uses the service client — `plugin_state` is never
 * anon-readable — and fails safe to `[]` so a plugin read can never break
 * a shopper-facing render.
 */
export async function listStorefrontPlugins(
  merchantId: string,
): Promise<InstalledPlugin[]> {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    return await listInstalledPlugins(supabaseAdmin as never, merchantId);
  } catch {
    return [];
  }
}

export type UpsertInput = {
  manifest: unknown;
  grantedScopes: string[];
  installId?: string | null;
  /** Audited actor; when omitted the row is still written but unattributed. */
  actorId?: string | null;
  /**
   * Fresh consent-screen confirmation for permission-widening UPDATES.
   * Fresh installs never need it (the install grant is the consent);
   * updates whose manifest adds permissions are refused without it, and the
   * fresh grant must cover the widened manifest (a re-consent that still
   * grants only the old subset is not consent to the new permissions).
   */
  reconsented?: boolean;
};

/**
 * True when the failure is "the consent-timestamp column doesn't exist yet"
 * (pre-migration DBs predate the server-side consent record) — never for
 * real write errors. Mirrors the isMissingArtifactColumnError /
 * isMissingRecurringColumnError optimistic-write pattern: the version +
 * scopes + actor record still lands, and the timestamp rides the audit row.
 */
function isMissingConsentColumnError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : (
      (err as { message?: string } | null)?.message ?? String(err ?? "")
    );
  if (!/consented_at/i.test(msg)) return false;
  return /column|schema cache|PGRST204|42703|does not exist/i.test(msg);
}

/**
 * Install or update a plugin. A grant must be a subset of the manifest's
 * permissions — partial grants are allowed; unknown/superset scopes are
 * refused until the merchant re-consents to exactly those scopes. Updates
 * that widen permissions are refused unless reconsented is set.
 */
export async function upsertPlugin(
  db: Client,
  merchantId: string,
  input: UpsertInput,
) {
  const verdict = parseManifest(input.manifest);
  if (!verdict.ok)
    throw new Error(`plugin_manifest_invalid:${verdict.errors.join(",")}`);
  const manifest = verdict.manifest;

  const bundleVerdict = validateBundle(manifest, manifest.permissions);
  if (!bundleVerdict.ok)
    throw new Error(`plugin.bundle_rejected:${bundleVerdict.errors.join(",")}`);

  const granted = Array.from(new Set(input.grantedScopes)).sort();
  const unknown = granted.filter((p) => !manifest.permissions.includes(p));
  if (unknown.length)
    throw new Error(`plugin_consent_required:${unknown.join(",")}`);

  const { data: existing } = await db
    .from("plugin_state")
    .select(COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("plugin_id", manifest.id)
    .maybeSingle();

  const diff = permissionDiff(
    (existing as unknown as PluginRow | null)?.scopes ?? [],
    manifest.permissions,
  );
  // CONSENT lane — the server-side consent record is the stored grant
  // (scopes) + version (manifest_version) + actor (consented_by) + timestamp
  // (consented_at). Added permissions always require a fresh consent screen
  // at update time: without reconsent a silent auto-update could escalate a
  // plugin's access. UPDATE-ONLY: fresh installs never need it (the install
  // grant is the consent).
  if (existing && diff.requiresConsent) {
    if (!input.reconsented) {
      throw new Error(`plugin_consent_required:${diff.added.join(",")}`);
    }
    // The fresh consent must actually cover the widened manifest — binding
    // the re-consent to the new version + granted set, not just a boolean.
    const missingFresh = manifest.permissions.filter(
      (p) => !granted.includes(p),
    );
    if (missingFresh.length)
      throw new Error(`plugin_consent_required:${missingFresh.join(",")}`);
  }
  const settings = existing
    ? validateSettings(
        manifest.settings,
        (existing as unknown as PluginRow).settings ?? {},
      ).values
    : defaultSettings(manifest.settings);

  const payload = {
    merchant_id: merchantId,
    plugin_id: manifest.id,
    manifest: manifest as unknown as Json,
    scopes: granted,
    settings: settings as unknown as Json,
    enabled: (existing as unknown as PluginRow | null)?.enabled ?? true,
    updated_at: new Date().toISOString(),
    consented_by: (input.actorId ?? null) as never,
    manifest_version: manifest.version as never,
  };
  // The server-side consent record stamps when this version + granted set
  // was approved. Optimistic write: pre-migration DBs without the column
  // keep the version + scopes + actor record (timestamp on the audit row).
  const stamped = {
    ...payload,
    consented_at: new Date().toISOString() as never,
  };

  let { error } = await db
    .from("plugin_state")
    .upsert(stamped, { onConflict: "merchant_id,plugin_id" });
  if (error && isMissingConsentColumnError(error)) {
    ({ error } = await db
      .from("plugin_state")
      .upsert(payload, { onConflict: "merchant_id,plugin_id" }));
  }
  if (error) {
    console.error("plugin_save_failed db error:", error);
    throw new Error(`plugin_save_failed: ${error.message}`);
  }

  // NOTE: resource_id is uuid-typed; the plugin slug rides in `changed`.
  await auditAction(
    db,
    merchantId,
    input.actorId ?? null,
    existing ? "plugin.updated" : "plugin.installed",
    "plugin",
    {
      plugin: manifest.id,
      version: manifest.version,
      scopes: manifest.permissions,
    },
    input.installId ?? null,
  );
  await auditAction(
    db,
    merchantId,
    input.actorId ?? null,
    "plugin.scopes_granted",
    "plugin",
    {
      plugin: manifest.id,
      scopes: granted,
      manifest_version: manifest.version,
    },
    input.installId ?? null,
  );
  return {
    ok: true,
    pluginId: manifest.id,
    permissionDiff: diff,
    warnings: verdict.warnings,
  };
}

export async function savePluginSettings(
  db: Client,
  merchantId: string,
  pluginId: string,
  values: unknown,
  actorId?: string | null,
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
  if (checked.errors.length)
    throw new Error(`plugin_settings_invalid:${checked.errors.join(",")}`);

  const { error } = await db
    .from("plugin_state")
    .update({ settings: checked.values as unknown as Json })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_settings_save_failed");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "plugin.settings_saved",
    "plugin",
    {
      plugin: pluginId,
    },
    null,
  );
  return { ok: true, settings: checked.values };
}

export async function setPluginEnabled(
  db: Client,
  merchantId: string,
  pluginId: string,
  enabled: boolean,
  actorId?: string | null,
) {
  // Tenant-scoped with affected-row assertion: a toggle for a row that is
  // not ours (or gone) fails closed instead of silently succeeding — the
  // same pattern as compensating deletes (appearance.server.ts).
  const { data, error } = await db
    .from("plugin_state")
    .update({ enabled })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .select("plugin_id");
  if (error) throw new Error("plugin_toggle_failed");
  if (!data || (data as unknown[]).length === 0)
    throw new Error("plugin_not_found");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    enabled ? "plugin.enabled" : "plugin.disabled",
    "plugin",
    {
      plugin: pluginId,
    },
    null,
  );
}

export async function setPluginAutoUpdates(
  db: Client,
  merchantId: string,
  pluginId: string,
  autoUpdates: boolean,
  actorId?: string | null,
) {
  const { error } = await db
    .from("plugin_state")
    .update({ auto_updates: autoUpdates, updated_at: new Date().toISOString() })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_auto_updates_failed");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    autoUpdates
      ? "plugin.auto_updates_enabled"
      : "plugin.auto_updates_disabled",
    "plugin",
    { plugin: pluginId },
    null,
  );
  return { ok: true, auto_updates: autoUpdates };
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
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "plugin.uninstalled",
    "plugin",
    {
      plugin: pluginId,
    },
    null,
  );
  return { ok: true };
}

/**
 * Platform owner only — RLS refuses everyone else. Kill switches are global
 * per plugin (not per merchant): the live table is keyed by plugin_id.
 */
export async function setPluginKillSwitch(
  db: Client,
  pluginId: string,
  disabled: boolean,
  reason: string | null,
) {
  const { error } = await db.from("plugin_kill_switch").upsert(
    {
      plugin_id: pluginId,
      disabled,
      reason,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plugin_id" },
  );
  if (error) throw new Error("plugin_kill_switch_failed");
  // R2-5: engaging the kill switch auto-suspends every merchant install of
  // this plugin (reason `kill_switch`) so the one `enabled` gate stops hooks,
  // widgets AND sidecar workers. Best-effort per merchant — the kill switch
  // write above remains authoritative even if the suspend loop fails.
  if (disabled === true) {
    try {
      const { data: rows } = await db
        .from("plugin_state")
        .select("merchant_id")
        .eq("plugin_id", pluginId);
      const merchants = [
        ...new Set(
          (((rows as unknown[]) ?? []) as { merchant_id: string }[])
            .map((r) => r.merchant_id)
            .filter(Boolean),
        ),
      ];
      const { suspendPlugin } = await import("./plugin-lifecycle.server");
      for (const merchantId of merchants) {
        try {
          await suspendPlugin(
            db as never,
            merchantId,
            pluginId,
            "kill_switch",
            null,
          );
        } catch {
          /* best-effort per merchant */
        }
      }
    } catch {
      /* kill switch write remains authoritative */
    }
  }
  return { ok: true, disabled };
}
