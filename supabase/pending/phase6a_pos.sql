-- ============================================================================
-- Phase 6a — Point of sale (till) rail
--
-- Three routines carry every till decision that touches money or stock:
--   pos_sale_capture  — price, balance tenders, move stock, one sale per client id
--   pos_refund        — capped, idempotent payout with optional restock
--   pos_shift_report  — Z-report: tender split, refunds, drawer variance, top items
--
-- Design rules honoured here:
--   * Prices are read from `product_variants` under a row lock. A client-sent
--     price is never trusted, and never even accepted.
--   * The merchant-supplied client id is the idempotency key. An offline queue
--     replay, a double tap, or a retried request returns the ORIGINAL sale.
--   * Tenders must balance the sale to the paisa. A short or over tender is a
--     hard error, not a silent adjustment.
--   * Stock moves in the same transaction as the money, at the store's default
--     location, and is written back on refund only when restock was asked for.
--   * Every refusal raises a stable, secret-free code the app already maps.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Idempotency and lookup keys. Without these the "replay returns the original
-- sale" promise is only a hope: two concurrent syncs of the same offline queue
-- would both insert.
-- --------------------------------------------------------------------------
create unique index if not exists pos_orders_client_uidx
  on public.pos_orders (merchant_id, client_id);
create unique index if not exists pos_refunds_key_uidx
  on public.pos_refunds (merchant_id, idempotency_key);
create unique index if not exists local_transactions_client_uidx
  on public.local_transactions (merchant_id, client_id);
create index if not exists pos_orders_session_idx
  on public.pos_orders (merchant_id, session_id, captured_at desc);
create index if not exists pos_payments_order_idx
  on public.pos_payments (pos_order_id);
create index if not exists pos_refunds_order_idx
  on public.pos_refunds (merchant_id, pos_order_id);

-- --------------------------------------------------------------------------
-- Shared helpers
-- --------------------------------------------------------------------------

-- The store's stock location. A till sale must land somewhere physical; when a
-- merchant never configured locations we create the implied default once
-- instead of silently skipping the stock movement.
create or replace function public.pos_default_location(_merchant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _id uuid;
begin
  select id into _id
    from public.inventory_locations
   where merchant_id = _merchant_id
     and coalesce(active, true)
   order by is_default desc, created_at asc
   limit 1;

  if _id is null then
    insert into public.inventory_locations (merchant_id, code, name, is_default, active)
    values (_merchant_id, 'STORE', 'Store', true, true)
    returning id into _id;
  end if;
  return _id;
end;
$$;

-- One stock write path for the till: negative delta on sale, positive on
-- restock. Keeps `product_variants.stock_quantity` (the fast read the till
-- scans against) and `inventory_levels.on_hand` (the location truth) in step.
create or replace function public.pos_move_stock(
  _merchant_id uuid,
  _location_id uuid,
  _variant_id uuid,
  _delta bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _delta = 0 then return; end if;

  update public.product_variants
     set stock_quantity = greatest(0, stock_quantity + _delta),
         updated_at = now()
   where id = _variant_id
     and merchant_id = _merchant_id;

  insert into public.inventory_levels (merchant_id, location_id, variant_id, on_hand)
  values (_merchant_id, _location_id, _variant_id, greatest(0, _delta))
  on conflict (merchant_id, location_id, variant_id)
  do update set on_hand = greatest(0, public.inventory_levels.on_hand + _delta),
                updated_at = now();
end;
$$;

-- The till's own audit trail. `local_transactions` is what the offline queue
-- reconciles against, so every capture and refund leaves a row whether it was
-- a fresh sale or a replay.
create or replace function public.pos_note_sync(
  _merchant_id uuid,
  _client_id uuid,
  _payload jsonb,
  _status sync_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.local_transactions (merchant_id, client_id, payload, status, attempts)
  values (_merchant_id, _client_id, coalesce(_payload, '{}'::jsonb), _status, 1)
  on conflict (merchant_id, client_id)
  do update set payload = excluded.payload,
                status = excluded.status,
                attempts = public.local_transactions.attempts + 1,
                error = case when excluded.status = 'failed' then public.local_transactions.error else null end,
                updated_at = now();
end;
$$;

-- ============================================================================
-- pos_sale_capture
-- ============================================================================
create or replace function public.pos_sale_capture(
  _merchant_id uuid,
  _session_id uuid,
  _client_id uuid,
  _origin pos_origin,
  _lines jsonb,
  _tenders jsonb,
  _discount_minor_int bigint,
  _customer jsonb,
  _captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.pos_orders;
  _line jsonb;
  _tender jsonb;
  _variant record;
  _qty bigint;
  _items jsonb := '[]'::jsonb;
  _subtotal bigint := 0;
  _discount bigint := 0;
  _total bigint := 0;
  _tendered_total bigint := 0;
  _tender_sum bigint := 0;
  _change bigint := 0;
  _method pos_payment_method := 'cash';
  _has_cod boolean := false;
  _location uuid;
  _currency text := 'BDT';
  _status pos_order_status;
  _payments jsonb := '[]'::jsonb;
  _row record;
  _captured timestamptz := coalesce(_captured_at, now());
begin
  if _merchant_id is null or _client_id is null then
    raise exception 'pos_invalid_request';
  end if;

  -- Burst gate. The app also throttles, but the till is reachable from an
  -- offline queue that can flush a whole day at once — the database keeps the
  -- final say so a stuck loop cannot hammer the catalogue.
  perform public.assert_rate('pos.capture.sql', _merchant_id::text, 1200, 60);

  select currency_code into _currency from public.merchants where id = _merchant_id;
  if _currency is null then raise exception 'pos_store_not_found'; end if;

  -- Serialise same-key syncs. Two devices flushing the same queue line up here
  -- instead of racing to insert.
  perform pg_advisory_xact_lock(hashtextextended(_merchant_id::text || ':' || _client_id::text, 42));

  -- Replay: hand back the original sale, never a second one.
  select * into _order
    from public.pos_orders
   where merchant_id = _merchant_id and client_id = _client_id;
  if found then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) into _payments
      from public.pos_payments p where p.pos_order_id = _order.id;
    perform public.pos_note_sync(
      _merchant_id, _client_id,
      jsonb_build_object('replayed', true, 'total_minor_int', _order.total_minor_int),
      'synced');
    return jsonb_build_object(
      'order', to_jsonb(_order),
      'payments', _payments,
      'duplicate', true,
      'change_minor_int', 0);
  end if;

  if _lines is null or jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 then
    raise exception 'pos_empty_cart';
  end if;
  if jsonb_array_length(_lines) > 200 then
    raise exception 'pos_cart_too_large';
  end if;

  _location := public.pos_default_location(_merchant_id);

  -- Price and stock, line by line, under a row lock so two tills cannot both
  -- read the same last unit.
  for _line in select value from jsonb_array_elements(_lines) loop
    _qty := greatest(1, floor(coalesce((_line->>'quantity')::numeric, 1))::bigint);

    select v.id, v.name, v.sku, v.price_amount_minor_int, v.stock_quantity, p.title
      into _variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = nullif(_line->>'variantId', '')::uuid
       and v.merchant_id = _merchant_id
       and v.deleted_at is null
     for update of v;

    if not found then raise exception 'pos_variant_missing'; end if;

    _subtotal := _subtotal + (_variant.price_amount_minor_int * _qty);
    _items := _items || jsonb_build_object(
      'variant_id', _variant.id,
      'title', _variant.title,
      'variant_name', _variant.name,
      'sku', _variant.sku,
      'quantity', _qty,
      'unit_minor_int', _variant.price_amount_minor_int,
      'line_minor_int', _variant.price_amount_minor_int * _qty,
      -- Recorded, not enforced: a shop floor sells the unit in hand even when
      -- the count says zero. The report surfaces it instead of blocking a sale.
      'oversold', _variant.stock_quantity < _qty
    );
  end loop;

  -- A discount can never turn a sale negative.
  _discount := least(greatest(0, coalesce(_discount_minor_int, 0)), _subtotal);
  _total := _subtotal - _discount;

  if _tenders is null or jsonb_typeof(_tenders) <> 'array' or jsonb_array_length(_tenders) = 0 then
    raise exception 'pos_tender_mismatch';
  end if;

  for _tender in select value from jsonb_array_elements(_tenders) loop
    if (_tender->>'method') not in ('cash', 'card', 'cod') then
      raise exception 'pos_tender_mismatch';
    end if;
    _tender_sum := _tender_sum + greatest(0, floor(coalesce((_tender->>'amountMinorInt')::numeric, 0))::bigint);
    _tendered_total := _tendered_total + greatest(0, floor(coalesce((_tender->>'tenderedMinorInt')::numeric, 0))::bigint);
    if (_tender->>'method') = 'cod' then _has_cod := true; end if;
  end loop;

  -- The whole point of a till: what was taken must equal what was owed.
  if _tender_sum <> _total then
    raise exception 'pos_tender_mismatch';
  end if;

  -- Change is only ever cash back, and only what was physically handed over.
  _change := greatest(0, _tendered_total - _tender_sum);

  select (_tenders->0->>'method')::pos_payment_method into _method;
  _status := case when _has_cod then 'synced'::pos_order_status else 'paid'::pos_order_status end;

  insert into public.pos_orders (
    merchant_id, session_id, client_id, origin, status, payment_method,
    items, subtotal_minor_int, discount_minor_int, total_minor_int,
    currency_code, customer_name, customer_phone, address_line, city,
    auth_code, captured_at
  ) values (
    _merchant_id,
    (select s.id from public.pos_sessions s
      where s.id = _session_id and s.merchant_id = _merchant_id and s.status = 'open'),
    _client_id, coalesce(_origin, 'offline'), _status, _method,
    _items, _subtotal, _discount, _total,
    _currency,
    nullif(btrim(coalesce(_customer->>'name', '')), ''),
    nullif(btrim(coalesce(_customer->>'phone', '')), ''),
    nullif(btrim(coalesce(_customer->>'addressLine', '')), ''),
    nullif(btrim(coalesce(_customer->>'city', '')), ''),
    (select nullif(btrim(coalesce(t->>'authCode', '')), '')
       from jsonb_array_elements(_tenders) t
      where t->>'method' = 'card' limit 1),
    _captured
  )
  returning * into _order;

  -- Tender rows carry the drawer maths: what was taken, what was handed over,
  -- what went back as change. Change is attributed to the cash leg only.
  for _tender in select value from jsonb_array_elements(_tenders) loop
    insert into public.pos_payments (
      merchant_id, pos_order_id, method, amount_minor_int, tendered_minor_int,
      change_minor_int, currency_code, auth_code
    ) values (
      _merchant_id, _order.id, (_tender->>'method')::pos_payment_method,
      greatest(0, floor(coalesce((_tender->>'amountMinorInt')::numeric, 0))::bigint),
      greatest(0, floor(coalesce((_tender->>'tenderedMinorInt')::numeric, 0))::bigint),
      case when (_tender->>'method') = 'cash' then _change else 0 end,
      _currency,
      nullif(btrim(coalesce(_tender->>'authCode', '')), '')
    );
  end loop;

  -- Stock leaves the shelf in the same transaction as the money.
  for _row in select (i->>'variant_id')::uuid as vid, (i->>'quantity')::bigint as qty
                from jsonb_array_elements(_items) i loop
    perform public.pos_move_stock(_merchant_id, _location, _row.vid, -_row.qty);
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) into _payments
    from public.pos_payments p where p.pos_order_id = _order.id;

  perform public.pos_note_sync(
    _merchant_id, _client_id,
    jsonb_build_object('origin', coalesce(_origin, 'offline'), 'total_minor_int', _total),
    'synced');

  return jsonb_build_object(
    'order', to_jsonb(_order),
    'payments', _payments,
    'duplicate', false,
    'change_minor_int', _change);
end;
$$;

-- ============================================================================
-- pos_refund
-- ============================================================================
create or replace function public.pos_refund(
  _merchant_id uuid,
  _pos_order_id uuid,
  _staff_user_id uuid,
  _idempotency_key text,
  _amount_minor_int bigint,
  _method pos_payment_method,
  _reason text,
  _restock boolean,
  _lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.pos_orders;
  _existing public.pos_refunds;
  _refund public.pos_refunds;
  _already bigint := 0;
  _amount bigint;
  _remaining bigint;
  _location uuid;
  _line jsonb;
  _qty bigint;
  _sold bigint;
  _clean jsonb := '[]'::jsonb;
begin
  if _merchant_id is null or _pos_order_id is null or coalesce(btrim(_idempotency_key), '') = '' then
    raise exception 'pos_invalid_request';
  end if;

  perform public.assert_rate('pos.refund.sql', _merchant_id::text, 300, 60);
  perform pg_advisory_xact_lock(hashtextextended(_merchant_id::text || ':refund:' || _idempotency_key, 42));

  -- Replay before anything else: a double-tapped refund button pays out once.
  select * into _existing
    from public.pos_refunds
   where merchant_id = _merchant_id and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object('refund', to_jsonb(_existing), 'replayed', true);
  end if;

  select * into _order
    from public.pos_orders
   where id = _pos_order_id and merchant_id = _merchant_id
   for update;
  if not found then raise exception 'pos_order_not_found'; end if;
  if _order.status = 'voided' then raise exception 'pos_order_voided'; end if;

  _amount := floor(coalesce(_amount_minor_int, 0))::bigint;
  if _amount <= 0 then raise exception 'pos_refund_invalid_amount'; end if;

  select coalesce(sum(amount_minor_int), 0) into _already
    from public.pos_refunds
   where merchant_id = _merchant_id and pos_order_id = _pos_order_id;

  _remaining := _order.total_minor_int - _already;
  if _amount > _remaining then raise exception 'pos_refund_exceeds_total'; end if;

  -- Returned units are capped against what was actually sold on this sale, so a
  -- typo cannot inflate stock.
  if _lines is not null and jsonb_typeof(_lines) = 'array' then
    for _line in select value from jsonb_array_elements(_lines) loop
      _qty := greatest(0, floor(coalesce((_line->>'quantity')::numeric, 0))::bigint);
      if _qty = 0 then continue; end if;

      select coalesce(sum((i->>'quantity')::bigint), 0) into _sold
        from jsonb_array_elements(_order.items) i
       where (i->>'variant_id') = (_line->>'variantId');
      if _sold = 0 then raise exception 'pos_refund_line_not_on_sale'; end if;

      _clean := _clean || jsonb_build_object(
        'variant_id', (_line->>'variantId')::uuid,
        'quantity', least(_qty, _sold));
    end loop;
  end if;

  insert into public.pos_refunds (
    merchant_id, pos_order_id, session_id, staff_user_id, idempotency_key,
    amount_minor_int, method, reason, restock, lines, currency_code
  ) values (
    _merchant_id, _pos_order_id, _order.session_id, _staff_user_id, _idempotency_key,
    _amount, coalesce(_method, 'cash'), nullif(btrim(coalesce(_reason, '')), ''),
    coalesce(_restock, false), _clean, _order.currency_code
  )
  returning * into _refund;

  if coalesce(_restock, false) then
    _location := public.pos_default_location(_merchant_id);
    for _line in select value from jsonb_array_elements(_clean) loop
      perform public.pos_move_stock(
        _merchant_id, _location,
        (_line->>'variant_id')::uuid,
        (_line->>'quantity')::bigint);
    end loop;
  end if;

  -- A sale refunded to the last paisa is void for drawer purposes; a partial
  -- refund leaves the sale standing.
  if _already + _amount >= _order.total_minor_int then
    update public.pos_orders set status = 'voided', updated_at = now()
     where id = _pos_order_id and merchant_id = _merchant_id;
  end if;

  perform public.pos_note_sync(
    _merchant_id, _order.client_id,
    jsonb_build_object('refunded_minor_int', _already + _amount, 'total_minor_int', _order.total_minor_int),
    'synced');

  return jsonb_build_object(
    'refund', to_jsonb(_refund),
    'replayed', false,
    'refunded_total_minor_int', _already + _amount,
    'remaining_minor_int', _order.total_minor_int - (_already + _amount));
end;
$$;

-- ============================================================================
-- pos_shift_report — the Z-report an operator closes the day with
-- ============================================================================
create or replace function public.pos_shift_report(
  _merchant_id uuid,
  _session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _session public.pos_sessions;
  _tenders jsonb;
  _refunds jsonb;
  _cash bigint := 0;
  _card bigint := 0;
  _cod bigint := 0;
  _refund_total bigint := 0;
  _refund_cash bigint := 0;
  _gross bigint := 0;
  _orders bigint := 0;
  _voided bigint := 0;
  _expected bigint;
begin
  select * into _session
    from public.pos_sessions
   where id = _session_id and merchant_id = _merchant_id;
  if not found then raise exception 'pos_shift_not_found'; end if;

  -- Voided sales are excluded from takings but still reported as a count, so a
  -- drawer that does not balance has somewhere to look.
  select count(*) filter (where status <> 'voided'),
         count(*) filter (where status = 'voided'),
         coalesce(sum(total_minor_int) filter (where status <> 'voided'), 0)
    into _orders, _voided, _gross
    from public.pos_orders
   where merchant_id = _merchant_id and session_id = _session_id;

  select coalesce(sum(p.amount_minor_int) filter (where p.method = 'cash'), 0),
         coalesce(sum(p.amount_minor_int) filter (where p.method = 'card'), 0),
         coalesce(sum(p.amount_minor_int) filter (where p.method = 'cod'), 0)
    into _cash, _card, _cod
    from public.pos_payments p
    join public.pos_orders o on o.id = p.pos_order_id
   where o.merchant_id = _merchant_id and o.session_id = _session_id and o.status <> 'voided';

  select coalesce(sum(amount_minor_int), 0),
         coalesce(sum(amount_minor_int) filter (where method = 'cash'), 0)
    into _refund_total, _refund_cash
    from public.pos_refunds
   where merchant_id = _merchant_id and session_id = _session_id;

  -- What the drawer should physically hold: opening float, plus cash taken,
  -- minus cash handed back.
  _expected := _session.starting_cash_minor_int + (_cash - _refund_cash);

  select coalesce(jsonb_agg(t), '[]'::jsonb) into _tenders from (
    select p.method,
           count(*) as count,
           sum(p.amount_minor_int) as amount_minor_int,
           sum(p.change_minor_int) as change_minor_int
      from public.pos_payments p
      join public.pos_orders o on o.id = p.pos_order_id
     where o.merchant_id = _merchant_id and o.session_id = _session_id and o.status <> 'voided'
     group by p.method
     order by p.method
  ) t;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into _refunds from (
    select method, count(*) as count, sum(amount_minor_int) as amount_minor_int
      from public.pos_refunds
     where merchant_id = _merchant_id and session_id = _session_id
     group by method order by method
  ) r;

  return jsonb_build_object(
    'session', to_jsonb(_session),
    'orders', _orders,
    'voided_orders', _voided,
    'gross_minor_int', _gross,
    'net_minor_int', _gross - _refund_total,
    'cash_minor_int', _cash,
    'card_minor_int', _card,
    'cod_minor_int', _cod,
    'refund_minor_int', _refund_total,
    'refund_cash_minor_int', _refund_cash,
    'drawer_cash_minor_int', _cash - _refund_cash,
    'expected_cash_minor_int', _expected,
    'actual_cash_minor_int', _session.actual_cash_minor_int,
    'variance_minor_int', case when _session.actual_cash_minor_int is null then null
                               else _session.actual_cash_minor_int - _expected end,
    'tenders', _tenders,
    'refunds', _refunds,
    'top_items', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select i->>'title' as title,
               i->>'variant_name' as variant_name,
               sum((i->>'quantity')::bigint) as quantity,
               sum((i->>'line_minor_int')::bigint) as amount_minor_int
          from public.pos_orders o, jsonb_array_elements(o.items) i
         where o.merchant_id = _merchant_id and o.session_id = _session_id and o.status <> 'voided'
         group by 1, 2
         order by 4 desc
         limit 10
      ) x),
    'hourly', (
      select coalesce(jsonb_agg(h order by h->>'hour'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'hour', to_char(date_trunc('hour', captured_at), 'YYYY-MM-DD HH24:00'),
                 'orders', count(*),
                 'amount_minor_int', sum(total_minor_int)) as h
          from public.pos_orders
         where merchant_id = _merchant_id and session_id = _session_id and status <> 'voided'
         group by 1
      ) y),
    'oversold_lines', (
      select count(*) from public.pos_orders o, jsonb_array_elements(o.items) i
       where o.merchant_id = _merchant_id and o.session_id = _session_id
         and coalesce((i->>'oversold')::boolean, false)),
    'generated_at', now());
end;
$$;

-- --------------------------------------------------------------------------
-- Privileges. The till talks to these through trusted server code, so nothing
-- here is reachable without signing in, and the internal stock/sync helpers are
-- service-role only.
-- --------------------------------------------------------------------------
revoke all on function public.pos_default_location(uuid) from public, anon, authenticated;
revoke all on function public.pos_move_stock(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.pos_note_sync(uuid, uuid, jsonb, sync_status) from public, anon, authenticated;
grant execute on function public.pos_default_location(uuid) to service_role;
grant execute on function public.pos_move_stock(uuid, uuid, uuid, bigint) to service_role;
grant execute on function public.pos_note_sync(uuid, uuid, jsonb, sync_status) to service_role;

revoke all on function public.pos_sale_capture(uuid, uuid, uuid, pos_origin, jsonb, jsonb, bigint, jsonb, timestamptz) from public, anon;
revoke all on function public.pos_refund(uuid, uuid, uuid, text, bigint, pos_payment_method, text, boolean, jsonb) from public, anon;
revoke all on function public.pos_shift_report(uuid, uuid) from public, anon;
grant execute on function public.pos_sale_capture(uuid, uuid, uuid, pos_origin, jsonb, jsonb, bigint, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.pos_refund(uuid, uuid, uuid, text, bigint, pos_payment_method, text, boolean, jsonb) to authenticated, service_role;
grant execute on function public.pos_shift_report(uuid, uuid) to authenticated, service_role;
