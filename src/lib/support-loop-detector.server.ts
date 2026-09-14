/**
 * Support Agent Looping Detection & Trajectory Circuit Breaker.
 *
 * Protects customer conversations from pathological agent cycles:
 *  1. Identical / near-duplicate message repetition (user or bot repeating ≥ 3 turns).
 *  2. Cyclic tool invocation loops (repeatedly invoking failing tools with identical args).
 *  3. Intent oscillation loops (bouncing between unresolvable states).
 *
 * When a loop threshold is crossed, the circuit breaker:
 *  - Interrupts the trajectory cleanly.
 *  - Emits a polite, transparent de-escalation notice in EN/BN.
 *  - Auto-triggers human ticket escalation.
 *  - Penalizes trajectory reward in the RL feedback loop.
 */

import { incr, log } from "./observability.server";
import { en } from "./i18n-dict";

export type LoopDetectionResult = {
  loopDetected: boolean;
  loopType: "duplicate_user_turn" | "duplicate_bot_turn" | "cyclic_tool_failure" | "intent_oscillation" | null;
  repetitionCount: number;
  interventionReply: string | null;
  interventionReplyBn: string | null;
  shouldAutoEscalate: boolean;
};

export type TrajectoryTurn = {
  role: "customer" | "bot";
  message: string;
  intent?: string;
  toolCalls?: Array<{ tool: string; ok: boolean; args?: Record<string, unknown> }>;
};

/** Normalize string for near-duplicate fuzzy matching. */
export function normalizeForLoopCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compute token Jaccard similarity and containment ratio between two texts. */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeForLoopCheck(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeForLoopCheck(b).split(" ").filter(Boolean));

  if (!tokensA.size && !tokensB.size) return 1.0;
  if (!tokensA.size || !tokensB.size) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? intersection / union : 0.0;
  const containment = intersection / Math.min(tokensA.size, tokensB.size);

  // Return highest of Jaccard similarity or containment score for short conversational turns
  return Math.max(jaccard, containment >= 0.8 ? containment : 0.0);
}

/**
 * Real-time loop detection on the current conversation history.
 */
export function detectTrajectoryLoop(
  history: TrajectoryTurn[],
  currentMessage: string,
  currentRole: "customer" | "bot" = "customer",
): LoopDetectionResult {
  if (history.length < 2) {
    return {
      loopDetected: false,
      loopType: null,
      repetitionCount: 1,
      interventionReply: null,
      interventionReplyBn: null,
      shouldAutoEscalate: false,
    };
  }

  const normalizedCurrent = normalizeForLoopCheck(currentMessage);
  if (!normalizedCurrent) {
    return {
      loopDetected: false,
      loopType: null,
      repetitionCount: 1,
      interventionReply: null,
      interventionReplyBn: null,
      shouldAutoEscalate: false,
    };
  }

  // 1. Check duplicate turns from the same role
  const sameRoleTurns = history
    .filter((t) => t.role === currentRole)
    .slice(-4);

  let nearDuplicates = 1;
  for (const past of sameRoleTurns) {
    const pastNorm = normalizeForLoopCheck(past.message);
    if (pastNorm === normalizedCurrent || jaccardSimilarity(pastNorm, normalizedCurrent) >= 0.85) {
      nearDuplicates++;
    }
  }

  if (nearDuplicates >= 3) {
    const loopType = currentRole === "customer" ? "duplicate_user_turn" : "duplicate_bot_turn";
    incr("framique_ai_loop_detected_total", { type: loopType });
    log("warn", "ai.loop_circuit_broken", { type: loopType, count: nearDuplicates });

    return {
      loopDetected: true,
      loopType,
      repetitionCount: nearDuplicates,
      interventionReply:
        "I notice we might be going in circles. To ensure this is handled properly, I am connecting you directly with a human specialist right now.",
      interventionReplyBn:
        "আমি লক্ষ্য করছি একই কথা বারবার ঘুরে আসছে। আপনার সমস্যা দ্রুত সমাধানের জন্য আমি সরাসরি আমাদের বিশেষজ্ঞ দলের সাথে সংযোগ করে দিচ্ছি।",
      shouldAutoEscalate: true,
    };
  }

  // 2. Check cyclic tool failure loop (e.g. 2 consecutive failed tool executions)
  const recentToolCalls = history
    .flatMap((t) => t.toolCalls ?? [])
    .slice(-3);

  const consecutiveFails = recentToolCalls.filter((c) => !c.ok).length;
  if (consecutiveFails >= 2) {
    incr("framique_ai_loop_detected_total", { type: "cyclic_tool_failure" });
    log("warn", "ai.loop_circuit_broken", { type: "cyclic_tool_failure", count: consecutiveFails });

    return {
      loopDetected: true,
      loopType: "cyclic_tool_failure",
      repetitionCount: consecutiveFails,
      interventionReply:
        "I'm encountering difficulty accessing the necessary live records repeatedly. Let me immediately open a priority ticket for our support desk.",
      interventionReplyBn:
        "প্রয়োজনীয় রেকর্ড বারবার অ্যাক্সেস করতে সমস্যা হচ্ছে। আমি আমাদের সহায়তা ডেস্কে একটি জরুরি টিকিট তৈরি করছি।",
      shouldAutoEscalate: true,
    };
  }

  // 3. Check intent oscillation (e.g. cycling between other and order_status 4+ times without progress)
  const recentIntents = history
    .map((t) => t.intent)
    .filter(Boolean)
    .slice(-5);

  if (recentIntents.length >= 4) {
    const uniqueIntents = new Set(recentIntents);
    // If bouncing strictly between 2 intents back and forth
    if (uniqueIntents.size === 2 && recentIntents[0] === recentIntents[2] && recentIntents[1] === recentIntents[3]) {
      incr("framique_ai_loop_detected_total", { type: "intent_oscillation" });
      log("warn", "ai.loop_circuit_broken", { type: "intent_oscillation" });

      return {
        loopDetected: true,
        loopType: "intent_oscillation",
        repetitionCount: 4,
        interventionReply:
          "It seems we're switching between different questions without finding a solution. Let's get our support team to assist you directly.",
        interventionReplyBn:
          "মনে হচ্ছে আমরা সমাধান না পেয়ে বিভিন্ন প্রশ্নের মধ্যে ঘুরছি। আসুন আমাদের সহায়তা দলের সাথে সরাসরি যোগাযোগ করি।",
        shouldAutoEscalate: true,
      };
    }
  }

  return {
    loopDetected: false,
    loopType: null,
    repetitionCount: 1,
    interventionReply: null,
    interventionReplyBn: null,
    shouldAutoEscalate: false,
  };
}
