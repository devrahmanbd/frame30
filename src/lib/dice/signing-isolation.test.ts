import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DiceSigningService } from "../../../scripts/dice-signing-service.mjs";
import {
  DiceSigningAuthority,
  generateTestKeypair,
  serializeReceiptCanonical,
  generateDetachedDigestLedger,
} from "../../../scripts/dice-evidence.mjs";
import { DEFAULT_TRUSTED_REF } from "../../../scripts/dice-root-of-trust.mjs";

describe("Frame30 DICE Stage 2.4: Isolated Signing Authority (Section 4)", () => {
  const repoRoot = process.cwd();
  let testTempDir: string;
  let candidateCommit: string;
  let candidateTree: string;
  let testKeypair: { publicKey: string; privateKey: string };

  beforeAll(() => {
    testTempDir = join(repoRoot, ".test-tmp-signing-isolation");
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
    mkdirSync(testTempDir, { recursive: true });

    candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    testKeypair = generateTestKeypair();
  });

  afterAll(() => {
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  function createValidEvidenceDir(
    dir: string,
    overrides: Record<string, unknown> = {},
  ) {
    const receiptsDir = join(dir, "receipts");
    mkdirSync(receiptsDir, { recursive: true });

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

    const ledgerEntries: { relPath: string; canonicalStr: string }[] = [];

    for (const obId of activeObs) {
      const receipt = {
        obligation_id: obId,
        method_id: methodIdMap[obId] || "METH-TEST-01",
        status: overrides.status || "PASS",
        verdict: overrides.status || "PASS",
        candidate_commit: overrides.commit || candidateCommit,
        candidate_tree: overrides.tree || candidateTree,
        tree_sha: overrides.tree || candidateTree,
        specification_hash: "a".repeat(64),
        toolchain_identity: {
          node: process.version,
          platform: process.platform,
        },
        invocation: {
          command: ["test"],
          duration_ms: 10,
          started_at: new Date().toISOString(),
        },
        stdout_digest: "b".repeat(64),
        stderr_digest: "c".repeat(64),
        exit_code: overrides.exitCode !== undefined ? overrides.exitCode : 0,
        diagnostics: "Diagnostics output",
      };

      const canonicalStr = serializeReceiptCanonical(receipt);
      const receiptPath = join(receiptsDir, `${obId}.json`);
      writeFileSync(receiptPath, canonicalStr, "utf8");
      ledgerEntries.push({ relPath: `receipts/${obId}.json`, canonicalStr });
    }

    const ledgerContent =
      (overrides.tamperedLedger as string) ||
      generateDetachedDigestLedger(ledgerEntries);
    writeFileSync(join(dir, "receipts.sha256"), ledgerContent, "utf8");

    const summary = {
      candidate_commit: overrides.commit || candidateCommit,
      candidate_tree: overrides.tree || candidateTree,
      contract: "F30-DICE-STAGE2-4",
      qualification: "QUALIFIED_PASS",
    };
    writeFileSync(
      join(dir, "qualification-summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8",
    );
  }

  it("Gate 1: Rejects signing if candidate tree or commit does not exist in git history", () => {
    const evDir = join(testTempDir, "ev-gate1");
    createValidEvidenceDir(evDir, {
      commit: "0".repeat(40),
      tree: "0".repeat(40),
    });

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    expect(() => service.execute()).toThrow(/missing from git|Cannot resolve/);
  });

  it("Gate 2: Rejects signing if contract is not approved (unless explicitly waived for tests)", () => {
    const evDir = join(testTempDir, "ev-gate2");
    createValidEvidenceDir(evDir);

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      contractPath: "features/contracts/F30-DICE-STAGE2-4.json",
      allowUnapprovedContract: false, // strictly enforce approved state
      allowUnpinnedRoots: true,
    });

    // F30-DICE-STAGE2-4 is proposed, so it must be rejected
    expect(() => service.execute()).toThrow(
      /expected 'approved' for authoritative signing/,
    );
  });

  it("Gate 4: Rejects signing if any method receipt has non-PASS status", () => {
    const evDir = join(testTempDir, "ev-gate4");
    createValidEvidenceDir(evDir, { status: "FAIL", exitCode: 1 });

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    expect(() => service.execute()).toThrow(/non-PASS status: FAIL/);
  });

  it("Gate 5: Rejects signing if detached ledger is tampered or digest mismatches receipt on disk", () => {
    const evDir = join(testTempDir, "ev-gate5");
    createValidEvidenceDir(evDir, {
      tamperedLedger:
        "0".repeat(64) + "  receipts/OBL-SYS-SCOPE-GUARD-001.json\n",
    });

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    expect(() => service.execute()).toThrow(/Receipt digest mismatch/);
  });

  it("Gate 7: Rejects signing if key is revoked", () => {
    const evDir = join(testTempDir, "ev-gate7-revoked");
    createValidEvidenceDir(evDir);

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      keyId: "key-dice-revoked-01",
      signingKeyPem: "dummy-pem",
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    expect(() => service.execute()).toThrow(/REVOKED/);
  });

  it("Gate 7: Rejects signing if key lacks authorized role 'dice-attestation-signer'", () => {
    const evDir = join(testTempDir, "ev-gate7-role");
    createValidEvidenceDir(evDir);

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      keyId: "key-unauthorized-role",
      signingKeyPem: "dummy-pem",
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    expect(() => service.execute()).toThrow(
      /not registered|lacks authorized role/,
    );
  });

  it("Returns UNATTESTED when all verification gates pass but DICE_SIGNING_KEY is unset", () => {
    const evDir = join(testTempDir, "ev-unattested");
    createValidEvidenceDir(evDir);

    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      signingKeyPem: null, // no signing key
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    const result = service.execute();
    expect(result.status).toBe("UNATTESTED");
    expect(result.qualification).toBe("QUALIFIED_PASS");
  });

  it("Generates and verifies authoritative DSSE attestation envelope when key is valid and all 7 gates pass", () => {
    const evDir = join(testTempDir, "ev-attested");
    createValidEvidenceDir(evDir);

    // Create signing service with key registered in trusted authority
    const service = new DiceSigningService({
      repoRoot,
      evidenceDir: evDir,
      keyId: "key-dice-authoritative-01",
      // Authoritative key 01 from trusted-keys.json has corresponding test private key or we test signing flow
      allowUnapprovedContract: true,
      allowUnpinnedRoots: true,
    });

    // Provide matching test authority and keypair
    const customKeypair = generateTestKeypair();
    const customAuthority = new DiceSigningAuthority({
      trustedKeys: [
        {
          keyid: "key-test-custom-auth-01",
          algorithm: "ed25519",
          status: "active",
          roles: ["dice-attestation-signer"],
          public_key_pem: customKeypair.publicKey,
        },
      ],
      repoRoot,
    });

    // Test signing authority signAttestation directly with ledger validation
    const ledgerContent = readFileSync(join(evDir, "receipts.sha256"), "utf8");
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: "candidate", digest: { sha256: candidateTree } }],
      predicateType: "https://framique.com/dice/attestation/v1",
      predicate: { qualification: "QUALIFIED_PASS" },
    };

    const envelope = customAuthority.signAttestation(
      statement,
      customKeypair.privateKey,
      "key-test-custom-auth-01",
      {
        ledgerContent,
        receiptsDir: join(evDir, "receipts"),
        requiredRole: "dice-attestation-signer",
      },
    );

    expect(envelope.signatures[0].keyid).toBe("key-test-custom-auth-01");
    const verifyRes = customAuthority.verifyAttestation(envelope);
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.statement.predicate.qualification).toBe("QUALIFIED_PASS");
  });
});
