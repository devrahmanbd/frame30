/**
 * Step 5: Memory Distillation & Knowledge Recall Flywheel.
 *
 * Responsibilities:
 *  - Turn past execution logs into persistent procedural and episodic memories.
 *  - Distill both successes (what worked) and failures (what regressed) from the WAL.
 *  - Feed distilled memories into subsequent runs so the cloaking agent gets smarter over time.
 */

import { createHash } from "node:crypto";
import type {
  DistilledMemory,
  MemoryCategory,
  WALEntry,
} from "./types";
import type { ExecutionWAL } from "./durable-runner";

export class MemoryStore {
  private memories: Map<string, DistilledMemory> = new Map();

  public saveMemory(memory: DistilledMemory): void {
    this.memories.set(memory.id, memory);
  }

  public getMemories(): readonly DistilledMemory[] {
    return Array.from(this.memories.values());
  }

  public getMemoryCount(): number {
    return this.memories.size;
  }

  /**
   * Recalls memories relevant to a query based on keyword matching and category.
   */
  public recallMemories(query: string, limit = 5): DistilledMemory[] {
    const qLower = query.toLowerCase();
    const scored: Array<{ memory: DistilledMemory; score: number }> = [];

    for (const mem of this.memories.values()) {
      let score = 0;
      for (const kw of mem.triggerKeywords) {
        if (qLower.includes(kw.toLowerCase())) {
          score += 2;
        }
      }
      if (qLower.includes(mem.category)) {
        score += 3;
      }
      if (score > 0) {
        scored.push({ memory: mem, score: score * mem.confidence });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.memory);
  }

  public clear(): void {
    this.memories.clear();
  }
}

export class LogToMemoryDistiller {
  private memoryStore: MemoryStore;

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  /**
   * Distills new memories from a completed execution WAL.
   */
  public distillFromWAL(wal: ExecutionWAL): DistilledMemory[] {
    const entries = wal.getEntries();
    const newMemories: DistilledMemory[] = [];
    const executionId = wal.getExecutionId();

    for (const entry of entries) {
      // 1. Learn from tool completion events (e.g. successful rule application)
      if (entry.eventType === "TOOL_COMPLETED") {
        const payload = entry.payload;
        if (payload["toolName"] === "add_cgnat_exception" && payload["ok"]) {
          const mem: DistilledMemory = {
            id: `mem_cgnat_${Date.now()}`,
            category: "cgnat_exception",
            summary: "Mobile CGNAT users have shared IP fanout but genuine touch gestures",
            rule: "Do not trigger IP_FANOUT penalty on Bangladeshi carrier NAT IPs (Grameenphone/Robi) when interaction count >= 1.",
            confidence: 0.95,
            derivedFromExecutionId: executionId,
            triggerKeywords: ["cgnat", "mobile", "fanout", "bangladesh", "grameenphone", "robi"],
            createdAt: new Date().toISOString(),
          };
          this.memoryStore.saveMemory(mem);
          newMemories.push(mem);
        }

        if (payload["toolName"] === "filter_wastage" && payload["ok"]) {
          const mem: DistilledMemory = {
            id: `mem_wastage_${Date.now()}`,
            category: "wastage_pattern",
            summary: "50% of raw ML dataset consists of zero-signal crawler noise",
            rule: "Pre-screen corrupted click beacons lacking referrer or JavaScript execution before running full attribution scoring.",
            confidence: 0.92,
            derivedFromExecutionId: executionId,
            triggerKeywords: ["wastage", "noise", "corrupted", "crawler", "prefilter"],
            createdAt: new Date().toISOString(),
          };
          this.memoryStore.saveMemory(mem);
          newMemories.push(mem);
        }
      }

      // 2. Learn negative rules from rollback / failed branches
      if (entry.eventType === "ROLLBACK_INITIATED") {
        const reason = String(entry.payload["failureReason"] || "accuracy regression");
        const mem: DistilledMemory = {
          id: `mem_negative_${Date.now()}`,
          category: "threshold_boundary",
          summary: `Avoid strategy: ${reason}`,
          rule: `Negative rule: ${reason}. Retain invalid threshold >= 70 to protect genuine buyers from false blocks.`,
          confidence: 0.88,
          derivedFromExecutionId: executionId,
          triggerKeywords: ["threshold", "rollback", "regression", "invalid_threshold"],
          createdAt: new Date().toISOString(),
        };
        this.memoryStore.saveMemory(mem);
        newMemories.push(mem);
      }
    }

    return newMemories;
  }
}
