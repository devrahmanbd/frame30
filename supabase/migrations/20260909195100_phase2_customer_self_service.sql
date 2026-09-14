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
