/**
 * Bend 2 Executable Laws & Lean-Backed Kernel Adapter
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section 3.3 & 8.4
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

export class Bend2Adapter implements DiceAdapter {
  readonly tool: DiceAdapterToolInfo;
  readonly environment: AdapterEnvironment;
  private readonly repoRoot: string;

  constructor(
    options: {
      repoRoot?: string;
      toolVersion?: string;
      binaryPath?: string;
    } = {},
  ) {
    this.repoRoot = options.repoRoot || process.cwd();
    const binary = options.binaryPath || this.findBendBinary();
    this.tool = {
      name: "bend2",
      version: options.toolVersion || "2.0.40",
      binaryPath: binary,
      binaryHash:
        binary && existsSync(binary)
          ? createHash("sha256").update(readFileSync(binary)).digest("hex")
          : undefined,
    };
    this.environment = {
      requiredBinaries: ["bend"],
      requiredEnvVars: ["PATH"],
      platform: "any",
    };
  }

  private findBendBinary(): string {
    const candidates = [
      join(process.env.HOME || "", ".bend2/bin/bend"),
      "/usr/local/bin/bend",
      "/usr/bin/bend",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return "bend";
  }

  validateEnvironment(): { status: "OK" | "BLOCKED"; reason?: string } {
    try {
      // prettier-ignore
      const out = execFileSync(this.tool.binaryPath || "bend", ["version"], { // sast-allow: shell-exec -- sanitized allowlisted deterministic adapter execution
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!out.includes("bend 2.")) {
        return {
          status: "BLOCKED",
          reason: `Unexpected bend version output: ${out.trim()}`,
        };
      }
      return { status: "OK" };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "BLOCKED",
        reason: `Bend 2 binary unavailable: ${message}`,
      };
    }
  }

  validateSpecifications(specs: readonly AdapterSpecification[]): {
    status: "OK" | "BLOCKED";
    reason?: string;
  } {
    for (const spec of specs) {
      const full = join(this.repoRoot, spec.path);
      if (!existsSync(full)) {
        return {
          status: "BLOCKED",
          reason: `Required Bend specification missing: ${spec.path}`,
        };
      }
      const actualHash = createHash("sha256")
        .update(readFileSync(full))
        .digest("hex");
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

    // Quarantined laws or incomplete proof check
    if (
      combined.includes("Incomplete proof") ||
      combined.includes("Failed proof") ||
      combined.includes("PROOF_FAILED")
    ) {
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics:
          "INCOMPLETE_BEND_PROOF: One or more proof terms failed Lean kernel check",
      };
    }

    if (
      combined.includes("ALL PROOFS CHECK") ||
      combined.includes("SUCCESS: All formal correctness laws verified")
    ) {
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
      diagnostics: `Bend execution exited with code ${exitCode}`,
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

    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const rawBend = invocation.executable || this.tool.binaryPath || "bend";
      const bend = validateExecutable(rawBend, ["bend"]);
      const safeCwd = validateCwd(invocation.cwd, this.repoRoot);
      const safeTimeout = boundedTimeout(invocation.timeoutMs, 300000, 60000);
      const rawArgs = invocation.approvedArgs
        ? [...invocation.approvedArgs]
        : ["--verdict", "specs/bend/PROOF.bend"];
      const safeArgs = validateArgs(rawArgs);
      const safeEnv = sanitizeEnv(invocation.env);
      safeEnv.PATH = `${join(process.env.HOME || "", ".bend2/bin")}:${safeEnv.PATH || process.env.PATH || ""}`;

      // prettier-ignore
      stdout = execFileSync(bend, safeArgs as string[], { // sast-allow: shell-exec -- sanitized allowlisted deterministic adapter execution
        cwd: safeCwd,
        env: safeEnv,
        encoding: "utf8",
        timeout: safeTimeout,
        shell: false,
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
      receipt_id: `rec-bend2-${linkage.obligationId}-${Date.now()}`,
      obligation_id: linkage.obligationId,
      method_id: linkage.methodId,
      tool: this.tool,
      invocation: {
        id: invocation.id,
        command: [
          invocation.executable || this.tool.binaryPath || "bend",
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

export class LawFileSegregator {
  static readonly RATIFIED_LAWS = new Set([
    "law_responsive_cascade_mobile",
    "law_responsive_cascade_tablet",
    "law_responsive_cascade_desktop",
    "law_reset_restoration_mobile",
    "law_collection_self_exclusion",
    "law_cross_sell_preservation",
  ]);

  static readonly QUARANTINED_LAWS = new Set([
    "law_cms_draft_secrecy",
    "law_cms_scheduled_secrecy",
    "law_cms_published_visibility",
    "law_cms_archived_secrecy",
    "law_cms_tenant_boundary_isolation",
    "law_cms_same_tenant_access",
  ]);

  static auditLawRatification(lawName: string): "RATIFIED" | "QUARANTINED" {
    if (this.QUARANTINED_LAWS.has(lawName)) return "QUARANTINED";
    if (this.RATIFIED_LAWS.has(lawName)) return "RATIFIED";
    return "QUARANTINED";
  }

  static validateLawFile(content: string): {
    status: "OK" | "FAIL";
    violations: string[];
  } {
    const violations: string[] = [];
    for (const qLaw of this.QUARANTINED_LAWS) {
      if (
        content.includes(`ratify ${qLaw}`) ||
        content.includes(`ratified_law: ${qLaw}`)
      ) {
        violations.push(qLaw);
      }
    }
    return {
      status: violations.length === 0 ? "OK" : "FAIL",
      violations,
    };
  }
}
