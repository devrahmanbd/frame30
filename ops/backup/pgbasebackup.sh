#!/usr/bin/env bash
# Fortress U2: weekly physical base backup (PITR anchor for the WAL archive).
#
#   ops/backup/pgbasebackup.sh [--label weekly]
#
# Streams `pg_basebackup -Ft -z` from the live framique-supabase db container
# into $BACKUP_DIR/base/<ts>/ with a SHA-256 manifest. Paired with the
# continuous WAL archive, any point since the base can be recovered with:
#   restore_command = 'cp /var/backups/framique/wal/%f %p'
# (plus optional recovery_target_time for PITR).
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE_FILE="${SUPABASE_COMPOSE_FILE:-/root/supabase-docker-framebase/docker-compose.yml}"
COMPOSE_DIR="$(dirname "$COMPOSE_FILE")"
LABEL="weekly"
for arg in "$@"; do
  case "$arg" in
    --label=*) LABEL="${arg#*=}" ;;
  esac
done

BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/base/$TS"
mkdir -p "$OUT"

echo "[basebackup] Streaming physical base backup: $TS (label=$LABEL)"
docker compose -f "$COMPOSE_FILE" --project-directory "$COMPOSE_DIR" exec -T db \
  pg_basebackup -U postgres -D - -Ft -z -P > "$OUT/base.tar.gz"

sha256sum "$OUT/base.tar.gz" | cut -d' ' -f1 > "$OUT/base.tar.gz.sha256"
cat > "$OUT/manifest.json" <<JSON
{
  "taken_at": "$TS",
  "label": "$LABEL",
  "kind": "pg_basebackup",
  "wal_archive": "/var/backups/framique/wal",
  "pitr_restore_command": "cp /var/backups/framique/wal/%f %p",
  "artifacts": {
    "base.tar.gz": { "sha256": "$(cat "$OUT/base.tar.gz.sha256")", "bytes": $(stat -c%s "$OUT/base.tar.gz") }
  }
}
JSON
echo "[basebackup] SUCCESS: $OUT/base.tar.gz ($(stat -c%s "$OUT/base.tar.gz") bytes)"
