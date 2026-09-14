/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 13 — server layer for `/admin/settings/seo`.
 *
 * Everything here runs as the signed-in merchant (RLS applies); the panel only
 * ever sees its own tenant's rows. All writes re-parse through the pure models
 * in `site-seo.ts`, so a hand-made request cannot store an unsafe redirect.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DEFAULT_SITE_SEO,
  normalisePath,
  parseSiteSeo,
  validateRedirect,
  type NotFoundRow,
  type RedirectRow,
  type SiteSeoSettings,
} from "./site-seo";

type Client = SupabaseClient<Database>;
type Loose = { from: (table: string) => any };
const loose = (db: Client) => db as unknown as Loose;

export type SiteSeoBundle = {
  settings: SiteSeoSettings;
  storeSlug: string;
  storeName: string;
  redirects: RedirectRow[];
  notFound: NotFoundRow[];
};

function toRedirect(row: any): RedirectRow {
  return {
    id: row.id,
    sourcePath: row.source_path ?? "",
    targetPath: row.target_path ?? "",
    code: Number(row.code ?? 301),
    isActive: row.is_active !== false,
    hits: Number(row.hits ?? 0),
    lastHitAt: row.last_hit_at ?? null,
    note: row.note ?? "",
    updatedAt: row.updated_at ?? row.created_at ?? "",
  };
}

function toNotFound(row: any): NotFoundRow {
  return {
    id: row.id,
    path: row.path ?? "",
    referrer: row.referrer ?? "",
    hits: Number(row.hits ?? 1),
    lastSeenAt: row.last_seen_at ?? row.created_at ?? "",
  };
}

export async function loadSiteSeo(db: Client, merchantId: string): Promise<SiteSeoBundle> {
  const [merchant, settings, redirects, notFound] = await Promise.all([
    db.from("merchants").select("slug, name").eq("id", merchantId).maybeSingle(),
    loose(db)
      .from("merchant_settings")
      .select("seo_settings")
      .eq("merchant_id", merchantId)
      .maybeSingle(),
    loose(db)
      .from("url_redirects")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("updated_at", { ascending: false })
      .limit(300),
    loose(db)
      .from("seo_not_found_log")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("last_seen_at", { ascending: false })
      .limit(100),
  ]);

  return {
    settings: parseSiteSeo((settings as any)?.data?.seo_settings ?? DEFAULT_SITE_SEO),
    storeSlug: merchant.data?.slug ?? "",
    storeName: merchant.data?.name ?? "",
    redirects: (((redirects as any).data ?? []) as any[]).map(toRedirect),
    notFound: (((notFound as any).data ?? []) as any[]).map(toNotFound),
  };
}

export async function saveSiteSeo(
  db: Client,
  merchantId: string,
  input: unknown,
): Promise<SiteSeoSettings> {
  const settings = parseSiteSeo(input);
  const { error } = await loose(db)
    .from("merchant_settings")
    .upsert({ merchant_id: merchantId, seo_settings: settings }, { onConflict: "merchant_id" });
  if (error) throw new Error(error.message);
  return settings;
}

export async function upsertRedirect(
  db: Client,
  merchantId: string,
  input: {
    id?: string | null;
    sourcePath: string;
    targetPath: string;
    code: number;
    isActive: boolean;
    note?: string;
  },
): Promise<RedirectRow> {
  const issue = validateRedirect(input.sourcePath, input.targetPath);
  if (issue) throw new Error(`redirect.${issue}`);
  const row = {
    merchant_id: merchantId,
    source_path: normalisePath(input.sourcePath),
    target_path: /^https?:\/\//i.test(input.targetPath.trim())
      ? input.targetPath.trim()
      : normalisePath(input.targetPath),
    code: input.code,
    is_active: input.isActive,
    note: input.note?.slice(0, 200) ?? null,
  };
  const query = input.id
    ? loose(db)
        .from("url_redirects")
        .update(row)
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
        .select("*")
        .single()
    : loose(db)
        .from("url_redirects")
        .upsert(row, { onConflict: "merchant_id,source_path" })
        .select("*")
        .single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return toRedirect(data);
}

export async function deleteRedirect(db: Client, merchantId: string, id: string): Promise<void> {
  const { error } = await loose(db)
    .from("url_redirects")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
}

/** Turn a logged 404 into a redirect and drop it from the monitor. */
export async function redirectNotFound(
  db: Client,
  merchantId: string,
  input: { id: string; targetPath: string },
): Promise<RedirectRow> {
  const { data } = await loose(db)
    .from("seo_not_found_log")
    .select("path")
    .eq("id", input.id)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!data) throw new Error("notfound.missing");
  const redirect = await upsertRedirect(db, merchantId, {
    sourcePath: (data as any).path,
    targetPath: input.targetPath,
    code: 301,
    isActive: true,
    note: "From 404 monitor",
  });
  await loose(db)
    .from("seo_not_found_log")
    .delete()
    .eq("id", input.id)
    .eq("merchant_id", merchantId);
  return redirect;
}

export async function clearNotFound(
  db: Client,
  merchantId: string,
  id: string | null,
): Promise<void> {
  let q = loose(db).from("seo_not_found_log").delete().eq("merchant_id", merchantId);
  if (id) q = q.eq("id", id);
  const { error } = await q;
  if (error) throw new Error(error.message);
}
