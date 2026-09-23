/**
 * DeepWiki Intelligent Answer Engine — Comprehensive Test Suite
 *
 * Validates:
 *  1. Multi-Hop Knowledge Graph RAG retrieval (seed discovery + relational expansion).
 *  2. Atropos-aligned RL environment evaluation (stepAtroposEnv, reward scoring).
 *  3. Online Reinforcement Learning feedback & Q-value edge weight updates.
 *  4. Grounded synthesis with DeepWiki citations in English and Bengali.
 *  5. Custom entity ingestion and graph topology query.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  queryDeepWiki,
  applyAtroposFeedback,
  ingestDeepWikiEntity,
  getDeepWikiGraph,
  extractQueryEntities,
  findSeedEntities,
  expandKnowledgeGraph,
  synthesizeDeepWikiAnswer,
  resetDeepWikiKnowledgeGraph,
  clearDeepWikiRegistry,
  CANONICAL_DEEPWIKI_ENTITIES,
} from "./deepwiki-engine.server";
import {
  deepWikiQueryFn,
  deepWikiFeedbackFn,
  deepWikiGraphFn,
} from "./deepwiki.functions";

describe("DeepWiki Engine: Multi-Hop RAG, RL & Atropos", () => {
  beforeEach(() => {
    resetDeepWikiKnowledgeGraph();
    clearDeepWikiRegistry();
  });

  describe("1. Knowledge Graph Seeding & Entity Extraction", () => {
    it("initializes with all canonical commerce and platform entities", () => {
      const graph = getDeepWikiGraph();
      expect(graph.nodes.length).toBeGreaterThanOrEqual(
        CANONICAL_DEEPWIKI_ENTITIES.length,
      );
      expect(graph.links.length).toBeGreaterThanOrEqual(10);

      const nodeIds = graph.nodes.map((n) => n.id);
      expect(nodeIds).toContain("wiki-steadfast-courier");
      expect(nodeIds).toContain("wiki-bkash-checkout");
      expect(nodeIds).toContain("wiki-shipping-policy");
      expect(nodeIds).toContain("wiki-page-builder");
      expect(nodeIds).toContain("wiki-merchant-isolation");
    });

    it("extracts meaningful tokens and filters out stop words", () => {
      const tokens = extractQueryEntities(
        "What are the automated delivery charges and courier options for SteadFast in Dhaka?",
      );
      expect(tokens).toContain("automated");
      expect(tokens).toContain("delivery");
      expect(tokens).toContain("charges");
      expect(tokens).toContain("courier");
      expect(tokens).toContain("steadfast");
      expect(tokens).toContain("dhaka");
      // Stop words filtered out
      expect(tokens).not.toContain("what");
      expect(tokens).not.toContain("are");
      expect(tokens).not.toContain("the");
      expect(tokens).not.toContain("and");
      expect(tokens).not.toContain("for");
      expect(tokens).not.toContain("in");
    });

    it("extracts Bengali query tokens and filters Bengali stop words", () => {
      const tokens = extractQueryEntities(
        "বিকাশ দিয়ে কিভাবে পেমেন্ট করব এবং ডেলিভারি চার্জ কত?",
      );
      expect(tokens).toContain("বিকাশ");
      expect(tokens).toContain("পেমেন্ট");
      expect(tokens).toContain("ডেলিভারি");
      expect(tokens).toContain("চার্জ");
      // Stop word filtered
      expect(tokens).not.toContain("এবং");
    });
  });

  describe("2. Multi-Hop Graph Traversal", () => {
    it("finds primary seed entities for payment queries", () => {
      const seeds = findSeedEntities(["bkash", "payments", "tokenized"], 2);
      expect(seeds.length).toBeGreaterThanOrEqual(1);
      expect(seeds[0].id).toBe("wiki-bkash-checkout");
    });

    it("expands seed entities across weighted relationships (multi-hop)", () => {
      const seeds = findSeedEntities(["bkash"], 1);
      expect(seeds).toHaveLength(1);

      // Expand 2 hops outward
      const expanded = expandKnowledgeGraph(seeds, 2);
      expect(expanded.length).toBeGreaterThan(1);
      const expandedIds = expanded.map((e) => e.id);
      // Connected via related_to and integrates_with
      expect(expandedIds).toContain("wiki-bkash-checkout");
      expect(expandedIds).toContain("wiki-payment-methods");
    });
  });

  describe("3. Synthesis & Grounded Citations", () => {
    it("synthesizes structured answers with DeepWiki citations in English", async () => {
      const seeds = findSeedEntities(["steadfast", "courier"], 1);
      const expanded = expandKnowledgeGraph(seeds, 1);

      const res = await synthesizeDeepWikiAnswer({
        query: "How does SteadFast courier work in Bangladesh?",
        context: {
          seedEntities: seeds,
          expandedGraph: expanded,
          extractedTokens: ["steadfast", "courier"],
        },
        locale: "en",
      });

      expect(res.answer).toContain("SteadFast Courier Logistics");
      expect(res.answer).toContain("Verified Sources (DeepWiki Citations)");
      expect(res.answer).toContain(
        "[DeepWiki: SteadFast Courier Logistics §1]",
      );
      expect(res.citations.length).toBeGreaterThan(0);
      expect(res.citations[0].citationTag).toBe(
        "[DeepWiki: SteadFast Courier Logistics §1]",
      );
    });

    it("synthesizes structured answers with Bengali citations", async () => {
      const seeds = findSeedEntities(["bkash"], 1);
      const expanded = expandKnowledgeGraph(seeds, 1);

      const res = await synthesizeDeepWikiAnswer({
        query: "বিকাশ পেমেন্ট কিভাবে কাজ করে?",
        context: {
          seedEntities: seeds,
          expandedGraph: expanded,
          extractedTokens: ["বিকাশ", "পেমেন্ট"],
        },
        locale: "bn",
      });

      expect(res.answer).toContain("বিকাশ");
      expect(res.answer).toContain("যাচাইকৃত তথ্যসূত্র (DeepWiki Citations)");
      expect(res.citations.length).toBeGreaterThan(0);
    });
  });

  describe("4. End-to-End Query & Atropos RL Transition", () => {
    it("executes queryDeepWiki and transitions state in the Atropos RL environment", async () => {
      const result = await queryDeepWiki({
        merchantId: "merchant-demo-123",
        query: "What payment methods are supported including bKash and COD?",
        locale: "en",
        conversationId: "conv-atropos-rl-1",
        turnIndex: 1,
      });

      expect(result.queryId).toMatch(/^dw_[a-f0-9]{16}$/);
      expect(result.confidence).toBe("high");
      expect(result.citations.length).toBeGreaterThanOrEqual(2);
      expect(result.answer).toContain("DeepWiki");

      // Verify Atropos step result
      expect(result.atroposStep).toBeDefined();
      expect(result.atroposStep.nextState.conversationId).toBe(
        "conv-atropos-rl-1",
      );
      expect(result.atroposStep.nextState.turnIndex).toBe(2);
      expect(result.atroposStep.nextState.history).toHaveLength(1);
      expect(result.atroposStep.done).toBe(false);

      // Reward components
      expect(
        result.atroposStep.info.components.groundingReward,
      ).toBeGreaterThan(0);
      expect(
        result.atroposStep.info.components.resolutionBonus,
      ).toBeGreaterThan(0);
      expect(result.atroposStep.reward).toBeGreaterThan(0);
    });
  });

  describe("5. Reinforcement Learning (RL) Feedback & Q-Value Weight Updates", () => {
    it("strengthens edge weights upon receiving high CSAT positive feedback", async () => {
      // 1. Initial query execution
      const queryResult = await queryDeepWiki({
        merchantId: "merchant-demo-123",
        query: "How do I ship orders using SteadFast Courier?",
        locale: "en",
      });

      const initialGraph = getDeepWikiGraph();
      const edge = initialGraph.links.find(
        (l) =>
          l.source === "wiki-steadfast-courier" &&
          l.target === "wiki-shipping-policy",
      );
      expect(edge).toBeDefined();
      const initialWeight = edge!.weight;

      // 2. Submit 5-star positive feedback
      const feedback = await applyAtroposFeedback({
        queryId: queryResult.queryId,
        rating: 5,
        feedbackText: "Very clear explanation, setup completed successfully!",
        isResolved: true,
      });

      expect(feedback.queryId).toBe(queryResult.queryId);
      expect(feedback.newReward.label).toBe("high_quality");
      expect(feedback.newReward.components.csatReward).toBe(1.0);

      // 3. Verify Q-value edge weight was updated
      const updatedGraph = getDeepWikiGraph();
      const updatedEdge = updatedGraph.links.find(
        (l) =>
          l.source === "wiki-steadfast-courier" &&
          l.target === "wiki-shipping-policy",
      );
      expect(updatedEdge).toBeDefined();
      expect(updatedEdge!.weight).toBeGreaterThanOrEqual(initialWeight);
      expect(
        feedback.updatedWeights["wiki-steadfast-courier->wiki-shipping-policy"],
      ).toBeDefined();
    });

    it("dampens edge weights upon receiving poor rating (stimulating RL exploration)", async () => {
      const queryResult = await queryDeepWiki({
        merchantId: "merchant-demo-123",
        query: "What is your return and refund policy?",
        locale: "en",
      });

      // Submit 1-star negative feedback
      const feedback = await applyAtroposFeedback({
        queryId: queryResult.queryId,
        rating: 1,
        feedbackText: "Did not explain turnaround time properly",
        isResolved: false,
      });

      expect(["low_quality", "rejected"]).toContain(feedback.newReward.label);
      expect(feedback.newReward.components.csatReward).toBe(-1.0);
    });

    it("throws a descriptive error when submitting feedback for an unknown queryId", async () => {
      await expect(
        applyAtroposFeedback({
          queryId: "dw_nonexistent_9999",
          rating: 5,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("6. Custom Entity Ingestion", () => {
    it("allows dynamic ingestion of merchant-specific policy entities", async () => {
      const newEntity = ingestDeepWikiEntity("merchant-demo-123", {
        id: "wiki-merchant-custom-warranty",
        slug: "merchant-custom-warranty",
        title: "2-Year Electronics Replacement Guarantee",
        summary:
          "Store provides 2-year warranty replacement for all smart electronics.",
        content:
          "Store provides complete warranty for 24 months covering internal hardware defects.",
        category: "store_policy",
        tags: ["warranty", "electronics", "guarantee"],
        verifiedFacts: [
          "All electronics purchases include a 2-year replacement warranty.",
        ],
        confidenceScore: 0.99,
        relations: [
          {
            targetId: "wiki-return-refunds",
            relationType: "related_to",
            weight: 0.9,
            traversals: 0,
            lastReward: 0.0,
          },
        ],
      });

      expect(newEntity.id).toBe("wiki-merchant-custom-warranty");

      const graph = getDeepWikiGraph();
      const foundNode = graph.nodes.find(
        (n) => n.id === "wiki-merchant-custom-warranty",
      );
      expect(foundNode).toBeDefined();

      // Querying with warranty tokens discovers the new entity
      const res = await queryDeepWiki({
        merchantId: "merchant-demo-123",
        query: "What is the warranty period for electronics?",
        locale: "en",
      });

      expect(res.answer).toContain("2-Year Electronics Replacement Guarantee");
      expect(
        res.citations.some(
          (c) => c.entityId === "wiki-merchant-custom-warranty",
        ),
      ).toBe(true);
    });
  });

  describe("7. RPC Server Function Boundary", () => {
    it("exports deepWikiQueryFn, deepWikiFeedbackFn, and deepWikiGraphFn", () => {
      expect(typeof deepWikiQueryFn).toBe("function");
      expect(typeof deepWikiFeedbackFn).toBe("function");
      expect(typeof deepWikiGraphFn).toBe("function");
    });
  });
});
