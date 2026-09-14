# Storefront Checkout — depth spec (S3)

Status: Planning · Slice S3 (core store) · Reference: `plan.md` §3.3 (storefront), §6 (checkout), `docs/03-storefront/README.md`, `docs/06-payments/README.md`, `docs/07-commerce/README.md`
Design baseline: `00-meta/design-system.md` (checkout/refund are AAA surfaces)
Scope: customer-facing cart/checkout/confirmation arm — cart drawer, checkout steps, payment method selection (COD + MFS mocks), confirmation, abandoned-cart handling.
Out of scope (own specs): payment rails/state machines → `06-payments` (S3/S4); order core model, promos, pricing engine → `07-commerce` (S2/S3); customer accounts → S3 (separate spec); refund UI → `06-payments` (admin).

---

## 1. Purpose

The checkout arm is the only write surface a storefront visitor touches: it
turns a server-side cart into an order without ever trusting the client, and
lands the money moment with zero-friction, AAA-accessible Bangla UI. Every rule
below exists to guarantee **no double charge, no lost charge, no client-trusted
math** while keeping the transition from "cart" to "paid" honest and resumable
on mobile mid-range Android — the storefront README's state machine
(`cart → checkout → payment_selected → payment_pending → confirmed/paid`,
`cancelled` on abandon) is the contract this spec pins down.

## 2. Design decisions

- **DD-1 — Cart is server-side and session-bound.** Line-item state lives in
  `carts`/`cart_items` (`07-commerce`); theme JS is untrusted — every mutation
  goes through the Go gateway scoped to a cart_id. Anonymous carts bind to an
  anonymous session token (cookie); customer carts bind to the user. Login
  merge is deterministic: `updated_at` wins, other side discarded and logged
  (`07-commerce` rule).
- **DD-2 — Checkout is a re-entrant state machine, persisted and resumable.**
  State lives in Redis (hot) with DB rows as source of truth — Redis is never
  the only copy. Tab close, network drop, or device switch resumes the session
  without duplicate work; `cancelled` is the only terminal state reachable from
  any pre-confirm step (abandonment).
- **DD-3 — Totals are never client-computed.** The gateway recomputes subtotal,
  promo discount, COD surcharge, shipping estimate, and VAT from the
  current-year `vat_rates` at every step; the client renders only. VAT-inclusive
  display is `Total (incl. VAT)`; the full VAT split line appears at confirm.
- **DD-4 — Promo re-validation at placement.** Stack rules, usage limits, and
  per-customer caps are re-checked at `checkout/confirm` (`07-commerce` rule).
  A coupon invalidated between cart and confirm → `promo_invalid`; no charge is
  ever taken against an unvalidated discount.
- **DD-5 — Payment methods are server-gated.** COD is offered unless the
  merchant disables it; MFS appears only when `gateway_accounts` is connected
  (`06-payments`); BNPL/EMI are provider-gated → `method_unavailable`.
  Surcharges (e.g. COD BDT 50) are computed server-side and shown pre-confirm
  ("Cash on delivery BDT 50 charge") — never discovered at the end.
- **DD-6 — Confirm is idempotent per attempt.** Idempotency key per
  `(checkout_session, attempt)` in Redis (`06-payments` rule — never
  double-charge). Double-submit, retry, or replay returns the same
  `order_id`/status.
- **DD-7 — MFS settle is asynchronous and polled.** `payment_pending` is the
  only transitional state between `payment_selected` and `paid` for MFS. Both
  the signed webhook (`06-payments`) and the status poll settle the order;
  whichever lands first wins, both are idempotent. Timeout → page stays
  "Payment processing"; the callback still catches settlement.
- **DD-8 — Stock re-checked at confirm.** `stock_status` per line is re-derived
  from `inventory` (catalog DD-5) at `checkout/confirm`; any line now
  out-of-stock → `stock_changed`, confirm blocked, refreshed line set returned
  (no dark patterns — the customer sees exactly what changed).
- **DD-9 — Abandonment is explicit and consent-gated.** `checkout.started`
  starts a grace timer → `cancelled`. Recovery email/SMS (30min/6h/24h per
  `07-commerce`) fires **only** with marketing consent (AGENTS.md consent rule);
  no consent → no recovery message, ever.
- **DD-10 — Checkout/confirmation are AAA a11y surfaces.** Focus trap on the
  MFS redirect/loading step and dialogs, `aria-busy` during processing,
  live-region on result, AAA contrast on final amounts, keyboard order = visual
  order, scroll restored on back (`06-payments` + AGENTS.md).
- **DD-11 — Order events are the cross-surface contract.** `order.placed`,
  `order.paid`, `order.cod_confirmed` emitted exactly once per transition
  (README events); consumed by 06 (ledger) and 08 (dispatch). Payloads are
  PII-minimal (AGENTS.md).

## 3. Data model & access contract

Tables owned by `07-commerce` (no new schema in this spec):

| Table | Checkout role |
|---|---|
| `carts` / `cart_items` | line items, quantities, applied coupon ref |
| `orders` / `order_items` / `discounts_applied` | placed order + lines + discounts |
| `promotions` / `coupon_codes` / `vat_rates` | read-only at validation (current-year VAT) |
| `inventory` | read-only for `stock_status` (DD-8) |
| `gateway_accounts` | read-only availability gate (DD-5); vaulted creds never in client |

Access contract:

- **No anon or authenticated grants on any checkout table** — PostgREST never
  exposes carts/orders. All writes flow through the Go gateway with a scoped
  service identity; RLS (with `merchant_id`) still applies to every row so a
  leaked credential cannot cross tenants.
- Staff/merchant reads (order hub, admin) use the `02-merchant` staff RLS
  pattern — never the gateway service identity.
- Redis holds: idempotency keys (DD-6), hot checkout session state (DD-2),
  anonymous session tokens (DD-1). Redis loss degrades to DB rows; idempotency
  is re-derivable from `orders`.

## 4. Gateway API surface (Go)

All endpoints: JSON, `merchant_id` resolved server-side, literal machine-readable
errors. Idempotency key `attempt_key` required on `confirm`.

| Endpoint | Purpose | Returns |
|---|---|---|
| `POST /api/checkout/session` | create/resume checkout from cart | `checkout_id`, current totals |
| `POST /api/checkout/method` | select `cod` or MFS rail | `checkout_id`, surcharge, total |
| `POST /api/checkout/confirm` | place order (idempotent) | `order_id`, `status` |
| `GET /api/checkout/status` | poll payment | `status`, `order_id` |
| `POST /api/checkout/cancel` | abandon | `status: cancelled` |

Errors (4xx, code + Bangla message): `cart_empty`, `cart_expired`,
`checkout_expired`, `method_unavailable`, `promo_invalid`, `price_changed`,
`stock_changed`, `already_confirmed`, `payment_timeout`, `invalid_state`.

## 5. Failure/recovery

- Network drop mid-confirm → client retries the same `attempt_key`; idempotency
  guarantees a single charge and the same `order_id`.
- MFS provider offline → `payment_pending` persists; status poll + webhook
  settle when the provider returns (`06-payments` rule).
- Redis down → checkout falls back to DB rows (Redis is hot cache only);
  idempotency keys re-derived from `orders`.
- Cart TTL expired → `cart_expired`; flow restarts from catalog, no lost charge.
- Double-tab / double-submit → same `order_id` returned (`already_confirmed` if
  the session already moved on).
- Webhook delayed beyond poll window → poll path settles; the `06-payments`
  daily reconciliation file catches any variance.

## 6. E2E coverage (feeds `docs/15-e2e` store_loop — critical gate per AGENTS.md)

1. Add to cart → totals VAT-inclusive → COD confirm → `cod_pending` → confirmation with VAT split line.
2. MFS happy path: select bKash → `payment_pending` → mock sandbox signed webhook → `paid` → confirmation.
3. Double-submit confirm → one order, one charge (idempotency key replay).
4. Expired cart → `cart_expired`; clean restart from catalog.
5. Promo applied in cart, invalidated before confirm → `promo_invalid`, no charge.
6. Stock drops between add and confirm → `stock_changed`; refreshed lines shown.
7. Abandon mid-checkout → `cancelled` after grace; no recovery email without consent.
8. MFS timeout → "Payment processing" persists; status poll settles.
9. COD surcharge chip "Cash on delivery BDT 50 charge" visible at confirm when merchant sets it.
10. A11y AAA spot-check: keyboard order, focus trap on MFS step, live-region result, contrast on final amounts.

## 7. Open items

- Cart TTL policy vs the 30min/6h/24h recovery window (`07-commerce`) — one source of truth needed.
- COD surcharge source of truth (merchant setting vs per-rail table) — `06-payments` owns.
- Anonymous session token rotation/expiry; merge precedence edge cases beyond `updated_at`-wins.
- Where the abandonment grace timer lives (gateway config vs merchant setting).

---

### Design guidelines — cart drawer, checkout steps, confirmation (all themes, AAA)

- Intent: the money moment feels instant, trustworthy, zero-friction; Bangla surfaces, every monetary figure tabular BDT, reassurance ("Your payment is secure") without noise.
- Key surfaces: cart drawer with stub bar, checkout steps (items → method → confirm), payment method cards w/ logos, MFS loading state, confirmation with VAT split line, order tracking skeleton stub.
- Palette: teal primary for pay CTAs; amber for COD/pending; mint for settled/success; red ONLY for failed/rejected. Never color-only status (badge + text).
- Typography: tabular numerals everywhere; Bangla numerals allowed; amounts unambiguous (BDT 1,250.00); totals emphasized by weight not size alone.
- Density: relaxed and careful, not cramped; touch targets ≥48px on method selection; step transitions keep position (no jump).
- Motion: success checkmark spring; reversal smooth to error with inline correction path; reduced-motion → opacity-only.
- A11y: focus trap on MFS redirect and dialogs, `aria-busy` during processing, inline validators, live-region on result, AAA contrast on final amounts, scroll restored on back.
- Performance: CWV-critical (LCP/INP on Android) — skeleton preload, JS ≤120KB gz, no blocking analytics, cart/coupon inline (no full reload).
- Anti-slop: COD vs MFS trade clear with fee note visible; full VAT split at confirm; settlement ETA countdown chip; refund timeline styled like a courier/SMS thread (BD-native) in customer portal.
