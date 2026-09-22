-- Phase 2j — capture live plugin tables in repo DDL + RLS + purged terminal.
-- Both tables already exist live (Task 1 probe 6ad92b2: plugin_state 3 rows,
-- plugin_kill_switch 0 rows) so every statement is idempotent (IF NOT EXISTS /
-- DROP POLICY IF EXISTS). Column lists mirror the live verbatim probe, plus
-- plugin_state.auto_updates (consumed by the Task 5 auto-update toggle).
-- Helpers public.is_merchant_member / public.is_platform_admin are reused,
-- NOT redefined. The kill-switch public_read policy (USING (true)) is
-- preserved exactly by design — see Task 1 report concern 3. The existing
-- 'removed' enum value is left untouched; only 'purged' is added.
create table if not exists public.plugin_state (
  id uuid default gen_random_uuid() not null primary key,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  plugin_id text not null,
  manifest jsonb not null default '{}'::jsonb,
  scopes text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  auto_updates boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint plugin_state_merchant_plugin_unique unique (merchant_id, plugin_id)
);
-- plugin_kill_switch: mirror Task-1 live columns here (same IF NOT EXISTS pattern).
create table if not exists public.plugin_kill_switch (
  id uuid default gen_random_uuid() not null primary key,
  plugin_id text not null constraint plugin_kill_switch_plugin_id_key unique,
  disabled boolean not null default true,
  reason text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.plugin_state enable row level security;
alter table public.plugin_kill_switch enable row level security;
drop policy if exists plugin_state_tenant_read on public.plugin_state;
create policy plugin_state_tenant_read on public.plugin_state for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
drop policy if exists plugin_state_tenant_write on public.plugin_state;
create policy plugin_state_tenant_write on public.plugin_state to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));
-- kill-switch: platform-admin-only policies (mirror marketplace_themes_platform_only).
drop policy if exists plugin_kill_switch_platform_manage on public.plugin_kill_switch;
create policy plugin_kill_switch_platform_manage on public.plugin_kill_switch to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists plugin_kill_switch_public_read on public.plugin_kill_switch;
create policy plugin_kill_switch_public_read on public.plugin_kill_switch for select using (true);
-- GRANTs mirror sibling tenant tables (marketplace_installs, abandoned_carts).
grant select, insert, delete, update on table public.plugin_state to authenticated;
grant all on table public.plugin_state to service_role;
grant select, insert, delete, update on table public.plugin_kill_switch to authenticated;
grant all on table public.plugin_kill_switch to service_role;
alter type public.market_install_status add value if not exists 'purged';
