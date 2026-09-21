-- Permalink settings column: permalink.server.ts reads/writes
-- merchant_settings.permalinks, which never shipped with a migration, so
-- every load fell back to DEFAULT_PERMALINKS and every save failed with
-- "column does not exist". Creates it now, idempotently, backfilling any
-- structures previously stored under setup_steps.permalinks.

ALTER TABLE public.merchant_settings
  ADD COLUMN IF NOT EXISTS permalinks jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.merchant_settings
SET permalinks = setup_steps->'permalinks'
WHERE setup_steps ? 'permalinks'
  AND (permalinks IS NULL OR permalinks = '{}'::jsonb);
