#!/usr/bin/env node
/**
 * Frame30 DICE Independent Trusted Root-of-Trust Engine (Revision 2.3 Section 3 & Stage 2.4)
 *
 * Anchors the verification authority in an independently pinned and authenticated
 * trusted reference (commit/ref), extracting immutable verification policies,
 * schemas, registries, and evaluator logic independently of the untrusted candidate checkout.
 *
 * Stage 2.4 Hardening:
 * - Zero candidate-local fallback paths in getTrustedPath() (fail-closed BLOCKED).
 * - Zero candidate-local seeding of trusted-keys.json.
 * - Validation of trusted root identity against approved commit and tree SHA.
 * - Full policy manifest hashing all authoritative schemas, verifiers, evaluators, and registries.
 * - Complete removal of string-interpolated execSync calls (structured spawnSync / execFileSync).
 * - Strict SHA, ref, and path validation preventing shell injection.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  lstatSync,
  realpathSync,
  readdirSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import {
  join,
  resolve,
  isAbsolute,
  normalize,
  relative,
  dirname,
} from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./dice-plan-generator.mjs";

export const DEFAULT_TRUSTED_REF = "9e6a82abb3502edb84f2d7be9fcc36401b380bfb";

export const APPROVED_ROOTS = Object.freeze({
  "9e6a82abb3502edb84f2d7be9fcc36401b380bfb":
    "2194ec156151f39002d78e3a1cffdcd760d80ead",
  "2d1d32f9b49628ce0a4ae8ff9cbe805e94cb4271":
    "f8932f94a9179feea432073105739ed3c2fac294",
  b09a772c59f9669af51d53f8411588a1eb95283c:
    "6cacd5c6ad96b0c2fc4aa7822c31e0ce31d6f166",
});

export function validateCommitSha(sha) {
  if (!sha || typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha.trim())) {
    throw new Error(
      `FAIL-CLOSED: Malformed commit SHA: ${JSON.stringify(sha)}`,
    );
  }
  return sha.trim();
}

export function validateTreeSha(sha) {
  if (!sha || typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha.trim())) {
    throw new Error(`FAIL-CLOSED: Malformed tree SHA: ${JSON.stringify(sha)}`);
  }
  return sha.trim();
}

export function validateTrustedRef(ref) {
  if (
    !ref ||
    typeof ref !== "string" ||
    !/^[a-zA-Z0-9/_.-]+$/.test(ref.trim()) ||
    ref.includes("..")
  ) {
    throw new Error(
      `FAIL-CLOSED: Malformed trusted reference: ${JSON.stringify(ref)}`,
    );
  }
  return ref.trim();
}

export function validateSafePath(p, options = {}) {
  if (
    !p ||
    typeof p !== "string" ||
    p.includes("\0") ||
    p.includes("\n") ||
    p.includes("\r")
  ) {
    throw new Error(`FAIL-CLOSED: Malformed path: ${JSON.stringify(p)}`);
  }

  const raw = p.trim();

  // Reject parent-directory traversal in any form
  if (/(^|[/\\])\.\.([/\\]|$)/.test(raw) || raw.includes("..")) {
    throw new Error(
      `FAIL-CLOSED: Parent directory traversal prohibited: ${JSON.stringify(p)}`,
    );
  }

  // If relative path required
  if (options.mustBeRelative && isAbsolute(raw)) {
    throw new Error(
      `FAIL-CLOSED: Absolute path prohibited: ${JSON.stringify(p)}`,
    );
  }

  // If base directory is specified, verify containment
  if (options.baseDir) {
    const baseCanonical = resolve(options.baseDir);
    const resolvedPath = resolve(options.baseDir, raw);
    const rel = relative(baseCanonical, resolvedPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(
        `FAIL-CLOSED: Path escapes base directory: ${JSON.stringify(p)}`,
      );
    }
  }

  // Symlink escape check if path exists on disk
  if (options.checkSymlinks !== false) {
    try {
      if (existsSync(raw)) {
        const lstat = lstatSync(raw);
        if (lstat.isSymbolicLink()) {
          const real = realpathSync(raw);
          if (options.baseDir) {
            const baseCanonical = realpathSync(resolve(options.baseDir));
            const rel = relative(baseCanonical, real);
            if (rel.startsWith("..") || isAbsolute(rel)) {
              throw new Error(
                `FAIL-CLOSED: Symlink escape detected: ${raw} -> ${real}`,
              );
            }
          }
        }
      }
    } catch (err) {
      if (err.message && err.message.startsWith("FAIL-CLOSED:")) throw err;
    }
  }

  return raw;
}

export function safeArchiveExtract(
  commitOrTree,
  targetPaths,
  targetDir,
  repoRoot,
) {
  validateSafePath(targetDir);
  validateSafePath(repoRoot);
  for (const p of targetPaths) {
    validateSafePath(p, { mustBeRelative: true });
  }

  // Ensure targetDir does not escape /tmp or repoRoot
  const resolvedTarget = resolve(targetDir);
  const resolvedRepo = resolve(repoRoot);
  const isAllowedLocation =
    resolvedTarget.startsWith("/tmp/") ||
    resolvedTarget === "/tmp" ||
    resolvedTarget.startsWith(resolvedRepo);
  if (!isAllowedLocation) {
    throw new Error(
      `FAIL-CLOSED: Invalid extraction destination: ${targetDir}`,
    );
  }

  mkdirSync(targetDir, { recursive: true });

  try {
    execFileSync(
      "sh",
      [
        "-c",
        'commit="$1"; dir="$2"; shift 2; git archive "$commit" "$@" | tar -x --no-same-owner -C "$dir"',
        "--",
        commitOrTree,
        targetDir,
        ...targetPaths,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString("utf8").trim() : err.message;
    throw new Error(`FAIL-CLOSED: Archive extraction failed: ${msg}`);
  }

  // Symlink boundary sweep: verify no extracted entry points outside targetDir
  function assertNoSymlinkEscapes(dir, base) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = realpathSync(full);
        const rel = relative(base, target);
        if (rel.startsWith("..") || isAbsolute(rel)) {
          throw new Error(
            `FAIL-CLOSED: Archive contains escaping symlink: ${entry.name} -> ${target}`,
          );
        }
      } else if (entry.isDirectory()) {
        assertNoSymlinkEscapes(full, base);
      }
    }
  }

  try {
    assertNoSymlinkEscapes(resolvedTarget, resolvedTarget);
  } catch (err) {
    rmSync(targetDir, { recursive: true, force: true });
    throw err;
  }
}

export class DiceTrustedRoot {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.trustedRef =
      options.trustedRef || process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;
    this.cacheDir =
      options.cacheDir || join(this.repoRoot, "artifacts/dice-trusted-root");
    this.allowUnpinnedRoots = options.allowUnpinnedRoots || false;
    this.trustedRootSha = null;
    this.trustedCommit = null;
    this.trustedTree = null;
    this.runnerSha = null;
    this.policyManifest = null;
  }

  resolve() {
    validateTrustedRef(this.trustedRef);

    // 1. Authenticate trusted ref against git object database without shell interpolation
    try {
      this.trustedCommit = execFileSync(
        "git",
        ["rev-parse", "--verify", `${this.trustedRef}^{commit}`],
        {
          cwd: this.repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ).trim();
      validateCommitSha(this.trustedCommit);
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Trusted root reference '${this.trustedRef}' cannot be resolved in git history: ${err.message}`,
      );
    }

    try {
      this.trustedTree = execFileSync(
        "git",
        ["rev-parse", "--verify", `${this.trustedCommit}^{tree}`],
        {
          cwd: this.repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      ).trim();
      validateTreeSha(this.trustedTree);
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Cannot resolve tree for trusted commit '${this.trustedCommit}': ${err.message}`,
      );
    }

    // Validate trusted root identity against independently approved commit and tree
    if (!this.allowUnpinnedRoots) {
      const expectedTree = APPROVED_ROOTS[this.trustedCommit];
      if (!expectedTree) {
        throw new Error(
          `FAIL-CLOSED: Unrecognized or unapproved trusted root commit '${this.trustedCommit}'. Root identity rejected (BLOCKED).`,
        );
      }
      if (expectedTree !== this.trustedTree) {
        throw new Error(
          `FAIL-CLOSED: Trusted tree mismatch for commit '${this.trustedCommit}'. Expected ${expectedTree}, got ${this.trustedTree} (BLOCKED).`,
        );
      }
    }

    // 2. Extract trusted verification policies and executables from authenticated tree
    if (existsSync(this.cacheDir)) {
      try {
        rmSync(this.cacheDir, { recursive: true, force: true });
      } catch {}
    }
    mkdirSync(this.cacheDir, { recursive: true });

    const potentialTargets = [
      "schemas/dice",
      "registries/dice",
      "scripts/dice-root-of-trust.mjs",
      "scripts/dice-bootstrap.mjs",
      "scripts/dice-qualify.mjs",
      "scripts/dice-plan-generator.mjs",
      "scripts/dice-sandbox.mjs",
      "scripts/dice-evidence.mjs",
      "scripts/dice-signing-service.mjs",
      "scripts/scope-guard.mjs",
      "scripts/verification-drift.mjs",
      "scripts/die-registry-check.mjs",
      "scripts/secret-scan.mjs",
    ];

    const targetsToArchive = [];
    for (const target of potentialTargets) {
      try {
        const out = execFileSync(
          "git",
          ["ls-tree", this.trustedCommit, target],
          {
            cwd: this.repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          },
        ).trim();
        if (out) {
          targetsToArchive.push(target);
        }
      } catch {}
    }

    if (targetsToArchive.length > 0) {
      safeArchiveExtract(
        this.trustedCommit,
        targetsToArchive,
        this.cacheDir,
        this.repoRoot,
      );
    }

    // In Stage 2.4, trusted-keys.json MUST be present in trusted root (zero candidate-local seeding)
    const trustedKeysCache = join(
      this.cacheDir,
      "registries/dice/trusted-keys.json",
    );
    if (!existsSync(trustedKeysCache)) {
      throw new Error(
        `FAIL-CLOSED: Missing authoritative trusted-keys.json in trusted root reference '${this.trustedCommit}' (BLOCKED). Local seeding strictly prohibited.`,
      );
    }

    // 3. Compute immutable cryptographic policy manifest & digest
    this.policyManifest = this.generatePolicyManifest();
    this.trustedRootSha = this.policyManifest.manifest_sha256;

    // 4. Compute runner SHA from trusted distribution cache
    try {
      const runnerContent = readFileSync(
        join(this.cacheDir, "scripts/dice-bootstrap.mjs"),
        "utf8",
      );
      this.runnerSha = createHash("sha256")
        .update(runnerContent, "utf8")
        .digest("hex");
    } catch {
      this.runnerSha = "unknown";
    }

    return {
      trustedRef: this.trustedRef,
      trustedCommit: this.trustedCommit,
      trustedTree: this.trustedTree,
      trustedRootSha: this.trustedRootSha,
      runnerSha: this.runnerSha,
      cacheDir: this.cacheDir,
      policyManifest: this.policyManifest,
    };
  }

  generatePolicyManifest() {
    const filesToHash = [
      // Schemas
      "schemas/dice/obl.schema.json",
      "schemas/dice/xdie.schema.json",
      "schemas/dice/domain-pack.schema.json",
      "schemas/dice/registry.schema.json",
      "schemas/dice/trusted-profile.schema.json",
      "schemas/dice/evidence-envelope.schema.json",
      // Verifier scripts & evaluators
      "scripts/dice-root-of-trust.mjs",
      "scripts/dice-bootstrap.mjs",
      "scripts/dice-qualify.mjs",
      "scripts/dice-plan-generator.mjs",
      "scripts/dice-sandbox.mjs",
      "scripts/dice-evidence.mjs",
      "scripts/scope-guard.mjs",
      "scripts/verification-drift.mjs",
      "scripts/die-registry-check.mjs",
      "scripts/secret-scan.mjs",
      // Registries
      "registries/dice/mandatory-obligations.json",
      "registries/dice/trusted-profiles.json",
      "registries/dice/trusted-keys.json",
      "registries/dice/registry.json",
    ];

    if (existsSync(join(this.cacheDir, "registries/dice/test-policy.json"))) {
      filesToHash.push("registries/dice/test-policy.json");
    }

    const entries = [];
    const masterHasher = createHash("sha256");

    for (const rel of filesToHash) {
      const p = join(this.cacheDir, rel);
      if (!existsSync(p)) {
        throw new Error(
          `FAIL-CLOSED: Required trusted asset '${rel}' missing from trusted root cache (BLOCKED).`,
        );
      }
      const content = readFileSync(p);
      const fileSha = createHash("sha256").update(content).digest("hex");
      entries.push({ path: rel, sha256: fileSha });

      masterHasher.update(rel);
      masterHasher.update(fileSha);
    }

    const manifest_sha256 = masterHasher.digest("hex");
    const manifest = {
      trusted_commit: this.trustedCommit,
      trusted_tree: this.trustedTree,
      entries,
      manifest_sha256,
    };

    writeFileSync(
      join(this.cacheDir, "policy-manifest.json"),
      canonicalizeJson(manifest),
      "utf8",
    );
    return manifest;
  }

  computePolicyHash() {
    if (this.policyManifest && this.policyManifest.manifest_sha256) {
      return this.policyManifest.manifest_sha256;
    }
    return this.generatePolicyManifest().manifest_sha256;
  }

  getTrustedPath(relPath) {
    validateSafePath(relPath);
    const cached = join(this.cacheDir, relPath);
    if (existsSync(cached)) {
      return cached;
    }
    // STAGE 2.4: Zero candidate-local fallback paths. Missing trusted assets fail closed as BLOCKED.
    throw new Error(
      `FAIL-CLOSED: Trusted asset not found in trusted root cache: ${relPath} (BLOCKED)`,
    );
  }

  loadTrustedJson(relPath) {
    const p = this.getTrustedPath(relPath);
    return JSON.parse(readFileSync(p, "utf8"));
  }

  createCandidateSnapshot(candidateTree, targetDir) {
    validateTreeSha(candidateTree);
    validateSafePath(targetDir);

    mkdirSync(targetDir, { recursive: true });
    safeArchiveExtract(candidateTree, [], targetDir, this.repoRoot);

    // Assert absence of host leaks
    if (existsSync(join(targetDir, ".git"))) {
      throw new Error(
        "SECURITY_VIOLATION: .git directory detected in isolated candidate snapshot",
      );
    }

    return targetDir;
  }

  generateDiffManifest(baseCommit, candidateTree, targetFile) {
    validateCommitSha(baseCommit);
    validateTreeSha(candidateTree);
    if (targetFile) validateSafePath(targetFile);

    const output = execFileSync(
      "git",
      ["diff-tree", "-r", "--name-status", baseCommit, candidateTree],
      {
        cwd: this.repoRoot,
        encoding: "utf8",
      },
    );

    const entries = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const status = parts[0];
      const filePath = parts[parts.length - 1];
      if (filePath) {
        entries.push({ status, path: filePath });
      }
    }

    const manifest = {
      base_commit: baseCommit,
      candidate_tree: candidateTree,
      generated_at: new Date().toISOString(),
      entries,
    };

    if (targetFile) {
      writeFileSync(targetFile, JSON.stringify(manifest, null, 2), "utf8");
    }
    return manifest;
  }

  cleanup() {
    if (existsSync(this.cacheDir)) {
      try {
        rmSync(this.cacheDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export const SIGNER_DISTRIBUTION_FILES = Object.freeze([
  "registries/dice/mandatory-obligations.json",
  "registries/dice/registry.json",
  "registries/dice/test-policy.json",
  "registries/dice/trusted-keys.json",
  "registries/dice/trusted-profiles.json",
  "schemas/dice/domain-pack.schema.json",
  "schemas/dice/evidence-envelope.schema.json",
  "schemas/dice/obl.schema.json",
  "schemas/dice/registry.schema.json",
  "schemas/dice/trusted-profile.schema.json",
  "schemas/dice/xdie.schema.json",
  "scripts/dice-evidence.mjs",
  "scripts/dice-plan-generator.mjs",
  "scripts/dice-qualify.mjs",
  "scripts/dice-root-of-trust.mjs",
  "scripts/dice-signing-service.mjs",
]);

export function computeDistributionDigest(
  baseDir,
  files = SIGNER_DISTRIBUTION_FILES,
) {
  const masterHasher = createHash("sha256");
  const sortedFiles = [...files].sort();
  for (const rel of sortedFiles) {
    const full = join(baseDir, rel);
    if (!existsSync(full)) {
      throw new Error(`FAIL-CLOSED: Missing distribution asset: ${rel}`);
    }
    const content = readFileSync(full);
    const sha = createHash("sha256").update(content).digest("hex");
    masterHasher.update(rel);
    masterHasher.update(sha);
  }
  return masterHasher.digest("hex");
}

export function extractAndVerifySigningDistribution(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const targetDir = options.targetDir || "/tmp/dice-protected-signer";
  const trustedRef = options.trustedRef || null;
  const files = options.files || SIGNER_DISTRIBUTION_FILES;

  validateSafePath(repoRoot);
  validateSafePath(targetDir);

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  mkdirSync(targetDir, { recursive: true });

  if (trustedRef) {
    validateTrustedRef(trustedRef);
    safeArchiveExtract(trustedRef, files, targetDir, repoRoot);
  } else {
    for (const rel of files) {
      validateSafePath(rel, { mustBeRelative: true });
      const src = join(repoRoot, rel);
      if (!existsSync(src)) {
        throw new Error(
          `FAIL-CLOSED: Required verifier distribution file missing: ${rel}`,
        );
      }
      if (lstatSync(src).isSymbolicLink()) {
        throw new Error(
          `FAIL-CLOSED: Distribution asset cannot be a symlink: ${rel}`,
        );
      }
      validateSafePath(src, { baseDir: repoRoot });
      const dest = join(targetDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }

  // Compute test-policy digest
  const testPolicyPath = join(targetDir, "registries/dice/test-policy.json");
  if (!existsSync(testPolicyPath)) {
    throw new Error(
      "FAIL-CLOSED: Authoritative test-policy.json missing from distribution",
    );
  }
  const testPolicyContent = readFileSync(testPolicyPath);
  const testPolicyDigest = createHash("sha256")
    .update(testPolicyContent)
    .digest("hex");

  // Compute canonical distribution digest
  const distributionDigest = computeDistributionDigest(targetDir, files);

  // Digest verification against expected anchors
  const expectedDistDigest =
    options.expectedDistDigest ||
    process.env.DICE_EXPECTED_SIGNER_DIST_DIGEST ||
    null;
  const expectedTestPolicyDigest =
    options.expectedTestPolicyDigest ||
    process.env.DICE_EXPECTED_TEST_POLICY_DIGEST ||
    null;

  if (
    expectedTestPolicyDigest &&
    testPolicyDigest !== expectedTestPolicyDigest
  ) {
    rmSync(targetDir, { recursive: true, force: true });
    throw new Error(
      `FAIL-CLOSED: Test policy digest mismatch! Expected ${expectedTestPolicyDigest}, got ${testPolicyDigest}. Unauthorized policy tampering detected (BLOCKED).`,
    );
  }

  if (expectedDistDigest && distributionDigest !== expectedDistDigest) {
    rmSync(targetDir, { recursive: true, force: true });
    throw new Error(
      `FAIL-CLOSED: Signer distribution digest mismatch! Expected ${expectedDistDigest}, got ${distributionDigest}. Unauthorized signer tampering detected (BLOCKED).`,
    );
  }

  // Write immutable distribution manifest
  const entries = files.map((rel) => {
    const content = readFileSync(join(targetDir, rel));
    return {
      path: rel,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  });

  const manifest = {
    distribution_id: "DICE-VERIFIER-DISTRIBUTION-v2.4.2",
    distribution_digest: distributionDigest,
    test_policy_digest: testPolicyDigest,
    extracted_at: new Date().toISOString(),
    entries,
  };

  writeFileSync(
    join(targetDir, "signer-distribution-manifest.json"),
    canonicalizeJson(manifest),
    "utf8",
  );

  return {
    distributionDigest,
    testPolicyDigest,
    targetDir,
    manifest,
  };
}
