# Alert runbooks

Every Prometheus rule in `ops/observability/*.rules.yml` links here through its
`runbook` annotation. One section per alert: what fired, what to look at first,
and how to stand it down. Silence only with an expiry — an open-ended silence is
a deleted alert (`amtool silence add alertname=<Name> --duration=2h --comment=...`).

## Observability verification

`npm run obs:verify` (add `--test-alert` to exercise routing) re-checks the whole
stack: Prometheus targets, rule groups, Loki ingestion, Grafana datasources and
dashboards, Alertmanager config. Run it after any change to
`ops/docker-compose.observability.yml` or the scrape config.

## Ad Click Beacon Abuse Spike

- **Alert:** `AdClickBeaconAbuseSpike` (`alerts.rules.yml`, severity `warning`)
- **Means:** Sustained rejected ad beacons
- **Context:** Someone is replaying or forging click beacons. Inspect the ad defense desk.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Click Ingest Errors

- **Alert:** `AdClickIngestErrors` (`alerts.rules.yml`, severity `critical`)
- **Means:** Ad click ingest failing (>2% of beacons)
- **Context:** Server-side failures in /api/public/ads/click. Check Sentry scope=ads.click.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Click Ingest Slow

- **Alert:** `AdClickIngestSlow` (`alerts.rules.yml`, severity `warning`)
- **Means:** p95 ad ingest latency above 1.5s
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Fraud Cron Failing

- **Alert:** `AdFraudCronFailing` (`alerts.rules.yml`, severity `critical`)
- **Means:** Ad-fraud cron erroring
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Fraud Sweep Stalled

- **Alert:** `AdFraudSweepStalled` (`alerts.rules.yml`, severity `critical`)
- **Means:** Ad-fraud sweep has not completed in 2 hours
- **Context:** Integrity rollups are going stale; blocklist entries are not expiring.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Invalid Click Share High

- **Alert:** `AdInvalidClickShareHigh` (`alerts.rules.yml`, severity `warning`)
- **Means:** Over a third of ad clicks scored invalid
- **Context:** Either a live click-fraud attack or a scoring regression. Compare true vs reported CPC.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Spend Autoblock Dead

- **Alert:** `AdSpendAutoblockDead` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Ad-fraud engine has blocked nothing in 24 hours while clicks flow
- **Context:** The moat is probably disabled. Verify blocklist writes and the ad-fraud sweep.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ad Spend Autoblock Spike

- **Alert:** `AdSpendAutoblockSpike` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Ad-fraud engine is auto-blocking at an unusual rate
- **Context:** Each autoblock cuts a source off a merchant's paid traffic. A spike is either a real click-fraud wave or a scoring regression — confirm against ad_integrity_days before letting it run.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ai Ask Error Rate High

- **Alert:** `AiAskErrorRateHigh` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Over 10% of assistant answers failing or throttled
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ai Guardrail Block Fired

- **Alert:** `AiGuardrailBlockFired` (`alerts.rules.yml`, severity `page`)
- **Means:** AI guardrail blocked an output ({{ $labels.kind }} / {{ $labels.rule }})
- **Context:** The assistant attempted a cross-tenant read or claimed price/refund authority. Containment held — inspect ai_guardrail_events for the prompt.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Ai Tool Latency P95 High

- **Alert:** `AiToolLatencyP95High` (`alerts.rules.yml`, severity `info`)
- **Means:** AI tool-call p95 above 8s
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Alertmanager Notification Failures

<a id="alertmanager-delivery"></a>

- **Alert:** `AlertmanagerNotificationFailures` (`infra.rules.yml`, severity `page`)
- **Means:** Alertmanager cannot deliver notifications — alerting is blind
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Analytics Conversion Delivery Failing

- **Alert:** `AnalyticsConversionDeliveryFailing` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Server-side conversion events failing to reach {{ $labels.provider }}
- **Context:** Attribution integrity is degrading; ad spend will be optimised against a partial signal.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Analytics Etl Gap Detected

- **Alert:** `AnalyticsEtlGapDetected` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Analytics ETL detected an event gap
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Analytics Etl Stalled

- **Alert:** `AnalyticsEtlStalled` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Analytics ETL has committed no batches in 2 hours
- **Context:** Merchant analytics, cohorts and scheduled reports are going stale.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Api Error Budget Burn Fast

- **Alert:** `ApiErrorBudgetBurnFast` (`alerts.rules.yml`, severity `page`)
- **Means:** REST API 5xx above 2% (1h burn)
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Api Error Budget Burn Slow

- **Alert:** `ApiErrorBudgetBurnSlow` (`alerts.rules.yml`, severity `ticket`)
- **Means:** REST API 5xx above 0.5% sustained over 6h
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Api Latency P95 High

- **Alert:** `ApiLatencyP95High` (`alerts.rules.yml`, severity `ticket`)
- **Means:** REST API p95 above 1.2s
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Api Route Error Concentration

- **Alert:** `ApiRouteErrorConcentration` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Route {{ $labels.route }} is erroring for API clients
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Api Throttling High

- **Alert:** `ApiThrottlingHigh` (`alerts.rules.yml`, severity `info`)
- **Means:** More than 10% of API calls throttled
- **Context:** Either an abusive client or limits set too tight for a legitimate integration.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Backup Drill Stale

- **Alert:** `BackupDrillStale` (`slo.rules.yml`, severity `page`)
- **Means:** No verified backup drill in 36 hours
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Beacon Replay Conflicts

- **Alert:** `BeaconReplayConflicts` (`alerts.rules.yml`, severity `warning`)
- **Means:** Idempotency-key conflicts on the click beacon
- **Context:** Same key, different body — a buggy SDK or a tampered replay.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Billing Sweep Stale

- **Alert:** `BillingSweepStale` (`slo.rules.yml`, severity `ticket`)
- **Means:** Billing sweep has not completed in 2 hours
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Container Restart Loop

<a id="restart-loop"></a>

- **Alert:** `ContainerRestartLoop` (`infra.rules.yml`, severity `page`)
- **Means:** Container {{ $labels.name }} restarted repeatedly
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Currency Gate Deny Spike

- **Alert:** `CurrencyGateDenySpike` (`alerts.rules.yml`, severity `ticket`)
- **Means:** USD pilot gate is denying most requests
- **Context:** Either a pilot flag was revoked or the gate is misreading store currency settings — USD stores will be quoting in the wrong currency.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Dead Letter Appeared

- **Alert:** `DeadLetterAppeared` (`alerts.rules.yml`, severity `warning`)
- **Means:** New dead-letter jobs on {{ $labels.queue }}
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Dead Letter Rate High

- **Alert:** `DeadLetterRateHigh` (`alerts.rules.yml`, severity `critical`)
- **Means:** {{ $labels.queue }} dead-lettering >2% of jobs
- **Context:** Retries are exhausting. Inspect the DLQ at /admin/settings/infrastructure and replay after fixing the handler.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Domain Cert Issuance Failing

- **Alert:** `DomainCertIssuanceFailing` (`alerts.rules.yml`, severity `page`)
- **Means:** Custom-domain certificate issuance failing
- **Context:** Merchant storefronts will serve TLS errors as certificates expire. Check the ACME http-01 responder and the edge callback HMAC.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Domain Cert Request Errors

- **Alert:** `DomainCertRequestErrors` (`alerts.rules.yml`, severity `ticket`)
- **Means:** ACME certificate requests erroring
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Domain Dns Lookup Errors

- **Alert:** `DomainDnsLookupErrors` (`alerts.rules.yml`, severity `ticket`)
- **Means:** DNS-over-HTTPS resolution failing for domain checks
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Domain Renew Sweep Stalled

- **Alert:** `DomainRenewSweepStalled` (`alerts.rules.yml`, severity `page`)
- **Means:** Domain renew sweep has not run in 12 hours
- **Context:** Auto-renew is dead. Certificates will silently expire — this is a whole-storefront outage per merchant.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Domain Verification Stalled

- **Alert:** `DomainVerificationStalled` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Custom-domain verification stalling for merchants
- **Context:** Onboarding is blocked at DNS verification. Confirm the expected records and the resolver path.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Error Log Burst

<a id="error-burst"></a>

- **Alert:** `ErrorLogBurst` (`infra.rules.yml`, severity `ticket`)
- **Means:** Sustained error-log burst (>5/s) across the fleet
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Exporter Down

- **Alert:** `ExporterDown` (`infra.rules.yml`, severity `ticket`)
- **Means:** Exporter {{ $labels.job }} down — dashboards are lying
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Fulfilment Backlog Growing

- **Alert:** `FulfilmentBacklogGrowing` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Fulfilments being created faster than they are delivered
- **Context:** Fulfilment lag is widening; check courier adapters and the courier DLQ.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Fx Refresh Errors

- **Alert:** `FxRefreshErrors` (`alerts.rules.yml`, severity `ticket`)
- **Means:** FX rate refresh erroring
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Fx Refresh Stalled

- **Alert:** `FxRefreshStalled` (`alerts.rules.yml`, severity `page`)
- **Means:** FX rates have not refreshed in 12 hours
- **Context:** A1 exposure: every USD order is being priced from a stale table. Check the FX refresh job and its upstream feed.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Gift Card Liability Drain Spike

- **Alert:** `GiftCardLiabilityDrainSpike` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Gift-card redemption far outpacing issuance
- **Context:** Possible code enumeration or a duplicated redemption path. Reconcile gift_card_entries against the ledger.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Gift Card Redemption Errors

- **Alert:** `GiftCardRedemptionErrors` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Gift-card redemptions erroring
- **Context:** Customers hold balance they cannot spend. Check the gift-card ledger and entry uniqueness.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Host Disk Critical

<a id="disk-pressure"></a>

- **Alert:** `HostDiskCritical` (`infra.rules.yml`, severity `page`)
- **Means:** Under 5% disk free on {{ $labels.instance }} — Postgres will stop writing
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Host Disk Filling Up

<a id="disk-pressure"></a>

- **Alert:** `HostDiskFillingUp` (`infra.rules.yml`, severity `ticket`)
- **Means:** Less than 15% disk free on {{ $labels.instance }} {{ $labels.mountpoint }}
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Host Memory Pressure

<a id="memory-pressure"></a>

- **Alert:** `HostMemoryPressure` (`infra.rules.yml`, severity `ticket`)
- **Means:** Memory above 92% on {{ $labels.instance }}
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Http Server Errors

- **Alert:** `HttpServerErrors` (`alerts.rules.yml`, severity `critical`)
- **Means:** {{ $labels.route }} returning >5% 5xx
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Image Transform Signature Abuse

- **Alert:** `ImageTransformSignatureAbuse` (`alerts.rules.yml`, severity `warning`)
- **Means:** Sustained forged image transform URLs
- **Context:** Someone is probing the resizer. Signing is holding, but confirm the ladder and host allowlist.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Job Duration P95 High

- **Alert:** `JobDurationP95High` (`alerts.rules.yml`, severity `warning`)
- **Means:** {{ $labels.queue }} p95 job duration above 30s
- **Context:** Long handlers risk exceeding the visibility timeout and being redelivered, causing duplicate work.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Loki Ingestion Stalled

<a id="loki-stalled"></a>

- **Alert:** `LokiIngestionStalled` (`infra.rules.yml`, severity `ticket`)
- **Means:** No log lines reaching Loki for 15m — Promtail or Loki is broken
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Marketplace Payout Settle Errors

- **Alert:** `MarketplacePayoutSettleErrors` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Creator payout settlement erroring
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Metric Cardinality Dropping

- **Alert:** `MetricCardinalityDropping` (`alerts.rules.yml`, severity `warning`)
- **Means:** Metric series cap reached; some series are being dropped
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Metrics Endpoint Down

- **Alert:** `MetricsEndpointDown` (`slo.rules.yml`, severity `page`)
- **Means:** Prometheus cannot scrape the app — telemetry is dark
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## O Auth Authorization Code Replay

- **Alert:** `OAuthAuthorizationCodeReplay` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Authorization codes being replayed
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## O Auth Refresh Token Reuse Detected

- **Alert:** `OAuthRefreshTokenReuseDetected` (`alerts.rules.yml`, severity `page`)
- **Means:** OAuth refresh-token reuse detected — a token family was revoked
- **Context:** A rotated or revoked refresh token was presented. Treat as a leaked credential: check the client, the audit trail and recent token issuance.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Order Creation Failing

- **Alert:** `OrderCreationFailing` (`alerts.rules.yml`, severity `page`)
- **Means:** Over 5% of checkout attempts failing
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Payout Backlog Deferred

- **Alert:** `PayoutBacklogDeferred` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Payouts repeatedly deferred for want of a live rail
- **Context:** Instructions are parked because no provider credential is approved for those merchants (§4.1 gate). Either finish sign-off or tell the merchants.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Payout Failure Rate High

- **Alert:** `PayoutFailureRateHigh` (`alerts.rules.yml`, severity `page`)
- **Means:** More than 10% of payout attempts are exhausting their retries
- **Context:** Merchants are not being paid. Inspect failure_code on recent payouts and the rail credentials.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Payout Illegal Transition

- **Alert:** `PayoutIllegalTransition` (`alerts.rules.yml`, severity `page`)
- **Means:** A payout state machine transition was refused
- **Context:** Something attempted to move a payout out of a state it cannot leave — the double-settle guard fired. Treat as an integrity incident: read payout_events for the instruction before clearing.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Payout Request Rejection Spike

- **Alert:** `PayoutRequestRejectionSpike` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Most payout requests are being rejected
- **Context:** Usually a balance-derivation or account-verification regression rather than merchant behaviour.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Payout Worker Stalled

- **Alert:** `PayoutWorkerStalled` (`alerts.rules.yml`, severity `page`)
- **Means:** Payout disbursement worker has not run in 2 hours
- **Context:** Approved instructions are sitting unpaid. Check the payouts cron route and its shared-secret auth.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Postgres Connection Saturation

<a id="pg-connections"></a>

- **Alert:** `PostgresConnectionSaturation` (`infra.rules.yml`, severity `ticket`)
- **Means:** Postgres connection pool above 85% — pooler sizing or a leak
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Postgres Down

- **Alert:** `PostgresDown` (`infra.rules.yml`, severity `page`)
- **Means:** Self-hosted Supabase Postgres is unreachable
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Postgres Replication Lag

<a id="replication-lag"></a>

- **Alert:** `PostgresReplicationLag` (`infra.rules.yml`, severity `page`)
- **Means:** Replica lag over 60s — failover would lose data
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Promtail Dropping Lines

<a id="promtail-drops"></a>

- **Alert:** `PromtailDroppingLines` (`infra.rules.yml`, severity `ticket`)
- **Means:** Promtail is dropping log entries
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Provider Secret Write Burst

- **Alert:** `ProviderSecretWriteBurst` (`alerts.rules.yml`, severity `page`)
- **Means:** Unusual number of live MFS credential writes
- **Context:** A5 exposure: gateway secrets are being rewritten faster than a planned rotation would. Confirm the actor in provider_credential_events before dismissing.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Provider Submission Errors

- **Alert:** `ProviderSubmissionErrors` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Provider credential submissions are erroring
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Queue Backlog Growing

- **Alert:** `QueueBacklogGrowing` (`alerts.rules.yml`, severity `warning`)
- **Means:** {{ $labels.queue }} backlog above 1k and still growing
- **Context:** Depth alone is not an alert; this fires only because the trend is upward, i.e. arrival rate beats drain rate.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Queue Head Slow

- **Alert:** `QueueHeadSlow` (`alerts.rules.yml`, severity `warning`)
- **Means:** {{ $labels.queue }} is falling behind (>5m head wait)
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Queue Head Stalled

- **Alert:** `QueueHeadStalled` (`alerts.rules.yml`, severity `critical`)
- **Means:** {{ $labels.queue }} head-of-line wait over 15 minutes
- **Context:** Oldest queued job is not being claimed. Check worker leases and the /api/public/cron/jobs drain.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Queue Unhealthy

- **Alert:** `QueueUnhealthy` (`alerts.rules.yml`, severity `warning`)
- **Means:** {{ $labels.queue }} reported stalled/failing by the queue judge
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Rate Limiter Unavailable

- **Alert:** `RateLimiterUnavailable` (`slo.rules.yml`, severity `page`)
- **Means:** Rate limiter failing open
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Redis Down

- **Alert:** `RedisDown` (`infra.rules.yml`, severity `page`)
- **Means:** Redis unreachable — idempotency, rate limits and queues are degraded
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Redis Memory Near Limit

<a id="redis-memory"></a>

- **Alert:** `RedisMemoryNearLimit` (`infra.rules.yml`, severity `ticket`)
- **Means:** Redis above 85% of maxmemory — eviction will drop idempotency keys
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Redis Rejected Connections

<a id="redis-connections"></a>

- **Alert:** `RedisRejectedConnections` (`infra.rules.yml`, severity `ticket`)
- **Means:** Redis rejected connections — maxclients reached
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Refund Burn Rate Fast

- **Alert:** `RefundBurnRateFast` (`alerts.rules.yml`, severity `page`)
- **Means:** Refunds above 15% of orders (1h burn)
- **Context:** Either a fulfilment failure, a pricing bug or refund abuse. Check the commerce desk before it compounds.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Refund Burn Rate Slow

- **Alert:** `RefundBurnRateSlow` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Refunds above 8% of orders sustained over 6h
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Refund Rejection Spike

- **Alert:** `RefundRejectionSpike` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Refund attempts being rejected
- **Context:** Step-up, ledger guard or gateway is refusing refunds. Merchants cannot make customers whole.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Returns Disputes Surge

- **Alert:** `ReturnsDisputesSurge` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Dispute volume elevated
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## SLO Availability Fast Burn

- **Alert:** `SLOAvailabilityFastBurn` (`slo.rules.yml`, severity `page`)
- **Means:** Availability SLO burning 14x — budget gone in ~2 days
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## SLO Availability Slow Burn

- **Alert:** `SLOAvailabilitySlowBurn` (`slo.rules.yml`, severity `ticket`)
- **Means:** Availability SLO burning 6x over 6 hours
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## SLO Checkout Fast Burn

- **Alert:** `SLOCheckoutFastBurn` (`slo.rules.yml`, severity `page`)
- **Means:** Checkout failing well beyond its 99% objective
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## SLO Payment Webhook Backlog

- **Alert:** `SLOPaymentWebhookBacklog` (`slo.rules.yml`, severity `page`)
- **Means:** Payment webhook processing beyond its error budget
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Search Breaker Flapping

- **Alert:** `SearchBreakerFlapping` (`alerts.rules.yml`, severity `warning`)
- **Means:** {{ $labels.engine }} breaker tripped more than 3 times in an hour
- **Context:** Half-open probes keep failing; the engine is unstable rather than simply down.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Search Breaker Open

- **Alert:** `SearchBreakerOpen` (`alerts.rules.yml`, severity `critical`)
- **Means:** Search circuit breaker open for {{ $value }} merchant(s)
- **Context:** Shoppers are on the Postgres fallback. Check the external engine host, key and quota.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Search Fallback Share High

- **Alert:** `SearchFallbackShareHigh` (`alerts.rules.yml`, severity `warning`)
- **Means:** Over 25% of searches served by the degraded fallback
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Sentry Transport Failing

- **Alert:** `SentryTransportFailing` (`alerts.rules.yml`, severity `warning`)
- **Means:** Errors are not reaching Sentry
- **Context:** Observability blind spot: the DSN, quota or egress path is broken.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Span Error Rate

- **Alert:** `SpanErrorRate` (`alerts.rules.yml`, severity `warning`)
- **Means:** {{ $labels.span }} failing more than 10% of the time
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Storefront Search Errors

- **Alert:** `StorefrontSearchErrors` (`alerts.rules.yml`, severity `critical`)
- **Means:** Storefront search failing for shoppers
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Support Sla Sweep Stalled

- **Alert:** `SupportSlaSweepStalled` (`alerts.rules.yml`, severity `info`)
- **Means:** Support SLA sweep has not run in 3 hours
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Synthetic Probe Failing

<a id="synthetic-probe"></a>

- **Alert:** `SyntheticProbeFailing` (`infra.rules.yml`, severity `page`)
- **Means:** Synthetic probe failing for {{ $labels.instance }}
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Tls Certificate Expiring Soon

<a id="tls-renewal"></a>

- **Alert:** `TlsCertificateExpiringSoon` (`infra.rules.yml`, severity `ticket`)
- **Means:** TLS certificate for {{ $labels.instance }} expires in under 14 days
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Webhook Dead Letter Burn Rate Fast

- **Alert:** `WebhookDeadLetterBurnRateFast` (`alerts.rules.yml`, severity `page`)
- **Means:** Over 5% of webhook deliveries dead-lettering (1h)
- **Context:** Merchant integrations are losing events. Inspect the DLQ console and replay after the cause is fixed.
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Webhook Dead Letter Burn Rate Slow

- **Alert:** `WebhookDeadLetterBurnRateSlow` (`alerts.rules.yml`, severity `ticket`)
- **Means:** Webhook dead-letter rate above 2% sustained over 6h
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## Webhook Delivery Failing

- **Alert:** `WebhookDeliveryFailing` (`alerts.rules.yml`, severity `ticket`)
- **Means:** One in five webhook deliveries failing
- **First look:** Grafana → the dashboard panel carrying this series, then Loki `{service="app"} |= "error"` over the same window, then Sentry/GlitchTip for the matching scope.
- **Stand down:** resolve the cause, confirm the series recovers for two evaluation windows, then expire any silence.

## ErrorTrackerIssue

- **Alert:** `ErrorTrackerIssue` (posted by `/api/public/error-alert`, severity `ticket`, or `page` when the issue level is `fatal`)
- **Means:** GlitchTip or self-hosted Sentry matched an issue rule and forwarded it into Alertmanager. The `source` label says which backend; the `issue_url` annotation opens the issue.
- **First look:** open `issue_url` and read the stack trace and the `scope`/`release`/`commit` tags, then Loki `{service="app"} |= "exception"` for the same trace id, then the Grafana panel for the affected subsystem.
- **If the issue body contains any personal data:** treat it as an incident — the scrubber missed a path. Delete the event, add the field name to `FORBIDDEN_EVENT_FIELDS` in `src/lib/error-tracking.ts`, and ship the fix before re-enabling the rule.
- **Stand down:** fix or triage the issue in the backend UI, confirm no new events for two evaluation windows, then expire any silence. Silence with `alertname="ErrorTrackerIssue", source="<backend>"` and never for longer than one working day.
