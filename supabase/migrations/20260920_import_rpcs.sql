-- ============================================================
-- Theme import RPCs — granular, idempotent imports for the
-- clothing-heritage (and compatible) theme blueprints.
--
-- Each function:
--   1. Checks auth.uid() is non-null
--   2. Verifies the caller is an active merchant_member or platform admin
--   3. Performs idempotent inserts (skips if data already exists)
--   4. Returns { status, imported, count }
-- ============================================================

-- 1. import_theme_slides: merge hero_carousel blueprint data into the
--    merchant's theme draft.  Idempotent: skipped if the draft already
--    contains a hero_carousel section with the same headline.
create or replace function public.import_theme_slides(
  _merchant_id uuid, _theme_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_theme uuid;
  v_draft record;
  v_blueprint jsonb;
  v_slides jsonb;
  v_existing jsonb;
  v_has_hero boolean;
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

  -- Find the merchant's most recent theme
  select id into v_theme from public.store_themes
  where merchant_id = _merchant_id
  order by is_active desc, created_at asc limit 1;

  if v_theme is null then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0,
      'reason', 'no_theme'
    );
  end if;

  -- Load the blueprint preset (the index template's hero_carousel section)
  select preset into v_blueprint from public.theme_registry
  where key = _theme_key limit 1;

  if v_blueprint is null then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0,
      'reason', 'blueprint_not_found'
    );
  end if;

  -- Extract hero_carousel slides from the blueprint's index template
  v_slides := v_blueprint #>> '{templates,index,main}';
  if v_slides is null then
    v_slides := '[]'::jsonb;
  end if;

  -- Find the hero_carousel section in the blueprint
  v_slides := (
    select jsonb_agg(elem->'props'->'slides')
    from jsonb_array_elements(
      coalesce(v_blueprint #> '{templates,index,main}', '[]'::jsonb)
    ) elem
    where elem->>'type' = 'hero_carousel'
    limit 1
  );

  if v_slides is null or jsonb_array_length(v_slides) = 0 then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0,
      'reason', 'no_slides_in_blueprint'
    );
  end if;

  -- Check if the draft already has a hero_carousel with these slides
  select templates into v_draft from public.theme_drafts
  where theme_id = v_theme;

  if found then
    v_existing := v_draft.templates #> '{index,main}';
    if v_existing is not null then
      v_has_hero := (
        select exists (
          select 1 from jsonb_array_elements(v_existing) elem
          where elem->>'type' = 'hero_carousel'
        )
      );
      if v_has_hero then
        return jsonb_build_object(
          'status', 'noop', 'imported', false, 'count', 0,
          'reason', 'slides_already_exist'
        );
      end if;
    end if;
  end if;

  -- Merge the hero_carousel section into the draft's index main
  if found then
    update public.theme_drafts
    set templates = jsonb_set(
      templates,
      '{index,main}',
      coalesce(templates #> '{index,main}', '[]'::jsonb)
      || jsonb_build_array(
        jsonb_build_object(
          'type', 'hero_carousel',
          'props', jsonb_build_object(
            'slides', v_slides,
            'autoAdvanceMs', 6000
          )
        )
      ),
      updated_at = now()
    )
    where theme_id = v_theme;
  else
    insert into public.theme_drafts
      (merchant_id, theme_id, revision, templates, tokens, updated_by)
    values (
      _merchant_id, v_theme, 0,
      jsonb_build_object(
        'index', jsonb_build_object(
          'main', jsonb_build_array(
            jsonb_build_object(
              'type', 'hero_carousel',
              'props', jsonb_build_object(
                'slides', v_slides,
                'autoAdvanceMs', 6000
              )
            )
          )
        )
      ),
      '{}'::jsonb, v_caller
    );
  end if;

  return jsonb_build_object(
    'status', 'imported', 'imported', true,
    'count', jsonb_array_length(v_slides)
  );
end $$;

grant execute on function public.import_theme_slides(uuid, text)
  to authenticated, service_role;


-- 2. import_theme_media: create placeholder media_assets entries for
--    the theme's demo images (product images, hero banners, story photos).
--    Idempotent: skipped if the merchant already has demo media entries.
create or replace function public.import_theme_media(
  _merchant_id uuid, _theme_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_n int := 0;
  v_already boolean;
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

  -- Check idempotency: already imported demo media?
  select exists(
    select 1 from public.media_assets
    where merchant_id = _merchant_id
      and file_name like 'demo_%'
      and deleted_at is null
  ) into v_already;

  if v_already then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0
    );
  end if;

  -- Create placeholder media entries from the demo catalog's image_url fields
  -- These map to the heritage theme's product images and hero banners
  for i in 0..5 loop
    insert into public.media_assets
      (merchant_id, file_name, storage_path, url, content_type, size_bytes, alt_text)
    values (
      _merchant_id,
      'demo_media_' || i || '.webp',
      'demo/' || _merchant_id::text || '/media_' || i || '.webp',
      'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=800&auto=format&fit=crop',
      'image/webp',
      0,
      'Demo placeholder image'
    );
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object(
    'status', 'imported', 'imported', true, 'count', v_n
  );
end $$;

grant execute on function public.import_theme_media(uuid, text)
  to authenticated, service_role;


-- 3. import_theme_products: import the theme's demo catalog (categories,
--    collections, products, variants).  Accepts a _catalog JSONB payload
--    (from the TypeScript DemoCatalog type) and delegates to theme_import_demo.
--    Idempotent: theme_import_demo checks for existing is_demo rows.
create or replace function public.import_theme_products(
  _merchant_id uuid, _theme_key text, _catalog jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_already boolean;
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

  -- Check idempotency: already imported demo products?
  select exists(
    select 1 from public.products
    where merchant_id = _merchant_id and is_demo
  ) into v_already;

  if v_already then
    return jsonb_build_object(
      'status', 'noop', 'imported', false,
      'products', 0, 'categories', 0, 'collections', 0
    );
  end if;

  -- Delegate to the existing theme_import_demo which handles the full
  -- catalog logic (categories, collections, products, variants).
  return public.theme_import_demo(
    _merchant_id,
    _theme_key,
    '{}'::jsonb,   -- _ast (templates handled separately by import_theme_slides)
    '{}'::jsonb,   -- _tokens
    _catalog
  );
end $$;

grant execute on function public.import_theme_products(uuid, text, jsonb)
  to authenticated, service_role;


-- 4. import_theme_posts: create demo blog articles and storefront pages
--    for the theme.  Idempotent: skipped if demo posts already exist.
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
    (merchant_id, slug, title, title_en, body, excerpt, status, tags)
  values
    (_merchant_id, 'demo-master-weavers',
     'The Master Weavers of Tangail', 'The Master Weavers of Tangail',
     '<p>Centuries of geometry and craftsmanship in every weave. Crafted by generational artisan families on traditional wooden pit looms.</p>',
     'Heritage handloom from Tangail district, featuring Jamdani and Taant weaves.',
     'published', array['heritage', 'handloom', 'artisan']);

  insert into public.articles
    (merchant_id, slug, title, title_en, body, excerpt, status, tags)
  values
    (_merchant_id, 'demo-nakshi-kantha',
     'Nakshi Kantha: Living Folk Art', 'Nakshi Kantha: Living Folk Art',
     '<p>Hand-embroidered quilts that tell stories of rural Bengal. Each stitch carries generational wisdom and artistic expression.</p>',
     'The ancient art of nakshi kantha embroidery from rural Bengal.',
     'published', array['heritage', 'embroidery', 'folk-art']);

  insert into public.articles
    (merchant_id, slug, title, title_en, body, excerpt, status, tags)
  values
    (_merchant_id, 'demo-festive-collection',
     'Eid & Festive Collection 2026', 'Eid & Festive Collection 2026',
     '<p>Pure silk, handwoven for celebrations. Explore our curated collection of festive wear crafted by master artisans.</p>',
     'Discover our Eid and festive collection of handcrafted silk and handloom garments.',
     'published', array['festive', 'eid', 'silk', 'collection']);

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


-- 5. import_theme_all: orchestrate all four imports in sequence.
--    Each sub-import is independently idempotent.
create or replace function public.import_theme_all(
  _merchant_id uuid, _theme_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_slides jsonb;
  v_media jsonb;
  v_products jsonb;
  v_posts jsonb;
  v_total int := 0;
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

  -- Import in sequence: slides → media → products → posts
  v_slides   := public.import_theme_slides(_merchant_id, _theme_key);
  v_media    := public.import_theme_media(_merchant_id, _theme_key);
  v_products := public.import_theme_products(_merchant_id, _theme_key);
  v_posts    := public.import_theme_posts(_merchant_id, _theme_key);

  -- Count how many sub-imports actually ran
  if (v_slides->>'imported')::boolean   then v_total := v_total + 1; end if;
  if (v_media->>'imported')::boolean    then v_total := v_total + 1; end if;
  if (v_products->>'imported')::boolean then v_total := v_total + 1; end if;
  if (v_posts->>'imported')::boolean    then v_total := v_total + 1; end if;

  return jsonb_build_object(
    'status', case when v_total > 0 then 'imported' else 'noop' end,
    'imported', v_total > 0,
    'totalImported', v_total,
    'slides',   v_slides,
    'media',    v_media,
    'products', v_products,
    'posts',    v_posts
  );
end $$;

grant execute on function public.import_theme_all(uuid, text)
  to authenticated, service_role;
