#!/usr/bin/env bash
# Fortress SLO-R02: WAL archive freshness probe (hourly timer).
#
#   ops/backup/wal-lag-probe.sh [--warn-secs 300]
#
# Exit 0 when the newest archived segment is fresh, 1 when stale, 2 on
# misconfiguration. Prints one structured line for the journal either way.
set -euo pipefail

WAL_DIR="${WAL_DIR:-/var/backups/framique/wal}"
WARN_SECS="${1:-300}"
[[ "${1:-}" == --warn-secs* ]] && WARN_SECS="${1#*=}"

now=$(date +%s)
if [ ! -d "$WAL_DIR" ]; then
  echo "[wal-lag] CRITICAL dir-missing dir=$WAL_DIR"
  exit 2
fi
newest=$(ls -t "$WAL_DIR" 2>/dev/null | head -1 || true)
if [ -z "$newest" ]; then
  echo "[wal-lag] CRITICAL no-segments dir=$WAL_DIR"
  exit 1
fi
mtime=$(stat -c%Y "$WAL_DIR/$newest" 2>/dev/null || stat -f%m "$WAL_DIR/$newest")
lag=$(( now - mtime ))
if [ "$lag" -gt "$WARN_SECS" ]; then
  echo "[wal-lag] STALE lag_s=$lag warn_s=$WARN_SECS segment=$newest"
  exit 1
fi
echo "[wal-lag] OK lag_s=$lag segment=$newest"
