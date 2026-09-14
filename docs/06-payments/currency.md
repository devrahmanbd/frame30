# 06-payments — Multi-currency money model (BDT + USD)

Status: Planning · Slice S3/S4 · Reference: `docs/06-payments/README.md` §Purpose/Modules/Strict guardrails; `docs/07-commerce/README.md` (server-side pricing, order machine); `docs/08-pos-shipping/README.md` (dual-currency till); `docs/15-e2e/README.md` (gates); `SYSTEM.md` §Conventions
This depth spec generalises the money-representation guardrail so the corpus supports a BDT-first store with an optional USD pilot — it does not weaken the integer rule. Backwards compatible: every existing reference that wrote "integer BDT" is now an instance of the general rule `currency_code + integer minor units` (BDT ↔ paisa). Verbatim rule quote (`docs/06-payments/README.md`, Strict guardrails §1): "Money is integer BDT only; charge/refund/payout amounts are computed server-side, client only ever displays server-derived totals."

> Hard gate: money is **never a float and never currency-agnostic**. Every stored monetary column carries `amount_minor_int` (integer value in the currency's minor unit — paisa for BDT, cent for USD) **and** `currency_code` (ISO 4217 STRING). Any code or migration that stores a money amount without both is a review-stop defect.

---

## 1. Purpose

Enable a store to be denominated in USD while keeping the platform Bangladesh-first in the common case:

- **Default, locked**: a store is BDT-only (`currency` fixed `BDT`, presentation == settlement == payout currency). This is the entire v0/v1 behavior — no conversion code is on the critical path of the default store.
- **Opt-in**: a store in the USD pilot tier may set a USD store presentation currency; conversion happens at explicit boundaries (checkout quote, till display, settlement) under the named policies below.
- Everything that used to say "integer BDT" keeps its shape; the currency code is now explicit rather than assumed.

No existing engine behavior is removed; this spec adds columns, a conversion boundary, and gates. It does **not** change the pricing model of billing the merchant in BDT (plan pricing stays BDT per `docs/16-product-pricing/README.md`).

## 2. Boundary & ownership

- Owned here: money representation, currency scope, presentation-vs-order split, FX sourcing + staleness policy, checkout conversion, rounding + parity, payout isolation, cross-currency refund policy, POS dual display rule, reporting currency, admin permission gates.
- NOT owned here: the payment machine, order machine, or shipping machine (all parent README-owned); MFS/bank adapter behavior; VAT legal tables (owned `docs/06-payments`); theme display details outside the two surfaces below.
- The two admin pages described below are spelling/security surfaces; the rest is infra (no new UI beyond them).

## 3. Scope of currencies

| Code | Major name | Minor unit (stored, integer) | Scope | Owner |
|------|------------|------------------------------|-------|-------|
| `BDT` | Bangladeshi Taka | paisa (100 per ৳1) | Always on, the default | platform (default stores) |
| `USD` | US Dollar | cent (100 per $1) | opt-in store, USD-pilot tier only | currency product owner |

- Non-goal **here**: any third currency, live mid-session FX, or cross-border shipping quotes. A store not in the USD pilot remains BDT-coded to the book (see `currency-gates.md`).
- "Minor units for USD" means we store `amount_minor_int // 100` in cents and display `$` via a helper parallel to `fmtBDT`.

## 4. Money representation (canonical)

### Storage type

Throughout the corpus (`payments`, `payments_attempts`, `refunds`, `refund_attempts`, `payouts`, `wallet_ledger`, `vat_rates`, `invoices`, `cart`) money is stored as:

| Column | Type | Meaning |
|--------|------|---------|
| `amount_minor_int` | `bigint` | integer value in the minor unit of `currency_code` (paisa / cent) |
| `currency_code` | `char(3)` | ISO 4217, constrained `IN ('BDT','USD')` for this spec; any further code requires a plan amendment |

- `currency_code` is added **everywhere** `amount_minor` already exists; a single monetary row (or the two sides of a ledger entry) must never mix currencies.
- No `float`/`numeric(k, n)` with scale; no `money` type; integer only. Rounding is a deterministic function of integers, never a DB decimal-round.
- Display: `fmtBDT` stays for BDT; add `fmtMoney(amountMinMinor, currencyCode)` for USD + dual-column UX. Both are pure functions; neither accepts a float, ever.

## 5. Formatting conventions (kept stable)

- Storefront price chip renders the store presentation symbol (`৳`/`$`) with tabular numerals; product prices 0 decimals for BDT, 2 for USD; tax/payout lines 2 decimals — per `00-meta/design-system.md` typography rules.
- Conversion display is always `original (≈converted)` — a customer never sees a single converted-only number; see §8.

---

## 6. Presentation currency vs order currency

Two distinct attributes, never collapsed:

| Term | Where | Meaning |
|------|-------|---------|
| Store presentation currency | `store_currency_settings` | What the storefront/admin prices in (BDT default; USD pilot) |
| Store currency (settlement) | goods/basket currency at order creation | What the order is priced AND settled in; fixed at creation, immutable |

### `store_currency_settings` (tenant)

| Column | Meaning |
|--------|---------|
| `merchant_id` | RLS owner (parity with every tenant table) |
| `presentation_code` | `BDT` (default) or `USD` (pilot only) |
| `settlement_code` | always `BDT` in pilot v1 (§10 reserve); mutability = **named TBD-3** |
| `fx_policy` | FK → `fx_policies` (see §7) |
| `updated_by` / `updated_at` | admin audit trail |

- Switching to USD is limited to the **USD-pilot gate** in `currency-gates.md`; reverting to BDT is an explicit `store_currency_settings` action with history (never a silent delete).

### Order-currency lifecycle (ownership: order service; surface states shown verbatim from `07-commerce` order machine)

```
cart (currency proposed) → checkout (currency frozen at creation) → paid → delivered
                        ↘ cancelled (currency never mattered)
```

The order's currency is **set in stone at order creation**; payment, refund, and payout use that same code throughout. `cart.currency` is a proposal; only `orders.currency` binds money flow.

---

## 7. FX rate sourcing

Single daily legal rate per business day; conservative tiers:

| Item | Realisation | Policy |
|------|------------|--------|
| Base rate | One regulator-published daily rate; never a live mid-session call | from `fx_rates` pipeline once per day |
| Buy/sell split | Customer conversion uses `sell`, payout uses `buy`; both derived from the same daily base | one row per `(pair, side, rate_date)` |

### `fx_rates` (audited feed table)

| Column | Meaning |
|--------|---------|
| `rate_date` | business date; one row per `(pair, side)` |
| `pair` | canonical order, e.g. `BDT→USD` and `USD→BDT` |
| `side` | `sell` (for checkout conversion) / `buy` (for settlement conversion) |
| `base_rate_scaled` | integer-scaled base rate (e.g. scaled ×1,000,000 so the row stays integer); numeric trace |
| `source` | provider/feed reference, or `manual` with `linked_reg...` |
| `verified_at` / `verified_by` | lane of ops audit |
| `supersedes` | old row ref when correcting; append-only, no `UPDATE` of published rates |

A rate is referenced by **snapshot id**, never re-read at pay time.

### fx-policy lifecycle (verbatim, owned by `fx_policies`)

```
bdt_locked (default) → pilot_assessing → usd_enabled → evaluate_period → revert_to_bdt | continue_usd
each transition writes an `fx_policy_history` row; revert requires a `currency_gate` re-pass
```

### Staleness rule (named)

Rates are considered stale and conversion **fails closed** (refused checkout with "price under review", not a silent fallback) after a fixed age — **named TBD-1, owner: treasury**. Until an explicit window is set, the reference behaves as if the window is one day (the daily pipeline pushing "today only" rates).

---

## 8. Checkout conversion (the one conversion boundary)

- The **only** place conversion happens in a payment flow is the checkout "converted quote" boundary. The storefront shows original (store presentation currency) and the quoted-store-currency equivalent at confirm.
- Server computes (Go, integer-only — per `docs/06` guardrail 1):

```
converted_minor = round_half_up(original_minor_int × base_rate_scaled) ÷ divisor   (see §9)
rate_snapshot   = fx_rates row id used (rate_date, pair, side)
```

- Result stored on the order: `order.currency` + `order.amount_minor_int` (settled), plus `order.presented_amount_minor_int` + `order.presentation_currency` + `order.fx_rate_id` at creation. Idempotent: retrying the same `order_id+attempt` re-asserts the same snapshot (per `README` §Strict guardrails 2 idempotency) rather than reconverting.
- Client **never** sends a rate or a computed conversion; it round-trips snapshot ids only.

## 9. Rounding: round-half-up + parity

- All conversions round **half up** at the target minor unit. Parity checks (exact integer equality) run on every conversion, per `settlement-reconciliation.md` philosophy — a 1-paisa mismatch is a variance, never a silent decision:
  1. `converted_total == Σ converted_lines`, exactly.
  2. `subtotal + tax + shipping == total` in the settled currency, exactly.
- When the last-paisa/cent rounding makes sums differ by 1, code writes an explicit `rounding_adjustment` ledger row, ALWAYS carrying `currency_code` — never a silent diff.
- Refund proportional-rounding uses the same function and the same parity post.

## 10. Payout isolation (BDT-only for BDT stores)

- BDT stores settle in BDT via existing `payouts` (mock-MFS) — unchanged.
- Currency stores settle **only after a converted quote** at the settlement boundary via `fx_rates` snapshot; the ledger row stores `amount_minor_int` + `currency_code` + `fx_rate_id` (never dual-value).
- A future USD export-wallet is **isolated** from BDT custody: separate ledger namespace, separate `currency_code` rows, same RLS; BDT failures can never resolve USD and vice versa.

## 11. Cross-currency refunds (money back in orig currency)

- A refund returns in the **order currency** (the currency the money was taken in); the ledger records refunds in `amount_minor_int` + `orders.currency` by construction.
- UI states "refunded in order currency; store displays its presentation equivalent" with the same snapshot id — no "USD refunded as BDT" blind conversion on a customer's screen.
- Mismatch handling (immutable-currency drift, provider rails differ): policy is **named TBD-4, owner: treasury**; default is block + alert `refund.currency_mismatch`, never a write.

## 12. POS dual display

- The till shows, per `docs/08` settings: primary = store presentation currency (`BDT` default) plus a **live-converted equivalent** from the latest `fx` snapshot — server-computed, never client-typed. Example label: `৳ 1,250 · ≈ $85` is illustrative only; the real conversions come only from snapshot rows generated by the §7 pipeline.
- Offline POS falls back to the last confirmed daily snapshot and re-syncs on reconnect (per `docs/08-pos-shipping` §offline-first).

## 13. Analytics & reporting

- All BI/analytics totals render in the **store presentation currency** consistently. A report never merges two currencies in one metric: every metric carries `currency_code`, and a conversion disclaimer line is shown on any cross-currency aggregate.
- VAT/invoices follow the order currency (a tax line and its base charge share the order currency, conversion annotated separately), per Invoices/VAT module.

## 14. Permissions (admin)

| Action | Requires | Gate |
|--------|----------|------|
| Set store presentation to USD | owner | USD-pilot tier gate (`currency-gates.md`) |
| Set store Currency revert to BDT | owner | always allowed; history row |
| View fx_rates blotter | owner (read) | read-only, FX audit page |
| Set/treat daily rate (manual entry) | ops role + owner | writes `verified_by`, emission row |
| Update settlement currency / mismatch policy | platform legal + treasury | amendment doc, never silent |

No role may decide an amount-side FX value at execution time; rate changes land via §7 feed or a signed manual row.

---

## 15. AGENTS.md rule-1 amendment (executed 2026-08-09 — user sign-off)

> **record**: The amendment below was taken by the user on 2026-08-09 and is now live in `AGENTS.md` §2 and `SYSTEM.md` §1/§5. This section is the retained record of the change.

Superseded rule (verbatim, what `AGENTS.md` §2 held before execution): `**BDT only** — money as integer taka (৳); fmtBDT for display; never floats.`

Amended rule now in force (`AGENTS.md` §2, verbatim):

> `**BDT default, integer minor units, optional USD pilot** — money is stored as `currency_code` (ISO 4217 STRING) + `amount_minor_int` (integer minor units; BDT↔paisa, USD↔cent); floats are never stored, transmitted, or computed for money amounts. BDT is the exclusive currency of every non-pilot store. Currency conversion (USD) is restricted to the USD-pilot gate and happens only at the documented conversion boundary, server-side, idempotently, always off a stored `fx_rate` snapshot — never client-computed and never in a mixed ledger row.`

- Effect on corpus: every money column already written as "integer BDT" becomes `amount_minor_int` + `currency_code`, BDT default; no numeric losses.
- `SYSTEM.md` (BDT as market scope) is extended by an explicit pointer to this spec so a reader doesn't read "only USD" as "never a code column".

---

## 16. Cross-currency guarantees (engine-level, per `docs/00-meta` guardrails)

- **RLS + merchant_id**: every table in §6/§7/§8/§10/§11 rows is tenant-scoped; `fx_rates` are a global feed but all queries pass `merchant_id`/`WHERE tenant`, a merchant never sees another merchant's money/snapshot rows.
- **No floats anywhere** (measured): each gate asserts no float column in money tables (§16/`currency-gates.md` conformance).
- **Consent when geo-currency is surfaced**: if a storefront ever shows "(≈ in your currency)" based on geo — a future feature, not v0 — it runs under `docs/03` consent; never persisted PII, and the geography only approximates to feed a display estimate.
- **PII-minimal logs**: FX and conversion logs contain `order_id`, `fx_rate_id`, `pair`; never customer data or account identifiers. Logs never include real MFS credentials.

---

## 17. Design decisions

1. `currency_code + amount_minor_int` in one column pair (over "per-currency money columns") — one code path, no float points, parity possible; cost: ALL money queries must filter/group by `currency_code`.
2. Presentation currency separate field; never fused with settlement currency (checkout stores both, one quote).
3. Conversion only at the checkout/pay-out boundary, idempotently snapshot'd — never inline / mid-cart on client.
4. Round half up + zero-silent-rounding; a rounding diff is a visible ledger row.
5. Payout isolation BDT/USD; no mixed rows.
6. Refund in order currency (money is symmetric); mismatch = block + alert, never auto-convert.
7. Daily single legal rate, snapshot refs, stale → fail closed.

These sit behind the engine core (parent README-owned) and are evolving the two surfaces below.

---

## 18. Design guidelines — Store currency settings (admin, one of the two surfaces)

- Intent: owner picks presentation currency, understand consequences, in an explainable, reversible, low-urgency decision; switching never hides legal/entitlement impact.
- Palette: `--bd-teal` for the active currency + the (pilot) enable action; Bondhu Amber for the "conversion will apply" band when `presentation ≠ settlement`; Rickshaw Red only for errors/unfollowed combos (never a success color); no color-only state.
- Typography: tabular numerals for all money/labels, `Taka · BDT` / `US Dollar · USD`; Bangla labels primary, English codes secondary muted.
- Density: form-row calm (not admin-dense; this is a decision form), one full-width explanation card.
- Motion: panel in opacity/transform only; `prefers-reduced-motion` → opacity only.
- A11y: AA radios, explicit submit, result in a live-region, keyboard-complete; the "enable pilot" button is gated (disabled state has a mechanism label).
- Performance: static admin page; no heavy queries.
- Anti-slop: distinctive — the two settings cards (BDT default / USD pilot) with a real snapshot rate chip ("rate BDT→USD 1.0 = x.y (daily)"), not a generic dropdown; the USD option shows a *pilot-chip* (pending gate) so it can't be confused with an open global switch.

## 19. Design guidelines — FX rates audit (admin, second surface)

- Intent: an authorized view of the FX feed and the conversions it served: rate_date, pair, sell/buy, source, verified_by, and per-order snapshot usage; like a till/a rate ledger, not a chart.
- Palette: mint for `verified`/sourced; amber for stale/pending; Rickshaw Red only if a *stale* snapshot was used on a live amount (must not happen); no color-only states.
- Typography: tabular numerals, monospaced rate cells, pair codes (`BDT->USD`) — reviewing rates is reading accuracy.
- Density: ledger-dense (not checkout); paginated by `rate_date`+pair; row ID sticky.
- Motion: minimal in/out; reduced-motion → opacity only.
- A11y: proper table headers, `aria-label` per row; legends for stale.
- Performance: static ledger page; caches do not delay the audit truth.

---

## 20. Events (additive)

- `fx.rate_loaded`, `fx.rate_stale`, `order.currency_quote_confirmed`, `refund.currency_mismatch` — new event names; all ids scoped, no customer PII.

## 21. Testing gates

Full conformance matrix lives in `docs/06-payments/currency-gates.md` (companion) with headers such as `api_currency_convert_rounding`, `ledger_no_mix_currencies`, `e2e_payin_usd_payout_bdt`; the default BDT store continues to run the existing `.e2e/store_loop` unchanged, asserting no accidental currency-conversion path.

---

## 22. Residual gaps — named TBDs

| # | Lead | Owner | Scope of decision |
|---|------|-------|-------------------|
| TBD-1 | FX staleness window (rate age) | treasury | sets the fail-closed age; default assumed 1 day |
| TBD-2 | sell/buy spread (adjuster between sell and buy) | treasury | the one proportional handling, in the docs (fee) |
| TBD-3 | `settlement_code` setting in the pilot (immutability in prod) | currency owner | do/do-not allow mid-pilot flip |
| TBD-4 | Refund currency-mismatch policy detail | treasury + ops | how wide a drift tolerated before block+alert |
| TBD-5 | USD export wallet scope + BDT↔USD row isolation governance | treasury | money-out for USD pilot |

All `TBD-*` are owner-named and not merged; nothing above implements until each is resolved (per `docs/00-meta/README.md` named-TBD protocol).

> Companion: `docs/06-payments/currency-gates.md` — rollout/lockdown matrix, USD pilot tier gate, conformance headers, rollback.