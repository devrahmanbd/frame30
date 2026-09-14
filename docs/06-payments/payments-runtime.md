# Payments runtime

How money actually moves. Schema lives in the Tier 1.7 migration; this file is the
behavioural contract that `src/lib/payments.server.ts` implements.

## 1. Charge attempt lifecycle

`charge_intents` is the attempt log. One order may have many attempts; each is
immutable in amount and carries its own `return_nonce` and `idempotency_key`.

```
initiated ──▶ pending ──▶ paid
                 │
                 ├──▶ failed
                 ├──▶ cancelled
                 └──▶ expired   (TTL 1800s, swept)
```

- `charge_intent_open(order_id, idempotency_key, ttl_seconds)` is idempotent: a
  replayed key returns the existing attempt instead of opening a second one.
- The amount is copied from the order at open time and frozen by trigger. A later
  amendment cannot retroactively change what a shopper was asked to pay.
- `order_not_chargeable` is raised for terminal or already-paid orders.
- COD opens an attempt, moves to `pending`, and never touches a rail. It closes
  through COD reconcile, not through a return URL.

## 2. Signed provider returns

`GET /api/public/payments/return?intent&status&sig`

`sig = HMAC-SHA256(gateway_accounts.webhook_secret, "<intentId>.<status>.<nonce>")`,
compared with `timingSafeEqual`. Rules:

- `status` must be one of `paid`, `failed`, `cancelled` — checked before any lookup.
- A missing, short, or forged signature returns 401 and mutates nothing.
- If the rail is not configured for the merchant, the attempt fails closed. An
  unreachable provider never yields a paid order.
- On `paid`: the `payments` row upserts on `idempotency_key`, the wallet ledger
  entry is keyed `capture:<idempotency_key>`, and the order advances to `paid`
  only from `pending`/`payment_pending`/`confirmed`. Replaying the URL is a no-op.
- The shopper is redirected to their order page with the guest `access_token`, and
  `?pay=failed|cancelled` when the attempt did not succeed, which renders the
  "Pay now" recovery banner.

## 3. Mock MFS sandbox

`/api/public/payments/mock/$provider` (bkash, nagad, rocket) stands in for the
hosted wallet page. It is deliberately design-blind: a plain form with approve /
decline / cancel, no branding, no scripts. It POSTs back to itself, then issues a
303 to the signed return URL. It holds no authority of its own — it can only
produce a conclusion the app is willing to verify. Rate limited per intent.

## 4. Refund engine

`refund_request` → `refund_advance`:

```
requested ──▶ approved ──▶ processing ──▶ settled
     │            │                └──▶ failed
     └──▶ declined ◀────┘
```

- Partial refunds allowed; the sum of live refunds may never exceed the captured
  total (`exceeds_captured`). `nothing_captured` blocks refunds on unpaid orders.
- A reason of at least 4 characters is mandatory and stored on the row.
- Every transition is appended to a log; amounts are immutable after insert.
- Only `settled` posts the compensating ledger debit, keyed `refund:<refund_key>`.
  A provider rejection lands on `failed` and the money stays with us.
- RBAC guarded in SQL; anon has no execute on any payment routine.

## 5. COD reconcile

`cod_reconcile(order_id, collected_minor, carrier_code, note)` records expected vs
collected and derives `variance_minor_int`:

- equal → `matched`, credit posted, ledger key `cod:<order>:<collected>`
- unequal → `variance`, held for a human, no silent write-off
- `cod_clear_variance` requires a note and is audited

Short collection is a business fact, not an error: it is surfaced on the payments
desk rather than swallowed.

## 6. Settlement

Feed format is `ref,gross,fee,net` in **integer minor units**. `parseSettlementCsv`
rejects decimals, negative gross, duplicate references, and any line where
`net ≠ gross - fee` — then the database checks it again.

```
received ──▶ parsed ──▶ matched ──▶ posted
                  └──▶ variance_hold / rejected
```

- Files dedupe on `sha256(csv)`; re-uploading the same feed is a no-op.
- Only `exact`/`manual` matched, unposted items create ledger rows, keyed
  `settle:<fileId>:<itemId>`.
- A file must be `matched` to post. Variance alerts block clean posting until a
  human resolves them with a note.
- Ownership is verified through the member-scoped client before any privileged
  posting runs.

## 7. Limits and observability

Rate-limit buckets: `payments.charge` 15/5m, `payments.return` 30/5m,
`payments.refund` 20/5m, `settlement.ingest` 10/1h.

Prometheus counters: `framique_charge_intent_total`, `framique_payment_return_total`,
`framique_refund_total`, `framique_cod_reconcile_total`, `framique_mock_mfs_total`,
`framique_settlement_file_total`, `framique_settlement_posted_total`. Spans:
`payments.open_charge`, `payments.apply_return`. Signature failures log at `warn`
with the intent id only — never the payload.

## 8. Tests

`.e2e/specs/payments_loop.spec.ts` probes the return endpoint and sandbox with
tampered inputs; `.e2e/specs/settlement_parser.spec.ts` covers feed parsing.
Both run without tenant data.
