# Load, capacity and the operations record (Phase 14)

This is the load run of record and the capacity note that goes with it. It is
written from `npm run load:suite`, not from memory.

## How to run it

```bash
# one tenant, catalogue and order scale
npm run load:suite -- --base https://shop.example.com --slug frame19-demo \
  --concurrency 25 --duration 60 --out /tmp/load-single.json

# fifty tenants at once on the self-hosted stack
npm run load:suite -- --base https://shop.example.com --slug loadstore \
  --tenants 50 --concurrency 100 --duration 120 --out /tmp/load-fleet.json
```

The suite drives seven scenarios (home, collection, search, product, sitemap,
cart, order tracking), applies a per-scenario p95 budget, prints a markdown
table and exits non-zero when any scenario misses its budget, so a release can
be gated on it.

## Seed scale the run assumes

| Fixture | Target |
| --- | --- |
| Products in one tenant | 2,000 SKUs (≈4,000 variants) |
| Orders in one tenant | 50,000 across 12 months |
| Tenants active at once | 50 stores on one node |

## Budgets

| Scenario | Budget p95 | Why |
| --- | ---: | --- |
| storefront_home | 800 ms | first paint of the shop |
| collection_list | 900 ms | paginated catalogue read |
| search | 900 ms | trigram search over 2,000 SKUs |
| product_detail | 800 ms | the page that converts |
| sitemap | 2,500 ms | generated, cached, crawler-facing |
| cart | 800 ms | session read plus stock check |
| order_track | 1,200 ms | order lookup at 50k rows |

## Run record

Paste the table printed by the suite here after every run, newest first.

| Date (UTC) | Build | Profile | Result | Notes |
| --- | --- | --- | --- | --- |
| _pending_ | — | single tenant, 25 workers | not yet run on a real host | needs the self-hosted node from Phase 10 |
| _pending_ | — | 50 tenants, 100 workers | not yet run on a real host | needs the self-hosted node from Phase 10 |

A row is only allowed here when it came from the script; estimates do not go in
this table.

## Capacity note — what one node handles

A single 8 vCPU / 32 GB node running the compose stack (app, Supabase,
Prometheus, Loki, Grafana, Alertmanager, GlitchTip) is sized for:

- ~50 active stores with catalogues in the low thousands of SKUs,
- ~150 storefront requests/second steady, bursting to ~400 with the CDN in
  front of images and static assets,
- ~30 GB of metrics at 30-day retention and ~20 GB of logs at 14 days,
- a database working set that still fits in RAM (roughly 10 GB of hot data).

**The first thing to split out** is Postgres: it is the only component whose
saturation degrades everything at once, and it is the component that cannot be
scaled by adding a second copy behind a load balancer. Order of splitting as
load grows:

1. Postgres onto its own node (and only then read replicas for reporting).
2. Loki + Prometheus onto an observability node — they compete with the
   database for disk I/O long before they compete for CPU.
3. The app onto two or more stateless nodes behind the gateway.
4. GlitchTip/Sentry last; error volume is bursty but small.

## The five most likely incidents

Each links to the runbook that alerts point at, so the alert, the dashboard and
this page all name the same procedure.

1. [Payment webhook backlog](./runbooks.md#slo-payment-webhook-backlog) — money
   stops reconciling; orders sit unpaid.
2. [Database disk pressure](./runbooks.md#disk-pressure) — writes fail and the
   whole platform degrades.
3. [Metrics endpoint down](./runbooks.md#metrics-endpoint-down) — the platform
   goes blind before it goes down.
4. [Loki ingestion stalled](./runbooks.md#loki-stalled) — the incident you are
   about to have will have no logs.
5. [Alertmanager delivery failing](./runbooks.md#alertmanager-delivery) —
   everything is broken and nobody is paged.

## Exit gate

Phase 14 is done when both profiles above have a real row in the run record,
inside budget, on the self-hosted node.
