# Framique — BUILD.md

Single flat ledger of every feature in the product, split into four tiers by
shipping priority. Tiers answer *when*; the `[A]` marker answers *how badly it
hurts if it is wrong*.

Source of truth for scope: `basic.md`, `plan.md`, `docs/**`, `SYSTEM.md`.
Rules of engagement: `AGENTS.md`. This file is the checkbox surface — tick a box
only when the owning doc's testing gate is green (`AGENTS.md` §4).

## Legend

| Marker | Meaning |
|---|---|
| `[ ]` | not built |
| `[~]` | partial — shipped but a listed gate is still red |
| `[x]` | built, doc-accepted, E2E green |
| `[A]` | **special case** — money, transaction integrity, data safety, tenant leak, or vulnerability. A defect here can expose the business within a moment. |

### Section A rules (non-negotiable, apply to every `[A]` line)

1. Money is `currency_code` (ISO 4217) + `amount_minor_int` (integer minor units). No floats stored, transmitted, or computed. BDT default; USD only behind the pilot gate with a stored `fx_rate` snapshot (`docs/06-payments/currency.md`).
2. Every tenant-scoped read and write is RLS-enforced and `merchant_id`-scoped. No cross-tenant join without an explicit platform-admin path.
3. Charge, refund, payout, and POS sync are idempotent via Redis/DB idempotency keys. Replays return the original verdict, never a second effect.
4. No client-trusted decisions: price, discount, stock, tax, entitlement, risk, and role are resolved server-side only.
5. Secrets never leave the server boundary; error bodies never echo secrets, internal reasons, or PII.
6. `[A]` lines ship with a failure-suite E2E case, not only a happy path.
7. `[A]` lines require an append-only audit row (actor, before, after, reason).

### Tier definitions

- **1. Core** — the platform is not a platform without it. Blocks every other slice.
- **2. Must have** — required for a merchant to run a real BD store and for us to bill them. Launch-blocking.
- **3. Good to have** — competitive parity and depth. Post-launch, ordered by pull.
- **4. Optional / out of the box** — differentiators, long-tail, and provider-gated work.

---

## 1. Core

### 1.1 Tenancy & data foundation
- [x] `[A]` Postgres baseline schema versioned in-repo (`supabase/migrations/00000000000000_baseline_schema.sql`)
- [x] `[A]` Multi-tenant model: `merchants`, `merchant_settings`, membership, `merchant_id` on every tenant table
- [x] `[A]` RLS enabled on every public table + explicit GRANTs per role
- [x] `[A]` Security-definer helpers (`staff_has`, `is_platform_admin`, role lookups) — never role columns on profiles
- [x] `[A]` `merchant_role` enum + policy scope reconciliation (`docs/02-merchant/staff-rbac.md` §13)
- [x] `updated_at` triggers on all mutable tables
- [x] `[A]` Cross-tenant leak test suite (negative RLS assertions per table) — `.e2e/specs/tenant_isolation.spec.ts`, 98 assertions
- [x] `[A]` Schema drift check in CI (repo migrations vs live schema) — `public.schema_fingerprint()` + `bun run schema:check`
- [x] Soft-delete / tombstone convention for tenant data — `deleted_at` on 14 tenant tables + guarded `soft_delete_row()`
- [x] `[A]` Tenant hard-delete + purge job (GDPR-grade, cascades verified) — request → suspend → cooling window → audited purge
- [x] `[A]` Rate-limit primitive (`rate_limit_counters` + `rate_limit_hit()`, service-role only, named buckets)
- [x] Per-isolate TTL cache with stale-while-revalidate and single-flight (`src/lib/cache.server.ts`)
- [x] Observability: structured logs, span latency/outcome metrics, Prometheus exposition at `/api/public/metrics`, Sentry forwarding
- [x] Owner console tenancy desk (`/root/tenancy`): isolation posture, drift, tombstones, purge queue, runtime counters
- [x] Grafana dashboard JSON committed next to the scrape config (`ops/observability/grafana/*.json`: platform, infrastructure, ad-fraud + provisioning)
- [ ] Purge job scheduler (cron) so an elapsed cooling window executes without a human click

### 1.2 Identity & access
- [x] Email/password auth, session hydration, `/auth` route
- [x] `[A]` Authenticated route gate (`_authenticated/route.tsx`) — no protected loader on public routes
- [x] `[A]` Bearer-token attach middleware for server functions (`src/start.ts`)
- [x] Staff invite + approval queue
- [x] `[A]` Staff RBAC permission matrix, server-enforced
- [x] Platform-admin (owner) persona separated from merchant staff
- [x] Google OAuth sign-in (provider configured, `/auth` continue-with-Google)
- [x] `[A]` TOTP 2FA enrolment + challenge (security desk, `aal2` claim is source of truth)
- [x] `[A]` Step-up grants: single-use, 5-minute, burned atomically by `step_up_consume`; refund path gated
- [x] Session registry (device + hashed IP) with remote revoke (`signOut({ scope: "others" })`)
- [x] `[A]` Password reset that never discloses account existence
- [x] `[A]` Brute-force / credential-stuffing lockout (email + IP double bucket, fail-closed messaging)
- [x] `[A]` PII-minimal `auth_events` audit trail (salted SHA-256 email/IP hashes)
- [x] `[A]` `auth_loop` failure suite: lockout, enumeration safety, gated security desk, closed metrics endpoint
- [ ] Email change with re-verification
- [ ] `[A]` Step-up gate extended to payouts and gateway credential edits
- [ ] Recovery codes for TOTP loss

### 1.3 Money engine
- [x] `[A]` Integer minor-unit money type across schema (all `bigint`)
- [x] `[A]` `fmtMinor` single presentation helper, tabular-nums
- [x] `[A]` BDT-only default posture per store
- [x] `[A]` VAT rate tables by legal year (no hardcoded rates)
- [x] `[A]` VAT compute service (`src/lib/vat.ts` incl/excl + per-line allocation, `vat_resolve` legal-year RPC, half-up rounding pinned)
- [x] `[A]` FX rate snapshot table + conversion boundary (`fx_rates` in integer ppm, `src/lib/fx.server.ts`, USD pilot gate fails closed)
- [x] `[A]` Currency conformance report (`money_conformance()` RPC + owner money desk: float columns, missing triggers, split/currency mismatches)
- [x] `[A]` Ledger model: append-only, no in-place amount mutation (DB triggers + `postLedgerEntry` / `postCorrection` with mandatory idempotency key)
- [x] `[A]` Rounding + remainder policy: largest-remainder `allocate`, proportional refund VAT, unit-tested (`bun run test`)
- [ ] BIN on invoice PDF (needs the invoice renderer in 2.x)

### 1.4 Catalog core
- [x] Products (physical) with media, status, slug
- [x] Categories, brands, collections
- [x] Product options & variants
- [x] `[A]` Inventory quantity as source of truth (server-decremented)
- [x] Admin product form + list + detail
- [x] `[A]` Product kinds enum + coherence trigger (`physical|digital|service|subscription`; non-physical can never enter shipping)
- [x] Digital products (`digital_assets` + hashed single-token `digital_grants`, download limit and expiry burned server-side by `digital_grant_consume`)
- [x] Service products (`service_offerings`: duration, buffer, capacity, location kind, booking window, free-cancel window)
- [x] `[A]` Subscription products (`subscription_terms` per variant: interval, count, trial, minimum cycles)
- [x] Product metafields with definitions (`metafield_definitions` + DB validation trigger for type, bounds, required, url/date shape)
- [x] `[A]` Smart (rule-based) collections evaluated server-side (`collection_resolve` v2: soft-delete aware, kind/tag/metafield conditions, 1000-row cap, rule-shape trigger)
- [x] Bulk import (CSV) with dry-run diff (`catalog_import_dry_run` classifies every row; `catalog_import_apply` is idempotent per source hash)
- [x] Catalog core desk (`/admin/catalog`): kind coverage, incoherence gaps, metafield contracts, reviewed import
- [x] Observability + limits: `framique_catalog_import_total`, `catalog.import` (10/10min) and `catalog.search` buckets, cached collection preview
- [x] Failure suite `catalog_loop` + isolation coverage for every new table
- [ ] CSV export of the catalog with the same column contract (needs the 2.x export renderer)

### 1.5 Storefront core
- [x] Tenant storefront at `/store/$slug` (index, product, checkout, order)
- [x] Builder-AST section rendering
- [x] `[A]` Single H1 per page, semantic landmarks, alt text
- [x] Per-route `head()` metadata (title, description, OG, Twitter)
- [x] Cart (client state) + cart page
- [x] Bangla-first copy + language toggle
- [x] Storefront search + facets (server-side `storefront_search`, whitelisted sorts, rate limited, cached)
- [x] `[A]` Customer accounts on the storefront (order history scoped to the customer via `auth.uid()`)
- [x] Blog / pages content rendering (`storefront_pages` + allow-list Markdown renderer + `/admin/pages`)
- [x] Sitemap per tenant + robots (`/store/$slug/sitemap.xml`, `/robots.txt`)

### 1.6 Checkout & orders core
- [x] Checkout surface with shipping fee + free-shipping threshold
- [x] `[A]` Server-side order creation (price, stock, totals recomputed server-side)
- [x] Order confirmation page
- [x] Admin order list + detail
- [x] `[A]` Order FSM enforced in DB (pending → confirmed → processing → shipped → delivered / cancelled / returned)
- [x] `[A]` Coupon validation server-side with stack rules
- [x] `[A]` Stock hold + expiry during checkout
- [x] `[A]` Guest checkout without leaking prior-order data
- [x] `[A]` Order edit with audited amount deltas

### 1.7 Payments core
- [x] `[A]` Public webhook route with HMAC verify, timestamp skew window, dead-letter path
- [x] `[A]` Idempotent webhook apply RPC (`gateway_apply_webhook`)
- [x] `[A]` PII stripping before any provider body persists
- [x] `[A]` Owner-console gateway event console + re-verified retry
- [x] `[A]` Gateway accounts with per-merchant webhook secret
- [x] `[A]` COD as first-class tender + COD reconcile against courier-collected amount
- [x] `[A]` Charge intent lifecycle (initiate → pending → paid → failed → expired)
- [x] `[A]` Refund engine (full + partial, back to original method and currency)
- [x] `[A]` Mock MFS sandbox (every contracted online rail, design-blind contract tests)
- [x] `[A]` Success / fail / cancel return URLs with signature checks
- [x] `[A]` Settlement + reconciliation ledger (`docs/06-payments/settlement-reconciliation.md`)

### 1.8 Platform billing core
- [x] Plans table + seeded tiers (launch, growth, business, enterprise)
- [x] Public `/pricing` reading live plan data
- [x] `[A]` Subscriptions + entitlement triggers (product/staff limits enforced in DB)
- [x] Invoices surface (merchant)
- [x] `[A]` Dunning + grace period + downgrade path (ladder 3/7/14/20/45d, scheduled downgrade applied by sweep)
- [x] `[A]` Proration on plan change (day-prorated, VAT from legal table, idempotent invoice, preview before confirm)
- [x] `[A]` Trial issuance + trial-abuse fingerprinting (server-side hashed signal, claim cap)
- [x] Sweep cron `POST /api/public/cron/billing` (bearer-guarded, idempotent) + `billing_loop` in `e2e:critical`
- See `docs/16-product-pricing/billing-core.md` for the as-built record


### 1.9 Engineering gates
- [x] Playwright harness in `.e2e/` with fixtures + config
- [x] `store_loop`, `admin_loop`, `builder_loop`, `market_loop`, `public_loop`, `failure_loop`, `storefront_loop`
- [x] Seeded demo tenant so `store_loop` actually gates
- [x] `owner_loop`, `currency_gate`, `fraud_loop`, `ai_support_loop` (all in `e2e:critical`)
- [x] `[A]` RLS policy test suite (per-table allow/deny matrix + anon write probes, `src/lib/rls-matrix.test.ts`)
- [x] Lighthouse-equivalent a11y >= 90 release gate (`bun run a11y:gate`, axe-core weighted score, strict on auth/checkout)
- [~] `[A]` Dependency + secret scanning (`bun run scan:deps`, `bun run scan:secrets`, `bun run gates` — green locally; **no CI runner committed**, `.github/workflows/gates.yml` is missing so nothing enforces them per push)
- See `docs/15-e2e/engineering-gates.md` for the as-built record

---

## 2. Must have

### 2.1 Merchant admin
- [x] Admin shell + navigation
- [x] Dashboard KPIs (orders, revenue)
- [x] Settings surface + API keys surface
- [x] Staff list + approvals
- [x] Onboarding / store-setup wizard completion
- [x] Notification centre + admin alerts
- [x] Activity log per merchant (who changed what)
- [x] `[A]` Role editor with least-privilege defaults

### 2.2 Commerce depth
- [x] Coupons (merchant-owned, percent-off)
- [x] `[A]` Discounts: fixed, shipping, buy-X-get-Y, BOGO, thresholds — engine shipped (`commerce-desk`); failure suite in `discount-codes.test.ts` (deny + uniqueness replay + audit counter)
- [x] Auto-generated discount codes + usage caps — `discount-codes.server.ts` + `discount-codes.test.ts` (9 cases: malformed-campaign deny, 500 cap, clamped money fields)
- [x] `[A]` Gift cards (balance ledger, redemption idempotency) — `gift_card_issue`/`redeem` RPCs + `gift-cards.test.ts` (inactive/expired deny, idempotent replay, issue/redeem audit counters)
- [x] Bundles
- [x] `[A]` Returns & refund requests workflow — `returns.server.ts` FSM + `returns.test.ts` (reasonless/empty deny, FSM replay, `framique_return_state_total` audit)
- [x] Dispute management — `openDispute`/`advanceDispute` covered in `returns.test.ts` (open counter + refusal deny)
- [x] Customer records + segments
- [x] Abandoned-cart capture
- [x] Abandoned-cart recovery campaigns
- [x] `[A]` Multi-location inventory + transfers — locations, levels, transfers + `inventory.test.ts` (same-location deny, idempotent receive replay, tenant-scoped reads)
- [x] Low-stock alerts
- [x] `[A]` Fulfilment records + partial fulfilment — built; guard cases in `inventory.test.ts`, lag charted on the commerce dashboard
- [~] `[A]` Tax-inclusive/exclusive display parity with stored totals — `commerce-vat.test.ts` covers math, not display parity
- [~] `[A]` Invoice PDF with BIN, VAT breakdown, sequential numbering — numbering + document built, PDF renderer missing


### 2.3 Builder & themes
- [x] Builder AST engine v1 + editor slots (header / main / footer)
- [x] Theme versions + publish state
- [x] Section renderer with primary-heading resolution
- [x] Widget tray + inspector (full set required by the official themes)
- [x] Global design tokens editor (color, typography, spacing)
- [x] Template hierarchy (index, product, collection, page, blog, cart, checkout)
- [x] `[A]` Publish pipeline with immutable versions + rollback
- [x] Scheduled publish / unpublish
- [x] Responsive breakpoint controls
- [x] Undo/redo + autosave drafts
- [x] 8–10 official themes (classic, modern, landing, heavy shop, supershop, b2b, clothing-modern, clothing-classic, sensory, festivity)
- [x] Theme registry + install / update / rollback
- [x] `[A]` Theme sandbox: theme code cannot read cross-tenant data or secrets

### 2.4 Shipping & delivery
- [x] Shipping settings (flat fee, free-shipping threshold)
- [x] Courier integrations: Steadfast, RedX, Pathao, Paperfly, eCourier, Sundarban
- [x] `[A]` Standardized tracking events (dispatched → in-transit → delivered → COD collected)
- [x] Storefront + admin tracking views
- [x] Shipping zones + rate rules
- [x] Label / consignment creation
- [x] `[A]` Courier webhook verification + dead-letter parity with payments

### 2.5 POS
- [x] POS surface + offline queue hook
- [x] `[A]` Idempotent offline → online sync (replay-safe)
- [x] `[A]` Split tender (cash / card / COD) with drawer reconcile
- [x] Barcode scan + quick-add
- [x] `[A]` POS refunds and returns
- [x] `[A]` Suspicious-order flag surfaced in POS with reason
- [x] Shift open/close + cash count (Z-report)
- [x] Receipt print (dual customer display pending hardware)

### 2.6 Marketing & SEO
- [x] Campaigns, subscribers, articles, media surfaces
- [x] Unsubscribe route
- [x] `[A]` SEO panel (Yoast/RankMath-style): meta, canonical, robots, OG, live scoring, audit ledger (`seo_meta`, `seo_meta_audit`, `/admin/marketing/seo`)
- [x] `[A]` AEO: merchant-authored FAQ answers rendered as `FAQPage` JSON-LD on every surface
- [x] `[A]` Sitemap index + per-template-type sitemaps (pages, products, collections, articles), noindex overrides respected
- [x] `[A]` Consent capture + opt-out honored on every channel (`consent_events` ledger, `consent_record` RPC, audience filter on every send)
- [ ] Email delivery (official SMTP + BYOK)
- [ ] SMS delivery (BD providers, BYOK)
- [ ] Drip sequences + segments
- [ ] Form builder + submissions inbox
- [ ] Google Search Console + GA integration

### 2.7 Owner console (platform)
- [x] Rail navigation with the full platform map
- [x] Plans, Tenants, Trial, Coupons, Marketing, Fraud, AI, Gateway, Users, Settings
- [x] `[A]` Platform kill-switch flags (AI, fraud, marketing)
- [x] `[A]` Owner action audit trail (every cross-tenant read and write)
- [x] `[A]` Impersonation with consent + time limit + full audit
- [x] Platform revenue + MRR / churn view
- [x] `[A]` Merchant suspend / reinstate with payment freeze

### 2.8 Fraud & abuse (must-have layer)
- [x] Fraud desk surface + audit view
- [x] `[A]` Rate limiting + abuse identity scoring at the edge
- [x] `[A]` Rule engine with ordered precedence + explainable score
- [x] `[A]` Fake-order detection (COD-refusal history, velocity, address clustering)
- [x] `[A]` Blacklist + honeypot
- [x] `[A]` Risk-review queue with hold-on-fulfilment
- [x] `[A]` Bot / fake-visitor filtering on the beacon layer

### 2.9 Operations
- [x] `[A]` Automated backup + verified restore drill — nightly via `/api/public/cron/ops`, ledgered, deny+replay+audit tests
- [~] `[A]` Dead-letter queue console with replay across all providers — courier + gateway DLQ surfaces exist; no single cross-provider console
- [~] Prometheus metrics + Grafana dashboards — 7 dashboards (platform, infrastructure, ad-fraud, commerce, marketing, developer platform, ecosystem/AI) + 54 alert rules; `observability-coverage.test.ts` pins the money/security metrics, long-tail counters still uncharted
- [ ] Sentry error tracking with PII scrubbing — `captureError` wired, `SENTRY_DSN` unset so it is a no-op
- [x] Status page + incident comms
- [ ] `[A]` Secret rotation runbook (gateway secrets, API keys)
- [x] Log retention policy (raw analytics 90d, PII-minimal)


---

## 3. Good to have

### 3.1 Storefront & conversion
- [ ] Product reviews + moderation
- [ ] Wishlists
- [ ] Recently viewed / recommendations
- [ ] Cross-sell + upsell blocks
- [ ] Countdown / scarcity widgets
- [ ] Size guide + variant swatches
- [ ] PWA storefront + offline browse
- [ ] Multi-language storefront catalogs (i18n beyond bn/en)
- [ ] Store locator
- [x] `[A]` Server-side A/B experiments with stable variant assignment — `experiments.server.ts` + `experiments.test.ts` (stability replay, control-path degrade deny, integer-minor conversion guard)

### 3.2 Commerce
- [ ] Pre-orders + backorder
- [ ] Draft orders / invoice-by-link
- [ ] B2B price lists + net terms
- [ ] Purchase orders + supplier records
- [ ] Barcode / SKU generator
- [ ] Bulk price + inventory editor
- [ ] Order tagging + saved views
- [ ] `[A]` Subscription billing for storefront customers (recurring charge idempotency)

### 3.3 Marketplace & ecosystem
- [x] Official themes + plugins store surface
- [x] Creator submit + moderation surfaces
- [x] Community upload with versioning + reviews — `marketplace-vault.server.ts` + `marketplace-vault.test.ts` (forward-version deny, identical-bytes replay)
- [x] `[A]` Plugin scope model + install consent screen — `marketplace-scopes.ts` + consent gate; `marketplace-vault.test.ts` covers scope-escalation deny, consent audit row and idempotent install replay
- [ ] `[A]` Plugin sandbox runtime (worker sidecar host)
- [ ] Widget API for third-party bundles
- [x] `[A]` Content-addressed immutable source vault for submissions — sha256 content hash + replay short-circuit, proven by key-order-independent replay cases in `marketplace-vault.test.ts`
- [x] Payouts to creators — `payoutOverview/accruePayout/settlePayout` + double-settle replay/deny cases; `framique_market_payout_total` charted on the ecosystem dashboard
- [ ] App blocks embeddable into merchant themes

### 3.4 Analytics
- [x] Merchant analytics surface
- [x] Event pipeline: beacon → Redis buffer → batch ETL
- [x] Funnel + drop-off reports
- [x] Buyer-persona analytics
- [x] Cohort + retention
- [x] Product performance + inventory aging
- [x] `[A]` Server-side conversion events for FB/Google (attribution integrity)
- [x] Custom report builder + scheduled exports

### 3.5 AI & support
- [x] AI assistant surface (admin) + AI oversight (owner)
- [x] Support widget on the storefront
- [x] `[A]` Behavior trajectory collection with consent gate
- [x] Merchant support action agent (ticket, compose, rule call)
- [x] Customer-facing AI chat with tenant-scoped retrieval
- [x] WhatsApp plugin
- [x] Messenger plugin
- [x] `[A]` AI output guardrails (no cross-tenant data, no price/refund authority)
- [x] Ticket system + SLA view

### 3.6 Developer platform
- [x] API key lifecycle surface
- [x] Export jobs + export files
- [x] `[A]` OAuth 2.1 auth-code + PKCE for third-party apps (consent screen, rotating refresh tokens with reuse detection, revocation)
- [x] REST API surface with per-scope authorization (rate limits, idempotency, cursor pagination, problem+json, metrics)
- [x] `[A]` Webhook registry with HMAC signing + per-merchant secret rotation (dual-sign grace window, backoff retries, dead-letter, replay)
- [ ] TypeScript SDK
- [ ] Go SDK
- [ ] Full website export (data + assets, live-to-migrate)
- [ ] Import / migration from other CMS (WooCommerce, Shopify)
- [x] Public API docs + sandbox playground (admin → Developer platform → REST & SDK)
- [ ] GraphQL surface

### 3.7 Merchant experience
- [x] Custom domain onboarding with automated TLS (ACME http-01 responder at `/.well-known/acme-challenge/$token`, HMAC-signed edge callback, auto-renew sweep)
- [x] Domain state machine + verification UI (`src/lib/domains.ts` rules + tests, `domains.server.ts` transitions/audit, `/admin/settings/domains`)
- [ ] Onboarding checklist + guided tours
- [ ] In-app changelog + feature announcements
- [ ] Merchant newsletter from platform
- [ ] Mobile-responsive admin pass

---

## 4. Optional / out of the box

### 4.1 Provider-gated
- [x] `[A]` Live MFS credentials (bKash / Nagad / Rocket / Upay / Tap / mCash / SureCash) behind explicit sign-off gate — `provider-gate.ts`, `payments-gate.test.ts`
- [x] `[A]` Bank-wallet and aggregator rails (CellFin, SSLCOMMERZ, aamarPay, ShurjoPay, PortWallet) with PCI SAQ + bank-account checks — `payment-rails.ts`, `payment-rails.test.ts`
- [ ] `[A]` Direct bank rails + card acquiring
- [ ] `[A]` BNPL / EMI (bKash PayLater, Nagad BNPL, bank EMI)
- [x] `[A]` Merchant payout system (MFS + bank, settled, dual-approval) — `payouts.server.ts`, four-eyes + `payout_approvals`; failure suite `payouts.test.ts` (self-approval deny, double-settle replay, FSM deny, audit trail); treasury dashboard + 5 alerts
- [x] `[A]` USD pilot store gate + FX audit surface — `currency-gate.ts`, `fx.server.ts`, `payments-gate.test.ts`
- [x] Licensing / regulatory posture (`docs/06-payments/licensing.md`)

### 4.2 Differentiators (the moat)
- [x] `[A]` Ad-fraud defense: click-fraud and fake-visitor protection for merchant FB/Google spend — `ad-fraud.ts` + `ad-fraud.test.ts`, ad-fraud dashboard, 3 alerts
- [x] `[A]` Attribution-integrity report (which ad spend was poisoned and why) — `campaignIntegrity` / `summarizeIntegrity`, `ad_integrity_days`
- [x] `[A]` Fake-visitor scoring model + intent signals — `scoreVisitor`, `ad_visitor_profiles`
- [x] Fraud reason explainer surfaced to the merchant in Bangla — `i18n-dict.ts` rule titles/hints
- [x] Cross-merchant abuse network signals (privacy-preserving) — `ad_network_signals` keyed by salted digest, consumed by `scoreClick` via the `NETWORK_ABUSE` signal

### 4.3 Long tail
- [x] Virtual product delivery (game keys, gift codes) by email + SMS — `virtual-delivery.*`, tested
- [x] Loyalty points + referral program — `loyalty.*`, tested
- [x] Affiliate program — `affiliates` / `affiliate_commissions`, `attributeOrder` tested
- [ ] Live-selling / video shopping
- [~] Marketplace multi-vendor mode for a single merchant — seller/install model exists, no single-merchant vendor mode
- [ ] Print-on-demand connectors
- [ ] Dropship supplier feed sync
- [ ] Accounting connectors (Tally, Zoho, QuickBooks)
- [ ] ERP export profiles
- [ ] Warehouse barcode picking app
- [ ] Native mobile admin app
- [ ] Merchant white-label reseller program
- [x] Public storefront theme preview sandbox for shoppers — `theme-sandbox.test.ts`
- [ ] Voice search / Bangla speech input
- [ ] AI product-copy and image generation
- [ ] AI theme generation from a brief

### 4.4 Infrastructure options
- [x] Meilisearch / Typesense search backend (Postgres FTS fallback first) — `search-backend.*` with breaker, charted + alerted
- [x] imgproxy edge transforms (AVIF / WebP) — `image-transform.*`, charted + alerted
- [ ] Go payments service extraction
- [ ] Go L7 rate-limiter service extraction
- [x] BullMQ worker fleet + scheduled jobs — Postgres `job_queue` + `job_schedules` equivalent, charted + alerted
- [ ] Multi-region read replicas
- [x] Load + soak testing harness — `scripts/load-drive.mjs` driver (`pnpm load:drive`) with tested percentile/verdict logic, results filed to `load_test_runs`

---

## Special case A — consolidated index

Everything marked `[A]` above rolls up to these seven exposure classes. Each
class needs a named owner, a failure-suite E2E case, and an audit trail before
the surface it belongs to can be ticked.

| Class | Exposure | Guard |
|---|---|---|
| A1 Money representation | wrong totals, silent rounding loss | integer minor units, no floats, CI conformance linter |
| A2 Transaction integrity | double charge, double refund, lost payout | idempotency keys, append-only ledger, FSM in DB |
| A3 Tenant isolation | one merchant reads another's orders/customers | RLS on every table, negative-policy test matrix, no admin client for ordinary reads |
| A4 Data safety | irrecoverable loss, unverified backup | automated backup + restore drill, tombstones, purge job |
| A5 Secret exposure | gateway secret, service key, API key leak | server-only reads inside handlers, no secrets in error bodies or logs, rotation runbook |
| A6 Authorization | privilege escalation, role tampering, impersonation abuse | roles in a separate table, security-definer helpers, step-up MFA on money actions |
| A7 Abuse & fraud | fake orders, COD loss, poisoned ad spend | edge rate limits, rule engine, risk-review hold, bot filtering |

### Standing rule

No `[A]` line may be ticked on a happy-path test alone. Each requires: a deny
case, a replay case, and an audit assertion.