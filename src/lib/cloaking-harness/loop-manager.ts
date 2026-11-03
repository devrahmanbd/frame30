/**
 * Step 1: Harness Loop Manager and Context Compactor.
 *
 * Responsibilities:
 *  - Manage agent loops: bounded iteration quotas, convergence checks.
 *  - Cycle detection: detect repetitive oscillating action patterns and break infinite loops.
 *  - Context window management: token-budgeted pruning and compaction.
 */

import { createHash } from "node:crypto";
import type {
  HarnessLoopConfig,
  LoopTerminationReason,
  ContextBudget,
  CompactedContext,
  BrainAction,
  DatasetMetrics,
} from "./types";

export class HarnessLoopManager {
  private config: HarnessLoopConfig;
  private currentIteration = 0;
  private actionHistory: string[] = [];
  private cycleWindow: number;

  constructor(config: HarnessLoopConfig) {
    this.config = config;
    this.cycleWindow = config.cycleDetectionWindow || 4;
  }

  public getIteration(): number {
    return this.currentIteration;
  }

  public recordAction(action: BrainAction): void {
    // Generate normalized canonical signature of action
    const sig = `${action.type}:${JSON.stringify(action.parameters)}`;
    this.actionHistory.push(sig);
    this.currentIteration++;
  }

  /**
   * Evaluates if execution should terminate or continue.
   */
  public checkTermination(currentMetrics?: DatasetMetrics): {
    shouldTerminate: boolean;
    reason?: LoopTerminationReason;
    message?: string;
  } {
    // 1. Check convergence target
    if (currentMetrics && currentMetrics.accuracy >= this.config.targetAccuracy) {
      return {
        shouldTerminate: true,
        reason: "converged",
        message: `Target accuracy achieved: ${(currentMetrics.accuracy * 100).toFixed(1)}% >= ${(this.config.targetAccuracy * 100).toFixed(1)}%`,
      };
    }

    // 2. Check max iterations
    if (this.currentIteration >= this.config.maxIterations) {
      return {
        shouldTerminate: true,
        reason: "max_iterations_reached",
        message: `Exceeded max iterations limit of ${this.config.maxIterations}`,
      };
    }

    // 3. Cycle Detection: Check for repeating action sub-sequences
    if (this.detectCycle()) {
      return {
        shouldTerminate: true,
        reason: "cycle_detected",
        message: "Repetitive action cycle detected; circuit breaker tripped to prevent infinite loop",
      };
    }

    // 4. Budget check: Wasted spend limit
    if (
      currentMetrics &&
      this.config.maxWastedSpendMinorInt > 0 &&
      currentMetrics.wastedSpendMinorInt <= this.config.maxWastedSpendMinorInt &&
      currentMetrics.accuracy >= 0.85
    ) {
      return {
        shouldTerminate: true,
        reason: "converged",
        message: `Wasted spend reduced below target bound (${currentMetrics.wastedSpendMinorInt} minor units)`,
      };
    }

    return { shouldTerminate: false };
  }

  /**
   * Cycle detection algorithm:
   * Looks for periodic patterns like [A, B, A, B] or [A, B, C, A, B, C]
   * in the recent action history.
   */
  public detectCycle(): boolean {
    const len = this.actionHistory.length;
    if (len < 4) return false;

    // Check period 1 (repeated immediate action: A, A, A)
    if (
      len >= 3 &&
      this.actionHistory[len - 1] === this.actionHistory[len - 2] &&
      this.actionHistory[len - 2] === this.actionHistory[len - 3]
    ) {
      return true;
    }

    // Check period 2 (oscillating pair: A, B, A, B)
    if (
      len >= 4 &&
      this.actionHistory[len - 1] === this.actionHistory[len - 3] &&
      this.actionHistory[len - 2] === this.actionHistory[len - 4]
    ) {
      return true;
    }

    // Check period 3 (triplet cycle: A, B, C, A, B, C)
    if (
      len >= 6 &&
      this.actionHistory[len - 1] === this.actionHistory[len - 4] &&
      this.actionHistory[len - 2] === this.actionHistory[len - 5] &&
      this.actionHistory[len - 3] === this.actionHistory[len - 6]
    ) {
      return true;
    }

    return false;
  }

  public reset(): void {
    this.currentIteration = 0;
    this.actionHistory = [];
  }
}

/**
 * Context Compactor:
 * Controls prompt token usage by monitoring token budgets and applying
 * semantic pruning when memory approaches capacity.
 */
export class ContextCompactor {
  private budget: ContextBudget;
  private activeContext: CompactedContext;

  constructor(budget: ContextBudget) {
    this.budget = budget;
    this.activeContext = {
      summary: "Session initialized for cloaking optimization.",
      activeVariables: {},
      recentTurns: [],
      estimatedTokens: 25,
      compactionCount: 0,
    };
  }

  public getContext(): CompactedContext {
    return this.activeContext;
  }

  public addTurn(
    role: "system" | "user" | "assistant" | "tool",
    content: string,
  ): void {
    const turnTokens = this.estimateTokens(content);
    this.activeContext.recentTurns.push({ role, content });
    this.activeContext.estimatedTokens += turnTokens;

    // Trigger compaction if over threshold
    const limit = this.budget.maxTokens * this.budget.compactionThreshold;
    if (this.activeContext.estimatedTokens > limit) {
      this.compact();
    }
  }

  public updateVariable(key: string, value: unknown): void {
    this.activeContext.activeVariables[key] = value;
  }

  /**
   * Compaction algorithm:
   * Preserves `preserveRecentTurns` newest turns, while condensing older turns
   * into a high-density summary string.
   */
  public compact(): void {
    const preserveCount = this.budget.preserveRecentTurns;
    if (this.activeContext.recentTurns.length === 0) return;

    let turnsToCondense: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
    let preservedTurns: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;

    if (this.activeContext.recentTurns.length <= preserveCount) {
      // If within preserve window but token count exceeds limit, condense oldest turn
      turnsToCondense = [this.activeContext.recentTurns[0]];
      preservedTurns = this.activeContext.recentTurns.slice(1);
    } else {
      turnsToCondense = this.activeContext.recentTurns.slice(
        0,
        this.activeContext.recentTurns.length - preserveCount,
      );
      preservedTurns = this.activeContext.recentTurns.slice(
        this.activeContext.recentTurns.length - preserveCount,
      );
    }

    const condensedNotes: string[] = [];
    for (const turn of turnsToCondense) {
      condensedNotes.push(`${turn.role}: ${turn.content.slice(0, 80)}...`);
    }

    const updatedSummary = `${this.activeContext.summary}\n[Compaction #${this.activeContext.compactionCount + 1}]: Processed ${turnsToCondense.length} turns. ${condensedNotes.slice(-3).join(" | ")}`;

    this.activeContext.summary = updatedSummary;
    this.activeContext.recentTurns = preservedTurns;
    this.activeContext.compactionCount++;

    // Recalculate token estimate
    let tokens = this.estimateTokens(updatedSummary);
    for (const t of preservedTurns) {
      tokens += this.estimateTokens(t.content);
    }
    this.activeContext.estimatedTokens = tokens;
  }

  /**
   * Rough token estimator: ~4 characters per token
   */
  public estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}
