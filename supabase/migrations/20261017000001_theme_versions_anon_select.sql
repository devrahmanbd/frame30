-- theme_versions: anon SELECT grant (public storefront reads), 2026-10-17.
--
-- 20260918050000_phase2h_public_theme_reads.sql created the
-- `theme_versions_public_published` policy (status = 'published'), but the
-- public-read grant list in
-- 20260907174014_6c48ad30-9cbe-4af6-a43d-95ce60cfa04f.sql grants anon
-- SELECT on store_themes only — never on theme_versions. With RLS enabled
-- and no table-level grant, `publishedTheme()` (anon/publicClient) gets
-- `permission denied for table theme_versions`, treats it as "no published
-- version" and every storefront silently falls back to the themeless
-- welcome plate (reproduced on the loopback E2E stack 2026-10-17).
--
-- Production serves published themes, so the grant exists there
-- out-of-band; this migration makes fresh databases built from this
-- repository behave identically. Idempotent: safe to replay.

grant select on public.theme_versions to anon;

notify pgrst, 'reload schema';
