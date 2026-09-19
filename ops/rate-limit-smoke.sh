#!/usr/bin/env bash
# Rate-limit smoke test: proves legitimate bursts pass on every bucket.
#
#   ops/rate-limit-smoke.sh [--base https://framique.qubickle.com]
#
#   60x /            -> system.ingress (300/60s) or loopback (3000/60s)
#   30x /root        -> system.console (600/60s)
# Verdict fail-closed: any 429 fails the run. Uses distinct X-Forwarded-For
# test IPs so the probe measures per-IP buckets instead of tripping over
# other traffic (see progress.md follow-up: edge should overwrite XFF).
set -euo pipefail

BASE="${1:-https://framique.qubickle.com}"
[[ "${1:-}" == --base* ]] && BASE="${2:-https://framique.qubickle.com}"

CURL="nsenter --target 1 --net curl -sk --max-time 10"
fails=0

burst() { # burst <name> <path> <count> <xff-ip>
  local name="$1" path="$2" n="$3" ip="$4"
  local local429=0 ok=0
  for _ in $(seq 1 "$n"); do
    code=$($CURL -H "X-Forwarded-For: $ip" "$BASE$path" -o /dev/null -w "%{http_code}")
    if [ "$code" = "429" ]; then local429=$((local429+1)); else ok=$((ok+1)); fi
  done
  if [ "$local429" -gt 0 ]; then
    echo "[ratelimit] FAIL $name: $local429/429s out of $n"
    fails=$((fails+1))
  else
    echo "[ratelimit] PASS $name: $ok/$n ok, zero 429s"
  fi
}

burst "public-ingress" "/" 60 "203.0.113.21"
burst "console-bucket" "/root" 30 "203.0.113.22"

if [ "$fails" -gt 0 ]; then echo "[ratelimit] VERDICT: fail"; exit 1; fi
echo "[ratelimit] VERDICT: pass"
