#!/usr/bin/env node
/**
 * Frame30 DICE Stage 2 Bootstrap Runner (Revision 2.3)
 * Orchestrates frozen plan compilation, schema validation, dependency resolution,
 * sandbox pre-flight, and qualification reporting.
 *
 * INVIOLABLE LAW: Zero synthetic PASS receipts. Dry-run mode is strictly non-qualifying
 * (DRY_RUN_NON_AUTHORITATIVE) and never emits an authoritative attestation envelope.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
import { generateFrozenPlan, computePlanHash } from "./dice-plan-generator.mjs";
import { DiceSandbox } from "./dice-sandbox.mjs";
import { evaluateCandidateQualification } from "./dice-qualify.mjs";

const REPO_ROOT = process.cwd();

// Parse CLI flags
let isDryRun = false;
let contractPath = "features/contracts/F30-DICE-REV2-3.json";

for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") {
    isDryRun = true;
  } else if (arg.startsWith("--contract=")) {
    contractPath = arg.split("=")[1];
  }
}

console.log("===============================================================================");
console.log("  FRAME30 UNIVERSAL VERIFICATION MOULD (DICE) — STAGE 2 BOOTSTRAP HARNESS");
console.log("  Normative Standard: F30-DICE-ARCH-001 Revision 2.3 (Ratified)");
console.log(`  Execution Mode: ${isDryRun ? "DRY RUN (Non-Authoritative / Non-Mutating)" : "ACTIVE BOOTSTRAP"}`);
console.log(`  Change Contract: ${contractPath}`);
console.log("===============================================================================\n");

// Step 0: Contract Verification & Candidate Tree Discovery
const fullContractPath = resolve(REPO_ROOT, contractPath);
if (!existsSync(fullContractPath)) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Change contract not found at ${fullContractPath}`);
  process.exit(1);
}

let contract;
try {
  contract = JSON.parse(readFileSync(fullContractPath, "utf8"));
} catch (err) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Malformed contract JSON: ${err.message}`);
  process.exit(1);
}

if (contract.approval_state !== "approved") {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Contract approval_state is '${contract.approval_state}', expected 'approved'`);
  process.exit(1);
}

console.log(`[dice-bootstrap] Step 0: Contract verified: ${contract.change_id} ("${contract.title}")`);

// Discover live candidate commit and tree SHA from git
let candidateCommit = "0000000000000000000000000000000000000000";
let candidateTree = "0000000000000000000000000000000000000000";

try {
  candidateCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  if (!status) {
    candidateTree = execSync("git rev-parse HEAD^{tree}", { encoding: "utf8" }).trim();
  } else {
    const tmpIndex = execSync("mktemp", { encoding: "utf8" }).trim();
    try {
      execSync(`GIT_INDEX_FILE="${tmpIndex}" git read-tree HEAD`, { stdio: "ignore" });
      execSync(`GIT_INDEX_FILE="${tmpIndex}" git add -A`, { stdio: "ignore" });
      candidateTree = execSync(`GIT_INDEX_FILE="${tmpIndex}" git write-tree`, { encoding: "utf8" }).trim();
    } finally {
      try { execSync(`rm -f "${tmpIndex}"`, { stdio: "ignore" }); } catch {}
    }
  }
} catch (err) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Unable to inspect git repository: ${err.message}`);
  process.exit(1);
}

console.log(`  ✓ Candidate Commit: ${candidateCommit}`);
console.log(`  ✓ Candidate Tree:   ${candidateTree}`);

// Step 1: Validate Normative Schemas and Persistent Registries under Draft 2020-12
console.log("\n[dice-bootstrap] Step 1: Validating 6 Normative Schemas & Registries under Draft 2020-12 (strict: true)...");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const schemaFiles = [
  "obl.schema.json",
  "xdie.schema.json",
  "domain-pack.schema.json",
  "registry.schema.json",
  "trusted-profile.schema.json",
  "evidence-envelope.schema.json",
];

for (const f of schemaFiles) {
  const p = join(REPO_ROOT, "schemas/dice", f);
  if (!existsSync(p)) {
    console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Missing schema at ${p}`);
    process.exit(1);
  }
  const s = JSON.parse(readFileSync(p, "utf8"));
  ajv.addSchema(s);
  console.log(`  ✓ Schema loaded: ${f}`);
}

// Validate registries/dice/registry.json against registry.schema.json
const registryPath = join(REPO_ROOT, "registries/dice/registry.json");
const registrySchema = ajv.getSchema("https://framique.com/schemas/registry.schema.json");
if (!existsSync(registryPath) || !registrySchema(JSON.parse(readFileSync(registryPath, "utf8")))) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Master registry fails schema validation`);
  process.exit(1);
}
console.log("  ✓ Master registry validated against registry.schema.json");

// Validate registries/dice/mandatory-obligations.json against obl.schema.json
const mandatoryPath = join(REPO_ROOT, "registries/dice/mandatory-obligations.json");
const oblSchema = ajv.getSchema("https://framique.com/schemas/obl.schema.json");
const mandatoryList = JSON.parse(readFileSync(mandatoryPath, "utf8"));
for (const ob of mandatoryList) {
  if (!oblSchema(ob)) {
    console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Mandatory obligation ${ob.obligation_id} violates schema:`, oblSchema.errors);
    process.exit(1);
  }
}
console.log(`  ✓ All ${mandatoryList.length} mandatory baseline obligations validated against obl.schema.json`);

// Step 2: Compile Frozen Verification Plan
console.log("\n[dice-bootstrap] Step 2: Compiling Immutable Frozen Verification Plan P_C...");
const planResult = generateFrozenPlan({
  candidateCommit,
  candidateTree,
  selectedObligations: [], // Mandatory baseline automatically populated
});

console.log(`  ✓ Frozen Plan compiled successfully`);
console.log(`  ✓ Plan SHA-256: ${planResult.planHash}`);
console.log(`  ✓ Mandatory Baseline Obligations: ${planResult.plan.obligations.mandatory.length}`);
console.log(`  ✓ Active Obligations: ${planResult.plan.obligations.active.join(", ")}`);

// Step 3: Sandbox Pre-Flight Check
console.log("\n[dice-bootstrap] Step 3: Performing OS Sandbox Substrate Pre-Flight...");
const sandbox = new DiceSandbox();
const envStatus = sandbox.validateEnvironment(!isDryRun);
console.log(`  ✓ Host Platform: ${process.platform} (${process.arch})`);
console.log(`  ✓ Sandbox Substrate Status: ${envStatus.status}`);

// Step 4: Execution / Qualification Evaluation
console.log("\n[dice-bootstrap] Step 4: Verification Execution & Qualification Assessment...");

if (isDryRun) {
  console.log("  [DRY RUN NOTICE] Zero obligations executed. No synthetic PASS receipts generated.");
  console.log("  ✓ Status: DRY_RUN_NON_AUTHORITATIVE");
  console.log("  ✓ Qualified Claims: 0 (No attestation envelope generated in dry-run mode)");
  console.log("\n===============================================================================");
  console.log("  [dice-bootstrap] ✓ STAGE 2 BOOTSTRAP DRY-RUN COMPLETED (NON-AUTHORITATIVE)");
  console.log("===============================================================================\n");
  process.exit(0);
}

// Active Bootstrap Execution: Execute Genuine Obligations
if (process.platform === "darwin") {
  console.error("  ✗ FAIL-CLOSED: Authoritative hostile worker execution on macOS is strictly BLOCKED (Invariant 5).");
  console.error("    macOS lacks Linux PID namespaces; execution cannot guarantee descendant process reaping.");
  console.error("    Authoritative DICE qualification must execute on Linux with Bubblewrap (CircleCI job: dice-qualification).");
  process.exit(1);
}

// Execute active baseline obligations
console.log("[dice-bootstrap] Executing active mandatory baseline obligations...");
const authenticReceipts = [];

const obligationCommands = {
  "OBL-SYS-SCOPE-GUARD-001": `node scripts/scope-guard.mjs --contract=${contractPath}`,
  "OBL-SYS-DRIFT-GUARD-001": `node scripts/verification-drift.mjs`,
  "OBL-SYS-DIE-REGISTRY-001": `node scripts/die-registry-check.mjs`,
  "OBL-SYS-SECRETS-SCAN-001": `node scripts/secret-scan.mjs`,
};

for (const obId of planResult.plan.obligations.active) {
  const cmd = obligationCommands[obId];
  if (!cmd) {
    console.error(`  ✗ FAIL-CLOSED: No execution command configured for active obligation ${obId}`);
    authenticReceipts.push({
      obligation_id: obId,
      status: "BLOCKED",
      tree_sha: candidateTree,
      diagnostics: `No execution command configured for ${obId}`,
    });
    continue;
  }

  console.log(`  -> Executing ${obId}: ${cmd}`);
  try {
    const stdout = execSync(cmd, { encoding: "utf8", cwd: REPO_ROOT });
    authenticReceipts.push({
      obligation_id: obId,
      status: "PASS",
      tree_sha: candidateTree,
      diagnostics: stdout.slice(0, 500),
    });
    console.log(`     ✓ PASS`);
  } catch (err) {
    authenticReceipts.push({
      obligation_id: obId,
      status: "FAIL",
      tree_sha: candidateTree,
      diagnostics: (err.stdout || err.stderr || err.message).slice(0, 500),
    });
    console.error(`     ✗ FAIL (exit code ${err.status})`);
  }
}

// Evaluate Qualification with Authentic Receipts
console.log("\n[dice-bootstrap] Evaluating candidate qualification against authentic receipts...");
const qualResult = evaluateCandidateQualification(planResult.plan, authenticReceipts, candidateTree);

console.log(`  ✓ Candidate Qualification Verdict: ${qualResult.qualification}`);
console.log(`  ✓ Reason: ${qualResult.reason}`);

if (qualResult.qualification !== "QUALIFIED_PASS") {
  console.error("\n===============================================================================");
  console.error(`  [dice-bootstrap] ✗ BOOTSTRAP QUALIFICATION FAILED: ${qualResult.qualification}`);
  console.error("===============================================================================\n");
  process.exit(1);
}

console.log("\n===============================================================================");
console.log("  [dice-bootstrap] ✓ STAGE 2 BOOTSTRAP CANDIDATE QUALIFIED: QUALIFIED_PASS");
console.log("===============================================================================\n");
process.exit(0);
