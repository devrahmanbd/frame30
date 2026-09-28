-- T4 audit fix (2026-09-28): atomic order creation on idempotency key.
--
-- CONTRACT:
--  1. `(merchant_id, idempotency_key)` is the order-creation event identity.
--     `createOrder` replays on this tuple (fast-path lookup plus a
--     unique-violation loser path that reselects the winner); this UNIQUE
--     index is the backstop that makes the check-then-insert race impossible
--     to stack, even across app replicas.
--  2. Pre-constraint duplicates are NEVER deleted by this migration. If the
--     index build reports duplicates, run the report-first flow:
--       node scripts/audit-orders-idempotency.mjs   # SELECT-only duplicate report
--     and have a human disposition each group (keep earliest per
--     `(merchant_id, idempotency_key)`, NULL keys never conflict) BEFORE any
--     constrained delete. History on the money table is not rewritten by
--     deploy.
--  3. `redeem_coupon_slot` is the single writer of `coupons.redeemed_count`
--     on the order path: one guarded UPDATE (no read-modify-write),
--     returning zero rows when the cap is already hit so the caller denies
--     loudly instead of overshooting `usage_limit`. `createOrder` reserves
--     slots BEFORE the order insert, so a denied coupon never leaves a live
--     discounted order; `release_coupon_slot` compensates reservations when
--     a later step fails. Both routines are service-role only: any anon
--     client able to execute the redeemer could exhaust coupon caps.
--
-- Additive only: one unique index, two functions, privilege locks.
-- No column changes, no data deletes.

-- 1. The backstop: one order-creation event per (merchant, key).
create unique index if not exists orders_merchant_idem_key_uidx
  on public.orders (merchant_id, idempotency_key);

-- 2. Atomic coupon-slot reservation, guarded by usage_limit.
create or replace function public.redeem_coupon_slot(_coupon_id uuid)
returns table (
  slot_coupon_id uuid,
  slot_redeemed bigint,
  slot_limit bigint
)
language sql
security definer
set search_path = public
as $$
  update public.coupons
  set redeemed_count = redeemed_count + 1,
      updated_at = now()
  where id = _coupon_id
    and (usage_limit is null or redeemed_count < usage_limit)
  returning id, redeemed_count, usage_limit;
$$;

-- 3. Compensating release for a pre-reserved slot (order insert lost the
-- race, a later write failed, or the submit is denied after reserving).
-- Floored at zero so a double-release can never drive the count negative.
create or replace function public.release_coupon_slot(_coupon_id uuid)
returns table (
  slot_coupon_id uuid,
  slot_redeemed bigint
)
language sql
security definer
set search_path = public
as $$
  update public.coupons
  set redeemed_count = greatest(redeemed_count - 1, 0),
      updated_at = now()
  where id = _coupon_id
    and redeemed_count > 0
  returning id, redeemed_count;
$$;

-- 4. Privilege lock (repo convention: 20260907174014 security fixes).
-- Only the service role (used by `createOrder` via supabaseAdmin) may
-- reserve or release coupon slots. No anon or authenticated client path
-- calls these routines — quote-time validation is a plain read.
revoke execute on function public.redeem_coupon_slot(uuid) from public;
grant execute on function public.redeem_coupon_slot(uuid) to service_role;
revoke execute on function public.release_coupon_slot(uuid) from public;
grant execute on function public.release_coupon_slot(uuid) to service_role;
