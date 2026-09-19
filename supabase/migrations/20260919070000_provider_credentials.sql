-- Repair: provider_credentials (+ events) had zero DDL anywhere although the
-- entire provider gate reads/writes them (providers page crashed). Shape
-- inferred STRICTLY from code call sites in src/lib/provider-gate.server.ts
-- (insert/select/update/patch keys + Row usage). REVIEW REQUIRED by a DBA
-- before any alteration: no data exists yet, so creation is risk-free, but
-- column choices are reverse-engineered, not spec'd.
-- Tables are empty live: constraints are collision-free by construction.

CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  rail text NOT NULL,
  environment text NOT NULL DEFAULT 'live',
  state text NOT NULL DEFAULT 'draft',
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid NULL,
  provider_merchant_ref text NULL,
  secret_ciphertext text NULL,
  submitted_at timestamptz NULL,
  decided_at timestamptz NULL,
  decision_note text NULL,
  activated_at timestamptz NULL,
  suspended_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, provider_key, environment)
);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_merchant
  ON public.provider_credentials (merchant_id);

CREATE TABLE IF NOT EXISTS public.provider_credential_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  credential_id uuid NOT NULL REFERENCES public.provider_credentials(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event text NOT NULL,
  from_state text NULL,
  to_state text NULL,
  actor uuid NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_credential_events_cred
  ON public.provider_credential_events (credential_id, created_at DESC);

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_credential_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_credentials_tenant_read ON public.provider_credentials;
CREATE POLICY provider_credentials_tenant_read ON public.provider_credentials
  FOR SELECT TO authenticated USING (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS provider_credentials_tenant_write ON public.provider_credentials;
CREATE POLICY provider_credentials_tenant_write ON public.provider_credentials
  FOR ALL TO authenticated USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

DROP POLICY IF EXISTS provider_credential_events_tenant_read ON public.provider_credential_events;
CREATE POLICY provider_credential_events_tenant_read ON public.provider_credential_events
  FOR SELECT TO authenticated USING (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS provider_credential_events_tenant_write ON public.provider_credential_events;
CREATE POLICY provider_credential_events_tenant_write ON public.provider_credential_events
  FOR ALL TO authenticated USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

NOTIFY pgrst, 'reload schema';
