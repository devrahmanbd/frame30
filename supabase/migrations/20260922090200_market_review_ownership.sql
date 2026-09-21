-- Fix: market_review_submit was doubly broken — it referenced a
-- nonexistent user_id column (every submission errored) and enforced no
-- install ownership (any authenticated user could rate any install).
--
-- Reviews attach to the reviewer's own install row: one review per
-- install, merchant-scoped for RLS, upsert on repeat.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketplace_reviews_install_unique'
  ) then
    alter table public.marketplace_reviews
      add constraint marketplace_reviews_install_unique unique (install_id);
  end if;
end $$;

create or replace function public.market_review_submit(_install_id uuid, _rating integer, _comment text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_install_merchant uuid;
begin
  select merchant_id into v_install_merchant
  from public.marketplace_installs
  where id = _install_id;

  if v_install_merchant is null then
    raise exception 'market.review_requires_install' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_install_merchant
      and user_id = auth.uid()
      and status = 'active'
  ) and not public.is_platform_admin(auth.uid()) then
    raise exception 'market.review_forbidden' using errcode = '42501';
  end if;

  INSERT INTO marketplace_reviews (install_id, merchant_id, rating, comment)
  VALUES (_install_id, v_install_merchant, _rating, _comment)
  ON CONFLICT (install_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    updated_at = now();
END; $function$;

grant execute on function public.market_review_submit(uuid, integer, text)
  to authenticated, service_role;
