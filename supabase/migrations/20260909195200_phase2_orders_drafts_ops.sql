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
