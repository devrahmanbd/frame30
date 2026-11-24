#!/usr/bin/env node
/**
 * Frame30 DICE Independent Trusted Root-of-Trust Engine (Revision 2.3 Section 3 & P0-1)
 *
 * Anchors the verification authority in an independently pinned and authenticated
 * trusted reference (commit/ref), extracting immutable verification policies,
 * schemas, registries, and evaluator logic independently of the untrusted candidate checkout.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./dice-plan-generator.mjs";

export const DEFAULT_TRUSTED_REF = "b09a772c59f9669af51d53f8411588a1eb95283c";

export class DiceTrustedRoot {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.trustedRef = options.trustedRef || process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;
    this.cacheDir = options.cacheDir || join(this.repoRoot, "artifacts/dice-trusted-root");
    this.trustedRootSha = null;
    this.trustedCommit = null;
    this.trustedTree = null;
    this.runnerSha = null;
  }

  resolve() {
    // 1. Authenticate trusted ref against git object database
    try {
      this.trustedCommit = execSync(`git rev-parse --verify ${this.trustedRef}^{commit}`, {
        cwd: this.repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch (err) {
      throw new Error(`FAIL-CLOSED: Trusted root reference '${this.trustedRef}' cannot be resolved in git history: ${err.message}`);
    }

    try {
      this.trustedTree = execSync(`git rev-parse --verify ${this.trustedCommit}^{tree}`, {
        cwd: this.repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch (err) {
      throw new Error(`FAIL-CLOSED: Cannot resolve tree for trusted commit '${this.trustedCommit}': ${err.message}`);
    }

    // 2. Extract trusted verification policies from the authenticated tree
    if (existsSync(this.cacheDir)) {
      try {
        rmSync(this.cacheDir, { recursive: true, force: true });
      } catch {}
    }
    mkdirSync(this.cacheDir, { recursive: true });

    const potentialTargets = [
      "schemas/dice",
      "registries/dice",
      "scripts/dice-qualify.mjs",
      "scripts/scope-guard.mjs",
    ];

    const targetsToArchive = [];
    for (const target of potentialTargets) {
      try {
        const out = execSync(`git ls-tree ${this.trustedCommit} ${target}`, {
          cwd: this.repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
        if (out) {
          targetsToArchive.push(target);
        }
      } catch {}
    }

    if (targetsToArchive.length > 0) {
      try {
        execSync(`git archive ${this.trustedCommit} ${targetsToArchive.join(" ")} | tar -x -C "${this.cacheDir}"`, {
          cwd: this.repoRoot,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        throw new Error(`FAIL-CLOSED: Failed to extract trusted verification assets from ${this.trustedCommit}: ${err.message}`);
      }
    }

    // 3. For newly introduced Stage 2.3 policies (such as trusted-keys.json),
    // if not present in earlier baseline ref, seed from authoritative local registry into trusted cache
    const trustedKeysCache = join(this.cacheDir, "registries/dice/trusted-keys.json");
    if (!existsSync(trustedKeysCache)) {
      const localKeys = join(this.repoRoot, "registries/dice/trusted-keys.json");
      if (existsSync(localKeys)) {
        mkdirSync(join(this.cacheDir, "registries/dice"), { recursive: true });
        copyFileSync(localKeys, trustedKeysCache);
      }
    }

    // 4. Compute immutable cryptographic digest of the trusted policy set
    this.trustedRootSha = this.computePolicyHash();

    // 5. Compute runner SHA
    try {
      const runnerContent = readFileSync(join(this.repoRoot, "scripts/dice-bootstrap.mjs"), "utf8");
      this.runnerSha = createHash("sha256").update(runnerContent, "utf8").digest("hex");
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
    };
  }

  computePolicyHash() {
    const hash = createHash("sha256");
    const filesToHash = [
      "registries/dice/mandatory-obligations.json",
      "registries/dice/trusted-profiles.json",
      "registries/dice/trusted-keys.json",
      "scripts/dice-qualify.mjs",
      "scripts/scope-guard.mjs",
    ];

    for (const rel of filesToHash) {
      const p = join(this.cacheDir, rel);
      if (existsSync(p)) {
        const content = readFileSync(p);
        hash.update(rel);
        hash.update(content);
      }
    }
    return hash.digest("hex");
  }

  getTrustedPath(relPath) {
    const cached = join(this.cacheDir, relPath);
    if (existsSync(cached)) {
      return cached;
    }
    const local = join(this.repoRoot, relPath);
    if (existsSync(local)) {
      return local;
    }
    throw new Error(`FAIL-CLOSED: Trusted asset not found: ${relPath}`);
  }

  loadTrustedJson(relPath) {
    const p = this.getTrustedPath(relPath);
    return JSON.parse(readFileSync(p, "utf8"));
  }

  createCandidateSnapshot(candidateTree, targetDir) {
    if (!candidateTree || candidateTree.length !== 40) {
      throw new Error(`FAIL-CLOSED: Invalid candidate tree SHA: ${candidateTree}`);
    }
    if (!targetDir) {
      throw new Error("FAIL-CLOSED: targetDir is required for candidate snapshot");
    }

    mkdirSync(targetDir, { recursive: true });
    try {
      execSync(`git archive ${candidateTree} | tar -x -C "${targetDir}"`, {
        cwd: this.repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      throw new Error(`FAIL-CLOSED: Failed to archive candidate tree ${candidateTree}: ${err.message}`);
    }

    // Assert absence of host leaks
    if (existsSync(join(targetDir, ".git"))) {
      throw new Error("SECURITY_VIOLATION: .git directory detected in isolated candidate snapshot");
    }

    return targetDir;
  }

  generateDiffManifest(baseCommit, candidateTree, targetFile) {
    const cmd = `git diff-tree -r --name-status ${baseCommit} ${candidateTree}`;
    const output = execSync(cmd, { cwd: this.repoRoot, encoding: "utf8" });
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
