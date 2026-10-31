#!/usr/bin/env bash
# CI lane: the seven-template editor journey, on a throwaway loopback stack.
#
# This script is the executable form of docs/15-e2e/loopback-auth-setup.md.
# It brings up the E2E-only Supabase stack (docker-compose.e2e.yml), applies
# the sanctioned fresh-DB migration chain, creates a real GoTrue merchant,
# seeds the demo catalogue with that merchant's uid, applies the archive pager
# fixture, and runs `.e2e/songoskriti-seven-templates.spec.ts` through the
# real editor. Every secret is generated in-job; nothing is written to the
# repo. Teardown runs on success, failure, and interruption.
#
# Usage:
#   scripts/e2e-seven-templates-ci.sh            # full bring-up + run + down -v
#   scripts/e2e-seven-templates-ci.sh --reuse    # skip bring-up/teardown; use
#                                                # the already-exported env
#
# --reuse expects SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
# / E2E_MERCHANT_EMAIL / E2E_MERCHANT_PASSWORD / AUTH_HASH_SALT to be set.
#
# CI notes:
# - Run on a Docker-capable machine executor. `setup_remote_docker` would
#   break the 127.0.0.1 contract between the app and the stack.
# - `--retries=0 --workers=1`: a red run is a real red, never a retry mask.
# - No production host or credential is ever referenced.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

REUSE=0
if [ "${1:-}" = "--reuse" ]; then
  REUSE=1
elif [ -n "${1:-}" ]; then
  echo "unknown argument: $1 (expected --reuse)" >&2
  exit 2
fi

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/frame30-seven-ci.XXXXXX")
PROJECT="frame30-seven-ci"
COMPOSE_BASE=(docker compose -p "$PROJECT" -f docker-compose.e2e.yml)
ENV_FILE="$WORK_DIR/.e2e.env"
KONG_FILE="$WORK_DIR/kong.yml"
# Running count of migration statements skipped against a fresh stack because
# the object they touch exists only in production (see `apply_sql`). Printed at
# the end so the gap is visible in CI logs; the job stays green as long as the
# post-apply assertions and the lane itself pass.
MIGRATION_GAP=0
SEED_GAP=0
PROD_PARITY_GAP=0
OVERRIDE_FILE="$WORK_DIR/override.yml"
PG_SERVICE="db"
PSQL=(docker compose -p "$PROJECT" -f docker-compose.e2e.yml --env-file "$ENV_FILE" exec -T "$PG_SERVICE" psql -U supabase_admin -h 127.0.0.1 -d postgres -q -v ON_ERROR_STOP=1)
# Same connection WITHOUT ON_ERROR_STOP, for the one legacy file documented
# below. Its outcome is asserted separately, so a real regression still fails.
PSQL_SOFT=(docker compose -p "$PROJECT" -f docker-compose.e2e.yml --env-file "$ENV_FILE" exec -T "$PG_SERVICE" psql -U supabase_admin -h 127.0.0.1 -d postgres -q)

# Kong's published loopback port. Overridable for the same reason as the db
# port; also the address every consumer (curl probes, SUPABASE_URL, the app)
# talks to, so it is derived once here.
KONG_PORT="${E2E_KONG_PORT:-58000}"
export E2E_KONG_PORT="$KONG_PORT"
KONG_ORIGIN="http://127.0.0.1:$KONG_PORT"

# Some sandboxes run the shell in a different network namespace than the
# Docker daemon, so a published 127.0.0.1 port is unreachable from the shell
# even though the container is up. CI's machine executor does not have this
# quirk. Opt in with E2E_LOOPBACK_RELAY=1 and the script pumps loopback ->
# kong with a throwaway socat for the life of the run.
RELAY_PID=""
console() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

teardown() {
  local status=$?
  trap - EXIT INT TERM
  if [ -n "$RELAY_PID" ]; then
    kill "$RELAY_PID" >/dev/null 2>&1 || true
  fi
  if [ "$REUSE" -eq 0 ]; then
    console "tearing down the throwaway stack"
    docker compose -p "$PROJECT" -f docker-compose.e2e.yml \
      --env-file "$ENV_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
  exit "$status"
}
trap teardown EXIT INT TERM

start_relay() {
  [ "${E2E_LOOPBACK_RELAY:-0}" = "1" ] || return 0
  command -v socat >/dev/null 2>&1 || {
    echo "E2E_LOOPBACK_RELAY=1 but socat is not on PATH" >&2
    exit 1
  }
  local kong_id
  kong_id=$(docker compose -p "$PROJECT" -f docker-compose.e2e.yml \
    --env-file "$ENV_FILE" ps -q kong)
  [ -n "$kong_id" ] || {
    echo "E2E_LOOPBACK_RELAY=1 but the kong container is not running" >&2
    exit 1
  }
  # One docker-exec pump per connection; still 127.0.0.1, still hermetic.
  socat TCP-LISTEN:"$KONG_PORT",bind=127.0.0.1,reuseaddr,fork \
    EXEC:"docker exec -i $kong_id /usr/bin/nc 127.0.0.1 8000" &
  RELAY_PID=$!
  console "loopback relay up on $KONG_ORIGIN -> kong ($kong_id)"
}

if [ "$REUSE" -eq 0 ]; then
  for bin in docker openssl node npx; do
    command -v "$bin" >/dev/null 2>&1 || {
      echo "missing required binary: $bin" >&2
      exit 1
    }
  done
  docker info >/dev/null 2>&1 || {
    echo "docker daemon is not reachable" >&2
    exit 1
  }

  umask 077
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  export JWT_SECRET
  read -r ANON_KEY SERVICE_ROLE_KEY < <(
    node - <<'NODE'
const crypto = require("node:crypto");
const secret = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const sign = (role) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    iss: "frame30-e2e",
    ref: "frame30-e2e",
    role,
    iat: now,
    exp: now + 60 * 60 * 24 * 365,
  });
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
};
process.stdout.write(`${sign("anon")} ${sign("service_role")}\n`);
NODE
  )
  [ -n "$ANON_KEY" ] && [ -n "$SERVICE_ROLE_KEY" ] || {
    echo "failed to generate throwaway JWT keys" >&2
    exit 1
  }

  E2E_EMAIL="e2e-merchant@example.invalid"
  E2E_PASSWORD="E2Ethrowaway!2026"
  AUTH_HASH_SALT="ci-throwaway-salt-$(openssl rand -hex 16)"
  PREVIEW_TOKEN_SECRET="ci-throwaway-preview-$(openssl rand -hex 16)"

  cat >"$ENV_FILE" <<EOF
POSTGRES_DB=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_MAX_CONNECTIONS=100
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600
SUPABASE_PUBLIC_URL=$KONG_ORIGIN
SITE_URL=http://localhost:3020
ADDITIONAL_REDIRECT_URLS=http://localhost:3020,http://127.0.0.1:3020
DISABLE_SIGNUP=false
PGRST_DB_SCHEMAS=public,storage,graphql_public
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
EOF

  # Kong 2.8.1 does not interpolate ${VAR} in DB-less config: render the
  # throwaway keys into a private copy and mount that.
  ANON_KEY="$ANON_KEY" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" KONG_FILE="$KONG_FILE" \
    node - <<'NODE'
const fs = require("node:fs");
let s = fs.readFileSync("supabase/docker/kong.yml", "utf8");
s = s
  .replaceAll("${SUPABASE_ANON_KEY}", process.env.ANON_KEY)
  .replaceAll("${SUPABASE_SERVICE_KEY}", process.env.SERVICE_ROLE_KEY);
fs.writeFileSync(process.env.KONG_FILE, s);
NODE
  # Throwaway keys, but Kong reads the mount as an unprivileged user.
  chmod 644 "$KONG_FILE"

  cat >"$OVERRIDE_FILE" <<EOF
services:
  kong:
    volumes:
      - $KONG_FILE:/home/kong/kong.yml:ro
EOF

  console "generating throwaway secrets and starting the database"
  docker compose -p "$PROJECT" -f docker-compose.e2e.yml \
    -f "$OVERRIDE_FILE" --env-file "$ENV_FILE" up -d db

  for _ in $(seq 1 60); do
    if docker compose -p "$PROJECT" -f docker-compose.e2e.yml \
      --env-file "$ENV_FILE" exec -T db pg_isready -U supabase_admin \
      -h 127.0.0.1 >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  docker compose -p "$PROJECT" -f docker-compose.e2e.yml \
    --env-file "$ENV_FILE" exec -T db pg_isready -U supabase_admin \
    -h 127.0.0.1 >/dev/null

  # Service-role passwords are empty after the image's own init; set them
  # before auth/rest start (same correction as the runbook §1).
  console "setting service-role passwords"
  "${PSQL[@]}" -f - <<SQL
ALTER ROLE supabase_auth_admin WITH PASSWORD '$(printf '%s' "$POSTGRES_PASSWORD" | sed "s/'/''/g")';
ALTER ROLE authenticator WITH PASSWORD '$(printf '%s' "$POSTGRES_PASSWORD" | sed "s/'/''/g")';
ALTER ROLE supabase_storage_admin WITH PASSWORD '$(printf '%s' "$POSTGRES_PASSWORD" | sed "s/'/''/g")';
SQL

  # Start EVERYTHING before touching the schema: the baseline dump depends on
  # auth.uid() and the auth schema, which GoTrue creates when it boots.
  console "starting auth, rest and kong"
  docker compose -p "$PROJECT" -f docker-compose.e2e.yml \
    -f "$OVERRIDE_FILE" --env-file "$ENV_FILE" up -d

  start_relay

  for _ in $(seq 1 90); do
    if curl -fsS -m 3 -H "apikey: $ANON_KEY" \
      "$KONG_ORIGIN/auth/v1/health" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  curl -fsS -m 5 -H "apikey: $ANON_KEY" \
    "$KONG_ORIGIN/auth/v1/health" >/dev/null

  console "applying baseline + roles"
  # migration/0001_baseline.sql was dumped from PG 17 by pg_dump 17.9, and
  # the source database had recreated `public` explicitly. The E2E image's own
  # initdb has already created `public`, so three constructs in the dump do
  # not apply verbatim to this server/client. All three carry no semantics for
  # a fresh apply, and every other statement still runs under ON_ERROR_STOP:
  #   * \restrict / \unrestrict   — psql-17 client dump guards (meta-commands)
  #   * SET transaction_timeout   — a PG 17 GUC (the other *_timeout SETs are
  #                                 older and are kept verbatim)
  #   * CREATE SCHEMA public      — already created by the image's initdb
  #                                 (the GRANTs / COMMENT on it still apply)
  # The historical runbook path tolerated these because its psql carried no
  # ON_ERROR_STOP; this script is fail-closed, so it filters them instead of
  # silently continuing past the error.
  apply_baseline() {
    sed -e '/^\\restrict /d' -e '/^\\unrestrict/d' \
      -e '/^SET transaction_timeout = /d' \
      -e '/^CREATE SCHEMA public;$/d' migration/0001_baseline.sql
  }
  # The baseline dump grants to `sandbox_exec`, a role that exists in the
  # environment the dump came from but that NO repo migration creates (it is
  # referenced by nothing else in the tree). The historical runbook path
  # silently skipped these grants for lack of ON_ERROR_STOP. Rather than drop
  # statements out of the baseline, create the missing no-login role so the
  # dump's GRANTs apply verbatim — it carries no login and no live surface.
  "${PSQL[@]}" -c \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN CREATE ROLE sandbox_exec NOLOGIN; END IF; END \$\$;"
  apply_baseline | "${PSQL[@]}" -f -

  # Enum parity with the deployed database. The checked-in baseline dump is
  # STALE relative to production: it has 4 payment methods where production
  # has 17, and `trial` where production has `trialing`. The repo's OWN seed
  # requires the newer values (migration/0003_demo_catalogue.sql inserts
  # 'sslcommerz' AND 'card'; supabase/migrations/20260924_songoskriti_demo.sql
  # inserts 'trialing'), so without these a fresh stack cannot even hold the
  # seed. Each value is verified present in production's enum before adding,
  # so this moves a fresh stack TOWARD the deployed schema, never away from it.
  # Deliberately NOT added: merchant_role 'editor'. The repo references it
  # (13 places, all in migration/0010) but production does not have it, so
  # those statements fail in production too — inventing the value here would
  # make the fresh stack disagree with the database it is meant to model.
  console "aligning enum values that the repo's own seed requires"
  "${PSQL[@]}" -c "ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'sslcommerz';"
  "${PSQL[@]}" -c "ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'card';"
  "${PSQL[@]}" -c "ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'trialing';"

  # Two production-only relations the repo's OWN seed inserts into
  # (migration/0003_demo_catalogue.sql writes nav_menus / nav_menu_items). The
  # stale baseline never created them, so without this the demo seed cannot
  # run and the demo merchant has no storefront navigation. DDL is verbatim
  # production (see migration/e2e-schema-parity.sql header for scope).
  console "materializing the production-only nav relations the seed requires"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f - <migration/e2e-schema-parity.sql

  # Comprehensive production-schema parity. The ~119 remaining production-only
  # relations the app reads at runtime (traced from `.from()` across the server
  # libs) are materialized from VERBATIM production DDL + grants, so the fresh
  # stack reproduces the deployed read/write posture. This is what lets the
  # storefront render path resolve (e.g. `template_seo.map` reads
  # `builder_template_seo` and THROWS without it -> /store 404s).
  #
  # Applied BEST-EFFORT (soft), same policy as the migration chain: every
  # statement runs, failures (an RLS policy referencing a production-only
  # function) are counted and printed, never fatal. The CREATE TABLE + GRANT
  # statements carry no production-only dependency, so the tables the app reads
  # always land. Set E2E_MIGRATION_STRICT=1 to fail fast while debugging.
  console "materializing the remaining production-only relations the app reads"
  # NB: plain top-level assignments — a `local` here would abort the run
  # under `set -e` ("local: can only be used in a function").
  prod_err="" prod_n=0 prod_lines="" prod_total=0
  prod_err=$("${PSQL_SOFT[@]}" -f - <migration/e2e-schema-parity-prod.sql 2>&1 1>/dev/null) || true
  if printf '%s' "$prod_err" | grep -q 'ERROR:'; then
    prod_n=$(printf '%s\n' "$prod_err" | grep -c 'ERROR:')
    PROD_PARITY_GAP=$((PROD_PARITY_GAP + prod_n))
    # Build the prefixed lines ONCE (no pipe-to-head). A `| head -40` here would
    # SIGPIPE the upstream grep/sed under `set -euo pipefail` and abort the whole
    # run (exit 141) the moment the tolerated count exceeds the cap — which is
    # exactly what the comprehensive parity file does. Instead: assign to a
    # variable, print a bounded prefix, and count the suppressed remainder from
    # the variable. Printing is cosmetic; the count (PROD_PARITY_GAP) is the
    # contract, and it is exact either way.
    prod_lines=$(printf '%s\n' "$prod_err" | grep 'ERROR:' | sed "s|^|    [prod-parity] |")
    printf '%s\n' "$prod_lines" | awk 'NR<=40'
    prod_total=$(printf '%s\n' "$prod_lines" | grep -c 'ERROR:')
    if [ "$prod_total" -gt 40 ]; then
      echo "    [prod-parity] ... $((prod_total - 40)) more suppressed (all counted above)"
    fi
  fi
  console "production-schema parity applied — $PROD_PARITY_GAP statement(s) tolerated"

  # migration/0006_search_typo_tolerance.sql builds its GIN indexes with
  # `extensions.gin_trgm_ops` / `extensions.word_similarity` — pg_trgm
  # installed in an `extensions` schema. Nothing in the repo creates that
  # schema and no object depends on pg_trgm being in `public`, so install it
  # there BEFORE the vendored roles file would pin it to `public` (that
  # statement then becomes a no-op). Without this, 0006's indexes fail on a
  # fresh stack — including production, which has no pg_trgm at all.
  "${PSQL[@]}" -c "CREATE SCHEMA IF NOT EXISTS extensions;"
  "${PSQL[@]}" -c \
    "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;"

  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" "${PSQL[@]}" -f - \
    <supabase/docker/init/01-roles-and-extensions.sql

  # Apply one migration file. BEST-EFFORT by default, and deliberately so:
  #
  #   The checked-in SQL does not reproduce the deployed schema. ~120 relations
  #   (experiments, support_tickets, url_redirects, theme_assets,
  #   builder_template_seo, article_revisions, page_revisions, …) exist in
  #   production but have NO creator anywhere in this repo. (Two of them,
  #   nav_menus / nav_menu_items, are materialized separately by
  #   migration/e2e-schema-parity.sql because the repo's OWN seed inserts into
  #   them; the rest are left absent.) One
  #   merchant_role value ('editor') and one has_merchant_role overload exist
  #   in production but have NO creator anywhere in this repo. Several files
  #   also re-create policies without DROP POLICY IF EXISTS, which fails in
  #   production too. That is ~130 statements across ~16 files — the sanctioned
  #   fresh-DB path (docs/15-e2e/loopback-auth-setup.md) has always applied
  #   this chain with no ON_ERROR_STOP, so every one of them has been silently
  #   skipped in every stack ever built this way, including the one the
  #   seven-templates lane was last proven green against.
  #
  #   A strict apply would go red for reasons that predate this job, so this
  #   step is best-effort — but NEVER silent: every skipped statement is
  #   printed and counted, and a hard assertion block below (plus the lane
  #   itself) fails the job if anything the lane depends on is missing. Set
  #   E2E_MIGRATION_STRICT=1 to fail on the first error while debugging.
  #
  #   Catching a genuinely broken NEW migration is not this job's job: it is
  #   `bun run db:migrate` / `schema:check` against a real database, which are
  #   the strict paths. See report.md §9.5 for the recorded follow-up.
  apply_sql() {
    local f="$1"
    console "  $f"
    if [ "${E2E_MIGRATION_STRICT:-0}" = "1" ]; then
      "${PSQL[@]}" -f - <"$f"
      return
    fi
    local err n
    err=$("${PSQL_SOFT[@]}" -f - <"$f" 2>&1 1>/dev/null) || true
    if printf '%s' "$err" | grep -q 'ERROR:'; then
      n=$(printf '%s\n' "$err" | grep -c 'ERROR:')
      MIGRATION_GAP=$((MIGRATION_GAP + n))
      printf '%s\n' "$err" | grep 'ERROR:' \
        | sed "s|^|    [legacy-gap] $(basename "$f"): |"
    fi
  }

  # supabase/migrations/20260907174014_* is the ONLY file in the repo that
  # creates public.is_public_merchant, which migration/0005_content_editorial
  # _fields.sql (in the chain below) needs for its two anon-read policies.
  # The historical runbook applied this file LAST and carried no
  # ON_ERROR_STOP, so its psql skipped the 0005 statements that needed the
  # function — a latent half-apply this script closes by applying it here,
  # BEFORE the chain.
  #
  # It is applied best-effort because its REVOKE/GRANT block targets
  # stock_hold_sweep/schema_fingerprint/analytics_ingest/… — functions that
  # exist in the pre-existing production database but that NO SQL file in
  # this repo creates. The one statement the chain actually depends on is
  # asserted immediately after, so a real regression here still fails the job.
  console "applying is_public_merchant (dependency of migration/0005)"
  LEGACY_FIXUP="$(ls supabase/migrations/20260907174014_*.sql)"
  "${PSQL_SOFT[@]}" -f - <"$LEGACY_FIXUP"
  if [ "$("${PSQL[@]}" -Atc \
    "select to_regprocedure('public.is_public_merchant(uuid)') is not null")" != "t" ]; then
    echo "FATAL: is_public_merchant was not created; migration/0005 cannot apply" >&2
    exit 1
  fi
  console "is_public_merchant present — continuing"

  console "applying the migration chain"
  apply_sql migration/0002_merchant_domains.sql
  for f in migration/000[4-9]_*.sql migration/001*_*.sql \
    migration/002[0-9]_*.sql; do
    apply_sql "$f"
  done

  # The sanctioned fresh-DB tail (runbook §2): every supabase migration whose
  # DATE falls in [20260919, 20261015], plus the named fresh-db backfills.
  #
  # The date must be read off the first 8 characters of the filename, NOT the
  # whole numeric prefix: many files are named with a 14-digit timestamp
  # (20260919090001_careful_new_tables_b.sql). Comparing that full number
  # against 20261015 silently skips 42 of the 71 files — including the one
  # that creates theme_custom_code, which 20260923_retire_themes.sql then
  # reports as missing. The runbook's glob (20260919* … 20261015*) matches on
  # the date prefix, so this reproduces it exactly.
  # Files dated before 20260919 are skipped as already represented by
  # migration/ (per the runbook), except 20260907174014 applied explicitly.
  while IFS= read -r f; do
    ver=$(basename "$f")
    ver=${ver%%_*}
    date8=${ver:0:8}
    if { [ "$date8" -ge 20260919 ] && [ "$date8" -le 20261015 ]; } ||
      [ "$ver" = "20261017000000" ] || [ "$ver" = "20261017000001" ] ||
      [ "$ver" = "20261019000000" ]; then
      apply_sql "$f"
    fi
  done < <(ls supabase/migrations/*.sql | sort)
  # Re-applied at the tail exactly as the runbook does, so its GRANT posture
  # lands after every other file. Best-effort for the same reason as above.
  "${PSQL_SOFT[@]}" -f - <"$LEGACY_FIXUP"

  console "migration chain applied — $MIGRATION_GAP statement(s) skipped (legacy gap)"

  # Post-apply assertions. The apply above is best-effort, so the job's real
  # contract lives here: everything the seven-templates lane touches must
  # exist. These are the objects the specs read or write (preview sources,
  # theme activation, builder templates, blog/archive surfaces, account).
  # If a NEW migration breaks any of them, this block fails before the lane
  # even starts — which is how a best-effort apply stays trustworthy.
  console "asserting the schema the lane depends on"
  assert_relation() {
    if [ "$("${PSQL[@]}" -Atc \
      "select to_regclass('public.$1') is not null")" != "t" ]; then
      echo "FATAL: required relation public.$1 is missing after the migration chain" >&2
      exit 1
    fi
  }
  for rel in merchants merchant_members store_themes theme_registry \
    articles blog_terms article_terms \
    products product_variants categories; do
    assert_relation "$rel"
  done
  assert_relation theme_catalog_favourites   # created by 20261017000000 (runbook's fresh-db backfill)
  # Created by migration/e2e-schema-parity.sql (production-only relations the
  # repo's OWN seed inserts into) — assert them so a parity regression fails
  # the job loudly instead of silently gutting the demo navigation.
  assert_relation nav_menus
  assert_relation nav_menu_items
  # url_redirects is read strictly by permalink.server.ts on every /store route;
  # without it all storefront routes 404 (materialized by e2e-schema-parity.sql).
  assert_relation url_redirects
  # NOTE deliberately NOT asserted: builder_templates, builder_template_seo,
  # experiments, support_tickets, url_redirects, theme_assets,
  # article_revisions, page_revisions, integration_probes, seo_not_found_log
  # (~120 in total). All exist in production but NO migration in this repo
  # creates them, so a fresh
  # stack cannot have them and the lane is proven green without them (the app
  # logs benign "relation does not exist" warnings for them). Asserting them
  # here would fail the job for a gap that predates it — see report.md §9.5.
  # The lane's theme source depends on this helper existing.
  if [ "$("${PSQL[@]}" -Atc \
    "select to_regprocedure('public.is_public_merchant(uuid)') is not null")" != "t" ]; then
    echo "FATAL: is_public_merchant missing after the full chain" >&2
    exit 1
  fi
  console "schema assertions passed"

  "${PSQL[@]}" -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true

  console "creating the disposable merchant through the real GoTrue admin API"
  USER_JSON=$(curl -fsS -m 60 -X POST \
    "$KONG_ORIGIN/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\",\"email_confirm\":true}")
  MERCHANT_UID=$(printf '%s' "$USER_JSON" | node -e \
    'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.id||"")})')
  [ -n "$MERCHANT_UID" ] || {
    echo "GoTrue admin user creation returned no id" >&2
    exit 1
  }

  # Seed the demo merchant + catalogue. Like the migration chain, this is
  # BEST-EFFORT but NEVER silent — the checked-in seed SQL still carries latent
  # statements the tolerant runbook path always skipped (unsupported enum
  # values, statements against relations the chain cannot fully build). Each
  # seed file is applied soft, its errors counted and printed — then the rows
  # the lane ACTUALLY depends on (the merchant's theme, the blog term, the
  # merchant's own CMS page, the archive articles) are hard-asserted below, so a
  # real seed regression fails the job loudly.
  seed_sql() {
    local f="$1"
    if [ "${E2E_MIGRATION_STRICT:-0}" = "1" ]; then
      "${PSQL[@]}" -f - <"$f"
      return
    fi
    local err n
    err=$("${PSQL_SOFT[@]}" -f - <"$f" 2>&1 1>/dev/null) || true
    if printf '%s' "$err" | grep -q 'ERROR:'; then
      n=$(printf '%s\n' "$err" | grep -c 'ERROR:')
      SEED_GAP=$((SEED_GAP + n))
      printf '%s\n' "$err" | grep 'ERROR:' \
        | sed "s|^|    [seed-gap] $(basename "$f"): |"
    fi
  }

  console "seeding the demo merchant (real uid) and catalogue"
  grep -v '^\\set seed_user_id' migration/0002_seed.sql |
    "${PSQL[@]}" -v seed_user_id="$MERCHANT_UID" -f -
  seed_sql migration/0003_demo_catalogue.sql
  seed_sql .e2e/fixtures/songoskriti-archive-seed.sql
  console "seed applied — $SEED_GAP statement(s) skipped (latent seed gap)"

  # The repo's OWN seed (migration/0002_seed.sql:72) and the legacy fixup
  # (supabase/migrations/20260907174014) both REVOKE anon's full SELECT on
  # merchant_settings and re-grant only a narrow column list — running AFTER the
  # parity step above, so they undo it. The deployed database grants anon a full
  # SELECT (verified), which is what the public storefront reads. Re-grant it
  # here, after seeding, so it survives the seed's revoke and matches production.
  "${PSQL[@]}" -c "GRANT SELECT ON TABLE public.merchant_settings TO anon;"

  # Hard-assert the seed rows the seven-template lane depends on. The soft
  # apply above tolerates the known-latent statements (blog_terms.article_count);
  # these assertions make sure the ESSENTIAL data still landed, so a genuine
  # seed break fails here with a clear message instead of a confusing Playwright
  # failure downstream.
  #
  # NOTE the seed keys its catalogue/theme/archive rows to a HARDCODED demo
  # merchant (seed_merchant_id in migration/0002_seed.sql), NOT to the GoTrue
  # uid ($MERCHANT_UID). The GoTrue user is linked to that merchant as `owner`
  # via merchant_members; the lane authenticates as that user and renders the
  # demo merchant's storefront. So the assertions must target the demo merchant.
  DEMO_MERCHANT_ID="11111111-1111-4111-8111-111111111111"
  console "asserting the seed rows the lane depends on"
  require_at_least() {
    local label="$1" table="$2" got
    got=$("${PSQL[@]}" -Atc "select count(*) from $table where merchant_id = '$DEMO_MERCHANT_ID'")
    if [ "${got:-0}" -lt 1 ]; then
      echo "FATAL: seed produced no rows in $table for demo merchant ($label; got $got)" >&2
      exit 1
    fi
  }
  # store_themes (0003:501) and products (0003:22+) are hard-inserted by the
  # demo catalogue; the blog term, its 13-article archive and the merchant's own
  # `our-story` CMS page are inserted by the archive seed. These are what the
  # seven-template lane renders against.
  require_at_least "theme" store_themes
  require_at_least "products" products
  require_at_least "blog term" blog_terms
  require_at_least "store page" storefront_pages
  # archive articles use a slug prefix, not just merchant_id
  got=$("${PSQL[@]}" -Atc "select count(*) from articles where merchant_id = '$DEMO_MERCHANT_ID' and slug like 'swarm4-archive-page-%'")
  if [ "${got:-0}" -lt 1 ]; then
    echo "FATAL: seed produced no archive articles for the merchant (got $got)" >&2
    exit 1
  fi
  # The resolved term must actually carry the term's full 13-article window: the
  # reader resolves through blog_terms and counts through article_terms, so if
  # the links are missing the archive renders empty (or 404s on a failed
  # resolve) even though the articles exist.
  got=$("${PSQL[@]}" -Atc "select count(*) from article_terms at join blog_terms t on t.id = at.term_id where t.slug = 'handloom-heritage' and t.merchant_id = '$DEMO_MERCHANT_ID'")
  if [ "${got:-0}" -lt 13 ]; then
    echo "FATAL: handloom-heritage carries $got linked articles, expected 13" >&2
    exit 1
  fi
  console "seed rows verified (theme, products, blog term, store page, 13-article archive)"

  export SUPABASE_URL="$KONG_ORIGIN"
  export SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export SUPABASE_ANON_KEY="$ANON_KEY"
  export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
  export VITE_SUPABASE_URL="$KONG_ORIGIN"
  export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
else
  : "${SUPABASE_URL:?--reuse needs SUPABASE_URL}"
  : "${SUPABASE_ANON_KEY:?--reuse needs SUPABASE_ANON_KEY}"
  : "${SUPABASE_SERVICE_ROLE_KEY:?--reuse needs SUPABASE_SERVICE_ROLE_KEY}"
  : "${AUTH_HASH_SALT:?--reuse needs AUTH_HASH_SALT}"
  E2E_EMAIL="${E2E_MERCHANT_EMAIL:?--reuse needs E2E_MERCHANT_EMAIL}"
  E2E_PASSWORD="${E2E_MERCHANT_PASSWORD:?--reuse needs E2E_MERCHANT_PASSWORD}"
fi

console "running the seven-template lane (no retries, one worker)"
export AUTH_HASH_SALT
export PREVIEW_TOKEN_SECRET="${PREVIEW_TOKEN_SECRET:-$AUTH_HASH_SALT}"
export E2E_MERCHANT_EMAIL="$E2E_EMAIL"
export E2E_MERCHANT_PASSWORD="$E2E_PASSWORD"
export E2E_PORT="${E2E_PORT:-3020}"
export DISABLE_HMR=true
export CI=1

npx playwright test -c .e2e/playwright.config.ts \
  songoskriti-seven-templates --retries=0 --workers=1
