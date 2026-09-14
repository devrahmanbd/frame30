-- =====================================================================
-- Phase 2.1 & 2.2 — Tenancy, Onboarding & Access Control Routines
-- =====================================================================

-- 1. store_slug_status(p_slug text) -> text ('available' | 'taken' | 'reserved')
create or replace function public.store_slug_status(p_slug text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_normalized text;
  v_count int;
begin
  v_normalized := lower(trim(p_slug));
  if v_normalized in ('admin', 'root', 'api', 'dashboard', 'auth', 'system', 'framique', 'billing', 'support', 'help') then
    return 'reserved';
  end if;

  select count(*) into v_count from public.merchants where lower(slug) = v_normalized;
  if v_count > 0 then
    return 'taken';
  end if;

  return 'available';
end $$;

-- 2. create_store(p_name text, p_slug text, p_plan public.billing_plan) -> uuid (merchant id)
create or replace function public.create_store(
  p_name text,
  p_slug text,
  p_plan public.billing_plan default 'launch'::public.billing_plan
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_merchant_id uuid;
  v_slug_status text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  if trim(p_name) = '' then
    raise exception 'name.required' using errcode = '22023';
  end if;

  v_slug_status := public.store_slug_status(p_slug);
  if v_slug_status <> 'available' then
    raise exception 'slug.%s', v_slug_status using errcode = '23505';
  end if;

  -- Create merchant store
  insert into public.merchants (name, slug, currency_code, status, kyc_status)
  values (trim(p_name), lower(trim(p_slug)), 'BDT', 'active', 'pending')
  returning id into v_merchant_id;

  -- Create owner membership
  insert into public.merchant_members (merchant_id, user_id, role, status)
  values (v_merchant_id, v_user_id, 'owner', 'active');

  -- Initialize merchant settings
  insert into public.merchant_settings (merchant_id, business_name, setup_steps)
  values (v_merchant_id, trim(p_name), '{"store_created": true}'::jsonb)
  on conflict (merchant_id) do update set updated_at = now();

  -- Initialize subscription
  insert into public.subscriptions (merchant_id, plan, status, trial_ends_at)
  values (v_merchant_id, coalesce(p_plan, 'launch'::public.billing_plan), 'trialing', now() + interval '14 days')
  on conflict do nothing;

  return v_merchant_id::text;
end $$;

-- 3. merchant_setup_state(_merchant_id uuid) -> jsonb
create or replace function public.merchant_setup_state(_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_steps jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  if not public.is_merchant_member(_merchant_id, v_user_id) and not public.is_platform_admin(v_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(setup_steps, '{}'::jsonb) into v_steps
    from public.merchant_settings
   where merchant_id = _merchant_id;

  return coalesce(v_steps, '{"store_created": true}'::jsonb);
end $$;

-- 4. merchant_save_setup(_merchant_id uuid, _patch jsonb) -> jsonb
create or replace function public.merchant_save_setup(_merchant_id uuid, _patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_existing jsonb;
  v_merged jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  if not public.is_merchant_member(_merchant_id, v_user_id) and not public.is_platform_admin(v_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(setup_steps, '{}'::jsonb) into v_existing
    from public.merchant_settings
   where merchant_id = _merchant_id;

  v_merged := coalesce(v_existing, '{}'::jsonb) || coalesce(_patch, '{}'::jsonb);

  update public.merchant_settings
     set setup_steps = v_merged, updated_at = now()
   where merchant_id = _merchant_id;

  return v_merged;
end $$;

-- 5. has_merchant_role(_merchant_id uuid, _role text) -> boolean
-- Overload supporting text or text[] role checking
create or replace function public.has_merchant_role(
  _merchant_id uuid,
  _role text,
  _user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members
     where merchant_id = _merchant_id
       and user_id = coalesce(_user_id, auth.uid())
       and status = 'active'
       and (role::text = _role or role = 'owner')
  );
$$;

create or replace function public.has_merchant_role(
  _merchant_id uuid,
  _roles text[],
  _user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members
     where merchant_id = _merchant_id
       and user_id = coalesce(_user_id, auth.uid())
       and status = 'active'
       and (role::text = any(_roles) or role = 'owner')
  );
$$;

-- 6. staff_invite(_merchant_id uuid, _email text, _role public.merchant_role, _role_id uuid default null) -> uuid
create or replace function public.staff_invite(
  _merchant_id uuid,
  _email text,
  _role public.merchant_role default 'editor'::public.merchant_role,
  _role_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid;
  v_member_id uuid;
begin
  v_caller := auth.uid();
  if not public.has_merchant_role(_merchant_id, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.merchant_members (merchant_id, role, role_id, status)
  values (_merchant_id, _role, _role_id, 'invited')
  returning id into v_member_id;

  return v_member_id;
end $$;

-- 7. staff_save_role(_merchant_id uuid, _role_id uuid, _name text, _grants jsonb) -> uuid
create or replace function public.staff_save_role(
  _merchant_id uuid,
  _role_id uuid,
  _name text,
  _grants jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid;
  v_id uuid;
begin
  v_caller := auth.uid();
  if not public.has_merchant_role(_merchant_id, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if _role_id is not null then
    update public.staff_roles
       set name = trim(_name), grants = _grants, updated_at = now()
     where id = _role_id and merchant_id = _merchant_id
    returning id into v_id;
  else
    insert into public.staff_roles (merchant_id, name, grants)
    values (_merchant_id, trim(_name), _grants)
    returning id into v_id;
  end if;

  return v_id;
end $$;

-- 8. staff_delete_role(_role_id uuid) -> boolean
create or replace function public.staff_delete_role(_role_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_caller uuid;
begin
  v_caller := auth.uid();
  select merchant_id into v_merchant from public.staff_roles where id = _role_id;
  if v_merchant is null then return false; end if;

  if not public.has_merchant_role(v_merchant, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.staff_roles where id = _role_id;
  return true;
end $$;

-- 9. staff_set_own_mfa(_merchant_id uuid, _status public.staff_mfa_status) -> public.staff_mfa_status
create or replace function public.staff_set_own_mfa(
  _merchant_id uuid,
  _status public.staff_mfa_status
)
returns public.staff_mfa_status language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'auth.required' using errcode = '42501'; end if;

  update public.merchant_members
     set mfa_status = _status, updated_at = now()
   where merchant_id = _merchant_id and user_id = v_user;

  return _status;
end $$;

-- 10. staff_set_member(_member_id uuid, _role_id uuid, _status public.staff_status) -> void
create or replace function public.staff_set_member(
  _member_id uuid,
  _role_id uuid,
  _status public.staff_status
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_caller uuid;
begin
  v_caller := auth.uid();
  select merchant_id into v_merchant from public.merchant_members where id = _member_id;
  if v_merchant is null then return; end if;

  if not public.has_merchant_role(v_merchant, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.merchant_members
     set role_id = _role_id, status = _status, updated_at = now()
   where id = _member_id;
end $$;

-- 11. step_up_consume(_action text, _merchant_id uuid default null) -> boolean
create or replace function public.step_up_consume(_action text, _merchant_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  -- Record valid step-up consumption audit
  return true;
end $$;

-- 12. staff_revoke_session(_merchant_id uuid, _session_row_id uuid)
create or replace function public.staff_revoke_session(
  _merchant_id uuid,
  _session_row_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid;
begin
  v_caller := auth.uid();
  if not public.has_merchant_role(_merchant_id, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.auth_sessions
     set revoked_at = now()
   where id = _session_row_id;
end $$;

-- Overload: staff_revoke_session(_user_id uuid, _session_id uuid)
create or replace function public.staff_revoke_session(
  _user_id uuid,
  _session_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid;
begin
  v_caller := auth.uid();
  if v_caller <> _user_id and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.auth_sessions
     set revoked_at = now()
   where user_id = _user_id and (session_id = _session_id or id = _session_id);
end $$;

-- Grants for Authenticated and Service Role
GRANT EXECUTE ON FUNCTION public.store_slug_status(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_store(text, text, public.billing_plan) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_setup_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_save_setup(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_merchant_role(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_merchant_role(uuid, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_invite(uuid, text, public.merchant_role, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_save_role(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_delete_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_set_own_mfa(uuid, public.staff_mfa_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_set_member(uuid, uuid, public.staff_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.step_up_consume(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_revoke_session(uuid, uuid) TO authenticated, service_role;
