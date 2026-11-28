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
  extractDiagnosticBaselineFromContract,
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
        errorCount: 0,
        warningCount: 1,
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
        errorCount: 1,
        warningCount: 0,
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
        errorCount: 2,
        warningCount: 0,
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
        errorCount: 0,
        warningCount: 1,
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
        errorCount: 0,
        warningCount: 2,
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
        errorCount: 1,
        warningCount: 0,
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
        errorCount: 1,
        warningCount: 0,
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
        errorCount: 1,
        warningCount: 0,
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
        errorCount: 1,
        warningCount: 0,
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
        errorCount: 1,
        warningCount: 0,
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
        errorCount: 1,
        warningCount: 0,
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

  // Stage 5.2.1 Tests:
  // 1. Baseline resolution
  it("Stage 5.2.1.1: returns BLOCK when baseline commit is removed or missing from contract", async () => {
    const contractWithoutBaseline = join(tmpRoot, "contract-no-baseline.json");
    writeFileSync(
      contractWithoutBaseline,
      JSON.stringify({
        feature_id: "F30-TEST",
        required_acceptance: [
          "Some unrelated acceptance rule without diagnostic baseline",
        ],
      }),
    );

    const report = await runDifferentialComparison({
      contractPath: contractWithoutBaseline,
      repoRoot: tmpRoot,
    });
    expect(report.finalDisposition).toBe("BLOCK");
    expect(report.error).toContain("No diagnostic baseline commit found");
    expect(report.exitCode).toBe(1);
  });

  // 2. ESLint severity comparison
  it("Stage 5.2.1.2a: returns BLOCK when warning changes to error (same identity)", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        errorCount: 0,
        warningCount: 1,
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "react-hooks/exhaustive-deps",
            message: "Missing dep",
            severity: 1, // warning
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        errorCount: 1,
        warningCount: 0,
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "react-hooks/exhaustive-deps",
            message: "Missing dep",
            severity: 2, // error
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
    expect(result.details.changedItems[0].type).toBe("changed_severity");
    expect(result.details.changedItems[0].baseline.severity).toBe("warning");
    expect(result.details.changedItems[0].candidate.severity).toBe("error");
  });

  it("Stage 5.2.1.2b: returns BLOCK when error changes to warning (same identity)", () => {
    const baseline = [
      {
        filePath: "/repo/src/routes/a.tsx",
        errorCount: 1,
        warningCount: 0,
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "prettier/prettier",
            message: "Insert `;`",
            severity: 2, // error
          },
        ],
      },
    ];
    const candidate = [
      {
        filePath: "/repo/src/routes/a.tsx",
        errorCount: 0,
        warningCount: 1,
        messages: [
          {
            line: 10,
            column: 5,
            ruleId: "prettier/prettier",
            message: "Insert `;`",
            severity: 1, // warning
          },
        ],
      },
    ];

    const bDiags = parseEslintDiagnostics(JSON.stringify(baseline), "/repo");
    const cDiags = parseEslintDiagnostics(JSON.stringify(candidate), "/repo");

    const result = compareDiagnosticMultisets(bDiags, cDiags);
    expect(result.disposition).toBe("BLOCK");
    expect(result.changedCount).toBe(1);
    expect(result.details.changedItems[0].type).toBe("changed_severity");
    expect(result.details.changedItems[0].baseline.severity).toBe("error");
    expect(result.details.changedItems[0].candidate.severity).toBe("warning");
  });

  // 3. Strict ESLint parsing
  it("Stage 5.2.1.3: strictly validates ESLint entries, messages array, severity, and totals", () => {
    // Missing/invalid file entry
    expect(() =>
      parseEslintDiagnostics(JSON.stringify([null]), "/repo"),
    ).toThrow(/file entry at index 0 is not a valid file object/);
    expect(() =>
      parseEslintDiagnostics(JSON.stringify([{ filePath: "" }]), "/repo"),
    ).toThrow(/file entry at index 0 is not a valid file object/);

    // Missing messages array
    expect(() =>
      parseEslintDiagnostics(JSON.stringify([{ filePath: "a.ts" }]), "/repo"),
    ).toThrow(/messages property for a\.ts is not an array/);

    // Malformed message object
    expect(() =>
      parseEslintDiagnostics(
        JSON.stringify([{ filePath: "a.ts", messages: [null] }]),
        "/repo",
      ),
    ).toThrow(/message at index 0 in a\.ts is not an object/);

    // Invalid severity
    expect(() =>
      parseEslintDiagnostics(
        JSON.stringify([
          {
            filePath: "a.ts",
            messages: [{ message: "foo", severity: 3 }],
          },
        ]),
        "/repo",
      ),
    ).toThrow(/invalid severity 3/);

    // Missing errorCount
    expect(() =>
      parseEslintDiagnostics(
        JSON.stringify([
          {
            filePath: "a.ts",
            messages: [{ message: "err", severity: 2 }],
            warningCount: 0,
          },
        ]),
        "/repo",
      ),
    ).toThrow(/missing or non-integer errorCount for a\.ts/);

    // Missing warningCount
    expect(() =>
      parseEslintDiagnostics(
        JSON.stringify([
          {
            filePath: "a.ts",
            messages: [{ message: "warn", severity: 1 }],
            errorCount: 0,
          },
        ]),
        "/repo",
      ),
    ).toThrow(/missing or non-integer warningCount for a\.ts/);

    // Error count mismatch
    expect(() =>
      parseEslintDiagnostics(
        JSON.stringify([
          {
            filePath: "a.ts",
            messages: [{ message: "err", severity: 2 }],
            errorCount: 0, // reported 0 but parsed 1
            warningCount: 0,
          },
        ]),
        "/repo",
      ),
    ).toThrow(/errorCount mismatch for a\.ts/);

    // Warning count mismatch
    expect(() =>
      parseEslintDiagnostics(
        JSON.stringify([
          {
            filePath: "a.ts",
            messages: [{ message: "warn", severity: 1 }],
            errorCount: 0,
            warningCount: 0, // reported 0 but parsed 1
          },
        ]),
        "/repo",
      ),
    ).toThrow(/warningCount mismatch for a\.ts/);
  });

  // 4. TypeScript scanner exit status (partial output plus exit 139)
  it("Stage 5.2.1.4: rejects partial TypeScript output with abnormal exit 139 with BLOCK", () => {
    const partialOutput =
      "src/routes/search.tsx(548,25): error TS2339: Property 'tokens' does not exist on type '{}'.\n" +
      "Fatal signal 11 (SIGSEGV)";

    expect(() =>
      parseTypeScriptDiagnostics(partialOutput, "", "/repo", 139),
    ).toThrow(/Abnormal TypeScript compiler exit status: exit code 139/);
  });

  // Stage 5.3.1: Output-completeness condition for TypeScript reported diagnostic totals
  it("Stage 5.3.1: rejects incomplete TypeScript output when reported total exceeds parsed diagnostics", () => {
    const partialOutput =
      "src/routes/search.tsx(548,25): error TS2339: Property 'tokens' does not exist on type '{}'.\n" +
      "\n" +
      "Found 5 errors in 2 files.";

    expect(() =>
      parseTypeScriptDiagnostics(partialOutput, "", "/repo", 1),
    ).toThrow(
      /Incomplete diagnostic output: TypeScript compiler reported 5 errors, but 1 diagnostics were parsed/,
    );
  });

  // 5. Candidate identity: rejects dirty working tree when candidate SHA is inferred
  it("Stage 5.2.1.5: rejects dirty working tree with BLOCK when candidate SHA is inferred", async () => {
    // Create an isolated git repo with an uncommitted file
    const dirtyRepo = join(tmpRoot, "dirty-git-repo");
    mkdirSync(dirtyRepo, { recursive: true });

    const report = await runDifferentialComparison({
      baselineDir,
      candidateDir,
      repoRoot: dirtyRepo,
      candidateSha: null, // trigger inference from repoRoot
      skipGitVerify: true,
    });

    expect(report.finalDisposition).toBe("BLOCK");
    expect(report.exitCode).toBe(1);
  });
});
