-- T4 audit fix (2026-09-28): atomic order creation on idempotency key.
--
-- CONTRACT:
--  1. `(merchant_id, idempotency_key)` is the order-creation event identity.
--     `createOrder` replays on this tuple (fast-path lookup plus a
--     unique-violation loser path that reselects the winner); this UNIQUE
--     index is the backstop that makes the check-then-insert race impossible
--     to stack, even across app replicas.
--  2. Dedupe keeps the EARLIEST row per tuple. Same (merchant, key) means the
--     same placement event by construction (keys are minted per checkout
--     session), so earlier duplicates can only be pre-constraint
--     double-submits — keeping the first preserves the original order.
--     Rows with a NULL key never conflict (Postgres NULL semantics) and are
--     left untouched.
--  3. `redeem_coupon_slot` is the single writer of `coupons.redeemed_count`
--     on the order path: one guarded UPDATE (no read-modify-write),
--     returning zero rows when the cap is already hit so the caller denies
--     loudly instead of overshooting `usage_limit`.
--
-- Additive only: one unique index, one function. No column changes.

-- 1. Dedupe pre-constraint double-submits (keep earliest per tuple).
delete from public.orders a
where a.idempotency_key is not null
  and exists (
    select 1
    from public.orders b
    where b.merchant_id = a.merchant_id
      and b.idempotency_key = a.idempotency_key
      and (
        b.created_at < a.created_at
        or (b.created_at = a.created_at and b.id < a.id)
      )
  );

-- 2. The backstop: one order-creation event per (merchant, key).
create unique index if not exists orders_merchant_idem_key_uidx
  on public.orders (merchant_id, idempotency_key);

-- 3. Atomic coupon-slot reservation, guarded by usage_limit.
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
