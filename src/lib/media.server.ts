/**
 * Phase 3.3 — media library storage, server half.
 *
 * The bucket is private; objects are read back through the public media route
 * so a stored prop URL stays valid forever (a signed URL would expire inside a
 * published theme).
 */
import {
  MEDIA_MAX_BYTES,
  isAcceptedMime,
  isMediaObjectPath,
  mediaUrl,
  safeFileName,
  type MediaItem,
} from "./media";

const BUCKET = "media";

export class MediaError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function listMedia(merchantId: string, limit = 60): Promise<MediaItem[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(merchantId, {
    limit,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw new MediaError("list_failed", error.message);
  const items = (data ?? [])
    .filter((entry) => entry.name && !entry.name.startsWith("."))
    .map((entry) => {
      const path = `${merchantId}/${entry.name}`;
      const meta = (entry.metadata ?? {}) as { size?: number };
      return {
        path,
        url: mediaUrl(path),
        name: entry.name,
        size: typeof meta.size === "number" ? meta.size : 0,
        updatedAt: entry.updated_at ?? entry.created_at ?? "",
      } satisfies MediaItem;
    });

  /* The bucket knows bytes; the catalogue row knows what the image *is*. Alt
   * text and intrinsic size live in `media_assets`, so a merchant writes the
   * alt once and every placement inherits it. A missing catalogue row is
   * normal for a legacy upload and must not break the picker. */
  if (!items.length) return items;
  const { data: assets } = await (supabaseAdmin as never as LooseDb)
    .from("media_assets")
    .select("storage_path, alt_text, width, height")
    .eq("merchant_id", merchantId)
    .in(
      "storage_path",
      items.map((item) => item.path),
    );
  if (!assets?.length) return items;
  const byPath = new Map(assets.map((row) => [row.storage_path, row]));
  return items.map((item) => {
    const asset = byPath.get(item.path);
    return asset
      ? { ...item, altText: asset.alt_text ?? null, width: asset.width ?? null, height: asset.height ?? null }
      : item;
  });
}

type LooseDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        in: (
          col: string,
          values: string[],
        ) => Promise<{
          data:
            | Array<{ storage_path: string; alt_text: string | null; width: number | null; height: number | null }>
            | null;
        }>;
      };
    };
  };
};


export async function uploadMedia(
  merchantId: string,
  fileName: string,
  contentType: string,
  base64: string,
  db?: unknown,
): Promise<MediaItem> {
  if (!isAcceptedMime(contentType)) throw new MediaError("bad_type", "Unsupported file type");
  const bytes = decodeBase64(base64);
  if (bytes.length === 0) throw new MediaError("empty", "File is empty");
  if (bytes.length > MEDIA_MAX_BYTES) throw new MediaError("too_large", "File is larger than 5 MB");

  /* Storage quota is charged in bytes, so the cap is checked with the *actual*
   * decoded size — not the client-declared length, which is trivially lied
   * about. The check runs before the upload so we never have to delete an
   * object we just accepted. */
  if (db) {
    const { assertEntitlement, invalidateEntitlements } = await import("./entitlements.server");
    await assertEntitlement(db as never, merchantId, "media_bytes", bytes.length);
    invalidateEntitlements(merchantId);
  }

  const path = `${merchantId}/${safeFileName(fileName, contentType)}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (up.error) throw new MediaError("upload_failed", up.error.message);

  return {
    path,
    url: mediaUrl(path),
    name: path.slice(merchantId.length + 1),
    size: bytes.length,
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteMedia(merchantId: string, path: string): Promise<void> {
  if (!isMediaObjectPath(path) || !path.startsWith(`${merchantId}/`)) {
    throw new MediaError("forbidden", "Not your file");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) throw new MediaError("delete_failed", error.message);
}

/** Streams one object for the public media route. Path is validated first. */
export async function readMedia(path: string) {
  if (!isMediaObjectPath(path)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
