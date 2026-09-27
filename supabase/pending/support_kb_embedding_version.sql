-- ==============================================================================
-- Framique: Support KB embedding version columns (Nemotron-3 migration)
-- Status: PENDING — DO NOT APPLY YET. Code works with and without these
-- columns (feature-detected in src/lib/support-kb.server.ts:
-- insertKbChunksFeatureDetected / backfillKbEmbeddings).
--
-- Apply AFTER code deploy, then run the RAG backfill to refresh stale rows:
--   backfillKbEmbeddings(db, merchantId, { dryRun: true })   -- inspect
--   backfillKbEmbeddings(db, merchantId, { batchSize: 200 }) -- refresh
-- Follow-ups once applied: extend support_kb_hybrid_search to return
-- embedding_model per hit, and consider a pgvector/IVFFLAT index if the
-- corpus outgrows brute-force cosine similarity.
-- ==============================================================================

alter table public.support_kb_chunks
  add column if not exists embedding_model text,
  add column if not exists embedding_dim integer;

-- Backfill triage: which stored vectors still need a refresh.
create index if not exists idx_support_kb_chunks_embedding_model
  on public.support_kb_chunks (merchant_id, embedding_model);

-- Mark pre-migration vectors as legacy so the backfill picks them up.
-- embedding_dim is intentionally left NULL for legacy rows: NULL dim counts
-- as stale (see rowNeedsRefresh) and the true width is recorded on refresh,
-- avoiding a hardcoded guess about the old model's dimensionality.
update public.support_kb_chunks
  set embedding_model = 'nvidia/llama-nemotron-embed-vl-1b-v2:free'
  where embedding_model is null
    and embedding is not null
    and array_length(embedding, 1) > 0;
