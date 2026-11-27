import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseEslintDiagnostics,
  parseTypeScriptDiagnostics,
  compareDiagnosticMultisets,
  verifyExecutionConditions,
  runDifferentialComparison,
  DEFAULT_DIAGNOSTIC_BASELINE_SHA,
} from "../../../scripts/dice-baseline-differential.mjs";

describe("DICE Baseline-Differential Static Gates (Stage 5.2 Option A)", () => {
  let tmpRoot: string;
  let baselineDir: string;
  let candidateDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "dice-baseline-test-"));
    baselineDir = join(tmpRoot, "baseline");
    candidateDir = join(tmpRoot, "candidate");
    mkdirSync(baselineDir, { recursive: true });
    mkdirSync(candidateDir, { recursive: true });

    // Seed minimal matching configuration in both
    writeFileSync(join(baselineDir, "bun.lock"), "lockfile-content-v1");
    writeFileSync(join(candidateDir, "bun.lock"), "lockfile-content-v1");

    writeFileSync(join(baselineDir, "eslint.config.js"), "export default [];");
    writeFileSync(join(candidateDir, "eslint.config.js"), "export default [];");

    writeFileSync(join(baselineDir, "tsconfig.json"), '{"compilerOptions":{}}');
    writeFileSync(
      join(candidateDir, "tsconfig.json"),
      '{"compilerOptions":{}}',
    );

    const pkgJson = JSON.stringify({
      scripts: {
        lint: "eslint .",
        typecheck: "tsgo --noEmit",
      },
      devDependencies: {
        eslint: "^9.0.0",
        typescript: "^5.6.0",
      },
    });
    writeFileSync(join(baselineDir, "package.json"), pkgJson);
    writeFileSync(join(candidateDir, "package.json"), pkgJson);
  });

  afterEach(() => {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch (err) {
      void err;
    }
  });

  // Case 1: Identical baseline and candidate diagnostics
  it("Case 1: returns BASELINE-CONFORMANT for identical baseline and candidate diagnostics (never PASS)", () => {
    const baselineEslint = [
      {
        filePath: "/repo/src/routes/search.tsx",
        messages: [
          {
            line: 548,
            column: 25,
            ruleId: "react-hooks/exhaustive-deps",
            message: "Missing dependency 'tokens'",
            severity: 1,
          },
        ],
      },
    ];
    const bDiags = parseEslintDiagnostics(
      JSON.stringify(baselineEslint),
      "/repo",
    );
    const cDiags = parseEslintDiagnostics(
      JSON.stringify(baselineEslint),
      "/repo",
    );

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BASELINE-CONFORMANT");
    expect(result.disposition).not.toBe("PASS");
    expect(result.newCount).toBe(0);
    expect(result.changedCount).toBe(0);
    expect(result.removedCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
  });

  // Case 2: Removed diagnostic
  it("Case 2: returns PERMITTED when existing diagnostics are removed", () => {
    const baselineTs =
      "src/routes/search.tsx(548,25): error TS2339: Property 'tokens' does not exist on type '{}'.\n" +
      "src/routes/cart.tsx(89,10): error TS2339: Property 'cart' does not exist on type '{}'.";
    const candidateTs =
      "src/routes/search.tsx(548,25): error TS2339: Property 'tokens' does not exist on type '{}'.";

    const bDiags = parseTypeScriptDiagnostics(baselineTs, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidateTs, "", "/repo", 1);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("PERMITTED");
    expect(result.removedCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.changedCount).toBe(0);
  });

  // Case 3: New ESLint error
  it("Case 3: returns BLOCK when a new ESLint error is introduced", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "msg a",
            severity: 2,
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "msg a",
            severity: 2,
          },
          {
            line: 20,
            column: 1,
            ruleId: "rule-b",
            message: "new error b",
            severity: 2,
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.newCount).toBe(1);
  });

  // Case 4: New ESLint warning
  it("Case 4: returns BLOCK when a new ESLint warning is introduced (warnings preserved)", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "msg a",
            severity: 1,
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "msg a",
            severity: 1,
          },
          {
            line: 30,
            column: 8,
            ruleId: "rule-warn",
            message: "new warning",
            severity: 1,
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.newCount).toBe(1);
  });

  // Case 5: Changed ESLint rule
  it("Case 5: returns BLOCK when an existing ESLint rule changes", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-old",
            message: "common message",
            severity: 2,
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-new",
            message: "common message",
            severity: 2,
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
  });

  // Case 6: Changed ESLint message
  it("Case 6: returns BLOCK when an existing ESLint message changes", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "original message",
            severity: 2,
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "modified message",
            severity: 2,
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
  });

  // Case 7: Changed ESLint line/column
  it("Case 7: returns BLOCK when an existing ESLint line/column changes", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "rule-a",
            message: "message a",
            severity: 2,
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        messages: [
          {
            line: 15,
            column: 12,
            ruleId: "rule-a",
            message: "message a",
            severity: 2,
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
  });

  // Case 8: New TypeScript diagnostic
  it("Case 8: returns BLOCK when a new TypeScript diagnostic is introduced", () => {
    const baseline =
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist.";
    const candidate =
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist.\n" +
      "src/routes/b.tsx(20,1): error TS2322: Type 'string' is not assignable to type 'number'.";

    const bDiags = parseTypeScriptDiagnostics(baseline, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidate, "", "/repo", 1);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.newCount).toBe(1);
  });

  // Case 9: Changed TypeScript diagnostic code
  it("Case 9: returns BLOCK when an existing TypeScript diagnostic code changes", () => {
    const baseline =
      "src/routes/a.tsx(10,5): error TS2339: Type error description.";
    const candidate =
      "src/routes/a.tsx(10,5): error TS2322: Type error description.";

    const bDiags = parseTypeScriptDiagnostics(baseline, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidate, "", "/repo", 1);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
  });

  // Case 10: Changed TypeScript message
  it("Case 10: returns BLOCK when an existing TypeScript message changes", () => {
    const baseline =
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist on type '{}'.";
    const candidate =
      "src/routes/a.tsx(10,5): error TS2339: Property 'bar' does not exist on type '{}'.";

    const bDiags = parseTypeScriptDiagnostics(baseline, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidate, "", "/repo", 1);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
  });

  // Case 11: Changed TypeScript line/column
  it("Case 11: returns BLOCK when an existing TypeScript line/column changes", () => {
    const baseline =
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist on type '{}'.";
    const candidate =
      "src/routes/a.tsx(14,20): error TS2339: Property 'foo' does not exist on type '{}'.";

    const bDiags = parseTypeScriptDiagnostics(baseline, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidate, "", "/repo", 1);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
  });

  // Case 12: Duplicate diagnostic
  it("Case 12: returns BLOCK when duplicate diagnostic is introduced", () => {
    const baseline =
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist on type '{}'.";
    const candidate =
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist on type '{}'.\n" +
      "src/routes/a.tsx(10,5): error TS2339: Property 'foo' does not exist on type '{}'.";

    const bDiags = parseTypeScriptDiagnostics(baseline, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidate, "", "/repo", 1);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.duplicateCount).toBe(1);
    expect(result.newCount).toBe(1);
  });

  // Case 13: Scanner exits with an infrastructure error
  it("Case 13: returns BLOCK when scanner exits with an infrastructure error", async () => {
    const report = await runDifferentialComparison({
      baselineDir,
      candidateDir,
      skipGitVerify: true,
      baselineEslintOutput: JSON.stringify([]),
      candidateEslintOutput: JSON.stringify([]),
      baselineTsOutput: {
        stdout: "",
        stderr: "Segmentation fault",
        exitCode: 139,
      },
      candidateTsOutput: { stdout: "", stderr: "", exitCode: 0 },
    });

    expect(report.finalDisposition).toBe("BLOCK");
    expect(report.exitCode).toBe(1);
  });

  // Case 14: Baseline commit missing
  it("Case 14: returns BLOCK when baseline commit is missing from git history", async () => {
    const missingSha = "0000000000000000000000000000000000000000";
    const report = await runDifferentialComparison({
      baselineSha: missingSha,
      skipGitVerify: false,
    });

    expect(report.finalDisposition).toBe("BLOCK");
    expect(report.error).toContain("missing from git history");
    expect(report.exitCode).toBe(1);
  });

  // Case 15: Configuration digest mismatch
  it("Case 15: returns BLOCK when ESLint or TypeScript configuration hashes differ", () => {
    // Alter eslint.config.js in candidate
    writeFileSync(
      join(candidateDir, "eslint.config.js"),
      "export default ['tampered'];",
    );

    const cond = verifyExecutionConditions(baselineDir, candidateDir);
    expect(cond.ok).toBe(false);
    expect(
      cond.failures.some((f: string) =>
        f.includes("ESLint configuration mismatch"),
      ),
    ).toBe(true);
  });

  // Case 16: Lockfile mismatch
  it("Case 16: returns BLOCK when bun.lock SHA-256 differs", () => {
    // Alter lockfile in candidate
    writeFileSync(
      join(candidateDir, "bun.lock"),
      "lockfile-different-candidate",
    );

    const cond = verifyExecutionConditions(baselineDir, candidateDir);
    expect(cond.ok).toBe(false);
    expect(
      cond.failures.some((f: string) => f.includes("Lockfile mismatch")),
    ).toBe(true);
  });

  // Case 17: Malformed ESLint JSON
  it("Case 17: rejects malformed ESLint JSON output with BLOCK", () => {
    const malformed = "{ broken json: true";
    expect(() => parseEslintDiagnostics(malformed, "/repo")).toThrow(
      /Malformed ESLint JSON/,
    );
  });

  // Case 18: Unparseable TypeScript output
  it("Case 18: rejects unparseable TypeScript output with BLOCK", () => {
    const garbage = "Fatal internal error: unexpected token at byte 0xdeadbeef";
    expect(() => parseTypeScriptDiagnostics(garbage, "", "/repo", 1)).toThrow(
      /Unparseable TypeScript output/,
    );
  });

  // Case 19: Incomplete diagnostic output
  it("Case 19: rejects incomplete diagnostic output when compiler exits non-zero with 0 diagnostics", () => {
    expect(() => parseTypeScriptDiagnostics("", "", "/repo", 1)).toThrow(
      /Incomplete diagnostic output/,
    );
  });

  // Case 20: Baseline contains errors and candidate removes all of them
  it("Case 20: returns PERMITTED when baseline contains errors and candidate removes all of them", () => {
    const baselineTs =
      "src/routes/a.tsx(10,5): error TS2339: Error 1\n" +
      "src/routes/b.tsx(20,5): error TS2339: Error 2\n" +
      "src/routes/c.tsx(30,5): error TS2339: Error 3\n" +
      "src/routes/d.tsx(40,5): error TS2339: Error 4\n" +
      "src/routes/e.tsx(50,5): error TS2339: Error 5";
    const candidateTs = "";

    const bDiags = parseTypeScriptDiagnostics(baselineTs, "", "/repo", 1);
    const cDiags = parseTypeScriptDiagnostics(candidateTs, "", "/repo", 0);

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("PERMITTED");
    expect(result.baselineCount).toBe(5);
    expect(result.candidateCount).toBe(0);
    expect(result.removedCount).toBe(5);
    expect(result.newCount).toBe(0);
    expect(result.changedCount).toBe(0);
  });

  // Extra verification: Multiline TypeScript message preservation
  it("preserves complete multiline messages in TypeScript diagnostics", () => {
    const tsOutput =
      "src/lib/global-blocks.functions.ts(23,7): error TS2322: Type 'Promise<GlobalBlock[]>' is not assignable to type 'Promise<ValidateSerializableMapped<GlobalBlock, RegisteredSerializableInput<Register>>[]>'.\n" +
      "  Type 'GlobalBlock[]' is not assignable to type 'ValidateSerializableMapped<GlobalBlock, RegisteredSerializableInput<Register>>[]'.\n" +
      "    Type 'GlobalBlock' is not assignable to type 'ValidateSerializableMapped<GlobalBlock, RegisteredSerializableInput<Register>>'.";

    const diags = parseTypeScriptDiagnostics(tsOutput, "", "/repo", 1);
    expect(diags.length).toBe(1);
    expect(diags[0].file).toBe("src/lib/global-blocks.functions.ts");
    expect(diags[0].line).toBe(23);
    expect(diags[0].column).toBe(7);
    expect(diags[0].diagnostic_code).toBe("TS2322");
    expect(diags[0].complete_message).toContain(
      "Type 'GlobalBlock[]' is not assignable",
    );
    expect(diags[0].complete_message).toContain(
      "Type 'GlobalBlock' is not assignable",
    );
  });
});
