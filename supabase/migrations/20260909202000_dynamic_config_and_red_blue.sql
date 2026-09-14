-- ==============================================================================
-- Framique: Platform Dynamic Red/Blue Configuration & Per-Tenant Vault Hardening
-- Migration: 20260909202000_dynamic_config_and_red_blue.sql
-- ==============================================================================

-- 1. Create the platform_dynamic_config table
create table if not exists public.platform_dynamic_config (
  id text primary key,
  description text,
  active_slot text not null check (active_slot in ('blue', 'red')) default 'blue',
  blue_payload jsonb not null default '{}'::jsonb,
  red_payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  last_swapped_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.platform_dynamic_config is
  'Dynamic runtime configuration with blue/red active-standby algorithmic slots for zero-downtime rotation of platform keys, error tracking DSNs, and gateways.';

-- Enable Row Level Security
alter table public.platform_dynamic_config enable row level security;

-- Only platform administrators can read or mutate dynamic configuration
drop policy if exists platform_dynamic_config_admin_read on public.platform_dynamic_config;
create policy platform_dynamic_config_admin_read
  on public.platform_dynamic_config
  for select
  using (public.is_platform_admin(auth.uid()));

drop policy if exists platform_dynamic_config_admin_write on public.platform_dynamic_config;
create policy platform_dynamic_config_admin_write
  on public.platform_dynamic_config
  for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Grants: anon and authenticated have NO access; service_role has full access
revoke all on public.platform_dynamic_config from anon;
grant select, insert, update on public.platform_dynamic_config to authenticated;
grant all on public.platform_dynamic_config to service_role;

-- 2. Staging Routine: Update candidate slot payload
create or replace function public.platform_stage_config_slot(
  _config_id text,
  _target_slot text,
  _payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
begin
  if not public.is_platform_admin(_user_id) and current_user not in ('service_role', 'postgres') then
    raise exception 'access_denied: platform admin required';
  end if;

  if _target_slot not in ('blue', 'red') then
    raise exception 'invalid_slot: target_slot must be blue or red';
  end if;

  insert into public.platform_dynamic_config (
    id,
    active_slot,
    blue_payload,
    red_payload,
    updated_at,
    updated_by
  )
  values (
    _config_id,
    'blue',
    case when _target_slot = 'blue' then _payload else '{}'::jsonb end,
    case when _target_slot = 'red' then _payload else '{}'::jsonb end,
    now(),
    _user_id
  )
  on conflict (id) do update set
    blue_payload = case when _target_slot = 'blue' then _payload else platform_dynamic_config.blue_payload end,
    red_payload  = case when _target_slot = 'red'  then _payload else platform_dynamic_config.red_payload end,
    updated_at   = now(),
    updated_by   = _user_id;

  return jsonb_build_object(
    'ok', true,
    'config_id', _config_id,
    'staged_slot', _target_slot
  );
end;
$$;

-- 3. Promotion Routine: Atomically flip active_slot
create or replace function public.platform_promote_config_slot(
  _config_id text,
  _target_slot text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _prev_slot text;
  _new_version integer;
begin
  if not public.is_platform_admin(_user_id) and current_user not in ('service_role', 'postgres') then
    raise exception 'access_denied: platform admin required';
  end if;

  if _target_slot not in ('blue', 'red') then
    raise exception 'invalid_slot: target_slot must be blue or red';
  end if;

  select active_slot into _prev_slot
  from public.platform_dynamic_config
  where id = _config_id
  for update;

  if not found then
    raise exception 'config_not_found: %', _config_id;
  end if;

  update public.platform_dynamic_config
  set active_slot = _target_slot,
      version = version + 1,
      last_swapped_at = now(),
      updated_at = now(),
      updated_by = _user_id
  where id = _config_id
  returning version into _new_version;

  -- Record in platform audit log
  perform public.platform_audit_event(
    'config.slot_promoted',
    jsonb_build_object(
      'config_id', _config_id,
      'previous_slot', _prev_slot,
      'new_slot', _target_slot,
      'version', _new_version,
      'reason', _reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'config_id', _config_id,
    'previous_slot', _prev_slot,
    'active_slot', _target_slot,
    'version', _new_version
  );
end;
$$;

-- 4. Fast Retrieval Routine: Get Active Slot Payload
create or replace function public.platform_get_active_config(
  _config_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _row record;
begin
  select active_slot, blue_payload, red_payload, version, updated_at
  into _row
  from public.platform_dynamic_config
  where id = _config_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'config_id', _config_id,
    'active_slot', _row.active_slot,
    'version', _row.version,
    'updated_at', _row.updated_at,
    'payload', case when _row.active_slot = 'blue' then _row.blue_payload else _row.red_payload end
  );
end;
$$;

-- Seed default entries for error tracking and platform gateway if not present
insert into public.platform_dynamic_config (id, description, active_slot, blue_payload, red_payload)
values
  ('error_tracking', 'Platform error reporting (GlitchTip / Sentry) DSN and sampling rules', 'blue',
   jsonb_build_object('sample_rate', 1.0, 'quota_per_minute', 120, 'environment', 'production'),
   jsonb_build_object('sample_rate', 1.0, 'quota_per_minute', 120, 'environment', 'production')),
  ('platform_billing', 'Platform subscription invoice gateway fallbacks', 'blue',
   jsonb_build_object('mode', 'live', 'primary_rail', 'bkash'),
   jsonb_build_object('mode', 'live', 'primary_rail', 'bkash'))
on conflict (id) do nothing;
