# 01 — Tenancy runtime (BUILD.md §1.1)

Status: Built · Owner: platform eng · Surfaces: `/root/tenancy`, `/api/public/metrics`

This file is the implementation truth for the tenancy foundation: what makes a
tenant boundary hold, and what proves it still holds after the next migration.

## 1. Isolation invariants

1. Every tenant table carries `merchant_id` and is read through RLS. Application
   filtering is never the only guard.
2. A table with RLS off, or RLS on with zero policies and a role grant, is a leak.
   `/root/tenancy` renders both counts; `.e2e/specs/tenant_isolation.spec.ts`
   asserts an anonymous Data API read of every private table returns zero rows.
3. Storefront-public tables are an explicit allow-list in the leak suite. Adding a
   table to that list is a review decision, not a test fix.

## 2. Soft delete (tombstones)

`deleted_at timestamptz` exists on: products, product_variants, categories,
brands, collections, coupons, articles, media_assets, segments, campaigns,
customers, storefront_forms, carriers, fraud_rules. Each has a partial index on
`(merchant_id) where deleted_at is null`.

- Merchant-facing deletes call `public.soft_delete_row(table, merchant_id, id)`,
  which whitelists the table and requires `owner`/`admin` on that merchant.
- Money and history rows (orders, payments, refunds, invoices, ledger, audit) are
  never soft-deleted and never mutated in place.
- Reads that represent "the catalog" filter `deleted_at is null`.

## 3. Tenant hard delete (GDPR-grade)

`tenant_purge_requests` drives a three-step lifecycle:

```text
request  -> merchant.status = suspended, audit line, cooling window starts
cancel   -> merchant.status = active, audit line with the reason
execute  -> platform admin only, only after scheduled_for, counts every
            merchant_id row per table, deletes the merchant (FK cascade),
            stores row_counts on the request, writes an audit line
```

- One pending request per merchant (partial unique index).
- Cooling window default 7 days, clamped to 0–90.
- `tenant_request_purge` / `tenant_cancel_purge` accept the store's own owner;
  `tenant_execute_purge` is platform-admin only.
- Purge requests are rate limited (`owner.purge`: 5 per hour per actor).

## 4. Rate limiting

Two tiers, one contract. Tier 1 is a **Redis sorted-set sliding window** (`EVAL`,
one round trip, atomic trim-count-admit) and is shared by every isolate, which is
what removes both the fixed-window boundary burst and the per-instance blind
spot. Tier 2 is `public.rate_limit_hit(bucket, subject, limit, window_seconds)`,
a fixed-window counter on `rate_limit_counters`, used when `REDIS_URL` is unset
or Redis is degraded. The table is service-role only with RLS on and no policies,
so no client can read or forge a verdict. Every verdict carries `source`
(`redis` | `postgres` | `none`). Buckets live in `src/lib/rate-limit.server.ts`:


| Bucket | Limit | Window |
|---|---|---|
| `auth.signin` | 10 | 5 min |
| `auth.reset` | 5 | 15 min |
| `webhook.gateway` | 600 | 1 min |
| `storefront.form` | 20 | 1 h |
| `owner.purge` | 5 | 1 h |
| `api.public` | 120 | 1 min |

Failure policy: a Redis fault **demotes** to tier 2 and emits
`framique_rate_limit_total{outcome="degraded",source="redis"}` plus a
`rate_limit.redis_degraded` warn line — the guarantee weakened, so it is a
series. Only when *both* tiers are unavailable do we fail **open**, with
`outcome="unavailable"` and a `rate_limit.unavailable` line, because a silent
limiter is itself a risk. Blocked callers get `429` with `x-ratelimit-*` and
`retry-after` headers.

The Redis client (`src/lib/redis.server.ts`) is a hand-rolled RESP2 client over
`node:net`/`node:tls`: 750 ms connect and 250 ms command deadlines, a circuit
breaker that opens for 30 s after three consecutive faults, and
`framique_redis_commands_total` / `framique_redis_command_ms` /
`framique_redis_breaker_open` for every call. `ioredis` and `node-redis` do not
survive the Worker bundle.

## 5. Caching

`src/lib/cache.server.ts` is two tiers: an L1 per-isolate TTL map with
stale-while-revalidate and single-flight, and an opt-in shared L2 in Redis
(`shared: true`; `renderRead` opts in by default). L2 turns "one database read per
isolate per key" into "one per fleet per key", so a deploy or scale-out no longer
stampedes Postgres. Values that do not serialise, or exceed 256 KB, stay L1-only
and are counted. Invalidation walks L2 with cursored `SCAN` (bounded page budget,
never `KEYS`).

Rule: the key must contain `merchant_id` (or the user id) whenever the value is
tenant data. Cross-tenant reuse of a cache entry is the same class of defect as a
missing RLS policy — and with L2 the blast radius is the whole fleet, so the rule
is stricter here, not looser.

## 6. Observability

- `log(level, event, fields)` — one JSON line per event, PII-minimal by contract.
- `withSpan(name, fn, labels)` — latency histogram `framique_span_duration_ms`
  and outcome counter `framique_span_total{outcome=ok|error}`.
- `captureError` forwards to Sentry when `SENTRY_DSN` is set; otherwise no-op.
- `/api/public/metrics` renders Prometheus text v0.0.4. It requires
  `Authorization: Bearer $METRICS_TOKEN` and returns `404` when no token is
  configured, so an unconfigured deploy exposes nothing. Grafana scrapes that
  endpoint; the dashboard JSON is a remaining TBD.

## 7. Schema drift

`public.schema_fingerprint()` returns table column counts, RLS flags, policy
counts, function names and enum labels. The committed snapshot lives at
`supabase/schema.fingerprint.json`.

```bash
bun run schema:snapshot   # after an intentional migration
bun run schema:check      # CI gate — non-zero exit on drift
```

`/root/tenancy` renders the same comparison live, with RLS changes marked as the
highest-severity drift class.

## 8. Gates

- `bun run e2e:isolation` — 98 negative assertions, must be green on every PR.
- `bun run schema:check` — must be green; a red result means either the migration
  was not committed or the snapshot was not refreshed.
- `bun run e2e:critical` now includes `tenant_isolation` alongside `store_loop`
  and `failure_loop`.

## 9. Residual gaps

| Item | Owner |
|---|---|
| Redis-backed limiter (sliding window) | **Done** — `src/lib/redis.server.ts` + tier 1 in `rate-limit.server.ts`; Postgres fixed window remains the fallback |
| Grafana dashboard JSON + scrape config committed in-repo | **Done** — `ops/observability/` (10 dashboards, `prometheus.yml`, SLO + infra rules) |
| Cron executor for elapsed purge windows | **Done** — `ops/docker-compose.cron.yml` runs supercronic against the generated `ops/cron/crontab` (`purge` at `55 3 * * *`); `bun run cron:check` fails CI when a registry job has no schedule |
| Seeded catalogue in remixed backends, so the anonymous-read RLS matrix is non-vacuous | **TBD** — platform eng (`supabase/pending/` unapplied) |

### 9.1 Where the purge actually runs

```text
supercronic (ops/docker-compose.cron.yml)
  -> POST /api/public/cron/purge   (bearer BILLING_CRON_SECRET)
     -> cron-endpoint.server.ts    (lease, timeout, ledger, alert, metrics)
        -> runDuePurges()          -> rpc tenant_purge_run_due
```

Two schedulers may run concurrently: the loser of `ops_cron_claim` answers `409`
and is ledgered as a skip. Overdue detection is in the ledger
(`framique_cron_overdue_seconds`), not in the scheduler, because a dead
scheduler cannot alert about itself.

