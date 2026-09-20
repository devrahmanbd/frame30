/**
 * DeepWiki Knowledge Base & Training Dataset — REMOVED.
 *
 * This module previously contained 105+ hardcoded Q&A entries used by the
 * semantic vector engine. The DeepWiki integration has been retired in favour
 * of the live PostgreSQL `support_kb_chunks` knowledge base and the docs
 * search index, which are authoritative and maintainable without a static
 * JSON dataset.
 *
 * All downstream consumers (semantic-vector.server.ts, copilot, docs-ai)
 * have been updated to remove DeepWiki references.
 */

export type DeepWikiCategory = never;
export type DeepWikiItem = never;
export const DEEPWIKI_CATEGORIES: never[] = [];
export const DEEPWIKI_DATASET: never[] = [];
