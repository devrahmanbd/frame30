#!/usr/bin/env bash
# Framique — nightly backup of the self-hosted Supabase stack.
#
#   ops/backup/backup.sh [--label nightly]
#
# Produces one dated set under $BACKUP_DIR:
#   <ts>_db.dump        pg_dump custom format (schema + data, no owner/acl)
#   <ts>_roles.sql      globals: roles and grants
#   <ts>_storage.tar.zst  storage volume snapshot
#   <ts>_manifest.json  checksums, sizes, image tags, duration
#
# The manifest is the contract: a restore is only trusted when every checksum
# in it matches. If OBJECT_STORE_TARGET is set (an rclone remote such as
# `s3:framique-backups`), the set is mirrored off-host after verification.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE="supabase/docker/docker-compose.yml"
LABEL="${2:-nightly}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/$TS"
mkdir -p "$OUT"

started=$(date +%s)
echo "[backup] $TS label=$LABEL -> $OUT"

dc() { docker compose -f "$COMPOSE" "$@"; }

# 1. Database. -Fc so restore can run in parallel and pick objects selectively.
dc exec -T db pg_dump -U postgres -d postgres -Fc --no-owner --no-acl > "$OUT/db.dump"
dc exec -T db pg_dumpall -U postgres --roles-only > "$OUT/roles.sql"

# 2. Storage objects. Read straight off the container volume.
dc exec -T storage tar -C /var/lib/storage -cf - . | zstd -q -T0 -o "$OUT/storage.tar.zst"

# 3. Manifest.
sum() { sha256sum "$1" | cut -d' ' -f1; }
size() { stat -c%s "$1"; }
cat > "$OUT/manifest.json" <<JSON
{
  "taken_at": "$TS",
  "label": "$LABEL",
  "host": "${HOSTNAME:-unknown}",
  "artifacts": {
    "db.dump":         { "sha256": "$(sum "$OUT/db.dump")",        "bytes": $(size "$OUT/db.dump") },
    "roles.sql":       { "sha256": "$(sum "$OUT/roles.sql")",      "bytes": $(size "$OUT/roles.sql") },
    "storage.tar.zst": { "sha256": "$(sum "$OUT/storage.tar.zst")","bytes": $(size "$OUT/storage.tar.zst") }
  },
  "postgres_image": "$(dc images db --format json 2>/dev/null | head -c 400)",
  "duration_s": $(( $(date +%s) - started ))
}
JSON

# 4. Verify before we trust it: the dump must list a table, not just exist.
if ! pg_restore -l "$OUT/db.dump" | grep -q "TABLE DATA"; then
  echo "[backup] FATAL: dump contains no table data" >&2
  exit 1
fi

# 5. Off-site mirror (optional but expected in production).
if [[ -n "${OBJECT_STORE_TARGET:-}" ]]; then
  rclone copy "$OUT" "$OBJECT_STORE_TARGET/$TS" --checksum
  echo "[backup] mirrored to $OBJECT_STORE_TARGET/$TS"
fi

# 6. Rotate local copies only — never the off-site set.
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+$RETAIN_DAYS" -exec rm -rf {} +

echo "[backup] done in $(( $(date +%s) - started ))s"
