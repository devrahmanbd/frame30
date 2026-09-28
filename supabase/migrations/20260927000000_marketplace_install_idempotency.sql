-- QUBICKLE H1/H2 (Rule 8) + H5 — marketplace_installs idempotency key
-- uniqueness and the terminal trial-lapse status.
--
-- CONTRACT (Rule 13 — explicit, reviewable, deterministic):
--  1. `(merchant_id, idempotency_key)` is the install event identity. The app
--     replays on this tuple (see installListing / installBuiltinWidget /
--     installCatalogTheme) and handles duplicate-key losers by reselecting
--     the winner; this UNIQUE index is the backstop that makes the race
--     impossible to stack, even across app replicas.
--  2. `lapsed` is the terminal status for expired trials (lazy-lapsed by
--     lapseExpiredTrials on every install read/write path). It is NOT a live
--     install status: badges, entitlements and resume paths exclude it.
--  3. Dedupe keeps the EARLIEST row per tuple. Same (merchant, key) means the
--     same install event by construction (keys are minted per consent
--     dialog / file-pick), so earlier duplicates can only be pre-constraint
--     double-submits — keeping the first preserves the original install.
--     Human review: if the dedupe DELETE below ever removes rows, those
--     merchants had stacked installs; their surviving (earliest) row stays
--     authoritative and no money moves (ledger entries are keyed separately).
--
-- C3 NOTE (Rule 3/12/13 decision, Sept 2026): this migration deliberately
-- does NOT touch theme-table RLS. The retire/restore contradiction was
-- resolved by keeping supabase/migrations/20260924_theme_write_restore.sql
-- (merchant-scoped tenant write policies, sorts after
-- 20260923_retire_themes.sql) as the single active contract — app writes go
-- through tenant RLS, no privileged service path. See the C3 decision note
-- at the top of src/lib/marketplace-install.server.ts.

-- 1. Dedupe pre-constraint double-submits (keep earliest per tuple).
delete from public.marketplace_installs a
where exists (
  select 1
  from public.marketplace_installs b
  where b.merchant_id = a.merchant_id
    and b.idempotency_key = a.idempotency_key
    and (
      b.created_at < a.created_at
      or (b.created_at = a.created_at and b.id < a.id)
    )
);

-- 2. The backstop: one install event per (merchant, key).
create unique index if not exists marketplace_installs_merchant_key_uidx
  on public.marketplace_installs (merchant_id, idempotency_key);

-- 3. Terminal status for expired trials.
alter type public.market_install_status add value if not exists 'lapsed';
