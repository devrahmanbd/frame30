/**
 * Phase 17 — theme assets, server layer.
 *
 * Writes are tenant-scoped through `is_merchant_member` RLS; the storefront
 * read goes through the public client and the tenant cache so a shopper pays
 * one query per store, not one per page view.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "@/lib/cache.server";
import { assertTenantId } from "@/lib/tenant-scope";
import {
  MAX_ASSET_NAME,
  cleanAssetName,
  combineThemeCss,
  sanitiseThemeCss,
  sortAssets,
  validateCss,
  validateTokens,
  type ThemeAsset,
  type ThemeAssetKind,
} from "./assets";

type Client = SupabaseClient<Database>;
// The generated types do not know Phase 17 tables until the next codegen pass.
const loose = (db: Client) => db as unknown as SupabaseClient<any>;

export class ThemeAssetError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThemeAssetError";
  }
}

const SELECT = "id, theme_id, kind, name, content, url, bytes, enabled, updated_at";

type Row = {
  id: string;
  theme_id: string | null;
  kind: ThemeAssetKind;
  name: string;
  content: string | null;
  url: string | null;
  bytes: number;
  enabled: boolean;
  updated_at: string;
};

function toAsset(row: Row): ThemeAsset {
  return {
    id: row.id,
    themeId: row.theme_id,
    kind: row.kind,
    name: row.name,
    content: row.content,
    url: row.url,
    bytes: Number(row.bytes ?? 0),
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  };
}

const cacheKey = (merchantId: string) => `theme-assets|${merchantId}`;

export async function listThemeAssets(db: Client, merchantId: string): Promise<ThemeAsset[]> {
  assertTenantId(merchantId, "listThemeAssets");
  const { data, error } = await loose(db)
    .from("theme_assets")
    .select(SELECT)
    .eq("merchant_id", merchantId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new ThemeAssetError("read_failed", error.message);
  return sortAssets(((data ?? []) as Row[]).map(toAsset));
}

export type SaveAssetInput = {
  id?: string | null;
  themeId?: string | null;
  kind: ThemeAssetKind;
  name: string;
  content?: string | null;
  url?: string | null;
  enabled?: boolean;
};

export async function saveThemeAsset(
  db: Client,
  merchantId: string,
  input: SaveAssetInput,
): Promise<ThemeAsset> {
  assertTenantId(merchantId, "saveThemeAsset");
  const name = cleanAssetName(input.name).slice(0, MAX_ASSET_NAME);
  let content = input.content ?? null;

  if (input.kind === "css") {
    const clean = sanitiseThemeCss(content ?? "");
    const invalid = validateCss(clean.css);
    if (invalid) throw new ThemeAssetError(invalid, "That stylesheet could not be saved.");
    content = clean.css;
  }
  if (input.kind === "tokens") {
    const invalid = validateTokens(content ?? "");
    if (invalid) throw new ThemeAssetError(invalid, "Those tokens are not valid JSON.");
  }
  if ((input.kind === "image" || input.kind === "font") && !input.url)
    throw new ThemeAssetError("asset.url_required", "Upload the file before saving it.");

  const row = {
    merchant_id: merchantId,
    theme_id: input.themeId ?? null,
    kind: input.kind,
    name,
    content,
    url: input.url ?? null,
    bytes: content ? new TextEncoder().encode(content).length : 0,
    enabled: input.enabled ?? true,
  };

  const query = input.id
    ? loose(db)
        .from("theme_assets")
        .update(row)
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
        .select(SELECT)
        .maybeSingle()
    : loose(db).from("theme_assets").insert(row).select(SELECT).maybeSingle();

  const { data, error } = await query;
  if (error) throw new ThemeAssetError("write_failed", error.message);
  if (!data) throw new ThemeAssetError("not_found", "That asset no longer exists.");
  invalidate(cacheKey(merchantId));
  return toAsset(data as Row);
}

export async function deleteThemeAsset(db: Client, merchantId: string, id: string) {
  assertTenantId(merchantId, "deleteThemeAsset");
  const { error } = await loose(db)
    .from("theme_assets")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId);
  if (error) throw new ThemeAssetError("delete_failed", error.message);
  invalidate(cacheKey(merchantId));
  return { ok: true };
}

export async function toggleThemeAsset(
  db: Client,
  merchantId: string,
  id: string,
  enabled: boolean,
) {
  assertTenantId(merchantId, "toggleThemeAsset");
  const { error } = await loose(db)
    .from("theme_assets")
    .update({ enabled })
    .eq("id", id)
    .eq("merchant_id", merchantId);
  if (error) throw new ThemeAssetError("write_failed", error.message);
  invalidate(cacheKey(merchantId));
  return { ok: true };
}

/**
 * Storefront read: the one stylesheet to inject for `themeId`, already
 * sanitised and cached per tenant. Returns "" when the store has no assets.
 */
export async function storefrontThemeCss(
  merchantId: string,
  themeId: string | null,
): Promise<string> {
  assertTenantId(merchantId, "storefrontThemeCss");
  const { publicClient } = await import("@/lib/pricing.server");
  const assets = await cached(cacheKey(merchantId), 120, async () => {
    const { data } = await loose(publicClient() as unknown as Client)
      .from("theme_assets")
      .select(SELECT)
      .eq("merchant_id", merchantId)
      .eq("enabled", true)
      .limit(200);
    return ((data ?? []) as Row[]).map(toAsset);
  });
  return combineThemeCss(assets, themeId);
}
