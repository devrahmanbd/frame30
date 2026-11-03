/**
 * Cloaking Defense & Agentic Harness — Master Facade.
 *
 * Implements the 5 core workshop architectural principles:
 *  Step 1 - Manage loops, context, and sandboxing through a harness
 *  Step 2 - Separate the brain from the tools to reach the first token 60% faster
 *  Step 3 - Run agents server-side and recover from crashes using logs
 *  Step 4 - Make failures recoverable with retries and replays instead of starting over
 *  Step 5 - Turn past execution logs into new memories so the system gets smarter over time
 */

import {
  CloakingSandbox,
  type SpeculativeRule,
} from "./sandbox";
import {
  HarnessLoopManager,
  ContextCompactor,
} from "./loop-manager";
import {
  DecoupledBrain,
  DeferredToolBus,
} from "./fast-brain";
import {
  DurableServerAgentRunner,
  ExecutionWAL,
} from "./durable-runner";
import {
  CheckpointManager,
} from "./checkpoint-replay";
import {
  MemoryStore,
  LogToMemoryDistiller,
} from "./memory-distillation";
import {
  CloakingMistakeAnalyzer,
  generateMLTrafficDataset,
  type MistakeAnalysisReport,
} from "./cloaking-evaluator";
import type {
  CloakingDatasetSample,
  DatasetMetrics,
  HarnessLoopConfig,
  ContextBudget,
  DistilledMemory,
  TTFTComparison,
} from "./types";

export type HarnessRunOptions = {
  loopConfig?: Partial<HarnessLoopConfig>;
  contextBudget?: Partial<ContextBudget>;
  simulateCrashAtStep?: number;
  simulateRegressionAtStep?: number;
};

export type HarnessRunReport = {
  sessionId: string;
  initialMetrics: DatasetMetrics;
  optimizedMetrics: DatasetMetrics;
  mistakesDiagnosed: MistakeAnalysisReport;
  ttftBenchmark: TTFTComparison;
  crashedAndRecovered: boolean;
  replayedAndRolledBack: boolean;
  memoriesDistilled: DistilledMemory[];
  appliedRuleIds: string[];
  iterations: number;
  walEventCount: number;
};

export class CloakingHarness {
  private sandbox: CloakingSandbox;
  private loopManager: HarnessLoopManager;
  private contextCompactor: ContextCompactor;
  private toolBus: DeferredToolBus;
  private brain: DecoupledBrain;
  private runner: DurableServerAgentRunner;
  private checkpointManager: CheckpointManager;
  private memoryStore: MemoryStore;
  private memoryDistiller: LogToMemoryDistiller;

  constructor(options?: {
    samples?: CloakingDatasetSample[];
    loopConfig?: Partial<HarnessLoopConfig>;
    contextBudget?: Partial<ContextBudget>;
    memoryStore?: MemoryStore;
  }) {
    const dataset = options?.samples ?? generateMLTrafficDataset(100);
    this.sandbox = new CloakingSandbox(dataset);

    const fullLoopConfig: HarnessLoopConfig = {
      maxIterations: 10,
      cycleDetectionWindow: 4,
      targetAccuracy: 0.90,
      maxWastedSpendMinorInt: 5000,
      ...options?.loopConfig,
    };
    this.loopManager = new HarnessLoopManager(fullLoopConfig);

    const fullContextBudget: ContextBudget = {
      maxTokens: 1000,
      compactionThreshold: 0.75,
      preserveRecentTurns: 3,
      ...options?.contextBudget,
    };
    this.contextCompactor = new ContextCompactor(fullContextBudget);

    this.toolBus = new DeferredToolBus();
    this.registerStandardTools();

    this.brain = new DecoupledBrain(this.toolBus);
    this.runner = new DurableServerAgentRunner();
    this.checkpointManager = new CheckpointManager();

    this.memoryStore = options?.memoryStore ?? new MemoryStore();
    this.memoryDistiller = new LogToMemoryDistiller(this.memoryStore);
  }

  private registerStandardTools(): void {
    this.toolBus.registerTool({
      name: "inspect_mistakes",
      description: "Analyzes false positives and false negatives in the dataset",
      schemaDigest: "sig_inspect_mistakes",
      parametersSummary: "{ maxInspect?: number }",
      execute: async () => {
        const report = CloakingMistakeAnalyzer.analyzeMistakes(this.sandbox);
        return {
          ok: true,
          output: `Identified ${report.falsePositivesIdentified.length} false positives and ${report.falseNegativesIdentified.length} false negatives.`,
        };
      },
    });

    this.toolBus.registerTool({
      name: "filter_wastage",
      description: "Screens out noisy zero-signal crawler traffic (~50% of ML data)",
      schemaDigest: "sig_filter_wastage",
      parametersSummary: "{ active: boolean }",
      execute: async (args) => {
        const active = Boolean(args["active"] ?? true);
        this.sandbox.setWastageFilter(active);
        const { metrics } = this.sandbox.evaluate();
        return {
          ok: true,
          output: `Wastage filter set to ${active}. Screened out ${metrics.wastageCount} noisy samples.`,
          metricsUpdate: metrics,
        };
      },
    });

    this.toolBus.registerTool({
      name: "add_cgnat_exception",
      description: "Exempts Bangladeshi mobile CGNAT shoppers from IP_FANOUT penalty",
      schemaDigest: "sig_cgnat_exception",
      parametersSummary: "{}",
      execute: async () => {
        const rule = CloakingMistakeAnalyzer.createCGNATExemptionRule();
        this.sandbox.registerRule(rule);
        const { metrics } = this.sandbox.evaluate();
        return {
          ok: true,
          output: `Registered ${rule.name}. Accuracy updated to ${(metrics.accuracy * 100).toFixed(1)}%.`,
          metricsUpdate: metrics,
        };
      },
    });

    this.toolBus.registerTool({
      name: "add_headless_bot_block",
      description: "Enforces decisive block on stealth datacenter bots with zero interactions",
      schemaDigest: "sig_headless_block",
      parametersSummary: "{}",
      execute: async () => {
        const rule = CloakingMistakeAnalyzer.createHeadlessZeroInteractionRule();
        this.sandbox.registerRule(rule);
        const { metrics } = this.sandbox.evaluate();
        return {
          ok: true,
          output: `Registered ${rule.name}. True positives updated.`,
          metricsUpdate: metrics,
        };
      },
    });
  }

  /**
   * Runs the complete 5-step optimization lifecycle.
   */
  public async run(options?: HarnessRunOptions): Promise<HarnessRunReport> {
    // Initial evaluation & baseline mistake diagnosis
    const mistakesDiagnosed = CloakingMistakeAnalyzer.analyzeMistakes(this.sandbox);
    const initialMetrics = structuredClone(mistakesDiagnosed.baselineMetrics);

    // Step 2 TTFT benchmark
    const ttftBenchmark = this.brain.benchmarkTTFT();

    // Step 5 Recall: Check for existing memories matching our context
    const recalledMemories = this.memoryStore.recallMemories("cgnat mobile wastage noise");
    if (recalledMemories.length > 0) {
      this.contextCompactor.addTurn(
        "system",
        `[RECALLED MEMORIES]: ${recalledMemories.map((m) => m.rule).join(" | ")}`,
      );
    }

    let crashedAndRecovered = false;
    let replayedAndRolledBack = false;

    // Checkpoint 0: Save baseline
    const initialCheckpoint = this.checkpointManager.saveCheckpoint(
      "cp_baseline",
      1,
      0,
      this.contextCompactor.getContext(),
      initialMetrics,
      this.sandbox.getRulesState(),
    );
    this.runner.logCheckpoint(initialCheckpoint.id, initialMetrics);

    // Execution loop
    let currentMetrics = initialMetrics;
    let step = 0;

    while (step < (options?.loopConfig?.maxIterations ?? 10)) {
      step++;
      const prompt = `Step ${step}: Improve cloaking accuracy from ${(currentMetrics.accuracy * 100).toFixed(1)}%. Wastage share: ${mistakesDiagnosed.wastageSharePercentage}%.`;
      this.contextCompactor.addTurn("user", prompt);

      // Step 2: Stream reasoning from fast decoupled brain
      let chosenAction = { type: "conclude", thought: "", parameters: {} };
      for await (const chunk of this.brain.streamReasoning(
        step === 1 ? "diagnose wastage" : step === 2 ? "rule cgnat" : "rule bot",
      )) {
        if (chunk.isFirstToken) {
          this.runner.logThought(step, `First token streamed in ${chunk.elapsedMs}ms`);
        }
      }

      // Step 3: Server-side Crash Simulation and Recovery check
      if (options?.simulateCrashAtStep && step === options.simulateCrashAtStep && !crashedAndRecovered) {
        const crashLog = this.runner.simulateCrash();
        const { runner: newRunner, recoveredState } = DurableServerAgentRunner.recoverFromCrash(crashLog);
        this.runner = newRunner;
        crashedAndRecovered = true;
        this.contextCompactor.addTurn(
          "system",
          `[CRASH RECOVERED]: Restored state at iteration ${recoveredState.iteration} with sequence ${recoveredState.lastSequence}.`,
        );
      }

      // Step 4: Failure & Replay Simulation check
      if (options?.simulateRegressionAtStep && step === options.simulateRegressionAtStep && !replayedAndRolledBack) {
        // Deliberately simulate an experimental threshold that causes regression
        this.sandbox.setThresholds(40, 30); // Very low thresholds causing false positives
        const { metrics: regressedMetrics } = this.sandbox.evaluate();

        // Fail-safe check triggers rollback to checkpoint 0
        this.runner.getWAL().append("TOOL_FAILED", {
          error: "Threshold regression: accuracy dropped below baseline",
          regressedMetrics,
        });

        this.checkpointManager.rollbackAndReplay(
          initialCheckpoint.id,
          "Threshold reduction dropped accuracy and increased false positives",
          this.sandbox,
          this.contextCompactor,
        );
        replayedAndRolledBack = true;
        currentMetrics = initialCheckpoint.metrics;
        continue;
      }

      // Action execution sequence based on step
      if (step === 1) {
        this.runner.logToolInvoke("filter_wastage", { active: true });
        const res = await this.toolBus.executeTool("filter_wastage", { active: true }, this.sandbox);
        this.runner.logToolComplete("filter_wastage", { ok: res.ok, metrics: res.metricsUpdate });
        if (res.metricsUpdate) currentMetrics = { ...currentMetrics, ...res.metricsUpdate };
      } else if (step === 2) {
        this.runner.logToolInvoke("add_cgnat_exception", {});
        const res = await this.toolBus.executeTool("add_cgnat_exception", {}, this.sandbox);
        this.runner.logToolComplete("add_cgnat_exception", { ok: res.ok, ruleId: "rule_cgnat_mobile_tolerance", metrics: res.metricsUpdate });
        if (res.metricsUpdate) currentMetrics = { ...currentMetrics, ...res.metricsUpdate };
      } else {
        // Step 3 or replay branch after rollback: Apply headless bot block & finalize
        this.sandbox.setWastageFilter(true);
        this.sandbox.registerRule(CloakingMistakeAnalyzer.createCGNATExemptionRule());
        this.sandbox.registerRule(CloakingMistakeAnalyzer.createHeadlessZeroInteractionRule());
        const evalRes = this.sandbox.evaluate();
        currentMetrics = evalRes.metrics;
        this.runner.logToolComplete("add_headless_bot_block", {
          ok: true,
          ruleId: "rule_zero_interaction_headless_block",
          metrics: currentMetrics,
        });
      }

      // Checkpoint at step boundary
      const cpId = `cp_step_${step}`;
      const cp = this.checkpointManager.saveCheckpoint(
        cpId,
        step + 1,
        step,
        this.contextCompactor.getContext(),
        currentMetrics,
        this.sandbox.getRulesState(),
      );
      this.runner.logCheckpoint(cp.id, currentMetrics);

      // Check loop termination criteria (unless scheduled simulations are pending)
      const pendingCrash = options?.simulateCrashAtStep && !crashedAndRecovered;
      const pendingRegression = options?.simulateRegressionAtStep && !replayedAndRolledBack;
      const termination = this.loopManager.checkTermination(currentMetrics);
      if (termination.shouldTerminate && !pendingCrash && !pendingRegression) {
        this.runner.getWAL().append("SESSION_CONCLUDED", {
          reason: termination.reason,
          message: termination.message,
          finalAccuracy: currentMetrics.accuracy,
        });
        break;
      }
    }

    // Step 5: Distill memories from the completed WAL
    const distilledMemories = this.memoryDistiller.distillFromWAL(this.runner.getWAL());

    return {
      sessionId: this.runner.getWAL().getExecutionId(),
      initialMetrics,
      optimizedMetrics: currentMetrics,
      mistakesDiagnosed,
      ttftBenchmark,
      crashedAndRecovered,
      replayedAndRolledBack,
      memoriesDistilled: distilledMemories,
      appliedRuleIds: this.sandbox.getActiveRuleIds(),
      iterations: step,
      walEventCount: this.runner.getWAL().getEntryCount(),
    };
  }

  public getSandbox(): CloakingSandbox {
    return this.sandbox;
  }

  public getMemoryStore(): MemoryStore {
    return this.memoryStore;
  }
}

export * from "./types";
export * from "./sandbox";
export * from "./loop-manager";
export * from "./fast-brain";
export * from "./durable-runner";
export * from "./checkpoint-replay";
export * from "./memory-distillation";
export * from "./cloaking-evaluator";
