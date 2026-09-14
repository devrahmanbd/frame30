# 01 — Architecture Plan

Status: Planning · Reference: `/plan.md` §2 (stack), `00-meta/PLAN.md` (slices)
Design baseline: `00-meta/design-system.md`
Depth specs: [`domains.md`](domains.md) (custom domains & storefront subdomains)

---

## Purpose
Define the system topology: services, tenancy boundary, data flow, edge, security posture, and the observability contract. Every other directory depends on this.

## 1. Tenants and boundaries

- Each **merchant** is a tenant. Tenant data lives in shared tables scoped by a `merchant_id` column on every row; **RLS enforces** the scope via JWT claim `merchant_id` (not per-tenant Postgres schemas). See `AGENTS.md` (merchant_id scoping) and `docs/02-merchant/staff-rbac.md` (§6 `app.staff_has`).
- Tenant subdomain: `<merchant>.store.framique.com`. Edge (OpenResty) terminates TLS with lua-resty-acme and proxies to the serving layer.
- Public assets (themes, images) served by Supabase Storage + imgproxy; storefront HTML is rendered by theme runtime (see 03).

## 2. Services

| Service | Runtime | Responsibilities |
|---|---|---|
| Admin web app (TanStack SPA) | Edge + CDN | Admin UI, builder, settings. Calls PostgREST + Go gateway. |
| Storefront runtime (theme renderer) | OpenResty/Node edge | Serves themed store pages headless from AST + data API. |
| Go payments gateway | Go | Aggregator: MFS (bKash/Nagad/Rocket), bank, COD preauth; idempotent charge/refund/payout; webhook intake (mock live). |
| Go rate limiter | Go/Redis | Per-key limit (signed requests, auth tokens, checkout). |
| Redis (BullMQ workers) | queue | Emails, shipping events, refunds, export jobs, analytics aggregation. |
| Search | Meilisearch (or PG FTS fallback) | Catalog + admin search (Bangla fuzzy, facets). |
| Observability | Prometheus+Grafana+Sentry | Metrics; error tracking; spans via OpenTelemetry. |

## 3. Data flow (primary happy path)

1. Customer hits `store.framique.com` → edge TLS → theme runtime → hydration → catalog (PostgREST) → checkout (cart service) → payments gateway (Go) → MFS mock/live → webhook → order state machine → courier event → shipping status.
2. Merchant admin via TanStack SPA → PostgREST → rows with RLS; writes enqueue BullMQ jobs; observability emits metrics.

## 4. Security posture

- JWT (Supabase) + row-level security filters every tenant read/write.
- Payments: signed webhooks (HMAC), idempotency keys, interface to MFS credentials only from vault (no tenant credits in client).
- Rate limiting at edge for login, checkout, MFS redirect, webhook endpoints.
- Secrets: never in client bundles; env-per-environment at deploy.

## 5. Observability contract

- Prometheus metrics per service (request rate, p95, error budget), Grafana per-tenant dashboards for merchant, Sentry for exceptions, OTel traces on BullMQ jobs.
- SLO: 99.9% admin, 99.95% storefront; p95 API < 250ms.

## 6. Failure/recovery plan per service

- payments gateway: retry w/ exponential backoff + DLQ; re-entrant (idempotent) refund/reversal paths.
- storefront: SVG render fallback (static fallback) if runtime down; edge cache TTL 60s.

---

### Design guidelines — architecture docs, admin login/onboarding, dashboard

- Intent: everything feels like a calm operations cockpit, not a marketing site — even auth/onboarding must reassure rather than overwhelm.
- Key surfaces: admin login, store setup wizard, first dashboard, navigation shell (sidebar/bottom-nav).
- Palette: canvas slate step-down, BD teal as the single accent (never glow everywhere). Success mint only for “store live / backup ok”.
- Typography: tabular numerals on all counts; Bangla display for the store-name welcome line; compact 0.875rem admin text.
- Density: admin-dense; dashboard is a 12-col grid — KPI row (cards), then a table. Mobile: cards stack, primary CTA pins bottom.
- Motion: wizard step transitions fade+rise 200ms; reduced-motion collapses to opacity.
- A11y: `skip to content`, full keyboard, focus ring, live region for validation.
- Performance: dashboard JS ≤ 180KB gz; skeleton placeholders; data hits virtualized.
- Anti-slop: unique identity — "BDT balance / orders today / at-the-moment" live stat chips; onboarding wizard photography-style illustration set, not default gradient. Use the actual merchant's store initials monogram in accents/avatar.

---

## Strict guardrails

### 1. Money & orders
- Money never flows through the edge or stores in the theme runtime: charge/refund/payout live only in the Go payments gateway (see 06).
- Order state changes are owned by the order state machine (see 03/07 for the transition list), not the data flow above.

### 2. Data & tenancy
- Every tenant row carries `merchant_id`; RLS (JWT claim) enforces scope; no per-tenant Postgres schemas.
- Tenant domains stay `<merchant>.store.framique.com` and public reads pass RLS `anon` (published only) on the storefront arm.

### 3. State transitions
- Served by the state machines owned per phase (order in 03/07, shipment in 08); this doc only notes where they run.

### 4. Vendors & data-export
- Supabase, OpenResty/Node edge, Meilisearch, imgproxy, and the OTel collectors are current choices, not commitments; each has a named fallback or is swappable (search: PG FTS fallback; assets: imgproxy; observability: OTel contract mirrors Pragmatic Sys-1 EX).
- Secret/credential scope: merchant credentials (MFS/Bank) never live in client bundles or stores-layer config — vault access only.

### 5. Consent & privacy
- Storefront persona captures only events from the person-informed, consented ones; abandoned-cart & pop-optins land here too (see 05).
- Logs stay PII-minimal; raw analytics retained 90d per global rails.

### 6. Accessibility & performance
- SLOs (99.9% admin / 99.95% storefront, p95 < 250ms) and the 60s edge-cache TTL are operational contracts; degrade gracefully instead of erroring (fallback template, maintenance notice).
- Static content is served from edge caches; interactive paths (checkout, auth) bypass rendering and go authenticated.

### 7. Failure & recovery
- storefront down → SVG/cached HTML; runtime crash → fallback template with maintenance notice; payments gateway retries with exponential backoff + DLQ and re-entrant (idempotent) reversal paths.
- Rate limits fail open to 429 rather than silent drop; login/checkout/MFS redirect get limiting.

### 8. Testing gates
- store_loop must pass on every change touching the serving path; failure suites exercise provider down + dead-letter queue so SLO-relevant paths are always covered.
- No new service enters the architecture without a failure/recovery row in §6 of this doc.