# 05 — Marketing

Status: Planning · Slice S6 · Reference: `/plan.md` §3.5, 3.7, 7 (email), ads-integrity moat
Design baseline: `00-meta/design-system.md`

Depth specs: [`content-cms.md`](content-cms.md) (articles, media library, menus, SEO/AEO, blog admin) · [`abtesting.md`](abtesting.md) (A/B experiments — pre-registered plans, server-resolved assignment, holdout & audit)

---

## Purpose

Merchant self-serve marketing: SEO/AEO, email/newsletter/drip campaigns, forms/popups, social presence, blog/CMS, coupons, and the **ads-integrity layer** (bot-filtered ad beacons — part of fraud moat, see 11).

## Pages & features

- **SEO/AEO**: per-page meta, schema JSON-LD (Product/StoreFAQ/Reviews), sitemap.xml, robots.txt, canonical, Bangla-keyword support; answer-engine optimization (structured data).
- **Email/newsletter**: segments, campaigns, drip, templates (Bangla-first), unsubscribe/hardbounce handling, provider agnostic (SMTP/Postmark/own).
- **Forms & popups**: lead capture, exit intent, coupon popups; connected to segments.
- **Blog/CMS**: posts, categories, SEO meta, author.
- **Coupons/promo**: discount codes, BOGO, free shipping, fixed/percent, usage limits, stack rules (see 07).
- **Ad-integrity**: server-side events (Meta CAPI / enhanced conversions), bot-filtered beacons (fingerprint + proof-of-work), ad-creative variant tracking, fraud shield UI.

## Data model

`seo_meta`, `pages_extra (meta)`, `newsletter_subscribers`, `campaigns`, `campaign_sends`, `forms`, `form_submissions`, `articles`, `coupons`, `ad_events`, `traffic_sessions` (referrer aggregation).

## Events

`campaign.sent`, `form.submitted`, `subscriber.unsubscribed`, `coupon.redeemed`, `adsync.started`, `adsync.completed`, `traffic.classified(bot|human)`.

## Failure/recovery

- Email provider failure → retry + DLQ + status dashboards.
- CAPI delivery blocked → Batch endpoint retry with backoff; alert if not delivered.

---

### Design guidelines — campaign builder, templates, analytics surface, blog admin

- Intent: marketing tools that feel smart and Bangla-natural; previews show real product and price in BDT, never Lorem.
- Key surfaces: campaign list/detail (editor with live preview), email template editor (WYSIWYG block), analytics dashboards (charts), form builder, coupon editor.
- Palette: teal primary for actions; mint for "delivered/sent"; amber for "scheduled/draft"; charts follow the same palette (teal line, red sale).
- Typography: tabular numerals everywhere (open rate %, revenue BDT); Bangla display for hero of email templates.
- Density: admin-dense; analytics use dense tables + sparklines; charts responsive to mobile.
- Motion: count-up on KPI when entering viewport (200ms, reduced-motion-safe); chart hover crosshair 120ms.
- A11y: charts have data-table fallback (aria); forms with labels+errors; contrast for chart colors; focus order across editor.
- Performance: charts lazy-load on scroll; email preview only at request; editor code-split.
- Anti-slop: distinctive — "Report" surfaced as plain Bangla cards; campaign editor uses block-based Bangla contextual suggestions ("Today, Eid sale" templates); ad-integrity shows a vivid live traffic bot/human dial that's genuinely framed as "protect your ads spend".

---

## Strict guardrails

### 1. Money & orders

- Coupons (codes, BOGO, free-shipping, fixed/percent, stack rules) are validated server-side at checkout and at cart-boundary — every promo is resolved on the server, never trusted from the client (see 07).

### 2. Data & tenancy

- Subscriber lists, campaign sends, form submissions and traffic sessions are tenant-scoped (`merchant_id` + RLS); merchants only see their own audiences and pipes.
- Traffic/ad-events stay PII-minimal by design (fingerprint + proof-of-work), no raw customer data in ad payloads.

### 5. Consent & privacy

- Every channel (email, SMS, push, ads) is opt-in, GDPR-grade; unsubscribe/hardbounce honored everywhere; re-subscribe never implied — merchant must have explicit consent for each channel before first send.
- Ad-integrity beacons run bot-filtered and consent-gated; the "traffic classified" event never carries raw personal data.

### 7. Failure & recovery

- Email provider failure → retry + DLQ + status dashboards; never silent drops — merchant sees delivery status.
- CAPI/ad-sync delivery blocked → Batch endpoint retry with backoff; alert if never delivered.
- Provider-agnostic (SMTP/Postmark/own) so a provider outage is swap-able, not store-breaking.

### 8. Testing gates

- Storefront loop must pass: campaign send, unsubscribe honored, coupon redemption against server pricing, and the CAPI-blocked retry/alert path; fire bot/failure suites.

### Audit verdict — checklist

Follow-up record for `00-meta/audit-verdict.md`; every line below is verifiable in this plan's own sections or the plans it references.

- **Sections audited**: Strict guardrails `### 1`, `### 2`, `### 5`, `### 7`, `### 8`; claims trace to sections above or to `content-cms.md` (S6).
- **Money guardrail quoted**: coupons are validated server-side at checkout and at cart-boundary — never trusted from the client (guardrail `### 1`; `docs/07-checkout` owns resolution).
- **Consent & privacy**: every channel opt-in, GDPR-grade; unsubscribe/hardbounce honored; ad-integrity beacons bot-filtered + consent-gated (guardrail `### 5`).
- **Failure & recovery**: provider failure → retry + DLQ + status dashboards; CAPI-blocked → Batch endpoint retry + alert; provider-agnostic so outages are swap-able (guardrail `### 7`).
- **Events (v0)**: `campaign.sent`, `form.submitted`, `subscriber.unsubscribed`, `coupon.redeemed`, `adsync.started|completed`, `traffic.classified(bot|human)` — no new event surface is introduced by this checklist.
- **Owners**: 05-marketing for campaigns/consent; `content-cms.md` for article scheduler + rollback precedent (used by builder publishing `§14`).
