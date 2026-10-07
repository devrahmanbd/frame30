/**
 * PROVIDER lane — bundled official artifacts for anonymous preview + catalogue.
 *
 * Deploy-time-built, versioned, checksummed snapshots of the two official
 * themes (`songoskriti`, `somvabona`) for the paths that have no merchant
 * installed set: anonymous `/theme-preview/<key>` and the official catalogue
 * section. The JSON bundle (`./official-artifact-bundle.json`) is emitted by
 * the build script (`scripts/build-official-artifact-bundle.ts`, the ONLY
 * place allowed to import theme source); this module is runtime and loads
 * artifact rows only.
 *
 * Runtime import graph (O2): this module imports ONLY the checked-in JSON
 * bundle plus the theme-agnostic engine (`builder-ast`, `theme-variations`,
 * `theme-preview-nav` assembly/types). It NEVER imports theme source
 * (`lib/themes/*`), the exporters (`theme-export`), or the artifact builder
 * (`official-artifacts`) — a self-test below pins that.
 *
 * Fail-closed: entries with a missing/mismatched checksum are dropped
 * (tampered artifact refused → null → route 404s, catalogue section stays
 * empty), never a silent wrong theme.
 */

import bundle from "./official-artifact-bundle.json";
import {
  parseTemplates,
  parseTokens,
  templateOf,
  type TemplateKey,
} from "./builder-ast";
import {
  assemblePreviewTemplates,
  type PreviewThemeSource,
  type ThemePreviewPreset,
} from "./theme-preview-nav";
import {
  applyVariationTokens,
  variationForKey,
  type ThemeVariation,
} from "./theme-variations";

/* ------------------------------------------------------------ bundle shape */

export type BundledOfficialArtifact = {
  key: string;
  version: string;
  themeName: string;
  themeNameBn: string;
  author: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  tokens: unknown;
  templates: unknown;
  variations: ThemeVariation[];
  /** sha256 hex over the canonical payload (see `canonicalPayload`). */
  checksum: string;
};

type RawBundle = {
  bundleVersion?: unknown;
  builtAt?: unknown;
  artifacts?: unknown;
};

/**
 * Canonical payload the checksum covers. Field order is irrelevant
 * (`stableStringify` sorts keys); the FIELD SET is load-bearing — the build
 * script replicates it exactly (see its `canonicalPayload`, kept in sync by
 * the parity test). Every display + preview field rides inside, so tampering
 * with any of them invalidates the checksum.
 */
function canonicalPayload(artifact: BundledOfficialArtifact): string {
  return stableStringify({
    key: artifact.key,
    version: artifact.version,
    themeName: artifact.themeName,
    themeNameBn: artifact.themeNameBn,
    author: artifact.author,
    summaryEn: artifact.summaryEn,
    summaryBn: artifact.summaryBn,
    category: artifact.category,
    tokens: artifact.tokens,
    templates: artifact.templates,
    variations: artifact.variations,
  });
}

/** JSON with recursively sorted keys — stable bytes for identical input. */
function stableStringify(value: unknown): string {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(node as Record<string, unknown>).sort()) {
        out[k] = sort((node as Record<string, unknown>)[k]);
      }
      return out;
    }
    return node;
  };
  return JSON.stringify(sort(value));
}

/* ------------------------------------------------------- sha256 (vendored) */

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * FIPS 180-4 SHA-256, sync and dependency-free so the checksum gate runs
 * identically on the server (SSR loader) and the client (SPA navigation),
 * where `node:crypto` is unavailable. Cross-checked against `node:crypto`
 * test vectors in `official-artifact-bundle.test.ts`.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const bitLenHi = Math.floor(bytes.length / 0x20000000);
  const bitLenLo = bytes.length * 8;
  const paddedLength = ((((bytes.length + 8) >> 6) + 1) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLenHi >>> 0);
  view.setUint32(paddedLength - 4, bitLenLo >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array<number>(64);
  for (let off = 0; off < paddedLength; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(off + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 =
        rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/* ------------------------------------------------------------- verification */

const CHECKSUM_RE = /^[0-9a-f]{64}$/;

/** Recompute the checksum from artifact parts (tamper gate). */
export function verifyBundledArtifactChecksum(
  artifact: BundledOfficialArtifact,
): boolean {
  if (!artifact || typeof artifact.checksum !== "string") return false;
  if (!CHECKSUM_RE.test(artifact.checksum)) return false;
  const bytes = new TextEncoder().encode(canonicalPayload(artifact));
  return sha256Hex(bytes) === artifact.checksum;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanString(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** One raw bundle row → verified artifact, or null (missing or tampered). */
function verifyRow(raw: unknown): BundledOfficialArtifact | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const key = cleanString(rec["key"], 64);
  const version = cleanString(rec["version"], 32);
  const themeName = cleanString(rec["themeName"], 80);
  const author = cleanString(rec["author"], 80);
  if (!key || !version || !themeName || !author) return null;
  const tokens = asRecord(rec["tokens"]);
  const templates = asRecord(rec["templates"]);
  if (!tokens || !templates) return null;
  const variations = Array.isArray(rec["variations"])
    ? (rec["variations"] as ThemeVariation[])
    : [];
  const candidate: BundledOfficialArtifact = {
    key,
    version,
    themeName,
    themeNameBn: cleanString(rec["themeNameBn"], 80) ?? themeName,
    author,
    summaryEn: cleanString(rec["summaryEn"], 300) ?? "",
    summaryBn: cleanString(rec["summaryBn"], 300) ?? "",
    category: cleanString(rec["category"], 40) ?? "general",
    tokens,
    templates,
    variations,
    checksum:
      typeof rec["checksum"] === "string" ? rec["checksum"] : "",
  };
  return verifyBundledArtifactChecksum(candidate) ? candidate : null;
}

/** Verified artifacts only — corrupt rows never surface. Never throws. */
function verifiedArtifacts(): BundledOfficialArtifact[] {
  try {
    const raw = (bundle as RawBundle).artifacts;
    if (!Array.isArray(raw)) return [];
    const out: BundledOfficialArtifact[] = [];
    for (const row of raw) {
      const verified = verifyRow(row);
      if (verified) out.push(verified);
    }
    return out;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ preview */

/** Verified bundled keys (official only — the bundle never carries other keys). */
export function bundledOfficialKeys(): string[] {
  return verifiedArtifacts().map((a) => a.key);
}

/** Verified bundled artifact for `key`, or null when missing/tampered. */
export function bundledArtifactFor(
  key: string,
): BundledOfficialArtifact | null {
  if (typeof key !== "string" || !key) return null;
  return verifiedArtifacts().find((a) => a.key === key) ?? null;
}

/**
 * Preview source synthesized from a VERIFIED bundled artifact — the same
 * contract as the installed-artifact source (`preview-sources.ts`
 * `installedPreviewSource`, mirrored, not imported): stored base tokens with
 * the requested variation applied, stored AST per template (un-authored
 * templates return null so the engine synthesizes its generic demo body).
 * Unknown variations fall back to the base, never throw. Tampered/missing
 * artifacts fail closed to null.
 */
export function bundledPreviewSourceFor(
  key: string,
  variationKey?: string,
): PreviewThemeSource | null {
  const artifact = bundledArtifactFor(key);
  if (!artifact) return null;
  const variations = Array.isArray(artifact.variations)
    ? artifact.variations
    : [];
  const base = parseTokens(artifact.tokens);
  const variation = variationForKey(variations, variationKey);
  const templates = parseTemplates(artifact.templates);
  return {
    key: artifact.key,
    themeName: artifact.themeName,
    author: artifact.author,
    tokens: applyVariationTokens(base, variation),
    variations,
    header: (template: TemplateKey) => templateOf(templates, template).header,
    footer: (template: TemplateKey) => templateOf(templates, template).footer,
    main: (template: TemplateKey) => {
      const main = templateOf(templates, template).main;
      return main.length ? main : null;
    },
  };
}

/**
 * Anonymous-preview resolver: the `resolveThemePreview` tail over a bundled
 * source. Installed sets still win upstream (the route tries them first);
 * this fills ONLY the merchant-less gap. Unknown keys and tampered artifacts
 * fail closed to null (route renders 404, never a silent wrong theme).
 */
export function resolveBundledOfficialPreview(
  key: string,
  variationKey?: string | null,
): ThemePreviewPreset | null {
  const source = bundledPreviewSourceFor(key, variationKey ?? undefined);
  if (!source) return null;
  const variations = source.variations ?? [];
  const variation = variationForKey(variations, variationKey);
  return {
    key: source.key,
    themeName: source.themeName,
    author: source.author,
    tokens: applyVariationTokens(source.tokens, variation),
    templates: assemblePreviewTemplates(source),
    variation,
    variations,
  };
}

/* ---------------------------------------------------------------- catalogue */

/**
 * Client-safe official catalogue rows from VERIFIED bundled artifacts
 * (display only — no install bytes ever leave the server through this path;
 * installs still run through the provider-backed `installOfficialTheme`).
 * Carries the serializable artifact ref (checksum + `official:<key>` pin) so
 * the catalogue can pin/verify exactly like provider-backed entries.
 */
export type BundledOfficialCatalogEntry = {
  key: string;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  version: string;
  artifact: {
    checksum: string;
    version: string;
    fileName: string;
    pinned: string;
  };
};

export function bundledOfficialCatalogEntries(): BundledOfficialCatalogEntry[] {
  return verifiedArtifacts().map((a) => ({
    key: a.key,
    nameEn: a.themeName,
    nameBn: a.themeNameBn,
    summaryEn: a.summaryEn,
    summaryBn: a.summaryBn,
    category: a.category,
    version: a.version,
    artifact: {
      checksum: a.checksum,
      version: a.version,
      fileName: `${a.key}.zip`,
      pinned: `official:${a.key}`,
    },
  }));
}
