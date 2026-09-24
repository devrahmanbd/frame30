/**
 * Phase 16 — media library, server half.
 *
 * `media_assets` is the source of truth for metadata; the bytes live in the
 * private `media` bucket and are read back through `/api/public/media/...` so
 * a stored URL never expires. Uploads are de-duplicated by filename and SVGs
 * are sanitised before a single byte is written.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isMediaObjectPath, mediaUrl } from "../media";
import {
  ACCEPTED_MIME,
  MEDIA_UPLOAD_MAX_BYTES,
  type Attachment,
  isAllowedMimeType,
  sanitiseSvg,
  titleFromFileName,
  uniqueFileName,
  validateMagicBytes,
} from "./library";
import { type RiskTier, resolvePolicy } from "../risk-tier";

type Db = SupabaseClient<Database>;

const BUCKET = "media";

const SELECT =
  "id, file_name, title, alt_text, caption, description, storage_path, url, content_type, size_bytes, width, height, sanitised, created_at";

export class MediaLibraryError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Row = {
  id: string;
  file_name: string;
  title: string | null;
  alt_text: string | null;
  caption: string | null;
  description: string | null;
  storage_path: string;
  url: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sanitised: boolean;
  created_at: string;
};

function toAttachment(row: any): Attachment {
  const fileName = row.file_name || "untitled";
  const storagePath = row.storage_path || "";
  return {
    id: row.id,
    fileName,
    title: row.title ?? titleFromFileName(fileName),
    altText: row.alt_text ?? "",
    caption: row.caption ?? "",
    description: row.description ?? "",
    storagePath,
    url: row.url?.startsWith("http") ? row.url : mediaUrl(storagePath),
    contentType: row.content_type || "application/octet-stream",
    sizeBytes: Number(row.size_bytes ?? 0),
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null,
    sanitised: Boolean(row.sanitised),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function listAttachments(
  db: Db,
  merchantId: string,
  limit = 400,
): Promise<Attachment[]> {
  try {
    let { data, error } = await db
      .from("media_assets")
      .select("*")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      const res = await db
        .from("media_assets")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      data = res.data;
      error = res.error;
    }
    if (error) {
      const res = await db
        .from("media_assets")
        .select("*")
        .eq("merchant_id", merchantId)
        .limit(limit);
      data = res.data;
      error = res.error;
    }
    if (error) throw new MediaLibraryError("list_failed", error.message);
    return ((data ?? []) as unknown as Row[]).map(toAttachment);
  } catch (e: any) {
    if (e instanceof MediaLibraryError) throw e;
    throw new MediaLibraryError(
      "list_failed",
      e?.message || "Failed to load media",
    );
  }
}

async function takenNames(db: Db, merchantId: string): Promise<string[]> {
  const { data } = await db
    .from("media_assets")
    .select("file_name")
    .eq("merchant_id", merchantId);
  return ((data ?? []) as { file_name: string }[]).map((row) => row.file_name);
}

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(",")
    ? input.slice(input.indexOf(",") + 1)
    : input;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export type UploadInput = {
  name: string;
  contentType: string;
  base64: string;
  width?: number | null;
  height?: number | null;
};

export async function uploadAttachment(
  db: Db,
  merchantId: string,
  input: UploadInput,
  riskTier: RiskTier = "low",
): Promise<Attachment> {
  const policy = resolvePolicy(riskTier);

  // Feature gate: high-risk merchants cannot upload at all
  if (!policy.features.uploads) {
    throw new MediaLibraryError(
      "uploads_disabled_by_risk_policy",
      "Uploads are disabled by your risk policy.",
    );
  }

  const mime = input.contentType.toLowerCase();

  // Tier-aware mime type check
  if (!isAllowedMimeType(mime, policy.upload.allowedMimeTypes)) {
    throw new MediaLibraryError(
      "mime_type_not_allowed_for_tier",
      `File type is not allowed for your risk tier.`,
    );
  }

  let bytes = decodeBase64(input.base64);
  if (bytes.length === 0) throw new MediaLibraryError("empty", "File is empty");

  // Tier-aware file size check
  if (bytes.length > policy.upload.maxFileSizeBytes) {
    throw new MediaLibraryError(
      "file_too_large_for_tier",
      `File exceeds the size limit for your risk tier.`,
    );
  }

  // Magic-bytes validation with tier-aware scanning strictness
  const magicCheck = validateMagicBytes(
    bytes,
    mime,
    policy.upload.scanningStrictness,
  );
  if (!magicCheck.ok) {
    throw new MediaLibraryError(magicCheck.reason, magicCheck.message);
  }

  /* An SVG can carry script. It is stored only after the active parts are
   * stripped, and the row records that we changed it so the UI can say so. */
  let sanitised = false;
  if (mime === "image/svg+xml") {
    const source = new TextDecoder().decode(bytes);
    const result = sanitiseSvg(source);
    sanitised = result.changed;
    bytes = new TextEncoder().encode(result.svg);
  }

  const { assertEntitlement, invalidateEntitlements } =
    await import("../entitlements.server");
  await assertEntitlement(db as never, merchantId, "media_bytes", bytes.length);
  invalidateEntitlements(merchantId);

  const fileName = uniqueFileName(input.name, await takenNames(db, merchantId));
  const path = `${merchantId}/${fileName}`;

  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
    cacheControl: "31536000",
  });
  if (up.error) throw new MediaLibraryError("upload_failed", up.error.message);

  const fullRow = {
    merchant_id: merchantId,
    file_name: fileName,
    title: titleFromFileName(fileName),
    storage_path: path,
    url: path,
    content_type: mime,
    size_bytes: bytes.length,
    width: input.width ?? null,
    height: input.height ?? null,
    sanitised,
  };
  let { data, error } = await db
    .from("media_assets")
    .insert(fullRow as never)
    .select("*")
    .single();
  if (error && error.message?.includes("column")) {
    const baselineRow = {
      merchant_id: merchantId,
      file_name: fileName,
      storage_path: path,
      url: path,
      content_type: mime,
      size_bytes: bytes.length,
    };
    const retry = await db
      .from("media_assets")
      .insert(baselineRow as never)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    // Never leave an orphan object behind when the row fails.
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    throw new MediaLibraryError("insert_failed", error.message);
  }
  return toAttachment(data as unknown as Row);
}

export type AttachmentPatch = {
  title?: string;
  altText?: string;
  caption?: string;
  description?: string;
  fileName?: string;
};

export async function updateAttachment(
  db: Db,
  merchantId: string,
  id: string,
  patch: AttachmentPatch,
): Promise<Attachment> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title.trim() || null;
  if (patch.altText !== undefined)
    update.alt_text = patch.altText.trim() || null;
  if (patch.caption !== undefined)
    update.caption = patch.caption.trim() || null;
  if (patch.description !== undefined)
    update.description = patch.description.trim() || null;
  if (patch.fileName !== undefined && patch.fileName.trim())
    update.file_name = patch.fileName.trim();

  const { data, error } = await db
    .from("media_assets")
    .update(update as never)
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .select("*")
    .maybeSingle();
  if (error) throw new MediaLibraryError("update_failed", error.message);
  if (!data)
    throw new MediaLibraryError("not_found", "That file no longer exists");
  return toAttachment(data as unknown as Row);
}

export async function deleteAttachments(
  db: Db,
  merchantId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await db
    .from("media_assets")
    .select("id, storage_path")
    .eq("merchant_id", merchantId)
    .in("id", ids);
  if (error) throw new MediaLibraryError("list_failed", error.message);
  const rows = (data ?? []) as { id: string; storage_path: string }[];
  if (rows.length === 0) return 0;

  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const safePaths = rows
    .map((row) => row.storage_path)
    .filter(
      (path) =>
        typeof path === "string" &&
        isMediaObjectPath(path) &&
        path.startsWith(`${merchantId}/`),
    );
  if (safePaths.length > 0) {
    await supabaseAdmin.storage.from(BUCKET).remove(safePaths);
  }

  const del = await db
    .from("media_assets")
    .delete()
    .eq("merchant_id", merchantId)
    .in(
      "id",
      rows.map((row) => row.id),
    );
  if (del.error)
    throw new MediaLibraryError("delete_failed", del.error.message);

  const { invalidateEntitlements } = await import("../entitlements.server");
  invalidateEntitlements(merchantId);
  return rows.length;
}
