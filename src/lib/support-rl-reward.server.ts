/**
 * Multi-Objective Reinforcement Learning (RL) Reward Modeling & Atropos Environment.
 *
 * Implements a principled reward function for agentic customer support trajectories:
 *
 *   R(τ) = w_csat * R_csat
 *        + w_ground * R_ground
 *        + w_tool * R_tool
 *        - w_lat * R_lat
 *        - w_pen * (R_guardrail + R_loop)
 *
 * Used for:
 *  1. Scoring conversational turns for SFT dataset filtering.
 *  2. Synthesizing Direct Preference Optimization (DPO) and KTO/ORPO pairs.
 *  3. In-situ trajectory evaluation within the Atropos evaluation harness.
 */

export type RewardComponents = {
  csatReward: number;         // [-1.0, +1.0]
  groundingReward: number;    // [-0.3, +0.3]
  toolReward: number;         // [-0.2, +0.25]
  latencyPenalty: number;     // [0.0, 0.2]
  guardrailPenalty: number;   // 0.0 or 1.0
  loopPenalty: number;        // 0.0 or 0.8
  resolutionBonus: number;    // 0.0 or 0.2
};

export type TrajectoryStep = {
  userMessage: string;
  agentReply: string;
  grounded: boolean;
  toolCalls?: Array<{ tool: string; ok: boolean }>;
  latencyMs?: number;
  guardrailBlocked?: boolean;
  loopDetected?: boolean;
  csatRating?: number | null; // 1..5
  actionCompleted?: "ticket" | "callback" | "answered";
};

export type EvaluatedReward = {
  totalReward: number;        // [-2.0, +2.0]
  normalizedScore: number;    // [0.0, 1.0]
  components: RewardComponents;
  label: "high_quality" | "acceptable" | "low_quality" | "rejected";
};

/** Weights for composite scalar reward */
export const REWARD_WEIGHTS = {
  csat: 0.45,
  grounding: 0.20,
  tool: 0.15,
  latency: 0.05,
  guardrail: 0.50,
  loop: 0.40,
  resolution: 0.15,
} as const;

/**
 * Compute multi-objective scalar reward for a single agent turn or completed trajectory.
 */
export function computeTrajectoryReward(step: TrajectoryStep): EvaluatedReward {
  // 1. CSAT Reward Component (if present)
  let csatReward = 0.0;
  if (step.csatRating !== undefined && step.csatRating !== null) {
    // 5 -> +1.0, 4 -> +0.5, 3 -> 0.0, 2 -> -0.5, 1 -> -1.0
    csatReward = (step.csatRating - 3) / 2;
  }

  // 2. Grounding Component
  const groundingReward = step.grounded ? 0.3 : -0.3;

  // 3. Tool Correctness Component
  let toolReward = 0.0;
  if (step.toolCalls && step.toolCalls.length > 0) {
    const successful = step.toolCalls.filter((c) => c.ok).length;
    const total = step.toolCalls.length;
    toolReward = successful === total ? 0.25 : -0.20;
  }

  // 4. Latency Penalty Component
  let latencyPenalty = 0.0;
  if (step.latencyMs !== undefined) {
    if (step.latencyMs > 5000) latencyPenalty = 0.20;
    else if (step.latencyMs > 3000) latencyPenalty = 0.10;
    else if (step.latencyMs < 1200) latencyPenalty = 0.0;
  }

  // 5. Penalties
  const guardrailPenalty = step.guardrailBlocked ? 1.0 : 0.0;
  const loopPenalty = step.loopDetected ? 0.8 : 0.0;

  // 6. Action Resolution Bonus
  const resolutionBonus =
    step.actionCompleted === "ticket" || step.actionCompleted === "callback" || step.actionCompleted === "answered"
      ? 0.20
      : 0.0;

  // Composite weighted score
  const totalReward =
    REWARD_WEIGHTS.csat * csatReward +
    REWARD_WEIGHTS.grounding * groundingReward +
    REWARD_WEIGHTS.tool * toolReward -
    REWARD_WEIGHTS.latency * latencyPenalty -
    REWARD_WEIGHTS.guardrail * guardrailPenalty -
    REWARD_WEIGHTS.loop * loopPenalty +
    REWARD_WEIGHTS.resolution * resolutionBonus;

  // Normalized to [0.0, 1.0] for easy thresholding
  const clampedTotal = Math.max(-2.0, Math.min(2.0, totalReward));
  const normalizedScore = Number(((clampedTotal + 2.0) / 4.0).toFixed(4));

  let label: EvaluatedReward["label"] = "acceptable";
  if (step.guardrailBlocked || step.loopDetected || totalReward < -0.3) {
    label = "rejected";
  } else if (totalReward >= 0.35 || (step.csatRating && step.csatRating >= 4)) {
    label = "high_quality";
  } else if (totalReward < 0.0) {
    label = "low_quality";
  }

  return {
    totalReward: Number(totalReward.toFixed(4)),
    normalizedScore,
    components: {
      csatReward,
      groundingReward,
      toolReward,
      latencyPenalty,
      guardrailPenalty,
      loopPenalty,
      resolutionBonus,
    },
    label,
  };
}

/**
 * Atropos-aligned RL Environment Step Contract.
 */
export type AtroposEnvState = {
  conversationId: string;
  turnIndex: number;
  history: TrajectoryStep[];
  isDone: boolean;
};

export type AtroposAction = {
  intent: string;
  toolCall?: { tool: string; args: Record<string, unknown> };
  replyText: string;
};

export type AtroposEnvStepResult = {
  nextState: AtroposEnvState;
  reward: number;
  done: boolean;
  info: EvaluatedReward;
};

/**
 * Construct an Atropos step transition given state and agent action.
 */
export function stepAtroposEnv(
  currentState: AtroposEnvState,
  action: AtroposAction,
  stepObs: Omit<TrajectoryStep, "agentReply">,
): AtroposEnvStepResult {
  const fullStep: TrajectoryStep = {
    ...stepObs,
    agentReply: action.replyText,
  };

  const rewardEval = computeTrajectoryReward(fullStep);
  const done = currentState.isDone || fullStep.guardrailBlocked || fullStep.loopDetected || (currentState.turnIndex >= 6);

  const nextState: AtroposEnvState = {
    conversationId: currentState.conversationId,
    turnIndex: currentState.turnIndex + 1,
    history: [...currentState.history, fullStep],
    isDone: done ?? false,
  };

  return {
    nextState,
    reward: rewardEval.totalReward,
    done: Boolean(done),
    info: rewardEval,
  };
}
