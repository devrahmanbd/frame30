-- Phase 2c — repair schema drift found live on framebase (2026-09-17).
--
-- The deployed database was missing routines and columns that the app and
-- earlier migrations assume. Every statement below is idempotent and safe
-- on both fresh deploys (where the baseline already has the full shape)
-- and the drifted database (where the stub shape needs upgrading).
--
-- 1. trial_fingerprints lacked merchant_id, breaking billing_trial_claim
--    (onboarding failed with "Billing is temporarily unavailable").
-- 2. trial_fingerprints had no UNIQUE(fingerprint), breaking the
--    ON CONFLICT(fingerprint) clause in the same routine.
-- 3. subscriptions was a stub (plan_id uuid, text status, periods) while
--    the whole billing desk expects the baseline shape (plan enum,
--    trial_ends_at, subscription_status, ...). Columns are added, the
--    text status is converted to the enum, stub columns are left in place.
-- 4. merchant_settings had no UNIQUE(merchant_id), breaking the
--    ON CONFLICT(merchant_id) clause in create_store.
-- 5. cms_entitlements is (re)defined to match the normalizeSnapshot
--    contract in src/lib/entitlements.ts; the previous stub counted a
--    cms_posts table that has no merchant_id.

-- 1+2. trial_fingerprints shape
alter table public.trial_fingerprints add column if not exists merchant_id uuid;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'trial_fingerprints_fingerprint_uq'
  ) then
    alter table public.trial_fingerprints
      add constraint trial_fingerprints_fingerprint_uq unique (fingerprint);
  end if;
end $$;

-- 3. subscriptions shape (baseline columns the stub never had)
alter table public.subscriptions
  add column if not exists cancelled_at timestamptz,
  add column if not exists currency_code text default 'BDT' not null,
  add column if not exists current_period_start text default '' not null,
  add column if not exists dunning_stage bigint default 0 not null,
  add column if not exists grace_until text,
  add column if not exists next_billing_at timestamptz,
  add column if not exists past_due_since text,
  add column if not exists paused_at timestamptz,
  add column if not exists plan public.billing_plan default 'launch'::public.billing_plan not null,
  add column if not exists scheduled_plan public.billing_plan,
  add column if not exists scheduled_plan_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_fingerprint text,
  add column if not exists trial_started_at timestamptz;

-- 'trial' value may be missing where the enum was created by hand.
alter type public.subscription_status add value if not exists 'trial';

-- Convert a legacy text status to the enum (no-op on fresh deploys where
-- the column already is subscription_status).
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions'
      and column_name = 'status' and udt_name <> 'subscription_status'
  ) then
    alter table public.subscriptions alter column status drop default;
    alter table public.subscriptions
      alter column status type public.subscription_status
      using status::public.subscription_status;
  end if;
end $$;
alter table public.subscriptions
  alter column status set default 'trial'::public.subscription_status,
  alter column status set not null;
alter table public.subscriptions
  alter column current_period_start set default now(),
  alter column current_period_end set default now();

-- 4. merchant_settings uniqueness for create_store's upsert
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'merchant_settings_merchant_id_uq'
  ) then
    alter table public.merchant_settings
      add constraint merchant_settings_merchant_id_uq unique (merchant_id);
  end if;
end $$;

-- 5. cms_entitlements matching the normalizeSnapshot contract.
-- Caps: products/staff from tenant_limits override else plan definition;
-- the other five resources have no per-plan numbers anywhere in the
-- schema, so they report cap -1 (normalizeSnapshot defaults missing to
-- cap 0, which would block every write).
create or replace function public.cms_entitlements(_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.billing_plan := 'launch'::public.billing_plan;
  v_status text := 'none';
  v_trial text := null;
  v_prod_cap bigint := -1;
  v_staff_cap bigint := -1;
  v_products bigint := 0;
  v_staff bigint := 0;
  v_articles bigint := 0;
begin
  select s.plan, s.status::text, s.trial_ends_at::text
    into v_plan, v_status, v_trial
  from public.subscriptions s
  where s.merchant_id = _merchant_id
  order by s.created_at desc
  limit 1;

  select coalesce(t.products_limit, d.products_limit, -1),
         coalesce(t.staff_limit, d.staff_limit, -1)
    into v_prod_cap, v_staff_cap
  from (select 1) x
  left join public.tenant_limits t on t.merchant_id = _merchant_id
  left join public.plan_definitions d on d.plan = coalesce(v_plan, 'launch'::public.billing_plan);

  select count(*) into v_products from public.products p
  where p.merchant_id = _merchant_id and p.deleted_at is null;

  select count(*) into v_staff from public.merchant_members m
  where m.merchant_id = _merchant_id and m.status = 'active';

  select count(*) into v_articles from public.articles a
  where a.merchant_id = _merchant_id and a.deleted_at is null;

  return jsonb_build_object(
    'plan', v_plan::text,
    'status', coalesce(v_status, 'none'),
    'trial_ends_at', v_trial,
    'resources', jsonb_build_object(
      'articles', jsonb_build_object('cap', -1, 'used', v_articles),
      'media_bytes', jsonb_build_object('cap', -1, 'used', 0),
      'revision_retention', jsonb_build_object('cap', -1, 'used', 0),
      'gsc_properties', jsonb_build_object('cap', -1, 'used', 0),
      'health_scans', jsonb_build_object('cap', -1, 'used', 0),
      'products', jsonb_build_object('cap', v_prod_cap, 'used', v_products),
      'staff', jsonb_build_object('cap', v_staff_cap, 'used', v_staff)
    )
  );
end $$;
grant execute on function public.cms_entitlements(uuid) to authenticated, service_role;
