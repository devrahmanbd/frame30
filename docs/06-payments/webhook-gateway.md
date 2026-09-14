# 06-payments — Webhook Gateway

Status: Planning · Slice S4 (post-capture vertical) · Reference: `docs/06-payments/README.md` §Payment machine + `docs/06-payments/settlement-reconciliation.md`
Failures/DLQ stories align with `docs/00-meta/PLAN.md` failure suites and `docs/15-e2e` (suite names: Failure loop, `store_loop`); raw provider behavior is exercised only against the signed mock-MFS sandbox.

---

## Purpose

A single server-side ingest surface for gateway callbacks (MFS mocks, card/NFT, BNPL, dispute notices). Inbound payloads are verified, idempotent, and either drive the payment machine or land in a dead-letter queue with a full audit trail. Nothing a browser or merchant touches is fed back in.

## Boundary & ownership

- Owns: ingestion, HMAC/nonce verification, replay, idempotency, dead-letter queue.
- Does NOT own: the payment state machine (parent README §3), money math, ledger posting.
- One endpoint, one verifier: `POST /webhooks/:provider`.

## Payload contract (JSON)

Canonical schema, header-driven:

```json
{
  "v": 1,
  "webhookId": "evt_<nonce>",
  "provider": "bKash-mock",
  "type": "payment.captured",
  "attempt": 3,
  "amountBdt": 45200,
  "currency": "BDT",
  "reference": "b0e2f6…", // gateway txn reference
  "orderId": "ord_7f5c…",
  "ts": "2026-01-15T09:30:00Z"
}
```

- `webhookId` is globally unique per provider; it is the idempotency key base.
- `amountBdt` is integer taka (no float path anywhere, per `00-meta`).
- Other provider-specific fields are allowed but must pass through a whitelisted key list before any persistence.

## Signing & nonce security

- Every provider POST carries `X-Webhook-Signature: HMAC-SHA256(body+nonce, gateway_account.webhook_secret)`.
- Secret is stored only in the `gateway_accounts` vault (README Data model) — never logged, never in the contract.
- Timestamp binding: `ts` must be within a fixed skew window (**named TBD, owner: payments team** — mock-MFS uses the same value as sandbox time). Late events → rejected (replay risk).
- Nonce: `webhookId` uniqueness is enforced in the idempotency store; replayed `webhookId` returns the original stored result (NOT a resend).
- No HMAC verify → `401` and a DLQ row, never a partial parse.

## Ingest flow

```
verify HMAC + ts → 2nd: parse+store raw (blob, referenced by webhookId)
                 → idempotency EXISTS? return cached 200
                 → NO: map to payment machine transition → commit (+event)
                 → success: 200 ACK (registered)
```

- ACK only after the transition is committed on our side — a provider retry is cheap; a double-credit is not.
- All values derived from the payload are server-validated at the payment machine boundary (README strict guardrail 6: no client-trusted decisions; here the "client" is the gateway's webhook).

## Idempotency & replays

- Idempotency key = `webhookId`, then the payment-interplay key `order_id + attempt` (README guardrail 2-1) is derived and shared with the charge path.
- Replays (provider re-delivers the same `webhookId`) return the stored outcome — safe to re-send 200 to every duplicate.
- Precautions on overlap: if a duplicate arrives with a DIFFERENT `amount`, that is a **named** tamper/variance path → DLQ + `gateway.webhook.dead_letter`, never an override.

## Dead-letter queue (DLQ)

- Schema: `gateway.webhook.dead_letter` (README Events) — `webhook_id`, `provider`, `reason ∈ {hmac_invalid, ts_out_of_window, parse_error, unknown_type, idempotency_conflict, amount_mismatch}`, `received_at`, redelivery count.
- Human operator screen shows reason + the originally received POST body (PII-stripped); one-click `retry` re-injects the payload through the verify path (re-verifies signature, so a mis-signed mock delivery can be fixed and replayed).
- After N delivery attempts (**named TBD, owner: payments team**), the DLQ row is `failed` and an ops alert fires; the merchant is never marked paid from a DLQ row alone.

## Per-gateway failure stories

One canonical story per rail, all exercised in `.e2e` failure suites:

1. **MFS timeout (bKash mock down)** — intent created, authorize times out, payment machine stays `authorized`; webhook later arrives after sandbox->process gap; replay reconciles; no double capture (idempotent key).
2. **HMAC failure (Nagad mock misconfig)** — dropped, DLQ `hmac_invalid`, retry after secret rotate replays OK.
3. **Double ACK storm (provider sends 2×)** — second `webhookId` returns cached 200, both ledger rows idempotently collapse to one.
4. **Amount mismatch post-authorization** — `v_failed` before any state change writes a `failures` row and the merchant is NOT captured on a bad amount.
5. **Unredelivered card webhook** — envelope `gateway.settlement.file_expired` (see settlement sub-plan) pulls a loss; `payments_attempts` shows the attempted state.
6. **BNPL dispute** — dispute webhook transforms a `captured` into `dispute_open`, midpoint that branch is re-entrant.

## No-PII in raw logs

- Raw request bodies are never logged verbatim. Minimum exposure: `webhook_id`, `provider`, `type`, status, masked `reference`.
- Fields like card number, wallet number (bKash masked), name → replaced by `***` before any log or DLQ persistence (PII-minimal logs per README §4).
- DLQ stores a body snapshot only under the `payload` key that the retry viewer PII-strips by whitelist.

## Reconciliation linkage

- The same endpoint ingests `settlement`-intent webhook types (`provider` in `active_settlement`); those route to the settlement sub-plan's file lifecycle rather than the payment machine.
- `settlement.file_expired`/`settlement.variance` events are emitted from the settlement sub-plan consume the same DLQ/alert rails — one observability story.

## Failure/recovery

- During a payment-machine outage: webhook tails into the lost-DLQ redelivery; retry is idempotent and safe (README §9 license-linked redelivery, `restore`).
- A provider that legitimately stops calling `expected → missing` is a heartbeat watch (**named interval TBD, owner: payments team**) → alert, never silent.

## Design guidelines — webhook ingest is infra, not UI

- This surface ships no product UI of its own; the only human-visible panel is the Ops DLQ screen (status list + retry) — reuse `docs/14-operations` admin patterns.
- Status chips use `--bd-teal` success, Bondhu Amber warn for DLQ rows, Rickshaw Red for `failed`; never color-only (icon + label).
- A11y: the ops screen is AA; the alerts board is keyboard-reachable; `aria-live` on retry results.
- Anti-slop: DLQ rows look like a burn-down list (large monospace `webhook_id` + reason tag), not a generic table.

## Testing gates

- Add to failure suites (`.e2e`): `store_loop` adds a happy-path ACL attempt; new `wc_fail` failure suite per stories 1–6 above.
- Assert: no double capture under concurrent replay; DLQ rows for every invalid reason; banned nonce `webhookId` replays are dropped; PII exists in raw logs at any assertion step = fail.
- Gated on npm `check` + success; report via the same test gate convention as `docs/15-e2e`.
