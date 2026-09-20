import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const askSchema = z.object({
  slug: z.string().min(1).max(80),
  message: z.string().trim().min(1).max(500),
  conversationId: z.string().uuid().nullable().optional(),
  orderNumber: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export const askAssistantFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => askSchema.parse(d))
  .handler(async ({ data }) => {
    const { handleAsk } = await import("./ai-support.server");
    try {
      return await handleAsk(data);
    } catch {
      return {
        conversationId: data.conversationId ?? null,
        reply:
          "Unable to fetch information right now. Please try again shortly or contact customer care.",
        provenance: null,
        needsAgent: true,
        cta: "ticket" as const,
      };
    }
  });

export const supportInboxFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listConversations, computeStats, SUGGESTIONS } =
      await import("./ai-support-admin.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(
      context.supabase,
      context.userId,
    );
    const conversations = await listConversations(context.supabase, merchantId);
    return {
      merchantId,
      conversations,
      stats: computeStats(conversations),
      suggestions: SUGGESTIONS,
    };
  });

export const supportThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { listMessages } = await import("./ai-support-admin.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(
      context.supabase,
      context.userId,
    );
    return listMessages(context.supabase, merchantId, data.conversationId);
  });

export const supportReplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentReply } = await import("./ai-support-admin.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(
      context.supabase,
      context.userId,
    );
    return agentReply(
      context.supabase,
      merchantId,
      data.conversationId,
      data.body,
    );
  });

export const supportStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        status: z.enum(["open", "needs_agent", "resolved", "closed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setConversationStatus } = await import("./ai-support-admin.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(
      context.supabase,
      context.userId,
    );
    return setConversationStatus(
      context.supabase,
      merchantId,
      data.conversationId,
      data.status,
    );
  });

export const getAiGatewayConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getAiGatewayConfig, maskApiKey } =
      await import("./support-embed.server");
    const { getDynamicConfigMetadata } =
      await import("./dynamic-config.server");

    // Retrieve dynamic config state
    const cfg = await getAiGatewayConfig();
    const meta = await getDynamicConfigMetadata("ai.gateway");
    return {
      activeSlot: meta.activeSlot,
      version: meta.version,
      maskedKey: maskApiKey(cfg.apiKey),
      chatModel: cfg.chatModel,
      fallbackChatModel: cfg.fallbackChatModel,
      embeddingModel: cfg.embeddingModel,
      gatewayUrl: cfg.gatewayUrl || "https://openrouter.ai/api/v1",
    };
  });

const probeSchema = z.object({
  apiKey: z.string().trim().min(1),
  chatModel: z.string().trim().min(1),
  embeddingModel: z.string().trim().min(1),
});

export const testAiGatewayProbeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => probeSchema.parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    try {
      // Direct minimal completion probe to verify credentials
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.apiKey}`,
          "HTTP-Referer": "https://framique.com",
          "X-Title": "Framique Probe",
        },
        body: JSON.stringify({
          model: data.chatModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return {
          ok: false,
          latencyMs: Date.now() - started,
          error: `HTTP ${res.status}: ${txt.slice(0, 120)}`,
        };
      }

      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: (err as Error).message,
      };
    }
  });

const updateConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  chatModel: z.string().trim().min(1),
  fallbackChatModel: z.string().trim().min(1),
  embeddingModel: z.string().trim().min(1),
  gatewayUrl: z.string().trim().url().optional(),
});

export const updateAiGatewayConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateConfigSchema.parse(d))
  .handler(async ({ data }) => {
    const { stageAndPromoteConfig } = await import("./dynamic-config.server");
    return stageAndPromoteConfig(
      "ai.gateway",
      {
        apiKey: data.apiKey,
        chatModel: data.chatModel,
        fallbackChatModel: data.fallbackChatModel,
        embeddingModel: data.embeddingModel,
        gatewayUrl: data.gatewayUrl || "https://openrouter.ai/api/v1",
      },
      undefined,
      "admin_ui_key_rotation",
    );
  });

/* ------------------------------------------------------------- DeepWiki & Copilot */

const deepwikiSearchSchema = z.object({
  query: z.string().trim().max(300),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const deepwikiSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deepwikiSearchSchema.parse(d))
  .handler(async ({ data }) => {
    const { searchDeepWikiSemantic } = await import("./semantic-vector.server");
    const category =
      data.category && data.category !== "all"
        ? (data.category as any)
        : undefined;
    return searchDeepWikiSemantic(data.query, {
      category,
      limit: data.limit ?? 10,
    });
  });

export const deepwikiGetCategoriesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { DEEPWIKI_CATEGORIES, DEEPWIKI_DATASET } = await import(
      "./deepwiki-dataset"
    );
    const { getVectorEngineStats } = await import("./semantic-vector.server");
    const counts: Record<string, number> = {};
    for (const item of DEEPWIKI_DATASET) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return {
      categories: DEEPWIKI_CATEGORIES.map((c) => ({
        ...c,
        count: counts[c.id] ?? 0,
      })),
      totalQuestions: DEEPWIKI_DATASET.length,
      engine: getVectorEngineStats(),
    };
  });

const copilotChatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .optional(),
});

export const aiCopilotChatFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => copilotChatSchema.parse(d))
  .handler(async ({ data }) => {
    const { searchDeepWikiSemantic } = await import("./semantic-vector.server");
    const { getAiGatewayConfig, isPlaceholderApiKey } = await import(
      "./support-embed.server"
    );

    const hits = await searchDeepWikiSemantic(data.message, { limit: 3 });
    const topHit = hits[0];

    const sources = hits.map((h) => ({
      id: h.item.id,
      title: h.item.question,
      category: h.item.category,
      summary: h.item.summary,
      url: h.item.citations[0]?.url ?? "/docs",
      similarity: Number(h.similarity.toFixed(3)),
    }));

    const cfg = await getAiGatewayConfig();
    const hasKey = cfg.apiKey && !isPlaceholderApiKey(cfg.apiKey);

    if (hasKey && hits.length > 0) {
      try {
        const contextPassages = hits
          .map(
            (h, i) =>
              `[Source ${i + 1}: ${h.item.question} (${h.item.category})]\n${h.item.summary}\n${h.item.answer}`,
          )
          .join("\n\n---\n\n");

        const messages = [
          {
            role: "system",
            content:
              "You are Framique's authoritative Cloud Commerce AI Support and Platform Specialist for merchants in Bangladesh. Answer accurately based on the provided DeepWiki sources. Format your answer with clean markdown, lists, and code blocks. Be concise and actionable.",
          },
          ...(data.history ?? []).slice(-4),
          {
            role: "user",
            content: `DeepWiki Sources:\n\n${contextPassages}\n\nQuestion: ${data.message}`,
          },
        ];

        const res = await fetch(
          `${cfg.gatewayUrl || "https://openrouter.ai/api/v1"}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cfg.apiKey}`,
              "HTTP-Referer": "https://framique.com",
              "X-Title": "Framique Copilot",
            },
            body: JSON.stringify({
              model: cfg.chatModel,
              messages,
              max_tokens: 800,
              temperature: 0.2,
            }),
          },
        );

        if (res.ok) {
          const json = await res.json();
          const generated = json.choices?.[0]?.message?.content;
          if (generated) {
            return {
              answer: generated,
              sources,
              confidence: (topHit?.similarity ?? 0) > 0.7 ? "verified" : "grounded",
              similarity: topHit?.similarity ?? 0,
            };
          }
        }
      } catch {
        // Fallback to extractive synthesis
      }
    }

    // Extractive synthesis from DeepWiki
    if (topHit) {
      const best = topHit.item;
      let synthesized = `### ${best.question}\n\n${best.summary}\n\n${best.answer}`;

      if (hits.length > 1) {
        synthesized += `\n\n---\n\n**Related DeepWiki Guides:**\n`;
        for (let i = 1; i < hits.length; i++) {
          synthesized += `- **${hits[i].item.question}** (${hits[i].item.category}): ${hits[i].item.summary}\n`;
        }
      }

      return {
        answer: synthesized,
        sources,
        confidence: topHit.similarity > 0.65 ? "verified" : "grounded",
        similarity: topHit.similarity,
      };
    }

    return {
      answer:
        "I couldn't find a direct match in our DeepWiki knowledge base for that question. You can browse our 100+ topics by category (Payments, Couriers, Page Builder, Security, SEO, Orders) or contact live developer care.",
      sources: [],
      confidence: "speculative",
      similarity: 0,
    };
  });
