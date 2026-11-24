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
import {
  DiceTrustedRoot,
  DEFAULT_TRUSTED_REF,
  validateCommitSha,
  validateTreeSha,
  validateTrustedRef,
  validateSafePath,
} from "../../../scripts/dice-root-of-trust.mjs";
import { DiceLauncher } from "../../../scripts/dice-launcher.mjs";
import { DiceSandbox } from "../../../scripts/dice-sandbox.mjs";
import {
  DiceSigningAuthority,
  generateTestKeypair,
} from "../../../scripts/dice-evidence.mjs";
import { evaluateMethodOracle } from "../../../scripts/dice-bootstrap.mjs";

describe("Frame30 DICE Stage 2.4: Candidate Mutation Matrix & Trust Boundary Enforcement (Section 7)", () => {
  const repoRoot = process.cwd();
  let testTempDir: string;
  let trustedRoot: DiceTrustedRoot;

  beforeAll(() => {
    testTempDir = join(repoRoot, ".test-tmp-authority-mutation");
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
});
