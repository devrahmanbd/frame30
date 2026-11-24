/**
 * Frame30 DICE Native Adapter Interface
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section D & Section 8
 */

export type AdapterToolName =
  | "lean4"
  | "tlc"
  | "bend2"
  | "bombadil"
  | "vitest"
  | "fast-check"
  | "script";

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
  validateSpecifications(specs: readonly AdapterSpecification[]): { status: "OK" | "BLOCKED"; reason?: string };
  parseExecutionResult(rawStdout: string, rawStderr: string, exitCode: number, durationMs: number): AdapterVerdict;
  execute(
    invocation: AdapterInvocation,
    provenance: AdapterProvenance,
    linkage: AdapterLinkage,
    specs?: readonly AdapterSpecification[],
  ): DiceExecutionReceipt;
}
