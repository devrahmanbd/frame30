import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  mkdtempSync,
} from "node:fs";
import { join, resolve } from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  DiceTrustedRoot,
  DEFAULT_TRUSTED_REF,
  validateSafePath,
} from "../../../scripts/dice-root-of-trust.mjs";
import {
  evaluateCandidateQualification,
  evaluateObligationDisposition,
} from "../../../scripts/dice-qualify.mjs";
import { generateFrozenPlan } from "../../../scripts/dice-plan-generator.mjs";
import {
  extractFileEdges,
  buildDependencyGraph,
  computeImpactClosure,
} from "../../../scripts/extract-dependencies.mjs";
import { DiceSandbox } from "../../../scripts/dice-sandbox.mjs";
import { DiceSigningService } from "../../../scripts/dice-signing-service.mjs";
import {
  DiceSigningAuthority,
  generateTestKeypair,
  serializeReceiptCanonical,
  computeReceiptDigest,
} from "../../../scripts/dice-evidence.mjs";
import { evaluateMethodOracle } from "../../../scripts/dice-bootstrap.mjs";
import {
  Lean4Adapter,
  TlaAdapter,
  Bend2Adapter,
  BombadilAdapter,
  VitestAdapter,
  LawFileSegregator,
} from "./adapters/index.js";

describe("Frame30 DICE 27-Class Adversarial Mutation Matrix (F30-DICE-ARCH-001 Revision 2.3 & MC-01..MC-27)", () => {
  const repoRoot = process.cwd();
  const testDir = resolve("/tmp", ".test-tmp-mutation-matrix-27");
  let candidateCommit: string;
  let candidateTree: string;
  let trustedRoot: DiceTrustedRoot;

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

    trustedRoot = new DiceTrustedRoot({
      repoRoot,
      trustedRef: DEFAULT_TRUSTED_REF,
      cacheDir: join(testDir, "trusted-dist"),
    });
    trustedRoot.resolve();
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // MC-01: Empty expected verification plan -> BLOCKED (PlanValidator)
  it("MC-01: Empty expected verification plan evaluates strictly to QUALIFIED_BLOCKED (PlanValidator)", () => {
    const emptyPlan = {
      obligations: { mandatory: [], selected: [], active: [], waived: [] },
    };
    const qual = evaluateCandidateQualification(emptyPlan, [], candidateTree);
    expect(qual.qualification).toBe("QUALIFIED_BLOCKED");
    expect(qual.reason).toContain("Empty selected obligation set");
  });

  // MC-02: Empty execution result set -> BLOCKED (ResultReconciler)
  it("MC-02: Empty execution result set on non-empty plan evaluates strictly to QUALIFIED_BLOCKED (ResultReconciler)", () => {
    const validPlan = {
      obligations: {
        mandatory: ["OBL-SYS-SCOPE-GUARD-001"],
        selected: ["OBL-SYS-SCOPE-GUARD-001"],
        active: ["OBL-SYS-SCOPE-GUARD-001"],
        waived: [],
      },
    };
    const qual = evaluateCandidateQualification(validPlan, [], candidateTree, {
      enforceBaseline: false,
    });
    expect(qual.qualification).toBe("QUALIFIED_BLOCKED");
    expect(qual.blocked?.length).toBeGreaterThan(0);
    expect(qual.reason).toContain("blocked or missing receipts");
  });

  // MC-03: Worker killed mid-run (partial run) -> BLOCKED (ReceiptCompleter)
  it("MC-03: Worker killed mid-run leaving missing receipts evaluates strictly to QUALIFIED_BLOCKED (ReceiptCompleter)", () => {
    const multiMethodOb = {
      obligation_id: "OBL-SYS-SCOPE-GUARD-001",
      methods: [
        { method_id: "METH-01", trusted_profile_ref: "PROF-SCRIPT-v1" },
        { method_id: "METH-02", trusted_profile_ref: "PROF-SCRIPT-v1" },
      ],
    };
    const receipts = [
      {
        obligation_id: "OBL-SYS-SCOPE-GUARD-001",
        method_id: "METH-01",
        status: "PASS",
        tree_sha: candidateTree,
      },
    ];
    const plan = {
      obligations: {
        mandatory: ["OBL-SYS-SCOPE-GUARD-001"],
        selected: ["OBL-SYS-SCOPE-GUARD-001"],
        active: ["OBL-SYS-SCOPE-GUARD-001"],
        waived: [],
      },
    };
    const disp = evaluateObligationDisposition(
      "OBL-SYS-SCOPE-GUARD-001",
      receipts,
      plan,
      candidateTree,
      {
        obligationDef: multiMethodOb,
      },
    );
    expect(disp.disposition).toBe("DISP_BLOCKED");
    expect(disp.reason).toContain("MISSING_METHOD_RECEIPT: METH-02");
  });

  // MC-04: Substitute result-derived obligation set -> BLOCKED (FrozenPlanGuard)
  it("MC-04: Substitute result-derived obligation set is rejected by precomputed frozen plan hash (FrozenPlanGuard)", () => {
    const { plan: validPlan } = generateFrozenPlan({
      candidateCommit,
      candidateTree,
      selectedObligations: ["OBL-SYS-SCOPE-GUARD-001"],
    });
    // Attacker tampers with plan: removes mandatory baseline obligation from selected
    const tamperedPlan = {
      ...validPlan,
      obligations: {
        ...validPlan.obligations,
        selected: validPlan.obligations.selected.filter(
          (id: string) => id !== "OBL-SYS-SCOPE-GUARD-001",
        ),
      },
    };
    const qual = evaluateCandidateQualification(
      tamperedPlan,
      [],
      candidateTree,
    );
    expect(qual.qualification).toBe("QUALIFIED_BLOCKED");
    expect(qual.reason).toContain("PLAN_INTEGRITY_VIOLATION");
    expect(qual.reason).toContain("missing from selected set");
  });

  // MC-05: Candidate-controlled CLI arguments -> BLOCKED (ProfileValidator)
  it("MC-05: Candidate-controlled CLI arguments outside trusted profile regex are rejected (ProfileValidator)", () => {
    const trustedProfiles = trustedRoot.loadTrustedJson(
      "registries/dice/trusted-profiles.json",
    );
    const vitestProfile = (
      trustedProfiles as Array<{
        profile_id: string;
        allowed_cli_args: string[];
      }>
    ).find((p) => p.profile_id === "PROF-VITEST-v1");
    expect(vitestProfile).toBeDefined();

    const allowedRegexes = (vitestProfile?.allowed_cli_args || []).map(
      (r: string) => new RegExp(r),
    );
    const maliciousArg = "--eval=process.exit(0)";
    const isAllowed = allowedRegexes.some((re: RegExp) =>
      re.test(maliciousArg),
    );
    expect(isAllowed).toBe(false);

    // Also test script profile rejecting shell injection / unauthorized script
    const scriptProfile = (
      trustedProfiles as Array<{
        profile_id: string;
        allowed_cli_args: string[];
      }>
    ).find((p) => p.profile_id === "PROF-SCRIPT-v1");
    const scriptRegexes = (scriptProfile?.allowed_cli_args || []).map(
      (r: string) => new RegExp(r),
    );
    const maliciousScript = "scripts/malicious-attack;rm.mjs";
    expect(scriptRegexes.some((re: RegExp) => re.test(maliciousScript))).toBe(
      false,
    );
  });

  // MC-06: Candidate-controlled specification hashes -> BLOCKED (TreeHashVerifier)
  it("MC-06: Candidate-controlled specification hashes differing from disk are rejected (TreeHashVerifier)", () => {
    const adapter = new Lean4Adapter({ repoRoot });
    const fakeSpec = {
      path: "specs/lean/lakefile.lean",
      sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
    };
    const specCheck = adapter.validateSpecifications([fakeSpec]);
    expect(specCheck.status).toBe("BLOCKED");
    expect(specCheck.reason).toContain("hash mismatch");
  });

  // MC-07: Dependency graph edge deletion -> FAIL (DualGraphCrawler)
  it("MC-07: Dependency graph edge deletion in candidate triggers dependent re-verification (DualGraphCrawler)", () => {
    // Production control: buildDependencyGraph & computeImpactClosure from scripts/extract-dependencies.mjs
    const baseFileMap = {
      "src/lib/cart.ts":
        'import { calculatePrice } from "./commerce/pricing.ts";\nexport function getCart() {}',
      "src/lib/commerce/pricing.ts":
        "export function calculatePrice() { return 100; }",
    };
    const candFileMap = {
      "src/lib/cart.ts": "export function getCart() {}",
      "src/lib/commerce/pricing.ts":
        "export function calculatePrice() { return 100; }",
    };
    const baseGraph = buildDependencyGraph(baseFileMap);
    const candGraph = buildDependencyGraph(candFileMap);

    const closureResult = computeImpactClosure(
      ["src/lib/cart.ts"],
      baseGraph,
      candGraph,
    );
    expect(closureResult.deletedEdges.length).toBeGreaterThan(0);
    expect(closureResult.deletedEdges[0].source).toBe("src/lib/cart.ts");
    expect(closureResult.deletedEdges[0].target).toBe("commerce/pricing.ts");
    expect(closureResult.impactClosure).toContain("commerce/pricing.ts");
  });

  // MC-08: Omit cross-domain SQL/RLS dependency -> FAIL (MultiSurfaceScan)
  it("MC-08: Cross-domain SQL/RLS relationship omission triggers scanner failure (MultiSurfaceScan)", () => {
    // Production control: extractFileEdges from scripts/extract-dependencies.mjs
    const compliantSql =
      "ALTER TABLE stores ENABLE ROW LEVEL SECURITY;\nCREATE POLICY tenant_isolation ON stores FOR ALL USING (tenant_id = auth.uid());";
    const compliantEdges = extractFileEdges(
      "supabase/migrations/001_stores.sql",
      compliantSql,
    );
    const rlsEdge = (
      compliantEdges as Array<{ surface: string; target: string }>
    ).find((e) => e.surface === "rls_policy");
    expect(rlsEdge).toBeDefined();
    expect(rlsEdge?.target).toBe("policy:tenant_isolation:on:stores");

    // Malicious omission where RLS policy is dropped
    const nonCompliantSql = "ALTER TABLE stores DISABLE ROW LEVEL SECURITY;";
    const nonCompliantEdges = extractFileEdges(
      "supabase/migrations/001_stores.sql",
      nonCompliantSql,
    );
    const missingRlsEdge = (
      nonCompliantEdges as Array<{ surface: string; target: string }>
    ).find((e) => e.surface === "rls_policy");
    expect(missingRlsEdge).toBeUndefined();
  });

  // MC-09: Quarantined Bend Laws 7-12 leakage -> FAIL (LawFileSegregator)
  it("MC-09: Quarantined Bend Laws 7-12 inclusion in production laws fails closed (LawFileSegregator)", () => {
    // Production control: LawFileSegregator audits ratified vs quarantined laws
    const ratifiedDieLaws = [
      "law_responsive_cascade_mobile",
      "law_responsive_cascade_tablet",
      "law_responsive_cascade_desktop",
      "law_reset_restoration_mobile",
      "law_collection_self_exclusion",
      "law_cross_sell_preservation",
    ];
    const quarantinedLaws = [
      "law_cms_draft_secrecy",
      "law_cms_scheduled_secrecy",
      "law_cms_published_visibility",
      "law_cms_archived_secrecy",
      "law_cms_tenant_boundary_isolation",
      "law_cms_same_tenant_access",
    ];

    for (const law of ratifiedDieLaws) {
      expect(LawFileSegregator.auditLawRatification(law)).toBe("RATIFIED");
    }
    for (const qLaw of quarantinedLaws) {
      expect(LawFileSegregator.auditLawRatification(qLaw)).toBe("QUARANTINED");
    }

    // Attempting to ratify quarantined law fails closed
    const tamperedConfig = "ratified_law: law_cms_draft_secrecy";
    const check = LawFileSegregator.validateLawFile(tamperedConfig);
    expect(check.status).toBe("FAIL");
    expect(check.violations).toContain("law_cms_draft_secrecy");
  });

  // MC-10: Lean false equivalence (bad vector) -> FAIL (FastCheckBridge)
  it("MC-10: Lean false equivalence with divergent vector fails verification (FastCheckBridge)", () => {
    const adapter = new Lean4Adapter({ repoRoot });
    const stdout =
      "Received 13 pricing vectors from Lean runtime.\nDiscrepancy at vector 4: Lean=1000, TS=1200\nFormal verification gate FAILED";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 500);
    expect(verdict.status).toBe("FAIL");
  });

  // MC-11: TLA+ liveness failure (hang/livelock) -> FAIL (TLCModelChecker)
  it("MC-11: TLA+ livelock or deadlock is detected as FAIL (TLCModelChecker)", () => {
    const adapter = new TlaAdapter({ repoRoot });
    const stdout =
      "Error: Deadlock reached.\nState 4: <CartUnchecked, LockHeld>";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 1000);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.diagnostics).toContain("DEADLOCK_REACHED");
  });

  // MC-12: Detached background child (setsid) -> BLOCKED (PidNamespaceGuard)
  it("MC-12: Detached background process via setsid is reaped by unshared PID namespace (PidNamespaceGuard)", () => {
    const sandbox = new DiceSandbox({
      platform: "linux",
      bwrapPath: "/usr/bin/bwrap",
    });
    const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/fake-src" });
    expect(args).toContain("--unshare-pid");
    expect(args).toContain("--die-with-parent");
    expect(args).toContain("--new-session");
  });

  // MC-13: Access exposed Docker daemon socket -> BLOCKED (SocketMountFilter)
  it("MC-13: Docker daemon socket is strictly prohibited from sandbox mounts (SocketMountFilter)", () => {
    const sandbox = new DiceSandbox({
      platform: "linux",
      bwrapPath: "/usr/bin/bwrap",
    });
    const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/fake-src" });
    const joined = args.join(" ");
    expect(joined).not.toContain("/var/run/docker.sock");
    expect(joined).not.toContain("docker.sock");
  });

  // MC-14: Tamper with .circleci/config.yml -> BLOCKED (ConfigHashGuard)
  it("MC-14: Tampering with .circleci/config.yml without contract authorization is blocked (ConfigHashGuard)", () => {
    // Production control: Execute scripts/scope-guard.mjs with diff manifest containing .circleci/config.yml
    // against a contract that does not authorize .circleci/**
    const tmpDir = mkdtempSync(join(os.tmpdir(), "dice-mc14-"));
    try {
      const contractPath = join(tmpDir, "contract.json");
      const manifestPath = join(tmpDir, "diff-manifest.json");
      writeFileSync(
        contractPath,
        JSON.stringify({
          change_id: "MC-14-TEST",
          baseline_commit: "0000000000000000000000000000000000000000",
          approval_state: "approved",
          owner: "@devrahmanbd",
          allowed_file_changes: ["src/lib/dice/**"],
        }),
      );
      writeFileSync(
        manifestPath,
        JSON.stringify({
          base_commit: "0000000000000000000000000000000000000000",
          entries: [{ path: ".circleci/config.yml", status: "M" }],
        }),
      );

      let failed = false;
      let output = "";
      try {
        execFileSync(
          process.execPath,
          [
            join(repoRoot, "scripts/scope-guard.mjs"),
            `--contract=${contractPath}`,
            `--diff-manifest=${manifestPath}`,
          ],
          { cwd: repoRoot, stdio: "pipe", encoding: "utf8" },
        );
      } catch (err: unknown) {
        failed = true;
        const e = err as { stdout?: string; stderr?: string };
        output = (e.stdout || "") + (e.stderr || "");
      }
      expect(failed).toBe(true);
      expect(output).toContain("SCOPE VIOLATIONS DETECTED (FAIL-CLOSED)");
      expect(output).toContain(".circleci/config.yml");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // MC-15: Worker attempts reading signing key -> BLOCKED (SecretPathSandbox)
  it("MC-15: Worker sandbox prevents reading host credentials and private signing keys (SecretPathSandbox)", () => {
    const sandbox = new DiceSandbox({
      platform: "linux",
      bwrapPath: "/usr/bin/bwrap",
    });
    const args = sandbox.buildBwrapArgs({ sourceSnapshot: "/tmp/fake-src" });
    const joined = args.join(" ");
    expect(joined).not.toContain("/etc/shadow");
    expect(joined).not.toContain(".ssh");
    expect(joined).not.toContain("DICE_SIGNING_KEY");
  });

  // MC-16: Tamper with receipt JSON payload -> BLOCKED (DetachedDigestLedger)
  it("MC-16: Tampering with receipt JSON payload post-signing is detected by detached digest (DetachedDigestLedger)", () => {
    const receipt = {
      obligation_id: "OBL-SYS-SCOPE-GUARD-001",
      status: "PASS",
      result: "OK",
    };
    const canon = serializeReceiptCanonical(receipt);
    const digest = computeReceiptDigest(canon);

    // Tamper with receipt payload
    const tampered = { ...receipt, status: "FAIL" };
    const tamperedCanon = serializeReceiptCanonical(tampered);
    const tamperedDigest = computeReceiptDigest(tamperedCanon);

    expect(tamperedDigest).not.toBe(digest);
  });

  // MC-17: Forge unauthorized waiver signature -> BLOCKED (CryptographicSign)
  it("MC-17: Forged waiver on mandatory baseline obligation evaluates strictly to QUALIFIED_FAIL (CryptographicSign)", () => {
    const plan = {
      obligations: {
        mandatory: ["OBL-SYS-SCOPE-GUARD-001"],
        selected: ["OBL-SYS-SCOPE-GUARD-001"],
        active: [],
        waived: ["OBL-SYS-SCOPE-GUARD-001"], // Attempted waiver of mandatory OBL
      },
    };
    const qual = evaluateCandidateQualification(plan, [], candidateTree, {
      enforceBaseline: false,
    });
    expect(qual.qualification).toBe("QUALIFIED_FAIL");
    expect(qual.reason).toContain("MANDATORY_WAIVER_PROHIBITED");
  });

  // MC-18: Run self-verification on dirty checkout -> PASS (SnapshotDiffGuard)
  it("MC-18: Clean snapshot extraction ignores dirty untracked checkout files (SnapshotDiffGuard)", () => {
    const cleanTarget = join(testDir, "clean-snapshot-mc18");
    trustedRoot.createCandidateSnapshot(candidateTree, cleanTarget);
    expect(existsSync(join(cleanTarget, ".git"))).toBe(false);
    expect(existsSync(join(cleanTarget, ".env.local"))).toBe(false);
  }, 30000);

  // MC-19: Remove Lean theorem declaration -> FAIL (LakeAxiomAuditor)
  it("MC-19: Removing a required Lean theorem declaration causes lake build failure (LakeAxiomAuditor)", () => {
    const adapter = new Lean4Adapter({ repoRoot });
    const stdout =
      "error: cannot find theorem 'discount_le_subtotal'\nBuild failed.";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 200);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.diagnostics).toContain("LEAN_COMPILATION_ERROR");
  });

  // MC-20: Inject Lean sorryAx cheat -> FAIL (AxiomAllowlist)
  it("MC-20: Injecting Lean sorryAx cheat is intercepted and failed closed (AxiomAllowlist)", () => {
    const adapter = new Lean4Adapter({ repoRoot });
    const stdout = "Auditing axioms: [propext, Quot.sound, sorryAx]\n";
    const verdict = adapter.parseExecutionResult(stdout, "", 0, 100);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.diagnostics).toContain("sorryAx");
  });

  // MC-21: Corrupt TLA+ .cfg model config -> BLOCKED (TlcConfigValidator)
  it("MC-21: Corrupt TLA+ .cfg configuration evaluates strictly to BLOCKED (TlcConfigValidator)", () => {
    const adapter = new TlaAdapter({ repoRoot });
    const stdout =
      "Configuration file ResponsiveAutosave.cfg has syntax error at line 5";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 100);
    expect(verdict.status).toBe("BLOCKED");
    expect(verdict.diagnostics).toContain("TLC_CONFIG_ERROR");
  });

  // MC-22: Invert TLA+ safety invariant -> FAIL (TLCModelChecker)
  it("MC-22: Inverting TLA+ safety invariant triggers TLC violation detection (TLCModelChecker)", () => {
    const adapter = new TlaAdapter({ repoRoot });
    const stdout =
      "Error: Invariant TypeOK is violated.\nThe behavior up to this point is...";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 400);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.diagnostics).toBe("INVARIANT_VIOLATED: TypeOK");
  });

  // MC-23: Incomplete Bend 2 proof term -> FAIL (BendKernelVerdict)
  it("MC-23: Incomplete Bend 2 proof term is caught by Lean-backed kernel (BendKernelVerdict)", () => {
    const adapter = new Bend2Adapter({ repoRoot });
    const stdout =
      "Checking proof for Law 2: bogo_discount_bounded\nFailed proof: open term detected\n";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 300);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.diagnostics).toContain("INCOMPLETE_BEND_PROOF");
  });

  // MC-24: Viewport layout blowout (>100vw) -> FAIL (BombadilOverflow)
  it("MC-24: Viewport layout horizontal overflow is caught by Bombadil (BombadilOverflow)", () => {
    const adapter = new BombadilAdapter({ repoRoot });
    const stdout =
      "[bombadil] HORIZONTAL_OVERFLOW detected at 320px viewport: scrollWidth 360 > 320";
    const verdict = adapter.parseExecutionResult(stdout, "", 1, 800);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.diagnostics).toContain("HORIZONTAL_OVERFLOW");
  });

  // MC-25: Toolchain version downgrade -> BLOCKED (ToolVersionGuard)
  it("MC-25: Downgrading pinned toolchain binary version fails closed as BLOCKED (ToolVersionGuard)", () => {
    const adapter = new Bend2Adapter({
      toolVersion: "0.2.38",
      binaryPath: "nonexistent-old-bend",
    });
    const envCheck = adapter.validateEnvironment();
    expect(envCheck.status).toBe("BLOCKED");
    expect(envCheck.reason).toContain("unavailable");
  });

  // MC-26: Reused evidence from older commit -> BLOCKED (TreeProvenanceChkr)
  it("MC-26: Reused evidence from older commit or tree SHA fails closed as BLOCKED (TreeProvenanceChkr)", () => {
    const oldTree = "0000000000000000000000000000000000000000";
    const receipts = [
      {
        obligation_id: "OBL-SYS-SCOPE-GUARD-001",
        method_id: "METH-01",
        status: "PASS",
        tree_sha: oldTree,
      },
    ];
    const plan = {
      obligations: {
        mandatory: ["OBL-SYS-SCOPE-GUARD-001"],
        selected: ["OBL-SYS-SCOPE-GUARD-001"],
        active: ["OBL-SYS-SCOPE-GUARD-001"],
        waived: [],
      },
    };
    const disp = evaluateObligationDisposition(
      "OBL-SYS-SCOPE-GUARD-001",
      receipts,
      plan,
      candidateTree,
    );
    expect(disp.disposition).toBe("DISP_BLOCKED");
    expect(disp.reason).toContain("STALE_PROVENANCE_TREE_MISMATCH");
  });

  // MC-27: Parser teeth regex inversion trap -> FAIL (OracleSelfAuditor)
  it("MC-27: Parser oracle asserting false success when error markers are present fails closed (OracleSelfAuditor)", () => {
    const oracle = {
      oracle_type: "kernel_verdict",
    };
    // Even if stdout says "SUCCESS", if it also contains "FAIL" or exitCode !== 0, it must NOT return PASS
    const poisonedResult = {
      exitCode: 1,
      stdout: "SUCCESS: all parsed\nFAIL: invariant breached",
      stderr: "",
    };
    const outcome = evaluateMethodOracle(oracle, poisonedResult, 100);
    expect(outcome).toBe("FAIL");
  });
});
