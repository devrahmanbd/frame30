-- Phase P0-3 — close world-readable/writable policies (found live 2026-09-17).
-- Several *_open ALL TO public policies exposed credentials, money and
-- identity rows to anonymous internet users. service_role bypasses RLS,
-- so service paths are unaffected by every change below.

-- subscriptions: trial/plan rows were world-readable AND writable
-- (free upgrades, trial extension, deletion DoS).
drop policy if exists subscriptions_open on public.subscriptions;
create policy subscriptions_tenant_read on public.subscriptions
  for select to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin());
create policy subscriptions_tenant_write on public.subscriptions
  for all to authenticated
  using (is_merchant_member(merchant_id))
  with check (is_merchant_member(merchant_id));

-- mfa_recovery_codes: account-takeover material. Owner-only.
drop policy if exists mfa_recovery_codes_open on public.mfa_recovery_codes;
create policy mfa_recovery_owner on public.mfa_recovery_codes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- oauth_tokens: no merchant-JWT reader exists in src; service-only.
-- (Live DB also carried it as oauth_tokens_system; drop both names.)
drop policy if exists oauth_tokens_open on public.oauth_tokens;
drop policy if exists oauth_tokens_system on public.oauth_tokens;

-- integration_connections: member (+platform admin) read only.
drop policy if exists integration_connections_open on public.integration_connections;
create policy integration_connections_tenant_read on public.integration_connections
  for select to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin());

-- payout money tables: member read; writes stay service-side.
drop policy if exists payout_accounts_open on public.payout_accounts;
create policy payout_accounts_tenant_read on public.payout_accounts
  for select to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin());
drop policy if exists payout_holds_open on public.payout_holds;
create policy payout_holds_tenant_read on public.payout_holds
  for select to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin());

-- payout approvals/events: no merchant-JWT reader exists in src
-- (listPayouts approvals read is already broken on a missing column);
-- service-only until the approvals read path is rebuilt.
drop policy if exists payout_approvals_open on public.payout_approvals;
drop policy if exists payout_events_open on public.payout_events;

-- platform snapshots: service-only (snapshots.server uses supabaseAdmin).
drop policy if exists platform_snapshots_open on public.platform_snapshots;
drop policy if exists platform_snapshot_restores_open on public.platform_snapshot_restores;

-- theme favourites: owning merchant only.
drop policy if exists theme_catalog_favourites_open on public.theme_catalog_favourites;
create policy theme_catalog_favourites_tenant on public.theme_catalog_favourites
  for all to authenticated
  using (is_merchant_member(merchant_id))
  with check (is_merchant_member(merchant_id));
