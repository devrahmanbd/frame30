#!/usr/bin/env bash
# Fortress U7/B5: automated restore proof against restoref.qubickle.com.
#
#   ops/backup/proof-restoref.sh [--domain restoref.qubickle.com]
#
# Zero manual steps: every check runs here, verdict is fail-closed, and the
# machine-readable report lands in ops/backup/proof-report.json.
# Checks: HTTPS app + auth page, English-only, wizard, REST parity vs live,
# RLS policy parity, GoTrue pipeline (negative login), row parity.
set -euo pipefail

cd "$(dirname "$0")/../.."
DOMAIN="${1:-restoref.qubickle.com}"
[[ "${1:-}" == --domain* ]] && DOMAIN="${2:-restoref.qubickle.com}"
BASE="https://$DOMAIN"
REPORT=ops/backup/proof-report.json
TMPD="$(mktemp -d /tmp/restoref-proof-XXXXXX)"
trap 'rm -rf "$TMPD"' EXIT

LIVE_ANON="$(grep '^ANON_KEY' /root/supabase-docker-framebase/.env | cut -d= -f2)"
REST_ANON="$(grep '^ANON_KEY' /root/supabase-docker-framebase-restore/.env | cut -d= -f2)"

pass=0; fail=0
check() { # check <name> <command...> — records PASS/FAIL with evidence
  local name="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    echo "  [proof] PASS $name :: ${out:0:120}"
    pass=$((pass+1)); echo "$name=PASS :: ${out:0:200}"
  else
    echo "  [proof] FAIL $name :: ${out:0:200}"
    fail=$((fail+1)); echo "$name=FAIL :: ${out:0:200}"
  fi
}
RESULTS="$TMPD/results.txt"; : > "$RESULTS"

fetch() { nsenter --target 1 --net curl -sk --max-time 20 "$@"; }

echo "[proof] 1. HTTPS app + auth pages (public, through HAProxy+OpenResty)..."
fetch "$BASE/" -o "$TMPD/home.html" -w "%{http_code} %{size_download}\n" | grep -q "^200 " && echo "home-200=PASS" >> "$RESULTS" || echo "home-200=FAIL" >> "$RESULTS"
grep -q "</html>" "$TMPD/home.html" && echo "home-complete=PASS" >> "$RESULTS" || echo "home-complete=FAIL" >> "$RESULTS"
grep -q 'nonce=' "$TMPD/home.html" && echo "home-nonce=PASS" >> "$RESULTS" || echo "home-nonce=FAIL" >> "$RESULTS"
fetch "$BASE/auth?mode=signup" -o "$TMPD/signup.html" -w "%{http_code}\n" | grep -q "^200" && echo "signup-200=PASS" >> "$RESULTS" || echo "signup-200=FAIL" >> "$RESULTS"
grep -q "Step 1 of 2" "$TMPD/signup.html" && echo "signup-wizard=PASS" >> "$RESULTS" || echo "signup-wizard=FAIL" >> "$RESULTS"
if grep -qP '[\x{0980}-\x{09FF}]' "$TMPD/signup.html"; then echo "signup-english-only=FAIL" >> "$RESULTS"; else echo "signup-english-only=PASS" >> "$RESULTS"; fi

echo "[proof] 2. REST parity live vs restore (anon, public merchants)..."
live_n=$(fetch "https://framebase.qubickle.com/rest/v1/merchants?select=id" -H "apikey: $LIVE_ANON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo error)
rest_n=$(fetch "$BASE/rest/v1/merchants?select=id" -H "apikey: $REST_ANON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo error)
echo "  live=$live_n restore=$rest_n"
[[ "$live_n" =~ ^[0-9]+$ && "$live_n" == "$rest_n" ]] && echo "rest-parity=PASS :: $rest_n rows" >> "$RESULTS" || echo "rest-parity=FAIL :: live=$live_n restore=$rest_n" >> "$RESULTS"

echo "[proof] 3. RLS policy parity (live vs restore catalogs)..."
live_p=$(docker exec framique-supabase-db psql -U postgres -d postgres -tAc "SELECT count(*) FROM pg_policies" 2>/dev/null || echo error)
rest_p=$(docker exec framique-restore-db psql -U postgres -d postgres -tAc "SELECT count(*) FROM pg_policies" 2>/dev/null || echo error)
echo "  live_policies=$live_p restore_policies=$rest_p"
[[ "$live_p" =~ ^[0-9]+$ && "$live_p" == "$rest_p" ]] && echo "rls-parity=PASS :: $rest_p policies" >> "$RESULTS" || echo "rls-parity=FAIL" >> "$RESULTS"

echo "[proof] 4. GoTrue pipeline (negative login must 400, proves auth live)..."
code=$(fetch "$BASE/auth/v1/token?grant_type=password" -X POST -H "apikey: $REST_ANON" -H "Content-Type: application/json" -d '{"email":"nobody@example.invalid","password":"wrongwrongwrong"}' -o /dev/null -w "%{http_code}")
[[ "$code" == "400" ]] && echo "auth-pipeline=PASS :: invalid login rejected $code" >> "$RESULTS" || echo "auth-pipeline=FAIL :: got $code" >> "$RESULTS"

echo "[proof] 5. Row parity on money/identity tables..."
for spec in "public:merchants" "public:products" "public:orders" "auth:users"; do
  schema="${spec%%:*}"; tbl="${spec##*:}"
  a=$(docker exec framique-supabase-db psql -U postgres -d postgres -tAc "SELECT count(*) FROM $schema.$tbl" 2>/dev/null || echo error)
  b=$(docker exec framique-restore-db psql -U postgres -d postgres -tAc "SELECT count(*) FROM $schema.$tbl" 2>/dev/null || echo error)
  [[ "$a" == "$b" ]] && echo "parity-$tbl=PASS :: $b" >> "$RESULTS" || echo "parity-$tbl=FAIL :: live=$a restore=$b" >> "$RESULTS"
done

passes=$(grep -c "=PASS" "$RESULTS" || true)
fails=$(grep -c "=FAIL" "$RESULTS" || true)
verdict=pass; [[ "$fails" -gt 0 ]] && verdict=fail
python3 - "$RESULTS" <<'PY'
import json, sys, datetime
lines = [l.strip() for l in open(sys.argv[1]) if l.strip()]
checks = [{"name": l.split("=PASS")[0] if "=PASS" in l else l.split("=FAIL")[0],
           "result": "pass" if "=PASS" in l else "fail",
           "detail": l.split("::", 1)[1] if "::" in l else ""} for l in lines]
report = {"proved_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
          "domain": "restoref.qubickle.com",
          "verdict": "pass" if all(c["result"] == "pass" for c in checks) else "fail",
          "checks": checks}
open("ops/backup/proof-report.json", "w").write(json.dumps(report, indent=2))
print(f"[proof] VERDICT: {report['verdict']} ({len(checks)} checks)")
PY
cat "$RESULTS"
[[ "$verdict" == "pass" ]]
