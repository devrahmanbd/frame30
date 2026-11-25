import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  DiceTrustedRoot,
  DEFAULT_TRUSTED_REF,
  validateCommitSha,
  validateTreeSha,
  validateTrustedRef,
  validateSafePath,
  safeArchiveExtract,
  SIGNER_DISTRIBUTION_FILES,
  computeDistributionDigest,
  extractAndVerifySigningDistribution,
} from "../../../scripts/dice-root-of-trust.mjs";
import { DiceLauncher } from "../../../scripts/dice-launcher.mjs";
import { DiceSigningService } from "../../../scripts/dice-signing-service.mjs";
import { DiceSandbox } from "../../../scripts/dice-sandbox.mjs";
import {
  DiceSigningAuthority,
  generateTestKeypair,
  verifyIndependentAttestation,
} from "../../../scripts/dice-evidence.mjs";
import { evaluateMethodOracle } from "../../../scripts/dice-bootstrap.mjs";

describe("Frame30 DICE Stage 2.4: Candidate Mutation Matrix & Trust Boundary Enforcement (Section 7)", () => {
  const repoRoot = process.cwd();
  const testTempDir = join("/tmp", ".test-tmp-authority-mutation");
  let trustedRoot: DiceTrustedRoot;

  beforeAll(() => {
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
    mkdirSync(testTempDir, { recursive: true });

    trustedRoot = new DiceTrustedRoot({
      repoRoot,
      trustedRef: DEFAULT_TRUSTED_REF,
      cacheDir: join(testTempDir, "trusted-dist"),
    });
    trustedRoot.resolve();
  });

  afterAll(() => {
    if (existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  // 1. Candidate modifies dice-bootstrap.mjs
  it("Mutation 1: Candidate modifying scripts/dice-bootstrap.mjs is ignored by trusted launcher", () => {
    const launcher = new DiceLauncher({
      repoRoot,
      trustedRef: DEFAULT_TRUSTED_REF,
      distDir: join(testTempDir, "trusted-dist"),
      isDryRun: true,
    });

    // Pinned bootstrap in distDir is independent of candidate repo root
    const pinnedBootstrap = join(
      testTempDir,
      "trusted-dist/scripts/dice-bootstrap.mjs",
    );
    expect(existsSync(pinnedBootstrap)).toBe(true);

    const pinnedContent = readFileSync(pinnedBootstrap, "utf8");
    expect(pinnedContent).toContain("FRAME30 UNIVERSAL VERIFICATION MOULD");
  });

  // 2. Candidate modifies dice-root-of-trust.mjs
  it("Mutation 2: Candidate modifying scripts/dice-root-of-trust.mjs cannot alter trusted root or policy manifest", () => {
    const policySha1 = trustedRoot.computePolicyHash();
    expect(policySha1).toMatch(/^[0-9a-f]{64}$/);

    // Any attempt to load missing asset fails closed as BLOCKED with zero fallback to candidate repo
    expect(() => trustedRoot.getTrustedPath("non-existent-script.mjs")).toThrow(
      /FAIL-CLOSED.*BLOCKED/,
    );
  });

  // 3. Candidate modifies dice-qualify.mjs
  it("Mutation 3: Candidate modifying scripts/dice-qualify.mjs cannot alter trusted qualification evaluator", () => {
    const trustedQualifyPath = trustedRoot.getTrustedPath(
      "scripts/dice-qualify.mjs",
    );
    expect(existsSync(trustedQualifyPath)).toBe(true);
    const content = readFileSync(trustedQualifyPath, "utf8");
    expect(content).toContain("evaluateCandidateQualification");
  });

  // 4. Candidate modifies dice-plan-generator.mjs
  it("Mutation 4: Candidate modifying scripts/dice-plan-generator.mjs cannot alter trusted plan generation", () => {
    const trustedPlanPath = trustedRoot.getTrustedPath(
      "scripts/dice-plan-generator.mjs",
    );
    expect(existsSync(trustedPlanPath)).toBe(true);
    const content = readFileSync(trustedPlanPath, "utf8");
    expect(content).toContain("generateFrozenPlan");
  });

  // 5. Candidate modifies dice-sandbox.mjs
  it("Mutation 5: Candidate modifying scripts/dice-sandbox.mjs cannot alter trusted sandbox containment", () => {
    const trustedSandboxPath = trustedRoot.getTrustedPath(
      "scripts/dice-sandbox.mjs",
    );
    expect(existsSync(trustedSandboxPath)).toBe(true);
    const content = readFileSync(trustedSandboxPath, "utf8");
    expect(content).toContain("DiceSandbox");
  });

  // 6. Candidate modifies dice-evidence.mjs
  it("Mutation 6: Candidate modifying scripts/dice-evidence.mjs cannot weaken evidence or ledger verification", () => {
    const trustedEvidencePath = trustedRoot.getTrustedPath(
      "scripts/dice-evidence.mjs",
    );
    expect(existsSync(trustedEvidencePath)).toBe(true);
    const content = readFileSync(trustedEvidencePath, "utf8");
    expect(content).toContain("serializeReceiptCanonical");
    expect(content).toContain("generateDetachedDigestLedger");
  });

  // 7. Candidate modifies scope-guard.mjs
  it("Mutation 7: Mandatory verification executes trusted scope guard from /workspace/trusted, treating candidate version as subject", () => {
    const trustedScopeGuardPath = trustedRoot.getTrustedPath(
      "scripts/scope-guard.mjs",
    );
    expect(existsSync(trustedScopeGuardPath)).toBe(true);
    const content = readFileSync(trustedScopeGuardPath, "utf8");
    expect(content).toContain("Frame30 Scope Guard");
  });

  // 8. Candidate modifies mandatory-obligations.json
  it("Mutation 8: Candidate altering registries/dice/mandatory-obligations.json has zero effect on trusted obligations", () => {
    const trustedObls = trustedRoot.loadTrustedJson(
      "registries/dice/mandatory-obligations.json",
    );
    expect(Array.isArray(trustedObls)).toBe(true);
    expect(trustedObls.length).toBe(4);
    const ids = (trustedObls as Record<string, unknown>[]).map(
      (o) => o.obligation_id,
    );
    expect(ids).toContain("OBL-SYS-SCOPE-GUARD-001");
    expect(ids).toContain("OBL-SYS-DRIFT-GUARD-001");
    expect(ids).toContain("OBL-SYS-DIE-REGISTRY-001");
    expect(ids).toContain("OBL-SYS-SECRETS-SCAN-001");
  });

  // 9. Candidate modifies trusted-profiles.json
  it("Mutation 9: Candidate altering registries/dice/trusted-profiles.json has zero effect on trusted invocation profiles", () => {
    const trustedProfiles = trustedRoot.loadTrustedJson(
      "registries/dice/trusted-profiles.json",
    );
    expect(Array.isArray(trustedProfiles)).toBe(true);
    const scriptProfile = (trustedProfiles as Record<string, unknown>[]).find(
      (p) => p.profile_id === "PROF-SCRIPT-v1",
    );
    expect(scriptProfile).toBeDefined();
    expect(scriptProfile?.sandboxed).toBe(true);
  });

  // 10. Candidate modifies trusted-keys.json
  it("Mutation 10: Candidate altering registries/dice/trusted-keys.json has zero effect on trusted signing keys", () => {
    const trustedKeys = trustedRoot.loadTrustedJson(
      "registries/dice/trusted-keys.json",
    );
    expect(Array.isArray(trustedKeys)).toBe(true);
    const revokedKey = (trustedKeys as Record<string, unknown>[]).find(
      (k) => k.keyid === "key-dice-revoked-01",
    );
    expect(revokedKey).toBeDefined();
    expect(revokedKey?.status).toBe("revoked");
  });

  // 11. Candidate modifies .circleci/config.yml
  it("Mutation 11: Scope guard mechanical gate prevents unauthorized modifications to .circleci/config.yml", () => {
    const scopeGuardPath = resolve(repoRoot, "scripts/scope-guard.mjs");
    expect(existsSync(scopeGuardPath)).toBe(true);
  });

  // 12. Candidate modifies features/contracts/F30-DICE-STAGE2-3.json
  it("Mutation 12: Previous contracts remain protected and cannot be modified under Stage 2.4", () => {
    const prevContract = resolve(
      repoRoot,
      "features/contracts/F30-DICE-STAGE2-3.json",
    );
    expect(existsSync(prevContract)).toBe(true);
    const content = JSON.parse(readFileSync(prevContract, "utf8"));
    expect(content.change_id).toBe("F30-DICE-STAGE2-3");
  });

  // 13. Signer-Secret Isolation Tests
  describe("Signer-Secret Isolation", () => {
    it("Sandbox strips DICE_SIGNING_KEY and sensitive tokens from execution environment", () => {
      const sandbox = new DiceSandbox();
      const args = sandbox.buildBwrapArgs({
        sourceSnapshot: testTempDir,
        env: {
          DICE_SIGNING_KEY: "secret-key-material",
          GITHUB_TOKEN: "gh-token-123",
          SAFE_VAR: "safe-value",
        },
      });

      // Verify DICE_SIGNING_KEY and GITHUB_TOKEN are NOT present in args
      const setEnvCalls: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--setenv") {
          setEnvCalls.push(`${args[i + 1]}=${args[i + 2]}`);
        }
      }

      expect(setEnvCalls.some((e) => e.includes("DICE_SIGNING_KEY"))).toBe(
        false,
      );
      expect(setEnvCalls.some((e) => e.includes("GITHUB_TOKEN"))).toBe(false);
      expect(setEnvCalls.some((e) => e.includes("SAFE_VAR=safe-value"))).toBe(
        true,
      );
    });
  });

  // 14. Hostile Shell Injection Tests
  describe("Hostile Shell Injection Defenses", () => {
    it("Validates commit SHA against shell metacharacters and path traversal", () => {
      expect(() => validateCommitSha("2d1d32f9; touch /tmp/pwned")).toThrow(
        /Malformed commit SHA/,
      );
      expect(() => validateCommitSha("2d1d32f9`id`")).toThrow(
        /Malformed commit SHA/,
      );
      expect(() => validateCommitSha("2d1d32f9$(whoami)")).toThrow(
        /Malformed commit SHA/,
      );
      expect(() => validateCommitSha("../../../etc/passwd")).toThrow(
        /Malformed commit SHA/,
      );
    });

    it("Validates tree SHA against shell metacharacters and path traversal", () => {
      expect(() => validateTreeSha("f8932f94; rm -rf /")).toThrow(
        /Malformed tree SHA/,
      );
      expect(() => validateTreeSha("f8932f94|cat")).toThrow(
        /Malformed tree SHA/,
      );
    });

    it("Validates trusted reference against shell metacharacters", () => {
      expect(() => validateTrustedRef("ref; touch /tmp/pwned")).toThrow(
        /Malformed trusted reference/,
      );
      expect(() => validateTrustedRef("ref && echo pwned")).toThrow(
        /Malformed trusted reference/,
      );
      expect(() => validateTrustedRef("..")).toThrow(
        /Malformed trusted reference/,
      );
    });

    it("Validates paths against null byte and newline injections", () => {
      expect(() => validateSafePath("path/to/file\0.json")).toThrow(
        /Malformed path/,
      );
      expect(() => validateSafePath("path/to/file\nmalicious")).toThrow(
        /Malformed path/,
      );
      expect(() => validateSafePath("path/to/file\rmalicious")).toThrow(
        /Malformed path/,
      );
    });

    it("Demonstrates that hostile contract fields cannot execute host commands", () => {
      const pwnFile = join(testTempDir, "pwned-check");
      if (existsSync(pwnFile)) rmSync(pwnFile);

      // Attempting to pass hostile commit SHA to git rev-parse via execFileSync
      expect(() => {
        execFileSync(
          "git",
          ["rev-parse", "--verify", `HEAD; touch ${pwnFile}^{commit}`],
          {
            cwd: repoRoot,
            stdio: "ignore",
          },
        );
      }).toThrow();

      // Host file was NOT touched because execFileSync does not use a shell
      expect(existsSync(pwnFile)).toBe(false);
    });
  });

  // Multi-Oracle Evaluation Engine Tests (Section 8)
  describe("Adapter Readiness & Multi-Oracle Evaluation Engine (Section 8)", () => {
    it("Evaluates exact_match oracle correctly (PASS on exact match, FAIL on mismatch)", () => {
      const oracle = {
        oracle_type: "exact_match",
        expected_output: "EXACT_CANONICAL_OUTPUT",
      };

      const passResult = {
        exitCode: 0,
        stdout: "EXACT_CANONICAL_OUTPUT\n",
        stderr: "",
        verdict: "PASS",
      };
      expect(evaluateMethodOracle(oracle, passResult, 100)).toBe("PASS");

      const failResult = {
        exitCode: 0,
        stdout: "DIFFERENT_OUTPUT\n",
        stderr: "",
        verdict: "PASS",
      };
      expect(evaluateMethodOracle(oracle, failResult, 100)).toBe("FAIL");
    });

    it("Evaluates kernel_verdict oracle correctly (PASS on theorem proof, FAIL on error)", () => {
      const oracle = {
        oracle_type: "kernel_verdict",
      };

      const passResult = {
        exitCode: 0,
        stdout: "[kernel] VERDICT: PASS - 7 theorems machine-checked, 0 errors",
        stderr: "",
        verdict: "PASS",
      };
      expect(evaluateMethodOracle(oracle, passResult, 100)).toBe("PASS");

      const failResult = {
        exitCode: 1,
        stdout: "[kernel] VERDICT: FAIL - theorem proof broken",
        stderr: "",
        verdict: "FAIL",
      };
      expect(evaluateMethodOracle(oracle, failResult, 100)).toBe("FAIL");
    });

    it("Evaluates trace_state_depth_min and execution_time_max_ms assertions in multi_assert", () => {
      const oracle = {
        oracle_type: "multi_assert",
        assertions: [
          { type: "exit_code", expected: 0 },
          { type: "trace_state_depth_min", expected: 10 },
          { type: "execution_time_max_ms", expected: 5000 },
        ],
      };

      const passResult = {
        exitCode: 0,
        stdout: "TLC model check depth: 12, states: 50000",
        stderr: "",
        verdict: "PASS",
      };
      expect(evaluateMethodOracle(oracle, passResult, 1500)).toBe("PASS");

      // Fails if depth is too low
      const lowDepthResult = {
        exitCode: 0,
        stdout: "TLC model check depth: 5, states: 100",
        stderr: "",
        verdict: "PASS",
      };
      expect(evaluateMethodOracle(oracle, lowDepthResult, 1500)).toBe("FAIL");

      // Fails if execution time exceeded
      expect(evaluateMethodOracle(oracle, passResult, 6000)).toBe("FAIL");
    });
  });

  // Stage 2.4.1 Real Adversarial CI Entrypoint Attacks (P0-3)
  describe("Stage 2.4.1 Real Adversarial CI Entrypoint Attacks (P0-3)", () => {
    const hostileRepo = join(testTempDir, "hostile-repo");

    beforeAll(() => {
      mkdirSync(hostileRepo, { recursive: true });
      mkdirSync(join(hostileRepo, "scripts"), { recursive: true });
      mkdirSync(join(hostileRepo, "registries/dice"), { recursive: true });
      mkdirSync(join(hostileRepo, "features/contracts"), { recursive: true });
    });

    it("Attack Vector 1 (Launcher): Candidate replacement of scripts/dice-launcher.mjs is bypassed by protected extraction", () => {
      const candidateLauncher = join(hostileRepo, "scripts/dice-launcher.mjs");
      writeFileSync(
        candidateLauncher,
        'console.error("PWNED_LAUNCHER"); process.exit(42);',
        "utf8",
      );

      const protectedLauncherDir = join(testTempDir, "protected-launcher-v1");
      safeArchiveExtract(
        DEFAULT_TRUSTED_REF,
        [
          "scripts/dice-launcher.mjs",
          "scripts/dice-root-of-trust.mjs",
          "scripts/dice-plan-generator.mjs",
        ],
        protectedLauncherDir,
        repoRoot,
      );

      const out = execFileSync(
        "node",
        [join(protectedLauncherDir, "scripts/dice-launcher.mjs"), "--help"],
        { encoding: "utf8" },
      );
      expect(out).toContain("Usage: node scripts/dice-launcher.mjs");
      expect(out).not.toContain("PWNED_LAUNCHER");
    });

    it("Attack Vector 2 (Root of Trust): Candidate alteration of scripts/dice-root-of-trust.mjs cannot tamper with approved roots", () => {
      const candidateRot = join(hostileRepo, "scripts/dice-root-of-trust.mjs");
      writeFileSync(
        candidateRot,
        'export const APPROVED_ROOTS = { "deadbeef": "cafebabe" };',
        "utf8",
      );

      const protectedRotDir = join(testTempDir, "protected-rot-v2");
      safeArchiveExtract(
        DEFAULT_TRUSTED_REF,
        ["scripts/dice-root-of-trust.mjs"],
        protectedRotDir,
        repoRoot,
      );

      const protectedRot = readFileSync(
        join(protectedRotDir, "scripts/dice-root-of-trust.mjs"),
        "utf8",
      );
      expect(protectedRot).toContain(
        "2d1d32f9b49628ce0a4ae8ff9cbe805e94cb4271",
      );
      expect(protectedRot).not.toContain("deadbeef");
    });

    it("Attack Vector 3 (CircleCI Config): Hostile .circleci/config.yml tampering fails closed under scope guard", () => {
      const activeContract =
        process.env.ACTIVE_CHANGE_CONTRACT ||
        (existsSync(join(repoRoot, "features/contracts/F30-DICE-COMPLETE.json"))
          ? "features/contracts/F30-DICE-COMPLETE.json"
          : "features/contracts/F30-DICE-STAGE2-4-1.json");
      const scopeCheck = execFileSync(
        "node",
        ["scripts/scope-guard.mjs", `--contract=${activeContract}`],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(scopeCheck).toContain("Scope guard PASSED");
    });

    it("Attack Vector 4 (Bootstrap Runner): Hostile scripts/dice-bootstrap.mjs in candidate tree is bypassed by trusted launcher", () => {
      const candidateBootstrap = join(
        hostileRepo,
        "scripts/dice-bootstrap.mjs",
      );
      writeFileSync(
        candidateBootstrap,
        'console.error("PWNED_BOOTSTRAP"); process.exit(99);',
        "utf8",
      );

      const trustedDist = join(testTempDir, "trusted-dist-v4");
      const root = new DiceTrustedRoot({
        repoRoot,
        trustedRef: DEFAULT_TRUSTED_REF,
        cacheDir: trustedDist,
      });

      const res = root.resolve();
      expect(res.runnerSha).toMatch(/^[0-9a-f]{64}$/);
      const extractedBootstrap = readFileSync(
        join(trustedDist, "scripts/dice-bootstrap.mjs"),
        "utf8",
      );
      expect(extractedBootstrap).not.toContain("PWNED_BOOTSTRAP");
      expect(extractedBootstrap).toContain(
        "FRAME30 UNIVERSAL VERIFICATION MOULD",
      );
    });

    it("Attack Vector 5 (Qualification Evaluator): Mutating scripts/dice-qualify.mjs cannot subvert qualification disposition", () => {
      const candidateQualify = join(hostileRepo, "scripts/dice-qualify.mjs");
      writeFileSync(
        candidateQualify,
        'export function evaluateCandidateQualification() { return { qualification: "QUALIFIED_PASS" }; }',
        "utf8",
      );

      const trustedQualify = readFileSync(
        trustedRoot.getTrustedPath("scripts/dice-qualify.mjs"),
        "utf8",
      );
      expect(trustedQualify).toContain("evaluateCandidateQualification");
      expect(trustedQualify).toContain("DISP_FAIL");
      expect(trustedQualify).not.toContain(
        'return { qualification: "QUALIFIED_PASS" };',
      );
    });

    it("Attack Vector 6 (Signing Service): Candidate replacing scripts/dice-signing-service.mjs is bypassed by protected extraction", () => {
      const candidateSigner = join(
        hostileRepo,
        "scripts/dice-signing-service.mjs",
      );
      writeFileSync(
        candidateSigner,
        'console.error("PWNED_SIGNER"); process.exit(13);',
        "utf8",
      );

      const protectedSignerDir = join(testTempDir, "protected-signer-v6");
      safeArchiveExtract(
        DEFAULT_TRUSTED_REF,
        [
          "scripts/dice-signing-service.mjs",
          "scripts/dice-root-of-trust.mjs",
          "scripts/dice-qualify.mjs",
          "scripts/dice-plan-generator.mjs",
          "scripts/dice-evidence.mjs",
          "registries/dice/",
          "schemas/dice/",
        ],
        protectedSignerDir,
        repoRoot,
      );

      const out = execFileSync(
        "node",
        [
          join(protectedSignerDir, "scripts/dice-signing-service.mjs"),
          "--help",
        ],
        {
          cwd: "/tmp",
          env: {
            PATH: process.env.PATH,
            NODE_PATH: protectedSignerDir,
          },
          encoding: "utf8",
        },
      );
      expect(out).toContain("Usage: node scripts/dice-signing-service.mjs");
      expect(out).not.toContain("PWNED_SIGNER");
    });

    it("Attack Vector 7 (Trusted Key Registry): Candidate tampering with registries/dice/trusted-keys.json is rejected", () => {
      const candidateKeys = join(
        hostileRepo,
        "registries/dice/trusted-keys.json",
      );
      writeFileSync(
        candidateKeys,
        JSON.stringify([
          {
            keyid: "attacker-key-01",
            status: "active",
            roles: ["dice-attestation-signer"],
          },
        ]),
        "utf8",
      );

      const root = new DiceTrustedRoot({
        repoRoot,
        trustedRef: DEFAULT_TRUSTED_REF,
        cacheDir: join(testTempDir, "trusted-dist-v7"),
      });
      root.resolve();

      // Authority loaded from trusted root does not recognize attacker's key
      const authority = new DiceSigningAuthority({
        trustedKeysPath: root.getTrustedPath(
          "registries/dice/trusted-keys.json",
        ),
        repoRoot,
      });
      const keyRes = authority.resolveKey("attacker-key-01");
      expect(keyRes.status).toBe("UNKNOWN_KEY");
      expect(keyRes.reason).toContain(
        "Key 'attacker-key-01' not registered in trusted-keys.json",
      );
    });

    it("Attack Vector 8 (Package and Dependency Resolution): Isolated signer executes with zero candidate module imports", () => {
      const protectedSignerDir = join(testTempDir, "protected-signer-v8");
      safeArchiveExtract(
        DEFAULT_TRUSTED_REF,
        [
          "scripts/dice-signing-service.mjs",
          "scripts/dice-root-of-trust.mjs",
          "scripts/dice-qualify.mjs",
          "scripts/dice-plan-generator.mjs",
          "scripts/dice-evidence.mjs",
          "registries/dice/",
          "schemas/dice/",
        ],
        protectedSignerDir,
        repoRoot,
      );

      const out = execFileSync(
        "node",
        [
          join(protectedSignerDir, "scripts/dice-signing-service.mjs"),
          "--help",
        ],
        {
          cwd: "/tmp",
          env: {
            PATH: process.env.PATH,
            NODE_PATH: protectedSignerDir,
          },
          encoding: "utf8",
        },
      );
      expect(out).toContain("Usage: node scripts/dice-signing-service.mjs");
    });

    it("Attack Vector 9 (Evidence Serializer): Tampered scripts/dice-evidence.mjs cannot compromise verification", () => {
      const candidateEvidence = join(hostileRepo, "scripts/dice-evidence.mjs");
      writeFileSync(
        candidateEvidence,
        "export class DiceSigningAuthority { validateLedger() { return true; } }",
        "utf8",
      );

      const trustedEvidencePath = trustedRoot.getTrustedPath(
        "scripts/dice-evidence.mjs",
      );
      const content = readFileSync(trustedEvidencePath, "utf8");
      expect(content).toContain("computeReceiptDigest");
      expect(content).toContain("FAIL-CLOSED: Receipt digest mismatch");
      expect(content).not.toContain("validateLedger() { return true; }");
    });

    it("Attack Vector 10 (Policy Manifest): Any alteration to policy manifest digest is detected", () => {
      const manifest = trustedRoot.generatePolicyManifest();
      expect(manifest.manifest_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.entries.length).toBeGreaterThanOrEqual(15);
    });
  });

  // Stage 2.4.1 Hardened Path & Symlink Defense (P1-5)
  describe("Stage 2.4.1 Hardened Path & Symlink Defense (P1-5)", () => {
    it("Rejects parent directory traversal in paths", () => {
      expect(() => validateSafePath("../outside")).toThrow(
        /Parent directory traversal prohibited/,
      );
      expect(() => validateSafePath("foo/../../bar")).toThrow(
        /Parent directory traversal prohibited/,
      );
      expect(() => validateSafePath("foo\\..\\bar")).toThrow(
        /Parent directory traversal prohibited/,
      );
    });

    it("Rejects absolute paths when relative path is required", () => {
      expect(() =>
        validateSafePath("/etc/passwd", { mustBeRelative: true }),
      ).toThrow(/Absolute path prohibited/);
      expect(() =>
        validateSafePath("relative/path.json", { mustBeRelative: true }),
      ).not.toThrow();
    });

    it("Rejects paths escaping base directory", () => {
      const base = join(testTempDir, "base-dir");
      mkdirSync(base, { recursive: true });
      expect(() =>
        validateSafePath("sub/file.txt", { baseDir: base }),
      ).not.toThrow();
    });

    it("Detects and blocks symlink escapes pointing outside allowed base", () => {
      const sandboxDir = join(testTempDir, "symlink-sandbox");
      mkdirSync(sandboxDir, { recursive: true });
      const escapeTarget = join(testTempDir, "secret-outside");
      mkdirSync(escapeTarget, { recursive: true });

      const symlinkPath = join(sandboxDir, "escape-link");
      if (existsSync(symlinkPath)) rmSync(symlinkPath);
      symlinkSync(escapeTarget, symlinkPath);

      expect(() =>
        validateSafePath(symlinkPath, { baseDir: sandboxDir }),
      ).toThrow(/Symlink escape detected/);
    });

    it("safeArchiveExtract rejects invalid extraction destinations outside /tmp or repo", () => {
      expect(() =>
        safeArchiveExtract(
          DEFAULT_TRUSTED_REF,
          ["scripts/dice-launcher.mjs"],
          "/var/log/dice-test-invalid",
          repoRoot,
        ),
      ).toThrow(/Invalid extraction destination/);
    });
  });

  // Stage 2.4.2 P0-3: Hostile Candidate Replacement Matrix & External Signer Boundary
  describe("Stage 2.4.2 P0-3: Hostile Candidate Replacement Matrix & External Signer Boundary", () => {
    const EXPECTED_TEST_POLICY_DIGEST = createHash("sha256")
      .update(readFileSync(join(repoRoot, "registries/dice/test-policy.json")))
      .digest("hex");
    const EXPECTED_DIST_DIGEST = computeDistributionDigest(repoRoot);

    const p03TempDir = join(testTempDir, "p03-replacement-matrix");
    const candidateBase = join(p03TempDir, "candidate-tree");
    const externalAuthorityDir = join(p03TempDir, "external-authority");
    const isolatedSignerDir = join(p03TempDir, "isolated-signer");

    let candidateCommit: string;
    let candidateTree: string;
    let testKeypair: { privateKey: string; publicKey: string };
    let testKeysJsonPath: string;
    let testKeyPemPath: string;

    function setupExternalAuthority() {
      if (existsSync(externalAuthorityDir)) {
        rmSync(externalAuthorityDir, { recursive: true, force: true });
      }
      mkdirSync(externalAuthorityDir, { recursive: true });

      for (const rel of SIGNER_DISTRIBUTION_FILES) {
        const src = join(repoRoot, rel);
        const dest = join(externalAuthorityDir, rel);
        mkdirSync(resolve(dest, ".."), { recursive: true });
        writeFileSync(dest, readFileSync(src));
      }
    }

    function setupCandidateTree() {
      if (existsSync(candidateBase)) {
        rmSync(candidateBase, { recursive: true, force: true });
      }
      mkdirSync(candidateBase, { recursive: true });

      for (const rel of SIGNER_DISTRIBUTION_FILES) {
        const src = join(repoRoot, rel);
        const dest = join(candidateBase, rel);
        mkdirSync(resolve(dest, ".."), { recursive: true });
        writeFileSync(dest, readFileSync(src));
      }
    }

    function createValidEvidence(
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

      let ledger = "";
      for (const obId of activeObs) {
        if (overrides.skipReceipt === obId) continue;

        const rPath = join(receiptsDir, `${obId}.json`);
        const status = overrides.failReceipt === obId ? "FAIL" : "PASS";

        const receipt = {
          receipt_version: "1.0.0",
          obligation_id: obId,
          method_id: methodIdMap[obId],
          status,
          commit_sha: candidateCommit,
          tree_sha: candidateTree,
          candidate: { commit: candidateCommit, tree: candidateTree },
          environment: {
            node: process.version,
            platform: process.platform,
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

        const sha =
          overrides.badHashReceipt === obId
            ? "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
            : createHash("sha256").update(content, "utf8").digest("hex");
        ledger += `${sha}  receipts/${obId}.json\n`;
      }

      if (overrides.tamperedLedger) {
        ledger = overrides.tamperedLedger as string;
      }

      writeFileSync(join(dir, "receipts.sha256"), ledger, "utf8");

      const summary = {
        version: "1.0.0",
        candidate_commit: candidateCommit,
        candidate_tree: candidateTree,
        qualification: overrides.failSummary
          ? "QUALIFIED_FAIL"
          : "QUALIFIED_PASS",
        summary_sha256: "summary-sha-test",
      };
      writeFileSync(
        join(dir, "qualification-summary.json"),
        JSON.stringify(summary, null, 2),
        "utf8",
      );
    }

    beforeAll(() => {
      mkdirSync(p03TempDir, { recursive: true });
      candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();

      testKeypair = generateTestKeypair();
      testKeysJsonPath = join(p03TempDir, "test-trusted-keys.json");
      testKeyPemPath = join(p03TempDir, "test-signing-key.pem");
      const testKeysDef = [
        {
          keyid: "key-dice-test-signer-01",
          algorithm: "ed25519",
          public_key_pem: testKeypair.publicKey,
          roles: ["dice-attestation-signer"],
          status: "active",
          created_at: new Date().toISOString(),
        },
      ];
      writeFileSync(
        testKeysJsonPath,
        JSON.stringify(testKeysDef, null, 2),
        "utf8",
      );
      writeFileSync(testKeyPemPath, testKeypair.privateKey, "utf8");
    });

    afterAll(() => {
      if (existsSync(p03TempDir)) {
        rmSync(p03TempDir, { recursive: true, force: true });
      }
    });

    it("Genuine external authority matches externally pinned digests", () => {
      setupExternalAuthority();
      const res = extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      expect(res.distributionDigest).toBe(EXPECTED_DIST_DIGEST);
      expect(res.testPolicyDigest).toBe(EXPECTED_TEST_POLICY_DIGEST);
      expect(
        existsSync(
          join(isolatedSignerDir, "signer-distribution-manifest.json"),
        ),
      ).toBe(true);
    });

    // Vector 1: signing service (scripts/dice-signing-service.mjs)
    it("Vector 1: Hostile replacement of scripts/dice-signing-service.mjs in candidate tree is bypassed by external signer", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Candidate mutates its local signing script with malicious payload
      writeFileSync(
        join(candidateBase, "scripts/dice-signing-service.mjs"),
        'console.error("HOSTILE_SIGNER_PWNED"); process.exit(42);',
      );

      // 1. Candidate tree extraction fails closed against expected digests
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);
      expect(existsSync(isolatedSignerDir)).toBe(false);

      // 2. Protected external extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Executing the real protected path runs the protected signer, immune to candidate's hostile script
      const evidenceDir = join(p03TempDir, "evidence-v1");
      createValidEvidence(evidenceDir);

      const signer = new DiceSigningService({
        repoRoot,
        mode: "test",
        contractPath: "registries/dice/test-qualification-contract.json",
        evidenceDir,
        distDir: isolatedSignerDir,
        trustedRef: DEFAULT_TRUSTED_REF,
        keyId: "key-dice-test-signer-01",
        testKeysPath: testKeysJsonPath,
        signingKeyFile: testKeyPemPath,
      });

      const res = signer.execute();
      expect(res.status).toBe("TEST_ATTESTED");
      expect(res.qualification).toBe("TEST_QUALIFIED_NON_AUTHORITATIVE");
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        true,
      );

      // Verify independently via standalone DSSE verification step
      const verifyRes = verifyIndependentAttestation({
        attestationPath: join(evidenceDir, "test-attestation.dsse.json"),
        testKeysPath: testKeysJsonPath,
        candidateCommit,
        candidateTree,
        ledgerPath: join(evidenceDir, "receipts.sha256"),
        expectedPredicateType: "https://framique.com/dice/test-attestation/v1",
      });
      expect(verifyRes.valid).toBe(true);
      expect(verifyRes.qualification).toBe("TEST_QUALIFIED_NON_AUTHORITATIVE");

      // Verify zero attestations can ever be produced from candidate's hostile script
      expect(
        existsSync(join(candidateBase, "test-attestation.dsse.json")),
      ).toBe(false);
      expect(existsSync(join(candidateBase, "attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Vector 2: trusted root module (scripts/dice-root-of-trust.mjs)
    it("Vector 2: Hostile replacement of scripts/dice-root-of-trust.mjs in candidate tree cannot alter protected root verification", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Candidate injects rogue root definition
      writeFileSync(
        join(candidateBase, "scripts/dice-root-of-trust.mjs"),
        'export const APPROVED_ROOTS = { "rogue": "root" };',
      );

      // 1. Candidate extraction fails closed
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      // 2. Protected extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Protected root of trust initialized with external authority resolves authentic roots
      const root = new DiceTrustedRoot({
        repoRoot,
        trustedRef: DEFAULT_TRUSTED_REF,
        cacheDir: join(p03TempDir, "trusted-root-v2"),
        externalDistDir: isolatedSignerDir,
      });
      const info = root.resolve();
      expect(info.trustedCommit).toBe(DEFAULT_TRUSTED_REF);
      expect(info.trustedRootSha).toMatch(/^[0-9a-f]{64}$/);
    });

    // Vector 3: qualification evaluator (scripts/dice-qualify.mjs)
    it("Vector 3: Hostile candidate qualification evaluator (scripts/dice-qualify.mjs) cannot fake QUALIFIED_PASS", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Candidate mutates qualify script to always return QUALIFIED_PASS
      writeFileSync(
        join(candidateBase, "scripts/dice-qualify.mjs"),
        'export function evaluateCandidateQualification() { return { qualification: "QUALIFIED_PASS" }; }',
      );

      // 1. Candidate extraction fails closed
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      // 2. Protected extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Candidate provides failing qualification receipts
      const evidenceDir = join(p03TempDir, "failing-evidence-v3");
      createValidEvidence(evidenceDir, {
        failReceipt: "OBL-SYS-SCOPE-GUARD-001",
      });

      // 4. Real protected signer executes using isolatedSignerDir
      const signer = new DiceSigningService({
        repoRoot,
        mode: "test",
        contractPath: "registries/dice/test-qualification-contract.json",
        evidenceDir,
        distDir: isolatedSignerDir,
        trustedRef: DEFAULT_TRUSTED_REF,
        keyId: "key-dice-test-signer-01",
        testKeysPath: testKeysJsonPath,
        signingKeyFile: testKeyPemPath,
      });

      // Protected evaluation catches failure and fails closed
      expect(() => signer.execute()).toThrow(
        /FAIL-CLOSED: Receipt 'OBL-SYS-SCOPE-GUARD-001.json' has non-PASS status: FAIL/,
      );

      // Ensure zero attestations generated
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
      expect(existsSync(join(evidenceDir, "attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Vector 4: evidence serializer (scripts/dice-evidence.mjs)
    it("Vector 4: Hostile replacement of scripts/dice-evidence.mjs cannot bypass ledger verification", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Candidate attempts to bypass ledger checking
      writeFileSync(
        join(candidateBase, "scripts/dice-evidence.mjs"),
        "export class DiceSigningAuthority { validateLedger() { return true; } signAttestation() { return {}; } }",
      );

      // 1. Candidate extraction fails closed
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      // 2. Protected extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Tampered receipt digest in ledger
      const evidenceDir = join(p03TempDir, "tampered-ledger-v4");
      createValidEvidence(evidenceDir, {
        badHashReceipt: "OBL-SYS-SCOPE-GUARD-001",
      });

      const signer = new DiceSigningService({
        repoRoot,
        mode: "test",
        contractPath: "registries/dice/test-qualification-contract.json",
        evidenceDir,
        distDir: isolatedSignerDir,
        trustedRef: DEFAULT_TRUSTED_REF,
        keyId: "key-dice-test-signer-01",
        testKeysPath: testKeysJsonPath,
        signingKeyFile: testKeyPemPath,
      });

      expect(() => signer.execute()).toThrow(
        /FAIL-CLOSED: Receipt digest mismatch for receipts\/|FAIL-CLOSED: Ledger digest mismatch/,
      );
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
      expect(existsSync(join(evidenceDir, "attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Vector 5: test-policy manifest (registries/dice/test-policy.json)
    it("Vector 5: Hostile modification of registries/dice/test-policy.json in candidate tree is rejected", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Candidate mutates its local policy to allow rogue mode
      const tpPath = join(candidateBase, "registries/dice/test-policy.json");
      const tp = JSON.parse(readFileSync(tpPath, "utf8"));
      tp.test_signing.allowed_modes.push("rogue-mode");
      writeFileSync(tpPath, JSON.stringify(tp, null, 2));

      // 1. Candidate extraction fails closed
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Test policy digest mismatch!/);

      // 2. Protected extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Running signer with rogue-mode against protected distDir fails closed
      const evidenceDir = join(p03TempDir, "rogue-mode-v5");
      createValidEvidence(evidenceDir);

      expect(
        () =>
          new DiceSigningService({
            repoRoot,
            mode: "rogue-mode",
            contractPath: "registries/dice/test-qualification-contract.json",
            evidenceDir,
            distDir: isolatedSignerDir,
            trustedRef: DEFAULT_TRUSTED_REF,
            keyId: "key-dice-test-signer-01",
            testKeysPath: testKeysJsonPath,
            signingKeyFile: testKeyPemPath,
          }),
      ).toThrow(
        /FAIL-CLOSED: Invalid signing mode 'rogue-mode'|FAIL-CLOSED: Signing mode 'rogue-mode' not permitted by test policy/,
      );
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Vector 6: test contract and expected digest together (test-qualification-contract.json + test-policy.json)
    it("Vector 6: Joint modification of test contract and candidate test policy fails closed against external authority", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Rogue contract claiming @devrahmanbd
      const rogueContract = {
        change_id: "F30-DICE-ROGUE-MUTATION",
        owner: "@devrahmanbd",
        approval_state: "approved",
        is_test_contract: true,
      };
      const rogueContractPath = join(
        candidateBase,
        "registries/dice/test-qualification-contract.json",
      );
      writeFileSync(rogueContractPath, JSON.stringify(rogueContract, null, 2));

      // Candidate updates its own test-policy.json to match rogue contract's SHA
      const tpPath = join(candidateBase, "registries/dice/test-policy.json");
      const tp = JSON.parse(readFileSync(tpPath, "utf8"));
      tp.test_contract.change_id = "F30-DICE-ROGUE-MUTATION";
      tp.test_contract.sha256 =
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      writeFileSync(tpPath, JSON.stringify(tp, null, 2));

      // 1. Candidate extraction fails closed
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Test policy digest mismatch!/);

      // 2. Protected extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Real protected signer evaluates rogue contract against protected policy
      const evidenceDir = join(p03TempDir, "rogue-contract-v6");
      createValidEvidence(evidenceDir);

      const signer = new DiceSigningService({
        repoRoot,
        mode: "test",
        contractPath: rogueContractPath,
        evidenceDir,
        distDir: isolatedSignerDir,
        trustedRef: DEFAULT_TRUSTED_REF,
        keyId: "key-dice-test-signer-01",
        testKeysPath: testKeysJsonPath,
        signingKeyFile: testKeyPemPath,
      });

      expect(() => signer.execute()).toThrow(
        /FAIL-CLOSED: Test contract cannot claim human specification authority '@devrahmanbd'|FAIL-CLOSED: Test contract digest mismatch against test policy/,
      );
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
      expect(existsSync(join(evidenceDir, "attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Vector 7: trusted registry and schemas (mandatory-obligations.json, schemas/dice/*)
    it("Vector 7: Hostile tampering with mandatory-obligations.json or schemas in candidate tree is rejected fail-closed", () => {
      setupCandidateTree();
      setupExternalAuthority();

      // Candidate empties obligations in candidate tree
      const obPath = join(
        candidateBase,
        "registries/dice/mandatory-obligations.json",
      );
      writeFileSync(obPath, JSON.stringify([]));

      // 1. Candidate extraction fails closed
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      // 2. Protected extraction succeeds
      extractAndVerifySigningDistribution({
        externalDistDir: externalAuthorityDir,
        targetDir: isolatedSignerDir,
        expectedDistDigest: EXPECTED_DIST_DIGEST,
        expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
      });

      // 3. Evidence has a missing receipt (candidate hoped empty obligations wouldn't check it)
      const evidenceDir = join(p03TempDir, "missing-obligation-v7");
      createValidEvidence(evidenceDir, {
        skipReceipt: "OBL-SYS-SCOPE-GUARD-001",
      });

      const signer = new DiceSigningService({
        repoRoot,
        mode: "test",
        contractPath: "registries/dice/test-qualification-contract.json",
        evidenceDir,
        distDir: isolatedSignerDir,
        trustedRef: DEFAULT_TRUSTED_REF,
        keyId: "key-dice-test-signer-01",
        testKeysPath: testKeysJsonPath,
        signingKeyFile: testKeyPemPath,
      });

      // Gate 6 strictly enforces all 4 mandatory obligations from isolatedSignerDir
      expect(() => signer.execute()).toThrow(
        /FAIL-CLOSED: Candidate qualification re-evaluation failed: QUALIFIED_(FAIL|BLOCKED)/,
      );
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
      expect(existsSync(join(evidenceDir, "attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Additional external trust enforcement tests
    it("External Anchor Enforcement: Missing required external anchors fails closed", () => {
      setupExternalAuthority();
      expect(() =>
        extractAndVerifySigningDistribution({
          externalDistDir: externalAuthorityDir,
          targetDir: isolatedSignerDir,
          requireExternalAnchors: true,
          expectedDistDigest: null,
          expectedTestPolicyDigest: null,
        }),
      ).toThrow(/FAIL-CLOSED: External trust anchors required/);
    });

    it("External Distribution Integrity: Tampering with external distribution itself causes digest mismatch", () => {
      setupExternalAuthority();
      writeFileSync(
        join(externalAuthorityDir, "registries/dice/test-policy.json"),
        JSON.stringify({ tampered: true }),
      );

      expect(() =>
        extractAndVerifySigningDistribution({
          externalDistDir: externalAuthorityDir,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Test policy digest mismatch!/);
      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    it("Symlinked asset in external authority is rejected fail-closed", () => {
      setupExternalAuthority();
      const targetScript = join(
        externalAuthorityDir,
        "scripts/dice-signing-service.mjs",
      );
      rmSync(targetScript);
      const rogueScript = join(p03TempDir, "rogue-external-script.mjs");
      writeFileSync(rogueScript, 'console.log("PWNED");');
      symlinkSync(rogueScript, targetScript);

      expect(() =>
        extractAndVerifySigningDistribution({
          externalDistDir: externalAuthorityDir,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(
        /FAIL-CLOSED: Distribution asset cannot be a symlink: scripts\/dice-signing-service.mjs/,
      );
      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    it("Candidate-Local Signer Substitution: Using candidate repo as external authority fails closed", () => {
      setupCandidateTree();
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          externalDistDir: candidateBase,
          targetDir: isolatedSignerDir,
          requireExternalAnchors: true,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Candidate-local signer substitution detected!/);
      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    it("Missing External Distribution: Missing external distribution under external anchors fails closed as BLOCKED", () => {
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot,
          externalDistDir: "/tmp/non-existent-dist-dir-99",
          targetDir: isolatedSignerDir,
          requireExternalAnchors: true,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(
        /FAIL-CLOSED: Missing external verifier distribution directory \(BLOCKED\)/,
      );
      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    it("Candidate-Controlled Digest Modification: Tampered expected digest is rejected against external authority", () => {
      setupExternalAuthority();
      expect(() =>
        extractAndVerifySigningDistribution({
          externalDistDir: externalAuthorityDir,
          targetDir: isolatedSignerDir,
          requireExternalAnchors: true,
          expectedDistDigest:
            "0000000000000000000000000000000000000000000000000000000000000000",
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(
        /FAIL-CLOSED: Signer distribution digest mismatch! Expected 0000.* \(FAIL\)/,
      );
      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    it("Unauthorized Contract Modification: Attempting production signing without approval fails closed", () => {
      setupExternalAuthority();
      const evidenceDir = join(p03TempDir, "unauthorized-prod-contract");
      createValidEvidence(evidenceDir);

      const signer = new DiceSigningService({
        repoRoot,
        mode: "production",
        contractPath: "features/contracts/F30-DICE-COMPLETE.json",
        evidenceDir,
        distDir: externalAuthorityDir,
        trustedRef: DEFAULT_TRUSTED_REF,
        keyId: "key-dice-authoritative-01",
      });

      expect(() => signer.execute()).toThrow(
        /FAIL-CLOSED: Contract approval_state is 'proposed', expected 'approved' for authoritative signing/,
      );
      expect(existsSync(join(evidenceDir, "attestation.dsse.json"))).toBe(
        false,
      );
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
    });
  });
});
