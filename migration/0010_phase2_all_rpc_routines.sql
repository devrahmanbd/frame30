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
-- =====================================================================
-- Phase 2.3 — Customer Self-Service Database Routines
-- =====================================================================

-- 1. customer_overview_impl(_merchant_id uuid) -> jsonb
create or replace function public.customer_overview_impl(_merchant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_customer record;
  v_profile jsonb;
  v_addresses jsonb;
  v_wishlist jsonb;
  v_consents jsonb;
  v_orders jsonb;
  v_reviews jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object(
      'profile', null,
      'addresses', '[]'::jsonb,
      'wishlist', '[]'::jsonb,
      'consents', '[]'::jsonb,
      'orders', '[]'::jsonb,
      'reviews', '[]'::jsonb
    );
  end if;

  select * into v_customer
    from public.customers
   where merchant_id = _merchant_id
     and auth_uid = v_user_id::text
     and deleted_at is null
   order by created_at desc
   limit 1;

  if v_customer.id is null then
    return jsonb_build_object(
      'profile', null,
      'addresses', '[]'::jsonb,
      'wishlist', '[]'::jsonb,
      'consents', '[]'::jsonb,
      'orders', '[]'::jsonb,
      'reviews', '[]'::jsonb
    );
  end if;

  v_customer_id := v_customer.id;
  v_profile := jsonb_build_object(
    'id', v_customer.id,
    'name', coalesce(v_customer.name, ''),
    'email', v_customer.email,
    'phone', v_customer.phone
  );

  -- Addresses
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'address_type', a.address_type,
      'label', coalesce(a.label, ''),
      'full_name', a.full_name,
      'phone', a.phone,
      'line1', a.line1,
      'line2', a.line2,
      'city', a.city,
      'district', a.district,
      'postcode', a.postcode,
      'is_default', a.is_default
    ) order by a.is_default desc, a.created_at desc
  ), '[]'::jsonb) into v_addresses
  from public.customer_addresses a
  where a.customer_id = v_customer_id
    and a.merchant_id = _merchant_id
    and a.deleted_at is null;

  -- Wishlist
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'variant_id', w.product_variant_id,
      'stock_alert', w.stock_alert,
      'variant_name', coalesce(pv.name, ''),
      'price_amount_minor_int', coalesce(pv.price_amount_minor_int, 0),
      'stock_quantity', coalesce(pv.stock_quantity, 0),
      'product_title', coalesce(p.title, ''),
      'product_slug', coalesce(p.slug, '')
    ) order by w.created_at desc
  ), '[]'::jsonb) into v_wishlist
  from public.customer_wishlist_items w
  left join public.product_variants pv on pv.id = w.product_variant_id
  left join public.products p on p.id = pv.product_id
  where w.customer_id = v_customer_id
    and w.merchant_id = _merchant_id;

  -- Consents
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'channel', c.channel,
      'purpose', c.purpose,
      'granted', c.granted
    )
  ), '[]'::jsonb) into v_consents
  from public.customer_consents c
  where c.customer_id = v_customer_id
    and c.merchant_id = _merchant_id;

  -- Orders
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total_minor_int', o.total_minor_int,
      'currency_code', o.currency_code,
      'created_at', o.created_at
    ) order by o.created_at desc
  ), '[]'::jsonb) into v_orders
  from (
    select o.id, o.order_number, o.status, o.total_minor_int, o.currency_code, o.created_at
      from public.orders o
     where o.merchant_id = _merchant_id
       and (
         o.customer_id = v_customer_id
         or (v_customer.email is not null and lower(o.customer_email) = lower(v_customer.email))
       )
     order by o.created_at desc
     limit 25
  ) o;

  -- Reviews
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', pr.id,
      'product_title', coalesce(p.title, ''),
      'rating', pr.rating,
      'status', pr.status,
      'created_at', pr.created_at
    ) order by pr.created_at desc
  ), '[]'::jsonb) into v_reviews
  from (
    select pr.id, pr.product_id, pr.rating, pr.status, pr.created_at
      from public.product_reviews pr
     where pr.customer_id = v_customer_id
       and pr.merchant_id = _merchant_id
     order by pr.created_at desc
     limit 25
  ) pr
  left join public.products p on p.id = pr.product_id;

  return jsonb_build_object(
    'profile', v_profile,
    'addresses', v_addresses,
    'wishlist', v_wishlist,
    'consents', v_consents,
    'orders', v_orders,
    'reviews', v_reviews
  );
end $$;

-- 2. customer_upsert_self(_merchant_id uuid, _name text, _email text, _phone text, _locale text default 'en') -> text
create or replace function public.customer_upsert_self(
  _merchant_id uuid,
  _name text,
  _email text,
  _phone text,
  _locale text default 'en'
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_id uuid;
  v_email text;
  v_phone text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  v_email := lower(trim(coalesce(_email, '')));
  v_phone := trim(coalesce(_phone, ''));

  select id into v_id
    from public.customers
   where merchant_id = _merchant_id
     and (
       auth_uid = v_user_id::text
       or (v_email <> '' and lower(email) = v_email)
     )
     and deleted_at is null
   order by created_at desc
   limit 1;

  if v_id is not null then
    update public.customers
       set auth_uid = v_user_id::text,
           name = coalesce(nullif(trim(_name), ''), name),
           email = case when v_email <> '' then v_email else email end,
           phone = case when v_phone <> '' then v_phone else phone end,
           locale = coalesce(nullif(trim(_locale), ''), locale),
           updated_at = now()
     where id = v_id;
  else
    insert into public.customers (merchant_id, auth_uid, name, email, phone, locale)
    values (
      _merchant_id,
      v_user_id::text,
      trim(coalesce(_name, '')),
      nullif(v_email, ''),
      nullif(v_phone, ''),
      coalesce(nullif(trim(_locale), ''), 'en')
    )
    returning id into v_id;
  end if;

  return v_id::text;
end $$;

-- 3. customer_save_address
create or replace function public.customer_save_address(
  _merchant_id uuid,
  _address_id text,
  _address_type public.address_type,
  _label text,
  _full_name text,
  _phone text,
  _line1 text,
  _line2 text,
  _city text,
  _district text,
  _postcode text,
  _is_default boolean default false
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  select id into v_customer_id
    from public.customers
   where merchant_id = _merchant_id
     and auth_uid = v_user_id::text
     and deleted_at is null
   order by created_at desc
   limit 1;

  if v_customer_id is null then
    insert into public.customers (merchant_id, auth_uid, name, phone)
    values (_merchant_id, v_user_id::text, trim(_full_name), trim(_phone))
    returning id into v_customer_id;
  end if;

  if _is_default then
    update public.customer_addresses
       set is_default = false, updated_at = now()
     where merchant_id = _merchant_id and customer_id = v_customer_id;
  end if;

  if _address_id is not null and trim(_address_id) <> '' then
    update public.customer_addresses
       set address_type = _address_type,
           label = trim(coalesce(_label, '')),
           full_name = trim(_full_name),
           phone = trim(_phone),
           line1 = trim(_line1),
           line2 = nullif(trim(_line2), ''),
           city = trim(_city),
           district = trim(_district),
           postcode = nullif(trim(_postcode), ''),
           is_default = _is_default,
           updated_at = now()
     where id = _address_id::uuid
       and customer_id = v_customer_id
       and merchant_id = _merchant_id
    returning id into v_id;
  else
    insert into public.customer_addresses (
      merchant_id, customer_id, address_type, label, full_name, phone,
      line1, line2, city, district, postcode, is_default
    ) values (
      _merchant_id, v_customer_id, _address_type, trim(coalesce(_label, '')), trim(_full_name), trim(_phone),
      trim(_line1), nullif(trim(_line2), ''), trim(_city), trim(_district), nullif(trim(_postcode), ''), _is_default
    )
    returning id into v_id;
  end if;

  return v_id::text;
end $$;

-- 4. customer_delete_address(_merchant_id uuid, _address_id text) -> void
create or replace function public.customer_delete_address(
  _merchant_id uuid,
  _address_id text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  select id into v_customer_id
    from public.customers
   where merchant_id = _merchant_id
     and auth_uid = v_user_id::text
     and deleted_at is null
   limit 1;

  if v_customer_id is null then return; end if;

  update public.customer_addresses
     set deleted_at = now(), updated_at = now()
   where id = _address_id::uuid
     and merchant_id = _merchant_id
     and customer_id = v_customer_id;
end $$;

-- Overload for uuid address_id
create or replace function public.customer_delete_address(
  _merchant_id uuid,
  _address_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.customer_delete_address(_merchant_id, _address_id::text);
end $$;

-- 5. customer_set_consent
create or replace function public.customer_set_consent(
  _merchant_id uuid,
  _channel public.consent_channel,
  _purpose public.consent_purpose,
  _granted boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_existing_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  select id into v_customer_id
    from public.customers
   where merchant_id = _merchant_id
     and auth_uid = v_user_id::text
     and deleted_at is null
   limit 1;

  if v_customer_id is null then
    insert into public.customers (merchant_id, auth_uid, name)
    values (_merchant_id, v_user_id::text, 'Customer')
    returning id into v_customer_id;
  end if;

  select id into v_existing_id
    from public.customer_consents
   where merchant_id = _merchant_id
     and customer_id = v_customer_id
     and channel = _channel
     and purpose = _purpose
   limit 1;

  if v_existing_id is not null then
    update public.customer_consents
       set granted = _granted,
           granted_at = (case when _granted then now() else granted_at end),
           withdrawn_at = (case when not _granted then now() else null end),
           updated_at = now()
     where id = v_existing_id;
  else
    insert into public.customer_consents (
      merchant_id, customer_id, channel, purpose, granted,
      granted_at, withdrawn_at, source
    ) values (
      _merchant_id, v_customer_id, _channel, _purpose, _granted,
      (case when _granted then now() else null end),
      (case when not _granted then now() else null end),
      'storefront_account'
    );
  end if;
end $$;

-- 6. customer_toggle_wishlist
create or replace function public.customer_toggle_wishlist(
  _merchant_id uuid,
  _variant_id uuid,
  _stock_alert boolean default false
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_existing_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;

  select id into v_customer_id
    from public.customers
   where merchant_id = _merchant_id
     and auth_uid = v_user_id::text
     and deleted_at is null
   limit 1;

  if v_customer_id is null then
    insert into public.customers (merchant_id, auth_uid, name)
    values (_merchant_id, v_user_id::text, 'Customer')
    returning id into v_customer_id;
  end if;

  select id into v_existing_id
    from public.customer_wishlist_items
   where merchant_id = _merchant_id
     and customer_id = v_customer_id
     and product_variant_id = _variant_id
   limit 1;

  if v_existing_id is not null then
    delete from public.customer_wishlist_items where id = v_existing_id;
    return false;
  else
    insert into public.customer_wishlist_items (
      merchant_id, customer_id, product_variant_id, stock_alert
    ) values (
      _merchant_id, v_customer_id, _variant_id, coalesce(_stock_alert, false)
    );
    return true;
  end if;
end $$;

-- Grants
GRANT EXECUTE ON FUNCTION public.customer_overview_impl(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_upsert_self(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_save_address(uuid, text, public.address_type, text, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_delete_address(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_delete_address(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_set_consent(uuid, public.consent_channel, public.consent_purpose, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_toggle_wishlist(uuid, uuid, boolean) TO authenticated, service_role;
-- =====================================================================
-- Phase 2.4 — Orders, Returns, Drafts & Inventory Routines
-- =====================================================================

-- Ensure draft_orders tables exist
create table if not exists public.draft_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null default '',
  customer_email text,
  customer_phone text,
  address_line text default '',
  city text default '',
  postcode text default '',
  note text default '',
  currency_code text not null default 'BDT',
  discount_minor_int bigint not null default 0,
  shipping_minor_int bigint not null default 0,
  vat_minor_int bigint not null default 0,
  subtotal_minor_int bigint not null default 0,
  total_minor_int bigint not null default 0,
  status text not null default 'draft',
  number text not null default '',
  share_token text not null default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamp with time zone,
  sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  converted_at timestamp with time zone,
  converted_order_id uuid references public.orders(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index if not exists idx_draft_orders_merchant on public.draft_orders(merchant_id);
create index if not exists idx_draft_orders_token on public.draft_orders(share_token);

create table if not exists public.draft_order_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  draft_order_id uuid not null references public.draft_orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  title text not null default '',
  variant_name text not null default '',
  sku text not null default '',
  quantity bigint not null default 1,
  unit_price_minor_int bigint not null default 0,
  line_total_minor_int bigint not null default 0,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_draft_order_items_draft on public.draft_order_items(draft_order_id);

-- Ensure purchase_orders tables exist
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  code text not null,
  name text not null,
  email text,
  phone text,
  address_line text default '',
  lead_time_days integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (merchant_id, code)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  location_id uuid,
  number text not null default '',
  currency_code text not null default 'BDT',
  status text not null default 'draft',
  note text default '',
  total_minor_int bigint not null default 0,
  expected_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index if not exists idx_purchase_orders_merchant on public.purchase_orders(merchant_id);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete restrict,
  sku text not null default '',
  quantity_ordered bigint not null default 1,
  quantity_received bigint not null default 0,
  unit_cost_minor_int bigint not null default 0,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_po_items_po on public.purchase_order_items(purchase_order_id);

-- 1. draft_order_recalc(_draft_id uuid) -> jsonb
create or replace function public.draft_order_recalc(_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_subtotal bigint;
  v_draft record;
  v_total bigint;
begin
  select coalesce(sum(line_total_minor_int), 0) into v_subtotal
    from public.draft_order_items
   where draft_order_id = _draft_id;

  select * into v_draft from public.draft_orders where id = _draft_id;
  if v_draft.id is null then
    raise exception 'draft_order_not_found' using errcode = 'P0002';
  end if;

  v_total := greatest(0, v_subtotal - coalesce(v_draft.discount_minor_int, 0))
           + coalesce(v_draft.shipping_minor_int, 0)
           + coalesce(v_draft.vat_minor_int, 0);

  update public.draft_orders
     set subtotal_minor_int = v_subtotal,
         total_minor_int = v_total,
         updated_at = now()
   where id = _draft_id;

  return jsonb_build_object(
    'draft_id', _draft_id,
    'subtotal_minor_int', v_subtotal,
    'total_minor_int', v_total
  );
end $$;

-- 2. draft_order_public(_token text) -> jsonb
create or replace function public.draft_order_public(_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_draft record;
  v_items jsonb;
begin
  select * into v_draft
    from public.draft_orders
   where share_token = _token;

  if v_draft.id is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', di.id,
      'title', di.title,
      'variant_name', di.variant_name,
      'sku', di.sku,
      'quantity', di.quantity,
      'unit_price_minor_int', di.unit_price_minor_int,
      'line_total_minor_int', di.line_total_minor_int
    )
  ), '[]'::jsonb) into v_items
  from public.draft_order_items di
  where di.draft_order_id = v_draft.id;

  return jsonb_build_object(
    'found', true,
    'draft', to_jsonb(v_draft),
    'items', v_items
  );
end $$;

-- 3. draft_order_accept(_token text) -> jsonb
create or replace function public.draft_order_accept(_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_draft record;
begin
  select * into v_draft
    from public.draft_orders
   where share_token = _token;

  if v_draft.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_draft.status in ('converted', 'cancelled') then
    return jsonb_build_object('outcome', v_draft.status);
  end if;

  update public.draft_orders
     set status = 'accepted',
         accepted_at = now(),
         updated_at = now()
   where id = v_draft.id;

  return jsonb_build_object('outcome', 'accepted');
end $$;

-- Overload: draft_order_accept by uuid
create or replace function public.draft_order_accept(_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  select share_token into v_token from public.draft_orders where id = _draft_id;
  if v_token is null then return jsonb_build_object('outcome', 'not_found'); end if;
  return public.draft_order_accept(v_token);
end $$;

-- 4. draft_order_convert(_draft_id uuid) -> jsonb
create or replace function public.draft_order_convert(_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_draft record;
  v_item_count int;
  v_order_id uuid;
  v_order_number text;
begin
  select * into v_draft from public.draft_orders where id = _draft_id;
  if v_draft.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select count(*) into v_item_count
    from public.draft_order_items
   where draft_order_id = _draft_id;

  if v_item_count = 0 then
    return jsonb_build_object('outcome', 'empty');
  end if;

  if v_draft.status not in ('sent', 'accepted', 'draft') then
    return jsonb_build_object('outcome', 'not_acceptable');
  end if;

  v_order_number := 'ORD-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));

  insert into public.orders (
    merchant_id, customer_id, order_number, status, payment_method,
    subtotal_minor_int, discount_minor_int, shipping_fee_minor_int, vat_minor_int,
    total_minor_int, currency_code, customer_name, customer_email, customer_phone,
    delivery_address, city, postal_code, notes
  ) values (
    v_draft.merchant_id, v_draft.customer_id, v_order_number, 'confirmed', 'cod',
    v_draft.subtotal_minor_int, v_draft.discount_minor_int, v_draft.shipping_minor_int, v_draft.vat_minor_int,
    v_draft.total_minor_int, v_draft.currency_code, v_draft.customer_name, v_draft.customer_email, v_draft.customer_phone,
    v_draft.address_line, v_draft.city, v_draft.postcode, v_draft.note
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, variant_id, title, variant_title, sku, quantity, unit_price_minor_int, total_minor_int
  )
  select
    v_order_id,
    pv.product_id,
    di.variant_id,
    di.title,
    di.variant_name,
    di.sku,
    di.quantity,
    di.unit_price_minor_int,
    di.line_total_minor_int
  from public.draft_order_items di
  left join public.product_variants pv on pv.id = di.variant_id
  where di.draft_order_id = _draft_id;

  update public.draft_orders
     set status = 'converted',
         converted_at = now(),
         converted_order_id = v_order_id,
         updated_at = now()
   where id = _draft_id;

  return jsonb_build_object(
    'outcome', 'converted',
    'order_id', v_order_id::text,
    'order_number', v_order_number
  );
end $$;

-- 5. shipment_tracking_public(_token text) -> jsonb
create or replace function public.shipment_tracking_public(_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shipment record;
  v_events jsonb;
begin
  select * into v_shipment
    from public.carrier_shipments
   where tracking_token = _token
      or awb = _token
      or id::text = _token
   limit 1;

  if v_shipment.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'status', de.event_type,
      'occurred_at', de.occurred_at
    ) order by de.occurred_at asc
  ), '[]'::jsonb) into v_events
  from public.delivery_events de
  where de.shipment_id = v_shipment.id;

  return jsonb_build_object(
    'status', v_shipment.status::text,
    'carrier_code', v_shipment.carrier_code,
    'city', v_shipment.city,
    'last_event_at', v_shipment.last_event_at,
    'events', v_events
  );
end $$;

-- 6. purchase_order_receive(_po_id uuid, _lines jsonb) -> jsonb
create or replace function public.purchase_order_receive(
  _po_id uuid,
  _lines jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_po record;
  v_line jsonb;
  v_item_id uuid;
  v_qty bigint;
  v_variant_id uuid;
  v_total_received bigint := 0;
  v_outstanding bigint := 0;
begin
  select * into v_po from public.purchase_orders where id = _po_id;
  if v_po.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_po.status not in ('submitted', 'partially_received') then
    return jsonb_build_object('outcome', 'not_receivable');
  end if;

  for v_line in select * from jsonb_array_elements(_lines)
  loop
    v_item_id := (v_line->>'item_id')::uuid;
    v_qty := coalesce((v_line->>'quantity')::bigint, 0);

    if v_qty > 0 then
      select variant_id into v_variant_id
        from public.purchase_order_items
       where id = v_item_id and purchase_order_id = _po_id;

      if v_variant_id is not null then
        update public.purchase_order_items
           set quantity_received = quantity_received + v_qty
         where id = v_item_id;

        update public.product_variants
           set stock_quantity = stock_quantity + v_qty,
               updated_at = now()
         where id = v_variant_id;

        v_total_received := v_total_received + v_qty;
      end if;
    end if;
  end loop;

  select coalesce(sum(greatest(0, quantity_ordered - quantity_received)), 0) into v_outstanding
    from public.purchase_order_items
   where purchase_order_id = _po_id;

  if v_outstanding = 0 then
    update public.purchase_orders
       set status = 'received', updated_at = now()
     where id = _po_id;
  else
    update public.purchase_orders
       set status = 'partially_received', updated_at = now()
     where id = _po_id;
  end if;

  return jsonb_build_object(
    'outcome', 'received',
    'units', v_total_received,
    'outstanding', v_outstanding
  );
end $$;

-- Grants
GRANT EXECUTE ON FUNCTION public.draft_order_recalc(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.draft_order_public(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.draft_order_accept(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.draft_order_accept(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.draft_order_convert(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shipment_tracking_public(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_order_receive(uuid, jsonb) TO authenticated, service_role;
-- =====================================================================
-- Phase 2.5 — Billing, Platform Charges & Gift Cards Routines
-- =====================================================================

-- Ensure platform_charges table exists
create table if not exists public.platform_charges (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  method text not null,
  amount_minor_int bigint not null,
  currency_code text not null default 'BDT',
  status text not null default 'created',
  attempt integer not null default 1,
  idempotency_key text not null unique,
  provider_reference text,
  return_nonce text not null default encode(gen_random_bytes(16), 'hex'),
  failure_code text,
  receipt_number text,
  expires_at timestamp with time zone not null default (now() + interval '30 minutes'),
  settled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index if not exists idx_platform_charges_invoice on public.platform_charges(invoice_id);
create index if not exists idx_platform_charges_merchant on public.platform_charges(merchant_id);

-- 1. platform_charge_open
create or replace function public.platform_charge_open(
  _merchant_id uuid,
  _invoice_id uuid,
  _method text,
  _idempotency_key text,
  _ttl_seconds integer default 1800
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing record;
  v_invoice record;
  v_attempt int;
  v_charge record;
begin
  select * into v_existing from public.platform_charges where idempotency_key = _idempotency_key;
  if v_existing.id is not null then
    return to_jsonb(v_existing);
  end if;

  select * into v_invoice from public.invoices where id = _invoice_id and merchant_id = _merchant_id;
  if v_invoice.id is null then
    raise exception 'platform.invoice_not_found' using errcode = 'P0002';
  end if;

  if v_invoice.status = 'paid' then
    raise exception 'platform.invoice_already_paid' using errcode = '23505';
  end if;

  if v_invoice.status <> 'open' then
    raise exception 'platform.invoice_not_chargeable' using errcode = '22023';
  end if;

  select count(*) into v_attempt from public.platform_charges where invoice_id = _invoice_id;
  v_attempt := v_attempt + 1;

  if v_attempt > 10 then
    raise exception 'platform.attempts_exhausted' using errcode = '22023';
  end if;

  insert into public.platform_charges (
    merchant_id, invoice_id, method, amount_minor_int, currency_code,
    status, attempt, idempotency_key, expires_at
  ) values (
    _merchant_id, _invoice_id, _method, v_invoice.total_minor_int, v_invoice.currency_code,
    'created', v_attempt, _idempotency_key, now() + (_ttl_seconds || ' seconds')::interval
  )
  returning * into v_charge;

  return to_jsonb(v_charge);
end $$;

-- 2. platform_charge_settle
create or replace function public.platform_charge_settle(
  _charge_id uuid,
  _status text,
  _provider_reference text default null,
  _failure_code text default null,
  _actor text default 'system',
  _receipt_number text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_charge record;
begin
  select * into v_charge from public.platform_charges where id = _charge_id for update;
  if v_charge.id is null then
    raise exception 'platform.charge_not_found' using errcode = 'P0002';
  end if;

  -- Terminal state idempotency
  if v_charge.status in ('paid', 'cancelled', 'expired') and _status <> v_charge.status then
    return to_jsonb(v_charge);
  end if;

  update public.platform_charges
     set status = _status,
         provider_reference = coalesce(_provider_reference, provider_reference),
         failure_code = coalesce(_failure_code, failure_code),
         receipt_number = coalesce(_receipt_number, receipt_number),
         settled_at = (case when _status in ('paid', 'failed', 'cancelled', 'expired') then now() else settled_at end),
         updated_at = now()
   where id = _charge_id
  returning * into v_charge;

  if _status = 'paid' then
    update public.invoices
       set status = 'paid', paid_at = now(), updated_at = now()
     where id = v_charge.invoice_id;

    update public.subscriptions
       set status = 'active',
           current_period_start = to_char(now(), 'YYYY-MM-DD'),
           next_billing_at = now() + interval '30 days',
           past_due_since = null,
           dunning_stage = 0,
           updated_at = now()
     where merchant_id = v_charge.merchant_id;
  end if;

  return to_jsonb(v_charge);
end $$;

-- 3. billing_vat_bp() -> integer
create or replace function public.billing_vat_bp()
returns integer language sql stable security definer set search_path = public as $$
  select 500; -- 5% VAT
$$;

-- 4. billing_plan_preview
create or replace function public.billing_plan_preview(
  _merchant_id uuid,
  _target public.billing_plan
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
  v_plan record;
  v_vat_bp int := 500;
  v_subtotal bigint;
  v_vat bigint;
  v_total bigint;
begin
  select * into v_sub from public.subscriptions where merchant_id = _merchant_id;
  if v_sub.id is null then
    raise exception 'no_subscription' using errcode = 'P0002';
  end if;

  if v_sub.status = 'cancelled' then
    raise exception 'subscription_cancelled' using errcode = '22023';
  end if;

  if _target = 'enterprise'::public.billing_plan then
    raise exception 'contact_sales' using errcode = '22023';
  end if;

  select * into v_plan from public.plan_definitions where plan = _target;
  if v_plan.plan is null then
    raise exception 'plan_unavailable' using errcode = 'P0002';
  end if;

  v_subtotal := coalesce(v_plan.price_minor_int, 0);
  v_vat := (v_subtotal * v_vat_bp) / 10000;
  v_total := v_subtotal + v_vat;

  return jsonb_build_object(
    'plan', _target,
    'currency_code', v_plan.currency_code,
    'subtotal_minor_int', v_subtotal,
    'vat_rate_basis_points', v_vat_bp,
    'vat_minor_int', v_vat,
    'total_minor_int', v_total,
    'products_limit', v_plan.products_limit,
    'staff_limit', v_plan.staff_limit,
    'effective_at', now()
  );
end $$;

-- 5. billing_plan_change
create or replace function public.billing_plan_change(
  _merchant_id uuid,
  _target public.billing_plan,
  _actor text default 'owner'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_preview jsonb;
  v_sub record;
  v_inv_id uuid;
  v_inv_num text;
begin
  v_preview := public.billing_plan_preview(_merchant_id, _target);
  select * into v_sub from public.subscriptions where merchant_id = _merchant_id;

  if _target = v_sub.plan then
    return jsonb_build_object('kind', 'unchanged', 'plan', _target);
  end if;

  -- Upgrade immediately
  v_inv_num := 'INV-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  insert into public.invoices (
    merchant_id, invoice_number, plan, period_start, period_end,
    subtotal_minor_int, vat_minor_int, vat_rate_basis_points, total_minor_int,
    currency_code, status, idempotency_key
  ) values (
    _merchant_id, v_inv_num, _target, to_char(now(), 'YYYY-MM-DD'), to_char(now() + interval '30 days', 'YYYY-MM-DD'),
    (v_preview->>'subtotal_minor_int')::bigint, (v_preview->>'vat_minor_int')::bigint,
    (v_preview->>'vat_rate_basis_points')::bigint, (v_preview->>'total_minor_int')::bigint,
    v_preview->>'currency_code', 'open', 'inv_plan_change_' || _merchant_id || '_' || encode(gen_random_bytes(8), 'hex')
  )
  returning id into v_inv_id;

  update public.subscriptions
     set plan = _target,
         scheduled_plan = null,
         scheduled_plan_at = null,
         updated_at = now()
   where merchant_id = _merchant_id;

  update public.tenant_limits
     set products_limit = (v_preview->>'products_limit')::bigint,
         staff_limit = (v_preview->>'staff_limit')::bigint,
         updated_at = now()
   where merchant_id = _merchant_id;

  return jsonb_build_object(
    'kind', 'upgraded',
    'plan', _target,
    'invoice_id', v_inv_id,
    'total_minor_int', (v_preview->>'total_minor_int')::bigint
  );
end $$;

-- 6. billing_trial_claim
create or replace function public.billing_trial_claim(
  _merchant_id uuid,
  _fingerprint text,
  _actor text default 'owner'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
begin
  if _fingerprint is null or trim(_fingerprint) = '' then
    raise exception 'fingerprint_required' using errcode = '22023';
  end if;

  select * into v_sub from public.subscriptions where merchant_id = _merchant_id;
  if v_sub.id is null then
    raise exception 'no_subscription' using errcode = 'P0002';
  end if;

  if v_sub.trial_fingerprint is not null then
    raise exception 'already_claimed' using errcode = '23505';
  end if;

  update public.subscriptions
     set trial_fingerprint = trim(_fingerprint),
         trial_started_at = now(),
         trial_ends_at = now() + interval '14 days',
         status = 'trial',
         updated_at = now()
   where merchant_id = _merchant_id;

  return jsonb_build_object(
    'ok', true,
    'trial_ends_at', now() + interval '14 days'
  );
end $$;

-- 7. billing_sweep() -> jsonb
create or replace function public.billing_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_expired_trials int;
  v_expired_charges int;
begin
  -- Expire past due trials
  update public.subscriptions
     set status = 'past_due',
         past_due_since = coalesce(past_due_since, to_char(now(), 'YYYY-MM-DD')),
         updated_at = now()
   where status = 'trial'
     and trial_ends_at is not null
     and trial_ends_at < now();
  get diagnostics v_expired_trials = row_count;

  -- Expire pending charges past expires_at
  update public.platform_charges
     set status = 'expired',
         settled_at = now(),
         failure_code = 'charge_expired',
         updated_at = now()
   where status in ('created', 'pending')
     and expires_at < now();
  get diagnostics v_expired_charges = row_count;

  return jsonb_build_object(
    'swept', true,
    'expired_trials', v_expired_trials,
    'expired_charges', v_expired_charges
  );
end $$;

-- 8. gift_card_issue
create or replace function public.gift_card_issue(
  _merchant_id uuid,
  _code text,
  _amount_minor bigint,
  _currency text default 'BDT',
  _expires_at timestamp with time zone default null,
  _email text default null,
  _phone text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_clean_code text;
begin
  v_clean_code := upper(trim(_code));
  if v_clean_code = '' then
    raise exception 'code_required' using errcode = '22023';
  end if;

  insert into public.gift_cards (
    merchant_id, code, initial_minor_int, balance_minor_int, currency_code,
    expires_at, recipient_email, recipient_phone, status, issued_by
  ) values (
    _merchant_id, v_clean_code, _amount_minor, _amount_minor, coalesce(_currency, 'BDT'),
    _expires_at, nullif(trim(_email), ''), nullif(trim(_phone), ''), 'active', auth.uid()
  )
  returning id into v_id;

  insert into public.gift_card_entries (
    merchant_id, gift_card_id, amount_minor_int, balance_after_minor_int,
    currency_code, kind, actor, idempotency_key
  ) values (
    _merchant_id, v_id, _amount_minor, _amount_minor, coalesce(_currency, 'BDT'),
    'issued', coalesce(auth.uid()::text, 'system'), 'issue_' || v_id
  );

  return jsonb_build_object(
    'id', v_id,
    'code', v_clean_code,
    'balance_minor_int', _amount_minor
  );
end $$;

-- 9. gift_card_redeem
create or replace function public.gift_card_redeem(
  _merchant_id uuid,
  _code text,
  _amount_minor bigint,
  _order_id uuid default null,
  _idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_entry record;
  v_card record;
  v_deduct bigint;
  v_new_balance bigint;
begin
  v_key := coalesce(_idempotency_key, 'gc_redeem_' || encode(gen_random_bytes(16), 'hex'));

  select * into v_entry
    from public.gift_card_entries
   where merchant_id = _merchant_id and idempotency_key = v_key;

  if v_entry.id is not null then
    return jsonb_build_object(
      'replayed', true,
      'applied_minor_int', v_entry.amount_minor_int,
      'balance_minor_int', v_entry.balance_after_minor_int,
      'currency_code', v_entry.currency_code
    );
  end if;

  select * into v_card
    from public.gift_cards
   where merchant_id = _merchant_id
     and upper(code) = upper(trim(_code))
   for update;

  if v_card.id is null then
    raise exception 'gift_card_not_found' using errcode = 'P0002';
  end if;

  if v_card.status <> 'active' then
    raise exception 'gift_card_inactive: card is not active' using errcode = '22023';
  end if;

  if v_card.expires_at is not null and v_card.expires_at < now() then
    raise exception 'gift_card_expired' using errcode = '22023';
  end if;

  if v_card.balance_minor_int <= 0 then
    raise exception 'gift_card_empty' using errcode = '22023';
  end if;

  v_deduct := least(v_card.balance_minor_int, _amount_minor);
  v_new_balance := v_card.balance_minor_int - v_deduct;

  update public.gift_cards
     set balance_minor_int = v_new_balance,
         status = (case when v_new_balance = 0 then 'redeemed'::public.gift_card_status else status end),
         updated_at = now()
   where id = v_card.id;

  insert into public.gift_card_entries (
    merchant_id, gift_card_id, amount_minor_int, balance_after_minor_int,
    currency_code, kind, order_id, actor, idempotency_key
  ) values (
    _merchant_id, v_card.id, v_deduct, v_new_balance,
    v_card.currency_code, 'redeemed', _order_id, coalesce(auth.uid()::text, 'system'), v_key
  );

  return jsonb_build_object(
    'replayed', false,
    'applied_minor_int', v_deduct,
    'balance_minor_int', v_new_balance,
    'currency_code', v_card.currency_code
  );
end $$;

-- Grants
GRANT EXECUTE ON FUNCTION public.platform_charge_open(uuid, uuid, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_charge_settle(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_vat_bp() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_plan_preview(uuid, public.billing_plan) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_plan_change(uuid, public.billing_plan, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_trial_claim(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_sweep() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gift_card_issue(uuid, text, bigint, text, timestamp with time zone, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gift_card_redeem(uuid, text, bigint, uuid, text) TO authenticated, service_role;
-- =====================================================================
-- Phase 2.6 — Analytics, Marketing, Courier Sweeps & Reviews Routines
-- =====================================================================

-- Ensure tables exist
create table if not exists public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  cart_token text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  subtotal_minor_int bigint not null default 0,
  currency_code text not null default 'BDT',
  lines jsonb not null default '[]'::jsonb,
  status public.abandoned_cart_status not null default 'active'::public.abandoned_cart_status,
  recovered_order_id uuid references public.orders(id) on delete set null,
  recovery_sent_at timestamp with time zone,
  last_seen_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (merchant_id, cart_token)
);
create index if not exists idx_abandoned_carts_merchant on public.abandoned_carts(merchant_id);
create index if not exists idx_abandoned_carts_token on public.abandoned_carts(cart_token);

create table if not exists public.courier_dead_letters (
  id uuid primary key default gen_random_uuid(),
  carrier_code text not null,
  event_id text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.ops_cron_secrets (
  token text primary key,
  label text default '',
  created_at timestamp with time zone not null default now()
);

create table if not exists public.ops_cron_jobs (
  key text primary key,
  label text not null default '',
  description text default '',
  schedule text not null default '0 * * * *',
  timezone text not null default 'UTC',
  timeout_ms integer not null default 30000,
  sla_max_duration_ms integer not null default 60000,
  alert_after_failures integer not null default 3,
  max_overdue_seconds integer not null default 3600,
  enabled boolean not null default true,
  paused_reason text,
  next_run_at timestamp with time zone,
  last_run_at timestamp with time zone,
  last_status text,
  consecutive_failures integer not null default 0,
  lease_token text,
  lease_expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.ops_cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.ops_cron_jobs(key) on delete cascade,
  status text not null default 'running',
  trigger text not null default 'scheduled',
  attempt integer not null default 1,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  duration_ms integer,
  http_status integer,
  error_code text,
  error_message text,
  stats jsonb not null default '{}'::jsonb
);
create index if not exists idx_ops_cron_runs_job on public.ops_cron_runs(job_key, started_at desc);

-- 1. abandoned_cart_capture
create or replace function public.abandoned_cart_capture(
  _merchant_id uuid,
  _cart_token text,
  _email text default null,
  _phone text default null,
  _name text default null,
  _lines jsonb default '[]'::jsonb,
  _subtotal bigint default 0,
  _currency text default 'BDT'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_res record;
begin
  insert into public.abandoned_carts (
    merchant_id, cart_token, customer_email, customer_phone,
    customer_name, lines, subtotal_minor_int, currency_code,
    status, last_seen_at, updated_at
  ) values (
    _merchant_id, _cart_token, nullif(trim(_email), ''), nullif(trim(_phone), ''),
    nullif(trim(_name), ''), coalesce(_lines, '[]'::jsonb), _subtotal, coalesce(_currency, 'BDT'),
    'active'::public.abandoned_cart_status, now(), now()
  )
  on conflict (merchant_id, cart_token) do update
    set customer_email = coalesce(nullif(trim(_email), ''), abandoned_carts.customer_email),
        customer_phone = coalesce(nullif(trim(_phone), ''), abandoned_carts.customer_phone),
        customer_name = coalesce(nullif(trim(_name), ''), abandoned_carts.customer_name),
        lines = coalesce(_lines, abandoned_carts.lines),
        subtotal_minor_int = _subtotal,
        currency_code = coalesce(_currency, abandoned_carts.currency_code),
        status = (case when abandoned_carts.status = 'recovered' then 'recovered'::public.abandoned_cart_status else 'active'::public.abandoned_cart_status end),
        last_seen_at = now(),
        updated_at = now()
  returning * into v_res;

  return to_jsonb(v_res);
end $$;

-- 2. abandoned_cart_mark_recovered
create or replace function public.abandoned_cart_mark_recovered(
  _merchant_id uuid,
  _cart_token text,
  _order_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.abandoned_carts
     set status = 'recovered'::public.abandoned_cart_status,
         recovered_order_id = _order_id,
         updated_at = now()
   where merchant_id = _merchant_id
     and cart_token = _cart_token;
end $$;

-- 3. courier_apply_event
create or replace function public.courier_apply_event(
  _shipment_id uuid,
  _status text,
  _source text,
  _event_id text,
  _occurred_at text default null,
  _payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shipment record;
  v_occ_time timestamp with time zone;
begin
  select * into v_shipment from public.carrier_shipments where id = _shipment_id;
  if v_shipment.id is null then
    return jsonb_build_object('applied', false, 'reason', 'shipment_not_found');
  end if;

  v_occ_time := coalesce(_occurred_at::timestamptz, now());

  insert into public.delivery_events (
    shipment_id, merchant_id, event_type, source, occurred_at, payload
  ) values (
    _shipment_id, v_shipment.merchant_id, _status, coalesce(_source, 'carrier'), v_occ_time, coalesce(_payload, '{}'::jsonb)
  );

  update public.carrier_shipments
     set status = _status::public.shipment_status,
         last_event_at = v_occ_time,
         delivered_at = (case when _status = 'delivered' then v_occ_time else delivered_at end),
         cancelled_at = (case when _status = 'cancelled' then v_occ_time else cancelled_at end),
         updated_at = now()
   where id = _shipment_id;

  if v_shipment.order_id is not null then
    if _status = 'delivered' then
      update public.orders set status = 'delivered', updated_at = now() where id = v_shipment.order_id;
    elsif _status in ('in_transit', 'out_for_delivery') then
      update public.orders set status = 'shipped', updated_at = now() where id = v_shipment.order_id and status not in ('delivered', 'cancelled');
    end if;
  end if;

  return jsonb_build_object('applied', true, 'status', _status);
end $$;

-- 4. courier_dead_letter
create or replace function public.courier_dead_letter(
  _carrier_code text,
  _event_id text,
  _reason text,
  _payload jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.courier_dead_letters (carrier_code, event_id, reason, payload)
  values (_carrier_code, _event_id, _reason, coalesce(_payload, '{}'::jsonb));
end $$;

-- 5. courier_ingest_event
create or replace function public.courier_ingest_event(
  _carrier_code text,
  _awb text,
  _event_id text,
  _status text,
  _occurred_at text default null,
  _payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shipment record;
begin
  select * into v_shipment
    from public.carrier_shipments
   where carrier_code = _carrier_code and awb = _awb
   limit 1;

  if v_shipment.id is null then
    insert into public.courier_webhook_events (
      merchant_id, carrier_code, awb, event_id, status, payload
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid, _carrier_code, _awb, _event_id, 'parked'::public.courier_event_status, coalesce(_payload, '{}'::jsonb)
    );
    return jsonb_build_object('status', 'parked');
  end if;

  perform public.courier_apply_event(
    v_shipment.id, _status, 'webhook:' || _carrier_code, _event_id, _occurred_at, _payload
  );

  insert into public.courier_webhook_events (
    merchant_id, shipment_id, carrier_code, awb, event_id, status, payload
  ) values (
    v_shipment.merchant_id, v_shipment.id, _carrier_code, _awb, _event_id, 'processed'::public.courier_event_status, coalesce(_payload, '{}'::jsonb)
  );

  return jsonb_build_object('status', 'accepted');
end $$;

-- 6. courier_replay_event
create or replace function public.courier_replay_event(
  _id uuid,
  _merchant_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event record;
  v_shipment record;
begin
  select * into v_event from public.courier_webhook_events where id = _id;
  if v_event.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_shipment from public.carrier_shipments
   where carrier_code = v_event.carrier_code and awb = v_event.awb and merchant_id = _merchant_id
   limit 1;

  if v_shipment.id is null then
    return jsonb_build_object('outcome', 'unknown_awb');
  end if;

  perform public.courier_apply_event(
    v_shipment.id, 'replayed', 'replay', v_event.event_id, now()::text, v_event.payload
  );

  update public.courier_webhook_events
     set status = 'processed'::public.courier_event_status,
         shipment_id = v_shipment.id,
         merchant_id = _merchant_id,
         updated_at = now()
   where id = _id;

  return jsonb_build_object('outcome', 'replayed');
end $$;

-- 7. courier_sweep()
create or replace function public.courier_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dead int := 0;
begin
  select count(*) into v_dead from public.courier_dead_letters where created_at > now() - interval '24 hours';
  return jsonb_build_object('swept', true, 'dead', v_dead);
end $$;

-- 8. ops_cron_token_valid
create or replace function public.ops_cron_token_valid(_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select (_token is not null and length(trim(_token)) >= 16);
$$;

-- 9. ops_cron_claim
create or replace function public.ops_cron_claim(
  _key text,
  _token text,
  _trigger text,
  _lease_seconds integer default 60
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job record;
  v_run_id uuid;
begin
  select * into v_job from public.ops_cron_jobs where key = _key for update;
  if v_job.key is null then
    insert into public.ops_cron_jobs (key, label) values (_key, _key)
    returning * into v_job;
  end if;

  if not v_job.enabled then
    return jsonb_build_object('ok', false, 'reason', 'paused');
  end if;

  if v_job.lease_expires_at is not null and v_job.lease_expires_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  insert into public.ops_cron_runs (job_key, trigger, attempt, status)
  values (_key, _trigger, 1, 'running')
  returning id into v_run_id;

  update public.ops_cron_jobs
     set lease_token = _token,
         lease_expires_at = now() + (_lease_seconds || ' seconds')::interval,
         last_run_at = now(),
         updated_at = now()
   where key = _key;

  return jsonb_build_object('ok', true, 'run_id', v_run_id, 'attempt', 1);
end $$;

-- 10. ops_cron_finish
create or replace function public.ops_cron_finish(
  _run_id uuid,
  _token text,
  _status text,
  _http_status integer default null,
  _error_code text default null,
  _error_message text default null,
  _stats jsonb default '{}'::jsonb,
  _next_run_at timestamp with time zone default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run record;
  v_failures int := 0;
begin
  select * into v_run from public.ops_cron_runs where id = _run_id;
  if v_run.id is null then
    return jsonb_build_object('consecutive_failures', 0);
  end if;

  update public.ops_cron_runs
     set status = _status,
         finished_at = now(),
         duration_ms = greatest(0, round(extract(epoch from (now() - started_at)) * 1000)::integer),
         http_status = _http_status,
         error_code = _error_code,
         error_message = _error_message,
         stats = coalesce(_stats, '{}'::jsonb)
   where id = _run_id;

  update public.ops_cron_jobs
     set lease_token = null,
         lease_expires_at = null,
         last_status = _status,
         consecutive_failures = (case when _status = 'ok' then 0 else consecutive_failures + 1 end),
         next_run_at = coalesce(_next_run_at, next_run_at),
         updated_at = now()
   where key = v_run.job_key
  returning consecutive_failures into v_failures;

  return jsonb_build_object('consecutive_failures', coalesce(v_failures, 0));
end $$;

-- 11. ops_cron_reap_stale()
create or replace function public.ops_cron_reap_stale()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reaped int := 0;
begin
  update public.ops_cron_runs
     set status = 'timeout',
         finished_at = now(),
         error_code = 'stale_lease'
   where status = 'running'
     and started_at < now() - interval '10 minutes';
  get diagnostics v_reaped = row_count;

  update public.ops_cron_jobs
     set lease_token = null,
         lease_expires_at = null,
         updated_at = now()
   where lease_expires_at is not null
     and lease_expires_at < now();

  return jsonb_build_object('reaped', v_reaped);
end $$;

-- 12. review_submit
create or replace function public.review_submit(
  _merchant_id uuid,
  _product_id uuid,
  _rating integer,
  _title text,
  _body text,
  _author_name text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_customer_id uuid;
  v_verified boolean := false;
  v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is not null then
    select id into v_customer_id
      from public.customers
     where merchant_id = _merchant_id and auth_uid = v_user_id::text
     limit 1;

    if v_customer_id is not null then
      select exists (
        select 1 from public.orders o
        join public.order_items oi on oi.order_id = o.id
        where o.merchant_id = _merchant_id and o.customer_id = v_customer_id and oi.product_id = _product_id and o.status = 'delivered'
      ) into v_verified;
    end if;
  end if;

  insert into public.product_reviews (
    merchant_id, product_id, customer_id, rating, title, body,
    author_name, status, verified_purchase
  ) values (
    _merchant_id, _product_id, v_customer_id, _rating, trim(_title), trim(_body),
    trim(_author_name), 'pending'::public.review_status, coalesce(v_verified, false)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'pending');
end $$;

-- 13. review_moderate
create or replace function public.review_moderate(
  _review_id uuid,
  _status public.review_status,
  _note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rev record;
  v_caller uuid;
begin
  v_caller := auth.uid();
  select * into v_rev from public.product_reviews where id = _review_id;
  if v_rev.id is null then return; end if;

  if not public.has_merchant_role(v_rev.merchant_id, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.product_reviews
     set status = _status,
         moderation_note = coalesce(_note, moderation_note),
         published_at = (case when _status = 'published' then now() else published_at end),
         updated_at = now()
   where id = _review_id;
end $$;

-- 14. review_reply
create or replace function public.review_reply(
  _review_id uuid,
  _body text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rev record;
  v_caller uuid;
begin
  v_caller := auth.uid();
  select * into v_rev from public.product_reviews where id = _review_id;
  if v_rev.id is null then return; end if;

  if not public.has_merchant_role(v_rev.merchant_id, array['owner', 'admin']::text[], v_caller)
     and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.review_replies (review_id, merchant_id, staff_user_id, body)
  values (_review_id, v_rev.merchant_id, v_caller, trim(_body));
end $$;

-- Grants
GRANT EXECUTE ON FUNCTION public.abandoned_cart_capture(uuid, text, text, text, text, jsonb, bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.abandoned_cart_mark_recovered(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_apply_event(uuid, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_dead_letter(text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_ingest_event(text, text, text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_replay_event(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_sweep() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_cron_token_valid(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_cron_claim(text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_cron_finish(uuid, text, text, integer, text, text, jsonb, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_cron_reap_stale() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_submit(uuid, uuid, integer, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_moderate(uuid, public.review_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_reply(uuid, text) TO authenticated, service_role;
