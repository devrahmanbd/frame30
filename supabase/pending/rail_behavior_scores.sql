-- ==============================================================================
-- Framique: Recommended-rail behavior scores (Lane H follow-up)
-- Status: PENDING — DO NOT APPLY YET. Code works with and without this
-- function (feature-detected in src/lib/widget-data.server.ts:
-- loadBehaviorSignals tries the RPC first and falls back to the current
-- inline aggregate reads when the function is missing).
--
-- Apply by promoting this file into supabase/migrations/ (copy + rename with
-- a fresh timestamp prefix) so it runs through the normal ledger in
-- scripts/db-migrate.mjs, or once via psql -f. No backfill: the function
-- reads live tables on every call and the caller caches per merchant.
--
-- Why an RPC: the recommended-rail behavior reads (product views w1, cart
-- adds w3, order co-occurrence w5 + bestseller-velocity fallback) currently
-- bypass RLS via the service role in code. A security-definer RPC pins the
-- exposure in SQL instead: only (product_id, score, velocity) cross the
-- boundary — never a session key, visitor hash, email or phone — and every
-- read stays merchant-scored and bounded no matter what the caller asks for.
-- ==============================================================================

create or replace function public.rail_behavior_scores(_merchant_id uuid)
returns table (
  product_id uuid,
  score bigint,
  velocity bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Intent weights, kept in sync with BEHAVIOR_WEIGHTS in
  -- src/lib/widget-data.server.ts: a view (1) < a cart add (3) <
  -- a bought-together order (5). Change both together.
  _view_w constant integer := 1;
  _cart_w constant integer := 3;
  _co_w constant integer := 5;
  -- Read bounds, kept in sync with BEHAVIOR_BOUNDS in
  -- src/lib/widget-data.server.ts: a busy store costs the same as a new one.
  _events_limit constant integer := 500;
  _items_limit constant integer := 1000;
  _variants_limit constant integer := 2000;
begin
  return query
  with recent_events as (
    select e.entity, e.action, e.payload
    from public.analytics_events e
    where e.merchant_id = _merchant_id
      and ((e.entity = 'product' and e.action = 'view')
        or (e.entity = 'cart' and e.action = 'add'))
    order by e.occurred_at desc
    limit _events_limit
  ),
  recent_items as (
    select i.order_id, i.variant_id, i.quantity
    from public.order_items i
    where i.merchant_id = _merchant_id
    order by i.created_at desc
    limit _items_limit
  ),
  variant_products as (
    -- Variant ids arrive as payload text, so the text-side comparison
    -- (v.id::text = payload) never throws on a malformed payload value;
    -- unresolvable ids simply match nothing, as in the code path.
    select v.id as variant_id, v.product_id
    from public.product_variants v
    where v.merchant_id = _merchant_id
      and (
        v.id::text in (
          select x.payload ->> 'variantId'
          from recent_events x
          where x.entity = 'cart'
            and x.action = 'add'
            and x.payload ->> 'variantId' is not null
        )
        or v.id in (
          select r.variant_id
          from recent_items r
          where r.variant_id is not null
        )
      )
    limit _variants_limit
  ),
  views as (
    -- Counted straight off the product id in the payload; the uuid guard
    -- drops malformed values that could never match a real product row.
    select (e.payload ->> 'item_id')::uuid as pid, count(*)::bigint as n
    from recent_events e
    where e.entity = 'product'
      and e.action = 'view'
      and e.payload ->> 'item_id'
        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    group by 1
  ),
  carts as (
    select vp.product_id as pid, count(*)::bigint as n
    from recent_events e
    join variant_products vp
      on vp.variant_id::text = e.payload ->> 'variantId'
    where e.entity = 'cart'
      and e.action = 'add'
    group by 1
  ),
  item_products as (
    select
      r.order_id,
      vp.product_id as pid,
      greatest(0, coalesce(r.quantity, 0))::bigint as qty
    from recent_items r
    join variant_products vp on vp.variant_id = r.variant_id
    where r.variant_id is not null
  ),
  velocity as (
    -- Bestseller velocity (ordered units) doubles as the cold-behavior
    -- fallback in rankRailRows, so it rides along even when score is 0.
    select p.pid, sum(p.qty)::bigint as units
    from item_products p
    group by 1
  ),
  multi_orders as (
    select p.order_id
    from item_products p
    group by p.order_id
    having count(distinct p.pid) >= 2
  ),
  co as (
    -- Bought-together: one count per multi-product order per product.
    select p.pid, count(distinct p.order_id)::bigint as n
    from item_products p
    join multi_orders m on m.order_id = p.order_id
    group by 1
  )
  select
    coalesce(v.pid, c.pid, o.pid, vel.pid) as product_id,
    (coalesce(v.n, 0) * _view_w
      + coalesce(c.n, 0) * _cart_w
      + coalesce(o.n, 0) * _co_w)::bigint as score,
    coalesce(vel.units, 0)::bigint as velocity
  from views v
  full outer join carts c on c.pid = v.pid
  full outer join co o on o.pid = coalesce(v.pid, c.pid)
  full outer join velocity vel on vel.pid = coalesce(v.pid, c.pid, o.pid)
  order by score desc, velocity desc;
end;
$$;

-- Least privilege: the only caller is the storefront server via the service
-- role. No anon grant (cf. support_kb_hybrid_search, whose anon grant had to
-- be revoked): the output is aggregate ids + counts, but there is no public
-- client caller, so nothing broader is needed.
revoke all on function public.rail_behavior_scores(uuid) from public;
grant execute on function public.rail_behavior_scores(uuid)
  to authenticated, service_role;
