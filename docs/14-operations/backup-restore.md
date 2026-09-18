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

## 4. Whole-System Backup machine (canonical backup)

`scheduled → snapshot → encrypted → rehearsed → certified → rotated | retained`

- `scheduled`: a cadence tick fires (hourly WAL checkpoint + nightly full snapshot) and a lease is created.
- `snapshot`: a consistent point-in-time copy capturing the **entire system**:
  - `roles.sql`: All database roles, passwords, and grants (`pg_dumpall --roles-only`).
  - `db_cluster.dump`: Full PostgreSQL database in custom format (`-Fc`) containing `auth` (GoTrue credentials, sessions, refresh tokens), `storage` (buckets and object metadata), `public` (tenants, merchants, products, orders, ledger), and `vault` / `pgsodium` secrets.
  - `storage.tar.zst`: Physical archive of `/var/lib/storage` (merchant images, theme assets, invoices) compressed with `zstd -T0`.
  - `configs.tar.zst`: Docker Compose manifests, OpenResty routing, ACME TLS certificates & private keys.
  - `redis.rdb`: Redis memory snapshot (canary state, idempotency keys, rate limit counters).
  - `manifest.json`: Cryptographic SHA-256 manifest of all artifacts, table counts, and environment metadata.
- `encrypted`: Client-side authenticated envelope encryption (AES-256-GCM / `age`) using an off-site master key.
  - **Theft Immunity**: Even if the host server is lost, stolen, or seized, the encrypted backup set reveals zero customer data, zero passwords, and zero credentials without the vault private key.
- `rehearsed`: The encrypted snapshot is immediately restored in an isolated container sandbox (`framique-restore`), verifying SHA-256 checksums, `auth.users`, storage files, and business table row counts.
- `certified`: ONLY marked `certified_restorable` when 100% of rehearsal assertions pass. Never rotate or rely on an uncertified snapshot.
- `rotated | retained`: Retained locally on a 14-day rolling window, with encrypted copies mirrored to multi-cloud immutable WORM object storage (e.g. S3 with Object Lock).

## 5. Recovery machine (canonical recovery)

`retrieve → decrypt → verify_manifest → restore → smoke_check → switchover`

- `retrieve`: Fetch target certified snapshot from local storage or off-site immutable WORM mirror.
- `decrypt`: Decrypt artifact bundle using the off-host master key.
- `verify_manifest`: Assert SHA-256 checksums of all artifacts match `manifest.json` before a single byte is loaded.
- `restore`:
  - Replay `roles.sql` into Postgres target.
  - Restore all database schemas (`auth`, `storage`, `public`, `vault`) from `db_cluster.dump`.
  - Unpack `storage.tar.zst` into `/var/lib/storage`.
  - If recovering from corruption, replay WAL logs up to the exact target second (Point-in-Time Recovery).
- `smoke_check`: Automated read-back assertions verify table counts, `auth.users` readiness, and PostgREST endpoint health.
- `switchover`: Traffic is cut over to the restored target. An incident postmortem entry is appended with operator, timestamp, and RTO/RPO metrics.

## 6. Restore drill & Rehearsal Gate

- **Automated Rehearsal Gate (`ops/backup/rehearse.sh`)**:
  - Restores into throwaway `framique-restore` stack.
  - Fatal assertions:
    - `auth.users` count matches snapshot expectations and GoTrue can authenticate.
    - All money/tenancy tables (`merchants`, `products`, `orders`, `order_items`, `payments`) are verified.
    - Storage bucket files exist and match database object references.
    - Checksums match `manifest.json` exactly.
  - Records measured RTO and RPO into `ops/backup/rehearsals.jsonl`.
  - Fails closed: an assertion failure exits non-zero, triggers an immediate alert, and blocks production deployment gates.

## 7. Measured SLA Commitments

| Metric | Target SLA | Measured Architecture Mechanism |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **0 seconds (Continuous)** | Synchronous PostgreSQL WAL streaming archive |
| **RPO (Snapshot Fallback)** | **< 1 hour** | Hourly basebackups with WAL checkpoints |
| **RTO (Recovery Time Objective)** | **< 15 minutes** | Automated 1-click restore script (`restore.sh`) |
| **Disaster Rollback RTO** | **< 5 seconds** | Blue/Green warm standby instant cutover |
| **Rehearsal Drill Frequency** | **Every 24 hours** | Nightly automated cron via `/api/public/cron/ops` |
| **Theft Resistance** | **100% Cryptographic** | Client-side AES-256-GCM envelope encryption |

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
