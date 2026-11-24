import { describe, it, expect } from "vitest";
import {
  Lean4Adapter,
  TlaAdapter,
  Bend2Adapter,
  BombadilAdapter,
  VitestAdapter,
  getAdapterForTool,
} from "./adapters/index.js";

describe("Frame30 DICE Native Verification Adapters (Section 8 & Unified Interface)", () => {
  const dummyProvenance = {
    commitSha: "382261db0cb5b796046ae03c28fd8f309b901123",
    treeSha: "fbf972496f7783cae45267f524ee9cbf0238ad58",
  };

  const dummyLinkage = {
    obligationId: "OBL-FORMAL-TEST-001",
    methodId: "METH-TEST-01",
    riskClass: "critical" as const,
  };

  describe("1. Lean 4 Adapter (Lean4Adapter)", () => {
    const adapter = new Lean4Adapter();

    it("identifies correct tool name and pinned toolchain version", () => {
      expect(adapter.tool.name).toBe("lean4");
      expect(adapter.tool.version).toBe("v4.15.0");
    });

    it("parses sorryAx cheat as FAIL with explicit diagnostics", () => {
      const stdout = "theorem discount_le_subtotal : Ax [sorryAx]";
      const verdict = adapter.parseExecutionResult(stdout, "", 0, 100);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toContain("sorryAx");
    });

    it("parses compilation error as FAIL", () => {
      const stderr = "error: unknown identifier 'x'";
      const verdict = adapter.parseExecutionResult("", stderr, 1, 150);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toContain("LEAN_COMPILATION_ERROR");
    });

    it("parses successful lake build as PASS", () => {
      const stdout = "Build completed successfully.\nAll 32 theorems verified.";
      const verdict = adapter.parseExecutionResult(stdout, "", 0, 500);
      expect(verdict.status).toBe("PASS");
    });

    it("detects missing specification file and returns BLOCKED receipt with SPECIFICATION_MISSING", () => {
      const receipt = adapter.execute(
        { id: "inv-1", approvedArgs: [] },
        dummyProvenance,
        dummyLinkage,
        [{ path: "specs/lean/non_existent.lean", sha256: "000000" }],
      );
      expect(receipt.status).toBe("BLOCKED");
      expect(receipt.diagnostics).toContain("SPECIFICATION_MISSING");
      expect(receipt.diagnostics).toContain("missing");
    });

    it("detects unavailable Lake toolchain deterministically and returns BLOCKED receipt with TOOLCHAIN_UNAVAILABLE", () => {
      const isolatedAdapter = new Lean4Adapter({
        toolDiscovery: () => null,
      });
      const receipt = isolatedAdapter.execute(
        { id: "inv-2", approvedArgs: [] },
        dummyProvenance,
        dummyLinkage,
        [{ path: "specs/lean/lakefile.lean", sha256: "" }],
      );
      expect(receipt.status).toBe("BLOCKED");
      expect(receipt.status).not.toBe("PASS");
      expect(receipt.diagnostics).toContain("TOOLCHAIN_UNAVAILABLE");
    });

    it("verifies valid specification with Lake present and produces PASS", () => {
      const simulatedAdapter = new Lean4Adapter({
        toolDiscovery: () => "/mock/bin/lake",
        execFn: (_file, args) =>
          (args as string[]).includes("--version")
            ? "Lake version 4.15.0 (Lean 4.15.0)"
            : "Build completed successfully.\nAll 32 theorems verified.",
      });
      const receipt = simulatedAdapter.execute(
        { id: "inv-3", approvedArgs: ["build"] },
        dummyProvenance,
        dummyLinkage,
        [{ path: "specs/lean/lakefile.lean", sha256: "" }],
      );
      expect(receipt.status).toBe("PASS");
      expect(receipt.exit_code).toBe(0);
    });

    it("ensures unavailable mandatory Lean verification produces BLOCKED (never PASS)", () => {
      const absentAdapter = new Lean4Adapter({
        toolDiscovery: () => null,
      });
      const receipt = absentAdapter.execute(
        { id: "inv-4", approvedArgs: [] },
        dummyProvenance,
        dummyLinkage,
        [{ path: "specs/lean/lakefile.lean", sha256: "" }],
      );
      expect(receipt.status).toBe("BLOCKED");
      expect(receipt.status).not.toBe("PASS");
    });
  });

  describe("2. TLA+ / TLC Adapter (TlaAdapter)", () => {
    const adapter = new TlaAdapter();

    it("identifies correct tool name and pinned version", () => {
      expect(adapter.tool.name).toBe("tlc");
      expect(adapter.tool.version).toBe("2.18");
    });

    it("parses invariant violation as FAIL with exact invariant name", () => {
      const stdout =
        "Error: Invariant ResponsiveConsistency is violated.\nThe behavior up to this point is...";
      const verdict = adapter.parseExecutionResult(stdout, "", 1, 300);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toBe(
        "INVARIANT_VIOLATED: ResponsiveConsistency",
      );
    });

    it("parses deadlock as FAIL with explicit diagnostics", () => {
      const stdout =
        "Error: Deadlock reached.\nThe behavior up to this point is...";
      const verdict = adapter.parseExecutionResult(stdout, "", 1, 200);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toContain("DEADLOCK_REACHED");
    });

    it("parses successful model check and extracts state metrics", () => {
      const stdout =
        "Model checking completed. No error has been found.\n34273 states generated, 11921 distinct states found, 0 states left on queue.\nThe depth of the complete state graph search is 10.";
      const verdict = adapter.parseExecutionResult(stdout, "", 0, 1500);
      expect(verdict.status).toBe("PASS");
      expect(verdict.metadata?.distinctStates).toBe(11921);
      expect(verdict.metadata?.totalStates).toBe(34273);
      expect(verdict.metadata?.depth).toBe(10);
    });

    it("returns BLOCKED if model configuration file is missing", () => {
      const receipt = adapter.execute(
        { id: "inv-2", approvedArgs: [] },
        dummyProvenance,
        dummyLinkage,
        [{ path: "specs/tla/MissingModel.tla", sha256: "" }],
      );
      expect(receipt.status).toBe("BLOCKED");
      expect(receipt.diagnostics).toContain("missing");
    });
  });

  describe("3. Bend 2 Adapter (Bend2Adapter)", () => {
    const adapter = new Bend2Adapter();

    it("identifies correct tool name and pinned version", () => {
      expect(adapter.tool.name).toBe("bend2");
      expect(adapter.tool.version).toBe("2.0.40");
    });

    it("parses exact Lean-backed kernel check marker 'ALL PROOFS CHECK' as PASS", () => {
      const stdout = "ALL PROOFS CHECK\n";
      const verdict = adapter.parseExecutionResult(stdout, "", 0, 400);
      expect(verdict.status).toBe("PASS");
    });

    it("parses incomplete proof terms as FAIL", () => {
      const stdout = "Incomplete proof for Law 4: refund_le_total\n";
      const verdict = adapter.parseExecutionResult(stdout, "", 1, 200);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toContain("INCOMPLETE_BEND_PROOF");
    });

    it("rejects missing specification with BLOCKED status", () => {
      const receipt = adapter.execute(
        { id: "inv-3", approvedArgs: [] },
        dummyProvenance,
        dummyLinkage,
        [{ path: "specs/bend/NON_EXISTENT.bend", sha256: "abcd" }],
      );
      expect(receipt.status).toBe("BLOCKED");
    });
  });

  describe("4. Bombadil DOM Exploration Adapter (BombadilAdapter)", () => {
    const adapter = new BombadilAdapter();

    it("identifies correct tool name", () => {
      expect(adapter.tool.name).toBe("bombadil");
    });

    it("parses horizontal overflow (>100vw) as FAIL", () => {
      const stdout =
        "[bombadil] HORIZONTAL_OVERFLOW detected at 320px viewport";
      const verdict = adapter.parseExecutionResult(stdout, "", 1, 500);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toContain("HORIZONTAL_OVERFLOW");
    });

    it("parses zero violations across viewports as PASS", () => {
      const stdout =
        "[bombadil] ✓ All viewports passed with 0 property violations. Traces saved in docs/verification-evidence/bombadil/traces/";
      const verdict = adapter.parseExecutionResult(stdout, "", 0, 20000);
      expect(verdict.status).toBe("PASS");
    });
  });

  describe("5. Vitest & Fast-Check Adapter (VitestAdapter)", () => {
    const adapter = new VitestAdapter();

    it("parses fast-check shrunk counterexample as FAIL with counterexample string", () => {
      const stdout =
        "Property failed after 42 tests\nCounterexample: [ { amount_minor: -100 } ]";
      const verdict = adapter.parseExecutionResult(stdout, "", 1, 800);
      expect(verdict.status).toBe("FAIL");
      expect(verdict.diagnostics).toContain("PROPERTY_COUNTEREXAMPLE");
      expect(verdict.diagnostics).toContain("-100");
    });

    it("parses standard vitest test pass as PASS", () => {
      const stdout = "Test Files 10 passed (10)\nTests 138 passed (138)";
      const verdict = adapter.parseExecutionResult(stdout, "", 0, 3000);
      expect(verdict.status).toBe("PASS");
    });
  });

  describe("6. Unified Adapter Factory (getAdapterForTool)", () => {
    it("instantiates correct adapter for all supported tool names", () => {
      expect(getAdapterForTool("lean4")).toBeInstanceOf(Lean4Adapter);
      expect(getAdapterForTool("tlc")).toBeInstanceOf(TlaAdapter);
      expect(getAdapterForTool("bend2")).toBeInstanceOf(Bend2Adapter);
      expect(getAdapterForTool("bombadil")).toBeInstanceOf(BombadilAdapter);
      expect(getAdapterForTool("vitest")).toBeInstanceOf(VitestAdapter);
      expect(getAdapterForTool("fast-check")).toBeInstanceOf(VitestAdapter);
    });
  });

  describe("7. Subprocess Security & Containment", () => {
    const adapter = new Lean4Adapter({
      toolDiscovery: () => "/mock/bin/lake",
      execFn: () => "Lake version 4.15.0",
    });

    it("rejects untrusted executable path outside approved allowlist", () => {
      expect(() => {
        adapter.execute(
          { id: "inv-sec-1", approvedArgs: [], executable: "/bin/bash" },
          dummyProvenance,
          dummyLinkage,
          [{ path: "specs/lean/lakefile.lean", sha256: "" }],
        );
      }).toThrow(/Disallowed executable/);
    });

    it("rejects shell metacharacters in executable path", () => {
      expect(() => {
        adapter.execute(
          { id: "inv-sec-2", approvedArgs: [], executable: "lake; rm -rf /" },
          dummyProvenance,
          dummyLinkage,
          [{ path: "specs/lean/lakefile.lean", sha256: "" }],
        );
      }).toThrow(/Disallowed shell metacharacter/);
    });

    it("rejects working directory path traversal outside repository root", () => {
      expect(() => {
        adapter.execute(
          { id: "inv-sec-3", approvedArgs: [], cwd: "/etc" },
          dummyProvenance,
          dummyLinkage,
          [{ path: "specs/lean/lakefile.lean", sha256: "" }],
        );
      }).toThrow(/Disallowed working directory outside repo root/);
    });

    it("rejects dangerous environment variables such as LD_PRELOAD", () => {
      expect(() => {
        adapter.execute(
          {
            id: "inv-sec-4",
            approvedArgs: [],
            env: { LD_PRELOAD: "/tmp/evil.so" },
          },
          dummyProvenance,
          dummyLinkage,
          [{ path: "specs/lean/lakefile.lean", sha256: "" }],
        );
      }).toThrow(/Forbidden environment variable in invocation: LD_PRELOAD/);
    });

    it("rejects non-string argument injection", () => {
      expect(() => {
        adapter.execute(
          {
            id: "inv-sec-5",
            approvedArgs: ["build", 123 as unknown as string],
          },
          dummyProvenance,
          dummyLinkage,
          [{ path: "specs/lean/lakefile.lean", sha256: "" }],
        );
      }).toThrow(/Every argument must be a string/);
    });
  });
});
