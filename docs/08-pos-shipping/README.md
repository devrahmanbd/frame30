# 08 — POS & Shipping

Status: Planning · Slices S5 · Reference: `/plan.md` §3.9 (POS), §3.11 (couriers), §4.15 (offline POS)
Design baseline: `docs/00-meta/design-system.md`
Owners: Commerce domain (POS + courier-dispatch core) · Frontend Platform (POS/courier surfaces)
Depth specs: `docs/08-pos-shipping/courier-integration.md` (S5 — courier adapter contracts)

---

## 1. Purpose

The POS & shipping phase owns the physical-fulfilment arm of the platform:
an offline-first point-of-sale that keeps a shop/warehouse selling on flaky
3G and mid-range Android devices, and the courier/delivery pipeline
(eCourier/Pathao/Paperfly/Steadfast/Sundarban) that turns a paid order into a
rider pickup, a tracking timeline, and a signed COD delivery. Money is always
integer BDT, every sale is captured the instant it happens (never blocked on
network), and every courier state change is server-owned with an audit trail.

## 2. Pages & features

- **POS cart**: offline line-item cart with barcode scan, quantity stepper,
  big-number keypad, stock decrement, and COD/MFS payment modes; works with
  zero connectivity (local queue in IndexedDB + SQLite shim).
- **POS capture**: sale recorded immediately (`pos_capture`), uploaded later
  as `pending → confirmed`; deterministic client-generated order IDs make
  retries idempotent; conflict resolution on sync keeps-earliest-and-logs.
- **Hardware**: bluetooth receipt printer (ESC/POS), cash drawer, barcode
  scanner, optional thermal/label printer for courier labels.
- **Shift close**: opening/closing drawer balance, integrity-checked against
  the server ledger on sync; `voided` lines carry a ledger reason, never a
  delete.
- **In-store ops**: re-print receipt, refund in-store, close shift.
- **Courier dash**: per-order shipment cards with live event timeline
  (SMS-style), pickup slot scheduling, rider assignment, label printing, and
  COD signature capture.

## 3. Data model

Tenant-scoped (`merchant_id` on every row, RLS enforced — see guardrail 2):

| Table                         | Role                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `pos_sessions`                | staff shift/session open→close with drawer balances    |
| `pos_orders`                  | POS orders, offline-origin flag, idempotent client ID  |
| `local_transactions(pending)` | offline capture queue until confirmed on sync          |
| `shift_totals`                | opening/closing counts; reconciled vs server ledger    |
| `carriers`                    | configured carriers + their adapter config (HMAC keys) |
| `carrier_shipments`           | one shipment per order, carrier + AWB + status         |
| `delivery_events`             | courier webhook events, append-only timeline           |
| `courier_labels`              | generated label blobs/links, reprint-safe              |
| `signatures`                  | COD signature capture, stored per delivery             |

## 4. State machines

Two coexisting machines own this phase — **POS order** (offline-first capture)
and **shipment** (courier dispatch → delivery):

```
POS order:  local_pending → synced → paid → delivered   (± voided on open-shift correction)

Shipment:   created → pickup_scheduled → picked_up → in_transit
            → out_for_delivery → delivered
            → failed_attempt → returned
```

Transitions are server-owned on sync; offline the POS records locally and
replays the same client ID (idempotent). Delivery closes the order machine in
07 (`order.delivered`).

## 5. Events

Emitted exactly once per transition (cross-surface contract, PII-minimal):
`pos.capture_recorded`, `pos.order.synced`, `pos.shift_closed`,
`shipment.created`, `shipment.picked_up`, `delivery.attempt_failed`,
`delivery.out_for_delivery`, `delivery.delivered`, `cod.signature_captured`.

## 6. Cross-surface contract

| Consumer      | Contract                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 07-commerce   | `order.shipped` creates the shipment; `delivery.delivered` closes the order                                                 |
| 06-payments   | POS MFS goes through the payment machine (`initiated → captured`); COD stays a no-charge ledger reason + optional signature |
| 13-export-sdk | courier/shipping data export for merchant DSR + reconciliation                                                              |
| 02-merchant   | courier settings + shipment list in admin (staff RLS pattern)                                                               |
| 09-analytics  | delivery-success / attempt-failure / RTO rates (90d raw retention)                                                          |
| 16-pricing    | COD availability + plan limits enforced at write                                                                            |

## 7. Failure & recovery

- Offline-first: cart & capture never wait on network; sync on reconnect with
  backoff + retry queue; conflicts log, never silently overwrite
  (keep-earliest + log).
- No double-ship: shipment creation is idempotent on `order_id` + region.
- Courier webhook missed → polling reconciliation job (15min) marks
  `failed_attempt` after 3x; events land in the DLQ for replay (see 13).
- Hardware failure (printer/drawer) degrades to on-screen receipt + cash
  count; nothing blocks the sale.

## 8. Design guidelines — POS cart/payment screen & shift close

- Intent: a tool a busy shopkeeper can operate one-handed on a cheap Android
  tablet between customers — huge touch, instant feedback, offline-rock-solid,
  and beautiful.
- Key surfaces: big-number keypad/cart, item scanning line, payment modes
  (COD/MFS), shift drawer with opening/closing balance.
- Palette emphasis: `--fq-accent` for payment confirm; `--fq-success` mint for
  the synced state; `--fq-warning` amber for the offline badge (never red for
  offline — it is expected); `--fq-danger` only for void/failed.
- Typography: massive `tabular-nums` numerals; line items ≥ 1.5 scale; totals
  extra-large; Bangla labels.
- Density: POS-dense but touch-first, 56px targets; line items ≥ 1.5 scale.
- Motion: add-to-cart pop 120ms; sync bolt 160ms; reduced-motion → opacity-only.
- A11y: large font; high-contrast; haptic + optional sound; `aria-live` on the
  cart total; never color-only status.
- Performance: instant capture, zero network waits during cart (offline-first);
  sync is background, non-blocking.
- Anti-slop check: the offline badge is a feature ("running in offline mode"),
  not an error; receipt prints Bangla Total + line items; thermal printer
  lemon-style layout previewed in-app before print.

## 9. Design guidelines — courier dash & label printer

- Intent: a calm ops view where every shipment's next event is obvious and a
  rider status reads like a text message.
- Key surfaces: shipment list with status cards, event timeline (SMS-style),
  pickup-slot scheduling, label print action.
- Palette emphasis: `--fq-info`/teal for `in_transit`; mint for delivered;
  amber for `failed_attempt`/`pickup_scheduled`; red only for cancelled/void.
- Typography: tabular order/AWB numbers; Bangla status labels; event times in
  "X মিনিট আগে" relative format.
- Density: courier list is admin-dense (44px rows); label preview crisp at
  300dpi equivalent on device.
- Motion: new event card slides in 160ms; timeline updates without page reload.
- A11y: status always icon + text (WCAG 1.4.1); focus order on the print
  action; label preview zoomable.
- Performance: virtualized shipment list > 200 rows (design-system §8);
  status polling is incremental, no full-page refresh.
- Anti-slop check: courier card shows next event as an SMS-style bubble;
  signature capture is a first-class step, not an afterthought; pickup slot
  chosen by the merchant, rider assignment visible.

## 10. Strict guardrails

### 10.1 Money & orders

- POS money is integer BDT; void is a ledger reason, never a delete; totals
  server-reconciled at sync (see 06).
- Shift drawer (opening/closing balance) is integrity-checked: closing count
  vs server ledger on sync.

### 10.2 Data & tenancy

- Every POS/courier row tenant-scoped (`merchant_id` + RLS).
- Offline queued writes carry deterministic client IDs; on sync, conflicts
  keep-earliest-and-log — no silent overwrite.

### 10.3 State transitions

- Offline capture: sale recorded immediately (`pos_capture`), uploaded on
  network as `pending → confirmed`; shipment machine transitions audited and
  merchant-visible (see 07).
- Payment via POS: COD stays no-charge with ledger reason + optional signature;
  MFS goes through the payment machine in 06 (`initiated → captured`).

### 10.4 Vendors & data-export

- Courier adapters (eCourier/Pathao/Paperfly/Steadfast/Sundarban) behind one
  interface; labels/status webhooks are HMAC-verified; failed shipment events
  land in the DLQ (see 13).
- Adapter swap-out story tracked in open items (00-meta guardrail 4) — no doc
  assumes a carrier is permanent.

### 10.5 Consent & privacy

- POS prints minimal PII on receipts (no full phone on thermal by default);
  courier address/phone only as needed, expunged after the delivery window.

### 10.6 Accessibility & performance

- POS targets AA; haptic + optional sound feedback; receipt/print accessible
  alternative on screen.
- Status never color-only: offline amber always paired with icon + text.
- Capture is instant (offline-first); sync in background with no UI block.

### 10.7 Failure & recovery

- Offline-first: cart & capture never wait on network; synced later with
  idempotent IDs, conflict logged not overwritten (see 15).
- Courier webhook down → status machine falls back to polling with backoff;
  refund/void paths always compensating (see 06).

### 10.8 Testing gates

- `store_loop` must pass: offline sale → sync (with conflict case), POS cash
  drawer, courier status cascade delivered, MFS payment confirm; failure
  suites: courier adapter down, webhook dead-letter, offline→online reconnect.

### 10.9 v0 scope note — POS payment methods

POS tender in v0 is `cash | card | cod` (`pos_payment_method`). MFS tender at the
counter (bKash/Nagad/Rocket) is **deferred**: those rails ship on the online
checkout aggregator first (PLAN.md S4), and the POS terminal gains them once the
aggregator's confirm callback is proven offline-safe. Until then a counter MFS
sale is recorded as an online order, not a POS tender, so the POS `store_loop`
"MFS payment confirm" step exercises the online path.

## 11. Testing gates (feeds `docs/15-e2e`)

- `store_loop` (critical per AGENTS.md): the full fulfilment arm — offline
  sale → sync → courier label → pickup → delivered → COD signature → order
  close → refund. Covers the POS + shipment machines end-to-end.
- Additional POS/courier checks are registered as `e2e_fulfilment_loop` in
  `docs/15-e2e` (named TBD; owner: Commerce domain).

## 12. Audit verdict

- Status: **Planning (S5)** — docs-only corpus; `pos_orders`/`carrier_shipments`
  schema and courier-adapter contract exist as design contracts (P4), nothing
  ships.
- Consistent with audit-verdict 2026-08-08: offline-first capture without
  network-dependent money paths; idempotent client IDs prevent double-ship;
  no time-based behaviors invented beyond the 15min polling reconciliation.
- Verdict: **passes**; gaps tracked in §13 with named owners.

## 13. Open items

- COD signature capture storage + retention policy vs privacy window
  (Owner: Commerce domain).
- Courier rate-quote contract (weight/zone pricing) — source of truth needed
  (Owner: Commerce domain, see courier-integration.md).
- `e2e_fulfilment_loop` registration in `docs/15-e2e` once scope is frozen
  (Owner: Commerce domain).
- Offline ledger conflict policy edge cases (voided-then-synced vs server
  refund) (Owner: Commerce domain).
