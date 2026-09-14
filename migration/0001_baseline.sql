--
-- PostgreSQL database dump
--

\restrict tbgZ4nQThdo9UhgOVayn2ESdHZsyf07N3Ohy9LbgTvIgJOOs4gZioHgB3HcvA1Z

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: abandoned_cart_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.abandoned_cart_status AS ENUM (
    'active',
    'recovered',
    'lost'
);


--
-- Name: address_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.address_type AS ENUM (
    'shipping',
    'billing'
);


--
-- Name: ai_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_channel AS ENUM (
    'widget',
    'admin'
);


--
-- Name: ai_conversation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_conversation_status AS ENUM (
    'open',
    'needs_agent',
    'resolved',
    'closed'
);


--
-- Name: ai_message_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_message_role AS ENUM (
    'customer',
    'bot',
    'agent'
);


--
-- Name: api_key_env; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.api_key_env AS ENUM (
    'test',
    'live'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired',
    'cancelled'
);


--
-- Name: billing_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_plan AS ENUM (
    'launch',
    'growth',
    'business',
    'enterprise'
);


--
-- Name: catalog_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.catalog_status AS ENUM (
    'draft',
    'active',
    'archived'
);


--
-- Name: charge_intent_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.charge_intent_status AS ENUM (
    'initiated',
    'pending',
    'paid',
    'failed',
    'expired',
    'cancelled'
);


--
-- Name: cod_recon_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cod_recon_status AS ENUM (
    'pending',
    'matched',
    'variance',
    'cleared'
);


--
-- Name: cod_settlement_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cod_settlement_state AS ENUM (
    'pending',
    'matched',
    'mismatch',
    'settled',
    'written_off'
);


--
-- Name: consent_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consent_channel AS ENUM (
    'email',
    'sms',
    'push'
);


--
-- Name: consent_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.consent_purpose AS ENUM (
    'marketing',
    'cart_recovery',
    'stock_alerts'
);


--
-- Name: coupon_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_status AS ENUM (
    'draft',
    'active',
    'paused',
    'expired'
);


--
-- Name: coupon_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_type AS ENUM (
    'fixed',
    'percent',
    'bogo',
    'free_shipping'
);


--
-- Name: courier_event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.courier_event_status AS ENUM (
    'processed',
    'duplicate',
    'rejected',
    'dead_letter',
    'replayed'
);


--
-- Name: dispute_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_status AS ENUM (
    'open',
    'evidence_submitted',
    'won',
    'lost',
    'withdrawn'
);


--
-- Name: export_job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.export_job_status AS ENUM (
    'queued',
    'generating',
    'signing',
    'ready_for_download',
    'downloaded',
    'expired',
    'fail_retry'
);


--
-- Name: export_object_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.export_object_type AS ENUM (
    'orders',
    'products',
    'customers',
    'product_events',
    'analytics_raw'
);


--
-- Name: fraud_blacklist_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fraud_blacklist_kind AS ENUM (
    'phone',
    'email'
);


--
-- Name: fraud_case_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fraud_case_status AS ENUM (
    'open',
    'evidence_requested',
    'approved',
    'rejected'
);


--
-- Name: fulfilment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fulfilment_status AS ENUM (
    'pending',
    'packed',
    'shipped',
    'delivered',
    'cancelled'
);


--
-- Name: gift_card_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gift_card_status AS ENUM (
    'active',
    'redeemed',
    'expired',
    'void'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'open',
    'paid',
    'past_due',
    'void'
);


--
-- Name: kyc_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kyc_state AS ENUM (
    'pending',
    'submitted',
    'verified',
    'rejected'
);


--
-- Name: kyc_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kyc_status AS ENUM (
    'pending',
    'verified',
    'rejected'
);


--
-- Name: market_install_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.market_install_status AS ENUM (
    'installed',
    'trial',
    'paused',
    'rolled_back'
);


--
-- Name: market_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.market_kind AS ENUM (
    'theme',
    'widget'
);


--
-- Name: market_listing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.market_listing_status AS ENUM (
    'draft',
    'review',
    'active',
    'paused',
    'archived'
);


--
-- Name: merchant_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.merchant_role AS ENUM (
    'owner',
    'admin',
    'staff',
    'viewer'
);


--
-- Name: merchant_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.merchant_status AS ENUM (
    'active',
    'suspended',
    'pending'
);


--
-- Name: notification_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_severity AS ENUM (
    'info',
    'warning',
    'critical'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'payment_pending',
    'confirmed',
    'paid',
    'fulfilled',
    'cancelled',
    'refunded',
    'packed',
    'shipped',
    'delivered',
    'refund_requested'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cod',
    'bkash',
    'nagad',
    'rocket'
);


--
-- Name: pos_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_order_status AS ENUM (
    'local_pending',
    'synced',
    'paid',
    'delivered',
    'voided'
);


--
-- Name: pos_origin; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_origin AS ENUM (
    'offline',
    'online'
);


--
-- Name: pos_payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_payment_method AS ENUM (
    'cash',
    'card',
    'cod'
);


--
-- Name: pos_session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pos_session_status AS ENUM (
    'open',
    'closed'
);


--
-- Name: product_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_kind AS ENUM (
    'physical',
    'digital',
    'service',
    'subscription'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'draft',
    'active',
    'archived'
);


--
-- Name: return_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_status AS ENUM (
    'requested',
    'approved',
    'rejected',
    'received',
    'refunded',
    'cancelled'
);


--
-- Name: review_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_status AS ENUM (
    'pending',
    'published',
    'rejected'
);


--
-- Name: seo_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seo_entity_type AS ENUM (
    'store',
    'product',
    'collection',
    'page',
    'article'
);


--
-- Name: settlement_file_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.settlement_file_status AS ENUM (
    'received',
    'parsed',
    'matched',
    'posted',
    'rejected',
    'variance_hold'
);


--
-- Name: shipment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_status AS ENUM (
    'created',
    'pickup_scheduled',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'failed_attempt',
    'returned'
);


--
-- Name: staff_mfa_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.staff_mfa_status AS ENUM (
    'none',
    'enrolled',
    'enforced'
);


--
-- Name: staff_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.staff_status AS ENUM (
    'invited',
    'active',
    'suspended',
    'removed'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'trial',
    'active',
    'past_due',
    'paused',
    'cancelled'
);


--
-- Name: sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_status AS ENUM (
    'pending',
    'synced',
    'failed'
);


--
-- Name: transfer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_status AS ENUM (
    'draft',
    'in_transit',
    'received',
    'cancelled'
);


--
-- Name: cod_clear_variance(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cod_clear_variance(_recon_id uuid, _note text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cod_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cod_reconciliations (
    carrier_code text,
    cleared_at timestamp with time zone,
    cleared_by uuid,
    collected_minor_int bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    expected_minor_int bigint NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    note text,
    order_id uuid NOT NULL,
    status public.cod_recon_status DEFAULT 'pending'::public.cod_recon_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variance_minor_int bigint NOT NULL
);


--
-- Name: cod_reconcile(uuid, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cod_reconcile(_order_id uuid, _collected_minor bigint, _carrier_code text DEFAULT NULL::text, _note text DEFAULT NULL::text) RETURNS public.cod_reconciliations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: customer_order_detail(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_order_detail(_merchant_id uuid, _order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare _cid uuid;
begin
  _cid := public.customer_require_self(_merchant_id);
  if _cid is null then return null; end if;
  return public.customer_order_detail_impl(_merchant_id, _order_id);
end;
$$;


--
-- Name: customer_overview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_overview(_merchant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.customer_require_self(_merchant_id);
  return public.customer_overview_impl(_merchant_id);
end;
$$;


--
-- Name: customer_require_self(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_require_self(_merchant_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare _cid uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if _merchant_id is null then
    raise exception 'merchant required' using errcode = '22023';
  end if;
  select id into _cid from public.customers
   where merchant_id = _merchant_id and auth_uid = auth.uid()::text and deleted_at is null;
  return _cid; -- null = signed-in user with no account at this store yet
end;
$$;


--
-- Name: is_merchant_admin(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_merchant_admin(_merchant_id uuid, _user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.merchant_members m
    where m.merchant_id = _merchant_id and m.user_id = _user_id
      and m.status = 'active' and m.role in ('owner','admin')
  )
$$;


--
-- Name: is_merchant_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_merchant_member(_merchant_id uuid, _user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.merchant_members m
    where m.merchant_id = _merchant_id and m.user_id = _user_id and m.status = 'active'
  )
$$;


--
-- Name: is_platform_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = _user_id)
$$;


--
-- Name: notify_staff(uuid, text, public.notification_severity, text, text, text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_staff(_merchant_id uuid, _kind text, _severity public.notification_severity, _title_en text, _title_bn text, _body_en text, _body_bn text, _href text DEFAULT NULL::text, _entity_id uuid DEFAULT NULL::uuid, _dedupe text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: order_try_advance(uuid, public.order_status, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.order_try_advance(_order_id uuid, _to public.order_status, _note text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pos_default_location(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_default_location(_merchant_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pos_move_stock(uuid, uuid, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_move_stock(_merchant_id uuid, _location_id uuid, _variant_id uuid, _delta bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pos_note_sync(uuid, uuid, jsonb, public.sync_status); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_note_sync(_merchant_id uuid, _client_id uuid, _payload jsonb, _status public.sync_status) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pos_refund(uuid, uuid, uuid, text, bigint, public.pos_payment_method, text, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_refund(_merchant_id uuid, _pos_order_id uuid, _staff_user_id uuid, _idempotency_key text, _amount_minor_int bigint, _method public.pos_payment_method, _reason text, _restock boolean, _lines jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pos_sale_capture(uuid, uuid, uuid, public.pos_origin, jsonb, jsonb, bigint, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_sale_capture(_merchant_id uuid, _session_id uuid, _client_id uuid, _origin public.pos_origin, _lines jsonb, _tenders jsonb, _discount_minor_int bigint, _customer jsonb, _captured_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pos_shift_report(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_shift_report(_merchant_id uuid, _session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    amount_minor_int bigint NOT NULL,
    attempt bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    failure_code text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    method public.payment_method,
    order_id uuid NOT NULL,
    payment_provider text,
    provider_reference text,
    reason text,
    refund_key text NOT NULL,
    requested_by uuid,
    settled_at timestamp with time zone,
    status text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refund_advance(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_advance(_refund_id uuid, _to text, _provider_reference text DEFAULT NULL::text, _failure_code text DEFAULT NULL::text) RETURNS public.refunds
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: refund_capture_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_capture_state(_order_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: refund_request(uuid, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_request(_order_id uuid, _amount_minor bigint, _reason text, _refund_key text) RETURNS public.refunds
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin new.updated_at = now(); return new; end $$;


--
-- Name: settlement_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_files (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    fee_minor_int bigint DEFAULT 0 NOT NULL,
    file_date date NOT NULL,
    file_hash text NOT NULL,
    gross_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_count bigint DEFAULT 0 NOT NULL,
    matched_count bigint DEFAULT 0 NOT NULL,
    merchant_id uuid NOT NULL,
    net_minor_int bigint DEFAULT 0 NOT NULL,
    posted_at timestamp with time zone,
    provider text NOT NULL,
    reject_reason text,
    status public.settlement_file_status DEFAULT 'received'::public.settlement_file_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: settlement_ingest(uuid, text, date, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settlement_ingest(_merchant_id uuid, _provider text, _file_date date, _file_hash text, _items jsonb) RETURNS public.settlement_files
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: settlement_resolve_alert(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settlement_resolve_alert(_alert_id uuid, _note text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: abandoned_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_carts (
    cart_token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    customer_email text,
    customer_name text,
    customer_phone text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    lines jsonb DEFAULT '{}'::jsonb NOT NULL,
    merchant_id uuid NOT NULL,
    recovered_order_id uuid,
    recovery_sent_at timestamp with time zone,
    status public.abandoned_cart_status NOT NULL,
    subtotal_minor_int bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    action text NOT NULL,
    actor text,
    changed jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    merchant_id uuid NOT NULL,
    resource_id uuid,
    resource_type text NOT NULL
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    channel public.ai_channel DEFAULT 'widget'::public.ai_channel NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    first_message_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    order_number text,
    phone_hash text,
    rating bigint,
    status public.ai_conversation_status DEFAULT 'open'::public.ai_conversation_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    body text NOT NULL,
    conversation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    flagged boolean DEFAULT false NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    role public.ai_message_role NOT NULL
);


--
-- Name: api_key_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_key_events (
    action text NOT NULL,
    actor text,
    api_key_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    env public.api_key_env DEFAULT 'test'::public.api_key_env NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_hash text NOT NULL,
    last_used_at timestamp with time zone,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    revoked_at timestamp with time zone,
    scopes jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    resource_action text NOT NULL,
    resource_id uuid,
    resource_type text NOT NULL,
    review_comment text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    submitted_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    body text DEFAULT ''::text NOT NULL,
    canonical text,
    category_id uuid,
    cover_image_url text,
    cover_media_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    excerpt text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    meta_description text,
    meta_title text,
    published_at timestamp with time zone,
    robots text DEFAULT ''::text NOT NULL,
    scheduled_for text,
    slug text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    title text NOT NULL,
    title_en text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    views bigint DEFAULT 0 NOT NULL
);


--
-- Name: auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_events (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_hash text,
    event text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_hash text,
    outcome text NOT NULL,
    user_agent text,
    user_id uuid
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    aal text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_hash text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: billing_dunning_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_dunning_attempts (
    channel text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    invoice_id uuid NOT NULL,
    merchant_id uuid NOT NULL,
    outcome text DEFAULT ''::text NOT NULL,
    stage bigint NOT NULL
);


--
-- Name: billing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_events (
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    description text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    logo_url text,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bundle_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bundle_items (
    bundle_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    quantity bigint DEFAULT 0 NOT NULL,
    variant_id uuid NOT NULL
);


--
-- Name: campaign_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_sends (
    campaign_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    error text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT ''::text NOT NULL,
    subscriber_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    body_template text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    failed_count bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    scheduled_for text,
    segment_id uuid,
    sent_at timestamp with time zone,
    sent_count bigint DEFAULT 0 NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: carrier_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carrier_shipments (
    address_line text,
    attempt_count bigint DEFAULT 0 NOT NULL,
    awb text,
    cancelled_at timestamp with time zone,
    carrier_code text NOT NULL,
    carrier_id uuid,
    city text,
    cod_amount_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    delivered_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_cod boolean DEFAULT false NOT NULL,
    last_event_at timestamp with time zone,
    merchant_id uuid NOT NULL,
    order_id uuid,
    pickup_slot_end text,
    pickup_slot_start text,
    pos_order_id uuid,
    pudo_point text,
    quote_id uuid,
    quote_stale boolean DEFAULT false NOT NULL,
    rate_minor_int bigint DEFAULT 0 NOT NULL,
    signature_text text,
    status public.shipment_status DEFAULT 'created'::public.shipment_status NOT NULL,
    tracking_token text DEFAULT ''::text NOT NULL,
    tracking_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    weight_grams bigint DEFAULT 0 NOT NULL,
    zone_id uuid
);


--
-- Name: carriers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carriers (
    adapter text DEFAULT ''::text NOT NULL,
    api_mode text DEFAULT ''::text NOT NULL,
    code text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cutoff_hour bigint DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    enabled boolean DEFAULT false NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    sort_order bigint DEFAULT 0 NOT NULL,
    supports_pickup boolean DEFAULT false NOT NULL,
    supports_pudo boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_secret text DEFAULT ''::text NOT NULL
);


--
-- Name: catalog_import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_import_jobs (
    applied_at timestamp with time zone,
    applied_summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    diff jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    file_name text DEFAULT ''::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    row_count bigint DEFAULT 0 NOT NULL,
    source_hash text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    description text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    slug text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: charge_intent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.charge_intent_events (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    from_status text DEFAULT ''::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    intent_id uuid NOT NULL,
    merchant_id uuid NOT NULL,
    to_status public.charge_intent_status NOT NULL
);


--
-- Name: charge_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.charge_intents (
    amount_minor_int bigint NOT NULL,
    attempt bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_code text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    merchant_id uuid NOT NULL,
    method public.payment_method NOT NULL,
    order_id uuid NOT NULL,
    provider_reference text,
    return_nonce text DEFAULT ''::text NOT NULL,
    settled_at timestamp with time zone,
    status public.charge_intent_status DEFAULT 'initiated'::public.charge_intent_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cod_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cod_settlements (
    carrier_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    expected_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    note text,
    order_id uuid,
    reference text,
    reported_minor_int bigint,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    shipment_id uuid NOT NULL,
    state public.cod_settlement_state NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collection_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_products (
    collection_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    "position" bigint DEFAULT 0 NOT NULL,
    product_id uuid NOT NULL
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    description text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text,
    is_published boolean DEFAULT false NOT NULL,
    is_smart boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    "position" bigint DEFAULT 0 NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    slug text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_events (
    actor text,
    channel public.consent_channel NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    granted boolean NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    purpose public.consent_purpose NOT NULL,
    reason text,
    source text NOT NULL,
    subject_hash text,
    subscriber_id uuid
);


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    coupon_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    customer_key text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    allow_combine boolean DEFAULT false NOT NULL,
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    batch_label text,
    buy_quantity bigint DEFAULT 0 NOT NULL,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    deleted_at timestamp with time zone,
    expires_at timestamp with time zone,
    get_quantity bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    max_discount_minor_int bigint,
    merchant_id uuid NOT NULL,
    min_subtotal_minor_int bigint DEFAULT 0 NOT NULL,
    one_per_order boolean DEFAULT false NOT NULL,
    per_customer_limit bigint,
    percent_off bigint DEFAULT 0 NOT NULL,
    priority bigint DEFAULT 0 NOT NULL,
    redeemed_count bigint DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    status public.coupon_status DEFAULT 'draft'::public.coupon_status NOT NULL,
    type public.coupon_type DEFAULT 'fixed'::public.coupon_type NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    usage_limit bigint
);


--
-- Name: courier_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_labels (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label_url text NOT NULL,
    merchant_id uuid NOT NULL,
    printable boolean DEFAULT false NOT NULL,
    shipment_id uuid NOT NULL
);


--
-- Name: courier_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier_webhook_events (
    attempts bigint DEFAULT 0 NOT NULL,
    carrier_code text NOT NULL,
    event_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    next_attempt_at timestamp with time zone,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    reason text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    shipment_id uuid,
    status public.courier_event_status NOT NULL
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    address_type public.address_type DEFAULT 'shipping'::public.address_type NOT NULL,
    city text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid NOT NULL,
    deleted_at timestamp with time zone,
    district text NOT NULL,
    full_name text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    line1 text NOT NULL,
    line2 text,
    merchant_id uuid NOT NULL,
    phone text NOT NULL,
    postcode text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_consents (
    channel public.consent_channel NOT NULL,
    customer_id uuid,
    granted boolean DEFAULT false NOT NULL,
    granted_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    purpose public.consent_purpose NOT NULL,
    session_token text,
    source text DEFAULT ''::text NOT NULL,
    subject_hash text,
    subscriber_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    withdrawn_at timestamp with time zone
);


--
-- Name: customer_wishlist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_wishlist_items (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    stock_alert boolean DEFAULT false NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    auth_uid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    email text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    locale text DEFAULT ''::text NOT NULL,
    merchant_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    phone text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_events (
    carrier_event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    shipment_id uuid NOT NULL,
    source text DEFAULT ''::text NOT NULL
);


--
-- Name: digital_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_assets (
    content_type text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    expiry_hours bigint DEFAULT 0 NOT NULL,
    file_name text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    max_downloads bigint DEFAULT 0 NOT NULL,
    merchant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    storage_path text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid
);


--
-- Name: digital_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_grants (
    asset_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    downloads_used bigint DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    last_download_at timestamp with time zone,
    max_downloads bigint DEFAULT 0 NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    revoked_at timestamp with time zone,
    token_hash text NOT NULL
);


--
-- Name: dispute_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_events (
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dispute_id uuid NOT NULL,
    from_status public.dispute_status,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    note text,
    to_status public.dispute_status NOT NULL
);


--
-- Name: disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disputes (
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    due_at timestamp with time zone,
    evidence text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    provider text,
    provider_reference text,
    reason text NOT NULL,
    reference text NOT NULL,
    resolved_at timestamp with time zone,
    status public.dispute_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: export_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_jobs (
    attempts bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    downloaded_at timestamp with time zone,
    error text,
    expires_at timestamp with time zone,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    finished_at timestamp with time zone,
    format text DEFAULT ''::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    object_type public.export_object_type NOT NULL,
    range_end text,
    range_start text,
    requested_by uuid,
    schema_version bigint DEFAULT 0 NOT NULL,
    signed_url text,
    signed_url_expires_at timestamp with time zone,
    size_bytes bigint DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    status public.export_job_status DEFAULT 'queued'::public.export_job_status NOT NULL,
    storage_path text,
    total_rows bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: form_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_submissions (
    consent_granted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    form_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT ''::text NOT NULL
);


--
-- Name: fraud_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_assessments (
    action text DEFAULT ''::text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decisive_code text,
    engine_version bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    score bigint DEFAULT 0 NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    subject_hash text NOT NULL
);


--
-- Name: fraud_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_audit (
    action text NOT NULL,
    actor text,
    case_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: fraud_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_blacklist (
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.fraud_blacklist_kind NOT NULL,
    merchant_id uuid NOT NULL,
    reason text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    value text NOT NULL
);


--
-- Name: fraud_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_cases (
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    customer_phone text DEFAULT ''::text NOT NULL,
    decision_at timestamp with time zone,
    decision_by uuid,
    decision_note text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    order_number text DEFAULT ''::text NOT NULL,
    reason jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_score numeric DEFAULT 0 NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.fraud_case_status DEFAULT 'open'::public.fraud_case_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fraud_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_rules (
    action text DEFAULT ''::text NOT NULL,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    enabled boolean DEFAULT false NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    precedence bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fulfilment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fulfilment_items (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fulfilment_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity bigint NOT NULL
);


--
-- Name: fulfilments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fulfilments (
    carrier_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    delivered_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    location_id uuid,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    reference text NOT NULL,
    shipped_at timestamp with time zone,
    status public.fulfilment_status NOT NULL,
    tracking_number text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fx_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rates (
    base_currency text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_currency text NOT NULL,
    rate_ppm bigint NOT NULL,
    source text NOT NULL
);


--
-- Name: gateway_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_accounts (
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    provider text NOT NULL,
    sandbox boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_secret text NOT NULL
);


--
-- Name: gift_card_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_card_entries (
    actor text,
    amount_minor_int bigint NOT NULL,
    balance_after_minor_int bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    gift_card_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    kind text NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid
);


--
-- Name: gift_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_cards (
    balance_minor_int bigint NOT NULL,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    expires_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    initial_minor_int bigint NOT NULL,
    issued_by uuid,
    merchant_id uuid NOT NULL,
    recipient_email text,
    recipient_phone text,
    status public.gift_card_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: impersonation_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impersonation_grants (
    consent_at timestamp with time zone,
    consent_by uuid,
    expires_at timestamp with time zone NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    last_used_at timestamp with time zone,
    merchant_id uuid NOT NULL,
    reason text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_by uuid NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    scope text DEFAULT ''::text NOT NULL,
    use_count bigint DEFAULT 0 NOT NULL
);


--
-- Name: inventory_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_levels (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    low_stock_threshold bigint,
    merchant_id uuid NOT NULL,
    on_hand bigint DEFAULT 0 NOT NULL,
    reserved bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid NOT NULL
);


--
-- Name: inventory_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_locations (
    active boolean DEFAULT false NOT NULL,
    address_line text,
    city text,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transfer_items (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    quantity bigint NOT NULL,
    transfer_id uuid NOT NULL,
    variant_id uuid NOT NULL
);


--
-- Name: inventory_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transfers (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    from_location_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    note text,
    received_at timestamp with time zone,
    reference text NOT NULL,
    status public.transfer_status NOT NULL,
    to_location_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    invoice_number text NOT NULL,
    merchant_id uuid NOT NULL,
    paid_at timestamp with time zone,
    period_end text NOT NULL,
    period_start text NOT NULL,
    plan public.billing_plan NOT NULL,
    status public.invoice_status DEFAULT 'open'::public.invoice_status NOT NULL,
    subtotal_minor_int bigint DEFAULT 0 NOT NULL,
    total_minor_int bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vat_minor_int bigint DEFAULT 0 NOT NULL,
    vat_rate_basis_points bigint DEFAULT 0 NOT NULL
);


--
-- Name: local_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_transactions (
    attempts bigint DEFAULT 0 NOT NULL,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    error text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.sync_status DEFAULT 'pending'::public.sync_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_installs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_installs (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    expires_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    is_trial boolean DEFAULT false NOT NULL,
    kind public.market_kind NOT NULL,
    listing_name text DEFAULT ''::text NOT NULL,
    listing_slug text DEFAULT ''::text NOT NULL,
    merchant_id uuid NOT NULL,
    previous_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    price_minor_int bigint DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.market_install_status DEFAULT 'installed'::public.market_install_status NOT NULL,
    theme_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version text DEFAULT ''::text NOT NULL,
    widget_id uuid
);


--
-- Name: marketplace_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_reviews (
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    install_id uuid NOT NULL,
    merchant_id uuid NOT NULL,
    moderation_status text DEFAULT ''::text NOT NULL,
    rating bigint NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_themes (
    category text DEFAULT ''::text NOT NULL,
    compatible_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    description text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    install_count bigint DEFAULT 0 NOT NULL,
    manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
    name text NOT NULL,
    price_minor_int bigint DEFAULT 0 NOT NULL,
    rating_count bigint DEFAULT 0 NOT NULL,
    rating_sum bigint DEFAULT 0 NOT NULL,
    seller_merchant_id uuid NOT NULL,
    slug text NOT NULL,
    status public.market_listing_status DEFAULT 'draft'::public.market_listing_status NOT NULL,
    thumbnail_url text,
    trial_allowed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_name text DEFAULT ''::text NOT NULL,
    version text DEFAULT ''::text NOT NULL,
    version_history jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: marketplace_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_widgets (
    category text DEFAULT ''::text NOT NULL,
    compatible_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    description text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    install_count bigint DEFAULT 0 NOT NULL,
    manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
    name text NOT NULL,
    price_minor_int bigint DEFAULT 0 NOT NULL,
    rating_count bigint DEFAULT 0 NOT NULL,
    rating_sum bigint DEFAULT 0 NOT NULL,
    registry_id uuid NOT NULL,
    seller_merchant_id uuid NOT NULL,
    slug text NOT NULL,
    status public.market_listing_status DEFAULT 'draft'::public.market_listing_status NOT NULL,
    thumbnail_url text,
    trial_allowed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_name text DEFAULT ''::text NOT NULL,
    version text DEFAULT ''::text NOT NULL,
    version_history jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    alt_text text,
    content_type text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    file_name text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    storage_path text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    url text NOT NULL
);


--
-- Name: merchant_kyc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_kyc (
    bin_no text,
    contact_phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_paths jsonb DEFAULT '{}'::jsonb NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legal_name text,
    merchant_id uuid NOT NULL,
    rejection_reason text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    state public.kyc_state DEFAULT 'pending'::public.kyc_state NOT NULL,
    submitted_at timestamp with time zone,
    trade_license_no text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: merchant_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_members (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invited_by uuid,
    last_login_at timestamp with time zone,
    merchant_id uuid NOT NULL,
    mfa_status public.staff_mfa_status DEFAULT 'none'::public.staff_mfa_status NOT NULL,
    role public.merchant_role DEFAULT 'owner'::public.merchant_role NOT NULL,
    role_id uuid,
    status public.staff_status DEFAULT 'invited'::public.staff_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: merchant_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_settings (
    business_bin text,
    cod_enabled boolean DEFAULT false NOT NULL,
    cod_surcharge_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    free_shipping_threshold_minor_int bigint,
    low_stock_threshold bigint DEFAULT 0 NOT NULL,
    merchant_id uuid NOT NULL,
    mfs_enabled boolean DEFAULT false NOT NULL,
    notify_prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    prices_include_vat boolean DEFAULT false NOT NULL,
    setup_dismissed_at timestamp with time zone,
    setup_steps jsonb DEFAULT '{}'::jsonb NOT NULL,
    ship_address_line text,
    ship_city text,
    ship_postcode text,
    shipping_flat_minor_int bigint DEFAULT 0 NOT NULL,
    support_email text,
    support_phone text,
    tagline text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: merchant_suspensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_suspensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    payments_frozen boolean DEFAULT false NOT NULL,
    reason text NOT NULL,
    reinstate_note text,
    reinstated_at timestamp with time zone,
    reinstated_by uuid,
    suspended_at timestamp with time zone DEFAULT now() NOT NULL,
    suspended_by uuid NOT NULL
);


--
-- Name: merchants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchants (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kyc_status public.kyc_status DEFAULT 'pending'::public.kyc_status NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status public.merchant_status DEFAULT 'active'::public.merchant_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vat_registration_no text
);


--
-- Name: metafield_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metafield_definitions (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    merchant_id uuid NOT NULL,
    namespace text DEFAULT ''::text NOT NULL,
    owner_type text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    validation jsonb DEFAULT '{}'::jsonb NOT NULL,
    value_type text DEFAULT ''::text NOT NULL
);


--
-- Name: metafields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metafields (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    merchant_id uuid NOT NULL,
    namespace text DEFAULT ''::text NOT NULL,
    owner_id uuid,
    owner_type text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    value_type text DEFAULT ''::text NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    archived_at timestamp with time zone,
    body_bn text DEFAULT ''::text NOT NULL,
    body_en text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dedupe_key text,
    entity_id uuid,
    href text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    merchant_id uuid NOT NULL,
    read_at timestamp with time zone,
    read_by uuid,
    severity public.notification_severity DEFAULT 'info'::public.notification_severity NOT NULL,
    title_bn text NOT NULL,
    title_en text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ops_backup_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_backup_runs (
    artifact_ref text,
    checks jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    finished_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    notes text,
    rows_verified bigint DEFAULT 0 NOT NULL,
    scope text DEFAULT ''::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT ''::text NOT NULL
);


--
-- Name: ops_incident_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_incident_updates (
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incident_id uuid NOT NULL,
    status text NOT NULL
);


--
-- Name: ops_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_incidents (
    components text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    severity text DEFAULT ''::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ops_retention_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_retention_runs (
    cutoff text NOT NULL,
    deleted_rows bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    table_name text NOT NULL
);


--
-- Name: ops_status_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_status_components (
    key text NOT NULL,
    label text NOT NULL,
    "position" bigint DEFAULT 0 NOT NULL,
    state text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_amendments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_amendments (
    actor_id uuid,
    after_totals jsonb NOT NULL,
    before_totals jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text NOT NULL,
    delta_minor_int bigint NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    reason text NOT NULL
);


--
-- Name: order_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_events (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    note text,
    order_id uuid NOT NULL
);


--
-- Name: order_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_invoices (
    business_bin text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    discount_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    sequence_no bigint NOT NULL,
    sequence_year bigint NOT NULL,
    shipping_minor_int bigint DEFAULT 0 NOT NULL,
    subtotal_minor_int bigint NOT NULL,
    total_minor_int bigint NOT NULL,
    vat_minor_int bigint DEFAULT 0 NOT NULL,
    vat_rate_basis_points bigint DEFAULT 0 NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    line_total_minor_int bigint NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    product_title text NOT NULL,
    quantity bigint NOT NULL,
    sku text,
    unit_price_minor_int bigint NOT NULL,
    variant_id uuid,
    variant_name text DEFAULT ''::text NOT NULL
);


--
-- Name: order_status_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_transitions (
    from_status public.order_status NOT NULL,
    to_status public.order_status NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    access_token text DEFAULT ''::text NOT NULL,
    address_line text NOT NULL,
    city text NOT NULL,
    cod_surcharge_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    customer_email text,
    customer_id uuid,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    discount_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text,
    merchant_id uuid NOT NULL,
    note text,
    order_number text NOT NULL,
    payment_method public.payment_method DEFAULT 'cod'::public.payment_method NOT NULL,
    postcode text,
    shipping_minor_int bigint DEFAULT 0 NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    subtotal_minor_int bigint DEFAULT 0 NOT NULL,
    total_minor_int bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vat_minor_int bigint DEFAULT 0 NOT NULL,
    vat_rate_basis_points bigint DEFAULT 0 NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    payment_provider text NOT NULL,
    payment_status text DEFAULT ''::text NOT NULL,
    provider_reference text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plan_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_definitions (
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    payment_methods_allowed jsonb DEFAULT '{}'::jsonb NOT NULL,
    plan public.billing_plan NOT NULL,
    price_minor_int bigint,
    products_limit bigint DEFAULT 0 NOT NULL,
    sort_order bigint DEFAULT 0 NOT NULL,
    staff_limit bigint DEFAULT 0 NOT NULL,
    title_bn text NOT NULL,
    title_en text NOT NULL,
    trial_days bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: platform_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_audit_log (
    action text NOT NULL,
    actor text,
    after_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    before_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text DEFAULT ''::text NOT NULL
);


--
-- Name: platform_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_flags (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    value jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: pos_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_orders (
    address_line text,
    auth_code text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    city text,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    customer_name text,
    customer_phone text,
    discount_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    items jsonb DEFAULT '{}'::jsonb NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    origin public.pos_origin DEFAULT 'offline'::public.pos_origin NOT NULL,
    payment_method public.pos_payment_method DEFAULT 'cash'::public.pos_payment_method NOT NULL,
    session_id uuid,
    status public.pos_order_status DEFAULT 'local_pending'::public.pos_order_status NOT NULL,
    subtotal_minor_int bigint DEFAULT 0 NOT NULL,
    total_minor_int bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_payments (
    amount_minor_int bigint NOT NULL,
    auth_code text,
    change_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    method public.pos_payment_method NOT NULL,
    pos_order_id uuid NOT NULL,
    tendered_minor_int bigint DEFAULT 0 NOT NULL
);


--
-- Name: pos_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_refunds (
    amount_minor_int bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    lines jsonb DEFAULT '{}'::jsonb NOT NULL,
    merchant_id uuid NOT NULL,
    method public.pos_payment_method NOT NULL,
    pos_order_id uuid NOT NULL,
    reason text,
    restock boolean DEFAULT false NOT NULL,
    session_id uuid,
    staff_user_id uuid
);


--
-- Name: pos_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sessions (
    actual_cash_minor_int bigint,
    close_time text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    expected_cash_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    note text,
    open_time text DEFAULT ''::text NOT NULL,
    shift_date date NOT NULL,
    shift_totals jsonb DEFAULT '{}'::jsonb NOT NULL,
    staff_user_id uuid NOT NULL,
    starting_cash_minor_int bigint DEFAULT 0 NOT NULL,
    status public.pos_session_status DEFAULT 'open'::public.pos_session_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variance_minor_int bigint
);


--
-- Name: product_bundles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_bundles (
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    fixed_price_minor_int bigint,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    percent_off bigint DEFAULT 0 NOT NULL,
    pricing_mode text DEFAULT ''::text NOT NULL,
    product_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    author_name text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    moderation_note text,
    product_id uuid NOT NULL,
    published_at timestamp with time zone,
    rating bigint NOT NULL,
    status public.review_status DEFAULT 'pending'::public.review_status NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_purchase boolean DEFAULT false NOT NULL
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    barcode text,
    compare_at_amount_minor_int bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    "position" bigint DEFAULT 0 NOT NULL,
    price_amount_minor_int bigint DEFAULT 0 NOT NULL,
    product_id uuid NOT NULL,
    sku text,
    stock_quantity bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    brand_id uuid,
    category_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    description text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text,
    merchant_id uuid NOT NULL,
    product_kind public.product_kind DEFAULT 'physical'::public.product_kind NOT NULL,
    requires_shipping boolean DEFAULT false NOT NULL,
    search_doc text DEFAULT ''::text NOT NULL,
    slug text NOT NULL,
    status public.catalog_status DEFAULT 'draft'::public.catalog_status NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    tax_category text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    full_name text,
    id uuid NOT NULL,
    phone text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_counters (
    bucket text NOT NULL,
    hits bigint DEFAULT 0 NOT NULL,
    subject text NOT NULL,
    window_start text NOT NULL
);


--
-- Name: refund_status_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_status_transitions (
    from_status text NOT NULL,
    to_status text NOT NULL
);


--
-- Name: return_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_events (
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    from_status public.return_status,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    reason text,
    return_id uuid NOT NULL,
    to_status public.return_status NOT NULL
);


--
-- Name: return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_items (
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity bigint NOT NULL,
    restock boolean DEFAULT false NOT NULL,
    return_id uuid NOT NULL
);


--
-- Name: return_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_requests (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    customer_note text,
    decided_at timestamp with time zone,
    decided_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    reason text NOT NULL,
    reference text NOT NULL,
    refund_id uuid,
    refund_minor_int bigint DEFAULT 0 NOT NULL,
    staff_note text,
    status public.return_status NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: review_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_replies (
    body text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    review_id uuid NOT NULL,
    staff_user_id uuid NOT NULL
);


--
-- Name: segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.segments (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    rule_field text DEFAULT ''::text NOT NULL,
    rule_operator text DEFAULT ''::text NOT NULL,
    rule_value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seo_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seo_meta (
    canonical text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_id uuid,
    entity_type public.seo_entity_type NOT NULL,
    faq jsonb DEFAULT '{}'::jsonb NOT NULL,
    focus_keyword text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    meta_description text,
    meta_title text,
    og_image_url text,
    robots_follow boolean DEFAULT false NOT NULL,
    robots_index boolean DEFAULT false NOT NULL,
    schema_type text,
    score bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: seo_meta_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seo_meta_audit (
    actor text,
    after jsonb,
    before jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_id uuid,
    entity_type public.seo_entity_type NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    reason text
);


--
-- Name: service_offerings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_offerings (
    advance_booking_days bigint DEFAULT 0 NOT NULL,
    buffer_minutes bigint DEFAULT 0 NOT NULL,
    cancellation_hours bigint DEFAULT 0 NOT NULL,
    capacity_per_slot bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_minutes bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_kind text DEFAULT ''::text NOT NULL,
    merchant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: settlement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_items (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    fee_minor_int bigint DEFAULT 0 NOT NULL,
    file_id uuid NOT NULL,
    gross_minor_int bigint NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_kind text DEFAULT ''::text NOT NULL,
    merchant_id uuid NOT NULL,
    net_minor_int bigint NOT NULL,
    order_id uuid,
    payment_id uuid,
    posted boolean DEFAULT false NOT NULL,
    settlement_ref text NOT NULL
);


--
-- Name: settlement_variance_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settlement_variance_alerts (
    actual_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expected_minor_int bigint DEFAULT 0 NOT NULL,
    file_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid,
    kind text NOT NULL,
    merchant_id uuid NOT NULL,
    resolution_note text,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid
);


--
-- Name: shipment_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_quotes (
    amount_minor_int bigint DEFAULT 0 NOT NULL,
    breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    carrier_code text NOT NULL,
    cod_fee_minor_int bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    rule_id uuid,
    stale boolean DEFAULT false NOT NULL,
    weight_grams bigint DEFAULT 0 NOT NULL,
    zone_id uuid
);


--
-- Name: shipping_rate_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_rate_rules (
    base_minor_int bigint DEFAULT 0 NOT NULL,
    carrier_code text,
    cod_fee_bp bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    free_over_minor_int bigint,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    max_weight_grams bigint DEFAULT 0 NOT NULL,
    merchant_id uuid NOT NULL,
    min_weight_grams bigint DEFAULT 0 NOT NULL,
    per_kg_minor_int bigint DEFAULT 0 NOT NULL,
    priority bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    zone_id uuid NOT NULL
);


--
-- Name: shipping_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_zones (
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    districts text[] DEFAULT '{}'::text[] NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    name_bn text DEFAULT ''::text NOT NULL,
    name_en text NOT NULL,
    priority bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_audit (
    action text NOT NULL,
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id bigint NOT NULL,
    member_id uuid,
    merchant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: staff_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.staff_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.staff_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_roles (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    grants jsonb DEFAULT '{}'::jsonb NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_fixed boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: step_up_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.step_up_grants (
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    method text NOT NULL,
    used_at timestamp with time zone,
    user_id uuid NOT NULL
);


--
-- Name: stock_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_holds (
    checkout_token text NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    order_id uuid,
    quantity bigint NOT NULL,
    released_at timestamp with time zone,
    variant_id uuid NOT NULL
);


--
-- Name: store_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_themes (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    published_version_id uuid,
    source_install_id uuid,
    source_listing_id uuid,
    source_listing_slug text,
    source_version text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: storefront_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storefront_forms (
    consent_purpose public.consent_purpose DEFAULT 'marketing'::public.consent_purpose NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    description text,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    requires_consent boolean DEFAULT false NOT NULL,
    slug text NOT NULL,
    success_message text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: storefront_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storefront_pages (
    body_markdown text DEFAULT ''::text NOT NULL,
    cover_image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    excerpt text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    merchant_id uuid NOT NULL,
    meta_description text,
    meta_title text,
    "position" bigint DEFAULT 0 NOT NULL,
    published_at timestamp with time zone,
    robots text DEFAULT ''::text NOT NULL,
    show_in_nav boolean DEFAULT false NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscribers (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    email_consent boolean DEFAULT false NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    phone text,
    sms_consent boolean DEFAULT false NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    unsubscribe_token text DEFAULT ''::text NOT NULL,
    unsubscribed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_terms (
    billing_anchor_day bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    interval_count bigint DEFAULT 0 NOT NULL,
    interval_unit text DEFAULT ''::text NOT NULL,
    merchant_id uuid NOT NULL,
    minimum_cycles bigint DEFAULT 0 NOT NULL,
    trial_days bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    current_period_start text DEFAULT ''::text NOT NULL,
    dunning_stage bigint DEFAULT 0 NOT NULL,
    grace_until text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    next_billing_at timestamp with time zone,
    past_due_since text,
    paused_at timestamp with time zone,
    plan public.billing_plan DEFAULT 'launch'::public.billing_plan NOT NULL,
    scheduled_plan public.billing_plan,
    scheduled_plan_at timestamp with time zone,
    status public.subscription_status DEFAULT 'trial'::public.subscription_status NOT NULL,
    trial_ends_at timestamp with time zone,
    trial_fingerprint text,
    trial_started_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_limits (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_id uuid NOT NULL,
    products_limit bigint DEFAULT 0 NOT NULL,
    staff_limit bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_purge_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_purge_requests (
    decided_at timestamp with time zone,
    decided_by uuid,
    failure text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    reason text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_by uuid NOT NULL,
    row_counts jsonb,
    scheduled_for text DEFAULT ''::text NOT NULL,
    status text DEFAULT ''::text NOT NULL
);


--
-- Name: theme_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_audit (
    action text NOT NULL,
    actor text,
    after jsonb,
    before jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    theme_id uuid
);


--
-- Name: theme_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_drafts (
    merchant_id uuid NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    templates jsonb DEFAULT '{}'::jsonb NOT NULL,
    theme_id uuid NOT NULL,
    tokens jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: theme_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_registry (
    active boolean DEFAULT false NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    key text NOT NULL,
    name_bn text NOT NULL,
    name_en text NOT NULL,
    preset jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order bigint DEFAULT 0 NOT NULL,
    summary_bn text DEFAULT ''::text NOT NULL,
    summary_en text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version text DEFAULT ''::text NOT NULL
);


--
-- Name: theme_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_schedules (
    action text NOT NULL,
    attempts bigint DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    last_error text,
    merchant_id uuid NOT NULL,
    run_at timestamp with time zone NOT NULL,
    state text DEFAULT ''::text NOT NULL,
    theme_id uuid NOT NULL,
    version_id uuid
);


--
-- Name: theme_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_versions (
    ast jsonb DEFAULT '{}'::jsonb NOT NULL,
    checksum text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text,
    merchant_id uuid NOT NULL,
    note text,
    published_at timestamp with time zone,
    rollback_of text,
    source_registry_key text,
    source_registry_version text,
    status text DEFAULT ''::text NOT NULL,
    templates jsonb DEFAULT '{}'::jsonb NOT NULL,
    theme_id uuid NOT NULL,
    tokens jsonb DEFAULT '{}'::jsonb NOT NULL,
    version bigint NOT NULL
);


--
-- Name: trial_fingerprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_fingerprints (
    blocked boolean DEFAULT false NOT NULL,
    fingerprint text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_count bigint DEFAULT 0 NOT NULL
);


--
-- Name: vat_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_rates (
    category text DEFAULT ''::text NOT NULL,
    country_code text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_year bigint NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rate_basis_points bigint NOT NULL
);


--
-- Name: wallet_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger_entries (
    counterparty_merchant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    direction text NOT NULL,
    gross_minor_int bigint DEFAULT 0 NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    memo text,
    merchant_id uuid NOT NULL,
    platform_minor_int bigint DEFAULT 0 NOT NULL,
    reference_id uuid,
    seller_minor_int bigint DEFAULT 0 NOT NULL,
    source text NOT NULL
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    amount_minor_int bigint,
    attempt bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency_code text DEFAULT 'BDT'::text NOT NULL,
    event_type text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    order_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    processed_at timestamp with time zone,
    provider text NOT NULL,
    reason text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    redelivery_count bigint DEFAULT 0 NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_id uuid NOT NULL
);


--
-- Name: abandoned_carts abandoned_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: api_key_events api_key_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_events
    ADD CONSTRAINT api_key_events_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: auth_events auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: billing_dunning_attempts billing_dunning_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_dunning_attempts
    ADD CONSTRAINT billing_dunning_attempts_pkey PRIMARY KEY (id);


--
-- Name: billing_events billing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: bundle_items bundle_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bundle_items
    ADD CONSTRAINT bundle_items_pkey PRIMARY KEY (id);


--
-- Name: campaign_sends campaign_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sends
    ADD CONSTRAINT campaign_sends_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: carrier_shipments carrier_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_pkey PRIMARY KEY (id);


--
-- Name: carriers carriers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carriers
    ADD CONSTRAINT carriers_pkey PRIMARY KEY (id);


--
-- Name: catalog_import_jobs catalog_import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_import_jobs
    ADD CONSTRAINT catalog_import_jobs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: charge_intent_events charge_intent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_intent_events
    ADD CONSTRAINT charge_intent_events_pkey PRIMARY KEY (id);


--
-- Name: charge_intents charge_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_intents
    ADD CONSTRAINT charge_intents_pkey PRIMARY KEY (id);


--
-- Name: cod_reconciliations cod_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_reconciliations
    ADD CONSTRAINT cod_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: cod_settlements cod_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_settlements
    ADD CONSTRAINT cod_settlements_pkey PRIMARY KEY (id);


--
-- Name: collection_products collection_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_pkey PRIMARY KEY (id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: consent_events consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_pkey PRIMARY KEY (id);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: courier_labels courier_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_labels
    ADD CONSTRAINT courier_labels_pkey PRIMARY KEY (id);


--
-- Name: courier_webhook_events courier_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_webhook_events
    ADD CONSTRAINT courier_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: customer_consents customer_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consents
    ADD CONSTRAINT customer_consents_pkey PRIMARY KEY (id);


--
-- Name: customer_wishlist_items customer_wishlist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_wishlist_items
    ADD CONSTRAINT customer_wishlist_items_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: delivery_events delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_events
    ADD CONSTRAINT delivery_events_pkey PRIMARY KEY (id);


--
-- Name: digital_assets digital_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets
    ADD CONSTRAINT digital_assets_pkey PRIMARY KEY (id);


--
-- Name: digital_grants digital_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_grants
    ADD CONSTRAINT digital_grants_pkey PRIMARY KEY (id);


--
-- Name: dispute_events dispute_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_events
    ADD CONSTRAINT dispute_events_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: export_jobs export_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_jobs
    ADD CONSTRAINT export_jobs_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);


--
-- Name: fraud_assessments fraud_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_assessments
    ADD CONSTRAINT fraud_assessments_pkey PRIMARY KEY (id);


--
-- Name: fraud_audit fraud_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_audit
    ADD CONSTRAINT fraud_audit_pkey PRIMARY KEY (id);


--
-- Name: fraud_blacklist fraud_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_blacklist
    ADD CONSTRAINT fraud_blacklist_pkey PRIMARY KEY (id);


--
-- Name: fraud_cases fraud_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_cases
    ADD CONSTRAINT fraud_cases_pkey PRIMARY KEY (id);


--
-- Name: fraud_rules fraud_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_rules
    ADD CONSTRAINT fraud_rules_pkey PRIMARY KEY (id);


--
-- Name: fulfilment_items fulfilment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilment_items
    ADD CONSTRAINT fulfilment_items_pkey PRIMARY KEY (id);


--
-- Name: fulfilments fulfilments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilments
    ADD CONSTRAINT fulfilments_pkey PRIMARY KEY (id);


--
-- Name: fx_rates fx_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT fx_rates_pkey PRIMARY KEY (id);


--
-- Name: gateway_accounts gateway_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_accounts
    ADD CONSTRAINT gateway_accounts_pkey PRIMARY KEY (id);


--
-- Name: gift_card_entries gift_card_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_entries
    ADD CONSTRAINT gift_card_entries_pkey PRIMARY KEY (id);


--
-- Name: gift_cards gift_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);


--
-- Name: impersonation_grants impersonation_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_grants
    ADD CONSTRAINT impersonation_grants_pkey PRIMARY KEY (id);


--
-- Name: inventory_levels inventory_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_pkey PRIMARY KEY (id);


--
-- Name: inventory_locations inventory_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_pkey PRIMARY KEY (id);


--
-- Name: inventory_transfer_items inventory_transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_transfers inventory_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: local_transactions local_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_transactions
    ADD CONSTRAINT local_transactions_pkey PRIMARY KEY (id);


--
-- Name: marketplace_installs marketplace_installs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_installs
    ADD CONSTRAINT marketplace_installs_pkey PRIMARY KEY (id);


--
-- Name: marketplace_reviews marketplace_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_pkey PRIMARY KEY (id);


--
-- Name: marketplace_themes marketplace_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_themes
    ADD CONSTRAINT marketplace_themes_pkey PRIMARY KEY (id);


--
-- Name: marketplace_widgets marketplace_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_widgets
    ADD CONSTRAINT marketplace_widgets_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: merchant_kyc merchant_kyc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_kyc
    ADD CONSTRAINT merchant_kyc_pkey PRIMARY KEY (id);


--
-- Name: merchant_members merchant_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_pkey PRIMARY KEY (id);


--
-- Name: merchant_suspensions merchant_suspensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_suspensions
    ADD CONSTRAINT merchant_suspensions_pkey PRIMARY KEY (id);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: metafield_definitions metafield_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metafield_definitions
    ADD CONSTRAINT metafield_definitions_pkey PRIMARY KEY (id);


--
-- Name: metafields metafields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metafields
    ADD CONSTRAINT metafields_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: ops_backup_runs ops_backup_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_backup_runs
    ADD CONSTRAINT ops_backup_runs_pkey PRIMARY KEY (id);


--
-- Name: ops_incident_updates ops_incident_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_incident_updates
    ADD CONSTRAINT ops_incident_updates_pkey PRIMARY KEY (id);


--
-- Name: ops_incidents ops_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_incidents
    ADD CONSTRAINT ops_incidents_pkey PRIMARY KEY (id);


--
-- Name: ops_retention_runs ops_retention_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_retention_runs
    ADD CONSTRAINT ops_retention_runs_pkey PRIMARY KEY (id);


--
-- Name: order_amendments order_amendments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_amendments
    ADD CONSTRAINT order_amendments_pkey PRIMARY KEY (id);


--
-- Name: order_events order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_pkey PRIMARY KEY (id);


--
-- Name: order_invoices order_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_invoices
    ADD CONSTRAINT order_invoices_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: platform_audit_log platform_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_log
    ADD CONSTRAINT platform_audit_log_pkey PRIMARY KEY (id);


--
-- Name: pos_orders pos_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_orders
    ADD CONSTRAINT pos_orders_pkey PRIMARY KEY (id);


--
-- Name: pos_payments pos_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_payments
    ADD CONSTRAINT pos_payments_pkey PRIMARY KEY (id);


--
-- Name: pos_refunds pos_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds
    ADD CONSTRAINT pos_refunds_pkey PRIMARY KEY (id);


--
-- Name: pos_sessions pos_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_pkey PRIMARY KEY (id);


--
-- Name: product_bundles product_bundles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bundles
    ADD CONSTRAINT product_bundles_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: return_events return_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_events
    ADD CONSTRAINT return_events_pkey PRIMARY KEY (id);


--
-- Name: return_items return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_pkey PRIMARY KEY (id);


--
-- Name: return_requests return_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_pkey PRIMARY KEY (id);


--
-- Name: review_replies review_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_pkey PRIMARY KEY (id);


--
-- Name: segments segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_pkey PRIMARY KEY (id);


--
-- Name: seo_meta_audit seo_meta_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seo_meta_audit
    ADD CONSTRAINT seo_meta_audit_pkey PRIMARY KEY (id);


--
-- Name: seo_meta seo_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seo_meta
    ADD CONSTRAINT seo_meta_pkey PRIMARY KEY (id);


--
-- Name: service_offerings service_offerings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offerings
    ADD CONSTRAINT service_offerings_pkey PRIMARY KEY (id);


--
-- Name: settlement_files settlement_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_files
    ADD CONSTRAINT settlement_files_pkey PRIMARY KEY (id);


--
-- Name: settlement_items settlement_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT settlement_items_pkey PRIMARY KEY (id);


--
-- Name: settlement_variance_alerts settlement_variance_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_variance_alerts
    ADD CONSTRAINT settlement_variance_alerts_pkey PRIMARY KEY (id);


--
-- Name: shipment_quotes shipment_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_quotes
    ADD CONSTRAINT shipment_quotes_pkey PRIMARY KEY (id);


--
-- Name: shipping_rate_rules shipping_rate_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_rate_rules
    ADD CONSTRAINT shipping_rate_rules_pkey PRIMARY KEY (id);


--
-- Name: shipping_zones shipping_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_zones
    ADD CONSTRAINT shipping_zones_pkey PRIMARY KEY (id);


--
-- Name: staff_audit staff_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_audit
    ADD CONSTRAINT staff_audit_pkey PRIMARY KEY (id);


--
-- Name: staff_roles staff_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_roles
    ADD CONSTRAINT staff_roles_pkey PRIMARY KEY (id);


--
-- Name: step_up_grants step_up_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_up_grants
    ADD CONSTRAINT step_up_grants_pkey PRIMARY KEY (id);


--
-- Name: stock_holds stock_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holds
    ADD CONSTRAINT stock_holds_pkey PRIMARY KEY (id);


--
-- Name: store_themes store_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_themes
    ADD CONSTRAINT store_themes_pkey PRIMARY KEY (id);


--
-- Name: storefront_forms storefront_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storefront_forms
    ADD CONSTRAINT storefront_forms_pkey PRIMARY KEY (id);


--
-- Name: storefront_pages storefront_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storefront_pages
    ADD CONSTRAINT storefront_pages_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: subscription_terms subscription_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_terms
    ADD CONSTRAINT subscription_terms_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tenant_purge_requests tenant_purge_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_purge_requests
    ADD CONSTRAINT tenant_purge_requests_pkey PRIMARY KEY (id);


--
-- Name: theme_audit theme_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_audit
    ADD CONSTRAINT theme_audit_pkey PRIMARY KEY (id);


--
-- Name: theme_schedules theme_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_schedules
    ADD CONSTRAINT theme_schedules_pkey PRIMARY KEY (id);


--
-- Name: theme_versions theme_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_pkey PRIMARY KEY (id);


--
-- Name: vat_rates vat_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_rates
    ADD CONSTRAINT vat_rates_pkey PRIMARY KEY (id);


--
-- Name: wallet_ledger_entries wallet_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger_entries
    ADD CONSTRAINT wallet_ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: abandoned_carts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abandoned_carts_created_idx ON public.abandoned_carts USING btree (created_at DESC);


--
-- Name: abandoned_carts_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abandoned_carts_merchant_idx ON public.abandoned_carts USING btree (merchant_id);


--
-- Name: activity_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_created_idx ON public.activity_log USING btree (created_at DESC);


--
-- Name: activity_log_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_merchant_idx ON public.activity_log USING btree (merchant_id);


--
-- Name: ai_conversations_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_conversations_created_idx ON public.ai_conversations USING btree (created_at DESC);


--
-- Name: ai_conversations_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_conversations_merchant_idx ON public.ai_conversations USING btree (merchant_id);


--
-- Name: ai_messages_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_messages_created_idx ON public.ai_messages USING btree (created_at DESC);


--
-- Name: ai_messages_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_messages_merchant_idx ON public.ai_messages USING btree (merchant_id);


--
-- Name: api_key_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_key_events_created_idx ON public.api_key_events USING btree (created_at DESC);


--
-- Name: api_key_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_key_events_merchant_idx ON public.api_key_events USING btree (merchant_id);


--
-- Name: api_keys_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_created_idx ON public.api_keys USING btree (created_at DESC);


--
-- Name: api_keys_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_merchant_idx ON public.api_keys USING btree (merchant_id);


--
-- Name: approval_requests_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_created_idx ON public.approval_requests USING btree (created_at DESC);


--
-- Name: approval_requests_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_merchant_idx ON public.approval_requests USING btree (merchant_id);


--
-- Name: articles_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_created_idx ON public.articles USING btree (created_at DESC);


--
-- Name: articles_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX articles_merchant_idx ON public.articles USING btree (merchant_id);


--
-- Name: auth_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_events_created_idx ON public.auth_events USING btree (created_at DESC);


--
-- Name: auth_sessions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_sessions_created_idx ON public.auth_sessions USING btree (created_at DESC);


--
-- Name: billing_dunning_attempts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_dunning_attempts_created_idx ON public.billing_dunning_attempts USING btree (created_at DESC);


--
-- Name: billing_dunning_attempts_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_dunning_attempts_merchant_idx ON public.billing_dunning_attempts USING btree (merchant_id);


--
-- Name: billing_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_events_created_idx ON public.billing_events USING btree (created_at DESC);


--
-- Name: billing_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_events_merchant_idx ON public.billing_events USING btree (merchant_id);


--
-- Name: brands_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_created_idx ON public.brands USING btree (created_at DESC);


--
-- Name: brands_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_merchant_idx ON public.brands USING btree (merchant_id);


--
-- Name: bundle_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bundle_items_created_idx ON public.bundle_items USING btree (created_at DESC);


--
-- Name: bundle_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bundle_items_merchant_idx ON public.bundle_items USING btree (merchant_id);


--
-- Name: campaign_sends_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_sends_created_idx ON public.campaign_sends USING btree (created_at DESC);


--
-- Name: campaign_sends_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_sends_merchant_idx ON public.campaign_sends USING btree (merchant_id);


--
-- Name: campaigns_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_created_idx ON public.campaigns USING btree (created_at DESC);


--
-- Name: campaigns_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_merchant_idx ON public.campaigns USING btree (merchant_id);


--
-- Name: carrier_shipments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrier_shipments_created_idx ON public.carrier_shipments USING btree (created_at DESC);


--
-- Name: carrier_shipments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrier_shipments_merchant_idx ON public.carrier_shipments USING btree (merchant_id);


--
-- Name: carriers_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carriers_created_idx ON public.carriers USING btree (created_at DESC);


--
-- Name: carriers_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carriers_merchant_idx ON public.carriers USING btree (merchant_id);


--
-- Name: catalog_import_jobs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_import_jobs_created_idx ON public.catalog_import_jobs USING btree (created_at DESC);


--
-- Name: catalog_import_jobs_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_import_jobs_merchant_idx ON public.catalog_import_jobs USING btree (merchant_id);


--
-- Name: categories_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_created_idx ON public.categories USING btree (created_at DESC);


--
-- Name: categories_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_merchant_idx ON public.categories USING btree (merchant_id);


--
-- Name: charge_intent_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charge_intent_events_created_idx ON public.charge_intent_events USING btree (created_at DESC);


--
-- Name: charge_intent_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charge_intent_events_merchant_idx ON public.charge_intent_events USING btree (merchant_id);


--
-- Name: charge_intents_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charge_intents_created_idx ON public.charge_intents USING btree (created_at DESC);


--
-- Name: charge_intents_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charge_intents_merchant_idx ON public.charge_intents USING btree (merchant_id);


--
-- Name: cod_reconciliations_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cod_reconciliations_created_idx ON public.cod_reconciliations USING btree (created_at DESC);


--
-- Name: cod_reconciliations_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cod_reconciliations_merchant_idx ON public.cod_reconciliations USING btree (merchant_id);


--
-- Name: cod_reconciliations_order_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cod_reconciliations_order_uidx ON public.cod_reconciliations USING btree (order_id);


--
-- Name: cod_settlements_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cod_settlements_created_idx ON public.cod_settlements USING btree (created_at DESC);


--
-- Name: cod_settlements_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cod_settlements_merchant_idx ON public.cod_settlements USING btree (merchant_id);


--
-- Name: collection_products_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_products_created_idx ON public.collection_products USING btree (created_at DESC);


--
-- Name: collection_products_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_products_merchant_idx ON public.collection_products USING btree (merchant_id);


--
-- Name: collections_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_created_idx ON public.collections USING btree (created_at DESC);


--
-- Name: collections_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_merchant_idx ON public.collections USING btree (merchant_id);


--
-- Name: consent_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consent_events_created_idx ON public.consent_events USING btree (created_at DESC);


--
-- Name: consent_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consent_events_merchant_idx ON public.consent_events USING btree (merchant_id);


--
-- Name: coupon_redemptions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupon_redemptions_created_idx ON public.coupon_redemptions USING btree (created_at DESC);


--
-- Name: coupon_redemptions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupon_redemptions_merchant_idx ON public.coupon_redemptions USING btree (merchant_id);


--
-- Name: coupons_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_created_idx ON public.coupons USING btree (created_at DESC);


--
-- Name: coupons_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_merchant_idx ON public.coupons USING btree (merchant_id);


--
-- Name: courier_labels_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX courier_labels_created_idx ON public.courier_labels USING btree (created_at DESC);


--
-- Name: courier_labels_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX courier_labels_merchant_idx ON public.courier_labels USING btree (merchant_id);


--
-- Name: courier_webhook_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX courier_webhook_events_merchant_idx ON public.courier_webhook_events USING btree (merchant_id);


--
-- Name: customer_addresses_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_addresses_created_idx ON public.customer_addresses USING btree (created_at DESC);


--
-- Name: customer_addresses_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_addresses_merchant_idx ON public.customer_addresses USING btree (merchant_id);


--
-- Name: customer_consents_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_consents_merchant_idx ON public.customer_consents USING btree (merchant_id);


--
-- Name: customer_wishlist_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_wishlist_items_created_idx ON public.customer_wishlist_items USING btree (created_at DESC);


--
-- Name: customer_wishlist_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_wishlist_items_merchant_idx ON public.customer_wishlist_items USING btree (merchant_id);


--
-- Name: customers_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_created_idx ON public.customers USING btree (created_at DESC);


--
-- Name: customers_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_merchant_idx ON public.customers USING btree (merchant_id);


--
-- Name: delivery_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delivery_events_created_idx ON public.delivery_events USING btree (created_at DESC);


--
-- Name: delivery_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delivery_events_merchant_idx ON public.delivery_events USING btree (merchant_id);


--
-- Name: digital_assets_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX digital_assets_created_idx ON public.digital_assets USING btree (created_at DESC);


--
-- Name: digital_assets_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX digital_assets_merchant_idx ON public.digital_assets USING btree (merchant_id);


--
-- Name: digital_grants_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX digital_grants_created_idx ON public.digital_grants USING btree (created_at DESC);


--
-- Name: digital_grants_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX digital_grants_merchant_idx ON public.digital_grants USING btree (merchant_id);


--
-- Name: dispute_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_events_created_idx ON public.dispute_events USING btree (created_at DESC);


--
-- Name: dispute_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_events_merchant_idx ON public.dispute_events USING btree (merchant_id);


--
-- Name: disputes_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX disputes_created_idx ON public.disputes USING btree (created_at DESC);


--
-- Name: disputes_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX disputes_merchant_idx ON public.disputes USING btree (merchant_id);


--
-- Name: export_jobs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX export_jobs_created_idx ON public.export_jobs USING btree (created_at DESC);


--
-- Name: export_jobs_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX export_jobs_merchant_idx ON public.export_jobs USING btree (merchant_id);


--
-- Name: form_submissions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX form_submissions_created_idx ON public.form_submissions USING btree (created_at DESC);


--
-- Name: form_submissions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX form_submissions_merchant_idx ON public.form_submissions USING btree (merchant_id);


--
-- Name: fraud_assessments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_assessments_created_idx ON public.fraud_assessments USING btree (created_at DESC);


--
-- Name: fraud_assessments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_assessments_merchant_idx ON public.fraud_assessments USING btree (merchant_id);


--
-- Name: fraud_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_audit_created_idx ON public.fraud_audit USING btree (created_at DESC);


--
-- Name: fraud_audit_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_audit_merchant_idx ON public.fraud_audit USING btree (merchant_id);


--
-- Name: fraud_blacklist_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_blacklist_created_idx ON public.fraud_blacklist USING btree (created_at DESC);


--
-- Name: fraud_blacklist_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_blacklist_merchant_idx ON public.fraud_blacklist USING btree (merchant_id);


--
-- Name: fraud_cases_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_cases_created_idx ON public.fraud_cases USING btree (created_at DESC);


--
-- Name: fraud_cases_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_cases_merchant_idx ON public.fraud_cases USING btree (merchant_id);


--
-- Name: fraud_rules_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_rules_created_idx ON public.fraud_rules USING btree (created_at DESC);


--
-- Name: fraud_rules_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fraud_rules_merchant_idx ON public.fraud_rules USING btree (merchant_id);


--
-- Name: fulfilment_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fulfilment_items_created_idx ON public.fulfilment_items USING btree (created_at DESC);


--
-- Name: fulfilment_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fulfilment_items_merchant_idx ON public.fulfilment_items USING btree (merchant_id);


--
-- Name: fulfilments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fulfilments_created_idx ON public.fulfilments USING btree (created_at DESC);


--
-- Name: fulfilments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fulfilments_merchant_idx ON public.fulfilments USING btree (merchant_id);


--
-- Name: fx_rates_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fx_rates_created_idx ON public.fx_rates USING btree (created_at DESC);


--
-- Name: gateway_accounts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_accounts_created_idx ON public.gateway_accounts USING btree (created_at DESC);


--
-- Name: gateway_accounts_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_accounts_merchant_idx ON public.gateway_accounts USING btree (merchant_id);


--
-- Name: gift_card_entries_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gift_card_entries_created_idx ON public.gift_card_entries USING btree (created_at DESC);


--
-- Name: gift_card_entries_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gift_card_entries_merchant_idx ON public.gift_card_entries USING btree (merchant_id);


--
-- Name: gift_cards_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gift_cards_created_idx ON public.gift_cards USING btree (created_at DESC);


--
-- Name: gift_cards_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gift_cards_merchant_idx ON public.gift_cards USING btree (merchant_id);


--
-- Name: impersonation_grants_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_grants_merchant_idx ON public.impersonation_grants USING btree (merchant_id);


--
-- Name: inventory_levels_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_levels_created_idx ON public.inventory_levels USING btree (created_at DESC);


--
-- Name: inventory_levels_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_levels_merchant_idx ON public.inventory_levels USING btree (merchant_id);


--
-- Name: inventory_locations_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_locations_created_idx ON public.inventory_locations USING btree (created_at DESC);


--
-- Name: inventory_locations_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_locations_merchant_idx ON public.inventory_locations USING btree (merchant_id);


--
-- Name: inventory_transfer_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transfer_items_created_idx ON public.inventory_transfer_items USING btree (created_at DESC);


--
-- Name: inventory_transfer_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transfer_items_merchant_idx ON public.inventory_transfer_items USING btree (merchant_id);


--
-- Name: inventory_transfers_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transfers_created_idx ON public.inventory_transfers USING btree (created_at DESC);


--
-- Name: inventory_transfers_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_transfers_merchant_idx ON public.inventory_transfers USING btree (merchant_id);


--
-- Name: invoices_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_created_idx ON public.invoices USING btree (created_at DESC);


--
-- Name: invoices_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_merchant_idx ON public.invoices USING btree (merchant_id);


--
-- Name: local_transactions_client_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX local_transactions_client_uidx ON public.local_transactions USING btree (merchant_id, client_id);


--
-- Name: local_transactions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX local_transactions_created_idx ON public.local_transactions USING btree (created_at DESC);


--
-- Name: local_transactions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX local_transactions_merchant_idx ON public.local_transactions USING btree (merchant_id);


--
-- Name: marketplace_installs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_installs_created_idx ON public.marketplace_installs USING btree (created_at DESC);


--
-- Name: marketplace_installs_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_installs_merchant_idx ON public.marketplace_installs USING btree (merchant_id);


--
-- Name: marketplace_reviews_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_reviews_created_idx ON public.marketplace_reviews USING btree (created_at DESC);


--
-- Name: marketplace_reviews_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_reviews_merchant_idx ON public.marketplace_reviews USING btree (merchant_id);


--
-- Name: marketplace_themes_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_themes_created_idx ON public.marketplace_themes USING btree (created_at DESC);


--
-- Name: marketplace_widgets_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketplace_widgets_created_idx ON public.marketplace_widgets USING btree (created_at DESC);


--
-- Name: media_assets_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_created_idx ON public.media_assets USING btree (created_at DESC);


--
-- Name: media_assets_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_merchant_idx ON public.media_assets USING btree (merchant_id);


--
-- Name: merchant_kyc_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_kyc_created_idx ON public.merchant_kyc USING btree (created_at DESC);


--
-- Name: merchant_kyc_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_kyc_merchant_idx ON public.merchant_kyc USING btree (merchant_id);


--
-- Name: merchant_members_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_members_created_idx ON public.merchant_members USING btree (created_at DESC);


--
-- Name: merchant_members_merchant_id_user_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX merchant_members_merchant_id_user_id_uq ON public.merchant_members USING btree (merchant_id, user_id);


--
-- Name: merchant_members_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_members_merchant_idx ON public.merchant_members USING btree (merchant_id);


--
-- Name: merchant_settings_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_settings_created_idx ON public.merchant_settings USING btree (created_at DESC);


--
-- Name: merchant_settings_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_settings_merchant_idx ON public.merchant_settings USING btree (merchant_id);


--
-- Name: merchant_suspensions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_suspensions_merchant_idx ON public.merchant_suspensions USING btree (merchant_id);


--
-- Name: merchants_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchants_created_idx ON public.merchants USING btree (created_at DESC);


--
-- Name: merchants_slug_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX merchants_slug_uq ON public.merchants USING btree (slug);


--
-- Name: metafield_definitions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metafield_definitions_created_idx ON public.metafield_definitions USING btree (created_at DESC);


--
-- Name: metafield_definitions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metafield_definitions_merchant_idx ON public.metafield_definitions USING btree (merchant_id);


--
-- Name: metafields_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metafields_created_idx ON public.metafields USING btree (created_at DESC);


--
-- Name: metafields_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metafields_merchant_idx ON public.metafields USING btree (merchant_id);


--
-- Name: notifications_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_idx ON public.notifications USING btree (created_at DESC);


--
-- Name: notifications_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_merchant_idx ON public.notifications USING btree (merchant_id);


--
-- Name: ops_backup_runs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_backup_runs_created_idx ON public.ops_backup_runs USING btree (created_at DESC);


--
-- Name: ops_incident_updates_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_incident_updates_created_idx ON public.ops_incident_updates USING btree (created_at DESC);


--
-- Name: ops_incidents_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ops_incidents_created_idx ON public.ops_incidents USING btree (created_at DESC);


--
-- Name: order_amendments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_amendments_created_idx ON public.order_amendments USING btree (created_at DESC);


--
-- Name: order_amendments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_amendments_merchant_idx ON public.order_amendments USING btree (merchant_id);


--
-- Name: order_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_events_created_idx ON public.order_events USING btree (created_at DESC);


--
-- Name: order_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_events_merchant_idx ON public.order_events USING btree (merchant_id);


--
-- Name: order_invoices_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_invoices_created_idx ON public.order_invoices USING btree (created_at DESC);


--
-- Name: order_invoices_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_invoices_merchant_idx ON public.order_invoices USING btree (merchant_id);


--
-- Name: order_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_created_idx ON public.order_items USING btree (created_at DESC);


--
-- Name: order_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_merchant_idx ON public.order_items USING btree (merchant_id);


--
-- Name: orders_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_merchant_idx ON public.orders USING btree (merchant_id);


--
-- Name: payments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_created_idx ON public.payments USING btree (created_at DESC);


--
-- Name: payments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_merchant_idx ON public.payments USING btree (merchant_id);


--
-- Name: plan_definitions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_definitions_created_idx ON public.plan_definitions USING btree (created_at DESC);


--
-- Name: platform_admins_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_admins_created_idx ON public.platform_admins USING btree (created_at DESC);


--
-- Name: platform_audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_audit_log_created_idx ON public.platform_audit_log USING btree (created_at DESC);


--
-- Name: platform_flags_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_flags_created_idx ON public.platform_flags USING btree (created_at DESC);


--
-- Name: pos_orders_client_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_orders_client_uidx ON public.pos_orders USING btree (merchant_id, client_id);


--
-- Name: pos_orders_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_orders_created_idx ON public.pos_orders USING btree (created_at DESC);


--
-- Name: pos_orders_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_orders_merchant_idx ON public.pos_orders USING btree (merchant_id);


--
-- Name: pos_orders_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_orders_session_idx ON public.pos_orders USING btree (merchant_id, session_id, captured_at DESC);


--
-- Name: pos_payments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_payments_created_idx ON public.pos_payments USING btree (created_at DESC);


--
-- Name: pos_payments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_payments_merchant_idx ON public.pos_payments USING btree (merchant_id);


--
-- Name: pos_payments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_payments_order_idx ON public.pos_payments USING btree (pos_order_id);


--
-- Name: pos_refunds_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_refunds_created_idx ON public.pos_refunds USING btree (created_at DESC);


--
-- Name: pos_refunds_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pos_refunds_key_uidx ON public.pos_refunds USING btree (merchant_id, idempotency_key);


--
-- Name: pos_refunds_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_refunds_merchant_idx ON public.pos_refunds USING btree (merchant_id);


--
-- Name: pos_refunds_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_refunds_order_idx ON public.pos_refunds USING btree (merchant_id, pos_order_id);


--
-- Name: pos_sessions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_sessions_created_idx ON public.pos_sessions USING btree (created_at DESC);


--
-- Name: pos_sessions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_sessions_merchant_idx ON public.pos_sessions USING btree (merchant_id);


--
-- Name: product_bundles_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_bundles_created_idx ON public.product_bundles USING btree (created_at DESC);


--
-- Name: product_bundles_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_bundles_merchant_idx ON public.product_bundles USING btree (merchant_id);


--
-- Name: product_reviews_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_created_idx ON public.product_reviews USING btree (created_at DESC);


--
-- Name: product_reviews_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_merchant_idx ON public.product_reviews USING btree (merchant_id);


--
-- Name: product_variants_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_created_idx ON public.product_variants USING btree (created_at DESC);


--
-- Name: product_variants_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variants_merchant_idx ON public.product_variants USING btree (merchant_id);


--
-- Name: products_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_created_idx ON public.products USING btree (created_at DESC);


--
-- Name: products_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_merchant_idx ON public.products USING btree (merchant_id);


--
-- Name: profiles_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_created_idx ON public.profiles USING btree (created_at DESC);


--
-- Name: refunds_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_created_idx ON public.refunds USING btree (created_at DESC);


--
-- Name: refunds_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_merchant_idx ON public.refunds USING btree (merchant_id);


--
-- Name: refunds_merchant_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refunds_merchant_key_uidx ON public.refunds USING btree (merchant_id, refund_key);


--
-- Name: refunds_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_status_idx ON public.refunds USING btree (merchant_id, status, created_at DESC);


--
-- Name: return_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_events_created_idx ON public.return_events USING btree (created_at DESC);


--
-- Name: return_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_events_merchant_idx ON public.return_events USING btree (merchant_id);


--
-- Name: return_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_items_created_idx ON public.return_items USING btree (created_at DESC);


--
-- Name: return_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_items_merchant_idx ON public.return_items USING btree (merchant_id);


--
-- Name: return_requests_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_requests_created_idx ON public.return_requests USING btree (created_at DESC);


--
-- Name: return_requests_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_requests_merchant_idx ON public.return_requests USING btree (merchant_id);


--
-- Name: review_replies_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX review_replies_merchant_idx ON public.review_replies USING btree (merchant_id);


--
-- Name: segments_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX segments_created_idx ON public.segments USING btree (created_at DESC);


--
-- Name: segments_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX segments_merchant_idx ON public.segments USING btree (merchant_id);


--
-- Name: seo_meta_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seo_meta_audit_created_idx ON public.seo_meta_audit USING btree (created_at DESC);


--
-- Name: seo_meta_audit_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seo_meta_audit_merchant_idx ON public.seo_meta_audit USING btree (merchant_id);


--
-- Name: seo_meta_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seo_meta_created_idx ON public.seo_meta USING btree (created_at DESC);


--
-- Name: seo_meta_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seo_meta_merchant_idx ON public.seo_meta USING btree (merchant_id);


--
-- Name: service_offerings_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_offerings_created_idx ON public.service_offerings USING btree (created_at DESC);


--
-- Name: service_offerings_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_offerings_merchant_idx ON public.service_offerings USING btree (merchant_id);


--
-- Name: settlement_files_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_files_created_idx ON public.settlement_files USING btree (created_at DESC);


--
-- Name: settlement_files_hash_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX settlement_files_hash_uidx ON public.settlement_files USING btree (merchant_id, provider, file_hash);


--
-- Name: settlement_files_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_files_merchant_idx ON public.settlement_files USING btree (merchant_id);


--
-- Name: settlement_items_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_items_created_idx ON public.settlement_items USING btree (created_at DESC);


--
-- Name: settlement_items_file_ref_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX settlement_items_file_ref_uidx ON public.settlement_items USING btree (file_id, settlement_ref);


--
-- Name: settlement_items_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_items_merchant_idx ON public.settlement_items USING btree (merchant_id);


--
-- Name: settlement_variance_alerts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_variance_alerts_created_idx ON public.settlement_variance_alerts USING btree (created_at DESC);


--
-- Name: settlement_variance_alerts_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settlement_variance_alerts_merchant_idx ON public.settlement_variance_alerts USING btree (merchant_id);


--
-- Name: shipment_quotes_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_quotes_created_idx ON public.shipment_quotes USING btree (created_at DESC);


--
-- Name: shipment_quotes_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_quotes_merchant_idx ON public.shipment_quotes USING btree (merchant_id);


--
-- Name: shipping_rate_rules_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_rate_rules_created_idx ON public.shipping_rate_rules USING btree (created_at DESC);


--
-- Name: shipping_rate_rules_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_rate_rules_merchant_idx ON public.shipping_rate_rules USING btree (merchant_id);


--
-- Name: shipping_zones_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_zones_created_idx ON public.shipping_zones USING btree (created_at DESC);


--
-- Name: shipping_zones_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_zones_merchant_idx ON public.shipping_zones USING btree (merchant_id);


--
-- Name: staff_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_audit_created_idx ON public.staff_audit USING btree (created_at DESC);


--
-- Name: staff_audit_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_audit_merchant_idx ON public.staff_audit USING btree (merchant_id);


--
-- Name: staff_roles_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_roles_created_idx ON public.staff_roles USING btree (created_at DESC);


--
-- Name: staff_roles_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_roles_merchant_idx ON public.staff_roles USING btree (merchant_id);


--
-- Name: step_up_grants_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_up_grants_created_idx ON public.step_up_grants USING btree (created_at DESC);


--
-- Name: step_up_grants_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_up_grants_merchant_idx ON public.step_up_grants USING btree (merchant_id);


--
-- Name: stock_holds_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_holds_created_idx ON public.stock_holds USING btree (created_at DESC);


--
-- Name: stock_holds_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_holds_merchant_idx ON public.stock_holds USING btree (merchant_id);


--
-- Name: store_themes_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_themes_created_idx ON public.store_themes USING btree (created_at DESC);


--
-- Name: store_themes_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_themes_merchant_idx ON public.store_themes USING btree (merchant_id);


--
-- Name: storefront_forms_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storefront_forms_created_idx ON public.storefront_forms USING btree (created_at DESC);


--
-- Name: storefront_forms_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storefront_forms_merchant_idx ON public.storefront_forms USING btree (merchant_id);


--
-- Name: storefront_pages_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storefront_pages_created_idx ON public.storefront_pages USING btree (created_at DESC);


--
-- Name: storefront_pages_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storefront_pages_merchant_idx ON public.storefront_pages USING btree (merchant_id);


--
-- Name: subscribers_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscribers_created_idx ON public.subscribers USING btree (created_at DESC);


--
-- Name: subscribers_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscribers_merchant_idx ON public.subscribers USING btree (merchant_id);


--
-- Name: subscription_terms_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_terms_created_idx ON public.subscription_terms USING btree (created_at DESC);


--
-- Name: subscription_terms_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_terms_merchant_idx ON public.subscription_terms USING btree (merchant_id);


--
-- Name: subscriptions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_created_idx ON public.subscriptions USING btree (created_at DESC);


--
-- Name: subscriptions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_merchant_idx ON public.subscriptions USING btree (merchant_id);


--
-- Name: tenant_limits_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_limits_created_idx ON public.tenant_limits USING btree (created_at DESC);


--
-- Name: tenant_limits_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_limits_merchant_idx ON public.tenant_limits USING btree (merchant_id);


--
-- Name: tenant_purge_requests_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_purge_requests_merchant_idx ON public.tenant_purge_requests USING btree (merchant_id);


--
-- Name: theme_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_audit_created_idx ON public.theme_audit USING btree (created_at DESC);


--
-- Name: theme_audit_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_audit_merchant_idx ON public.theme_audit USING btree (merchant_id);


--
-- Name: theme_drafts_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_drafts_merchant_idx ON public.theme_drafts USING btree (merchant_id);


--
-- Name: theme_registry_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_registry_created_idx ON public.theme_registry USING btree (created_at DESC);


--
-- Name: theme_schedules_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_schedules_created_idx ON public.theme_schedules USING btree (created_at DESC);


--
-- Name: theme_schedules_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_schedules_merchant_idx ON public.theme_schedules USING btree (merchant_id);


--
-- Name: theme_versions_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_versions_created_idx ON public.theme_versions USING btree (created_at DESC);


--
-- Name: theme_versions_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX theme_versions_merchant_idx ON public.theme_versions USING btree (merchant_id);


--
-- Name: vat_rates_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_rates_created_idx ON public.vat_rates USING btree (created_at DESC);


--
-- Name: wallet_ledger_entries_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_ledger_entries_created_idx ON public.wallet_ledger_entries USING btree (created_at DESC);


--
-- Name: wallet_ledger_entries_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_ledger_entries_merchant_idx ON public.wallet_ledger_entries USING btree (merchant_id);


--
-- Name: webhook_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_created_idx ON public.webhook_events USING btree (created_at DESC);


--
-- Name: webhook_events_merchant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_merchant_idx ON public.webhook_events USING btree (merchant_id);


--
-- Name: abandoned_carts abandoned_carts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER abandoned_carts_set_updated_at BEFORE UPDATE ON public.abandoned_carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_conversations ai_conversations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ai_conversations_set_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: api_keys api_keys_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER api_keys_set_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: approval_requests approval_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_requests_set_updated_at BEFORE UPDATE ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: articles articles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER articles_set_updated_at BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: brands brands_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaign_sends campaign_sends_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaign_sends_set_updated_at BEFORE UPDATE ON public.campaign_sends FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: campaigns campaigns_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_set_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: carrier_shipments carrier_shipments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER carrier_shipments_set_updated_at BEFORE UPDATE ON public.carrier_shipments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: carriers carriers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER carriers_set_updated_at BEFORE UPDATE ON public.carriers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: catalog_import_jobs catalog_import_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER catalog_import_jobs_set_updated_at BEFORE UPDATE ON public.catalog_import_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: categories categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: charge_intents charge_intents_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER charge_intents_set_updated_at BEFORE UPDATE ON public.charge_intents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cod_reconciliations cod_reconciliations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cod_reconciliations_set_updated_at BEFORE UPDATE ON public.cod_reconciliations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: cod_settlements cod_settlements_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cod_settlements_set_updated_at BEFORE UPDATE ON public.cod_settlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: collections collections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: coupons coupons_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coupons_set_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_addresses customer_addresses_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customer_addresses_set_updated_at BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_consents customer_consents_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customer_consents_set_updated_at BEFORE UPDATE ON public.customer_consents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers customers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: digital_assets digital_assets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER digital_assets_set_updated_at BEFORE UPDATE ON public.digital_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: disputes disputes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER disputes_set_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: export_jobs export_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER export_jobs_set_updated_at BEFORE UPDATE ON public.export_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fraud_blacklist fraud_blacklist_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fraud_blacklist_set_updated_at BEFORE UPDATE ON public.fraud_blacklist FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fraud_cases fraud_cases_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fraud_cases_set_updated_at BEFORE UPDATE ON public.fraud_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fraud_rules fraud_rules_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fraud_rules_set_updated_at BEFORE UPDATE ON public.fraud_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fulfilments fulfilments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fulfilments_set_updated_at BEFORE UPDATE ON public.fulfilments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gateway_accounts gateway_accounts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gateway_accounts_set_updated_at BEFORE UPDATE ON public.gateway_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gift_cards gift_cards_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gift_cards_set_updated_at BEFORE UPDATE ON public.gift_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_levels inventory_levels_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_levels_set_updated_at BEFORE UPDATE ON public.inventory_levels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_locations inventory_locations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_locations_set_updated_at BEFORE UPDATE ON public.inventory_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_transfers inventory_transfers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_transfers_set_updated_at BEFORE UPDATE ON public.inventory_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoices invoices_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: local_transactions local_transactions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER local_transactions_set_updated_at BEFORE UPDATE ON public.local_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_installs marketplace_installs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER marketplace_installs_set_updated_at BEFORE UPDATE ON public.marketplace_installs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_reviews marketplace_reviews_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER marketplace_reviews_set_updated_at BEFORE UPDATE ON public.marketplace_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_themes marketplace_themes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER marketplace_themes_set_updated_at BEFORE UPDATE ON public.marketplace_themes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: marketplace_widgets marketplace_widgets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER marketplace_widgets_set_updated_at BEFORE UPDATE ON public.marketplace_widgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: media_assets media_assets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: merchant_kyc merchant_kyc_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchant_kyc_set_updated_at BEFORE UPDATE ON public.merchant_kyc FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: merchant_members merchant_members_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchant_members_set_updated_at BEFORE UPDATE ON public.merchant_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: merchant_settings merchant_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchant_settings_set_updated_at BEFORE UPDATE ON public.merchant_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: merchants merchants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER merchants_set_updated_at BEFORE UPDATE ON public.merchants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: metafield_definitions metafield_definitions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER metafield_definitions_set_updated_at BEFORE UPDATE ON public.metafield_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: metafields metafields_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER metafields_set_updated_at BEFORE UPDATE ON public.metafields FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications notifications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ops_incidents ops_incidents_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ops_incidents_set_updated_at BEFORE UPDATE ON public.ops_incidents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ops_status_components ops_status_components_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ops_status_components_set_updated_at BEFORE UPDATE ON public.ops_status_components FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payments payments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plan_definitions plan_definitions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_definitions_set_updated_at BEFORE UPDATE ON public.plan_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: platform_flags platform_flags_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_flags_set_updated_at BEFORE UPDATE ON public.platform_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pos_orders pos_orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_orders_set_updated_at BEFORE UPDATE ON public.pos_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pos_sessions pos_sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_sessions_set_updated_at BEFORE UPDATE ON public.pos_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_bundles product_bundles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_bundles_set_updated_at BEFORE UPDATE ON public.product_bundles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_reviews product_reviews_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_reviews_set_updated_at BEFORE UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_variants product_variants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products products_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: refunds refunds_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: return_requests return_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER return_requests_set_updated_at BEFORE UPDATE ON public.return_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: segments segments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER segments_set_updated_at BEFORE UPDATE ON public.segments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: seo_meta seo_meta_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seo_meta_set_updated_at BEFORE UPDATE ON public.seo_meta FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_offerings service_offerings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_offerings_set_updated_at BEFORE UPDATE ON public.service_offerings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: settlement_files settlement_files_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER settlement_files_set_updated_at BEFORE UPDATE ON public.settlement_files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: shipping_rate_rules shipping_rate_rules_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shipping_rate_rules_set_updated_at BEFORE UPDATE ON public.shipping_rate_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: shipping_zones shipping_zones_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shipping_zones_set_updated_at BEFORE UPDATE ON public.shipping_zones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: staff_roles staff_roles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_roles_set_updated_at BEFORE UPDATE ON public.staff_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: store_themes store_themes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER store_themes_set_updated_at BEFORE UPDATE ON public.store_themes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: storefront_forms storefront_forms_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storefront_forms_set_updated_at BEFORE UPDATE ON public.storefront_forms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: storefront_pages storefront_pages_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storefront_pages_set_updated_at BEFORE UPDATE ON public.storefront_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscribers subscribers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscribers_set_updated_at BEFORE UPDATE ON public.subscribers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscription_terms subscription_terms_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscription_terms_set_updated_at BEFORE UPDATE ON public.subscription_terms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscriptions subscriptions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tenant_limits tenant_limits_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_limits_set_updated_at BEFORE UPDATE ON public.tenant_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: theme_drafts theme_drafts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER theme_drafts_set_updated_at BEFORE UPDATE ON public.theme_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: theme_registry theme_registry_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER theme_registry_set_updated_at BEFORE UPDATE ON public.theme_registry FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: webhook_events webhook_events_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER webhook_events_set_updated_at BEFORE UPDATE ON public.webhook_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: abandoned_carts abandoned_carts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: abandoned_carts abandoned_carts_recovered_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_recovered_order_id_fkey FOREIGN KEY (recovered_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: activity_log activity_log_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_messages ai_messages_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: api_key_events api_key_events_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_events
    ADD CONSTRAINT api_key_events_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;


--
-- Name: api_key_events api_key_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key_events
    ADD CONSTRAINT api_key_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: articles articles_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: articles articles_cover_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_cover_media_id_fkey FOREIGN KEY (cover_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: articles articles_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: billing_dunning_attempts billing_dunning_attempts_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_dunning_attempts
    ADD CONSTRAINT billing_dunning_attempts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: billing_dunning_attempts billing_dunning_attempts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_dunning_attempts
    ADD CONSTRAINT billing_dunning_attempts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: billing_events billing_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: brands brands_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: bundle_items bundle_items_bundle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bundle_items
    ADD CONSTRAINT bundle_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.product_bundles(id) ON DELETE CASCADE;


--
-- Name: bundle_items bundle_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bundle_items
    ADD CONSTRAINT bundle_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: bundle_items bundle_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bundle_items
    ADD CONSTRAINT bundle_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: campaign_sends campaign_sends_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sends
    ADD CONSTRAINT campaign_sends_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_sends campaign_sends_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sends
    ADD CONSTRAINT campaign_sends_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: campaign_sends campaign_sends_subscriber_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_sends
    ADD CONSTRAINT campaign_sends_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES public.subscribers(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE SET NULL;


--
-- Name: carrier_shipments carrier_shipments_carrier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES public.carriers(id) ON DELETE SET NULL;


--
-- Name: carrier_shipments carrier_shipments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: carrier_shipments carrier_shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: carrier_shipments carrier_shipments_pos_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_pos_order_id_fkey FOREIGN KEY (pos_order_id) REFERENCES public.pos_orders(id) ON DELETE SET NULL;


--
-- Name: carrier_shipments carrier_shipments_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.shipment_quotes(id) ON DELETE SET NULL;


--
-- Name: carrier_shipments carrier_shipments_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.shipping_zones(id) ON DELETE SET NULL;


--
-- Name: carriers carriers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carriers
    ADD CONSTRAINT carriers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: catalog_import_jobs catalog_import_jobs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_import_jobs
    ADD CONSTRAINT catalog_import_jobs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: categories categories_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: charge_intent_events charge_intent_events_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_intent_events
    ADD CONSTRAINT charge_intent_events_intent_id_fkey FOREIGN KEY (intent_id) REFERENCES public.charge_intents(id) ON DELETE CASCADE;


--
-- Name: charge_intent_events charge_intent_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_intent_events
    ADD CONSTRAINT charge_intent_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: charge_intents charge_intents_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_intents
    ADD CONSTRAINT charge_intents_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: charge_intents charge_intents_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_intents
    ADD CONSTRAINT charge_intents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: cod_reconciliations cod_reconciliations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_reconciliations
    ADD CONSTRAINT cod_reconciliations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_reconciliations cod_reconciliations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_reconciliations
    ADD CONSTRAINT cod_reconciliations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: cod_settlements cod_settlements_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_settlements
    ADD CONSTRAINT cod_settlements_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_settlements cod_settlements_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_settlements
    ADD CONSTRAINT cod_settlements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: cod_settlements cod_settlements_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cod_settlements
    ADD CONSTRAINT cod_settlements_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.carrier_shipments(id) ON DELETE CASCADE;


--
-- Name: collection_products collection_products_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: collection_products collection_products_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: collection_products collection_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: collections collections_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: consent_events consent_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_events
    ADD CONSTRAINT consent_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: coupons coupons_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: courier_labels courier_labels_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_labels
    ADD CONSTRAINT courier_labels_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: courier_labels courier_labels_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_labels
    ADD CONSTRAINT courier_labels_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.carrier_shipments(id) ON DELETE CASCADE;


--
-- Name: courier_webhook_events courier_webhook_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_webhook_events
    ADD CONSTRAINT courier_webhook_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;


--
-- Name: courier_webhook_events courier_webhook_events_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier_webhook_events
    ADD CONSTRAINT courier_webhook_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.carrier_shipments(id) ON DELETE SET NULL;


--
-- Name: customer_addresses customer_addresses_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_addresses customer_addresses_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_consents customer_consents_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consents
    ADD CONSTRAINT customer_consents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: customer_consents customer_consents_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consents
    ADD CONSTRAINT customer_consents_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_wishlist_items customer_wishlist_items_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_wishlist_items
    ADD CONSTRAINT customer_wishlist_items_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_wishlist_items customer_wishlist_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_wishlist_items
    ADD CONSTRAINT customer_wishlist_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_wishlist_items customer_wishlist_items_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_wishlist_items
    ADD CONSTRAINT customer_wishlist_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: customers customers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_events delivery_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_events
    ADD CONSTRAINT delivery_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_events delivery_events_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_events
    ADD CONSTRAINT delivery_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.carrier_shipments(id) ON DELETE CASCADE;


--
-- Name: digital_assets digital_assets_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets
    ADD CONSTRAINT digital_assets_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: digital_assets digital_assets_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets
    ADD CONSTRAINT digital_assets_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: digital_assets digital_assets_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_assets
    ADD CONSTRAINT digital_assets_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: digital_grants digital_grants_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_grants
    ADD CONSTRAINT digital_grants_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.digital_assets(id) ON DELETE CASCADE;


--
-- Name: digital_grants digital_grants_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_grants
    ADD CONSTRAINT digital_grants_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: digital_grants digital_grants_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_grants
    ADD CONSTRAINT digital_grants_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: digital_grants digital_grants_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_grants
    ADD CONSTRAINT digital_grants_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: dispute_events dispute_events_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_events
    ADD CONSTRAINT dispute_events_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_events dispute_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_events
    ADD CONSTRAINT dispute_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: disputes disputes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: disputes disputes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: export_jobs export_jobs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_jobs
    ADD CONSTRAINT export_jobs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.storefront_forms(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fraud_assessments fraud_assessments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_assessments
    ADD CONSTRAINT fraud_assessments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fraud_assessments fraud_assessments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_assessments
    ADD CONSTRAINT fraud_assessments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: fraud_audit fraud_audit_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_audit
    ADD CONSTRAINT fraud_audit_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.fraud_cases(id) ON DELETE SET NULL;


--
-- Name: fraud_audit fraud_audit_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_audit
    ADD CONSTRAINT fraud_audit_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fraud_blacklist fraud_blacklist_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_blacklist
    ADD CONSTRAINT fraud_blacklist_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fraud_cases fraud_cases_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_cases
    ADD CONSTRAINT fraud_cases_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fraud_cases fraud_cases_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_cases
    ADD CONSTRAINT fraud_cases_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: fraud_rules fraud_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_rules
    ADD CONSTRAINT fraud_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fulfilment_items fulfilment_items_fulfilment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilment_items
    ADD CONSTRAINT fulfilment_items_fulfilment_id_fkey FOREIGN KEY (fulfilment_id) REFERENCES public.fulfilments(id) ON DELETE CASCADE;


--
-- Name: fulfilment_items fulfilment_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilment_items
    ADD CONSTRAINT fulfilment_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fulfilment_items fulfilment_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilment_items
    ADD CONSTRAINT fulfilment_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: fulfilments fulfilments_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilments
    ADD CONSTRAINT fulfilments_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE SET NULL;


--
-- Name: fulfilments fulfilments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilments
    ADD CONSTRAINT fulfilments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: fulfilments fulfilments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfilments
    ADD CONSTRAINT fulfilments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: gateway_accounts gateway_accounts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_accounts
    ADD CONSTRAINT gateway_accounts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: gift_card_entries gift_card_entries_gift_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_entries
    ADD CONSTRAINT gift_card_entries_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE CASCADE;


--
-- Name: gift_card_entries gift_card_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_entries
    ADD CONSTRAINT gift_card_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: gift_card_entries gift_card_entries_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_entries
    ADD CONSTRAINT gift_card_entries_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: gift_cards gift_cards_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: impersonation_grants impersonation_grants_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_grants
    ADD CONSTRAINT impersonation_grants_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_levels inventory_levels_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE;


--
-- Name: inventory_levels inventory_levels_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_levels inventory_levels_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_locations inventory_locations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_transfer_items inventory_transfer_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_transfer_items inventory_transfer_items_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.inventory_transfers(id) ON DELETE CASCADE;


--
-- Name: inventory_transfer_items inventory_transfer_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfer_items
    ADD CONSTRAINT inventory_transfer_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_transfers inventory_transfers_from_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_from_location_id_fkey FOREIGN KEY (from_location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE;


--
-- Name: inventory_transfers inventory_transfers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_transfers inventory_transfers_to_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transfers
    ADD CONSTRAINT inventory_transfers_to_location_id_fkey FOREIGN KEY (to_location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: local_transactions local_transactions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_transactions
    ADD CONSTRAINT local_transactions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: marketplace_installs marketplace_installs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_installs
    ADD CONSTRAINT marketplace_installs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: marketplace_installs marketplace_installs_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_installs
    ADD CONSTRAINT marketplace_installs_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.marketplace_themes(id) ON DELETE SET NULL;


--
-- Name: marketplace_installs marketplace_installs_widget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_installs
    ADD CONSTRAINT marketplace_installs_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES public.marketplace_widgets(id) ON DELETE SET NULL;


--
-- Name: marketplace_reviews marketplace_reviews_install_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_install_id_fkey FOREIGN KEY (install_id) REFERENCES public.marketplace_installs(id) ON DELETE CASCADE;


--
-- Name: marketplace_reviews marketplace_reviews_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_reviews
    ADD CONSTRAINT marketplace_reviews_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: marketplace_themes marketplace_themes_seller_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_themes
    ADD CONSTRAINT marketplace_themes_seller_merchant_id_fkey FOREIGN KEY (seller_merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: marketplace_widgets marketplace_widgets_seller_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_widgets
    ADD CONSTRAINT marketplace_widgets_seller_merchant_id_fkey FOREIGN KEY (seller_merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_kyc merchant_kyc_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_kyc
    ADD CONSTRAINT merchant_kyc_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_members merchant_members_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_members merchant_members_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_members
    ADD CONSTRAINT merchant_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.staff_roles(id) ON DELETE SET NULL;


--
-- Name: merchant_settings merchant_settings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_settings
    ADD CONSTRAINT merchant_settings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_suspensions merchant_suspensions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_suspensions
    ADD CONSTRAINT merchant_suspensions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: metafield_definitions metafield_definitions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metafield_definitions
    ADD CONSTRAINT metafield_definitions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: metafields metafields_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metafields
    ADD CONSTRAINT metafields_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: ops_incident_updates ops_incident_updates_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_incident_updates
    ADD CONSTRAINT ops_incident_updates_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.ops_incidents(id) ON DELETE CASCADE;


--
-- Name: order_amendments order_amendments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_amendments
    ADD CONSTRAINT order_amendments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: order_amendments order_amendments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_amendments
    ADD CONSTRAINT order_amendments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_events order_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: order_events order_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_invoices order_invoices_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_invoices
    ADD CONSTRAINT order_invoices_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: order_invoices order_invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_invoices
    ADD CONSTRAINT order_invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: orders orders_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: payments payments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: pos_orders pos_orders_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_orders
    ADD CONSTRAINT pos_orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_orders pos_orders_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_orders
    ADD CONSTRAINT pos_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: pos_orders pos_orders_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_orders
    ADD CONSTRAINT pos_orders_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;


--
-- Name: pos_payments pos_payments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_payments
    ADD CONSTRAINT pos_payments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_payments pos_payments_pos_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_payments
    ADD CONSTRAINT pos_payments_pos_order_id_fkey FOREIGN KEY (pos_order_id) REFERENCES public.pos_orders(id) ON DELETE CASCADE;


--
-- Name: pos_refunds pos_refunds_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds
    ADD CONSTRAINT pos_refunds_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_refunds pos_refunds_pos_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds
    ADD CONSTRAINT pos_refunds_pos_order_id_fkey FOREIGN KEY (pos_order_id) REFERENCES public.pos_orders(id) ON DELETE CASCADE;


--
-- Name: pos_refunds pos_refunds_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds
    ADD CONSTRAINT pos_refunds_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;


--
-- Name: pos_sessions pos_sessions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: product_bundles product_bundles_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bundles
    ADD CONSTRAINT product_bundles_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: product_bundles product_bundles_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_bundles
    ADD CONSTRAINT product_bundles_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: return_events return_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_events
    ADD CONSTRAINT return_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: return_events return_events_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_events
    ADD CONSTRAINT return_events_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.return_requests(id) ON DELETE CASCADE;


--
-- Name: return_items return_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: return_items return_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: return_items return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.return_requests(id) ON DELETE CASCADE;


--
-- Name: return_requests return_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: return_requests return_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: return_requests return_requests_refund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refunds(id) ON DELETE SET NULL;


--
-- Name: review_replies review_replies_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: review_replies review_replies_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_replies
    ADD CONSTRAINT review_replies_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE;


--
-- Name: segments segments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: seo_meta_audit seo_meta_audit_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seo_meta_audit
    ADD CONSTRAINT seo_meta_audit_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: seo_meta seo_meta_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seo_meta
    ADD CONSTRAINT seo_meta_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: service_offerings service_offerings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offerings
    ADD CONSTRAINT service_offerings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: service_offerings service_offerings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offerings
    ADD CONSTRAINT service_offerings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: settlement_files settlement_files_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_files
    ADD CONSTRAINT settlement_files_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: settlement_items settlement_items_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT settlement_items_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.settlement_files(id) ON DELETE CASCADE;


--
-- Name: settlement_items settlement_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT settlement_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: settlement_items settlement_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT settlement_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: settlement_items settlement_items_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_items
    ADD CONSTRAINT settlement_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: settlement_variance_alerts settlement_variance_alerts_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_variance_alerts
    ADD CONSTRAINT settlement_variance_alerts_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.settlement_files(id) ON DELETE CASCADE;


--
-- Name: settlement_variance_alerts settlement_variance_alerts_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_variance_alerts
    ADD CONSTRAINT settlement_variance_alerts_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.settlement_items(id) ON DELETE SET NULL;


--
-- Name: settlement_variance_alerts settlement_variance_alerts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settlement_variance_alerts
    ADD CONSTRAINT settlement_variance_alerts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: shipment_quotes shipment_quotes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_quotes
    ADD CONSTRAINT shipment_quotes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: shipment_quotes shipment_quotes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_quotes
    ADD CONSTRAINT shipment_quotes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: shipment_quotes shipment_quotes_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_quotes
    ADD CONSTRAINT shipment_quotes_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.shipping_rate_rules(id) ON DELETE SET NULL;


--
-- Name: shipment_quotes shipment_quotes_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_quotes
    ADD CONSTRAINT shipment_quotes_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.shipping_zones(id) ON DELETE SET NULL;


--
-- Name: shipping_rate_rules shipping_rate_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_rate_rules
    ADD CONSTRAINT shipping_rate_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: shipping_rate_rules shipping_rate_rules_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_rate_rules
    ADD CONSTRAINT shipping_rate_rules_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.shipping_zones(id) ON DELETE CASCADE;


--
-- Name: shipping_zones shipping_zones_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_zones
    ADD CONSTRAINT shipping_zones_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: staff_audit staff_audit_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_audit
    ADD CONSTRAINT staff_audit_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: staff_roles staff_roles_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_roles
    ADD CONSTRAINT staff_roles_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: step_up_grants step_up_grants_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_up_grants
    ADD CONSTRAINT step_up_grants_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;


--
-- Name: stock_holds stock_holds_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holds
    ADD CONSTRAINT stock_holds_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_holds stock_holds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holds
    ADD CONSTRAINT stock_holds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: stock_holds stock_holds_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_holds
    ADD CONSTRAINT stock_holds_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: store_themes store_themes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_themes
    ADD CONSTRAINT store_themes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: store_themes store_themes_published_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_themes
    ADD CONSTRAINT store_themes_published_version_id_fkey FOREIGN KEY (published_version_id) REFERENCES public.theme_versions(id) ON DELETE SET NULL;


--
-- Name: store_themes store_themes_source_install_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_themes
    ADD CONSTRAINT store_themes_source_install_id_fkey FOREIGN KEY (source_install_id) REFERENCES public.marketplace_installs(id) ON DELETE SET NULL;


--
-- Name: storefront_forms storefront_forms_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storefront_forms
    ADD CONSTRAINT storefront_forms_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: storefront_pages storefront_pages_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storefront_pages
    ADD CONSTRAINT storefront_pages_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: subscribers subscribers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: subscription_terms subscription_terms_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_terms
    ADD CONSTRAINT subscription_terms_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: subscription_terms subscription_terms_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_terms
    ADD CONSTRAINT subscription_terms_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: tenant_limits tenant_limits_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_limits
    ADD CONSTRAINT tenant_limits_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: tenant_purge_requests tenant_purge_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_purge_requests
    ADD CONSTRAINT tenant_purge_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: theme_audit theme_audit_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_audit
    ADD CONSTRAINT theme_audit_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: theme_drafts theme_drafts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_drafts
    ADD CONSTRAINT theme_drafts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: theme_drafts theme_drafts_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_drafts
    ADD CONSTRAINT theme_drafts_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE CASCADE;


--
-- Name: theme_schedules theme_schedules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_schedules
    ADD CONSTRAINT theme_schedules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: theme_schedules theme_schedules_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_schedules
    ADD CONSTRAINT theme_schedules_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE CASCADE;


--
-- Name: theme_schedules theme_schedules_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_schedules
    ADD CONSTRAINT theme_schedules_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.theme_versions(id) ON DELETE SET NULL;


--
-- Name: theme_versions theme_versions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: theme_versions theme_versions_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_versions
    ADD CONSTRAINT theme_versions_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE CASCADE;


--
-- Name: wallet_ledger_entries wallet_ledger_entries_counterparty_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger_entries
    ADD CONSTRAINT wallet_ledger_entries_counterparty_merchant_id_fkey FOREIGN KEY (counterparty_merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;


--
-- Name: wallet_ledger_entries wallet_ledger_entries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger_entries
    ADD CONSTRAINT wallet_ledger_entries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: webhook_events webhook_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;


--
-- Name: webhook_events webhook_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: abandoned_carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

--
-- Name: abandoned_carts abandoned_carts_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY abandoned_carts_tenant_read ON public.abandoned_carts FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: abandoned_carts abandoned_carts_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY abandoned_carts_tenant_write ON public.abandoned_carts TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log activity_log_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_log_tenant_read ON public.activity_log FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: activity_log activity_log_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_log_tenant_write ON public.activity_log TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: ai_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversations ai_conversations_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_conversations_tenant_read ON public.ai_conversations FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: ai_conversations ai_conversations_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_conversations_tenant_write ON public.ai_conversations TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: ai_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_messages ai_messages_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_messages_tenant_read ON public.ai_messages FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: ai_messages ai_messages_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_messages_tenant_write ON public.ai_messages TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: api_key_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_key_events ENABLE ROW LEVEL SECURITY;

--
-- Name: api_key_events api_key_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_key_events_tenant_read ON public.api_key_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: api_key_events api_key_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_key_events_tenant_write ON public.api_key_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys api_keys_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_tenant_read ON public.api_keys FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: api_keys api_keys_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_tenant_write ON public.api_keys TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: approval_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests approval_requests_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_requests_tenant_read ON public.approval_requests FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: approval_requests approval_requests_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_requests_tenant_write ON public.approval_requests TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: articles articles_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY articles_tenant_read ON public.articles FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: articles articles_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY articles_tenant_write ON public.articles TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: auth_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_events auth_events_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_events_self ON public.auth_events TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin())) WITH CHECK (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: auth_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_sessions auth_sessions_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_sessions_self ON public.auth_sessions TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin())) WITH CHECK (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: billing_dunning_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_dunning_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_dunning_attempts billing_dunning_attempts_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_dunning_attempts_tenant_read ON public.billing_dunning_attempts FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: billing_dunning_attempts billing_dunning_attempts_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_dunning_attempts_tenant_write ON public.billing_dunning_attempts TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: billing_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_events billing_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_events_tenant_read ON public.billing_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: billing_events billing_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_events_tenant_write ON public.billing_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: brands brands_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_tenant_read ON public.brands FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: brands brands_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_tenant_write ON public.brands TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: bundle_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;

--
-- Name: bundle_items bundle_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bundle_items_tenant_read ON public.bundle_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: bundle_items bundle_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bundle_items_tenant_write ON public.bundle_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: campaign_sends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_sends campaign_sends_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_sends_tenant_read ON public.campaign_sends FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: campaign_sends campaign_sends_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_sends_tenant_write ON public.campaign_sends TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_tenant_read ON public.campaigns FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: campaigns campaigns_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_tenant_write ON public.campaigns TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: carrier_shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.carrier_shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: carrier_shipments carrier_shipments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY carrier_shipments_tenant_read ON public.carrier_shipments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: carrier_shipments carrier_shipments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY carrier_shipments_tenant_write ON public.carrier_shipments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: carriers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

--
-- Name: carriers carriers_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY carriers_tenant_read ON public.carriers FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: carriers carriers_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY carriers_tenant_write ON public.carriers TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: catalog_import_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalog_import_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_import_jobs catalog_import_jobs_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_import_jobs_tenant_read ON public.catalog_import_jobs FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: catalog_import_jobs catalog_import_jobs_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY catalog_import_jobs_tenant_write ON public.catalog_import_jobs TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_tenant_read ON public.categories FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: categories categories_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_tenant_write ON public.categories TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: charge_intent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.charge_intent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: charge_intent_events charge_intent_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY charge_intent_events_tenant_read ON public.charge_intent_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: charge_intent_events charge_intent_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY charge_intent_events_tenant_write ON public.charge_intent_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: charge_intents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.charge_intents ENABLE ROW LEVEL SECURITY;

--
-- Name: charge_intents charge_intents_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY charge_intents_tenant_read ON public.charge_intents FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: charge_intents charge_intents_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY charge_intents_tenant_write ON public.charge_intents TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: cod_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cod_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: cod_reconciliations cod_reconciliations_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cod_reconciliations_tenant_read ON public.cod_reconciliations FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: cod_reconciliations cod_reconciliations_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cod_reconciliations_tenant_write ON public.cod_reconciliations TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: cod_settlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cod_settlements ENABLE ROW LEVEL SECURITY;

--
-- Name: cod_settlements cod_settlements_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cod_settlements_tenant_read ON public.cod_settlements FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: cod_settlements cod_settlements_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cod_settlements_tenant_write ON public.cod_settlements TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: collection_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_products collection_products_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_products_tenant_read ON public.collection_products FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: collection_products collection_products_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_products_tenant_write ON public.collection_products TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

--
-- Name: collections collections_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collections_tenant_read ON public.collections FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: collections collections_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collections_tenant_write ON public.collections TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_events consent_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_events_tenant_read ON public.consent_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: consent_events consent_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_events_tenant_write ON public.consent_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions coupon_redemptions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupon_redemptions_tenant_read ON public.coupon_redemptions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: coupon_redemptions coupon_redemptions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupon_redemptions_tenant_write ON public.coupon_redemptions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_tenant_read ON public.coupons FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: coupons coupons_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_tenant_write ON public.coupons TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: courier_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_labels courier_labels_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_labels_tenant_read ON public.courier_labels FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: courier_labels courier_labels_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_labels_tenant_write ON public.courier_labels TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: courier_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: courier_webhook_events courier_webhook_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_webhook_events_tenant_read ON public.courier_webhook_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: courier_webhook_events courier_webhook_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_webhook_events_tenant_write ON public.courier_webhook_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses customer_addresses_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_addresses_tenant_read ON public.customer_addresses FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: customer_addresses customer_addresses_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_addresses_tenant_write ON public.customer_addresses TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: customer_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_consents customer_consents_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_consents_tenant_read ON public.customer_consents FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: customer_consents customer_consents_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_consents_tenant_write ON public.customer_consents TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: customer_wishlist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_wishlist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_wishlist_items customer_wishlist_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_wishlist_items_tenant_read ON public.customer_wishlist_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: customer_wishlist_items customer_wishlist_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_wishlist_items_tenant_write ON public.customer_wishlist_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_tenant_read ON public.customers FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: customers customers_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_tenant_write ON public.customers TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: delivery_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_events delivery_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_events_tenant_read ON public.delivery_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: delivery_events delivery_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_events_tenant_write ON public.delivery_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: digital_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: digital_assets digital_assets_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY digital_assets_tenant_read ON public.digital_assets FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: digital_assets digital_assets_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY digital_assets_tenant_write ON public.digital_assets TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: digital_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.digital_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: digital_grants digital_grants_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY digital_grants_tenant_read ON public.digital_grants FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: digital_grants digital_grants_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY digital_grants_tenant_write ON public.digital_grants TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: dispute_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_events dispute_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dispute_events_tenant_read ON public.dispute_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: dispute_events dispute_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dispute_events_tenant_write ON public.dispute_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: disputes disputes_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disputes_tenant_read ON public.disputes FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: disputes disputes_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY disputes_tenant_write ON public.disputes TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: export_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: export_jobs export_jobs_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY export_jobs_tenant_read ON public.export_jobs FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: export_jobs export_jobs_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY export_jobs_tenant_write ON public.export_jobs TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: form_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: form_submissions form_submissions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_submissions_tenant_read ON public.form_submissions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: form_submissions form_submissions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY form_submissions_tenant_write ON public.form_submissions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fraud_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fraud_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: fraud_assessments fraud_assessments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_assessments_tenant_read ON public.fraud_assessments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fraud_assessments fraud_assessments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_assessments_tenant_write ON public.fraud_assessments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fraud_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fraud_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: fraud_audit fraud_audit_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_audit_tenant_read ON public.fraud_audit FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fraud_audit fraud_audit_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_audit_tenant_write ON public.fraud_audit TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fraud_blacklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fraud_blacklist ENABLE ROW LEVEL SECURITY;

--
-- Name: fraud_blacklist fraud_blacklist_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_blacklist_tenant_read ON public.fraud_blacklist FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fraud_blacklist fraud_blacklist_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_blacklist_tenant_write ON public.fraud_blacklist TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fraud_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fraud_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: fraud_cases fraud_cases_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_cases_tenant_read ON public.fraud_cases FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fraud_cases fraud_cases_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_cases_tenant_write ON public.fraud_cases TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fraud_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fraud_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: fraud_rules fraud_rules_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_rules_tenant_read ON public.fraud_rules FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fraud_rules fraud_rules_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fraud_rules_tenant_write ON public.fraud_rules TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fulfilment_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fulfilment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: fulfilment_items fulfilment_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fulfilment_items_tenant_read ON public.fulfilment_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fulfilment_items fulfilment_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fulfilment_items_tenant_write ON public.fulfilment_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fulfilments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fulfilments ENABLE ROW LEVEL SECURITY;

--
-- Name: fulfilments fulfilments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fulfilments_tenant_read ON public.fulfilments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: fulfilments fulfilments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fulfilments_tenant_write ON public.fulfilments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: fx_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: fx_rates fx_rates_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fx_rates_platform_only ON public.fx_rates TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: gateway_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gateway_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: gateway_accounts gateway_accounts_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gateway_accounts_tenant_read ON public.gateway_accounts FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: gateway_accounts gateway_accounts_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gateway_accounts_tenant_write ON public.gateway_accounts TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: gift_card_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_card_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_card_entries gift_card_entries_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_card_entries_tenant_read ON public.gift_card_entries FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: gift_card_entries gift_card_entries_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_card_entries_tenant_write ON public.gift_card_entries TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: gift_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_cards gift_cards_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_cards_tenant_read ON public.gift_cards FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: gift_cards gift_cards_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_cards_tenant_write ON public.gift_cards TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: impersonation_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.impersonation_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: impersonation_grants impersonation_grants_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY impersonation_grants_tenant_read ON public.impersonation_grants FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: impersonation_grants impersonation_grants_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY impersonation_grants_tenant_write ON public.impersonation_grants TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: inventory_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_levels inventory_levels_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_levels_tenant_read ON public.inventory_levels FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: inventory_levels inventory_levels_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_levels_tenant_write ON public.inventory_levels TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: inventory_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_locations inventory_locations_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_locations_tenant_read ON public.inventory_locations FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: inventory_locations inventory_locations_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_locations_tenant_write ON public.inventory_locations TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: inventory_transfer_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transfer_items inventory_transfer_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_transfer_items_tenant_read ON public.inventory_transfer_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: inventory_transfer_items inventory_transfer_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_transfer_items_tenant_write ON public.inventory_transfer_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: inventory_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transfers inventory_transfers_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_transfers_tenant_read ON public.inventory_transfers FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: inventory_transfers inventory_transfers_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_transfers_tenant_write ON public.inventory_transfers TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_tenant_read ON public.invoices FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: invoices invoices_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_tenant_write ON public.invoices TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: local_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.local_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: local_transactions local_transactions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY local_transactions_tenant_read ON public.local_transactions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: local_transactions local_transactions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY local_transactions_tenant_write ON public.local_transactions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: marketplace_installs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_installs ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_installs marketplace_installs_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_installs_tenant_read ON public.marketplace_installs FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: marketplace_installs marketplace_installs_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_installs_tenant_write ON public.marketplace_installs TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: marketplace_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_reviews marketplace_reviews_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_reviews_tenant_read ON public.marketplace_reviews FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: marketplace_reviews marketplace_reviews_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_reviews_tenant_write ON public.marketplace_reviews TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: marketplace_themes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_themes ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_themes marketplace_themes_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_themes_platform_only ON public.marketplace_themes TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: marketplace_widgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_widgets ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_widgets marketplace_widgets_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_widgets_platform_only ON public.marketplace_widgets TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: media_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: media_assets media_assets_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_assets_tenant_read ON public.media_assets FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: media_assets media_assets_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_assets_tenant_write ON public.media_assets TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: merchant_kyc; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchant_kyc ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_kyc merchant_kyc_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_kyc_tenant_read ON public.merchant_kyc FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: merchant_kyc merchant_kyc_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_kyc_tenant_write ON public.merchant_kyc TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: merchant_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_members merchant_members_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_members_manage ON public.merchant_members TO authenticated USING ((public.is_merchant_admin(merchant_id) OR public.is_platform_admin())) WITH CHECK ((public.is_merchant_admin(merchant_id) OR public.is_platform_admin()));


--
-- Name: merchant_members merchant_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_members_read ON public.merchant_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: merchant_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchant_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_settings merchant_settings_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_settings_tenant_read ON public.merchant_settings FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: merchant_settings merchant_settings_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_settings_tenant_write ON public.merchant_settings TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: merchant_suspensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchant_suspensions ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_suspensions merchant_suspensions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_suspensions_tenant_read ON public.merchant_suspensions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: merchant_suspensions merchant_suspensions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchant_suspensions_tenant_write ON public.merchant_suspensions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: merchants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

--
-- Name: merchants merchants_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchants_manage ON public.merchants TO authenticated USING ((public.is_merchant_admin(id) OR public.is_platform_admin())) WITH CHECK ((public.is_merchant_admin(id) OR public.is_platform_admin()));


--
-- Name: merchants merchants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY merchants_read ON public.merchants FOR SELECT TO authenticated USING ((public.is_merchant_member(id) OR public.is_platform_admin()));


--
-- Name: metafield_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metafield_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: metafield_definitions metafield_definitions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metafield_definitions_tenant_read ON public.metafield_definitions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: metafield_definitions metafield_definitions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metafield_definitions_tenant_write ON public.metafield_definitions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: metafields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metafields ENABLE ROW LEVEL SECURITY;

--
-- Name: metafields metafields_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metafields_tenant_read ON public.metafields FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: metafields metafields_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metafields_tenant_write ON public.metafields TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_tenant_read ON public.notifications FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: notifications notifications_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_tenant_write ON public.notifications TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: ops_backup_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_backup_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_backup_runs ops_backup_runs_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_backup_runs_platform_only ON public.ops_backup_runs TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: ops_incident_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_incident_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_incident_updates ops_incident_updates_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_incident_updates_platform_only ON public.ops_incident_updates TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: ops_incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_incidents ops_incidents_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_incidents_platform_only ON public.ops_incidents TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: ops_retention_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_retention_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_retention_runs ops_retention_runs_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_retention_runs_platform_only ON public.ops_retention_runs TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: ops_status_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_status_components ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_status_components ops_status_components_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_status_components_platform_only ON public.ops_status_components TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: order_amendments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_amendments ENABLE ROW LEVEL SECURITY;

--
-- Name: order_amendments order_amendments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_amendments_tenant_read ON public.order_amendments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: order_amendments order_amendments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_amendments_tenant_write ON public.order_amendments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: order_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

--
-- Name: order_events order_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_events_tenant_read ON public.order_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: order_events order_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_events_tenant_write ON public.order_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: order_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: order_invoices order_invoices_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_invoices_tenant_read ON public.order_invoices FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: order_invoices order_invoices_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_invoices_tenant_write ON public.order_invoices TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_tenant_read ON public.order_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: order_items order_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_tenant_write ON public.order_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: order_status_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_transitions order_status_transitions_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_status_transitions_platform_only ON public.order_status_transitions TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_tenant_read ON public.orders FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: orders orders_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_tenant_write ON public.orders TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_tenant_read ON public.payments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: payments payments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_tenant_write ON public.payments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: plan_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_definitions plan_definitions_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_definitions_platform_only ON public.plan_definitions TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: plan_definitions plan_definitions_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_definitions_public_read ON public.plan_definitions FOR SELECT TO authenticated, anon USING ((active = true));


--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_read ON public.platform_admins FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: platform_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_audit_log platform_audit_log_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_audit_log_platform_only ON public.platform_audit_log TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: platform_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_flags platform_flags_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_flags_platform_only ON public.platform_flags TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: pos_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_orders pos_orders_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_orders_tenant_read ON public.pos_orders FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: pos_orders pos_orders_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_orders_tenant_write ON public.pos_orders TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: pos_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_payments pos_payments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_payments_tenant_read ON public.pos_payments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: pos_payments pos_payments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_payments_tenant_write ON public.pos_payments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: pos_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_refunds pos_refunds_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_refunds_tenant_read ON public.pos_refunds FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: pos_refunds pos_refunds_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_refunds_tenant_write ON public.pos_refunds TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: pos_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_sessions pos_sessions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_sessions_tenant_read ON public.pos_sessions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: pos_sessions pos_sessions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_sessions_tenant_write ON public.pos_sessions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: product_bundles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;

--
-- Name: product_bundles product_bundles_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_bundles_tenant_read ON public.product_bundles FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: product_bundles product_bundles_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_bundles_tenant_write ON public.product_bundles TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews product_reviews_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_reviews_tenant_read ON public.product_reviews FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: product_reviews product_reviews_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_reviews_tenant_write ON public.product_reviews TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants product_variants_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_tenant_read ON public.product_variants FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: product_variants product_variants_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_variants_tenant_write ON public.product_variants TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_tenant_read ON public.products FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: products products_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_tenant_write ON public.products TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_platform_only ON public.profiles TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: rate_limit_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_counters rate_limit_counters_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_limit_counters_platform_only ON public.rate_limit_counters TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: refund_status_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refund_status_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: refund_status_transitions refund_status_transitions_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refund_status_transitions_platform_only ON public.refund_status_transitions TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds refunds_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refunds_tenant_read ON public.refunds FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: refunds refunds_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refunds_tenant_write ON public.refunds TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: return_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_events ENABLE ROW LEVEL SECURITY;

--
-- Name: return_events return_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_events_tenant_read ON public.return_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: return_events return_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_events_tenant_write ON public.return_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: return_items return_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_items_tenant_read ON public.return_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: return_items return_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_items_tenant_write ON public.return_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: return_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: return_requests return_requests_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_requests_tenant_read ON public.return_requests FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: return_requests return_requests_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_requests_tenant_write ON public.return_requests TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: review_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: review_replies review_replies_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_replies_tenant_read ON public.review_replies FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: review_replies review_replies_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_replies_tenant_write ON public.review_replies TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

--
-- Name: segments segments_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_tenant_read ON public.segments FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: segments segments_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY segments_tenant_write ON public.segments TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: seo_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seo_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: seo_meta_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seo_meta_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: seo_meta_audit seo_meta_audit_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seo_meta_audit_tenant_read ON public.seo_meta_audit FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: seo_meta_audit seo_meta_audit_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seo_meta_audit_tenant_write ON public.seo_meta_audit TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: seo_meta seo_meta_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seo_meta_tenant_read ON public.seo_meta FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: seo_meta seo_meta_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seo_meta_tenant_write ON public.seo_meta TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: service_offerings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_offerings ENABLE ROW LEVEL SECURITY;

--
-- Name: service_offerings service_offerings_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_offerings_tenant_read ON public.service_offerings FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: service_offerings service_offerings_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_offerings_tenant_write ON public.service_offerings TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: settlement_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settlement_files ENABLE ROW LEVEL SECURITY;

--
-- Name: settlement_files settlement_files_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settlement_files_tenant_read ON public.settlement_files FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: settlement_files settlement_files_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settlement_files_tenant_write ON public.settlement_files TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: settlement_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settlement_items ENABLE ROW LEVEL SECURITY;

--
-- Name: settlement_items settlement_items_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settlement_items_tenant_read ON public.settlement_items FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: settlement_items settlement_items_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settlement_items_tenant_write ON public.settlement_items TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: settlement_variance_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settlement_variance_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: settlement_variance_alerts settlement_variance_alerts_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settlement_variance_alerts_tenant_read ON public.settlement_variance_alerts FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: settlement_variance_alerts settlement_variance_alerts_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settlement_variance_alerts_tenant_write ON public.settlement_variance_alerts TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: shipment_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_quotes shipment_quotes_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipment_quotes_tenant_read ON public.shipment_quotes FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: shipment_quotes shipment_quotes_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipment_quotes_tenant_write ON public.shipment_quotes TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: shipping_rate_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipping_rate_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: shipping_rate_rules shipping_rate_rules_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipping_rate_rules_tenant_read ON public.shipping_rate_rules FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: shipping_rate_rules shipping_rate_rules_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipping_rate_rules_tenant_write ON public.shipping_rate_rules TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: shipping_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: shipping_zones shipping_zones_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipping_zones_tenant_read ON public.shipping_zones FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: shipping_zones shipping_zones_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipping_zones_tenant_write ON public.shipping_zones TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: staff_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_audit staff_audit_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_audit_tenant_read ON public.staff_audit FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: staff_audit staff_audit_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_audit_tenant_write ON public.staff_audit TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: staff_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_roles staff_roles_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_roles_tenant_read ON public.staff_roles FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: staff_roles staff_roles_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_roles_tenant_write ON public.staff_roles TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: step_up_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.step_up_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: step_up_grants step_up_grants_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY step_up_grants_tenant_read ON public.step_up_grants FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: step_up_grants step_up_grants_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY step_up_grants_tenant_write ON public.step_up_grants TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: stock_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_holds stock_holds_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_holds_tenant_read ON public.stock_holds FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: stock_holds stock_holds_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_holds_tenant_write ON public.stock_holds TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: store_themes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.store_themes ENABLE ROW LEVEL SECURITY;

--
-- Name: store_themes store_themes_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY store_themes_tenant_read ON public.store_themes FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: store_themes store_themes_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY store_themes_tenant_write ON public.store_themes TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: storefront_forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storefront_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: storefront_forms storefront_forms_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storefront_forms_tenant_read ON public.storefront_forms FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: storefront_forms storefront_forms_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storefront_forms_tenant_write ON public.storefront_forms TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: storefront_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storefront_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: storefront_pages storefront_pages_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storefront_pages_tenant_read ON public.storefront_pages FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: storefront_pages storefront_pages_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storefront_pages_tenant_write ON public.storefront_pages TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: subscribers subscribers_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscribers_tenant_read ON public.subscribers FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: subscribers subscribers_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscribers_tenant_write ON public.subscribers TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: subscription_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_terms subscription_terms_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_terms_tenant_read ON public.subscription_terms FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: subscription_terms subscription_terms_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_terms_tenant_write ON public.subscription_terms TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_tenant_read ON public.subscriptions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: subscriptions subscriptions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_tenant_write ON public.subscriptions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: tenant_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_limits tenant_limits_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_limits_tenant_read ON public.tenant_limits FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: tenant_limits tenant_limits_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_limits_tenant_write ON public.tenant_limits TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: tenant_purge_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_purge_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_purge_requests tenant_purge_requests_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_purge_requests_tenant_read ON public.tenant_purge_requests FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: tenant_purge_requests tenant_purge_requests_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_purge_requests_tenant_write ON public.tenant_purge_requests TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: theme_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_audit theme_audit_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_audit_tenant_read ON public.theme_audit FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: theme_audit theme_audit_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_audit_tenant_write ON public.theme_audit TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: theme_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_drafts theme_drafts_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_drafts_tenant_read ON public.theme_drafts FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: theme_drafts theme_drafts_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_drafts_tenant_write ON public.theme_drafts TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: theme_registry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_registry ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_registry theme_registry_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_registry_platform_only ON public.theme_registry TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: theme_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_schedules theme_schedules_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_schedules_tenant_read ON public.theme_schedules FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: theme_schedules theme_schedules_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_schedules_tenant_write ON public.theme_schedules TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: theme_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_versions theme_versions_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_versions_tenant_read ON public.theme_versions FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: theme_versions theme_versions_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_versions_tenant_write ON public.theme_versions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: trial_fingerprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_fingerprints ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_fingerprints trial_fingerprints_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trial_fingerprints_platform_only ON public.trial_fingerprints TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: vat_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vat_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: vat_rates vat_rates_platform_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vat_rates_platform_only ON public.vat_rates TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: wallet_ledger_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_ledger_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: wallet_ledger_entries wallet_ledger_entries_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_ledger_entries_tenant_read ON public.wallet_ledger_entries FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: wallet_ledger_entries wallet_ledger_entries_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_ledger_entries_tenant_write ON public.wallet_ledger_entries TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events webhook_events_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_events_tenant_read ON public.webhook_events FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));


--
-- Name: webhook_events webhook_events_tenant_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_events_tenant_write ON public.webhook_events TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON SCHEMA public TO sandbox_exec;


--
-- Name: FUNCTION cod_clear_variance(_recon_id uuid, _note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cod_clear_variance(_recon_id uuid, _note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cod_clear_variance(_recon_id uuid, _note text) TO service_role;
GRANT ALL ON FUNCTION public.cod_clear_variance(_recon_id uuid, _note text) TO authenticated;


--
-- Name: TABLE cod_reconciliations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cod_reconciliations TO authenticated;
GRANT ALL ON TABLE public.cod_reconciliations TO service_role;


--
-- Name: FUNCTION cod_reconcile(_order_id uuid, _collected_minor bigint, _carrier_code text, _note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cod_reconcile(_order_id uuid, _collected_minor bigint, _carrier_code text, _note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cod_reconcile(_order_id uuid, _collected_minor bigint, _carrier_code text, _note text) TO service_role;
GRANT ALL ON FUNCTION public.cod_reconcile(_order_id uuid, _collected_minor bigint, _carrier_code text, _note text) TO authenticated;


--
-- Name: FUNCTION customer_order_detail(_merchant_id uuid, _order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.customer_order_detail(_merchant_id uuid, _order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.customer_order_detail(_merchant_id uuid, _order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.customer_order_detail(_merchant_id uuid, _order_id uuid) TO service_role;


--
-- Name: FUNCTION customer_overview(_merchant_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.customer_overview(_merchant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.customer_overview(_merchant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.customer_overview(_merchant_id uuid) TO service_role;


--
-- Name: FUNCTION customer_require_self(_merchant_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.customer_require_self(_merchant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.customer_require_self(_merchant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.customer_require_self(_merchant_id uuid) TO service_role;


--
-- Name: FUNCTION is_merchant_admin(_merchant_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_merchant_admin(_merchant_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_merchant_admin(_merchant_id uuid, _user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_merchant_admin(_merchant_id uuid, _user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_merchant_member(_merchant_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_merchant_member(_merchant_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_merchant_member(_merchant_id uuid, _user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_merchant_member(_merchant_id uuid, _user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_platform_admin(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_platform_admin(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_admin(_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_platform_admin(_user_id uuid) TO authenticated;


--
-- Name: FUNCTION notify_staff(_merchant_id uuid, _kind text, _severity public.notification_severity, _title_en text, _title_bn text, _body_en text, _body_bn text, _href text, _entity_id uuid, _dedupe text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_staff(_merchant_id uuid, _kind text, _severity public.notification_severity, _title_en text, _title_bn text, _body_en text, _body_bn text, _href text, _entity_id uuid, _dedupe text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_staff(_merchant_id uuid, _kind text, _severity public.notification_severity, _title_en text, _title_bn text, _body_en text, _body_bn text, _href text, _entity_id uuid, _dedupe text) TO service_role;
GRANT ALL ON FUNCTION public.notify_staff(_merchant_id uuid, _kind text, _severity public.notification_severity, _title_en text, _title_bn text, _body_en text, _body_bn text, _href text, _entity_id uuid, _dedupe text) TO authenticated;


--
-- Name: FUNCTION order_try_advance(_order_id uuid, _to public.order_status, _note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.order_try_advance(_order_id uuid, _to public.order_status, _note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.order_try_advance(_order_id uuid, _to public.order_status, _note text) TO service_role;
GRANT ALL ON FUNCTION public.order_try_advance(_order_id uuid, _to public.order_status, _note text) TO authenticated;


--
-- Name: FUNCTION pos_default_location(_merchant_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_default_location(_merchant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_default_location(_merchant_id uuid) TO service_role;


--
-- Name: FUNCTION pos_move_stock(_merchant_id uuid, _location_id uuid, _variant_id uuid, _delta bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_move_stock(_merchant_id uuid, _location_id uuid, _variant_id uuid, _delta bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_move_stock(_merchant_id uuid, _location_id uuid, _variant_id uuid, _delta bigint) TO service_role;


--
-- Name: FUNCTION pos_note_sync(_merchant_id uuid, _client_id uuid, _payload jsonb, _status public.sync_status); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_note_sync(_merchant_id uuid, _client_id uuid, _payload jsonb, _status public.sync_status) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_note_sync(_merchant_id uuid, _client_id uuid, _payload jsonb, _status public.sync_status) TO service_role;


--
-- Name: FUNCTION pos_refund(_merchant_id uuid, _pos_order_id uuid, _staff_user_id uuid, _idempotency_key text, _amount_minor_int bigint, _method public.pos_payment_method, _reason text, _restock boolean, _lines jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_refund(_merchant_id uuid, _pos_order_id uuid, _staff_user_id uuid, _idempotency_key text, _amount_minor_int bigint, _method public.pos_payment_method, _reason text, _restock boolean, _lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_refund(_merchant_id uuid, _pos_order_id uuid, _staff_user_id uuid, _idempotency_key text, _amount_minor_int bigint, _method public.pos_payment_method, _reason text, _restock boolean, _lines jsonb) TO service_role;


--
-- Name: FUNCTION pos_sale_capture(_merchant_id uuid, _session_id uuid, _client_id uuid, _origin public.pos_origin, _lines jsonb, _tenders jsonb, _discount_minor_int bigint, _customer jsonb, _captured_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_sale_capture(_merchant_id uuid, _session_id uuid, _client_id uuid, _origin public.pos_origin, _lines jsonb, _tenders jsonb, _discount_minor_int bigint, _customer jsonb, _captured_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_sale_capture(_merchant_id uuid, _session_id uuid, _client_id uuid, _origin public.pos_origin, _lines jsonb, _tenders jsonb, _discount_minor_int bigint, _customer jsonb, _captured_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION pos_shift_report(_merchant_id uuid, _session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_shift_report(_merchant_id uuid, _session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_shift_report(_merchant_id uuid, _session_id uuid) TO service_role;


--
-- Name: TABLE refunds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refunds TO authenticated;
GRANT ALL ON TABLE public.refunds TO service_role;


--
-- Name: FUNCTION refund_advance(_refund_id uuid, _to text, _provider_reference text, _failure_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refund_advance(_refund_id uuid, _to text, _provider_reference text, _failure_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_advance(_refund_id uuid, _to text, _provider_reference text, _failure_code text) TO service_role;
GRANT ALL ON FUNCTION public.refund_advance(_refund_id uuid, _to text, _provider_reference text, _failure_code text) TO authenticated;


--
-- Name: FUNCTION refund_capture_state(_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refund_capture_state(_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_capture_state(_order_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.refund_capture_state(_order_id uuid) TO authenticated;


--
-- Name: FUNCTION refund_request(_order_id uuid, _amount_minor bigint, _reason text, _refund_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refund_request(_order_id uuid, _amount_minor bigint, _reason text, _refund_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refund_request(_order_id uuid, _amount_minor bigint, _reason text, _refund_key text) TO service_role;
GRANT ALL ON FUNCTION public.refund_request(_order_id uuid, _amount_minor bigint, _reason text, _refund_key text) TO authenticated;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE settlement_files; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.settlement_files TO authenticated;
GRANT ALL ON TABLE public.settlement_files TO service_role;


--
-- Name: FUNCTION settlement_ingest(_merchant_id uuid, _provider text, _file_date date, _file_hash text, _items jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.settlement_ingest(_merchant_id uuid, _provider text, _file_date date, _file_hash text, _items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.settlement_ingest(_merchant_id uuid, _provider text, _file_date date, _file_hash text, _items jsonb) TO service_role;


--
-- Name: FUNCTION settlement_resolve_alert(_alert_id uuid, _note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.settlement_resolve_alert(_alert_id uuid, _note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.settlement_resolve_alert(_alert_id uuid, _note text) TO service_role;


--
-- Name: TABLE abandoned_carts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.abandoned_carts TO authenticated;
GRANT ALL ON TABLE public.abandoned_carts TO service_role;


--
-- Name: TABLE activity_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.activity_log TO authenticated;
GRANT ALL ON TABLE public.activity_log TO service_role;


--
-- Name: TABLE ai_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_conversations TO authenticated;
GRANT ALL ON TABLE public.ai_conversations TO service_role;


--
-- Name: TABLE ai_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_messages TO authenticated;
GRANT ALL ON TABLE public.ai_messages TO service_role;


--
-- Name: TABLE api_key_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.api_key_events TO authenticated;
GRANT ALL ON TABLE public.api_key_events TO service_role;


--
-- Name: TABLE api_keys; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;


--
-- Name: TABLE approval_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.approval_requests TO authenticated;
GRANT ALL ON TABLE public.approval_requests TO service_role;


--
-- Name: TABLE articles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.articles TO authenticated;
GRANT ALL ON TABLE public.articles TO service_role;


--
-- Name: TABLE auth_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.auth_events TO authenticated;
GRANT ALL ON TABLE public.auth_events TO service_role;


--
-- Name: TABLE auth_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.auth_sessions TO authenticated;
GRANT ALL ON TABLE public.auth_sessions TO service_role;


--
-- Name: TABLE billing_dunning_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.billing_dunning_attempts TO authenticated;
GRANT ALL ON TABLE public.billing_dunning_attempts TO service_role;


--
-- Name: TABLE billing_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.billing_events TO authenticated;
GRANT ALL ON TABLE public.billing_events TO service_role;


--
-- Name: TABLE brands; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.brands TO authenticated;
GRANT ALL ON TABLE public.brands TO service_role;


--
-- Name: TABLE bundle_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bundle_items TO authenticated;
GRANT ALL ON TABLE public.bundle_items TO service_role;


--
-- Name: TABLE campaign_sends; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaign_sends TO authenticated;
GRANT ALL ON TABLE public.campaign_sends TO service_role;


--
-- Name: TABLE campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;


--
-- Name: TABLE carrier_shipments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.carrier_shipments TO authenticated;
GRANT ALL ON TABLE public.carrier_shipments TO service_role;


--
-- Name: TABLE carriers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.carriers TO authenticated;
GRANT ALL ON TABLE public.carriers TO service_role;


--
-- Name: TABLE catalog_import_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.catalog_import_jobs TO authenticated;
GRANT ALL ON TABLE public.catalog_import_jobs TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE charge_intent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.charge_intent_events TO authenticated;
GRANT ALL ON TABLE public.charge_intent_events TO service_role;


--
-- Name: TABLE charge_intents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.charge_intents TO authenticated;
GRANT ALL ON TABLE public.charge_intents TO service_role;


--
-- Name: TABLE cod_settlements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cod_settlements TO authenticated;
GRANT ALL ON TABLE public.cod_settlements TO service_role;


--
-- Name: TABLE collection_products; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.collection_products TO authenticated;
GRANT ALL ON TABLE public.collection_products TO service_role;


--
-- Name: TABLE collections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.collections TO authenticated;
GRANT ALL ON TABLE public.collections TO service_role;


--
-- Name: TABLE consent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.consent_events TO authenticated;
GRANT ALL ON TABLE public.consent_events TO service_role;


--
-- Name: TABLE coupon_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.coupon_redemptions TO authenticated;
GRANT ALL ON TABLE public.coupon_redemptions TO service_role;


--
-- Name: TABLE coupons; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;


--
-- Name: TABLE courier_labels; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_labels TO authenticated;
GRANT ALL ON TABLE public.courier_labels TO service_role;


--
-- Name: TABLE courier_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_webhook_events TO authenticated;
GRANT ALL ON TABLE public.courier_webhook_events TO service_role;


--
-- Name: TABLE customer_addresses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_addresses TO authenticated;
GRANT ALL ON TABLE public.customer_addresses TO service_role;


--
-- Name: TABLE customer_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_consents TO authenticated;
GRANT ALL ON TABLE public.customer_consents TO service_role;


--
-- Name: TABLE customer_wishlist_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_wishlist_items TO authenticated;
GRANT ALL ON TABLE public.customer_wishlist_items TO service_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- Name: TABLE delivery_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_events TO authenticated;
GRANT ALL ON TABLE public.delivery_events TO service_role;


--
-- Name: TABLE digital_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.digital_assets TO authenticated;
GRANT ALL ON TABLE public.digital_assets TO service_role;


--
-- Name: TABLE digital_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.digital_grants TO authenticated;
GRANT ALL ON TABLE public.digital_grants TO service_role;


--
-- Name: TABLE dispute_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.dispute_events TO authenticated;
GRANT ALL ON TABLE public.dispute_events TO service_role;


--
-- Name: TABLE disputes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.disputes TO authenticated;
GRANT ALL ON TABLE public.disputes TO service_role;


--
-- Name: TABLE export_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.export_jobs TO authenticated;
GRANT ALL ON TABLE public.export_jobs TO service_role;


--
-- Name: TABLE form_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.form_submissions TO authenticated;
GRANT ALL ON TABLE public.form_submissions TO service_role;


--
-- Name: TABLE fraud_assessments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fraud_assessments TO authenticated;
GRANT ALL ON TABLE public.fraud_assessments TO service_role;


--
-- Name: TABLE fraud_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fraud_audit TO authenticated;
GRANT ALL ON TABLE public.fraud_audit TO service_role;


--
-- Name: TABLE fraud_blacklist; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fraud_blacklist TO authenticated;
GRANT ALL ON TABLE public.fraud_blacklist TO service_role;


--
-- Name: TABLE fraud_cases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fraud_cases TO authenticated;
GRANT ALL ON TABLE public.fraud_cases TO service_role;


--
-- Name: TABLE fraud_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fraud_rules TO authenticated;
GRANT ALL ON TABLE public.fraud_rules TO service_role;


--
-- Name: TABLE fulfilment_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfilment_items TO authenticated;
GRANT ALL ON TABLE public.fulfilment_items TO service_role;


--
-- Name: TABLE fulfilments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfilments TO authenticated;
GRANT ALL ON TABLE public.fulfilments TO service_role;


--
-- Name: TABLE fx_rates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fx_rates TO authenticated;
GRANT ALL ON TABLE public.fx_rates TO service_role;


--
-- Name: TABLE gateway_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.gateway_accounts TO authenticated;
GRANT ALL ON TABLE public.gateway_accounts TO service_role;


--
-- Name: TABLE gift_card_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.gift_card_entries TO authenticated;
GRANT ALL ON TABLE public.gift_card_entries TO service_role;


--
-- Name: TABLE gift_cards; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.gift_cards TO authenticated;
GRANT ALL ON TABLE public.gift_cards TO service_role;


--
-- Name: TABLE impersonation_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.impersonation_grants TO authenticated;
GRANT ALL ON TABLE public.impersonation_grants TO service_role;


--
-- Name: TABLE inventory_levels; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_levels TO authenticated;
GRANT ALL ON TABLE public.inventory_levels TO service_role;


--
-- Name: TABLE inventory_locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_locations TO authenticated;
GRANT ALL ON TABLE public.inventory_locations TO service_role;


--
-- Name: TABLE inventory_transfer_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_transfer_items TO authenticated;
GRANT ALL ON TABLE public.inventory_transfer_items TO service_role;


--
-- Name: TABLE inventory_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_transfers TO authenticated;
GRANT ALL ON TABLE public.inventory_transfers TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE local_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.local_transactions TO authenticated;
GRANT ALL ON TABLE public.local_transactions TO service_role;


--
-- Name: TABLE marketplace_installs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_installs TO authenticated;
GRANT ALL ON TABLE public.marketplace_installs TO service_role;


--
-- Name: TABLE marketplace_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_reviews TO authenticated;
GRANT ALL ON TABLE public.marketplace_reviews TO service_role;


--
-- Name: TABLE marketplace_themes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_themes TO authenticated;
GRANT ALL ON TABLE public.marketplace_themes TO service_role;


--
-- Name: TABLE marketplace_widgets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.marketplace_widgets TO authenticated;
GRANT ALL ON TABLE public.marketplace_widgets TO service_role;


--
-- Name: TABLE media_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.media_assets TO authenticated;
GRANT ALL ON TABLE public.media_assets TO service_role;


--
-- Name: TABLE merchant_kyc; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.merchant_kyc TO authenticated;
GRANT ALL ON TABLE public.merchant_kyc TO service_role;


--
-- Name: TABLE merchant_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.merchant_members TO authenticated;
GRANT ALL ON TABLE public.merchant_members TO service_role;


--
-- Name: TABLE merchant_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.merchant_settings TO authenticated;
GRANT ALL ON TABLE public.merchant_settings TO service_role;


--
-- Name: COLUMN merchant_settings.cod_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cod_enabled) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.cod_surcharge_minor_int; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cod_surcharge_minor_int) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.free_shipping_threshold_minor_int; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(free_shipping_threshold_minor_int) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.low_stock_threshold; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(low_stock_threshold) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.merchant_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(merchant_id) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.mfs_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(mfs_enabled) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.notify_prefs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(notify_prefs) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.prices_include_vat; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(prices_include_vat) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.setup_dismissed_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(setup_dismissed_at) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.setup_steps; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(setup_steps) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.ship_address_line; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ship_address_line) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.ship_city; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ship_city) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.ship_postcode; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ship_postcode) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.shipping_flat_minor_int; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(shipping_flat_minor_int) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.support_email; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(support_email) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.support_phone; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(support_phone) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.tagline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(tagline) ON TABLE public.merchant_settings TO anon;


--
-- Name: COLUMN merchant_settings.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.merchant_settings TO anon;


--
-- Name: TABLE merchant_suspensions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.merchant_suspensions TO authenticated;
GRANT ALL ON TABLE public.merchant_suspensions TO service_role;


--
-- Name: TABLE merchants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.merchants TO authenticated;
GRANT ALL ON TABLE public.merchants TO service_role;


--
-- Name: TABLE metafield_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.metafield_definitions TO authenticated;
GRANT ALL ON TABLE public.metafield_definitions TO service_role;


--
-- Name: TABLE metafields; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.metafields TO authenticated;
GRANT ALL ON TABLE public.metafields TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE ops_backup_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ops_backup_runs TO authenticated;
GRANT ALL ON TABLE public.ops_backup_runs TO service_role;


--
-- Name: TABLE ops_incident_updates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ops_incident_updates TO authenticated;
GRANT ALL ON TABLE public.ops_incident_updates TO service_role;


--
-- Name: TABLE ops_incidents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ops_incidents TO authenticated;
GRANT ALL ON TABLE public.ops_incidents TO service_role;


--
-- Name: TABLE ops_retention_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ops_retention_runs TO authenticated;
GRANT ALL ON TABLE public.ops_retention_runs TO service_role;


--
-- Name: TABLE ops_status_components; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ops_status_components TO authenticated;
GRANT ALL ON TABLE public.ops_status_components TO service_role;


--
-- Name: TABLE order_amendments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_amendments TO authenticated;
GRANT ALL ON TABLE public.order_amendments TO service_role;


--
-- Name: TABLE order_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_events TO authenticated;
GRANT ALL ON TABLE public.order_events TO service_role;


--
-- Name: TABLE order_invoices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_invoices TO authenticated;
GRANT ALL ON TABLE public.order_invoices TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE order_status_transitions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_status_transitions TO authenticated;
GRANT ALL ON TABLE public.order_status_transitions TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE plan_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.plan_definitions TO authenticated;
GRANT ALL ON TABLE public.plan_definitions TO service_role;
GRANT SELECT ON TABLE public.plan_definitions TO anon;


--
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_admins TO authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;


--
-- Name: TABLE platform_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_audit_log TO authenticated;
GRANT ALL ON TABLE public.platform_audit_log TO service_role;


--
-- Name: TABLE platform_flags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_flags TO authenticated;
GRANT ALL ON TABLE public.platform_flags TO service_role;


--
-- Name: TABLE pos_orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pos_orders TO authenticated;
GRANT ALL ON TABLE public.pos_orders TO service_role;


--
-- Name: TABLE pos_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pos_payments TO authenticated;
GRANT ALL ON TABLE public.pos_payments TO service_role;


--
-- Name: TABLE pos_refunds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pos_refunds TO authenticated;
GRANT ALL ON TABLE public.pos_refunds TO service_role;


--
-- Name: TABLE pos_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pos_sessions TO authenticated;
GRANT ALL ON TABLE public.pos_sessions TO service_role;


--
-- Name: TABLE product_bundles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_bundles TO authenticated;
GRANT ALL ON TABLE public.product_bundles TO service_role;


--
-- Name: TABLE product_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_reviews TO authenticated;
GRANT ALL ON TABLE public.product_reviews TO service_role;


--
-- Name: TABLE product_variants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_variants TO authenticated;
GRANT ALL ON TABLE public.product_variants TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE rate_limit_counters; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rate_limit_counters TO authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;


--
-- Name: TABLE refund_status_transitions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refund_status_transitions TO authenticated;
GRANT ALL ON TABLE public.refund_status_transitions TO service_role;


--
-- Name: TABLE return_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.return_events TO authenticated;
GRANT ALL ON TABLE public.return_events TO service_role;


--
-- Name: TABLE return_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.return_items TO authenticated;
GRANT ALL ON TABLE public.return_items TO service_role;


--
-- Name: TABLE return_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.return_requests TO authenticated;
GRANT ALL ON TABLE public.return_requests TO service_role;


--
-- Name: TABLE review_replies; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.review_replies TO authenticated;
GRANT ALL ON TABLE public.review_replies TO service_role;


--
-- Name: TABLE segments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.segments TO authenticated;
GRANT ALL ON TABLE public.segments TO service_role;


--
-- Name: TABLE seo_meta; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.seo_meta TO authenticated;
GRANT ALL ON TABLE public.seo_meta TO service_role;


--
-- Name: TABLE seo_meta_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.seo_meta_audit TO authenticated;
GRANT ALL ON TABLE public.seo_meta_audit TO service_role;


--
-- Name: TABLE service_offerings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_offerings TO authenticated;
GRANT ALL ON TABLE public.service_offerings TO service_role;


--
-- Name: TABLE settlement_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.settlement_items TO authenticated;
GRANT ALL ON TABLE public.settlement_items TO service_role;


--
-- Name: TABLE settlement_variance_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.settlement_variance_alerts TO authenticated;
GRANT ALL ON TABLE public.settlement_variance_alerts TO service_role;


--
-- Name: TABLE shipment_quotes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shipment_quotes TO authenticated;
GRANT ALL ON TABLE public.shipment_quotes TO service_role;


--
-- Name: TABLE shipping_rate_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shipping_rate_rules TO authenticated;
GRANT ALL ON TABLE public.shipping_rate_rules TO service_role;


--
-- Name: TABLE shipping_zones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shipping_zones TO authenticated;
GRANT ALL ON TABLE public.shipping_zones TO service_role;


--
-- Name: TABLE staff_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.staff_audit TO authenticated;
GRANT ALL ON TABLE public.staff_audit TO service_role;


--
-- Name: TABLE staff_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.staff_roles TO authenticated;
GRANT ALL ON TABLE public.staff_roles TO service_role;


--
-- Name: TABLE step_up_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.step_up_grants TO authenticated;
GRANT ALL ON TABLE public.step_up_grants TO service_role;


--
-- Name: TABLE stock_holds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stock_holds TO authenticated;
GRANT ALL ON TABLE public.stock_holds TO service_role;


--
-- Name: TABLE store_themes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.store_themes TO authenticated;
GRANT ALL ON TABLE public.store_themes TO service_role;


--
-- Name: TABLE storefront_forms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.storefront_forms TO authenticated;
GRANT ALL ON TABLE public.storefront_forms TO service_role;


--
-- Name: TABLE storefront_pages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.storefront_pages TO authenticated;
GRANT ALL ON TABLE public.storefront_pages TO service_role;


--
-- Name: TABLE subscribers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.subscribers TO authenticated;
GRANT ALL ON TABLE public.subscribers TO service_role;


--
-- Name: TABLE subscription_terms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.subscription_terms TO authenticated;
GRANT ALL ON TABLE public.subscription_terms TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE tenant_limits; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tenant_limits TO authenticated;
GRANT ALL ON TABLE public.tenant_limits TO service_role;


--
-- Name: TABLE tenant_purge_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tenant_purge_requests TO authenticated;
GRANT ALL ON TABLE public.tenant_purge_requests TO service_role;


--
-- Name: TABLE theme_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.theme_audit TO authenticated;
GRANT ALL ON TABLE public.theme_audit TO service_role;


--
-- Name: TABLE theme_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.theme_drafts TO authenticated;
GRANT ALL ON TABLE public.theme_drafts TO service_role;


--
-- Name: TABLE theme_registry; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.theme_registry TO authenticated;
GRANT ALL ON TABLE public.theme_registry TO service_role;


--
-- Name: TABLE theme_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.theme_schedules TO authenticated;
GRANT ALL ON TABLE public.theme_schedules TO service_role;


--
-- Name: TABLE theme_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.theme_versions TO authenticated;
GRANT ALL ON TABLE public.theme_versions TO service_role;


--
-- Name: TABLE trial_fingerprints; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.trial_fingerprints TO authenticated;
GRANT ALL ON TABLE public.trial_fingerprints TO service_role;


--
-- Name: TABLE vat_rates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.vat_rates TO authenticated;
GRANT ALL ON TABLE public.vat_rates TO service_role;


--
-- Name: TABLE wallet_ledger_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.wallet_ledger_entries TO authenticated;
GRANT ALL ON TABLE public.wallet_ledger_entries TO service_role;


--
-- Name: TABLE webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.webhook_events TO authenticated;
GRANT ALL ON TABLE public.webhook_events TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict tbgZ4nQThdo9UhgOVayn2ESdHZsyf07N3Ohy9LbgTvIgJOOs4gZioHgB3HcvA1Z

