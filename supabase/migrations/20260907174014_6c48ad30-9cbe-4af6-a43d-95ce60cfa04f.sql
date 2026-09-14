-- =====================================================================
-- Post-remix RLS restoration: anonymous EXECUTE boundary + merchant_settings column grant.
-- All statements are idempotent.
-- =====================================================================

-- 1. Revoke anonymous EXECUTE from PUBLIC on privileged SECURITY DEFINER routines.
--    PUBLIC (not just anon) is revoked because anon inherits PUBLIC's grant.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.stock_hold_sweep() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.schema_fingerprint() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_ingest(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_flush(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_claim_conversions(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_claim_reports(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_queue_conversion(uuid, text, text, text, uuid, bigint, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_settle_conversion(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_rebuild_cohorts(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pos_shift_report(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pos_move_stock(uuid, uuid, uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_hold_release(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_save_plan(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_set_flag(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_set_tenant_limits(uuid, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_clear_tenant_limits(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_audit_event(text, text, text, jsonb, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_merchant_suspend(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_merchant_reinstate(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.customer_overview(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.customer_order_detail(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.customer_require_self(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mfa_recovery_replace(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mfa_recovery_consume(uuid, text) FROM PUBLIC;

-- 2. Re-grant to the roles that legitimately call these routines.
--    Cron/server-only ingest paths: service_role only (called from cron tokens
--    and verified webhooks with the service key).
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.stock_hold_sweep() TO service_role;
GRANT EXECUTE ON FUNCTION public.schema_fingerprint() TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_ingest(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_flush(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_claim_conversions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_claim_reports(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_queue_conversion(uuid, text, text, text, uuid, bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_settle_conversion(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_rebuild_cohorts(uuid, integer) TO service_role;

--    Merchant/customer/staff/platform desks: signed-in callers (identity is
--    checked inside each SECURITY DEFINER routine) plus the service role.
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.pos_shift_report(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_move_stock(uuid, uuid, uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_hold_release(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_save_plan(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_flag(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_limits(uuid, bigint, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_clear_tenant_limits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_audit_event(text, text, text, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_merchant_suspend(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_merchant_reinstate(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_order_detail(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_require_self(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_recovery_replace(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_recovery_consume(uuid, text) TO service_role;

-- 3. merchant_settings: anonymous storefront reads see only the shipping/COD/
--    support columns. business_bin (tax identifier) is revoked at column level.
-- ---------------------------------------------------------------------
REVOKE SELECT ON public.merchant_settings FROM anon;
GRANT SELECT (merchant_id, tagline, cod_enabled, mfs_enabled, cod_surcharge_minor_int, shipping_flat_minor_int, free_shipping_threshold_minor_int, prices_include_vat, support_email, support_phone) ON public.merchant_settings TO anon;
REVOKE SELECT (business_bin) ON public.merchant_settings FROM anon;

-- 4. is_public_merchant helper (used by the public-read policies).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_public_merchant(_merchant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = _merchant_id AND m.status = 'active')
$$;
GRANT EXECUTE ON FUNCTION public.is_public_merchant(uuid) TO anon, authenticated, service_role;

-- 5. Re-assert the storefront public-read policies (idempotent).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS merchants_public_read ON public.merchants;
CREATE POLICY merchants_public_read ON public.merchants FOR SELECT TO anon, authenticated USING (status = 'active');

DROP POLICY IF EXISTS merchant_settings_public_read ON public.merchant_settings;
CREATE POLICY merchant_settings_public_read ON public.merchant_settings FOR SELECT TO anon, authenticated USING (public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products FOR SELECT TO anon, authenticated USING (status = 'active' AND deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS product_variants_public_read ON public.product_variants;
CREATE POLICY product_variants_public_read ON public.product_variants FOR SELECT TO anon, authenticated USING (deleted_at IS NULL AND public.is_public_merchant(merchant_id) AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'active' AND p.deleted_at IS NULL));

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories FOR SELECT TO anon, authenticated USING (deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS collections_public_read ON public.collections;
CREATE POLICY collections_public_read ON public.collections FOR SELECT TO anon, authenticated USING (is_published = true AND deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS storefront_pages_public_read ON public.storefront_pages;
CREATE POLICY storefront_pages_public_read ON public.storefront_pages FOR SELECT TO anon, authenticated USING (is_published = true AND deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS articles_public_read ON public.articles;
CREATE POLICY articles_public_read ON public.articles FOR SELECT TO anon, authenticated USING (status = 'published' AND deleted_at IS NULL AND public.is_public_merchant(merchant_id));

DROP POLICY IF EXISTS product_reviews_public_read ON public.product_reviews;
CREATE POLICY product_reviews_public_read ON public.product_reviews FOR SELECT TO anon, authenticated USING (status = 'published' AND public.is_public_merchant(merchant_id));

-- Ensure the public-read tables are selectable by anon (grant, idempotent).
GRANT SELECT ON public.merchants TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.collections TO anon;
GRANT SELECT ON public.collection_products TO anon;
GRANT SELECT ON public.storefront_pages TO anon;
GRANT SELECT ON public.store_themes TO anon;
GRANT SELECT ON public.vat_rates TO anon;
GRANT SELECT ON public.plan_definitions TO anon;