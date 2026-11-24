#!/usr/bin/env node
/**
 * Frame30 Scope Guard
 * Mandatory mechanical gate that compares Git diff against an authorized
 * Feature Change Contract (features/contracts/*.json).
 *
 * Exits with code 0 on compliance, non-zero code on violation.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = process.cwd();

// Helper to convert simple glob (*, **) to RegExp
function globToRegex(pattern) {
  let p = pattern.trim();
  // Escape regex special chars except * and /
  p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Replace ** with .*
  p = p.replace(/\*\*/g, ".*");
  // Replace single * with [^/]*
  p = p.replace(/(?<!\.)\*/g, "[^/]*");
  return new RegExp(`^${p}$`);
}

function matchesAny(path, patterns) {
  for (const pattern of patterns) {
    const re = globToRegex(pattern);
    if (re.test(path)) return pattern;
  }
  return null;
}

// 1. Resolve Contract & Diff Manifest
let contractPath = "";
let diffManifestPath = "";
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--contract=")) {
    contractPath = arg.split("=")[1];
  } else if (arg.startsWith("--diff-manifest=")) {
    diffManifestPath = arg.split("=")[1];
  } else if (!arg.startsWith("--") && !contractPath) {
    contractPath = arg;
  }
}
if (!diffManifestPath && process.env.DIFF_MANIFEST) {
  diffManifestPath = process.env.DIFF_MANIFEST;
}

if (!contractPath) {
  if (process.env.ACTIVE_CHANGE_CONTRACT) {
    contractPath = process.env.ACTIVE_CHANGE_CONTRACT;
  } else {
    // Dynamic contract discovery across contracts in features/contracts/
    const contractsDir = join(REPO_ROOT, "features/contracts");
    let currentHead = "";
    try {
      currentHead = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {}

    if (existsSync(contractsDir)) {
      const contractFiles = readdirSync(contractsDir).filter(
        (f) =>
          f.endsWith(".json") &&
          f !== "schema.json" &&
          f !== "component-ledger.json" &&
          f !== "verification-manifest.json",
      );

      // Prioritize amendments first so active amendments take precedence over base contracts
      contractFiles.sort((a, b) => {
        const aIsAmend = a.includes("-AMEND");
        const bIsAmend = b.includes("-AMEND");
        if (aIsAmend && !bIsAmend) return -1;
        if (!aIsAmend && bIsAmend) return 1;
        return a.localeCompare(b);
      });

      for (const c of contractFiles) {
        const p = join(contractsDir, c);
        try {
          const parsed = JSON.parse(readFileSync(p, "utf8"));
          const base = parsed.base_commit || parsed.baseline_commit;
          if (base === currentHead) {
            contractPath = `features/contracts/${c}`;
            break;
          }
        } catch {}
      }
    }

    if (!contractPath) {
      if (existsSync(join(contractsDir, "F30-DICE-REV2-3-AMEND1.json"))) {
        contractPath = "features/contracts/F30-DICE-REV2-3-AMEND1.json";
      } else if (existsSync(join(contractsDir, "F30-DICE-REV2-3.json"))) {
        contractPath = "features/contracts/F30-DICE-REV2-3.json";
      } else if (existsSync(join(contractsDir, "FRAME30-CMS-CORE.json"))) {
        contractPath = "features/contracts/FRAME30-CMS-CORE.json";
      } else if (existsSync(join(contractsDir, "FRAME30-SDLC-000.json"))) {
        contractPath = "features/contracts/FRAME30-SDLC-000.json";
      } else {
        contractPath = "features/contracts/pilot-workstreams-ab.json";
      }
    }
  }
}
const fullContractPath = resolve(REPO_ROOT, contractPath);

if (!existsSync(fullContractPath)) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Authorized change contract not found at: ${contractPath}`,
  );
  process.exit(1);
}

let contract;
try {
  contract = JSON.parse(readFileSync(fullContractPath, "utf8"));
} catch (err) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Malformed change contract JSON: ${err.message}`,
  );
  process.exit(1);
}

const contractId = contract.change_id || contract.feature_id || "UNKNOWN";
const baseCommit = contract.base_commit || contract.baseline_commit;

console.log(
  `[scope-guard] Loaded change contract: ${contractId} ("${contract.title}")`,
);
console.log(`[scope-guard] Baseline Commit: ${baseCommit}`);
console.log(`[scope-guard] Human Owner: ${contract.owner}`);

if (!baseCommit) {
  console.error(
    "[scope-guard] ✗ FAIL-CLOSED: Contract does not declare base_commit or baseline_commit.",
  );
  process.exit(1);
}

// 2. Validate Baseline Commit & Collect Touched Files
const touched = new Map(); // path -> status (M, A, D, R, etc.)

if (diffManifestPath) {
  const fullManifestPath = resolve(REPO_ROOT, diffManifestPath);
  if (!existsSync(fullManifestPath)) {
    console.error(`[scope-guard] ✗ FAIL-CLOSED: Diff manifest not found at ${fullManifestPath}`);
    process.exit(1);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(fullManifestPath, "utf8"));
  } catch (err) {
    console.error(`[scope-guard] ✗ FAIL-CLOSED: Malformed diff manifest JSON: ${err.message}`);
    process.exit(1);
  }
  if (manifest.base_commit && manifest.base_commit !== baseCommit) {
    console.error(
      `[scope-guard] ✗ FAIL-CLOSED: Diff manifest base_commit (${manifest.base_commit}) does not match contract baseline (${baseCommit})`,
    );
    process.exit(1);
  }
  for (const entry of manifest.entries || []) {
    if (entry && entry.path) {
      touched.set(entry.path, entry.status || "M");
    }
  }
} else {
  // Standalone execution: query git history directly
  try {
    execSync(`git rev-parse --verify ${baseCommit}^{commit}`, {
      stdio: "ignore",
    });
  } catch {
    console.error(
      `[scope-guard] ✗ FAIL-CLOSED: Baseline commit ${baseCommit} does not exist in git history.`,
    );
    process.exit(1);
  }

  function recordDiff(command) {
    try {
      const output = execSync(command, { encoding: "utf8" });
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        const status = parts[0];
        const filePath = parts[parts.length - 1]; // handles renames (R100 old new)
        if (filePath) {
          touched.set(filePath, status);
        }
      }
    } catch (err) {
      console.error(`[scope-guard] Error executing ${command}: ${err.message}`);
      process.exit(1);
    }
  }

  // Diff between baseline commit and HEAD
  recordDiff(`git diff --name-status ${baseCommit}...HEAD`);

  // Also include uncommitted unstaged and staged changes if any
  recordDiff("git diff --name-status HEAD");
  recordDiff("git diff --cached --name-status");

  // Include untracked files
  try {
    const untracked = execSync("git ls-files --others --exclude-standard", {
      encoding: "utf8",
    });
    for (const line of untracked.split("\n")) {
      const p = line.trim();
      if (p) touched.set(p, "A(untracked)");
    }
  } catch (err) {
    console.error(`[scope-guard] Error checking untracked files: ${err.message}`);
  }
}

console.log(
  `[scope-guard] Total paths evaluated against scope: ${touched.size}`,
);

if (touched.size === 0) {
  console.log(
    "[scope-guard] ✓ No files changed relative to baseline. Scope check passed.",
  );
  process.exit(0);
}

// 4. Evaluate touched paths against allowed and forbidden patterns
const allowedPatterns = contract.allowed_file_changes || [];
const forbiddenPatterns = contract.forbidden_file_changes || [];

let violations = [];

for (const [filePath, status] of touched.entries()) {

  // Check forbidden first
  const forbiddenMatch = matchesAny(filePath, forbiddenPatterns);
  if (forbiddenMatch) {
    violations.push({
      path: filePath,
      status,
      reason: `Explicitly forbidden by rule: '${forbiddenMatch}'`,
    });
    continue;
  }

  // Check allowed
  const allowedMatch = matchesAny(filePath, allowedPatterns);
  if (!allowedMatch) {
    violations.push({
      path: filePath,
      status,
      reason:
        "Unauthorized file modification: path not present in allowed_file_changes allowlist",
    });
  }
}

// 5. Report Findings
if (violations.length > 0) {
  console.error("\n=======================================================");
  console.error("  [scope-guard] ✗ SCOPE VIOLATIONS DETECTED (FAIL-CLOSED)");
  console.error("=======================================================");
  for (const v of violations) {
    console.error(`  [${v.status}] ${v.path}`);
    console.error(`      -> ${v.reason}`);
  }
  console.error(
    "\nAutonomous modification outside the approved change contract is strictly forbidden.",
  );
  console.error(
    "To modify these paths, obtain human authorization and submit an approved scope amendment.\n",
  );
  process.exit(1);
}

console.log(
  "[scope-guard] ✓ All touched paths strictly conform to authorized change contract.",
);
console.log(
  `[scope-guard] ✓ Verified ${touched.size} changed files. Scope guard PASSED.\n`,
);
process.exit(0);
