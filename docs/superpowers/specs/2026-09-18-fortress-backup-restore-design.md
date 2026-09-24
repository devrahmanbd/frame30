# Fortress Backup / Restore / DR — Build Spec (approved 2026-09-18)

Refines `docs/14-operations/backup-restore.md` (Planning, unapproved) into a buildable
system. Normative targets come from the Fortress Architecture doc §17–§21, §37–§40.

## 0. Prior art (read before touching anything)

- `docs/14-operations/backup-restore.md` — machines, events, SLA table (RPO 0/PITR,
  RTO <15min, daily rehearsal). Kept as the product contract; this spec is the build plan.
- `ops/backup/{backup,rehearse,restore,time-machine-daemon,time-machine-snapshot}.sh`
- `src/lib/backup-drill*.ts`, `src/lib/disaster-recovery-drill.server.ts`
- Swarm findings (progress.md GAP-V1…V11): WAL off, no scheduler, synthetic drill
  output, stub redis.rdb, optional off-site, missing /root dashboards.
- Docs consulted (Context7): supabase WAL-G PITR pattern, rclone --checksum/--immutable,
  OpenResty vhost reference is `framebase-framique.conf` in-repo.

## 1. Units (one purpose, one interface, independently testable)

| #   | Unit               | Does                                                                                                                                                                                            | Interface                                     | Depends on                  |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------- |
| U1  | WAL archiving      | Continuous `archive_command=cp` + `archive_timeout=60` → `/var/backups/framique/wal`, lag probe                                                                                                 | `archive_status` + lag check script exit code | Postgres restart (approved) |
| U2  | Full capture       | Weekly `pg_basebackup` + nightly `pg_dump -Fc` + roles + storage tar + configs tar + real Redis BGSAVE copy; SHA-256 manifest; fix `backup.sh` compose path (`/root/supabase-docker-framebase`) | `$BACKUP_DIR/<ts>/` + `manifest.json`         | U1 (WAL dir exists)         |
| U3  | Schedule           | systemd timers: nightly full, weekly base, hourly WAL-lag probe, daily integrity verify                                                                                                         | `systemctl list-timers`, journal              | U2 scripts                  |
| U4  | Off-site sync      | `rclone sync --checksum --immutable` to FTP + S3 (or custom remote), `rclone check` after; only certified sets sync; corrupt sets never leave the host                                          | rclone exit code + check log                  | U2 manifest, U5 verdict     |
| U5  | Rehearsal          | Weekly sandbox restore (throwaway compose) + assertions (row counts, auth.users, storage refs, checksums) → `rehearsals.jsonl`; fail-closed into release gate                                   | JSONL report, exit code                       | U2 artifacts                |
| U6  | Restore (portable) | Parameterized `restore.sh --target={same-host,remote}` (compose project, ports, domain vars); same-host proof now, separate host by vars not scripts                                            | Restored stack health endpoint                | U2/U4 artifacts             |
| U7  | restoref proof     | Same-host Supabase clone + app instance + OpenResty vhost for `restoref.qubickle.com`; automated proof suite (HTTP 200, A/B tenant isolation, row parity, login)                                | Proof report JSON                             | U6                          |
| U8  | Dashboards + docs  | `/root/recovery` + `/root/security` data endpoints; sign off implemented sections of `backup-restore.md`                                                                                        | HTTP JSON, doc status line                    | U3/U5/U7                    |

## 2. Data flow

Postgres → WAL dir + dumps → SHA-256 manifest → local 14-day retention →
integrity verify → rehearsal sandbox → certified sets only → rclone sync
(--checksum --immutable) → FTP + S3 → `rclone check` → restore target.

## 3. Error handling

Every job fail-closed: non-zero exit, structured journal log, alert hook.
Rehearsal failure freezes the release gate. Scheduled path never passes
`--skip-rehearse`. Sync refuses uncertified sets (manifest verdict gate).

Two certification levels (explicit to avoid cadence ambiguity):

- **integrity-certified** (daily job): checksums re-verified, row counts sane →
  eligible for off-site sync.
- **restore-certified** (weekly rehearsal): full sandbox restore + assertions pass →
  eligible as a restore source + required for release-gate green.

## 4. Testing (by the system, zero manual commands)

- WAL lag probe ≤5min (hourly timer).
- Manifest re-verify (daily job).
- Rehearsal assertions (weekly job, U5).
- Proof suite on restoref (U7): status, isolation matrix, parity, login.
- `testfix` loop: `npm test`, max 3 failures per round.

## 5. Loop batches

- B1: U1 (WAL + restart + verify) + U2 fixes (compose path, Redis BGSAVE).
- B2: U3 timers + integrity verify job.
- B3: U5 rehearsal automation (real sandbox, real assertions).
- B4: U6 portable restore + U7 restoref stack + vhost.
- B5: U4 off-site sync + U8 dashboards/docs + final proof.

## 6. Non-goals

Touching the `staging-*` stack. Off-site WORM Object Lock (documented follow-up;
FTP+S3 standard tiers first). Secrets rotation (separate SLO track).
