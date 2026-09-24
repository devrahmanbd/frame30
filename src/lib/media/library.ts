/**
 * Phase 16 — media library, pure half.
 *
 * Everything here is deterministic so the library screen, the picker modal and
 * the server share one definition of "what an attachment is", how it is
 * filtered, grouped and named. No Supabase, no DOM.
 */

export type MediaKind =
  "image" | "vector" | "video" | "audio" | "document" | "other";

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

export type UploadCheck =
  { ok: true } | { ok: false; reason: string; message: string };

export function validateUpload(
  file: { name: string; type: string; size: number },
  maxBytes = MEDIA_UPLOAD_MAX_BYTES,
): UploadCheck {
  if (!file.name.trim())
    return { ok: false, reason: "no_name", message: "File has no name." };
  if (!ACCEPTED_MIME.includes(file.type.toLowerCase())) {
    return {
      ok: false,
      reason: "bad_type",
      message: `${file.type || "This file type"} is not allowed.`,
    };
  }
  if (file.size <= 0)
    return { ok: false, reason: "empty", message: "File is empty." };
  if (file.size > maxBytes) {
    return {
      ok: false,
      reason: "too_large",
      message: `File is larger than ${formatBytes(maxBytes)}.`,
    };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- naming */

export function slugFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "";
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
const SVG_BAD_TAGS =
  /<\s*(script|foreignObject|iframe|object|embed|link|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const SVG_BAD_SELF = /<\s*(script|iframe|object|embed|link|use)\b[^>]*\/?>/gi;
const SVG_BAD_HREF =
  /\s+(?:xlink:)?href\s*=\s*("|')\s*(?!#)(?:javascript:|data:)[^"']*\1/gi;
const SVG_ENTITIES = /<!(?:DOCTYPE|ENTITY)[^>]*>/gi;
const SVG_CDATA = /<!\[CDATA\[[\s\S]*?\]\]>/gi;
const SVG_HANDLER = /<\s*handler\b[^>]*>[\s\S]*?<\s*\/\s*handler\s*>/gi;
const SVG_ANIMATE_SCRIPT =
  /<\s*(animate|set|animateTransform)\b[^>]*(?:values|to)\s*=\s*["'][^"']*(?:javascript|expression|url\()[^"']*["']/gi;
const SVG_IMAGE_SCRIPT =
  /<\s*image\b[^>]*(?:href|xlink:href)\s*=\s*["']\s*data:[^"']*(?:javascript|text\/html)[^"']*["']/gi;
const SVG_BASE64_SCRIPT = /data:[^"']*;base64,[A-Za-z0-9+/=]{20,}/gi;

export type SvgSanitiseResult = { svg: string; changed: boolean };

/**
 * Strips the parts of an SVG that can execute: scripts, event handlers,
 * external references, entity declarations, CDATA sections, and animate/set
 * elements with script payloads. The result is still an SVG, so a sanitised
 * logo keeps rendering; anything active is simply gone.
 */
export function sanitiseSvg(input: string): SvgSanitiseResult {
  const before = input;
  let svg = input
    .replace(SVG_ENTITIES, "")
    .replace(SVG_CDATA, "")
    .replace(SVG_HANDLER, "")
    .replace(SVG_BAD_TAGS, "")
    .replace(SVG_BAD_SELF, "")
    .replace(SVG_ANIMATE_SCRIPT, "")
    .replace(SVG_IMAGE_SCRIPT, "")
    .replace(SVG_EVENT_ATTR, "")
    .replace(SVG_BAD_HREF, "");
  // Strip any remaining data: URIs that look like encoded scripts
  svg = svg.replace(SVG_BASE64_SCRIPT, (match) => {
    // Only block data URIs that could contain scripts (text/html, text/javascript)
    if (
      /data:(?:text\/html|text\/javascript|application\/javascript)/i.test(
        match,
      )
    ) {
      return "";
    }
    return match;
  });
  svg = svg.replace(/\s{2,}/g, " ").trim();
  return { svg, changed: svg !== before.trim() };
}

export function isSvgSafe(input: string): boolean {
  return !sanitiseSvg(input).changed;
}

/* --------------------------------------------------------- magic bytes */

export type ScanningStrictness =
  "standard" | "enhanced" | "strict" | "forensic";

export type MagicBytesCheck =
  { ok: true } | { ok: false; reason: string; message: string };

/**
 * Validates that file content matches the declared MIME type by checking magic
 * bytes (file signatures). Catches MIME-type spoofing where a malicious file
 * is uploaded with a harmless-looking extension and content-type.
 *
 * `strictness` controls how aggressively we reject:
 *   - standard: basic magic-byte checks
 *   - enhanced: also validates file size header hints
 *   - strict: reject any mime not in the explicit allowlist
 *   - forensic: block everything (uploads disabled)
 */
export function validateMagicBytes(
  bytes: Uint8Array,
  contentType: string,
  strictness: ScanningStrictness = "standard",
): MagicBytesCheck {
  if (strictness === "forensic") {
    return {
      ok: false,
      reason: "uploads_disabled",
      message: "Uploads are disabled by risk policy.",
    };
  }

  const mime = contentType.toLowerCase();
  if (bytes.length === 0)
    return { ok: false, reason: "empty", message: "File is empty." };

  const header = bytes.slice(0, 12);
  const hex = Array.from(header)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

  // JPEG: FF D8 FF
  if (mime === "image/jpeg") {
    if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a JPEG image.",
      };
    }
    return { ok: true };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (mime === "image/png") {
    if (
      header[0] !== 0x89 ||
      header[1] !== 0x50 ||
      header[2] !== 0x4e ||
      header[3] !== 0x47 ||
      header[4] !== 0x0d ||
      header[5] !== 0x0a ||
      header[6] !== 0x1a ||
      header[7] !== 0x0a
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a PNG image.",
      };
    }
    return { ok: true };
  }

  // GIF: 47 49 46 38 (GIF87a or GIF89a)
  if (mime === "image/gif") {
    if (
      header[0] !== 0x47 ||
      header[1] !== 0x49 ||
      header[2] !== 0x46 ||
      header[3] !== 0x38
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a GIF image.",
      };
    }
    return { ok: true };
  }

  // WebP: starts with RIFF....WEBP
  if (mime === "image/webp") {
    if (
      header[0] !== 0x52 ||
      header[1] !== 0x49 ||
      header[2] !== 0x46 ||
      header[3] !== 0x46 ||
      header[8] !== 0x57 ||
      header[9] !== 0x45 ||
      header[10] !== 0x42 ||
      header[11] !== 0x50
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a WebP image.",
      };
    }
    return { ok: true };
  }

  // AVIF/HEIF: starts with ....ftyp (ftyp box at offset 4)
  if (mime === "image/avif") {
    if (
      header[4] !== 0x66 ||
      header[5] !== 0x74 ||
      header[6] !== 0x79 ||
      header[7] !== 0x70
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like an AVIF image.",
      };
    }
    // Check for avif or mif1 brand
    const brand = String.fromCharCode(
      header[8],
      header[9],
      header[10],
      header[11],
    );
    if (brand !== "avif" && brand !== "mif1") {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like an AVIF image.",
      };
    }
    if (strictness === "enhanced" || strictness === "strict") {
      const declaredSize =
        (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3];
      if (declaredSize > 0 && declaredSize > bytes.length * 2) {
        return {
          ok: false,
          reason: "size_header_mismatch",
          message:
            "Container file size header does not match actual file size.",
        };
      }
    }
    return { ok: true };
  }

  // PDF: 25 50 44 46 (%PDF)
  if (mime === "application/pdf") {
    if (
      header[0] !== 0x25 ||
      header[1] !== 0x50 ||
      header[2] !== 0x44 ||
      header[3] !== 0x46
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a PDF document.",
      };
    }
    return { ok: true };
  }

  // MP4/MOV: starts with ....ftyp (ftyp box at offset 4)
  if (mime === "video/mp4") {
    if (
      header[4] !== 0x66 ||
      header[5] !== 0x74 ||
      header[6] !== 0x79 ||
      header[7] !== 0x70
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like an MP4 video.",
      };
    }
    if (strictness === "enhanced" || strictness === "strict") {
      const declaredSize =
        (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3];
      if (declaredSize > 0 && declaredSize > bytes.length * 2) {
        return {
          ok: false,
          reason: "size_header_mismatch",
          message:
            "Container file size header does not match actual file size.",
        };
      }
    }
    return { ok: true };
  }

  // WebM: starts with 1A 45 DF A3 (EBML header)
  if (mime === "video/webm") {
    if (
      header[0] !== 0x1a ||
      header[1] !== 0x45 ||
      header[2] !== 0xdf ||
      header[3] !== 0xa3
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a WebM video.",
      };
    }
    if (strictness === "enhanced" || strictness === "strict") {
      if (header.length >= 5 && header[4] === 0x00) {
        return {
          ok: false,
          reason: "ebml_header_invalid",
          message: "WebM EBML header size is zero.",
        };
      }
    }
    return { ok: true };
  }

  // OGG: starts with 4F 67 67 53 (OggS)
  if (mime === "audio/ogg") {
    if (
      header[0] !== 0x4f ||
      header[1] !== 0x67 ||
      header[2] !== 0x67 ||
      header[3] !== 0x53
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like an OGG audio file.",
      };
    }
    return { ok: true };
  }

  // WAV: starts with RIFF....WAVE
  if (mime === "audio/wav") {
    if (
      header[0] !== 0x52 ||
      header[1] !== 0x49 ||
      header[2] !== 0x46 ||
      header[3] !== 0x46 ||
      header[8] !== 0x57 ||
      header[9] !== 0x41 ||
      header[10] !== 0x56 ||
      header[11] !== 0x45
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like a WAV audio file.",
      };
    }
    return { ok: true };
  }

  // MP3: starts with ID3 (tag) or FF FB / FF F3 (sync word)
  if (mime === "audio/mpeg") {
    const hasId3 =
      header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
    const hasSync =
      header[0] === 0xff && (header[1] === 0xfb || header[1] === 0xf3);
    if (!hasId3 && !hasSync) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like an MP3 audio file.",
      };
    }
    return { ok: true };
  }

  // SVG: text-based, starts with <?xml or <svg (allow BOM)
  if (mime === "image/svg+xml") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.slice(0, 512),
    );
    const trimmed = text.replace(/^\uFEFF/, "").trim();
    if (
      !trimmed.startsWith("<?xml") &&
      !trimmed.toLowerCase().startsWith("<svg")
    ) {
      return {
        ok: false,
        reason: "magic_mismatch",
        message: "File does not look like an SVG image.",
      };
    }
    return { ok: true };
  }

  // Text-based formats: CSV, plain text, DOCX (ZIP-based), DOC (OLE-based)
  // These are harder to validate by magic bytes alone; accept if MIME is in allowlist
  if (
    mime === "text/plain" ||
    mime === "text/csv" ||
    mime === "application/msword" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { ok: true };
  }

  // Unknown MIME — pass through (the allowlist already gates what's accepted)

  // strict mode: reject any MIME not in a known explicit allowlist
  if (strictness === "strict") {
    const KNOWN_MIMES = new Set([
      ...IMAGE_MIME,
      ...VECTOR_MIME,
      ...VIDEO_MIME,
      ...AUDIO_MIME,
      ...DOC_MIME,
    ]);
    if (!(KNOWN_MIMES as Set<string>).has(mime)) {
      return {
        ok: false,
        reason: "mime_not_allowed",
        message: "File type is not in the allowed list for strict scanning.",
      };
    }
  }

  return { ok: true };
}

/** Check if a MIME type matches an allowlist that may contain wildcards. */
export function isAllowedMimeType(
  mimeType: string,
  allowed: string[],
): boolean {
  const mime = mimeType.toLowerCase();
  for (const pattern of allowed) {
    if (pattern === mime) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      if (mime.startsWith(`${prefix}/`)) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------- filtering */

export type MediaTypeFilter = "all" | MediaKind | "missing-alt";
export type MediaView = "grid" | "list";

export type MediaSortKey =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc";

export type MediaFilters = {
  query: string;
  type: MediaTypeFilter;
  /** `YYYY-MM`, or "all". */
  month: string;
};

export const EMPTY_FILTERS: MediaFilters = {
  query: "",
  type: "all",
  month: "all",
};

export function sortAttachments(
  items: readonly Attachment[],
  sortKey: MediaSortKey = "date-desc",
): Attachment[] {
  const sorted = [...items];
  switch (sortKey) {
    case "date-asc":
      return sorted.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    case "name-asc":
      return sorted.sort((a, b) =>
        (a.title || a.fileName).localeCompare(b.title || b.fileName),
      );
    case "name-desc":
      return sorted.sort((a, b) =>
        (b.title || b.fileName).localeCompare(a.title || a.fileName),
      );
    case "size-desc":
      return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
    case "size-asc":
      return sorted.sort((a, b) => a.sizeBytes - b.sizeBytes);
    case "date-desc":
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
}

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

export function monthOptions(
  items: readonly Attachment[],
): { key: string; label: string }[] {
  const keys = new Set<string>();
  for (const item of items) {
    const key = monthKey(item.createdAt);
    if (key.length === 7) keys.add(key);
  }
  return Array.from(keys)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: monthLabel(key) }));
}

export function typeCounts(
  items: readonly Attachment[],
): Record<MediaTypeFilter, number> {
  const counts: Record<MediaTypeFilter, number> = {
    all: items.length,
    image: 0,
    vector: 0,
    video: 0,
    audio: 0,
    document: 0,
    other: 0,
    "missing-alt": 0,
  };
  for (const item of items) {
    counts[mediaKind(item.contentType)] += 1;
    if (needsAltText(item)) counts["missing-alt"] += 1;
  }
  return counts;
}

export function searchAttachments(
  items: readonly Attachment[],
  query: string,
): Attachment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) =>
    [item.fileName, item.title, item.altText, item.caption, item.description]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function filterAttachments(
  items: readonly Attachment[],
  filters: MediaFilters,
): Attachment[] {
  return searchAttachments(items, filters.query).filter((item) => {
    if (filters.type === "missing-alt") {
      if (!needsAltText(item)) return false;
    } else if (
      filters.type !== "all" &&
      mediaKind(item.contentType) !== filters.type
    ) {
      return false;
    }
    if (filters.month !== "all" && monthKey(item.createdAt) !== filters.month)
      return false;
    return true;
  });
}

export function filtersActive(filters: MediaFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.type !== "all" ||
    filters.month !== "all"
  );
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

export function dimensionLabel(
  item: Pick<Attachment, "width" | "height">,
): string | null {
  return item.width && item.height ? `${item.width} × ${item.height}` : null;
}

export function uploadedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Alt text is required for images; anything else may legitimately omit it. */
export function needsAltText(item: Attachment): boolean {
  return mediaKind(item.contentType) === "image" && item.altText.trim() === "";
}

export function missingAltCount(items: readonly Attachment[]): number {
  return items.reduce((total, item) => total + (needsAltText(item) ? 1 : 0), 0);
}

/* --------------------------------------------------------------- selection */

export function toggleSelected(
  selected: readonly string[],
  id: string,
): string[] {
  return selected.includes(id)
    ? selected.filter((value) => value !== id)
    : [...selected, id];
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

export type ExternalUrlCheck =
  { ok: true; url: string } | { ok: false; message: string };

export function checkExternalUrl(raw: string): ExternalUrlCheck {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Enter an image address." };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: "That does not look like a web address." };
  }
  if (parsed.protocol !== "https:")
    return { ok: false, message: "Only https addresses are allowed." };
  return { ok: true, url: parsed.toString() };
}
