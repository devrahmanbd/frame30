/**
 * TLA+ / TLC Model Checker Adapter
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section 3.2 & 8.2
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

export class TlaAdapter implements DiceAdapter {
  readonly tool: DiceAdapterToolInfo;
  readonly environment: AdapterEnvironment;
  private readonly repoRoot: string;
  private readonly jarPath: string;

  constructor(options: { repoRoot?: string; jarPath?: string } = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.jarPath =
      options.jarPath || join(this.repoRoot, "specs/tla/tla2tools.jar");
    this.tool = {
      name: "tlc",
      version: "2.18",
      binaryPath: this.findJavaBinary(),
      binaryHash: existsSync(this.jarPath)
        ? createHash("sha256").update(readFileSync(this.jarPath)).digest("hex")
        : undefined,
    };
    this.environment = {
      requiredBinaries: ["java"],
      requiredEnvVars: ["PATH"],
      platform: "any",
    };
  }

  private findJavaBinary(): string {
    const candidates = [
      "/opt/homebrew/opt/openjdk@21/bin/java",
      "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
      "/usr/bin/java",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return "java";
  }

  validateEnvironment(): { status: "OK" | "BLOCKED"; reason?: string } {
    if (!existsSync(this.jarPath)) {
      return {
        status: "BLOCKED",
        reason: `tla2tools.jar missing at ${this.jarPath}`,
      };
    }
    try {
      // prettier-ignore
      const out = execFileSync(this.tool.binaryPath || "java", ["-version"], { // sast-allow: shell-exec -- sanitized allowlisted deterministic adapter execution
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: "OK" };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "BLOCKED",
        reason: `Java runtime unavailable: ${message}`,
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
          reason: `Required TLA specification missing: ${spec.path}`,
        };
      }
      // If a .tla file is given, its paired .cfg must also exist
      if (spec.path.endsWith(".tla")) {
        const cfgPath = spec.path.replace(/\.tla$/, ".cfg");
        const fullCfg = join(this.repoRoot, cfgPath);
        if (!existsSync(fullCfg)) {
          return {
            status: "BLOCKED",
            reason: `Required model config (.cfg) missing for ${spec.path}: ${cfgPath}`,
          };
        }
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

    // Missing or invalid configuration
    if (
      combined.includes("Cannot find configuration file") ||
      combined.includes("Unknown option:") ||
      combined.includes("Configuration file")
    ) {
      if (!combined.includes("Model checking completed")) {
        return {
          status: "BLOCKED",
          exitCode: exitCode !== 0 ? exitCode : 127,
          durationMs,
          stdout: rawStdout,
          stderr: rawStderr,
          diagnostics:
            "TLC_CONFIG_ERROR: Missing or malformed configuration file",
        };
      }
    }

    // Invariant violations or deadlocks
    if (combined.includes("Invariant") && combined.includes("is violated")) {
      const match = combined.match(/Invariant\s+([A-Za-z0-9_]+)\s+is violated/);
      const invariantName = match ? match[1] : "UNKNOWN";
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics: `INVARIANT_VIOLATED: ${invariantName}`,
      };
    }

    if (combined.includes("Deadlock reached")) {
      return {
        status: "FAIL",
        exitCode: exitCode !== 0 ? exitCode : 1,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        diagnostics:
          "DEADLOCK_REACHED: System reached an unhandled terminal state",
      };
    }

    // State counts extraction
    const statesMatch = combined.match(
      /(\d+)\s+states generated,\s+(\d+)\s+distinct states found/,
    );
    const depthMatch = combined.match(
      /depth of the complete state graph search is\s+(\d+)/,
    );

    const distinctStates = statesMatch ? parseInt(statesMatch[2], 10) : 0;
    const totalStates = statesMatch ? parseInt(statesMatch[1], 10) : 0;
    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;

    const hasSuccessMarker = combined.includes(
      "Model checking completed. No error has been found.",
    );

    if (exitCode === 0 && hasSuccessMarker) {
      return {
        status: "PASS",
        exitCode: 0,
        durationMs,
        stdout: rawStdout,
        stderr: rawStderr,
        metadata: {
          distinctStates,
          totalStates,
          depth,
        },
      };
    }

    return {
      status: "FAIL",
      exitCode: exitCode !== 0 ? exitCode : 1,
      durationMs,
      stdout: rawStdout,
      stderr: rawStderr,
      diagnostics: `TLC execution failed with exit code ${exitCode}`,
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
      const rawJava = invocation.executable || this.tool.binaryPath || "java";
      const java = validateExecutable(rawJava, ["java"]);
      const safeCwd = validateCwd(invocation.cwd, this.repoRoot);
      const safeTimeout = boundedTimeout(invocation.timeoutMs, 300000, 120000);
      const rawArgs = invocation.approvedArgs
        ? [...invocation.approvedArgs]
        : ["-jar", this.jarPath];
      const safeArgs = validateArgs(rawArgs);
      const safeEnv = sanitizeEnv(invocation.env);

      // prettier-ignore
      stdout = execFileSync(java, safeArgs as string[], { // sast-allow: shell-exec -- sanitized allowlisted deterministic adapter execution
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
      receipt_id: `rec-tlc-${linkage.obligationId}-${Date.now()}`,
      obligation_id: linkage.obligationId,
      method_id: linkage.methodId,
      tool: this.tool,
      invocation: {
        id: invocation.id,
        command: [
          invocation.executable || this.tool.binaryPath || "java",
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
