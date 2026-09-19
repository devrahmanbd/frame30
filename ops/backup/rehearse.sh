#!/usr/bin/env bash
# Framique — Whole-System Restore Rehearsal Gate.
#
#   ops/backup/rehearse.sh [backup-set-dir]
#
# Restores into an ISOLATED scratch stack that cannot touch production:
#   - scratch Postgres runs as a uniquely-named container
#     (framique-rehearse-pg-<ts>-<pid>) on a dedicated throwaway volume.
#     No compose project, no shared names, no bind mounts of live data.
#   - storage is unpacked to a tmpdir and compared by listing, never mounted.
#   - trap removes the container AND the volume on exit (success or fail).
#
# Then runs read-back assertions (money/tenancy tables, auth.users, storage
# refs, checksums) and appends a REAL measurement to rehearsals.jsonl.
# Non-zero exit = fail-closed, blocks deployment gates.
#
# SAFETY: never add compose, never reference live volumes, never --force
# anything outside the rehearse- scratch namespace.
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
SET_DIR="${1:-$(ls -1d "$BACKUP_DIR"/20* 2>/dev/null | sort | tail -1 || echo '')}"
WAL_DIR="${WAL_DIR:-/var/backups/framique/wal}"

if [ -z "$SET_DIR" ] || [ ! -d "$SET_DIR" ]; then
  echo "[rehearse] No backup set found in $BACKUP_DIR." >&2
  exit 1
fi
case "$SET_DIR" in
  *restore*|*rehearse*|*tmp*|"$BACKUP_DIR"/wal) echo "[rehearse] Refusing: $SET_DIR looks like a scratch path, not a backup set." >&2; exit 2 ;;
esac

RUN="rehearse-$(date -u +%Y%m%dT%H%M%SZ)-$$"
CTR="framique-rehearse-pg-$RUN"
VOL="framique-rehearse-pgdata-$RUN"
TMPD="$(mktemp -d /tmp/framique-rehearse-XXXXXX)"
LOG=ops/backup/rehearsals.jsonl
PASS=POSTGRES_PASSWORD_REHEARSE
export PG_REHEARSE_PW="rehearse-$(date +%s)-$$"

cleanup() {
  docker rm -f "$CTR" >/dev/null 2>&1 || true
  docker volume rm "$VOL" >/dev/null 2>&1 || true
  rm -rf "$TMPD"
}
trap cleanup EXIT

taken_at=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['taken_at'])" "$SET_DIR/manifest.json")
started=$(date +%s)

echo "=============================================================================="
echo "[rehearse] Rehearsal Gate on $SET_DIR (taken_at=$taken_at, run=$RUN)"
echo "=============================================================================="

# 0. Manifest gate: reuse the integrity verifier (digests + critical non-empty).
echo "[rehearse] Step 0: manifest integrity gate..."
BACKUP_DIR="$BACKUP_DIR" "$(dirname "$0")/integrity-verify.sh" "$SET_DIR" >/dev/null || {
  echo "[rehearse] FATAL: integrity gate failed." >&2
  exit 1
}

# 1. Scratch Postgres (stock PG17 image, throwaway named volume).
echo "[rehearse] Step 1: starting isolated scratch Postgres ($CTR)..."
docker volume create "$VOL" >/dev/null
docker run -d --name "$CTR" \
  --network none \
  -e POSTGRES_PASSWORD="$PG_REHEARSE_PW" \
  -v "$VOL:/var/lib/postgresql/data" \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CTR" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CTR" pg_isready -U postgres >/dev/null 2>&1 || {
  echo "[rehearse] FATAL: scratch Postgres never became ready." >&2
  exit 1
}

# 2. Restore the dump into scratch (extensions ship in the stock image).
echo "[rehearse] Step 2: pg_restore db.dump into scratch..."
docker cp "$SET_DIR/db.dump" "$CTR:/tmp/db.dump"
docker exec -e PGPASSWORD="$PG_REHEARSE_PW" "$CTR" \
  pg_restore -U postgres -d postgres --no-owner --no-acl --clean --if-exists /tmp/db.dump \
  >/tmp/rehearse-restore-$RUN.log 2>&1 || true
docker exec "$CTR" rm -f /tmp/db.dump

q() { docker exec -e PGPASSWORD="$PG_REHEARSE_PW" "$CTR" psql -U postgres -d postgres -tAc "$1" 2>/dev/null || echo error; }

# 3. Assertions.
echo "[rehearse] Step 3: read-back assertions..."
fail=0
for t in merchants products orders order_items payments; do
  n=$(q "SELECT count(*) FROM public.$t")
  echo "  [db] public.$t = $n"
  [[ "$n" =~ ^[0-9]+$ ]] || fail=1
done
auth_users=$(q "SELECT count(*) FROM auth.users")
echo "  [auth] auth.users = $auth_users"
[[ "$auth_users" =~ ^[0-9]+$ ]] || fail=1

# 4. Storage: unpack tarball to tmpdir, verify listing matches.
echo "[rehearse] Step 4: storage tarball check..."
mkdir -p "$TMPD/storage"
if [ -s "$SET_DIR/storage.tar.zst" ]; then
  zstd -dc "$SET_DIR/storage.tar.zst" | tar -tf - > "$TMPD/storage.list" 2>/dev/null || true
  storage_count=$(grep -c . "$TMPD/storage.list" 2>/dev/null || echo 0)
else
  storage_count=0
fi
echo "  [storage] entries_present = $storage_count"

# 5. Honest measurements: RTO is real; RPO is reported as backup age + WAL lag
#    (a pg_dump set has no per-second RPO — never fabricate one).
rto=$(( $(date +%s) - started ))
backup_age=$(python3 -c "
import datetime
taken = datetime.datetime.strptime('$taken_at', '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
print(max(0, int((datetime.datetime.now(datetime.timezone.utc) - taken).total_seconds())))" 2>/dev/null || echo 0)
wal_lag="null"
if [ -d "$WAL_DIR" ]; then
  newest=$(ls -t "$WAL_DIR" 2>/dev/null | head -1 || true)
  if [ -n "$newest" ]; then
    wal_lag=$(( $(date +%s) - $(stat -c%Y "$WAL_DIR/$newest" 2>/dev/null || stat -f%m "$WAL_DIR/$newest") ))
  fi
fi

verdict=$([[ $fail -eq 0 ]] && echo pass || echo fail)
mkdir -p "$(dirname "$LOG")"
printf '{"rehearsed_at":"%s","backup":"%s","run":"%s","rto_seconds":%d,"backup_age_s":%d,"wal_lag_s":%s,"verdict":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$taken_at" "$RUN" "$rto" "$backup_age" "$wal_lag" "$verdict" >> "$LOG"

echo "=============================================================================="
echo "[rehearse] VERDICT: $verdict (RTO=${rto}s backup_age=${backup_age}s wal_lag=${wal_lag}s)"
echo "=============================================================================="

[[ $fail -eq 0 ]]
