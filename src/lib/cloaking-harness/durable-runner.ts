/**
 * Step 3: Server-Side Durable Agent Runner & Crash Recovery.
 *
 * Responsibilities:
 *  - Runs agent loops server-side (headless, persistent, non-blocking).
 *  - Writes every event to an append-only Write-Ahead Log (WAL).
 *  - Recovers from worker crashes by replaying the execution log to reconstruct
 *    the exact active context, iteration, and checkpoint state.
 */

import { createHash } from "node:crypto";
import type {
  WALEntry,
  WALEventType,
  RecoveredState,
  CompactedContext,
  DatasetMetrics,
} from "./types";

export class ExecutionWAL {
  private executionId: string;
  private entries: WALEntry[] = [];
  private sequenceCounter = 0;

  constructor(executionId = `exec_${Date.now()}`) {
    this.executionId = executionId;
  }

  public getExecutionId(): string {
    return this.executionId;
  }

  public append(eventType: WALEventType, payload: Record<string, unknown>): WALEntry {
    this.sequenceCounter++;
    const timestamp = new Date().toISOString();
    const rawData = `${this.executionId}:${this.sequenceCounter}:${eventType}:${timestamp}:${JSON.stringify(payload)}`;
    const checksum = createHash("sha256").update(rawData).digest("hex").slice(0, 16);

    const entry: WALEntry = {
      id: `wal_${this.sequenceCounter}`,
      sequence: this.sequenceCounter,
      timestamp,
      eventType,
      payload: structuredClone(payload),
      checksum,
    };

    this.entries.push(entry);
    return entry;
  }

  public getEntries(): readonly WALEntry[] {
    return this.entries;
  }

  public getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Replays WAL entries from start to end to rebuild state after a crash.
   */
  public recoverState(): RecoveredState {
    let lastSequence = 0;
    let iteration = 0;
    let appliedRules: string[] = [];
    let lastCheckpointId: string | null = null;
    let activeContext: CompactedContext = {
      summary: "Recovered from WAL crash logs.",
      activeVariables: {},
      recentTurns: [],
      estimatedTokens: 0,
      compactionCount: 0,
    };
    let currentMetrics: DatasetMetrics = {
      totalSamples: 0,
      wastageCount: 0,
      wastagePercentage: 0,
      evaluatedSamples: 0,
      correctCount: 0,
      accuracy: 0,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      wastedSpendMinorInt: 0,
    };

    for (const entry of this.entries) {
      lastSequence = entry.sequence;

      switch (entry.eventType) {
        case "SESSION_START":
          iteration = 0;
          break;

        case "THOUGHT":
          if (entry.payload["iteration"] && typeof entry.payload["iteration"] === "number") {
            iteration = entry.payload["iteration"];
          }
          if (entry.payload["thought"] && typeof entry.payload["thought"] === "string") {
            activeContext.recentTurns.push({
              role: "assistant",
              content: entry.payload["thought"],
            });
          }
          break;

        case "TOOL_COMPLETED":
          if (entry.payload["ruleId"] && typeof entry.payload["ruleId"] === "string") {
            appliedRules.push(entry.payload["ruleId"]);
          }
          if (entry.payload["metrics"]) {
            currentMetrics = {
              ...currentMetrics,
              ...(entry.payload["metrics"] as Partial<DatasetMetrics>),
            };
          }
          break;

        case "CHECKPOINT_COMMITTED":
          if (entry.payload["checkpointId"] && typeof entry.payload["checkpointId"] === "string") {
            lastCheckpointId = entry.payload["checkpointId"];
          }
          if (entry.payload["metrics"]) {
            currentMetrics = entry.payload["metrics"] as DatasetMetrics;
          }
          break;

        case "ROLLBACK_INITIATED":
          if (entry.payload["targetCheckpointId"] && typeof entry.payload["targetCheckpointId"] === "string") {
            lastCheckpointId = entry.payload["targetCheckpointId"];
          }
          break;

        default:
          break;
      }
    }

    return {
      executionId: this.executionId,
      lastSequence,
      activeContext,
      currentMetrics,
      iteration,
      appliedRules,
      lastCheckpointId,
      recoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Simulates a process crash by returning serialized WAL logs that can be saved
   * or transferred to another worker process.
   */
  public exportLog(): string {
    return JSON.stringify({
      executionId: this.executionId,
      entries: this.entries,
    });
  }

  public static importLog(serialized: string): ExecutionWAL {
    const data = JSON.parse(serialized);
    const wal = new ExecutionWAL(data.executionId);
    wal.entries = data.entries;
    wal.sequenceCounter = data.entries.length > 0
      ? data.entries[data.entries.length - 1].sequence
      : 0;
    return wal;
  }
}

export class DurableServerAgentRunner {
  private wal: ExecutionWAL;
  private isAlive = true;

  constructor(executionId?: string) {
    this.wal = new ExecutionWAL(executionId);
    this.wal.append("SESSION_START", { initializedAt: new Date().toISOString() });
  }

  public getWAL(): ExecutionWAL {
    return this.wal;
  }

  public logThought(iteration: number, thought: string): void {
    if (!this.isAlive) throw new Error("Runner process is dead; cannot write thought");
    this.wal.append("THOUGHT", { iteration, thought });
  }

  public logToolInvoke(toolName: string, args: Record<string, unknown>): void {
    if (!this.isAlive) throw new Error("Runner process is dead; cannot invoke tool");
    this.wal.append("TOOL_INVOKED", { toolName, args });
  }

  public logToolComplete(toolName: string, result: Record<string, unknown>): void {
    if (!this.isAlive) throw new Error("Runner process is dead; cannot record tool output");
    this.wal.append("TOOL_COMPLETED", { toolName, ...result });
  }

  public logCheckpoint(checkpointId: string, metrics: DatasetMetrics): void {
    if (!this.isAlive) throw new Error("Runner process is dead; cannot record checkpoint");
    this.wal.append("CHECKPOINT_COMMITTED", { checkpointId, metrics });
  }

  /**
   * Simulates worker crash / sudden termination.
   */
  public simulateCrash(): string {
    this.wal.append("CRASH_SIMULATED", { crashedAt: new Date().toISOString() });
    this.isAlive = false;
    return this.wal.exportLog();
  }

  /**
   * Recovers runner state from exported log after crash.
   */
  public static recoverFromCrash(serializedLog: string): {
    runner: DurableServerAgentRunner;
    recoveredState: RecoveredState;
  } {
    const recoveredWal = ExecutionWAL.importLog(serializedLog);
    const state = recoveredWal.recoverState();

    // Spawn new live server runner
    const runner = new DurableServerAgentRunner(state.executionId);
    runner.wal = recoveredWal;
    runner.isAlive = true;

    runner.wal.append("RECOVERY_COMPLETED", {
      recoveredAt: state.recoveredAt,
      resumingFromSequence: state.lastSequence,
      resumingIteration: state.iteration,
    });

    return { runner, recoveredState: state };
  }
}
