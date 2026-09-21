import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MERCHANT_AI_ENABLED } from "./merchant-ai";

/**
 * Merchant AI kill-switch (Sept 2026, operator decision): gateway
 * configuration, merchant copilot and AI triage are platform-operated
 * only. Denies the control RPCs even if their UI is reached directly —
 * hiding links alone never closes an API. askAssistantFn (public
 * storefront assistant) and /dashboard/support (support.functions.ts)
 * are intentionally NOT gated here.
 */
export const requireMerchantAi = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    if (!MERCHANT_AI_ENABLED) {
      throw new Error("ai_disabled_for_merchants");
    }
    return next();
  },
);

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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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
  .middleware([requireSupabaseAuth, requireMerchantAi])
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

/* ------------------------------------------------------------- Copilot */

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
  .middleware([requireSupabaseAuth, requireMerchantAi])
  .inputValidator((d: unknown) => copilotChatSchema.parse(d))
  .handler(async ({ data }) => {
    const { screenInbound, screenOutbound } =
      await import("./support-guardrails");

    const inbound = screenInbound(data.message);
    if (!inbound.allowed) {
      return {
        answer:
          "This query was blocked by security guardrails. Framique AI assistant does not disclose internal source code, system secrets, customer data, or vulnerability exploits.",
        sources: [],
        confidence: "grounded" as const,
        similarity: 0,
      };
    }

    const { searchKbHybrid } = await import("./support-kb.server");
    const { getAiGatewayConfig, isPlaceholderApiKey } =
      await import("./support-embed.server");

    // Use the live KB hybrid search instead of the retired DeepWiki vector index
    const kbHits = await searchKbHybrid(null, data.message, 3);
    const topHit = kbHits[0];

    const sources = kbHits.map((h) => ({
      id: h.doc_id,
      title: h.title,
      category: "knowledge_base",
      summary: h.body.slice(0, 200),
      url: h.source_url ?? "/docs",
      similarity: Number((h.combined_score ?? 0).toFixed(3)),
    }));

    const cfg = await getAiGatewayConfig();
    const hasKey = cfg.apiKey && !isPlaceholderApiKey(cfg.apiKey);

    if (hasKey && kbHits.length > 0) {
      try {
        const contextPassages = kbHits
          .map(
            (h, i) =>
              `[Source ${i + 1}: ${h.title}]\n${h.body}`,
          )
          .join("\n\n---\n\n");

        const messages = [
          {
            role: "system",
            content:
              "You are Framique's authoritative Cloud Commerce AI Specialist for merchants in Bangladesh. Answer accurately based on platform documentation and knowledge base. CREATIVE COMMERCE: You are empowered to provide creative assistance (e.g. catchy slogans, marketing campaign ideas, product descriptions, promotional headlines, page builder layouts, and theme palettes) tailored specifically to Framique merchants. STRICT SCOPE: You must ONLY answer questions related to Framique, storefront design, themes, marketing, payments, couriers, and ecommerce in Bangladesh. Politely decline any off-topic queries. Never disclose internal code, database secrets, customer data, or vulnerability exploits.",
          },
          ...(data.history ?? []).slice(-4),
          {
            role: "user",
            content: `Knowledge Base Sources:\n\n${contextPassages}\n\nQuestion: ${data.message}`,
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
            const outbound = screenOutbound(generated, {
              pinned: false,
              allowNumericClaims: true,
            });
            if (outbound.allowed) {
              return {
                answer: generated,
                sources,
                confidence: "grounded",
                similarity: Number((topHit?.combined_score ?? 0).toFixed(3)),
              };
            }
          }
        }
      } catch {
        // Fallback to extractive synthesis below
      }
    }

    // Extractive synthesis from KB hits
    if (topHit) {
      let synthesized = `### ${topHit.title}\n\n${topHit.body}`;

      if (kbHits.length > 1) {
        synthesized += `\n\n---\n\n**Related Knowledge Base Articles:**\n`;
        for (let i = 1; i < kbHits.length; i++) {
          synthesized += `- **${kbHits[i].title}**: ${kbHits[i].body.slice(0, 150)}\n`;
        }
      }

      const outbound = screenOutbound(synthesized, {
        pinned: false,
        allowNumericClaims: true,
      });
      if (!outbound.allowed) {
        synthesized =
          "Information regarding this topic cannot be displayed due to security policy.";
      }

      return {
        answer: synthesized,
        sources,
        confidence: "grounded",
        similarity: Number((topHit.combined_score ?? 0).toFixed(3)),
      };
    }

    return {
      answer:
        "I couldn't find a direct match in our knowledge base for that question. You can browse documentation or contact live developer care.",
      sources: [],
      confidence: "speculative",
      similarity: 0,
    };
  });
