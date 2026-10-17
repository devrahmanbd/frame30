/**
 * Level B (reviewed developer themes) — executable-bundle validator.
 *
 * PURE module: no database, no network, no filesystem. It validates a
 * developer-theme *bundle* (the executable artifact a reviewed theme ships:
 * `dev.theme.json` + js/css/map/font/image files), hashes every file, and
 * mints the release fingerprint the moderator workflow binds approvals to.
 *
 * Lane separation (deliberate):
 * - This is a DISTINCT artifact type from data-only theme packages
 *   (`src/lib/theme-package.ts`, root `theme.json`, executable-free). The two
 *   validators refuse each other's inputs: this module rejects data-only
 *   manifests/files with `bundle.wrong_lane`, and the data-only gate's
 *   required fields (key/api/templates/…) already refuse a Level B shape
 *   (pinned by `dev-theme-bundle.test.ts`, reverse-direction vector — the
 *   frozen gate is NOT modified).
 * - The executable allowlist below EXTENDS the data-only lane's
 *   executable-extension rejection pattern (`theme-package.ts`
 *   `EXECUTABLE_ASSET_EXTS`, `package-zip.ts` `BLOCKED_EXTS`) by inversion:
 *   data-only denies js/ts/exe/sh everywhere because nothing executes;
 *   Level B admits js/mjs/cjs + css + map + font/image ONLY, and denies
 *   everything else — including server areas, secrets files, shell, and
 *   non-allowlisted network hosts (§7 of the SDK contract: no server code,
 *   no secrets, no raw network imports in v1).
 * - Zip-slip / symlink / oversize limits MIRROR `package-zip.ts`
 *   (`PKG_MAX_*`, `assertSafePackagePath`) by small intentional DUPLICATION,
 *   not import: importing that module would couple the executable lane to
 *   the data-only layout/kind rules (`validatePackageLayout` theme/plugin
 *   areas). Values stay identical so bomb protection is the same; the
 *   duplication is documented here, not hidden.
 * - Secret content reuses the repo scanner READ-ONLY (`scanSecrets` from
 *   `custom-code.ts`, the same reuse `package-scan.ts` performs), so Tier-0
 *   (credential-theft) detection cannot drift between lanes.
 *
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` (§7 non-goals
 * enforced here; lifecycle in `dev-theme-review.ts`).
 */

import { createHash } from "node:crypto";
import { scanSecrets } from "./custom-code";
import {
  DEV_THEME_MAX_MANIFEST_BYTES,
  parseDevThemeManifest,
  type DevThemeManifest,
} from "./dev-theme-manifest";

/* ------------------------------------------------------------- limits ---
 * Mirrors of package-zip.ts PKG_MAX_* (see header: duplicated on purpose
 * for lane decoupling — same values, same bomb protection).
 */
export const DEV_THEME_BUNDLE_LIMITS = {
  maxFiles: 500,
  maxEntryBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  /** Manifest cap follows the Level B contract (§1: 64KB), not the 512KB
   * data-only manifest cap — a dev.theme.json is never that large. */
  maxManifestBytes: DEV_THEME_MAX_MANIFEST_BYTES,
} as const;

/** Root manifest filename. Never `theme.json` — that name is the data-only
 * lane's marker, and its presence in a bundle is a wrong-lane refusal. */
export const DEV_THEME_MANIFEST_NAME = "dev.theme.json";
const DATA_ONLY_MANIFEST_NAME = "theme.json";

/**
 * Executable allowlist: js/css/map/font/image/data ONLY. This extends the
 * data-only lane's executable-extension rejection by inversion (see header):
 * server code (.ts/.php/.py/.rb), shells (.sh/.ps1), and binaries
 * (.exe/.dll/.so) are refused at the extension gate before any content
 * check runs.
 */
const BUNDLE_ALLOWED_EXTS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".map",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
]);

/** Package areas. Anything else at any depth is refused — server code has
 * no area to hide in (`server/`, `api/`, `functions/`, `handlers/`,
 * `node_modules/`, … all land on `bundle.disallowed_location`). */
const BUNDLE_AREAS = new Set([
  "components",
  "sections",
  "styles",
  "assets",
  "locales",
]);

/** Per-area extension rules (`.json` lives in `locales/` + the root
 * manifest only; maps ride with code/styles, never as standalone areas). */
function areaAllowsExt(area: string, ext: string): boolean {
  switch (area) {
    case "components":
    case "sections":
      return (
        ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".map"
      );
    case "styles":
      return ext === ".css" || ext === ".map";
    case "assets":
      return (
        ext === ".png" ||
        ext === ".jpg" ||
        ext === ".jpeg" ||
        ext === ".gif" ||
        ext === ".webp" ||
        ext === ".avif" ||
        ext === ".svg" ||
        ext === ".ico" ||
        ext === ".woff" ||
        ext === ".woff2" ||
        ext === ".ttf" ||
        ext === ".otf" ||
        ext === ".eot"
      );
    case "locales":
      return ext === ".json";
    default:
      return false;
  }
}

/** Root-level extras mirrored from the data-only lane's ROOT_EXTRAS. */
const ROOT_EXTRAS = new Set([
  "readme.md",
  "license",
  "license.md",
  "license.txt",
]);

/**
 * Secrets-file names. Fail-closed on basename match: a reviewed lane must
 * never ship a credential file, and renaming is cheap for the author.
 */
const SECRETS_FILE_RE =
  /(^\.env(\..*)?$)|(\.pem$)|(\.key$)|(secret)|(credential)/i;

/** Shell/shebang probe (extension gate already refuses `.sh`). */
const SHEBANG_RE = /^#!/;

/**
 * Server-code markers for shipped JS. Client component code never needs
 * node builtins, listeners, `process.env`, or dynamic-code construction
 * (`eval` / `new Function` — the same pair the data-only lane's
 * EXECUTABLE_RE bans from free text).
 */
const SERVER_CODE_RES: Array<{ re: RegExp; tag: string }> = [
  { re: /child_process/, tag: "child_process" }, // sast-allow: shell-exec -- validator denylist pattern as data: bans server imports in bundles, never executed here
  { re: /\bcreateServer\s*\(/, tag: "createServer" },
  { re: /\.listen\s*\(/, tag: "listen" },
  { re: /process\.env\b/, tag: "process.env" },
  { re: /process\.(exit|argv|cwd|chdir)\b/, tag: "process" },
  {
    re: /\brequire\s*\(\s*["'](fs|net|http|https|child_process|cluster|dgram|dns|os|vm|worker_threads)\b/, // sast-allow: shell-exec -- validator denylist pattern as data, never executed here
    tag: "node-require",
  },
  {
    re: /\bfrom\s+["'](fs|net|child_process|node:(fs|net|child_process|http))\b/, // sast-allow: shell-exec -- validator denylist pattern as data, never executed here
    tag: "node-import",
  },
  { re: /\beval\s*\(/, tag: "eval" },
  { re: /new\s+Function\s*\(/, tag: "new-Function" },
];

/** Active SVG markup: scripts and inline handlers never ship in assets. */
const SVG_ACTIVE_RE = /<\s*script\b|on[a-z]+\s*=/i;

/**
 * Integrity shape, mirrored from `dev-theme-manifest.ts` INTEGRITY_RE (not
 * exported there; duplicated rather than reached for — same shape check the
 * manifest gate runs, applied to bundler-declared entries).
 */
const INTEGRITY_RE = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

export type DevThemeBundleFile = {
  path: string;
  bytes: Uint8Array;
  /**
   * Packager-provided symlink marker (archive mode bits). The bundle input
   * is not a zip — the ingest layer sets this from the archive — and any
   * marked entry is refused, mirroring the `zip.symlink` gate.
   */
  symlink?: boolean;
};

export type DevThemeBundleDependency = {
  name: string;
  version: string;
  license: string;
  integrity: string;
};

export type DevThemeBundleInput = {
  /** Claimed manifest (object). Must match the embedded dev.theme.json. */
  manifest: unknown;
  files: DevThemeBundleFile[];
  /** Bundler-resolved dependency entries. Must equal the manifest pins. */
  dependencies?: DevThemeBundleDependency[];
  /** Hosts the bundle may fetch at runtime. Default: none (v1 contract:
   * no raw network imports; dependencies resolve from the pinned registry). */
  allowedNetworkHosts?: string[];
};

export type DevThemeHashedFile = {
  path: string;
  sha256: string;
  bytes: number;
};

export type DevThemeBundleVerdict =
  | {
      ok: true;
      manifest: DevThemeManifest;
      files: DevThemeHashedFile[];
      fingerprint: string;
      warnings: [];
    }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Data-only shape probe for the wrong-lane refusal. Detects the PKG-1
 * manifest markers (`key` + `api`, `presentationSurfaces`, `assetManifest`)
 * that never appear in a Level B manifest.
 */
function looksLikeDataOnlyManifest(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if ("presentationSurfaces" in value || "assetManifest" in value) return true;
  return "key" in value && "api" in value;
}

/** Extension of the basename, lowercase with dot (`extOf` in package-zip.ts). */
function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot).toLowerCase();
}

/**
 * Zip-slip mirror of `assertSafePackagePath` (see header for why it is
 * duplicated): normalize-then-reject, never sanitise.
 */
function assertSafeBundlePath(rawName: string): string {
  const fail = (message: string): never => {
    throw new Error(`bundle.unsafe_path:${message}`);
  };
  if (!rawName) fail("empty entry name");
  if (rawName.includes("\0")) fail("null byte");
  if (rawName.includes("\\")) fail(`backslash ${rawName.slice(0, 80)}`);
  if (/^[A-Za-z]:/.test(rawName)) fail(`drive prefix ${rawName.slice(0, 80)}`);
  if (rawName.startsWith("/") || rawName.startsWith("~")) {
    fail(`absolute path ${rawName.slice(0, 80)}`);
  }
  const segments = rawName.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === ".." || seg === "__MACOSX") {
      fail(rawName.slice(0, 80));
    }
  }
  return rawName;
}

function decodeTextStrict(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  }
}

/** Canonical JSON (sorted keys, recursive) for equality + fingerprinting. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Release fingerprint: sha256 over the lane tag + the canonical (parsed)
 * manifest + the sorted `path:hash` file list. ANY code, dependency, or
 * capability change alters the manifest or a file hash, so every change
 * mints a new fingerprint — and approvals bind to it, never to a row id.
 */
export function fingerprintDevThemeRelease(
  manifest: DevThemeManifest,
  files: DevThemeHashedFile[],
): string {
  const canon = stableStringify({
    id: manifest.id,
    version: manifest.version,
    runtime: manifest.runtime,
    name: manifest.name,
    publisher: manifest.publisher,
    capabilities: manifest.capabilities,
    dependencies: manifest.dependencies,
    sections: manifest.sections,
    settings: manifest.settings,
  });
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}:${f.sha256}`);
  return createHash("sha256")
    .update(["dev-theme-bundle/v1", canon, ...lines].join("\n"))
    .digest("hex");
}

/** Collect `http(s)://host` + `ws(s)://host` literals from JS text. */
function jsNetworkHosts(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:https?|wss?):\/\/([A-Za-z0-9.-]+)(?::\d+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) out.add(match[1].toLowerCase());
  return [...out];
}

/** Collect remote hosts from CSS `url(http…)` / `@import "http…"`. */
function cssNetworkHosts(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /url\(\s*['"]?(https?:\/\/[^'")\s]+)/gi,
    /@import\s+['"](https?:\/\/[^'"]+)/gi,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const host = /https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?/i.exec(match[1]);
      if (host) out.add(host[1].toLowerCase());
    }
  }
  return [...out];
}

/**
 * Asset-manifest completeness (additive — every other gate above is
 * untouched): every RELATIVE reference in shipped JS/CSS must resolve to a
 * bundled file, or the bundle refuses. Bare specifiers (`gsap`, `three`,
 * `gsap/ScrollTrigger`) are registry pins, never files, so they are
 * ignored — only `./` + `../` refs are file authority. Absolute `/…`,
 * `http(s):`, `data:`, `blob:`, and `#` refs are not bundle files and are
 * ignored here (remote http hosts are still gated by the network allowlist
 * above). Resolution is posix-relative to the importing file; the result
 * must equal a bundled path exactly (authors write explicit extensions).
 */
function jsLocalRefs(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import|export)\s+(?:[^'"]*?from\s+)?['"](\.[^'"]*)['"]|import\s*\(\s*['"](\.[^'"]*)['"]\s*\)|require\s*\(\s*['"](\.[^'"]*)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const ref = match[1] ?? match[2] ?? match[3];
    if (ref) out.push(ref);
  }
  return out;
}

function cssLocalRefs(text: string): string[] {
  const out: string[] = [];
  const urlRe = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    const ref = match[1]!.trim();
    if (!ref) continue;
    if (/^(https?:|data:|blob:|#)/i.test(ref)) continue;
    if (!ref.startsWith(".")) continue;
    out.push(ref.split("#")[0]!.split("?")[0]!);
  }
  const importRe = /@import\s+['"]([^'"]+)['"]/gi;
  while ((match = importRe.exec(text)) !== null) {
    const ref = match[1]!.trim();
    if (!ref) continue;
    if (/^(https?:|data:|blob:)/i.test(ref)) continue;
    if (!ref.startsWith(".")) continue;
    out.push(ref.split("#")[0]!.split("?")[0]!);
  }
  return out;
}

function resolveBundleRef(importer: string, ref: string): string | null {
  const dir = importer.includes("/")
    ? importer.slice(0, importer.lastIndexOf("/"))
    : "";
  const parts = (dir ? `${dir}/${ref}` : ref).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const resolved = stack.join("/");
  if (!resolved || resolved.startsWith(".") || resolved.includes("..")) {
    return null;
  }
  return resolved;
}

/**
 * `dir/name.<sha8>.ext` → true when a present `dir/name.ext` hashes to
 * `<sha8>` (the emit stage's content-addressed rename), else false. A stale
 * or fabricated hash still fails: that ref would 404 after the rename.
 */
function isContentAddressedMatch(
  resolved: string | null,
  bytesByPath: Map<string, Uint8Array>,
): boolean {
  if (resolved === null) return false;
  const slash = resolved.lastIndexOf("/");
  const dir = slash === -1 ? "" : resolved.slice(0, slash);
  const base = slash === -1 ? resolved : resolved.slice(slash + 1);
  const m = /^(.*)\.([0-9a-f]{8})(\.[^./]+)$/.exec(base);
  if (!m) return false;
  const candidate = dir === "" ? `${m[1]}${m[3]}` : `${dir}/${m[1]}${m[3]}`;
  const sourceBytes = bytesByPath.get(candidate);
  if (sourceBytes === undefined) return false;
  return hashBytes(sourceBytes).slice(0, 8) === m[2];
}

function checkAssetCompleteness(
  content: DevThemeBundleFile[],
  errors: string[],
): void {
  const present = new Set(content.map((f) => f.path));
  const bytesByPath = new Map(content.map((f) => [f.path, f.bytes]));
  const textByPath = new Map<string, string>();
  for (const file of content) {
    const ext = extOf(file.path);
    const isCode = ext === ".js" || ext === ".mjs" || ext === ".cjs";
    const isCss = ext === ".css";
    if (!isCode && !isCss) continue;
    const text = decodeTextStrict(file.bytes);
    if (text === null) continue;
    textByPath.set(file.path, text);
  }
  for (const [path, text] of textByPath) {
    const ext = extOf(path);
    const refs = ext === ".css" ? cssLocalRefs(text) : jsLocalRefs(text);
    for (const ref of refs) {
      // Extensionless relative imports (`./commerce`) are bundler aliases
      // resolved at build time, not file authority — only explicit file refs
      // (`./shared.js`, `../assets/logo.png`) must be present. This keeps the
      // historical fixture mapping (TS sources with extensionless imports
      // mapped to hashed outputs) green while still refusing dangling file
      // URLs that would 404 at serve time.
      const base = ref.slice(ref.lastIndexOf("/") + 1);
      if (!base.includes(".")) continue;
      const resolved = resolveBundleRef(path, ref);
      if (resolved === null || !present.has(resolved)) {
        // Authors may reference the emit stage's output name verbatim
        // (`dir/name.<sha8>.ext`, matching `hashedOutputPath`): accepted
        // exactly when a present source hashes to that segment, since then
        // the ref names a file the shipped shape is guaranteed to contain.
        if (isContentAddressedMatch(resolved, bytesByPath)) continue;
        errors.push(
          `bundle.asset_missing:${path.slice(0, 60)}:${ref.slice(0, 60)}`,
        );
      }
    }
  }
}

function checkDependencies(
  manifest: DevThemeManifest,
  entries: unknown,
  errors: string[],
): void {
  // Dependency confusion backstops (additive — the pin-equality below is
  // untouched): names must be registry-shaped (lowercase npm shape, no
  // scopes tricks, no paths, no URLs — `GSAP` vs `gsap` or `gsap fh` never
  // resolve to the pinned bytes), and versions must be exact pins (ranges
  // like `^3.0.0`, `*`, or `latest` would let a hostile newer tarball ride
  // an old approval — the vendor stage hashes exact bytes, so the pin is
  // exact here too).
  const DEP_NAME_RE = /^(?:@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/;
  const EXACT_VERSION_RE =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  // Manifest pins are checked here (additive — the manifest gate checks
  // presence/shape only, this gate checks registry shape + exact pin so a
  // confused or ranged pin never reaches an approval).
  for (const pin of manifest.dependencies) {
    if (!DEP_NAME_RE.test(pin.name)) {
      errors.push(`bundle.dependency_name:${pin.name.slice(0, 80)}`);
    }
    if (!EXACT_VERSION_RE.test(pin.version)) {
      errors.push(`bundle.dependency_version:${pin.name.slice(0, 80)}`);
    }
  }
  if (entries === undefined) {
    if (manifest.dependencies.length > 0) {
      for (const dep of manifest.dependencies) {
        errors.push(`bundle.dependency_missing:${dep.name}`);
      }
    }
    return;
  }
  if (!Array.isArray(entries)) {
    errors.push("bundle.dependencies_invalid");
    return;
  }
  const byName = new Map<string, DevThemeBundleDependency>();
  entries.forEach((raw, i) => {
    if (!isRecord(raw)) {
      errors.push(`bundle.dependency_invalid:${i}`);
      return;
    }
    const { name, version, license, integrity } = raw as Record<
      string,
      unknown
    >;
    if (
      typeof name !== "string" ||
      typeof version !== "string" ||
      typeof license !== "string" ||
      typeof integrity !== "string" ||
      !name.trim() ||
      !version.trim() ||
      !license.trim() ||
      !integrity.trim()
    ) {
      errors.push(`bundle.dependency_invalid:${i}`);
      return;
    }
    if (!INTEGRITY_RE.test(integrity)) {
      errors.push(`bundle.dependency_integrity:${name.trim()}`);
      return;
    }
    if (!DEP_NAME_RE.test(name.trim())) {
      errors.push(`bundle.dependency_name:${name.trim().slice(0, 80)}`);
      return;
    }
    if (!EXACT_VERSION_RE.test(version.trim())) {
      errors.push(`bundle.dependency_version:${name.trim().slice(0, 80)}`);
      return;
    }
    byName.set(name.trim(), {
      name: name.trim(),
      version: version.trim(),
      license: license.trim(),
      integrity,
    });
  });
  // Bidirectional pin match: every bundle entry equals a manifest pin, and
  // every manifest pin has a bundle entry. Drift in EITHER direction fails.
  for (const [name, entry] of byName) {
    const pin = manifest.dependencies.find((d) => d.name === name);
    if (!pin) {
      errors.push(`bundle.dependency_extra:${name}`);
      continue;
    }
    if (
      pin.version !== entry.version ||
      pin.license !== entry.license ||
      pin.integrity !== entry.integrity
    ) {
      errors.push(`bundle.dependency_mismatch:${name}`);
    }
  }
  for (const pin of manifest.dependencies) {
    if (!byName.has(pin.name)) {
      errors.push(`bundle.dependency_missing:${pin.name}`);
    }
  }
}

/** The single gate the Level B bundle pipeline runs before any write. */
export function validateDevThemeBundle(
  input: DevThemeBundleInput,
): DevThemeBundleVerdict {
  const errors: string[] = [];
  const files = input.files ?? [];

  // --- lane separation first: wrong-lane inputs get the wrong-lane code,
  // never a confusing manifest-shape error. ---
  if (looksLikeDataOnlyManifest(input.manifest)) {
    return {
      ok: false,
      errors: ["bundle.wrong_lane:data-only-theme-manifest"],
    };
  }
  if (files.some((f) => f.path === DATA_ONLY_MANIFEST_NAME)) {
    return { ok: false, errors: ["bundle.wrong_lane:data-only-theme.json"] };
  }

  // --- manifest shape (Level B contract §1, via the manifest gate). ---
  const parsed = parseDevThemeManifest(input.manifest);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map((e) => `bundle.manifest:${e}`),
    };
  }
  const manifest = parsed.manifest;

  // --- archive posture: count + traversal + symlink + duplicates. ---
  if (files.length > DEV_THEME_BUNDLE_LIMITS.maxFiles) {
    return {
      ok: false,
      errors: [
        `bundle.too_many_files:${files.length} exceeds ${DEV_THEME_BUNDLE_LIMITS.maxFiles}`,
      ],
    };
  }
  const seen = new Set<string>();
  const safe: DevThemeBundleFile[] = [];
  for (const file of files) {
    try {
      assertSafeBundlePath(file.path);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "bundle.unsafe_path");
      continue;
    }
    if (file.symlink === true) {
      errors.push(`bundle.symlink:${file.path.slice(0, 80)}`);
      continue;
    }
    if (seen.has(file.path)) {
      errors.push(`bundle.duplicate_entry:${file.path.slice(0, 80)}`);
      continue;
    }
    seen.add(file.path);
    safe.push(file);
  }

  // --- dotfiles: packager noise is skipped like the data-only lane, but a
  // secrets-shaped dotfile (.env) is refused, never skipped. ---
  const content = safe.filter((f) => {
    const base = f.path.slice(f.path.lastIndexOf("/") + 1);
    if (!base.startsWith(".")) return true;
    if (SECRETS_FILE_RE.test(base)) {
      errors.push(`bundle.secrets_file:${f.path.slice(0, 80)}`);
    }
    return false;
  });

  // --- the embedded manifest must exist and agree with the claim: the
  // fingerprint covers the claimed manifest, so shipped bytes that differ
  // would publish under a false identity. ---
  const embedded = content.find((f) => f.path === DEV_THEME_MANIFEST_NAME);
  if (!embedded) {
    errors.push(
      `bundle.missing_manifest:root ${DEV_THEME_MANIFEST_NAME} required`,
    );
  } else {
    if (embedded.bytes.length > DEV_THEME_BUNDLE_LIMITS.maxManifestBytes) {
      errors.push("bundle.manifest_too_large");
    }
    try {
      const embeddedJson = JSON.parse(new TextDecoder().decode(embedded.bytes));
      if (stableStringify(embeddedJson) !== stableStringify(input.manifest)) {
        errors.push("bundle.manifest_mismatch:embedded dev.theme.json differs");
      }
    } catch {
      errors.push(
        "bundle.manifest_invalid:embedded dev.theme.json is not JSON",
      );
    }
  }

  // --- oversize (mirrors PKG_MAX_* posture: per-entry + running total). ---
  let total = 0;
  for (const file of content) {
    if (file.bytes.length > DEV_THEME_BUNDLE_LIMITS.maxEntryBytes) {
      errors.push(`bundle.entry_too_large:${file.path.slice(0, 80)}`);
      continue;
    }
    total += file.bytes.length;
  }
  if (total > DEV_THEME_BUNDLE_LIMITS.maxTotalBytes) {
    errors.push("bundle.total_too_large");
  }

  // --- extension allowlist + area rules + filename secrets screen. ---
  const allowedHosts = new Set(
    (input.allowedNetworkHosts ?? []).map((h) => h.toLowerCase()),
  );
  for (const file of content) {
    const p = file.path;
    const base = p.slice(p.lastIndexOf("/") + 1);
    if (SECRETS_FILE_RE.test(base) && p !== DEV_THEME_MANIFEST_NAME) {
      errors.push(`bundle.secrets_file:${p.slice(0, 80)}`);
      continue;
    }
    const ext = extOf(p);
    if (!BUNDLE_ALLOWED_EXTS.has(ext)) {
      errors.push(`bundle.blocked_extension:${p.slice(0, 80)}`);
      continue;
    }
    if (!p.includes("/")) {
      if (p !== DEV_THEME_MANIFEST_NAME && !ROOT_EXTRAS.has(p.toLowerCase())) {
        errors.push(`bundle.disallowed_location:${p.slice(0, 80)}`);
      }
      continue;
    }
    const [area] = p.split("/");
    if (!BUNDLE_AREAS.has(area) || !areaAllowsExt(area, ext)) {
      errors.push(`bundle.disallowed_location:${p.slice(0, 80)}`);
      continue;
    }
  }

  // --- content gates over decoded text (binaries skip: decode fails). ---
  for (const file of content) {
    const ext = extOf(file.path);
    const isCode = ext === ".js" || ext === ".mjs" || ext === ".cjs";
    const isCss = ext === ".css";
    const isJson = ext === ".json";
    const isSvg = ext === ".svg";
    if (!isCode && !isCss && !isJson && !isSvg) continue;
    const text = decodeTextStrict(file.bytes);
    if (text === null) {
      if (isCode || isCss || isJson) {
        errors.push(`bundle.content_mismatch:${file.path.slice(0, 80)}`);
      }
      continue;
    }
    if (SHEBANG_RE.test(text)) {
      errors.push(`bundle.shell_script:${file.path.slice(0, 80)}`);
      continue;
    }
    if (isSvg) {
      if (SVG_ACTIVE_RE.test(text)) {
        errors.push(`bundle.svg_script:${file.path.slice(0, 80)}`);
      }
      continue;
    }
    if (isCode) {
      for (const marker of SERVER_CODE_RES) {
        if (marker.re.test(text)) {
          errors.push(
            `bundle.server_code:${marker.tag}:${file.path.slice(0, 80)}`,
          );
          break;
        }
      }
    }
    // Tier-0 credential screen (shared scanner, read-only — see header).
    const secrets = scanSecrets(text, isCss ? "css" : isJson ? "html" : "js");
    if (secrets.length > 0) {
      errors.push(`bundle.secret_content:${file.path.slice(0, 80)}`);
    }
    // v1 contract: no raw network imports — hosts beyond the allowlist fail.
    const hosts = isCss ? cssNetworkHosts(text) : jsNetworkHosts(text);
    if (!isCss && !isCode) continue; // .json never fetches; skip host scan.
    for (const host of hosts) {
      if (!allowedHosts.has(host)) {
        errors.push(`bundle.network_host:${host}:${file.path.slice(0, 80)}`);
      }
    }
  }

  // --- dependency pins: bundle entries must equal the manifest pins. ---
  checkDependencies(manifest, input.dependencies, errors);

  // --- asset-manifest completeness: every relative ref must be present. ---
  checkAssetCompleteness(content, errors);

  if (errors.length > 0) return { ok: false, errors };

  const hashed: DevThemeHashedFile[] = content.map((f) => ({
    path: f.path,
    sha256: hashBytes(f.bytes),
    bytes: f.bytes.length,
  }));
  return {
    ok: true,
    manifest,
    files: hashed,
    fingerprint: fingerprintDevThemeRelease(manifest, hashed),
    warnings: [],
  };
}
