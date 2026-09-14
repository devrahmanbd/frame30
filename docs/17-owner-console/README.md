# 17 — Owner Console (`/root`)

Status: Planning · Slice S8+ (post-shipping; no critical-path dependency) · Gate: owner paper review (design pre-approved, pending doc read-off) · Reference: `plan.md` §7 (docs map), `01-architecture`, `14-operations` (ops mount), `00-meta/README.md` (protocol)
Owners: product: rafiq · eng: platform · qa: `@e2e_owner` (see `docs/15-e2e`)

## Purpose

The platform-owner surface of Framique, reachable only at `/root` — the third and
top shell in the SaaS topology (`/root` owner · `/admin` merchant staff ·
`/dashboard` customer). It is the console the operator uses to watch the whole
product and to act on things *no merchant shell can*: pricing drafts, platform
sign-offs, gateway environment toggles (mock → sandbox → live), platform-wide
kill switches, fraud desk, and compliance settings.

**It is never an owner of record except where named here.** Every number it shows
or writes comes from the owning surface in the docs tree; no table, ratio, or
limit is invented in this phase (protocol rule 2). Where a value is not yet
measured or owned, it stays a named `TBD` with an owner (see §Named-TBD).

---

## 1. Perimeter

- Shell: `apps/root` (frontend) sits alone; reachable only by `platform_owner`
  role (from `docs/02-merchant` identity + RBAC grants — it is a layer of
  `docs/02` RBAC, not a new account).
- Tenancy: all reads respect RLS with `merchant_id = 'platform'` scope on shared
  tables; all writes go through the owning area's API or catch `checker_denied`.
- Money: every taka shown is integer minor units (BDT paisa) formatted by
  `fmtBDT` (system-wide, `docs/06-payments`); no float money anywhere.

## 2. Surfaces (11 pages — each embeds Design-guidelines in-line)

### §2.1 — Shell & navigation (all pages)
- Intent: one year, one place: routes `/root/{hub,pricing,marketing,coupons,trial,fraud,ai,users,gateway,settings}`; no new top-level navigation hidden behind knee-drop.
- Key surfaces: top nav (10 links + settings), deep links from other surfaces (e.g. `/admin/orders` → `/root/gateway`), role badge.
- Palette: neutral canvas + accent BD Teal for at-focus; money always tabular.
- Density: admin-dense (48px rail icons, 72px rows); mobile = full-screen stack.
- Motion: opacity-only transitions (0.15s); reduced-motion always.
- A11y: AAA on confirm/refund/live-gate modals; `aria-current` on rail; focus outline visible at 2:1.
- Performance: route-level code-split ≤ 18KB gz per page; rail lazy.
- Anti-slop: the rail is a *vertical* list (not top tabs) — owner's full product map visible in one scroll; no gradient; no custom icons beyond the design-system set.

### §2.2 — Owner Dashboard (`/root/hub`)
- Shows 7-day + 30-day KPIs (GMV ৳2.84cr ▲4.2% example, active shops 1,284,
  MFS/Wallet split, settlement in-flight, queue depth, fraud risk count, trial
  expiring, AI-ticket backlog) — every card pulls from the owning area's
  `analytics.batches`, `wallet_ledger`, `subscriptions`, `queue_jobs` (see §3),
  never computes floats.
- Read-only by default; any inline action (e.g. "show all") goes to its surface page.
- Performance: fast-first paint (LCP < 2.0s), skeleton on cards, chart cards
  virtualized; no more than 2 chart libs (1 line + 1 bar), numbers tabular.
- A11y: every KPI is text (not only color); cards are `<article>` with `aria-label`;
  charts get data tables behind them.
- Anti-slop: KPI **units always bound** (৳/অর্ডার (order), /দোকান (shop),
  /কাস্টোমার (customer)…), money from ledger not analytics; "রিলিজ নোট"
  closes the loop — nothing shown that a merchant can't see explained at
  `/root/settings` level.

### §2.3 — Pricing Builder (drafts → signed)
- Surface: `plan_definitions` writes go to the 16-pricing engine with status
  `draft`; publication requires a 2-key sign-off (`owner_ack` + `audit` row).
- All values (tier prices, limits, cadence) come from `16-product-pricing` totals
  — this page only edits the draft copy before submitting to the engine;
  history on every draft edit (why, who, when — `audit`).
- Never: raw currency on the page; prices render via `fmtBDT` and always as
  BDT-first (USD pilot hidden behind flag, see §5).
- Design: centered canonical card-picker, diff view draft vs published, pending
  state; tabular type for prices; reduced-motion on diff steps.
- Anti-slop: sign-off is shown as a queue "পরিবর্তনের তালিকা দেখুন" — editors see
  the exact pending copy state, live preview mirrors `/customer/#/pricing` rubric.

### §2.4 — Marketing
- `docs/05` is the owner of campaigns/email/forms/ads; `/root/marketing` only
  reads and *force-completes* (4-eyes) what 05's machine applied (e.g. "stop
  all": requires scope + reason).
- Consent control: each channel page shows consent totals + opt-out counts and a
  "disable" button that honors 05's consent model (opt-in OFF default; the
  console never flips consent on).
- Campaign sends: real telemetry `campaign.sent` events; campaign composition
  previews show SMS length in GSM-7 / UCS-2 segments with Bangla (UCS-2) warning
  — moneyless but high-context (price fragments render in `fmtBDT` previews).

### §2.5 — Coupons & Promos (console ops on 07's rules)
- `07` owns coupon/promo catalog + state machine (percent/fixed, usage caps,
  expirations). The console shows the catalog read-only + "vendor-quick fixes"
  (revoke a coupon globally = read-07, write-07 slug with 4-eyes).
- Every impact is stated in BDT integer, computed on `fmtBDT`, before edit.
- No coupon page ever sets a "% off" that the 07 cap would compute at
  `offer.percent_cap_bdt` (advisory value, see §3) — server re-judges anyway.

### §2.6 — Trial Manager (draft)
- Root sees trial ladder (5-days opt-in default in subscription engine) as
  funnel coordinates (signup→first order→paid) — read-only; extending trial
  requires reason + 4-eyes (`trial.extended.with_reason`).
- Extend is never silent: `subscription.trial_extended` audit row is written by
  the 16-pricing engine, the console just submits the opinion.

### §2.7 — Spam & Abuse desk
- Thin reader over `11-fraud` (rule engine, blacklist-honeypot, risk-review) —
  never re-implements scoring; shows review SLA breaches (`fraud.review_sla`
  advisory = 24h), honeypot window events (`fraud.honeypot_window` = 7d).
- Actions are exact to 11's machines: `fraud.review.approve/block` transitions
  via 11 API; console is only the clicker + audit trace (`fraud.sla.breached`
  event fires at SLA shock).

### §2.8 — AI/ML management (advisory-only)
- Lists models/embedding/metadata from `10-ai-support`; kill switch per
  feature-flag (front) with 4-eyes; that switch truthfully lives in
  `ai.kill_switch.changed` — it never touches money reads (fraud/SLA decisions
  must fail-open to `review`, i.e., from 11's fail-open).
- Read-only model table is refreshed from 10; parameters/sso data stay in 10.

### §2.9 — User & RBAC management (mirror only)
- Identity + roles come from `02-merchant` (RBAC grants); `root` can *revoke*
  (needs 13 export/SDK force-revoke key path, `export.api_key.revoked`), can
  never mint accounts (02 owns genesis).
- Admin sees the permission map read-only; changes are logged with
  `tenant.permissions_changed` + user identity.

### §2.10 — Gateway management
- Toggle per gateway/env: `mock` / `sandbox` / `live`; `live` requires 4-eyes +
  explicit sign-off reason; the actual state machine lives in `06-payments`
  (`gateway_credentials`, `gateway_env`) and the console only sends the
  `gateway.env.live_toggled` revenue-safe way: `06` checks wallet ledger
  balance (signed, integer) before it lets live happen.
- Refund/dead-letter ops live in 06 (money machine); console page shows the
  dead-letter queue (reads `queue_jobs(snapshot)` from 14, §3), replay
  throttled through 14's API.

### §2.11 — Settings & compliance
- Year tables drive VAT (`vat_rates` per legal year — never constants), so the
  page forces year-scoped VAt viewer-writer via security archive.
- Retention: raw analytics 90d, audit 3y, PII 90d + JSONL export behind
  consent archive (returns actual definition from `09-analytics`); BDT-only by
  default; USD pilot hidden unless flag + gate (see §5).
- This is where `merchant_id = 'platform'` scoping is obvious: everything
  labeled with its own doc number.

### §2.12 — Deep-link passthrough (no duplicated views)
- Beyond the 11 novel surfaces above, the rest of `/root` is deep links out to
  pages the product already has (backoffice screens) — the console never
  rebuilds a view that another surface owns.

## 3. Data & API — what this shell reads, writes (by areas owner)

Reads (all via area APIs, RLS, `check_entitlement` RPC where needed):

| Table | Owner (area) | Console access |
|---|---|---|
| `analytics.batches` KPIs | `09` | read (dashboard §2.2) |
| `wallet_ledger` (per merchant; securities) | `06` | read balances (gross, settled, float), never mutate via console |
| `subscriptions` / `trial_runs` | `16` (incl. dunning) | read funnel; extend = owned RPC |
| `queue_jobs` w/ DLQ | `14` | read + controlled flush (14 owns) |
| `fraud_events`, `blacklist` | `11` | review actions only |
| `ai.features` / logs | `10` | kill switches flags (4-eyes), no data edits |
| `coupons`, promo rules | `07` | read; updates via 07 with 4-eyes |
| `campaign_sink` | `05` | read + stop/cancel ops (05's) |
| `users/role` | `02` | read; revoke via 02/13 |

Writes (console never creates rows):
- `plan_definitions` drafts → signed via 16 (4-eyes)
- `gateway_env` transitions → 06 (`live` gates: 4-eyes + wallet check)
- `feature_flags.ai_kill_switch` → 10 (4-eyes)
- `audit.owner_action` — this shell's own audit rows (the only table it writes)

## 4. Named-TBD (every concrete value must trace; things without a home stay listed)

| Key | Owner (area) | Value today (advisory) |
|---|---|---|
| `plan_values` (tier map) | `16` (plan-lead) | drafts only — no live value until signed |
| `offer.percent_cap_bdt` (coupon engine cap) | `07` offer-engine | ৳ 400 / 20% — 07's call |
| `fraud.review_sla` | `11` fraud-ops | 24 h from trigger |
| `fraud.honeypot_window` | `11` fraud-ops | 7 d |
| `ai.model` / `ai.embedding_dim` | `10` ML-eng | TBD (air-gapped/local store) |
| `whatsapp_channel` (consent friendly) | `05` | disabled |
| `usd_conversion` (pilot gate) | `06` currency | OFF — BDT-only on all consoles |
| `rto` / `rpo` | `14` ops | after first drill (none claimed) |
| `trial_default_days` (dunning reads) | `16` | 5 (matches 16's trial machine) |
| `e2e_owner` | `15` QAT | TBD `@e2e_owner` — owner loop not green until set |

## 5. State machines & gates (all owned upstream)

- Pricing: `draft` → `published` only via `16` + `audit` 2-key; `archived` only
  if no live subscription references.
- Gateway env: `mock` → `sandbox` → `pre-live sign-off` (4-eyes) → `live`.
- Trial: read-only milestone view; `extend` = reason + 4-eyes → `subscription.trial.extended`.
- Kill switch: `enabled` → `disabled` (4-eyes) via `ai.kill_switch.changed`; fail-open preserves `review` behavior in 11 — never changes money at the console.
- USD pilot: hidden unless flag+gate; conversion only at 06 boundary with idempotency + integer split (never client-computed).

## 6. Events (canonical keys; English)

`pricing.plan.created / updated / published / archived / price_changed`,
`campaign.sent / scheduled`, `gateway.env.live_toggled`, `refund.dead_letter`,
`fraud.sla.breached`, `ai.kill_switch.changed`, `tenant.permission_changed`,
`export.api_key.revoked`, `consent.channel.toggled`,
`subscription.trial.extended`, `audit.owner_action`.

## 7. Failure & recovery

- Every long action is idempotency-keyed (`Idempotency` redis key pattern) —
  console re-issues are same-write; true provider-down leaves the console
  read-only but live (no stale data claims).
- Refund replay: via 06 machine (dead-letter `refund.dead_letter`), throttled,
  never reverse by hand here.
- If the console is down, merchants are **not affected** (it's owner-only).

## 8. Consent & privacy / GDPR

- Subscribe/email lists live in 05 with opt-in OFF default; any channel toggle
  here honors that and logs `consent.channel.toggled` (never flips back).
- No new PII surfaces: no owner-visible phone/email dump; escalation is 90d PII
  retention + JSONL export behind 09/05 rules.

## 9. A11y & performance

- AA base standard; confirm/refund/live-gate modals AAA; never color-only
  status. All money tabular; Bangla headers ok, event keys English.
- Performance: dashboard TTI < 2s, page budgets ≤ 18KB gz each; charts
  lazy; skeleton rows; console is admin-dense, mobile = full-width list.

## 10. Build order (docs-first)

1. Shell + nav (deep links) → 2. Hub dashboard (KPIs from read surfaces) →
3. Pricing drafts (+sign-off) → 4. Coupons/trial/gateway read+act shells →
5. Fraud/AI desks → 6. Settings/VAT/retention → 7. `owner_loop` green
   (15-e2e). No "root is real" claim before the owner loop passes.

## 11. Testing gates (map to `15-e2e`)

- `owner_loop` in `docs/15-e2e`: sign-off flow, gateway env toggles with wallet
  check, consent channel flip honors opt-out, DLQ flush, kill-switch fail-open,
  audit rows every console write; never touches real money (mock raft).
- All other suites (store/admin/builder/market/theme/fraud/ai) must remain
  green — the console must never make their E2Es flaky.

## Strict guardrails

1. **Money & orders** — consoles show only `fmtBDT` integers; never float
   client-side; no console-initiated money movements (refund/payout) — those go
   through `06` machine with idempotency.
2. **Data & tenancy** — new console tables: `audit.owner_action` only; every
   other read is the owner surface's API + RLS; `merchant_id='platform'` enforced.
3. **State transitions** — console never holds its own duplicate states; all
   4-eyes/2-key gates live in owners (`16`, `06`, `11`, `02`).
4. **Vendors** — no permanent vendor assumption; channel adapters per `05`/`06`
   (swap-out story or named TBD).
5. **Consent & privacy** — channel toggles honor 05 consent; PII minimal; raw 90d
   retention; audit 3y; GDPR opt-out everywhere.
6. **A11y & performance** — AA default, AAA on money-decision modals; page cost
   budget each; reduced-motion.
7. **Failure & recovery** — DLQ replay via 06/14; owner-only surface: being down
   affects no merchant.
8. **Testing** — no claims without `owner_loop` evidence; every section above
   maps to a named witness (naming `owner` in meetings, not chat).

*End of phase-17 planning set (00–17).*