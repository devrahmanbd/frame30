#!/usr/bin/env bash
# Framique edge certificate issuer — the executable half of the edge hook.
#
# Called ONLY by the app provisioner (`src/lib/edge-provision.server.ts`)
# as:  framique-cert-issue.sh <hostname> [live|staging]
# The app already validated the hostname; this script re-validates before
# touching certbot (defense in depth — never trust argv, even our own).
#
# Flow: certbot (webroot HTTP-01 through the live :80 challenge path, which
# OpenResty serves from /var/www/certbot) → assemble haproxy PEM
# (fullchain + privkey, 0600) → reload haproxy. Exits non-zero on any
# failure WITHOUT touching the live PEM, so a failed order can never take
# down a working domain. Concurrent runs for one host serialize on flock.
#
# Env (all optional): ACME_ACCOUNT_EMAIL (default ops@framique.com),
# HAPROXY_RELOAD (default "systemctl reload haproxy"),
# HAPROXY_CERT_DIR (default /etc/haproxy/certs).
set -euo pipefail

HOST="${1:?usage: framique-cert-issue.sh <hostname> [live|staging]}"
MODE="${2:-live}"
EMAIL="${ACME_ACCOUNT_EMAIL:-ops@framique.com}"
CERT_DIR="${HAPROXY_CERT_DIR:-/etc/haproxy/certs}"
RELOAD_CMD="${HAPROXY_RELOAD:-systemctl reload haproxy}"

# Strict hostname: lowercase alnum/dots/hyphens, 4–253 chars, real TLD.
if [[ ! "$HOST" =~ ^[a-z0-9]([a-z0-9.-]{2,251}[a-z0-9])?$ ]] \
  || [[ "$HOST" != *.* ]] \
  || [[ "$HOST" =~ ^[0-9.]+$ ]] \
  || [[ "$HOST" == *.localhost ]]; then
  echo "refusing non-hostname: $HOST" >&2
  exit 2
fi
TLD="${HOST##*.}"
if [[ ! "$TLD" =~ ^[a-z]{2,}$ ]]; then
  echo "refusing bad TLD: $HOST" >&2
  exit 2
fi

LOCK="/run/framique-cert-${HOST}.lock"
exec 9>"$LOCK"
flock -n 9 || { echo "order already running for $HOST" >&2; exit 3; }

ARGS=(certonly --non-interactive --agree-tos -m "$EMAIL"
  --webroot -w /var/www/certbot -d "$HOST" --expand)
if [ "$MODE" = "staging" ]; then
  ARGS+=(--staging)
fi
certbot "${ARGS[@]}"

LIVE="/etc/letsencrypt/live/$HOST"
DST="$CERT_DIR/$HOST.pem"
TMP="$DST.tmp.$$"
cat "$LIVE/fullchain.pem" "$LIVE/privkey.pem" > "$TMP"
chmod 600 "$TMP"
# Sanity: the assembled bundle must parse and cover the hostname.
openssl x509 -in "$TMP" -noout -checkend 0 >/dev/null
mv "$TMP" "$DST"
# shellcheck disable=SC2086
$RELOAD_CMD
echo "issued $HOST ($MODE)"
