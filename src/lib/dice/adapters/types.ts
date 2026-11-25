/**
 * Frame30 DICE Native Adapter Interface
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section D & Section 8
 */

import { resolve, basename, sep } from "node:path";
import { realpathSync, existsSync } from "node:fs";

export type AdapterToolName =
  "lean4" | "tlc" | "bend2" | "bombadil" | "vitest" | "fast-check" | "script";

export type AdapterRiskClass = "critical" | "high" | "standard";

export interface DiceAdapterToolInfo {
  readonly name: AdapterToolName;
  readonly version: string;
  readonly binaryHash?: string;
  readonly binaryPath?: string;
}

export interface AdapterInvocation {
  readonly id: string;
  readonly approvedArgs: readonly string[];
  readonly executable?: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

export interface AdapterSpecification {
  readonly path: string;
  readonly sha256: string;
}

export interface AdapterEnvironment {
  readonly requiredBinaries: readonly string[];
  readonly requiredEnvVars: readonly string[];
  readonly platform: "darwin" | "linux" | "any";
}

export interface AdapterProvenance {
  readonly commitSha: string;
  readonly treeSha: string;
}

export interface AdapterLinkage {
  readonly dieId?: string;
  readonly obligationId: string;
  readonly methodId: string;
  readonly riskClass: AdapterRiskClass;
}

export interface AdapterVerdict {
  readonly status: "PASS" | "FAIL" | "BLOCKED";
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly diagnostics?: string;
  readonly artifacts?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}

export interface DiceExecutionReceipt {
  readonly schema_version: "2.3.0";
  readonly receipt_version: 1;
  readonly receipt_id: string;
  readonly obligation_id: string;
  readonly method_id: string;
  readonly tool: DiceAdapterToolInfo;
  readonly invocation: {
    readonly id: string;
    readonly command: readonly string[];
  };
  readonly specifications: readonly AdapterSpecification[];
  readonly provenance: AdapterProvenance;
  readonly linkage: AdapterLinkage;
  readonly status: "PASS" | "FAIL" | "BLOCKED";
  readonly exit_code: number;
  readonly duration_ms: number;
  readonly diagnostics?: string;
  readonly artifacts: Record<string, string>;
  readonly timestamp: string;
}

export interface DiceAdapter {
  readonly tool: DiceAdapterToolInfo;
  readonly environment: AdapterEnvironment;
  validateEnvironment(): { status: "OK" | "BLOCKED"; reason?: string };
  validateSpecifications(specs: readonly AdapterSpecification[]): {
    status: "OK" | "BLOCKED";
    reason?: string;
  };
  parseExecutionResult(
    rawStdout: string,
    rawStderr: string,
    exitCode: number,
    durationMs: number,
  ): AdapterVerdict;
  execute(
    invocation: AdapterInvocation,
    provenance: AdapterProvenance,
    linkage: AdapterLinkage,
    specs?: readonly AdapterSpecification[],
  ): DiceExecutionReceipt;
}

const FORBIDDEN_SHELL_CHARS = /[;&|`$\n\r><()]/;

const UNTRUSTED_PATH_PATTERNS = [
  /^\/tmp(?:[/]|$)/i,
  /^\/var\/tmp(?:[/]|$)/i,
  /^\/dev\/shm(?:[/]|$)/i,
  /\/attacker(?:[/]|$)/i,
];

export function validateExecutable(
  executable: string,
  allowedNames: readonly string[],
): string {
  if (!executable || typeof executable !== "string") {
    throw new Error(`[dice-adapter] ✗ Executable must be a non-empty string`);
  }
  if (FORBIDDEN_SHELL_CHARS.test(executable)) {
    throw new Error(
      `[dice-adapter] ✗ Disallowed shell metacharacter in executable path: ${executable}`,
    );
  }
  const base = basename(executable);
  if (!allowedNames.includes(base)) {
    throw new Error(
      `[dice-adapter] ✗ Disallowed executable: ${executable}. Approved executables: ${allowedNames.join(", ")}`,
    );
  }
  if (executable.includes("/") || executable.includes("\\")) {
    const resolved = resolve(executable);
    const real = existsSync(resolved) ? realpathSync(resolved) : resolved;
    for (const pattern of UNTRUSTED_PATH_PATTERNS) {
      if (pattern.test(resolved) || pattern.test(real)) {
        throw new Error(
          `[dice-adapter] ✗ Disallowed executable path: ${executable}. Untrusted execution path strictly prohibited.`,
        );
      }
    }
  }
  return executable;
}

export function validateCwd(cwd: string | undefined, repoRoot: string): string {
  const root = existsSync(repoRoot)
    ? realpathSync(resolve(repoRoot))
    : resolve(repoRoot);
  const targetPath = resolve(cwd || repoRoot);
  const target = existsSync(targetPath) ? realpathSync(targetPath) : targetPath;
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(
      `[dice-adapter] ✗ Disallowed working directory outside repo root: ${cwd}`,
    );
  }
  return target;
}

const FORBIDDEN_ENV_VARS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "NODE_OPTIONS",
  "BASH_ENV",
  "ENV",
  "SHELLOPTS",
]);

const SENSITIVE_SECRET_PATTERN =
  /(?:KEY|SECRET|TOKEN|PASSWORD|AUTH|CREDENTIAL)/i;
const SAFE_SECRET_WHITELIST = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "CI",
  "CIRCLECI",
]);

export function sanitizeEnv(
  invocationEnv?: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (FORBIDDEN_ENV_VARS.has(key)) continue;
    if (SENSITIVE_SECRET_PATTERN.test(key) && !SAFE_SECRET_WHITELIST.has(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  if (invocationEnv) {
    for (const [key, value] of Object.entries(invocationEnv)) {
      if (FORBIDDEN_ENV_VARS.has(key)) {
        throw new Error(
          `[dice-adapter] ✗ Forbidden environment variable in invocation: ${key}`,
        );
      }
      if (
        SENSITIVE_SECRET_PATTERN.test(key) &&
        !SAFE_SECRET_WHITELIST.has(key)
      ) {
        throw new Error(
          `[dice-adapter] ✗ Sensitive secret environment variable prohibited in invocation: ${key}`,
        );
      }
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function boundedTimeout(
  timeoutMs?: number,
  maxMs: number = 300000,
  defaultMs: number = 120000,
): number {
  if (
    timeoutMs === undefined ||
    timeoutMs === null ||
    timeoutMs <= 0 ||
    !Number.isFinite(timeoutMs)
  ) {
    return defaultMs;
  }
  return Math.min(timeoutMs, maxMs);
}

export function validateArgs(args: readonly string[]): readonly string[] {
  if (!Array.isArray(args)) {
    throw new Error(`[dice-adapter] ✗ Arguments must be an array`);
  }
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new Error(
        `[dice-adapter] ✗ Every argument must be a string, got ${typeof arg}`,
      );
    }
  }
  return args;
}
