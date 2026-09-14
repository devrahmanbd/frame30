# 15-e2e — Owner loop (E2E spec)

Status: Planning · Slice S8+ (owner console) · Reference: `docs/15-e2e/README.md:18` (registered loops), `docs/15-e2e/fraud_loop.md` (frameset/harness §2), `docs/17-owner-console/README.md` §2–§10 (surface contracts), `docs/16-product-pricing/README.md` §§2–4 (plan machine), `docs/06-payments/README.md` §4 (wallet/charge authority), `docs/05` (consent), `docs/14-operations/README.md` §3 (`queue_jobs(snapshot)`, DLQ) · `SYSTEM.md` §Conventions

Owner (eventual): QA · fixtures: owner ops

## 1. Scope

The e2e contract the `/root` console ships against: pricing draft→publish with 2-key sign-off, gateway `mock→sandbox→live` only after wallet check, consent channel toggle honoring opt-out, dead-letter flush, AI kill-switch fail-open to `review`, and every console write landing an `audit.owner_action` row (90d raw / 3y audit). Playwright is deferred until the S1 scaffold exists (README §15); this spec defines scenarios + acceptance, not the runner.

## 2. Harness

Reuses `docs/15-e2e/admin_loop.md` frame: seeded owner fixture (`ownerId: rafiq` + session), seeded test tenant, seeded `pricing_plan` (draft) with two key-holders, seeded gateway env `mock`, seeded `queue_jobs(snapshot)` with a dead-letter row, seeded `ai.features` + kill-switch row, seeded consent channel opt-out state. The suite calls the edge layer as the logged-in owner — `service_role` is never used; a dedicated failure test asserts `service_role`-keyed calls are denied.

## 3. Corpus anchor (README §18)

> **Owner loop** (spec: `owner_loop.md`): `/root` console governance — pricing draft→publish with 2-key sign-off; gateway `mock→sandbox→live` only after wallet check; consent channel toggle honoring opt-out; dead-letter flush; AI kill-switch fail-open to `review`; every console write lands an `audit.owner_action` row (90d raw / 3y audit in tests).

## 4. Scenarios (canonical)

**Golden A — pricing draft → 2-key publish.** Owner publishes `pricing_plan` from `draft`; first key signs (`owner_action`, reason required), plan stays `draft`; second key signs (distinct holder) → `published`. Asserts: event `pricing.plan.published`, two distinct `audit.owner_action` rows with reason codes, `amount_minor_int` unmuted by `fmtBDT` (no float), one-key publish denied (`no_permission`, no row written).

**Golden B — gateway env gate.** `mock→sandbox` toggle from owner console with wallet balance ≥ gate; `sandbox→live` denied while wallet check fails (seeded low balance) → stays `sandbox`; after reconciliation (mock wallet top-up via `docs/06` fixture), `sandbox→live` passes with `gateway.env.live_toggled` + audit row. No client-trusted env decision.

**Golden C — consent channel toggle.** Owner disables marketing channel → storefront + `05` surface honor opt-out (no sends to opted-out rows); re-enable allowed only for NON-opted-out tenants; opted-out tenant stays dark. Asserts `consent.channel.toggled` + audit row; no PII in the audit payload.

**Golden D — dead-letter flush.** A seeded DLQ row (from `queue_jobs(snapshot)`, `docs/14` §3) flushes via 14's API: retry accepted → row leaves DLQ; flush writes `queue.dead-lettered` + `owner_action` (operator + reason). Flush of a non-DLQ row fails (`not_found`) with no audit row.

**Golden E — AI kill-switch fail-open.** `ai.kill_switch.live→off` (4-eyes, 2 distinct keys); engine-down → storefront AI fails open to `review` (never blocks), console shows "Review only" banner; re-enable after review window. Asserts `ai.kill_switch.changed` + audit rows for both keys, fail-open state visible (icon + badge, never color-only).

## 5. Failure suite

- Pricing: single-key publish → `no_permission`; publish with no reason code → rejected; publisher ≠ distinct second key → rejected (self-sign-off block).
- Gateway: `sandbox→live` with wallet < gate → `no_permission` + `wallet_check` audit, no env change; non-owner env toggle → `no_permission`.
- Consent: toggle on an opted-out channel → no sends, `consent.channel.toggled` not emitted; missing opt-out row → rejected.
- Dead-letter: flush on empty/missing queue row → `not_found`; concurrent double-flush → exactly one audit row (idempotency).
- AI kill-switch: one-key toggle → `no_permission`; non-owner → `no_permission`.
- **`service_role` probe**: console RPCs reject `service_role` callers (auth-only per 17 §10).
- `owner_action` audit integrity: every successful mutation above leaves the exact expected rows + retention split (90d raw/3y audit) asserted in tests; failed writes write none.

## 6. Evaluation

Run after the owner-console shell merge; the critical golden `pricing draft → published` with 2-key sign-off must pass before the console gate ships. Ad-hoc reruns target only the slice touched. This spec's owner registers the suite in `docs/15-e2e` §Suites (`owner_loop`) — the README §18 name redirects here.