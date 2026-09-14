import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  OpenRouterLLMService,
  draftAnswer,
  mockLLM,
  setLLM,
} from "./support-llm.server";
import {
  cosineSimilarity,
  generateDeterministicEmbedding,
  generateEmbedding,
  getAiGatewayConfig,
  maskApiKey,
  DEFAULT_AI_GATEWAY_CONFIG,
} from "./support-embed.server";

describe("Phase 9.1 — OpenRouter Nemotron & Llama-Nemotron Embed Integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setLLM(new OpenRouterLLMService());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setLLM(mockLLM);
    vi.restoreAllMocks();
  });

  it("masks API keys with zero secret leakage", () => {
    const rawKey = "sk-or-v1-REDACTED";
    const masked = maskApiKey(rawKey);

    expect(masked).toBe("sk-or-v1...383b");
    expect(masked).not.toContain("77c0d49ce");
    expect(masked).not.toContain("94cacc1aa");
    expect(maskApiKey("")).toBe("unconfigured");
    expect(maskApiKey("short")).toBe("********");
  });

  it("resolves default AI gateway configuration seamlessly", async () => {
    const config = await getAiGatewayConfig();
    expect(config.chatModel).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(config.fallbackChatModel).toBe("nvidia/nemotron-3.5-lightning:free");
    expect(config.embeddingModel).toBe("nvidia/llama-nemotron-embed-vl-1b-v2:free");
    expect(config.gatewayUrl).toContain("openrouter.ai");
    expect(config.apiKey.length).toBeGreaterThan(10);
  });

  it("computes cosine similarity accurately", () => {
    const vecA = [1.0, 0.0, 0.0];
    const vecB = [1.0, 0.0, 0.0];
    const vecC = [0.0, 1.0, 0.0];
    const vecD = [0.7071, 0.7071, 0.0];

    // Orthogonal
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0, 4);
    // Identical
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 4);
    // 45 degrees
    expect(cosineSimilarity(vecA, vecD)).toBeCloseTo(0.7071, 3);
    // Empty
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("generates deterministic dense vector embeddings with valid dimensions", async () => {
    const textA = "How do I configure SteadFast Courier in Framique?";
    const textB = "SteadFast courier webhook parcel booking guide";
    const textC = "bKash checkout direct payment token API";

    const embA = generateDeterministicEmbedding(textA, 1024);
    const embB = generateDeterministicEmbedding(textB, 1024);
    const embC = generateDeterministicEmbedding(textC, 1024);

    expect(embA.length).toBe(1024);
    expect(embB.length).toBe(1024);
    expect(embC.length).toBe(1024);

    // Semantically related texts should have higher similarity than unrelated
    const simRelated = cosineSimilarity(embA, embB);
    const simUnrelated = cosineSimilarity(embA, embC);

    // Core semantic invariant: SteadFast vs SteadFast must be more similar than SteadFast vs bKash
    expect(simRelated).toBeGreaterThan(simUnrelated);
    // Both embeddings are non-zero unit vectors with overlap — some positive correlation expected
    expect(simRelated).toBeGreaterThan(0.1);
  });

  it("formats prompt, queries OpenRouter chat completions, and parses reply", async () => {
    const mockReply = "You can configure SteadFast Courier in Admin -> Settings -> Shipping.";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: mockReply },
          },
        ],
      }),
    } as Response);

    const service = new OpenRouterLLMService();
    const result = await service.draft({
      question: "How do I setup SteadFast?",
      context: [
        {
          title: "SteadFast Integration",
          body: "SteadFast is configured under Admin Settings Shipping.",
        },
      ],
      locale: "en",
    });

    expect(result).not.toBeNull();
    expect(result?.text).toBe(mockReply);
    expect(result?.grounded).toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("openrouter.ai/api/v1/chat/completions");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(body.messages[0].content).toContain("Framique");
    expect(body.messages[1].content).toContain("SteadFast");
  });

  it("cascades to fallback model when primary model returns 502", async () => {
    let callCount = 0;
    const fallbackAnswer = "Fallback response from Nemotron 3.5 Lightning.";

    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      callCount++;
      const body = JSON.parse(init.body as string);

      // First call (primary model) fails with 502 Bad Gateway
      if (body.model === "nvidia/nemotron-3-ultra-550b-a55b:free") {
        return {
          ok: false,
          status: 502,
          text: async () => "Bad Gateway from provider",
        } as Response;
      }

      // Second call (fallback model) succeeds
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: fallbackAnswer } }],
        }),
      } as Response;
    });

    const service = new OpenRouterLLMService();
    const result = await service.draft({
      question: "How do I track parcels?",
      context: [{ title: "Tracking", body: "Check customer tracking console." }],
      locale: "en",
    });

    expect(result).not.toBeNull();
    expect(result?.text).toBe(fallbackAnswer);
    expect(callCount).toBe(2);

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse(calls[0][1].body).model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(JSON.parse(calls[1][1].body).model).toBe("nvidia/nemotron-3.5-lightning:free");
  });

  it("degrades gracefully to mock extractive when all upstream models are unavailable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout / offline"));

    const service = new OpenRouterLLMService();
    const result = await service.draft({
      question: "Where is my order?",
      context: [{ title: "Order Help", body: "Orders are shipped within 24 hours." }],
      locale: "en",
    });

    // Should not crash, should return extracted grounded answer
    expect(result).not.toBeNull();
    expect(result?.text).toContain("From our help article — Order Help:");
    expect(result?.text).toContain("Orders are shipped within 24 hours.");
  });

  it("draftAnswer wrapper observes metrics and returns answer", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Framique is a multi-tenant Cloud Commerce platform for modern commerce." } }],
      }),
    } as Response);

    const res = await draftAnswer({
      question: "What is Framique?",
      context: [{ title: "Framique CMS", body: "Framique is a multi-tenant Cloud Commerce platform." }],
      locale: "en",
    });

    expect(res).not.toBeNull();
    expect(res?.grounded).toBe(true);
    expect(res?.text).toContain("Framique is a multi-tenant");
  });
});
