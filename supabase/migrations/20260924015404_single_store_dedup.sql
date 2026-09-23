-- Single-store dedup: collapse grandfathered multi-owner accounts.
--
-- The trg_single_store_ownership gate (20260921120001) refuses NEW second
-- ownerships, but accounts created before it keep every store. This
-- migration detaches the extras: per user, the OLDEST merchant ownership
-- (by merchants.created_at, then membership created_at, then ids) is kept;
-- all other ACTIVE owner rows are deleted.
--
-- Only owner rows are touched: staff memberships and merchant rows
-- (products, orders, domains) are never modified — detached stores become
-- ownerless for ops reassignment, nothing is destroyed.
--
-- Re-runnable: no-op when every owner holds exactly one active store.

delete from public.merchant_members m
using (
  select
    mm.user_id,
    mm.merchant_id,
    row_number() over (
      partition by mm.user_id
      order by merch.created_at asc, mm.created_at asc, mm.merchant_id asc
    ) as rn
  from public.merchant_members mm
  join public.merchants merch on merch.id = mm.merchant_id
  where mm.role = 'owner'
    and mm.status = 'active'
) ranked
where m.user_id = ranked.user_id
  and m.merchant_id = ranked.merchant_id
  and m.role = 'owner'
  and m.status = 'active'
  and ranked.rn > 1;
