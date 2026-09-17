-- Missing routines: vat_resolve + collection_resolve (+ BD VAT seed).
-- Spec: docs/06-payments/money-runtime.md, docs/07-commerce/catalog-runtime.md,
-- supabase/types.reference.ts. No migration ever defined these bodies.

-- 1. vat_resolve(_country text, _category text, _year bigint) -> jsonb
create or replace function public.vat_resolve(_country text, _category text, _year bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c text := upper(trim(coalesce(_country, 'BD')));
  v_cat text := lower(trim(coalesce(_category, 'standard')));
  v_y bigint := coalesce(_year, 9999);
  v_rate bigint;
  v_yr bigint;
begin
  if v_c = '' then v_c := 'BD'; end if;
  if v_cat = '' then v_cat := 'standard'; end if;

  -- Latest legal year at or before the requested year (matches
  -- vatBasisPoints in billing.server.ts). Missing year -> resolved:false,
  -- never a silent 0% (money-runtime.md).
  select r.rate_basis_points, r.effective_year into v_rate, v_yr
  from public.vat_rates r
  where r.country_code = v_c
    and r.category = v_cat
    and r.effective_year <= v_y
  order by r.effective_year desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'country_code', v_c,
      'category', v_cat,
      'rate_basis_points', 0,
      'effective_year', coalesce(_year, extract(year from now())::bigint),
      'resolved', false
    );
  end if;
  return jsonb_build_object(
    'country_code', v_c,
    'category', v_cat,
    'rate_basis_points', v_rate,
    'effective_year', v_yr,
    'resolved', true
  );
end $$;
GRANT EXECUTE ON FUNCTION public.vat_resolve(text, text, bigint) TO anon, authenticated, service_role;

-- 2. collection_resolve(_collection_id uuid) -> uuid[]
-- Single resolution path for manual + smart collections (catalog-runtime.md):
-- soft-delete filtering on products and variants, kind/tag/metafield
-- conditions, 5000-row scan bound, 1000-row emit cap. Unknown fields/ops
-- fail closed (match nothing) so a crafted payload cannot widen the set.
create or replace function public.collection_resolve(_collection_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_smart boolean;
  v_rules jsonb;
  v_match text;
  v_conds jsonb;
  v_out uuid[] := '{}';
  v_count int := 0;
  r record;
  c jsonb;
  v_f text; v_op text; v_val text; v_key text;
  v_hit boolean; v_this boolean;
  v_min bigint; v_stock bigint; v_num bigint;
begin
  select merchant_id, is_smart, coalesce(rules, '{}'::jsonb)
    into v_merchant, v_smart, v_rules
  from public.collections
  where id = _collection_id and deleted_at is null;
  if not found then return '{}'; end if;

  -- Manual collections: pinned membership order, still honoring soft-delete.
  if not v_smart then
    select coalesce(array_agg(cp.product_id order by cp.position, cp.created_at), '{}')
      into v_out
    from public.collection_products cp
    join public.products p on p.id = cp.product_id
    where cp.collection_id = _collection_id and p.deleted_at is null;
    if coalesce(array_length(v_out, 1), 0) > 1000 then
      v_out := v_out[1:1000];
    end if;
    return v_out;
  end if;

  v_match := coalesce(nullif(v_rules->>'match', ''), 'all');
  v_conds := coalesce(v_rules->'conditions', '[]'::jsonb);
  if jsonb_typeof(v_conds) <> 'array' then v_conds := '[]'::jsonb; end if;

  for r in
    select p.* from public.products p
    where p.merchant_id = v_merchant and p.deleted_at is null
    order by p.created_at desc, p.id
    limit 5000
  loop
    v_hit := (v_match <> 'any');
    for c in select * from jsonb_array_elements(v_conds) loop
      v_f := lower(coalesce(c->>'field', ''));
      v_op := lower(coalesce(c->>'op', ''));
      v_val := c->>'value';
      v_key := c->>'key';
      -- default: fail closed
      v_this := false;
      if v_f = 'title' and v_val is not null and v_val <> '' then
        if v_op = 'contains' then v_this := position(lower(v_val) in lower(r.title)) > 0;
        elsif v_op = 'starts_with' then v_this := starts_with(lower(r.title), lower(v_val));
        elsif v_op = 'equals' then v_this := lower(r.title) = lower(v_val);
        end if;
      elsif v_f = 'brand' and v_op = 'equals' and v_val is not null then
        select exists(
          select 1 from public.brands b
          where b.id = r.brand_id and b.merchant_id = v_merchant
            and b.deleted_at is null and lower(b.name) = lower(v_val)
        ) into v_this;
      elsif v_f = 'category' and v_op = 'equals' and v_val is not null then
        select exists(
          select 1 from public.categories g
          where g.id = r.category_id and g.merchant_id = v_merchant
            and g.deleted_at is null and lower(g.name) = lower(v_val)
        ) into v_this;
      elsif v_f = 'price' and v_val ~ '^-?[0-9]+$' then
        v_num := v_val::bigint;
        select min(v.price_amount_minor_int) into v_min
        from public.product_variants v
        where v.product_id = r.id and v.deleted_at is null;
        if v_min is not null then
          if v_op = 'lt' then v_this := v_min < v_num;
          elsif v_op = 'gt' then v_this := v_min > v_num;
          elsif v_op = 'equals' then v_this := v_min = v_num;
          end if;
        end if;
      elsif v_f = 'stock' and v_val ~ '^-?[0-9]+$' then
        v_num := v_val::bigint;
        select coalesce(sum(v.stock_quantity), 0) into v_stock
        from public.product_variants v
        where v.product_id = r.id and v.deleted_at is null;
        if v_op = 'lt' then v_this := v_stock < v_num;
        elsif v_op = 'gt' then v_this := v_stock > v_num;
        elsif v_op = 'equals' then v_this := v_stock = v_num;
        end if;
      elsif v_f = 'kind' and v_op = 'equals' and v_val is not null then
        v_this := lower(r.product_kind::text) = lower(v_val);
      elsif v_f = 'tag' and v_val is not null and v_val <> '' then
        if v_op = 'contains' then
          select exists(
            select 1 from unnest(coalesce(r.tags, '{}'::text[])) as t(tag) where lower(t.tag) = lower(v_val)
          ) into v_this;
        elsif v_op = 'not_contains' then
          select not exists(
            select 1 from unnest(coalesce(r.tags, '{}'::text[])) as t(tag) where lower(t.tag) = lower(v_val)
          ) into v_this;
        end if;
      elsif v_f = 'metafield' and v_key is not null and v_key <> '' then
        if v_op = 'exists' then
          select exists(
            select 1 from public.metafields m
            where m.merchant_id = v_merchant and m.owner_type = 'product'
              and m.owner_id = r.id and m.key = v_key
          ) into v_this;
        elsif v_op = 'equals' and v_val is not null then
          select exists(
            select 1 from public.metafields m
            where m.merchant_id = v_merchant and m.owner_type = 'product'
              and m.owner_id = r.id and m.key = v_key
              and (m.value = to_jsonb(v_val) or m.value::text = v_val)
          ) into v_this;
        elsif v_op = 'contains' and v_val is not null and v_val <> '' then
          select exists(
            select 1 from public.metafields m
            where m.merchant_id = v_merchant and m.owner_type = 'product'
              and m.owner_id = r.id and m.key = v_key
              and position(lower(v_val) in lower(m.value::text)) > 0
          ) into v_this;
        end if;
      end if;
      if v_match = 'any' then
        v_hit := v_hit or v_this;
        exit when v_hit;
      else
        v_hit := v_hit and v_this;
        exit when not v_hit;
      end if;
    end loop;
    if v_hit then
      v_out := v_out || r.id;
      v_count := v_count + 1;
      exit when v_count >= 1000;
    end if;
  end loop;
  return v_out;
end $$;
GRANT EXECUTE ON FUNCTION public.collection_resolve(uuid) TO authenticated, service_role;

-- 3. BD standard VAT seed (15% = 1500 bps). Idempotent.
delete from public.vat_rates where country_code = 'BD' and category = 'standard' and effective_year in (2025, 2026);
insert into public.vat_rates (country_code, category, effective_year, rate_basis_points)
values ('BD', 'standard', 2025, 1500), ('BD', 'standard', 2026, 1500);
