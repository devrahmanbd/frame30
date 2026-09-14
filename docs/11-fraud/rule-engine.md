# 11-fraud — Rule engine (shapes, signals, combine & vendor swap)

Status: Planning · Slice S7 · Reference: `docs/11-fraud/README.md` §7 (rules engine & vendors), §13 (named TBDs: `fraud.rule_caps`, `fraud.high_risk_threshold`, ML combine weights); `docs/06-payments/README.md` (chargeback feed, gateway idempotency, rate limiter infra); `docs/05-marketing/README.md` (`ad_bot_score` source); `docs/15-e2e/README.md` (gates) · `SYSTEM.md` §Conventions
Owners: platform eng (`fraud.rule_caps`) · fraud ops (`fraud.high_risk_threshold`) · data eng (ML tier combine weights)
Verbatim rule quote (`docs/11-fraud/README.md` §7): "Rules are server-side only, with no client trust. Three shapes: **Hard blocks** — blacklist IP/phone/MFS account (deny + notify). **Soft holds** — review queue with reason chips. **Auto-approve** — below auto-approve thresholds."

> Hard gate: the engine **never trusts a client** — a client may render a signal, never a verdict. No rule, combine, or failure path may write a `block` without server-side evaluation, and **no decision moves money alone**: blocks pause through the `06-payments` machine at a legal stop state.

---

## 1. Purpose

This depth spec pins down how README §7 rules are evaluated, combined, and swapped, so that builders and QA implement one engine — never a parallel one. It is the implementation contract for `docs/15-e2e/fraud_loop.md`.

- Evaluation happens **server-side, at charge time** (re-checked against order final values), never at cart time and never in a client.
- Every evaluation outcome is one of three long-lived statuses the decision machine consumes: `flagged`, `review`, or `approved`. Blocks are *decisions made later on a flagged case*, by the machine — the engine itself emits evidence.
- Ad-integrity shares the engine: bot-dial evidence from `docs/05` enters as one of the signal families below (see §3), never as a separate bespoke path.

## 2. Boundary & ownership

- **Owned here**: rule shapes, `rule_key` convention, signal registry, combine policy, failure behavior, mock/real vendor seam, rule-config audit.
- **NOT owned here**: the decision machine and its transitions (README §5 — one machine, README-owned); the review queue and decisions (`risk-review.md`); blacklist/honeypot storefront mechanics (`blacklist-honeypot.md`); fraud table schemas/RLS (README §3).

## 3. Rule shapes & `rule_key` convention

Rules are *nameless* to merchants and vendors (README §7: opaque `rule_key` + reason code, never a vendor-named rule). Internally the engine keys a rule `rule_key = "<domain>:<name>"` (e.g. `checkout:credential_stuffing`, `payment:mfs_velocity`) — the `domain` groups by rule family in §5, and the `name` is the stable internal handle. Vendors map **onto** these keys; the reverse never happens (a vendor rule is always carried inside a corpus rule key + reason code).

Three shapes (from README §7):

| Shape | What it does | Case effect | Terminal by |
| ----- | ------------ |------------ | ----------- |
| **Hard block** | blacklist IP/phone/MFS | `blocked` (deny + notify) | rule hit (min 2 signals) |
| **Soft hold** | review queue entry | `review` | case decision |
| **Auto-approve** | clears `flagged` without review | `approved` | threshold in §4 |

- Every rule is merchant-tenant, and every mutation writes a who/why audit diff (README §5, §12).
- Rule evaluation is idempotent per (order, rule): same order + same rule = same evidence, no double rows.

## 4. Signals, scoring & combine policy

**Signal registry** — nothing invented here; four families from README §7 (9 named signals + 2 cross-surface drivers):

| Family (`domain:`) | Signals (README §7, names verbatim/pinned) | Source surface |
| ----------------- | ------------------------------------------ | -------------- |
| `checkout:` | device fingerprint · browser·IP reputation tracking (`ip_reputation`) · phone-format validity | `03-storefront` capture + `11-fraud` tables |
| `payment:` | MFS-account velocity · amount vs. historical user/IP · coupon stacking (`coupon_codes`) · COD abuse (cancelled > 30d window) | `06-payments`, `07-commerce` anchor |
| `identity:` | mismatch flags (billing vs shipping) · first-order priority (first order of a user gets prioritized). | `03-storefront`, `02-merchant` |
| `external:` | chargeback-rate threshold (feed from `06-payments` chargebacks) · `ad_bot_score` per source (from `05-marketing`) | `06-payments`, `05-marketing` |

- **Combine policy — max-weight-of-hits** (fixed as §5 of this spec; no invented scoring variance): each signal emits a normalized weight in `[0,1]`; the case score is the single highest weight across all fired signals — a hard-block family with ≥ 2 signals hits the block floor; anything below floors to `review`. Rationale (pinned from §7): false-positive harm > false-negative; block requires minimum 2 signals; default is `review`.
- **ML tier (optional, swappable)**: the engine exposes a `FraudScorer` seam (interface — `score(case) → {score, reason_codes[], sources}`); the default implementation is a **deterministic mock** (dev/test parity with the `06-payments` mock-MFS sandbox), a real provider plugs in without touching rules or the machine. Any tier must stay explainable — reason codes + sources, never a naked number.
- **No raw data leaves**: a provider receives aggregate/evidence ids only (vendor swap, README §7).

## 5. Evaluation flow & failure tier

1. Order final values reach the engine at charge time; rules fetch their per-tenant registry (cache, ttl).
2. All signals gather; combine per §4; outcome < auto-approve floor → `flagged` → machine resolves; if `failed`/`review` outcomes → `review` (README §5: default risk review — **never a silent indefinite block**).
3. Records: `fraud_scores`, `fraud_cases`, `rule_violations` rows; event `fraud.rule_hit` fired per rule (README §6).

**Failure tier (README §7)** — engine down → every order evaluates `review` (stale gauge note); honeypot obstacles that fired during downtime are queued for re-review after recovery; a provider timeout is treated as the same verdict path (`review`), never a silent accept and never an auto-block without evaluation.

## 6. Vendor seams

- `FraudScorer` seam (interface) in the engine; mock default runs in dev/test; identical verdict for identical inputs (deterministic seeds; documented in `docs/15-e2e`).
- Real providers (Signifyd, Riskified) are selectable per tenant under the Enterprise fraud entitlement (`docs/16-product-pricing` §2); provider doesn't alter rule shape or reason code semantics.
- Provider switch requires the `fraud_scores` history to remain comparable (score source recorded on the score row, so dispute re-runs (`risk-review.md` §5) can diff across vendors).

## 7. Naming the open items (README §13 anchors)

The values are **TBD pending user sign-off** — this spec anchors them where hash they'll be set:

- `fraud.rule_caps` — velocity/day + per-account caps used by `checkout:`/`payment:` velocity rules (§3). Owner: platform eng.
- `fraud.high_risk_threshold` — score at which a case blocks (§4 combine floor). Owner: fraud ops.
- ML tier model + combine weights — replaces mock `FraudScorer` (§6). Owner: data eng.

Until sign-off: default mock, no invented numbers — auto-approve floor, block floor and caps are only ever named parametinside `fraud_rules` config rows with a named-TBD comment (`TBD_VALUE: fraud.rule_caps` etc.), never hardcoded literals.

## 8. Verification

- `docs/15-e2e/fraud_loop.md` golden scenarios §4–§5 drive: verdicts on the same order under mock vs `provider-down`, `review` defaults, ≥2-signal block floor.
- Corpus check (CI-gated): `rg -l "hardcode" docs/11-fraud` must stay empty of float `block_floor` literals; every numeric in `fraud_rules` seeds references a named config key.