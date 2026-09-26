#!/usr/bin/env bash
# Fortress SLO-R02: cutoff-aware atomic archive_command (installed 2026-09-26).
#
#   ops/backup/archive-wal.sh %p %f    (invoked by postgres archive_command)
#
# Incident context (2026-09-21 -> 2026-09-26): the previous command
#   test ! -f DEST && cp SRC DEST
# left a 0-byte DEST when cp crashed mid-write; `test ! -f` then failed
# forever, the archiver stalled on segment 000000010000000F000000E4,
# pg_wal recycling blocked behind 6188 .ready files, and the disk filled
# with 97G of backlog (yesterday's outage).
#
# Two guarantees:
#   1. Atomic publish: copy to a hidden .tmp then rename — a crash can
#      never leave a partial segment blocking the queue again.
#   2. Cutoff: segment names older than the anchor in CUTOFF_FILE are
#      acknowledged (exit 0) without copying. That backlog pre-dates the
#      post-incident PITR anchor, was never archivable (11G free vs 96G
#      queue), and only served to pin pg_wal. Lexicographic order of
#      24-hex segment names equals LSN order, so a string compare is safe.
#
# Everything else (new segments, history files, *.backup markers) archives
# normally. Installed to /etc/postgresql-custom/archive-wal.sh in the db
# container (persistent db-config volume); companion files:
#   /etc/postgresql-custom/archive-cutoff      (24-hex anchor segment)
#   /etc/postgresql-custom/conf.d/10-wal-archiving.conf (points here)
set -euo pipefail

src=${1:?usage: archive-wal.sh %p %f}
name=${2:?usage: archive-wal.sh %p %f}

ARCHIVE_DIR=/var/backups/framique/wal
CUTOFF_FILE="${CUTOFF_FILE:-/etc/postgresql-custom/archive-cutoff}"

if [[ "$name" =~ ^[0-9A-F]{24}$ ]]; then
  cutoff="$(cat "$CUTOFF_FILE" 2>/dev/null || true)"
  if [[ -n "$cutoff" && "$name" < "$cutoff" ]]; then
    exit 0
  fi
fi

# Clear any partial left by a killed run of this same segment, then publish.
rm -f "$ARCHIVE_DIR/.tmp.$name."* 2>/dev/null || true
tmp="$ARCHIVE_DIR/.tmp.$name.$$"
trap 'rm -f "$tmp"' EXIT
cp "$src" "$tmp"
mv -f "$tmp" "$ARCHIVE_DIR/$name"
trap - EXIT
