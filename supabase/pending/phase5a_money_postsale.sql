-- =====================================================================
-- Phase 5a — post-sale money rail
--   refunds (request/advance) · COD reconciliation · gateway settlements
--
-- Design rules held here:
--   * Money is integer minor units. No floats, ever.
--   * Every write is idempotent on a caller-supplied key; a retry returns
--     the row it already created instead of minting a second one.
--   * Transitions are table-driven; an illegal jump raises, never silently
--     no-ops.
--   * Refusals are typed codes the TypeScript layer already maps
--     (forbidden, nothing_captured, exceeds_captured, reason_required,
--     not_a_cod_order, ...).
--   * Every state change appends an audit row; nothing is deleted.
-- =====================================================================

-- ---------------------------------------------------------------- guards
create unique index if not exists refunds_merchant_key_uidx
  on public.refunds (merchant_id, refund_key);
create unique index if not exists settlement_files_hash_uidx
  on public.settlement_files (merchant_id, provider, file_hash);
create unique index if not exists settlement_items_file_ref_uidx
  on public.settlement_items (file_id, settlement_ref);
create unique index if not exists cod_reconciliations_order_uidx
  on public.cod_reconciliations (order_id);
create index if not exists refunds_status_idx on public.refunds (merchant_id, status, created_at desc);

-- Legal refund rail. Seeded as data so ops can inspect it like any table.
insert into public.refund_status_transitions (from_status, to_status) values
  ('requested','processing'), ('requested','failed'), ('requested','cancelled'),
  ('processing','settled'),   ('processing','failed'),
  ('failed','processing'),    ('failed','cancelled')
on conflict do nothing;

-- Is this order-status edge legal? Used by every routine that nudges an
-- order sideways, so no routine can bypass the machine's edge list.
create or replace function public.order_edge_allowed(_from public.order_status, _to public.order_status)
returns boolean language sql stable security definer set search_path = public as $$
  select _from = _to or exists (
    select 1 from public.order_status_transitions t
     where t.from_status = _from::text and t.to_status = _to::text
  );
$$;

-- Move an order only along a legal edge; report whether it moved.
create or replace function public.order_try_advance(_order_id uuid, _to public.order_status, _note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_from public.order_status; v_merchant uuid;
begin
  select status, merchant_id into v_from, v_merchant from public.orders where id = _order_id for update;
  if v_from is null then return false; end if;
  if v_from = _to then return false; end if;
  if not public.order_edge_allowed(v_from, _to) then
    insert into public.order_events (merchant_id, order_id, event_type, note)
    values (v_merchant, _order_id, 'order.transition_skipped',
            format('%s -> %s not legal (%s)', v_from, _to, coalesce(_note,'')));
    return false;
  end if;
  update public.orders set status = _to, updated_at = now() where id = _order_id;
  insert into public.order_events (merchant_id, order_id, event_type, note)
  values (v_merchant, _order_id, 'order.' || _to::text, _note);
  return true;
end $$;

-- May the current identity act on this merchant's money?
create or replace function public.money_actor_ok(_merchant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or public.has_merchant_role(_merchant_id, array['owner','admin']::public.merchant_role[]);
$$;

create or replace function public.notify_staff(
  _merchant_id uuid, _kind text, _severity public.notification_severity,
  _title_en text, _title_bn text, _body_en text, _body_bn text,
  _href text default null, _entity_id uuid default null, _dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (merchant_id, kind, severity, title_en, title_bn,
                                    body_en, body_bn, href, entity_id, dedupe_key)
  values (_merchant_id, _kind, _severity, _title_en, coalesce(_title_bn,_title_en),
          _body_en, coalesce(_body_bn,_body_en), _href, _entity_id, _dedupe)
  on conflict do nothing;
exception when others then
  -- Notifications are a courtesy: never fail the money path over a bell.
  null;
end $$;

-- ==================================================================== refunds
-- How much of this order actually reached us, and how much is already
-- promised back. Both sides computed server-side; a client number is a hint.
create or replace function public.refund_capture_state(_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'captured', coalesce((
      select sum(p.amount_minor_int) from public.payments p
       where p.order_id = _order_id
         and lower(p.payment_status) in ('paid','captured','succeeded','settled')), 0)
      + coalesce((
      select sum(c.amount_minor_int) from public.charge_intents c
       where c.order_id = _order_id and c.status = 'paid'
         and not exists (select 1 from public.payments p2
                          where p2.order_id = _order_id
                            and p2.provider_reference is not distinct from c.provider_reference)), 0),
    'refunded', coalesce((
      select sum(r.amount_minor_int) from public.refunds r
       where r.order_id = _order_id
         and r.status in ('requested','processing','settled')), 0));
$$;

create or replace function public.refund_request(
  _order_id uuid, _amount_minor bigint, _reason text, _refund_key text)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders; v_row public.refunds; v_state jsonb;
  v_captured bigint; v_refunded bigint; v_amount bigint; v_attempt bigint;
begin
  if _refund_key is null or length(trim(_refund_key)) < 6 then
    raise exception 'refund_key_required';
  end if;
  if _reason is null or length(trim(_reason)) < 4 then
    raise exception 'reason_required';
  end if;

  select * into v_order from public.orders where id = _order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if not public.money_actor_ok(v_order.merchant_id) then raise exception 'forbidden'; end if;

  perform public.assert_rate('payments.refund', v_order.merchant_id::text, 60, 60);

  -- Replay: same key, same refund. Never a second money row.
  select * into v_row from public.refunds
   where merchant_id = v_order.merchant_id and refund_key = trim(_refund_key);
  if v_row.id is not null then return v_row; end if;

  v_state   := public.refund_capture_state(_order_id);
  v_captured := (v_state->>'captured')::bigint;
  v_refunded := (v_state->>'refunded')::bigint;
  if v_captured <= 0 then raise exception 'nothing_captured'; end if;

  v_amount := coalesce(_amount_minor, v_captured - v_refunded);
  if v_amount <= 0 then raise exception 'refund_amount_invalid'; end if;
  if v_refunded + v_amount > v_captured then raise exception 'exceeds_captured'; end if;

  select coalesce(max(attempt), 0) + 1 into v_attempt
    from public.refunds where order_id = _order_id;

  insert into public.refunds (merchant_id, order_id, refund_key, amount_minor_int, currency_code,
                              status, attempt, reason, method, payment_provider, requested_by)
  values (v_order.merchant_id, _order_id, trim(_refund_key), v_amount, v_order.currency_code,
          'requested', v_attempt, left(trim(_reason), 300), v_order.payment_method,
          v_order.payment_method::text, auth.uid())
  returning * into v_row;

  perform public.order_try_advance(_order_id, 'refund_requested',
                                   format('refund %s requested', v_row.refund_key));

  insert into public.activity_log (merchant_id, actor, action, resource_type, resource_id, changed)
  values (v_order.merchant_id, coalesce(auth.uid()::text,'system'), 'refund.requested', 'refund', v_row.id,
          jsonb_build_object('amount_minor_int', v_amount, 'attempt', v_attempt,
                             'captured', v_captured, 'already_refunded', v_refunded));

  perform public.notify_staff(v_order.merchant_id, 'refund.requested', 'warning',
    'Refund requested', 'রিফান্ড অনুরোধ',
    format('Order %s — %s refund awaiting the provider', v_order.order_number, v_amount),
    null, '/admin/payments', v_row.id, 'refund:' || v_row.id::text);

  return v_row;
end $$;

create or replace function public.refund_advance(
  _refund_id uuid, _to text, _provider_reference text default null, _failure_code text default null)
returns public.refunds language plpgsql security definer set search_path = public as $$
declare v_row public.refunds; v_to text := lower(trim(coalesce(_to,'')));
begin
  select * into v_row from public.refunds where id = _refund_id for update;
  if v_row.id is null then raise exception 'refund_not_found'; end if;
  if not public.money_actor_ok(v_row.merchant_id) then raise exception 'forbidden'; end if;

  if v_row.status = v_to then return v_row; end if;   -- provider redelivery
  if not exists (select 1 from public.refund_status_transitions
                  where from_status = v_row.status and to_status = v_to) then
    raise exception 'invalid_refund_transition:% -> %', v_row.status, v_to;
  end if;

  update public.refunds
     set status = v_to,
         provider_reference = coalesce(_provider_reference, provider_reference),
         failure_code = case when v_to = 'failed' then coalesce(_failure_code,'provider_rejected')
                             else null end,
         settled_at = case when v_to = 'settled' then now() else settled_at end,
         attempt = case when v_to = 'processing' and v_row.status = 'failed'
                        then attempt + 1 else attempt end,
         updated_at = now()
   where id = _refund_id
  returning * into v_row;

  insert into public.activity_log (merchant_id, actor, action, resource_type, resource_id, changed)
  values (v_row.merchant_id, coalesce(auth.uid()::text,'system'), 'refund.' || v_to, 'refund', v_row.id,
          jsonb_build_object('to', v_to, 'provider_reference', _provider_reference,
                             'failure_code', v_row.failure_code));

  if v_to = 'settled' then
    perform public.order_try_advance(v_row.order_id, 'refunded',
                                     format('refund %s settled', v_row.refund_key));
  elsif v_to in ('failed','cancelled') then
    -- Money stayed with us; the order goes back to its paid footing so the
    -- merchant can retry rather than being stuck in refund_requested.
    perform public.order_try_advance(v_row.order_id, 'paid',
                                     format('refund %s %s', v_row.refund_key, v_to));
    perform public.notify_staff(v_row.merchant_id, 'refund.failed', 'critical',
      'Refund failed', 'রিফান্ড ব্যর্থ',
      format('Refund %s was rejected by the provider', v_row.refund_key), null,
      '/admin/payments', v_row.id, 'refund-failed:' || v_row.id::text || ':' || v_row.attempt::text);
  end if;

  return v_row;
end $$;

-- ======================================================================== COD
create or replace function public.cod_reconcile(
  _order_id uuid, _collected_minor bigint, _carrier_code text default null, _note text default null)
returns public.cod_reconciliations language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders; v_row public.cod_reconciliations;
  v_expected bigint; v_collected bigint; v_variance bigint; v_status public.cod_recon_status;
begin
  select * into v_order from public.orders where id = _order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if not public.money_actor_ok(v_order.merchant_id) then raise exception 'forbidden'; end if;
  if v_order.payment_method <> 'cod' then raise exception 'not_a_cod_order'; end if;

  perform public.assert_rate('payments.cod_reconcile', v_order.merchant_id::text, 300, 60);

  v_expected  := v_order.total_minor_int;
  v_collected := greatest(0, coalesce(_collected_minor, 0));
  v_variance  := v_collected - v_expected;
  v_status := case when v_variance = 0 then 'matched'::public.cod_recon_status
                   else 'variance'::public.cod_recon_status end;

  insert into public.cod_reconciliations (merchant_id, order_id, carrier_code, expected_minor_int,
      collected_minor_int, variance_minor_int, currency_code, status, note)
  values (v_order.merchant_id, _order_id, _carrier_code, v_expected, v_collected, v_variance,
          v_order.currency_code, v_status, left(coalesce(_note,''), 500))
  on conflict (order_id) do update
     set collected_minor_int = excluded.collected_minor_int,
         variance_minor_int  = excluded.variance_minor_int,
         carrier_code        = coalesce(excluded.carrier_code, public.cod_reconciliations.carrier_code),
         -- A cleared variance stays cleared; a re-count cannot reopen history.
         status = case when public.cod_reconciliations.status = 'cleared' then 'cleared'
                       else excluded.status end,
         note = excluded.note,
         updated_at = now()
  returning * into v_row;

  insert into public.activity_log (merchant_id, actor, action, resource_type, resource_id, changed)
  values (v_order.merchant_id, coalesce(auth.uid()::text,'system'), 'cod.reconciled',
          'order', _order_id,
          jsonb_build_object('expected', v_expected, 'collected', v_collected,
                             'variance', v_variance, 'status', v_row.status));

  if v_row.status = 'matched' then
    perform public.order_try_advance(_order_id, 'paid', 'COD collected in full');
  else
    perform public.notify_staff(v_order.merchant_id, 'cod.variance', 'critical',
      'COD variance', 'ক্যাশ অন ডেলিভারি গরমিল',
      format('Order %s: expected %s, collected %s', v_order.order_number, v_expected, v_collected),
      null, '/admin/payments', v_row.id, 'cod:' || v_row.id::text || ':' || v_variance::text);
  end if;

  return v_row;
end $$;

create or replace function public.cod_clear_variance(_recon_id uuid, _note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_row public.cod_reconciliations;
begin
  select * into v_row from public.cod_reconciliations where id = _recon_id for update;
  if v_row.id is null then raise exception 'recon_not_found'; end if;
  if not public.money_actor_ok(v_row.merchant_id) then raise exception 'forbidden'; end if;
  if _note is null or length(trim(_note)) < 4 then raise exception 'reason_required'; end if;
  if v_row.status = 'cleared' then return false; end if;   -- resolve-once

  update public.cod_reconciliations
     set status = 'cleared', cleared_at = now(), cleared_by = auth.uid(),
         note = left(trim(_note), 500), updated_at = now()
   where id = _recon_id;

  insert into public.activity_log (merchant_id, actor, action, resource_type, resource_id, changed)
  values (v_row.merchant_id, coalesce(auth.uid()::text,'system'), 'cod.variance_cleared',
          'order', v_row.order_id,
          jsonb_build_object('variance', v_row.variance_minor_int, 'note', left(trim(_note),200)));
  return true;
end $$;

-- ================================================================ settlements
create or replace function public.settlement_ingest(
  _merchant_id uuid, _provider text, _file_date date, _file_hash text, _items jsonb)
returns public.settlement_files language plpgsql security definer set search_path = public as $$
declare
  v_file public.settlement_files; v_item jsonb;
  v_gross bigint := 0; v_fee bigint := 0; v_net bigint := 0; v_count bigint := 0;
  v_matched bigint := 0; v_reject text := null;
  v_order uuid; v_payment uuid; v_expected bigint;
begin
  if _merchant_id is null or _provider is null or _file_hash is null then
    raise exception 'settlement_input_invalid';
  end if;

  -- Replay of the same file is a no-op that returns what we already stored.
  select * into v_file from public.settlement_files
   where merchant_id = _merchant_id and provider = _provider and file_hash = _file_hash;
  if v_file.id is not null then return v_file; end if;

  -- Structural validation before a single row lands: a line that does not
  -- net (net <> gross - fee) rejects the whole file rather than importing
  -- half a day's money.
  for v_item in select * from jsonb_array_elements(coalesce(_items, '[]'::jsonb)) loop
    v_count := v_count + 1;
    if coalesce(v_item->>'ref','') = '' then v_reject := 'missing_ref'; exit; end if;
    if (v_item->>'net')::bigint <> (v_item->>'gross')::bigint - (v_item->>'fee')::bigint then
      v_reject := format('line_does_not_net:%s', v_item->>'ref'); exit;
    end if;
    v_gross := v_gross + (v_item->>'gross')::bigint;
    v_fee   := v_fee   + (v_item->>'fee')::bigint;
    v_net   := v_net   + (v_item->>'net')::bigint;
  end loop;

  insert into public.settlement_files (merchant_id, provider, file_date, file_hash, item_count,
      gross_minor_int, fee_minor_int, net_minor_int, status, reject_reason)
  values (_merchant_id, _provider, _file_date, _file_hash,
          case when v_reject is null then v_count else 0 end,
          case when v_reject is null then v_gross else 0 end,
          case when v_reject is null then v_fee   else 0 end,
          case when v_reject is null then v_net   else 0 end,
          case when v_reject is null then 'parsed'::public.settlement_file_status
               else 'rejected'::public.settlement_file_status end,
          v_reject)
  returning * into v_file;

  if v_reject is not null then
    perform public.notify_staff(_merchant_id, 'settlement.rejected', 'critical',
      'Settlement file rejected', 'সেটেলমেন্ট ফাইল বাতিল',
      format('%s %s could not be parsed (%s)', _provider, _file_date, v_reject),
      null, '/admin/payments', v_file.id, 'settle-reject:' || v_file.id::text);
    return v_file;
  end if;

  -- Line-level match: provider reference → our payment → our order. Zero
  -- tolerance; one minor unit apart is a variance, not a rounding call.
  for v_item in select * from jsonb_array_elements(_items) loop
    v_order := null; v_payment := null; v_expected := null;

    select p.id, p.order_id, p.amount_minor_int into v_payment, v_order, v_expected
      from public.payments p
     where p.merchant_id = _merchant_id
       and (p.provider_reference = v_item->>'ref' or p.idempotency_key = v_item->>'ref')
     order by p.created_at desc limit 1;

    insert into public.settlement_items (merchant_id, file_id, settlement_ref, gross_minor_int,
        fee_minor_int, net_minor_int, order_id, payment_id, match_kind)
    values (_merchant_id, v_file.id, v_item->>'ref', (v_item->>'gross')::bigint,
            (v_item->>'fee')::bigint, (v_item->>'net')::bigint, v_order, v_payment,
            case when v_payment is null then 'unmatched'
                 when v_expected = (v_item->>'gross')::bigint then 'exact'
                 else 'variance' end)
    on conflict (file_id, settlement_ref) do nothing;

    if v_payment is not null and v_expected = (v_item->>'gross')::bigint then
      v_matched := v_matched + 1;
    else
      insert into public.settlement_variance_alerts (merchant_id, file_id, item_id, kind,
          expected_minor_int, actual_minor_int)
      select _merchant_id, v_file.id, si.id,
             case when v_payment is null then 'unmatched_reference' else 'amount_mismatch' end,
             coalesce(v_expected, 0), (v_item->>'gross')::bigint
        from public.settlement_items si
       where si.file_id = v_file.id and si.settlement_ref = v_item->>'ref';
    end if;
  end loop;

  update public.settlement_files
     set matched_count = v_matched,
         status = case when v_matched = v_count then 'matched'::public.settlement_file_status
                       else 'variance_hold'::public.settlement_file_status end,
         updated_at = now()
   where id = v_file.id
  returning * into v_file;

  insert into public.activity_log (merchant_id, actor, action, resource_type, resource_id, changed)
  values (_merchant_id, coalesce(auth.uid()::text,'system'), 'settlement.ingested',
          'settlement_file', v_file.id,
          jsonb_build_object('provider', _provider, 'file_date', _file_date,
                             'items', v_count, 'matched', v_matched, 'status', v_file.status));

  if v_file.status <> 'matched' then
    perform public.notify_staff(_merchant_id, 'settlement.variance', 'critical',
      'Settlement on variance hold', 'সেটেলমেন্ট ভ্যারিয়েন্স হোল্ড',
      format('%s of %s lines matched for %s %s', v_matched, v_count, _provider, _file_date),
      null, '/admin/payments', v_file.id, 'settle-var:' || v_file.id::text);
  end if;

  return v_file;
end $$;

create or replace function public.settlement_resolve_alert(_alert_id uuid, _note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_row public.settlement_variance_alerts; v_open bigint;
begin
  select * into v_row from public.settlement_variance_alerts where id = _alert_id for update;
  if v_row.id is null then raise exception 'alert_not_found'; end if;
  if not public.money_actor_ok(v_row.merchant_id) then raise exception 'forbidden'; end if;
  if _note is null or length(trim(_note)) < 4 then raise exception 'reason_required'; end if;
  if v_row.resolved then return false; end if;   -- resolve-once, never double-escalate

  update public.settlement_variance_alerts
     set resolved = true, resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = left(trim(_note), 500)
   where id = _alert_id;

  select count(*) into v_open from public.settlement_variance_alerts
   where file_id = v_row.file_id and not resolved;

  -- The file leaves the hold only when nothing is outstanding.
  if v_open = 0 then
    update public.settlement_files set status = 'matched', updated_at = now()
     where id = v_row.file_id and status = 'variance_hold';
  end if;

  insert into public.activity_log (merchant_id, actor, action, resource_type, resource_id, changed)
  values (v_row.merchant_id, coalesce(auth.uid()::text,'system'), 'settlement.alert_resolved',
          'settlement_file', v_row.file_id,
          jsonb_build_object('alert_id', _alert_id, 'remaining_open', v_open));
  return true;
end $$;

-- --------------------------------------------------------------- privileges
revoke all on function public.order_edge_allowed(public.order_status, public.order_status) from public;
revoke all on function public.order_try_advance(uuid, public.order_status, text) from public;
revoke all on function public.money_actor_ok(uuid) from public;
revoke all on function public.notify_staff(uuid, text, public.notification_severity, text, text, text, text, text, uuid, text) from public;
revoke all on function public.refund_capture_state(uuid) from public;
revoke all on function public.refund_request(uuid, bigint, text, text) from public;
revoke all on function public.refund_advance(uuid, text, text, text) from public;
revoke all on function public.cod_reconcile(uuid, bigint, text, text) from public;
revoke all on function public.cod_clear_variance(uuid, text) from public;
revoke all on function public.settlement_ingest(uuid, text, date, text, jsonb) from public;
revoke all on function public.settlement_resolve_alert(uuid, text) from public;

grant execute on function public.refund_request(uuid, bigint, text, text) to authenticated, service_role;
grant execute on function public.refund_advance(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.cod_reconcile(uuid, bigint, text, text) to authenticated, service_role;
grant execute on function public.cod_clear_variance(uuid, text) to authenticated, service_role;
grant execute on function public.settlement_resolve_alert(uuid, text) to authenticated, service_role;
grant execute on function public.settlement_ingest(uuid, text, date, text, jsonb) to service_role;
grant execute on function public.order_try_advance(uuid, public.order_status, text) to service_role;
grant execute on function public.order_edge_allowed(public.order_status, public.order_status) to authenticated, service_role;
grant execute on function public.money_actor_ok(uuid) to authenticated, service_role;
grant execute on function public.refund_capture_state(uuid) to authenticated, service_role;
grant execute on function public.notify_staff(uuid, text, public.notification_severity, text, text, text, text, text, uuid, text) to service_role;
