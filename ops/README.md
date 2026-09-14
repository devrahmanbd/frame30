# Framique — self-hosted operations

Everything Framique depends on at runtime runs on our own infrastructure:
Supabase (Postgres/PostgREST/GoTrue/Realtime/Storage), Redis, and the full
observability stack (Prometheus, Alertmanager, Grafana, Loki, Promtail,
Sentry). No SaaS is required to run, observe, or debug the platform.

Architecture, decisions and the design system live in [`SYSTEM.md`](../SYSTEM.md).

---

## 1. Layout

```
ops/
  docker-compose.platform.yml       # Redis (+ shared `framique` network)
  docker-compose.observability.yml  # Prometheus, Alertmanager, Grafana, Loki,
                                    # Promtail, exporters, blackbox
  .env.example                      # copy -> ops/.env
  secrets/                          # file-mounted secrets, git-ignored
  observability/
    prometheus.yml                  # scrape config (app, deps, stack, probes)
    alerts.rules.yml                # product/domain alerts
    slo.rules.yml                   # SLO burn-rate rules
    infra.rules.yml                 # host, container, datastore, plumbing
    alertmanager.yml                # routing: page -> PagerDuty, ticket -> Slack
    loki-config.yml                 # single-binary Loki, 30d retention
    promtail-config.yml             # docker log discovery + JSON pipeline
    blackbox.yml                    # synthetic probe modules
    grafana/                        # dashboards + provisioning
```

## 2. Bring-up order

```bash
docker network create framique

# 1. Supabase (upstream self-hosted distribution, pinned)
#    Join it to the `framique` network and create the read-only metrics role:
#      CREATE ROLE metrics LOGIN PASSWORD '...' IN ROLE pg_monitor;
(cd supabase/docker && docker compose up -d)

# 2. Platform dependencies
cp ops/.env.example ops/.env      # then edit
docker compose --env-file ops/.env -f ops/docker-compose.platform.yml up -d

# 3. Observability
mkdir -p ops/secrets
printf '%s' "$METRICS_TOKEN"      > ops/secrets/framique_metrics_token
printf '%s' "$GRAFANA_PASSWORD"   > ops/secrets/grafana_admin_password
printf '%s' "$SLACK_WEBHOOK_URL"  > ops/secrets/slack_webhook_url
printf '%s' "$PAGERDUTY_KEY"      > ops/secrets/pagerduty_routing_key
chmod 600 ops/secrets/*
docker compose --env-file ops/.env -f ops/docker-compose.observability.yml up -d

# 4. Sentry (self-hosted, separate lifecycle — it is a heavy stack)
#    git clone https://github.com/getsentry/self-hosted && ./install.sh
#    Then set SENTRY_DSN in the app environment.
```

Verify: `curl -s localhost:9090/-/healthy`, `curl -s localhost:3100/ready`,
Grafana on `localhost:3001` should already show the Framique folder with the
committed dashboards and both datasources wired.

## 3. The three signals

| Signal | Produced by | Transported by | Read in |
|---|---|---|---|
| Metrics | `incr` / `setGauge` / `observe` in `src/lib/observability.server.ts`, exposed at `/api/public/metrics` (Bearer `METRICS_TOKEN`) | Prometheus scrape, 30s | Grafana dashboards, alert rules |
| Logs | `log()` — PII-scrubbed JSON lines on stdout, stamped with `trace_id`/`span_id` | Promtail (docker SD) → Loki | Grafana Explore, log-based alerts |
| Errors & traces | `withSpan` / `withRequestTrace` → Sentry envelopes | direct HTTPS to self-hosted Sentry, budgeted | Sentry UI, linked from Loki lines |

Correlation is the point: a Grafana panel spike → the Loki lines behind it →
the `trace_id` derived field → the Sentry trace, without leaving the browser.

## 4. Alerting contract

- `severity=page` — user-visible loss or imminent data risk. PagerDuty, 24/7.
- `severity=ticket` — capacity, hygiene, degradation. Slack, business hours.
- `severity=info` — Slack, grouped hourly.

Every rule carries a `runbook` annotation pointing into
`docs/14-operations/runbooks.md`. An alert without a runbook is a
notification, not an alert, and should be deleted or given one.

## 5. Cardinality rules (non-negotiable)

- Prometheus labels: bounded sets only (route, outcome, status class, widget
  type). Never `merchant_id`, `order_id`, `user_id`, `trace_id`, or raw paths.
  The registry caps series per isolate and reports the overflow via
  `framique_metrics_dropped_series` — that gauge going non-zero is a bug.
- Loki labels: `service`, `env`, `level`, `container`, `stream`. Identifiers
  stay inside the JSON body or in structured metadata.

## 6. Retention and cost

Metrics 30d / 20GB, logs 30d, Sentry per its own quota. Metrics and logs are
retained for the same window on purpose: a postmortem that has one without the
other is guesswork. Long-term SLO history comes from recording rules in
`slo.rules.yml`, which stay cheap enough to keep beyond raw retention.

## 7. Backups & Time-Machine Disaster Recovery

- **Continuous Point-in-Time Recovery (PITR)**: Hourly basebackups + continuous PostgreSQL WAL archiving (`ops/backup/time-machine-snapshot.sh`).
- **Pre-Canary Snapshot Hook**: CI/CD triggers an automated snapshot before any traffic cutover:
  ```bash
  # Take pre-deployment snapshot
  ./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) take

  # Verify snapshot integrity
  ./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) verify

  # Disaster Recovery PITR rewind to exact target second
  ./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) restore-pitr '2026-09-10 05:00:00 UTC'
  ```
- **ML Training Data Immunity Shield**: Deleting a merchant or customer from transactional tables unlinks foreign keys via `ON DELETE SET NULL` while preserving all training turns, CSAT ratings, preference pairs, and RL reward trajectories under permanent surrogate cohort hashes (`merchant_cohort_hash`).
- **Redis**: AOF `everysec`, snapshot shipped with the Postgres backup set.
- **Grafana/Prometheus/Loki volumes**: Nightly volume snapshots; dashboards and alert rules are committed in git.

---

## 8. HashiCorp Nomad Clustering & Blue/Green Ingress (`ops/nomad/`)

For lightweight bare-metal, edge, or private-cloud topologies where Kubernetes introduces excessive operational overhead, Framique provides official production **HashiCorp Nomad** HCL job specifications.

### Specifications Layout

```text
ops/nomad/
├── framique-blue.nomad     # Blue active/standby workload (Port 3000, 2 instances)
├── framique-green.nomad    # Green candidate workload (Port 3000, 2 instances)
└── openresty-edge.nomad    # OpenResty edge router (Ports 80/443, dynamic Consul discovery)
```

### Key Architectural Characteristics

1. **Service Registration & Probes**:
   - Both `framique-blue` and `framique-green` register with Consul / Nomad Service Discovery with service health checks on `/api/healthz?type=liveness` and `/api/healthz?type=readiness`.
   - Nomad's `check_restart` automatically restarts unresponsive tasks after 3 consecutive failures.
2. **Dynamic Ingress with Consul-Template**:
   - `openresty-edge.nomad` uses embedded `template` stanzas that continuously render `/etc/nginx/conf.d/upstream.conf` from active `framique-blue` and `framique-green` allocations, reloading NGINX without dropping connections via `SIGHUP`.
3. **Canary Weight Management**:
   - Traffic splits (`split_clients`) can be updated dynamically via Consul K/V or Redis cohort weights without restarting the edge containers.

### Deployment & Validation Commands

```bash
# 1. Validate all job specifications
nomad job validate ops/nomad/framique-blue.nomad
nomad job validate ops/nomad/framique-green.nomad
nomad job validate ops/nomad/openresty-edge.nomad

# 2. Deploy Edge Gateway
nomad job run ops/nomad/openresty-edge.nomad

# 3. Deploy Blue (Active baseline)
nomad job run -var="git_sha=$(git rev-parse --short HEAD)" ops/nomad/framique-blue.nomad

# 4. Deploy Green Candidate (Canary release)
nomad job run -var="image=framique:candidate" ops/nomad/framique-green.nomad

# 5. Monitor canary health & blast radius
nomad job status framique-green
```

