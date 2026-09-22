-- Fix: import_theme_posts stamped status='published' but never set
-- published_at, so every demo-imported article was invisible to the
-- archive and all published_at-gated queries (permanent "No articles
-- yet" despite live article URLs).
--
-- 1. Backfill: published rows with null stamp inherit created_at
--    (preserves chronology; only touches already-published rows).
-- 2. Amend RPC: demo inserts stamp published_at = now().

update public.articles
set published_at = created_at
where status = 'published' and published_at is null;
create or replace function public.import_theme_posts(
  _merchant_id uuid, _theme_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_already boolean;
  v_n_articles int := 0;
  v_n_pages int := 0;
begin
  if v_caller is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = _merchant_id and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Check idempotency: already imported demo posts?
  select exists(
    select 1 from public.articles
    where merchant_id = _merchant_id
      and slug like 'demo-%'
      and deleted_at is null
  ) into v_already;

  if v_already then
    return jsonb_build_object(
      'status', 'noop', 'imported', false,
      'articles', 0, 'pages', 0
    );
  end if;

  -- Demo articles for the heritage theme
  insert into public.articles
    (merchant_id, slug, title, title_en, body, excerpt, status, tags, published_at)
  values
    (_merchant_id, 'demo-master-weavers',
     'The Master Weavers of Tangail', 'The Master Weavers of Tangail',
     '<p>Centuries of geometry and craftsmanship in every weave. Crafted by generational artisan families on traditional wooden pit looms.</p>',
     'Heritage handloom from Tangail district, featuring Jamdani and Taant weaves.',
     'published', now(), array['heritage', 'handloom', 'artisan']);

  insert into public.articles
    (merchant_id, slug, title, title_en, body, excerpt, status, tags, published_at)
  values
    (_merchant_id, 'demo-nakshi-kantha',
     'Nakshi Kantha: Living Folk Art', 'Nakshi Kantha: Living Folk Art',
     '<p>Hand-embroidered quilts that tell stories of rural Bengal. Each stitch carries generational wisdom and artistic expression.</p>',
     'The ancient art of nakshi kantha embroidery from rural Bengal.',
     'published', now(), array['heritage', 'embroidery', 'folk-art']);

  insert into public.articles
    (merchant_id, slug, title, title_en, body, excerpt, status, tags, published_at)
  values
    (_merchant_id, 'demo-festive-collection',
     'Eid & Festive Collection 2026', 'Eid & Festive Collection 2026',
     '<p>Pure silk, handwoven for celebrations. Explore our curated collection of festive wear crafted by master artisans.</p>',
     'Discover our Eid and festive collection of handcrafted silk and handloom garments.',
     'published', now(), array['festive', 'eid', 'silk', 'collection']);

  v_n_articles := 3;

  -- Demo storefront pages
  insert into public.storefront_pages
    (merchant_id, slug, title, body_markdown, is_published, show_in_nav)
  values
    (_merchant_id, 'about',
     'About Us', E'# Our Story\n\nAarong has been empowering rural artisans since 1976, bringing authentic handloom and craft to modern consumers.\n\n## Our Mission\n\nFair trade, sustainable fashion that empowers 65,000+ artisans across 64 districts of Bangladesh.',
     true, true);

  insert into public.storefront_pages
    (merchant_id, slug, title, body_markdown, is_published, show_in_nav)
  values
    (_merchant_id, 'shipping-info',
     'Shipping Information', E'# Shipping & Delivery\n\nFree delivery on orders over ৳5,000 within Dhaka. Nationwide delivery in 3-5 business days.\n\n## International Shipping\n\nWe ship to 50+ countries worldwide. Delivery takes 7-14 business days.',
     true, false);

  v_n_pages := 2;

  return jsonb_build_object(
    'status', 'imported', 'imported', true,
    'articles', v_n_articles, 'pages', v_n_pages
  );
end $$;

grant execute on function public.import_theme_posts(uuid, text)
  to authenticated, service_role;
