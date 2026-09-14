# Fulfilment — S3 sub-plan (07-commerce depth spec)

Surface README: `docs/07-commerce/README.md` — this file is its §4/§5/§7 sub-plan.
References: `docs/08-pos-shipping/README.md` (shipment machine, courier dash),
`docs/07-commerce` parent plan, `docs/00-meta/design-system.md` §10 (page-guideline
template), `docs/15-e2e/README.md` (loop house, failure arm), `docs/06-payments`
(ledger + refund), `docs/00-meta/audit-verdict.md`. Money is integer BDT throughout
(`fmtBDT`); never floats.

---

## Purpose

Fulfilment turns a paid order (07 §4 machine at `paid` or `cod_confirmed`) into a
shipped, tracked, delivered, possibly financially-compensated event. It owns the
dispatch steps the courier pipeline in 08 executes against: order readiness,
label generation, handoff, and the delivery events that close the order — plus the
refund/partial-refund path to the 06 ledger. No customer money is ever re-computed
here; this layer only reads server-owned totals and emits state transitions.

## Charters (non-negotiable)

- C1: **Dispatch is idempotent per `order_id`.** Retrying a dispatch never
  produces a second label or a double charge (08 keeps the same idempotency key).
- C2: **Readiness before dispatch.** `order.shipped` is only ever emitted from a
  `paid`/`cod_confirmed` state; nothing ships un-paid, un-confirmed.
- C3: **Completeness of the compensation ledger.** Refunds always close against
  a captured charge or a no-charge COD entry in 06; value is never "moved" off-ledger.
- C4: **Every label has a traceable source.** Courier label content derives from
  order rows only; a reprint never re-books a shipment.

## Addressed requirements

| ID  | Statement                         | Covers |
| --- | --------------------------------- | ------ |
| F-1 | Dispatch orchestration            | C1, C4 |
| F-2 | Shipping label generation         | C1, C4 |
| F-3 | Delivery events close the order   | C2, C3 |
| F-4 | Refund / partial-return to ledger | C3     |
| F-5 | Delivery failure fallbacks        | C2     |

## DD-1 — Dispatch is state-machine-owned, not a job

`fulfilment.dispatch(order)` is not a "do it all" worker. It simply reads the
order's `paid`/`cod_confirmed` state, pulls the ready-to-ship `courier_shipments`
rows, transitions to `shipped`, and emits `order.shipped`. The courier
interactions themselves live in 08 integration. Why: the order machine is the
single owner of the transition; the dispatch layer only puts the order into the
correct relationship with a carrier side.

## DD-2 — Labels are artifacts, not bookings

Generating a label in `courier_labels` never re-books, never re-quotes, and
never dispatches. `reprint state` keeps the label idempotent: printing the same
`shipment_id` returns the same artifact bytes (or a fresh blob), so a lost
printer page and a reprint are the same call. The booking itself (rider
assignment, pickup slot) is owned by 08.

## DD-3 — Delivery events just close, they don't re-price

`delivery.delivered` (from 08 webhook) transitions the order to `delivered`.
Refunds/partial-returns are computed strictly from the order lines and the
ledger in 06; the fulfilment layer never introduces new prices or re-rates a
line that was already paid.

## Organisation

Sub-plan is one discipline orchestrated by the same phase loop (`store_loop`
gates it) + the failure arm
`e2e_fulfilment_loop` (see §18). No extra invoices, no hidden state machines.

## Core flow (happy path)

```
paid / cod_confirmed → dispatch() → order.shipped
     → 08 courier pickup → delivery_events → delivered
     → order.delivered (closes 07 machine §4)
```

- `→` = server-owned transition, exactly one event per step.
- Reprinter/journal flow drops nothing on the outcome; it re-enters the same
  `shipped` state, matching a print failure.

## Refund / partial-return

1. Merchant or customer triggers refund with a `reason_code`.
2. `order_refund_requested` → 06 validates against ledger and builds the
   compensation entry.
3. Ledger settles (MFS reversal or COD no-charge) → `order.refunded` (events).
4. Fulfilment does not re-compute any amount; it only waits on the ledger state.

### Partial-return specifics

- Lines being returned are kept, noted as `return_in_progress`, and the ledger
  credit matches exactly the line value returned (no invented washer).
- Currency: integer BDT, values always from `orders`/`order_items` as placed.

## Business rules

- `R1` Only paid / confirm capture can ship.
- `R2` Shipment are idempotent on `order_id` + region.
- `R3` Any delivery-failure path must result in `returned` or `failed_attempt`
  → never silently dropped.
- `R4` Refund reason codes is a single list, stored in 06, shared everywhere.
- `R5` A reprint/booting a label never re-books.

## RLS / access notes

- Orders/Labels/shipment reads tenant-scoped (`merchant_id` + RLS) — service
  identity via the Go gateway; PostgREST never exposes fulfilment tables.
- Legacy-onboarding / data-export reads follow 13 for merchant DSR.
- Access of `signatures` (COD) is personnel-visible but no BULK print; expiry by
  policy (13, 09 retention counts).

## JSON payloads (events, PII-minimal)

- `order.shipped` → `{order_id, shipment_id, carrier, awb}`
- `delivery.delivered` → `{order_id, shipment_id, delivered_at, rto_scan?}`
- `order.refunded` → `{order_id, refund_ref, amount_bdt, reason_code, ledger_ref}`
- PII-minimal: no phone/address in events; address never leaves the label/job.

## Reliability & failure drills

Uniform event envelope (delivered once). Shipment creation idempotent on
`order_id` + region. Where courier webhook is down for > 2 mins, fallback
polling marked (08). On webhook black-hole (DLQ), events replay within the cap;
a dropped `delivery.delivered` never closes an order erroneously (order machine
waits on R2).

### Failure story — courier label API down

1. Label call fails (5xx/timeout) at `shipped`.
2. Order stays at `shipped`; `courier_labels` marked `printed_when` absent.
3. Poller/8 retries with the same label; DLQ after cap.
4. Merchant sees the label as "pending label"; no charge taken.

### Failure story — webhook missed

1. Polling reconciliation (15min, 08) notices last-event age > threshold.
2. Successful 3rd pull marks `delivered` per R2.
3. On no 3rd pull, order remains `delivered` as a real delivery but relabeled
   `delivery confidence` instead of flipping to failed (never double-close).

## Design guidelines — fulfilment ops view & label reprint

Based on `docs/00-meta/design-system.md` §10. Intent: a calm ops order status
line where the live stage reads instantly and reprint is a one-tap habit.

- Key surfaces: shipment state chip, stub timeline, label preview with
  reprint.
- Palette emphasis: `--fq-accent` for print; `--fq-success` mint when
  delivered; `--fq-warning` amber when attempt-failed; `--fq-danger` only on
  void/refund-failed (never color-only).
- Typography: `tabular-nums` order no.; Bangla status labels w/ icon + text.
- Density: admin-dense (44px rows, 36px controls).
- Motion: 120ms status chip transition (`--fq-dur-fast`); reduced-motion
  → opacity-only.
- A11y: status always icon + text (WCAG 1.4.1); print action in focus order.
- Performance: no full reload on label reprint; list virtualized > 200 rows.
- Anti-slop: label preview rendered in-app (lemon-style) before print; the
  next courier event reads like an SMS bubble (matches 08 courier dash).

## Testing gates (feeds `docs/15-e2e`)

- `store_loop` (critical) covers: paid → label → pickup → delivered → refund →
  order close, and the courier-API-down failure story.
- Extra fulfilment branch states (`failed_attempt → returned`) registered as
  `e2e_fulfilment_loop`; owner: Commerce domain.

## Audit verdict — checklist

- Mapping against `docs/00-meta/audit-verdict.md`: fulfilment/dispatch are not
  money arithmetic here — values from the order + ledger only; payment flows
  commit to 06; grid/courier down paths explicit; no silent-discounts and no
  invented time windows.
- Gap tracking: any gap below becomes an open item on the surface README.

## Open questions

- Label reprint TTL / retention window (owner: Commerce).
- Refund SLA + chargeback guardrails tie-in (owner: Commerce + 06-payments).
- `e2e_fulfilment_loop` formal registration in `docs/15-e2e`.
