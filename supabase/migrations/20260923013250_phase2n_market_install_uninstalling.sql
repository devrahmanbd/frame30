-- Phase 2n — transitional `uninstalling` status for marketplace_installs (R2-6).
-- Widget uninstalls enqueue the durable `plugin.purge` job and park the ledger
-- row on `uninstalling` until the handler lands terminal `purged`. The enum
-- previously ended at `purged` (phase2j) with no transitional value, so the
-- park update was rejected by Postgres. Idempotent; additive-only (enum ADD
-- VALUE cannot be rolled back, which is safe — nothing reads this value yet).
alter type public.market_install_status add value if not exists 'uninstalling';
