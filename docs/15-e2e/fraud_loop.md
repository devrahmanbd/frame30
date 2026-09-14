# 15-e2e — Fraud loop (E2E spec)

Status: Planning · Slice S8 (shipping gate) · Reference: `docs/15-e2e/README.md:16` (registered loops), `docs/15-e2e/admin_loop.md` (frameset/harness §2), `docs/11-fraud/README.md` §11 (`e2e_fraud_loop`, ops owner TBD → QA, §13), `docs/11-fraud/rule-engine.md` §§4–5 (combine + verdict send), `docs/11-fraud/blacklist-honeypot.md` §4 (honeypot), `docs/11-fraud/risk-review.md` §2–4 (lifecycle, hold), `docs/06-payments/README.md` §4 (charge/refund authority) · `SYSTEM.md` §Conventions

Owner (eventual): QA · fixtures: fraud ops

## 1. Scope

The e2e contract that the fraud slices ship against: golden transitions, honeypot behavior, blacklist audit lines, refund-after-block authority, engine-out degradation. Playwright is deferred until the S1 scaffold exists (README §15); this spec today defines scenarios + acceptance, not the runner.

## 2. Harness

Reuses `docs/15-e2e/admin_loop.md` frame: seeded merchant fixture, admin console session, seeded `fraud_rules` + blacklist entry, a honeypot trap transcribed at the storefront (§4), and a seeded engine with `fraud.rule_caps` + `fraud.high_risk_threshold` at named defaults (`TBD_VALUE:` config rows — no literals until sign-off). Engine-down and re-routing hooks from `rule-engine.md` §5.

## 3. Corpus anchor (README §11)

> "New target: `e2e_fraud_loop` — registered in `docs/15-e2e` §Suites (spec: `fraud_loop.md`); ops owner QA (§13)."

## 4. Scenarios (canonical)

**Golden A — review → approve → charge.** A benign flow collects normal signals into `fraud_scores`/`fraud_cases`; the combine score returns `approve`; the case enters the queue; an ops actor calls `fraud.approve_case` (`fraud.case.approved` persisted with its release point); checkout proceeds. Asserts: verdict `fraud.case.approved` logged with reason code, state `pending→review→approve`, order charge allowed (only via `06-payments`), audit line present.

**Golden B — review → block → terminal.** A seeded high-risk order (blacklist hit) is `block`ed; the checkout machine stops; no refund path in this spec (06 authority).

**Golden C — escalate → manual review.** `fraud.escalate_case` lifts the case to the manual console (§8) without deciding; no money moves.

**Golden D — hold → expiry → re-review.** `fraud.hold_case` holds; after `fraud.hold_window_days` (named TBD) the case returns to `review` — asserts it is *not* auto-approved; honeypot double-fire within the same window fires + logs only once (`honeypot.triggered`, trap id, window id).

**Golden E — blacklist audit.** Adding an entry leaves an audit line (who, why); removing leaves a second audited line; merchants see only their own rows.

**Golden F — engine down.** Simulate provider outage; all orders evaluate to `review` (never auto-block without evaluation); honeypot obstacles that fired during downtime requeue for a post-recovery re-review.

**Golden G — refund-after-block.** Refund executes only via the `docs/06-payments` refund machine and only for an approved/captured order; a `block`ed order cannot route money in this loop.

## 5. Failure suite (README §11)

- Provider down → engine-down seed (Golden F) must remain in `review`, logs show `fraud.rule_hit` + reason.
- Dead-letter queue: a failed decision event lands in the DLQ and is reprocessed without double-decision.
- Refund reject: refund RPC rejected for a `block`ed order.
- Direct service_role probe: decision RPCs reject `service_role` callers (auth-only per risk-review §3).

## 6. Evaluation

Run after each fraud slice merge; the critical golden `review → approve → charge` must pass before the fraud gate ships. Ad-hoc reruns target only the slice touched. This spec's owner registers the suite in `docs/15-e2e` §Suites (`fraud_loop`) — the README §11 name ('`e2e_fraud_loop`') redirects here.