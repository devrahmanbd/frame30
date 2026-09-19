-- Repair: re-apply the public storefront read policies that exist in
-- 20260907174014 but never landed live (partial-apply divergence), plus two
-- tables that never had a public policy at all. Idempotent (DROP+CREATE).
-- Without these, anonymous shoppers silently get empty rows: 0.00 prices,
-- missing categories/collections/pages/reviews (Sept 2026 night-shift audit).
-- Prerequisites verified live: is_public_merchant() exists; deleted_at
-- exists on categories/collections/storefront_pages/products/variants.

-- Canonical re-applies (verbatim from 20260907174014).
DROP POLICY IF EXISTS product_variants_public_read ON public.product_variants;
CREATE POLICY product_variants_public_read ON public.product_variants FOR SELECT TO anon, authenticated USING (deleted_at IS NULL AND public.is_public_merchant(merchant_id) AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'active' AND p.deleted_at IS NULL));

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories FOR SELECT TO anon, authenticated USING (deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS collections_public_read ON public.collections;
CREATE POLICY collections_public_read ON public.collections FOR SELECT TO anon, authenticated USING (is_published = true AND deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS storefront_pages_public_read ON public.storefront_pages;
CREATE POLICY storefront_pages_public_read ON public.storefront_pages FOR SELECT TO anon, authenticated USING (is_published = true AND deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS product_reviews_public_read ON public.product_reviews;
CREATE POLICY product_reviews_public_read ON public.product_reviews FOR SELECT TO anon, authenticated USING (status = 'published' AND public.is_public_merchant(merchant_id));

-- New: join + meta tables the storefront reads anonymously (seo.server.ts,
-- storefront-search, collection browsing). Same visibility rule, no new data.
DROP POLICY IF EXISTS collection_products_public_read ON public.collection_products;
CREATE POLICY collection_products_public_read ON public.collection_products FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_products.collection_id AND c.is_published = true AND c.deleted_at IS NULL AND public.is_public_merchant(c.merchant_id)));

DROP POLICY IF EXISTS seo_meta_public_read ON public.seo_meta;
CREATE POLICY seo_meta_public_read ON public.seo_meta FOR SELECT TO anon, authenticated USING (public.is_public_merchant(merchant_id));

-- Grants (idempotent): a policy without a grant still denies.
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.collections TO anon, authenticated;
GRANT SELECT ON public.collection_products TO anon, authenticated;
GRANT SELECT ON public.storefront_pages TO anon, authenticated;
GRANT SELECT ON public.product_reviews TO anon, authenticated;
GRANT SELECT ON public.seo_meta TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
