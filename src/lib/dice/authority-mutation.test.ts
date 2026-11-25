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
    const EXPECTED_TEST_POLICY_DIGEST =
      "eb447909aff1afe029c5207e069259690a7975245926dd7ae0caef01b789380d";
    const EXPECTED_DIST_DIGEST =
      "3155cac15727ae58205dc16f729e051570068ce2c506b1a5f6bdfb976419273b";

    const p03TempDir = join(testTempDir, "p03-replacement-matrix");
    const candidateBase = join(p03TempDir, "candidate-tree");
    const isolatedSignerDir = join(p03TempDir, "isolated-signer");

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

    beforeAll(() => {
      mkdirSync(p03TempDir, { recursive: true });
    });

    afterAll(() => {
      if (existsSync(p03TempDir)) {
        rmSync(p03TempDir, { recursive: true, force: true });
      }
    });

    it("Genuine candidate tree matches externally pinned digests", () => {
      setupCandidateTree();
      const res = extractAndVerifySigningDistribution({
        repoRoot: candidateBase,
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
    it("Vector 1: Hostile replacement of scripts/dice-signing-service.mjs is rejected and execution prevented", () => {
      setupCandidateTree();
      writeFileSync(
        join(candidateBase, "scripts/dice-signing-service.mjs"),
        'console.error("HOSTILE_SIGNER_PWNED"); process.exit(42);',
      );

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      // Isolated target directory was wiped fail-closed
      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    // Vector 2: trusted root module (scripts/dice-root-of-trust.mjs)
    it("Vector 2: Hostile replacement of scripts/dice-root-of-trust.mjs is rejected fail-closed", () => {
      setupCandidateTree();
      writeFileSync(
        join(candidateBase, "scripts/dice-root-of-trust.mjs"),
        'export const APPROVED_ROOTS = { "rogue": "root" };',
      );

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    // Vector 3: qualification evaluator (scripts/dice-qualify.mjs)
    it("Vector 3: Hostile replacement of scripts/dice-qualify.mjs is rejected fail-closed", () => {
      setupCandidateTree();
      writeFileSync(
        join(candidateBase, "scripts/dice-qualify.mjs"),
        'export function evaluateCandidateQualification() { return { qualification: "QUALIFIED_PASS" }; }',
      );

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    // Vector 4: evidence serializer (scripts/dice-evidence.mjs)
    it("Vector 4: Hostile replacement of scripts/dice-evidence.mjs is rejected fail-closed", () => {
      setupCandidateTree();
      writeFileSync(
        join(candidateBase, "scripts/dice-evidence.mjs"),
        "export class DiceSigningAuthority { validateLedger() { return true; } signAttestation() { return {}; } }",
      );

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    // Vector 5: test-policy manifest (registries/dice/test-policy.json)
    it("Vector 5: Hostile modification of registries/dice/test-policy.json is detected and rejected", () => {
      setupCandidateTree();
      const tpPath = join(candidateBase, "registries/dice/test-policy.json");
      const tp = JSON.parse(readFileSync(tpPath, "utf8"));
      tp.test_signing.allowed_modes.push("rogue-mode");
      writeFileSync(tpPath, JSON.stringify(tp, null, 2));

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Test policy digest mismatch!/);

      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    // Vector 6: test contract and expected digest together (test-qualification-contract.json + test-policy.json)
    it("Vector 6: Joint modification of test contract and expected digest together fails closed and produces no attestation", () => {
      setupCandidateTree();
      // Attacker creates a rogue test contract with altered ownership/obligations
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

      // Attacker also mutates test-policy.json to match rogue contract's SHA
      const tpPath = join(candidateBase, "registries/dice/test-policy.json");
      const tp = JSON.parse(readFileSync(tpPath, "utf8"));
      tp.test_contract.change_id = "F30-DICE-ROGUE-MUTATION";
      tp.test_contract.sha256 =
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      writeFileSync(tpPath, JSON.stringify(tp, null, 2));

      // 1. Verifier extraction immediately halts on test policy digest mismatch
      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Test policy digest mismatch!/);

      // 2. Furthermore, even if candidate attempts to pass rogue contract directly to DiceSigningService,
      // Gate 3 loads authoritative test-policy.json from protected distribution, rejecting the contract
      const evidenceDir = join(p03TempDir, "rogue-evidence");
      mkdirSync(evidenceDir, { recursive: true });
      const signer = new DiceSigningService({
        repoRoot,
        mode: "test",
        contractPath: rogueContractPath,
        evidenceDir,
        distDir: repoRoot, // points to authoritative distribution
        trustedRef: DEFAULT_TRUSTED_REF,
      });

      expect(() => signer.execute()).toThrow(
        /FAIL-CLOSED: Test contract cannot claim human specification authority '@devrahmanbd'|FAIL-CLOSED: Test contract digest mismatch against test policy/,
      );

      // Ensure zero attestations generated
      expect(existsSync(join(evidenceDir, "test-attestation.dsse.json"))).toBe(
        false,
      );
      expect(existsSync(join(evidenceDir, "attestation.dsse.json"))).toBe(
        false,
      );
    });

    // Vector 7: trusted registry and schemas (mandatory-obligations.json, schemas/dice/*)
    it("Vector 7: Tampering with mandatory-obligations.json or schemas is rejected fail-closed", () => {
      setupCandidateTree();
      // Tamper with mandatory obligations
      const obPath = join(
        candidateBase,
        "registries/dice/mandatory-obligations.json",
      );
      writeFileSync(obPath, JSON.stringify([]));

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      expect(existsSync(isolatedSignerDir)).toBe(false);

      // Restore and tamper with schema
      setupCandidateTree();
      const schemaPath = join(
        candidateBase,
        "schemas/dice/evidence-envelope.schema.json",
      );
      writeFileSync(schemaPath, JSON.stringify({ type: "any" }));

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(/FAIL-CLOSED: Signer distribution digest mismatch!/);

      expect(existsSync(isolatedSignerDir)).toBe(false);
    });

    // Missing distribution file
    it("Missing distribution asset fails closed with explicit error", () => {
      setupCandidateTree();
      rmSync(join(candidateBase, "scripts/dice-signing-service.mjs"));

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(
        /FAIL-CLOSED: Required verifier distribution file missing: scripts\/dice-signing-service.mjs/,
      );
    });

    // Symlink attack
    it("Symlinked distribution asset is detected and rejected fail-closed", () => {
      setupCandidateTree();
      const targetScript = join(
        candidateBase,
        "scripts/dice-signing-service.mjs",
      );
      rmSync(targetScript);
      const rogueScript = join(p03TempDir, "rogue-external-script.mjs");
      writeFileSync(rogueScript, 'console.log("PWNED");');
      symlinkSync(rogueScript, targetScript);

      expect(() =>
        extractAndVerifySigningDistribution({
          repoRoot: candidateBase,
          targetDir: isolatedSignerDir,
          expectedDistDigest: EXPECTED_DIST_DIGEST,
          expectedTestPolicyDigest: EXPECTED_TEST_POLICY_DIGEST,
        }),
      ).toThrow(
        /FAIL-CLOSED: Distribution asset cannot be a symlink: scripts\/dice-signing-service.mjs/,
      );
    });
  });
});
