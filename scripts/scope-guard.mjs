#!/usr/bin/env node
/**
 * Frame30 Scope Guard
 * Mandatory mechanical gate that compares Git diff against an authorized
 * Feature Change Contract (features/contracts/*.json).
 *
 * Exits with code 0 on compliance, non-zero code on violation.
 *
 * Stage 2.4:
 * - Complete removal of shell command interpolation (execFileSync with argument arrays).
 * - Validation of commit SHA and contract paths against injection.
 * - Support for --target-dir parameter.
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  existsSync,
  readdirSync,
  lstatSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

function validateCommitSha(sha) {
  if (!sha || typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha.trim())) {
    throw new Error(
      `[scope-guard] ✗ FAIL-CLOSED: Malformed commit SHA: ${JSON.stringify(sha)}`,
    );
  }
  return sha.trim();
}

function validateSafePath(p) {
  if (
    !p ||
    typeof p !== "string" ||
    p.includes("\0") ||
    p.includes("\n") ||
    p.includes("\r")
  ) {
    throw new Error(
      `[scope-guard] ✗ FAIL-CLOSED: Malformed path: ${JSON.stringify(p)}`,
    );
  }
  return p;
}

// Helper to convert simple glob (*, **) to RegExp
function globToRegex(pattern) {
  let p = pattern.trim();
  p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  p = p.replace(/\*\*/g, ".*");
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

// 1. Resolve Parameters
let targetRoot = process.cwd();
let contractPath = "";
let diffManifestPath = "";
let expectedContractDigest = "";

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--contract=")) {
    contractPath = arg.split("=")[1];
  } else if (arg.startsWith("--contract-digest=")) {
    expectedContractDigest = arg.split("=")[1].trim().toLowerCase();
  } else if (arg.startsWith("--diff-manifest=")) {
    diffManifestPath = arg.split("=")[1];
  } else if (arg.startsWith("--target-dir=")) {
    targetRoot = arg.split("=")[1];
  } else if (!arg.startsWith("--") && !contractPath) {
    contractPath = arg;
  }
}

validateSafePath(targetRoot);

if (!diffManifestPath && process.env.DIFF_MANIFEST) {
  diffManifestPath = process.env.DIFF_MANIFEST;
}

if (!contractPath) {
  if (process.env.ACTIVE_CHANGE_CONTRACT) {
    contractPath = process.env.ACTIVE_CHANGE_CONTRACT;
  } else {
    const contractsDir = join(targetRoot, "features/contracts");
    let currentHead = "";
    try {
      currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: targetRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {}

    if (existsSync(contractsDir)) {
      const contractFiles = readdirSync(contractsDir).filter(
        (f) =>
          f.endsWith(".json") &&
          f !== "schema.json" &&
          f !== "component-ledger.json" &&
          f !== "verification-manifest.json",
      );

      contractFiles.sort((a, b) => {
        const aIsComplete = a.includes("COMPLETE");
        const bIsComplete = b.includes("COMPLETE");
        if (aIsComplete && !bIsComplete) return -1;
        if (!aIsComplete && bIsComplete) return 1;
        const aIsStage241 = a.includes("STAGE2-4-1");
        const bIsStage241 = b.includes("STAGE2-4-1");
        if (aIsStage241 && !bIsStage241) return -1;
        if (!aIsStage241 && bIsStage241) return 1;
        const aIsStage24 = a.includes("STAGE2-4");
        const bIsStage24 = b.includes("STAGE2-4");
        if (aIsStage24 && !bIsStage24) return -1;
        if (!aIsStage24 && bIsStage24) return 1;
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
      if (existsSync(join(contractsDir, "F30-DICE-COMPLETE.json"))) {
        contractPath = "features/contracts/F30-DICE-COMPLETE.json";
      } else if (existsSync(join(contractsDir, "F30-DICE-STAGE2-4-1.json"))) {
        contractPath = "features/contracts/F30-DICE-STAGE2-4-1.json";
      } else if (existsSync(join(contractsDir, "F30-DICE-STAGE2-4.json"))) {
        contractPath = "features/contracts/F30-DICE-STAGE2-4.json";
      } else if (existsSync(join(contractsDir, "F30-DICE-STAGE2-3.json"))) {
        contractPath = "features/contracts/F30-DICE-STAGE2-3.json";
      } else if (
        existsSync(join(contractsDir, "F30-DICE-REV2-3-AMEND1.json"))
      ) {
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

validateSafePath(contractPath);
const fullContractPath = resolve(targetRoot, contractPath);

if (!existsSync(fullContractPath)) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Authorized change contract not found at: ${contractPath}`,
  );
  process.exit(1);
}

// Intra-sandbox contract integrity and digest verification (P0-1)
const contractLstat = lstatSync(fullContractPath);
if (contractLstat.isSymbolicLink()) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Contract path is a symbolic link: ${contractPath}`,
  );
  process.exit(1);
}
const contractStat = statSync(fullContractPath);
if (!contractStat.isFile()) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Contract path must be a regular file: ${contractPath}`,
  );
  process.exit(1);
}

const contractRawBuffer = readFileSync(fullContractPath);
const actualContractDigest = createHash("sha256")
  .update(contractRawBuffer)
  .digest("hex");

if (expectedContractDigest && actualContractDigest !== expectedContractDigest) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Intra-sandbox contract digest mismatch: expected ${expectedContractDigest}, got ${actualContractDigest}`,
  );
  process.exit(1);
}

let contract;
try {
  contract = JSON.parse(contractRawBuffer.toString("utf8"));
} catch (err) {
  console.error(
    `[scope-guard] ✗ FAIL-CLOSED: Malformed change contract JSON: ${err.message}`,
  );
  process.exit(1);
}

const contractId = contract.change_id || contract.feature_id || "UNKNOWN";
const rawBaseCommit = contract.base_commit || contract.baseline_commit;

if (!rawBaseCommit) {
  console.error(
    "[scope-guard] ✗ FAIL-CLOSED: Contract does not declare base_commit or baseline_commit.",
  );
  process.exit(1);
}

const baseCommit = validateCommitSha(rawBaseCommit);

console.log(
  `[scope-guard] Loaded change contract: ${contractId} ("${contract.title}")`,
);
console.log(`[scope-guard] Baseline Commit: ${baseCommit}`);
console.log(`[scope-guard] Human Owner: ${contract.owner}`);

// 2. Validate Baseline Commit & Collect Touched Files
const touched = new Map(); // path -> status (M, A, D, R, etc.)

if (diffManifestPath) {
  validateSafePath(diffManifestPath);
  const fullManifestPath = resolve(targetRoot, diffManifestPath);
  if (!existsSync(fullManifestPath)) {
    console.error(
      `[scope-guard] ✗ FAIL-CLOSED: Diff manifest not found at ${fullManifestPath}`,
    );
    process.exit(1);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(fullManifestPath, "utf8"));
  } catch (err) {
    console.error(
      `[scope-guard] ✗ FAIL-CLOSED: Malformed diff manifest JSON: ${err.message}`,
    );
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
  // Standalone execution: query git history directly via execFileSync
  try {
    execFileSync("git", ["rev-parse", "--verify", `${baseCommit}^{commit}`], {
      cwd: targetRoot,
      stdio: "ignore",
    });
  } catch {
    // In shallow CI checkouts, attempt to fetch the baseline commit directly from origin
    try {
      execFileSync("git", ["fetch", "--depth=50", "origin", baseCommit], {
        cwd: targetRoot,
        stdio: "ignore",
      });
      execFileSync("git", ["rev-parse", "--verify", `${baseCommit}^{commit}`], {
        cwd: targetRoot,
        stdio: "ignore",
      });
    } catch {
      console.error(
        `[scope-guard] ✗ FAIL-CLOSED: Baseline commit ${baseCommit} does not exist in git history.`,
      );
      process.exit(1);
    }
  }

  function recordDiff(args) {
    try {
      const output = execFileSync("git", args, {
        cwd: targetRoot,
        encoding: "utf8",
      });
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        const status = parts[0];
        const filePath = parts[parts.length - 1]; // handles renames
        if (filePath) {
          touched.set(filePath, status);
        }
      }
    } catch (err) {
      console.error(
        `[scope-guard] Error executing git ${args.join(" ")}: ${err.message}`,
      );
      process.exit(1);
    }
  }

  // Diff between baseline commit and HEAD
  recordDiff(["diff", "--name-status", `${baseCommit}...HEAD`]);

  // Also include uncommitted unstaged and staged changes if any
  recordDiff(["diff", "--name-status", "HEAD"]);
  recordDiff(["diff", "--cached", "--name-status"]);

  // Include untracked files
  try {
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      {
        cwd: targetRoot,
        encoding: "utf8",
      },
    );
    for (const line of untracked.split("\n")) {
      const p = line.trim();
      if (p && !p.startsWith(".test-tmp")) touched.set(p, "A(untracked)");
    }
  } catch (err) {
    console.error(
      `[scope-guard] Error checking untracked files: ${err.message}`,
    );
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
