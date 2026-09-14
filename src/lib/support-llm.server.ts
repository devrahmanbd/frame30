/**
 * LLM boundary and OpenRouter Nemotron integration.
 *
 * Primary Model: nvidia/nemotron-3-ultra-550b-a55b:free
 * Fallback Model: nvidia/nemotron-3.5-lightning:free
 *
 * Dynamically resolves credentials from `platform_dynamic_config` ('ai.gateway' slot)
 * with zero client-side secret leakage and resilient multi-model fallback.
 */

import { incr, log, observe } from "./observability.server";
import { getAiGatewayConfig } from "./support-embed.server";

export type DraftRequest = {
  question: string;
  context: Array<{ title: string; body: string }>;
  locale: "bn" | "en";
};

export type Draft = { text: string; grounded: boolean };

export interface LLMService {
  readonly name: string;
  draft(req: DraftRequest): Promise<Draft | null>;
}

const FRAMIQUE_SYSTEM_PROMPT = [
  "You are Framique's authoritative AI Support Specialist for our Bangladeshi Cloud Commerce CMS and Platform.",
  "You assist merchants and shoppers with store setup, catalog, checkout, courier integrations (SteadFast, Pathao, RedX, Paperfly), payment gateways (bKash, Nagad, SSLCommerz, Shurjopay), Page Builder AST, and merchant administration.",
  "Answer authoritatively, politely, and strictly based on the documentation excerpts provided.",
  "If the excerpts do not contain sufficient details to answer, state so honestly in the user's language and offer to open a support ticket.",
  "Format answers with clean markdown. Be concise, actionable, and never fabricate prices, API keys, or endpoints.",
].join(" ");

/**
 * Extractive mock: composes an answer strictly out of retrieved context.
 * Used for deterministic offline tests or when AI gateway is unconfigured.
 */
export const mockLLM: LLMService = {
  name: "mock-extractive",
  async draft(req) {
    const top = req.context[0];
    if (!top) return null;
    const lead =
      req.locale === "bn"
        ? `আমাদের সহায়তা নথি অনুযায়ী — ${top.title}:`
        : `From our help article — ${top.title}:`;
    return { text: `${lead}\n${top.body}`, grounded: true };
  },
};

/**
 * OpenRouter LLM Service powered by Nvidia Nemotron models with resilient fallback.
 */
export class OpenRouterLLMService implements LLMService {
  readonly name = "openrouter-nemotron";

  async draft(req: DraftRequest): Promise<Draft | null> {
    if (!req.context.length) {
      return null;
    }

    const cfg = await getAiGatewayConfig();
    const apiKey = cfg.apiKey;
    const baseUrl = cfg.gatewayUrl?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";
    const chatUrl = `${baseUrl}/chat/completions`;

    if (!apiKey) {
      log("warn", "ai.llm_no_api_key", { service: this.name });
      return mockLLM.draft(req);
    }

    // Compose context passages
    const formattedContext = req.context
      .map((c, i) => `[Document ${i + 1}] ${c.title}\n${c.body}`)
      .join("\n\n");

    const userPrompt =
      req.locale === "bn"
        ? `সহায়তা নথি:\n\n${formattedContext}\n\nগ্রাহকের প্রশ্ন: ${req.question}\n(অনুগ্রহ করে বাংলায় উত্তর দিন)`
        : `Help Articles:\n\n${formattedContext}\n\nCustomer Question: ${req.question}`;

    const messages = [
      { role: "system", content: FRAMIQUE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    // Try primary model first, cascade to fallback if 404/429/502/503 or timeout
    const modelsToTry = [cfg.chatModel, cfg.fallbackChatModel].filter(Boolean);

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      const isFallback = i > 0;
      const started = Date.now();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://framique.com",
            "X-Title": "Framique AI Support",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            max_tokens: 600,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`OpenRouter HTTP ${res.status}: ${detail.slice(0, 150)}`);
        }

        const payload = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        const answerText = payload.choices?.[0]?.message?.content?.trim();
        if (!answerText) {
          throw new Error("Empty completion returned from OpenRouter");
        }

        const elapsed = Date.now() - started;
        incr("framique_ai_draft_total", { provider: this.name, model, outcome: "ok" });
        observe("framique_ai_draft_latency_ms", elapsed, { model });

        return { text: answerText, grounded: true };
      } catch (err) {
        const elapsed = Date.now() - started;
        const msg = err instanceof Error ? err.message : "unknown";
        log("warn", "ai.model_attempt_failed", {
          model,
          isFallback,
          ms: elapsed,
          error: msg,
        });

        // If there's a fallback model remaining, continue loop
        if (i < modelsToTry.length - 1) {
          incr("framique_ai_model_fallback_total", { from: model, to: modelsToTry[i + 1] });
          continue;
        }

        // If all remote models failed, degrade gracefully to extractive mock
        incr("framique_ai_draft_total", { provider: this.name, outcome: "error" });
        return mockLLM.draft(req);
      }
    }

    return null;
  }
}

export const openRouterLLM = new OpenRouterLLMService();

let active: LLMService = openRouterLLM;

/** Swap point for the production vendor; keeps call sites vendor-blind. */
export function setLLM(service: LLMService) {
  active = service;
}

export function getActiveLLM(): LLMService {
  return active;
}

export async function draftAnswer(req: DraftRequest): Promise<Draft | null> {
  const started = Date.now();
  try {
    const out = await active.draft(req);
    incr("framique_ai_draft_total", { provider: active.name, outcome: out ? "ok" : "empty" });
    return out;
  } catch (err) {
    incr("framique_ai_draft_total", { provider: active.name, outcome: "error" });
    log("warn", "ai.provider_down", {
      provider: active.name,
      ms: Date.now() - started,
      message: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}
