-- Phase P0-3b — Tier-2 RLS write-hardening (found live 2026-09-18).
--
-- 19 tables carried `ALL TO public` policies: anonymous internet users could
-- INSERT/UPDATE/DELETE (content spoofing, analytics poisoning, telemetry
-- flooding). Reads stay exactly as render paths require; writes move behind
-- tenant membership. service_role bypasses RLS, so service ingest paths
-- (vitals, analytics flush, probe crons) are unaffected.

-- ---------- public reads the storefront/blog needs; member writes ----------
drop policy if exists article_terms_open on public.article_terms;
create policy article_terms_public_read on public.article_terms
  for select to public using (true);
create policy article_terms_tenant_write on public.article_terms
  for all to authenticated
  using (exists (select 1 from public.articles a
                 where a.id = article_terms.article_id
                   and (is_merchant_member(a.merchant_id) or is_platform_admin())))
  with check (exists (select 1 from public.articles a
                      where a.id = article_terms.article_id
                        and (is_merchant_member(a.merchant_id) or is_platform_admin())));

-- blog_terms is GLOBAL taxonomy (no tenant key): public read, any
-- authenticated write (abuse is audit-trailed per write in blog-taxonomy).
drop policy if exists blog_terms_open on public.blog_terms;
create policy blog_terms_public_read on public.blog_terms
  for select to public using (true);
create policy blog_terms_auth_write on public.blog_terms
  for all to authenticated using (true) with check (true);

drop policy if exists nav_menus_open on public.nav_menus;
create policy nav_menus_public_read on public.nav_menus
  for select to public using (true);
create policy nav_menus_tenant_write on public.nav_menus
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());

drop policy if exists nav_menu_items_open on public.nav_menu_items;
create policy nav_menu_items_public_read on public.nav_menu_items
  for select to public using (true);
create policy nav_menu_items_tenant_write on public.nav_menu_items
  for all to authenticated
  using (exists (select 1 from public.nav_menus m
                 where m.id = nav_menu_items.menu_id
                   and (is_merchant_member(m.merchant_id) or is_platform_admin())))
  with check (exists (select 1 from public.nav_menus m
                      where m.id = nav_menu_items.menu_id
                        and (is_merchant_member(m.merchant_id) or is_platform_admin())));

drop policy if exists theme_assets_open on public.theme_assets;
create policy theme_assets_public_read on public.theme_assets
  for select to public using (true);
create policy theme_assets_tenant_write on public.theme_assets
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());

drop policy if exists url_redirects_open on public.url_redirects;
create policy url_redirects_public_read on public.url_redirects
  for select to public using (true);
create policy url_redirects_tenant_write on public.url_redirects
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());

drop policy if exists builder_template_seo_open on public.builder_template_seo;
create policy builder_template_seo_public_read on public.builder_template_seo
  for select to public using (true);
create policy builder_template_seo_tenant_write on public.builder_template_seo
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());

-- ---------- member/admin reads; member writes (service ingest bypasses) ----------
drop policy if exists seo_not_found_log_open on public.seo_not_found_log;
create policy seo_not_found_log_tenant on public.seo_not_found_log
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());

drop policy if exists web_vitals_sample_open on public.web_vitals_sample;
create policy web_vitals_sample_tenant_read on public.web_vitals_sample
  for select to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin());
-- NOTE: no authenticated write policy — ingestion runs service-side
-- (ingestVitals uses supabaseAdmin). Anon beacons hit /api/public/vitals,
-- which validates + rate-limits before the service insert.

drop policy if exists analytics_batches_open on public.analytics_batches;
drop policy if exists analytics_cohorts_open on public.analytics_cohorts;
drop policy if exists analytics_conversion_events_open on public.analytics_conversion_events;
drop policy if exists analytics_daily_open on public.analytics_daily;
drop policy if exists analytics_geo_daily_open on public.analytics_geo_daily;
drop policy if exists analytics_report_runs_open on public.analytics_report_runs;
drop policy if exists analytics_reports_open on public.analytics_reports;
create policy analytics_batches_tenant on public.analytics_batches
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());
create policy analytics_cohorts_tenant on public.analytics_cohorts
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());
create policy analytics_conversion_events_tenant on public.analytics_conversion_events
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());
create policy analytics_daily_tenant on public.analytics_daily
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());
create policy analytics_geo_daily_tenant on public.analytics_geo_daily
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());
create policy analytics_report_runs_tenant on public.analytics_report_runs
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());
create policy analytics_reports_tenant on public.analytics_reports
  for all to authenticated
  using (is_merchant_member(merchant_id) or is_platform_admin())
  with check (is_merchant_member(merchant_id) or is_platform_admin());

drop policy if exists article_revisions_open on public.article_revisions;
create policy article_revisions_tenant on public.article_revisions
  for all to authenticated
  using (exists (select 1 from public.articles a
                 where a.id = article_revisions.article_id
                   and (is_merchant_member(a.merchant_id) or is_platform_admin())))
  with check (exists (select 1 from public.articles a
                      where a.id = article_revisions.article_id
                        and (is_merchant_member(a.merchant_id) or is_platform_admin())));
drop policy if exists page_revisions_open on public.page_revisions;
create policy page_revisions_tenant on public.page_revisions
  for all to authenticated
  using (exists (select 1 from public.storefront_pages p
                 where p.id = page_revisions.page_id
                   and (is_merchant_member(p.merchant_id) or is_platform_admin())))
  with check (exists (select 1 from public.storefront_pages p
                      where p.id = page_revisions.page_id
                        and (is_merchant_member(p.merchant_id) or is_platform_admin())));

drop policy if exists integration_probes_open on public.integration_probes;
create policy integration_probes_tenant on public.integration_probes
  for all to authenticated
  using (exists (select 1 from public.integration_connections c
                 where c.id = integration_probes.connection_id
                   and (is_merchant_member(c.merchant_id) or is_platform_admin())))
  with check (exists (select 1 from public.integration_connections c
                      where c.id = integration_probes.connection_id
                        and (is_merchant_member(c.merchant_id) or is_platform_admin())));
