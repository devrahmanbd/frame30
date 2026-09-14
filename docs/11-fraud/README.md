# 11 — Fraud & Risk

Status: Planning · Slice S7 · Reference: `/plan.md` §3.13 (fraud), `06-payments` (rate limiter infra, gateway idempotency, wallet hold reserve)
Design: `00-meta/design-system.md` (Admin palette, risk colors, motion tokens)
Sub-plan model: `09-analytics/event-pipeline.md` (raw → aggregate → purge, RLS policy set, gap-honest backfill)
Depth specs: `rule-engine`, `blacklist-honeypot`, `risk-review`

---

## 1. Purpose

Order-level fraud detection tuned to Bangladesh ecommerce (COD abuse = #1). The rule engine evaluates **server-side only**; a client can render a signal, never a verdict. No client-trusted decision exists anywhere in this surface — promos, discounts, stock, and fraud all validate server-side per `00-meta/README.md` §2. Ad-integrity (bot traffic dial from `docs/05`) shares the same risk engine.

- Decisions never change money by themselves: a block pauses the order through the `06-payments` machine at a legal stop state, and a release resumes from the same point; refunds always travel the payment machine; risk is re-evaluated at charge time, not cart time.
- `ad_bot_score` per source (bot hard pixel) feeds the `03-storefront` beacon — separate view in `docs/05`.

## 2. Stages (pages)

1. **Fraud review queue** — cases awaiting a decision; default risk is `review`; reason chips on every case; review SLA is a named TBD (`fraud.review_sla`, §13).
2. **Rule list** — merchant-configurable rules and thresholds; every change records who/why in the audit diff.
3. **Merchant flags (advisor)** — per-order risk factors surfaced as flags with severity; fraud suite is an Enterprise entitlement (`docs/16-product-pricing` §2).
4. **Payout max-review / hold** — wallet payouts above a per-account cap hold for review; a hold reserve backs disputes (per `06-payments` wallet); payout amounts are integer BDT via `fmtBDT`, never floats.
5. **Blacklist manager** — IP/phone/MFS-account entries; add and removal both carry audit lines.
6. **Honeypot log** — merchant-visible only; taps logged with timestamps.

## 3. Data model & RLS

Tables: `fraud_scores`, `fraud_rules`, `fraud_cases`, `blacklists`, `device_fingerprints`, `ip_reputation`, `honeypot_events`, `rule_violations`.

Every entity is `merchant_id`-scoped; `merchant_id` is on every subquery. All reads run through merchant-scoped RLS policies — no dashboard or API query ever relies on application-layer filtering alone.

```sql
alter table fraud_scores          enable row level security;
alter table fraud_rules           enable row level security;
alter table fraud_cases           enable row level security;
alter table blacklists            enable row level security;
alter table device_fingerprints   enable row level security;
alter table ip_reputation         enable row level security;
alter table honeypot_events       enable row level security;
alter table rule_violations       enable row level security;

create policy "merchant_reads_own_scores"     on fraud_scores
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_rules"      on fraud_rules
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_cases"      on fraud_cases
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_blacklists" on blacklists
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_honeypot"   on honeypot_events
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_violations" on rule_violations
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
```

- Writes: only the rule engine (service role) inserts scores/cases/violations; merchants insert on nothing except their own `fraud_rules` and `blacklists` config — and those writes are RLS-scoped too.
- The honeypot log is merchant-visible only; honeypot taps are never shared as leads.
- `device_fingerprints` and `ip_reputation` are per-tenant (S&P honeypot and blacklist are per-merchant, never global).

## 4. API

All reads go through the merchant-scoped policies above. The API layer sets `app.merchant_id` from the bearer session via a security-barrier-definer RPC `fraud.as_merchant(uid uuid)` (mirrors `analytics.as_merchant` in `event-pipeline.md` §6); no merchant-facing call sets the guard itself.

- Decision RPCs are `authenticated`-only: `fraud.approve_case`, `fraud.block_case`, `fraud.escalate_case`, `fraud.hold_case`, `fraud.release_case` — the `service_role` key is never used for merchant-facing reads (matching the `admin_loop.md` grants convention).
- Every decision is idempotent: re-issuing the same decision on the same case is a no-op (Redis idempotency key), so an agent retry cannot double-move a case.
- Rule/blacklist config changes are write-path audited (who/why) and export via the shared exporter (`docs/13`) as structured JSON without raw PII.

## 5. State transitions

**One** decision machine, owned by this README — no parallel copies. Every transition carries a reason code.

```
fraud case — one machine (reason code on every transition)

  rule hit / signal combine / honeypot / blacklist / ad_bot_spike
                             │
                             ▼
                         flagged ──► review ──► approved (allow) ──► closed
                                       │  │        │
                                       │  │        ├─► blocked (deny + notify) ──► closed
                                       │  │        └─► escalated ──► closed
                                       │  └────────► hold ──(bounded window)──► back to review
```

- Core decision machine: `review → approved | blocked | escalated`; `flagged` is the entry, `closed` is the terminal.
- Default for a high-signal uncertain case is `review` — never a silent indefinite block.
- A `hold` expires back to `review` after the bounded honeypot window (`fraud.hold_window_days`); it never auto-approves.
- Removal from blacklist also goes through an audited reason.
- Backfill/audit logs are immutable; on dispute the scoring is re-run with a diff view against the original decision.

## 6. Events

English keys; emitted by the engine, honeypot, or 06-payments gateway.

| Event                  | Trigger                    | Carries                                  |
| ---------------------- | -------------------------- | ---------------------------------------- |
| `fraud.case.opened`    | case created at flag time  | case id, merchant_id, top signals        |
| `fraud.review_started` | review queue pick-up       | case id, risk score, reason code         |
| `fraud.rule_hit`       | any rule fired             | rule key, severity, contributing signals |
| `fraud.order.blocked`  | block decision persisted   | case id, order id, reason code           |
| `fraud.case.approved`  | approve decision persisted | case id, order id, release point         |
| `fraud.escalated`      | escalation to analyst      | case id, escalation reason               |
| `honeypot.triggered`   | storefront trap fired      | trap id, honeypot window (`fraud.honeypot_window`, §13), merchant_id |
| `ad.traffic.bot_spike` | bot dial spike per source  | source, `ad_bot_score`, window           |

`fraud.review_started`, `fraud.rule_hit`, and `fraud.escalated` are the canonical review-flow events; the legacy open/approve/block events are preserved so existing analytics consumers keep working.

## 7. Rules engine & vendors (swap-out)

Rules are server-side only, with no client trust. Three shapes:

- **Hard blocks** — blacklist IP/phone/MFS account (deny + notify).
- **Soft holds** — review queue with reason chips.
- **Auto-approve** — below auto-approve thresholds.

**Rule archetypes** (rules are _nameless_: identified by an opaque `rule_key` + reason code, never a vendor-named rule):

- Chargeback-rate threshold (feed from `06-payments` chargebacks).
- First-order-priority risk (first orders from a user get priority review).
- Velocity per day (orders per user, per address-prefix) — bounded by `fraud.rule_caps`.
- Per-account-bounded caps (MFS account / phone caps) — bounded by `fraud.rule_caps`.

**Signals** feeding the rules: device fingerprint, IP reputation, velocity, amount vs. historical of user/IP, coupon stacking (anchors from `coupon_codes`), COD abuse pattern (# cancelled over 30d), mismatch flags (billing vs. shipping), MFS ID velocity, phone-format validity.

- **ML tier (optional)**: anomaly score via rule combine → model; always explainable reason codes; human override.
- **Vendor swap**: the provider (Signifyd, Riskified) is swappable behind an engine interface; a mock runs in dev (mirrors the `06-payments` mock-MFS sandbox); no integration partner receives raw signal data.
- **Failure mode**: rule engine or honeypot down → all orders evaluate to `review` (never auto-block without evaluation, never silently accept without a hold marker) and the gauge shows a "stale" note; honeypot obstacles that fired during downtime queue for re-review after recovery.
- **Decision philosophy**: false-positive harm > false-negative; blocks require a minimum of 2 signals; default is `review`.

## 8. Consent & privacy

- Behavior/trajectory collection requires GDPR-grade consent per `00-meta/README.md` §5.
- Analytics-derived signals are **aggregates only** — dashboards show no personal data.
- Risk data follows the analytics retention policy: 90d raw → 3y aggregate → purge (`docs/09`); merchants cannot extend the raw window.
- **No PII in rule logs**: decision logs carry reason codes + severity, never names/phones; exports via `docs/13` are structured JSON without raw PII.
- Merchant opt-out in `docs/05` is honored by auto-tuners; honeypot taps are logged with timestamps for merchant review and never shared as leads.

## 9. A11y & performance

- WCAG 2.2 AA minimum on this surface; AAA on the surfaces fraud gates (checkout, refunds, auth) per `AGENTS.md` §2 and `00-meta` §7.
- **Color guards**: status is never color-only — the risk gauge has a text-value alternative, icon + text + color for every state (per `design-system.md` §7), keyboard sort, inline audit linking.
- **Performance**: rule evaluation within the admin TTI budget (`15-e2e` §Perf: admin TTI < 3s); score cached; case view loads sync; the dashboard is lazily loaded/debounced (per the `09-analytics` README guideline); tables > 200 rows are virtualized (per `design-system.md` §8); table interactions hold a 60fps budget (transform/opacity only, never layout).

## 10. Design guidelines

Per the `00-meta/design-system.md` §10 template.

- **Intent**: give the merchant a _why_, not just a verdict — every block/review surfaces the contributing signals with severity and tunable thresholds.
- **Key surfaces**: case view (order + timeline + signals), risk gauge (teal→amber→red), rule builder (AND/OR chips), blacklist table with add + audit diff "why changed", honeypot log.
- **Palette emphasis**: Teal primary (safe/approve), Mint success (approved), Bondhu Amber warn (hold), Rickshaw Red blocked — same semantics as checkout; no inverted risk colors.
- **Typography**: tabular order amounts (`tabular-nums`, BDT); signal reasons as labeled chips; Bangla role labels.
- **Density**: high-density table but each row 1-line; the risk view gets breathing room.
- **Motion**: threat signals pulse at 120ms (`--fq-dur-fast`); approval moves the order to mint; reduced-motion → opacity-only (per `design-system.md` §5).
- **A11y**: risk gauge has text-value alt, keyboard sort, inline audit linking; AA minimum.
- **Performance**: rule evaluation within the admin TTI budget (`15-e2e` §Perf: admin TTI < 3s); score cached; case view loads sync.
- **Anti-slop**: a Bengal-styled "risk routine" with progressive disclosure — "you're approved for now, we're watching" nuance rather than binary red; honeypot trap visualized as a red dial with a window counter (per `fraud.honeypot_window`, §13).

## 11. Testing gates → loops

- Registered loops (per `docs/15-e2e` §Suites): `store_loop`, `admin_loop`, `builder_loop`, `market_loop`, `fraud_loop`.
- `admin_loop`: the 3-state decision (review/approve/block) honors its transitions; engine-down defaults to `review` for a high-signal order; honeypot rule fires within the honeypot window (`fraud.honeypot_window`, §13) and logs the trap id; blacklist add/remove both carry audit lines; a refund after a block only proceeds via the `docs/06` machine.
- `market_loop`: re-runs the same on a storefront order.
- Failure suite (per `docs/15-e2e`): **provider down** (mock failover → all orders evaluate to `review`), queue dead-letter, **critical refund reject** (refund after a block only via `docs/06`), backup → restore.
- New target: `e2e_fraud_loop` — registered in `docs/15-e2e` §Suites (spec: `fraud_loop.md`); ops owner QA (§13).

## 12. Audit checklist

- Audit logs immutable; no edits, only append.
- Reason code present on every state transition.
- Who/why recorded on every rule change and blacklist add/remove.
- Exports via `docs/13` without raw PII; no integration partner receives raw signal data.
- Honeypot log merchant-visible only; taps never shared as leads.
- Dispute re-run produces a diff view against the original decision.
- Refund after a block travels the `06-payments` machine only.
- Fraud suite gated to Enterprise entitlement (`docs/16`).

## 13. Residual gaps (named TBDs — owners)

| Item                                                                 | Owner                  |
| -------------------------------------------------------------------- | ---------------------- |
| `fraud.rule_caps` — velocity/day and per-account caps (rules §7)     | **TBD** — platform eng |
| `fraud.honeypot_window` — bounded honeypot hold window (§5)             | **TBD** — fraud ops    |
| `fraud.high_risk_threshold` — risk score at which a case blocks (§7) | **TBD** — fraud ops    |
| `e2e_fraud_loop` ops owner (§11) — suite registered in `docs/15-e2e`   | **TBD** — QA           |
| `fraud.review_sla` — max queue-pickup SLA for review cases (§2)        | **TBD** — fraud ops    |
| ML tier model + anomaly-score combine weights (§7)                   | **TBD** — data eng     |

All numbers in this file trace to the corpus: retention windows (90d raw → 3y → purge) per `docs/09`; motion durations map to `design-system.md` §5 tokens (120/200/300ms); BDT-only integers and WCAG AAA on gated surfaces per `AGENTS.md` §2; admin TTI budget per `docs/15-e2e` §Perf. Honeypot windows, review SLA, velocity caps, and risk thresholds are named TBDs (§13) pending user sign-off. Nothing is invented.
