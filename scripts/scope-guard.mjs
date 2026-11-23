#!/usr/bin/env node
/**
 * Frame30 Scope Guard
 * Mandatory mechanical gate that compares Git diff against an authorized
 * Feature Change Contract (features/contracts/*.json).
 *
 * Exits with code 0 on compliance, non-zero code on violation.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
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

// 1. Resolve Contract
let contractPath = "";
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--contract=")) {
    contractPath = arg.split("=")[1];
  } else if (!arg.startsWith("--") && !contractPath) {
    contractPath = arg;
  }
}

if (!contractPath) {
  if (process.env.ACTIVE_CHANGE_CONTRACT) {
    contractPath = process.env.ACTIVE_CHANGE_CONTRACT;
  } else if (
    existsSync(join(REPO_ROOT, "features/contracts/FRAME30-SDLC-000.json"))
  ) {
    contractPath = "features/contracts/FRAME30-SDLC-000.json";
  } else {
    contractPath = "features/contracts/pilot-workstreams-ab.json";
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

// 2. Validate Baseline Commit
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

// 3. Collect Touched Files
const touched = new Map(); // path -> status (M, A, D, R, etc.)

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
