-- Repair: store_currency_settings had zero DDL anywhere although the USD
-- pilot gate reads/writes it on the providers page (crashed with
-- currency.init_failed). Shape inferred STRICTLY from call sites in
-- src/lib/currency-gate.server.ts (select/update/insert keys + CurrencyState
-- mapping). REVIEW REQUIRED by a DBA before alteration: no data exists yet.
-- All access is via the service role (service layer by design); RLS is on
-- with no policies so only service_role touches it.
CREATE TABLE IF NOT EXISTS public.store_currency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'bdt_locked',
  presentation_code text NOT NULL DEFAULT 'BDT',
  settlement_code text NOT NULL DEFAULT 'BDT',
  consent_at timestamptz NULL,
  consent_by uuid NULL,
  last_gate_at timestamptz NULL,
  last_gate_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id)
);

ALTER TABLE public.store_currency_settings ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
