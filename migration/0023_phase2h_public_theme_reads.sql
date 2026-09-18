-- Phase 2h — public theme reads for the storefront + live preview.
--
-- publishedTheme() serves shoppers through the anon publishable key, but
-- store_themes / theme_versions had member-only SELECT policies, so EVERY
-- storefront silently rendered default tokens and no published theme ever
-- applied. Drafts stay member-only (previewTheme uses the service client).
create policy store_themes_public_read on public.store_themes
  for select to anon, authenticated using (true);
create policy theme_versions_public_published on public.theme_versions
  for select to anon, authenticated using (status = 'published');
