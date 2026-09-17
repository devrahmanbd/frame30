-- Phase 2f — marketplace_installs lifecycle timestamps.
-- market_apply_theme_install / market_revert_theme_install set
-- installed_at / removed_at, but the columns never existed, so pausing,
-- resuming or rolling back ANY theme install failed. Nullable: existing
-- rows predate the tracking.
alter table public.marketplace_installs
  add column if not exists installed_at timestamptz,
  add column if not exists removed_at timestamptz;
