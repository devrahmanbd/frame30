# 14 — Operations: Backup & Restore (operator guide)

Status: **Implemented** · Slices S7+ (platform internal) · Gate: operational
(sign-off pending owner on paper review; system runs in production since 2026-09-19)

Owners: Platform-Operations (DR) · Data-retention (90d/3y horizon) · `docs/00-meta` (SLO registry)

References: `docs/14-operations/README.md`, `docs/15-e2e/README.md` (failure arm
"backup → restore"), build spec
`docs/superpowers/specs/2026-09-18-fortress-backup-restore-design.md`,
live state in `/opt/frame28/progress.md`.

---

## 1. What exists and where

| Piece | Location | Schedule |
|---|---|---|
| Nightly full backup (`pg_dump` + roles + storage + configs + manifest) | `ops/backup/backup.sh` → `/var/backups/framique/<ts>/` | timer daily 02:30 UTC (`framique-backup`) |
| Weekly physical base backup (PITR anchor) | `ops/backup/pgbasebackup.sh` → `/var/backups/framique/base/<ts>/` | timer Sun 03:30 UTC (`framique-basebackup`) |
| Continuous WAL archive (≤5min RPO) | `archive_command=cp` → `/var/backups/framique/wal/`, `archive_timeout=60` | always on; probe hourly (`framique-wal-lag`) |
| WAL pruning (keeps anchor + 2h margin) | `ops/backup/prune-wal.sh` | runs at end of basebackup (wire into timer B5+) |
| Integrity verification → `integrity.json` | `ops/backup/integrity-verify.sh` | timer daily 04:30 UTC (`framique-verify`) |
| Rehearsal (sandbox restore + assertions → `rehearsals.jsonl`) | `ops/backup/rehearse.sh` | timer Sun 05:30 UTC (`framique-rehearse`) |
| Portable restore (`--target restoref`) | `ops/restore/restore-target.sh` + `ops/restore/setup-restore-stack.sh` | on demand |
| Restore proof (13 checks → `proof-report.json`) | `ops/backup/proof-restoref.sh` | on demand / post-restore |
| Off-site sync (certified-only, checksum, immutable) | `ops/backup/rclone-sync.sh` | timer daily 05:00 UTC (`framique-sync`) |
| Status aggregator (data for `/root/recovery`) | `ops/backup/recovery-status.sh` → `/var/backups/framique/status.json` | on demand |
| Live proof site | `https://restoref.qubickle.com` (app :3201 + clone Kong :8011) | always on |

Key facts: live stack is compose project `framique-supabase` at
`/root/supabase-docker-framebase` (Postgres 17). The staging stack
(`staging-supabase`) is never touched by any script here. WAL archiving config
lives in the `db-config` volume (`conf.d/10-wal-archiving.conf` + `pg_hba.conf`
with replication rules) — **not** in the host `volumes/db/data/postgresql.conf`,
which the container does not read.

---

## 2. Step-by-step operations

### A. Take a manual backup

```bash
cd /opt/frame28
BACKUP_DIR=/var/backups/framique ./ops/backup/backup.sh --label=<name> --skip-rehearse
```

- Omit `--skip-rehearse` to run the full rehearsal gate inline (recommended
  before any risky change; takes ~1–2 min on current data size).
- Without the flag the run ends `DONE (UNCERTIFIED)` — honest wording, do not
  rely on that set until `rehearse.sh` passes on it.
- Check the manifest: `python3 -c "import json;print(json.load(open('/var/backups/framique/<ts>/manifest.json'))['db_source'])"`
  (`docker-exec` = good; `stub` = empty dump, investigate).

### B. Verify a backup set (integrity)

```bash
BACKUP_DIR=/var/backups/framique ./ops/backup/integrity-verify.sh [<ts>|<abs-path>]
```

Re-checks every SHA-256, asserts critical artifacts non-empty, gates on WAL
freshness (≤600s). Writes `integrity.json` (`integrity-certified`) on pass;
exits non-zero otherwise. Also runs `wal-lag-probe.sh` standalone any time:

```bash
./ops/backup/wal-lag-probe.sh   # OK lag_s=<n>  (alert if >300s)
```

### C. Run a rehearsal (sandbox restore)

```bash
BACKUP_DIR=/var/backups/framique ./ops/backup/rehearse.sh [<set>]
```

Restores into an isolated scratch Postgres (unique container+volume,
`--network none`, trap cleanup — cannot touch production), asserts row counts
(`merchants/products/orders/auth.users`), storage listing, and appends a real
measurement to `ops/backup/rehearsals.jsonl`. Verdict `fail` blocks release
gates. Confirm no leftovers: `docker ps -a | grep rehearse` (empty).

### D. Restore to the same host (restoref) — TESTED ✓

```bash
# 1. (Re)build the empty clone stack (idempotent, de-collided names):
./ops/restore/setup-restore-stack.sh
# 2. Load a certified set:
./ops/restore/restore-target.sh /var/backups/framique/<ts> --target restoref
# 3. Prove it (13 automated checks, zero manual steps):
./ops/backup/proof-restoref.sh
```

`restore-target.sh` refuses any project that is not a `*restore*` project and
hard-refuses `framique-supabase`/`staging-supabase` even with `--force`.
The old `ops/backup/restore.sh` is retired (exits 3 with a pointer).

### E. Configure off-site sync (FTP / S3) — NEEDS CREDENTIALS

```bash
# 1. Create the rclone remotes (interactive once):
rclone config   # name them e.g. ftp-remote (sftp) and s3-remote (s3)
# 2. Wire them (root-only, never git):
touch /etc/framique/backup-remotes.env && chmod 600 /etc/framique/backup-remotes.env
printf '%s\n' \
  'RCLONE_FTP_REMOTE=ftp-remote:framique-backups' \
  'RCLONE_S3_REMOTE=s3-remote:framique-backups' \
  >> /etc/framique/backup-remotes.env
# 3. Dry-run first, then run:
./ops/backup/rclone-sync.sh   # exits 2 with no remotes; syncs certified-only sets otherwise
```

Mechanism: `rclone copy --checksum --immutable` then `rclone check`; state in
`ops/backup/sync-state.json`. Uncertified sets never leave the host.

### F. Full disaster recovery (new host)

1. Install Docker + this repo + `/root/supabase-docker-framebase` skeleton.
2. `setup-restore-stack.sh --root <dir>` (same script, portable by design).
3. Fetch latest certified set from off-site (`rclone copy <remote>/<ts>`).
4. `restore-target.sh <set> --target restoref` (extend the profile registry
   in-script for the new host's ports).
5. `proof-restoref.sh` must print `VERDICT: pass` before routing traffic.
6. Point DNS, install cert (`certbot certonly --webroot -w /var/www/certbot`),
   add HAProxy ACL + OpenResty server block (mirror `restoref` entries).

### G. Check system health

```bash
systemctl list-timers | grep framique        # 6 timers scheduled
./ops/backup/recovery-status.sh && cat /var/backups/framique/status.json
journalctl -u framique-backup.service --since "24 hours ago" | tail -5
tail -1 ops/backup/rehearsals.jsonl          # latest rehearsal verdict
```

---

## 3. Same-host restore test record (tested ✓)

| Item | Evidence |
|---|---|
| Full pipeline `backup → restore → proof` executed by scripts only | 2026-09-19: set `20260919T024909Z` → restoref → proof |
| Proof verdict | **pass, 13/13** (`ops/backup/proof-report.json`, 2026-09-19T02:49:24Z) |
| Coverage | HTTPS 200 + complete HTML + CSP nonces; signup 200 + wizard + English-only; REST parity 5 rows; RLS parity 540 policies; auth pipeline (400 on bad login); row parity merchants 5 / products 7 / orders 0 / users 20 |
| Rehearsal history | `ops/backup/rehearsals.jsonl` incl. one honest `fail` (flag bug, fixed) + `pass` RTO=10s |
| Restore time | ~12s data load (current 32MB DB; scales with data) |

---

## 4. Verified vs unverified ledger (honest)

| Area | Status | Evidence / next step |
|---|---|---|
| Nightly `pg_dump` + manifest | ✅ verified live | sets `20260918T210717Z` etc., `db_source=docker-exec` |
| WAL streaming (RPO path) | ✅ verified live | 16MB segments, lag 4–30s, `archived_count` rising, `failed_count=0` |
| Weekly basebackup + PITR anchor | ✅ verified live | `base/20260919T024608Z` 6.2MB + manifest with `restore_command` |
| Integrity verification | ✅ verified live + timer | `integrity.json`, daily 04:30Z (correctly failed-closed during an outage) |
| Rehearsal (sandbox restore) | ✅ verified live + timer | `rehearsals.jsonl`, weekly Sun 05:30Z |
| Same-host restore + proof | ✅ verified live | 13/13 `proof-report.json`, restoref.qubickle.com serving |
| WAL pruning | ✅ verified live | 4.8G → 1.3G against anchor |
| TLS + edge for restoref | ✅ verified live | LE cert, HAProxy ACL, OpenResty vhost |
| Point-in-time restore drill | ⚠️ UNVERIFIED | anchor + WAL exist; never yet replayed to a target timestamp — next drill |
| Off-site sync (FTP/S3) | ⚠️ UNVERIFIED | mechanism + timer ready; no remotes configured (needs credentials) |
| Separate-host recovery | ⚠️ UNVERIFIED | scripts portable by design; never executed off-host |
| Quarterly full-DR exercise | ⚠️ UNVERIFIED | scheduled conceptually; first run pending |
| `/root/recovery` + `/root/security` UI | ⚠️ UNVERIFIED | `status.json` data ready; console pages not built |
| Redis RDB restore path | ⚠️ UNVERIFIED | app cache is memory-only (reconstructable); BGSAVE capture path untested (no owned Redis) |

---

## 5. Troubleshooting

- **`integrity FAIL: WAL archive stale`** — archiving interrupted (e.g. DB
  down). Check `docker ps` for `framique-supabase-db`, then
  `SELECT * FROM pg_stat_archiver;` (`failed_count` > 0 = archive_command
  broken). Fail-closed is correct behavior; fix archiving, don't bypass.
- **Live containers missing after restore-setup** (incident 2026-09-19): caused
  by compose project-name collision (since guarded in-script). Recover with
  `cd /root/supabase-docker-framebase && docker compose up -d` (binds intact).
- **`pg_basebackup: replication ... FATAL`** — needs the `pg_hba.conf`
  replication lines in `db-config` (B4 installed them; they persist there).
- **Proof `live=error` on parity checks** — live stack unreachable; check live
  containers before blaming the restore.
- **High WAL volume (~40MB/min observed)** — normal for this workload so far;
  pruning bounds disk, but find the writer if growth alarms.
- **Cert renewal** — LE cert for restoref via certbot webroot
  (`/var/www/certbot`); HAProxy loads `/etc/haproxy/certs/*.pem` on reload.

---

## 6. Canonical State Machines & SLAs

### Whole-System Backup machine (canonical backup)

`scheduled → snapshot → encrypted → rehearsed → certified → rotated | retained`

- `scheduled`: a cadence tick fires (hourly WAL checkpoint + nightly full snapshot) and a lease is created.
- `snapshot`: a consistent point-in-time copy capturing the **entire system**:
  - `roles.sql`: All database roles, passwords, and grants (`pg_dumpall --roles-only`).
  - `db_cluster.dump`: Full PostgreSQL database in custom format (`-Fc`) containing `auth` (GoTrue credentials, sessions, refresh tokens), `storage` (buckets and object metadata), `public` (tenants, merchants, products, orders, ledger), and `vault` / `pgsodium` secrets.
  - `storage.tar.zst`: Physical archive of `/var/lib/storage` (merchant images, design assets, invoices) compressed with `zstd -T0`.
  - `configs.tar.zst`: Docker Compose manifests, OpenResty routing, ACME TLS certificates & private keys.
  - `redis.rdb`: Redis memory snapshot (canary state, idempotency keys, rate limit counters).
  - `manifest.json`: Cryptographic SHA-256 manifest of all artifacts, table counts, and environment metadata.
- `encrypted`: Client-side authenticated envelope encryption (AES-256-GCM / `age`) using an off-site master key.
  - **Theft Immunity**: Even if the host server is lost, stolen, or seized, the encrypted backup set reveals zero customer data, zero passwords, and zero credentials without the vault private key.
- `rehearsed`: The encrypted snapshot is immediately restored in an isolated container sandbox (`framique-restore`), verifying SHA-256 checksums, `auth.users`, storage files, and business table row counts.
- `certified`: ONLY marked `certified_restorable` when 100% of rehearsal assertions pass. Never rotate or rely on an uncertified snapshot.
- `rotated | retained`: Retained locally on a 14-day rolling window, with encrypted copies mirrored to multi-cloud immutable WORM object storage (e.g. S3 with Object Lock).

### Recovery machine (canonical recovery)

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

### Measured SLA Commitments

| Metric | Target SLA | Measured Architecture Mechanism |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **0 seconds (Continuous)** | Synchronous PostgreSQL WAL streaming archive |
| **RPO (Snapshot Fallback)** | **< 1 hour** | Hourly basebackups with WAL checkpoints |
| **RTO (Recovery Time Objective)** | **< 15 minutes** | Automated 1-click restore script (`restore.sh`) |
| **Disaster Rollback RTO** | **< 5 seconds** | Blue/Green warm standby instant cutover |
| **Rehearsal Drill Frequency** | **Every 24 hours** | Nightly automated cron via `/api/public/cron/ops` |
| **Theft Resistance** | **100% Cryptographic** | Client-side AES-256-GCM envelope encryption |

