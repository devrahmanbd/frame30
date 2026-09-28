-- =====================================================================
-- T3 — platform charge-key merchant scoping
-- =====================================================================
-- Defect (verified 2026-09-28): `platform_charge_open` looked up the existing
-- charge by bare `idempotency_key`
-- (20260909195300_phase2_billing_and_giftcards.sql line 43, no merchant
-- filter) while keys are caller-supplied. A colliding key from merchant B
-- returned merchant A's charge row — a cross-tenant read inside a SECURITY
-- DEFINER routine that bypasses RLS. The RPC already receives `_merchant_id`.
--
-- Fix:
--   1. Scope the idempotency lookup to
--      `merchant_id = _merchant_id AND idempotency_key = _idempotency_key`,
--      so colliding keys across merchants open isolated rows while the same
--      merchant + key still returns the existing row (legitimate replay).
--   2. Replace the global `UNIQUE (idempotency_key)` with
--      `UNIQUE (merchant_id, idempotency_key)` so the database enforces the
--      same boundary against raced inserts.
--
-- Why this is safe (additive / narrowing only):
--   - The `CREATE OR REPLACE` changes ONE read predicate (narrows it). Every
--     write path, error contract, grant, and RLS policy is byte-identical.
--     Previously the lookup could return (a) the caller's own row = replay,
--     preserved; or (b) another tenant's row = the bug, now impossible. No
--     legitimate caller depended on (b) — the invoice check below already
--     rejects invoices outside `_merchant_id`.
--   - No dedupe backfill is needed: the old global UNIQUE on
--     `idempotency_key` implies `(merchant_id, idempotency_key)` uniqueness
--     for every existing row, so the new unique index builds without
--     violations. Dropping the global constraint only *permits* the newly
--     isolated cross-merchant duplicates; it deletes no data.
--   - All statements are idempotent (`IF NOT EXISTS` / constraint-existence
--     guard / `CREATE OR REPLACE`), so the migration is safe to re-run.
--
-- Verify on staging:
--   - Same key opened for two merchants yields two distinct charge rows.
--   - Same merchant + key re-open returns the existing row (replay).
--   - `\d public.platform_charges` shows unique index
--     `platform_charges_merchant_key_uidx (merchant_id, idempotency_key)`
--     and no `platform_charges_idempotency_key_key` constraint.
--
-- Snapshot note: `migration/0010_phase2_all_rpc_routines.sql` is a generated
-- pg_dump export that still contains the pre-fix shape (bare `UNIQUE
-- (idempotency_key)`, unscoped lookup). It is intentionally left untouched:
-- `scripts/db-migrate.mjs` records a sha256 per applied file and hard-errors
-- on any post-apply edit, so the fix lives ONLY here (this file). Fresh
-- environments applying `migration/` first then this file converge to the
-- scoped shape via the guarded drop + scoped index below.
-- =====================================================================

-- 1. Drop the global unique constraint on the bare key (guarded).
--    Matcher uses column identity (pg_constraint.conkey → pg_attribute),
--    not an exact `pg_get_constraintdef` string, so it survives formatting /
--    naming differences in how the table was created. The single-column
--    predicate (`array_length(conkey,1)=1`) inherently protects the scoped
--    (merchant_id, idempotency_key) constraint/index added below.
do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
  where c.conrelid = 'public.platform_charges'::regclass
    and c.contype = 'u'
    and a.attname = 'idempotency_key'
    and array_length(c.conkey, 1) = 1
  limit 1;
  if v_conname is not null then
    raise notice 'T3: dropping global unique constraint % on platform_charges(idempotency_key)', v_conname;
    execute format(
      'alter table public.platform_charges drop constraint %I', v_conname
    );
  else
    raise notice 'T3: no single-column unique constraint on platform_charges(idempotency_key); skipping drop';
  end if;
end $$;

-- 2. Merchant-scoped uniqueness backstop (race-safe replay boundary).
--    Lock plan: plain CREATE INDEX (non-CONCURRENTLY) takes a short
--    SHARE lock blocking writes. Supabase migrations run inside a
--    transaction block where CONCURRENTLY is disallowed, so plain build is
--    the only in-migration option. platform_charges is a young,
--    low-volume table (≤10 attempts/invoice, keyed opens); the build scans
--    few rows and holds the lock briefly. No dedupe backfill needed: the
--    old global UNIQUE(idempotency_key) implies scoped uniqueness for all
--    pre-existing rows, so the build cannot fail on duplicates. If this
--    table ever grows large, build the index CONCURRENTLY out-of-band
--    (with lock_timeout + statement_timeout set) before dropping the
--    global constraint, instead of relying on this statement.
create unique index if not exists platform_charges_merchant_key_uidx
  on public.platform_charges (merchant_id, idempotency_key);

-- 3. Scoped lookup. Body is identical to
--    20260909195300_phase2_billing_and_giftcards.sql except the single
--    `v_existing` predicate below.
create or replace function public.platform_charge_open(
  _merchant_id uuid,
  _invoice_id uuid,
  _method text,
  _idempotency_key text,
  _ttl_seconds integer default 1800
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing record;
  v_invoice record;
  v_attempt int;
  v_charge record;
begin
  select * into v_existing from public.platform_charges where merchant_id = _merchant_id and idempotency_key = _idempotency_key;
  if v_existing.id is not null then
    return to_jsonb(v_existing);
  end if;

  select * into v_invoice from public.invoices where id = _invoice_id and merchant_id = _merchant_id;
  if v_invoice.id is null then
    raise exception 'platform.invoice_not_found' using errcode = 'P0002';
  end if;

  if v_invoice.status = 'paid' then
    raise exception 'platform.invoice_already_paid' using errcode = '23505';
  end if;

  if v_invoice.status <> 'open' then
    raise exception 'platform.invoice_not_chargeable' using errcode = '22023';
  end if;

  select count(*) into v_attempt from public.platform_charges where invoice_id = _invoice_id;
  v_attempt := v_attempt + 1;

  if v_attempt > 10 then
    raise exception 'platform.attempts_exhausted' using errcode = '22023';
  end if;

  insert into public.platform_charges (
    merchant_id, invoice_id, method, amount_minor_int, currency_code,
    status, attempt, idempotency_key, expires_at
  ) values (
    _merchant_id, _invoice_id, _method, v_invoice.total_minor_int, v_invoice.currency_code,
    'created', v_attempt, _idempotency_key, now() + (_ttl_seconds || ' seconds')::interval
  )
  returning * into v_charge;

  return to_jsonb(v_charge);
end $$;

-- Grants unchanged (re-issued for idempotency; CREATE OR REPLACE keeps them).
GRANT EXECUTE ON FUNCTION public.platform_charge_open(uuid, uuid, text, text, integer) TO authenticated, service_role;
