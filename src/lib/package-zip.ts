/**
 * PKG-2 — minimal ZIP reader + security gate for theme/plugin packages.
 *
 * Pure module: no network, no database, no filesystem. Hand-rolled on
 * `node:zlib` (inflateRaw) + manual central-directory parsing — no ZIP
 * library exists in this repo and no new npm packages are allowed.
 *
 * Supported entries: stored (method 0) + deflated (method 8) only.
 * Everything else is rejected explicitly with a `zip.*` reason code:
 * encrypted, multi-disk/spanned, zip64, and unknown methods.
 *
 * Path handling: every central-directory name is validated before anything
 * is extracted — absolute paths, `..` segments, drive prefixes, backslashes,
 * null bytes, and empty segments are all `zip.unsafe_path`; symlinks
 * (unix file-type bits in external attributes) are `zip.symlink`.
 */

import { inflateRawSync } from "node:zlib";

export class PackageZipError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PackageZipError";
  }
}

/** Archive-level + per-entry caps. Tunable per call via {@link ZipLimits}. */
/* 32MB default: official Songoskriti ships ~25MB of imagery; review-gated
   uploads stay bounded while real theme packages pass. */
export const PKG_MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const PKG_MAX_FILES = 500;
export const PKG_MAX_ENTRY_BYTES = 5 * 1024 * 1024;
export const PKG_MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const PKG_MAX_MANIFEST_BYTES = 512 * 1024;

export type ZipLimits = {
  maxArchiveBytes?: number;
  maxFiles?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  maxManifestBytes?: number;
};

function limitsOf(over: ZipLimits = {}) {
  return {
    maxArchiveBytes: over.maxArchiveBytes ?? PKG_MAX_ARCHIVE_BYTES,
    maxFiles: over.maxFiles ?? PKG_MAX_FILES,
    maxEntryBytes: over.maxEntryBytes ?? PKG_MAX_ENTRY_BYTES,
    maxTotalBytes: over.maxTotalBytes ?? PKG_MAX_TOTAL_UNCOMPRESSED_BYTES,
    maxManifestBytes: over.maxManifestBytes ?? PKG_MAX_MANIFEST_BYTES,
  };
}

export type PackageKind = "theme" | "plugin";

export type ZipEntry = {
  /** Raw central-directory name (forward slashes). */
  name: string;
  method: 0 | 8;
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
  /** True for directory entries (trailing slash) — never extracted. */
  isDirectory: boolean;
};

export type PackageFile = {
  path: string;
  bytes: Uint8Array;
};

function fail(code: string, message: string): never {
  throw new PackageZipError(code, message);
}

/** Magic check only — full validation happens in {@link parseZip}. */
export function assertZipMagic(bytes: Uint8Array, maxArchiveBytes?: number): void {
  if (bytes.length === 0) fail("zip.malformed", "That file is empty.");
  if (
    maxArchiveBytes !== undefined &&
    bytes.length > maxArchiveBytes
  ) {
    fail(
      "zip.archive_too_large",
      `Package exceeds the ${Math.round(maxArchiveBytes / (1024 * 1024))} MB archive limit.`,
    );
  }
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));
  if (!isZip) fail("zip.malformed", "That file is not a valid zip archive.");
}

/**
 * Zip-slip suite: normalize-then-reject. Leading `./` segments are stripped
 * (common packager noise); anything else suspicious is refused, never
 * sanitised — callers must not guess where a hostile path "meant" to go.
 */
export function assertSafePackagePath(rawName: string): string {
  if (!rawName) fail("zip.unsafe_path", "Archive contains an empty entry name.");
  const name = rawName as string;
  if (name.includes("\0"))
    fail("zip.unsafe_path", "Archive entry contains a null byte.");
  if (name.includes("\\"))
    fail(
      "zip.unsafe_path",
      `Unsafe entry path (backslash): ${name.slice(0, 80)}`,
    );
  // Drive prefixes (`C:/x`, `C:x`) and UNC roots — before slash checks so
  // `C:evil` without a slash is still caught.
  if (/^[A-Za-z]:/.test(name))
    fail(
      "zip.unsafe_path",
      `Unsafe entry path (drive prefix): ${name.slice(0, 80)}`,
    );
  if (name.startsWith("/") || name.startsWith("~"))
    fail(
      "zip.unsafe_path",
      `Unsafe absolute entry path: ${name.slice(0, 80)}`,
    );
  const isDir = name.endsWith("/");
  const inner = isDir ? name.slice(0, -1) : name;
  // Strip harmless leading `./` segments, then judge what remains.
  const segments = inner.split("/");
  let i = 0;
  while (i < segments.length && segments[i] === ".") i += 1;
  const rest = segments.slice(i);
  if (rest.length === 0)
    fail("zip.unsafe_path", "Archive entry path resolves to nothing.");
  for (const seg of rest) {
    if (seg === "" || seg === "." || seg === "..") {
      fail(
        "zip.unsafe_path",
        `Unsafe entry path in package: ${name.slice(0, 80)}`,
      );
    }
  }
  return [...segments.slice(0, i), ...rest].join("/") + (isDir ? "/" : "");
}

const UNIX_FILE_TYPE_MASK = 0xf000;
const UNIX_SYMLINK = 0xa000;

/**
 * Parse the central directory: entry list + security posture. Extracts
 * nothing — use {@link extractEntry} / {@link extractPackageFiles} after the
 * layout gate passes.
 */
export function parseZip(bytes: Uint8Array, over?: ZipLimits): ZipEntry[] {
  const lim = limitsOf(over);
  assertZipMagic(bytes, lim.maxArchiveBytes);
  if (bytes.length < 22) fail("zip.malformed", "Archive is too small to be a zip file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 65557);
  for (let p = bytes.length - 22; p >= floor; p--) {
    if (view.getUint32(p, true) === 0x06054b50) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0)
    fail("zip.malformed", "End-of-central-directory record not found.");
  const diskNumber = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const entriesThisDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (
    diskNumber === 0xffff ||
    cdDisk === 0xffff ||
    entriesThisDisk === 0xffff ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    fail("zip.unsupported_feature", "Zip64 archives are not supported.");
  }
  if (diskNumber !== 0 || cdDisk !== 0 || entriesThisDisk !== totalEntries) {
    fail(
      "zip.spanned",
      "Multi-disk / spanned archives are not supported.",
    );
  }
  const count = totalEntries;
  if (count > lim.maxFiles) {
    fail(
      "zip.too_many_files",
      `Package lists ${count} entries (max ${lim.maxFiles}).`,
    );
  }
  if (centralOffset + centralSize > bytes.length)
    fail("zip.malformed", "Central directory runs past the end of the file.");

  const entries: ZipEntry[] = [];
  let off = centralOffset;
  let totalInflated = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > bytes.length)
      fail("zip.malformed", "Central directory entry is truncated.");
    if (view.getUint32(off, true) !== 0x02014b50)
      fail("zip.malformed", "Central directory entry signature mismatch.");
    const flags = view.getUint16(off + 8, true);
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const uncompSize = view.getUint32(off + 24, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const diskStart = view.getUint16(off + 34, true);
    const externalAttrs = view.getUint32(off + 38, true);
    const localHeaderOffset = view.getUint32(off + 42, true);
    if (off + 46 + nameLen > bytes.length)
      fail("zip.malformed", "Central directory entry name is truncated.");
    if (diskStart !== 0)
      fail("zip.spanned", "Multi-disk / spanned archives are not supported.");
    if ((flags & 0x1) !== 0)
      fail("zip.encrypted", "Encrypted entries are not supported.");
    if (compSize === 0xffffffff || uncompSize === 0xffffffff)
      fail("zip.unsupported_feature", "Zip64 entries are not supported.");
    const rawName = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(off + 46, off + 46 + nameLen),
    );
    const safeName = assertSafePackagePath(rawName);
    const isDirectory = safeName.endsWith("/");
    if (((externalAttrs >>> 16) & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK) {
      fail("zip.symlink", `Symlink entry refused: ${safeName.slice(0, 80)}`);
    }
    if (method !== 0 && method !== 8) {
      fail(
        "zip.unsupported_method",
        `Unsupported compression method ${method} on ${safeName.slice(0, 80)}.`,
      );
    }
    if (localHeaderOffset + 30 > bytes.length)
      fail("zip.malformed", "Local header offset runs past the end of the file.");
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50)
      fail("zip.malformed", "Local header signature mismatch.");
    if (!isDirectory) {
      if (uncompSize > lim.maxEntryBytes) {
        fail(
          "zip.entry_too_large",
          `Entry ${safeName.slice(0, 80)} exceeds the per-file limit.`,
        );
      }
      totalInflated += uncompSize;
      if (totalInflated > lim.maxTotalBytes) {
        fail(
          "zip.total_too_large",
          "Package inflates past the total size limit.",
        );
      }
    }
    entries.push({
      name: safeName,
      method: method as 0 | 8,
      compSize,
      uncompSize,
      localHeaderOffset,
      isDirectory,
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflate one non-directory entry. Caps apply to real output, not claims. */
export function extractEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  over?: ZipLimits,
): Uint8Array {
  const lim = limitsOf(over);
  if (entry.isDirectory) fail("zip.malformed", "Refusing to extract a directory.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = entry.localHeaderOffset;
  if (lh + 30 > bytes.length || view.getUint32(lh, true) !== 0x04034b50)
    fail("zip.malformed", "Local header is missing or corrupt.");
  if (view.getUint16(lh + 8, true) !== entry.method)
    fail("zip.malformed", "Local header disagrees with the directory.");
  const dataOff = lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true);
  if (dataOff + entry.compSize > bytes.length)
    fail("zip.malformed", "Entry data runs past the end of the file.");
  const raw = bytes.subarray(dataOff, dataOff + entry.compSize);
  let inflated: Uint8Array;
  try {
    inflated = entry.method === 8 ? inflateRawSync(raw) : raw.slice();
  } catch {
    fail("zip.malformed", `Entry could not be decompressed: ${entry.name.slice(0, 80)}`);
  }
  // `fail` never returns; the assignment below satisfies the type checker.
  inflated = inflated as Uint8Array;
  if (inflated.length > lim.maxEntryBytes) {
    fail(
      "zip.entry_too_large",
      `Entry ${entry.name.slice(0, 80)} exceeds the per-file limit.`,
    );
  }
  return inflated;
}

/** Extract every file entry, enforcing the running total on real output. */
export function extractPackageFiles(
  bytes: Uint8Array,
  entries: ZipEntry[],
  over?: ZipLimits,
): PackageFile[] {
  const lim = limitsOf(over);
  const out: PackageFile[] = [];
  let total = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const data = extractEntry(bytes, entry, over);
    total += data.length;
    if (total > lim.maxTotalBytes) {
      fail(
        "zip.total_too_large",
        "Package inflates past the total size limit.",
      );
    }
    out.push({ path: entry.name, bytes: data });
  }
  if (out.length > lim.maxFiles)
    fail("zip.too_many_files", `Package holds too many files.`);
  return out;
}

/* ------------------------------------------------------- layout + manifest */

const BLOCKED_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".exe", ".msi", ".com", ".scr", ".dll", ".so", ".dylib",
  ".sh", ".bash", ".bat", ".cmd", ".ps1", ".py", ".rb", ".php", ".pl",
  ".jar", ".war",
]);

const IMAGE_FONT_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

const ROOT_EXTRAS = new Set([
  "screenshot.png", "screenshot.jpg", "screenshot.jpeg", "screenshot.webp",
  "screenshot.gif", "readme.md", "license", "license.md", "license.txt",
]);

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot).toLowerCase();
}

export function manifestNameFor(kind: PackageKind): string {
  return kind === "theme" ? "theme.json" : "plugin.json";
}

export type ValidatedLayout = {
  manifest: Record<string, unknown>;
  manifestRaw: Uint8Array;
  files: PackageFile[];
};

/**
 * Package-area rules, shared by themes and plugins:
 * - `templates/` → `.json` only
 * - `styles/` → `.css` only
 * - `assets/` → images/fonts only
 * - `locales/` → `.json` only
 * - the manifest must sit at the archive root (`theme.json`/`plugin.json`);
 *   a nested copy does not count.
 * - blocked executables (`.js`/`.ts`/`.exe`/`.sh`/…) are refused anywhere.
 */
export function validatePackageLayout(
  files: PackageFile[],
  kind: PackageKind,
  over?: ZipLimits,
): ValidatedLayout {
  const lim = limitsOf(over);
  const manifestName = manifestNameFor(kind);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const manifestFile = byPath.get(manifestName);
  if (!manifestFile) {
    fail(
      "zip.missing_manifest",
      `Package must contain a root ${manifestName} manifest.`,
    );
  }
  const manifestBytes = (manifestFile as PackageFile).bytes;
  if (manifestBytes.length > lim.maxManifestBytes)
    fail("zip.manifest_too_large", "Package manifest exceeds the size limit.");
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    fail("zip.manifest_invalid", "Package manifest is not valid JSON.");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("zip.manifest_invalid", "Package manifest must be a JSON object.");
  }
  for (const file of files) {
    const p = file.path;
    if (p === manifestName) continue;
    const ext = extOf(p);
    if (BLOCKED_EXTS.has(ext)) {
      fail(
        "zip.blocked_extension",
        `Executable file type refused: ${p.slice(0, 80)}`,
      );
    }
    if (!p.includes("/")) {
      if (!ROOT_EXTRAS.has(p.toLowerCase())) {
        fail(
          "zip.disallowed_location",
          `Unexpected root file: ${p.slice(0, 80)}`,
        );
      }
      continue;
    }
    const [area, ...rest] = p.split("/");
    if (rest.length === 0 || rest.some((s) => s === "")) {
      fail("zip.disallowed_location", `Bad path: ${p.slice(0, 80)}`);
    }
    const ok =
      (area === "templates" && ext === ".json") ||
      (area === "styles" && ext === ".css") ||
      (area === "assets" && IMAGE_FONT_EXTS.has(ext)) ||
      (area === "locales" && ext === ".json");
    if (!ok) {
      fail(
        "zip.disallowed_location",
        `File outside its package area: ${p.slice(0, 80)}`,
      );
    }
  }
  return { manifest: manifest as Record<string, unknown>, manifestRaw: manifestBytes, files };
}

/**
 * Presentation references: template JSON string values that point at
 * `assets/...` must resolve to a file in the package. Returns the dangling
 * references (empty = clean). Locales/keys are validated by the PKG-1
 * manifest lane, not here.
 */
export function collectBrokenAssetRefs(files: PackageFile[]): string[] {
  const present = new Set(files.map((f) => f.path));
  const refs = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const v = value.trim().replace(/^\.\//, "");
      if (v.startsWith("assets/") && !v.includes("\0")) refs.add(v);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) visit(item);
    }
  };
  for (const file of files) {
    if (!file.path.startsWith("templates/")) continue;
    try {
      visit(JSON.parse(new TextDecoder().decode(file.bytes)));
    } catch {
      // Malformed template JSON is the manifest lane's problem; refs from
      // unparseable files are simply not collected here.
    }
  }
  return [...refs].filter((r) => !present.has(r)).sort();
}
