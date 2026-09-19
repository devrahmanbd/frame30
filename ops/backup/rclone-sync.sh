#!/usr/bin/env bash
# Fortress U4: off-site sync with checksum verification (fail-closed).
#
#   ops/backup/rclone-sync.sh
#
# Gates (in order, each fail-closed):
#   1. Only integrity-certified sets sync (integrity.json verdict check).
#      Uncertified sets are skipped with a logged reason — corrupt or
#      unverified backups never leave the host.
#   2. `rclone copy --checksum --immutable` (content-verified transfer;
#      immutable refuses to overwrite anything that already exists).
#   3. `rclone check` post-transfer (independent re-verification).
#   4. State recorded in sync-state.json (set -> remote -> checked_at).
#
# Remotes come from env (never hardcoded):
#   RCLONE_FTP_REMOTE  e.g. ftp-remote:framique-backups
#   RCLONE_S3_REMOTE   e.g. s3-remote:framique-backups
# At least one must be set or the job exits 2 (misconfigured, not silent).
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
STATE=ops/backup/sync-state.json
[ -f "$STATE" ] || echo '{}' > "$STATE"

REMOTES=()
[ -n "${RCLONE_FTP_REMOTE:-}" ] && REMOTES+=("$RCLONE_FTP_REMOTE")
[ -n "${RCLONE_S3_REMOTE:-}" ] && REMOTES+=("$RCLONE_S3_REMOTE")
if [ "${#REMOTES[@]}" -eq 0 ]; then
  echo "[sync] No remotes configured (RCLONE_FTP_REMOTE / RCLONE_S3_REMOTE). Skipping." >&2
  exit 2
fi

synced_any=0
for setdir in "$BACKUP_DIR"/20*; do
  [ -d "$setdir" ] || continue
  set=$(basename "$setdir")
  verdict=$(python3 -c "import json; print(json.load(open('$setdir/integrity.json')).get('verdict',''))" 2>/dev/null || echo "")
  if [ "$verdict" != "integrity-certified" ]; then
    echo "[sync] SKIP $set (not integrity-certified: '${verdict:-missing}')"
    continue
  fi
  for remote in "${REMOTES[@]}"; do
    done_mark=$(python3 -c "import json; print(json.load(open('$STATE')).get('$set',{}).get('$remote',''))" 2>/dev/null || echo "")
    if [ -n "$done_mark" ]; then
      echo "[sync] already synced: $set -> $remote ($done_mark)"
      continue
    fi
    echo "[sync] $set -> $remote ..."
    rclone copy "$setdir" "$remote/$set" --checksum --immutable --stats-one-line
    rclone check "$setdir" "$remote/$set" --one-way
    python3 - "$STATE" "$set" "$remote" <<'PY'
import json, sys, datetime
_, state_path, setname, remote = sys.argv
try:
    st = json.load(open(state_path))
except Exception:
    st = {}
st.setdefault(setname, {})[remote] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
json.dump(st, open(state_path, "w"), indent=2)
PY
    echo "[sync] OK $set -> $remote (checked)"
    synced_any=1
  done
done
echo "[sync] done (synced_any=$synced_any)"
