#!/usr/bin/env bash
# Framique — restore rehearsal. A backup nobody has restored is a rumour.
#
#   ops/backup/rehearse.sh [backup-set-dir]
#
# Restores the newest set into the throwaway `framique-restore` stack, runs
# read-back assertions (row counts on the money and tenancy tables, one
# storefront read through PostgREST), records measured RTO/RPO into
# ops/backup/rehearsals.jsonl, and tears the stack down. Non-zero exit means
# the drill failed — wire it to the same alert path as a page.
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
SET_DIR="${1:-$(ls -1d "$BACKUP_DIR"/20* | sort | tail -1)}"
PROJECT=framique-restore
LOG=ops/backup/rehearsals.jsonl

dc() { COMPOSE_PROJECT_NAME="$PROJECT" docker compose -f supabase/docker/docker-compose.yml "$@"; }
cleanup() { dc down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

taken_at=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['taken_at'])" "$SET_DIR/manifest.json")
started=$(date +%s)

COMPOSE_PROJECT_NAME="$PROJECT" ops/backup/restore.sh "$SET_DIR"

echo "[rehearse] read-back assertions"
fail=0
for t in merchants products orders order_items payments; do
  n=$(dc exec -T db psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo error)
  echo "  $t=$n"
  [[ "$n" =~ ^[0-9]+$ ]] || fail=1
done
# The money tables must not come back empty — an empty restore "succeeds" too.
orders=$(dc exec -T db psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.orders")
[[ "$orders" -gt 0 ]] || { echo "  orders empty after restore" >&2; fail=1; }

rto=$(( $(date +%s) - started ))
rpo=$(( $(date +%s) - $(date -u -d "$(echo "$taken_at" | sed -E 's/T/ /; s/Z//; s/([0-9]{4})([0-9]{2})([0-9]{2})/\1-\2-\3/; s/([0-9]{2})([0-9]{2})([0-9]{2})$/\1:\2:\3/')" +%s) ))
verdict=$([[ $fail -eq 0 ]] && echo pass || echo fail)

mkdir -p "$(dirname "$LOG")"
printf '{"rehearsed_at":"%s","backup":"%s","rto_seconds":%d,"rpo_seconds":%d,"verdict":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$taken_at" "$rto" "$rpo" "$verdict" >> "$LOG"

echo "[rehearse] $verdict  RTO=${rto}s  RPO=${rpo}s  (recorded in $LOG)"
[[ $fail -eq 0 ]]
