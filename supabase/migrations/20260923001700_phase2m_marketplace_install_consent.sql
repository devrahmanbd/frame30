-- Phase 2m — consent evidence columns on marketplace_installs (Task 3 follow-up).
-- Task 3 (91d96bc) writes granted_scopes + consented_by in the install insert
-- (src/lib/marketplace-install.server.ts) and marketplace-vault.server.ts:265
-- selects granted_scopes, but no migration ever created the columns — the
-- insert would fail on a real DB. Idempotent additive columns only.
-- granted_scopes mirrors plugin_state.scopes (phase2j:
-- text[] not null default '{}') so the vault read path gets string[].
-- NOTE: consented_by carries NO FK — repo has no public.users table (all user
-- FKs target auth.users); default to NULL and skip the FK rather than guess.
-- RLS is table-level and inherited from the marketplace_installs policies, so
-- no new policy statements are needed here. GRANTs restated verbatim from the
-- baseline (grant select, insert, update, delete to authenticated; grant all
-- to service_role) per the Task 4 review's RLS/GRANT textual-compliance note.
alter table public.marketplace_installs add column if not exists granted_scopes text[] not null default '{}';
alter table public.marketplace_installs add column if not exists consented_by uuid;
grant select, insert, update, delete on table public.marketplace_installs to authenticated;
grant all on table public.marketplace_installs to service_role;
