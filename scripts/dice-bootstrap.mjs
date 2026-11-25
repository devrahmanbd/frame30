#!/usr/bin/env node
/**
 * Frame30 DICE Bootstrap Runner (Revision 2.3 & Stage 2.4)
 * Orchestrates independent trusted root-of-trust resolution, frozen plan compilation,
 * schema validation, dependency resolution, sandbox pre-flight, authoritative sandboxed
 * obligation execution, conjunctive multi-method verification, and qualification reporting.
 *
 * Stage 2.4 Inviolable Laws:
 * 1. External verification launcher: Verification harness is launched from trusted distribution.
 * 2. Zero local trust fallbacks: All policies, schemas, and verifiers resolve from trusted root.
 * 3. Genuine trusted mandatory verification: Mandatory checks execute trusted verifier binaries
 *    mounted at /workspace/trusted; candidate scripts are strictly subjects of verification.
 * 4. Multi-oracle evaluation: Explicit evaluators for multi_assert, exact_match, and kernel_verdict.
 * 5. Signing authority isolation: Bootstrap process NEVER receives or uses DICE_SIGNING_KEY;
 *    signing is strictly isolated to a downstream authority service.
 * 6. Zero shell interpolation: All git and child commands use structured argument vectors.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
import {
  generateFrozenPlan,
  canonicalizeJson,
} from "./dice-plan-generator.mjs";
import { DiceSandbox } from "./dice-sandbox.mjs";
import { evaluateCandidateQualification } from "./dice-qualify.mjs";
import {
  serializeReceiptCanonical,
  computeReceiptDigest,
  generateDetachedDigestLedger,
} from "./dice-evidence.mjs";
import { DiceTrustedRoot, DEFAULT_TRUSTED_REF } from "./dice-root-of-trust.mjs";

/**
 * Stage 2.4 Multi-Oracle Evaluation Engine
 * Evaluates execution results against declared oracle types:
 * - multi_assert
 * - exact_match
 * - kernel_verdict
 */
export function evaluateMethodOracle(oracle, execResult, durationMs) {
  if (!oracle || !oracle.oracle_type) {
    return execResult.verdict;
  }

  const { oracle_type } = oracle;

  if (oracle_type === "multi_assert") {
    for (const assertion of oracle.assertions || []) {
      if (
        assertion.type === "exit_code" &&
        execResult.exitCode !== assertion.expected
      ) {
        return "FAIL";
      }
      if (assertion.type === "stdout_must_contain") {
        for (const token of assertion.tokens || []) {
          if (!execResult.stdout.includes(token)) {
            return "FAIL";
          }
        }
      }
      if (assertion.type === "stdout_prohibited") {
        for (const token of assertion.tokens || []) {
          if (execResult.stdout.includes(token)) {
            return "FAIL";
          }
        }
      }
      if (assertion.type === "trace_state_depth_min") {
        const m = execResult.stdout.match(
          /(?:depth|states|Depth)\s*[:=]?\s*(\d+)/i,
        );
        if (!m || parseInt(m[1], 10) < assertion.expected) {
          return "FAIL";
        }
      }
      if (assertion.type === "execution_time_max_ms") {
        if (durationMs > assertion.expected) {
          return "FAIL";
        }
      }
    }
    return "PASS";
  }

  if (oracle_type === "exact_match") {
    const expected = (oracle.expected_output || "").trim();
    const actual = execResult.stdout.trim();
    if (actual !== expected) {
      return "FAIL";
    }
    return "PASS";
  }

  if (oracle_type === "kernel_verdict") {
    const stdout = execResult.stdout;
    const isSuccess =
      (stdout.includes("VERDICT: PASS") ||
        stdout.includes("SUCCESS") ||
        stdout.includes("0 errors") ||
        stdout.includes("ALL PROVEN")) &&
      !stdout.includes("FAIL") &&
      !stdout.includes("ERROR") &&
      execResult.exitCode === 0;
    return isSuccess ? "PASS" : "FAIL";
  }

  return "BLOCKED";
}

export function runBootstrap(cliArgs = process.argv.slice(2)) {
  // Parse CLI flags
  let isDryRun = false;
  let contractPath = "features/contracts/F30-DICE-STAGE2-4.json";
  let outDir = "artifacts/dice-evidence";

  for (const arg of cliArgs) {
    if (arg === "--dry-run") {
      isDryRun = true;
    } else if (arg.startsWith("--contract=")) {
      contractPath = arg.split("=")[1];
    } else if (arg.startsWith("--out-dir=")) {
      outDir = arg.split("=")[1];
    }
  }

  console.log(
    "===============================================================================",
  );
  console.log(
    "  FRAME30 UNIVERSAL VERIFICATION MOULD (DICE) — STAGE 2.4 BOOTSTRAP HARNESS",
  );
  console.log(
    "  Normative Standard: F30-DICE-ARCH-001 Revision 2.3 (Ratified)",
  );
  console.log(
    `  Execution Mode: ${isDryRun ? "DRY RUN (Non-Authoritative / Non-Mutating)" : "ACTIVE BOOTSTRAP"}`,
  );
  console.log(`  Change Contract: ${contractPath}`);
  console.log(
    "===============================================================================\n",
  );

  // Step 0: Contract Verification & Candidate Tree Discovery
  const fullContractPath = resolve(REPO_ROOT, contractPath);
  if (!existsSync(fullContractPath)) {
    console.error(
      `[dice-bootstrap] ✗ FAIL-CLOSED: Change contract not found at ${fullContractPath}`,
    );
    process.exit(1);
  }

  let contract;
  try {
    contract = JSON.parse(readFileSync(fullContractPath, "utf8"));
  } catch (err) {
    console.error(
      `[dice-bootstrap] ✗ FAIL-CLOSED: Malformed contract JSON: ${err.message}`,
    );
    process.exit(1);
  }

  if (!isDryRun && contract.approval_state !== "approved") {
    console.error(
      `[dice-bootstrap] ✗ FAIL-CLOSED: Contract approval_state is '${contract.approval_state}', expected 'approved'`,
    );
    process.exit(1);
  }

  if (contract.is_test_contract) {
    const testPolicyPath = resolve(
      __dirname,
      "../registries/dice/test-policy.json",
    );
    if (!existsSync(testPolicyPath)) {
      console.error(
        `[dice-bootstrap] ✗ FAIL-CLOSED: Authoritative test-policy.json missing from protected distribution at ${testPolicyPath}`,
      );
      process.exit(1);
    }
    const testPolicy = JSON.parse(readFileSync(testPolicyPath, "utf8"));
    const rawContractBuf = readFileSync(fullContractPath);
    const contractDigest = createHash("sha256")
      .update(rawContractBuf)
      .digest("hex");
    if (
      testPolicy.test_contract &&
      testPolicy.test_contract.sha256 !== contractDigest
    ) {
      console.error(
        `[dice-bootstrap] ✗ FAIL-CLOSED: Test contract digest mismatch against trusted test policy: expected ${testPolicy.test_contract.sha256}, got ${contractDigest}`,
      );
      process.exit(1);
    }
    if (
      testPolicy.test_contract &&
      testPolicy.test_contract.change_id !== contract.change_id
    ) {
      console.error(
        `[dice-bootstrap] ✗ FAIL-CLOSED: Test contract change_id mismatch against trusted test policy: expected ${testPolicy.test_contract.change_id}, got ${contract.change_id}`,
      );
      process.exit(1);
    }
    console.log(
      `  ✓ Test contract digest verified against trusted test policy: ${contractDigest}`,
    );
  }

  console.log(
    `[dice-bootstrap] Step 0: Contract verified: ${contract.change_id} ("${contract.title}")`,
  );
  if (isDryRun && contract.approval_state !== "approved") {
    console.log(
      `  [DRY RUN NOTICE] Contract approval_state is '${contract.approval_state}' (permitted for dry run only)`,
    );
  }

  // Discover live candidate commit and tree SHA from git without shell interpolation
  let candidateCommit = "0000000000000000000000000000000000000000";
  let candidateTree = "0000000000000000000000000000000000000000";

  try {
    candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();

    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();

    if (!status) {
      candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim();
    } else {
      const tmpIndex = execFileSync("mktemp", { encoding: "utf8" }).trim();
      try {
        execFileSync("git", ["read-tree", "HEAD"], {
          cwd: REPO_ROOT,
          env: { ...process.env, GIT_INDEX_FILE: tmpIndex },
          stdio: "ignore",
        });
        execFileSync("git", ["add", "-A"], {
          cwd: REPO_ROOT,
          env: { ...process.env, GIT_INDEX_FILE: tmpIndex },
          stdio: "ignore",
        });
        candidateTree = execFileSync("git", ["write-tree"], {
          cwd: REPO_ROOT,
          env: { ...process.env, GIT_INDEX_FILE: tmpIndex },
          encoding: "utf8",
        }).trim();
      } finally {
        try {
          execFileSync("rm", ["-f", tmpIndex], { stdio: "ignore" });
        } catch {}
      }
    }
  } catch (err) {
    console.error(
      `[dice-bootstrap] ✗ FAIL-CLOSED: Unable to inspect git repository: ${err.message}`,
    );
    process.exit(1);
  }

  console.log(`  ✓ Candidate Commit: ${candidateCommit}`);
  console.log(`  ✓ Candidate Tree:   ${candidateTree}`);

  // Step 1: Establish Independent Trusted Root-of-Trust
  console.log(
    "\n[dice-bootstrap] Step 1: Resolving Independent Trusted Root-of-Trust...",
  );
  const trustedRef =
    process.env.DICE_TRUSTED_REF || contract.base_commit || DEFAULT_TRUSTED_REF;
  const trustedRoot = new DiceTrustedRoot({ repoRoot: REPO_ROOT, trustedRef });
  let trustedInfo;
  try {
    trustedInfo = trustedRoot.resolve();
    console.log(`  ✓ Pinned Trusted Ref: ${trustedInfo.trustedRef}`);
    console.log(`  ✓ Trusted Commit:     ${trustedInfo.trustedCommit}`);
    console.log(`  ✓ Trusted Policy SHA: ${trustedInfo.trustedRootSha}`);
    console.log(`  ✓ Runner SHA:         ${trustedInfo.runnerSha}`);
  } catch (err) {
    console.error(
      `[dice-bootstrap] ✗ FAIL-CLOSED: Root-of-trust resolution failed: ${err.message}`,
    );
    process.exit(1);
  }

  // Validate Normative Schemas and Persistent Registries from Trusted Root under Draft 2020-12
  console.log(
    "\n[dice-bootstrap] Step 1b: Validating Schemas & Registries from Trusted Root (strict: true)...",
  );
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
  const registryData = trustedRoot.loadTrustedJson(
    "registries/dice/registry.json",
  );
  const registrySchema = ajv.getSchema(
    "https://framique.com/schemas/registry.schema.json",
  );
  if (!registrySchema(registryData)) {
    console.error(
      `[dice-bootstrap] ✗ FAIL-CLOSED: Master registry fails schema validation`,
    );
    process.exit(1);
  }
  console.log("  ✓ Master registry validated against registry.schema.json");

  // Validate mandatory-obligations.json from trusted root
  const mandatoryList = trustedRoot.loadTrustedJson(
    "registries/dice/mandatory-obligations.json",
  );
  const oblSchema = ajv.getSchema(
    "https://framique.com/schemas/obl.schema.json",
  );
  for (const ob of mandatoryList) {
    if (!oblSchema(ob)) {
      console.error(
        `[dice-bootstrap] ✗ FAIL-CLOSED: Mandatory obligation ${ob.obligation_id} violates schema:`,
        oblSchema.errors,
      );
      process.exit(1);
    }
  }
  console.log(
    `  ✓ All ${mandatoryList.length} mandatory baseline obligations validated against obl.schema.json`,
  );

  // Validate trusted-profiles.json from trusted root
  const profilesList = trustedRoot.loadTrustedJson(
    "registries/dice/trusted-profiles.json",
  );
  const profileSchema = ajv.getSchema(
    "https://framique.com/schemas/trusted-profile.schema.json",
  );
  const profilesMap = new Map();
  for (const prof of profilesList) {
    if (!profileSchema(prof)) {
      console.error(
        `[dice-bootstrap] ✗ FAIL-CLOSED: Trusted profile ${prof.profile_id} violates schema:`,
        profileSchema.errors,
      );
      process.exit(1);
    }
    profilesMap.set(prof.profile_id, prof);
  }
  console.log(
    `  ✓ All ${profilesList.length} trusted invocation profiles validated against trusted-profile.schema.json`,
  );

  // Load trusted-keys.json from trusted root
  const trustedKeysList = trustedRoot.loadTrustedJson(
    "registries/dice/trusted-keys.json",
  );
  console.log(
    `  ✓ Trusted keys registry loaded: ${trustedKeysList.length} registered signing keys`,
  );

  // Step 2: Compile Frozen Verification Plan using Trusted Mandatory Registry
  console.log(
    "\n[dice-bootstrap] Step 2: Compiling Immutable Frozen Verification Plan P_C...",
  );
  const planResult = generateFrozenPlan({
    candidateCommit,
    candidateTree,
    selectedObligations: [], // Mandatory baseline automatically populated
    registryPath: trustedRoot.getTrustedPath(
      "registries/dice/mandatory-obligations.json",
    ),
  });

  console.log(`  ✓ Frozen Plan compiled successfully`);
  console.log(`  ✓ Plan SHA-256: ${planResult.planHash}`);
  console.log(
    `  ✓ Mandatory Baseline Obligations: ${planResult.plan.obligations.mandatory.length}`,
  );
  console.log(
    `  ✓ Active Obligations: ${planResult.plan.obligations.active.join(", ")}`,
  );

  // Step 3: Sandbox Pre-Flight Check
  console.log(
    "\n[dice-bootstrap] Step 3: Performing OS Sandbox Substrate Pre-Flight...",
  );
  const sandbox = new DiceSandbox();
  const envStatus = sandbox.validateEnvironment(!isDryRun);
  console.log(`  ✓ Host Platform: ${process.platform} (${process.arch})`);
  console.log(`  ✓ Sandbox Substrate Status: ${envStatus.status}`);
  if (envStatus.bwrapVersion) {
    console.log(`  ✓ Bubblewrap Version: ${envStatus.bwrapVersion}`);
  }

  // Step 4: Execution / Qualification Evaluation
  console.log(
    "\n[dice-bootstrap] Step 4: Verification Execution & Qualification Assessment...",
  );

  if (isDryRun) {
    console.log(
      "  [DRY RUN NOTICE] Zero obligations executed. No synthetic PASS receipts generated.",
    );
    console.log("  ✓ Status: DRY_RUN_NON_AUTHORITATIVE");
    console.log(
      "  ✓ Qualified Claims: 0 (No attestation envelope generated in dry-run mode)",
    );
    console.log(
      "\n===============================================================================",
    );
    console.log(
      "  [dice-bootstrap] ✓ STAGE 2.4 BOOTSTRAP DRY-RUN COMPLETED (NON-AUTHORITATIVE)",
    );
    console.log(
      "===============================================================================\n",
    );
    process.exit(0);
  }

  // Active Bootstrap Execution: Execute Genuine Obligations
  if (process.platform === "darwin") {
    console.error(
      "  ✗ FAIL-CLOSED: Authoritative hostile worker execution on macOS is strictly BLOCKED (Invariant 5).",
    );
    console.error(
      "    macOS lacks Linux PID namespaces; execution cannot guarantee descendant process reaping.",
    );
    console.error(
      "    Authoritative DICE qualification must execute on Linux with Bubblewrap (CircleCI job: dice-qualification).",
    );
    process.exit(1);
  }

  if (envStatus.status === "BLOCKED") {
    console.error(
      `  ✗ FAIL-CLOSED: Sandbox substrate blocked: ${envStatus.reason}`,
    );
    process.exit(1);
  }

  // Prepare directories
  const fullOutDir = resolve(REPO_ROOT, outDir);
  const stagingDir = join(fullOutDir, "staging");
  const receiptsDir = join(fullOutDir, "receipts");
  mkdirSync(stagingDir, { recursive: true });
  mkdirSync(receiptsDir, { recursive: true });

  // Step 4a: Create Clean-Tree Candidate Snapshot
  console.log(
    "[dice-bootstrap] Step 4a: Snapshotting clean candidate tree via git archive...",
  );
  const candidateSnapshotDir = join(stagingDir, "candidate-snapshot");
  trustedRoot.createCandidateSnapshot(candidateTree, candidateSnapshotDir);
  console.log(
    `  ✓ Isolated clean candidate snapshot created (zero .git, .env, or host leaks)`,
  );

  // Step 4b: Pre-compute Diff Manifest for Scope Guard
  console.log(
    "[dice-bootstrap] Step 4b: Pre-computing diff manifest for Scope Guard...",
  );
  const diffManifestPath = join(stagingDir, "diff-manifest.json");
  const baseCommit = contract.base_commit || trustedRef;
  trustedRoot.generateDiffManifest(baseCommit, candidateTree, diffManifestPath);
  console.log(
    `  ✓ Pre-computed diff manifest generated against base commit ${baseCommit}`,
  );

  // Map obligation definitions
  const obligationDefMap = new Map();
  for (const ob of mandatoryList) {
    obligationDefMap.set(ob.obligation_id, ob);
  }

  // Step 4c: Conjunctive Sandboxed Execution with Trusted Verifier Binaries
  console.log(
    "[dice-bootstrap] Executing active mandatory baseline obligations conjunctively via DiceSandbox...",
  );
  const authenticReceipts = [];
  const ledgerEntries = [];

  for (const obId of planResult.plan.obligations.active) {
    const obDef = obligationDefMap.get(obId);
    if (!obDef || !obDef.methods || obDef.methods.length === 0) {
      console.error(
        `  ✗ FAIL-CLOSED: Obligation definition missing or has no methods: ${obId}`,
      );
      const receipt = {
        obligation_id: obId,
        status: "BLOCKED",
        verdict: "BLOCKED",
        candidate_commit: candidateCommit,
        candidate_tree: candidateTree,
        tree_sha: candidateTree,
        specification_hash:
          "0000000000000000000000000000000000000000000000000000000000000000",
        toolchain_identity: {
          node: process.version,
          bwrap: sandbox.bwrapVersion || "unknown",
          platform: process.platform,
          arch: process.arch,
        },
        invocation: {
          command: [],
          duration_ms: 0,
          started_at: new Date().toISOString(),
        },
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

    // Conjunctive execution across ALL declared methods
    for (const method of obDef.methods) {
      const methodId = method.method_id;
      const profile = profilesMap.get(method.trusted_profile_ref);
      const receiptName =
        obDef.methods.length === 1
          ? `${obId}.json`
          : `${obId}__${methodId}.json`;

      if (!profile) {
        console.error(
          `  ✗ FAIL-CLOSED: Trusted profile ${method.trusted_profile_ref} not found for obligation ${obId}`,
        );
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
          invocation: {
            command: [],
            duration_ms: 0,
            started_at: new Date().toISOString(),
          },
          stdout_digest: createHash("sha256").digest("hex"),
          stderr_digest: createHash("sha256").digest("hex"),
          exit_code: 126,
          diagnostics: `Trusted profile ${method.trusted_profile_ref} not found`,
        };
        const canonicalStr = serializeReceiptCanonical(receipt);
        writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
        ledgerEntries.push({
          relPath: `receipts/${receiptName}`,
          canonicalStr,
        });
        authenticReceipts.push(receipt);
        continue;
      }

      // Stage 2.4: Execute from trusted verifier distribution mounted at /workspace/trusted
      const targetScript = method.target_files[0];
      const trustedScriptPath = `/workspace/trusted/${targetScript}`;
      const commandArgs = [trustedScriptPath];
      const inputMounts = [];
      let inputContractDigest = null;

      if (obId === "OBL-SYS-SCOPE-GUARD-001") {
        const canonicalContractHostPath = realpathSync(
          resolve(REPO_ROOT, contractPath),
        );
        if (lstatSync(canonicalContractHostPath).isSymbolicLink()) {
          throw new Error(
            `FAIL-CLOSED: Host contract path is a symbolic link: ${contractPath}`,
          );
        }
        inputContractDigest = createHash("sha256")
          .update(readFileSync(canonicalContractHostPath))
          .digest("hex");
        const fixedSandboxPath = "/workspace/input/contract.json";
        inputMounts.push({
          hostPath: canonicalContractHostPath,
          sandboxPath: fixedSandboxPath,
          expectedDigest: inputContractDigest,
        });
        commandArgs.push(`--contract=${fixedSandboxPath}`);
        commandArgs.push(`--contract-digest=${inputContractDigest}`);
        commandArgs.push(`--diff-manifest=/workspace/out/diff-manifest.json`);
      } else {
        commandArgs.push(`--target-dir=/workspace/src`);
      }

      // Validate command arguments against profile.allowed_cli_args
      let argsValid = true;
      for (const arg of commandArgs) {
        const matched = profile.allowed_cli_args.some((pattern) =>
          new RegExp(pattern).test(arg),
        );
        if (!matched) {
          argsValid = false;
          console.error(
            `  ✗ FAIL-CLOSED: Argument '${arg}' not permitted by profile ${profile.profile_id}`,
          );
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
          invocation: {
            command: commandArgs,
            duration_ms: 0,
            started_at: new Date().toISOString(),
          },
          stdout_digest: createHash("sha256").digest("hex"),
          stderr_digest: createHash("sha256").digest("hex"),
          exit_code: 126,
          diagnostics: `CLI argument validation failed against trusted profile ${profile.profile_id}`,
        };
        const canonicalStr = serializeReceiptCanonical(receipt);
        writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
        ledgerEntries.push({
          relPath: `receipts/${receiptName}`,
          canonicalStr,
        });
        authenticReceipts.push(receipt);
        continue;
      }

      const baseCmd = profile.executable
        ? [profile.executable, ...(profile.base_args || [])]
        : Array.isArray(profile.command_template)
          ? [...profile.command_template]
          : profile.command_template.trim().split(/\s+/);
      const fullCommand = [...baseCmd, ...commandArgs];
      console.log(
        `  -> Sandboxed execution of ${obId} (${methodId}): ${fullCommand.join(" ")}`,
      );

      const startTime = Date.now();
      const startedAt = new Date().toISOString();

      // Execute in isolated sandbox with trusted distribution mounted at /workspace/trusted
      const execResult = sandbox.execute({
        command: fullCommand,
        sourceSnapshot: candidateSnapshotDir,
        trustedDir: trustedInfo.cacheDir,
        stagingDir,
        inputMounts,
        maskGit: true,
        maskEnv: true,
        timeoutMs: profile.timeout_ms || 60000,
        isAuthoritative: true,
      });

      const durationMs = Date.now() - startTime;

      // Evaluate oracles across multi_assert, exact_match, and kernel_verdict
      let methodStatus = execResult.verdict;
      if (methodStatus === "PASS" && method.oracle) {
        methodStatus = evaluateMethodOracle(
          method.oracle,
          execResult,
          durationMs,
        );
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
        input_contract_digest: inputContractDigest || undefined,
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
        stdout_digest: createHash("sha256")
          .update(execResult.stdout)
          .digest("hex"),
        stderr_digest: createHash("sha256")
          .update(execResult.stderr)
          .digest("hex"),
        exit_code: execResult.exitCode,
        diagnostics: (execResult.stdout + "\n" + execResult.stderr)
          .slice(0, 1000)
          .trim(),
      };

      const canonicalStr = serializeReceiptCanonical(receipt);
      writeFileSync(join(receiptsDir, receiptName), canonicalStr, "utf8");
      ledgerEntries.push({ relPath: `receipts/${receiptName}`, canonicalStr });
      authenticReceipts.push(receipt);

      if (methodStatus === "PASS") {
        console.log(`     ✓ PASS (${durationMs}ms)`);
      } else {
        console.error(
          `     ✗ ${methodStatus} (exit code ${execResult.exitCode})`,
        );
      }
    }
  }

  // Generate detached digest ledger
  const ledgerContent = generateDetachedDigestLedger(ledgerEntries);
  writeFileSync(join(fullOutDir, "receipts.sha256"), ledgerContent, "utf8");
  console.log(
    `\n  ✓ Detached digest ledger generated: ${join(outDir, "receipts.sha256")}`,
  );

  // Evaluate Qualification with Authentic Receipts and Conjunctive Multi-Method Engine
  console.log(
    "\n[dice-bootstrap] Evaluating candidate qualification against authentic receipts...",
  );
  const qualResult = evaluateCandidateQualification(
    planResult.plan,
    authenticReceipts,
    candidateTree,
    {
      obligationsMap: obligationDefMap,
    },
  );

  console.log(
    `  ✓ Candidate Qualification Verdict: ${qualResult.qualification}`,
  );
  console.log(`  ✓ Reason: ${qualResult.reason}`);

  // Save qualification summary for downstream signing service
  const qualificationSummary = {
    candidate_commit: candidateCommit,
    candidate_tree: candidateTree,
    contract: contract.change_id,
    plan_hash: planResult.planHash,
    trusted_root_sha: trustedInfo.trustedRootSha,
    runner_sha: trustedInfo.runnerSha,
    qualification: qualResult.qualification,
    obligations_verified: authenticReceipts.filter((r) => r.status === "PASS")
      .length,
    ledger_sha256: computeReceiptDigest(ledgerContent),
    evaluated_at: new Date().toISOString(),
  };
  writeFileSync(
    join(fullOutDir, "qualification-summary.json"),
    JSON.stringify(qualificationSummary, null, 2),
    "utf8",
  );

  if (qualResult.qualification !== "QUALIFIED_PASS") {
    console.error(
      "\n===============================================================================",
    );
    console.error(
      `  [dice-bootstrap] ✗ BOOTSTRAP QUALIFICATION FAILED: ${qualResult.qualification}`,
    );
    console.error(
      "===============================================================================\n",
    );
    process.exit(1);
  }

  // Stage 2.4: Attestation Signing is isolated to the downstream signing service
  console.log("\n[dice-bootstrap] Stage 2.4 Signing Isolation Notice:");
  console.log("  Candidate qualification succeeded with QUALIFIED_PASS.");
  console.log(
    "  Authoritative DSSE attestation signing is isolated to 'scripts/dice-signing-service.mjs'.",
  );
  console.log("  Candidate execution process does not hold signing authority.");

  console.log(
    "\n===============================================================================",
  );
  console.log(
    "  [dice-bootstrap] ✓ STAGE 2.4 BOOTSTRAP CANDIDATE QUALIFIED: QUALIFIED_PASS",
  );
  console.log(
    "===============================================================================\n",
  );
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("dice-bootstrap.mjs")) {
  runBootstrap();
}
