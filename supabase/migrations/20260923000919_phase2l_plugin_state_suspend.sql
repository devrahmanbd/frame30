-- Phase 2l — suspend machine + consent evidence columns (R2-1/R2-5).
-- Idempotent: mirrors the phase2j/2k pattern (live tables already exist).
-- NOTE: consented_by carries NO FK — repo grep confirms no public.users table
-- exists (all user FKs target auth.users); per brief, default to NULL and skip
-- the FK rather than guess. RLS/GRANTs already cover plugin_state via phase2j
-- (table-level, not per-column), so no new policy statements are needed here.
alter table public.plugin_state add column if not exists suspended boolean not null default false;
alter table public.plugin_state add column if not exists suspended_reason text;
alter table public.plugin_state add column if not exists suspended_at timestamptz;
alter table public.plugin_state add column if not exists version_pin text not null default '';
alter table public.plugin_state add column if not exists consented_by uuid;
alter table public.plugin_state add column if not exists manifest_version text not null default '';
