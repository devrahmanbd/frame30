# 16 — Product, Pricing & Merchant Billing

Status: Planning · Slice S7+ (entitlement skeleton in S1) · Reference: `/plan.md` §3.1, 3.6; `docs/14-operations` (subscriptions, tenant_limits); `docs/06-payments` (invoices, wallet, payouts)
Design baseline: `00-meta/design-system.md`

---

## 1. Purpose

Framique is a SaaS business, not just a product. This doc defines what merchants pay, what each plan includes, how Framique bills and gets paid, and how entitlements are enforced. It closes the business loop: trial → paid → renew → dunning → pause/cancel, plus KYC gating for payouts and marketplace selling. Offer/promo construction lives in `offer-engine.md` and depends on the platform tables here; the payment rail behind invoices is `06-payments`.

## 2. Pricing models (draft — values are proposals pending user sign-off)

| Plan       | Price (BDT/mo)                            | Products  | Staff seats | Payments                 | Highlights                                        |
| ---------- | ----------------------------------------- | --------- | ----------- | ------------------------ | ------------------------------------------------- |
| Launch     | BDT 0 (trial 14d → BDT 0 forever, capped) | 25        | 1           | COD only                 | Framique badge, 1 theme                           |
| Growth     | BDT 1,200                                 | 250       | 5           | MFS (bKash/Nagad/Rocket) | coupons, basic analytics                          |
| Business   | BDT 2,500                                 | 2,000     | 20          | MFS + payout wallet      | multi-location, POS, marketing suite              |
| Enterprise | custom                                    | unlimited | custom      | everything               | marketplace selling, AI support, fraud suite, SLA |

Rules:

- All prices exclusive of VAT; VAT added at invoice time from `vat_rates` year table (never hardcoded).
- Limits are per-tenant, enforced server-side (see §4). Over-limit = blocked write with `plan_limit_exceeded`, never silent truncation.
- Plan downgrade keeps data but blocks over-limit writes; upgrade is instant and prorated per day.
- Merchant can self-serve plan change; plan change is a `subscription.plan_changed` event, not a manual admin task.

## 3. Data model & entitlements (platform-scoped)

`plan_definitions` (id, code, price_bdt, vat_code, limits jsonb, active), `tenant_limits` (tenant_id, plan_id, limits snapshot, effective_from), `subscriptions` (tenant_id, plan_id, status, trial_ends_at, current_period_end, cancel_at), `kyc` (merchant_id, entity_type, docs status, risk_level, verified_at, renewal_due), `billing_payment_methods` (tenant_id, type mfs|bank, token ref, default).

- Plan/limit tables are platform-owned (no `merchant_id` scope); read-only for tenants.
- All limit checks server-side: RPC `check_entitlement(tenant_id, feature, qty)` before writes; Postgres constraint as backstop; Go rate-limiter for API-burst features (webhooks, exports).
- KYC data is PII-minimal; only status fields leave the KYC service; documents in Storage with owner-only RLS + TTL.

## 4. Rule engine & ordering precedence

Entitlement is a strict pipeline (every step fails closed):

1. **Subscription gate** — is the tenant in an active/trialing/overdue state that allows this write? Paused → storefront read-only; cancelled → data export window only. `plan_limit_exceeded` on any over-limit write (never silent truncation).
2. **Feature gate** — `check_entitlement(tenant_id, feature, qty)` RPC before the write; Postgres constraint as backstop.
3. **Burst gate** — rate-limiter for API-burst features (webhooks, exports).

The merchant's own customer-facing prices (offers, coupons, promos) are a separate stack owned by `offer-engine.md`: offer rules resolve under `draft → active → paused → ended → archived`, evaluated in order — a flat promo (percentage/BOGO/fixed) never stacks above a coupon unless the rule engine says so, per order at server side (see `07-commerce` variant of `promo.redeemed`, `coupon.redeemed`). Cap-per-rule is a named TBD in `offer-engine.md`.

## 5. State transitions

**Subscription**: `trial → active → overdue → dunning → paused → cancelled` (± `plan_changed` at any active state; `trial_abandoned`).
**Payment method**: `added → verified → default → failed (3×) → re-verified`.
**KYC**: `draft → submitted → under_review → verified | rejected → renewal_due → re_verified | suspended`.
**Offer lifecycle**: defined in `offer-engine.md` (draft → active → paused → ended → archived, with audit timestamps). All idempotent; all re-entrant.

## 6. Events

`subscription.created`, `subscription.trial_ended`, `subscription.activated`, `subscription.renewed`, `subscription.plan_changed`, `subscription.dunning_attempt`, `subscription.paused`, `subscription.cancelled`, `invoice.generated`, `invoice.paid`, `invoice.overdue`, `kyc.submitted`, `kyc.renewal_due`, plus `offer.created|paused|ended` from `offer-engine.md`.

## 7. Vendors price/tax swap story

When Framique picks a new invoice/payment vendor (MFS, bank, card rail), the one rule is: **the merchant-facing number never changes**. Prices are integer BDT, exclusive of VAT, held in `plan_definitions`; the VAT component is derived at invoice time only from the legal-year `vat_rates` table (06-payments, initial invoicing sets "Including VAT" per registered date). Hence vendor swap = adapter-only swap behind the 06 interface — the public pricing matrix, the SaaS-fee refund split, and the warranty terms recorded in `licensing.md` stay unchanged. Billing side swaps are invisible to merchants (opaque ACH-style rails), the admin sees one new "payment method added" event.

## 8. Consent & privacy

- KYC is split-consent: marketing vs money-movement, each GDPR-grade opt-out honored everywhere.
- PII-minimal: only KYC status fields leave the service; documents owner-only in Storage with TTL; expiry → payouts suspended, store keeps selling with warning.
- Never show another tenant's plan, usage, or invoice (platform tables are scoped by `tenant_id` via RLS, seen only by the owning merchant + platform staff).
- Initially, no consent surface is user-facing beyond KYC gates (this surface is admin/planning, not product UI).

## 9. Testing gates → loops (per `15-e2e` standard)

- `store_loop` promo arm (BOGO) covers real offer redemption end-to-end (place → wed at server → price displayed via `fmtBDT`).
- `admin_loop` covers onboard → publish + plan/limits usage meter.
- Plan-limit tests assert the exact `plan_limit_exceeded` on the over-limit write (no silent drop); upgrade→`subscription.plan_changed`→prorated invoice is replayed; the provider-down wait/error path is asserted in the failure suite; KYC re-verification replay ends at `verified | suspended` only.
- Migration, dunning, and para/checkout paths are in the failure suites (per `15-e2e` §SLO gates).
- Offer/promo specifics: an explicit `e2e_promo_loop` suite is **named but not yet registered** in `docs/15-e2e` — see §13.

## 10. Failure & recovery

- **Dunning SLO**: day 0 invoice generated (with VAT from `vat_rates`); day 3 retry 1 (email+push); day 7 retry 2 (SMS); day 14 → `overdue`; day 20 → `paused` (storefront read-only); day 45 → `cancelled` + 30-day data export window, then anonymized deletion. All retries idempotent via Redis keys.
- Payment provider down → invoices queue, retry with backoff, never double-charge (idempotency key per period).
- Plan-change race: optimistic lock on `subscriptions`; reconcile job re-checks limits hourly.
- Refunds of the SaaS fee: full refund if cancelled within 7 days of charge; prorated beyond; refunds split VAT per 06 rules.

---

## 11. Design guidelines — pricing & billing screens (promo-builder surfaces in `offer-engine.md`)

- Intent: a price table that feels like a decision, not a wall — one glance tells a merchant their plan and their headroom.
- Key surfaces: public pricing matrix, merchant billing settings, usage meter list, invoice row (link to 06 invoice PDF).
- Palette emphasis: teal for current-plan state, mint for "within limits", amber for "near limit (80%+)", red for over-limit/overdue.
- Typography: prices in tabular numerals (BDT); plan names in Bangla+English; big price number 2rem.
- Density: admin-dense for billing settings; pricing page storefront-airy with sticky feature-compare on scroll.
- Motion: 150ms plan-card hover lift; meter fill 300ms; reduced-motion → opacity-only.
- A11y: plan cards are radio-group (keyboard arrow nav), not links; VAT note announced; limit meters have text ("120/250") not color alone; AAA on plan-change/cancel confirm (per AGENTS.md).
- Performance: pricing page static + edge-cached; billing screens code-split; meters from Realtime `usage.updated` events.
- Anti-slop: usage meters rendered as MFS-style transaction strips (BD-native), not generic bars; "Next bill BDT 1,200 + VAT" pinned in header when near limit — a reminder that feels like a courier SMS, not a nag dialog.

---

## 12. Strict guardrails — billing, entitlements & pricing

1. **Money & billing** — plan prices are integer BDT exclusive of VAT; VAT is added only from `vat_rates` at invoice time, never a hardcoded constant; every invoice follows 06 rules (idempotent charge, dead-letter, refund with VAT split per 06).
2. **Data & tenancy** — plan/limit tables are platform-owned with no `merchant_id` scope; merchant never trusts a client value for entitlement — RPC `check_entitlement(tenant_id, feature, qty)` is the only path, with a Postgres constraint as backstop; KYC docs in Storage owner-only + TTL.
3. **State transitions** — canonical lifecycle is `trial → active → overdue → dunning → paused → cancelled`; `plan_changed` only in an active state and always emitted as a public event, never re-assigned by an admin; upgrade instant + prorated per day, downgrade keeps data (over-limit writes blocked, never silently truncated).
4. **Merchants & data-export** — a cancelled merchant gets a 30-day export window, then anonymized deletion; dunning/pause/cancel transitions are confirmed on a Bangla-first confirmation flow.
5. **Consent & privacy** — KYC is PII-minimal, split consent marketing/money-movement, opt-out honored everywhere; documents owner-only with TTL; never show another merchant's plan/usage/invoice.
6. **Accessibility & performance** — plan cards are keyboard-navigable radio labels, not links; plan names Bangla+English; the VAT note is announced; limit meters carry text not color alone; AAA on plan-change/cancel confirm; pricing page static + edge-cached, billing code-split, meters from Realtime.
7. **Failure & recovery** — provider down → invoices queue with backoff, retried with id per period, never double-charge; every dunning retry idempotent via Redis; `subscriptions` optimistic lock protects plan-change races; hourly limit reconcile.
8. **Testing gates** — plan-limit tests assert the exact `plan_limit_exceeded` error; upgrade→plan_changed→prorated invoice replayed; provider-down wait/error in failure suite; KYC re-verification ends `verified | suspended` only; store_loop/admin_loop cover COD + MFS confirm with idempotent retry (06).

---

## 13. Audit checklist / links

- `00-meta/audit-verdict.md` records: **16-16 product-pricing gating** — live merchant entry (payouts, marketplace selling) requires the KYC gate from this surface; and that any plan/price number reads `draft` until user sign-off (Audit item §BD-compliance). This README keeps those numbers as **drafts** — values are proposals pending user sign-off; do not mint new numbers.
- License / sign-off conditioning tracked in `06-payments/licensing.md`.
- Design/validation rules: the invite-text is the user sign-off surface.

## 14. Residual gaps / open leads (named TBDs — owners)

- `pricing.plan_definitions.price_bdt` — the drafts here are proposals; owner: product lead.
- `pricing.dunning_paused_day` — dunning SLO numbers; owner: product + financial ops.
- `pricing.usage_burst_rate` — API-burst rate-limiter general; owner: platform eng.
- Offer-engine caps (per-rule cap, min-order threshold) → `offer-engine.md` (owns named TBDs).
- SaaS refund window rule ("7 days") in §10 — line drawn on 26-day analysis; reconcile to legal terms ('log' day carries VAT) in `licensing.md`.

_Note: `e2e_promo_loop` is named here as a target suite; register it (or an equivalent flag on `store_loop`) before "16 testing gates" is claimed. See `15-e2e`._
