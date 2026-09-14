# Error tracking — self-hosted GlitchTip + Sentry (Phase 12)

Everything below runs on our own hardware. No error data leaves the node.

## Topology

| Piece | Where | Notes |
| --- | --- | --- |
| GlitchTip | `ops/docker-compose.errors.yml`, profile `glitchtip` | Default. Postgres + Redis + web + worker. |
| Sentry | same file, profile `sentry` | Heavy option; run only with headroom. |
| App reporter | `src/lib/observability.server.ts` + `src/lib/client-error-reporter.ts` | One reporter, one DSN per backend. |
| Alert bridge | `/api/public/error-alert` | Webhook → Alertmanager → the Phase 11 Slack/PagerDuty path. |

Start one or both:

```bash
docker compose --env-file ops/.env -f ops/docker-compose.errors.yml --profile glitchtip up -d
docker compose --env-file ops/.env -f ops/docker-compose.errors.yml --profile sentry up -d
```

Then create a project in each UI, copy the DSN, and set `GLITCHTIP_DSN` and/or
`SENTRY_DSN` in the app environment. Neither set means the app only logs —
that is a supported state, not a failure.

## What the app sends

* Browser `onerror`, unhandled promise rejections and React error-boundary
  failures. The page holds **no DSN**: it POSTs a trimmed report to
  `/api/public/errors`, which scrubs and forwards it.
* SSR and server-function exceptions, through `captureError`.
* Sampled HTTP transactions, for latency context.

Every event carries `environment`, `release` and `commit` tags, plus `scope`
and the trace id, so an issue links back to its logs and metrics.

## PII rules

Two layers, both mandatory:

1. `scrubText` / `scrubPayload` (`src/lib/ops.ts`) mask anything that *looks*
   like an email, phone, card or token, in messages, stacks and context.
2. `sanitizeEventFields` (`src/lib/error-tracking.ts`) removes whole fields by
   name: customer details, addresses, order/cart/line-item payloads, request
   and response bodies, and anything credential-shaped.

Tenant identity travels only as the opaque bucket from `tenantLabel()`. A raw
merchant id, order id payload or customer record in an event body is a bug.

## Sampling and quotas

| Knob | Default | Meaning |
| --- | --- | --- |
| `ERROR_SAMPLE_RATE` | `1` in production, `0.25` elsewhere | Fraction of distinct fingerprints forwarded. Deterministic per fingerprint. |
| `ERROR_QUOTA_PER_MINUTE` | `60` production / `20` preview | Sends per fingerprint per minute. |
| `ERROR_RETENTION_DAYS` | `30` | Event lifetime in both backends. |

Client side, a page view sends at most 10 reports and dedupes by
mechanism+message, and `/api/public/errors` is rate limited to 30 requests per
minute per IP.

Disk sizing: GlitchTip stores roughly 3–5 KB per event; 30 days at 20k
events/day is about 3 GB including indexes. Sentry is 3–4× that.

## Alert routing

Configure an issue rule in GlitchTip/Sentry with a webhook to:

```
POST https://<app-host>/api/public/error-alert
x-error-alert-secret: $ERROR_ALERT_SECRET
```

The bridge emits an `ErrorTrackerIssue` alert into Alertmanager with
`severity=ticket` (or `page` for `fatal`), a `source` label of `glitchtip` or
`sentry`, and the issue URL as both annotation and `generatorURL`. Silencing
works exactly like any other alert; the runbook is
`docs/14-operations/runbooks.md#errortrackerissue`. Grafana panels annotate
from the same Alertmanager path, so an issue shows up on the dashboards next
to the metric spike that caused it.

## Failure behaviour

If a backend is unreachable, the send is swallowed, the outcome is counted on
`framique_sentry_events_total{outcome="transport_error"}`, and **nothing is
buffered** — no retry queue, no disk spool, no sensitive payload waiting to be
flushed. The request that failed continues to completion.

## Verifying

```bash
npm run err:verify           # config + reachability of every configured backend
npm run err:verify -- --send # also send a deliberate test error and read it back
```

Acceptance for Phase 12 is the `--send` run on a real host: a deliberate error
appears in GlitchTip and Sentry with a readable stack trace and no personal
data.
