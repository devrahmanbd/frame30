# Self-hosted Supabase (Phase 10)

Framique runs its own Postgres, auth, storage and gateway. Nothing in the
application knows the difference: the app reads `SUPABASE_URL` and the two API
keys, and that is the entire coupling. This page is the operator contract.

Related: [`ops/README.md`](../../ops/README.md) (bring-up order, observability),
[`backup-restore.md`](./backup-restore.md) (the machines and the numbers policy).

---

## 1. Bring-up

```bash
docker network create framique

cp supabase/docker/.env.example supabase/docker/.env   # fill every value
cd supabase/docker && docker compose up -d && cd -

bun run db:migrate            # applies migration/ then supabase/migrations/
bun run db:migrate --check    # must print "schema up to date"
```

Services and pinned tags live in `supabase/docker/docker-compose.yml`:
Postgres 15.8, GoTrue 2.170, PostgREST 12.2, Realtime 2.34, Storage 1.19,
imgproxy 3.28, postgres-meta 0.86, Kong 2.8. Tags are pinned on purpose —
`latest` on an auth service is an outage waiting for a quiet weekend.

## 2. Secrets

Generated per environment, never committed. The full list is
`supabase/docker/.env.example`; the shapes that matter:

| Value | How to produce |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `JWT_SECRET` | `openssl rand -hex 32` (≥32 chars) |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | JWTs signed with `JWT_SECRET` from the upstream key generator |
| `REALTIME_ENC_KEY`, `REALTIME_SECRET_KEY_BASE` | `openssl rand -hex 32` / `-hex 64` |
| SMTP credentials | from the mail provider |

Rotating `JWT_SECRET` invalidates every session and both API keys. Plan it as a
sign-out, never as a hotfix.

## 3. Migrations

`scripts/db-migrate.mjs` is the only way schema reaches a database.

- Applies `migration/*.sql` then `supabase/migrations/*.sql` in filename order.
- Records each file in `public.schema_migration_files` with a sha256.
- Editing an already-applied file is a hard error — write a new migration.
- `--check` fails CI when anything is pending; `--dry-run` prints the plan.

Applying the whole set to an empty instance is one command, which is the
property that makes disaster recovery and a fresh region identical operations.

## 4. Network isolation and TLS

- Postgres is `expose`d on the compose network only. It is never published to
  the host or the internet; psql access is `docker compose exec db`.
- Kong binds `127.0.0.1:8000`. TLS is terminated by the edge proxy in front of
  it (`SUPABASE_PUBLIC_URL`), so no certificate material lives in the stack.
- The `service_role` key is in Kong's `admin` ACL group and never leaves the
  server. `anon` is publishable and constrained by RLS.
- Rate limits sit on the gateway routes (`rest`, `auth`, `storage`) in
  `supabase/docker/kong.yml` as a floor under the application's own limiter.

## 5. Backups

`ops/backup/backup.sh` (nightly, 03:10 host cron):

- `pg_dump -Fc` of the database, `pg_dumpall --roles-only` for globals,
  a zstd tar of the storage volume.
- A `manifest.json` with sha256 and byte size per artifact — the restore path
  verifies against it and refuses a mismatch.
- Verifies the dump lists table data before declaring success, then mirrors the
  set to `OBJECT_STORE_TARGET` (rclone remote) and rotates local copies after
  `BACKUP_RETAIN_DAYS` (default 14). Off-site copies are never rotated here.

```
10 3 * * *  BACKUP_DIR=/var/backups/framique /srv/framique/ops/backup/backup.sh
40 3 * * 0  /srv/framique/ops/backup/rehearse.sh
```

## 6. Restore and the rehearsal

`ops/backup/restore.sh <set-dir>` restores into the throwaway
`framique-restore` project. It refuses any other target without `--force`, so a
tired operator cannot flatten production with an arrow-up.

`ops/backup/rehearse.sh` is the drill and the evidence:

1. Picks the newest set, restores it into the rehearsal stack.
2. Read-back assertions: row counts on `merchants`, `products`, `orders`,
   `order_items`, `payments`, and a non-empty `orders` check — an empty restore
   otherwise "succeeds".
3. Appends `{rehearsed_at, backup, rto_seconds, rpo_seconds, verdict}` to
   `ops/backup/rehearsals.jsonl`, then tears the stack down.

Exit code is the verdict; wire it to the same alert path as a page. RTO/RPO
targets stay `TBD + owner` (see `backup-restore.md` §7) until the first four
rehearsals give a measured baseline — we publish measurements, not wishes.

## 7. Pointing the app at it

```
SUPABASE_URL=https://api.framique.com
SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
VITE_SUPABASE_URL=https://api.framique.com
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
```

No code change, no build flag. After the switch, the acceptance run is: a full
demo-store checkout against the self-hosted stack, the RLS matrix test green,
and one passing rehearsal recorded in `rehearsals.jsonl`.

---

## 8. The release check

One command decides whether this stack may be released:

```bash
bun run selfhost:preflight          # anywhere, incl. CI (part of `bun run gates`)
bun run selfhost:preflight:host     # on the target machine, before compose up
```

Static half (CI, guarded by `src/lib/selfhost-preflight.test.ts`): every compose
and rule file parses, every bind mount resolves against its own compose file,
every image tag is pinned and never `latest`, Postgres is unpublished, Kong binds
loopback and rate-limits the public routes, `service_role` is never in the `anon`
group, backup/restore/rehearse are present and executable, and every `${VAR}` a
stack templates is documented in the env template shipped beside it
(`ops/.env.example`, `supabase/docker/.env.example`).

Host half (`--host`): the file-mounted secrets exist at mode 600, the operator
environment is set, and an error backend DSN is configured.

Then, with the stack up, the three live verifiers close the release:

```bash
bun run db:migrate:check   # schema up to date
bun run obs:verify         # 13 checks: prometheus, loki, grafana, alertmanager
bun run err:verify         # GlitchTip/Sentry reachable and scrubbing
```

Preflight is deliberately a different question from those three: it fails on a
box with nothing running, which is exactly when a bad config must be caught.
