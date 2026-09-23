-- Counter-migration to 20260923_retire_themes.sql.
--
-- The purge was rescoped 2026-09-23: only the old preset packs (Clothing
-- Heritage, Supershop) stay removed; the theme ENGINE (appearance lifecycle,
-- builder versions, marketplace install, custom code, preview) is restored.
-- This file re-opens exactly what the retire migration closed, using the
-- original policy/grant definitions verbatim:
--   policies: migration/0001_baseline.sql,
--     supabase/migrations/20260919090001_careful_new_tables_b.sql,
--     supabase/migrations/20260918120000_p0_rls_lockdown.sql,
--     supabase/migrations/20260918130000_p0_rls_tier2.sql
--   grants: migration/0001_baseline.sql (SELECT,INSERT,DELETE,UPDATE).
-- History rows are untouched; nothing is dropped except the retired policies.

-- 1. Drop the retired deny/read policies installed by the retire migration.
DROP POLICY IF EXISTS store_themes_retired_no_writes ON public.store_themes;
DROP POLICY IF EXISTS theme_versions_retired_no_writes ON public.theme_versions;
DROP POLICY IF EXISTS theme_drafts_retired_no_writes ON public.theme_drafts;
DROP POLICY IF EXISTS theme_schedules_retired_no_writes ON public.theme_schedules;
DROP POLICY IF EXISTS theme_registry_retired_no_writes ON public.theme_registry;
DROP POLICY IF EXISTS theme_registry_retired_read ON public.theme_registry;
DROP POLICY IF EXISTS theme_custom_code_retired_no_writes ON public.theme_custom_code;
DROP POLICY IF EXISTS theme_custom_code_retired_read ON public.theme_custom_code;
DROP POLICY IF EXISTS theme_assets_retired_no_writes ON public.theme_assets;
DROP POLICY IF EXISTS theme_catalog_favourites_retired_no_writes ON public.theme_catalog_favourites;
DROP POLICY IF EXISTS theme_catalog_favourites_retired_read ON public.theme_catalog_favourites;

-- 2. Restore the original tenant write policies.
DROP POLICY IF EXISTS store_themes_tenant_write ON public.store_themes;
CREATE POLICY store_themes_tenant_write ON public.store_themes TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS theme_versions_tenant_write ON public.theme_versions;
CREATE POLICY theme_versions_tenant_write ON public.theme_versions TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS theme_drafts_tenant_write ON public.theme_drafts;
CREATE POLICY theme_drafts_tenant_write ON public.theme_drafts TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS theme_schedules_tenant_write ON public.theme_schedules;
CREATE POLICY theme_schedules_tenant_write ON public.theme_schedules TO authenticated USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS theme_registry_platform_only ON public.theme_registry;
CREATE POLICY theme_registry_platform_only ON public.theme_registry TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS theme_custom_code_tenant_rw ON public.theme_custom_code;
CREATE POLICY theme_custom_code_tenant_rw ON public.theme_custom_code FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS theme_assets_tenant_write ON public.theme_assets;
CREATE POLICY theme_assets_tenant_write ON public.theme_assets
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin())
  WITH CHECK (public.is_merchant_member(merchant_id) OR public.is_platform_admin());
DROP POLICY IF EXISTS theme_catalog_favourites_tenant ON public.theme_catalog_favourites;
CREATE POLICY theme_catalog_favourites_tenant ON public.theme_catalog_favourites
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

-- 3. Restore table grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_registry TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_themes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_custom_code TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_catalog_favourites TO authenticated;

-- 4. Restore RPC execution for the theme lifecycle.
GRANT EXECUTE ON FUNCTION public.theme_autosave(uuid, jsonb, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_commit(uuid, jsonb, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_rollback(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_schedule_set(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_schedule_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_install_preset(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_update_apply(uuid, text, text, jsonb, jsonb, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_import_demo(uuid, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.theme_purge_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_theme_slides(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_theme_media(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_theme_products(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_theme_posts(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_theme_all(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
