/**
 * Vitest & Fast-Check Property Testing Adapter
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section 8.1
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  DiceAdapter,
  DiceAdapterToolInfo,
  AdapterEnvironment,
  AdapterInvocation,
  AdapterProvenance,
  AdapterLinkage,
  AdapterSpecification,
  AdapterVerdict,
  DiceExecutionReceipt,
} from "./types.js";

export class VitestAdapter implements DiceAdapter {
  readonly tool: DiceAdapterToolInfo;
  readonly environment: AdapterEnvironment;
  private readonly repoRoot: string;

  constructor(options: { repoRoot?: string; toolVersion?: string; isFastCheck?: boolean } = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.tool = {
      name: options.isFastCheck ? "fast-check" : "vitest",
      version: options.toolVersion || "4.1.11",
      binaryPath: "bunx",
    };
    this.environment = {
      requiredBinaries: ["bun", "bunx"],
      requiredEnvVars: ["PATH"],
      platform: "any",
    };
  }

  validateEnvironment(): { status: "OK" | "BLOCKED"; reason?: string } {
    return { status: "OK" };
  }

  validateSpecifications(specs: readonly AdapterSpecification[]): { status: "OK" | "BLOCKED"; reason?: string } {
    for (const spec of specs) {
      const full = join(this.repoRoot, spec.path);
      if (!existsSync(full)) {
        return { status: "BLOCKED", reason: `Required test suite file missing: ${spec.path}` };
      }
      const actualHash = createHash("sha256").update(readFileSync(full)).digest("hex");
      if (spec.sha256 && actualHash !== spec.sha256) {
        return {
          status: "BLOCKED",
          reason: `Specification hash mismatch for ${spec.path}: expected ${spec.sha256}, got ${actualHash}`,
        };
      }
    }
    return { status: "OK" };
  }

  parseExecutionResult(
    rawStdout: string,
    rawStderr: string,
    exitCode: number,
    durationMs: number,
  ): AdapterVerdict {
    const combined = `${rawStdout}\n${rawStderr}`;

    // Fast-check shrunk counterexample detection
    if (combined.includes("Property failed after") || combined.includes("Counterexample:")) {
      const match = combined.match(/Counterexample:\s*(.+)/);
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics: `PROPERTY_COUNTEREXAMPLE: ${match ? match[1].trim() : "Failed property invariant"}`,
      };
    }

    if (combined.includes("FAIL ") || exitCode !== 0) {
      const failMatch = combined.match(/FAIL\s+([^\n]+)/);
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics: failMatch ? failMatch[1].trim() : "One or more tests failed",
      };
    }

    if (combined.includes("pass") || combined.includes("passed")) {
      return {
        status: "PASS",
        exitCode: 0,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
      };
    }

    return {
      status: exitCode === 0 ? "PASS" : "FAIL",
      exitCode,
      durationMs,
      stdout: rawStdout,
      stderr: rawStderr,
    };
  }

  execute(
    invocation: AdapterInvocation,
    provenance: AdapterProvenance,
    linkage: AdapterLinkage,
    specs: readonly AdapterSpecification[] = [],
  ): DiceExecutionReceipt {
    const envCheck = this.validateEnvironment();
    if (envCheck.status === "BLOCKED") {
      return this.createReceipt("BLOCKED", 126, 0, envCheck.reason, invocation, provenance, linkage, specs, {});
    }

    const specCheck = this.validateSpecifications(specs);
    if (specCheck.status === "BLOCKED") {
      return this.createReceipt("BLOCKED", 127, 0, specCheck.reason, invocation, provenance, linkage, specs, {});
    }

    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const bin = invocation.executable || "bunx";
      const args = invocation.approvedArgs ? [...invocation.approvedArgs] : ["vitest", "run"];
      stdout = execFileSync(bin, args, {
        cwd: invocation.cwd || this.repoRoot,
        env: { ...process.env, ...(invocation.env || {}) },
        encoding: "utf8",
        timeout: invocation.timeoutMs || 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err: any) {
      exitCode = err.status || 1;
      stdout = err.stdout?.toString() || "";
      stderr = err.stderr?.toString() || err.message;
    }

    const durationMs = Date.now() - start;
    const verdict = this.parseExecutionResult(stdout, stderr, exitCode, durationMs);

    return this.createReceipt(
      verdict.status,
      verdict.exitCode,
      durationMs,
      verdict.diagnostics,
      invocation,
      provenance,
      linkage,
      specs,
      verdict.artifacts || {},
    );
  }

  private createReceipt(
    status: "PASS" | "FAIL" | "BLOCKED",
    exitCode: number,
    durationMs: number,
    diagnostics: string | undefined,
    invocation: AdapterInvocation,
    provenance: AdapterProvenance,
    linkage: AdapterLinkage,
    specs: readonly AdapterSpecification[],
    artifacts: Record<string, string>,
  ): DiceExecutionReceipt {
    return {
      schema_version: "2.3.0",
      receipt_version: 1,
      receipt_id: `rec-vitest-${linkage.obligationId}-${Date.now()}`,
      obligation_id: linkage.obligationId,
      method_id: linkage.methodId,
      tool: this.tool,
      invocation: {
        id: invocation.id,
        command: [invocation.executable || "bunx", ...(invocation.approvedArgs || [])],
      },
      specifications: specs,
      provenance,
      linkage,
      status,
      exit_code: exitCode,
      duration_ms: durationMs,
      diagnostics,
      artifacts,
      timestamp: new Date().toISOString(),
    };
  }
}
