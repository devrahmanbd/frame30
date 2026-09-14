# 11-fraud — Risk review (queue, case lifecycle, decisions)

Status: Planning · Slice S7 · Reference: `docs/11-fraud/README.md` §4 (review queue, default-risk), §5 (case state machine, hold expiry), §6 (`fraud.rule_hit`, decision RPCs), §7 (combine weights), §8 (fraud ops console), §12 (disputes & vendor share); `docs/06-payments/README.md` §4 (checkout authority, refund machine); `docs/15-e2e/README.md` (gates) · `SYSTEM.md` §Conventions; §13 owner TBDs

Owners: fraud ops (SLA, thresholds) · platform eng (queue mechanics, RLS)

Corpus anchor (verbatim — README):

> "Verdicts are server-side only; no merchant or client passes judgment without evaluation."

> "Decision RPCs are authenticated: `fraud.approve_case`, `fraud.block_case`, `fraud.escalate_case`, `fraud.hold_case`, `fraud.release_case`."

> "Hold machine: `hold` expires back to `review` after the bounded honeypot window (`fraud.hold_window_days`); it never auto-approves."

> "Risk is re-evaluated at charge time; there is no 'buy now, risk later'."

**Hard gates** (apply to every case): verdicts never move money alone — money movement only via `docs/06-payments`; `block` is a legal stop on the checkout machine; audit logs are immutable append-only with a reason code on every line; no service_role path for merchant-facing review queries.

## 1. Queue & default risk

- Reviews enter the queue from engine verdicts, contested-flag escalations, and honeypot holds.
- Default risk is `review` — nothing defaults to auto-approve or auto-block; a missing verdict means the order waits (no "buy and risk later").
- Queue deliver-by uses `fraud.review_sla` (named TBD below, §6).

## 2. Case lifecycle

States (README §5): `pending` → `review` → `approve` | `block` | `escalate` | `hold`; `block` = terminal for the checkout machine; `approve` → charge proceeds via `06-payments`; `escalate` hands the case to the manual review console (§8).

## 3. Decisions (auth-only RPCs)

`fraud.approve_case`, `fraud.block_case`, `fraud.escalate_case`, `fraud.hold_case`, `fraud.release_case` — all authenticated, no service_role for anyone outside the engine; every decision emits an audit line carrying its reason code (§12).

## 4. Hold & expiry

A `hold` case returns to `review` on expiry after `fraud.hold_window_days` — it is never promoted to approve; hold expiry keeps the case auditable (§12) and re-queues it for fresh, charge-time re-evaluation (README §5, no stale approvals).

## 5. Disputes & chargebacks

- Dispute handling routes from `docs/06-payments` (chargeback feed) back into `review` for documented re-scope (README §12); vendor share of fraud signals is credited only from a completed chargeback — and only when it arrives as a legit dispute, on documented merchant evidence, not from a hold.

## 6. Named TBDs (owners)

| Item | Owner |
| --- | --- |
| `fraud.review_sla` — queue deliver-by (README §7 ops console) | **TBD** — fraud operations |
| `fraud.hold_window_days` — hold → review expiry (README §5) | **TBD** — fraud operations |

All three quantities live as configured names only; no literal values anywhere until OWNER sign-off (SYSTEM §Conventions).

## 7. Verification

- `docs/15-e2e/fraud_loop.md` §Evaluation: review → approve → charge goldens; hold → expiry → re-review not approve; block → terminal; decision RPCs reject for service_role; every audit line carries a reason code (§12).
- No money moved by any decision endpoint in this spec; money flows only via `06-payments` (README §4).