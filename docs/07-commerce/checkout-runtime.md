# Checkout & orders runtime (Tier 1.6)

Normative for `src/lib/checkout.server.ts`, `coupons.server.ts`, `orders.server.ts`,
`orders-admin.server.ts` and the storefront checkout/order routes.

## Order finite state machine

`order_status_transitions` holds the legal edge list; a `BEFORE UPDATE` trigger on
`orders` rejects any status move that is not an edge. Terminal statuses
(`cancelled`, `refunded`, `delivered`) freeze the money columns — the only way to
change an amount afterwards is `order_amend`, which lifts the guard for its own
statement and records the delta.

## Stock holds

1. The checkout quote calls `reserveCheckout` with a client-generated
   `checkoutToken`; `stock_hold_acquire` reserves units and returns `expires_at`.
2. Placing the order calls `stock_hold_consume` inside the same transaction that
   writes order lines, so oversell is impossible between quote and place.
3. Leaving checkout calls `releaseCheckout`; abandoned holds expire on their own
   and `stock_hold_sweep` reclaims them.

Metrics: `framique_checkout_reserve_total{outcome}`,
`framique_checkout_consume_total{outcome}`, `framique_order_amend_total{outcome}`.
Buckets: `checkout.reserve`, `checkout.place`, `order.lookup`.

## Guest order access

`orders.access_token` is minted at creation and returned once. The confirmation
page carries it as `?t=`. `order_public_view` accepts either a matching token or
the owning `auth.uid()`, so order ids alone disclose nothing.

## Coupon stacking

`validateCoupons` sorts candidate coupons by `priority`, drops any coupon whose
`allow_combine` is false when it is not alone, caps each at
`max_discount_minor_int`, and never lets the total discount exceed the subtotal.
All arithmetic runs through `src/lib/money.ts` in integer minor units.
