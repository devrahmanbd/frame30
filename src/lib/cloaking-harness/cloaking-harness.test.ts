/**
 * Test Suite: Cloaking Defense & Agentic Harness.
 *
 * Verifies all 5 steps of the workshop paradigm:
 *  Step 1 - Loops, context compaction, and sandboxing.
 *  Step 2 - Decoupled brain vs tools reaching first token >= 60% faster.
 *  Step 3 - Server-side execution and crash recovery from WAL logs.
 *  Step 4 - Checkpoint rollback, replay, and retries without starting over.
 *  Step 5 - Log-to-memory reflection and continuous learning.
 *  Domain - Cloaking ML dataset evaluation (50% wastage diagnosis and accuracy improvement).
 */

import { describe, expect, it } from "vitest";
import {
  CloakingHarness,
  CloakingSandbox,
  HarnessLoopManager,
  ContextCompactor,
  DeferredToolBus,
  DecoupledBrain,
  DurableServerAgentRunner,
  ExecutionWAL,
  CheckpointManager,
  MemoryStore,
  LogToMemoryDistiller,
  CloakingMistakeAnalyzer,
  generateMLTrafficDataset,
} from "./index";

describe("Cloaking Agent Harness Workshop Suite", () => {
  // ─────────────────────────────────────────────────────────────
  // STEP 1: Loops, Context, and Sandboxing
  // ─────────────────────────────────────────────────────────────
  describe("Step 1: Manage loops, context, and sandboxing through a harness", () => {
    it("terminates when target accuracy is reached", () => {
      const loop = new HarnessLoopManager({
        maxIterations: 10,
        cycleDetectionWindow: 4,
        targetAccuracy: 0.90,
        maxWastedSpendMinorInt: 5000,
      });

      loop.recordAction({ type: "filter_wastage", thought: "filtering", parameters: {} });
      const term1 = loop.checkTermination({
        totalSamples: 100,
        wastageCount: 50,
        wastagePercentage: 0.5,
        evaluatedSamples: 50,
        correctCount: 40,
        accuracy: 0.80,
        falsePositiveCount: 5,
        falseNegativeCount: 5,
        precision: 0.8,
        recall: 0.8,
        f1Score: 0.8,
        wastedSpendMinorInt: 25000,
      });
      expect(term1.shouldTerminate).toBe(false);

      loop.recordAction({ type: "tune_threshold", thought: "tuning", parameters: {} });
      const term2 = loop.checkTermination({
        totalSamples: 100,
        wastageCount: 50,
        wastagePercentage: 0.5,
        evaluatedSamples: 50,
        correctCount: 46,
        accuracy: 0.92,
        falsePositiveCount: 2,
        falseNegativeCount: 2,
        precision: 0.92,
        recall: 0.92,
        f1Score: 0.92,
        wastedSpendMinorInt: 4500,
      });
      expect(term2.shouldTerminate).toBe(true);
      expect(term2.reason).toBe("converged");
    });

    it("trips circuit breaker when cyclic action loop is detected", () => {
      const loop = new HarnessLoopManager({
        maxIterations: 20,
        cycleDetectionWindow: 4,
        targetAccuracy: 0.99,
        maxWastedSpendMinorInt: 1000,
      });

      // Simulate oscillating cycle: A -> B -> A -> B
      loop.recordAction({ type: "tune_threshold", thought: "", parameters: { invalid: 70 } });
      loop.recordAction({ type: "tune_threshold", thought: "", parameters: { invalid: 65 } });
      loop.recordAction({ type: "tune_threshold", thought: "", parameters: { invalid: 70 } });
      loop.recordAction({ type: "tune_threshold", thought: "", parameters: { invalid: 65 } });

      const term = loop.checkTermination();
      expect(term.shouldTerminate).toBe(true);
      expect(term.reason).toBe("cycle_detected");
    });

    it("compacts context when token threshold is reached, preserving newest turns", () => {
      const compactor = new ContextCompactor({
        maxTokens: 100,
        compactionThreshold: 0.70, // 70 tokens triggers compaction
        preserveRecentTurns: 2,
      });

      // Add small turn
      compactor.addTurn("user", "Start investigation of cloaking data.");
      expect(compactor.getContext().compactionCount).toBe(0);

      // Add large turn exceeding threshold
      const largeText = "A".repeat(400); // ~100 tokens
      compactor.addTurn("assistant", `thought: ${largeText}`);

      // Compaction triggered
      expect(compactor.getContext().compactionCount).toBeGreaterThan(0);
      expect(compactor.getContext().recentTurns.length).toBeLessThanOrEqual(2);
      expect(compactor.getContext().summary).toContain("Compaction #1");
    });

    it("sandboxes speculative rules and allows rollback without side-effects", () => {
      const dataset = generateMLTrafficDataset(20);
      const sandbox = new CloakingSandbox(dataset);

      const baseline = sandbox.evaluate().metrics;
      const snapIndex = sandbox.createSnapshot();

      // Apply a speculative rule that alters behavior
      sandbox.registerRule({
        id: "speculative_test_rule",
        name: "Test Rule",
        description: "Test rule description",
        condition: () => true,
        adjustment: (score) => ({ ...score, score: 0, verdict: "valid" }),
        active: true,
      });

      const modified = sandbox.evaluate().metrics;
      expect(modified.falseNegativeCount).toBeGreaterThan(baseline.falseNegativeCount);

      // Rollback to snapshot
      const rolledBack = sandbox.rollbackToSnapshot(snapIndex);
      expect(rolledBack).toBe(true);

      const restored = sandbox.evaluate().metrics;
      expect(restored.falseNegativeCount).toBe(baseline.falseNegativeCount);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 2: Decoupled Brain vs Tools (60% Faster TTFT)
  // ─────────────────────────────────────────────────────────────
  describe("Step 2: Separate the brain from the tools to reach the first token 60% faster", () => {
    it("delivers first token in under 100ms via decoupled stream", async () => {
      const toolBus = new DeferredToolBus();
      toolBus.registerTool({
        name: "tune_threshold",
        description: "Adjust score cutoffs",
        schemaDigest: "sig_tune",
        parametersSummary: "{ invalid: number }",
        execute: async () => ({ ok: true, output: "done" }),
      });

      const brain = new DecoupledBrain(toolBus);
      let firstChunkTime = -1;
      let firstTokenEmitted = false;

      for await (const chunk of brain.streamReasoning("diagnose mistakes")) {
        if (chunk.isFirstToken) {
          firstChunkTime = chunk.elapsedMs;
          firstTokenEmitted = true;
          break;
        }
      }

      expect(firstTokenEmitted).toBe(true);
      expect(firstChunkTime).toBeLessThan(100);
    });

    it("proves >= 60% TTFT acceleration over monolithic schema injection", () => {
      const toolBus = new DeferredToolBus();

      // Register 12 enterprise cloaking defense tools
      for (let i = 0; i < 12; i++) {
        toolBus.registerTool({
          name: `defense_tool_${i}`,
          description: `Comprehensive defense tool inspection module #${i} with extended schema constraints`,
          schemaDigest: `sig_tool_${i}`,
          parametersSummary: `{ sampleId: string, ruleSet: string[], flags: Record<string, unknown> }`,
          execute: async () => ({ ok: true, output: "ok" }),
        });
      }

      const brain = new DecoupledBrain(toolBus);
      const benchmark = brain.benchmarkTTFT();

      expect(benchmark.monolithicTTFTMs).toBeGreaterThan(benchmark.decoupledTTFTMs);
      expect(benchmark.speedupPercentage).toBeGreaterThanOrEqual(60);
    });

    it("defers tool execution and resolves parameters only on demand", async () => {
      const toolBus = new DeferredToolBus();
      let toolExecuted = false;

      toolBus.registerTool({
        name: "test_deferred_tool",
        description: "Executes on demand",
        schemaDigest: "sig_defer",
        parametersSummary: "{ param: string }",
        execute: async (args) => {
          toolExecuted = true;
          return { ok: true, output: `Executed with ${args["param"]}` };
        },
      });

      expect(toolExecuted).toBe(false);
      const res = await toolBus.executeTool("test_deferred_tool", { param: "cloaking_check" }, null);
      expect(toolExecuted).toBe(true);
      expect(res.ok).toBe(true);
      expect(res.output).toContain("cloaking_check");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 3: Server-side Execution & Crash Recovery
  // ─────────────────────────────────────────────────────────────
  describe("Step 3: Run agents server-side and recover from crashes using logs", () => {
    it("writes every step to an append-only WAL with checksums", () => {
      const wal = new ExecutionWAL("test_exec_01");

      wal.append("SESSION_START", { host: "server-side" });
      wal.append("THOUGHT", { iteration: 1, thought: "Checking CGNAT mobile traffic" });
      wal.append("TOOL_INVOKED", { toolName: "inspect_mistakes" });
      wal.append("TOOL_COMPLETED", { toolName: "inspect_mistakes", ok: true });

      const entries = wal.getEntries();
      expect(entries.length).toBe(4);
      expect(entries[0].sequence).toBe(1);
      expect(entries[3].sequence).toBe(4);
      expect(entries[0].checksum).toBeDefined();
      expect(entries[3].checksum).toBeDefined();
    });

    it("fully recovers execution state and active context after simulated worker crash", () => {
      const runner = new DurableServerAgentRunner("crash_test_session");

      runner.logThought(1, "Analyzing noisy traffic");
      runner.logToolInvoke("filter_wastage", { active: true });
      runner.logToolComplete("filter_wastage", {
        ok: true,
        metrics: { correctCount: 50, accuracy: 0.5 },
      });
      runner.logCheckpoint("cp_1", {
        totalSamples: 100,
        wastageCount: 50,
        wastagePercentage: 0.5,
        evaluatedSamples: 50,
        correctCount: 50,
        accuracy: 0.5,
        falsePositiveCount: 5,
        falseNegativeCount: 5,
        precision: 0.8,
        recall: 0.8,
        f1Score: 0.8,
        wastedSpendMinorInt: 20000,
      });

      // Simulate unexpected crash
      const crashLog = runner.simulateCrash();

      // Worker dies; new worker hydrates state from crash log
      const { runner: newRunner, recoveredState } =
        DurableServerAgentRunner.recoverFromCrash(crashLog);

      expect(newRunner).toBeDefined();
      expect(recoveredState.executionId).toBe("crash_test_session");
      expect(recoveredState.iteration).toBe(1);
      expect(recoveredState.lastCheckpointId).toBe("cp_1");
      expect(recoveredState.currentMetrics.accuracy).toBe(0.5);

      // Verify WAL records recovery event
      const newEntries = newRunner.getWAL().getEntries();
      const lastEntry = newEntries[newEntries.length - 1];
      expect(lastEntry.eventType).toBe("RECOVERY_COMPLETED");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 4: Checkpoints, Replays and Retries
  // ─────────────────────────────────────────────────────────────
  describe("Step 4: Make failures recoverable with retries and replays instead of starting over", () => {
    it("rewinds to checkpoint on regression and branches strategy without resetting session", () => {
      const checkpointManager = new CheckpointManager();
      const sandbox = new CloakingSandbox();
      const compactor = new ContextCompactor({
        maxTokens: 500,
        compactionThreshold: 0.8,
        preserveRecentTurns: 3,
      });

      const initialMetrics = {
        totalSamples: 100,
        wastageCount: 50,
        wastagePercentage: 0.5,
        evaluatedSamples: 50,
        correctCount: 40,
        accuracy: 0.80,
        falsePositiveCount: 5,
        falseNegativeCount: 5,
        precision: 0.8,
        recall: 0.8,
        f1Score: 0.8,
        wastedSpendMinorInt: 15000,
      };

      // Checkpoint at step 1
      checkpointManager.saveCheckpoint(
        "cp_step_1",
        1,
        1,
        compactor.getContext(),
        initialMetrics,
        sandbox.getRulesState(),
      );

      // Simulate a failed/regressed step
      const rollback = checkpointManager.rollbackAndReplay(
        "cp_step_1",
        "Threshold dropped accuracy to 65%",
        sandbox,
        compactor,
      );

      expect(rollback.success).toBe(true);
      expect(rollback.attemptNumber).toBe(1);
      expect(rollback.restoredMetrics.accuracy).toBe(0.80);

      // Verify failure diagnosis was injected into context
      const turns = compactor.getContext().recentTurns;
      const lastTurn = turns[turns.length - 1];
      expect(lastTurn.content).toContain("ROLLBACK TO CHECKPOINT cp_step_1");
      expect(lastTurn.content).toContain("Threshold dropped accuracy to 65%");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 5: Memory Distillation and Continuous Learning
  // ─────────────────────────────────────────────────────────────
  describe("Step 5: Turn past execution logs into new memories so the system gets smarter over time", () => {
    it("distills procedural rules from completed WAL and recalls them on relevance", () => {
      const memoryStore = new MemoryStore();
      const distiller = new LogToMemoryDistiller(memoryStore);
      const wal = new ExecutionWAL("exec_distill_test");

      wal.append("TOOL_COMPLETED", {
        toolName: "add_cgnat_exception",
        ok: true,
      });
      wal.append("TOOL_COMPLETED", {
        toolName: "filter_wastage",
        ok: true,
      });
      wal.append("ROLLBACK_INITIATED", {
        failureReason: "Overly aggressive threshold blocked legitimate users",
      });

      const memories = distiller.distillFromWAL(wal);
      expect(memories.length).toBe(3);

      // Verify category classifications
      expect(memories.some((m) => m.category === "cgnat_exception")).toBe(true);
      expect(memories.some((m) => m.category === "wastage_pattern")).toBe(true);
      expect(memories.some((m) => m.category === "threshold_boundary")).toBe(true);

      // Test memory recall for a future query
      const recalled = memoryStore.recallMemories("mobile CGNAT fanout in Bangladesh", 2);
      expect(recalled.length).toBeGreaterThan(0);
      expect(recalled[0].category).toBe("cgnat_exception");
      expect(recalled[0].rule).toContain("Do not trigger IP_FANOUT penalty");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DOMAIN EVALUATION: ML Traffic Dataset & Cloaking Mistakes
  // ─────────────────────────────────────────────────────────────
  describe("Cloaking Domain: ML Traffic Input Evaluation & Mistake Diagnosis", () => {
    it("generates ML traffic dataset with exactly 50% wastage and diagnoses mistakes", () => {
      const dataset = generateMLTrafficDataset(100);
      expect(dataset.length).toBe(100);

      const wastageCount = dataset.filter((s) => s.isWastage).length;
      expect(wastageCount).toBe(50); // Exactly 50% wastage as specified by user

      const sandbox = new CloakingSandbox(dataset);
      const report = CloakingMistakeAnalyzer.analyzeMistakes(sandbox);

      // Verify mistakes identified in baseline
      expect(report.falsePositivesIdentified.length).toBeGreaterThan(0);
      expect(report.falsePositivesIdentified.some((fp) => fp.reason.includes("CGNAT"))).toBe(true);
      expect(report.falseNegativesIdentified.length).toBeGreaterThan(0);
      expect(report.wastageSharePercentage).toBe(50);
      expect(report.recommendedRules).toContain("rule_cgnat_mobile_tolerance");
    });

    it("runs complete end-to-end CloakingHarness lifecycle successfully", async () => {
      const harness = new CloakingHarness({
        loopConfig: { maxIterations: 5, targetAccuracy: 0.90 },
      });

      const report = await harness.run({
        simulateCrashAtStep: 2,
        simulateRegressionAtStep: 3,
      });

      expect(report.sessionId).toBeDefined();
      expect(report.crashedAndRecovered).toBe(true);
      expect(report.replayedAndRolledBack).toBe(true);
      expect(report.ttftBenchmark.speedupPercentage).toBeGreaterThanOrEqual(60);
      expect(report.optimizedMetrics.accuracy).toBeGreaterThan(report.initialMetrics.accuracy);
      expect(report.optimizedMetrics.accuracy).toBeGreaterThanOrEqual(0.90);
      expect(report.optimizedMetrics.wastedSpendMinorInt).toBeLessThan(
        report.initialMetrics.wastedSpendMinorInt,
      );
      expect(report.memoriesDistilled.length).toBeGreaterThan(0);
    });
  });
});
