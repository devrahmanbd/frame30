#!/bin/sh
# Framique domains sweep trigger (installed in root crontab).
# Keeps the crontab line trivial: all logic lives here, no quoting traps.
set -a
. /opt/frame28/.env
set +a
LOG=/var/log/framique-cron.log
echo "sweep start secret_len=${#BILLING_CRON_SECRET} url=${APP_INTERNAL_URL:-UNSET}" >> "$LOG" 2>&1
/usr/bin/curl -sS -X POST -m 55 --retry 1 \
  -H "authorization: Bearer $BILLING_CRON_SECRET" \
  -o /dev/null \
  -w "cron domains status=%{http_code} t=%{time_total}s\n" \
  "$APP_INTERNAL_URL/api/public/cron/domains" >> "$LOG" 2>&1
 