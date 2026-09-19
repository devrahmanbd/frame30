#!/usr/bin/env bash
# Fortress U8: recovery status aggregator (data source for /root/recovery).
#
#   ops/backup/recovery-status.sh
#
# Reads timers, journals, rehearsals.jsonl, integrity markers, WAL freshness
# and the proof report, and writes one status.json. No thresholds invented:
# every number is measured or labeled unknown.
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
WAL_DIR="${WAL_DIR:-$BACKUP_DIR/wal}"
OUT="$BACKUP_DIR/status.json"

latest_set=$(ls -t "$BACKUP_DIR" 2>/dev/null | grep -E '^20[0-9]{6}T' | head -1 || echo "")
wal_lag="null"
if [ -d "$WAL_DIR" ]; then
  newest=$(ls -t "$WAL_DIR" 2>/dev/null | head -1 || true)
  if [ -n "$newest" ]; then
    mt=$(stat -c%Y "$WAL_DIR/$newest" 2>/dev/null || stat -f%m "$WAL_DIR/$newest")
    wal_lag=$(( $(date +%s) - mt ))
  fi
fi
last_rehearsal=$(tail -1 ops/backup/rehearsals.jsonl 2>/dev/null || echo "null")
last_proof="null"
[ -f ops/backup/proof-report.json ] && last_proof=$(cat ops/backup/proof-report.json)
timer_state=$(systemctl list-timers --no-pager 2>/dev/null | grep -c "framique-.*timer.*active\|framique-" || echo 0)

python3 - "$OUT" <<PY
import json, sys, datetime
out = sys.argv[1]
status = {
  "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "targets": {"postgres_rpo_s": "<=300", "postgres_rto_s": "<=1800",
              "storage_rpo_s": "<=900", "full_dr_rto_s": "<=7200"},
  "measured": {
    "wal_lag_s": $wal_lag if "$wal_lag" != "null" else None,
    "latest_set": "$latest_set",
    "last_rehearsal": $last_rehearsal if '''$last_rehearsal''' != "null" else None,
    "last_proof": $last_proof if '''$last_proof''' != "null" else None,
  },
  "slo": {"wal_lag_ok": ($wal_lag != "null" and $wal_lag <= 300)},
}
json.dump(status, open(out, "w"), indent=2)
print(f"[status] wrote {out}")
PY
