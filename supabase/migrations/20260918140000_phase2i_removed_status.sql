-- Phase 2i — terminal `removed` status for marketplace_installs.
-- Uninstall flows retire the ledger row instead of deleting it (audit
-- trail); the enum previously ended at rolled_back, so the retire update
-- was rejected by Postgres. Idempotent.
alter type public.market_install_status add value if not exists 'removed';
