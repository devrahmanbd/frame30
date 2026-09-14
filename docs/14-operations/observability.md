# Observability

Three pillars, one trace id.

| Pillar | Where | Entry point |
| --- | --- | --- |
| Metrics | Prometheus scrapes `/api/public/metrics` | `incr` / `setGauge` / `observe` |
| Traces + errors | Sentry (performance transactions + issues) | `withRequestTrace` / `withSpan` / `captureError` |
| Logs | JSON lines to stdout → Loki/Grafana | `log(level, event, fields)` |

Every log line and every Sentry event carries `trace_id` and `span_id`, so a
Grafana log panel links straight to the trace that produced it (the derived
field is wired in `ops/observability/grafana/provisioning-datasources.yml`).

## Environment

| Variable | Purpose | Behaviour when unset |
| --- | --- | --- |
| `METRICS_TOKEN` | Bearer token for the scrape endpoint | endpoint returns 404 (closed by default) |
| `SENTRY_DSN` | Sentry ingest | Sentry transport is a silent no-op |
| `SENTRY_ENVIRONMENT` | `production` / `preview` | defaults to `preview` |
| `SENTRY_RELEASE` | release tag for regressions | defaults to `dev` |
| `SENTRY_TRACES_SAMPLE_RATE` | head sampling, `0`–`1` | defaults to `0.1` |

Sampling is deterministic on the trace id, so a distributed trace is never
half-recorded, and an inbound `traceparent` is always honoured.

## Running the stack locally

```bash
docker run -p 9090:9090 \
  -v $PWD/ops/observability/prometheus.yml:/etc/prometheus/prometheus.yml \
  -v $PWD/ops/observability/alerts.rules.yml:/etc/prometheus/alerts.rules.yml \
  prom/prometheus

docker run -p 3000:3000 \
  -v $PWD/ops/observability/grafana:/etc/grafana/provisioning/datasources \
  -v $PWD/ops/observability/grafana:/etc/grafana/dashboards \
  grafana/grafana
```

Dashboards: **Ad fraud defense** (`framique-ad-fraud`) and **Platform
overview** (`framique-platform`).

## Metric conventions

- Names are `framique_<domain>_<thing>_<unit>`; durations are milliseconds.
- Counters are per-isolate and monotonic *within* an isolate only. Always
  aggregate with `sum(rate(...))` — never read a raw counter.
- Label values are truncated to 48 chars and the registry hard-caps at 6000
  series per isolate; overflow increments `framique_metrics_dropped_series`
  (alerted on) instead of exploding the scrape.

### Ad-fraud series

| Metric | Type | Labels |
| --- | --- | --- |
| `framique_ad_clicks_total` | counter | `verdict`, `network` |
| `framique_ad_click_rejected_total` | counter | `reason` |
| `framique_ad_click_replay_total` | counter | `source` |
| `framique_ad_ingest_ms` | histogram | `network`, `path` |
| `framique_ad_score` | histogram | `network` |
| `framique_ad_cron_runs_total` | counter | `outcome` |
| `framique_ad_cron_duration_ms` | histogram | — |
| `framique_ad_cron_rollups_total` | counter | — |
| `framique_ad_blocklist_expired_total` | counter | — |
| `framique_ad_last_sweep_timestamp` | gauge | — |
| `framique_idempotency_total` | counter | `route`, `outcome` |

## Click beacon hardening (`/api/public/ads/click`)

Checks run cheapest-first so a flood costs the attacker more than it costs us:

1. `content-type` must be JSON, `content-length` ≤ 8 KiB.
2. Per-IP rate limit **before** parsing.
3. Zod schema with bounded strings and numbers.
4. Freshness: `sentAt` within +60s / −5min (stale and future are counted
   separately so metrics show which attack is running).
5. Nonce format `[A-Za-z0-9_-]{16,64}`.
6. Per-merchant rate limit, then merchant existence (unknown id → 404).
7. Origin allowlist, when the merchant configured storefront hosts.
8. HMAC signature over `merchantId\nnonce\nsentAt\nvisitorId\nnetwork`, when
   the merchant enabled signed beacons (constant-time compare).
9. Durable replay claim in `api_idempotency_keys` — the unique index *is* the
   lock, so two isolates racing the same nonce cannot both win. Replays return
   the stored response with `idempotent-replay: true`; same key + different
   body returns `409`. A failed handler releases the key so retries work.

Landing paths and referrers are normalized before storage; the response never
leaks score reasoning. The nightly cron prunes spent keys after 24h.

## Sentry

- Errors: fingerprinted with uuids/digits collapsed, so one bug is one issue.
  A client-side budget (60/min per fingerprint) protects the quota; suppressed
  sends are counted as `outcome="budgeted"` rather than dropped silently.
- Transactions: one per traced request, with child spans for every `withSpan`
  unit, tagged `route`, `method`, `merchant`, `network`.
- Breadcrumbs: added with `addBreadcrumb(category, message, data)`.
- Everything passes through the PII scrubber before it leaves the process.

## Runbook pointers

| Alert | First move |
| --- | --- |
| `AdClickIngestErrors` | Sentry issues with `scope=ads.click`, stage tag tells you idempotency vs ingest |
| `AdClickBeaconAbuseSpike` | Ad defense desk → offenders; consider enabling signed beacons for the store |
| `AdFraudSweepStalled` | Check the cron caller and `framique_ad_cron_runs_total{outcome="unauthorized"}` |
| `BeaconReplayConflicts` | A merchant SDK reusing an `Idempotency-Key`, or a tampered replay |
| `SentryTransportFailing` | You are flying blind — fix the DSN/quota before anything else |

## Infrastructure signals (§4.4)

| Signal | Metric | Alert |
| --- | --- | --- |
| Queue latency | `framique_queue_oldest_age_seconds{queue}` (gauge) | `QueueHeadSlow` 5m warn, `QueueHeadStalled` 15m critical |
| Queue depth | `framique_queue_depth{queue,state}` (gauge: queued/running/dead) | `QueueBacklogGrowing` — depth **and** upward trend, never depth alone |
| Queue verdict | `framique_queue_health{queue}` 0 healthy → 3 failing | `QueueUnhealthy` |
| Dead letters | `framique_jobs_completed_total{outcome="dead"}` | `DeadLetterAppeared` (any) and `DeadLetterRateHigh` (>2%) |
| Handler duration | `framique_job_duration_ms_bucket` | `JobDurationP95High` — long handlers risk visibility-timeout redelivery |
| Breaker state | `framique_search_breaker_open{merchant,engine}` (gauge) | `SearchBreakerOpen` |
| Breaker trips | `framique_search_breaker_trips_total{engine,code}` / `..._recoveries_total` | `SearchBreakerFlapping` (>3/h = unstable, not merely down) |
| Shopper search | `framique_storefront_search_total{outcome,engine}`, `framique_storefront_search_ms` | `StorefrontSearchErrors`, `SearchFallbackShareHigh` |
| Edge images | `framique_image_transform_total{outcome}`, `framique_image_transform_ms` | `ImageTransformSignatureAbuse` |

Dashboard: `ops/observability/grafana/infrastructure-dashboard.json`
(uid `framique-infra`). Sentry rules: `ops/observability/sentry-alerts.yml`,
matched on the `scope` tag (`job.queue.dead`, `cron.jobs`, `search.breaker`,
`storefront.search`, `image.transform`).

### Why depth is not the page

A queue 5 000 jobs deep that drains in 90 seconds is healthy; a queue 12 jobs
deep whose head has waited 20 minutes is broken. Head-of-line age is therefore
the primary latency alert, and depth only pages when it is *also* trending up.

### Storefront search path

`runStorefrontSearch` calls the pluggable backend with the Postgres RPC as its
fallback closure. When the breaker is open the result is still a full
`SearchResult` — same facets, same pagination — flagged `degraded: true`, and
the storefront shows a plain-language notice instead of an error. Images in
results are signed server-side against the width ladder, so the transform
secret never reaches the browser and the CDN cache stays hot.

## Retention, disk sizing and compaction (single node)

The stack is sized for one Bangladesh-region node running the app plus the
self-hosted Supabase from Phase 10.

| Component | Retention | Cap | Where it is set |
| --- | --- | --- | --- |
| Prometheus TSDB | 30d | 20GB (`--storage.tsdb.retention.size`) | `ops/docker-compose.observability.yml` |
| Loki chunks | 30d (`retention_period: 720h`) | disk-bound, compacted every 10m | `ops/observability/loki-config.yml` |
| Alertmanager state | 120h notification log | negligible | `alertmanager.yml` |
| Grafana | dashboards are provisioned from git; the DB holds users/prefs only | <1GB | `provisioning-*.yml` |

Sizing rule of thumb at current cardinality (~6k app series, ~1.5GB/day of
logs at INFO): **60GB** of dedicated disk for `/var/lib/framique-observability`
covers 30 days of both with headroom. Both retentions are pinned to the same
30 days so a metric gap and its log lines always expire together.

Loki's compactor owns deletion — do not delete chunk files by hand. Prometheus
compacts on its own; a size-based eviction happens before the time window when
volume spikes, which is deliberate: the node must never fill up.

`HostDiskFillingUp` (>80%) and `HostDiskCritical` (>90%) fire from the node
exporter, so growth is a page long before ingestion stops.

## Verifying the stack end to end

After bring-up on a real host:

```bash
npm run obs:verify           # read-only checks
npm run obs:verify:alert     # also pushes a synthetic alert and asserts routing
```

The verifier reads facts back out of the running stack: Prometheus health,
loaded rule groups, a healthy target for every job (app, node, cadvisor,
postgres, redis, blackbox and the stack's own components), `framique_*` series
actually stored in the TSDB, `pg_up == 1`, Loki readiness plus app and database
log streams in the last 15 minutes, both Grafana datasources answering, every
dashboard in git present in the running instance, anonymous Grafana reads
rejected, and Alertmanager config loaded. With `--test-alert` it posts an
`ObservabilityVerification` alert and waits for it to appear in a receiver
group.

Acceptance drill: stop the app container, then confirm within five minutes that
`MetricsEndpointDown` fires to the ops channel, the last log lines are queryable
in Loki, and the app panels in the platform dashboard show a gap.

**Silences and runbooks.** Every rule carries a `runbook` annotation pointing
into `docs/14-operations/runbooks.md`. Silence during planned work from
Grafana Alerting → Silences (or `amtool silence add alertname=...`), always
with an expiry — an open-ended silence is a deleted alert.

## Per-tenant views without cross-tenant leakage

Business counters (`framique_orders_total`, `framique_refund_total`) carry a
`tenant` label produced by `tenantLabel()` in `src/lib/observability.server.ts`:
a stable, opaque FNV bucket of the merchant id, capped at 200 distinct tenants
per isolate (the rest collapse to `other`). The scrape endpoint therefore never
publishes merchant ids, cardinality stays bounded, and a merchant-scoped
dashboard is built by filtering `tenant="t_…"`. Raw merchant ids stay in Loki
as structured metadata on log lines, behind Grafana auth.
