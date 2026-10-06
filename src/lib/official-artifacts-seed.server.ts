/**
 * B1 — official-artifact seed (deploy/seed time, server-side only).
 *
 * Stores artifacts built by `official-artifacts.ts` as `store_themes` +
 * `theme_versions` rows — the same tables the catalogue/upload lanes write,
 * so the catalogue, the publish fallback (`loadPublishArtifact`) and the
 * validators keep reading one shape. No ZIP is ever written or served;
 * artifacts live as DB rows only.
 *
 * Idempotency: the artifact `checksum` is the replay key. A version row
 * already carrying the checksum is returned untouched (`created: false`) —
 * re-running the seed changes nothing and stacks no duplicate rows. A new
 * checksum appends the next version number (history is append-only, same as
 * the install/rollback lanes).
 *
 * Live-pointer rule: the first seed wires `published_version_id` (a fresh
 * theme row has no live version); later seeds never move it — the publish
 * lane owns the pointer after that. Audit rows are written on insert only,
 * never on replay, so every deploy does not spam `theme_audit`.
 *
 * Scope note: `theme_drafts` / `marketplace_installs` ledger rows are NOT
 * written here — they belong to install time (first merchant install forks
 * the draft and links the ledger, exactly like the catalogue path). The
 * seed provides the official version line those lanes read.
 *
 * Provenance: version rows carry `source_registry_key` = theme key plus an
 * `official:<key>@<version>` label (`toThemeVersionRow`), so catalogue
 * display can tell official builds apart from merchant uploads (NULL key)
 * via `provenanceOf`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertTenantId } from "./tenant-scope";
import {
  toThemeVersionRow,
  type OfficialArtifact,
} from "./official-artifacts";
import { stableStringify } from "./theme-export";

type Client = SupabaseClient<Database>;

export type SeedOfficialArtifactResult = {
  key: string;
  themeId: string;
  versionId: string;
  versionNumber: number;
  checksum: string;
  created: boolean;
};

type ThemeRow = {
  id: string;
  source_version: string | null;
  published_version_id: string | null;
};

type VersionRow = {
  id: string;
  version: number;
  checksum: string | null;
};

async function findThemeRow(
  db: Client,
  merchantId: string,
  key: string,
): Promise<ThemeRow | null> {
  const { data, error } = await db
    .from("store_themes")
    .select("id, source_version, published_version_id")
    .eq("merchant_id", merchantId)
    .eq("source_listing_slug", key)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as ThemeRow | null;
}

async function listVersionRows(
  db: Client,
  merchantId: string,
  themeId: string,
): Promise<VersionRow[]> {
  const { data, error } = await db
    .from("theme_versions")
    .select("id, version, checksum")
    .eq("merchant_id", merchantId)
    .eq("theme_id", themeId)
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as unknown as VersionRow[]).slice().sort(
    (a, b) => a.version - b.version,
  );
}

async function seedOneArtifact(
  db: Client,
  merchantId: string,
  artifact: OfficialArtifact,
  actorId: string | null,
): Promise<SeedOfficialArtifactResult> {
  // Reconciled model: seeding installs through the NORMAL package pipeline
  // (same validators, ledger, version rows as merchant uploads) instead of
  // writing theme rows directly. The only official-specific touch is the
  // idempotency key namespace.
  const { buildExportZip } = await import("./theme-export");
  const { installPackage, pkg1ThemeValidator } = await import(
    "./package-install.server"
  );
  const enc = new TextEncoder();
  const files = [
    {
      path: "theme.json",
      bytes: enc.encode(
        stableStringify({ ...artifact.manifest, tokens: artifact.tokens }),
      ),
    },
    ...Object.entries(artifact.templates).map(([template, ast]) => ({
      path: `templates/${template}.json`,
      bytes: enc.encode(stableStringify(ast)),
    })),
    { path: "styles/skins.css", bytes: enc.encode(artifact.styles) },
    ...Object.entries(artifact.locales).map(([locale, table]) => ({
      path: `locales/${locale}.json`,
      bytes: enc.encode(stableStringify(table)),
    })),
    ...artifact.assets.map((a) => ({ path: a.path, bytes: a.bytes })),
  ];
  const out = await installPackage(
    db,
    merchantId,
    {
      kind: "theme",
      fileName: `${artifact.key}.zip`,
      bytes: buildExportZip(files),
      idempotencyKey: `official-seed:${merchantId}:${artifact.key}@${artifact.version}`,
      validator: pkg1ThemeValidator,
    },
    actorId,
  );
  return {
    key: artifact.key,
    themeId: out.packageId,
    versionId: out.versionId,
    versionNumber: out.versionNumber,
    checksum: artifact.checksum,
    created: !out.alreadyInstalled,
  };
}

/**
 * Seed built official artifacts server-side (deploy/seed entry point).
 * Idempotent per artifact checksum: re-running returns the existing rows
 * with `created: false` and writes nothing.
 */
export async function seedOfficialArtifacts(
  db: Client,
  merchantId: string,
  artifacts: OfficialArtifact[],
  actorId?: string | null,
): Promise<SeedOfficialArtifactResult[]> {
  const tenant = assertTenantId(merchantId, "seedOfficialArtifacts");
  const actor = actorId ?? null;
  const out: SeedOfficialArtifactResult[] = [];
  for (const artifact of artifacts) {
    out.push(await seedOneArtifact(db, tenant, artifact, actor));
  }
  return out;
}
