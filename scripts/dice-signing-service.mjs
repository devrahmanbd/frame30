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
import { createHash } from "node:crypto";
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
} from "./dice-root-of-trust.mjs";
import { evaluateCandidateQualification } from "./dice-qualify.mjs";
import {
  generateFrozenPlan,
  canonicalizeJson,
} from "./dice-plan-generator.mjs";

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
    this.distDir = options.distDir || resolve(__dirname, "..");
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
    } catch {
      throw new Error(
        `FAIL-CLOSED: Candidate commit '${candidateCommit}' or tree '${candidateTree}' missing from git`,
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
        const protectedPolicyPath = join(
          this.distDir,
          "registries/dice/test-policy.json",
        );
        if (existsSync(protectedPolicyPath)) {
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
        const p = join(this.distDir, "registries/dice/trusted-keys.json");
        if (existsSync(p)) {
          trustedKeys = JSON.parse(readFileSync(p, "utf8"));
        } else {
          throw new Error(
            "FAIL-CLOSED: Authoritative registries/dice/trusted-keys.json missing from protected distribution",
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

    // Read all receipts from ledger
    const receipts = [];
    const ledgerLines = ledgerContent.trim().split("\n").filter(Boolean);

    for (const line of ledgerLines) {
      const parts = line.trim().split(/\s+/);
      const relPath = parts[parts.length - 1];
      const cleanRel = relPath.replace(/^receipts\//, "");
      const receiptFile = resolve(receiptsDir, cleanRel);
      const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));

      if (receipt.tree_sha !== candidateTree) {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' tree_sha (${receipt.tree_sha}) does not match candidate tree (${candidateTree})`,
        );
      }
      if (receipt.status !== "PASS") {
        throw new Error(
          `FAIL-CLOSED: Receipt '${cleanRel}' has non-PASS status: ${receipt.status}`,
        );
      }
      receipts.push(receipt);
    }
    console.log(
      `  ✓ All ${receipts.length} declared method receipts verified against detached ledger`,
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
      mandatoryRegistryPath = join(
        this.distDir,
        "registries/dice/mandatory-obligations.json",
      );
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

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/dice-signing-service.mjs [options]

Options:
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
    }
  }

  contractPath =
    contractPath ||
    process.env.ACTIVE_CHANGE_CONTRACT ||
    (mode === "test"
      ? "registries/dice/test-qualification-contract.json"
      : "features/contracts/F30-DICE-COMPLETE.json");

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
