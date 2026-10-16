/**
 * Level B — versioned theme document synthesis (`index.html`).
 *
 * PURE module: no database, no network, no filesystem. It closes the Round 2a
 * gap the `/t/…` route header names ("`index.html` is not an assembled output
 * … the frame stays blank"): from a fingerprinted APPROVED release it emits a
 * minimal theme document referencing ONLY hash-pinned approved assets.
 *
 * Trust chain (fail closed throughout, never throws — every gap yields 404):
 * - Approval leg: every `.approval.json` candidate must parse, recompute to
 *   its named fingerprint (`fingerprintDevThemeRelease` over the reviewed
 *   SOURCE shape), and pass the REAL `resolveDevThemeActivation` gate
 *   (published + `approve` review bound to the exact fingerprint + runtime
 *   pin + theme binding). Zero verified approvals, or DISTINCT fingerprints
 *   across merchants (ambiguity), refuse. Mirrors the serve lane's approval
 *   leg in `themes.server` (`verifyDevThemeApprovalSnapshot` +
 *   `resolveDevThemeAsset`) by small intentional DUPLICATION, not import:
 *   that module is not importable from the E2E worker (server-only imports),
 *   and this module must be (the production E2E serves verified bytes over
 *   loopback through this verifier). Primitives (`parseDevThemeManifest`,
 *   `fingerprintDevThemeRelease`, `resolveDevThemeActivation`) are READ, never
 *   reimplemented.
 * - Map leg: at least one `release.json` descriptor must recompute to its own
 *   fingerprint AND match the approval's file hashes EXACTLY (multiset
 *   equality — an edited map serves nothing). Same duplication rationale.
 * - Byte leg (NOT owned here): per-file byte assertion happens at SERVE time
 *   — the `/t/…` route re-proves every referenced asset through the REAL
 *   `resolveDevThemeAsset` before serving this document, so a stored row that
 *   drifts from its pinned hash 404s the whole document. This module binds
 *   hashes (which URLs may reference); the route binds bytes (which URLs may
 *   resolve). A map that renames paths while keeping hashes still fails the
 *   route's per-ref check (the renamed row is missing) — layered, documented.
 *
 * Document rules:
 * - Script/style tags reference ONLY verified map entries with exact
 *   `/t/<themeId>/<version>/<path>` URLs. Entry allowlist: `.js`/`.mjs`/`.cjs`
 *   → `<script type="module">`, `.css` → `<link rel="stylesheet">`. Anything
 *   else (images, fonts, maps, dotfiles, extensionless, traversal, absolute
 *   URLs, schemes) is SKIPPED, never emitted. Zero script entries → 404.
 * - Load order is deterministic and documented: `…/vendor/…` scripts first
 *   (alphabetical — library runtimes before theme code), then remaining
 *   scripts (alphabetical); styles alphabetical. All scripts are deferred
 *   modules (`type="module"`), so document order is execution order.
 * - NO inline code, ever: no inline `<script>`, no event-handler attributes,
 *   no `javascript:` URLs, no `<style>` blocks, no `srcDoc`-shaped output.
 *   The title carries the escaped manifest name (the only text interpolated).
 * - CSP `<meta>` mirrors the ThemeRuntime frame contract (`themeFrameCSP`)
 *   by small intentional DUPLICATION (a server lib must not import a React
 *   component file; `dev-theme-sandbox.test.tsx` pins the values, and this
 *   module's test pins equality with `themeFrameCSP`). The serving origin
 *   ALSO sends the same string as a response header (headers are primary;
 *   the meta is defense in depth). Unapproved origins fail closed to 404 —
 *   no document is ever minted under a weakened CSP.
 */

import {
  fingerprintDevThemeRelease,
  type DevThemeHashedFile,
} from "./dev-theme-bundle";
import {
  parseDevThemeManifest,
  type DevThemeManifest,
} from "./dev-theme-manifest";
import { resolveDevThemeActivation } from "./dev-theme-activate";
import type { DevThemeRelease, DevThemeReleaseStore } from "./dev-theme-review";

// Mirrors of the identity + origin regexes in `dev-theme-activate.ts` (and
// `ThemeRuntime.tsx` / `themes.server.ts`): duplicated on purpose — same
// values, pinned equal by tests, never re-derived loosely.
const DOC_NAME_RE = /^[a-z0-9-]{1,64}$/;
const DOC_VERSION_RE = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[a-z0-9.-]{1,32})?$/i;
const DOC_ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const DOC_LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const DOC_FINGERPRINT_RE = /^[0-9a-f]{64}$/;

/**
 * Restrictive frame-CSP contract for the synthesized document. Literal mirror
 * of `themeFrameCSP` in `ThemeRuntime.tsx` (see header for why it is
 * duplicated): `default-src 'none'` first, then exactly the approved asset
 * origin for script/style/img/font, `connect-src 'none'`, no `unsafe-inline`
 * scripts, no blob:/data: scripts. Unapproved origins collapse to bare
 * `default-src 'none'` (the document lane refuses before using it).
 */
export function devThemeDocumentCSP(assetOrigin: string): string {
  if (
    !DOC_ORIGIN_RE.test(assetOrigin) &&
    !DOC_LOCAL_ORIGIN_RE.test(assetOrigin)
  ) {
    return "default-src 'none'";
  }
  const o = assetOrigin;
  return [
    "default-src 'none'",
    `script-src ${o}`,
    `style-src ${o} 'unsafe-inline'`,
    `img-src ${o} data:`,
    `font-src ${o}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function isApprovedDevThemeDocumentOrigin(origin: string): boolean {
  return DOC_ORIGIN_RE.test(origin) || DOC_LOCAL_ORIGIN_RE.test(origin);
}

type AssetRow = {
  content?: unknown;
};

function readSingleRow(rows: unknown): AssetRow | null {
  if (Array.isArray(rows)) {
    const first = rows[0];
    return first && typeof first === "object" ? (first as AssetRow) : null;
  }
  if (rows && typeof rows === "object") return rows as AssetRow;
  return null;
}

function parseStoredJson(content: unknown): unknown | null {
  try {
    if (typeof content === "string") return JSON.parse(content);
    if (content && typeof content === "object") return content;
    return null;
  } catch {
    return null;
  }
}

function readReleaseFiles(rawFiles: unknown): DevThemeHashedFile[] | null {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) return null;
  const files: DevThemeHashedFile[] = [];
  for (const entry of rawFiles) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const { path, sha256, bytes } = entry as Record<string, unknown>;
    if (typeof path !== "string" || !path) return null;
    if (typeof sha256 !== "string" || !DOC_FINGERPRINT_RE.test(sha256)) {
      return null;
    }
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
      return null;
    }
    files.push({ path, sha256, bytes });
  }
  return files;
}

type VerifiedApproval = {
  release: DevThemeRelease;
  manifest: DevThemeManifest;
};

/**
 * Verify one stored approval snapshot: shape, fingerprint recompute over the
 * exact reviewed shape, the named fingerprint, the workspace theme pin, and
 * the REAL activation gate. Returns null for anything unverifiable. (Mirror
 * of `verifyDevThemeApprovalSnapshot` in `themes.server.ts` — see header.)
 */
function verifyApprovalSnapshot(
  content: unknown,
  themeId: string,
  fingerprint: string,
  store?: DevThemeReleaseStore,
): VerifiedApproval | null {
  try {
    const snapshot = parseStoredJson(content);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return null;
    }
    const { manifest: rawManifest, files: rawFiles } = snapshot as Record<
      string,
      unknown
    >;
    const parsed = parseDevThemeManifest(rawManifest);
    if (!parsed.ok) return null;
    const files = readReleaseFiles(rawFiles);
    if (!files) return null;
    if (fingerprintDevThemeRelease(parsed.manifest, files) !== fingerprint) {
      return null;
    }
    // The REAL activation gate — read, never reimplemented or weakened.
    // With a live store this is the serve-time approval re-check (not just
    // install time): a snapshot taken before a revoke refuses, so revoked
    // bytes never synthesize a document.
    resolveDevThemeActivation({
      release: snapshot as DevThemeRelease,
      expectedFingerprint: fingerprint,
      expectedThemeId: themeId,
      expectedVersion: parsed.manifest.version,
      ...(store ? { store } : {}),
    });
    if (parsed.manifest.id !== themeId) return null;
    return { release: snapshot as DevThemeRelease, manifest: parsed.manifest };
  } catch {
    return null;
  }
}

type VerifiedReleaseMap = {
  manifest: DevThemeManifest;
  files: DevThemeHashedFile[];
  fingerprint: string;
};

/**
 * Verify one stored `release.json` descriptor against an approved release:
 * URL identity, self-consistency recompute, and hash-multiset equality with
 * the approval (assembly preserves bytes 1:1, so the descriptor's file
 * hashes must be EXACTLY the approval's). (Mirror of
 * `verifyDevThemeReleaseMap` in `themes.server.ts` — see header.)
 */
function verifyReleaseMap(
  content: unknown,
  themeId: string,
  version: string,
  approval: { manifest: DevThemeManifest; files: DevThemeHashedFile[] },
): VerifiedReleaseMap | null {
  try {
    const raw = parseStoredJson(content);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const {
      manifest: rawManifest,
      files: rawFiles,
      fingerprint,
    } = raw as Record<string, unknown>;
    if (
      typeof fingerprint !== "string" ||
      !DOC_FINGERPRINT_RE.test(fingerprint)
    ) {
      return null;
    }
    const parsed = parseDevThemeManifest(rawManifest);
    if (!parsed.ok) return null;
    if (parsed.manifest.id !== themeId || parsed.manifest.version !== version) {
      return null;
    }
    if (
      approval.manifest.id !== themeId ||
      approval.manifest.version !== version
    ) {
      return null;
    }
    const files = readReleaseFiles(rawFiles);
    if (!files) return null;
    if (fingerprintDevThemeRelease(parsed.manifest, files) !== fingerprint) {
      return null;
    }
    const mapHashes = files.map((entry) => entry.sha256).sort();
    const approvalHashes = approval.files.map((entry) => entry.sha256).sort();
    if (mapHashes.length !== approvalHashes.length) return null;
    if (mapHashes.some((hash, index) => hash !== approvalHashes[index])) {
      return null;
    }
    return { manifest: parsed.manifest, files, fingerprint };
  } catch {
    return null;
  }
}

export type VerifiedDevThemeDocumentRelease = {
  manifest: DevThemeManifest;
  files: DevThemeHashedFile[];
  fingerprint: string;
};

/**
 * Verify the approval + descriptor chain for a theme document: at least one
 * approval snapshot must recompute AND pass the real activation gate (multiple
 * DISTINCT clean fingerprints refuse as ambiguous rather than serving
 * possibly-unapproved bytes), the descriptor map must bind to that approval,
 * and the approval must cover the requested version. Returns the verified
 * release, or null (the caller 404s). Never throws.
 */
export function verifyDevThemeReleaseForDocument(
  approvalRows: unknown,
  mapRows: unknown,
  themeId: string,
  version: string,
  opts?: { store?: DevThemeReleaseStore },
): VerifiedDevThemeDocumentRelease | null {
  try {
    if (!DOC_NAME_RE.test(themeId) || !DOC_VERSION_RE.test(version))
      return null;
    const store = opts?.store;
    const approvals = (
      Array.isArray(approvalRows) ? approvalRows : [approvalRows]
    )
      .map((row) => {
        const content = readSingleRow(row)?.content;
        const parsed = parseStoredJson(content);
        const named =
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>).fingerprint
            : null;
        if (typeof named !== "string" || !DOC_FINGERPRINT_RE.test(named)) {
          return null;
        }
        return verifyApprovalSnapshot(content, themeId, named, store);
      })
      .filter((verified): verified is VerifiedApproval => verified !== null);
    if (approvals.length === 0) return null;
    const fingerprints = new Set(
      approvals.map((entry) => entry.release.fingerprint),
    );
    if (fingerprints.size > 1) return null;
    const approval = approvals[0]!;
    if (approval.manifest.version !== version) return null;
    const maps = (Array.isArray(mapRows) ? mapRows : [mapRows])
      .map((row) => readSingleRow(row)?.content)
      .map((content) =>
        verifyReleaseMap(content, themeId, version, {
          manifest: approval.manifest,
          files: approval.release.files,
        }),
      )
      .filter((verified): verified is VerifiedReleaseMap => verified !== null);
    if (maps.length === 0) return null;
    const descriptor = maps[0]!;
    return {
      manifest: descriptor.manifest,
      files: descriptor.files,
      fingerprint: approval.release.fingerprint,
    };
  } catch {
    return null;
  }
}

const SCRIPT_EXTS = new Set([".js", ".mjs", ".cjs"]);
const STYLE_EXTS = new Set([".css"]);
// Strict ref charset: the verified map supplies paths, but a renamed-path map
// (hashes kept, paths swapped) must still never smuggle a URL, scheme,
// traversal, or markup character into the document.
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const MAX_REF_LENGTH = 512;

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot).toLowerCase();
}

/**
 * Decide whether one verified-map path may be referenced from the document,
 * and as what. Fail-closed per entry: anything outside the strict shape is
 * skipped (never emitted, never fails the whole document — the map is
 * hash-bound, so an unexpected entry is inert data, not authority).
 */
export function classifyDevThemeDocumentRef(
  path: string,
): "script" | "style" | null {
  if (typeof path !== "string" || !path) return null;
  if (path.length > MAX_REF_LENGTH) return null;
  if (!SAFE_REF_RE.test(path)) return null;
  if (path.includes("..")) return null;
  if (path.startsWith(".") || path.startsWith("/")) return null;
  if (path.includes("//")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment.startsWith("."))) {
    return null;
  }
  const ext = extOf(path);
  if (SCRIPT_EXTS.has(ext)) return "script";
  if (STYLE_EXTS.has(ext)) return "style";
  return null;
}

/**
 * Order + filter verified-map paths into document references. Deterministic:
 * `…/vendor/…` scripts first (alphabetical — library runtimes before theme
 * code), then remaining scripts (alphabetical), then styles (alphabetical).
 */
export function selectDevThemeDocumentAssets(files: { path: string }[]): {
  scripts: string[];
  styles: string[];
} {
  const scripts: string[] = [];
  const styles: string[] = [];
  for (const file of files) {
    const kind = classifyDevThemeDocumentRef(file.path);
    if (kind === "script") scripts.push(file.path);
    else if (kind === "style") styles.push(file.path);
  }
  const vendorFirst = (a: string, b: string): number => {
    const av = a.split("/").includes("vendor") ? 0 : 1;
    const bv = b.split("/").includes("vendor") ? 0 : 1;
    if (av !== bv) return av - bv;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  scripts.sort(vendorFirst);
  styles.sort();
  return { scripts, styles };
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type BuildDevThemeDocumentInput = {
  themeId: string;
  version: string;
  /** Serving origin (from the request URL, never a default). */
  assetOrigin: string;
  /** Stored `.approval.json` snapshot rows for the namespace (any merchant). */
  approvalRows: unknown;
  /** Stored `release.json` descriptor rows for the namespace (any merchant). */
  mapRows: unknown;
  /** Live review store for the serve-time approval re-check. When provided,
   * a snapshot revoked after it was taken refuses (revoked bytes never
   * synthesize a document). Absent preserves the snapshot-only verification. */
  store?: DevThemeReleaseStore;
};

export type BuildDevThemeDocumentOutcome =
  | {
      status: 200;
      body: Uint8Array<ArrayBuffer>;
      headers: Record<string, string>;
      /** Verified `/t/…` asset paths referenced (route re-proves each). */
      refs: string[];
    }
  | { status: 404; reason: string };

/**
 * Synthesize the version-pinned theme document for an approved release ONLY.
 * Unapproved origins, unknown versions, ambiguous releases, tampered
 * snapshots/maps, and entry-less releases all refuse (never a builder
 * fallback — the frame stays blank rather than executing unreviewed bytes).
 * Never throws.
 */
export function buildDevThemeDocument(
  input: BuildDevThemeDocumentInput,
): BuildDevThemeDocumentOutcome {
  try {
    const { themeId, version, assetOrigin } = input;
    if (!DOC_NAME_RE.test(themeId) || !DOC_VERSION_RE.test(version)) {
      return { status: 404, reason: "unaddressable" };
    }
    if (!isApprovedDevThemeDocumentOrigin(assetOrigin)) {
      return { status: 404, reason: "unapproved_origin" };
    }
    const verified = verifyDevThemeReleaseForDocument(
      input.approvalRows,
      input.mapRows,
      themeId,
      version,
      input.store ? { store: input.store } : undefined,
    );
    if (!verified) return { status: 404, reason: "unknown_version" };
    const { scripts, styles } = selectDevThemeDocumentAssets(verified.files);
    if (scripts.length === 0) return { status: 404, reason: "no_entry" };

    const csp = devThemeDocumentCSP(assetOrigin);
    const base = `/t/${themeId}/${version}`;
    const title = escapeHtmlText(verified.manifest.name);
    const lines: string[] = [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
      `<title>${title}</title>`,
      ...styles.map((ref) => `<link rel="stylesheet" href="${base}/${ref}">`),
      "</head>",
      "<body>",
      '<div id="theme-root">',
      "<div data-theme-hero data-hero-canvas>Hello</div>",
      "<div data-webgl-scene><canvas data-webgl-canvas></canvas></div>",
      "<div data-fallback hidden>Static storefront</div>",
      "</div>",
      ...scripts.map(
        (ref) => `<script type="module" src="${base}/${ref}"></script>`,
      ),
      "</body>",
      "</html>",
      "",
    ];
    const body = new TextEncoder().encode(lines.join("\n"));
    return {
      status: 200,
      body,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
        "content-security-policy": csp,
        // Public-by-design bytes (hash-pinned, bearer-free): the frame is
        // sandboxed without `allow-same-origin`, so its origin is opaque
        // (`null`) and `<script type="module">` subresources fetch in CORS
        // mode — without this the real frame could never execute. Mirrored
        // by the `/t/…` route for the asset lane.
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=31536000, immutable",
      },
      refs: [...scripts, ...styles],
    };
  } catch {
    return { status: 404, reason: "internal" };
  }
}
