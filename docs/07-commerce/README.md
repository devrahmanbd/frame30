# 07 — Commerce

Status: Planning · Slices S2/S3 · Reference: `/plan.md` §3.2 (catalog), §3.6 (VAT), §3.10 (BOGO), §4.17 (abandoned cart)
Design baseline: `docs/00-meta/design-system.md`
Owners: Commerce domain (pricing service, order core) · Frontend Platform (cart/promo admin surfaces)
Depth specs: `docs/07-commerce/fulfilment.md` (S3 — order → dispatch → delivery) · `docs/07-commerce/metafields.md` (S3 — metafields & metaobjects · schema-registry)

---

## 1. Purpose

The commerce domain owns everything that turns a catalog item into a payable
order: the server-side cart, the pricing/VAT engine, promotions
(coupons/BOGO/free-ship/fixed-percent), abandoned-cart recovery, and the order
itself as the core state machine shared by 06 (payments) and 08 (shipping).
The client is never trusted with math, stock, or discount decisions — every
monetary figure is integer BDT computed by the pricing service, and every state
transition is server-owned.

## 2. Pages & features

- **Cart**: line items, quantity edits, price rules, BDT totals, VAT line,
  shipping estimate, cross-sell. Cart drawer + sticky mobile bar
  (`docs/03-storefront` renders it; state lives here).
- **Pricing**: per-variant price + promos; money always integer BDT (`fmtBDT`
  for display); VAT inclusive per current-year `vat_rates`; free-ship
  thresholds; COD surcharge is a separate server-computed line (source of
  truth in 06-payments).
- **Promos/coupons**: fixed/percent/BOGO/free-shipping; usage limits,
  per-customer caps, stacking rules (nothing stacks unless allowed); applied
  via code or automatically. Created in merchant admin (`02-merchant`), stored
  tenant-side here.
- **Abandoned cart**: `cart.abandoned` → email/SMS at 30min/6h/24h via
  `cart_recovery_jobs`, **only** with marketing consent (AGENTS.md consent
  rule); no consent → no recovery message, ever.
- **Order hub**: shared timeline linking payments 06 ↔ shipping 08; refund
  path to 06; dispute surface.

## 3. Data model

Tenant-scoped (`merchant_id` on every row, RLS enforced — see guardrail 2):

| Table                                   | Role                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `carts` / `cart_items`                  | server-side line-item state, applied coupon ref        |
| `orders` / `order_items` / `order_line` | placed order + lines                                   |
| `discounts_applied`                     | promo/coupon lines actually applied at placement       |
| `promotions`                            | campaign definitions (stack rules, limits, auto-apply) |
| `coupon_codes`                          | codes, per-customer caps, usage counters               |
| `vat_rates(yearly)`                     | legal VAT by year — **never** a hardcoded constant     |
| `cart_recovery_jobs`                    | recovery send schedule (consent-gated)                 |

## 4. State machine (order core — referenced by 02/03/06/08)

```
pending → confirmed → payment_pending → paid → processing → shipped → delivered
```

Branches: `failed`, `cancelled`, `refunded`, and the COD branch
`cod_pending → paid`. Step transitions are server-owned; Redis holds hot
checkout session state but DB rows are the source of truth (see
`docs/03-storefront/checkout.md` DD-2).

## 5. Events

Emitted exactly once per transition (cross-surface contract, PII-minimal
payloads): `cart.updated`, `cart.abandoned`, `promo.redeemed`,
`coupon.redeemed`, `order.placed`, `order.paid`, `order.cod_confirmed`,
`order.shipped`, `order.delivered`, `order.refunded` (ledger in 06).

## 6. Cross-surface contract

| Consumer        | Contract                                                                              |
| --------------- | ------------------------------------------------------------------------------------- |
| 03-storefront   | checkout.md reads carts/orders via gateway only; never PostgREST                      |
| 06-payments     | `order.paid` / `order.cod_confirmed` drive ledger; charge idempotency key per attempt |
| 08-pos-shipping | `order.shipped` → shipment created; delivery events close the order                   |
| 02-merchant     | order hub + promo/coupon admin UIs (staff RLS pattern)                                |
| 05-marketing    | abandoned-cart sends respect consent + unsubscribe-once-everywhere                    |
| 16-pricing      | plan limits (products, COD availability) enforced at write                            |

## 7. Failure & recovery

- Promo engine down → checkout falls back to full-price confirm with an
  explicit notice; nothing silently discounts or blocks payment (see 06).
- Discount validation runs server-side at placement and is re-checked at
  capture (stack/limits/caps) — a coupon invalidated mid-flow returns
  `promo_invalid`, no charge is taken against an unvalidated discount.
- Cart merge across devices: deterministic — `updated_at` wins, other side
  discarded and logged.
- Redis loss degrades to DB rows; idempotency keys re-derived from `orders`.

## 8. Design guidelines — cart drawer & product price card

- Intent: a cart that feels effortless, honest, and fast — the customer always
  sees exactly what they will pay.
- Key surfaces: cart drawer with sticky stub-bar, product price card (0
  decimals), line-item rows, quantity stepper.
- Palette emphasis: `--fq-accent` for the primary CTA; `--fq-success` mint chip
  when a promo is applied; `--fq-warning` amber for the COD surcharge note;
  `--fq-danger` only for invalid/expired coupon.
- Typography: `tabular-nums` on every BDT figure; Bangla labels; totals
  emphasized by weight not size alone.
- Density: cart draws compact; admin promo form dense; mobile primary action
  bottom-anchored.
- Motion: add-to-cart fly 160ms (`--fq-dur-base`-adjacent); totals soft count
  120ms (`--fq-dur-fast`); reduced-motion → instant/opacity-only, no layout
  shift on promo apply.
- A11y: `aria-live` on total, inline promo label+error, focus ring on mobile
  sticky bar; AAA on checkout surfaces.
- Performance: cart/coupon inline — no full reload; no blocking analytics.
- Anti-slop check: VAT line always spelled "Total (incl. VAT)" vs
  "(excl. VAT)"; COD surcharge chip visible pre-confirm; abandoned-cart email
  uses a real product image and Bangla timers.

## 9. Design guidelines — checkout summary & promo/coupon admin

- Intent: the money moment is trustworthy and unambiguous; promo management is
  a calm, dense admin tool.
- Key surfaces: checkout side panel with live order totals, promo code inline
  field, coupon/BOGO creation UI, VAT settings admin.
- Palette emphasis: teal `--fq-accent` CTAs; mint applied-promo row; amber COD
  note; red only for invalid/expired; never color-only status (badge + text).
- Typography: tabular BDT everywhere; Bangla display headings; amounts
  unambiguous (BDT 1,250.00).
- Density: admin-dense (row 44px, controls 36px) per design-system §5.
- Motion: totals update 120ms; reversal smooth to error with inline correction
  path; reduced-motion → opacity-only.
- A11y: AAA on checkout summary (contrast on final amounts, keyboard order,
  live-region result); labels always visible, errors inline + `aria-describedby`.
- Performance: summary totals computed server-side, rendered on submit — no
  client rounding, no layout shift.
- Anti-slop check: coupon stack rules shown to the merchant as a decision
  matrix, not prose; expiry + usage counters visible in the admin row.

## 10. Strict guardrails

### 10.1 Money & orders

- Money is integer BDT server-side throughout; totals, COD surcharge, and VAT
  split are always computed by the pricing service — the client renders
  server-derived numbers only (see 06, 16).
- VAT line is server-computed from the yearly `vat_rates` table and rendered
  explicitly ("Total (incl. VAT)" vs "(excl. VAT)"); never a hardcoded
  percentage.

### 10.2 Data & tenancy

- Cart/order reads are tenant-scoped (`merchant_id` + RLS on every row);
  abandoned-cart campaigns carry consent flags and honor merchant-level
  opt-out during marketing sends (see 05).
- No anon or authenticated grants on any checkout table — PostgREST never
  exposes carts/orders; all writes flow through the Go gateway (checkout.md §3).

### 10.3 State transitions

- Order machine transitions are server-owned; Redis is hot cache only, DB rows
  are source of truth.
- Promo/coupon validation happens server-side at apply time and again at
  placement/capture — client UI state is advisory; a promo never changes
  server pricing without merchant verification.

### 10.4 Vendors & data-export

- Coupon/BOGO definitions stored tenant-side, applied via pricing service;
  campaign exports pass through consent + PII filters (see 05, 09).
- The pricing service is swappable (00-meta guardrail 4) — no doc assumes it
  is permanent; swap-out story tracked in open items.

### 10.5 Consent & privacy

- Checkout keeps PII minimal by default; abandoned-cart messaging honors
  "unsubscribe once, everywhere" from 05; no dark patterns on recovery.

### 10.6 Accessibility & performance

- Checkout/refund are AAA surfaces (AGENTS.md) — contrast on final amounts,
  focus trap on the MFS step, `aria-busy` during processing.
- Status never color-only: `--fq-warning` amber always paired with icon+text
  (WCAG 1.4.1).
- Storefront LCP < 2.5s mid-range BD Android over 3G-class networks
  (design-system §8); cart/coupon interactions never trigger a full reload.

### 10.7 Failure & recovery

- Promo engine down → full-price confirm with explicit notice; nothing
  silently discounts or blocks payment (see 06).
- Network drop mid-confirm → client retries the same `attempt_key`;
  idempotency guarantees a single charge and the same `order_id`
  (checkout.md DD-6).

### 10.8 Testing gates

- `store_loop` must pass: add-to-cart, promo apply (success + invalid +
  expired), COD vs MFS checkout, VAT line display, abandoned-cart send
  honoring opt-out, reorder after `payment_pending` timeout (see 15).

## 11. Testing gates (feeds `docs/15-e2e`)

- `store_loop` (critical per AGENTS.md): the full commerce arm — browse →
  cart → BOGO promo → MFS sandbox pay → order created → courier label →
  delivered → refund. Covers the order machine end-to-end.
- Additional order-machine checks beyond store_loop are registered as
  `e2e_commerce_loop` in `docs/15-e2e` (named TBD; owner: Commerce domain).

## 12. Audit verdict

- Status: **Planning (S2/S3)** — docs-only corpus; `carts`/`orders` schema and
  pricing-service contract exist as design contracts (P4), nothing ships.
- Consistent with audit-verdict 2026-08-08: no time-based behaviors invented;
  VAT drawn from `vat_rates(yearly)`; no client-trusted decisions; consent
  gates on recovery sends.
- Verdict: **passes**; gaps tracked in §13 with named owners.

## 13. Open items

- Cart TTL policy vs the 30min/6h/24h recovery window — one source of truth
  needed (Owner: Commerce domain).
- COD surcharge source of truth (merchant setting vs per-rail table) —
  06-payments owns (Owner: Payments).
- Promo engine swap-out story + failure drill (Owner: Commerce domain).
- `e2e_commerce_loop` registration in `docs/15-e2e` once scope is frozen
  (Owner: Commerce domain).
