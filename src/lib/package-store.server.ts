/**
 * PKG-2 — versioned package storage.
 *
 * Reuse, not new tables: package blobs live as `theme_assets` rows (the
 * table already exists with `merchant_id` + nullable `theme_id`), addressed
 * by a per-version namespace baked into the row `name`:
 *
 *   themes:  `themes/<version-id>/assets/<rel-path>`
 *   plugins: `plugins/<slug>/<artifact8>/assets/<rel-path>`
 *
 * Public URLs carry the same namespace plus a content-hash query (`?v=`), so
 * two versions of the same relative path never collide and nothing is ever
 * copied into `public/` or the source tree. All reads/writes are
 * merchant-scoped; callers pass the tenant id explicitly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BillingPlanKey } from "./entitlements";
import { PLAN_LADDER } from "./entitlements";
import { assertTenantId } from "./tenant-scope";

type Client = SupabaseClient<Database>;

export class PackageStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PackageStoreError";
  }
}

export type StoredAsset = {
  id: string;
  name: string;
  relPath: string;
  kind: string;
  bytes: number;
  url: string | null;
};

/**
 * Threat-defense — per-merchant persisted-asset storage quota (launch tier).
 *
 * Plan-tiered and fail-closed: every byte persisted under `theme_assets` for
 * the merchant counts — package version namespaces and merchant media alike.
 * 1 GiB admits roughly ten max-size uploads while bounding storage exhaustion
 * from repeated hostile uploads. Higher plans raise the cap via
 * `ASSET_QUOTA_BY_PLAN`; enforcement reads `quotaForMerchant`.
 */
export const MERCHANT_ASSET_QUOTA_BYTES = 1 << 30;

/**
 * Plan-tiered per-merchant persisted-asset storage quota.
 *
 * Owner-tunable values: adjust the byte caps here to change what each plan
 * admits; enforcement reads through `quotaForMerchant`, never the raw map.
 * `launch` stays `MERCHANT_ASSET_QUOTA_BYTES` (tests pin the const name).
 */
export const ASSET_QUOTA_BY_PLAN: Record<BillingPlanKey, number> = {
  launch: MERCHANT_ASSET_QUOTA_BYTES,
  growth: 5 * (1 << 30),
  business: 20 * (1 << 30),
  enterprise: 100 * (1 << 30),
};

/** Byte quota for a plan key. Unknown/blank input fails closed to launch. */
export function assetQuotaForPlan(plan: string): number {
  const key = (plan ?? "").trim();
  if ((PLAN_LADDER as readonly string[]).includes(key)) {
    return ASSET_QUOTA_BY_PLAN[key as BillingPlanKey];
  }
  return ASSET_QUOTA_BY_PLAN.launch;
}

/**
 * Merchant plan lookup over `subscriptions` (house pattern: same select +
 * fail-closed shape as the domain quota in `domains.server.ts`). Missing
 * rows, unknown plans, and read failures all resolve to `"launch"`.
 */
export async function merchantPlanKey(
  db: Client,
  merchantId: string,
): Promise<BillingPlanKey> {
  try {
    const { data: sub } = await (db as unknown as SupabaseClient<never>)
      .from("subscriptions")
      .select("plan")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    const subPlan = (sub as { plan?: unknown } | null)?.plan;
    const plan = typeof subPlan === "string" ? subPlan : "launch";
    const key = String(plan).trim();
    if ((PLAN_LADDER as readonly string[]).includes(key)) {
      return key as BillingPlanKey;
    }
    return "launch";
  } catch {
    return "launch";
  }
}

/** Effective byte quota for the merchant's plan. Fail-closed to launch. */
export async function quotaForMerchant(
  db: Client,
  merchantId: string,
): Promise<number> {
  const plan = await merchantPlanKey(db, merchantId);
  return assetQuotaForPlan(plan);
}

/** Total persisted asset bytes for the merchant. Tenant-scoped read. */
export async function merchantAssetBytes(
  db: Client,
  merchantId: string,
): Promise<number> {
  assertTenantId(merchantId, "merchantAssetBytes");
  const { data, error } = await (db as unknown as SupabaseClient<never>)
    .from("theme_assets")
    .select("bytes")
    .eq("merchant_id", merchantId);
  if (error) {
    throw new PackageStoreError(
      "package.asset_read_failed",
      (error as { message?: string } | null)?.message ?? "Asset read failed.",
    );
  }
  let total = 0;
  for (const row of ((data ?? []) as unknown as { bytes?: unknown }[])) {
    total += Number(row.bytes ?? 0);
  }
  return total;
}

export function themeVersionPrefix(versionId: string): string {
  if (!versionId || versionId.includes("/") || versionId.includes("..")) {
    throw new PackageStoreError("package.bad_version_id", "Bad version id.");
  }
  return `themes/${versionId}/assets/`;
}

export function pluginVersionPrefix(slug: string, artifact8: string): string {
  if (!slug || slug.includes("/") || slug.includes("..")) {
    throw new PackageStoreError("package.bad_slug", "Bad package slug.");
  }
  if (!/^[0-9a-f]{8}$/.test(artifact8)) {
    throw new PackageStoreError("package.bad_artifact", "Bad artifact id.");
  }
  return `plugins/${slug}/${artifact8}/assets/`;
}

/** Collision-safe versioned URL: namespace + content hash, no fs copies. */
export function versionedAssetUrl(
  merchantId: string,
  assetName: string,
  contentHash8: string,
): string {
  const safe = assetName
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `/pkg/${encodeURIComponent(merchantId)}/${safe}?v=${contentHash8}`;
}

export function assetKindForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "css";
  if (/\.(woff2?|ttf|otf|eot)$/.test(lower)) return "font";
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico)$/.test(lower)) return "image";
  return "json";
}

export type SaveAssetFile = {
  relPath: string;
  bytes: Uint8Array;
  text?: string | null;
};

function shortHash(bytes: Uint8Array): string {
  // FNV-1a 32-bit — a cache-buster, not a security digest (the artifact
  // identity hash lives in the install pipeline on node:crypto sha256).
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function saveVersionAssets(
  db: Client,
  merchantId: string,
  opts: {
    themeId: string | null;
    prefix: string;
    files: SaveAssetFile[];
  },
): Promise<StoredAsset[]> {
  assertTenantId(merchantId, "saveVersionAssets");
  const out: StoredAsset[] = [];
  for (const file of opts.files) {
    const name = `${opts.prefix}${file.relPath}`;
    const hash8 = shortHash(file.bytes);
    const row = {
      merchant_id: merchantId,
      theme_id: opts.themeId,
      kind: assetKindForPath(file.relPath),
      name,
      content: file.text ?? null,
      url: versionedAssetUrl(merchantId, name, hash8),
      bytes: file.bytes.length,
      enabled: true,
    };
    const { data, error } = await (db as unknown as SupabaseClient<never>)
      .from("theme_assets")
      .insert(row as never)
      .select("id, name, kind, bytes, url")
      .single();
    if (error || !data) {
      throw new PackageStoreError(
        "package.asset_save_failed",
        (error as { message?: string } | null)?.message ?? "Asset save failed.",
      );
    }
    const saved = data as unknown as {
      id: string;
      name: string;
      kind: string;
      bytes: number;
      url: string | null;
    };
    out.push({
      id: saved.id,
      name: saved.name,
      relPath: file.relPath,
      kind: saved.kind,
      bytes: Number(saved.bytes ?? 0),
      url: saved.url,
    });
  }
  return out;
}

export async function listVersionAssets(
  db: Client,
  merchantId: string,
  prefix: string,
): Promise<StoredAsset[]> {
  assertTenantId(merchantId, "listVersionAssets");
  const { data, error } = await (db as unknown as SupabaseClient<never>)
    .from("theme_assets")
    .select("id, name, kind, bytes, url")
    .eq("merchant_id", merchantId)
    .limit(1000);
  if (error) {
    throw new PackageStoreError(
      "package.asset_read_failed",
      (error as { message?: string } | null)?.message ?? "Asset read failed.",
    );
  }
  const rows = ((data ?? []) as unknown as {
    id: string;
    name: string;
    kind: string;
    bytes: number;
    url: string | null;
  }[]).filter((r) => r.name.startsWith(prefix));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    relPath: r.name.slice(prefix.length),
    kind: r.kind,
    bytes: Number(r.bytes ?? 0),
    url: r.url,
  }));
}

/**
 * Remove exactly one version namespace, tenant-scoped per row. Returns the
 * removed count so callers can distinguish "nothing there" from a real wipe.
 */
export async function deleteVersionAssets(
  db: Client,
  merchantId: string,
  prefix: string,
): Promise<{ removed: number }> {
  assertTenantId(merchantId, "deleteVersionAssets");
  const rows = await listVersionAssets(db, merchantId, prefix);
  for (const row of rows) {
    const { error } = await (db as unknown as SupabaseClient<never>)
      .from("theme_assets")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", row.id);
    if (error) {
      throw new PackageStoreError(
        "package.asset_delete_failed",
        (error as { message?: string } | null)?.message ?? "Asset delete failed.",
      );
    }
  }
  return { removed: rows.length };
}
