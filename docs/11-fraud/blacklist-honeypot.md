# 11-fraud — Blacklist & honeypot (tables, window, audit)

Status: Planning · Slice S7 · Reference: `docs/11-fraud/README.md` §2 (blacklist-manager stage), §3 (`blacklists`, `honeypot_events` tables, RLS policy set), §5 (hold machine + audited removal), §6 (`honeypot.triggered` event), §7 (hard blocks from blacklist), §12 (merchant-only honeypot log); `docs/09-anonc/event-pipeline.md` §5 (aggregate/RLS model); `docs/15-e2e/README.md` (gates) · `SYSTEM.md` §Conventions

Owners: platform eng (capture path, RLS) · fraud ops (`fraud.honeypot_window`, `fraud.hold_window_days`)

Corpus anchor (verbatim — README):

> "The honeypot log is merchant-visible only; honeypot taps are never shared as leads."

> "A `hold` expires back to `review` after the bounded honeypot window (`fraud.hold_window_days`); it never auto-approves."

> "Removal from a blacklist also goes through an audited reason."

**Hard gate** (applies to both surfaces): blacklist entries and honeypot events are per-merchant, never global; every add/remove carries a who/why audit line; a tap is a log, never a score, never a lead.

## 1. Scope

The blacklist manager and the storefront honeypot of `docs/11-fraud` §2: table shapes, RLS, the audited lifecycle (add → hit → hold → remove), honeypot fire semantics and the bounded hold window. Rule evaluation itself lives in `rule-engine.md`; case decisions in `risk-review.md`; the e2e contract in `docs/15-e2e/fraud_loop.md`.

## 2. Tables

From README §3: `blacklists`, `honeypot_events` (plus `device_fingerprints`, `ip_reputation` — per-tenant, never global).

- `blacklists` — keyed by denied value type: MFS account / phone / IP. Add **and** removal both carry an audit line (`evidence`, `reason`, `who`, `why`).
- `honeypot_events` — append-only tap log; row: `event_time`, `trap_id`, `merchant_id`, `window_id`; no PII beyond the trap coordinates.
- Sub-model follows `docs/09-analytics/event-pipeline.md` §5: raw → aggregate → purge, gap-honest backfill.

RLS (README §3): both tables `enable row level security`; `merchant_reads_own_blacklists`, `merchant_reads_own_honeypot` policies; merchants write **only** their own `fraud_rules` and `blacklists` config; the rule engine (service role) is the sole writer for `fraud_scores`, `fraud_cases`, `rule_violations`.

## 3. Write lifecycle

- **Add** — rule engine or merchant config write; always with `reason` + `who`.
- **Hit** — engine consumes the blacklist at evaluate time; a hit is the velocity source for a rule, not a decision in itself (combine lives in `rule-engine.md` §4).
- **Expire** — entries start to age out per the named TBD `fraud.honeypot_window` (README §13, fraud ops); no silent removal — removal goes through an audited reason (README §5).
- **Removal** — audited reason, recorded who/why; entry removed only from the merchant's own scope.

## 4. Honeypot

- Storefront-decorated trap (READM §2 stage), merchant-visualized as a red dial with a window counter.
- A trap firing logs `honeypot.triggered` with `trap_id` + window id — once per window (idempotent double-fire).
- `hold` states never auto-approve; expiry returns the case to `review`.
- Honeypot taps never shared as leads (§12); merchant-visible only.
- Engine/honeypot down → all orders evaluate to `review` (never auto-block without evaluation); honeypot obstacles that fired during downtime queue for re-review after recovery (README §7).

## 5. Events

`honeypot.triggered` — trap id, window (`fraud.honeypot_window`, §13), merchant_id. Metrics: `honeypot`, `blacklist` families in the §7 ops dashboard. English keys.

## 6. Named TBDs (owners)

| Item | Owner |
| --- | --- |
| `fraud.honeypot_window` — bounded honeypot window label used by trap + counters (§13) | **TBD** — fraud ops |
| `fraud.hold_window_days` — hold expiry back to `review` (§5) | **TBD** — fraud ops |

Until sign-off: no numbers — the window and the days are only ever named (config rows carry `TBD_VALUE: fraud.honeypot_window` comments, never literals).

## 7. Verification

`docs/15-e2e/fraud_loop.md` golden scenarios: honeypot fires within window + logs trap id; blacklist add/remove both show audit lines; a hold expires back to `review`; engine-down → review without silent acceptance.