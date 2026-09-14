/**
 * Phase 16 — media library, pure half.
 *
 * Everything here is deterministic so the library screen, the picker modal and
 * the server share one definition of "what an attachment is", how it is
 * filtered, grouped and named. No Supabase, no DOM.
 */

export type MediaKind = "image" | "vector" | "video" | "audio" | "document" | "other";

export type Attachment = {
  id: string;
  fileName: string;
  title: string;
  altText: string;
  caption: string;
  description: string;
  storagePath: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  sanitised: boolean;
  createdAt: string;
};

/* ------------------------------------------------------------------ types */

export const IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const VECTOR_MIME = ["image/svg+xml"] as const;
export const VIDEO_MIME = ["video/mp4", "video/webm"] as const;
export const AUDIO_MIME = ["audio/mpeg", "audio/ogg", "audio/wav"] as const;
export const DOC_MIME = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ACCEPTED_MIME: readonly string[] = [
  ...IMAGE_MIME,
  ...VECTOR_MIME,
  ...VIDEO_MIME,
  ...AUDIO_MIME,
  ...DOC_MIME,
];

export const MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export function mediaKind(contentType: string): MediaKind {
  const mime = contentType.toLowerCase();
  if ((VECTOR_MIME as readonly string[]).includes(mime)) return "vector";
  if ((IMAGE_MIME as readonly string[]).includes(mime)) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if ((DOC_MIME as readonly string[]).includes(mime)) return "document";
  return "other";
}

/** Only raster images and (sanitised) vectors are safe to render as a thumb. */
export function isPreviewable(contentType: string): boolean {
  const kind = mediaKind(contentType);
  return kind === "image" || kind === "vector";
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export type UploadCheck = { ok: true } | { ok: false; reason: string; message: string };

export function validateUpload(
  file: { name: string; type: string; size: number },
  maxBytes = MEDIA_UPLOAD_MAX_BYTES,
): UploadCheck {
  if (!file.name.trim()) return { ok: false, reason: "no_name", message: "File has no name." };
  if (!ACCEPTED_MIME.includes(file.type.toLowerCase())) {
    return { ok: false, reason: "bad_type", message: `${file.type || "This file type"} is not allowed.` };
  }
  if (file.size <= 0) return { ok: false, reason: "empty", message: "File is empty." };
  if (file.size > maxBytes) {
    return { ok: false, reason: "too_large", message: `File is larger than ${formatBytes(maxBytes)}.` };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- naming */

export function slugFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file";
  return ext ? `${clean}.${ext}` : clean;
}

/**
 * WordPress behaviour: a second `logo.png` becomes `logo-1.png`, a third
 * `logo-2.png`. `taken` holds names already present in the merchant folder.
 */
export function uniqueFileName(name: string, taken: Iterable<string>): string {
  const slug = slugFileName(name);
  const set = new Set(Array.from(taken, (n) => n.toLowerCase()));
  if (!set.has(slug)) return slug;
  const dot = slug.lastIndexOf(".");
  const base = dot > 0 ? slug.slice(0, dot) : slug;
  const ext = dot > 0 ? slug.slice(dot) : "";
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base}-${i}${ext}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}${ext}`;
}

/** The title WordPress derives from a filename when the user gives none. */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const words = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Untitled";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* -------------------------------------------------------------- svg guard */

const SVG_EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SVG_BAD_TAGS = /<\s*(script|foreignObject|iframe|object|embed|link|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const SVG_BAD_SELF = /<\s*(script|iframe|object|embed|link|use)\b[^>]*\/?>/gi;
const SVG_BAD_HREF = /\s+(?:xlink:)?href\s*=\s*("|')\s*(?!#)(?:javascript:|data:)[^"']*\1/gi;
const SVG_ENTITIES = /<!(?:DOCTYPE|ENTITY)[^>]*>/gi;

export type SvgSanitiseResult = { svg: string; changed: boolean };

/**
 * Strips the parts of an SVG that can execute: scripts, event handlers,
 * external references and entity declarations. The result is still an SVG, so
 * a sanitised logo keeps rendering; anything active is simply gone.
 */
export function sanitiseSvg(input: string): SvgSanitiseResult {
  const before = input;
  let svg = input
    .replace(SVG_ENTITIES, "")
    .replace(SVG_BAD_TAGS, "")
    .replace(SVG_BAD_SELF, "")
    .replace(SVG_EVENT_ATTR, "")
    .replace(SVG_BAD_HREF, "");
  svg = svg.replace(/\s{2,}/g, " ").trim();
  return { svg, changed: svg !== before.trim() };
}

export function isSvgSafe(input: string): boolean {
  return !sanitiseSvg(input).changed;
}

/* -------------------------------------------------------------- filtering */

export type MediaTypeFilter = "all" | MediaKind;
export type MediaView = "grid" | "list";

export type MediaFilters = {
  query: string;
  type: MediaTypeFilter;
  /** `YYYY-MM`, or "all". */
  month: string;
};

export const EMPTY_FILTERS: MediaFilters = { query: "", type: "all", month: "all" };

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  if (!year || Number.isNaN(index) || !MONTH_NAMES[index]) return key;
  return `${MONTH_NAMES[index]} ${year}`;
}

export function monthOptions(items: readonly Attachment[]): { key: string; label: string }[] {
  const keys = new Set<string>();
  for (const item of items) {
    const key = monthKey(item.createdAt);
    if (key.length === 7) keys.add(key);
  }
  return Array.from(keys)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));
}

export function typeCounts(items: readonly Attachment[]): Record<MediaTypeFilter, number> {
  const counts: Record<MediaTypeFilter, number> = {
    all: items.length,
    image: 0,
    vector: 0,
    video: 0,
    audio: 0,
    document: 0,
    other: 0,
  };
  for (const item of items) counts[mediaKind(item.contentType)] += 1;
  return counts;
}

export function searchAttachments(items: readonly Attachment[], query: string): Attachment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) =>
    [item.fileName, item.title, item.altText, item.caption, item.description]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function filterAttachments(items: readonly Attachment[], filters: MediaFilters): Attachment[] {
  return searchAttachments(items, filters.query).filter((item) => {
    if (filters.type !== "all" && mediaKind(item.contentType) !== filters.type) return false;
    if (filters.month !== "all" && monthKey(item.createdAt) !== filters.month) return false;
    return true;
  });
}

export function filtersActive(filters: MediaFilters): boolean {
  return filters.query.trim() !== "" || filters.type !== "all" || filters.month !== "all";
}

/* ------------------------------------------------------------- formatting */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

export function dimensionLabel(item: Pick<Attachment, "width" | "height">): string | null {
  return item.width && item.height ? `${item.width} × ${item.height}` : null;
}

export function uploadedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Alt text is required for images; anything else may legitimately omit it. */
export function needsAltText(item: Attachment): boolean {
  return mediaKind(item.contentType) === "image" && item.altText.trim() === "";
}

export function missingAltCount(items: readonly Attachment[]): number {
  return items.reduce((total, item) => total + (needsAltText(item) ? 1 : 0), 0);
}

/* --------------------------------------------------------------- selection */

export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

export function selectRange(
  ordered: readonly Attachment[],
  anchorId: string | null,
  targetId: string,
  selected: readonly string[],
): string[] {
  if (!anchorId) return toggleSelected(selected, targetId);
  const from = ordered.findIndex((item) => item.id === anchorId);
  const to = ordered.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return toggleSelected(selected, targetId);
  const [start, end] = from <= to ? [from, to] : [to, from];
  const ids = ordered.slice(start, end + 1).map((item) => item.id);
  return Array.from(new Set([...selected, ...ids]));
}

export function neighbourAttachment(
  items: readonly Attachment[],
  currentId: string,
  step: 1 | -1,
): Attachment | null {
  const index = items.findIndex((item) => item.id === currentId);
  if (index < 0) return null;
  return items[index + step] ?? null;
}

/* ------------------------------------------------------------ URL helpers */

export function absoluteMediaUrl(origin: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

export type ExternalUrlCheck = { ok: true; url: string } | { ok: false; message: string };

export function checkExternalUrl(raw: string): ExternalUrlCheck {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Enter an image address." };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: "That does not look like a web address." };
  }
  if (parsed.protocol !== "https:") return { ok: false, message: "Only https addresses are allowed." };
  return { ok: true, url: parsed.toString() };
}
