#!/usr/bin/env node
/**
 * Frame30 DICE Stage 2 Bootstrap Runner (Revision 2.3)
 * Orchestrates frozen plan compilation, schema validation, dependency resolution,
 * sandbox pre-flight, authoritative sandboxed obligation execution, and qualification reporting.
 *
 * INVIOLABLE LAW: Zero synthetic PASS receipts. Dry-run mode is strictly non-qualifying
 * (DRY_RUN_NON_AUTHORITATIVE) and never emits an authoritative attestation envelope.
 * Every authoritative obligation executes exclusively via DiceSandbox.execute().
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
import { generateFrozenPlan, canonicalizeJson } from "./dice-plan-generator.mjs";
import { DiceSandbox } from "./dice-sandbox.mjs";
import { evaluateCandidateQualification } from "./dice-qualify.mjs";
import {
  serializeReceiptCanonical,
  computeReceiptDigest,
  generateDetachedDigestLedger,
  createAttestationEnvelope,
  generateTestKeypair,
} from "./dice-evidence.mjs";

const REPO_ROOT = process.cwd();

// Parse CLI flags
let isDryRun = false;
let contractPath = "features/contracts/F30-DICE-STAGE2-2.json";
let outDir = "artifacts/dice-evidence";

for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") {
    isDryRun = true;
  } else if (arg.startsWith("--contract=")) {
    contractPath = arg.split("=")[1];
  } else if (arg.startsWith("--out-dir=")) {
    outDir = arg.split("=")[1];
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

if (!isDryRun && contract.approval_state !== "approved") {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Contract approval_state is '${contract.approval_state}', expected 'approved'`);
  process.exit(1);
}

console.log(`[dice-bootstrap] Step 0: Contract verified: ${contract.change_id} ("${contract.title}")`);
if (isDryRun && contract.approval_state !== "approved") {
  console.log(`  [DRY RUN NOTICE] Contract approval_state is '${contract.approval_state}' (permitted for dry run only)`);
}

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

// Validate registries/dice/trusted-profiles.json against trusted-profile.schema.json
const profilesPath = join(REPO_ROOT, "registries/dice/trusted-profiles.json");
const profileSchema = ajv.getSchema("https://framique.com/schemas/trusted-profile.schema.json");
if (!existsSync(profilesPath)) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Missing trusted-profiles registry at ${profilesPath}`);
  process.exit(1);
}
const profilesList = JSON.parse(readFileSync(profilesPath, "utf8"));
const profilesMap = new Map();
for (const prof of profilesList) {
  if (!profileSchema(prof)) {
    console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Trusted profile ${prof.profile_id} violates schema:`, profileSchema.errors);
    process.exit(1);
  }
  profilesMap.set(prof.profile_id, prof);
}
console.log(`  ✓ All ${profilesList.length} trusted invocation profiles validated against trusted-profile.schema.json`);

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
if (envStatus.bwrapVersion) {
  console.log(`  ✓ Bubblewrap Version: ${envStatus.bwrapVersion}`);
}

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

if (envStatus.status === "BLOCKED") {
  console.error(`  ✗ FAIL-CLOSED: Sandbox substrate blocked: ${envStatus.reason}`);
  process.exit(1);
}

// Execute active baseline obligations via DiceSandbox
console.log("[dice-bootstrap] Executing active mandatory baseline obligations via DiceSandbox.execute()...");
const authenticReceipts = [];
const ledgerEntries = [];

const fullOutDir = resolve(REPO_ROOT, outDir);
const stagingDir = join(fullOutDir, "staging");
const receiptsDir = join(fullOutDir, "receipts");
mkdirSync(stagingDir, { recursive: true });
mkdirSync(receiptsDir, { recursive: true });

const obligationDefMap = new Map();
for (const ob of mandatoryList) {
  obligationDefMap.set(ob.obligation_id, ob);
}

for (const obId of planResult.plan.obligations.active) {
  const obDef = obligationDefMap.get(obId);
  if (!obDef || !obDef.methods || obDef.methods.length === 0) {
    console.error(`  ✗ FAIL-CLOSED: Obligation definition missing or has no methods: ${obId}`);
    const receipt = {
      obligation_id: obId,
      status: "BLOCKED",
      verdict: "BLOCKED",
      candidate_commit: candidateCommit,
      candidate_tree: candidateTree,
      tree_sha: candidateTree,
      specification_hash: "0000000000000000000000000000000000000000000000000000000000000000",
      toolchain_identity: {
        node: process.version,
        bwrap: sandbox.bwrapVersion || "unknown",
        platform: process.platform,
        arch: process.arch,
      },
      invocation: { command: [], duration_ms: 0, started_at: new Date().toISOString() },
      stdout_digest: createHash("sha256").digest("hex"),
      stderr_digest: createHash("sha256").digest("hex"),
      exit_code: 126,
      diagnostics: `No methods found for obligation ${obId}`,
    };
    const canonicalStr = serializeReceiptCanonical(receipt);
    writeFileSync(join(receiptsDir, `${obId}.json`), canonicalStr, "utf8");
    ledgerEntries.push({ relPath: `receipts/${obId}.json`, canonicalStr });
    authenticReceipts.push(receipt);
    continue;
  }

  const method = obDef.methods[0];
  const profile = profilesMap.get(method.trusted_profile_ref);
  if (!profile) {
    console.error(`  ✗ FAIL-CLOSED: Trusted profile ${method.trusted_profile_ref} not found for obligation ${obId}`);
    const receipt = {
      obligation_id: obId,
      status: "BLOCKED",
      verdict: "BLOCKED",
      candidate_commit: candidateCommit,
      candidate_tree: candidateTree,
      tree_sha: candidateTree,
      specification_hash: computeReceiptDigest(canonicalizeJson(obDef)),
      toolchain_identity: {
        node: process.version,
        bwrap: sandbox.bwrapVersion || "unknown",
        platform: process.platform,
        arch: process.arch,
      },
      invocation: { command: [], duration_ms: 0, started_at: new Date().toISOString() },
      stdout_digest: createHash("sha256").digest("hex"),
      stderr_digest: createHash("sha256").digest("hex"),
      exit_code: 126,
      diagnostics: `Trusted profile ${method.trusted_profile_ref} not found`,
    };
    const canonicalStr = serializeReceiptCanonical(receipt);
    writeFileSync(join(receiptsDir, `${obId}.json`), canonicalStr, "utf8");
    ledgerEntries.push({ relPath: `receipts/${obId}.json`, canonicalStr });
    authenticReceipts.push(receipt);
    continue;
  }

  // Construct structured command arguments from profile and method target_files
  const targetScript = method.target_files[0];
  const commandArgs = [targetScript];
  if (obId === "OBL-SYS-SCOPE-GUARD-001") {
    commandArgs.push(`--contract=${contractPath}`);
  }

  // Validate command arguments against profile.allowed_cli_args regex patterns
  let argsValid = true;
  for (const arg of commandArgs) {
    const matched = profile.allowed_cli_args.some((pattern) => new RegExp(pattern).test(arg));
    if (!matched) {
      argsValid = false;
      console.error(`  ✗ FAIL-CLOSED: Argument '${arg}' not permitted by profile ${profile.profile_id}`);
      break;
    }
  }

  if (!argsValid) {
    const receipt = {
      obligation_id: obId,
      status: "BLOCKED",
      verdict: "BLOCKED",
      candidate_commit: candidateCommit,
      candidate_tree: candidateTree,
      tree_sha: candidateTree,
      specification_hash: computeReceiptDigest(canonicalizeJson(obDef)),
      toolchain_identity: {
        node: process.version,
        bwrap: sandbox.bwrapVersion || "unknown",
        platform: process.platform,
        arch: process.arch,
      },
      invocation: { command: commandArgs, duration_ms: 0, started_at: new Date().toISOString() },
      stdout_digest: createHash("sha256").digest("hex"),
      stderr_digest: createHash("sha256").digest("hex"),
      exit_code: 126,
      diagnostics: `CLI argument validation failed against trusted profile ${profile.profile_id}`,
    };
    const canonicalStr = serializeReceiptCanonical(receipt);
    writeFileSync(join(receiptsDir, `${obId}.json`), canonicalStr, "utf8");
    ledgerEntries.push({ relPath: `receipts/${obId}.json`, canonicalStr });
    authenticReceipts.push(receipt);
    continue;
  }

  const fullCommand = [profile.command_template, ...commandArgs];
  console.log(`  -> Sandboxed execution of ${obId}: ${fullCommand.join(" ")}`);

  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  // Execute in isolated sandbox
  // For scope-guard, git history is needed read-only; for other obligations, maskGit is strictly enabled.
  const maskGit = obId !== "OBL-SYS-SCOPE-GUARD-001";
  const execResult = sandbox.execute({
    command: fullCommand,
    sourceSnapshot: REPO_ROOT,
    stagingDir,
    maskGit,
    maskEnv: true,
    timeoutMs: profile.timeout_ms || 60000,
    isAuthoritative: true,
  });

  const durationMs = Date.now() - startTime;

  // Evaluate oracles
  let obligationStatus = execResult.verdict; // PASS or FAIL or BLOCKED
  if (obligationStatus === "PASS" && method.oracle) {
    if (method.oracle.oracle_type === "multi_assert") {
      for (const assertion of method.oracle.assertions || []) {
        if (assertion.type === "exit_code" && execResult.exitCode !== assertion.expected) {
          obligationStatus = "FAIL";
        }
        if (assertion.type === "stdout_must_contain") {
          for (const token of assertion.tokens || []) {
            if (!execResult.stdout.includes(token)) {
              obligationStatus = "FAIL";
            }
          }
        }
        if (assertion.type === "stdout_prohibited") {
          for (const token of assertion.tokens || []) {
            if (execResult.stdout.includes(token)) {
              obligationStatus = "FAIL";
            }
          }
        }
      }
    }
  }

  const receipt = {
    obligation_id: obId,
    status: obligationStatus,
    verdict: obligationStatus,
    candidate_commit: candidateCommit,
    candidate_tree: candidateTree,
    tree_sha: candidateTree,
    specification_hash: computeReceiptDigest(canonicalizeJson(obDef)),
    toolchain_identity: {
      node: process.version,
      bwrap: sandbox.bwrapVersion || "unknown",
      platform: process.platform,
      arch: process.arch,
    },
    invocation: {
      command: fullCommand,
      duration_ms: durationMs,
      started_at: startedAt,
    },
    stdout_digest: createHash("sha256").update(execResult.stdout).digest("hex"),
    stderr_digest: createHash("sha256").update(execResult.stderr).digest("hex"),
    exit_code: execResult.exitCode,
    diagnostics: (execResult.stdout + "\n" + execResult.stderr).slice(0, 1000).trim(),
  };

  const canonicalStr = serializeReceiptCanonical(receipt);
  writeFileSync(join(receiptsDir, `${obId}.json`), canonicalStr, "utf8");
  ledgerEntries.push({ relPath: `receipts/${obId}.json`, canonicalStr });
  authenticReceipts.push(receipt);

  if (obligationStatus === "PASS") {
    console.log(`     ✓ PASS (${durationMs}ms)`);
  } else {
    console.error(`     ✗ ${obligationStatus} (exit code ${execResult.exitCode})`);
  }
}

// Generate detached digest ledger
const ledgerContent = generateDetachedDigestLedger(ledgerEntries);
writeFileSync(join(fullOutDir, "receipts.sha256"), ledgerContent, "utf8");
console.log(`\n  ✓ Detached digest ledger generated: ${join(outDir, "receipts.sha256")}`);

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

// Generate signed DSSE attestation envelope upon QUALIFIED_PASS
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [
    {
      name: "frame30-candidate",
      digest: {
        sha256: candidateTree,
        commit: candidateCommit,
      },
    },
  ],
  predicateType: "https://framique.com/dice/attestation/v1",
  predicate: {
    qualification: "QUALIFIED_PASS",
    plan_hash: planResult.planHash,
    contract: contract.change_id,
    obligations_verified: authenticReceipts.filter((r) => r.status === "PASS").length,
    toolchain: {
      node: process.version,
      bwrap: sandbox.bwrapVersion || "unknown",
    },
    ledger_sha256: computeReceiptDigest(ledgerContent),
  },
};

const keypair = generateTestKeypair();
const envelope = createAttestationEnvelope(statement, keypair.privateKey, "key-dice-qualification-01");
writeFileSync(join(fullOutDir, "attestation.dsse.json"), canonicalizeJson(envelope), "utf8");
console.log(`  ✓ Signed in-toto DSSE attestation envelope generated: ${join(outDir, "attestation.dsse.json")}`);

console.log("\n===============================================================================");
console.log("  [dice-bootstrap] ✓ STAGE 2 BOOTSTRAP CANDIDATE QUALIFIED: QUALIFIED_PASS");
console.log("===============================================================================\n");
process.exit(0);
