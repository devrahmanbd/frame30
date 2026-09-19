#!/usr/bin/env bash
# Fortress U2: prune WAL segments older than the oldest base backup.
#
#   ops/backup/prune-wal.sh
#
# PITR needs: latest base backup + every WAL segment since its START WAL.
# Anything older is unrecoverable dead weight. Computes the minimum START WAL
# across all retained base backups and deletes older segment files.
# Never deletes: the newest segment, files from the last 2 hours (safety
# margin against clock skew), anything not matching the 24-hex pattern.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
WAL_DIR="${WAL_DIR:-$BACKUP_DIR/wal}"
BASE_DIR="$BACKUP_DIR/base"

[ -d "$WAL_DIR" ] || { echo "[prune-wal] no WAL dir, nothing to do"; exit 0; }

# Minimum START WAL across retained base backups.
min_start=""
for m in "$BASE_DIR"/*/manifest.json; do
  [ -f "$m" ] || continue
  setdir=$(dirname "$m")
  [ -f "$setdir/base.tar.gz" ] || continue
  start_lsn=$(tar -xzOf "$setdir/base.tar.gz" backup_label 2>/dev/null | grep -oP 'START WAL LOCATION: \K[0-9A-F/]+' | head -1 || true)
  [ -n "$start_lsn" ] || continue
  loghex=$(echo "$start_lsn" | cut -d/ -f1)
  offhex=$(echo "$start_lsn" | cut -d/ -f2)
  segno=$(python3 -c "print(int('$offhex', 16) // 16777216)")
  segname=$(python3 -c "print('00000001' + format($segno, '08X'))")
  if [ -z "$min_start" ] || [[ "$segname" < "$min_start" ]]; then
    min_start="$segname"
  fi
done

[ -n "$min_start" ] || { echo "[prune-wal] no base backups with readable START WAL; keeping everything"; exit 0; }

now=$(date +%s)
deleted=0; kept=0
for f in "$WAL_DIR"/*; do
  base=$(basename "$f")
  [[ "$base" =~ ^[0-9A-F]{24}$ ]] || { kept=$((kept+1)); continue; }
  if [[ "$base" < "$min_start" ]]; then
    mtime=$(stat -c%Y "$f" 2>/dev/null || stat -f%m "$f")
    if [ $(( now - mtime )) -gt 7200 ]; then
      rm -f "$f" && deleted=$((deleted+1)) || true
      continue
    fi
  fi
  kept=$((kept+1))
done
echo "[prune-wal] anchor=$min_start deleted=$deleted kept=$kept"
