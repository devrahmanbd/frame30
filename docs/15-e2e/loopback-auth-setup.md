# E2E loopback auth setup (real GoTrue session for the plugin journeys)

Status: WORKING end-to-end (verified live 2026-10-16/17). The former
save→reload blocker is FIXED on `frame30` — see §Wall (now historical).

Spec: `.e2e/plugin-authenticated-journey.spec.ts` (mode B). No auth stubbing
anywhere: the real `/auth` form mints a real GoTrue session.

## 1. Backend (throwaway, loopback)

Compose file (repo): `docker-compose.e2e.yml` — separate project
(`e2e-supabase`), own network/volumes, vendored pins
(postgres 15.8.1.060, GoTrue v2.170.0, PostgREST v12.2.8, Kong 2.8.1).
No secrets in the file — everything is `${VAR}` from an UNSAVED env file
outside the repo (e.g. `/tmp/opencode/e2e-auth/.e2e.env`, 600):

```bash
docker compose -f docker-compose.e2e.yml \
  --env-file /tmp/opencode/e2e-auth/.e2e.env up -d
```

Known deviations from the vendored stack (documented in the compose file):
- The vendored `./supabase/docker/init` mount is NOT used: it shadows the
  image's own `/docker-entrypoint-initdb.d` (roles/auth/storage schemas),
  so a fresh volume dies in pg_cron's after-create grant. The roles file is
  idempotent and applied post-boot via psql instead.
- Service-role passwords (`supabase_auth_admin`, `authenticator`,
  `supabase_storage_admin`) have none after init — set them to
  `POSTGRES_PASSWORD` (superuser `supabase_admin`, NOT `postgres`: the
  image demotes `postgres` in post-setup).
- `KONG_PLUGINS` adds `rate-limiting` (vendored list omits it, Kong 2.8.1
  refuses to boot without it).
- Kong 2.8.1 does NOT interpolate `${VAR}` in DB-less config (stores the
  literal string as the key). Pre-render `supabase/docker/kong.yml` with the
  throwaway keys to an UNSAVED `/tmp/opencode/e2e-auth/kong.yml` (644 so the
  daemon can read it); the compose file mounts that path.
- This box cannot program NEW docker NAT/proxy rules and the shell lives in
  a different netns than the daemon, so published ports are NOT reachable
  from the shell. Access is via a sandbox-loopback relay: `socat
  TCP-LISTEN:58000,bind=127.0.0.1,reuseaddr,fork
  EXEC:"docker exec -i e2e-supabase-kong-1 /usr/bin/nc 127.0.0.1 8000"`
  (one `docker exec` pump per connection; host-127 docker-proxy ports exist
  for host-netns consumers). The app and specs use
  `VITE_SUPABASE_URL=http://127.0.0.1:58000` — still loopback, still
  hermetic (`blockExternalRequests` unaffected).

## 2. Schema + seed (repo sources only, no new seed file needed)

```bash
PX='docker exec -i -e PGPASSWORD=$POSTGRES_PASSWORD e2e-supabase-db-1 psql -U supabase_admin -h 127.0.0.1 -d postgres -q -f -'
$PX < migration/0001_baseline.sql            # 136 tables / ~251 policies, zero errors
$PX < supabase/docker/init/01-roles-and-extensions.sql
for f in migration/0002_merchant_domains.sql migration/0003_demo_catalogue.sql \
         migration/0004_*.sql ... migration/0026_*.sql \
         supabase/migrations/20260919*.sql ... supabase/migrations/20261015*.sql \
         supabase/migrations/20261017*.sql; do
  $PX < "$f"   # all green; skip migration/0002_seed.sql here (uid below)
done
# 20261017* carries fresh-db backfills that the historical chain missed:
#   * theme_catalog_favourites DDL (never created in any repo migration;
#     the Themes workspace 500s without it)
#   * anon SELECT grant on theme_versions (policy existed, grant did not —
#     every storefront silently fell back to the themeless welcome plate)
$PX < supabase/migrations/20260907174014_6c48ad30-9cbe-4af6-a43d-95ce60cfa04f.sql  # GRANT SELECT ON merchants TO anon
```

Merchant user via the REAL GoTrue admin API (service_role key, Kong
`…/auth/v1/admin/users`, `email_confirm:true`), then the repo seed with the
real uid (the file's `\set seed_user_id` default must be stripped — it
overrides `-v`; filter that line and pass `-v seed_user_id=<uid>`):

```bash
grep -v '^\\set seed_user_id' migration/0002_seed.sql | $PX -v seed_user_id=<uid>
# → merchants(frame19-demo) + merchant_members(owner/active) + profiles + settings + public RLS
```

(`supabase/baseline_parts/*.sql` is NOT directly applicable — `part1.sql`
defines `is_platform_admin` before `platform_admins` exists. The
`migration/` pipeline above is the sanctioned fresh-db path per
`migration/README.md`.)

## 3. App (test-only env override, no committed files changed)

Shell env beats `.env.local` under Vite (verified: served bundle contains
the override, no dummy host):

```bash
VITE_SUPABASE_URL=http://127.0.0.1:58000 VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY \
SUPABASE_URL=http://127.0.0.1:58000 SUPABASE_PUBLISHABLE_KEY=$ANON_KEY \
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY DISABLE_HMR=true \
npx vite --port 3020 --strictPort --host localhost
```

`DISABLE_HMR=true` sets `server.watch: null` (see `vite.config.ts:53`): with
two spec workers writing traces/screenshots under the watched root, HMR full
reloads otherwise reset the login/editor forms mid-flow with no error shown.
It changes no app behavior under test.

Run the specs against it (creds from unsaved env, never committed):

```bash
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
E2E_MERCHANT_EMAIL=e2e-merchant@example.invalid E2E_MERCHANT_PASSWORD='<throwaway>' \
npx playwright test -c .e2e/playwright.config.ts plugin-authenticated-journey
```

Without the creds, the three interactive tests skip with reason; the wall,
gate and static tests still prove the negative.

## 4. Wall (historically blocked the 3rd journey — fixed on `frame30`)

`save → reload` used to be broken for every studio-authored page,
independent of this setup:

- `canonicalBody()` (`src/lib/editor/editor.server.ts`) classified the
  `<!--fq-studio:v2 …-->` STRING envelope with `isBuilderBody()`
  (`src/lib/page-builder.ts`), which requires an OBJECT → always false →
  the envelope fell into the markdown canonicalizer.
- `markdownToBlocks` → `blocksToMarkdown`
  (`src/lib/editor/page-markdown.ts`) escaped the JSON (`"` → `\"`,
  `[` → `\[`; reproduced live). Storage held literal backslashes
  (byte-verified: `5c 5b 5c 5d`).
- Reload: `readStudioBody()` (`src/lib/studio/model.ts`) could not parse
  it → canvas adopted zero nodes (observed); the wipeout guard
  (`isWipeoutSave`, `src/lib/editor/editor-doc.ts`) read the baseline
  through the same failing parser and returned false → neutered. The next
  save/publish persisted `"root":[]` (observed repeatedly in
  `storefront_pages`).

Fix (verified by `src/lib/editor/editor-studio-save.test.ts`, 8 tests, plus
850 neighboring editor/studio tests green):

- `canonicalBody` passes studio v2 envelopes through byte-identical
  (`isStudioBody` guard); `plainText` returns `""` for envelopes.
- `parseStudioBody` gained a recovery chain for previously mangled
  payloads via the new `unescapeMd` in `page-markdown.ts` (exact inverse
  of `escapeMd`, one full layer).
- The third journey test (`save → reload → preview → publish →
  storefront`) is un-skipped and runs through the real UI.
- A second live-discovered gap was fixed alongside: the content editor
  route (`src/routes/_authenticated/dashboard/content/editor.tsx`) now
  mounts `PluginProvider plugins={authorizedPlugins}` so the canvas
  sandbox resolves installed plugins (before: the canvas degraded every
  installed widget to the "This app is not installed" placeholder while
  the inspector resolved through the registry). Pinned by
  `editor-registry.test.ts` and the spec's static wiring test.

## 5. Teardown (mandatory)

```bash
kill <vite-pid> <socat-pids>; pkill -f 'TCP-LISTEN:5800'  # + host-netns relays, if any
docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env down -v
docker ps  # verify nothing of yours remains; never touch framique-*/supabase-* prod containers
```
