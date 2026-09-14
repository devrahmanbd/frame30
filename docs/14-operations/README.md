# 14 — Operations

Status: Planning · Slice S7+ (platform internal) · Gate: not yet approved (paper review done — sign-off pending owner)

Owners: Platform-Operations · Billing/Plan-service (subscription state in `docs/16-product-pricing`) · 05-consent (senders/opt-out) · 00-meta (SLO/incident registry) · Data-retention (90d/3y horizon)

References: `docs/01-architecture` (infra), `docs/16-product-pricing` (plans/billing — canonical subscription machine), `docs/00-meta/design-system.md` §10, `docs/00-meta/audit-verdict.md` (§12 below), `docs/15-e2e/README.md` (loop house, failure arm), `docs/13-export-sdk` (exporter), `docs/05` (consent/default channels), `docs/17-owner-console` (owner shell reads `queue_jobs(snapshot)` + DLQ read-only; flush/retry only via this plan's API)

## 1. Purpose

Internal company ops + platform reliability: manage plans/billing, RU tenant
limits, abuse, messaging gateways (email/SMS/WhatsApp senders), feature flags,
maintenance windows, support tickets to tenants, job runner (BullMQ)
dashboard, plus internal data tools for eng. Backup & restore is its own
sub-plan (`backup-restore.md`) owning the two canonical machines in §4.

## 2. Features / surfaces

- **Tenant management**: status (trial/active/paused), billing via `06-payments` payouts, seat/license sync. Subscription state is owned by `docs/16-product-pricing` — this README links, never duplicates (00-meta §3).
- **Messaging console**: pooled email/SMS/WhatsApp subaccounts; retry, per-tier quotas, BCC, templates (BD SMS length = 160/1536 collapse), Bangla UCS map.
- **Job queue**: BullMQ dashboard (backlog, stalled, DLQ), manual trigger.
- **Config / feature flags**: per-tenant rollout, kill switch for ML/fraud/ads.
- **Disaster**: runbook, SLOs, backup & restore sub-plan (`backup-restore.md`).
- **Support inbox**: tenant tickets, SLA red/amber, assign, review log.

## 3. Data model (tenant-scoped) + API surface

Schema, RLS-bound to `merchant_id` on every tenant query:

- `products_plans`, `subscriptions` — lifecycle owned in `16`; read-only mirror here.
- `tenant_limits` — per-tier quotas; over-limit writes return `plan_limit_exceeded` (16), never truncation.
- `feature_flags` — per-tenant rollout, kill switches.
- `sms_senders`, `message_logs` — pooled subaccounts, quota/BCC, Bangla UCS map, exact UCS-2 cost preview.
- `queue_jobs(snapshot)` — BullMQ dashboard snapshot, stalled/backlog/DLQ.
- `incidents`, `runbooks`, `maintenance_windows` — incident ledger, runbook steps, window registry.

API surface is internal; every ops action writes an audit row (operator id +
reason). No client-trusted decision: quotas, limits, and subscription state
change only through the owning services.

## 4. State transitions

Canonical machines (owned here; no parallel copies — 00-meta §3):

- **Backup** (sub-plan `backup-restore.md`): `scheduled → snapshot → validated → rotated | retained`.
- **Recovery** (sub-plan `backup-restore.md`): `restore → verified → switchover`.
- **Incident**: `open → investigated → mitigated → resolved → postmortem`. "Resolved" is only posted after switchover/backfill finishes (state, not color). Reachable _from_ recovery but is a distinct machine.
- **Job** (BullMQ): delegated to the queue runtime — `queued → active → completed | failed → (retried | dead)`: stalled jobs auto-re-queue with poison-pill after a named ceiling (TBD, owner Platform-Operations).
- **Subscription**: `trial → active → overdue → dunning → paused → cancelled` (± plan_changed) — **canonical in `docs/16-product-pricing`**, referenced here only. `paused` = storefront read-only; `cancelled` = data export window then anonymized delete (retention §7 / `docs/05` deletion contract).

## 5. Events

`subscription.activated|paused|cancelled` (canonical events in `16`),
`incident.opened`, `runbook.polled`, `queue.dead-lettered`, `sms.failed`,
`feature.changed`, `tenant.over_limit`. All tenant-scoped; audit trail records
operator + reason.

## 6. Geometry & data-store swap story

- Messaging: email/SMS/WhatsApp providers are pooled subaccounts behind a
  sender abstraction — a provider swap swaps the adapter, not the quota/UCS
  rules; provider failover is exercised in the ops console and `15-e2e`
  failure arm.
- Queue: BullMQ is the current runner; if swapped, job/incident records travel
  with the machine (swap-out story per 00-meta §4).
- Restore: off-site storage host is a named TBD (owner Platform-Operations,
  sub-plan §7); mirror/off-site retention owned by Data-retention.

## 7. Failure & recovery

- SMTP/gateway down → the queue keeps accepting (never drops); status shows a
  retrying chip; backlog beyond the hard limit pauses writes but never blocks
  reads.
- SMS quota error → provider failover; dead-letter alert.
- Incidents: open → 180s blast page; runbook links in the alert.
- Backup failure → lease in DLQ with reason, at-least-once (sub-plan).
- A provider outage that cancels messages does not cancel the charge — refunds
  follow `docs/06` with idempotent keys.
- Reconciliation jobs rerun only after a drain, never mid-flight.

## 8. Consent & privacy

- Messaging is sent via `05-consent` default channels only: transactional
  allowed, marketing opt-in; opt-out honored everywhere; BCC/audit kept.
- SMS editor live-previews the exact UCS-2/GSM cost the provider will bill —
  "1 SMS" only when the payload costs 1.
- Tenant list and incident timeline expose no PII; dead-letter payloads appear
  as canonicalized, truncated "voyage" links — never raw bodies.
- Cancelled-tenant anonymization follows `docs/05` deletion contract and
  confirms before final purge; logs are PII-minimal.

## 9. A11y & performance

- Internal admin = same design kit, terser. WCAG 2.2 AA minimum; status never
  color-only (icon + badge + color; same semantics as storefront).
- Realtime via SSE throttled (5s); tables virtualized >200 rows; queue
  counter flash on change matches reduced-motion collapse (design-system §5).
- Incident timeline uses tabular durations and mono ids; keyboard nav, screen-reader usable.

## 10. Design decisions per surface

### Design guidelines — ops consoles, SMS editor (UCS-2/cost metric), SM queue health, incident timeline, tenant list

- Intent: manager terminals make the boring _fast_; numbers are honest; Bangla + English both.
- Key surfaces: trace panel, dead-letter card with count + retry, queue guard channel with spinning but not garish, incident timeline like email threads.
- Palette emphasis: teal for healthy; amber retry-once; red >critical — same meaning as the storefront for cognitive consistency.
- Typography: mono for ids/secrets; tabular durations; widget titles Bangla (Noto Sans Bengali variable).
- Density: dense tables (nav-friendly), iconic status column.
- Motion: queue counter flash on change (reduced→static), incident dot slide; reduced-motion collapses to opacity.
- A11y: status not color-only (icons + badge), table keyboard nav.
- Performance: realtime via SSE throttle 5s; dead-letter table virtualized; budgets from design-system §8.
- Anti-slop check: SMS editor counts "1 SMS" incl. exact UCS-2 cost; a "runbook" step counts 3,2,1; queue dead-letter shows the whole JSON voyage as an expandable line link.

## 11. Testing gates

Contract-first, restricted to EXISTING loops in `docs/15-e2e`:

- `admin_loop`: tenant lifecycle (trial → cancelled with anonymization); paused-state read-only store; incident workflow (open → investigating → resolved once backfill done); replay idempotency from dead-letter; SMS preview count — provider-billed cost.
- `market_loop` re-runs the same against marketplace purchases.
- Failure arm: provider-down, queue dead-letter, refund provider reject, **backup → restore** (`docs/15-e2e` §13).
- Any NEW check must register a new `e2e_<area>_loop` in `docs/15-e2e` (TBD + owner), e.g. a cyclic restore drill beyond the failure arm would be `e2e_ops_backup_restore_loop`, TBD, owner Platform-Operations.

## 12. Audit verdict map

Follow-up record for `00-meta/audit-verdict.md`; every line verifiable in this plan's own sections.

- **Section audited**: platform ops — no run-time service ships today; docs + `.e2e/*.spec.ts` contract suites.
- **RLS / tenancy**: every ops query `merchant_id`-scoped; tenant list / incident timeline expose no raw data (§3, §8).
- **State transitions**: backup/recovery/incident machines canonical here; subscription canonical in `16` — no parallel copies (§4).
- **Consent**: senders default to opt-in channels; opts from §8 honored; cancelled-tenant anonymization confirms before purge.
- **Money**: SMS/`fmtBDT` charges render via the shared currency helper; plan state only from the plan service; SMS refunds follow `06` machine.
- **Vendor swap**: messaging adapter pool, queue swap-out contract, off-site TBD (§6).
- **Testing gates**: `admin_loop`/`market_loop` + failure arm; backup→restore in the arm (§11).
- **Performance targets**: ops console initial load ≤ 2 s p95; incident timeline render ≤ 1 s p95; backup status poll ≤ 500 ms p95 (§9).
- **Owners**: Rahul-Operations (queue/incident/backup) · Vishal-data (retention/consent) · plan `16` (subscription) · `06` (money movement) · `05` (consent data).

## 13. Residual v0 gaps

- RTO/RPO/drill-frequency as named TBDs (owner Platform-Operations), measured after first approved drill.
- Backup cadence + mirror retention named TBD (owners Platform-Operations / Data-retention).
- Cross-region mirror drill widening beyond the ops console (sub-plan §9).
- Job re-queue poison-pill ceiling named TBD (owner Platform-Operations).

---

## Sign-off

- [ ] Rahul-Operations (queue / incident / backup)
- [ ] Vishal-data (retention / consent)
- [ ] Plan `16` (subscription)
- [ ] Plan `06` (money movement)
- [ ] Plan `05` (consent data)
