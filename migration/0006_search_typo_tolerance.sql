-- TODO.md P2 — "Search relevance tuning + typo tolerance".
--
-- `storefront_search` matched with plain LIKE only, so a shopper who typed
-- "jamdanni" or "panjabee" got an empty results page for products the store
-- definitely stocks. This adds trigram matching as a *fallback tier*: exact
-- matches always outrank fuzzy ones, and a fuzzy hit only qualifies when it
-- clears a tight similarity floor, so relevance does not degrade into noise.
--
-- Ranking tiers (highest first):
--   4  title starts with the term
--   3  term appears inside the title
--   2  term appears in the search document or description
--   1  no literal match, but the title is trigram-similar (typo tolerance)
--
-- Indexes make the fuzzy tier affordable: without them every fuzzy query is a
-- sequential scan over the tenant's whole catalogue.

create extension if not exists pg_trgm with schema extensions;

create index if not exists products_title_trgm_idx
  on public.products using gin (lower(title) extensions.gin_trgm_ops);

create index if not exists products_search_doc_trgm_idx
  on public.products using gin (lower(coalesce(search_doc, '')) extensions.gin_trgm_ops);

create or replace function public.storefront_search(
  _slug text,
  _q text default null,
  _category text default null,
  _collection text default null,
  _kind text default null,
  _min_minor bigint default null,
  _max_minor bigint default null,
  _in_stock boolean default false,
  _sort text default 'relevance',
  _limit integer default 24,
  _offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with args as (
    select greatest(1, least(coalesce(_limit, 24), 48)) as lim,
           greatest(0, least(coalesce(_offset, 0), 480)) as off,
           nullif(btrim(coalesce(_q, '')), '') as term,
           coalesce(_sort, 'relevance') as sort,
           -- Tight enough that "saree" never pulls in "shirt", loose enough
           -- that a one or two character slip still finds the product.
           0.45::real as fuzz
  ),
  store as (select id, currency_code from public.merchants where slug = _slug and status = 'active'),
  hits as (
    select p.id, p.title, p.slug, coalesce(p.description, '') as description, p.image_url,
           p.product_kind::text as kind, coalesce(v.price_minor, 0) as price_minor,
           v.compare_at_minor, coalesce(v.stock, 0) as stock,
           c.slug as category, c.name as category_name, p.created_at,
           case
             when a.term is null then 0
             when lower(p.title) like lower(a.term) || '%' then 4
             when lower(p.title) like '%' || lower(a.term) || '%' then 3
             when lower(coalesce(p.search_doc, '')) like '%' || lower(a.term) || '%'
               or lower(p.description) like '%' || lower(a.term) || '%' then 2
             else 1
           end as rank,
           case when a.term is null then 0::real
                else extensions.word_similarity(lower(a.term), lower(p.title)) end as similarity
    from public.products p
    cross join args a
    join store s on s.id = p.merchant_id
    left join public.categories c on c.id = p.category_id
    left join (
      select product_id, min(price_amount_minor_int) as price_minor,
             max(compare_at_amount_minor_int) as compare_at_minor,
             sum(stock_quantity) as stock
      from public.product_variants where deleted_at is null group by product_id
    ) v on v.product_id = p.id
    where p.status = 'active' and p.deleted_at is null
      and (_kind is null or p.product_kind::text = _kind)
      and (_category is null or c.slug = _category)
      and (_min_minor is null or coalesce(v.price_minor, 0) >= _min_minor)
      and (_max_minor is null or coalesce(v.price_minor, 0) <= _max_minor)
      and (_in_stock is not true or coalesce(v.stock, 0) > 0)
      and (a.term is null
        or lower(p.title) like '%' || lower(a.term) || '%'
        or lower(coalesce(p.search_doc, '')) like '%' || lower(a.term) || '%'
        or lower(coalesce(p.description, '')) like '%' || lower(a.term) || '%'
        -- Typo tolerance: only when nothing literal matched this row.
        or extensions.word_similarity(lower(a.term), lower(p.title)) >= a.fuzz)
      and (_collection is null or exists (
        select 1 from public.collection_products cp
        join public.collections col on col.id = cp.collection_id
        where cp.product_id = p.id and col.slug = _collection and col.is_published = true))
  ),
  page as (
    select jsonb_build_object(
      'id', h.id, 'title', h.title, 'slug', h.slug, 'description', h.description,
      'image_url', h.image_url, 'kind', h.kind, 'price_minor', h.price_minor,
      'compare_at_minor', h.compare_at_minor, 'stock', h.stock, 'category', h.category
    ) as row
    from hits h, args a
    order by
      case when a.sort = 'price_asc' then h.price_minor end asc nulls last,
      case when a.sort = 'price_desc' then h.price_minor end desc nulls last,
      case when a.sort = 'newest' then h.created_at end desc nulls last,
      case when a.sort = 'title' then h.title end asc nulls last,
      case when a.sort = 'relevance' then h.rank end desc nulls last,
      -- Inside a tier, the closer string wins; ties fall back to alphabetical
      -- so pagination is deterministic.
      case when a.sort = 'relevance' then h.similarity end desc nulls last,
      h.title asc
    limit (select lim from args) offset (select off from args)
  ),
  facet_cat as (
    select category, max(category_name) as category_name, count(*) as n
    from hits where category is not null group by category
  ),
  facet_kind as (select kind, count(*) as n from hits group by kind)
  select case when not exists (select 1 from store) then
    jsonb_build_object('found', false, 'total', 0,
      'limit', (select lim from args), 'offset', (select off from args),
      'sort', (select sort from args), 'items', '[]'::jsonb,
      'facets', jsonb_build_object('categories', '[]'::jsonb, 'kinds', '[]'::jsonb,
        'in_stock', 0, 'price_min_minor', null, 'price_max_minor', null))
  else
    jsonb_build_object(
      'found', true,
      'currency_code', coalesce((select currency_code from store), 'BDT'),
      'total', (select count(*) from hits),
      'limit', (select lim from args),
      'offset', (select off from args),
      'sort', (select sort from args),
      'items', coalesce((select jsonb_agg(row) from page), '[]'::jsonb),
      'facets', jsonb_build_object(
        'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', category,
          'name', coalesce(category_name, category), 'count', n) order by n desc, category)
          from facet_cat), '[]'::jsonb),
        'kinds', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'count', n)
          order by n desc, kind) from facet_kind), '[]'::jsonb),
        'in_stock', (select count(*) from hits where stock > 0),
        'price_min_minor', (select min(price_minor) from hits),
        'price_max_minor', (select max(price_minor) from hits)
      ))
  end;
$function$;

grant execute on function public.storefront_search(
  text, text, text, text, text, bigint, bigint, boolean, text, integer, integer
) to anon, authenticated;
