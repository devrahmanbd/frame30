-- Fortress incident 2026-09-19: rate_limit_hit referenced a nonexistent
-- hit_count column (table has hits), had no window semantics (cumulative
-- counter would eventually block everything), and returned boolean while the
-- app expects a verdict object. With both limiter tiers failing, the
-- per-bucket circuit breaker opened globally -> site-wide 429 storms
-- (observed on /root, system.ingress).
--
-- This replaces it with a sliding-window counter returning
-- {allowed, hits, limit, remaining, reset_at}. Applied live 2026-09-19;
-- recorded here so fresh environments converge.
-- Requires: public.rate_limit_counters(bucket text, subject text,
--   hits bigint, window_start text).

DROP FUNCTION IF EXISTS public.rate_limit_hit(text, text, integer, integer);

CREATE FUNCTION public.rate_limit_hit(_bucket text, _subject text, _limit integer, _window_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  now_ms bigint := (extract(epoch FROM now()) * 1000)::bigint;
  win_ms bigint := (_window_seconds * 1000)::bigint;
  _hits bigint;
  _wstart bigint;
BEGIN
  INSERT INTO rate_limit_counters (bucket, subject, hits, window_start)
  VALUES (_bucket, _subject, 1, now_ms::text)
  ON CONFLICT (bucket, subject) DO UPDATE SET
    hits = CASE WHEN (rate_limit_counters.window_start::bigint + win_ms) < now_ms
                THEN 1 ELSE rate_limit_counters.hits + 1 END,
    window_start = CASE WHEN (rate_limit_counters.window_start::bigint + win_ms) < now_ms
                THEN now_ms::text ELSE rate_limit_counters.window_start END
  RETURNING rate_limit_counters.hits, rate_limit_counters.window_start::bigint
    INTO _hits, _wstart;
  RETURN jsonb_build_object(
    'allowed', _hits <= _limit,
    'hits', _hits,
    'limit', _limit,
    'remaining', GREATEST(_limit - _hits, 0),
    'reset_at', to_char(to_timestamp((_wstart + win_ms) / 1000.0), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END; $fn$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rate_limit_counters_bucket_subject_key'
  ) THEN
    ALTER TABLE public.rate_limit_counters
      ADD CONSTRAINT rate_limit_counters_bucket_subject_key UNIQUE (bucket, subject);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, text, integer, integer)
  TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
