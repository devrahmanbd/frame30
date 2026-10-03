-- ==============================================================================
-- Framique: Support revision review store (daily revision → human approval)
-- Status: PENDING — DO NOT APPLY YET. All code in
-- src/lib/support-revision-review.server.ts and the runRevisionJob persist
-- path feature-detects this table (missing-table → log + skip, never throw),
-- so the daily job keeps its job-result-only behaviour until this lands.
--
-- Apply AFTER code deploy. No backfill needed: rows are written by the daily
-- job going forward (poor/severe revisions only).
--
-- RLS mirrors the sibling support tables (support_kb_docs tenant policies in
-- supabase/migrations/20260910000000_phase9_support_kb_hybrid_search.sql and
-- ai_conversation_feedback in .../20260910020000_phase9_csat_and_training_data.sql):
--   - read: merchant viewers and above (has_merchant_role … 'viewer')
--   - write: merchant editors and above (has_merchant_role … 'editor')
-- service_role bypasses RLS (daily job persist + apply path use supabaseAdmin).
-- ==============================================================================

create table if not exists public.support_revision_reviews (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  conversation_id uuid null,
  turn_ref text not null,
  original_reply text not null,
  revised_reply text not null,
  score_json jsonb not null default '{}'::jsonb,
  severity text not null default 'low' check (severity in ('none', 'low', 'severe')),
  rubric_version text not null default 'proper-v1',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'applied')),
  reviewer text null,
  reviewed_at timestamptz null,
  applied_action text null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_revision_reviews_merchant_status
  on public.support_revision_reviews (merchant_id, status, created_at desc);

create index if not exists idx_revision_reviews_merchant_conv
  on public.support_revision_reviews (merchant_id, conversation_id);

alter table public.support_revision_reviews enable row level security;

drop policy if exists support_revision_reviews_tenant_read on public.support_revision_reviews;
create policy support_revision_reviews_tenant_read on public.support_revision_reviews
  for select using (
    public.is_merchant_member(merchant_id, auth.uid())
  );

drop policy if exists support_revision_reviews_tenant_write on public.support_revision_reviews;
create policy support_revision_reviews_tenant_write on public.support_revision_reviews
  for all using (
    public.is_merchant_admin(merchant_id, auth.uid())
  )
  with check (
    public.is_merchant_admin(merchant_id, auth.uid())
  );

grant select, insert, update on public.support_revision_reviews to authenticated;
grant all on public.support_revision_reviews to service_role;
