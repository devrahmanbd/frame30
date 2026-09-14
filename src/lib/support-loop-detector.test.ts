import { describe, expect, it } from "vitest";
import {
  detectTrajectoryLoop,
  jaccardSimilarity,
  normalizeForLoopCheck,
  type TrajectoryTurn,
} from "./support-loop-detector.server";

describe("Phase 9 Looping Detection & Circuit Breaker", () => {
  it("normalizes text for near-duplicate loop comparison", () => {
    const raw = "Where is my parcel? #1001!";
    const norm = normalizeForLoopCheck(raw);
    expect(norm).toBe("where is my parcel 1001");
  });

  it("calculates Jaccard token similarity accurately", () => {
    const s1 = "Where is my order?";
    const s2 = "Where is my order right now?";
    const s3 = "How do I configure bKash payment?";

    const simHigh = jaccardSimilarity(s1, s2);
    const simLow = jaccardSimilarity(s1, s3);

    expect(simHigh).toBeGreaterThan(0.6);
    expect(simLow).toBeLessThan(0.1);
    expect(jaccardSimilarity("same text", "same text")).toBe(1.0);
  });

  it("does not trigger loop breaker on normal sequential dialog", () => {
    const history: TrajectoryTurn[] = [
      { role: "customer", message: "Hi, I have a question about delivery." },
      { role: "bot", message: "Hello! What would you like to know?" },
      { role: "customer", message: "Do you deliver to Sylhet?" },
      { role: "bot", message: "Yes, we ship nationwide across Bangladesh." },
    ];

    const result = detectTrajectoryLoop(history, "How much is the shipping fee?");
    expect(result.loopDetected).toBe(false);
    expect(result.loopType).toBeNull();
    expect(result.shouldAutoEscalate).toBe(false);
  });

  it("breaks loop when customer repeats near-identical query 3 times", () => {
    const history: TrajectoryTurn[] = [
      { role: "customer", message: "Where is my parcel?" },
      { role: "bot", message: "Please provide your order number." },
      { role: "customer", message: "Where is my parcel right now?" },
      { role: "bot", message: "I need your order number to look it up." },
    ];

    // Third repetition of the same question
    const result = detectTrajectoryLoop(history, "where is my parcel??", "customer");
    expect(result.loopDetected).toBe(true);
    expect(result.loopType).toBe("duplicate_user_turn");
    expect(result.repetitionCount).toBeGreaterThanOrEqual(3);
    expect(result.shouldAutoEscalate).toBe(true);
    expect(result.interventionReply).toContain("going in circles");
    expect(result.interventionReplyBn).toContain("বারবার ঘুরে আসছে");
  });

  it("breaks loop when bot generates duplicate canned fallback replies", () => {
    const history: TrajectoryTurn[] = [
      { role: "bot", message: "I could not find information on that." },
      { role: "customer", message: "Can you check again?" },
      { role: "bot", message: "I could not find information on that." },
      { role: "customer", message: "Please try once more." },
    ];

    const result = detectTrajectoryLoop(history, "I could not find information on that.", "bot");
    expect(result.loopDetected).toBe(true);
    expect(result.loopType).toBe("duplicate_bot_turn");
    expect(result.shouldAutoEscalate).toBe(true);
  });

  it("detects cyclic tool failure loop", () => {
    const history: TrajectoryTurn[] = [
      {
        role: "bot",
        message: "Checking database...",
        toolCalls: [{ tool: "orders.lookup", ok: false }],
      },
      {
        role: "bot",
        message: "Retrying lookup...",
        toolCalls: [{ tool: "orders.lookup", ok: false }],
      },
    ];

    const result = detectTrajectoryLoop(history, "still checking...", "bot");
    expect(result.loopDetected).toBe(true);
    expect(result.loopType).toBe("cyclic_tool_failure");
    expect(result.shouldAutoEscalate).toBe(true);
  });

  it("detects intent oscillation loop between alternating states", () => {
    const history: TrajectoryTurn[] = [
      { role: "customer", message: "check status", intent: "order_status" },
      { role: "customer", message: "tell me more", intent: "other" },
      { role: "customer", message: "check status again", intent: "order_status" },
      { role: "customer", message: "random question", intent: "other" },
    ];

    const result = detectTrajectoryLoop(history, "checking again", "customer");
    expect(result.loopDetected).toBe(true);
    expect(result.loopType).toBe("intent_oscillation");
    expect(result.shouldAutoEscalate).toBe(true);
  });
});
