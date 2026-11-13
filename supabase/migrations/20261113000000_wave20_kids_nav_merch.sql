-- Wave 20 — Kids navigation destinations, boys product, Taaga category fix
-- Merchant: Flame Fashion BD (b47532e5-9649-4ebd-93a9-06fa2917c00e)
-- Theme:    Songoskriti    (c9e9f286-67ad-44e2-86d3-71f2878bbd53)
-- Version:  7e446923-bf8a-4c53-88d2-e3fc8f322bdf  (published)
--
-- Scope:
--   1. Create published collections: girls, boys
--   2. Add girls-embroidered-silk-ghagra-choli to girls collection
--   3. Insert boys-silk-panjabi-pajama-set product (kids category)
--   4. Add boys product to boys + kids collections
--   5. Move Taaga products to correct gender categories (womens/mens)
--   6. Update published theme version product rail to use recommendation source
--      on the PDP template (removes hardcoded festive cross-sell)
--   7. Add "More to explore" rail on the collection template via recommendation RPC

BEGIN;

-- ── 1. Girls collection ───────────────────────────────────────────────────────

INSERT INTO collections (
  id, merchant_id, slug, name, description, is_published, is_smart, is_demo, position
) VALUES (
  gen_random_uuid(),
  'b47532e5-9649-4ebd-93a9-06fa2917c00e',
  'girls',
  'Girls Festive Wear',
  'Beautifully embroidered festive sets and silk ensembles for girls, crafted by Bengali artisans.',
  true, false, false, 28
)
ON CONFLICT DO NOTHING;

-- ── 2. Girls product → girls collection ──────────────────────────────────────

INSERT INTO collection_products (collection_id, product_id, merchant_id, position)
SELECT c.id, p.id, 'b47532e5-9649-4ebd-93a9-06fa2917c00e', 1
FROM collections c
CROSS JOIN products p
WHERE c.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND c.slug = 'girls'
  AND p.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND p.slug = 'girls-embroidered-silk-ghagra-choli'
  AND NOT EXISTS (
    SELECT 1 FROM collection_products cp2
    WHERE cp2.collection_id = c.id AND cp2.product_id = p.id
  );

-- ── 3. Boys product ───────────────────────────────────────────────────────────

INSERT INTO products (
  id, merchant_id, slug, title, description, image_url,
  category_id, status, tags, product_kind
)
SELECT
  gen_random_uuid(),
  'b47532e5-9649-4ebd-93a9-06fa2917c00e',
  'boys-silk-panjabi-pajama-set',
  'Boys Handloom Silk Panjabi & Pajama Set',
  'A heritage occasion set for boys, handwoven in Tangail with fine mulberry silk. The classic collarless Panjabi with matching fine-cotton Pajama is a staple of Bengali festive dress — Eid, Puja, and family celebrations. Lightweight and breathable, tailored for comfort without sacrificing ceremony.',
  '/ph/songoskriti/cat-kids.jpg',
  cat.id,
  'active',
  ARRAY['kids', 'boys', 'panjabi', 'festive', 'handloom', 'silk', 'bengal'],
  'physical'
FROM categories cat
WHERE cat.slug = 'kids'
ON CONFLICT (merchant_id, slug) DO NOTHING;

-- Boys product variants (3 sizes)
INSERT INTO product_variants (
  id, product_id, name, sku, price_amount_minor_int, compare_at_amount_minor_int,
  currency_code, stock_quantity, position
)
SELECT gen_random_uuid(), p.id, '3–4 Years', 'BSPPS-3-4',
       350000, 420000, 'BDT', 12, 1
FROM products p
WHERE p.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND p.slug = 'boys-silk-panjabi-pajama-set'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants pv2
    WHERE pv2.product_id = p.id AND pv2.sku = 'BSPPS-3-4'
  );

INSERT INTO product_variants (
  id, product_id, name, sku, price_amount_minor_int, compare_at_amount_minor_int,
  currency_code, stock_quantity, position
)
SELECT gen_random_uuid(), p.id, '5–6 Years', 'BSPPS-5-6',
       350000, 420000, 'BDT', 10, 2
FROM products p
WHERE p.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND p.slug = 'boys-silk-panjabi-pajama-set'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants pv2
    WHERE pv2.product_id = p.id AND pv2.sku = 'BSPPS-5-6'
  );

INSERT INTO product_variants (
  id, product_id, name, sku, price_amount_minor_int, compare_at_amount_minor_int,
  currency_code, stock_quantity, position
)
SELECT gen_random_uuid(), p.id, '7–8 Years', 'BSPPS-7-8',
       380000, 450000, 'BDT', 8, 3
FROM products p
WHERE p.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND p.slug = 'boys-silk-panjabi-pajama-set'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants pv2
    WHERE pv2.product_id = p.id AND pv2.sku = 'BSPPS-7-8'
  );

-- ── 4. Boys collection ────────────────────────────────────────────────────────

INSERT INTO collections (
  id, merchant_id, slug, name, description, is_published, is_smart, is_demo, position
) VALUES (
  gen_random_uuid(),
  'b47532e5-9649-4ebd-93a9-06fa2917c00e',
  'boys',
  'Boys Ethnic Wear',
  'Handloom silk Panjabis and traditional ethnic sets for boys — perfect for Eid, Puja, and family celebrations.',
  true, false, false, 29
)
ON CONFLICT DO NOTHING;

-- Boys product → boys collection
INSERT INTO collection_products (collection_id, product_id, merchant_id, position)
SELECT c.id, p.id, 'b47532e5-9649-4ebd-93a9-06fa2917c00e', 1
FROM collections c
CROSS JOIN products p
WHERE c.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND c.slug = 'boys'
  AND p.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND p.slug = 'boys-silk-panjabi-pajama-set'
  AND NOT EXISTS (
    SELECT 1 FROM collection_products cp2
    WHERE cp2.collection_id = c.id AND cp2.product_id = p.id
  );

-- Boys product → kids collection
INSERT INTO collection_products (collection_id, product_id, merchant_id, position)
SELECT c.id, p.id, 'b47532e5-9649-4ebd-93a9-06fa2917c00e', 2
FROM collections c
CROSS JOIN products p
WHERE c.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND c.slug = 'kids'
  AND p.merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND p.slug = 'boys-silk-panjabi-pajama-set'
  AND NOT EXISTS (
    SELECT 1 FROM collection_products cp2
    WHERE cp2.collection_id = c.id AND cp2.product_id = p.id
  );

-- ── 5. Taaga products → correct categories ────────────────────────────────────
-- bohemian-hand-embroidered-kurti is a women's tunic → womens
-- relaxed-linen-mandarin-shirt is a men's shirt → mens

UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'womens' LIMIT 1),
    tags = array_replace(tags, 'taaga', 'womens')
WHERE merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND slug = 'bohemian-hand-embroidered-kurti'
  AND category_id = (SELECT id FROM categories WHERE slug = 'taaga' LIMIT 1);

UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'mens' LIMIT 1),
    tags = array_replace(tags, 'taaga', 'mens')
WHERE merchant_id = 'b47532e5-9649-4ebd-93a9-06fa2917c00e'
  AND slug = 'relaxed-linen-mandarin-shirt'
  AND category_id = (SELECT id FROM categories WHERE slug = 'taaga' LIMIT 1);

-- ── 6. PDP template: replace hardcoded festive cross-sell with recommendations ─

UPDATE theme_versions
SET templates = jsonb_set(
  templates,
  '{product,main}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'id' = 'product_rail-33'
        THEN elem
            || jsonb_build_object(
                'props',
                (elem->'props')
                || jsonb_build_object(
                    'source', 'recommendation',
                    'collection', '',
                    'heading', 'You may also like',
                    'heading_bn', 'আপনার পছন্দ হতে পারে'
                   )
               )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(templates->'product'->'main') AS elem
  )
)
WHERE id = '7e446923-bf8a-4c53-88d2-e3fc8f322bdf';

-- ── 7. Collection template: add "More to explore" rail ───────────────────────

UPDATE theme_versions
SET templates = jsonb_set(
  templates,
  '{collection,main}',
  (templates->'collection'->'main') || jsonb_build_array(
    jsonb_build_object(
      'id', 'product_rail-explore',
      'type', 'product_rail',
      'props', jsonb_build_object(
        'heading', 'More to explore',
        'heading_bn', 'আরও দেখুন',
        'source', 'recommendation',
        'collection', '',
        'limit', 8,
        'cardVariant', 'editorial',
        'showRating', true,
        'promise', '',
        'promise_bn', ''
      )
    )
  )
)
WHERE id = '7e446923-bf8a-4c53-88d2-e3fc8f322bdf';

COMMIT;
