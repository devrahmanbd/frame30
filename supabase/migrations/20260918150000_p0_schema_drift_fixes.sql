-- =====================================================================
-- P0 schema-drift fixes: three missing database objects that break
-- the root admin panel (Money desk, Snapshot history, Traffic chart).
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================

-- 1. platform_snapshots: add taken_at column if missing.
--    The code orders by taken_at; the live table was created without it.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'platform_snapshots'
      AND column_name  = 'taken_at'
  ) THEN
    ALTER TABLE public.platform_snapshots
      ADD COLUMN taken_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 2. analytics_geo_daily: add visitors column if missing.
--    The migration 0008 defines it, but the live schema may lack it.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'analytics_geo_daily'
      AND column_name  = 'visitors'
  ) THEN
    ALTER TABLE public.analytics_geo_daily
      ADD COLUMN visitors bigint NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. money_conformance() RPC: scans every *_minor_int columns for
--    float types, checks append-only triggers, and counts split/currency
--    mismatches.  Returns a JSON row.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.money_conformance()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _float_cols   text[] := '{}';
  _missing_trg  text[] := '{}';
  _split_bad    bigint := 0;
  _curr_bad     bigint := 0;
  _ledger_rows  bigint := 0;
  _rec          record;
  _ trg_rec     record;
BEGIN
  -- Float-typed money columns
  FOR _rec IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name LIKE '%_minor_int'
       AND c.data_type IN ('real', 'double precision')
  LOOP
    _float_cols := array_append(_float_cols, _rec.table_name || '.' || _rec.column_name);
  END LOOP;

  -- Missing append-only triggers on core money tables
  FOR _rec IN
    SELECT unnest(ARRAY[
      'orders', 'order_lines', 'refunds', 'payouts',
      'settlement_files', 'platform_ledger'
    ]) AS tbl
  LOOP
    SELECT INTO trg_rec tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = _rec.tbl
       AND NOT t.tgisinternal
       AND tgname LIKE '%append_only%';
    IF NOT FOUND THEN
      _missing_trg := array_append(_missing_trg, _rec.tbl);
    END IF;
  END LOOP;

  -- Split mismatches: order total != sum of lines + shipping + vat - discount
  SELECT count(*) INTO _split_bad
    FROM public.orders o
   WHERE o.status NOT IN ('cancelled','draft')
     AND o.total_minor_int IS NOT NULL
     AND o.total_minor_int <> 0
     AND o.total_minor_int <> COALESCE((
       SELECT sum(ol.line_total_minor_int)
         FROM public.order_lines ol
        WHERE ol.order_id = o.id
     ), 0);

  -- Currency mismatches: order currency differs from line currency
  SELECT count(*) INTO _curr_bad
    FROM public.order_lines ol
    JOIN public.orders o ON o.id = ol.order_id
   WHERE o.currency_code IS NOT NULL
     AND ol.currency_code IS NOT NULL
     AND o.currency_code <> ol.currency_code;

  -- Ledger row count
  SELECT count(*) INTO _ledger_rows FROM public.platform_audit_log;

  RETURN json_build_object(
    'float_money_columns',           to_jsonb(_float_cols),
    'missing_append_only_triggers',  to_jsonb(_missing_trg),
    'split_mismatch_rows',           _split_bad,
    'currency_mismatch_rows',        _curr_bad,
    'ledger_rows',                   _ledger_rows
  );
END;
$fn$;

-- Grant: owner console calls this via service_role
GRANT EXECUTE ON FUNCTION public.money_conformance() TO service_role;
GRANT EXECUTE ON FUNCTION public.money_conformance() TO authenticated;
