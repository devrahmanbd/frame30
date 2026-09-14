# Courier Integration — S5 sub-plan (08-pos-shipping depth spec)

Surface README: `docs/08-pos-shipping/README.md` — this file is its §3/§4/§7/§9
sub-plan. References: `docs/07-commerce/README.md` (order machine, fulfilment),
`docs/07-commerce/fulfilment.md` (dispatch/label handoff), `docs/00-meta/design-system.md`
§10 (page-guideline template), `docs/15-e2e/README.md` (loop house), `docs/06-payments`
(ledger), `docs/00-meta/audit-verdict.md`. Money is integer BDT; never floats.

---

## Purpose

Courier integration is the adapter layer that connects the platform's shipment
machine (08 §4) to external couriers — eCourier, Pathao, Paperfly, Steadfast,
Sundarban. It owns quote/weight/zone pricing, label generation, webhook intake,
pickup scheduling, PUDO touchpoints, and network-failure behavior. The courier
is never trusted for money: COD is reconciled to the ledger in 06, and every
delivery event lands as an auditable `delivery_events` row.

## Charters (non-negotiable)

- C1: **Carrier is an adapter, not a dependency.** One interface
  (`CourierAdapter`) behind five implementations; a carrier swap or outage never
  changes domain code.
- C2: **Webhooks are verified and replayable.** Every `delivery_events` write is
  HMAC-verified (per-carrier secret), idempotent on `(carrier, event_id)`, and
  lands in the DLQ when intake fails — no silent loss.
- C3: **COD is reconciled, never assumed.** Amounts shown/printed come from the
  order; courier-reported COD totals are reconciled against the 06 ledger at
  settlement; mismatch escalates, never auto-settles.
- C4: **Pricing is deterministic and auditable.** Rate quotes are computed from
  weight/zone tables on the server (never client-trusted) and cached per order.

## Addressed requirements

| ID  | Statement                              | Covers |
| --- | -------------------------------------- | ------ |
| C-1 | Carrier adapter interface (5 carriers) | C1     |
| C-2 | Weight/zone rate quote                 | C4     |
| C-3 | Label generation + reprint             | C1, C4 |
| C-4 | Webhook intake + verification          | C2     |
| C-5 | Pickup scheduling + PUDO               | C1     |
| C-6 | COD reconciliation to ledger           | C3     |
| C-7 | Network-failure fallbacks              | C2, C3 |

## DD-1 — Adapter contract

```ts
interface CourierAdapter {
  quote(req: QuoteRequest): Promise<Quote>; // C4 — server-side rate calc
  createShipment(order: Order): Promise<Shipment>; // C1 — label + AWB
  schedulePickup(shipmentId): Promise<void>; // C5
  verifyWebhook(payload, sig): boolean; // C2 — HMAC per carrier
  ingestEvent(event): Promise<DeliveryEvent>; // C2 — idempotent
}
```

Carriers register via config (HMAC keys in `carriers`); runtime swap is
hot-pluggable, with swap-out stories in §13 open items.

## DD-2 — Webhook intake pipeline

1. Raw payload → signature check (HMAC, per-carrier secret).
2. Idempotency check on `(carrier, event_id)` — duplicate is a no-op, not an error.
3. Normalize to `delivery_events` (append-only timeline).
4. Emit domain event (`delivery.delivered`, etc.) exactly once.
5. On failure (bad sig, parse error, DB down): payload → DLQ (see 13);
   replay job retries with backoff.

## DD-3 — COD reconciliation

- Order COD amount is frozen at checkout (integer BDT, from 06).
- At settlement, courier-reported collected amount vs order COD amount:
  - match → ledger settlement in 06, `cod.settled` event.
  - mismatch → `cod.settlement_mismatch` event + escalation queue (merchant
    alert); never auto-settles.

## Core flow

```
quote(order) → createShipment(order) → label + AWB
  → schedulePickup → picked_up → in_transit → out_for_delivery
  → webhook: delivered → delivery_events → order.delivered
  → courier COD settlement → reconcile vs 06 ledger
```

## Business rules

- `R1` Quote is server-computed from weight/zone tables; client input is a hint,
  never the price.
- `R2` Shipment idempotent on `(order_id, region)` — no double AWB.
- `R3` Webhook event with missing `event_id` → rejected (no accept-by-guess).
- `R4` COD mismatch → escalation; settlement blocked until reviewed.
- `R5` Failed webhook intake always lands in DLQ; replay is the only retry path.

## RLS / access notes

- All `carrier_shipments`, `delivery_events`, `courier_labels` rows
  tenant-scoped (`merchant_id` + RLS); service identity via Go gateway;
  PostgREST never exposes carrier tables.
- `carriers` config (HMAC secrets) is staff-only, never readable by merchant
  client code; keys stored encrypted.

## JSON payloads (events, PII-minimal)

- `shipment.created` → `{order_id, shipment_id, carrier, awb}`
- `delivery.delivered` → `{order_id, shipment_id, delivered_at, rto_scan?}`
- `cod.settled` → `{shipment_id, amount_bdt, carrier, ledger_ref}`
- `cod.settlement_mismatch` → `{shipment_id, expected_bdt, reported_bdt, carrier}`
- PII-minimal: address/phone only inside labels; never in events.

## Reliability & failure drills

- Webhook down (carrier outage): polling reconciliation job (15min) backfills
  `delivery_events`; orders wait at current state, never double-close.
- Label API 5xx: order stays `shipped`; retry same label; DLQ after cap.
- PUDO parcel collection: `pickup_scheduled` persists; scanning event closes it.

### Failure story — carrier webhook dead-letter

1. `delivery.delivered` payload malformed → intake fails.
2. Payload → DLQ with `(carrier, event_id, received_at, reason)`. Parity with
   the payments gateway: every refusal is recorded — `unknown_carrier`,
   `bad_signature`, `invalid_json`, `unparsed`, `ingest_failed`, `unknown_awb` —
   under a body-derived event id so a carrier retry dedupes instead of piling up.
3. Replay job re-ingests with backoff; duplicate protection makes replay safe.
   A merchant can also replay a parked row from the shipping desk (webhook
   health tab); `courier_replay_event` re-checks tenant scope in SQL and
   records the outcome plus `framique_courier_replay_total`.
4. On repeated failure, escalation queue alerts ops; no order is mis-closed.


### Failure story — courier rate API down at quote

1. Quote call fails at checkout dispatch.
2. Fallback: cached zone table (server-side, last-known-good) with `quote_stale`
   flag; never a client-supplied price.
3. Flag visible to merchant; COD amount unchanged; mismatch path per DD-3.

## Design guidelines — courier dash & label printer (surface)

Based on `docs/00-meta/design-system.md` §10 — identical to the README §9
surface; kept here for the sub-plan's autonomy: shipment status cards, SMS-style
event timeline, pickup-slot scheduling, one-tap label print.

- Palette emphasis: `--fq-info`/teal `in_transit`; mint delivered; amber
  `failed_attempt`/`pickup_scheduled`; red only cancelled/void.
- Typography: tabular AWB/order numbers; Bangla labels; relative timestamps.
- Density: admin-dense 44px rows; label preview zoomable.
- Motion: new event card 160ms; timeline updates without reload.
- A11y: status icon + text; focus order on print; never color-only.
- Performance: virtualized list > 200 rows; incremental status polling.
- Anti-slop: next event as SMS bubble; signature capture first-class; pickup
  slot merchant-chosen.

## Testing gates (feeds `docs/15-e2e`)

- `store_loop` (critical) covers: quote → shipment → pickup → delivered →
  COD settle → order close, plus the webhook-DLQ failure story.
- Adapter-swap branch registered as `e2e_fulfilment_loop` (owner: Commerce
  domain).

## Audit verdict — checklist

- Mapping against `docs/00-meta/audit-verdict.md`: courier adapters never
  mutate money — COD settles via 06; webhook intake verifiable/replayable;
  offline POS queue idempotent; no time windows invented (15min polling is the
  only scheduler).
- Gap tracking: any gap becomes an open item on the surface README.

## Open questions

- Rate-quote source of truth (weight/zone table owner + refresh cadence)
  (owner: Commerce domain).
- DLQ retention + replay policy (owner: Commerce + 13 ops).
- PUDO provider inclusion in first adapter set (owner: Commerce domain).
