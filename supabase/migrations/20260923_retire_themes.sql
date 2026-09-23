-- Theme system retirement (2026-09-23, theme-purge Task 5).
--
-- AUDIT NOTE: the theming system is fully retired — zero themes going forward
-- (prior one-theme policy is void). The registry / install / versioning /
-- preview write paths are closed below. Tables are deliberately NOT dropped:
-- historical rows in theme_registry, store_themes, theme_versions,
-- theme_drafts, theme_schedules, theme_custom_code, theme_assets and
-- theme_catalog_favourites stay readable for forensics and order history.
-- Live application reads are removed by purge Tracks 2-4; this migration only
-- closes the database write surface.
--
-- What this migration does (additive only, no history rewritten):
--   1. Drops every known tenant/platform write RLS policy on the theme tables
--      and installs one RESTRICTIVE deny-write policy per table, so even a
--      future permissive policy cannot re-open writes (RESTRICTIVE clauses are
--      AND-ed). SELECT policies are untouched — history stays queryable.
--      service_role bypasses RLS and is unaffected (forensics/admin reads).
--   2. REVOKEs INSERT/UPDATE/DELETE on the theme tables from `authenticated`
--      (defense in depth behind the RLS deny).
--   3. REVOKEs EXECUTE on the theme SECURITY DEFINER RPCs from
--      `authenticated` (they bypass RLS, so the policy deny alone would not
--      stop them). service_role keeps EXECUTE for offline forensics.
--   4. Leaves public.theme_audit fully writable — it is the append-only audit
--      trail, not the registry.
--
-- Chain position: filename 20260923_retire_themes.sql sorts after
-- 20260922120000_theme_registry_v2.sql, so this applies last. Verified by
-- lexical sort of supabase/migrations (20260923 > 20260922*).
--
-- Idempotent: every statement is IF EXISTS / re-runnable; safe to replay.

-- ---------------------------------------------------------------
-- 1. Retire write RLS policies (reads stay).
-- ---------------------------------------------------------------

-- store_themes: drop tenant write, keep tenant read + public read.
DROP POLICY IF EXISTS store_themes_tenant_write ON public.store_themes;
DROP POLICY IF EXISTS store_themes_retired_no_writes ON public.store_themes;
CREATE POLICY store_themes_retired_no_writes ON public.store_themes
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_versions: drop tenant write, keep tenant read.
DROP POLICY IF EXISTS theme_versions_tenant_write ON public.theme_versions;
DROP POLICY IF EXISTS theme_versions_retired_no_writes ON public.theme_versions;
CREATE POLICY theme_versions_retired_no_writes ON public.theme_versions
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_drafts: drop tenant write, keep tenant read.
DROP POLICY IF EXISTS theme_drafts_tenant_write ON public.theme_drafts;
DROP POLICY IF EXISTS theme_drafts_retired_no_writes ON public.theme_drafts;
CREATE POLICY theme_drafts_retired_no_writes ON public.theme_drafts
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_schedules: drop tenant write, keep tenant read.
DROP POLICY IF EXISTS theme_schedules_tenant_write ON public.theme_schedules;
DROP POLICY IF EXISTS theme_schedules_retired_no_writes ON public.theme_schedules;
CREATE POLICY theme_schedules_retired_no_writes ON public.theme_schedules
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_registry: drop platform write-all, keep a platform-admin SELECT.
DROP POLICY IF EXISTS theme_registry_platform_only ON public.theme_registry;
DROP POLICY IF EXISTS theme_registry_retired_no_writes ON public.theme_registry;
DROP POLICY IF EXISTS theme_registry_retired_read ON public.theme_registry;
CREATE POLICY theme_registry_retired_read ON public.theme_registry
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY theme_registry_retired_no_writes ON public.theme_registry
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_custom_code: drop tenant read-write-all, keep a tenant SELECT.
DROP POLICY IF EXISTS theme_custom_code_tenant_rw ON public.theme_custom_code;
DROP POLICY IF EXISTS theme_custom_code_retired_no_writes ON public.theme_custom_code;
DROP POLICY IF EXISTS theme_custom_code_retired_read ON public.theme_custom_code;
CREATE POLICY theme_custom_code_retired_read ON public.theme_custom_code
  FOR SELECT TO authenticated USING (public.is_merchant_member(merchant_id));
CREATE POLICY theme_custom_code_retired_no_writes ON public.theme_custom_code
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_assets: drop tenant write, keep public read.
DROP POLICY IF EXISTS theme_assets_tenant_write ON public.theme_assets;
DROP POLICY IF EXISTS theme_assets_retired_no_writes ON public.theme_assets;
CREATE POLICY theme_assets_retired_no_writes ON public.theme_assets
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_catalog_favourites: drop tenant read-write-all, keep a tenant SELECT.
DROP POLICY IF EXISTS theme_catalog_favourites_tenant ON public.theme_catalog_favourites;
DROP POLICY IF EXISTS theme_catalog_favourites_retired_no_writes ON public.theme_catalog_favourites;
DROP POLICY IF EXISTS theme_catalog_favourites_retired_read ON public.theme_catalog_favourites;
CREATE POLICY theme_catalog_favourites_retired_read ON public.theme_catalog_favourites
  FOR SELECT TO authenticated USING (public.is_merchant_member(merchant_id));
CREATE POLICY theme_catalog_favourites_retired_no_writes ON public.theme_catalog_favourites
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- theme_audit is intentionally untouched: append-only audit trail.

-- ---------------------------------------------------------------
-- 2. Revoke direct write grants from `authenticated` (SELECT stays).
-- ---------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.theme_registry FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_themes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_drafts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_schedules FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_custom_code FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_assets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_catalog_favourites FROM authenticated;

-- ---------------------------------------------------------------
-- 3. Revoke EXECUTE on theme write RPCs from `authenticated`.
--    (SECURITY DEFINER functions bypass RLS; service_role keeps access.)
-- ---------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.theme_autosave(uuid, jsonb, jsonb, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_commit(uuid, jsonb, jsonb, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_publish(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_rollback(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_schedule_set(uuid, uuid, text, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_schedule_cancel(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_install_preset(uuid, text, jsonb, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_update_apply(uuid, text, text, jsonb, jsonb, text, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_import_demo(uuid, text, jsonb, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.theme_purge_demo(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_theme_slides(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_theme_media(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_theme_products(uuid, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_theme_posts(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_theme_all(uuid, text) FROM authenticated;
