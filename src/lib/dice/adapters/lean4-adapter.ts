/**
 * Lean 4 Formal Verification Adapter
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section 3.1 & 8.3
 */

import { execFileSync } from "node:child_process"; // sast-allow: shell-exec -- sanitized allowlisted deterministic adapter execution
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  type DiceAdapter,
  type DiceAdapterToolInfo,
  type AdapterEnvironment,
  type AdapterInvocation,
  type AdapterProvenance,
  type AdapterLinkage,
  type AdapterSpecification,
  type AdapterVerdict,
  type DiceExecutionReceipt,
  validateExecutable,
  validateCwd,
  sanitizeEnv,
  boundedTimeout,
  validateArgs,
} from "./types.js";

export interface Lean4AdapterOptions {
  repoRoot?: string;
  toolVersion?: string;
  binaryPath?: string;
  toolDiscovery?: () => string | null;
  execFn?: (
    file: string,
    args: readonly string[],
    options: Record<string, unknown>,
  ) => string;
}

export class Lean4Adapter implements DiceAdapter {
  readonly tool: DiceAdapterToolInfo;
  readonly environment: AdapterEnvironment;
  private readonly repoRoot: string;
  private readonly toolDiscovery?: () => string | null;
  private readonly execFn: (
    file: string,
    args: readonly string[],
    options: Record<string, unknown>,
  ) => string;

  constructor(options: Lean4AdapterOptions = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.toolDiscovery = options.toolDiscovery;
    this.execFn =
      options.execFn ||
      ((bin, args, opts) =>
        String(execFileSync(bin, args as string[], { ...opts, shell: false }))); // sast-allow: shell-exec -- sanitized allowlisted deterministic adapter execution
    const binary =
      options.binaryPath ||
      (this.toolDiscovery ? this.toolDiscovery() : this.findLakeBinary());
    this.tool = {
      name: "lean4",
      version: options.toolVersion || "v4.15.0",
      binaryPath: binary || undefined,
      binaryHash:
        binary && existsSync(binary)
          ? createHash("sha256").update(readFileSync(binary)).digest("hex")
          : undefined,
    };
    this.environment = {
      requiredBinaries: ["lake", "lean"],
      requiredEnvVars: ["PATH"],
      platform: "any",
    };
  }

  private findLakeBinary(): string | null {
    const candidates = [
      join(process.env.HOME || "", ".elan/bin/lake"),
      "/usr/local/bin/lake",
      "/usr/bin/lake",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return null;
  }

  validateEnvironment(): {
    status: "OK" | "BLOCKED";
    code?: string;
    reason?: string;
  } {
    const binary = this.toolDiscovery
      ? this.toolDiscovery()
      : this.tool.binaryPath || this.findLakeBinary();
    if (!binary) {
      return {
        status: "BLOCKED",
        code: "TOOLCHAIN_UNAVAILABLE",
        reason: "TOOLCHAIN_UNAVAILABLE: Lake binary unavailable",
      };
    }
    try {
      const out = this.execFn(binary, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!out.includes("Lake version") && !out.includes("Lean")) {
        return {
          status: "BLOCKED",
          code: "TOOLCHAIN_UNAVAILABLE",
          reason: `TOOLCHAIN_UNAVAILABLE: Unexpected lake version output: ${out.trim()}`,
        };
      }
      return { status: "OK" };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "BLOCKED",
        code: "TOOLCHAIN_UNAVAILABLE",
        reason: `TOOLCHAIN_UNAVAILABLE: Lake binary unavailable: ${message}`,
      };
    }
  }

  validateSpecifications(specs: readonly AdapterSpecification[]): {
    status: "OK" | "BLOCKED";
    code?: string;
    reason?: string;
  } {
    for (const spec of specs) {
      const full = join(this.repoRoot, spec.path);
      if (!existsSync(full)) {
        return {
          status: "BLOCKED",
          code: "SPECIFICATION_MISSING",
          reason: `SPECIFICATION_MISSING: Required Lean specification missing: ${spec.path}`,
        };
      }
      const actualHash = createHash("sha256")
        .update(readFileSync(full))
        .digest("hex");
      if (spec.sha256 && actualHash !== spec.sha256) {
        return {
          status: "BLOCKED",
          code: "SPECIFICATION_HASH_MISMATCH",
          reason: `SPECIFICATION_HASH_MISMATCH: Specification hash mismatch for ${spec.path}: expected ${spec.sha256}, got ${actualHash}`,
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
    // Audit for disallowed axioms and cheating tactics
    if (
      rawStdout.includes("sorryAx") ||
      rawStderr.includes("sorryAx") ||
      rawStdout.includes("sorry") ||
      rawStderr.includes("sorry")
    ) {
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics:
          "REJECTED_UNAPPROVED_AXIOM: Lean sorryAx / sorry cheat detected",
      };
    }

    if (rawStdout.includes("error:") || rawStderr.includes("error:")) {
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics: "LEAN_COMPILATION_ERROR: Proof failed to typecheck",
      };
    }

    const hasSuccessMarker =
      rawStdout.includes("Build completed successfully") ||
      rawStdout.includes("Formal verification gate PASSED") ||
      rawStdout.includes("ALL PROVEN") ||
      rawStdout.includes("Zero discrepancies detected") ||
      (exitCode === 0 && !rawStderr.includes("error"));

    if (exitCode === 0 && hasSuccessMarker) {
      return {
        status: "PASS",
        exitCode: 0,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
      };
    }

    return {
      status: "FAIL",
      exitCode: exitCode !== 0 ? exitCode : 1,
      durationMs,
      stdout: rawStdout,
      stderr: rawStderr,
      diagnostics: `Execution exited with code ${exitCode}`,
    };
  }

  execute(
    invocation: AdapterInvocation,
    provenance: AdapterProvenance,
    linkage: AdapterLinkage,
    specs: readonly AdapterSpecification[] = [],
  ): DiceExecutionReceipt {
    const specCheck = this.validateSpecifications(specs);
    if (specCheck.status === "BLOCKED") {
      return this.createReceipt(
        "BLOCKED",
        127,
        0,
        specCheck.reason,
        invocation,
        provenance,
        linkage,
        specs,
        {},
      );
    }

    const envCheck = this.validateEnvironment();
    if (envCheck.status === "BLOCKED") {
      return this.createReceipt(
        "BLOCKED",
        126,
        0,
        envCheck.reason,
        invocation,
        provenance,
        linkage,
        specs,
        {},
      );
    }

    const rawBinary = invocation.executable || this.tool.binaryPath || "lake";
    const binary = validateExecutable(rawBinary, ["lake", "lean"]);
    const safeCwd = validateCwd(
      invocation.cwd || join(this.repoRoot, "specs/lean"),
      this.repoRoot,
    );
    const safeTimeout = boundedTimeout(invocation.timeoutMs, 300000, 120000);
    const rawArgs = invocation.approvedArgs
      ? [...invocation.approvedArgs]
      : ["build"];
    const safeArgs = validateArgs(rawArgs);
    const safeEnv = sanitizeEnv(invocation.env);
    safeEnv.PATH = `${join(process.env.HOME || "", ".elan/bin")}:${safeEnv.PATH || process.env.PATH || ""}`;

    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      stdout = this.execFn(binary, safeArgs, {
        cwd: safeCwd,
        env: safeEnv,
        encoding: "utf8",
        timeout: safeTimeout,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      const procErr = err as {
        status?: number;
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        message?: string;
      };
      exitCode = procErr.status || 1;
      stdout = procErr.stdout?.toString() || "";
      stderr = procErr.stderr?.toString() || procErr.message || String(err);
    }

    const durationMs = Date.now() - start;
    const verdict = this.parseExecutionResult(
      stdout,
      stderr,
      exitCode,
      durationMs,
    );

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
      receipt_id: `rec-lean4-${linkage.obligationId}-${Date.now()}`,
      obligation_id: linkage.obligationId,
      method_id: linkage.methodId,
      tool: this.tool,
      invocation: {
        id: invocation.id,
        command: [
          invocation.executable || this.tool.binaryPath || "lake",
          ...(invocation.approvedArgs || []),
        ],
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
