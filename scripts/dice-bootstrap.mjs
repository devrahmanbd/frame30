#!/usr/bin/env node
/**
 * Frame30 DICE Stage 2.3 Bootstrap Runner (Revision 2.3)
 * Orchestrates independent trusted root-of-trust resolution, frozen plan compilation,
 * schema validation, dependency resolution, sandbox pre-flight, authoritative sandboxed
 * obligation execution, conjunctive multi-method verification, and qualification reporting.
 *
 * INVIOLABLE LAWS:
 * 1. Zero synthetic PASS receipts. Dry-run mode is strictly non-qualifying
 *    (DRY_RUN_NON_AUTHORITATIVE) and never emits an authoritative attestation envelope.
 * 2. Every authoritative obligation executes exclusively via DiceSandbox.execute().
 * 3. Verification policies derive exclusively from the independent trusted root (P0-1).
 * 4. Conjunctive verification: an obligation passes iff all declared methods pass (P0-2).
 * 5. Clean-tree candidate snapshotting with zero .git, .env, or host leaks (P0-3).
 * 6. Authoritative attestation keys with role check and revocation enforcement (P0-4).
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
  DiceSigningAuthority,
} from "./dice-evidence.mjs";
import { DiceTrustedRoot, DEFAULT_TRUSTED_REF } from "./dice-root-of-trust.mjs";

const REPO_ROOT = process.cwd();

// Parse CLI flags
let isDryRun = false;
let contractPath = "features/contracts/F30-DICE-STAGE2-3.json";
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
console.log("  FRAME30 UNIVERSAL VERIFICATION MOULD (DICE) — STAGE 2.3 BOOTSTRAP HARNESS");
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

// Step 1: Establish Independent Trusted Root-of-Trust (P0-1)
console.log("\n[dice-bootstrap] Step 1: Resolving Independent Trusted Root-of-Trust (P0-1)...");
const trustedRef = process.env.DICE_TRUSTED_REF || contract.base_commit || DEFAULT_TRUSTED_REF;
const trustedRoot = new DiceTrustedRoot({ repoRoot: REPO_ROOT, trustedRef });
let trustedInfo;
try {
  trustedInfo = trustedRoot.resolve();
  console.log(`  ✓ Pinned Trusted Ref: ${trustedInfo.trustedRef}`);
  console.log(`  ✓ Trusted Commit:     ${trustedInfo.trustedCommit}`);
  console.log(`  ✓ Trusted Policy SHA: ${trustedInfo.trustedRootSha}`);
  console.log(`  ✓ Runner SHA:         ${trustedInfo.runnerSha}`);
} catch (err) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Root-of-trust resolution failed: ${err.message}`);
  process.exit(1);
}

// Validate Normative Schemas and Persistent Registries from Trusted Root under Draft 2020-12
console.log("\n[dice-bootstrap] Step 1b: Validating Schemas & Registries from Trusted Root (strict: true)...");
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
  const p = trustedRoot.getTrustedPath(join("schemas/dice", f));
  if (!existsSync(p)) {
    console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Missing schema at ${p}`);
    process.exit(1);
  }
  const s = JSON.parse(readFileSync(p, "utf8"));
  ajv.addSchema(s);
  console.log(`  ✓ Schema loaded: ${f}`);
}

// Validate registry.json from trusted root
const registryData = trustedRoot.loadTrustedJson("registries/dice/registry.json");
const registrySchema = ajv.getSchema("https://framique.com/schemas/registry.schema.json");
if (!registrySchema(registryData)) {
  console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Master registry fails schema validation`);
  process.exit(1);
}
console.log("  ✓ Master registry validated against registry.schema.json");

// Validate mandatory-obligations.json from trusted root
const mandatoryList = trustedRoot.loadTrustedJson("registries/dice/mandatory-obligations.json");
const oblSchema = ajv.getSchema("https://framique.com/schemas/obl.schema.json");
for (const ob of mandatoryList) {
  if (!oblSchema(ob)) {
    console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Mandatory obligation ${ob.obligation_id} violates schema:`, oblSchema.errors);
    process.exit(1);
  }
}
console.log(`  ✓ All ${mandatoryList.length} mandatory baseline obligations validated against obl.schema.json`);

// Validate trusted-profiles.json from trusted root
const profilesList = trustedRoot.loadTrustedJson("registries/dice/trusted-profiles.json");
const profileSchema = ajv.getSchema("https://framique.com/schemas/trusted-profile.schema.json");
const profilesMap = new Map();
for (const prof of profilesList) {
  if (!profileSchema(prof)) {
    console.error(`[dice-bootstrap] ✗ FAIL-CLOSED: Trusted profile ${prof.profile_id} violates schema:`, profileSchema.errors);
    process.exit(1);
  }
  profilesMap.set(prof.profile_id, prof);
}
console.log(`  ✓ All ${profilesList.length} trusted invocation profiles validated against trusted-profile.schema.json`);

// Load trusted-keys.json from trusted root
const trustedKeysList = trustedRoot.loadTrustedJson("registries/dice/trusted-keys.json");
console.log(`  ✓ Trusted keys registry loaded: ${trustedKeysList.length} registered signing keys`);

// Step 2: Compile Frozen Verification Plan using Trusted Mandatory Registry
console.log("\n[dice-bootstrap] Step 2: Compiling Immutable Frozen Verification Plan P_C...");
const planResult = generateFrozenPlan({
  candidateCommit,
  candidateTree,
  selectedObligations: [], // Mandatory baseline automatically populated
  registryPath: trustedRoot.getTrustedPath("registries/dice/mandatory-obligations.json"),
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
  console.log("  [dice-bootstrap] ✓ STAGE 2.3 BOOTSTRAP DRY-RUN COMPLETED (NON-AUTHORITATIVE)");
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

// Prepare directories
const fullOutDir = resolve(REPO_ROOT, outDir);
const stagingDir = join(fullOutDir, "staging");
const receiptsDir = join(fullOutDir, "receipts");
mkdirSync(stagingDir, { recursive: true });
mkdirSync(receiptsDir, { recursive: true });

// Step 4a: Create Clean-Tree Candidate Snapshot (P0-3)
console.log("[dice-bootstrap] Step 4a: Snapshotting clean candidate tree via git archive (P0-3)...");
const candidateSnapshotDir = join(stagingDir, "candidate-snapshot");
trustedRoot.createCandidateSnapshot(candidateTree, candidateSnapshotDir);
console.log(`  ✓ Isolated clean candidate snapshot created (zero .git, .env, or host leaks)`);

// Step 4b: Pre-compute Diff Manifest for Scope Guard
console.log("[dice-bootstrap] Step 4b: Pre-computing diff manifest for Scope Guard...");
const diffManifestPath = join(stagingDir, "diff-manifest.json");
const baseCommit = contract.base_commit || trustedRef;
trustedRoot.generateDiffManifest(baseCommit, candidateTree, diffManifestPath);
console.log(`  ✓ Pre-computed diff manifest generated against base commit ${baseCommit}`);

// Map obligation definitions
const obligationDefMap = new Map();
for (const ob of mandatoryList) {
  obligationDefMap.set(ob.obligation_id, ob);
}

// Step 4c: Conjunctive Sandboxed Execution (P0-2)
console.log("[dice-bootstrap] Executing active mandatory baseline obligations conjunctively via DiceSandbox...");
const authenticReceipts = [];
const ledgerEntries = [];

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
    const receiptName = `${obId}.json`;
    writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
    ledgerEntries.push({ relPath: `receipts/${receiptName}`, canonicalStr });
    authenticReceipts.push(receipt);
    continue;
  }

  // Conjunctive execution across ALL declared methods (P0-2)
  for (const method of obDef.methods) {
    const methodId = method.method_id;
    const profile = profilesMap.get(method.trusted_profile_ref);
    const receiptName = obDef.methods.length === 1 ? `${obId}.json` : `${obId}__${methodId}.json`;

    if (!profile) {
      console.error(`  ✗ FAIL-CLOSED: Trusted profile ${method.trusted_profile_ref} not found for obligation ${obId}`);
      const receipt = {
        obligation_id: obId,
        method_id: methodId,
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
      writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
      ledgerEntries.push({ relPath: `receipts/${receiptName}`, canonicalStr });
      authenticReceipts.push(receipt);
      continue;
    }

    // Construct structured command arguments from profile and method target_files
    const targetScript = method.target_files[0];
    const commandArgs = [targetScript];
    if (obId === "OBL-SYS-SCOPE-GUARD-001") {
      commandArgs.push(`--contract=${contractPath}`);
      // Scope guard reads pre-computed diff manifest from isolated staging mount
      commandArgs.push(`--diff-manifest=/workspace/out/diff-manifest.json`);
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
        method_id: methodId,
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
      writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
      ledgerEntries.push({ relPath: `receipts/${receiptName}`, canonicalStr });
      authenticReceipts.push(receipt);
      continue;
    }

    const fullCommand = [profile.command_template, ...commandArgs];
    console.log(`  -> Sandboxed execution of ${obId} (${methodId}): ${fullCommand.join(" ")}`);

    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    // Execute in isolated sandbox against clean candidate snapshot with strict maskGit (P0-3)
    const execResult = sandbox.execute({
      command: fullCommand,
      sourceSnapshot: candidateSnapshotDir,
      stagingDir,
      maskGit: true,
      maskEnv: true,
      timeoutMs: profile.timeout_ms || 60000,
      isAuthoritative: true,
    });

    const durationMs = Date.now() - startTime;

    // Evaluate oracles
    let methodStatus = execResult.verdict; // PASS or FAIL or BLOCKED
    if (methodStatus === "PASS" && method.oracle) {
      if (method.oracle.oracle_type === "multi_assert") {
        for (const assertion of method.oracle.assertions || []) {
          if (assertion.type === "exit_code" && execResult.exitCode !== assertion.expected) {
            methodStatus = "FAIL";
          }
          if (assertion.type === "stdout_must_contain") {
            for (const token of assertion.tokens || []) {
              if (!execResult.stdout.includes(token)) {
                methodStatus = "FAIL";
              }
            }
          }
          if (assertion.type === "stdout_prohibited") {
            for (const token of assertion.tokens || []) {
              if (execResult.stdout.includes(token)) {
                methodStatus = "FAIL";
              }
            }
          }
        }
      }
    }

    const receipt = {
      obligation_id: obId,
      method_id: methodId,
      status: methodStatus,
      verdict: methodStatus,
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
    writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
    ledgerEntries.push({ relPath: `receipts/${receiptName}`, canonicalStr });
    authenticReceipts.push(receipt);

    if (methodStatus === "PASS") {
      console.log(`     ✓ PASS (${durationMs}ms)`);
    } else {
      console.error(`     ✗ ${methodStatus} (exit code ${execResult.exitCode})`);
    }
  }
}

// Generate detached digest ledger
const ledgerContent = generateDetachedDigestLedger(ledgerEntries);
writeFileSync(join(fullOutDir, "receipts.sha256"), ledgerContent, "utf8");
console.log(`\n  ✓ Detached digest ledger generated: ${join(outDir, "receipts.sha256")}`);

// Evaluate Qualification with Authentic Receipts and Conjunctive Multi-Method Engine
console.log("\n[dice-bootstrap] Evaluating candidate qualification against authentic receipts...");
const qualResult = evaluateCandidateQualification(planResult.plan, authenticReceipts, candidateTree, {
  obligationsMap: obligationDefMap,
});

console.log(`  ✓ Candidate Qualification Verdict: ${qualResult.qualification}`);
console.log(`  ✓ Reason: ${qualResult.reason}`);

if (qualResult.qualification !== "QUALIFIED_PASS") {
  console.error("\n===============================================================================");
  console.error(`  [dice-bootstrap] ✗ BOOTSTRAP QUALIFICATION FAILED: ${qualResult.qualification}`);
  console.error("===============================================================================\n");
  process.exit(1);
}

// Step 5: Authoritative Attestation Signing (P0-4)
console.log("\n[dice-bootstrap] Step 5: Authoritative Attestation Signing (P0-4)...");
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
    trusted_root_sha: trustedInfo.trustedRootSha,
    runner_sha: trustedInfo.runnerSha,
    obligations_verified: authenticReceipts.filter((r) => r.status === "PASS").length,
    toolchain: {
      node: process.version,
      bwrap: sandbox.bwrapVersion || "unknown",
    },
    ledger_sha256: computeReceiptDigest(ledgerContent),
  },
};

let signingKeyPem = process.env.DICE_SIGNING_KEY;
const signingKeyFile = process.env.DICE_SIGNING_KEY_FILE || "/tmp/dice-auth-key.pem";
if (!signingKeyPem && existsSync(signingKeyFile)) {
  try {
    signingKeyPem = readFileSync(signingKeyFile, "utf8");
  } catch {}
}

const keyId = process.env.DICE_SIGNING_KEY_ID || "key-dice-authoritative-01";

if (signingKeyPem) {
  const signingAuthority = new DiceSigningAuthority({
    trustedKeys: trustedKeysList,
  });

  try {
    const envelope = signingAuthority.signAttestation(statement, signingKeyPem, keyId, {
      ledgerContent,
      receiptsDir,
      requiredRole: "dice-attestation-signer",
    });
    writeFileSync(join(fullOutDir, "attestation.dsse.json"), canonicalizeJson(envelope), "utf8");
    console.log(`  ✓ Authoritative in-toto DSSE attestation envelope generated: ${join(outDir, "attestation.dsse.json")}`);
  } catch (err) {
    console.error(`  ✗ FAIL-CLOSED: Authoritative attestation signing failed: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log("  [NOTICE] No authoritative signing key provided (DICE_SIGNING_KEY unset).");
  console.log("  ✓ Candidate verified and qualified as UNATTESTED. Zero synthetic keys generated.");
}

console.log("\n===============================================================================");
console.log("  [dice-bootstrap] ✓ STAGE 2.3 BOOTSTRAP CANDIDATE QUALIFIED: QUALIFIED_PASS");
console.log("===============================================================================\n");
process.exit(0);
