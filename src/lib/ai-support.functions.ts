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
        reply: "Unable to fetch information right now. Please try again shortly or contact customer care.",
        provenance: null,
        needsAgent: true,
        cta: "ticket" as const,
      };
    }
  });

export const supportInboxFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listConversations, computeStats, SUGGESTIONS } = await import(
      "./ai-support-admin.server"
    );
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const conversations = await listConversations(context.supabase, merchantId);
    return { merchantId, conversations, stats: computeStats(conversations), suggestions: SUGGESTIONS };
  });

export const supportThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { listMessages } = await import("./ai-support-admin.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return listMessages(context.supabase, merchantId, data.conversationId);
  });

export const supportReplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(1000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { agentReply } = await import("./ai-support-admin.server");
    const { currentMerchantId } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return agentReply(context.supabase, merchantId, data.conversationId, data.body);
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
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return setConversationStatus(context.supabase, merchantId, data.conversationId, data.status);
  });

export const getAiGatewayConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getAiGatewayConfig, maskApiKey } = await import("./support-embed.server");
    const { getDynamicConfigMetadata } = await import("./dynamic-config.server");
    
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
        return { ok: false, latencyMs: Date.now() - started, error: `HTTP ${res.status}: ${txt.slice(0, 120)}` };
      }

      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, error: (err as Error).message };
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

