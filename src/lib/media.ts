/**
 * Phase 3.3 — media props, pure half.
 *
 * An image prop stores a plain URL string. Two sibling props travel with it:
 * `${key}_alt` (bilingual alt text) and `${key}_sizes` (a layout preset), so
 * the AST shape, autosave, versioning and the sanitiser stay unchanged.
 */
import { isAllowedSource } from "./image-transform";

export type SizesPreset = "full" | "half" | "third" | "thumb";

export const SIZES_PRESETS: SizesPreset[] = ["full", "half", "third", "thumb"];

/**
 * `sizes` tells the browser how wide the image renders, so it can pick the
 * right entry from the srcset ladder. These four cover every builder layout.
 */
const SIZES_ATTR: Record<SizesPreset, string> = {
  full: "100vw",
  half: "(max-width: 768px) 100vw, 50vw",
  third: "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw",
  thumb: "(max-width: 768px) 33vw, 160px",
};

export const SIZES_LABEL: Record<SizesPreset, { en: string; bn: string }> = {
  full: { en: "Full width", bn: "পূর্ণ প্রস্থ" },
  half: { en: "Half", bn: "অর্ধেক" },
  third: { en: "Third", bn: "এক-তৃতীয়াংশ" },
  thumb: { en: "Thumbnail", bn: "থাম্বনেইল" },
};

export function sizesAttr(preset: string | null | undefined): string {
  const key = (preset ?? "full") as SizesPreset;
  return SIZES_ATTR[key] ?? SIZES_ATTR.full;
}

export function altKey(key: string): string {
  return `${key}_alt`;
}

export function sizesKey(key: string): string {
  return `${key}_sizes`;
}

/** Stable, same-origin URL for an object in the merchant media bucket. */
export const MEDIA_URL_PREFIX = "/api/public/media/";

export function mediaUrl(path: string): string {
  return `${MEDIA_URL_PREFIX}${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function isMediaUrl(url: string): boolean {
  return url.startsWith(MEDIA_URL_PREFIX);
}

/** `<merchant-uuid>/<file>` and nothing else — no traversal, no nesting. */
const OBJECT_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function isMediaObjectPath(path: string): boolean {
  return OBJECT_PATH.test(path) && !path.includes("..");
}

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export const MEDIA_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function isAcceptedMime(mime: string): boolean {
  // SVG can carry script; it is uploadable but never inlined, only served
  // with a download-safe content type by the media route.
  return Object.prototype.hasOwnProperty.call(MEDIA_MIME, mime);
}

/** Collapses a user file name to something safe to use as an object key. */
export function safeFileName(name: string, mime: string): string {
  const ext = MEDIA_MIME[mime] ?? "bin";
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const stamp = Date.now().toString(36);
  return `${base || "image"}-${stamp}.${ext}`;
}

export type MediaUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * A merchant may point a widget at their own uploaded object, or at an
 * https URL on the transform allow-list. Everything else is refused here so a
 * bad value never reaches the storefront.
 */
export function validateMediaUrl(raw: string, allowedHosts: readonly string[] = []): MediaUrlCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "empty" };
  if (isMediaUrl(value)) {
    const path = decodeURIComponent(value.slice(MEDIA_URL_PREFIX.length));
    return isMediaObjectPath(path) ? { ok: true, url: value } : { ok: false, reason: "bad_path" };
  }
  if (!allowedHosts.length) return { ok: false, reason: "host_not_allowed" };
  const guard = isAllowedSource(value, allowedHosts);
  return guard.ok ? { ok: true, url: value } : { ok: false, reason: guard.reason };
}

/**
 * A library object. `altText`, `width` and `height` come from the
 * `media_assets` row when one exists: the alt a merchant wrote once should
 * follow the image everywhere it is placed, and the intrinsic size lets a
 * storefront image reserve its space instead of shifting the page.
 */
export type MediaItem = {
  path: string;
  url: string;
  name: string;
  size: number;
  updatedAt: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

