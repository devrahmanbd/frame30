# 14 — Operations: Backup & Restore (sub-plan)

Status: Planning · Slice S7+ (platform internal) · Gate: not yet approved — paper review done (sign-off pending owner)

Owners: Platform-Operations (DR) · Data-retention (90d/3y horizon) · `docs/00-meta` (SLO registry)

References: `docs/14-operations/README.md` (surface README — this file is its §2 sub-plan), `docs/15-e2e/README.md` (loop house; failure arm "backup → restore"), `docs/00-meta/audit-verdict.md`, `docs/13-export-sdk` (exporter used for any reconciliation)

## 1. Purpose

Backup & restore is the platform's own data-sovereignty guarantee and the
sharpest failure drill in the suite. A tenant's rows must be recoverable to a
consistent, validated point — and that must be _proven_ by a scheduled restore
a human can watch, not merely by a snapshot that exists. This sub-plan owns
the two canonical machines for `docs/14-operations`: backup
(`scheduled → snapshot → validated → rotated | retained`) and recovery
(`restore → verified → switchover`). Neither machine has a parallel copy
elsewhere (00-meta §3: one state machine per phase, owned by its phase README).

## 2. Scope

In scope:

- The backup machine and the recovery machine with their state fields, tenant
  scoping, and event names.
- Backup cadence, retention, RTO/RPO, and drill frequency as **named TBDs with
  owners** — we do not invent SLO numbers at design time; each is a
  `TBD + owner` that becomes a measured number after the first production
  baseline.
- The restore drill: `restore → verified → switchover` executed from the ops
  console, gated on a validated snapshot, and its outcome appended to the
  `incidents` postmortem.
- Relationship to the incident and job machines, which stay canonical in the
  README §4 — the recovery machine is _reached from_ an incident but is not
  the same machine.

Out of scope: the subscription lifecycle (canonical in `docs/16-product-pricing`),
tenant messaging/senders (README messaging console), the E2E loop registry
(locked to `docs/15-e2e`).

## 3. Data & tenancy

- Every backup and restore query carries `merchant_id` scoping with RLS; a
  restore target list is filtered to the tenant, never a bare bulk insert.
- Restored rows are written under the caller's `merchant_id`; there is no
  shared cross-tenant restore target.
- Logs and the incident timeline are PII-minimal; dead-letter payloads appear
  as canonicalized "voyage" links, never raw bodies (README §4).

## 4. Backup machine (canonical backup)

`scheduled → snapshot → validated → rotated | retained`

- `scheduled`: a cadence tick fires and a lease is created — one backup in
  flight per site class. Cadence is a named TBD (owner Platform-Operations).
- `snapshot`: a consistent point-in-time copy is created (WAL/full snapshot +
  checksum), stored per-tenant, and state is observable on the jobs-health
  panel.
- `validated`: the snapshot is verified — checksum, read-back, spot row-count —
  not merely copied. **Never rotate an unvalidated snapshot**, and state
  `validated` is required before any restore may begin.
- `rotated | retained`: rotation applies the retention policy; retained copies
  cover the analytics horizon (90d raw → 3y aggregate, `docs/09-analytics`).
  Retention rules are measured and owned, never invented.

A failure anywhere lands the lease in the ops DLQ with a reason (at-least-once,
never silent skip) and renders a status chip, never a color-only state
(README §9).

## 5. Recovery machine (canonical recovery)

`restore → verified → switchover`

- `restore`: a target site/off-site snapshot is selected; tenant rows are
  restored to the target.
- `verified`: read-back checksums, row counts, and an E2E smoke check pass;
  `verified` is only reached on evidence.
- `switchover`: read/write is flipped to the restored target; writes resume;
  the run (timestamp, checksum, operator) is appended to the `incidents`
  postmortem. An incident may not be `resolved` until switchover completes and
  the post-backfill finishes (state, not color).

If switchover fails, recovery returns to the `latest validated` backup — never
to an unvalidated snapshot — and the failure is recorded (README §7).

## 6. Restore drill

- The drill is scheduled from the ops console and creates a maintenance
  window entry; it runs restore → validate → switchover on a recent snapshot
  in a staging target.
- The suite's failure arm already includes **backup → restore** (`docs/15-e2e`
  §13); this drill is the live companion and must pass before a release claim.
- Any _new_ cyclic loop beyond the existing loops must be registered in
  `docs/15-e2e` as an `e2e_<area>_loop` with a TBD + owner (README §11), not
  invented inline.

## 7. Numbers policy (TBD + owner)

| Value                          | Owner                     |
| ------------------------------ | ------------------------- |
| Snapshot cadence               | TBD (Platform-Operations) |
| Off-site / mirror retention    | TBD (Data-retention)      |
| RTO (recovery time objective)  | TBD (Platform-Operations) |
| RPO (recovery point objective) | TBD (Platform-Operations) |
| Drill frequency                | TBD (Platform-Operations) |
| Rotate/retain rule values      | TBD (Data-retention)      |

No figure above is a design-time guess; each becomes a measured baseline after
the first approved drill, per `docs/00-meta` §4.

## 8. Events

`backup.scheduled`, `backup.snapshot_taken`, `backup.invalidated`,
`backup.rotated`, `recovery.started`, `recovery.verified`,
`recovery.switched_over`. All tenant-scoped.

## 9. Implemented drill (A4)

- `src/lib/backup-drill.ts` — pure manifest (20 money/tenancy/identity tables),
  FNV-1a artifact checksum, drill verdict and 24h cadence rule.
- `src/lib/backup-drill.server.ts` — snapshot → verification read-back →
  two rows in `ops_backup_runs` (`backup`, `restore_drill`) with checks JSON.
  `runBackupDrillAsOwner` goes through `ownerGate` (admin check, rate limit,
  `platform_audit_log` row). Cron runs it nightly from `/api/public/cron/ops`
  and returns 500 when the drill fails.
- Fatal checks: `manifest_coverage`, `row_counts`, `rows_verified`. Checksum
  drift inside the 2% tolerance is a warning, never a silent pass.
- `src/lib/backup-drill.test.ts` — 15 cases covering deny (row loss, missing
  table, empty artifact, short manifest), replay determinism and the audit note.

## 10. Residual v0 gaps

- RTO/RPO measured SLA numbers (paper TBD → measured owner decision).
- Cross-region mirror drill widening beyond the current ops console.
- Provider offline-baseline split harnessed to the existing `15-e2e` failure
  arm, not new loops.

---
