/**
 * Bombadil Property-Based Browser & UI Exploration Adapter
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section 3.4 & 8.5
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

export class BombadilAdapter implements DiceAdapter {
  readonly tool: DiceAdapterToolInfo;
  readonly environment: AdapterEnvironment;
  private readonly repoRoot: string;

  constructor(options: { repoRoot?: string; toolVersion?: string; binaryPath?: string } = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.tool = {
      name: "bombadil",
      version: options.toolVersion || "0.4.2",
      binaryPath: options.binaryPath || "node",
    };
    this.environment = {
      requiredBinaries: ["node"],
      requiredEnvVars: ["PATH"],
      platform: "any",
    };
  }

  validateEnvironment(): { status: "OK" | "BLOCKED"; reason?: string } {
    const runnerPath = join(this.repoRoot, "bombadil/runner.mjs");
    if (!existsSync(runnerPath)) {
      return { status: "BLOCKED", reason: `Bombadil runner missing at ${runnerPath}` };
    }
    return { status: "OK" };
  }

  validateSpecifications(specs: readonly AdapterSpecification[]): { status: "OK" | "BLOCKED"; reason?: string } {
    const specPath = join(this.repoRoot, "bombadil/specification.ts");
    if (!existsSync(specPath)) {
      return { status: "BLOCKED", reason: `Required Bombadil specification missing: bombadil/specification.ts` };
    }
    for (const spec of specs) {
      const full = join(this.repoRoot, spec.path);
      if (!existsSync(full)) {
        return { status: "BLOCKED", reason: `Required specification missing: ${spec.path}` };
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

    if (combined.includes("HORIZONTAL_OVERFLOW") || combined.includes("horizontal_overflow") || combined.includes("Viewport layout blowout")) {
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics: "DOM_INVARIANT_VIOLATION: HORIZONTAL_OVERFLOW detected (>100vw)",
      };
    }

    if (combined.includes("PROPERTY_VIOLATION") || combined.includes("UncaughtException") || combined.includes("image failures")) {
      const match = combined.match(/([A-Z0-9_]+_VIOLATION)/);
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics: match ? match[1] : "DOM_INVARIANT_VIOLATION",
      };
    }

    if (combined.includes("All viewports passed with 0 property violations") || combined.includes("passed with 0 violations")) {
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
      diagnostics: exitCode !== 0 ? `Bombadil runner exited with code ${exitCode}` : undefined,
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
      const runner = join(this.repoRoot, "bombadil/runner.mjs");
      const args = invocation.approvedArgs ? [...invocation.approvedArgs] : [runner];
      stdout = execFileSync(invocation.executable || "node", args, {
        cwd: invocation.cwd || this.repoRoot,
        env: { ...process.env, ...(invocation.env || {}) },
        encoding: "utf8",
        timeout: invocation.timeoutMs || 240000,
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
      receipt_id: `rec-bombadil-${linkage.obligationId}-${Date.now()}`,
      obligation_id: linkage.obligationId,
      method_id: linkage.methodId,
      tool: this.tool,
      invocation: {
        id: invocation.id,
        command: [invocation.executable || "node", ...(invocation.approvedArgs || [])],
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
