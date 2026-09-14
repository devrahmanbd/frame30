# Event pipeline — raw → aggregate, retention, scrubbing

Status: Planning · Sub-plan of `docs/09-analytics` · Slice S6
Reference: `/plan.md` §3.5, `00-meta/README.md` §2 (no invented numbers), `00-meta/README.md` §5 (consent + retention), `docs/05-marketing` (opt-ins, ad-integrity)
Design baseline: `design-system.md` (Admin palette, chart rules)

---

## Purpose

The single path by which server-side behavior events become merchant-facing
KPIs. Guarantees three properties end-to-end:

1. **Tenant-scoped at every hop** — a beacon, a batch, a rollup, an export query
   can never cross `merchant_id` boundaries.
2. **Idempotent and gap-honest** — a re-run cannot double-count and a dropped
   batch alerts instead of silently renumbering.
3. **PII-minimal by construction** — raw identifiers live only inside the raw
   window, are pseudonymized before aggregation, and never reach dashboards.

Consent hook: behavior/trajectory collection requires GDPR-grade consent,
PII-minimal logs, and a documented retention story per `00-meta/README.md` §5 —
this file is that story for analytics.

## Pipeline overview

```
server beacons ──> Redis buffer ──> batch ETL ──> aggregate tables ──> chart API
                      │                  │              │
                      │                  └── raw store (90d)
                      └── (fixed 5-min window flush)
```

Every hop below except the very first Redis push is server-side. No client can
supply an aggregated number; the client only ever renders what the chart API
returns.

## 1. Ingest (beacon layer)

- Beacons are emitted server-side only (order placed, page viewed, product
  added-to-cart, checkout started, payment settled).
- A beacon carries: `merchant_id`, `entity` (order / page / product / cart /
  checkout / payment), `action`, `day` (ISO Date), and a `payload` that has
  already had raw PII (name, phone, address fields) removed at the emitting
  service before the fetch leaves it.
- Identities are replaced with an opaque `visitor_id` produced by the
  pseudonymization service — see §4.
- A beacon that fails schema validation is rejected at the buffer edge and
  counted; it is never fanned into the warehouse.

## 2. Redis buffer

- Beacons land in a per-tenant Redis key family.
- The buffer flushes to the ETL on a **fixed 5-minute window** — this number is
  a design constant from `09-analytics/README.md`; do not float it.
- On flush, the batch is assigned a monotonically increasing `batch_id`. The
  batch record stores `previous_batch_id` so the ledger is a time-chain.
- If a flush partially fails, the buffered set is retained and the same
  `batch_id` is retried — a partial flush never halves.

## 3. Batch ETL

- ETL is a single reader that consumes whole batches in idempotent, ordered
  buckets of `(merchant_id, entity, day)`.
- Each aggregate write is keyed on that triple, so re-processing the same triple
  is a no-op unless the source batch is newer. **Idempotency key:
  `(merchant_id, entity, day)`** — from the README machine table.
- On success the ETL emits `analytics.batch_committed` with the `batch_id`; a
  committed batch is never re-applied out of order.
- Retries: transient DB/warehouse errors retry with backoff. A threshold of
  consecutive failures triggers the gap alert.

### Gap detection

- The ledger holds `previous_batch_id`; a gap surface when a batch advertises a
  `previous_batch_id` that is not yet committed, or a listen replays an old
  batch.
- Gap alert fires to the operations channel (owner: see §9). No silent
  renumbering ever.

### Backfill (idempotent by (entity, day))

```sql
-- Re-run a single (merchant_id, entity, day) bucket harmlessly.
insert into analytics.daily (merchant_id, entity, day, totals, updated_at)
select merchant_id, entity, day, compute_rollup(...), now()
from analytics.events
where merchant_id = current_setting('app.merchant_id')::uuid
  and entity = :entity
  and day = :day
on conflict (merchant_id, entity, day) do update
  set totals = excluded.totals, updated_at = excluded.updated_at;
```

Backfill never deletes other rows and never resets the ledger; it only rewrites
the already-expired bucket.

## 4. PII scrubbing

Two-stage pseudonymization:

- **At emit** the emitting service replaces identity with `visitor_id` (random,
  tenant-scoped, no name/phone in the beacon payload). Nothing knows how to
  reverse it except the analytics scrubber, which holds a temporary mapping
  scoped to the raw window.
- **Before the aggregate step**, the mapping is dropped so the aggregate tables
  store only dimension counts (e.g. cohort week, `repeat_count`). Aggregates are
  identities never baked in.

Consequence: dashboards show no personal data and exports are pseudonymized by
default (also guaranteed by guardrail 5 and the export filters in `docs/05`).

## 5. Retention hand-off

- Raw window: 90 days, fixed. During the window a merchant can close the loop
  at `docs/13-export-sdk` export.
- After 90 days the raw rows are rolled into 3-year aggregates, then purged
  under the retention policy. Merchants cannot extend the raw window.
- The purge job is the same executor referenced as `analytics.retention.purge`
  — owner TBD, see gaps.

## 6. RLS — full policy set

All reads from the chart API and the export job go through merchant-scoped
policies. A single `current_setting('app.merchant_id')` guard is set per
request by the API layer; no dashboard query ever relies on application-layer
filtering alone.

```sql
alter table analytics.events  enable row level security;
alter table analytics.daily   enable row level security;
alter table analytics.cohorts enable row level security;
alter table analytics.export_jobs enable row level security;

create policy "merchant_reads_own_events"  on analytics.events
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_daily"   on analytics.daily
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_cohorts" on analytics.cohorts
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
create policy "merchant_reads_own_exports" on analytics.export_jobs
  for select using (merchant_id = current_setting('app.merchant_id')::uuid);
```

- The **chart API** is the only caller of these views; it sets the
  `app.merchant_id` from the bearer session via a security-barrier-definer RPC
  (`analytics.as_merchant(uid uuid)`).
- Writes to aggregations are restricted to an ETL service role; merchants have
  insert on nothing. Accepts a merchant-supplied `day` are **rejected**:
  rollups are derived only from the actual raw window.

## 7. Chart API

- Reads precomputed aggregates (never the raw store).
- Postgres materialized view refreshes near the 5-minute flush for "today".
- Never blocks first paint; requests are lazy-loaded/debounced per README
  performance guideline.

## 8. Events & failure recovery

- Events: `analytics.batch_committed` (carries `batch_id`, per ETL run),
  `report.generated` (export/rollup finished).
- The `05` consent/ad-integrity feed (channel panel) ships in S6 along with this
  pipe; `report.generated` consumers live in the export SDK (13) so dashboards
  and exports never mint their own.

## 9. Rollback / reversal

Exports already failing are retried inside the shared exporter. A bad backend
(dead BQ/write) never shows a visual number: fallback = last good aggregate with
staleness banner (see README §failure). The pipeline itself holds no rollback
because backfill is idempotent — correcting a bad batch = re-folding the triple.

## 10. Residual owners (gaps)

| Item                                                 | Owner   |
| ---------------------------------------------------- | ------- |
| Warehouse pick (timescaledb vs Snowflake-compatible) | **TBD** |
| Purge-job scheduling (`analytics.retention.purge`)   | **TBD** |
| `e2e_analytics_loop` registration in `docs/15-e2e`   | **TBD** |

All numbers in this file (`5-min`, `90d`, `3y`, `24h` export TTL) trace to the
corpus (README + `00-meta/README.md` §5); none are invented.
