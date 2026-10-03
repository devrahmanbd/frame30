-- ==============================================================================
-- Framique: marketplace_installs recurring billing columns (LANE G)
-- Status: PENDING — DO NOT APPLY YET. Code works with and without these
-- columns (feature-detected in src/lib/marketplace-install.server.ts:
-- isMissingRecurringColumnError / setInstallBillingSchedule /
-- processInstallRenewal / lapseExpiredTrials; optimistic write first, on
-- missing-column failure degrade to one-time semantics and log a warn).
--
-- Apply AFTER code deploy. No backfill: pre-migration rows keep the
-- one-time default ('one_time', NULL renews) which matches their purchase
-- behaviour. New paid recurring purchases write billing_interval/renews_at
-- via setInstallBillingSchedule; the daily renewal sweep
-- (runInstallRenewalSweep in src/lib/billing-cron.server.ts) extends them.
--
-- RLS is table-level and inherited from the marketplace_installs policies,
-- so no GRANT/policy change here (same as the consent-columns migration
-- 20260923001700_phase2m).
-- ==============================================================================

alter table public.marketplace_installs
  add column if not exists billing_interval text not null default 'one_time',
  add column if not exists renews_at timestamptz,
  add column if not exists last_renewed_at timestamptz;

-- Renewal sweep triage: due renewals are renews_at <= now().
create index if not exists marketplace_installs_renews_idx
  on public.marketplace_installs (renews_at)
  where renews_at is not null;
