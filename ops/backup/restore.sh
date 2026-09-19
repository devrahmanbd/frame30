#!/usr/bin/env bash
# RETIRED (Fortress DR loop B4): this script's compose path was stale, its
# mock branch reported success without restoring, and its cleanup could act on
# live containers. Use instead:
#   rehearsal : ops/backup/rehearse.sh <set>
#   restore   : ops/restore/restore-target.sh <set> --target <profile>
echo "ops/backup/restore.sh is retired. Use ops/restore/restore-target.sh --target <profile>." >&2
exit 3
