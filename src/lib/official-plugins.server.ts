/**
 * Official plugins are source-registered first-party components — not downloads.
 *
 * Install material is the in-repo source itself (`official-plugins.ts`
 * catalogue: builtin manifests plus the authored Analytics manifest). The
 * install path initializes merchant records directly from that source —
 * never a constructed archive, never merchant-supplied bytes, never the
 * shared archive installer the merchant-upload lane rides. Catalogue rows
 * carry the serializable ref only (`official:<key>` pin + source
 * fingerprint); there is nothing to download. Tests inject fixtures via
 * `__setOfficialPluginArtifactProviderForTests`.
 *
 * Gate composition (the same importable units the upload lane composes
 * internally, minus the archive-only stages that have no source equivalent):
 * - registry validation ... `gateExportManifest` (the exact exporter gate:
 *   `parseManifest` + `validateBundle`) plus `checkApiCompatibility`
 *   (builder-API range), both BEFORE the replay lookup so a reused key can
 *   never smuggle a corrupted source past the gates;
 * - tenant authorization . `assertTenantId`, the same unit every lane entry
 *   calls first;
 * - ledger ............... one `marketplace_installs` row shaped exactly like
 *   the lane's plugin row (`widget` kind, stable plugin id slug, manifest
 *   version, provenance marker stamped AT INSERT like the theme side) plus
 *   the same `package.installed` audit row;
 * - host projection ..... `upsertPlugin` with the full permission grant
 *   (subset rule + widening re-consent enforced there), linked to the ledger
 *   row; a projection failure compensates the ledger row tenant-scoped
 *   before the error surfaces, so no orphan install stands behind a success
 *   response. An audit-write failure compensates the same way.
 * - lifecycle ............ `setPluginPackageEnabled`, `rollbackPluginPackage`
 *   and `uninstallPluginPackage` operate on the ledger row by id exactly as
 *   they do for lane installs — enable/disable/rollback need nothing
 *   official-specific.
 *
 * Archive-only stages stay archive-only, and each is vacuous on this path:
 * no archive means no central-directory parse, no layout/content-authenticity
 * scan, no asset namespace (the lane writes zero `theme_assets` rows here),
 * no storage quota against persisted files. The install-time namespace
 * pre-check is likewise lane-only; this path matches the marketplace builtin
 * lane, which also installs ledger-first and lets the enable path
 * (`setPluginPackageEnabled`) run the conflict scan against the projected
 * row before anything goes live. Official sources declare no `dependencies`,
 * so the dependency assertion is vacuous too.
 *
 * Source fingerprint (replaces the archive checksum): `artifact_checksum`
 * used to be the sha256 of the exact archive the lane installed (byte
 * identity). With no archive there are no bytes to hash, so the row binds
 * the canonical manifest instead — sha256 over stable-key JSON of the
 * registry-validated manifest (key order normalized, so the binding is
 * construction-order independent). It stays 64-hex so every ledger reader
 * (rollback restore, uninstall attribution, replay equality) keeps working
 * unchanged. `packageSecurityReport` needs no edit for the same reason its
 * header already states: for plugins it binds recomputed content —
 * sha256 over the stored `plugin_state` manifest plus the
 * (plugin, manifest_version) approval trail — never `artifact_checksum`.
 * The fingerprint binds the same manifest content the report recomputes
 * from, so provenance and verdict stay consistent. Run that suite to prove
 * it; do not touch it.
 *
 * Reinstall/rollback deltas: reinstall replays the stable
 * `official:<merchant>:<key>` ledger key (a source version bump does not
 * auto-update an installed row — identical to the previous keyed replay).
 * Rollback mints its usual new row carrying the target's fingerprint, so a
 * rollback between an official row and a lane row of the same slug restores
 * the exact identity each row installed with.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  isOfficialPluginKey,
  officialPluginPinFor,
  officialPluginRow,
  officialPluginSource,
  OFFICIAL_PLUGIN_KEYS,
  type OfficialPluginArtifactRef,
  type OfficialPluginCatalogRow,
  type OfficialPluginKey,
} from "./official-plugins";
import { gateExportManifest } from "./plugin-package";

type Client = SupabaseClient<Database>;

export class OfficialPluginError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OfficialPluginError";
  }
}

/**
 * Install result: field-for-field the shape the archive lane returns, so
 * callers (and the enable/rollback/uninstall steps after them) treat an
 * official install exactly like a lane install. `artifactId` carries the
 * source fingerprint (see header), not a byte hash.
 */
export type OfficialInstallResult = {
  packageId: string;
  versionId: string;
  version: string;
  versionNumber: number;
  artifactId: string;
  alreadyInstalled: boolean;
  updated: boolean;
};

/** Server-side catalogue entry: the client-safe row plus source material. */
export type OfficialPluginCatalogEntry = {
  row: OfficialPluginCatalogRow;
  /** Manifest version pinned by the registry gate. */
  version: string;
  /** Backing manifest (builtin manifest or the authored Analytics one). */
  manifest: unknown;
  artifact: OfficialPluginArtifactRef;
};

export type OfficialPluginArtifactProvider = (
  key: OfficialPluginKey,
) => Promise<OfficialPluginCatalogEntry | null>;

/** Key-order-normalized JSON: the same manifest hashes identically no matter
 * how its object was constructed. Mirrors `JSON.stringify` for JSON data
 * (undefined props dropped, non-finite numbers null). */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? String(value) : "null";
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries
        .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
        .join(",")}}`;
    }
    default:
      return "null";
  }
}

/**
 * Source fingerprint: deterministic hash of the canonical manifest. The
 * manifest is registry-validated first, so only gate-passing content can
 * ever be fingerprinted; the stable serialization keeps the binding
 * independent of object construction order. Shared with the marketplace
 * builtin lane, which reports the same identity for official keys without
 * materializing anything.
 */
export function officialPluginFingerprint(manifest: unknown): string {
  const gated = gateExportManifest(manifest);
  return createHash("sha256").update(stableStringify(gated)).digest("hex");
}

/**
 * Default catalogue entry: registry-gate the catalogue source and bind the
 * fingerprint — the checksum on the row IS the identity the install stamps.
 */
export function defaultOfficialPluginCatalogEntry(
  key: OfficialPluginKey,
): OfficialPluginCatalogEntry | null {
  const source = officialPluginSource(key);
  if (!source) return null;
  const gated = gateExportManifest(source.manifest);
  const fingerprint = officialPluginFingerprint(source.manifest);
  return {
    row: officialPluginRow(source, gated.version, fingerprint),
    version: gated.version,
    manifest: source.manifest,
    artifact: {
      checksum: fingerprint,
      version: gated.version,
      fileName: `${key}.zip`,
      pinned: officialPluginPinFor(key),
    },
  };
}

let officialPluginArtifactProvider: OfficialPluginArtifactProvider = async (
  key,
) => defaultOfficialPluginCatalogEntry(key);

/**
 * Seam for tests (fault injection: throwing builds, fixture entries).
 * Passing null restores the default source-built provider.
 */
export function __setOfficialPluginArtifactProviderForTests(
  provider: OfficialPluginArtifactProvider | null,
): void {
  officialPluginArtifactProvider =
    provider ?? (async (key) => defaultOfficialPluginCatalogEntry(key));
}

/** Official catalogue entries in `OFFICIAL_PLUGIN_KEYS` order. Never throws. */
export async function listOfficialPluginCatalog(): Promise<
  OfficialPluginCatalogEntry[]
> {
  const entries: OfficialPluginCatalogEntry[] = [];
  for (const key of OFFICIAL_PLUGIN_KEYS) {
    try {
      const entry = await officialPluginArtifactProvider(key);
      if (entry) entries.push(entry);
    } catch {
      // A broken build for one key hides that key, never the section.
    }
  }
  return entries;
}

async function resolveOfficialPluginArtifact(
  key: string,
): Promise<OfficialPluginCatalogEntry> {
  if (!isOfficialPluginKey(key)) {
    throw new OfficialPluginError(
      "plugin.official_unknown",
      "That plugin is not in the official catalogue.",
    );
  }
  const entry = await officialPluginArtifactProvider(key).catch(() => null);
  if (!entry) {
    throw new OfficialPluginError(
      "plugin.official_unavailable",
      "That official plugin is not built yet. Try again later.",
    );
  }
  return entry;
}

function replayResult(
  installId: string,
  version: string,
  fingerprint: string,
): OfficialInstallResult {
  return {
    packageId: installId,
    versionId: installId,
    version,
    versionNumber: 1,
    artifactId: fingerprint,
    alreadyInstalled: true,
    updated: false,
  };
}

/**
 * Install an official plugin from source (no archive, no upload lane).
 *
 * Source (`official-plugins.ts` catalogue) → registry validation
 * (`gateExportManifest` + API compatibility) → catalogue metadata
 * (serializable `official:<key>` ref + source fingerprint) → merchant
 * records (ledger row with the stable plugin id + source version/fingerprint
 * + provenance, permission grant via `upsertPlugin`, audit rows).
 *
 * Enable/disable needs nothing official-specific: `setPluginPackageEnabled`
 * flips the ledger row both lanes write; rollback and uninstall read the
 * same row by id.
 */
export async function installOfficialPlugin(
  db: Client,
  merchantId: string,
  key: string,
  actorId?: string | null,
): Promise<OfficialInstallResult> {
  const { assertTenantId } = await import("./tenant-scope");
  assertTenantId(merchantId, "installOfficialPlugin");
  const entry = await resolveOfficialPluginArtifact(key);
  // Registry validation BEFORE the replay lookup: a reused key must never
  // replay a source the gates would now refuse. Never trusts provider
  // output — the entry manifest is re-gated on every install.
  const gated = gateExportManifest(entry.manifest);
  const { checkApiCompatibility } = await import("./registry-version");
  const api = checkApiCompatibility(gated.api);
  if (!api.ok) {
    throw new OfficialPluginError("plugin.api_incompatible", api.message);
  }
  const fingerprint = officialPluginFingerprint(entry.manifest);
  const idempotencyKey = `official:${merchantId}:${entry.row.key}`;

  const { data: existing } = await db
    .from("marketplace_installs")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    const hit = existing as unknown as { id: string };
    return replayResult(hit.id, gated.version, fingerprint);
  }

  const { data: ledgerRow, error: ledgerError } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: "widget",
      theme_id: null,
      widget_id: null,
      listing_slug: gated.id,
      listing_name: gated.name,
      version: gated.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: idempotencyKey,
      // Provenance stamped at insert (theme-side pattern): the source
      // fingerprint plus the catalogue pin, never the upload label.
      artifact_checksum: fingerprint,
      artifact_version: gated.version,
      artifact_pinned: officialPluginPinFor(entry.row.key),
    } as never)
    .select("id")
    .single();
  if (ledgerError || !ledgerRow) {
    // A racing double-click committed first: resolve the winner's replay
    // instead of stacking a duplicate row.
    const { data: raced } = await db
      .from("marketplace_installs")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raced) {
      const hit = raced as unknown as { id: string };
      return replayResult(hit.id, gated.version, fingerprint);
    }
    throw new OfficialPluginError(
      "plugin.install_failed",
      "Official plugin install failed. Try again.",
    );
  }
  const ledgerId = (ledgerRow as unknown as { id: string }).id;

  // The audit write is part of the install: a surfaced error must never
  // mask a live-but-unaudited install, so it compensates the ledger row.
  try {
    await db.from("theme_audit").insert({
      merchant_id: merchantId,
      theme_id: null,
      actor: actorId ?? null,
      action: "package.installed",
      before: null,
      after: {
        slug: gated.id,
        version: gated.version,
        artifact: fingerprint.slice(0, 12),
      },
    } as never);
  } catch (e) {
    await db
      .from("marketplace_installs")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", ledgerId);
    throw e;
  }

  // Host projection (the same projection the marketplace builtin lane runs,
  // linked to this ledger row): installed officials keep rendering. A
  // projection failure compensates the ledger row tenant-scoped — no asset
  // namespace exists on this path, so the row is the only cleanup.
  const { upsertPlugin } = await import("./plugins.server");
  try {
    await upsertPlugin(db, merchantId, {
      manifest: entry.manifest,
      grantedScopes: gated.permissions,
      installId: ledgerId,
      actorId: actorId ?? null,
    });
  } catch (e) {
    await db
      .from("marketplace_installs")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", ledgerId);
    throw e;
  }

  return {
    packageId: ledgerId,
    versionId: ledgerId,
    version: gated.version,
    versionNumber: 1,
    artifactId: fingerprint,
    alreadyInstalled: false,
    updated: false,
  };
}
