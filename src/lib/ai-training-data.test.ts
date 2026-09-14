import { describe, expect, it, beforeEach } from "vitest";
import {
  captureTrainingTurn,
  clearInMemoryTrainingData,
  exportDpoDataset,
  exportSftDataset,
  getCsatAnalytics,
  updateTurnCsat,
} from "./ai-training-data.server";

describe("Phase 9.5 & 9.6 — Continuous Training Data Collection Pipeline (RLHF & SFT/DPO)", () => {
  const TEST_MERCHANT = "00000000-0000-0000-0000-000000000099";

  beforeEach(() => {
    clearInMemoryTrainingData();
  });

  it("redacts PII from user turns and agent replies before saving", async () => {
    const rawUser = "My phone is 01712345678 and email is customer@gmail.com. Where is order?";
    const rawReply = "We will call you on 01712345678 regarding your shipment.";

    const turn = await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_test_101",
      userMessage: rawUser,
      agentReply: rawReply,
      latencyMs: 850,
    });

    // Verify PII is redacted
    expect(turn.userTurn).not.toContain("01712345678");
    expect(turn.userTurn).not.toContain("customer@gmail.com");
    expect(turn.userTurn).toContain("[phone redacted]");
    expect(turn.userTurn).toContain("[email redacted]");

    expect(turn.agentReply).not.toContain("01712345678");
    expect(turn.agentReply).toContain("[phone redacted]");
  });

  it("captures turn metadata, latency, and computes initial RL reward", async () => {
    const turn = await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_test_102",
      userMessage: "How do I configure SteadFast webhook?",
      contextPassages: [{ title: "SteadFast Courier", body: "Configured under Admin Shipping." }],
      agentReply: "Configure SteadFast webhook in Admin -> Shipping with your API key.",
      latencyMs: 1100,
      grounded: true,
    });

    expect(turn.id).toBeTruthy();
    expect(turn.grounded).toBe(true);
    expect(turn.rewardScore).toBeGreaterThan(0);
    expect(turn.contextPassages).toHaveLength(1);
  });

  it("updates CSAT rating, qualitative review, and recomputes reward score", async () => {
    const convId = "conv_test_103";
    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: convId,
      userMessage: "How to accept bKash payments?",
      agentReply: "Go to Admin -> Payments -> bKash and enter your App Key.",
      latencyMs: 900,
      grounded: true,
    });

    // Customer submits a 5-star review
    const res = await updateTurnCsat(convId, 5, "Super fast and helpful answer!");
    expect(res.updatedCount).toBeGreaterThan(0);

    const sftTurns = await exportSftDataset({ minRating: 4 });
    expect(sftTurns.length).toBeGreaterThan(0);
  });

  it("exports high-quality turns in ChatML JSONL format (CSAT >= 4)", async () => {
    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_good_1",
      userMessage: "How to setup custom domain?",
      agentReply: "Add an A record pointing to Framique ingress IP in your DNS provider.",
      csatRating: 5,
      grounded: true,
    });

    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_poor_1",
      userMessage: "Cancel order 99",
      agentReply: "Cannot cancel order.",
      csatRating: 2,
      grounded: false,
    });

    const chatmlDataset = await exportSftDataset({
      format: "chatml",
      minRating: 4,
    });

    // Only good conversation exported
    expect(chatmlDataset.length).toBe(1);
    const item = chatmlDataset[0] as { messages: Array<{ role: string; content: string }> };
    expect(item.messages).toHaveLength(3);
    expect(item.messages[0].role).toBe("system");
    expect(item.messages[1].role).toBe("user");
    expect(item.messages[2].role).toBe("assistant");
    expect(item.messages[2].content).toContain("Framique ingress IP");
  });

  it("exports turns in ShareGPT JSONL format", async () => {
    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_good_2",
      userMessage: "Tell me about Page Builder AST",
      agentReply: "Framique Page Builder represents storefront layouts as a JSON AST.",
      csatRating: 5,
      grounded: true,
    });

    const sharegptDataset = await exportSftDataset({
      format: "sharegpt",
      minRating: 4,
    });

    expect(sharegptDataset.length).toBe(1);
    const item = sharegptDataset[0] as { conversations: Array<{ from: string; value: string }> };
    expect(item.conversations[0].from).toBe("system");
    expect(item.conversations[1].from).toBe("human");
    expect(item.conversations[2].from).toBe("gpt");
  });

  it("exports paired preferences for Direct Preference Optimization (DPO)", async () => {
    // 1. High-reward response (Chosen)
    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_pair_chosen",
      userMessage: "How to track parcel?",
      agentReply: "You can track your parcel anytime from your customer account dashboard.",
      csatRating: 5,
      grounded: true,
    });

    // 2. Low-reward response (Rejected)
    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_pair_rejected",
      userMessage: "How to track parcel?",
      agentReply: "I don't know.",
      csatRating: 1,
      grounded: false,
      loopDetected: true,
    });

    const dpoPairs = await exportDpoDataset({ merchantId: TEST_MERCHANT });
    expect(dpoPairs.length).toBeGreaterThan(0);

    const pair = dpoPairs[0];
    expect(pair.prompt).toContain("How to track parcel?");
    expect(pair.chosen).toContain("customer account dashboard");
    expect(pair.rejected).toContain("I don't know");
    expect(pair.margin).toBeGreaterThan(0);
  });

  it("computes CSAT analytics, rating distribution, and review sentiment", async () => {
    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_csat_1",
      userMessage: "Great service",
      agentReply: "Thank you!",
      csatRating: 5,
      csatReview: "Excellent support experience!",
    });

    await captureTrainingTurn({
      merchantId: TEST_MERCHANT,
      conversationId: "conv_csat_2",
      userMessage: "Good answer",
      agentReply: "Glad to help!",
      csatRating: 4,
      csatReview: "Helpful and polite.",
    });

    const analytics = await getCsatAnalytics(TEST_MERCHANT);
    expect(analytics.totalRatings).toBe(2);
    expect(analytics.averageRating).toBe(4.5);
    expect(analytics.distribution.stars5).toBe(1);
    expect(analytics.distribution.stars4).toBe(1);
    expect(analytics.recentReviews.length).toBe(2);
    expect(analytics.recentReviews[0].review).toContain("Excellent support");
  });

  describe("Phase 10.2 — ML Data Immunity & Decoupling Shield", () => {
    it("preserves ML training data and cohort hash when merchant is deleted or unlinked", async () => {
      const DOOMED_MERCHANT = "99999999-9999-9999-9999-999999999999";

      // 1. Capture high-value training turns for the merchant
      const turn1 = await captureTrainingTurn({
        merchantId: DOOMED_MERCHANT,
        conversationId: "conv_doomed_001",
        userMessage: "How do I request return pickup via SteadFast?",
        agentReply: "Go to Orders -> Select Order -> Click Book SteadFast Return Pickup.",
        csatRating: 5,
        csatReview: "Saved my day, perfect instructions!",
        grounded: true,
      });

      expect(turn1.merchantCohortHash).toBeTruthy();
      expect(turn1.anonymizedActorToken).toMatch(/^act_/);

      // 2. Simulate merchant deletion / GDPR account purge
      const { unlinkedCount, preservedCohortHash } =
        await (await import("./ai-training-data.server")).disassociateTenantFromTrainingData(DOOMED_MERCHANT);

      expect(unlinkedCount).toBe(1);
      expect(preservedCohortHash).toBe(turn1.merchantCohortHash);

      // 3. Verify ML dataset export STILL includes this high-value training turn!
      // ML data has immunity from relational table deletion!
      const allSft = await exportSftDataset({ format: "chatml", minRating: 4 });
      const preservedTurn = allSft.find(
        (item) => "messages" in item && item.messages.some((m) => m.content.includes("Book SteadFast Return Pickup")),
      );

      expect(preservedTurn).toBeDefined();
      if (preservedTurn && "messages" in preservedTurn) {
        expect(preservedTurn.messages[1].content).toContain("SteadFast");
      }
      // Merchant entity is gone, but the ML asset is permanently safe!
    });
  });
});

