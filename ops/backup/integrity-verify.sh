#!/usr/bin/env bash
# Fortress U3: daily backup integrity verification.
#
#   ops/backup/integrity-verify.sh [<timestamp-dir>]
#
# Re-verifies every artifact digest in a set's manifest.json, asserts the
# critical artifacts are non-empty, and confirms the WAL archive is fresh.
# On pass writes integrity.json {verdict:"integrity-certified"} into the set —
# the off-site sync gate (B5) only ships certified sets. Exit non-zero on any
# failure (fail-closed; surfaces in the systemd timer status).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/framique}"
TARGET="${1:-$(ls -t "$BACKUP_DIR" | grep -E '^20[0-9]{6}T' | head -1)}"
SET="$BACKUP_DIR/$TARGET"

fail() { echo "[integrity] FAIL: $1" >&2; exit 1; }
[ -d "$SET" ] || fail "set not found: $SET"
[ -f "$SET/manifest.json" ] || fail "manifest.json missing in $SET"

python3 - "$SET/manifest.json" <<'EOF'
import hashlib, json, sys

manifest_path = sys.argv[1]
m = json.load(open(manifest_path))
arts = m.get("artifacts", {})

critical = ["db.dump", "roles.sql", "configs.tar.zst"]
problems = []
for name in critical:
    a = arts.get(name)
    if not a:
        problems.append(f"{name}: absent from manifest")
        continue
    if a.get("bytes", 0) <= 0:
        problems.append(f"{name}: empty artifact")

import os
setdir = os.path.dirname(manifest_path)
for name, a in arts.items():
    p = os.path.join(setdir, name)
    if not os.path.isfile(p):
        problems.append(f"{name}: file missing")
        continue
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest() != a.get("sha256"):
        problems.append(f"{name}: CHECKSUM MISMATCH")

if problems:
    print("[integrity] FAIL:")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)
print(f"[integrity] digests OK ({len(arts)} artifacts), critical non-empty")
EOF

# WAL freshness is part of integrity: a certified set is only as good as PITR.
WAL_DIR="${WAL_DIR:-/var/backups/framique/wal}"
"$(dirname "$0")/wal-lag-probe.sh" --warn-secs=600 || fail "WAL archive stale"

cat > "$SET/integrity.json" <<JSON
{
  "verdict": "integrity-certified",
  "checked_at": "$(date -u +%FT%TZ)",
  "set": "$TARGET"
}
JSON
echo "[integrity] PASS: $TARGET integrity-certified"
