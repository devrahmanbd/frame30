/**
 * K1 — official plugin catalogue + install (shared pipeline), server layer.
 *
 * Distribution note (Frame30 §1/§4): official plugins (Reviews, Analytics,
 * WhatsApp Orders — see `src/lib/official-plugins.ts`) are source-registered
 * first-party components: catalogue rows resolve from in-repo source and no
 * ZIP is ever checked in or downloadable. Installs run through the NORMAL
 * `installPackage` pipeline — same validators, same ledger, same asset
 * namespace, same enable path as merchant uploads — against an artifact
 * built deterministically from that source at install time. The pipeline
 * here is the shared runtime contract (sandboxing, capabilities, scope
 * consent, Class A/B lifecycle), NOT a shared distribution mechanism:
 * plugin lifecycle lives entirely in the pipeline, so bypassing it would
 * redesign plugin execution and let built-in status bypass the gates it
 * must pass like any other install. There is no separate official install
 * path anywhere in this module.
 *
 * Artifact-build seam: the bytes behind each entry are rebuilt
 * deterministically from the catalogue source (`exportBuiltinPluginZip` for
 * the builtin-backed entries, `exportPluginManifestZip` over the authored
 * Analytics manifest — the same exporters a third-party author uses), so the
 * catalogue row and the installed bytes can never drift. The default
 * provider always builds from in-repo source; tests inject fixtures or
 * failures through `__setOfficialPluginArtifactProviderForTests` the same
 * way the theme suite does. Catalogue entries carry the serializable
 * artifact ref only (`official:<key>` pin); the bytes never leave the
 * server, and there is no downloadable official artifact.
 *
 * Read-only neighbours (imported/called, never modified): the
 * package-install pipeline (`installPackage`, kind "plugin"), the plugin
 * host (`upsertPlugin`), the scope/bundle gates, the sandbox.
 */

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
import type { InstallPackageResult } from "./package-install.server";

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

/** Server-side catalogue entry: the client-safe row plus install material. */
export type OfficialPluginCatalogEntry = {
  row: OfficialPluginCatalogRow;
  /** Manifest version pinned inside the ZIP. */
  version: string;
  /** Exact install bytes. Server-side only — never serialized to clients. */
  bytes: Uint8Array;
  /** Backing manifest (builtin manifest or the authored Analytics one). */
  manifest: unknown;
  artifact: OfficialPluginArtifactRef;
};

export type OfficialPluginArtifactProvider = (
  key: OfficialPluginKey,
) => Promise<OfficialPluginCatalogEntry | null>;

/**
 * Default provider: rebuild the exact install ZIP from the catalogue source
 * through the same exporters third-party authors use, and hash it with the
 * pipeline's own identity function — the checksum on the row IS the checksum
 * the pipeline will hash at install time.
 */
async function defaultOfficialPluginArtifactProvider(
  key: OfficialPluginKey,
): Promise<OfficialPluginCatalogEntry | null> {
  const source = officialPluginSource(key);
  if (!source) return null;
  const [{ exportBuiltinPluginZip, exportPluginManifestZip, gateExportManifest }, { artifactIdFor }] =
    await Promise.all([
      import("./plugin-package"),
      import("./package-install.server"),
    ]);
  const bytes =
    key === "store-analytics"
      ? exportPluginManifestZip(source.manifest)
      : exportBuiltinPluginZip(key);
  const gated = gateExportManifest(source.manifest);
  const checksum = artifactIdFor(bytes);
  return {
    row: officialPluginRow(source, gated.version, checksum),
    version: gated.version,
    bytes,
    manifest: source.manifest,
    artifact: {
      checksum,
      version: gated.version,
      fileName: `${key}.zip`,
      pinned: officialPluginPinFor(key),
    },
  };
}

let officialPluginArtifactProvider: OfficialPluginArtifactProvider =
  defaultOfficialPluginArtifactProvider;

/**
 * Seam for tests (fault injection: fixture bytes, throwing builds). Passing
 * null restores the default source-built provider.
 */
export function __setOfficialPluginArtifactProviderForTests(
  provider: OfficialPluginArtifactProvider | null,
): void {
  officialPluginArtifactProvider =
    provider ?? defaultOfficialPluginArtifactProvider;
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

/**
 * Install an official plugin through the NORMAL package pipeline.
 *
 * Literally `installPackage` (kind "plugin", strict `pkg1PluginValidator` —
 * the real plugin gate) with the internally-built artifact bytes — the same
 * call shape as a merchant ZIP upload — so validators, ledger, asset
 * namespace and audit are identical. Two official-specific touches, both
 * post-commit like the theme side:
 * 1. the ledger provenance marker (`official:<key>` instead of `upload`),
 *    stamped after the pipeline commits; if the stamp fails the install
 *    still stands and the miss is logged;
 * 2. the host projection (`upsertPlugin` with the full permission grant,
 *    linked to the pipeline ledger row) — the same projection the legacy
 *    builtin path ran, so installed officials keep rendering; if the
 *    projection fails the pipeline rows are compensated tenant-scoped
 *    (ledger row + version assets) before the error surfaces, so no orphan
 *    installs strand behind a success response.
 *
 * Enable/disable needs nothing official-specific: `setPluginPackageEnabled`
 * flips the pipeline ledger row both paths write.
 */
export async function installOfficialPlugin(
  db: Client,
  merchantId: string,
  key: string,
  actorId?: string | null,
): Promise<InstallPackageResult> {
  const entry = await resolveOfficialPluginArtifact(key);
  const { installPackage } = await import("./package-install.server");
  const { pkg1PluginValidator, gateExportManifest } = await import(
    "./plugin-package"
  );
  const out = await installPackage(
    db,
    merchantId,
    {
      kind: "plugin",
      fileName: entry.artifact.fileName,
      bytes: entry.bytes,
      idempotencyKey: `official:${merchantId}:${entry.row.key}`,
      validator: pkg1PluginValidator,
    },
    actorId,
  );
  try {
    const { data: ledger } = await db
      .from("marketplace_installs")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("idempotency_key", `official:${merchantId}:${entry.row.key}`)
      .maybeSingle();
    const ledgerId = (ledger as { id: string } | null)?.id;
    if (ledgerId) {
      await db
        .from("marketplace_installs")
        .update({
          artifact_pinned: officialPluginPinFor(entry.row.key),
        } as never)
        .eq("merchant_id", merchantId)
        .eq("id", ledgerId);
    }
  } catch {
    try {
      const { log } = await import("./observability.server");
      log("warn", "plugin.official_pin_missed", { key: entry.row.key });
    } catch {
      // Observability must never fail an install that already committed.
    }
  }
  const gated = gateExportManifest(entry.manifest);
  const { upsertPlugin } = await import("./plugins.server");
  try {
    await upsertPlugin(db, merchantId, {
      manifest: entry.manifest,
      grantedScopes: gated.permissions,
      installId: out.packageId,
      actorId: actorId ?? null,
    });
  } catch (e) {
    try {
      const { deleteVersionAssets, pluginVersionPrefix } = await import(
        "./package-store.server"
      );
      await deleteVersionAssets(
        db,
        merchantId,
        pluginVersionPrefix(
          gated.id,
          entry.artifact.checksum.slice(0, 8),
        ),
      ).catch(() => null);
    } catch {
      // Compensation is best-effort; the projection error is the signal.
    }
    await db
      .from("marketplace_installs")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", out.packageId);
    throw e;
  }
  return out;
}
