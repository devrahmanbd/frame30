-- Add risk_tier enum and columns for 4-tier sandboxing.

do $$ begin
  create type public.risk_tier as enum ('low', 'lower_medium', 'medium', 'high');
exception when duplicate_object then null;
end $$;

-- Add risk_tier to merchants table
alter table public.merchants
  add column if not exists risk_tier public.risk_tier default 'low' not null;

-- Add risk tracking columns
alter table public.merchants
  add column if not exists risk_tier_updated_at timestamptz default now() not null,
  add column if not exists risk_tier_reason text default '' not null,
  add column if not exists abuse_score int default 0 not null,
  add column if not exists abuse_flags jsonb default '[]'::jsonb not null;

-- Index for fast tier lookups
create index if not exists idx_merchants_risk_tier on public.merchants (risk_tier);

-- Abuse signal log (append-only)
create table if not exists public.risk_audit_log (
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  old_tier public.risk_tier,
  new_tier public.risk_tier not null,
  reason text not null,
  signal_data jsonb default '{}'::jsonb not null,
  actor text default 'system' not null,
  created_at timestamptz default now() not null,
  primary key (id)
);

create index if not exists idx_risk_audit_log_merchant on public.risk_audit_log (merchant_id, created_at desc);

-- RPC: get merchant risk tier
create or replace function public.get_merchant_risk_tier(p_merchant_id uuid)
returns public.risk_tier
language sql
security definer
stable
as $$
  select coalesce(risk_tier, 'low'::public.risk_tier)
  from public.merchants
  where id = p_merchant_id;
$$;

-- RPC: set merchant risk tier (admin only)
create or replace function public.set_merchant_risk_tier(
  p_merchant_id uuid,
  p_tier public.risk_tier,
  p_reason text,
  p_actor text default 'admin'
)
returns void
language plpgsql
security definer
as $$
declare
  v_old_tier public.risk_tier;
begin
  select risk_tier into v_old_tier
  from public.merchants
  where id = p_merchant_id;

  update public.merchants
  set risk_tier = p_tier,
      risk_tier_updated_at = now(),
      risk_tier_reason = p_reason
  where id = p_merchant_id;

  insert into public.risk_audit_log (merchant_id, old_tier, new_tier, reason, actor)
  values (p_merchant_id, v_old_tier, p_tier, p_reason, p_actor);
end;
$$;

-- RPC: record abuse signal
create or replace function public.record_abuse_signal(
  p_merchant_id uuid,
  p_signal_type text,
  p_signal_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_abuse_score int;
  v_new_tier public.risk_tier;
begin
  -- Increment abuse score
  update public.merchants
  set abuse_score = abuse_score + 1,
      abuse_flags = abuse_flags || jsonb_build_array(
        jsonb_build_object('type', p_signal_type, 'at', now(), 'data', p_signal_data)
      )
  where id = p_merchant_id
  returning abuse_score into v_abuse_score;

  -- Auto-escalate tier based on score
  v_new_tier := case
    when v_abuse_score >= 10 then 'high'::public.risk_tier
    when v_abuse_score >= 5 then 'medium'::public.risk_tier
    else null::public.risk_tier
  end;

  if v_new_tier is not null then
    perform public.set_merchant_risk_tier(p_merchant_id, v_new_tier, 'auto:' || p_signal_type, 'system');
  end if;
end;
$$;

-- RLS: only admins can read/write risk_audit_log
alter table public.risk_audit_log enable row level security;

create policy "risk_audit_log_admin_all" on public.risk_audit_log
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "risk_audit_log_service_role" on public.risk_audit_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- RLS: merchants can only read their own risk_tier
create policy "merchants_read_own_risk_tier" on public.merchants
  for select
  using (
    id in (
      select merchant_id from public.merchant_members
      where user_id = auth.uid()
    )
  );

-- Grant execute on RPCs
grant execute on function public.get_merchant_risk_tier(uuid) to authenticated;
grant execute on function public.set_merchant_risk_tier(uuid, public.risk_tier, text, text) to service_role;
grant execute on function public.record_abuse_signal(uuid, text, jsonb) to service_role;
