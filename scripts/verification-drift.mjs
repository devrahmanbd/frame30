#!/usr/bin/env node
/**
 * Frame30 Verification Drift Gate
 * Asserts that formal models and property suites remain in exact synchronization
 * with the production source code they model. Fails closed if production code
 * diverges from the verified SHA-256 signatures.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = join(REPO_ROOT, "features/contracts/verification-manifest.json");

const COVERED_MAPPINGS = [
  {
    productionFile: "src/lib/collection-composition.ts",
    formalArtifact: "specs/bend/LAWS.bend (Law 4 & 5) + fast-check",
    domain: "Collection Merchandising & Self-Exclusion"
  },
  {
    productionFile: "src/components/store/CollectionView.tsx",
    formalArtifact: "src/lib/themes/collection-composition-properties.test.ts",
    domain: "Storefront Collection Merchandising"
  },
  {
    productionFile: "src/components/store/ThemePreviewFrame.tsx",
    formalArtifact: "src/components/store/songoskriti-preview-compositions.test.tsx",
    domain: "Theme Preview Composition Parity"
  },
  {
    productionFile: "src/lib/responsive.ts",
    formalArtifact: "specs/bend/LAWS.bend (Law 1, 2, 3) + specs/tla/ResponsiveAutosave.tla",
    domain: "Responsive Breakpoint Cascade & Override Reset"
  },
  {
    productionFile: "src/lib/builder-ast.ts",
    formalArtifact: "specs/tla/ResponsiveAutosave.tla",
    domain: "Theme Builder AST & Breakpoint Storage"
  },
  {
    productionFile: "specs/bend/LAWS.bend",
    formalArtifact: "specs/bend/PROOF.bend",
    domain: "Bend 2 Human-Owned Correctness Laws"
  },
  {
    productionFile: "specs/tla/ResponsiveAutosave.tla",
    formalArtifact: "specs/tla/ResponsiveAutosave.cfg",
    domain: "TLA+ Responsive Autosave Concurrency Model"
  },
  {
    productionFile: "src/lib/editor/editor.server.ts",
    formalArtifact: "specs/lean/Framique/CmsLifecycle.lean + specs/tla/CmsContentLifecycle.tla",
    domain: "CMS Content Lifecycle & Optimistic Concurrency"
  },
  {
    productionFile: "specs/tla/CmsContentLifecycle.tla",
    formalArtifact: "specs/tla/CmsContentLifecycle.cfg",
    domain: "TLA+ CMS Content Lifecycle & Tenant Boundary Model"
  },
  {
    productionFile: "specs/lean/Framique/CmsLifecycle.lean",
    formalArtifact: "src/lib/cms-lifecycle.test.ts",
    domain: "Lean 4 CMS Lifecycle Machine Proofs"
  }
];

function sha256(filePath) {
  const content = readFileSync(join(REPO_ROOT, filePath));
  return createHash("sha256").update(content).digest("hex");
}

const isSyncMode = process.argv.includes("--sync");

console.log("[verification-drift] Checking formal verification correspondence to production source...");

let currentCommit = "";
let currentTree = "";
try {
  currentCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  currentTree = execSync("git rev-parse HEAD^{tree}", { encoding: "utf8" }).trim();
} catch {
  currentCommit = "UNKNOWN";
  currentTree = "UNKNOWN";
}

if (isSyncMode) {
  const manifest = {
    synchronized_at: new Date().toISOString(),
    source_commit: currentCommit,
    source_tree: currentTree,
    covered_sources: COVERED_MAPPINGS.map(m => ({
      path: m.productionFile,
      sha256: sha256(m.productionFile),
      formalArtifact: m.formalArtifact,
      domain: m.domain
    }))
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`[verification-drift] ✓ Manifest synchronized to commit ${currentCommit} at ${MANIFEST_PATH}`);
  process.exit(0);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`[verification-drift] ✗ FAIL-CLOSED: Verification manifest missing at ${MANIFEST_PATH}`);
  console.error("Run 'node scripts/verification-drift.mjs --sync' to establish initial verified baseline.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
} catch (err) {
  console.error(`[verification-drift] ✗ FAIL-CLOSED: Malformed verification manifest: ${err.message}`);
  process.exit(1);
}

let driftCount = 0;
console.log(`[verification-drift] Baseline Synchronization Commit: ${manifest.source_commit}`);

for (const entry of manifest.covered_sources) {
  if (!existsSync(join(REPO_ROOT, entry.path))) {
    console.error(`  ✗ Missing covered source file: ${entry.path}`);
    driftCount++;
    continue;
  }
  const currentHash = sha256(entry.path);
  if (currentHash !== entry.sha256) {
    console.error(`  ✗ VERIFICATION DRIFT DETECTED: ${entry.path}`);
    console.error(`      Recorded Verified SHA: ${entry.sha256}`);
    console.error(`      Current Source SHA:    ${currentHash}`);
    console.error(`      Affected Formal Artifact: ${entry.formalArtifact}`);
    driftCount++;
  } else {
    console.log(`  ✓ ${entry.path} matches verified model state (${entry.sha256.slice(0, 12)}...)`);
  }
}

if (driftCount > 0) {
  console.error(`\n[verification-drift] ✗ FAIL-CLOSED: ${driftCount} covered files have diverged from verified models.`);
  console.error("A stale model that passes against outdated code is an unacceptable false sense of security.");
  console.error("Update and re-verify the formal proofs/models, then run with --sync after human authorization.\n");
  process.exit(1);
}

console.log("[verification-drift] SUCCESS: All production sources match verified formal model specifications with 0 drift.\n");
process.exit(0);
