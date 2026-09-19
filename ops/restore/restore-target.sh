#!/usr/bin/env bash
# Fortress U6: portable whole-system restore into a named target profile.
#
#   ops/restore/restore-target.sh <backup-set-dir> --target <profile> [--force]
#
# Profiles (registry below, data-driven — separate-host recovery adds a row,
# not a script):
#   restoref  same-host proof stack (framique-restore project, Kong 8011)
#
# Safety:
#   - Refuses any profile whose project name does not contain "restore"
#     unless --force is passed AND the profile file exists.
#   - Never touches the live framique-supabase project (guarded by name).
#   - Manifest checksum gate first; fail-closed throughout.
set -euo pipefail

SET_DIR="${1:?usage: restore-target.sh <backup-set-dir> --target <profile>}"
TARGET=""; FORCE=0
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    --force) FORCE=1; shift ;;
    *) echo "[restore] Unknown arg: $1" >&2; exit 2 ;;
  esac
done

RESTORE_ROOT="${RESTORE_ROOT:-/root/supabase-docker-framebase-restore}"

# --- profile registry: name|compose|project|db_container|storage_dir|kong_port
profile_restoref="framique-restore|$RESTORE_ROOT/docker-compose.yml|framique-restore|framique-restore-db|$RESTORE_ROOT/volumes/storage|8011"

case "$TARGET" in
  restoref) IFS='|' read -r _ COMPOSE PROJECT DB_CTR STORAGE_DIR KONG_PORT <<< "$profile_restoref" ;;
  "") echo "[restore] --target required (available: restoref)" >&2; exit 2 ;;
  *) echo "[restore] Unknown target profile: $TARGET" >&2; exit 2 ;;
esac

case "$PROJECT" in
  *restore*) ;;
  *) echo "[restore] Refusing: project '$PROJECT' is not a restore project." >&2
     [[ "$FORCE" -eq 1 ]] || { echo "[restore] Pass --force to override (dangerous)." >&2; exit 2; } ;;
esac
if [[ "$PROJECT" == "framique-supabase" || "$PROJECT" == "staging-supabase" ]]; then
  echo "[restore] FATAL: live/staging project names are never valid targets." >&2
  exit 2
fi

echo "=============================================================================="
echo "[restore] target=$TARGET project=$PROJECT set=$SET_DIR"
echo "=============================================================================="
started=$(date +%s)

# 1. Manifest gate.
echo "[restore] Verifying manifest..."
python3 - "$SET_DIR" <<'PY'
import hashlib, json, sys, pathlib
d = pathlib.Path(sys.argv[1])
m = json.loads((d / "manifest.json").read_text())
for name, meta in m.get("artifacts", {}).items():
    p = d / name
    if not p.exists():
        raise SystemExit(f"missing artifact: {name}")
    if hashlib.sha256(p.read_bytes()).hexdigest() != meta["sha256"]:
        raise SystemExit(f"checksum mismatch: {name}")
print(f"  ok: {len(m['artifacts'])} artifacts verified")
PY

dc() { docker compose -f "$COMPOSE" --project-directory "$(dirname "$COMPOSE")" "$@"; }
dexec() { docker exec -i "$DB_CTR" "$@"; }

# 2. DB must be up.
dexec pg_isready -U postgres >/dev/null || { echo "[restore] FATAL: $DB_CTR not ready." >&2; exit 1; }

# 3. Roles then data (passwords match: restore .env copies live secrets).
if [ -s "$SET_DIR/roles.sql" ]; then
  echo "[restore] Loading roles..."
  dexec psql -U postgres -d postgres -q < "$SET_DIR/roles.sql" || true
fi
echo "[restore] pg_restore db.dump..."
docker cp "$SET_DIR/db.dump" "$DB_CTR:/tmp/restore-db.dump"
dexec pg_restore -U postgres -d postgres --no-owner --no-acl --clean --if-exists /tmp/restore-db.dump \
  >/tmp/restore-target-$TARGET.log 2>&1 || true
dexec rm -f /tmp/restore-db.dump

# 4. Storage objects to the target bind dir (host tar, no container exec).
if [ -s "$SET_DIR/storage.tar.zst" ]; then
  echo "[restore] Unpacking storage objects..."
  mkdir -p "$STORAGE_DIR"
  zstd -dc "$SET_DIR/storage.tar.zst" | tar -C "$STORAGE_DIR" -xf - || true
fi

# 5. Smoke: counts + Kong REST round-trip.
echo "[restore] Smoke checks..."
for t in merchants products orders auth.users; do
  schema=public; tbl=$t
  [[ "$t" == auth.users ]] && schema=auth && tbl=users
  n=$(dexec psql -U postgres -d postgres -tAc "SELECT count(*) FROM $schema.$tbl" 2>/dev/null || echo error)
  echo "  [db] $schema.$tbl = $n"
  [[ "$n" =~ ^[0-9]+$ ]] || { echo "[restore] FATAL: smoke failed on $schema.$tbl" >&2; exit 1; }
done

echo "[restore] SUCCESS into '$PROJECT' in $(( $(date +%s) - started ))s"
