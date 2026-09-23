# Schema Drift Audit — code vs live vs repo DDL (2026-09-19)

Method: three parallel read-only audits (SELECT-only, no writes).
`schema:check` itself is broken (`rpc failed (400)` — the fingerprint RPC
doesn't exist live; same drift class, needs its own fix).

## Headline numbers

- Tables referenced in code: **148 OK · 72 missing live AND missing DDL ·
  11 DDL written but never applied · 8 column drifts · 16 live with no repo
  DDL · 1 wrong-table ref (fixed)**
- RPCs: **6 missing live · 9 signature drifts · 12 broken bodies ·
  52 live RPCs with no repo DDL.** Direction: repo DDL matches code, live is stale.
- RLS: **5 public storefront policies in repo never applied live**
  (variants, categories, collections, storefront_pages, product_reviews);
  overbroad anon grants on reviews/nav_menus/seo_settings; `api_key_usage`
  has RLS disabled.

## P0 — breaks real flows (tonight's casualties marked ✓ = worked around)

1. `product_variants` public SELECT missing live → all prices 0.00. ✓ App-side
   service-role merge (`storefront.server.ts`) + repair migration
   `20260919050000` (canonical re-apply + collection_products/seo_meta).
2. `stock_hold_*` RPCs reference a `lines jsonb` shape that doesn't exist;
   live table is row-per-line. ✓ Holds rewritten app-side
   (`checkout.server.ts`, delta-converging). DDL repair still needed.
3. `order_public_view` stub references `total_minor` (live: `total_minor_int`),
   never checks token. ✓ Receipt read rewritten app-side; tokens now
   generated app-side (`orders.server.ts`).
4. `provider_credentials` + `provider_credential_events`: zero DDL anywhere —
   payment-providers page crashes. Needs a proper migration (columns inferable
   from `provider-gate.server.ts`: provider_key, environment, state,
   checklist, provider_merchant_ref, submitted/decided/activated_at,
   decision_note, suspended_reason) — **not yet written, DBA review required**.
5. `merchant_settings` has UNIQUE but no PK → client upsert 409'd. ✓ Fixed
   in code (`onConflict`). Consider adding a PK in a future migration.
6. `payouts` column drift (live: company_id/amount_cents vs code:
   merchant_id/amount_minor_int) — payout flows broken. Needs migration.
7. `url_redirects` drift (live: source/target_path vs code: from/to_path) —
   redirects broken. Needs migration.
8. `custom_domains` wrong-table ref in `content-health.server.ts:224`.
   ✓ Fixed → `merchant_domains`.
9. `domain_challenges` DDL unapplied (`20260919040000`) — needs owner apply.
10. `store_currency_settings` missing — currency gate will fail. Needs DDL.
11. `support_tickets` drift + missing events/SLA tables. Needs DDL.
12. `oauth_*` missing/drift. Needs DDL.
13. `marketplace_versions`/`app_blocks`, `refund_items`, `design_assets` drift,
    `draft_orders` drift + `draft_order_items` unapplied, gift-card RPC bodies,
    `abandoned_cart_capture`, `consent_record`, `review_submit`,
    `customer_save_address`, `customer_overview_impl`, courier event RPCs,
    cron family (`ops_cron_runs` missing). Each needs its repo DDL applied
    (most DDL already exists and matches code) or a repair migration.

## P1 — feature areas down, core shop intact

Experiments (+variants/exposures), virtual delivery, search-console tables,
contact pipeline, loyalty/affiliate/referral/growth, suppliers/purchase
orders, `support_callbacks`, `support_kb_chunks`, AI training/feedback,
`ops_cron_jobs/runs`, `order_notes/saved_views`, price lists, B2B, ad stack
(8 tables), `ai_channels`, `content_health_*`, `seo_templates/weight_*`,
`blog_authors`, `contact_*`, `newsletter_*`, `oauth_*`, `support_ticket_*`.

## P2 — live tables with no repo DDL (a restore loses them)

`plugin_state`, `article_revisions`, `builder_template_seo`,
`integration_connections/probes`, `job_queue`, `marketplace_payouts`,
`mfa_recovery_codes`, `nav_menus/items`, `newsletter_subscribers`,
`platform_snapshots/restores`, `plugin_kill_switch`, `seo_not_found_log`,
`design_catalog_favourites`, plus the 52 live RPCs with no repo DDL —
backfill from `pg_get_functiondef` so the repo is source of truth again.

## What blocks applying repairs

Live DDL requires the table owner; the available SQL channel runs as a
non-owner role (CREATE POLICY denied). Repairs must be applied via Supabase
CLI/dashboard as owner, in filename order. The migration files are ready in
`supabase/migrations/`.

## Fixed during the night shift (app-side, all tested + live)

429 storm guards · domains loader degrade path · onboarding path-URL model ·
custom-host storefront route (SNI-gate status set) · variant price serving ·
cart quoting by variant id · delta-converging stock holds · receipt tokens ·
guest receipt read · settings upsert conflict target · inline delete confirm ·
wrong-table ref · edge catch-all + LE cert for microscrop.shop (host-level).
