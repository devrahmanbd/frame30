/**
 * Level B (reviewed developer themes) — deterministic bundle assembler.
 *
 * PURE module: no filesystem, no network, no clock. It turns an in-memory
 * theme source (manifest JSON + file bytes) into content-hashed outputs plus
 * a `release.json` payload whose fingerprint is recomputed from the exact
 * shape it ships — the same `fingerprintDevThemeRelease` the review flow
 * binds approvals to.
 *
 * Reuse (never reimplemented): `parseDevThemeManifest` (manifest stage),
 * `validateDevThemeBundle` (executable allowlist, server-code / secrets /
 * network screens, dependency-pin equality, traversal / symlink / oversize
 * posture), `fingerprintDevThemeRelease` + `hashBytes` (release identity +
 * content-hash names). This module adds only the deterministic mapping the
 * validators deliberately do not own: hashed output names, sorted entries,
 * and the release payload.
 *
 * Pipeline stages (fail closed, in order):
 *   1. manifest stage — `parseDevThemeManifest` on the claimed JSON.
 *   2. bundle stage — `validateDevThemeBundle` over the claimed manifest +
 *      file bytes (+ bundler-resolved dependency entries +
 *      allowedNetworkHosts). Any refusal returns its reasons verbatim.
 *   3. vendor stage (optional) — when `vendorFiles` is provided, every
 *      manifest dependency pin must match the digest of at least one
 *      pre-vendored file's bytes for its declared algorithm
 *      (`sha256|384|512` base64 digest comparison). The validator checks
 *      integrity SHAPE only; this stage checks BYTES, against local input
 *      only — never a fetch. Omitted (`undefined`) means shape-only.
 *   4. emit stage — pure mapping: root files (`dev.theme.json`, readme /
 *      license extras) copy verbatim so the output stays re-validatable;
 *      every file under an area maps to `dir/name.<sha8>.<ext>` where
 *      sha8 is the first 8 hex chars of the file's sha256. Release files
 *      sort by path; `releaseJson` is fixed-format JSON with no timestamps.
 *
 * Determinism: same input bytes always yield the same output paths, the
 * same `releaseJson` bytes, and the same fingerprint. No timestamps, no
 * random salts, no absolute paths, no filesystem metadata in hashed
 * content. The assembler round-trips `releaseJson` (parse → recompute)
 * before returning, so a drift between the shipped payload and the hashed
 * shape fails closed instead of publishing a lie.
 *
 * What this module does NOT do: filesystem walks (the CLI ingest layer),
 * registry writes, review transitions, activation/rendering, network fetch.
 */

import { createHash } from "node:crypto";
import {
  fingerprintDevThemeRelease,
  hashBytes,
  validateDevThemeBundle,
  type DevThemeBundleDependency,
  type DevThemeBundleFile,
  type DevThemeHashedFile,
} from "./dev-theme-bundle";
import {
  parseDevThemeManifest,
  type DevThemeManifest,
} from "./dev-theme-manifest";

export type AssembleInput = {
  /** Parsed `dev.theme.json` (unknown until the manifest stage proves it). */
  manifestJson: unknown;
  /** Every source file, including the `dev.theme.json` entry itself. */
  files: DevThemeBundleFile[];
  /**
   * Bundler-resolved dependency entries. Defaults to the manifest pins
   * (vacuous equality); pass the vendor dir's `dependencies.json` when the
   * bundler resolves pins from an independent source.
   */
  dependencies?: DevThemeBundleDependency[];
  /** Hosts the bundle may fetch at runtime. Default: none. */
  allowedNetworkHosts?: string[];
  /**
   * Pre-vendored dependency bytes for the vendor stage. `undefined` skips
   * byte verification (integrity shape only, via the bundle gate).
   */
  vendorFiles?: DevThemeBundleFile[];
};

export type AssembleOutput = {
  /** Output relative path (posix) — hashed for area files. */
  path: string;
  bytes: Uint8Array;
};

export type AssembleVerdict =
  | {
      ok: true;
      manifest: DevThemeManifest;
      /** Release file list: output paths, sorted — the hashed shape. */
      files: DevThemeHashedFile[];
      fingerprint: string;
      /** Disk writes: hashed assets + verbatim root files, sorted by path. */
      outputs: AssembleOutput[];
      /** Deterministic `release.json` text (trailing newline, no stamps). */
      releaseJson: string;
      warnings: [];
    }
  | { ok: false; errors: string[] };

/** Integrity digest shape (mirrors the manifest/bundle gates, not reached). */
const VENDOR_INTEGRITY_RE = /^sha(256|384|512)-([A-Za-z0-9+/]+={0,2})$/;

/**
 * Map a validated bundle path to its output path. Root files keep their
 * exact names (the bundle gate matches `dev.theme.json` + readme/license
 * extras by exact name, so hashing them would break re-validation);
 * everything under an area gains a content hash: `dir/name.<sha8>.<ext>`.
 */
export function hashedOutputPath(relPath: string, bytes: Uint8Array): string {
  if (!relPath.includes("/")) return relPath;
  const slash = relPath.lastIndexOf("/");
  const dir = relPath.slice(0, slash);
  const base = relPath.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return relPath;
  const sha8 = hashBytes(bytes).slice(0, 8);
  return `${dir}/${base.slice(0, dot)}.${sha8}${base.slice(dot)}`;
}

/**
 * Vendor stage: every manifest pin must match at least one pre-vendored
 * file's bytes under its declared algorithm. Local bytes only, never fetched.
 */
export function verifyVendorIntegrity(
  manifest: DevThemeManifest,
  vendorFiles: DevThemeBundleFile[],
): string[] {
  const errors: string[] = [];
  for (const file of vendorFiles) {
    if (file.symlink === true) {
      errors.push(`bundle.vendor_symlink:${file.path.slice(0, 80)}`);
    }
  }
  if (errors.length > 0) return errors;
  for (const dep of manifest.dependencies) {
    const match = VENDOR_INTEGRITY_RE.exec(dep.integrity);
    if (!match) {
      errors.push(`bundle.vendor_integrity:${dep.name}`);
      continue;
    }
    const algo = match[1];
    const expected = match[2];
    let satisfied = false;
    for (const file of vendorFiles) {
      const digest = createHash(`sha${algo}`)
        .update(file.bytes)
        .digest("base64");
      if (digest === expected) {
        satisfied = true;
        break;
      }
    }
    if (!satisfied) {
      errors.push(
        vendorFiles.length === 0
          ? `bundle.vendor_missing:${dep.name}`
          : `bundle.vendor_mismatch:${dep.name}`,
      );
    }
  }
  return errors;
}

/** The single deterministic mapping the Level B build pipeline runs. */
export function assembleDevThemeBundle(input: AssembleInput): AssembleVerdict {
  // --- stage 1: manifest shape (fail closed with reasons). ---
  const parsed = parseDevThemeManifest(input.manifestJson);
  if (!parsed.ok) return { ok: false, errors: [...parsed.errors] };
  const manifest = parsed.manifest;

  // --- stage 2: bundle gate (allowlist, server/secrets/network, pins,
  // traversal / symlink / oversize — all reused, never reimplemented). ---
  const verdict = validateDevThemeBundle({
    manifest: input.manifestJson,
    files: input.files,
    dependencies:
      input.dependencies ?? manifest.dependencies.map((d) => ({ ...d })),
    allowedNetworkHosts: input.allowedNetworkHosts,
  });
  if (!verdict.ok) return { ok: false, errors: [...verdict.errors] };

  // --- stage 3: vendor bytes (only when pre-vendored input is given). ---
  if (input.vendorFiles !== undefined) {
    const vendorErrors = verifyVendorIntegrity(manifest, input.vendorFiles);
    if (vendorErrors.length > 0) return { ok: false, errors: vendorErrors };
  }

  // --- stage 4: deterministic emit over the validated bytes. ---
  const bytesByPath = new Map<string, Uint8Array>();
  for (const file of input.files) bytesByPath.set(file.path, file.bytes);

  const seen = new Set<string>();
  const releaseFiles: DevThemeHashedFile[] = [];
  const outputs: AssembleOutput[] = [];
  for (const file of verdict.files) {
    const bytes = bytesByPath.get(file.path);
    if (!bytes || bytes.length !== file.bytes) {
      return { ok: false, errors: ["build.internal:bytes_missing"] };
    }
    const outPath = hashedOutputPath(file.path, bytes);
    if (seen.has(outPath)) {
      return {
        ok: false,
        errors: [`build.duplicate_output:${outPath.slice(0, 80)}`],
      };
    }
    seen.add(outPath);
    releaseFiles.push({
      path: outPath,
      sha256: file.sha256,
      bytes: file.bytes,
    });
    outputs.push({ path: outPath, bytes });
  }
  releaseFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  outputs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const fingerprint = fingerprintDevThemeRelease(manifest, releaseFiles);
  const releaseJson = `${JSON.stringify({ manifest, files: releaseFiles, fingerprint }, null, 2)}\n`;

  // Round-trip proof: the shipped payload hashes to its own fingerprint.
  try {
    const roundTrip = JSON.parse(releaseJson) as {
      manifest: DevThemeManifest;
      files: DevThemeHashedFile[];
      fingerprint: string;
    };
    if (
      fingerprintDevThemeRelease(roundTrip.manifest, roundTrip.files) !==
      fingerprint
    ) {
      return { ok: false, errors: ["build.internal:fingerprint_drift"] };
    }
  } catch {
    return { ok: false, errors: ["build.internal:release_unparseable"] };
  }

  return {
    ok: true,
    manifest,
    files: releaseFiles,
    fingerprint,
    outputs,
    releaseJson,
    warnings: [],
  };
}
