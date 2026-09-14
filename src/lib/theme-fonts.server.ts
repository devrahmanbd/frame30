/**
 * Phase 3 — custom font storage, server half.
 *
 * The `theme-fonts` bucket is private; faces are read back through the
 * same-origin `/api/public/font/*` route so a published theme's `@font-face`
 * URL never expires and the CSP stays `font-src 'self'`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  FONT_BUDGET,
  fontStoragePath,
  isFontObjectPath,
  validateFontUpload,
  type FontAsset,
  type FontScript,
} from "./theme-fonts";

const BUCKET = "theme-fonts";

type Client = SupabaseClient<Database>;

export class FontError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Row = {
  id: string;
  family: string;
  weight: number;
  subset: string;
  storage_path: string;
  bytes: number;
  licence_confirmed_at: string | null;
};

function toAsset(row: Row): FontAsset {
  return {
    id: row.id,
    family: row.family,
    weight: row.weight,
    subset: (row.subset === "bengali" ? "bengali" : "latin") as FontScript,
    storagePath: row.storage_path,
    bytes: row.bytes,
    licenceConfirmedAt: row.licence_confirmed_at,
  };
}

const COLUMNS = "id, family, weight, subset, storage_path, bytes, licence_confirmed_at";

export async function listFontAssets(db: Client, merchantId: string): Promise<FontAsset[]> {
  const { data, error } = await db
    .from("font_assets")
    .select(COLUMNS)
    .eq("merchant_id", merchantId)
    .order("family", { ascending: true })
    .order("weight", { ascending: true });
  if (error) throw new FontError("list_failed", error.message);
  return (data ?? []).map((row) => toAsset(row as Row));
}

export async function uploadFontAsset(
  db: Client,
  merchantId: string,
  input: { family: string; weight: number; subset: FontScript; base64: string },
): Promise<FontAsset> {
  const bytes = decodeBase64(input.base64);
  const existing = await listFontAssets(db, merchantId);
  const check = validateFontUpload({
    bytes,
    family: input.family,
    weight: input.weight,
    existingFilesForFamily: existing.filter((a) => a.family === input.family).length,
  });
  if (!check.ok) throw new FontError(check.code, check.message);

  const path = fontStoragePath(merchantId, input.family, input.weight);
  if (!isFontObjectPath(path)) throw new FontError("bad_path", "Invalid font path");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "font/woff2",
    upsert: true,
    cacheControl: "31536000",
  });
  if (up.error) throw new FontError("upload_failed", up.error.message);

  // A re-upload resets the attestation: new bytes, new licence question.
  const { data, error } = await db
    .from("font_assets")
    .upsert(
      {
        merchant_id: merchantId,
        family: input.family,
        weight: input.weight,
        subset: input.subset,
        storage_path: path,
        bytes: bytes.length,
        licence_confirmed_at: null,
      },
      { onConflict: "merchant_id,family,weight" },
    )
    .select(COLUMNS)
    .single();
  if (error || !data) throw new FontError("save_failed", error?.message ?? "Could not save font");
  return toAsset(data as Row);
}

/** Licence attestation — required before the theme can be published. */
export async function confirmFontLicence(
  db: Client,
  merchantId: string,
  input: { id: string; note?: string },
): Promise<FontAsset> {
  const { data, error } = await db
    .from("font_assets")
    .update({ licence_confirmed_at: new Date().toISOString(), licence_note: input.note ?? null })
    .eq("id", input.id)
    .eq("merchant_id", merchantId)
    .select(COLUMNS)
    .single();
  if (error || !data) throw new FontError("confirm_failed", error?.message ?? "Font not found");
  return toAsset(data as Row);
}

export async function deleteFontAsset(db: Client, merchantId: string, id: string): Promise<void> {
  const { data, error } = await db
    .from("font_assets")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .select("storage_path")
    .maybeSingle();
  if (error) throw new FontError("delete_failed", error.message);
  const path = (data as { storage_path?: string } | null)?.storage_path;
  if (!path || !isFontObjectPath(path)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from(BUCKET).remove([path]);
}

/** Streams one face for the public font route. Path is validated first. */
export async function readFontObject(path: string) {
  if (!isFontObjectPath(path)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const binary = atob(clean);
  if (binary.length > FONT_BUDGET.maxFileBytes * 2) throw new FontError("too_large", "File is too large");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
