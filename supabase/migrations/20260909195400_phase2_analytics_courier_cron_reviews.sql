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
