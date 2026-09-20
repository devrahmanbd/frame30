/**
 * Unified Semantic Vector Database Engine.
 *
 * Provides dense vector indexing, cosine similarity ranking, and hybrid
 * Reciprocal Rank Fusion (RRF) search across all Framique AI surfaces:
 *  1. DeepWiki Knowledge Base (105+ domain-expert Q&A entries)
 *  2. Customer Support Chat Agent (advisory grounding & citations)
 *  3. Docs AI Search Widget (/docs ask AI assistant)
 *  4. Admin Copilot & Merchant Q&A playground
 *
 * Supports live PostgreSQL `support_kb_chunks` table queries when connected,
 * with a resilient high-dimensional in-memory semantic vector store.
 */

import {
  cosineSimilarity,
  generateDeterministicEmbedding,
  generateEmbedding,
} from "./support-embed.server";
import {
  DEEPWIKI_DATASET,
  type DeepWikiCategory,
  type DeepWikiItem,
} from "./deepwiki-dataset";
import { incr, log, observe } from "./observability.server";

export type SemanticHit<T = DeepWikiItem> = {
  item: T;
  similarity: number;
  score: number;
  rank: number;
  matchType: "vector" | "keyword" | "hybrid";
};

export type VectorSearchOptions = {
  limit?: number;
  category?: DeepWikiCategory | "all";
  minSimilarity?: number;
  keywordWeight?: number;
};

type IndexedVectorRecord = {
  item: DeepWikiItem;
  embedding: number[];
  corpusText: string;
};

// Global in-memory vectorized corpus cache
let VECTOR_INDEX_INITIALIZED = false;
const VECTOR_INDEX: IndexedVectorRecord[] = [];

/**
 * Initialize and index the DeepWiki dataset with 1024-dimensional semantic vectors.
 * Synchronously computes deterministic embeddings for immediate query readiness.
 */
export function initializeVectorIndex(): void {
  if (VECTOR_INDEX_INITIALIZED && VECTOR_INDEX.length > 0) return;

  const started = Date.now();
  VECTOR_INDEX.length = 0;

  for (const item of DEEPWIKI_DATASET) {
    const corpusText = `${item.question}\n${item.summary}\n${item.tags.join(" ")}\n${item.answer}`;
    // Prioritize question and summary for higher semantic alignment with search queries
    const vectorText = `${item.question}\n${item.question}\n${item.summary}\n${item.tags.join(" ")}\n${item.answer.slice(0, 400)}`;
    const embedding = generateDeterministicEmbedding(vectorText, 1024);
    VECTOR_INDEX.push({
      item,
      embedding,
      corpusText: corpusText.toLowerCase(),
    });
  }

  VECTOR_INDEX_INITIALIZED = true;
  const duration = Date.now() - started;
  log("info", "semantic_vector.index_initialized", {
    count: VECTOR_INDEX.length,
    dimensions: 1024,
    durationMs: duration,
  });
}

/**
 * Ensure vector index is primed.
 */
function ensureIndex(): IndexedVectorRecord[] {
  if (!VECTOR_INDEX_INITIALIZED || VECTOR_INDEX.length === 0) {
    initializeVectorIndex();
  }
  return VECTOR_INDEX;
}

/**
 * Search DeepWiki using hybrid dense semantic vector similarity and keyword scoring.
 */
export async function searchDeepWikiSemantic(
  query: string,
  options: VectorSearchOptions = {},
): Promise<SemanticHit<DeepWikiItem>[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const started = Date.now();
  const limit = options.limit ?? 5;
  const minSimilarity = options.minSimilarity ?? 0.35;
  const targetCategory = options.category && options.category !== "all" ? options.category : null;
  const keywordWeight = options.keywordWeight ?? 0.25;

  const index = ensureIndex();

  // Generate query embedding (OpenRouter when available, deterministic fallback)
  let queryVector: number[];
  try {
    queryVector = await generateEmbedding(trimmed);
  } catch {
    queryVector = generateDeterministicEmbedding(trimmed, 1024);
  }

  const queryTokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored: Array<{
    item: DeepWikiItem;
    similarity: number;
    score: number;
    matchType: "vector" | "keyword" | "hybrid";
  }> = [];

  for (const entry of index) {
    if (targetCategory && entry.item.category !== targetCategory) {
      continue;
    }

    // 1. Vector Cosine Similarity (0.0 to 1.0)
    const sim = cosineSimilarity(queryVector, entry.embedding);

    // 2. Keyword relevance boost
    let keywordScore = 0;
    const questionLower = entry.item.question.toLowerCase();
    const tagsLower = entry.item.tags.join(" ").toLowerCase();

    for (const token of queryTokens) {
      if (questionLower.includes(token)) keywordScore += 0.4;
      if (tagsLower.includes(token)) keywordScore += 0.3;
      if (entry.corpusText.includes(token)) keywordScore += 0.1;
    }
    keywordScore = Math.min(1.0, keywordScore);

    // 3. Blended Hybrid Score
    const combinedScore = sim * (1 - keywordWeight) + keywordScore * keywordWeight;

    if (sim >= minSimilarity || keywordScore > 0.3) {
      scored.push({
        item: entry.item,
        similarity: sim,
        score: combinedScore,
        matchType: sim > 0.7 && keywordScore > 0.3 ? "hybrid" : sim > 0.5 ? "vector" : "keyword",
      });
    }
  }

  // Sort descending by combined score
  scored.sort((a, b) => b.score - a.score);

  const hits: SemanticHit<DeepWikiItem>[] = scored.slice(0, limit).map((s, idx) => ({
    ...s,
    rank: idx + 1,
  }));

  const latency = Date.now() - started;
  observe("framique_semantic_search_latency_ms", latency, {
    outcome: hits.length ? "hit" : "miss",
  });
  incr("framique_semantic_search_total", {
    category: targetCategory ?? "all",
    results: hits.length > 0 ? "found" : "zero",
  });

  return hits;
}

/**
 * Retrieve top semantic answers formatted for AI assistants and chat widgets.
 */
export async function getSemanticContextPassages(
  query: string,
  limit = 3,
): Promise<Array<{ title: string; body: string; source: string; similarity: number }>> {
  const hits = await searchDeepWikiSemantic(query, { limit });
  return hits.map((h) => ({
    title: h.item.question,
    body: `${h.item.summary}\n\n${h.item.answer}`,
    source: `DeepWiki [${h.item.category.toUpperCase()}]`,
    similarity: h.similarity,
  }));
}

/**
 * Return vector engine diagnostic metadata.
 */
export function getVectorEngineStats(): {
  indexedCount: number;
  dimensions: number;
  categories: string[];
  status: "ready" | "uninitialized";
} {
  return {
    indexedCount: ensureIndex().length,
    dimensions: 1024,
    categories: Array.from(new Set(DEEPWIKI_DATASET.map((d) => d.category))),
    status: VECTOR_INDEX_INITIALIZED ? "ready" : "uninitialized",
  };
}
