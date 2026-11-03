/**
 * Step 4: Checkpoints, Recoverable Replays and Retries.
 *
 * Responsibilities:
 *  - Make failures recoverable instead of restarting from scratch.
 *  - Save deterministic checkpoint snapshots (context, metrics, rules state).
 *  - When an experiment fails or regresses, rewind to the latest good checkpoint,
 *    record the negative lesson, and replay forward along an alternative strategy branch.
 */

import type {
  CheckpointSnapshot,
  CompactedContext,
  DatasetMetrics,
  ReplayBranch,
} from "./types";
import type { CloakingSandbox } from "./sandbox";
import type { ContextCompactor } from "./loop-manager";

export class CheckpointManager {
  private checkpoints: Map<string, CheckpointSnapshot> = new Map();
  private checkpointOrder: string[] = [];
  private activeBranch: ReplayBranch | null = null;
  private maxRetriesPerStep = 3;

  public saveCheckpoint(
    id: string,
    sequence: number,
    iteration: number,
    context: CompactedContext,
    metrics: DatasetMetrics,
    rulesState: Record<string, unknown>,
  ): CheckpointSnapshot {
    const snapshot: CheckpointSnapshot = {
      id,
      sequence,
      iteration,
      context: structuredClone(context),
      metrics: structuredClone(metrics),
      rulesState: structuredClone(rulesState),
      createdAt: new Date().toISOString(),
    };

    this.checkpoints.set(id, snapshot);
    this.checkpointOrder.push(id);
    return snapshot;
  }

  public getCheckpoint(id: string): CheckpointSnapshot | undefined {
    return this.checkpoints.get(id);
  }

  public getLatestCheckpoint(): CheckpointSnapshot | null {
    if (this.checkpointOrder.length === 0) return null;
    const latestId = this.checkpointOrder[this.checkpointOrder.length - 1];
    return this.checkpoints.get(latestId) ?? null;
  }

  /**
   * Rewinds sandbox and context state to a specified checkpoint.
   * Injects the failure diagnosis into context so the next attempt avoids the same mistake.
   */
  public rollbackAndReplay(
    checkpointId: string,
    failureReason: string,
    sandbox: CloakingSandbox,
    contextCompactor: ContextCompactor,
  ): {
    success: boolean;
    restoredMetrics: DatasetMetrics;
    attemptNumber: number;
    guidance: string;
  } {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found; cannot rollback`);
    }

    // Check retry limits
    const currentAttempt = (this.activeBranch?.checkpointId === checkpointId
      ? this.activeBranch.attemptNumber
      : 0) + 1;

    if (currentAttempt > this.maxRetriesPerStep) {
      throw new Error(
        `Exceeded maximum retries (${this.maxRetriesPerStep}) for checkpoint ${checkpointId}`,
      );
    }

    this.activeBranch = {
      checkpointId,
      divergenceReason: failureReason,
      attemptNumber: currentAttempt,
      maxAttempts: this.maxRetriesPerStep,
      alternativeStrategy: `Attempt ${currentAttempt}: Diverging due to ${failureReason}`,
    };

    // Rollback context and inject failure diagnosis
    contextCompactor.addTurn(
      "system",
      `[ROLLBACK TO CHECKPOINT ${checkpointId} (Attempt ${currentAttempt}/${this.maxRetriesPerStep})]: Previous action failed: ${failureReason}. Do NOT repeat this mistake. Explore an alternate strategy.`,
    );

    // Rollback sandbox rules
    const rules = checkpoint.rulesState["rules"] as Record<string, { active: boolean }> | undefined;
    if (rules) {
      for (const ruleId of Object.keys(rules)) {
        if (!rules[ruleId].active) {
          sandbox.removeRule(ruleId);
        }
      }
    }
    const invThresh = checkpoint.rulesState["invalidThreshold"] as number | undefined;
    const suspThresh = checkpoint.rulesState["suspiciousThreshold"] as number | undefined;
    if (invThresh && suspThresh) {
      sandbox.setThresholds(invThresh, suspThresh);
    }
    const wastage = checkpoint.rulesState["wastageFilterActive"] as boolean | undefined;
    if (wastage !== undefined) {
      sandbox.setWastageFilter(wastage);
    }

    return {
      success: true,
      restoredMetrics: checkpoint.metrics,
      attemptNumber: currentAttempt,
      guidance: `Rolled back to checkpoint ${checkpointId}. Strategy diverged.`,
    };
  }

  public getActiveBranch(): ReplayBranch | null {
    return this.activeBranch;
  }
}
