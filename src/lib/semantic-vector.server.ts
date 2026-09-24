/**
 * Unified Semantic Vector Database Engine — DeepWiki Removed.
 *
 * This module previously provided dense vector indexing, cosine similarity
 * ranking, and hybrid Reciprocal Rank Fusion (RRF) search powered by a
 * static DeepWiki dataset. The DeepWiki integration has been retired.
 *
 * Vector search for the knowledge base now lives in `support-kb.server.ts`
 * (PostgreSQL `support_kb_chunks` with tsvector + embedding hybrid).
 * The docs "Ask AI" widget uses the docs search index in `docs.ts`.
 *
 * This file is retained as a re-export stub so that any lingering dynamic
 * imports resolve without runtime errors. All functions return empty results.
 */

import { incr, log } from "./observability.server";

export type SemanticHit<T = Record<string, unknown>> = {
  item: T;
  similarity: number;
  score: number;
  rank: number;
  matchType: "vector" | "keyword" | "hybrid";
};

export type VectorSearchOptions = {
  limit?: number;
  category?: string;
  minSimilarity?: number;
  keywordWeight?: number;
};

/**
 * Search stub — DeepWiki has been removed. Returns empty results.
 * Callers should use `support-kb.server.ts` searchKb/searchKbHybrid instead.
 */
export async function searchDeepWikiSemantic(
  _query: string,
  _options: VectorSearchOptions = {},
): Promise<SemanticHit[]> {
  incr("framique_semantic_search_total", {
    category: "all",
    results: "removed",
  });
  return [];
}

/**
 * Retrieve top semantic answers — stub, returns empty.
 */
export async function getSemanticContextPassages(
  _query: string,
  _limit = 3,
): Promise<
  Array<{ title: string; body: string; source: string; similarity: number }>
> {
  return [];
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
    indexedCount: 0,
    dimensions: 0,
    categories: [],
    status: "uninitialized",
  };
}
