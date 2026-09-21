-- Single-store MVP gate (policy, no code removed).
--
-- Enforces one OWNED store per account at the database level, so the rule
-- holds no matter which client inserts the membership (wizard, API, SQL).
-- Staff memberships are unaffected; existing multi-owner accounts are
-- grandfathered (only NEW second ownerships are refused).
--
-- Additive only (trigger + helper, no function replacement), idempotent.
-- Requires a table owner to apply (same as all DDL here).

create or replace function public.check_single_store_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owned int;
begin
  if NEW.role = 'owner' and NEW.status = 'active' then
    select count(*) into v_owned
    from public.merchant_members
    where user_id = NEW.user_id
      and role = 'owner'
      and status = 'active'
      and merchant_id <> NEW.merchant_id;
    if v_owned >= 1 then
      raise exception 'store.limit_reached' using errcode = '23505';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_single_store_ownership on public.merchant_members;
create trigger trg_single_store_ownership
  before insert or update on public.merchant_members
  for each row execute function public.check_single_store_ownership();
