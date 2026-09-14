# 06 — Payments

Status: Planning · Slices S3/S4 · Reference: `/plan.md` §3.8, 4.16–4.18, `00-meta/PLAN.md` slice S4
Design baseline: `00-meta/design-system.md` (checkout/refund are AAA surfaces)

Depth specs: [`currency.md`](currency.md) (multi-currency BDT+USD money model — representation, FX sourcing, checkout conversion, payouts, refunds, POS/analytics surfacing) · [`currency-gates.md`](currency-gates.md) (BDT-locked default matrix, USD pilot tier gate, conformance matrix, rollback)

---

## Purpose

In-house Go aggregator "equal to SSLCommerz": MFS (bKash/Nagad/Rocket), bank (cards/COD), BNPL/EMI. Design-blind for live MFS APIs: built from public docs + own signed-mock MFS sandbox; production adapters behind an interface so a real cert/sandbox drop in without redesign. Wallet, payouts to merchants, refunds run as first-class state machines.

> Companion plans for this surface: `webhook-gateway.md` (single HMAC-verified ingest surface, DLQ semantics, replay/security handling) and `settlement-reconciliation.md` (daily settlement file → ledger match, variance alerting). Licensing/policy grounding lives in `licensing.md`. Checkout UX perspective: `03-storefront/checkout.md`; settlement/payout courier side: `08-pos-shipping`.

## Modules

- **Gateway core (Go)**: idempotent `charge/refund/payout`, in-memory store (Redis) for idempotency keys, DLQ, webhook intake with HMAC, signed conclusion.
- **MFS adapters**: bKash, Nagad, Rocket mocks (SXB sandbox); state machine per rail. Mock MFS sandbox (`mock-mfs`) returns signed webhooks on delay.
- **COD**: no charge; ledger reason + customer signature capture at delivery (see 07 ship events).
- **BNPL/EMI**: BNPL delta-loop on 30-45 day terms; EMI provider-gated (unavailable when provider not connected).
- **Wallet**: merchant settlement reads: instant/scheduled payouts, ledger, hold reserve for disputes, daily statement, tax/VAT line items.
- **Invoices/VAT**: invoice generation per legal requirement (2026 BD VAT), annual VAT regimes per-year, auto rate table, "including VAT" display. Refund shows VAT-part.

## Data model (tenant)

`payments`, `payments_attempts`, `idempotency_keys`, `refunds`, `refund_attempts`, `payouts`, `wallet_ledger`, `disputes`, `vat_rates(yearly)`, `invoices`, `gateway_accounts` (vaulted creds, never in client).

## Order-payment interplay (06 ↔ 07)

Payment success → order `paid`, dispatch courier. COD → order `cod_confirmed` (allows dispatch) & pending payment; MFS pending → transitional `payment_pending` with poll status call. Failed → order `failed` + retry surface.

## State machines (all idempotent, re-entrant)

**Payment**:
`initiated → authorized → captured → settled`
`initiated → rejected | expired | failed`
`captured → refunded → refund_settled`

**Refund**:
`requested → (partial|full) approved → processing → settled | declined
; ← reversal if MFS provider rejects`

**Payout**:
`scheduled → processing → sent → confirmed | retry_failed` (re-try idempotent)

## Events

`payment.initiated`, `payment.settled`, `refund.processing`, `refund.settled`, `payout.sent`, `gateway.webhook.dead_letter`, `dispute.opened`.

## Failure/recovery

- Timeout/network → state machine retries with backoff via BullMQ; never double-charge (idempotency key per `order_id+attempt`).
- MFS offline → checkout stays "Payment processing" and polling callback catches settlement.
- Refund provider fails → money stays pending; admin sees timeline, reverts with compensating event; audit log.
- Reconciliation: daily settlement file → ledger match alert on variance (see `settlement-reconciliation.md`).

---

### Design guidelines — checkout/refund (AAA surfaces), payment methods, wallet, invoices

- Intent: payments must feel _instant, trustworthy, zero-friction_. Bangla surfaces; every monetary figure tabular BDT; profulous reassurance ("Your payment is secure").
- Key surfaces: checkout payment step (method cards w/ logos), MFS redirect/loading screen, confirmation + VAT line, refund status/timeline in admin, wallet balance and payout schedule.
- Palette: teal primary for pay CTAs; amber for COD/pending; mint for settled/success; red ONLY for failed/refund-rejected. Never color-only status.
- Typography: tabular numerals everywhere; Bangla numerals allowed; amounts unambiguous (BDT 1,250.00 vs BDT 1,250).
- Density: relaxed careful, not cramped; touch targets ≥48px on method selection; payout rows dense but not crowded.
- Motion: success checkmark spring; reversal smooth to error (red) with inline correction path; reduced-motion → opacity only.
- A11y: focus trap on MFS redirect and dialogs, `aria-busy` during processing, inline validator, live-region on result, AAA contrast on confirm final amounts, scroll restored.
- Performance: this page is CWV-critical (LCP/INP on Android). Skeleton preload; JS ≤120KB gz; no blocking analytics.
- Anti-slop: distinctive — COD vs MFS trade clearly summarized (fee note "COD charge BDT 50" visible), full VAT split line at confirm, settlement ETA with countdown chip, refund timeline styled like a courier/SMS thread (BD-native) in both admin and customer portal.

---

## Strict guardrails

### 1. Money & orders

- Money is integer BDT only; charge/refund/payout amounts are computed server-side, client only ever displays server-derived totals.
- VAT comes from the yearly `vat_rates` table (legal-year regimes), never hardcoded constants; every refund line shows its VAT component ("including VAT") to be unambiguous.

### 2. Data & tenancy

- Every payment row is tenant-scoped (`merchant_id` + RLS); gateway credentials vaulted, never in client bundles or plaintext logs.
- Idempotency keys per `order_id+attempt` for charge/refund/payout — retries never double-charge.

### 3. State transitions

- Payment machine: `initiated → authorized → captured → settled` (± `rejected | expired | failed`); refund: `requested → (partial|full) approved → processing → settled | declined` with a compensating (reversal) event when the provider rejects mid-flight; payout: `scheduled → processing → sent → confirmed | retry_failed` with idempotent re-try.
- COD stays no-charge with ledger reason + delivery signature (see 07); MFS pending → `payment_pending` and poll-callback, failed only after the defined timeout window.

### 4. Vendors & data-export

- MFS adapters (bKash/Nagad/Rocket) sit behind one interface; production adapters drop in without redesign — `mock-mfs` sandbox is the dev floor and live join requires explicit signoff (see 00).
- Webhooks are HMAC-verified against vaulted secrets; dead letters surface per gateway (see `webhook-gateway.md`).

### 7. Failure & recovery

- Timeout/network → machine retries with backoff via BullMQ; no double-charge, no lost money.
- Provider rejects refund → money stays pending with compensating event; admin timeline + audit log; reconciliation (daily settlement file → ledger match) alerts on variance.
- All failure paths logged `gateway.webhook.dead_letter` / `refund.processing` events; raw webhooks never touch the client.

### 8. Testing gates

- store_loop must cover COD + MFS pay confirm with idempotent retry; failure suites cover provider down, refund provider reject (reversal), dead-letter queue — via signed mock sandbox only, never live MFS in CI.

### 9. Licensing (audit follow-up)

- `payments.authentication.licensing`: **TBD** — owner: platform legal (`00-meta/README.md` §2 protocol: named TBD, never invented). Live MFS join is sign-off gated (see `00-meta`); a launch-stage compliance statement is not yet in docs — land it before funding asks.
- Full named-TBD inventory + sign-off gate lives in `licensing.md` (companion skeleton, canonical for this surface).

Built runtime contract: [`money-runtime.md`](money-runtime.md) — integer money type, pinned half-up rounding, legal-year VAT service, FX snapshot boundary, append-only ledger writer.
- `payments-runtime.md` — charge intent lifecycle, signed returns, mock MFS sandbox, refund engine, COD reconcile, settlement posting.
