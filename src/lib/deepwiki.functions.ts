/**
 * DeepWiki RPC Functions — Server Function boundary for the DeepWiki Engine.
 *
 * Exposes:
 *  1. deepWikiQueryFn: Multi-hop RAG with Atropos RL evaluation.
 *  2. deepWikiFeedbackFn: Online RL reward updates on graph edge weights.
 *  3. deepWikiGraphFn: Inspection of topic nodes and learned Q-values.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const deepWikiQuerySchema = z.object({
  merchantId: z.string().min(1),
  query: z.string().trim().min(1).max(1000),
  locale: z.enum(["bn", "en"]).optional().default("en"),
  conversationId: z.string().nullable().optional(),
  turnIndex: z.number().int().min(1).max(20).optional().default(1),
  maxHops: z.number().int().min(1).max(4).optional().default(2),
});

export const deepWikiQueryFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deepWikiQuerySchema.parse(d))
  .handler(async ({ data }) => {
    const { queryDeepWiki } = await import("./deepwiki-engine.server");
    return await queryDeepWiki({
      merchantId: data.merchantId,
      query: data.query,
      locale: data.locale,
      conversationId: data.conversationId,
      turnIndex: data.turnIndex,
      maxHops: data.maxHops,
    });
  });

const deepWikiFeedbackSchema = z.object({
  queryId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  feedbackText: z.string().max(500).optional(),
  isResolved: z.boolean().optional(),
});

export const deepWikiFeedbackFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deepWikiFeedbackSchema.parse(d))
  .handler(async ({ data }) => {
    const { applyAtroposFeedback } = await import("./deepwiki-engine.server");
    return await applyAtroposFeedback({
      queryId: data.queryId,
      rating: data.rating,
      feedbackText: data.feedbackText,
      isResolved: data.isResolved,
    });
  });

export const deepWikiGraphFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getDeepWikiGraph } = await import("./deepwiki-engine.server");
    return getDeepWikiGraph();
  },
);
