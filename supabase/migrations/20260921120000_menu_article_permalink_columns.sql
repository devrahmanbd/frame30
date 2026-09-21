-- Menu + article + permalink columns missing live (idempotent).
--
-- Live schema drift (verified Sept 21 by column probes): nav_menus lacks
-- `locations`, nav_menu_items lacks position/kind/ref_id/title_attr/
-- new_tab/css_class, articles lacks author_id/reading_minutes, and
-- merchant_settings lacks `permalinks`. Every one of these currently throws
-- ("column does not exist"), which silently empties dashboard menus,
-- storefront nav slots, tenant blog bylines and permalink persistence.
-- All additions are NULLABLE / defaulted: pure widening, no backfill of
-- semantics, safe to apply on a live database.

ALTER TABLE public.nav_menus
  ADD COLUMN IF NOT EXISTS locations text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.nav_menu_items
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS ref_id uuid NULL,
  ADD COLUMN IF NOT EXISTS title_attr text NULL,
  ADD COLUMN IF NOT EXISTS new_tab boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS css_class text NULL;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS author_id uuid NULL,
  ADD COLUMN IF NOT EXISTS reading_minutes integer NULL;

ALTER TABLE public.merchant_settings
  ADD COLUMN IF NOT EXISTS permalinks jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.merchant_settings
SET permalinks = setup_steps->'permalinks'
WHERE setup_steps ? 'permalinks'
  AND (permalinks IS NULL OR permalinks = '{}'::jsonb);
