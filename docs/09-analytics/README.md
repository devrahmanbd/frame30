# 09 — Analytics

Status: Planning · Slice S6 · Reference: `/plan.md` §3.5 (marketing analytics), merchant dashboards infra `01-architecture`
Design baseline: `design-system.md` (charts per Admin palette)

---

## Purpose

Merchant-facing analytics: live sales/orders, funnel, channel/source (bot-filtered), product & collection performance, retention, cohorts, export (CSV) — with BigQuery/SQL aggregation at scale, not per-request scans.

## Pages

- **Dashboard KPIs**: today/7d/30d revenue (BDT tabular), orders, AOV, conversion, top SKUs; each with sparkline.
- **Funnel**: visitors → PDP → cart → checkout → paid (MFS/COD split).
- **Channel/source**: referrer, campaign, ad source (from 05 ad-integrity live segment).
- **Retains**: cohort (week), repeat-purchase rate.
- **Product & collection performance**, **inventory aging**.
- **Search analytics**: what Bangla keywords convert.
- **Export**: CSV/JSON per range.

Depth spec: `event-pipeline.md` (raw → aggregate, retention hand-off, RLS).

## Data model

Server-side event beacons land in a raw store, then a batch ETL folds them into
aggregate tables served by the chart API. All reads are tenant-scoped.

| Table (raw store)   | Notes                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `analytics.events`  | server-side beacons; `merchant_id`, `entity`, `day`, time-chained `batch_id`, pseudonymized `payload`; 90d raw window |
| `analytics.batches` | batch ledger — each batch references the previous `batch_id` (gaps alert, never silently skip)                        |

| Table (aggregate)       | Notes                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| `analytics.daily`       | per-`(merchant_id, entity, day)` rollups; 3y retention                   |
| `analytics.funnel_*`    | stage counts from replayed events (drill-down matches the tile above it) |
| `analytics.cohorts_*`   | weekly cohort + repeat-purchase rollups                                  |
| `analytics.export_jobs` | async export runs via the shared exporter (24h TTL)                      |

RLS is enforced on **every** tenant query:

```sql
create policy "merchant_reads_own_events"
  on analytics.events for select
  using (merchant_id = current_setting('app.merchant_id')::uuid);

create policy "merchant_reads_own_rollups"
  on analytics.daily for select
  using (merchant_id = current_setting('app.merchant_id')::uuid);
```

No service role reads reach a dashboard without passing the merchant-scoped
view. See `event-pipeline.md` §RLS for the full policy set + RPC guard.

## API / ingest surface

- **Ingest**: server-side beacons only (never client-minted numbers) → Redis
  buffer → batch ETL on a fixed 5-minute window.
- **Chart API**: reads precomputed aggregates; no per-request scan of the raw
  store. Today's orders ride a near-real-time materialized view.
- **Export**: every dashboard control calls the shared async exporter
  (`docs/13-export-sdk`), pseudonymized and consent-filtered per `docs/05` —
  no surface ships its own CSV builder.

## State machine (batch ETL)

One machine, owned here — `buffering → running → committed | retrying | gap_detected → backfilled → committed`.

- `buffering`: beacons accumulate in Redis up to the 5-minute window.
- `running`: ETL folds the batch into the aggregate tables.
- `committed`: batch recorded in the ledger with the previous `batch_id`
  reference.
- `retrying`: a failed run retries; a run that keeps failing raises the gap
  alert.
- `gap_detected`: the time-chain is broken; historical backfill re-runs
  idempotently by `(entity, day)` until the chain rejoins, then commits.

A committed batch is never re-applied out of order; backfill is idempotent by
`(entity, day)` so a re-run cannot double-count.

## Events

| Event                       | When                                     |
| --------------------------- | ---------------------------------------- |
| `analytics.batch_committed` | a batch run commits (carries `batch_id`) |
| `report.generated`          | an export/rollup report finishes         |

## Failure/recovery

- Batch ETL retries; gap detection alert; historical backfill idempotent by
  (entity, day).
- Privacy: personal data pseudonymized; retention policy 90d raw → 3y
  aggregate.
- Pipeline down → dashboards fall back to the last good cached aggregate with a
  staleness banner; ingestion lag older than 90 days shows "not available"
  instead of a wrong number; a chart that fails to load renders the data-table
  fallback, never an empty state that reads as zero.

---

### Design guidelines — dashboards, charts, funnel, search insights

- Intent: data as calm, actionable truth — every number has a Bangla label, every chart answers "and so what?"
- Key surfaces: KPI cards, chart area (line/bar/cohort heatmap), funnel sliders, table with sparkline, export controls.
- Palette: teal line(s); amber for promo; red for declining/refund; charts same palette across surfaces; no rainbow.
- Typography: tabular numerals bold on KPI; axis labels small but ≥11px readable; Bangla titles.
- Density: dense but airy between charts; tables compact; funnel horizontal.
- Motion: KPI count-up 200ms (reduced→instant); chart line draw 800ms eased.
- A11y: charts have data-table fallback, aria-label titles, keyboard zoom, colorblind patterns dotted.
- Performance: precompute aggregates; charts canvas/SVG lazy-list; debounced time-range filter.
- Anti-slop: distinctive — "Financial indicators" wording; search analytics shows real Bangla query pills; funnel base shows _next best action_ CTA ("Enable abandoned cart recovery")

---

### Strict guardrails — analytics

1. **Money & accuracy** — every money total shown in analytics is integer BDT recomputed server-side from the same base tables as the storefront (orders, payments, shipments); KPI definitions live in one source-of-truth module, reused by dashboards and exports; the client never mints its own totals; money renders via `fmtBDT` with tabular numerals.

2. **Data & tenancy** — every analytics read is tenant-scoped by `merchant_id` with RLS; raw events buffer and flush to the warehouse on a fixed 5-minute ETL; events are time-chained (each batch references the previous batch id, so gaps alert instead of silently skipping); raw analytics retained 90 days, then aggregated into 3-year rollups, then purged under the retention policy — merchants cannot extend the raw window.

3. **State transitions** — KPIs are always derived from source tables (orders, payments, shipments, events), never cast from client-provided numbers; a KPI that disagrees with its source table is treated as a bug, not a rounding choice; funnels and cohorts re-play the same time-chained events, so drill-down always matches the tile above it.

4. **Vendors & data-export** — Exports go through the shared async export path (see docs/13-export-sdk) with a 24-hour job TTL; default export is pseudonymized and consent-filtered per docs/05; every export control on a dashboard calls the shared exporter — no surface ships its own CSV builder.

5. **Consent & privacy** — PII is never accumulated in analytics beyond the raw window; dashboards show no personal data — identities are pseudonymized before aggregation; opt-outs in docs/05 are honored in search-insights and abandoned-cart funnels.

6. **Accessibility & performance** — Charts keep the data-table fallback from the design guidelines above; axis labels stay ≥11px; KPI count-up is instant under `prefers-reduced-motion`; all aggregates are precomputed server-side and chart payloads lazy-list — never block first paint on a full-history render.

7. **Failure & recovery** — Analytics pipeline down → dashboards fall back to the last good cached aggregate with a staleness banner; ingestion lag older than 90 days shows "not available" instead of a wrong number; a chart that fails to load renders the data-table fallback, never an empty state that reads as zero.

8. **Testing gates** — `store_loop` asserts KPI freshness (a new order moves the revenue tile in one ETL cycle), funnel numbers disagree-with-source fails the build, an export job output is PII-filtered, and fallback states render under pipeline-down simulation; `market_loop`, `admin_loop` re-run the same assertions. New checks register under `e2e_analytics_loop` (see docs/15-e2e) — **owner: TBD**.

---

### Audit verdict — checklist

Mapping against `docs/00-meta/audit-verdict.md`: analytics/AI are not summary-table
rows; the corpus cites `docs/09-analytics` only via `00-meta/README.md` §5
(consent + retention for behavior collection). Claims below were verified against
the planning tree, not memory.

- [x] Raw window 90d → aggregate 3y → purge: verbatim retention policy, no invented window.
- [x] Batch window 5min, time-chained batches, idempotent backfill by (entity, day): verbatim pipeline.
- [x] `analytics.batch_committed`, `report.generated` events: verbatim.
- [x] Every number in this README traces to a phase plan or is a named `TBD` (owners below).
- [x] One state machine (batch ETL) owned by this phase README — no parallel copies elsewhere.
- [x] E2E mapping back to `docs/15-e2e` suites (`store_loop`, `market_loop`, `admin_loop`).

### Residual v0 gaps

- **Warehouse pick**: `timescaledb` vs Snowflake-compatible warehouse — design
  intentional, live engine swap-out story per meta §4 — **owner: TBD**.
- **`e2e_analytics_loop` registration**: check suite name approved + registered
  in `docs/15-e2e` before release — **owner: TBD**.
- **Retention purge job**: raw-window purge executor is policy-defined but the
  scheduling owner is unassigned — **owner: TBD**.
