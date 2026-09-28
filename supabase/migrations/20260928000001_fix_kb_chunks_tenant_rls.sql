-- ==============================================================================
-- Fix-Loop T2: scope support_kb_chunks direct reads to the owning merchant.
--
-- Defect (verified 2026-09-28): support_kb_chunks_read FOR SELECT
-- USING (true) + GRANT to authenticated, and EXECUTE on
-- support_kb_hybrid_search granted to anon, let any login read all tenants'
-- chunks (including drafts).
--
-- Fix (additive, idempotent, forward-only, fail CLOSED):
-- 1. Replace the open read policy with strict tenant isolation: a caller
--    must hold a merchant role (viewer+) on the chunk's own merchant AND the
--    parent doc must be live with a matching merchant_id. Even published
--    chunks are NOT world-readable via direct table SELECT.
-- 2. Revoke anon EXECUTE on support_kb_hybrid_search; keep
--    authenticated + service_role.
--
-- Intended callers preserved (evidence):
-- - Server KB search (src/lib/support-kb.server.ts searchKb/searchKbHybrid)
--   calls the RPC via supabaseAdmin (service_role, bypasses RLS) — unaffected.
-- - Public storefront AI endpoint
--   (src/routes/api/public/support/stream.ts) runs server-side through the
--   same service_role path; the RPC body already filters
--   c.merchant_id = _merchant_id AND d.status = 'published' AND
--   d.deleted_at IS NULL — unaffected by the tighter table policy.
-- - No browser/anon-key caller references support_kb_hybrid_search or
--   support_kb_chunks (grep 2026-09-28: only *.server.ts + tests) — revoking
--   anon EXECUTE breaks no client path.
-- Staging verify: as merchant-B user, SELECT chunks of merchant A
-- (draft AND published) must return 0 rows; own-merchant reads work.
-- ==============================================================================

alter table public.support_kb_chunks enable row level security;

drop policy if exists support_kb_chunks_read on public.support_kb_chunks;
-- NOTE on the call shape below: sibling docs/callback policies call
-- has_merchant_role(merchant_id, auth.uid(), 'viewer'::merchant_role),
-- but no (uuid, uuid, enum) overload exists — only (uuid, text, uuid)
-- and (uuid, text[], uuid) (see 20260909195000_phase2_tenancy_and_access).
-- Verified on PG16 2026-09-28: the sibling call shape fails at CREATE
-- POLICY time ("function does not exist"), so the resolvable overload
-- with identical semantics (role = 'viewer' or owner) is used here.
-- Sibling policies flagged as follow-up, not copied verbatim.
create policy support_kb_chunks_read on public.support_kb_chunks
  for select using (
    exists (
      select 1
      from public.support_kb_docs d
      where d.id = support_kb_chunks.doc_id
        and d.merchant_id = support_kb_chunks.merchant_id
        and d.deleted_at is null
    )
    and public.has_merchant_role(
      support_kb_chunks.merchant_id,
      'viewer',
      auth.uid()
    )
  );

-- Anon must use the scoped server path (service_role RPC filtered by
-- merchant_id + published); no direct anonymous chunk access.
-- NOTE: functions are EXECUTE-to-PUBLIC by default, so revoking from `anon`
-- alone is insufficient — revoke from PUBLIC as well (verified 2026-09-28:
-- has_function_privilege('anon',...,'execute') stays true otherwise).
revoke all on public.support_kb_chunks from anon;
revoke execute on function public.support_kb_hybrid_search(uuid, text, double precision[], integer, integer) from anon, public;

-- Intended callers keep working (idempotent re-grants).
grant select on public.support_kb_chunks to authenticated;
grant execute on function public.support_kb_hybrid_search(uuid, text, double precision[], integer, integer) to authenticated, service_role;
