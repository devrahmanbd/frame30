/**
 * Threat-defense — merchant approval queue (read-only).
 *
 * Lists flagged latest content with no matching approval audit so the
 * themes / plugins desks can badge it: theme drafts (`theme_drafts`,
 * scanned as `templates.json` — the same file shape the activation gate in
 * `themes/appearance.server.ts` scans) and installed plugin manifests
 * (`plugin_state`, scanned as `plugin.json` — the same shape the enable
 * gate in `plugins.server.ts` scans).
 *
 * Read-only: selects only, never inserts/updates/deletes. Approval matching
 * mirrors the gates exactly — theme `theme.approved` audits bind to the
 * template content hash (`sha256(JSON.stringify(templates ?? {}))`, same as
 * `approveThemeVersion`), plugin `plugin.approved` audits bind to
 * `{ plugin, manifest_version }`. Every read is merchant-scoped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createHash } from "node:crypto";
import { scanPackage, type ScanFinding } from "./package-scan";

type Client = SupabaseClient<Database>;

export type ApprovalTheme = {
  themeId: string;
  themeName: string;
  versionId: string;
  findings: ScanFinding[];
};

export type ApprovalPlugin = {
  pluginId: string;
  name: string;
  manifestVersion: string;
  findings: ScanFinding[];
};

export type ApprovalQueue = {
  themes: ApprovalTheme[];
  plugins: ApprovalPlugin[];
};

/** Same content binding `approveThemeVersion` records (appearance.server.ts). */
function contentHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value ?? {}))
    .digest("hex");
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value ?? {}));
}

async function pendingThemes(
  db: Client,
  merchantId: string,
): Promise<ApprovalTheme[]> {
  const { data: themes, error } = await db
    .from("store_themes")
    .select("id, name")
    .eq("merchant_id", merchantId);
  if (error) throw error;
  const out: ApprovalTheme[] = [];
  for (const row of (themes ?? []) as unknown as {
    id: string;
    name: string;
  }[]) {
    // Latest content: the draft when the merchant has one, else the newest
    // version. Drafts are the merchant's latest edits; versions are the
    // approvable snapshots (publishing a draft creates a version with
    // identical templates, so the recorded hash clears the queue).
    const { data: draft } = await db
      .from("theme_drafts")
      .select("templates")
      .eq("merchant_id", merchantId)
      .eq("theme_id", row.id)
      .maybeSingle();
    const { data: versions } = await db
      .from("theme_versions")
      .select("id, version, templates")
      .eq("merchant_id", merchantId)
      .eq("theme_id", row.id)
      .order("version", { ascending: false })
      .limit(1);
    const latest = (
      (versions ?? []) as unknown as {
        id: string;
        templates?: unknown;
      }[]
    )[0];
    const templates =
      (draft as { templates?: unknown } | null)?.templates ?? latest?.templates;
    if (templates === undefined || templates === null) continue;
    // Same file shape the activation gate scans.
    const report = scanPackage([
      { path: "templates.json", bytes: encodeJson(templates) },
    ]);
    if (report.verdict === "clean") continue;
    // Nothing approvable without a version row to bind the approval to.
    if (!latest) continue;
    const { data: approvals } = await db
      .from("theme_audit")
      .select("after")
      .eq("merchant_id", merchantId)
      .eq("theme_id", row.id)
      .eq("action", "theme.approved");
    const approved = (
      (approvals ?? []) as unknown as {
        after?: unknown;
      }[]
    ).some(
      (a) =>
        ((a.after ?? {}) as Record<string, unknown>).content_hash ===
        contentHash(templates),
    );
    if (approved) continue;
    out.push({
      themeId: row.id,
      themeName: row.name,
      versionId: latest.id,
      findings: report.findings,
    });
  }
  return out;
}

async function pendingPlugins(
  db: Client,
  merchantId: string,
): Promise<ApprovalPlugin[]> {
  const { data: rows, error } = await db
    .from("plugin_state")
    .select("plugin_id, manifest, manifest_version")
    .eq("merchant_id", merchantId);
  if (error) throw error;
  const { data: approvals } = await db
    .from("activity_log")
    .select("changed")
    .eq("merchant_id", merchantId)
    .eq("action", "plugin.approved");
  const approved = new Set(
    ((approvals ?? []) as unknown as { changed?: unknown }[]).map((a) => {
      const changed = (a.changed ?? {}) as Record<string, unknown>;
      return `${String(changed.plugin ?? "")}@${String(changed.manifest_version ?? "")}`;
    }),
  );
  const out: ApprovalPlugin[] = [];
  for (const row of (rows ?? []) as unknown as {
    plugin_id: string;
    manifest?: unknown;
    manifest_version?: unknown;
  }[]) {
    const manifest = (row.manifest ?? {}) as Record<string, unknown>;
    // Same file shape the enable gate scans.
    const report = scanPackage([
      { path: "plugin.json", bytes: encodeJson(row.manifest ?? {}) },
    ]);
    if (report.verdict === "clean") continue;
    const manifestVersion =
      typeof row.manifest_version === "string" && row.manifest_version
        ? row.manifest_version
        : typeof manifest.version === "string"
          ? manifest.version
          : "";
    if (approved.has(`${row.plugin_id}@${manifestVersion}`)) continue;
    out.push({
      pluginId: row.plugin_id,
      name:
        typeof manifest.name === "string" && manifest.name
          ? manifest.name
          : row.plugin_id,
      manifestVersion,
      findings: report.findings,
    });
  }
  return out;
}

/**
 * Flagged latest content with no matching approval. Selects only — callers
 * approve through the existing `themeApproveFn` / `pluginApproveFn`, which
 * clear their row here via the recorded audit.
 */
export async function pendingApprovals(
  db: Client,
  merchantId: string,
): Promise<ApprovalQueue> {
  const [themes, plugins] = await Promise.all([
    pendingThemes(db, merchantId),
    pendingPlugins(db, merchantId),
  ]);
  return { themes, plugins };
}
