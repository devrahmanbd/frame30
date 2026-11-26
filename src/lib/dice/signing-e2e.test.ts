import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { DiceSigningService } from "../../../scripts/dice-signing-service.mjs";
import {
  DiceSigningAuthority,
  generateTestKeypair,
} from "../../../scripts/dice-evidence.mjs";
import {
  DEFAULT_TRUSTED_REF,
  DiceTrustedRoot,
} from "../../../scripts/dice-root-of-trust.mjs";

describe("Frame30 DICE Stage 2.4.1: Positive End-to-End Signing & Hardened Gate Verification (P0-4)", () => {
  const repoRoot = process.cwd();
  const testDir = resolve("/tmp", ".test-tmp-signing-e2e");

  let candidateCommit: string;
  let candidateTree: string;
  let testKeypair: { privateKey: string; publicKey: string };
  let testKeysJsonPath: string;
  let trustedInfo: { runnerSha: string; trustedRootSha: string };

  beforeAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    testKeypair = generateTestKeypair();

    const trustedRoot = new DiceTrustedRoot({
      repoRoot,
      trustedRef: DEFAULT_TRUSTED_REF,
      allowUnpinnedRoots: true,
    });
    trustedInfo = trustedRoot.resolve() as {
      runnerSha: string;
      trustedRootSha: string;
    };
    process.env.DICE_EXECUTION_AUTH_KEY = "test-execution-auth-key-01";

    // Write isolated test keys registry
    testKeysJsonPath = join(testDir, "test-trusted-keys.json");
    const testKeysDef = [
      {
        keyid: "key-dice-e2e-test-01",
        algorithm: "ed25519",
        public_key_pem: testKeypair.publicKey,
        roles: ["dice-attestation-signer"],
        status: "active",
        created_at: new Date().toISOString(),
      },
      {
        keyid: "key-dice-e2e-revoked-01",
        algorithm: "ed25519",
        public_key_pem: testKeypair.publicKey,
        roles: ["dice-attestation-signer"],
        status: "revoked",
        created_at: new Date().toISOString(),
      },
      {
        keyid: "key-dice-e2e-unauthorized-role",
        algorithm: "ed25519",
        public_key_pem: testKeypair.publicKey,
        roles: ["read-only-auditor"],
        status: "active",
        created_at: new Date().toISOString(),
      },
    ];
    writeFileSync(
      testKeysJsonPath,
      JSON.stringify(testKeysDef, null, 2),
      "utf8",
    );

    createApprovedContract(join(testDir, "F30-APPROVED-CLEAN.json"));
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createValidEvidenceDir(
    dir: string,
    overrides: Record<string, unknown> = {},
  ) {
    const receiptsDir = join(dir, "receipts");
    const logsDir = join(dir, "logs");
    mkdirSync(receiptsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });

    const activeObs = [
      "OBL-SYS-SCOPE-GUARD-001",
      "OBL-SYS-DRIFT-GUARD-001",
      "OBL-SYS-DIE-REGISTRY-001",
      "OBL-SYS-SECRETS-SCAN-001",
    ];
    const methodIdMap: Record<string, string> = {
      "OBL-SYS-SCOPE-GUARD-001": "METH-SCOPE-GUARD-01",
      "OBL-SYS-DRIFT-GUARD-001": "METH-DRIFT-GUARD-01",
      "OBL-SYS-DIE-REGISTRY-001": "METH-DIE-REGISTRY-01",
      "OBL-SYS-SECRETS-SCAN-001": "METH-SECRETS-SCAN-01",
    };

    let ledger = "";
    for (const obId of activeObs) {
      if (overrides.skipReceipt === obId) continue;

      const rPath = join(receiptsDir, `${obId}.json`);
      const status =
        overrides.failReceipt === obId
          ? "FAIL"
          : overrides.blockReceipt === obId
            ? "BLOCKED"
            : "PASS";

      const logRel = `logs/${obId}.log`;
      const logContent = `=== EXECUTION LOG FOR ${obId} ===\n`;
      writeFileSync(join(dir, logRel), logContent, "utf8");
      const logSha256 = createHash("sha256").update(logContent).digest("hex");

      const receipt = {
        receipt_version: "1.0.0",
        obligation_id: obId,
        method_id: methodIdMap[obId],
        status,
        exit_code: status === "PASS" ? 0 : 1,
        commit_sha: candidateCommit,
        tree_sha: candidateTree,
        candidate: { commit: candidateCommit, tree: candidateTree },
        environment: {
          node: process.version,
          platform: process.platform,
        },
        runner_identity: {
          runner_sha: trustedInfo?.runnerSha || "runner-sha",
          trusted_root_sha: trustedInfo?.trustedRootSha || "root-sha",
        },
        execution_provenance: {
          runner_sha: trustedInfo?.runnerSha || "runner-sha",
          trusted_root_sha: trustedInfo?.trustedRootSha || "root-sha",
          candidate_commit: candidateCommit,
          candidate_tree: candidateTree,
          log_file: logRel,
          log_sha256: logSha256,
          exit_code: status === "PASS" ? 0 : 1,
          duration_ms: 10,
          started_at: new Date().toISOString(),
        },
        invocation: {
          command: ["test"],
          exit_code: status === "PASS" ? 0 : 1,
          duration_ms: 10,
          started_at: new Date().toISOString(),
        },
        execution: {
          command: ["test"],
          duration_ms: 10,
          started_at: new Date().toISOString(),
        },
        verdict: {
          disposition: status,
          confidence: "machine_checked",
          timestamp: new Date().toISOString(),
        },
      };

      const content = JSON.stringify(receipt, null, 2);
      writeFileSync(rPath, content, "utf8");

      const sha = createHash("sha256").update(content, "utf8").digest("hex");
      ledger += `${sha}  receipts/${obId}.json\n`;
    }

    if (overrides.tamperedLedger) {
      ledger = overrides.tamperedLedger as string;
    }

    writeFileSync(join(dir, "receipts.sha256"), ledger, "utf8");

    const ledgerDigest = createHash("sha256").update(ledger).digest("hex");
    const summaryQual = (overrides.qualification as string) || "QUALIFIED_PASS";
    const authKey =
      (overrides.executionAuthKey as string) ||
      process.env.DICE_EXECUTION_AUTH_KEY ||
      "test-execution-auth-key-01";
    const runnerSha = trustedInfo?.runnerSha || "runner-sha";
    const trustedRootSha = trustedInfo?.trustedRootSha || "root-sha";
    const authPayload = [
      candidateCommit,
      candidateTree,
      ledgerDigest,
      runnerSha,
      trustedRootSha,
      summaryQual,
    ].join(":");
    const authSig = createHmac("sha256", authKey)
      .update(authPayload)
      .digest("hex");

    const summary = {
      version: "1.0.0",
      candidate_commit: candidateCommit,
      candidate_tree: candidateTree,
      runner_sha: runnerSha,
      trusted_root_sha: trustedRootSha,
      ledger_sha256: ledgerDigest,
      qualification: summaryQual,
      timestamp: new Date().toISOString(),
      execution_auth:
        overrides.executionAuth !== undefined
          ? overrides.executionAuth
          : {
              version: "1.0.0",
              algorithm: "hmac-sha256",
              key_id: "dice-execution-authority-01",
              signature: authSig,
              authenticated_at: new Date().toISOString(),
            },
    };
    writeFileSync(
      join(dir, "qualification-summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8",
    );
  }

  function createApprovedContract(targetPath: string) {
    const rawContract = JSON.parse(
      readFileSync(
        join(repoRoot, "features/contracts/F30-DICE-STAGE2-4-1.json"),
        "utf8",
      ),
    );
    rawContract.approval_state = "approved";
    rawContract.baseline_commit = "9e6a82abb3502edb84f2d7be9fcc36401b380bfb";
    rawContract.candidate_tree_sha = candidateTree;
    writeFileSync(targetPath, JSON.stringify(rawContract, null, 2), "utf8");
  }

  it("Positive Test: Executes complete signing service with zero bypass flags and verifies DSSE attestation", () => {
    const evDir = join(testDir, "ev-positive-clean");
    createValidEvidenceDir(evDir);

    const approvedContract = join(testDir, "F30-APPROVED-CLEAN.json");
    createApprovedContract(approvedContract);

    // Strictly NO bypass flags!
    const service = new DiceSigningService({
      repoRoot,
      contractPath: approvedContract,
      evidenceDir: evDir,
      keyId: "key-dice-e2e-test-01",
      signingKeyPem: testKeypair.privateKey,
      testKeysPath: testKeysJsonPath,
      // Zero bypasses:
      allowUnapprovedContract: false,
      allowUnpinnedRoots: false,
    });

    const result = service.execute();

    expect(result.status).toBe("ATTESTED");
    expect(result.qualification).toBe("QUALIFIED_PASS");
    expect(result.envelopePath).toBeDefined();
    expect(existsSync(result.envelopePath!)).toBe(true);
    expect(result.candidateCommit).toBe(candidateCommit);
    expect(result.candidateTree).toBe(candidateTree);

    // Cryptographic self-verification against test public key
    const envelope = JSON.parse(readFileSync(result.envelopePath!, "utf8"));
    const testAuthority = new DiceSigningAuthority({
      trustedKeys: JSON.parse(readFileSync(testKeysJsonPath, "utf8")),
      repoRoot,
    });
    const verifyResult = testAuthority.verifyAttestation(envelope);

    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.keyid).toBe("key-dice-e2e-test-01");
    expect(verifyResult.statement.predicate.qualification).toBe(
      "QUALIFIED_PASS",
    );
    expect(verifyResult.statement.subject[0].digest.sha256).toBe(candidateTree);
  });

  it("Negative Test 1: Rejects signing when contract has approval_state 'proposed'", () => {
    const evDir = join(testDir, "ev-neg-proposed");
    createValidEvidenceDir(evDir);

    const proposedContract = join(
      repoRoot,
      "features/contracts/F30-DICE-STAGE2-4-1.json",
    );

    const service = new DiceSigningService({
      repoRoot,
      contractPath: proposedContract,
      evidenceDir: evDir,
      keyId: "key-dice-e2e-test-01",
      signingKeyPem: testKeypair.privateKey,
      testKeysPath: testKeysJsonPath,
      allowUnapprovedContract: false,
      allowUnpinnedRoots: false,
    });

    expect(() => service.execute()).toThrow(
      /FAIL-CLOSED: Contract approval_state is 'proposed'/,
    );
  });

  it("Negative Test 2: Rejects signing when detached ledger digest does not match receipt on disk", () => {
    const evDir = join(testDir, "ev-neg-tampered-receipt");
    createValidEvidenceDir(evDir);

    // Tamper with a receipt on disk post-ledger
    const receiptPath = join(evDir, "receipts/OBL-SYS-SCOPE-GUARD-001.json");
    writeFileSync(receiptPath, JSON.stringify({ tampered: true }), "utf8");

    const approvedContract = join(testDir, "F30-APPROVED-CLEAN.json");

    const service = new DiceSigningService({
      repoRoot,
      contractPath: approvedContract,
      evidenceDir: evDir,
      keyId: "key-dice-e2e-test-01",
      signingKeyPem: testKeypair.privateKey,
      testKeysPath: testKeysJsonPath,
      allowUnapprovedContract: false,
      allowUnpinnedRoots: false,
    });

    expect(() => service.execute()).toThrow(/Receipt digest mismatch/);
  });

  it("Negative Test 3: Rejects signing when a mandatory obligation receipt is missing", () => {
    const evDir = join(testDir, "ev-neg-missing-receipt");
    createValidEvidenceDir(evDir, { skipReceipt: "OBL-SYS-SECRETS-SCAN-001" });

    const approvedContract = join(testDir, "F30-APPROVED-CLEAN.json");

    const service = new DiceSigningService({
      repoRoot,
      contractPath: approvedContract,
      evidenceDir: evDir,
      keyId: "key-dice-e2e-test-01",
      signingKeyPem: testKeypair.privateKey,
      testKeysPath: testKeysJsonPath,
      allowUnapprovedContract: false,
      allowUnpinnedRoots: false,
    });

    expect(() => service.execute()).toThrow(/MISSING_METHOD_RECEIPT|BLOCKED/);
  });

  it("Negative Test 4: Rejects signing when key is marked revoked", () => {
    const evDir = join(testDir, "ev-neg-revoked-key");
    createValidEvidenceDir(evDir);

    const approvedContract = join(testDir, "F30-APPROVED-CLEAN.json");

    const service = new DiceSigningService({
      repoRoot,
      contractPath: approvedContract,
      evidenceDir: evDir,
      keyId: "key-dice-e2e-revoked-01",
      signingKeyPem: testKeypair.privateKey,
      testKeysPath: testKeysJsonPath,
      allowUnapprovedContract: false,
      allowUnpinnedRoots: false,
    });

    expect(() => service.execute()).toThrow(/REVOKED/);
  });

  it("Negative Test 5: Rejects signing when key lacks authorized role 'dice-attestation-signer'", () => {
    const evDir = join(testDir, "ev-neg-unauthorized-role");
    createValidEvidenceDir(evDir);

    const approvedContract = join(testDir, "F30-APPROVED-CLEAN.json");

    const service = new DiceSigningService({
      repoRoot,
      contractPath: approvedContract,
      evidenceDir: evDir,
      keyId: "key-dice-e2e-unauthorized-role",
      signingKeyPem: testKeypair.privateKey,
      testKeysPath: testKeysJsonPath,
      allowUnapprovedContract: false,
      allowUnpinnedRoots: false,
    });

    expect(() => service.execute()).toThrow(/lacks authorized role/);
  });

  it("Negative Test 6: Rejects path traversal attempts in evidenceDir or contractPath", () => {
    const service1 = new DiceSigningService({
      repoRoot,
      contractPath: "../../../etc/passwd",
      evidenceDir: "artifacts/dice-evidence",
    });
    expect(() => service1.execute()).toThrow(
      /Parent directory traversal prohibited/,
    );

    const service2 = new DiceSigningService({
      repoRoot,
      contractPath: "features/contracts/F30-DICE-STAGE2-4-1.json",
      evidenceDir: "../../secret",
    });
    expect(() => service2.execute()).toThrow(
      /Parent directory traversal prohibited/,
    );
  });
});
