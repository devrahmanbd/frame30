/**
 * Threat-defense — versioned security report per package version (pure assembly).
 *
 * No migration: every field recomputes from rows that already exist —
 * (`theme_versions` | `plugin_state`) content plus the (`theme_audit` |
 * `activity_log`) approval trail — using the exact file shapes
 * (`templates.json` / `plugin.json`), hash bindings
 * (`sha256(JSON.stringify(templates))` / `{ plugin, manifest_version }`),
 * and Tier-0 probe (`hasSecretFinding`) the activation/enable gates enforce.
 * A reader therefore sees the same verdict the gates would reach, with the
 * recorded decision (`theme.approved` / `plugin.approved` + actor) attached.
 *
 * Why no `package_security_reports` table: the report is a deterministic
 * function of (stored content, stored audits, `SCANNER_VERSION`) — persisting
 * it would duplicate data that already carries identity (content hash via
 * recomputation, `marketplace_installs.artifact_checksum` for ZIP provenance,
 * `theme_versions.checksum` on pipeline rows) and could drift from the gates
 * whenever scan rules change. `scannerVersion` lets a reader tell which rule
 * set produced the findings instead.
 *
 * Read-only: selects only, never inserts/updates/deletes. Every read is
 * merchant-scoped; a version outside the caller's merchant reads as missing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createHash } from "node:crypto";
import {
  SCANNER_VERSION,
  hasSecretFinding,
  scanPackage,
  type ScanFinding,
} from "./package-scan";

type Client = SupabaseClient<Database>;

export type SecurityReportKind = "theme" | "plugin";

/** `forbidden` (Tier-0 secret) wins over any legacy approval row. */
export type SecurityDecision = "clean" | "pending" | "approved" | "forbidden";

export type SecurityReportInput =
  | {
      kind: "theme";
      merchantId: string;
      themeId: string;
      versionId: string;
    }
  | {
      kind: "plugin";
      merchantId: string;
      packageId: string;
      versionId: string;
    };

export type PackageSecurityReport = {
  package: { kind: SecurityReportKind; id: string; name: string };
  /** `theme_versions.version` (number as string) or the manifest version. */
  version: string;
  /** Content binding the gates enforce (NOT the ZIP `artifact_checksum`). */
  sha256: string;
  merchantId: string;
  /** Recorder of the version row (`created_by` / `consented_by`), if any. */
  uploader: string | null;
  scannerVersion: string;
  findings: ScanFinding[];
  decision: SecurityDecision;
  decidedBy: string | null;
  decidedAt: string | null;
};

/** Same content binding `approveThemeVersion` records. */
function contentHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value ?? {}))
    .digest("hex");
}

function decide(
  verdict: "clean" | "flagged",
  secret: boolean,
  approval: { actor: unknown; created_at: unknown } | null,
): Pick<PackageSecurityReport, "decision" | "decidedBy" | "decidedAt"> {
  if (secret)
    return { decision: "forbidden", decidedBy: null, decidedAt: null };
  if (verdict === "clean")
    return { decision: "clean", decidedBy: null, decidedAt: null };
  if (!approval)
    return { decision: "pending", decidedBy: null, decidedAt: null };
  return {
    decision: "approved",
    decidedBy:
      typeof approval.actor === "string" && approval.actor
        ? approval.actor
        : null,
    decidedAt:
      typeof approval.created_at === "string" && approval.created_at
        ? approval.created_at
        : null,
  };
}

async function themeReport(
  db: Client,
  merchantId: string,
  themeId: string,
  versionId: string,
): Promise<PackageSecurityReport> {
  const { data: theme } = await db
    .from("store_themes")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .eq("id", themeId)
    .maybeSingle();
  if (!theme) throw new Error("theme.missing");
  const { data: version } = await db
    .from("theme_versions")
    .select("id, version, templates, created_by")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .eq("id", versionId)
    .maybeSingle();
  if (!version) throw new Error("theme.version_missing");
  const v = version as {
    version?: unknown;
    templates?: unknown;
    created_by?: unknown;
  };
  const t = theme as { id: string; name?: unknown };
  const sha256 = contentHash(v.templates);
  // Same file shape the activation gate scans.
  const report = scanPackage([
    {
      path: "templates.json",
      bytes: new TextEncoder().encode(JSON.stringify(v.templates ?? {})),
    },
  ]);
  const { data: approvals } = await db
    .from("theme_audit")
    .select("actor, after, created_at")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .eq("action", "theme.approved");
  const approval = (
    ((approvals ?? []) as unknown as {
      actor?: unknown;
      after?: unknown;
      created_at?: unknown;
    }[]) ?? []
  ).find(
    (a) => ((a.after ?? {}) as Record<string, unknown>).content_hash === sha256,
  );
  return {
    package: {
      kind: "theme",
      id: t.id,
      name: typeof t.name === "string" && t.name ? t.name : t.id,
    },
    version: String(v.version ?? ""),
    sha256,
    merchantId,
    uploader:
      typeof v.created_by === "string" && v.created_by ? v.created_by : null,
    scannerVersion: SCANNER_VERSION,
    findings: report.findings,
    ...decide(
      report.verdict,
      hasSecretFinding(report),
      approval
        ? {
            actor: approval.actor,
            created_at: (approval as { created_at?: unknown }).created_at,
          }
        : null,
    ),
  };
}

async function pluginReport(
  db: Client,
  merchantId: string,
  pluginId: string,
  manifestVersion: string,
): Promise<PackageSecurityReport> {
  const { data: row } = await db
    .from("plugin_state")
    .select("plugin_id, manifest, manifest_version, consented_by")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .maybeSingle();
  if (!row) throw new Error("plugin_not_found");
  const r = row as {
    plugin_id: string;
    manifest?: unknown;
    manifest_version?: unknown;
    consented_by?: unknown;
  };
  // Same version binding the approve fn enforces.
  if (r.manifest_version !== manifestVersion)
    throw new Error("plugin_version_mismatch");
  const manifestJson = JSON.stringify(r.manifest ?? {});
  const sha256 = contentHash(r.manifest);
  // Same file shape the enable gate scans.
  const report = scanPackage([
    { path: "plugin.json", bytes: new TextEncoder().encode(manifestJson) },
  ]);
  const { data: approvals } = await db
    .from("activity_log")
    .select("actor, changed, created_at")
    .eq("merchant_id", merchantId)
    .eq("action", "plugin.approved");
  const approval = (
    ((approvals ?? []) as unknown as {
      actor?: unknown;
      changed?: unknown;
      created_at?: unknown;
    }[]) ?? []
  ).find((a) => {
    const changed = (a.changed ?? {}) as Record<string, unknown>;
    return (
      changed.plugin === pluginId &&
      changed.manifest_version === r.manifest_version
    );
  });
  const manifest = (r.manifest ?? {}) as Record<string, unknown>;
  return {
    package: {
      kind: "plugin",
      id: r.plugin_id,
      name:
        typeof manifest.name === "string" && manifest.name
          ? manifest.name
          : r.plugin_id,
    },
    version: typeof r.manifest_version === "string" ? r.manifest_version : "",
    sha256,
    merchantId,
    uploader:
      typeof r.consented_by === "string" && r.consented_by
        ? r.consented_by
        : null,
    scannerVersion: SCANNER_VERSION,
    findings: report.findings,
    ...decide(
      report.verdict,
      hasSecretFinding(report),
      approval
        ? {
            actor: approval.actor,
            created_at: (approval as { created_at?: unknown }).created_at,
          }
        : null,
    ),
  };
}

/**
 * Versioned security report assembled from stored content + stored audits.
 * Selects only. Merchant-scoped: foreign versions read as missing.
 */
export async function packageSecurityReport(
  db: Client,
  input: SecurityReportInput,
): Promise<PackageSecurityReport> {
  if (input.kind === "theme")
    return themeReport(db, input.merchantId, input.themeId, input.versionId);
  return pluginReport(db, input.merchantId, input.packageId, input.versionId);
}
