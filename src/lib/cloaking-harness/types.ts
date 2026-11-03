/**
 * Types and contracts for the Cloaking Defense & Agentic Harness.
 *
 * Implements the 5 core workshop architectural principles:
 *  1. Harness: loops, context budgeting, sandboxing.
 *  2. Fast Brain: decoupled brain vs tools (60% faster TTFT).
 *  3. Durable Runner: server-side execution with append-only WAL crash recovery.
 *  4. Recovery: checkpoint snapshots, rewind replays & retries without reset.
 *  5. Memory Flywheel: log reflection, procedural distillation & memory recall.
 */

import type { AdNetwork, AdVerdict, SignalCode } from "../ad-fraud";

// ─────────────────────────────────────────────────────────────
// 1. ML Traffic Dataset & Cloaking Domain Types
// ─────────────────────────────────────────────────────────────

export type TrafficClassification = "genuine_shopper" | "scraper_bot" | "click_farm" | "wastage_noise";

export type CloakingDatasetSample = {
  id: string;
  timestamp: string;
  network: AdNetwork;
  ipClass: "residential" | "mobile" | "datacenter" | "vpn" | "unknown";
  asn: string; // e.g. "AS24432 (Grameenphone)", "AS16509 (Amazon AWS)"
  isCarrierNat: boolean; // Bangladesh mobile CGNAT flag
  dwellMs: number;
  interactions: number;
  javascriptRan: boolean;
  automationHints: number;
  userAgent: string;
  clickId: string | null;
  clickIdReused: boolean;
  referrerHost: string | null;
  visitorCountry: string | null;
  targetCountry: string | null;
  timezoneOffsetMinutes: number | null;
  // Ground truth classification for evaluation
  groundTruth: TrafficClassification;
  isWastage: boolean; // Indicates noisy/unreviewed/corrupted sample (~50% of raw input)
  labelConfidence: number; // 0.0 - 1.0
};

export type CloakingEvaluationResult = {
  sampleId: string;
  score: number;
  verdict: AdVerdict;
  firedSignals: SignalCode[];
  isCorrect: boolean;
  isFalsePositive: boolean; // Genuine shopper misflagged as invalid/suspicious
  isFalseNegative: boolean; // Bot/click farm misflagged as valid
  isWastageFiltered: boolean;
  notes: string;
};

export type DatasetMetrics = {
  totalSamples: number;
  wastageCount: number;
  wastagePercentage: number;
  evaluatedSamples: number;
  correctCount: number;
  accuracy: number; // 0.0 - 1.0
  falsePositiveCount: number;
  falseNegativeCount: number;
  precision: number;
  recall: number;
  f1Score: number;
  wastedSpendMinorInt: number; // In BDT poisha (minor units)
};

// ─────────────────────────────────────────────────────────────
// 2. Step 1: Harness Loop & Context Budgeting
// ─────────────────────────────────────────────────────────────

export type HarnessLoopConfig = {
  maxIterations: number;
  cycleDetectionWindow: number; // How many turns back to check for cyclical loops
  targetAccuracy: number; // Convergence target (e.g. 0.90)
  maxWastedSpendMinorInt: number;
};

export type LoopTerminationReason =
  | "converged"
  | "max_iterations_reached"
  | "cycle_detected"
  | "budget_exhausted"
  | "error_unrecoverable";

export type ContextBudget = {
  maxTokens: number;
  compactionThreshold: number; // e.g. 0.75 of maxTokens triggers compaction
  preserveRecentTurns: number;
};

export type CompactedContext = {
  summary: string;
  activeVariables: Record<string, unknown>;
  recentTurns: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  estimatedTokens: number;
  compactionCount: number;
};

// ─────────────────────────────────────────────────────────────
// 3. Step 2: Decoupled Brain vs Tools
// ─────────────────────────────────────────────────────────────

export type BrainStreamChunk = {
  delta: string;
  isFirstToken: boolean;
  elapsedMs: number;
};

export type BrainAction = {
  type: "inspect_mistakes" | "tune_threshold" | "add_signal_rule" | "filter_wastage" | "checkpoint_now" | "conclude";
  thought: string;
  parameters: Record<string, unknown>;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  schemaDigest: string; // Lightweight hash/signature (keeps initial prompt small)
  parametersSummary: string;
  execute: (args: Record<string, unknown>, sandbox: unknown) => Promise<ToolExecutionResult>;
};

export type ToolExecutionResult = {
  ok: boolean;
  output: string;
  error?: string;
  metricsUpdate?: Partial<DatasetMetrics>;
};

export type TTFTComparison = {
  monolithicTTFTMs: number; // Bulky prompt with all full schemas injected
  decoupledTTFTMs: number;   // Lightweight brain prompt with deferred tools
  speedupPercentage: number; // Should be >= 60%
};

// ─────────────────────────────────────────────────────────────
// 4. Step 3: Server-side WAL & Crash Recovery
// ─────────────────────────────────────────────────────────────

export type WALEventType =
  | "SESSION_START"
  | "THOUGHT"
  | "TOOL_INVOKED"
  | "TOOL_COMPLETED"
  | "TOOL_FAILED"
  | "CHECKPOINT_COMMITTED"
  | "ROLLBACK_INITIATED"
  | "CRASH_SIMULATED"
  | "RECOVERY_COMPLETED"
  | "MEMORY_DISTILLED"
  | "SESSION_CONCLUDED";

export type WALEntry = {
  id: string;
  sequence: number;
  timestamp: string;
  eventType: WALEventType;
  payload: Record<string, unknown>;
  checksum: string;
};

export type RecoveredState = {
  executionId: string;
  lastSequence: number;
  activeContext: CompactedContext;
  currentMetrics: DatasetMetrics;
  iteration: number;
  appliedRules: string[];
  lastCheckpointId: string | null;
  recoveredAt: string;
};

// ─────────────────────────────────────────────────────────────
// 5. Step 4: Checkpoints, Replays & Retries
// ─────────────────────────────────────────────────────────────

export type CheckpointSnapshot = {
  id: string;
  sequence: number;
  iteration: number;
  context: CompactedContext;
  metrics: DatasetMetrics;
  rulesState: Record<string, unknown>;
  createdAt: string;
};

export type ReplayBranch = {
  checkpointId: string;
  divergenceReason: string;
  attemptNumber: number;
  maxAttempts: number;
  alternativeStrategy: string;
};

// ─────────────────────────────────────────────────────────────
// 6. Step 5: Memory Distillation & Knowledge Recall
// ─────────────────────────────────────────────────────────────

export type MemoryCategory = "cgnat_exception" | "bot_signature" | "wastage_pattern" | "threshold_boundary";

export type DistilledMemory = {
  id: string;
  category: MemoryCategory;
  summary: string;
  rule: string;
  confidence: number;
  derivedFromExecutionId: string;
  triggerKeywords: string[];
  createdAt: string;
};
