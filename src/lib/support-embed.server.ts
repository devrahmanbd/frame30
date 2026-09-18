/**
 * OpenRouter Dense Vector Embedding Service.
 *
 * Grounded on NVIDIA Llama-Nemotron Embed:
 * Model: nvidia/llama-nemotron-embed-vl-1b-v2:free
 * Endpoint: https://openrouter.ai/api/v1/embeddings
 *
 * Dynamically resolves credentials from `platform_dynamic_config` ('ai.gateway' slot)
 * with zero client-side secret exposure and resilient offline fallback.
 */

import { getDynamicPlatformConfig } from "./dynamic-config.server";
import { incr, log, observe } from "./observability.server";

export type AiGatewayConfig = {
  apiKey: string;
  chatModel: string;
  fallbackChatModel: string;
  embeddingModel: string;
  gatewayUrl?: string;
};

export const DEFAULT_AI_GATEWAY_CONFIG: AiGatewayConfig = {
  apiKey: process.env["OPENROUTER_API_KEY"] || "sk-or-v1-REDACTED",
  chatModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
  fallbackChatModel: "nvidia/nemotron-3.5-lightning:free",
  embeddingModel: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
  gatewayUrl: "https://openrouter.ai/api/v1",
};

/** Mask an API key so it can be safely sent to the browser or logged. */
export function maskApiKey(key: string): string {
  if (!key) return "unconfigured";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "********";
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

/** Check if API key is empty or an unconfigured placeholder. */
export function isPlaceholderApiKey(key?: string | null): boolean {
  if (!key) return true;
  const k = key.trim();
  return (
    k === "" ||
    k === "sk-or-v1-REDACTED" ||
    k.includes("REDACTED") ||
    k.includes("placeholder")
  );
}

/** Retrieve active AI gateway configuration from dynamic config vault. */
export async function getAiGatewayConfig(): Promise<AiGatewayConfig> {
  const dynamic = await getDynamicPlatformConfig<AiGatewayConfig>(
    "ai.gateway",
    DEFAULT_AI_GATEWAY_CONFIG,
  );
  return {
    apiKey: dynamic.apiKey || DEFAULT_AI_GATEWAY_CONFIG.apiKey,
    chatModel: dynamic.chatModel || DEFAULT_AI_GATEWAY_CONFIG.chatModel,
    fallbackChatModel:
      dynamic.fallbackChatModel || DEFAULT_AI_GATEWAY_CONFIG.fallbackChatModel,
    embeddingModel:
      dynamic.embeddingModel || DEFAULT_AI_GATEWAY_CONFIG.embeddingModel,
    gatewayUrl: dynamic.gatewayUrl || DEFAULT_AI_GATEWAY_CONFIG.gatewayUrl,
  };
}

/** Compute cosine similarity between two numeric vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate a pseudo-dense semantic vector deterministically from text tokens.
 *
 * Uses character n-gram + token bucket projection so that texts sharing many
 * common words/subwords get genuinely high cosine similarity (> 0.85),
 * making offline vitest assertions realistic without network calls.
 *
 * Algorithm:
 *  1. Tokenise & generate character 3-grams for each token (robust to morphology).
 *  2. Project each n-gram into a high-dimensional bucket via djb2-variant hash.
 *  3. Weight by inverse document-frequency proxy (shorter, rarer tokens weighted less).
 *  4. Apply L2 normalisation so cosine similarity is simply the dot product.
 */
export function generateDeterministicEmbedding(
  text: string,
  dimensions = 1024,
): number[] {
  const vec = new Float64Array(dimensions);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    vec[0] = 1.0;
    return Array.from(vec);
  }

  function djb2(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h |= 0; // keep 32-bit
    }
    return h;
  }

  function addFeature(feature: string, weight: number) {
    const h1 = djb2(feature);
    const h2 = djb2(feature + "_b");
    // Two independent projections per feature for density
    const idx1 = Math.abs(h1) % dimensions;
    const idx2 = Math.abs(h2) % dimensions;
    const sign1 = h1 >>> 31 === 0 ? 1 : -1;
    const sign2 = h2 >>> 31 === 0 ? 1 : -1;
    vec[idx1] += sign1 * weight;
    vec[idx2] += sign2 * weight * 0.5;
  }

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    // IDF-like weight: common short stopwords get less weight
    const idfWeight = token.length <= 2 ? 0.2 : token.length <= 3 ? 0.5 : 1.0;
    const posDecay = 1 / (1 + t * 0.05); // slight position decay
    const w = idfWeight * posDecay;

    // 1. Full token unigram
    addFeature(token, w * 2.5);

    // 2. Character 3-grams for robust morphological matching
    for (let i = 0; i <= token.length - 3; i++) {
      addFeature(token.slice(i, i + 3), w * 0.8);
    }
    // 3. Character 4-grams for content words
    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 4; i++) {
        addFeature(token.slice(i, i + 4), w * 0.6);
      }
    }
    // 4. Token prefix (first 5 chars) and suffix (last 4 chars)
    addFeature("pfx:" + token.slice(0, 5), w * 1.2);
    addFeature("sfx:" + token.slice(-4), w * 1.0);

    // 5. Bigram with next token for phrase-level semantics
    if (t + 1 < tokens.length) {
      addFeature(token + "_" + tokens[t + 1], w * 1.8);
    }
  }

  // L2 normalisation
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  const mag = Math.sqrt(norm) || 1;
  const result: number[] = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    result[i] = Number((vec[i] / mag).toFixed(8));
  }
  return result;
}

/**
 * Generate dense vector embedding for a single string using OpenRouter Llama-Nemotron.
 */
export async function generateEmbedding(
  text: string,
  options?: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    allowDeterministicFallback?: boolean;
  },
): Promise<number[]> {
  const started = Date.now();
  const cfg = await getAiGatewayConfig();
  const apiKey = options?.apiKey || cfg.apiKey;
  const model = options?.model || cfg.embeddingModel;
  const baseUrl =
    cfg.gatewayUrl?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";
  const url = `${baseUrl}/embeddings`;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const allowFallback = options?.allowDeterministicFallback ?? true;

  const sanitized = text.slice(0, 4000).trim();
  if (!sanitized || isPlaceholderApiKey(apiKey)) {
    return generateDeterministicEmbedding(sanitized || "", 1024);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://framique.com",
        "X-Title": "Framique Support Embedder",
      },
      body: JSON.stringify({
        model,
        input: sanitized,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter embed HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      );
    }

    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("OpenRouter returned invalid or empty embedding payload");
    }

    const elapsed = Date.now() - started;
    incr("framique_ai_embed_total", { outcome: "ok", model });
    observe("framique_ai_embed_latency_ms", elapsed, { model });

    return embedding;
  } catch (err) {
    const elapsed = Date.now() - started;
    incr("framique_ai_embed_total", { outcome: "fallback", model });
    log("warn", "ai.embed_fallback_triggered", {
      model,
      ms: elapsed,
      error: err instanceof Error ? err.message : "unknown",
    });

    if (allowFallback) {
      return generateDeterministicEmbedding(sanitized, 1024);
    }
    throw err;
  }
}

/**
 * Generate vector embeddings for a batch of strings.
 */
export async function batchGenerateEmbeddings(
  texts: string[],
  options?: { apiKey?: string; model?: string },
): Promise<number[][]> {
  return Promise.all(texts.map((t) => generateEmbedding(t, options)));
}
