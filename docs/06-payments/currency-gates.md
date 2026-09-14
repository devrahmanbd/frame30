# 06-payments — Currency gates (BDT-locked default, USD pilot gate, conformance, rollback)

Status: Planning · Slice S3/S4 · Companion: [`currency.md`](currency.md) (money model that these gates enforce) · Reference: `docs/06-payments/README.md` (Strict guardrails); `docs/15-e2e/README.md` (§Suites, §Standard, `@device-class` suffix rule); `docs/16-product-pricing/README.md` (§3 `check_entitlement`, §2 plan matrix — plan prices are drafts pending user sign-off per 16 §13); `docs/08-pos-shipping/README.md` (offline POS fallback snapshot); `docs/00-meta/design-system.md` (semantic tokens)
This depth spec turns the money model in `currency.md` into a rollout policy: the **default store is BDT-only and locked**, a store enters USD only through the **pilot tier gate** below, every non-pilot store is *proven* BDT-only by the conformance matrix, and **rollback to BDT is always allowed** with a history row. It adds no new money behavior; it gates who may enter multi-currency and how we prove the default stayed integer-currency-clean.

> Hard gate (identical to `currency.md`): money is **never a float and never currency-agnostic** — every stored monetary column carries `amount_minor_int` (integer minor units) **and** `currency_code` (ISO 4217 STRING). Any code or migration that stores a money amount without both is a review-stop defect.

---

## 1. Purpose

- **Locked by default**: a store that has never passed the pilot gate is `BDT` end-to-end (presentation == settlement == payout), matching every existing reference that wrote "integer BDT". The default store exercises **zero** conversion code — `docs/06-payments/README.md` says the default store is the entire v0/v1 behavior.
- **Gated opt-in**: USD is reachable only through `is_currency_pilot(merchant_id)` (entitlement-anchored, §4) plus the owner action + consent record in §5.
- **Provable**: the conformance matrix (§6) asserts, per non-pilot store, that no conversion path exists and no money row mixes currencies — run in CI at the same machine boundaries as `store_loop` (per 15-e2e §3, never skipping a legal state).
- **Reversible**: reverting to BDT is a named action with a history row and is always permitted, even mid-pilot (§8). No rollback ever deletes money data.

## 2. Boundary & ownership

- **Owned here**: the BDT-lock matrix per store tier, the USD pilot tier gate, the `is_currency_pilot` predicate, conformance test headers + registration policy, ledger-sanity assertions, rollback strategy, and the two admin/ops surfaces that expose gate state.
- **NOT owned here**: money representation, FX sourcing, checkout conversion, rounding/parity, payout isolation, cross-currency refund policy — all live in `currency.md` and are referenced, not redefined. The payment/order/shipping machines stay with the parent README.
- The gate is a write-path guard, not a client knob: entitlement is computed server-side via `check_entitlement` (16-product-pricing §3), never trusted from a request body.

## 3. Currency posture per store (model)

One per-store attribute drives everything downstream: `currency_mode ∈ {bdt_locked, usd_pilot}`. `bdt_locked` is the default for the unconfigured store.

```
bdt_locked (default) → pilot_assessing → usd_enabled → evaluate_period → revert_to_bdt | continue_usd
each transition appends an fx_policy_history row; revert requires the currency_gate re-pass in §8
```

- The default store starts `bdt_locked`. The gate (§5) moves a store to `pilot_assessing` only after the checks in §5 pass; the store becomes `usd_enabled` only when the pilot entitlement resolves to `continue_usd`.
- `fx_policy` is a column of `store_currency_settings` (tenant) — see `currency.md` §6 where it is a FK → `fx_policies`, owned by the currency product owner.

## 4. BDT-only default matrix (per plan tier)

A store's currency surface is a function of its plan tier (`docs/16-product-pricing/README.md` §2; plan values there are drafts pending user sign-off — this matrix repeats the tier, not a new number). "USD gate" = `currency_pilot` entitlement + §5 checks.

| Plan tier | Plan (from 16 §2, BDT/mo) | BDT-only surface | Multi-currency surface | USD pilot gate |
|-----------|---------------------------|------------------|------------------------|----------------|
| Startup (trial / unconfigured store) | BDT 0 (14d trial → BDT 0 forever, capped) | locked | never present | unavailable (no pilot flag) |
| Growth | BDT 1,200 | locked | never presented | unavailable (no pilot flag) |
| Business | BDT 2,500 | locked (all non-pilot Business stores) | available only via §5 gate | `check_entitlement(tenant_id, 'currency_pilot', 1)` → `true` required |
| Enterprise | custom | locked (same rule) | available only via §5 gate | same entitlement check |
| **Unconfigured / new tenant** | — (no plan row yet) | locked by construction | blocked | `entity: no gate` — store stays BDT until a subscription resolves |

- A store that has never passed the gate or has **no** resolved plan row is BDT-only; the matrix is ADD-only (a row can't be removed by a code path, only superseded by a `currency_gate` transition).
- **Pilot stores always settle in BDT** in pilot v1 (`currency.md` §6 `settlement_code` always `BDT`; mutability = named TBD-3, owner: currency). The matrix only ever enables the presentation side; settlement switching is out until TBD-3 resolves.
- Numbers cross-checked against 16-product-pricing §2 (Launch/Growth/Business/Enterprise prices and COD/MFS/wallet rails); no new price invented here.

## 5. USD pilot tier gate (fail closed)

`is_currency_pilot(merchant_id)` is a server-side predicate. It returns `true` **only** when all of the following hold at evaluation time, in order:

1. **Resolved active plan** — tenant has an active/trialing subscription at Business or Enterprise (`subscription.status` per 16 §5: `trial/active`; paused/cancelled → denied).
2. **Entitlement** — `check_entitlement(tenant_id, 'currency_pilot', 1)` resolves `true` (16 §3 RPC; Postgres constraint backstop).
3. **Owner action + consent** — the `owner` role performs the explicit "enable USD presentation" action (surface §9) and records a consent row (GDPR-opt, opt-out honored — per `docs/00-meta` §5 Consent & privacy).
4. **FX feed available** — at least one non-stale `fx_rates` snapshot exists for `BDT↔USD` (fail closed on staleness, `currency.md` TBD-1).
5. **KYC standing** — merchant KYC is not suspended; a suspended payout keeps the store BDT (16 §8 expiry → payouts suspended).

Failures are explicit, not silent:
- any check fails → the predicate returns `false`; the USD admin surface is `currency_pilot_denied` (see §10), and the store remains `bdt_locked`.
- `currency_pilot_denied` is returned as a named event (`currency.gate_denied`) — reviewable, not debug-swallowed.

Gate steps, in order (everything server-side, idempotent):

```
gate_apply (owner) → entitlement_check → policy_transition (append fx_policy_history)
                    → presentation_code := USD (only if checks 1–5 passed)
                    → emit currency.pilot_gate_passed | currency.gate_denied
```

- The predicate is recomputed per request; pass state is never stored client-side, and a merchant never sees another tenant's plan/entitlement (16 §3 platform tables are tenant-scoped read).
- `check_entitlement` is the only path; the client never supplies `is_currency_pilot`.

## 6. Conformance matrix — the currency gate test heads

The standard suite names follow `docs/15-e2e/README.md` §Suites + §Standard (`@device-class` suffix, retries=2, per-env datastore reset). Tests below are **named here**; their registration in `docs/15-e2e` is a named TBD (`currency_gate_tests`, owner: currency team) matching the `e2e_promo_loop` precedent in 16-product-pricing §9. All monetary assertions use the fixture's integer `amount_minor_int` + `currency_code` and the same `fmtMoney`/`fmtBDT` used in production (15-e2e §1).

### 6.1 Non-pilot store (any tier, `bdt_locked`)

| Header | Assertion |
|---|---|
| `api_money_no_conversion_path` | a non-pilot store can't reach a conversion endpoint; any attempt returns `404`/`403`, no fallback conversion |
| `ledger_store_frozen_bdt` | `store_currency_settings.presentation_code == 'BDT'` for a `bdt_locked` store across restarts |
| `storefront_bdt_only_price_chip` | storefront render: BDT symbol + tabular numerals; no `≈` converted chip appears for a non-pilot store |

### 6.2 Ledger sanity (every money row, every write)

| ID | Assertion |
|---|---|
| `ledger_no_mix_currencies` | every `payments`, `payments_attempts`, `refunds`, `refund_attempts`, `payouts`, `wallet_ledger`, `vat_rates`, `invoices`, `cart` row: `amount_minor_int` + `currency_code` present; identical `currency_code` on both sides of a ledger entry (never a mixed-entry) |
| `ledger_no_float_columns` | schema check: no `float`/`numeric(k,n)` money column introduced in any migration (CI gate, same as `currency.md` §4 integer-only rule) |
| `ledger_rounding_adjustment_is_flagged` | a ≥1 diff writes an explicit `rounding_adjustment` row carrying `currency_code` — never a silent round (parity per `currency.md` §9) |
| `ledger_currency_filter_required` | all money queries filter/group by `currency_code`; a query without it fails the check that `amount_minor_int` alone is disallowed (one code path rule, `currency.md` §17 Design decisions 1) |

### 6.3 Conversion boundary (only when the store is `usd_enabled`)

| ID | Assertion |
|---|---|
| `api_fx_quote_idempotent` | retrying the same `order_id + attempt` re-asserts the same `fx_rate_id` snapshot — never re-lookups the rate or re-converts |
| `api_fx_round_half_up` | conversion = `round_half_up(original_minor_int × base_rate_scaled) ÷ divisor`; parity gets 1-currency-related residual `rounding_adjustment` (never a silent 1-unit diff), per `currency.md` §9 |
| `api_fx_stale_fails_closed` | rate past the staleness window (TBD-1) → checkout returns "price under review", no silent fallback/convection path |
| `e2e_payin_usd_payout_bdt` | `store_loop`-style flow: USD-presented pay-in converts at checkout (order currency `USD`), settles at the BDT buy rate (sold BDT), payout row matches the snapshot — end-to-end. Runs only in `currency_pilot` tenant, never in the default `store_loop` |
| `api_refund_order_currency` | refund returns in `orders.currency`; mismatch drift → block + `refund.currency_mismatch`, never auto-convert (TBD-4 default) |

Pilot conformance is distinct from the default path: `e2e_payin_usd_payout_bdt` runs against a `test-*` tenant with `currency_pilot` entitlement (15-e2e `test-*` reset), and the **default `store_loop` stays BDT-only** — asserting no accidental currency conversion is exactly what `store_loop` already does (currency.md §21).

### 6.4 Ledger sanity policy

- Every monetary column is the pair, `amount_minor_int` + `currency_code`; no row mixing currencies, no float columns, no client-computed money (15-e2e guardrail 1: the expected amount comes from fixture integer fields).
- Ledger writes have the same no-silent-mixing rule server-side; a `payments` row is not `USD` while its `refund` row (same `order_id`) is `BDT` — that's an alert `currency_mismatch`, not a write (§6.2 asserted).
- All money queries group by `currency_code`; analytics render in store presentation currency with a conversion disclaimer on cross-currency aggregates (`currency.md` §Analytics & reporting).

## 7. Failure & recovery (gates)

- Provider / FX feed down → non-pilot store degrades to BDT-native and stay (already BDT); pilot store fails back to a BDT-presented, snapshot-settled fallback, no silent conversion (currency.md §7 Staleness rule: "fails closed").
- Offline POS: falls back to the last confirmed daily snapshot; on reconnect, `fx` re-sync + resettles from the snapshot (08-pos §7 Failure & recovery — offline-first).
- If a middleware check fails mid-conversion (e.g. parity check), the transaction is aborted with an explicit error/ledger row, never silently re-rounded (currency.md §9).

## 8. Rollback strategy — BDT always allowed

- **Trigger**: `revert_to_bdt` on fx_policy / explicit `store_currency_settings.presentation_code := 'BDT'` (owner action with history row — matching 16 §4 "plan is a `subscription.plan_changed` event, not a manual admin task"; currency rollback is the analogous book-keeping action).
- **On revert**:
  1. `presentation_code` → `BDT`; store returns to `bdt_locked` (the matrix row is set back).
  2. Orders already created with `orders.currency == USD` stay in their order currency (immutable at creation, currency.md §6) and settle per `currency.md` §Payout isolation — never rewritten to BDT or "fixed" with a blind conversion (G-TBD-3 window).
  3. Future orders are BDT-only; no conversion path is reachable until a next gate pass.
- **Data safety**: rollback appends history rows and never deletes money rows; a `fx_rates` and conversion logs are retained (PII-minimal, `order_id`/`fx_rate_id`/`pair` only).
- **Concurrency**: if a gate fails while in `usd_enabled` (entitlement lapse, KYC expiry), the store is set to `revert_to_bdt` and continues as a BDT store; the failed state logs a `currency.gate_denied` line.

## 9. Design decisions

1. Default locked (BDT-only) is the gate's premise, not a fallback — a non-pilot "currency" is a redundant layer in the plan.
2. `is_currency_pilot` is entitlement-derived (`check_entitlement`), one code path — never merchant-invented.
3. The gate is a multi-open consent (+ entitlement + FX-feed + KYC) — opt-out honored everywhere (docs/00 guardrails 5).
4. Rollback stays allowed at any time (BDT is the only store-currency for non-pilot), with a history.
5. Conformance runs in CI at the same machine boundaries as `store_loop` — never live money, never a silent currency mix.
6. TBD items carry doc owners (see §14 Residual gaps).

---

## 10. Design guidelines — currency gate status (admin, owner-facing)

- Intent: an owner-facing, **explainable** gate — "you are BDT-only / you may pilot USD", with the consequences and the path back, never a cryptic flag.
- Palette: `--fq-accent` (teal family) for `bdt_locked`-default active status; `--fq-warning` (amber) when `usd_enabled` shows conversion applies; `--fq-success` mint only for a settled/piloted pass; Rickshaw Red for `currency_pilot_denied` (+ settings correction). Never color-only status.
- Typography: tabular numerals + `currency_code` chip; plan tier text with `--fq-text-primary`; Bangla primary labels, ISO codes secondary muted.
- Density: decision-row calm (not admin-dense), a card for BDT-lock and a gated card for USD; a snapshot chip ("rate BDT→USD 1.0 = <x> (daily)" — from `fx_rates`, never hardcoded).
- Motion: opacity-only, 200ms `--fq-dur-base`; reduced-motion → opacity-only snap.
- A11y: form filled as radio-group (keyboard), the "enable USD" primary action gated + disabled state with mechanism label; changes land in `aria-live`; `--fq-focus-ring` visibility.
- Performance: static admin page, cached; no heavy query on load.
- Anti-slop: the BDT-lock reads as the product default ("your store is BDT" with a lock chip) and the USD card shows a PILOT-state chip that can't be confused with an open toggle; the daily rate chip is real data, not a placeholder (per anti-slop token rule in AGENTS.md).

## 11. Design guidelines — currency health / conformance panel (ops + CI)

- Intent: a single glance at the gate + conformance matrix — green means the store default is BDT-locked and provable; red must be explainable in 10 seconds (echoing 15-e2e §Design guidelines).
- Palette: mint pass / amber flaky (unregistered TBD / stale snapshot) / Rickshaw Red on `currency_pilot_denied` or a failed `currency_gate_repass`; never a single-color overload.
- Typography: mono for test IDs (`api_fx_stale_fails_closed`), tabular numerics for statuses; `currency_code` chips.
- Density: matrix-dense with the test header list of §6; row ID sticky.
- Motion: subtle status pulse while a conformance run is in flight; never blinding.
- A11y: proper table headers, `aria-label` per row; legends for stale/unknown; not color-only.
- Performance: matrix from cached CI results; no page-fetch on view.
- Anti-slop/distinctive: the "BDT lock" row is a persistent first row that says the default store is BDT and is re-asserted every run, so the matrix reads in one glance that multi-currency is the exception, never an ambient default; test names carry `@pilot` suffix where they only run on `test-*` tenants.

---

## 12. Events (additive, PII-minimal)

`currency.gate_checked`, `currency.pilot_gate_passed`, `currency.gate_denied` (always attached to a reason: plan/entitlement/consent/feed/KYC), `currency.rollback.to_bdt`, `currency.conformance.failed`. No customer PII; ids only `merchant_id` (tenant-scoped) + `fx_rate_id`/`pair`.

## 13. Companion backrefs

- `currency.md` §21 (conformance matrix lives here, with the headers `api_currency_convert_rounding`, `ledger_no_mix_currencies`, `e2e_payin_usd_payout_bdt`) and §22 (companion note) — this document is that companion.
- `docs/06-payments/README.md` "Depth specs" line lists this file with its one-line summary.
- `docs/15-e2e/README.md` §Suites/Standard — conformance tests follow the same registration pattern as `e2e_promo_loop` (named-here, registered-there TBD, owner: currency product owner).
- `docs/16-product-pricing/README.md` §3 `check_entitlement` — the only predicate source for `is_currency_pilot`; plan prices used in §4 are the 16 drafts (proposals, pending user sign-off).

## 14. Residual gaps — named TBDs (owners)

| # | Lead | Owner | Scope of decision |
|----|------|-------|---------------------|
| G-TBD-1 | `is_currency_pilot` rollout flag: per-plan vs per-tenant override; and its placement vs 16's entitlements | platform · product | where the flag lives and who can revoke it |
| G-TBD-2 | Conformance-header registration into `docs/15-e2e` (the `e2e_promo_loop` pattern) | currency product owner | when the pilot scope freezes; registers `currency_gate` and USD-only suites |
| G-TBD-3 | Rollback window for in-flight USD orders at settlement (grace for partially-settled rows) | treasury | the exact "oldest in-flight" rule after a `rollback.to_bdt` |
| G-TBD-4 | Delinquency on `currency_pilot` gate (KYC suspension → auto BDT at which time) | treasury + ops | the expiry→locked transition timing |

All `G-TBD-*` follow the named-TBD protocol (`docs/00-meta/README.md` §2); they extend, not duplicate, `currency.md` §22's TBD-1..TBD-5 (staleness window, sell/buy spread, settlement immutability, refund-mismatch drift, USD export wallet). Nothing above lifts until each is resolved; every row in this document is a noted plan column/milestone, and the full corpus remains docs-only planning (status **Planning**, no ships).