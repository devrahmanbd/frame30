-- T3 fix-loop hardening verification (reproducible, scratch DB only).
-- Proves against supabase/migrations/20260928000001_platform_charges_merchant_key_scope.sql:
--   1. cross-merchant isolation (same key, two merchants -> two rows)
--   2. same-merchant replay (re-open returns the existing row)
--   3. idempotent re-run (migration applies twice with no error)
--   4. hardened constraint-drop matcher (NOTICE on drop; NOTICE + skip on re-run)
--
-- Run (as a superuser; paths relative to this file's directory):
--   createdb t3verify && psql -d t3verify -v ON_ERROR_STOP=1 -f verify-logs/t3-verify.sql
--   dropdb t3verify   (afterwards; scratch roles are removed by the script itself)
-- Run from the repo root so the \ir paths below resolve.

\set QUIET off

-- Minimal stubs for the merchants/invoices FK targets.
create table public.merchants (id uuid primary key);
create table public.invoices (
  id uuid primary key,
  merchant_id uuid not null references public.merchants(id),
  status text not null,
  total_minor_int bigint not null,
  currency_code text not null
);

-- Pre-fix table shape: GLOBAL unique on the bare key (as the 0010 snapshot had it).
create table public.platform_charges (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  method text not null,
  amount_minor_int bigint not null,
  currency_code text not null default 'BDT',
  status text not null default 'created',
  attempt integer not null default 1,
  idempotency_key text not null unique,
  provider_reference text,
  return_nonce text not null default 'x',
  failure_code text,
  receipt_number text,
  expires_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.merchants values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
insert into public.invoices values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'open', 1000, 'BDT'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'open', 2000, 'BDT');

-- Scratch roles so the migration's GRANTs succeed outside Supabase.
-- Tracks which roles we created so cleanup only drops those.
create temp table t3_roles_created (rolname text primary key);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
    insert into t3_roles_created values ('authenticated');
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
    insert into t3_roles_created values ('service_role');
  end if;
end $$;

\echo '=== FIRST APPLY (expect NOTICE: dropping global unique) ==='
\ir ../supabase/migrations/20260928000001_platform_charges_merchant_key_scope.sql

\echo '=== SAME KEY, TWO MERCHANTS -> MUST ISOLATE (two distinct rows) ==='
select (platform_charge_open(
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bkash', 'shared-key')->>'id') as a_id \gset
select (platform_charge_open(
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bkash', 'shared-key')->>'id') as b_id \gset
select :'a_id' as a_id, :'b_id' as b_id,
  (:'a_id' <> :'b_id') as isolated;
select id, merchant_id, idempotency_key from public.platform_charges
  where idempotency_key = 'shared-key' order by merchant_id;
select count(*) as total_rows,
  count(distinct id) as distinct_rows,
  count(distinct merchant_id) as merchants
  from public.platform_charges where idempotency_key = 'shared-key';

\echo '=== SAME MERCHANT REPLAY -> MUST RETURN SAME ROW ==='
select ((platform_charge_open(
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bkash', 'shared-key'))->>'id')
  = (select id::text from public.platform_charges
      where merchant_id = '11111111-1111-1111-1111-111111111111'
        and idempotency_key = 'shared-key')
  as replay_same_row;

\echo '=== CONSTRAINT / INDEX STATE (no single-col unique; scoped index present) ==='
select conname, pg_get_constraintdef(oid) as def from pg_constraint
  where conrelid = 'public.platform_charges'::regclass and contype = 'u';
select indexname from pg_indexes
  where schemaname = 'public' and tablename = 'platform_charges'
    and indexname = 'platform_charges_merchant_key_uidx';

\echo '=== SECOND APPLY (expect NOTICE: skipping drop; must not error) ==='
\ir ../supabase/migrations/20260928000001_platform_charges_merchant_key_scope.sql

\echo '=== POST-RERUN ISOLATION STILL HOLDS ==='
select count(*) as total_rows from public.platform_charges where idempotency_key = 'shared-key';

-- Cleanup: drop only the roles this script created (cluster-level objects).
do $$ declare r text; begin
  for r in select rolname from t3_roles_created loop
    execute format('drop role %I', r);
  end loop;
end $$;
