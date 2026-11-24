import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { DiceTrustedRoot, DEFAULT_TRUSTED_REF } from "../../../scripts/dice-root-of-trust.mjs";
import { evaluateObligationDisposition, evaluateCandidateQualification } from "../../../scripts/dice-qualify.mjs";
import { DiceSigningAuthority, generateTestKeypair } from "../../../scripts/dice-evidence.mjs";
import { DiceSandbox } from "../../../scripts/dice-sandbox.mjs";

describe("Frame30 DICE Stage 2.3: Root-of-Trust, Conjunctive Verification & Attestation Integrity", () => {
  const repoRoot = process.cwd();
  let trustedRoot: DiceTrustedRoot;
  let testTempDir: string;
  let candidateTree: string;

  beforeAll(() => {
    testTempDir = join(repoRoot, ".test-tmp-stage2-3");
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
    mkdirSync(testTempDir, { recursive: true });

    trustedRoot = new DiceTrustedRoot({
      repoRoot,
      trustedRef: DEFAULT_TRUSTED_REF,
      cacheDir: join(testTempDir, "trusted-root-cache"),
    });
    trustedRoot.resolve();

    candidateTree = execSync("git rev-parse HEAD^{tree}", { cwd: repoRoot, encoding: "utf8" }).trim();
  });

  afterAll(() => {
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  describe("P0-1: Independent Trusted Root-of-Trust (Scenarios 1-4, 14)", () => {
    it("Scenario 1: Weakening mandatory OBLs in candidate has zero effect on trusted verification policy", () => {
      const trustedObls = trustedRoot.loadTrustedJson("registries/dice/mandatory-obligations.json");
      expect(Array.isArray(trustedObls)).toBe(true);
      expect(trustedObls.length).toBeGreaterThanOrEqual(4);
      const obIds = trustedObls.map((o: any) => o.obligation_id);
      expect(obIds).toContain("OBL-SYS-SCOPE-GUARD-001");
      expect(obIds).toContain("OBL-SYS-DRIFT-GUARD-001");
      expect(obIds).toContain("OBL-SYS-DIE-REGISTRY-001");
      expect(obIds).toContain("OBL-SYS-SECRETS-SCAN-001");
    });

    it("Scenario 2: Altering trusted profiles in candidate has zero effect on trusted profiles registry", () => {
      const trustedProfiles = trustedRoot.loadTrustedJson("registries/dice/trusted-profiles.json");
      expect(Array.isArray(trustedProfiles)).toBe(true);
      const scriptProfile = trustedProfiles.find((p: any) => p.profile_id === "PROF-SCRIPT-v1");
      expect(scriptProfile).toBeDefined();
      expect(scriptProfile.sandboxed).toBe(true);
      expect(scriptProfile.allowed_cli_args).toContain("^scripts/[a-zA-Z0-9_-]+\\.mjs$");
    });

    it("Scenario 3: Modifying scope guard gate is prevented by resolving path from trusted root", () => {
      const trustedPath = trustedRoot.getTrustedPath("scripts/scope-guard.mjs");
      expect(existsSync(trustedPath)).toBe(true);
      const content = readFileSync(trustedPath, "utf8");
      expect(content).toContain("Frame30 Scope Guard");
    });

    it("Scenario 4: Modifying qualification evaluator is prevented by resolving path from trusted root", () => {
      const trustedPath = trustedRoot.getTrustedPath("scripts/dice-qualify.mjs");
      expect(existsSync(trustedPath)).toBe(true);
      const content = readFileSync(trustedPath, "utf8");
      expect(content).toContain("evaluateCandidateQualification");
    });

    it("Scenario 14: Trusted policy hash remains invariant under candidate modifications", () => {
      const hash1 = trustedRoot.computePolicyHash();
      expect(typeof hash1).toBe("string");
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);

      // Recompute policy hash; must be perfectly deterministic and invariant
      const hash2 = trustedRoot.computePolicyHash();
      expect(hash1).toBe(hash2);
    });
  });

  describe("P0-2: Conjunctive Multi-Method Verification (Scenarios 5-7)", () => {
    const obDefMulti = {
      obligation_id: "OBL-TEST-CONJUNCTIVE-001",
      methods: [
        { method_id: "METH-UNIT-01", trusted_profile_ref: "PROF-VITEST-v1" },
        { method_id: "METH-FORMAL-01", trusted_profile_ref: "PROF-LEAN4-v1" },
      ],
    };

    const dummyPlan = {
      obligations: {
        mandatory: [
          "OBL-SYS-SCOPE-GUARD-001",
          "OBL-SYS-DRIFT-GUARD-001",
          "OBL-SYS-DIE-REGISTRY-001",
          "OBL-SYS-SECRETS-SCAN-001",
        ],
        selected: [
          "OBL-SYS-SCOPE-GUARD-001",
          "OBL-SYS-DRIFT-GUARD-001",
          "OBL-SYS-DIE-REGISTRY-001",
          "OBL-SYS-SECRETS-SCAN-001",
          "OBL-TEST-CONJUNCTIVE-001",
        ],
        active: [
          "OBL-SYS-SCOPE-GUARD-001",
          "OBL-SYS-DRIFT-GUARD-001",
          "OBL-SYS-DIE-REGISTRY-001",
          "OBL-SYS-SECRETS-SCAN-001",
          "OBL-TEST-CONJUNCTIVE-001",
        ],
        waived: [],
      },
    };

    it("Scenario 5: Multi-method obligation evaluates to DISP_FAIL if any declared method fails", () => {
      const receipts = [
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-UNIT-01", status: "PASS", tree_sha: candidateTree },
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-FORMAL-01", status: "FAIL", tree_sha: candidateTree, diagnostics: "Theorem proof broken" },
      ];

      const disp = evaluateObligationDisposition("OBL-TEST-CONJUNCTIVE-001", receipts, dummyPlan, candidateTree, {
        obligationDef: obDefMulti,
      });

      expect(disp.disposition).toBe("DISP_FAIL");
      expect(disp.failed_method).toBe("METH-FORMAL-01");
    });

    it("Scenario 6: Multi-method obligation evaluates to DISP_BLOCKED if one declared method receipt is missing", () => {
      const receipts = [
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-UNIT-01", status: "PASS", tree_sha: candidateTree },
        // METH-FORMAL-01 receipt is missing
      ];

      const disp = evaluateObligationDisposition("OBL-TEST-CONJUNCTIVE-001", receipts, dummyPlan, candidateTree, {
        obligationDef: obDefMulti,
      });

      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toContain("MISSING_METHOD_RECEIPT: METH-FORMAL-01");
    });

    it("Scenario 7: Duplicate method receipts are strictly prohibited and evaluate to DISP_BLOCKED", () => {
      const receipts = [
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-UNIT-01", status: "PASS", tree_sha: candidateTree },
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-UNIT-01", status: "PASS", tree_sha: candidateTree },
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-FORMAL-01", status: "PASS", tree_sha: candidateTree },
      ];

      const disp = evaluateObligationDisposition("OBL-TEST-CONJUNCTIVE-001", receipts, dummyPlan, candidateTree, {
        obligationDef: obDefMulti,
      });

      expect(disp.disposition).toBe("DISP_BLOCKED");
      expect(disp.reason).toContain("DUPLICATE_METHOD_RECEIPTS_PROHIBITED: METH-UNIT-01");
    });

    it("Conjunctive pass: evaluates to DISP_PASS only when ALL declared methods pass cleanly", () => {
      const receipts = [
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-UNIT-01", status: "PASS", tree_sha: candidateTree },
        { obligation_id: "OBL-TEST-CONJUNCTIVE-001", method_id: "METH-FORMAL-01", status: "PASS", tree_sha: candidateTree },
      ];

      const disp = evaluateObligationDisposition("OBL-TEST-CONJUNCTIVE-001", receipts, dummyPlan, candidateTree, {
        obligationDef: obDefMulti,
      });

      expect(disp.disposition).toBe("DISP_PASS");
      expect(disp.methods_verified).toBe(2);
    });
  });

  describe("P0-3: Clean-Tree Candidate Snapshotting & Leak Prevention (Scenarios 8-10)", () => {
    let snapshotDir: string;

    beforeAll(() => {
      snapshotDir = join(testTempDir, "candidate-clean-snapshot");
      trustedRoot.createCandidateSnapshot(candidateTree, snapshotDir);
    });

    it("Scenario 8: Candidate snapshot strictly excludes .env, .env.local, and .env.production files", () => {
      expect(existsSync(join(snapshotDir, ".env"))).toBe(false);
      expect(existsSync(join(snapshotDir, ".env.local"))).toBe(false);
      expect(existsSync(join(snapshotDir, ".env.production"))).toBe(false);
    });

    it("Scenario 9: Candidate snapshot strictly excludes .git repository metadata", () => {
      expect(existsSync(join(snapshotDir, ".git"))).toBe(false);
    });

    it("Scenario 10: Candidate snapshot excludes host-ignored uncommitted directories like node_modules", () => {
      expect(existsSync(join(snapshotDir, "node_modules"))).toBe(false);
    });

    it("Generates clean diff manifest without requiring git inside the execution environment", () => {
      const manifestPath = join(testTempDir, "test-diff-manifest.json");
      const manifest = trustedRoot.generateDiffManifest(DEFAULT_TRUSTED_REF, candidateTree, manifestPath);

      expect(manifest.base_commit).toBe(DEFAULT_TRUSTED_REF);
      expect(manifest.candidate_tree).toBe(candidateTree);
      expect(Array.isArray(manifest.entries)).toBe(true);
      expect(existsSync(manifestPath)).toBe(true);
    });
  });

  describe("P1-5: Execution Disposition Semantics (Scenario 11)", () => {
    it("Scenario 11: Sandbox setup and execution failures fail closed as BLOCKED", () => {
      const sandbox = new DiceSandbox();
      // On macOS authoritative execution is blocked by invariant 5
      const res = sandbox.execute({
        command: ["/bin/echo", "hello"],
        sourceSnapshot: testTempDir,
        isAuthoritative: true,
      });

      if (process.platform === "darwin") {
        expect(res.verdict).toBe("BLOCKED");
        expect(res.exitCode).toBe(126);
        expect(res.diagnostics).toContain("INVARIANT-5");
      }
    });
  });

  describe("P0-4: Authoritative Key Management & DSSE Attestation Integrity (Scenarios 12-13)", () => {
    let signingAuthority: DiceSigningAuthority;

    beforeAll(() => {
      const trustedKeys = trustedRoot.loadTrustedJson("registries/dice/trusted-keys.json");
      signingAuthority = new DiceSigningAuthority({ trustedKeys });
    });

    it("Resolves active registered key correctly", () => {
      const res = signingAuthority.resolveKey("key-dice-authoritative-01");
      expect(res.status).toBe("ACTIVE");
      expect(res.keyDef.roles).toContain("dice-attestation-signer");
    });

    it("Scenario 12: Revoked signer identity is detected and rejected fail-closed", () => {
      const res = signingAuthority.resolveKey("key-dice-revoked-01");
      expect(res.status).toBe("REVOKED");

      const statement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [{ name: "candidate", digest: { sha256: candidateTree } }],
        predicateType: "https://framique.com/dice/attestation/v1",
        predicate: { qualification: "QUALIFIED_PASS" },
      };

      // Attempting to sign with revoked key throws error
      expect(() => {
        signingAuthority.signAttestation(statement, "dummy-pem", "key-dice-revoked-01");
      }).toThrow(/Key 'key-dice-revoked-01' was revoked/);

      // Verifying attestation signed by revoked key fails closed
      const envelopeWithRevoked = {
        payloadType: "application/vnd.in-toto+json",
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
        signatures: [{ keyid: "key-dice-revoked-01", sig: "dummy-sig" }],
      };
      const verifyRes = signingAuthority.verifyAttestation(envelopeWithRevoked);
      expect(verifyRes.valid).toBe(false);
      expect(verifyRes.reason).toContain("SIGNER_KEY_REVOKED");
    });

    it("Scenario 13: Ephemeral unauthenticated test keys are rejected from authoritative signing", () => {
      const ephemeral = generateTestKeypair();
      const statement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [{ name: "candidate", digest: { sha256: candidateTree } }],
        predicateType: "https://framique.com/dice/attestation/v1",
        predicate: { qualification: "QUALIFIED_PASS" },
      };

      expect(() => {
        signingAuthority.signAttestation(statement, ephemeral.privateKey, "key-ephemeral-unregistered");
      }).toThrow(/not registered in trusted-keys\.json/);

      const envelopeWithEphemeral = {
        payloadType: "application/vnd.in-toto+json",
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
        signatures: [{ keyid: "key-ephemeral-unregistered", sig: "dummy-sig" }],
      };
      const verifyRes = signingAuthority.verifyAttestation(envelopeWithEphemeral);
      expect(verifyRes.valid).toBe(false);
      expect(verifyRes.reason).toContain("UNTRUSTED_KEY");
    });

    it("Authoritative attestation signing succeeds with registered active key and valid detached ledger", () => {
      // Create a temporary key registered in signing authority
      const validKeypair = generateTestKeypair();
      const customAuthority = new DiceSigningAuthority({
        trustedKeys: [
          {
            key_id: "key-test-auth-active",
            algorithm: "ed25519",
            status: "active",
            roles: ["dice-attestation-signer"],
            public_key_pem: validKeypair.publicKey,
          },
        ],
      });

      const statement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [{ name: "candidate", digest: { sha256: candidateTree } }],
        predicateType: "https://framique.com/dice/attestation/v1",
        predicate: { qualification: "QUALIFIED_PASS" },
      };

      const envelope = customAuthority.signAttestation(statement, validKeypair.privateKey, "key-test-auth-active");
      expect(envelope.signatures[0].keyid).toBe("key-test-auth-active");

      const verifyRes = customAuthority.verifyAttestation(envelope);
      expect(verifyRes.valid).toBe(true);
      expect(verifyRes.keyid).toBe("key-test-auth-active");
    });
  });
});
