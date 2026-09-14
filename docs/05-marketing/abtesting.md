# 05 — Marketing: A/B testing & experiments

Status: Planning · Approved plan (parent: `05-marketing/README.md`) · Slice S6
Owners: Marketing Platform + Data (experiment service)
References: `05-marketing/README.md` (campaigns, coupons, data model, guardrails) · `05-marketing/content-cms.md` (editor surfaces, error-code table) · `03-storefront/README.md` (rendered page slots) · `09-analytics/event-pipeline.md` (behavior events) · `16-product-pricing/README.md` (plan entitlements) · `00-meta/design-system.md` §1, §2, §3, §10 · `06-payments/currency.md` (BDT money only, never floats)
Design decision (approved): **an experiment is a pre-registered, server-resolved variant assignment** (`experiments`, extended below) with an explicit lifecycle (`draft → running → evaluating → concluded | stopped`) and a fixed sample plan written before traffic starts; **the server, never the client, chooses the variant** for a visitor; **no decision about money, stock, or fraud ever rides on an experiment** — those stay in `07-commerce` and the server.

---

## 1. Purpose

Merchants want to know which headline, hero image, coupon format, or product-page layout converts better — without gambling storefront correctness on a statistically sloppy test. The platform already ships `campaigns`, `articles`, `traffic_sessions` and the event pipeline (`09-analytics`); this plan turns those into a guarded experiment surface with per-surface inventory and guardrails.

Scope:

- A/B (and multi-variant) experiments over storefront surfaces (hero, product page sections, nav) and marketing assets (campaign email variants, coupon presentation, article headlines).
- Pre-registered sample plans: target sample size, minimum detectable effect, variant weights — locked at start, visible to the merchant.
- Server-side variant assignment with a stable assignment key per visitor; holdout groups; sequential stop rules.
- An experiment dashboard (running/stopped states, results with confidence intervals) that never claims significance without the pre-registered threshold.
- Entitlement-gated experiment counts via `check_entitlement(tenant_id, 'experiments', n)` reads from `16-product-pricing`.

It never changes the storefront render path (`04-builder/theme-runtime.md` TR-2): experiments resolve inside the existing widget/presentational slots and fall back to the default variant on any error.

## 2. Experiment model & lifecycle

```
experiment {
  id (uuid, tenant-scoped, RLS),
  name, slug (unique per tenant),
  surface: storefront | campaign | article,
  target (slot id / campaign id / article id — one per experiment),
  variants[] { key, weight, is_control, content_ref },
  sample_plan { target_sample_size, min_det_effect, power, alpha, stopped_at_size },
  state: draft | running | evaluating | concluded | stopped,
  decided_at, concluded_at, winner (variant key, nullable),
  created_by (staff id), revisions (jsonb[] of snapshots)
}
```

- **Lifecycle**: `draft → running` (requires valid sample_plan + ≥2 weighted variants, one marked control); `running → evaluating` (sample size reached — automatic, per §6); `evaluating → concluded` (statistically significant vs pre-registered threshold) / `evaluating → stopped` (max duration or merchant stop) / `running → stopped` (merchant stop — partial data discarded for decision, kept for audit). `concluded` is terminal; reopening forks a **new** experiment (never mutates a concluded one).
- **Pre-registration is a promise**: the sample plan is frozen when the experiment starts; changing `min_det_effect`, weights, or target size mid-run is refused server-side (`experiment_plan_locked`) — mirrors content-cms §2's scheduled-is-a-promise.
- **No destructive delete**: deleting a running or concluded experiment fails server-side with `experiment_has_lifecycle_state`; stop is the only exit. Hard-delete exists only platform-side.
- **Events** (05 set): `experiment.created`, `experiment.started`, `experiment.sample_complete`, `experiment.concluded`, `experiment.stopped`, `experiment.variant_assigned`. Assignment events carry variant key + assignment key, never raw visitor PII.

## 3. Assignment (server-resolved, stable)

- **The server chooses the variant** — a PostgREST/RPC call `resolve_experiment(tenant_id, experiment_id, visitor_key)` at render time; the client never picks or pre-computes the variant. This is a hard guardrail (AGENTS.md: no client-trusted decisions).
- Stable assignment: deterministic hash of `(experiment_id, visitor_key)` → variant bucket, so the same visitor sees the same variant across pages and sessions while the experiment runs (unless the visitor is in the holdout — see §5).
- `visitor_key` = signed-in customer id or consent-anonymized `traffic_session` fingerprint (`09-analytics/event-pipeline.md`); never an email/phone. Anonymous visitors get a per-session assignment key stored in the session row — GDPR-safe (no cross-session join without consent).
- **Error fallback**: on any assignment failure (RPC down, tenant limit, unknown experiment) render the control/default variant and log `experiment.assignment_fallback` — never a 500 on the storefront, never a partial variant.
- **No money/stock/fraud coupling**: an experiment may vary presentation only. Price, discount totals, coupon redemption, stock, and fraud decisions are resolved by `07-commerce`/server regardless of variant; variant rendering of a price must reuse the exact same `amount_minor_int` value (`06-payments/currency.md` — integer BDT, never floats, no per-variant rounding).

## 4. Surfaces & variant content

- **Storefront slots** (with `04-builder`): hero copy/CTA, product-page section order, nav labels, listing grid density. The variant is a `content_ref` to a builder widget/section config — the theme render path is unchanged.
- **Campaign variants** (05 README `campaigns`): subject line, preheader, body block order, CTA button copy. Sent from the campaign pipeline; assignment keyed per recipient with consent on record.
- **Article headline tests** (content-cms): variant = alternative `title`/`seo` pair on a published article; one variant wins → the winner is written as the canonical title + a 301-safe rename (content-cms §6 slug rules apply).
- Constraint: variant content must pass the same validation as production content (media must exist, Bangla-first copy, no invented tokens); a variant that fails validation is refused at start (`variant_invalid`), never partially rendered.

## 5. Holdout & audiences

- **Holdout group**: sample_plan may reserve a holdout % who see the control without being counted in variant groups — used to measure the global lift of shipping the winner. Holdout assignment is part of the same deterministic bucket; holdout rows are never targeted by campaign sends.
- **Audience filter** (optional): run experiments on a segment (e.g., `customer_segment` from `09-analytics`) — the filter is frozen at start like the sample plan.
- **Consent**: personalization experiments on signed-in customers require the channel consent on record (`03-storefront/accounts.md` consent hub); experiments over anonymous traffic sessions use the session fingerprint only and never join to PII without explicit opt-in. GDPR-grade, opt-out honored everywhere (05 guardrail `### 5`).

## 6. Results & decision rules

- **Evaluation is automatic**: when `target_sample_size` is reached, the experiment moves to `evaluating` and the result pipeline computes per-variant conversion rate + CI (Wilson interval) against the pre-registered `min_det_effect`/`alpha`.
- **Significance is thresholded**: `concluded` requires both (a) sample size met and (b) difference ≥ `min_det_effect` at `alpha`; otherwise the run is `stopped` at max duration with "no conclusion" — the dashboard never shows a green "winner" for a non-significant run.
- **Guardrails**: no peeking — partial-progress numbers are labeled "in progress, not a decision"; no multiple-comparison shopping (one winner per experiment, chosen by the single pre-registered metric); metric = conversion to a pre-registered goal event (`09-analytics`), never an after-the-fact-chosen metric.
- **Currency metric**: if the goal is revenue, conversion is computed on `amount_minor_int` sums from `06-payments`/`07-commerce` rows — integer BDT only, display via `fmtBDT`.

## 7. Plan entitlements + usage meter

- Experiment counts are **not** owned here — read from `16-product-pricing` via `check_entitlement(tenant_id, 'experiments', n)`.
- Writer-side countdown: plan-progress line shows "X of Y used" — **text, not color**; counts running + evaluating (concluded/stopped don't count).
- Over-limit: block start with `plan_limit_exceeded` + inline `Upgrade` link; never silent truncation (mirror content-cms §7-2).

## 8. Safety & audit

- **Stop is reversible-free**: once stopped, an experiment never re-runs with the same id; results stay audit-visible (append-only `experiment_revisions`).
- **Merchant override**: the merchant can always force a winner (promote variant B) — recorded as `winner: manual` with `by` + reason; the manual winner is labeled "manual decision" in the dashboard, never conflated with a statistical winner.
- **RBAC**: only staff with `experiments:manage` (staff-rbac) can start/stop/conclude; assignment RPC is read-only for everyone.
- Abuse: a client cannot forge `resolve_experiment` — the RPC enforces tenant + experiment state; assignment events carry `by`/`surface` only where relevant.

## 9. Design guidelines — experiment dashboard & variant picker

- **Intent**: calm, analytical, Bangla-natural — results read like a ledger, not a casino; the merchant always knows whether a number is a decision or a look.
- **Key surfaces**: experiment list (rows), experiment detail (pre-registered plan card + live progress + result table), variant picker (from builder widget/section refs or campaign templates), promote-winner flow.
- **Palette**: teal = primary/CTA; mint = concluded-with-winner; amber = running/evaluating; muted = stopped/no-conclusion; Rickshaw Red only for failed validation/errors; never color-only — every status shows a text label first (design-system §3).
- **Typography**: tabular numerals for every count/percentage/BDT figure; BN display for experiment names.
- **Density**: admin-dense tables; progress bars slim; results table with confidence-interval columns.
- **Motion**: status chip 120ms hover; result table number transitions 200ms; promote-winner success = 200ms fade + role status; reduced-motion safe (design-system §5).
- **A11y**: result table has a data-table fallback in HTML (aria); variant diff view keyboard-navigable; focus order across dashboard; contrast AA.
- **Performance**: dashboard charts lazy-load; assignment RPC is cached per (experiment, visitor_key) for the session; results table code-split.
- **Anti-slop**: distinctive — the plan card shows the Bangla pre-registration statement ("আগে ঠিক করা: N ভিজিটর, M প্রভাব"); "no conclusion yet" renders as a plain Bangla line, never a fake confidence number; never Lorem in variant previews.

## 10. Persistence & lifecycle copy

| State       | Copy (Bangla-first)                | Note               |
| ----------- | ---------------------------------- | ------------------ |
| draft       | "খসড়া" (Draft)                    | slate dot          |
| running     | "চলমান" (Running)                  | amber dot          |
| evaluating  | "মূল্যায়ন চলছে" (Evaluating)      | amber dot          |
| concluded   | "সমাপ্ত — বিজয়ী" (Winner)         | mint dot           |
| stopped     | "বন্ধ" (Stopped)                   | muted dot          |
| manual win  | "ম্যানুয়াল সিদ্ধান্ত"             | teal dot           |

## 11. Testing gates

- `store_loop` adds: experiment start with valid plan → assignment returns same variant for same visitor key across pages; holdout visitor always control; assignment RPC down → control fallback, no 500; concluded experiment → winner variant rendered.
- `admin_loop` covers: start/stop/conclude transitions; plan-locked refusal mid-run; over-limit block; manual winner recorded; non-significant run → "no conclusion" surface.
- Failure suite: RPC failure → fallback log + control render; experiment deleted mid-run → refused; sample-plan mutation → `experiment_plan_locked`; variant content invalid → `variant_invalid` at start.

## 12. Residual v0 gaps

- Multi-armed bandits / auto-traffic-allocation are out of scope (fixed-weight A/B/n only).
- Storefront theme-level A/B (different themes at once) is out of scope — see `04-builder/theme-runtime.md` preview sandbox instead.
- Statistical details (sequential testing adjustments beyond the fixed plan) deferred; the fixed plan + Wilson CI is the v0 contract.
