# 16 — Offer Engine & Merchant Promotions

Status: Planning · Sub-plan of `docs/16-product-pricing` · Slice S7+ · Reference: `/plan.md` §3.16; `00-meta/README.md` §2 (no invented numbers), §5 (consent + retention); `docs/16-product-pricing/README.md` §4 (rule engine), §5 (offer lifecycle), §6 (`offer.created|paused|ended`), §11 (promo-builder surfaces); `docs/07-commerce` (promotion/coupon application at server side, `promo.redeemed`, `coupon.redeemed`, `promo_invalid`); `docs/02-merchant` (promo-builder admin surface); `docs/06-payments` (COD surcharge line, invoice VAT from `vat_rates`)
Design baseline: `00-meta/design-system.md`

---

## 1. Purpose

Merchant-facing offers, coupons, and promotions are a separate stack from platform entitlements: plan prices live in `plan_definitions` (16 README §3); offer construction lives here and depends on those platform tables (16 README §1). The offer engine owns the merchant-visible marketplace of discounts — rule types, coupon codes, redemption guardrails, and the promo-builder admin surface — while **every decision is evaluated server-side** at apply and at capture: no client supplies a discount value, a cap, or a stacking choice (AGENTS.md: no client-trusted decisions). Money stays integer BDT end to end; display via `fmtBDT`. VAT is not computed here — pricing + VAT engine live in `docs/07-commerce`, and discount derivation that touches tax stays with that engine.

## 2. Rule types & data model (draft)

Offer rules supported by the engine, per 07 README §2:

- **Fixed** — flat BDT off the merchant price.
- **Percent** — percentage off, capped by `offer.percent_cap_bdt` (named TBD, owner: product lead).
- **BOGO** — buy-one-get-one on a SKU set; quantity math server-side.
- **Free shipping** — waived shipping fee up to a threshold (`shipping.threshold_bdt`, 07-owned; TBD pending free-ship threshold sign-off).

Tenant-scoped model (all tables RLS-scoped by `merchant_id`):

- `offers` (tenant_id, type, name, status, starts_at, ends_at, cap_per_rule, min_order_bdt, created_by, audit_timestamps)
- `promo_codes` (`code`, offer_id, usage_limit, per_customer_cap, status, first_used_at)
- `offer_redemptions` (`order_id ref 07`, `offer_id`, `code`, `value_bdt`, `validated_at`, `idempotency_key`)

Platform tables (`plan_definitions`, `tenant_limits`) stay read-only for tenants (16 README §3); the engine only _reads_ them for entitlement context.

## 3. Ordering & stacking (server-side only)

Evaluation is a strict server-side pipeline per order, in the order the offer rules are defined (16 README §4):

1. Active + within window check (draft/ended/archived offers never evaluate).
2. Cap checks per rule (`cap_per_rule`) — named TBD, owner: product lead.
3. Min-order threshold check — named TBD, owner: product lead.
4. Stacking: **a flat promo never stacks above a coupon unless the rule engine says so**; nothing stacks by default (07 README §2). Only server-computed results reach the client.

Any rule failure yields a typed access error through the `promo_invalid` (07 README) pathway; the order stays `draft` with an invalid row logged, never a silent partial discount.

## 4. State transitions

Offer lifecycle (16 README §5, canonical):

```
draft → active → paused → ended → archived
        (each transition records audited `by` + `at`)
```

Coupon codes: `active → expired | paused → retired`. All transitions idempotent and re-entrant; an `ended` offer stays readable for reporting but is never applied again.

## 5. Events

Emitted publicly (16 README §6 names these from here): `offer.created`, `offer.paused`, `offer.ended`, plus redemption events `promo.redeemed`, `coupon.redeemed` (07 commerce), and failure `promo_invalid`. Events are append-only; retries idempotent via the underlying order id.

## 6. Failure & recovery

- Provider/cart down while evaluating an offer → the order is queued and retried with backoff; never applies a discount twice (idempotency on `order_id + offer_id`).
- Code-reuse attack (hammering a code) → per-customer cap + usage limit enforced at validation; over-limit returns a typed `promo_invalid`.
- Offer window race (started mid-order) → window evaluated at apply time only, server-side; a stale client window never grants a discount.
- `e2e_promo_loop` covers the provider-down offer wait/error path in the failure suite (named here, registered in `docs/15-e2e` — see §9).

## 7. Consent & privacy

- Promotional distribution uses marketing-blast consent only (00-meta README §5); abandoned-cart recovery with promo codes requires consent — no consent, nothing sent (07 README §2, AGENTS.md consent rule).
- Discount fields never carry PII; redemption logs keep `merchant_id + order id`, never client tokens.

## 8. Testing gates → loops (per `15-e2e` standard)

- `e2e_promo_loop` — named but not yet registered in `docs/15-e2e` (16 README §13).
- `store_loop` promo arm (BOGO) covers end-to-end reality: apply → validate at server → price via `fmtBDT`.
- Failure suite asserts: stacking attempt rejected unless allowed; over-cap rejected with `promo_invalid`; stale-window offer never applies; provider down path waits and retries.

## 9. Design guidelines — promo builder & merchant offer surfaces (per `design-system.md` §10)

- Intent: a coupon builder that feels like composing a rule, not filling a form — one glance tells the merchant what's live, what's paused, and what a code costs them.
- Key surfaces: promo-builder list + rule form, coupon code editor, redemption feed rows, merchant offer status chips.
- Palette emphasis: teal for active offer, mint for "code healthy", amber for near-cap, Rickshaw Red for blocked/`promo_invalid`.
- Typography: promo values in tabular numerals (`fmtBDT`); Bangla+English offer names; code editor mono for codes.
- Density: builder admin-dense; storefront cart keeps air (07 renders cart, 03 renders storefront).
- Motion: 150ms card hover lift; status chip pulse 300ms; reduced-motion → opacity only (design-system §7).
- A11y: never color-only (chip carries label "Active/Paused"); coupon input labeled with error assert; AA baseline, AAA on redemption-confirm? (confirm surfaces are server-side, describe in admin copy).
- Performance: promo-builder static + code-split; redemption feed Realtime pageable.
- Anti-slop: redemption feed rendered as MFS-style transaction strips (BD-native), and live offers "countdown to end" in Bangla numerals — not generic badges.

## 10. Strict guardrails

1. **Server-side truth** — apply, caps, stacking validated on the server every time; client values never trusted.
2. **Money** — BDT integers only, `fmtBDT` display, no floats (AGENTS.md BDT rule).
3. **Tenancy** — every offer table RLS-scoped by `merchant_id`; platform tables read-only to tenants.
4. **Stacking** — nothing stacks unless the engine allows; a flat offer never stacks above a coupon (16 README §4).
5. **Consent** — recovery promos only for opted-in channels; opt-out honored everywhere.
6. **Retention** — redemption facts audit-appendable; offer windows time-server-side (no client clock).
7. **Testing** — every new rule type lands with an `e2e_promo_loop` case registered in `15-e2e`.

## 11. Audit checklist (links)

- `00-meta/audit-verdict.md` → this doc: offer numbers live as drafts (BD-compliance item); TBD owners in §13 below.
- `docs/15-e2e`: `e2e_promo_loop` must be registered here before this reads "done".
- `docs/06-payments/licensing.md`: sign-off conditioning tracked there (16 README §13).

## 12. Residual gaps / open leads (named TBDs — owners)

- `offer.percent_cap_bdt` — cap for percentage rules; owner: product lead.
- `offer.cap_per_rule` — max redemptions per rule window; owner: product lead + platform eng.
- `offer.min_order_bdt` — min-order threshold for free-ship/offers; owner: financial ops.
- Offer windows' `ends_at` display copy (Bangla) — owner: product + design.
- Registration of `e2e_promo_loop` in `docs/15-e2e` — hard gate before "testing gates" is claimed (16 README note).
