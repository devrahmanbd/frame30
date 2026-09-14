# Platform billing core — as built (BUILD 1.8)

Implementation record for the billing runtime. Numbers here are the ones in
code; the *policy* numbers they mirror stay drafts in `README.md` §14 until
sign-off. Change the ladder or proration rule here and in the SQL together.

## 1. Storage

- `plan_definitions` — seeded tiers (launch, growth, business, enterprise) with
  `price_minor_int` + `currency_code`, `trial_days`, `products_limit`,
  `staff_limit`. Enterprise carries a NULL price (contact sales).
- `vat_rates` — legal year rows; billing reads the effective row, never a
  constant. VAT is basis points (`vat_rate_basis_points`) on the invoice.
- `subscriptions` — adds `current_period_start`, `dunning_stage`,
  `past_due_since`, `grace_until`, `paused_at`, `cancelled_at`,
  `scheduled_plan` / `scheduled_plan_at`, `trial_fingerprint`.
- `billing_dunning_attempts` — one row per (invoice, stage), unique on
  `(merchant_id, idempotency_key)`; the ladder can never double-send.
- `trial_fingerprints` — hashed signal → claim count, gates trial abuse.
- `billing_events` — append-only audit of every transition.

All money is integer minor units in BDT; no float ever touches an amount.

## 2. Proration

`billing_plan_preview(plan)` and `billing_plan_change(plan)` share one rule:

```
remaining_days = ceil(period_end - now, days)
credit         = round(current_price * remaining_days / period_days)
subtotal       = round(new_price * remaining_days / period_days) - credit
vat            = round(subtotal * vat_bp / 10000)
total          = subtotal + vat
```

- Upgrade → immediate plan switch, limits raised, prorated invoice issued with
  `idempotency_key = 'upgrade:<plan>:<period_start>'`. A replayed call returns
  the same invoice instead of a second charge.
- Downgrade → **scheduled**, never immediate: `scheduled_plan` +
  `scheduled_plan_at = period_end`. No refund, no mid-period limit drop (which
  would strand products/staff above the new cap). The sweep applies it.
- Re-selecting the current plan while a downgrade is scheduled cancels it.
- Enterprise returns `contact_sales`; the UI never invents a price.

Preview is what the confirm dialog renders, so the merchant approves the exact
numbers the server then charges.

## 3. Dunning ladder

Stages keyed off invoice age in days, evaluated by the sweep:

| Stage | Day | Action                                     |
| ----- | --- | ------------------------------------------ |
| 1     | 3   | Email reminder queued                      |
| 2     | 7   | SMS reminder queued                        |
| 3     | 14  | Invoice → `past_due`, grace clock starts   |
| 4     | 20  | Subscription → `paused` (storefront read-only) |
| 5     | 45  | Subscription → `cancelled`, export window open |

Grace runs day 14 → 20. Pause and cancel are one-time transitions: the guard
`status NOT IN ('paused','cancelled')` keeps a repeated sweep from re-emitting
`subscription.paused`. Paying the invoice clears stage, `past_due_since`,
`grace_until` and `paused_at` in the same statement that marks it paid.

## 4. Trials

`billing_trial_claim(merchant, fingerprint)` is the only issuer. The
fingerprint is a server-side SHA-256 of `[email, phone, user_id]` — the browser
never sends it and the DB never stores the raw signal. A fingerprint seen more
than twice returns `denied`, and onboarding falls back to a paid start rather
than failing store creation. Trial end is the sweep's job, not a client timer.

## 5. Sweep and scheduling

`billing_sweep()` is `SECURITY DEFINER`, `service_role`-only, and does, in
order: end due trials → apply scheduled downgrades → renew periods and issue
invoices → walk the dunning ladder. It returns counters
(`trials_ended`, `downgrades_applied`, `invoices_renewed`, `dunning_attempts`,
`paused`, `cancelled`, `swept_at`).

Reached at `POST /api/public/cron/billing` with
`Authorization: Bearer $BILLING_CRON_SECRET`, compared in constant time. With
no secret configured the route answers 404, so an unconfigured deploy exposes
nothing; `GET` answers 405. Every step is idempotent, so a double-fired cron,
a retry, or a manual run is safe.

## 6. Rate limits and observability

Buckets in `rate-limit.server.ts`: `billing.plan_change` 6/h,
`billing.trial_claim` 3/h, `billing.pay_invoice` 20/5min, `billing.sweep` 12/h.
Spans: `billing.load`, `billing.plan_preview`, `billing.plan_change`,
`billing.trial_claim`, `billing.pay_invoice`, `billing.sweep`. Counters:
`framique_billing_plan_change_total{mode}`, `framique_billing_trial_total{outcome}`,
`framique_billing_sweep_total`, plus sweep result gauges. Errors go to
`captureError`; no provider or tenant payload is echoed to the caller.

## 7. Gates

`.e2e/specs/billing_loop.spec.ts` (in `e2e:critical`): unauthenticated sweep →
401, forged bearer → 401, `GET` → 405, authorised sweep returns numeric
counters and a back-to-back repeat is a no-op, `/pricing` renders live BDT
plans, `/admin/plans` is unreachable signed out.

## 8. Design guidelines (per `00-meta/design-system.md` §10)

- Status is never colour-only: pause/overdue/cancelled banners carry a text
  label and `role="alert"`; the ladder marks reached steps with `✓` as well as
  tone.
- Money is `tabular-nums`, always formatted through `fmtMinor` — no locale
  float formatting.
- The proration dialog is an `alertdialog` with focus moved to Confirm and
  Escape to cancel; downgrade uses the `danger` tone because it removes
  capacity.
- Usage meters expose `role="progressbar"` with min/max/now, warn at 80% and
  fail at 100% in text as well as colour.
- Motion is opacity/transform only and collapses under
  `prefers-reduced-motion`; controls keep a 44px minimum target.
