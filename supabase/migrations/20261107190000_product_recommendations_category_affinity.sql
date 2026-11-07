-- product_recommendations: Fix column names (title vs name) and enforce category/tag affinity
-- Isolate kids from adult apparel and ensure relevant related recommendations.

CREATE OR REPLACE FUNCTION public.product_recommendations(
  _merchant_id uuid,
  _product_id uuid,
  _limit integer DEFAULT 8
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target RECORD;
  _target_cat_slug text;
  _is_kids boolean;
  _is_mens boolean;
  _is_womens boolean;
  _is_jewelry boolean;
  _is_living boolean;
  _result jsonb;
BEGIN
  -- 1. Fetch current product details
  SELECT p.id, p.category_id, p.tags, c.slug AS cat_slug
  INTO _target
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.id = _product_id AND p.merchant_id = _merchant_id;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  _target_cat_slug := COALESCE(_target.cat_slug, '');
  _is_kids := ('kids' = ANY(_target.tags)) OR _target_cat_slug = 'kids';
  _is_mens := ('mens' = ANY(_target.tags)) OR _target_cat_slug = 'mens';
  _is_womens := ('womens' = ANY(_target.tags)) OR ('saree' = ANY(_target.tags)) OR _target_cat_slug = 'womens';
  _is_jewelry := ('jewelry' = ANY(_target.tags)) OR _target_cat_slug = 'jewelry';
  _is_living := ('living' = ANY(_target.tags)) OR _target_cat_slug = 'living';

  -- 2. Query category-compatible active products
  WITH candidates AS (
    SELECT
      p.id,
      p.title,
      p.slug,
      p.image_url,
      MIN(pv.price_amount_minor_int) AS price_minor,
      (
        CASE WHEN p.category_id = _target.category_id THEN 10 ELSE 0 END +
        COALESCE(cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest(_target.tags))), 0)
      ) AS score
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
    WHERE p.merchant_id = _merchant_id
      AND p.id != _product_id
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      -- Category isolation gates:
      AND (
        CASE
          WHEN _is_kids THEN
            (('kids' = ANY(p.tags)) OR COALESCE(c.slug, '') = 'kids')
          WHEN _is_mens THEN
            NOT ('kids' = ANY(p.tags))
            AND NOT ('saree' = ANY(p.tags))
            AND (('mens' = ANY(p.tags)) OR COALESCE(c.slug, '') = 'mens' OR p.tags && _target.tags)
          WHEN _is_womens THEN
            NOT ('kids' = ANY(p.tags))
            AND NOT ('mens' = ANY(p.tags))
            AND (('womens' = ANY(p.tags)) OR ('saree' = ANY(p.tags)) OR COALESCE(c.slug, '') = 'womens' OR p.tags && _target.tags)
          WHEN _is_jewelry THEN
            (('jewelry' = ANY(p.tags)) OR COALESCE(c.slug, '') = 'jewelry')
          WHEN _is_living THEN
            (('living' = ANY(p.tags)) OR COALESCE(c.slug, '') = 'living')
          ELSE
            -- Fallback: must share at least category or one tag
            (p.category_id = _target.category_id OR p.tags && _target.tags)
            AND NOT (_is_kids != (('kids' = ANY(p.tags)) OR COALESCE(c.slug, '') = 'kids'))
        END
      )
    GROUP BY p.id, p.title, p.slug, p.image_url, p.created_at, p.category_id, p.tags
    ORDER BY score DESC, p.created_at DESC
    LIMIT _limit
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'slug', slug,
        'image_url', image_url,
        'price_minor', price_minor
      )
    ),
    '[]'::jsonb
  )
  INTO _result
  FROM candidates;

  RETURN COALESCE(_result, '[]'::jsonb);
END;
$$;
