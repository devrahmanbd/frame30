#!/usr/bin/env bash
# Fortress U6/U7: instantiate an isolated restore-stack clone of framebase.
#
#   ops/restore/setup-restore-stack.sh [--root /root/supabase-docker-framebase-restore]
#
# What it does (safe by construction):
#   - rsyncs the LIVE framebase compose tree EXCLUDING pgdata, storage objects,
#     and .env (never copies live data or secrets wholesale).
#   - renames every container_name framique-supabase-* -> framique-restore-*
#     so the clone can never collide with, shadow, or act on live containers.
#   - writes a fresh .env: same secrets (required — dump passwords match them),
#     new ports, restoref URLs.
#   - starts ONLY db, auth, rest, storage, kong (no studio/realtime/pooler/
#     functions/meta/imgproxy). Kong starts with --no-deps (skips studio).
#
# Portable: separate-host recovery = same script with --root on that host
# plus the backup set + this repo. No script changes needed.
set -euo pipefail

LIVE=/root/supabase-docker-framebase
ROOT="${2:-/root/supabase-docker-framebase-restore}"
if [[ "${1:-}" == "--root" && -n "${2:-}" ]]; then ROOT="$2"; fi

KONG_HTTP="${KONG_HTTP_PORT:-8011}"
KONG_HTTPS="${KONG_HTTPS_PORT:-8451}"
RESTORE_DOMAIN="${RESTORE_DOMAIN:-restoref.qubickle.com}"

echo "[restore-setup] LIVE=$LIVE ROOT=$ROOT"
[ -d "$LIVE" ] || { echo "FATAL: live tree missing" >&2; exit 1; }
case "$ROOT" in
  "$LIVE"|"$LIVE"/*) echo "FATAL: ROOT must not be inside LIVE" >&2; exit 2 ;;
esac

mkdir -p "$ROOT"
rsync -a --delete \
  --exclude 'volumes/db/data/' \
  --exclude 'volumes/storage/' \
  --exclude '.env' \
  --exclude '.git' \
  "$LIVE/" "$ROOT/"

# Fresh empty data dirs (init from scratch on first up).
mkdir -p "$ROOT/volumes/db/data" "$ROOT/volumes/storage"

# De-collide container names.
sed -i 's/container_name: framique-supabase-/container_name: framique-restore-/g' \
  "$ROOT/docker-compose.yml"
grep -c "container_name: framique-restore-" "$ROOT/docker-compose.yml"
# Separate compose project (COMPOSE_PROJECT_NAME / name: field). Without this,
# every compose command in $ROOT would manage the LIVE framique-supabase
# project (same name) — including down. Non-negotiable.
sed -i 's/^name: framique-supabase$/name: framique-restore/' "$ROOT/docker-compose.yml"
grep -q "^name: framique-restore$" "$ROOT/docker-compose.yml" || {
  echo "FATAL: project rename failed" >&2; exit 2
}
# Collision guard: refuse to proceed if compose still resolves live containers
# (protects against a future upstream rename breaking the seds above).
if docker compose -f "$ROOT/docker-compose.yml" --project-directory "$ROOT" ps --format '{{.Names}}' 2>/dev/null | grep -q "^framique-supabase-"; then
  echo "FATAL: restore compose still manages live framique-supabase-* containers. Aborting." >&2
  exit 2
fi
echo "[restore-setup] project isolation verified (no live containers managed)."

# Fresh .env: live secrets + restore ports/URLs.
cp "$LIVE/.env" "$ROOT/.env"
set_kv() { # set_kv KEY VALUE FILE
  if grep -q "^$1=" "$3"; then sed -i "s|^$1=.*|$1=$2|" "$3"; else echo "$1=$2" >> "$3"; fi
}
set_kv KONG_HTTP_PORT "$KONG_HTTP" "$ROOT/.env"
set_kv KONG_HTTPS_PORT "$KONG_HTTPS" "$ROOT/.env"
set_kv API_EXTERNAL_URL "https://$RESTORE_DOMAIN" "$ROOT/.env"
set_kv SUPABASE_PUBLIC_URL "https://$RESTORE_DOMAIN" "$ROOT/.env"
# Allow login redirects back to the restore domain (append, keep live entries).
if ! grep -q "$RESTORE_DOMAIN" "$ROOT/.env"; then
  if grep -q "^ADDITIONAL_REDIRECT_URLS=" "$ROOT/.env"; then
    sed -i "s|^\(ADDITIONAL_REDIRECT_URLS=\)\(.*\)|\1\2,https://$RESTORE_DOMAIN/**|" "$ROOT/.env"
  else
    echo "ADDITIONAL_REDIRECT_URLS=https://$RESTORE_DOMAIN/**" >> "$ROOT/.env"
  fi
fi

# Strip the live WAL-archive mount (restore DB must not write the live WAL dir).
sed -i '/fortress SLO-R02/I,+3d; /var\/backups\/framique\/wal:\/var\/backups\/framique\/wal:rw/d' \
  "$ROOT/docker-compose.yml"

echo "[restore-setup] Starting minimal services (db auth rest storage, then kong)..."
cd "$ROOT"
docker compose up -d db auth rest storage
docker compose up -d --no-deps kong
echo "[restore-setup] Waiting for db..."
for _ in $(seq 1 90); do
  docker exec framique-restore-db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
docker exec framique-restore-db pg_isready -U postgres
echo "[restore-setup] OK: empty restore stack up. Load data with restore.sh --target restoref."
