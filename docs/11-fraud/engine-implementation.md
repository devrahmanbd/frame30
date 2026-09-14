# 11-fraud — Implementation notes (v2 engine)

Status: Implemented · Slice S7 · Companion to `rule-engine.md` (contract) — this file records what actually ships.

## Engine

`src/lib/fraud-engine.ts` is isomorphic, pure and deterministic. `assess(ctx, rules)` walks
`RULE_CATALOG` in fixed `precedence` order and returns
`{ version, score, action, decisiveCode, signals[] }`.

- `action`: `allow` | `review` | `block`. A `block` rule short-circuits evaluation, so a
  blacklisted or honeypot-tripped context never leaks other signals.
- Any firing review-rule holds the order; `HIGH_RISK_THRESHOLD` (70) only labels severity in the desk.
- Every signal carries `weight`, `threshold`, `observed` and a human `detail` string — the desk
  renders the explanation, it never re-derives it.
- `FRAUD_ENGINE_VERSION` is stamped on each persisted verdict so old rows stay interpretable.

Catalog: `BLACKLIST_MATCH`, `HONEYPOT_TRIP` (blocks) → `BOT_BEACON`, `CARDTESTING`,
`VELOCITY_LIMIT`, `COD_REFUSAL_HISTORY`, `ADDRESS_CLUSTER`, `NEW_DEVICE_HIGH_VALUE`,
`COD_MAX_AMOUNT` (reviews). Merchants toggle rules, override params and change a rule's action
from the desk; disabled rules are skipped, not zero-weighted.

## Ledger

`public.fraud_assessments` is append-only: one row per checkout attempt with score, action,
decisive code, signals JSON and `subject_hash` = SHA-256 of `merchant|phone|email`. No raw PII is
stored on the ledger, and frequency checks join on the hash. RLS scopes reads to merchant members.

## Rails

- **Checkout** (`orders.server.ts`): assessment runs before any write. `block` → no stock touched,
  `order_blocked_risk` surfaced to the shopper as a neutral message. `review` → order proceeds and
  a case is opened.
- **Fulfilment** (`inventory.server.ts`): `assertNoFraudHold` refuses to create a fulfilment while
  an open case exists (`fraud_hold_active`), so a flagged parcel cannot ship.
- **Forms** (`accounts.server.ts`): honeypot trips are recorded and the submission is discarded.
- **Storefront beacon**: the checkout page collects interaction counts, dwell and `navigator.webdriver`
  only — no fingerprinting — and `botScore()` converts them server-side.

## Operability

- Rate-limit buckets: `fraud.assess`, `fraud.scan`, `fraud.decide`, `fraud.beacon`, `fraud.read`.
- Prometheus: `framique_fraud_assessment_total{action,rule}` plus span timing on every rail.
- Rules and blacklists are cached 60s per merchant; toggling a rule invalidates the entry.

## Tests

`src/lib/fraud-engine.test.ts` — 14 cases: precedence, short-circuit blocks, velocity, COD refusal,
address clustering, disabled rules, merchant thresholds, determinism, score cap, bot scoring.
