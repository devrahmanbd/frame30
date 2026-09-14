# Money runtime (built)

How the money engine is actually enforced in code. Spec intent lives in
`currency.md`; this file records the runtime contract.

## 1. The type

`src/lib/money.ts` is the only door into a money amount. `Money` is
`{ currency, minor }` where `minor` is an integer count of minor units
(paisa/cent). The constructor rejects non-integers, unsafe integers and
unsupported currencies. `fromColumn` normalises `bigint` columns that PostgREST
returns as strings. No float ever reaches arithmetic, storage or the wire.

Arithmetic refuses to mix currencies (`money.currency_mismatch`). `times` only
accepts integer quantities.

## 2. Rounding policy (pinned)

Half-up on the minor unit, platform-wide: `applyBasisPoints(amount, bp)` =
`floor(amount * bp / 10000 + 0.5)`. Rates are integer basis points
(1500 = 15%), never fractions.

Proportional splits use the **largest-remainder method** (`allocate`): parts sum
to exactly the whole, remainder units go to the largest fractional parts, ties
broken by original order so the result is deterministic and reproducible from
the ledger.

## 3. VAT

`src/lib/vat.server.ts` resolves the rate through the `vat_resolve(country,
category, year)` RPC, which reads the legal-year `vat_rates` table. No rate
constant exists anywhere in the codebase.

- Cached 5 minutes per `(country, category, year)`.
- A missing legal year returns `resolved: false`, increments
  `framique_vat_total{outcome="missing_year"}` and is surfaced on the owner
  money desk — it never silently prices at 0%.
- An RPC outage throws (`vat.unavailable`) rather than pricing untaxed.

`src/lib/vat.ts` is the pure compute core: `vatExclusive` (VAT on top),
`vatInclusive` (VAT extracted so `net + vat === gross` exactly),
`splitVatAcrossLines` (per-line VAT reconciling to invoice VAT paisa for paisa)
and `refundVatComponent` (proportional VAT on partial refunds, full VAT on full
refunds, so the credit note is legally correct).

`priceCart` uses this path; per-line `vatMinor` and a `vatResolved` flag ride on
the totals.

## 4. FX / USD pilot

`src/lib/fx.server.ts` is the single conversion boundary.

- Rates are stored snapshots in `fx_rates` as integer parts-per-million.
- `convert()` throws `fx.not_piloted` unless the store's USD-pilot gate is on.
- Conversion always reads the newest stored snapshot, never a live quote at
  charge time, and the snapshot id travels with the result for audit.
- `convertWithSnapshot` is pure and unit-tested.

## 5. Ledger

Database triggers make money history immutable: `money_append_only()` blocks
`UPDATE`/`DELETE` on `wallet_ledger_entries`, `payments` and `refunds`;
`money_amount_immutable()` blocks amount edits; further triggers assert the
row's currency matches the store and that `seller + platform == gross`.

`src/lib/ledger.server.ts` owns every write:

- an idempotency key is mandatory (min 8 chars);
- a key already posted returns `{ replayed: true }` instead of a second
  movement, including when a racing insert loses on the unique index;
- corrections are compensating entries in the opposite direction
  (`postCorrection`) — never edits;
- outcomes are counted in `framique_ledger_total{source,outcome}`.

Marketplace installs post through this writer.

## 6. Observability & verification

Counters: `framique_vat_total`, `framique_fx_total`, `framique_ledger_total`;
spans `vat.resolve`, `fx.snapshot`, `ledger.post`, `money.desk`. Exposed on
`/api/public/metrics` for Prometheus, dashboarded in Grafana, errors forwarded
to Sentry via `observability.server.ts`.

- `money_conformance()` RPC reports float-typed money columns, missing
  append-only triggers, split mismatches and mixed-currency ledger rows.
- Owner console: `/root/money` renders that report plus VAT year coverage and FX
  snapshots; a non-zero breach count is a release blocker.
- `bun run test` covers the pure cores (rounding, allocation, inclusive/exclusive
  VAT, refund VAT, ppm conversion, split integrity).
