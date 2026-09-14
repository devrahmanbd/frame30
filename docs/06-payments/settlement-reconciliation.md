# 06-payments — Settlement & Reconciliation

Status: Planning · Slice S4 (post-capture vertical) · Reference: `docs/06-payments/README.md` §Payment machine, `docs/07-commerce/README.md` (orders), `docs/14-operations` (ledger)
Design baseline: `00-meta/design-system.md` (wallet/invoice are standard surfaces; AAA not required here — read-only admin reporting)

---

## Purpose

Owns the daily money-out truth: a settlement file from a gateway or bank lands, must match what our ledger actually captured, and any variance has to surface as an alert — never a silent write. It closes the loop behind the payment machine in the 06 README; it does NOT own the payment machine itself.

## Boundary & ownership

- The payment state machine stays the single owned machine in `docs/06-payments/README.md` (§3: `initiated → authorized → captured → settled` with `rejected | expired | failed`).
- This doc owns only: settlement file intake → parse → match → post to `wallet_ledger`, variance alerting, and the settlement-specific idempotency that extends the parent's `order_id + attempt` key.
- No code here ever charges, captures, refunds, or mints a ledger row it cannot attribute to a gateway settlement feed.

## Data model (tenant-scoped; RLS on `merchant_id` everywhere)

- `settlement_files` — one row per ingested gateway/bank file per day (`gateway`, `file_date`, `file_hash`, `checksum_verified`, `received_at`, `status`).
- `settlement_items` — line-level rows from the file (gateway settlement ref, gross, fee, net in integer BDT, currency `BDT`, reference to `payments` / `payments_attempts` when matched).
- `settlement_matches` — join rows between `settlement_items` and the ledger (`match_kind ∈ exact | fuzzy | manual`, `confidence`, `matched_at`).
- `settlement_variance_alerts` — every variance event, who was alerted, resolution state.
- `wallet_ledger` — the append-only integer journal the parent doc owns; settlement posting only creates credit rows derived from a matched `settlement_items` row (posting with no match is a hard error).

## Settlement states (file lifecycle — distinct from the payment machine)

```
expected → received → parsed → matched → posted
                    └→ rejected (checksum/format)
                    └→ variance_hold → cleared | escalated
```

- `received` on ingest; `parsed` after validation passes.
- `matched` when every item resolves to a known `payments`/`payments_attempts` row with integer-BDT equality.
- `posted` is the only state that creates `wallet_ledger` rows; it is idempotent per `settlement_id + attempt`.
- `variance_hold` pauses posting and raises an alert; it never auto-posts a partial amount.

## Idempotency (extends the payment key)

- Charge/refund/payout immunity key: `order_id + attempt` (parent README §2-1).
- Settlement ingestion adds `settlement_id + attempt` in the same Redis-backed idempotency store; a re-delivered file or a re-run reconcile job is a no-op that returns the already-created rows.
- A `variance_hold` is only ever resolved once (guard against double-escalation): resolution writes an audit row and flips `open → resolved`, never deletes.

## Reconciliation math (integer BDT)

- Gross/fee/net are integer BDT (no floats anywhere; display via `fmtBDT`).
- Match predicate on a per-item basis: `settlement.amount == payments.net_amount_settled` with zero tolerance — a `1` paisa mismatch is a variance, not a rounding decision.
- Feed line `net == gross - fee` is validated server-side; importing a line that does not net is `rejected`.

## Variance alerting

- On `variance_hold`: an alert row (`settlement_variance_alerts`) plus an event `settlement.variance` (see Events).
- Alert payload is server-computed: gateway ref, expected vs actual integer BDT, item id, resolution link. Never disclose customer PII.
- Escalation thresholds (alert at/after N mismatches, minutes/pages of auto-reconciliation before human involvement) are **named TBD** values, owner: payments team — no invented constants.

## DLQ & dead-letter handling

- A webhook that carries settlement intent (period returns) that fails HMAC or parsing goes to the `gateway.webhook.dead_letter` queue (README Events; DLQ mechanics in `webhook-gateway.md`).
- Dead-letter redelivery: after the payment machine replays the webhook (see `webhook-gateway.md`), the reconciled record is generated from the replay, not from a client-pushed amount.
- Queued payment settlement file marked `gateway.settlement.file_expired` if `card`/`bnpl` not reconciled within the operator's boundary of **named TBD, owner ops**.

## Settlement states (per rail)

- **Bank** (card/NFT): `file_expected → scheduled → posted | returned → reconcile`; returned items land in `variance_hold`.
- **MFS (bKash/Nagad/Rocket)**: `unsettled → in_clearing → settled | failed_txn` per mock-MFS signed file.
- **COD**: no gateway feed; COD money enters via the payment machine's `cod_confirmed → paid` with a `ledger reason COLLECTED`; reconciliation for COD is a daily expected-vs-in count (signature capture in `08-pos-shipping`).

## RLS / administration

- Every `settlement_*` read is `WHERE merchant_id = ...` server-side; a settlement file from gateway A can never update a wallet row owned by merchant B.
- Raw settlement files or their line items never reach logs or analytics — only status + aggregated money totals.

## Failure/recovery

- Checksum/parse failure on the file → `rejected` + alert; operator re-uploads via admin (documented replay in `webhook-gateway.md`).
- Gateway feed not delivered on the banking day → an expected-today check (`settlement_file.expected` status) fires when the expected `file_date` has passed; operator is alerted (named interval **TBD, owner: payments**).
- Partial match: items that match post; unmatched items stay `unmatched` and are re-tried next run with deterministic ordering — nothing silently dropped.
- Always compensating: a wrong net-clicked after `posted` requires a **reversing ledger** row + re-post; never a delete.

## Design guidelines — reconciliation admin surface, variance review, wallet/jive

- Intent: an operator reconciles money "the way an accountant would" — one glance sees the day is closed, or exactly which rows differ.
- Key surfaces: daily settlement match table (expected vs actual `fmtBDT`), variance alert feed with inline resolve, wallet ledger journal (read-only, monospaced integers), invoice generation link.
- Palette: mint `posted`; amber `variance_hold`; red `rejected`; every status has icon + label (never color-only).
- Typography: tabular numerals everywhere; Bangla labels + English codes for rows.
- Density: admin-dense; table rows ≤ 44px; sticky status column.
- Motion: status chip transitions only opacity/background; reduced-motion already opacity-only.
- A11y: table `th scope`, keyboard row access, `aria-live` on alert banner, AA contrast.
- Performance: virtualized list for big files (thousands of items); file parse on a worker; no blocking the admin nav.
- Anti-slop: distinctive — the day is rendered like a cash register tape (BD-native "Settlement tape"), variance rows get a scan-through red left-rail treat, never a generic red row.
