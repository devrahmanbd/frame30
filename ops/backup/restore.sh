#!/usr/bin/env bash
# Framique — restore a backup set into a target stack.
#
#   ops/backup/restore.sh /var/backups/framique/20260101T030000Z [--force]
#
# Refuses to touch a production stack unless --force is given: the default
# target is the rehearsal stack (COMPOSE_PROJECT_NAME=framique-restore), which
# is what the scheduled drill uses. Checksums from manifest.json are verified
# before a single byte is loaded.
set -euo pipefail

SET_DIR="${1:?usage: restore.sh <backup-set-dir> [--force]}"
FORCE="${2:-}"
cd "$(dirname "$0")/../.."
COMPOSE="supabase/docker/docker-compose.yml"
PROJECT="${COMPOSE_PROJECT_NAME:-framique-restore}"

if [[ "$PROJECT" != *restore* && "$FORCE" != "--force" ]]; then
  echo "refusing to restore into '$PROJECT' without --force" >&2
  exit 2
fi

dc() { COMPOSE_PROJECT_NAME="$PROJECT" docker compose -f "$COMPOSE" "$@"; }

echo "[restore] verifying $SET_DIR"
python3 - "$SET_DIR" <<'PY'
import hashlib, json, sys, pathlib
d = pathlib.Path(sys.argv[1])
m = json.loads((d / "manifest.json").read_text())
for name, meta in m["artifacts"].items():
    h = hashlib.sha256((d / name).read_bytes()).hexdigest()
    if h != meta["sha256"]:
        raise SystemExit(f"checksum mismatch: {name}")
print(f"verified {len(m['artifacts'])} artifacts from {m['taken_at']}")
PY

echo "[restore] bringing up target stack '$PROJECT'"
dc up -d db storage
until dc exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

echo "[restore] roles"
dc exec -T db psql -U postgres -d postgres -q < "$SET_DIR/roles.sql" || true

echo "[restore] database"
dc exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
dc exec -T db pg_restore -U postgres -d postgres --no-owner --no-acl --clean --if-exists < "$SET_DIR/db.dump"

echo "[restore] storage objects"
zstd -dc "$SET_DIR/storage.tar.zst" | dc exec -T storage tar -C /var/lib/storage -xf -

echo "[restore] complete"
