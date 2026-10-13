#!/usr/bin/env bash
# Fortress cert-age gate: is there a FRESH, CERTIFIED, OFF-SITE, ENCRYPTED set?
#
#   ops/backup/certified-age-gate.sh [--max-age-secs 86400]
#
# Pass (exit 0) requires ALL of:
#   1. a newest backup set whose manifest.json parses and whose taken_at age
#      is under --max-age-secs (default 24h);
#   2. that set is certified: integrity.json verdict == "integrity-certified"
#      AND ops/backup/rehearsals.jsonl holds a verdict=="pass" row for it;
#   3. off-site copy confirmed: ops/backup/sync-state.json maps the set to >=1
#      remote timestamp (uncertified sets never ship, so no entry == not safe);
#   4. theft-immunity envelope present: snapshot.enc exists and is non-empty.
#
# Unknown (exit 2) when state files are ABSENT or unreadable — unknown is never
# reported healthy: the BackupCertifiedStale page alert fires on ok != 1 AND on
# a missing metric, so a dead gate pages rather than going silent.
# Evaluated-but-bad is exit 1. Both are loud (stderr reason + nonzero exit).
#
# Scheduling (host, DR owner — not in-repo by scope): run hourly from the
# verify timer path or a dedicated framique-cert-gate timer; the script also
# refreshes the node-exporter textfile (TEXTFILE_DIR) that the alert reads.
# Until the textfile collector is enabled on node-exporter
# (--collector.textfile.directory=$TEXTFILE_DIR), the alert's absent() arm
# fires — wire the collector promptly (see runbook).
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
MAX_AGE_S=86400
if [[ "${1:-}" == --max-age-secs* ]]; then
  MAX_AGE_S="${1#*=}"; shift || true
  [[ "$MAX_AGE_S" =~ ^[0-9]+$ ]] || { echo "[cert-gate] UNKNOWN: bad --max-age-secs" >&2; exit 2; }
fi
STATE=ops/backup/sync-state.json
REHEARSE_LOG=ops/backup/rehearsals.jsonl
TEXTFILE_DIR="${TEXTFILE_DIR:-/var/lib/node-exporter/textfile}"
PROM_FILE="$TEXTFILE_DIR/framique_backup_certified.prom"

write_prom() { # $1 ok(1|0) $2 age_s(-1 unknown) — best-effort, never masks verdict
  local ok="$1" age="$2"
  local tmp="$TEXTFILE_DIR/.framique_backup_certified.prom.$$"
  if mkdir -p "$TEXTFILE_DIR" 2>/dev/null &&
     cat > "$tmp" 2>/dev/null <<EOF &&
# HELP framique_backup_certified_ok 1 when the newest backup set is certified, fresh, off-site confirmed and encrypted; 0 otherwise (unknown counts as 0).
# TYPE framique_backup_certified_ok gauge
framique_backup_certified_ok $ok
# HELP framique_backup_certified_age_seconds Age of the newest certified backup set in seconds; -1 when unevaluable.
# TYPE framique_backup_certified_age_seconds gauge
framique_backup_certified_age_seconds $age
EOF
     mv -f "$tmp" "$PROM_FILE" 2>/dev/null; then
    :
  else
    echo "[cert-gate] WARN: textfile unwritable ($PROM_FILE); verdict still stands" >&2
    rm -f "$tmp" 2>/dev/null || true
  fi
}

unknown() { echo "[cert-gate] UNKNOWN: $1" >&2; write_prom 0 -1; exit 2; }
gate_fail() { echo "[cert-gate] FAIL: $1" >&2; write_prom 0 "${2:--1}"; exit 1; }

[ -d "$BACKUP_DIR" ] || unknown "backup dir missing ($BACKUP_DIR)"
[ -f "$REHEARSE_LOG" ] || unknown "rehearsal ledger missing ($REHEARSE_LOG)"
[ -f "$STATE" ] || unknown "off-site state missing ($STATE)"

latest=""
for d in "$BACKUP_DIR"/20*; do
  [ -d "$d" ] || continue
  # NOTE: rehearse.sh also excludes *tmp* here because it RESTORES (a scratch
  # path must never be mistaken for a backup source). This gate is read-only —
  # it never restores, mounts, or deletes — so *tmp* is intentionally NOT
  # excluded: sandbox proofs run with BACKUP_DIR under /tmp by policy.
  case "$d" in *restore*|*rehearse*|"$BACKUP_DIR"/wal) continue ;; esac
  [ -f "$d/manifest.json" ] || continue
  latest="$d"
done
[ -n "$latest" ] || unknown "no backup set with a manifest in $BACKUP_DIR"
set_name="$(basename "$latest")"

taken_at=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['taken_at'])" "$latest/manifest.json" 2>/dev/null) \
  || unknown "manifest unreadable in $set_name"
age_s=$(python3 -c "
import datetime
taken = datetime.datetime.strptime('$taken_at', '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
print(max(0, int((datetime.datetime.now(datetime.timezone.utc) - taken).total_seconds())))" 2>/dev/null) \
  || unknown "manifest taken_at unparsable ('$taken_at') in $set_name"

verdict=$(python3 -c "import json;print(json.load(open('$latest/integrity.json')).get('verdict',''))" 2>/dev/null || echo "")
[ "$verdict" = "integrity-certified" ] \
  || gate_fail "newest set $set_name not integrity-certified (verdict='${verdict:-missing integrity.json}')" "$age_s"

if ! python3 - "$REHEARSE_LOG" "$taken_at" <<'PY' 2>/dev/null; then
import json, sys
log_path, taken = sys.argv[1], sys.argv[2]
try:
    rows = [json.loads(l) for l in open(log_path) if l.strip()]
except Exception as e:
    print(f"rehearsal ledger unreadable: {e}")
    sys.exit(1)
ok = any(r.get("backup") == taken and r.get("verdict") == "pass" for r in rows)
sys.exit(0 if ok else 1)
PY
  gate_fail "newest certified set $set_name has no passing rehearsal for backup $taken_at" "$age_s"
fi

remotes=$(python3 -c "import json;d=json.load(open('$STATE'));print(len(d.get('$set_name',{})))" 2>/dev/null || echo "unknown")
if [ "$remotes" = "unknown" ]; then
  unknown "off-site state unreadable ($STATE)"
elif [ "$remotes" -eq 0 ]; then
  gate_fail "set $set_name has no confirmed off-site copy in $STATE" "$age_s"
fi

[ -s "$latest/snapshot.enc" ] \
  || gate_fail "set $set_name lacks a non-empty encryption envelope (snapshot.enc)" "$age_s"

if [ "$age_s" -gt "$MAX_AGE_S" ]; then
  gate_fail "newest certified set $set_name is ${age_s}s old (limit ${MAX_AGE_S}s)" "$age_s"
fi

write_prom 1 "$age_s"
echo "[cert-gate] OK: set $set_name certified, age ${age_s}s, off-site remotes=$remotes, snapshot.enc present"
