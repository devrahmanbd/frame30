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
#   5. Retain the last-good artifact: snapshot .output/ before rsync (keep
#      last 2); on verify-fail OR restart-fail, rsync back + restart +
#      re-verify, exiting nonzero with a RESTORED/UNRESTORED status.
#   6. Health-gated restart: readiness poll loop with bounded timeout
#      replaces the blind sleep; timeout triggers the rollback path.
#   7. Lock expiry/steal: lock records owner+pid+started_at; a lock is
#      refused only when fresh (<90min) and its holder is alive; otherwise
#      it is stolen with an audit-log line. `--steal` forces takeover.
#   8. Bundle-marker assertion: before releasing the lock, assert the live
#      marker + HEAD match the deployed SHA, and print the post-deploy
#      verification lines (per the CHANGELOG shared-server warning).
#
# Usage: ops/deploy-from-git.sh [--steal] <branch> [owner]
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"

# Tunables (env-overridable for tests; defaults = production).
REPO="${DEPLOY_REPO:-/opt/frame28}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3200/api/healthz?type=readiness}"
HEALTH_TIMEOUT_S="${DEPLOY_HEALTH_TIMEOUT_S:-120}"
HEALTH_INTERVAL_S="${DEPLOY_HEALTH_INTERVAL_S:-5}"
LOCK_MAX_AGE_S="${DEPLOY_LOCK_MAX_AGE_S:-5400}" # 90 minutes
SNAP_KEEP="${DEPLOY_SNAP_KEEP:-2}"

audit() { # $1 message — append-only audit trail (survives lock removal)
  echo "$(date -u +%FT%TZ) $1" >> "$AUDIT_LOG"
}

lock_write_meta() {
  echo "$OWNER $$ $(date +%s)" > "$LOCK/owner"
}

lock_acquire() {
  # Sets lock on success (return 0). Refuses (return 1) ONLY when the
  # existing lock is fresh (<LOCK_MAX_AGE_S) AND its holder is alive.
  if [ "$STEAL" = 1 ] && [ -d "$LOCK" ]; then
    audit "STEAL --steal flag by $OWNER (prev: $(cat "$LOCK/owner" 2>/dev/null || echo unknown))"
    echo "STEAL: --steal flag, taking over lock from $(cat "$LOCK/owner" 2>/dev/null || echo unknown)"
    rm -rf "$LOCK"
  fi
  if mkdir "$LOCK" 2>/dev/null; then
    lock_write_meta
    return 0
  fi
  local meta owner pid started now age alive
  meta="$(cat "$LOCK/owner" 2>/dev/null || echo "")"
  owner="$(echo "$meta" | awk '{print $1}')"
  pid="$(echo "$meta" | awk '{print $2}')"
  started="$(echo "$meta" | awk '{print $3}')"
  [ -n "$owner" ] || owner="unknown"
  now="$(date +%s)"
  if [[ "$started" =~ ^[0-9]+$ ]]; then age=$((now - started)); else age="unknown"; fi
  alive=0
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then alive=1; fi
  if [ "$age" != "unknown" ] && [ "$age" -lt "$LOCK_MAX_AGE_S" ] && [ "$alive" = 1 ]; then
    echo "DEPLOY LOCKED by: $owner (pid $pid alive, age ${age}s < ${LOCK_MAX_AGE_S}s)"
    return 1
  fi
  audit "STEAL stale lock by $OWNER (owner=$owner pid=$pid age=${age}s holder_alive=$alive)"
  echo "STEAL: taking over stale lock (owner=$owner pid=$pid age=${age}s holder_alive=$alive)"
  rm -rf "$LOCK"
  if mkdir "$LOCK" 2>/dev/null; then
    lock_write_meta
    return 0
  fi
  echo "DEPLOY LOCKED by: $(cat "$LOCK/owner" 2>/dev/null || echo unknown) (lost steal race)"
  return 1
}

snapshot_live() {
  # $1 = tag (e.g. short SHA). Snapshots current live .output/ BEFORE rsync.
  # Sets SNAP_PATH. Prunes older snapshots, keeping newest $SNAP_KEEP.
  local tag ts snap snaps total i
  tag="${1:-pre}"
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  snap="$SNAP_DIR/snap_${ts}_${tag}"
  mkdir -p "$SNAP_DIR"
  rsync -a --delete "$REPO/.output/" "$snap/"
  SNAP_PATH="$snap"
  echo "SNAPSHOT: live .output/ retained at $SNAP_PATH"
  snaps=( $(ls -1d "$SNAP_DIR"/snap_* 2>/dev/null | sort) )
  total=${#snaps[@]}
  if [ "$total" -gt "$SNAP_KEEP" ]; then
    for ((i = 0; i < total - SNAP_KEEP; i++)); do
      rm -rf "${snaps[$i]}"
      echo "SNAPSHOT PRUNE: removed ${snaps[$i]} (keeping newest $SNAP_KEEP)"
    done
  fi
}

wait_ready() {
  # $1 = phase label. Polls $HEALTH_URL until HTTP 200 or bounded timeout.
  local label deadline code now
  label="$1"
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT_S ))
  while :; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null) || code="000"
    if [ "$code" = "200" ]; then
      echo "READY OK ($label): $HEALTH_URL -> 200"
      return 0
    fi
    now=$(date +%s)
    if [ "$now" -ge "$deadline" ]; then
      echo "READY TIMEOUT ($label): $HEALTH_URL last=$code after ${HEALTH_TIMEOUT_S}s"
      return 1
    fi
    sleep "$HEALTH_INTERVAL_S"
  done
}

rollback() {
  # $1 = reason. Best-effort restore of last-good artifact + restart +
  # re-verify (readiness). Prints RESTORED/UNRESTORED. Return 0/1 to match.
  local reason snap_marker live_marker
  reason="$1"
  echo "ROLLBACK ($reason): restoring last-good artifact from ${SNAP_PATH:-<none>}"
  if [ -z "${SNAP_PATH:-}" ] || [ ! -d "$SNAP_PATH" ]; then
    echo "ROLLBACK UNRESTORED: no snapshot available"
    return 1
  fi
  if ! rsync -a --delete "$SNAP_PATH/" "$REPO/.output/"; then
    echo "ROLLBACK UNRESTORED: rsync-back failed"
    return 1
  fi
  if [ -f "$SNAP_PATH/DEPLOYED_SHA" ]; then
    snap_marker="$(cat "$SNAP_PATH/DEPLOYED_SHA")"
    live_marker="$(cat "$REPO/.output/DEPLOYED_SHA" 2>/dev/null || echo MISSING)"
    if [ "$live_marker" = "$snap_marker" ]; then
      echo "ROLLBACK: live marker $live_marker matches snapshot (good)"
    else
      echo "ROLLBACK WARNING: live marker '$live_marker' != snapshot '$snap_marker' (continuing to restart)"
    fi
  fi
  if ! systemctl restart framique.service; then
    echo "ROLLBACK UNRESTORED: restored bits live but restart failed"
    return 1
  fi
  if wait_ready "post-rollback"; then
    echo "ROLLBACK RESTORED: last-good artifact live, readiness OK"
    return 0
  else
    echo "ROLLBACK UNRESTORED: restored bits live but readiness failed"
    return 1
  fi
}

restart_and_activate() {
  # Restart + health gate. On restart-fail OR readiness-timeout, runs the
  # rollback path. Return 0 only when the new build is live AND ready.
  if ! systemctl restart framique.service; then
    echo "RESTART FAILED: systemctl restart framique.service errored"
    rollback "restart-failed" || true
    return 1
  fi
  if ! wait_ready "post-restart"; then
    rollback "readiness-timeout" || true
    return 1
  fi
  return 0
}

verify_bundle_marker() {
  # Assert live marker matches the just-deployed SHA (fail-fast gate).
  # Sets global fail=1 on mismatch.
  local live_marker
  live_marker="$(cat "$REPO/.output/DEPLOYED_SHA" 2>/dev/null || echo MISSING)"
  if [ "$live_marker" != "$DEPLOYED_SHA" ]; then
    echo "VERIFY FAIL: live bundle marker '$live_marker' != deployed SHA $DEPLOYED_SHA"
    fail=1
  else
    echo "VERIFY OK: live bundle marker $live_marker == deployed SHA"
  fi
}

print_post_deploy_lines() {
  # Required announcement proof (CHANGELOG shared-server warning).
  echo "POST-DEPLOY VERIFY:"
  echo "  git rev-parse HEAD: $(git -C "$REPO" rev-parse HEAD)"
  echo "  live bundle marker: $(cat "$REPO/.output/DEPLOYED_SHA")"
}

check() { # $1 url $2 expected
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$1")
  if [ "$code" != "$2" ]; then echo "VERIFY FAIL: $1 -> $code (want $2)"; fail=1;
  else echo "VERIFY OK: $1 -> $code"; fi
}

run_contract_checks() {
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
  # flamelancer.com rename, so it pins this gate. Its DNS delegation later
  # went dead (REFUSED at the registry NS, 2026-10-19) so the name cannot
  # resolve from anywhere; when that happens, pin the same edge contract
  # edge-direct via --resolve (raw curl, so set -e can't kill the script),
  # keeping the check's teeth instead of skipping it.
  if getent hosts microscrop.shop >/dev/null 2>&1; then
    check "https://microscrop.shop/" "404"
  else
    edge_ip="$(getent hosts framique.qubickle.com | awk 'NR==1{print $1}')"
    if [ -z "$edge_ip" ]; then
      echo "VERIFY FAIL: microscrop.shop DNS is dead and framique.qubickle.com did not resolve for an edge-direct probe"
      fail=1
    else
      um_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 --resolve "microscrop.shop:443:$edge_ip" "https://microscrop.shop/") || um_code="000"
      if [ "$um_code" = "404" ]; then
        echo "VERIFY OK: microscrop.shop (edge-direct via $edge_ip; DNS delegation dead) -> 404"
      else
        echo "VERIFY FAIL: microscrop.shop (edge-direct via $edge_ip) -> $um_code (want 404)"
        fail=1
      fi
    fi
  fi
  check "https://framique.qubickle.com/api/public/ph/x" "200"
}

main() {
  STEAL=0
  if [ "${1:-}" = "--steal" ]; then STEAL=1; shift; fi
  BRANCH="${1:?usage: deploy-from-git.sh [--steal] <branch> [owner]}"
  OWNER="${2:-$(whoami)}"
  LOCK="$REPO/.deploy-lock"
  WORK="/tmp/opencode/deploy-$BRANCH"
  SNAP_DIR="$REPO/.output-snapshots"
  AUDIT_LOG="$REPO/.deploy-lock-audit.log"
  SNAP_PATH=""
  DEPLOYED_SHA=""
  fail=0

  if ! lock_acquire; then
    exit 1
  fi
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
  # Stamp the bundle marker BEFORE rsync so the live artifact carries it.
  DEPLOYED_SHA="$(git -C "$WORK" rev-parse HEAD)"
  echo "$DEPLOYED_SHA" > "$WORK/.output/DEPLOYED_SHA"
  echo "BUNDLE MARKER: $DEPLOYED_SHA stamped into artifact"
  snapshot_live "$(echo "$DEPLOYED_SHA" | cut -c1-7)"
  rsync -a --delete "$WORK/.output/" "$REPO/.output/"

  if ! restart_and_activate; then
    echo "DEPLOY FAILED: $BRANCH not activated (see ROLLBACK status above)"
    exit 1
  fi

  verify_bundle_marker
  run_contract_checks
  if [ "$fail" != 0 ]; then
    echo "DEPLOY VERIFICATION FAILED"
    rollback "verification-failed" || true
    echo "DEPLOY FAILED: $BRANCH not verified live (see ROLLBACK status above)"
    exit 1
  fi
  print_post_deploy_lines
  echo "DEPLOY OK: $BRANCH live ($DEPLOYED_SHA)"
}

# Test hook: sourcing this file defines functions without running a deploy.
if [ "${BASH_SOURCE[0]:-$0}" != "$0" ]; then
  return 0 2>/dev/null
fi
main "$@"
