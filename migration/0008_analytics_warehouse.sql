-- Phase: analytics warehouse (traffic, clicks, geography) + real-user performance.
--
-- The application code has always spoken to this schema; it had never been
-- created, so every traffic read silently returned nothing. This migration
-- creates the raw event store, the daily rollups, the geography rollup, the
-- batch ledger, cohorts, scheduled reports, the ad-conversion outbox and the
-- web-vitals sample table, plus the routines the server calls by name.
--
-- Privacy: the raw store never receives an IP address, an email or a phone
-- number. Visitors and sessions arrive as a per-tenant, per-day salted digest
-- computed in the app. Geography is coarse (country, region, city name) and is
-- derived from the edge/GeoIP lookup server-side.

-- ---------------------------------------------------------------- raw events
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  entity text not null,
  action text not null,
  occurred_at timestamptz not null default now(),
  day date not null default (now() at time zone 'utc')::date,
  visitor_hash text not null default '',
  session_key text not null default '',
  source text not null default '',
  campaign text not null default '',
  value_minor_int bigint not null default 0,
  currency_code text not null default 'BDT',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  country_code text not null default '',
  region text not null default '',
  city text not null default '',
  asn integer,
  network text not null default '',
  device_class text not null default 'unknown',
  batch_id uuid,
  created_at timestamptz not null default now(),
  unique (merchant_id, dedupe_key)
);

create index if not exists analytics_events_merchant_day_idx
  on public.analytics_events (merchant_id, day desc);
create index if not exists analytics_events_unbatched_idx
  on public.analytics_events (merchant_id) where batch_id is null;
create index if not exists analytics_events_country_idx
  on public.analytics_events (merchant_id, day desc, country_code);

grant select on public.analytics_events to authenticated;
grant all on public.analytics_events to service_role;
alter table public.analytics_events enable row level security;

create policy analytics_events_tenant_read on public.analytics_events
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- --------------------------------------------------------------- daily rollup
create table if not exists public.analytics_daily (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  entity text not null,
  day date not null,
  totals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (merchant_id, entity, day)
);

grant select on public.analytics_daily to authenticated;
grant all on public.analytics_daily to service_role;
alter table public.analytics_daily enable row level security;

create policy analytics_daily_tenant_read on public.analytics_daily
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- ------------------------------------------------------------ geography rollup
create table if not exists public.analytics_geo_daily (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  day date not null,
  country_code text not null,
  region text not null default '',
  visitors bigint not null default 0,
  sessions bigint not null default 0,
  events bigint not null default 0,
  clicks bigint not null default 0,
  orders bigint not null default 0,
  revenue_minor_int bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (merchant_id, day, country_code, region)
);

create index if not exists analytics_geo_daily_day_idx on public.analytics_geo_daily (day desc);

grant select on public.analytics_geo_daily to authenticated;
grant all on public.analytics_geo_daily to service_role;
alter table public.analytics_geo_daily enable row level security;

create policy analytics_geo_tenant_read on public.analytics_geo_daily
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- --------------------------------------------------------------- batch ledger
create table if not exists public.analytics_batches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  previous_batch_id uuid references public.analytics_batches(id) on delete set null,
  status text not null default 'committed',
  event_count bigint not null default 0,
  gap_detected boolean not null default false,
  committed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists analytics_batches_merchant_idx
  on public.analytics_batches (merchant_id, created_at desc);

grant select on public.analytics_batches to authenticated;
grant all on public.analytics_batches to service_role;
alter table public.analytics_batches enable row level security;

create policy analytics_batches_tenant_read on public.analytics_batches
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- ------------------------------------------------------------------- cohorts
create table if not exists public.analytics_cohorts (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  cohort_week date not null,
  week_offset integer not null,
  customers bigint not null default 0,
  active_customers bigint not null default 0,
  orders bigint not null default 0,
  revenue_minor_int bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (merchant_id, cohort_week, week_offset)
);

grant select on public.analytics_cohorts to authenticated;
grant all on public.analytics_cohorts to service_role;
alter table public.analytics_cohorts enable row level security;

create policy analytics_cohorts_tenant_read on public.analytics_cohorts
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- ------------------------------------------------------- scheduled reports
create table if not exists public.analytics_reports (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  dataset text not null,
  dimensions jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '[]'::jsonb,
  range_days integer not null default 30,
  schedule text not null default 'off',
  format text not null default 'csv',
  recipients jsonb not null default '[]'::jsonb,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_reports_due_idx
  on public.analytics_reports (next_run_at) where schedule <> 'off';

grant select, insert, update, delete on public.analytics_reports to authenticated;
grant all on public.analytics_reports to service_role;
alter table public.analytics_reports enable row level security;

create policy analytics_reports_tenant_all on public.analytics_reports
  for all to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()))
  with check (public.is_merchant_member(merchant_id, auth.uid()));

create table if not exists public.analytics_report_runs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  report_id uuid not null references public.analytics_reports(id) on delete cascade,
  status text not null default 'running',
  row_count bigint not null default 0,
  error text,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists analytics_report_runs_idx
  on public.analytics_report_runs (merchant_id, created_at desc);

grant select, insert, update on public.analytics_report_runs to authenticated;
grant all on public.analytics_report_runs to service_role;
alter table public.analytics_report_runs enable row level security;

create policy analytics_report_runs_tenant_all on public.analytics_report_runs
  for all to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()))
  with check (public.is_merchant_member(merchant_id, auth.uid()));

-- --------------------------------------------------- ad conversion outbox
create table if not exists public.analytics_conversion_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider text not null,
  event_name text not null,
  event_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  value_minor_int bigint not null default 0,
  currency_code text not null default 'BDT',
  hashed_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (merchant_id, provider, event_id)
);

create index if not exists analytics_conversions_due_idx
  on public.analytics_conversion_events (next_attempt_at) where status = 'pending';

grant select on public.analytics_conversion_events to authenticated;
grant all on public.analytics_conversion_events to service_role;
alter table public.analytics_conversion_events enable row level security;

create policy analytics_conversions_tenant_read on public.analytics_conversion_events
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- -------------------------------------------------- real user performance
create table if not exists public.web_vitals_sample (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  template_key text,
  route text,
  metric text not null,
  value_num double precision not null,
  rating text,
  device_class text,
  connection text,
  locale text,
  path text,
  country_code text not null default '',
  session_hash text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists web_vitals_sample_idx
  on public.web_vitals_sample (merchant_id, occurred_at desc);

grant select on public.web_vitals_sample to authenticated;
grant all on public.web_vitals_sample to service_role;
alter table public.web_vitals_sample enable row level security;

create policy web_vitals_tenant_read on public.web_vitals_sample
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- ------------------------------------------------------------------ routines

create or replace function public.analytics_ingest(_merchant_id uuid, _events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _total integer := coalesce(jsonb_array_length(_events), 0);
  _accepted integer := 0;
begin
  if _total = 0 then
    return jsonb_build_object('accepted', 0, 'rejected', 0);
  end if;

  with incoming as (
    select
      nullif(e->>'entity', '') as entity,
      nullif(e->>'action', '') as action,
      coalesce((e->>'occurred_at')::timestamptz, now()) as occurred_at,
      coalesce(e->>'visitor_hash', '') as visitor_hash,
      coalesce(e->>'session_key', '') as session_key,
      coalesce(e->>'source', '') as source,
      coalesce(e->>'campaign', '') as campaign,
      greatest(0, coalesce((e->>'value_minor_int')::bigint, 0)) as value_minor_int,
      coalesce(nullif(e->>'currency_code', ''), 'BDT') as currency_code,
      coalesce(e->'payload', '{}'::jsonb) as payload,
      coalesce(nullif(e->>'dedupe_key', ''), gen_random_uuid()::text) as dedupe_key,
      upper(left(coalesce(e->>'country_code', ''), 2)) as country_code,
      left(coalesce(e->>'region', ''), 60) as region,
      left(coalesce(e->>'city', ''), 80) as city,
      (e->>'asn')::integer as asn,
      left(coalesce(e->>'network', ''), 80) as network,
      coalesce(nullif(e->>'device_class', ''), 'unknown') as device_class
    from jsonb_array_elements(_events) as e
  ), ok as (
    select * from incoming where entity is not null and action is not null
  ), ins as (
    insert into public.analytics_events (
      merchant_id, entity, action, occurred_at, day, visitor_hash, session_key,
      source, campaign, value_minor_int, currency_code, payload, dedupe_key,
      country_code, region, city, asn, network, device_class
    )
    select
      _merchant_id, left(entity, 40), left(action, 40), occurred_at,
      (occurred_at at time zone 'utc')::date,
      left(visitor_hash, 64), left(session_key, 64), left(source, 60), left(campaign, 80),
      value_minor_int, left(currency_code, 3), payload, left(dedupe_key, 200),
      country_code, region, city, asn, network, device_class
    from ok
    on conflict (merchant_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into _accepted from ins;

  return jsonb_build_object('accepted', _accepted, 'rejected', greatest(0, _total - _accepted));
end;
$$;

revoke all on function public.analytics_ingest(uuid, jsonb) from public;
grant execute on function public.analytics_ingest(uuid, jsonb) to service_role;

create or replace function public.analytics_flush(_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _batch public.analytics_batches;
  _prev uuid;
  _count bigint := 0;
  _gap boolean := false;
begin
  if not (public.is_merchant_member(_merchant_id, auth.uid())
          or public.is_platform_admin(auth.uid())
          or auth.uid() is null) then
    raise exception 'analytics.forbidden';
  end if;

  select id into _prev from public.analytics_batches
   where merchant_id = _merchant_id order by created_at desc limit 1;

  insert into public.analytics_batches (merchant_id, previous_batch_id, status)
  values (_merchant_id, _prev, 'running')
  returning * into _batch;

  update public.analytics_events
     set batch_id = _batch.id
   where merchant_id = _merchant_id and batch_id is null;
  _count := (select count(*) from public.analytics_events
              where merchant_id = _merchant_id and batch_id = _batch.id);

  -- Per (entity, day) rollup, rebuilt for every day this batch touched.
  insert into public.analytics_daily (merchant_id, entity, day, totals, updated_at)
  select
    _merchant_id, e.entity, e.day,
    jsonb_build_object(
      'events', count(*),
      'visitors', count(distinct nullif(e.visitor_hash, '')),
      'sessions', count(distinct nullif(e.session_key, '')),
      'value_minor_int', coalesce(sum(e.value_minor_int), 0),
      'actions', coalesce(
        (select jsonb_object_agg(a.action, a.hits) from (
           select e2.action, count(*) as hits
             from public.analytics_events e2
            where e2.merchant_id = _merchant_id and e2.entity = e.entity and e2.day = e.day
            group by e2.action
         ) a), '{}'::jsonb)
    ),
    now()
  from public.analytics_events e
  where e.merchant_id = _merchant_id
    and e.day in (select distinct day from public.analytics_events
                   where merchant_id = _merchant_id and batch_id = _batch.id)
  group by e.entity, e.day
  on conflict (merchant_id, entity, day)
  do update set totals = excluded.totals, updated_at = now();

  -- Geography rollup for the same days.
  insert into public.analytics_geo_daily (
    merchant_id, day, country_code, region, visitors, sessions, events, clicks, orders, revenue_minor_int, updated_at
  )
  select
    _merchant_id, e.day, coalesce(nullif(e.country_code, ''), 'ZZ'), e.region,
    count(distinct nullif(e.visitor_hash, '')),
    count(distinct nullif(e.session_key, '')),
    count(*),
    count(*) filter (where e.action in ('click', 'add', 'select')),
    count(*) filter (where e.entity = 'order' and e.action = 'paid'),
    coalesce(sum(e.value_minor_int) filter (where e.entity = 'order'), 0),
    now()
  from public.analytics_events e
  where e.merchant_id = _merchant_id
    and e.day in (select distinct day from public.analytics_events
                   where merchant_id = _merchant_id and batch_id = _batch.id)
  group by e.day, coalesce(nullif(e.country_code, ''), 'ZZ'), e.region
  on conflict (merchant_id, day, country_code, region)
  do update set visitors = excluded.visitors, sessions = excluded.sessions,
                events = excluded.events, clicks = excluded.clicks,
                orders = excluded.orders, revenue_minor_int = excluded.revenue_minor_int,
                updated_at = now();

  _gap := _prev is not null and exists (
    select 1 from public.analytics_batches
     where id = _prev and status <> 'committed'
  );

  update public.analytics_batches
     set status = 'committed', committed_at = now(), event_count = _count, gap_detected = _gap
   where id = _batch.id
  returning * into _batch;

  return jsonb_build_object(
    'ok', true, 'batch_id', _batch.id, 'event_count', _count, 'gap_detected', _gap
  );
end;
$$;

revoke all on function public.analytics_flush(uuid) from public;
grant execute on function public.analytics_flush(uuid) to authenticated, service_role;

create or replace function public.analytics_rebuild_cohorts(_merchant_id uuid, _weeks integer default 12)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _buckets integer := 0;
begin
  if not (public.is_merchant_member(_merchant_id, auth.uid())
          or public.is_platform_admin(auth.uid())
          or auth.uid() is null) then
    raise exception 'analytics.forbidden';
  end if;

  delete from public.analytics_cohorts where merchant_id = _merchant_id;

  with paid as (
    select customer_id, date_trunc('week', created_at)::date as week,
           total_minor_int
      from public.orders
     where merchant_id = _merchant_id
       and customer_id is not null
       and status in ('paid', 'fulfilled', 'delivered', 'shipped', 'completed')
       and created_at >= now() - (greatest(1, _weeks) * interval '7 days')
  ), first_week as (
    select customer_id, min(week) as cohort_week from paid group by customer_id
  ), joined as (
    select f.cohort_week, p.customer_id, p.week, p.total_minor_int,
           ((p.week - f.cohort_week) / 7)::int as week_offset
      from paid p join first_week f using (customer_id)
  ), sized as (
    select cohort_week, count(distinct customer_id) as customers
      from first_week group by cohort_week
  ), ins as (
    insert into public.analytics_cohorts (
      merchant_id, cohort_week, week_offset, customers, active_customers, orders, revenue_minor_int
    )
    select _merchant_id, j.cohort_week, j.week_offset, s.customers,
           count(distinct j.customer_id), count(*), coalesce(sum(j.total_minor_int), 0)
      from joined j join sized s using (cohort_week)
     where j.week_offset between 0 and 12
     group by j.cohort_week, j.week_offset, s.customers
    on conflict (merchant_id, cohort_week, week_offset)
    do update set customers = excluded.customers,
                  active_customers = excluded.active_customers,
                  orders = excluded.orders,
                  revenue_minor_int = excluded.revenue_minor_int,
                  updated_at = now()
    returning 1
  )
  select count(*) into _buckets from ins;

  return jsonb_build_object('ok', true, 'buckets', _buckets);
end;
$$;

revoke all on function public.analytics_rebuild_cohorts(uuid, integer) from public;
grant execute on function public.analytics_rebuild_cohorts(uuid, integer) to authenticated, service_role;

create or replace function public.analytics_queue_conversion(
  _merchant_id uuid,
  _provider text,
  _event_name text,
  _event_id text,
  _order_id uuid default null,
  _value_minor_int bigint default 0,
  _currency_code text default 'BDT',
  _hashed_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  insert into public.analytics_conversion_events (
    merchant_id, provider, event_name, event_id, order_id,
    value_minor_int, currency_code, hashed_payload
  ) values (
    _merchant_id, _provider, _event_name, _event_id, _order_id,
    greatest(0, coalesce(_value_minor_int, 0)), coalesce(_currency_code, 'BDT'),
    coalesce(_hashed_payload, '{}'::jsonb)
  )
  on conflict (merchant_id, provider, event_id) do nothing
  returning id into _id;

  return jsonb_build_object('ok', true, 'queued', _id is not null, 'id', _id);
end;
$$;

revoke all on function public.analytics_queue_conversion(uuid, text, text, text, uuid, bigint, text, jsonb) from public;
grant execute on function public.analytics_queue_conversion(uuid, text, text, text, uuid, bigint, text, jsonb) to service_role;

create or replace function public.analytics_claim_conversions(_limit integer default 25)
returns setof public.analytics_conversion_events
language sql
security definer
set search_path = public
as $$
  update public.analytics_conversion_events c
     set status = 'claimed', claimed_at = now(), attempts = c.attempts + 1
   where c.id in (
     select id from public.analytics_conversion_events
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit greatest(1, least(coalesce(_limit, 25), 200))
      for update skip locked
   )
  returning c.*;
$$;

revoke all on function public.analytics_claim_conversions(integer) from public;
grant execute on function public.analytics_claim_conversions(integer) to service_role;

create or replace function public.analytics_settle_conversion(_id uuid, _ok boolean, _error text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.analytics_conversion_events;
begin
  update public.analytics_conversion_events
     set status = case
                    when _ok then 'sent'
                    when attempts >= 5 then 'failed'
                    else 'pending'
                  end,
         sent_at = case when _ok then now() else sent_at end,
         last_error = left(_error, 300),
         next_attempt_at = case
                             when _ok then next_attempt_at
                             else now() + (least(attempts, 5) * interval '5 minutes')
                           end
   where id = _id
  returning * into _row;

  return jsonb_build_object('ok', true, 'status', _row.status);
end;
$$;

revoke all on function public.analytics_settle_conversion(uuid, boolean, text) from public;
grant execute on function public.analytics_settle_conversion(uuid, boolean, text) to service_role;

create or replace function public.analytics_claim_reports(_limit integer default 20)
returns setof public.analytics_reports
language sql
security definer
set search_path = public
as $$
  update public.analytics_reports r
     set next_run_at = case r.schedule
                         when 'daily' then now() + interval '1 day'
                         when 'weekly' then now() + interval '7 days'
                         when 'monthly' then now() + interval '30 days'
                         else null
                       end,
         updated_at = now()
   where r.id in (
     select id from public.analytics_reports
      where schedule <> 'off' and next_run_at is not null and next_run_at <= now()
      order by next_run_at
      limit greatest(1, least(coalesce(_limit, 20), 100))
      for update skip locked
   )
  returning r.*;
$$;

revoke all on function public.analytics_claim_reports(integer) from public;
grant execute on function public.analytics_claim_reports(integer) to service_role;
