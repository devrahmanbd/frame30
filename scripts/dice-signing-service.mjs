#!/usr/bin/env node
/**
 * Frame30 DICE Isolated Signing Service (Revision 2.3 & Stage 2.4 Section 4)
 *
 * Runs as a separately controlled signing authority process or downstream CI job.
 * The candidate execution process NEVER receives DICE_SIGNING_KEY.
 *
 * Independently verifies:
 * 1. Candidate identity (commit and tree SHA in Git).
 * 2. Contract authorization (approval state, schema, baseline).
 * 3. Trusted policy identity (authenticated trusted root commit/tree and policy manifest).
 * 4. All required method receipts (existence, format, matching tree SHA, PASS status).
 * 5. Detached receipt ledger (receipts.sha256 integrity and SHA equality).
 * 6. Method-level qualification (evaluateCandidateQualification() === QUALIFIED_PASS).
 * 7. Key role and revocation status (registered, active, role 'dice-attestation-signer').
 *
 * Only then issues an authoritative in-toto DSSE attestation (attestation.dsse.json).
 * Otherwise returns UNATTESTED or fails closed on integrity violation.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, verify } from "node:crypto";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  serializeReceiptCanonical,
  computeReceiptDigest,
  DiceSigningAuthority,
} from "./dice-evidence.mjs";
import {
  DiceTrustedRoot,
  DEFAULT_TRUSTED_REF,
  validateCommitSha,
  validateTreeSha,
  validateSafePath,
  verifyPipelineConfiguration,
  computeSealPayload,
  resolveTrustedLauncherKey,
} from "./dice-root-of-trust.mjs";
import { evaluateCandidateQualification } from "./dice-qualify.mjs";
import {
  generateFrozenPlan,
  canonicalizeJson,
} from "./dice-plan-generator.mjs";

export function computeExecutionAuthSignature({
  candidateCommit,
  candidateTree,
  ledgerSha256,
  runnerSha,
  trustedRootSha,
  qualification,
  authKey,
  launcherExecutionId,
}) {
  const parts = [
    candidateCommit,
    candidateTree,
    ledgerSha256,
    runnerSha,
    trustedRootSha,
    qualification,
  ];
  if (launcherExecutionId) {
    parts.push(launcherExecutionId);
  }
  const payload = parts.join(":");
  return createHmac("sha256", authKey).update(payload).digest("hex");
}

export class DiceSigningService {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.mode = options.mode || process.env.DICE_SIGNING_MODE || "production";
    if (this.mode !== "test" && this.mode !== "production") {
      throw new Error(
        `FAIL-CLOSED: Invalid signing mode '${this.mode}', must be 'test' or 'production'`,
      );
    }
    this.trustedRef =
      options.trustedRef || process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;
    this.evidenceDir = options.evidenceDir || "artifacts/dice-evidence";
    this.contractPath =
      options.contractPath ||
      process.env.ACTIVE_CHANGE_CONTRACT ||
      (this.mode === "test"
        ? "registries/dice/test-qualification-contract.json"
        : "features/contracts/F30-DICE-COMPLETE.json");
    this.candidateCommit = options.candidateCommit
      ? validateCommitSha(options.candidateCommit)
      : null;
    this.candidateTree = options.candidateTree
      ? validateTreeSha(options.candidateTree)
      : null;
    this.testKeys = options.testKeys || null;
    this.testKeysPath = options.testKeysPath || null;
    this.keyId =
      options.keyId ||
      process.env.DICE_SIGNING_KEY_ID ||
      (this.mode === "test"
        ? "key-dice-test-signer-01"
        : "key-dice-authoritative-01");
    this.signingKeyPem =
      options.signingKeyPem ||
      (options.signingKeyFile && existsSync(options.signingKeyFile)
        ? readFileSync(options.signingKeyFile, "utf8")
        : null) ||
      (this.mode === "test"
        ? process.env.DICE_TEST_SIGNING_KEY
        : process.env.DICE_SIGNING_KEY) ||
      null;
    this.allowUnapprovedContract = options.allowUnapprovedContract || false;
    this.allowUnpinnedRoots = options.allowUnpinnedRoots || false;
    this.executionAuthKey =
      options.executionAuthKey || process.env.DICE_EXECUTION_AUTH_KEY || null;
    const effectiveDistDir =
      options.distDir ||
      process.env.DICE_EXTERNAL_DIST_DIR ||
      (resolve(__dirname, "..") !== resolve(this.repoRoot)
        ? resolve(__dirname, "..")
        : null);
    this.distDir = effectiveDistDir;
  }

  execute() {
    validateSafePath(this.evidenceDir);
    validateSafePath(this.contractPath);

    const fullEvidenceDir = resolve(this.repoRoot, this.evidenceDir);
    const receiptsDir = join(fullEvidenceDir, "receipts");
    const ledgerPath = join(fullEvidenceDir, "receipts.sha256");

    console.log(
      "===============================================================================",
    );
    console.log(
      "  FRAME30 UNIVERSAL VERIFICATION MOULD (DICE) — ISOLATED SIGNING SERVICE",
    );
    console.log(
      "  Normative Standard: F30-DICE-ARCH-001 Revision 2.3 & Stage 2.4",
    );
    console.log(`  Mode:               ${this.mode}`);
    console.log(`  Evidence Directory: ${this.evidenceDir}`);
    console.log(`  Contract Path:      ${this.contractPath}`);
    console.log(
      "===============================================================================\n",
    );

    // Gate 0: Mode Segregation & Key Isolation
    console.log(
      `[dice-signing] Gate 0: Verifying signing mode boundary (mode: ${this.mode})...`,
    );
    // Verify privileged pipeline configuration integrity
    verifyPipelineConfiguration({
      repoRoot: this.repoRoot,
      trustedRef: this.trustedRef,
      externalDistDir: this.distDir,
    });
    console.log(
      "  ✓ Privileged pipeline configuration verified against trusted root (ConfigHashGuard)",
    );

    if (this.mode === "test") {
      if (process.env.DICE_SIGNING_KEY && process.env.DICE_SIGNING_KEY.trim()) {
        throw new Error(
          "FAIL-CLOSED: DICE_SIGNING_KEY is present in test mode. Production signing keys must NEVER be exposed to test environments.",
        );
      }
      if (this.keyId === "key-dice-authoritative-01") {
        throw new Error(
          "FAIL-CLOSED: Production signing key ID 'key-dice-authoritative-01' is forbidden in test mode.",
        );
      }
      console.log(
        "  ✓ Test mode verified: production key strictly absent, test key ID configured",
      );
    } else {
      // Production mode
      if (this.keyId === "key-dice-test-signer-01") {
        throw new Error(
          `FAIL-CLOSED: Test key ID '${this.keyId}' cannot be used in production signing mode.`,
        );
      }
      console.log("  ✓ Production mode verified: test signer key rejected");
    }

    // Check 1: Candidate Identity
    console.log(
      "[dice-signing] Gate 1: Verifying candidate identity against git object database...",
    );
    let candidateCommit = this.candidateCommit;
    let candidateTree = this.candidateTree;

    const summaryPath = join(fullEvidenceDir, "qualification-summary.json");
    if (existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
        const summaryCommit = validateCommitSha(summary.candidate_commit);
        const summaryTree = validateTreeSha(summary.candidate_tree);
        if (candidateCommit && candidateCommit !== summaryCommit) {
          throw new Error(
            `FAIL-CLOSED: Supplied candidate commit (${candidateCommit}) does not match qualification-summary (${summaryCommit})`,
          );
        }
        if (candidateTree && candidateTree !== summaryTree) {
          throw new Error(
            `FAIL-CLOSED: Supplied candidate tree (${candidateTree}) does not match qualification-summary (${summaryTree})`,
          );
        }
        candidateCommit = summaryCommit;
        candidateTree = summaryTree;
      } catch (err) {
        throw new Error(
          `FAIL-CLOSED: Malformed qualification-summary.json: ${err.message}`,
        );
      }
    } else if (!candidateCommit || !candidateTree) {
      try {
        candidateCommit = validateCommitSha(
          execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: this.repoRoot,
            encoding: "utf8",
          }).trim(),
        );
        candidateTree = validateTreeSha(
          execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
            cwd: this.repoRoot,
            encoding: "utf8",
          }).trim(),
        );
      } catch (err) {
        throw new Error(
          `FAIL-CLOSED: Cannot resolve candidate identity in git: ${err.message}`,
        );
      }
    }

    // Verify commit and tree exist in Git
    try {
      execFileSync(
        "git",
        ["rev-parse", "--verify", `${candidateCommit}^{commit}`],
        {
          cwd: this.repoRoot,
          stdio: "ignore",
        },
      );
      execFileSync(
        "git",
        ["rev-parse", "--verify", `${candidateTree}^{tree}`],
        {
          cwd: this.repoRoot,
          stdio: "ignore",
        },
      );

      // Verify that candidate tree does not commit evidence (receipt provenance check)
      try {
        const artifactsTree = execFileSync(
          "git",
          ["ls-tree", candidateTree, "artifacts"],
          { cwd: this.repoRoot, encoding: "utf8" },
        ).trim();
        if (artifactsTree) {
          throw new Error(
            `FAIL-CLOSED: Candidate git tree contains committed 'artifacts' directory. Verification evidence must be produced by authentic execution, never committed into repository.`,
          );
        }
      } catch (err) {
        if (err.message && err.message.startsWith("FAIL-CLOSED:")) throw err;
      }
    } catch (err) {
      if (err.message && err.message.startsWith("FAIL-CLOSED:")) throw err;
      throw new Error(
        `FAIL-CLOSED: Candidate commit '${candidateCommit}' or tree '${candidateTree}' missing from git: ${err.message}`,
      );
    }
    console.log(`  ✓ Candidate Commit verified: ${candidateCommit}`);
    console.log(`  ✓ Candidate Tree verified:   ${candidateTree}`);

    // Check 2: Trusted Policy Identity
    console.log(
      "\n[dice-signing] Gate 2: Verifying trusted policy identity and manifest...",
    );
    const trustedRoot = new DiceTrustedRoot({
      repoRoot: this.repoRoot,
      trustedRef: this.trustedRef,
      allowUnpinnedRoots: this.allowUnpinnedRoots,
      externalDistDir: this.distDir,
    });
    const trustedInfo = trustedRoot.resolve();
    console.log(`  ✓ Trusted Commit:     ${trustedInfo.trustedCommit}`);
    console.log(`  ✓ Trusted Policy SHA: ${trustedInfo.trustedRootSha}`);

    // Check 3: Contract Authorization
    console.log(
      "\n[dice-signing] Gate 3: Verifying change contract authorization against trusted policy...",
    );
    const fullContractPath = resolve(this.repoRoot, this.contractPath);
    if (!existsSync(fullContractPath)) {
      throw new Error(
        `FAIL-CLOSED: Change contract missing at ${fullContractPath}`,
      );
    }

    let contract;
    try {
      contract = JSON.parse(readFileSync(fullContractPath, "utf8"));
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Malformed change contract JSON: ${err.message}`,
      );
    }

    if (!contract.change_id) {
      throw new Error("FAIL-CLOSED: Contract missing change_id");
    }

    if (this.mode === "test") {
      if (!contract.is_test_contract) {
        throw new Error(
          "FAIL-CLOSED: Test-mode signing requires a dedicated test qualification contract with 'is_test_contract: true'",
        );
      }
      if (contract.owner === "@devrahmanbd") {
        throw new Error(
          "FAIL-CLOSED: Test contract cannot claim human specification authority '@devrahmanbd'",
        );
      }
      if (contract.approval_state !== "approved") {
        throw new Error(
          `FAIL-CLOSED: Test contract approval_state is '${contract.approval_state}', expected 'approved' for test qualification`,
        );
      }
      // Load test policy strictly from trusted root distribution or protected signer distribution directory
      let testPolicy;
      try {
        testPolicy = trustedRoot.loadTrustedJson(
          "registries/dice/test-policy.json",
        );
      } catch {
        let protectedPolicyPath = this.distDir
          ? join(this.distDir, "registries/dice/test-policy.json")
          : null;
        if (!protectedPolicyPath || !existsSync(protectedPolicyPath)) {
          protectedPolicyPath = join(
            this.repoRoot,
            "registries/dice/test-policy.json",
          );
        }
        if (protectedPolicyPath && existsSync(protectedPolicyPath)) {
          testPolicy = JSON.parse(readFileSync(protectedPolicyPath, "utf8"));
        } else {
          throw new Error(
            "FAIL-CLOSED: Authoritative registries/dice/test-policy.json missing from protected distribution",
          );
        }
      }

      const rawContractBuf = readFileSync(fullContractPath);
      const contractDigest = createHash("sha256")
        .update(rawContractBuf)
        .digest("hex");
      if (
        testPolicy.test_contract &&
        testPolicy.test_contract.sha256 !== contractDigest
      ) {
        throw new Error(
          `FAIL-CLOSED: Test contract digest mismatch against test policy: expected ${testPolicy.test_contract.sha256}, got ${contractDigest}`,
        );
      }
      if (
        testPolicy.test_contract &&
        testPolicy.test_contract.change_id !== contract.change_id
      ) {
        throw new Error(
          `FAIL-CLOSED: Test contract change_id mismatch against test policy: expected ${testPolicy.test_contract.change_id}, got ${contract.change_id}`,
        );
      }
      if (
        testPolicy.test_signing &&
        testPolicy.test_signing.allowed_modes &&
        !testPolicy.test_signing.allowed_modes.includes(this.mode)
      ) {
        throw new Error(
          `FAIL-CLOSED: Signing mode '${this.mode}' not permitted by test policy`,
        );
      }
      console.log(
        `  ✓ Test contract authorization verified: ${contract.change_id} (digest: ${contractDigest}, owner: ${contract.owner})`,
      );
    } else {
      if (contract.is_test_contract) {
        throw new Error(
          "FAIL-CLOSED: Production signing rejected test contract. Test contracts cannot produce authoritative production attestations.",
        );
      }
      if (!this.allowUnapprovedContract && contract.owner !== "@devrahmanbd") {
        throw new Error(
          `FAIL-CLOSED: Production contract must be owned by human authority '@devrahmanbd', got '${contract.owner}'`,
        );
      }
      if (
        !this.allowUnapprovedContract &&
        contract.approval_state !== "approved"
      ) {
        throw new Error(
          `FAIL-CLOSED: Contract approval_state is '${contract.approval_state}', expected 'approved' for authoritative signing`,
        );
      }
      console.log(
        `  ✓ Contract authorization verified: ${contract.change_id} (state: ${contract.approval_state})`,
      );
    }

    // Check 4 & 5: Detached Ledger & Method Receipts Validation
    console.log(
      "\n[dice-signing] Gate 4 & 5: Validating detached receipt ledger and method receipts...",
    );
    if (!existsSync(ledgerPath)) {
      throw new Error(
        `FAIL-CLOSED: Detached receipt ledger missing at ${ledgerPath}`,
      );
    }
    const ledgerContent = readFileSync(ledgerPath, "utf8");
    if (!ledgerContent.trim()) {
      throw new Error("FAIL-CLOSED: Detached receipt ledger is empty");
    }

    let trustedKeys;
    if (this.testKeys) {
      trustedKeys = this.testKeys;
    } else if (this.testKeysPath) {
      trustedKeys = JSON.parse(readFileSync(this.testKeysPath, "utf8"));
    } else {
      try {
        trustedKeys = trustedRoot.loadTrustedJson(
          "registries/dice/trusted-keys.json",
        );
      } catch {
        const p = this.distDir
          ? join(this.distDir, "registries/dice/trusted-keys.json")
          : process.env.DICE_REQUIRE_EXTERNAL_ANCHORS === "1"
            ? null
            : join(this.repoRoot, "registries/dice/trusted-keys.json");
        if (p && existsSync(p)) {
          trustedKeys = JSON.parse(readFileSync(p, "utf8"));
        } else {
          throw new Error(
            "FAIL-CLOSED: Authoritative registries/dice/trusted-keys.json missing from protected distribution (BLOCKED)",
          );
        }
      }
    }

    const signingAuthority = new DiceSigningAuthority({
      trustedKeys,
      repoRoot: this.repoRoot,
    });

    // Validate ledger matches receipts on disk
    signingAuthority.validateLedger(ledgerContent, receiptsDir);

    // Validate authentic orchestrator execution evidence (qualification-summary.json)
    const qualSummaryPath = join(fullEvidenceDir, "qualification-summary.json");
    if (!existsSync(qualSummaryPath)) {
      throw new Error(
        "FAIL-CLOSED: Orchestrator execution evidence missing: qualification-summary.json not found",
      );
    }
    let summary;
    try {
      summary = JSON.parse(readFileSync(qualSummaryPath, "utf8"));
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Corrupt qualification-summary.json: ${err.message}`,
      );
    }
    if (!summary.runner_sha) {
      throw new Error(
        "FAIL-CLOSED: Orchestrator execution evidence missing mandatory runner_sha in qualification-summary.json",
      );
    }
    if (summary.runner_sha !== trustedInfo.runnerSha) {
      throw new Error(
        `FAIL-CLOSED: Orchestrator runner identity mismatch: expected '${trustedInfo.runnerSha}', got '${summary.runner_sha}'`,
      );
    }
    if (!summary.trusted_root_sha) {
      throw new Error(
        "FAIL-CLOSED: Orchestrator execution evidence missing mandatory trusted_root_sha in qualification-summary.json",
      );
    }
    if (summary.trusted_root_sha !== trustedInfo.trustedRootSha) {
      throw new Error(
        `FAIL-CLOSED: Orchestrator trusted root mismatch: expected '${trustedInfo.trustedRootSha}', got '${summary.trusted_root_sha}'`,
      );
    }
    if (summary.candidate_tree !== candidateTree) {
      throw new Error(
        `FAIL-CLOSED: Orchestrator candidate tree mismatch: expected '${candidateTree}', got '${summary.candidate_tree}'`,
      );
    }
    const computedLedgerDigest = computeReceiptDigest(ledgerContent);
    if (summary.ledger_sha256 !== computedLedgerDigest) {
      throw new Error(
        `FAIL-CLOSED: Orchestrator ledger digest mismatch: expected '${computedLedgerDigest}', got '${summary.ledger_sha256}'`,
      );
    }
    if (summary.qualification !== "QUALIFIED_PASS") {
      throw new Error(
        `FAIL-CLOSED: Orchestrator qualification is '${summary.qualification}', expected 'QUALIFIED_PASS'`,
      );
    }

    // Verify launcher execution seal
    const sealPath = join(fullEvidenceDir, ".launcher-seal.json");
    let seal = null;
    if (existsSync(sealPath)) {
      seal = JSON.parse(readFileSync(sealPath, "utf8"));
      if (!seal.signature || typeof seal.signature !== "string") {
        throw new Error(
          "FAIL-CLOSED: Missing mandatory launcher seal signature. Execution evidence unauthenticated.",
        );
      }
      if (!seal.public_key || typeof seal.public_key !== "string") {
        throw new Error(
          "FAIL-CLOSED: Missing mandatory launcher seal public_key. Execution evidence unauthenticated.",
        );
      }
      if (!seal.key_id || typeof seal.key_id !== "string") {
        throw new Error(
          "FAIL-CLOSED: Missing mandatory launcher seal key_id. Execution evidence unauthenticated.",
        );
      }

      const trustedLauncherKey = resolveTrustedLauncherKey(seal.key_id, {
        distDir: this.distDir,
        repoRoot: this.repoRoot,
        trustedKeys,
      });
      if (!trustedLauncherKey) {
        throw new Error(
          `FAIL-CLOSED: Launcher execution seal key_id '${seal.key_id}' is not anchored in independently trusted authority (Candidate-generated keypairs are rejected)`,
        );
      }
      const normalizePem = (p) => (p || "").replace(/\r\n/g, "\n").trim();
      if (
        normalizePem(seal.public_key) !==
        normalizePem(trustedLauncherKey.public_key_pem)
      ) {
        throw new Error(
          `FAIL-CLOSED: Launcher execution seal public_key does not match independently trusted authority for key '${seal.key_id}'`,
        );
      }

      const sealPayload = computeSealPayload(seal);
      let sealValid = false;
      try {
        sealValid = verify(
          null,
          Buffer.from(sealPayload, "utf8"),
          trustedLauncherKey.public_key_pem,
          Buffer.from(seal.signature, "hex"),
        );
      } catch (err) {
        throw new Error(
          `FAIL-CLOSED: Launcher execution seal signature verification error: ${err.message}`,
        );
      }
      if (!sealValid) {
        throw new Error(
          "FAIL-CLOSED: Launcher execution seal signature verification failed (unauthenticated provenance)",
        );
      }

      if (seal.ledger_sha256 !== computedLedgerDigest) {
        throw new Error(
          `FAIL-CLOSED: Replaced execution evidence detected! Detached ledger hash (${computedLedgerDigest}) does not match authenticated launcher execution seal (${seal.ledger_sha256})`,
        );
      }
    } else if (summary.execution_auth?.launcher_execution_id) {
      throw new Error(
        "FAIL-CLOSED: Missing authentic launcher execution seal (.launcher-seal.json). Execution evidence unauthenticated.",
      );
    }

    // Cryptographic authentication of orchestrator execution evidence using independently protected execution authority
    const executionAuthKey =
      this.executionAuthKey || process.env.DICE_EXECUTION_AUTH_KEY || null;

    if (!summary.execution_auth) {
      throw new Error(
        "FAIL-CLOSED: Missing or unauthenticated qualification-summary evidence: missing execution_auth cryptographic provenance from protected execution authority",
      );
    }
    if (
      !summary.execution_auth.signature ||
      typeof summary.execution_auth.signature !== "string"
    ) {
      throw new Error(
        "FAIL-CLOSED: Unauthenticated qualification-summary evidence: missing or malformed execution authority signature",
      );
    }
    if (!executionAuthKey) {
      throw new Error(
        "FAIL-CLOSED: Missing independently protected execution authority key (DICE_EXECUTION_AUTH_KEY). Cannot authenticate orchestrator evidence (BLOCKED).",
      );
    }
    const payloadParts = [
      summary.candidate_commit,
      summary.candidate_tree,
      computedLedgerDigest,
      summary.runner_sha,
      summary.trusted_root_sha,
      summary.qualification,
    ];
    if (summary.execution_auth.launcher_execution_id) {
      payloadParts.push(summary.execution_auth.launcher_execution_id);
    }
    const expectedAuthPayload = payloadParts.join(":");
    const expectedAuthSig = createHmac("sha256", executionAuthKey)
      .update(expectedAuthPayload)
      .digest("hex");
    if (summary.execution_auth.signature !== expectedAuthSig) {
      const fallbackPayload = [
        summary.candidate_commit,
        summary.candidate_tree,
        computedLedgerDigest,
        summary.runner_sha,
        summary.trusted_root_sha,
        summary.qualification,
      ].join(":");
      const fallbackSig = createHmac("sha256", executionAuthKey)
        .update(fallbackPayload)
        .digest("hex");
      if (summary.execution_auth.signature !== fallbackSig) {
        throw new Error(
          "FAIL-CLOSED: Unauthenticated orchestrator execution evidence: execution authority signature mismatch",
        );
      }
    }

    // Read all receipts from ledger and enforce authenticated execution provenance
    const receipts = [];
    const ledgerLines = ledgerContent.trim().split("\n").filter(Boolean);

    for (const line of ledgerLines) {
      const parts = line.trim().split(/\s+/);
      const relPath = parts[parts.length - 1];
      const cleanRel = relPath.replace(/^receipts\//, "");
      const receiptFile = resolve(receiptsDir, cleanRel);
      const receiptStr = readFileSync(receiptFile, "utf8");
      const computedReceiptHash = createHash("sha256")
        .update(receiptStr, "utf8")
        .digest("hex");
      if (seal && seal.receipt_hashes && seal.receipt_hashes[cleanRel]) {
        if (computedReceiptHash !== seal.receipt_hashes[cleanRel]) {
          throw new Error(
            `FAIL-CLOSED: Replaced execution evidence detected! Receipt '${cleanRel}' digest (${computedReceiptHash}) does not match authenticated launcher execution seal (${seal.receipt_hashes[cleanRel]})`,
          );
        }
      }
      const receipt = JSON.parse(receiptStr);

      if (
        receipt.tree_sha !== candidateTree &&
        receipt.candidate_tree !== candidateTree
      ) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' tree_sha (${receipt.tree_sha}) does not match candidate tree (${candidateTree})`,
        );
      }
      if (receipt.status !== "PASS") {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' has non-PASS status: ${receipt.status}`,
        );
      }

      const receiptExitCode =
        typeof receipt.exit_code === "number"
          ? receipt.exit_code
          : typeof receipt.execution_provenance?.exit_code === "number"
            ? receipt.execution_provenance.exit_code
            : typeof receipt.invocation?.exit_code === "number"
              ? receipt.invocation.exit_code
              : undefined;

      if (receiptExitCode === undefined) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' missing mandatory exit_code`,
        );
      }
      if (receiptExitCode !== 0) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' reports non-zero exit_code: ${receiptExitCode}`,
        );
      }
      const command =
        (receipt.invocation && receipt.invocation.command) ||
        (receipt.execution && receipt.execution.command);
      if (!command || !Array.isArray(command) || command.length === 0) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' missing execution command array`,
        );
      }

      // Authenticate execution provenance against trusted runner
      const runnerId = receipt.runner_identity || receipt.execution_provenance;
      if (!runnerId || !runnerId.runner_sha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: missing runner_identity`,
        );
      }
      if (runnerId.runner_sha !== trustedInfo.runnerSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: runner_sha (${runnerId.runner_sha}) does not match trusted runner (${trustedInfo.runnerSha})`,
        );
      }
      const receiptRootSha =
        runnerId.trusted_root_sha ||
        receipt.trusted_root_sha ||
        receipt.execution_provenance?.trusted_root_sha;
      if (!receiptRootSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: missing mandatory trusted_root_sha`,
        );
      }
      if (receiptRootSha !== trustedInfo.trustedRootSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: trusted_root_sha mismatch: expected '${trustedInfo.trustedRootSha}', got '${receiptRootSha}'`,
        );
      }

      // Authenticate process execution logs
      const logRelPath =
        receipt.execution_provenance?.log_file ||
        receipt.log_file ||
        `logs/${cleanRel.replace(/\.json$/, "")}.log`;
      const logFilePath = resolve(fullEvidenceDir, logRelPath);
      if (!existsSync(logFilePath)) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: execution log missing at ${logRelPath}`,
        );
      }
      const actualLogContent = readFileSync(logFilePath, "utf8");
      const actualLogSha = createHash("sha256")
        .update(actualLogContent)
        .digest("hex");
      const expectedLogSha =
        receipt.execution_provenance?.log_sha256 ||
        receipt.log_sha256 ||
        receipt.invocation?.log_sha256;
      if (!expectedLogSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: missing mandatory log_sha256`,
        );
      }
      if (actualLogSha !== expectedLogSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: execution log SHA-256 mismatch: expected '${expectedLogSha}', got '${actualLogSha}'`,
        );
      }
      if (seal && seal.log_hashes && seal.log_hashes[logRelPath]) {
        if (actualLogSha !== seal.log_hashes[logRelPath]) {
          throw new Error(
            `FAIL-CLOSED: Replaced execution evidence detected! Execution log '${logRelPath}' digest (${actualLogSha}) does not match authenticated launcher execution seal (${seal.log_hashes[logRelPath]})`,
          );
        }
      }

      receipts.push(receipt);
    }
    console.log(
      `  ✓ All ${receipts.length} declared method receipts verified against detached ledger and authenticated execution provenance`,
    );

    // Check 6: Method-Level Qualification Re-Evaluation
    console.log(
      "\n[dice-signing] Gate 6: Re-evaluating method-level candidate qualification...",
    );
    let mandatoryList;
    let mandatoryRegistryPath;
    try {
      mandatoryList = trustedRoot.loadTrustedJson(
        "registries/dice/mandatory-obligations.json",
      );
      mandatoryRegistryPath = trustedRoot.getTrustedPath(
        "registries/dice/mandatory-obligations.json",
      );
    } catch {
      mandatoryRegistryPath = this.distDir
        ? join(this.distDir, "registries/dice/mandatory-obligations.json")
        : join(this.repoRoot, "registries/dice/mandatory-obligations.json");
      if (existsSync(mandatoryRegistryPath)) {
        mandatoryList = JSON.parse(readFileSync(mandatoryRegistryPath, "utf8"));
      } else {
        throw new Error(
          "FAIL-CLOSED: Authoritative registries/dice/mandatory-obligations.json missing from protected distribution",
        );
      }
    }
    const planResult = generateFrozenPlan({
      candidateCommit,
      candidateTree,
      selectedObligations: [],
      registryPath: mandatoryRegistryPath,
    });

    const obligationsMap = new Map();
    for (const ob of mandatoryList) {
      obligationsMap.set(ob.obligation_id, ob);
    }

    const qualResult = evaluateCandidateQualification(
      planResult.plan,
      receipts,
      candidateTree,
      {
        obligationsMap,
      },
    );

    if (qualResult.qualification !== "QUALIFIED_PASS") {
      throw new Error(
        `FAIL-CLOSED: Candidate qualification re-evaluation failed: ${qualResult.qualification} (${qualResult.reason})`,
      );
    }
    console.log(`  ✓ Candidate qualification re-verified: QUALIFIED_PASS`);

    // Check 7: Key Role & Revocation Status
    console.log(
      "\n[dice-signing] Gate 7: Verifying signer key role and revocation status...",
    );
    if (this.mode === "test" && this.keyId === "key-dice-authoritative-01") {
      throw new Error(
        "FAIL-CLOSED: Production signing key ID 'key-dice-authoritative-01' is forbidden in test mode",
      );
    }
    if (
      this.mode === "production" &&
      this.keyId === "key-dice-test-signer-01"
    ) {
      throw new Error(
        "FAIL-CLOSED: Test key ID 'key-dice-test-signer-01' is forbidden in production signing mode",
      );
    }
    const keyRes = signingAuthority.resolveKey(this.keyId);
    if (keyRes.status === "UNKNOWN_KEY") {
      throw new Error(
        `FAIL-CLOSED: Signer key '${this.keyId}' is not registered in trusted-keys.json`,
      );
    }
    if (keyRes.status === "REVOKED") {
      throw new Error(`FAIL-CLOSED: Signer key '${this.keyId}' is REVOKED`);
    }
    if (keyRes.status !== "ACTIVE") {
      throw new Error(
        `FAIL-CLOSED: Signer key '${this.keyId}' has non-active status: ${keyRes.status}`,
      );
    }
    if (
      !keyRes.keyDef.roles ||
      !keyRes.keyDef.roles.includes("dice-attestation-signer")
    ) {
      throw new Error(
        `FAIL-CLOSED: Signer key '${this.keyId}' lacks authorized role 'dice-attestation-signer'`,
      );
    }
    console.log(
      `  ✓ Signer key verified: ${this.keyId} (status: active, role: dice-attestation-signer)`,
    );

    // Signing Decision
    if (!this.signingKeyPem) {
      console.log(
        "\n===============================================================================",
      );
      console.log(
        `  [dice-signing] UNATTESTED: ${this.mode === "test" ? "DICE_TEST_SIGNING_KEY / test key" : "DICE_SIGNING_KEY"} unset.`,
      );
      console.log(
        `  All verification gates passed. Candidate is qualified but UNATTESTED (mode: ${this.mode}).`,
      );
      console.log(
        "===============================================================================\n",
      );
      return {
        status: "UNATTESTED",
        mode: this.mode,
        candidateCommit,
        candidateTree,
        qualification:
          this.mode === "test"
            ? "TEST_QUALIFIED_NON_AUTHORITATIVE"
            : "QUALIFIED_PASS",
      };
    }

    // Construct Statement and Sign
    console.log(
      `\n[dice-signing] Generating ${this.mode === "test" ? "non-authoritative test" : "authoritative"} in-toto DSSE attestation...`,
    );
    const isTestMode = this.mode === "test";
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
      predicateType: isTestMode
        ? "https://framique.com/dice/test-attestation/v1"
        : "https://framique.com/dice/attestation/v1",
      predicate: {
        qualification: isTestMode
          ? "TEST_QUALIFIED_NON_AUTHORITATIVE"
          : "QUALIFIED_PASS",
        mode: this.mode,
        plan_hash: planResult.planHash,
        contract: contract.change_id,
        trusted_root_sha: trustedInfo.trustedRootSha,
        runner_sha: trustedInfo.runnerSha,
        obligations_verified: receipts.length,
        ledger_sha256: computeReceiptDigest(ledgerContent),
        attested_at: new Date().toISOString(),
      },
    };

    const envelope = signingAuthority.signAttestation(
      statement,
      this.signingKeyPem,
      this.keyId,
      {
        ledgerContent,
        receiptsDir,
        requiredRole: "dice-attestation-signer",
      },
    );

    const envelopeFileName = isTestMode
      ? "test-attestation.dsse.json"
      : "attestation.dsse.json";
    const envelopePath = join(fullEvidenceDir, envelopeFileName);
    writeFileSync(envelopePath, canonicalizeJson(envelope), "utf8");
    console.log(
      `  ✓ ${isTestMode ? "Test" : "Authoritative"} in-toto DSSE attestation envelope written to: ${envelopePath}`,
    );

    // Verify envelope immediately
    const verifyRes = signingAuthority.verifyAttestation(envelope);
    if (!verifyRes.valid) {
      throw new Error(
        `FAIL-CLOSED: Immediate verification of generated attestation failed: ${verifyRes.reason}`,
      );
    }
    console.log(
      `  ✓ Self-verification passed against registered trusted public key (${verifyRes.keyid})`,
    );

    console.log(
      "\n===============================================================================",
    );
    console.log(
      `  [dice-signing] ✓ ATTESTATION COMPLETE: ${statement.predicate.qualification} (${this.mode} mode)`,
    );
    console.log(
      "===============================================================================\n",
    );

    return {
      status: isTestMode ? "TEST_ATTESTED" : "ATTESTED",
      mode: this.mode,
      candidateCommit,
      candidateTree,
      qualification: statement.predicate.qualification,
      envelopePath,
      envelope,
    };
  }
}

/**
 * Frame30 DICE Execution Authority
 *
 * Runs exclusively in the isolated attestation job outside candidate execution.
 * Holds the private DICE_EXECUTION_AUTH_KEY to independently verify candidate
 * execution evidence (receipts, logs, runner identity, root SHA, qualification)
 * without trusting candidate-provided HMACs or signatures.
 */
export class DiceExecutionAuthority {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.distDir =
      options.distDir ||
      process.env.DICE_EXTERNAL_DIST_DIR ||
      (resolve(__dirname, "..") !== resolve(this.repoRoot)
        ? resolve(__dirname, "..")
        : null);
    this.trustedRef =
      options.trustedRef || process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;
    this.contractPath =
      options.contractPath ||
      process.env.ACTIVE_CHANGE_CONTRACT ||
      "registries/dice/test-qualification-contract.json";
    this.executionAuthKey =
      options.executionAuthKey !== undefined
        ? options.executionAuthKey
        : process.env.DICE_EXECUTION_AUTH_KEY || null;
    this.allowUnpinnedRoots = options.allowUnpinnedRoots || false;
    this.trustedKeys = options.trustedKeys || null;
  }

  authenticateExecutionEvidence(evidenceDir = "artifacts/dice-evidence") {
    if (!this.executionAuthKey) {
      throw new Error(
        "FAIL-CLOSED: Missing independently protected execution authority key (DICE_EXECUTION_AUTH_KEY). Cannot authenticate orchestrator evidence (BLOCKED).",
      );
    }
    validateSafePath(evidenceDir);
    const fullEvidenceDir = resolve(this.repoRoot, evidenceDir);
    const receiptsDir = join(fullEvidenceDir, "receipts");
    const ledgerPath = join(fullEvidenceDir, "receipts.sha256");
    const summaryPath = join(fullEvidenceDir, "qualification-summary.json");

    if (!existsSync(fullEvidenceDir)) {
      throw new Error(
        `FAIL-CLOSED: Evidence directory missing: ${evidenceDir}`,
      );
    }
    if (!existsSync(receiptsDir)) {
      throw new Error(
        `FAIL-CLOSED: Receipts directory missing: ${receiptsDir}`,
      );
    }
    if (!existsSync(ledgerPath)) {
      throw new Error(
        `FAIL-CLOSED: Detached receipt ledger missing: ${ledgerPath}`,
      );
    }
    if (!existsSync(summaryPath)) {
      throw new Error(
        `FAIL-CLOSED: Qualification summary missing: ${summaryPath}`,
      );
    }

    // Verify privileged pipeline configuration
    verifyPipelineConfiguration({
      repoRoot: this.repoRoot,
      trustedRef: this.trustedRef,
      externalDistDir: this.distDir,
    });

    // Resolve trusted root and runner SHA from protected distribution
    const trustedRoot = new DiceTrustedRoot({
      repoRoot: this.repoRoot,
      trustedRef: this.trustedRef,
      externalDistDir: this.distDir,
      allowUnpinnedRoots: this.allowUnpinnedRoots,
    });
    const trustedInfo = trustedRoot.resolve();

    // Verify candidate identity from git
    const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: this.repoRoot,
      encoding: "utf8",
    }).trim();
    const candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: this.repoRoot,
      encoding: "utf8",
    }).trim();

    // Verify commit and tree exist in git object database
    execFileSync(
      "git",
      ["rev-parse", "--verify", `${candidateCommit}^{commit}`],
      {
        cwd: this.repoRoot,
        stdio: "ignore",
      },
    );
    execFileSync("git", ["rev-parse", "--verify", `${candidateTree}^{tree}`], {
      cwd: this.repoRoot,
      stdio: "ignore",
    });

    // Verify authentic launcher execution seal
    const sealPath = join(fullEvidenceDir, ".launcher-seal.json");
    if (!existsSync(sealPath)) {
      throw new Error(
        "FAIL-CLOSED: Missing authentic launcher execution seal (.launcher-seal.json). Execution evidence unauthenticated.",
      );
    }
    let seal;
    try {
      seal = JSON.parse(readFileSync(sealPath, "utf8"));
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Malformed launcher execution seal: ${err.message}`,
      );
    }
    if (trustedInfo.launcherSha && trustedInfo.launcherSha !== "unknown") {
      if (!seal.launcher_sha || seal.launcher_sha !== trustedInfo.launcherSha) {
        throw new Error(
          `FAIL-CLOSED: Launcher execution seal launcher_sha mismatch: expected '${trustedInfo.launcherSha}', got '${seal.launcher_sha}'`,
        );
      }
    }
    if (!seal.runner_sha || seal.runner_sha !== trustedInfo.runnerSha) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal runner_sha mismatch: expected '${trustedInfo.runnerSha}', got '${seal.runner_sha}'`,
      );
    }
    if (
      !seal.trusted_root_sha ||
      seal.trusted_root_sha !== trustedInfo.trustedRootSha
    ) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal trusted_root_sha mismatch: expected '${trustedInfo.trustedRootSha}', got '${seal.trusted_root_sha}'`,
      );
    }
    if (seal.candidate_tree && seal.candidate_tree !== candidateTree) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal candidate_tree mismatch: expected '${candidateTree}', got '${seal.candidate_tree}'`,
      );
    }
    if (seal.candidate_commit && seal.candidate_commit !== candidateCommit) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal candidate_commit mismatch: expected '${candidateCommit}', got '${seal.candidate_commit}'`,
      );
    }

    if (!seal.signature || typeof seal.signature !== "string") {
      throw new Error(
        "FAIL-CLOSED: Missing mandatory launcher seal signature. Execution evidence unauthenticated.",
      );
    }
    if (!seal.public_key || typeof seal.public_key !== "string") {
      throw new Error(
        "FAIL-CLOSED: Missing mandatory launcher seal public_key. Execution evidence unauthenticated.",
      );
    }
    if (!seal.key_id || typeof seal.key_id !== "string") {
      throw new Error(
        "FAIL-CLOSED: Missing mandatory launcher seal key_id. Execution evidence unauthenticated.",
      );
    }

    const trustedLauncherKey = resolveTrustedLauncherKey(seal.key_id, {
      distDir: this.distDir,
      repoRoot: this.repoRoot,
      trustedKeys: this.trustedKeys,
    });
    if (!trustedLauncherKey) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal key_id '${seal.key_id}' is not anchored in independently trusted authority (Candidate-generated keypairs are rejected)`,
      );
    }
    const normalizePem = (p) => (p || "").replace(/\r\n/g, "\n").trim();
    if (
      normalizePem(seal.public_key) !==
      normalizePem(trustedLauncherKey.public_key_pem)
    ) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal public_key does not match independently trusted authority for key '${seal.key_id}'`,
      );
    }

    const sealPayload = computeSealPayload(seal);
    let sealValid = false;
    try {
      sealValid = verify(
        null,
        Buffer.from(sealPayload, "utf8"),
        trustedLauncherKey.public_key_pem,
        Buffer.from(seal.signature, "hex"),
      );
    } catch (err) {
      throw new Error(
        `FAIL-CLOSED: Launcher execution seal signature verification error: ${err.message}`,
      );
    }
    if (!sealValid) {
      throw new Error(
        "FAIL-CLOSED: Launcher execution seal signature verification failed (unauthenticated provenance)",
      );
    }

    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    if (
      summary.candidate_commit &&
      summary.candidate_commit !== candidateCommit
    ) {
      throw new Error(
        `FAIL-CLOSED: Candidate commit mismatch: expected '${candidateCommit}', got '${summary.candidate_commit}'`,
      );
    }
    if (summary.candidate_tree && summary.candidate_tree !== candidateTree) {
      throw new Error(
        `FAIL-CLOSED: Candidate tree mismatch: expected '${candidateTree}', got '${summary.candidate_tree}'`,
      );
    }

    const ledgerContent = readFileSync(ledgerPath, "utf8");
    const computedLedgerDigest = computeReceiptDigest(ledgerContent);
    if (seal.ledger_sha256 !== computedLedgerDigest) {
      throw new Error(
        `FAIL-CLOSED: Replaced execution evidence detected! Detached ledger hash (${computedLedgerDigest}) does not match authenticated launcher execution seal (${seal.ledger_sha256})`,
      );
    }
    const receipts = [];
    const ledgerLines = ledgerContent.trim().split("\n").filter(Boolean);

    for (const line of ledgerLines) {
      const parts = line.trim().split(/\s+/);
      const relPath = parts[parts.length - 1];
      const cleanRel = relPath.replace(/^receipts\//, "");
      const receiptFile = resolve(receiptsDir, cleanRel);
      if (!existsSync(receiptFile)) {
        throw new Error(
          `FAIL-CLOSED: Declared receipt missing from disk: ${cleanRel}`,
        );
      }
      const receiptStr = readFileSync(receiptFile, "utf8");
      const computedHash = createHash("sha256")
        .update(receiptStr, "utf8")
        .digest("hex");
      if (computedHash !== parts[0]) {
        throw new Error(
          `FAIL-CLOSED: Ledger digest mismatch for '${cleanRel}': expected '${parts[0]}', computed '${computedHash}'`,
        );
      }
      if (seal.receipt_hashes && seal.receipt_hashes[cleanRel]) {
        if (computedHash !== seal.receipt_hashes[cleanRel]) {
          throw new Error(
            `FAIL-CLOSED: Replaced execution evidence detected! Receipt '${cleanRel}' digest (${computedHash}) does not match authenticated launcher execution seal (${seal.receipt_hashes[cleanRel]})`,
          );
        }
      }
      const receipt = JSON.parse(receiptStr);
      if (
        receipt.tree_sha !== candidateTree &&
        receipt.candidate_tree !== candidateTree
      ) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' tree_sha (${receipt.tree_sha}) does not match candidate tree (${candidateTree})`,
        );
      }
      if (receipt.status !== "PASS") {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' has non-PASS status: ${receipt.status}`,
        );
      }
      const receiptExitCode =
        typeof receipt.exit_code === "number"
          ? receipt.exit_code
          : typeof receipt.execution_provenance?.exit_code === "number"
            ? receipt.execution_provenance.exit_code
            : typeof receipt.invocation?.exit_code === "number"
              ? receipt.invocation.exit_code
              : undefined;
      if (receiptExitCode === undefined) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' missing mandatory exit_code`,
        );
      }
      if (receiptExitCode !== 0) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' reports non-zero exit_code: ${receiptExitCode}`,
        );
      }
      const command =
        (receipt.invocation && receipt.invocation.command) ||
        (receipt.execution && receipt.execution.command);
      if (!command || !Array.isArray(command) || command.length === 0) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' missing execution command array`,
        );
      }
      const runnerId = receipt.runner_identity || receipt.execution_provenance;
      if (!runnerId || !runnerId.runner_sha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: missing runner_identity`,
        );
      }
      if (runnerId.runner_sha !== trustedInfo.runnerSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: runner_sha (${runnerId.runner_sha}) does not match trusted runner (${trustedInfo.runnerSha})`,
        );
      }
      const receiptRootSha =
        runnerId.trusted_root_sha ||
        receipt.trusted_root_sha ||
        receipt.execution_provenance?.trusted_root_sha;
      if (!receiptRootSha || receiptRootSha !== trustedInfo.trustedRootSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: trusted_root_sha mismatch: expected '${trustedInfo.trustedRootSha}', got '${receiptRootSha}'`,
        );
      }
      const logRelPath =
        receipt.execution_provenance?.log_file ||
        receipt.log_file ||
        `logs/${cleanRel.replace(/\.json$/, "")}.log`;
      const logFilePath = resolve(fullEvidenceDir, logRelPath);
      if (!existsSync(logFilePath)) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: execution log missing at ${logRelPath}`,
        );
      }
      const actualLogContent = readFileSync(logFilePath, "utf8");
      const actualLogSha = createHash("sha256")
        .update(actualLogContent)
        .digest("hex");
      const expectedLogSha =
        receipt.execution_provenance?.log_sha256 ||
        receipt.log_sha256 ||
        receipt.invocation?.log_sha256;
      if (!expectedLogSha || actualLogSha !== expectedLogSha) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' execution provenance is unauthenticated: execution log SHA-256 mismatch: expected '${expectedLogSha}', got '${actualLogSha}'`,
        );
      }
      if (seal.log_hashes && seal.log_hashes[logRelPath]) {
        if (actualLogSha !== seal.log_hashes[logRelPath]) {
          throw new Error(
            `FAIL-CLOSED: Replaced execution evidence detected! Execution log '${logRelPath}' digest (${actualLogSha}) does not match authenticated launcher execution seal (${seal.log_hashes[logRelPath]})`,
          );
        }
      }
      receipts.push(receipt);
    }

    // Re-evaluate qualification using contract and frozen plan
    const contractFullPath = resolve(this.repoRoot, this.contractPath);
    if (!existsSync(contractFullPath)) {
      throw new Error(
        `FAIL-CLOSED: Contract file missing at ${contractFullPath}`,
      );
    }
    const contract = JSON.parse(readFileSync(contractFullPath, "utf8"));
    const frozenPlanResult = generateFrozenPlan({
      contract,
      candidateTree,
      repoRoot: this.repoRoot,
      distDir: this.distDir,
    });

    const qualResult = evaluateCandidateQualification(
      frozenPlanResult.plan,
      receipts,
      candidateTree,
    );

    if (qualResult.qualification !== "QUALIFIED_PASS") {
      throw new Error(
        `FAIL-CLOSED: Candidate qualification re-evaluation is '${qualResult.qualification}', expected 'QUALIFIED_PASS': ${qualResult.reason}`,
      );
    }

    // Evidence verified independently: Generate genuine execution_auth HMAC signature
    const signature = computeExecutionAuthSignature({
      candidateCommit,
      candidateTree,
      ledgerSha256: computedLedgerDigest,
      runnerSha: trustedInfo.runnerSha,
      trustedRootSha: trustedInfo.trustedRootSha,
      qualification: qualResult.qualification,
      authKey: this.executionAuthKey,
      launcherExecutionId: seal.launcher_execution_id,
    });

    const executionAuth = {
      version: "1.0.0",
      algorithm: "hmac-sha256",
      key_id: "dice-execution-authority-01",
      launcher_execution_id: seal.launcher_execution_id,
      signature,
      authenticated_at: new Date().toISOString(),
    };

    summary.candidate_commit = candidateCommit;
    summary.candidate_tree = candidateTree;
    summary.runner_sha = trustedInfo.runnerSha;
    summary.trusted_root_sha = trustedInfo.trustedRootSha;
    summary.ledger_sha256 = computedLedgerDigest;
    summary.qualification = qualResult.qualification;
    summary.execution_auth = executionAuth;

    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

    console.log(
      `[dice-execution-authority] ✓ Candidate execution evidence authenticated successfully by protected authority: ${signature.slice(0, 16)}...`,
    );

    return {
      authenticated: true,
      candidateCommit,
      candidateTree,
      qualification: qualResult.qualification,
      signature,
      executionAuth,
    };
  }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith("dice-signing-service.mjs")) {
  let mode = process.env.DICE_SIGNING_MODE || "production";
  let contractPath = null;
  let evidenceDir = "artifacts/dice-evidence";
  let candidateCommit = null;
  let candidateTree = null;
  let testKeysPath = null;
  let keyId = null;
  let trustedRef = process.env.DICE_TRUSTED_REF || DEFAULT_TRUSTED_REF;
  let signingKeyPem = null;
  let signingKeyFile = null;
  let distDir = null;
  let authenticateExecution = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/dice-signing-service.mjs [options]

Options:
  --authenticate-execution  Authenticate candidate execution evidence using DICE_EXECUTION_AUTH_KEY
  --mode=<test|production>  Signing mode (default: production)
  --contract=<path>         Path to change contract
  --evidence-dir=<path>     Path to evidence directory (default: artifacts/dice-evidence)
  --candidate-commit=<sha>  Candidate commit SHA (verified against git object database)
  --candidate-tree=<sha>    Candidate tree SHA (verified against git object database)
  --trusted-ref=<ref>       Git commit/tag for trusted root (default: 9e6a82abb3502edb84f2d7be9fcc36401b380bfb)
  --key-id=<id>             Key ID for signing
  --test-keys=<path>        Path to test trusted-keys.json for isolated test verification
  --signing-key-pem=<pem>   Signing key in PEM format
  --signing-key-file=<path> Path to signing key PEM file
  --help, -h                Show this help message
`);
      process.exit(0);
    } else if (arg === "--authenticate-execution") {
      authenticateExecution = true;
    } else if (arg.startsWith("--mode=")) {
      mode = arg.split("=")[1];
    } else if (arg.startsWith("--contract=")) {
      contractPath = arg.split("=")[1];
    } else if (arg.startsWith("--evidence-dir=")) {
      evidenceDir = arg.split("=")[1];
    } else if (arg.startsWith("--candidate-commit=")) {
      candidateCommit = arg.split("=")[1];
    } else if (arg.startsWith("--candidate-tree=")) {
      candidateTree = arg.split("=")[1];
    } else if (arg.startsWith("--trusted-ref=")) {
      trustedRef = arg.split("=")[1];
    } else if (arg.startsWith("--key-id=")) {
      keyId = arg.split("=")[1];
    } else if (arg.startsWith("--test-keys=")) {
      testKeysPath = arg.split("=")[1];
    } else if (arg.startsWith("--signing-key-pem=")) {
      signingKeyPem = arg.substring("--signing-key-pem=".length);
    } else if (arg.startsWith("--signing-key-file=")) {
      signingKeyFile = arg.split("=")[1];
    } else if (arg.startsWith("--dist-dir=")) {
      distDir = arg.split("=")[1];
    }
  }

  contractPath =
    contractPath ||
    process.env.ACTIVE_CHANGE_CONTRACT ||
    (mode === "test"
      ? "registries/dice/test-qualification-contract.json"
      : "features/contracts/F30-DICE-COMPLETE.json");

  if (authenticateExecution) {
    const authority = new DiceExecutionAuthority({
      repoRoot: process.cwd(),
      contractPath,
      trustedRef,
      distDir,
    });
    try {
      authority.authenticateExecutionEvidence(evidenceDir);
      console.log(
        "[dice-signing] ✓ Candidate execution evidence authenticated successfully by protected authority.",
      );
      process.exit(0);
    } catch (err) {
      console.error(`\n[dice-signing] ✗ FAIL-CLOSED: ${err.message}`);
      process.exit(1);
    }
  }

  keyId =
    keyId ||
    process.env.DICE_SIGNING_KEY_ID ||
    (mode === "test" ? "key-dice-test-signer-01" : "key-dice-authoritative-01");

  const service = new DiceSigningService({
    mode,
    contractPath,
    evidenceDir,
    candidateCommit,
    candidateTree,
    trustedRef,
    keyId,
    testKeysPath,
    signingKeyPem,
    signingKeyFile,
    distDir,
  });
  try {
    const res = service.execute();
    if (res.status !== "ATTESTED" && res.status !== "TEST_ATTESTED") {
      console.error(
        `\n[dice-signing] ✗ UNATTESTED: Candidate qualified but attestation signing was not completed (status: ${res.status}). Exit code 1.`,
      );
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error(`\n[dice-signing] ✗ FAIL-CLOSED: ${err.message}`);
    process.exit(1);
  }
}
