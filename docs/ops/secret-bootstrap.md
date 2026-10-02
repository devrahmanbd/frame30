# Secret Bootstrap Runbook

**Classification:** Ops-restricted (platform owner only)
**Companion:** `secret-rotation.md` (rotation) · `AGENTS.md` (never commit secrets)
**Incident that created this doc:** 2026-10-02 — `:3000` was rebuilt from a
shell without Supabase env; the new bundle served 404/500 on every
DB-backed route because `VITE_*` values bake in at **build time**. Recovery
required spelunking git history (`9eab798:.env`). That must never be the
process again.

## 1. Source of truth

Supabase dashboard for project `framebase.qubickle.com` → Settings → API.
Keys live in server env only. There is intentionally **no `.env` file** in
the repo (untracked since `96ba081`); create it locally from the dashboard,
never commit it (`secrets:scan` blocks on committed patterns).

## 2. Required variables (names only — values come from the dashboard)

| Variable                        | Baked at build | Read at runtime     | Notes                         |
| ------------------------------- | -------------- | ------------------- | ----------------------------- |
| `SUPABASE_URL`                  | no             | yes (`*.server.ts`) | PostgREST base URL            |
| `SUPABASE_SERVICE_ROLE_KEY`     | no             | yes                 | Server-only, never client     |
| `SUPABASE_PUBLISHABLE_KEY`      | no             | yes                 | Server auth paths             |
| `VITE_SUPABASE_URL`             | **yes**        | fallback            | Must match `SUPABASE_URL`     |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **yes**        | fallback            | Must match publishable key    |
| `ENCRYPTION_KEY`                | no             | yes                 | App-level encryption          |
| `REDIS_URL`                     | no             | yes                 | Queue/cache; degrades without |

## 3. Bootstrap procedure (fresh machine)

1. Copy values from the Supabase dashboard into a local `.env` (same keys
   as the table above). Verify each value is non-empty; verify the two
   `VITE_*` values equal their non-`VITE_` twins.
2. Export before **both** build and run — a build made without `VITE_*`
   serves broken DB routes even if the runtime env is correct:
   ```bash
   set -a; source .env; set +a
   bun run build
   ```
3. Restart the server from the same sourced shell:
   ```bash
   kill $(lsof -ti:3000); sleep 2
   nohup node .output/server/index.mjs > /tmp/f30-prod.log 2>&1 &
   ```
4. Verify: `curl -s -o /dev/null -w "%{http_code}\n"
http://localhost:3000/theme-preview/oceanblue-v2` must print `200`
   (not `404`), and `/` must print `200` (not `500`).
5. Never print values to chat, logs, or docs. Confirm with lengths only.

## 4. Failure mode

If DB-backed routes 404/500 after a rebuild while static assets serve fine,
the build almost certainly baked empty `VITE_*` values. Do not debug routes
first — re-source `.env` and rebuild. Log the recovery in the owner audit
trail.
