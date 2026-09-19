-- Repair: consent_record routine never existed in repo DDL or live, so every
-- consent write fails (GDPR-relevant). Adds the missing session_token column
-- the call site sends, a uniqueness guard for state convergence (table is
-- empty live, so this is collision-free), and the routine itself: append-only
-- event + converged current state, one transaction. Idempotent.
ALTER TABLE public.consent_events
  ADD COLUMN IF NOT EXISTS session_token text;

DO $$ BEGIN
  ALTER TABLE public.customer_consents
    ADD CONSTRAINT customer_consents_subject_uniq UNIQUE
      (merchant_id, channel, purpose, subscriber_id, customer_id, session_token, subject_hash);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.consent_record(
  _merchant_id uuid,
  _channel text,
  _purpose text,
  _granted boolean,
  _source text,
  _subscriber_id uuid,
  _customer_id uuid,
  _session_token text,
  _subject_hash text,
  _actor text,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.consent_events (
    merchant_id, channel, purpose, granted, source,
    subscriber_id, customer_id, session_token, subject_hash, actor, reason
  ) VALUES (
    _merchant_id,
    _channel::public.consent_channel,
    _purpose::public.consent_purpose,
    _granted, _source,
    _subscriber_id, _customer_id, _session_token, _subject_hash, _actor, _reason
  ) RETURNING id INTO v_id;

  INSERT INTO public.customer_consents (
    merchant_id, channel, purpose, granted, source,
    subscriber_id, customer_id, session_token, subject_hash,
    granted_at, withdrawn_at, updated_at, version
  ) VALUES (
    _merchant_id,
    _channel::public.consent_channel,
    _purpose::public.consent_purpose,
    _granted, _source,
    _subscriber_id, _customer_id, _session_token, _subject_hash,
    CASE WHEN _granted THEN now() ELSE NULL END,
    CASE WHEN _granted THEN NULL ELSE now() END,
    now(), 1
  )
  ON CONFLICT
    (merchant_id, channel, purpose, subscriber_id, customer_id, session_token, subject_hash)
  DO UPDATE SET
    granted = EXCLUDED.granted,
    source = EXCLUDED.source,
    granted_at = CASE WHEN EXCLUDED.granted THEN now() ELSE customer_consents.granted_at END,
    withdrawn_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END,
    updated_at = now(),
    version = customer_consents.version + 1;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consent_record(uuid, text, text, boolean, text, uuid, uuid, text, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
