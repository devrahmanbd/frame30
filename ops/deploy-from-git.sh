#!/usr/bin/env bash
# Deploy Framique from git — the ONLY supported path to production.
#
# Why this exists (Sept 21): two agents shared one clone + one server and
# kept paving each other — uncommitted-file commits, 502s, frankenbuilds
# (restart landing mid-build), and a silently reverted path-storefront gate.
# Rules enforced here:
#   1. Deploy ONLY from a pushed git branch (never a dirty tree).
#   2. Build in an ephemeral worktree (live tree is never built in place).
#   3. One deploy at a time (lock file with owner + timestamp).
#   4. Verify the live contract before releasing the lock.
#
# Usage: ops/deploy-from-git.sh <branch> [owner]
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"

BRANCH="${1:?usage: deploy-from-git.sh <branch> [owner]}"
OWNER="${2:-$(whoami)}"
REPO="/opt/frame28"
LOCK="$REPO/.deploy-lock"
WORK="/tmp/opencode/deploy-$BRANCH"

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "DEPLOY LOCKED by: $(cat "$LOCK/owner" 2>/dev/null || echo unknown)"
  exit 1
fi
echo "$OWNER $(date -u +%FT%TZ)" > "$LOCK/owner"
cleanup() { rm -rf "$LOCK" "$WORK"; }
trap cleanup EXIT

git -C "$REPO" fetch origin "$BRANCH" >/dev/null 2>&1 || true
git -C "$REPO" worktree remove --force "$WORK" >/dev/null 2>&1 || true
git -C "$REPO" worktree add --detach "$WORK" "origin/$BRANCH"
ln -sfn "$REPO/node_modules" "$WORK/node_modules"
# Vite bakes VITE_* vars from the project root at build time, and .env is
# intentionally untracked — so the ephemeral tree must borrow the live one.
# Without this, publicClient() compiles to createClient(void 0, void 0)
# and every public query 500s with "supabaseUrl is required."
if [ -f "$REPO/.env" ]; then cp "$REPO/.env" "$WORK/.env"; fi

cd "$WORK"
# Never trust the shared module cache: a stale chunk once shipped old code
# past a successful build (beacon 500 survived its own fix).
rm -rf "$REPO/node_modules/.vite" "$WORK/.nitro"
bun run build
# Env guard: VITE_* must be baked (see .env copy above). An env-less build
# compiles publicClient() to createClient(void 0, void 0) and 500s live.
if grep -rq "createClient(void 0" "$WORK/.output/server/" 2>/dev/null; then
  echo "BUILD REJECTED: VITE_* not baked (missing .env at build time)"
  exit 1
fi
# Dummy-URL guard: a tracked .env.local once shadowed the real .env and baked
# https://dummy.supabase.co into the client bundle (auth fired at a dead host
# and died on CSP). .env.local must never be tracked (see .gitignore) — fail
# the build if the marker ever ships again.
if grep -rq "dummy.supabase.co" "$WORK/.output/public/" 2>/dev/null; then
  echo "BUILD REJECTED: dummy Supabase URL baked into client bundle"
  exit 1
fi
rsync -a --delete "$WORK/.output/" "$REPO/.output/"
systemctl restart framique.service
sleep 8

fail=0
check() { # $1 url $2 expected
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$1")
  if [ "$code" != "$2" ]; then echo "VERIFY FAIL: $1 -> $code (want $2)"; fail=1;
  else echo "VERIFY OK: $1 -> $code"; fi
}
# Path storefront: slugs WITHOUT a primary custom host must 404 on platform
# hosts. A slug WITH an active primary host 301-redirects to it (permalink
# deep-path gate, PR #21). The primary hostname is merchant data, not code —
# the merchant renamed microscrop.shop → flamelancer.com (2026-09-24,
# audited in domain_events) — so resolve it live instead of hardcoding.
# Never assert on one example slug — enumerate live merchants, fake slugs,
# deep routes, and case tricks.
PRIMARY_HOST=$(docker exec framique-supabase-db psql -U postgres -tAc "SELECT hostname FROM public.merchant_domains WHERE status='active' AND is_primary LIMIT 1" | tr -d '[:space:]')
for slug in akira flame-fashion-bd nonexistent-store-xyz Akira; do
  if [ "$slug" = "flame-fashion-bd" ] && [ -n "$PRIMARY_HOST" ]; then
    loc=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "https://framique.qubickle.com/store/flame-fashion-bd")
    if [ "$loc" = "301 https://$PRIMARY_HOST/" ]; then echo "VERIFY OK: /store/flame-fashion-bd -> 301 primary";
    else echo "VERIFY FAIL: /store/flame-fashion-bd -> $loc (want 301 https://$PRIMARY_HOST/)"; fail=1; fi
  else
    check "https://framique.qubickle.com/store/$slug" "404"
  fi
done
for sub in p/x c/y pages/about search cart checkout account sitemap.xml robots.txt; do
  check "https://framique.qubickle.com/store/akira/$sub" "404"
done
check "https://framique.qubickle.com/" "200"
if [ -n "$PRIMARY_HOST" ]; then
  # Edge SNI mapping flaps under load (wrong-cert curl 60s from loopback;
  # 2026-09-25: custom domains intermittently serve the shared default cert
  # because ACME file storage is per edge replica — see runbook note below);
  # retry transient failures with raw curl (not check(), so set -e can't
  # kill the script between attempts) before calling it a failure.
  attempt=0
  primary_ok=""
  until [ -n "$primary_ok" ]; do
    attempt=$((attempt + 1))
    home=$(curl -s -o /dev/null -w "%{http_code}" "https://$PRIMARY_HOST/" 2>/dev/null) || home="000"
    cart=$(curl -s -o /dev/null -w "%{http_code}" "https://$PRIMARY_HOST/cart" 2>/dev/null) || cart="000"
    if [ "$home" = "200" ] && [ "$cart" = "200" ]; then
      primary_ok="yes"
      echo "VERIFY OK: https://$PRIMARY_HOST/ + /cart -> 200 (attempt $attempt)"
    elif [ "$attempt" -ge 6 ]; then
      echo "VERIFY FAIL: https://$PRIMARY_HOST/ -> $home, /cart -> $cart after $attempt attempts"
      fail=1
      break
    else
      echo "VERIFY RETRY: $PRIMARY_HOST home=$home cart=$cart ($attempt/6) in 10s"
      sleep 10
    fi
  done
  if [ -n "$primary_ok" ]; then
    # Cert-subject assertion: a 200 may have hit the healthy replica while a
    # skewed one still serves the shared default cert (per-replica ACME
    # storage — DEPLOY.md edge runbook). Sample the served identity 8×; ANY
    # sample that does not cover PRIMARY_HOST fails the gate. Subject + SANs
    # both checked (modern LE certs often carry an empty subject CN).
    skew=0
    for _ in $(seq 1 8); do
      cert_text=$(echo | openssl s_client -connect "$PRIMARY_HOST:443" -servername "$PRIMARY_HOST" 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null) || cert_text=""
      case "$cert_text" in
        *"$PRIMARY_HOST"*) ;;
        *)
          skew=1
          echo "VERIFY SKEW: served identity does not cover $PRIMARY_HOST: '${cert_text:-unreadable}'"
          break
          ;;
      esac
    done
    if [ "$skew" -ne 0 ]; then
      fail=1
    else
      echo "VERIFY OK: cert identity covers $PRIMARY_HOST (8/8 samples)"
    fi
  fi
else
  echo "SKIP custom-host checks: no active primary (merchant mid-rename)"
fi
# Unmapped custom hosts must serve nothing (bare 404 — no CMS site, no
# featured-store fallback). microscrop.shop lost its mapping in the
# flamelancer.com rename, so it pins this gate.
check "https://microscrop.shop/" "404"
check "https://framique.qubickle.com/api/public/ph/x" "200"
[ "$fail" = 0 ] || { echo "DEPLOY VERIFICATION FAILED"; exit 1; }
echo "DEPLOY OK: $BRANCH live"
