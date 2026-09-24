# Framique Deploy Notes (DEPLOY.md)

> Living runbook for release help. Architecture source of truth: `SYSTEM.md` §10 (Blue/Green + canary + expand-and-contract + Time-Machine backups).

## Release train (every deploy) — Never-Failing Blue/Green Pipeline

1. **Pre-flight Gate**: `bun run typecheck && bun run test && bun run test:contracts && bun run schema:check && bun run secrets:scan`
2. **Build Immutable Artifact**: Build container image tagged `framique:sha-<GIT_SHA>`; deploy to GREEN candidate slot (port 3002).
3. **Pre-Promotion Probes (Zero-Failure Gate)**:
   - Automated health probe: `curl -f http://127.0.0.1:3002/api/healthz?type=readiness`
   - Headless smoke probe: cart, checkout, auth, and storefront query assertions.
   - DB Compatibility: Verify that active database schema matches both Version N (BLUE) and Version N+1 (GREEN).
   - Redis Warmup: `bun run scripts/cutover-blue-green.ts --slot=green` (runs `warmupAll` and pre-flight).
   - **Mandatory Verified Snapshot**:
     ```bash
     ./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) take
     ./ops/backup/time-machine-snapshot.sh snap_pre_deploy_$(git rev-parse --short HEAD) verify
     ```
4. **Progressive Canary Shifting**:
   - 1% Canary (10m soak; internal & dogfood stores)
   - 5% Canary (15m soak; checkout completion & courier latency telemetry)
   - 25% Canary (30m soak; DB pool stability & Redis overhead)
   - 100% Promotion (Global cutover to GREEN).
5. **Instant Rollback Gate (< 500ms)**:
   - If 5xx error rate > 0.5% or p99 latency > 800ms, Prometheus alert / circuit breaker trips:
     ```bash
     bun run scripts/cutover-blue-green.ts --rollback
     ```
   - Retain BLUE on warm standby for 60-120 minutes with zero cold-start delay.

## Bare-Metal Time-Machine Restore Runbook (Server Lost / Stolen / Destroyed)

If the production server is physically lost, stolen, or destroyed, execute this 100%-verified disaster recovery procedure on any clean Linux machine:

### 1. Provision Clean Machine

Install Docker and Zstandard:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin zstd rclone openssl
```

### 2. Retrieve Encrypted Whole-System Snapshot

Fetch the certified snapshot from the off-site immutable WORM object storage:

```bash
mkdir -p /var/backups/framique
rclone copy s3:framique-backups/latest /var/backups/framique/latest --checksum
```

### 3. Decrypt Snapshot (Theft-Immune Master Key)

If encrypted with the off-site KMS master key:

```bash
openssl enc -d -aes-256-gcm -pbkdf2 \
  -in /var/backups/framique/latest/snapshot.enc \
  -out /var/backups/framique/latest/snapshot.tar.zst \
  -pass env:ENCRYPTION_PASSPHRASE

tar -I zstd -xf /var/backups/framique/latest/snapshot.tar.zst -C /var/backups/framique/latest/
```

### 4. 1-Click System Reconstitution

Restore database cluster (`auth`, `storage`, `public`, `roles`), storage bucket objects, and configs:

```bash
./ops/backup/restore.sh /var/backups/framique/latest --force
```

### 5. Optional Point-in-Time Recovery (PITR) to Target Second

```bash
./ops/backup/time-machine-snapshot.sh latest restore-pitr '2026-09-18 14:00:00 UTC'
```

### 6. Bring Up Application Topology

```bash
docker compose -f ops/docker-compose.blue-green.yml up -d
```

### 7. Repoint DNS

Point DNS A/AAAA records for `framique.qubickle.com` and custom domain CNAMEs to the new server IP. The system is 100% reconstituted.

## Deploy 7e16d41+ — security fixes WF-10 + WF-09 (no migration)

- **What ships**: `isLocalHostname` exact-match (server CSRF/HTTPS gate), `isPersonalizedStorefrontPath` + `private, no-store` on cart/checkout/account/order/track (both `/store/:slug/*` and custom-domain shapes). App code only — no DB migration, no new env vars, no edge-config change.
- **Mandatory edge purge at cutover**: previously-cached personalized pages can sit on the CDN for up to `s-maxage 60s + SWR 300s`. Purge before shifting traffic:
  - `/store/*/cart*`, `/store/*/checkout*`, `/store/*/account*`, `/store/*/order*`, `/store/*/track*`
  - custom-domain `/cart*`, `/checkout*`, `/account*`, `/order*`, `/track*`
  - Without this, stale shopper PII serves for ~6 minutes post-deploy.
- **Post-deploy verification** (from outside the cluster):
  ```bash
  curl -sI https://<store>/store/<slug>/cart | grep -i cache-control
  # expect: private, no-store
  curl -sI https://<store>/store/<slug>/p/<product> | grep -i cache-control
  # expect: public, max-age=0, s-maxage=60, stale-while-revalidate=300
  curl -sI -H "Host: localhost.evil.com" https://edge-fqdn/store/x/cart | grep -i "403\|301"
  # expect: no local bypass (HTTPS redirect or CSRF behavior, never plaintext pass)
  ```
- **Rollback**: safe — both changes are header/classification-only with no schema or state dependency. Reverting restores old caching/HTTPS behavior; re-purge personalized paths after rollback too.

## Edge DNS environment (onboarding DNS fix, Sept 18 2026)

Live deployment: `framique.qubickle.com` on `88.99.250.99`. These defaults are
baked in as `LIVE_EDGE_CNAME` / `LIVE_EDGE_IPS` (`src/lib/domains.ts`) so
onboarding + Settings › Domains can never disagree with the edge again.
Override per environment with:

```bash
DOMAIN_EDGE_CNAME=framique.qubickle.com
DOMAIN_EDGE_IPS=88.99.250.99
DOMAIN_EDGE_HOOK_URL=<edge provisioning hook, if any>
DOMAIN_EDGE_TOKEN=<hook bearer token>
```

Leave `DOMAIN_EDGE_HOOK_URL` **unset** unless a push-hook receiver exists:
no receiver ships in this repo — the edge (OpenResty + lua-resty-acme
autossl) issues pull-based on first SNI hit via the `verify-sni` whitelist,
so there is nothing to point the hook at. Pointing it at a dummy URL would
POST cert orders into the void (`edge_unreachable`). Without the hook,
verified domains stay `dns_verified` with `cert.awaiting_edge` (fail closed)
— that is expected until edge automation lands; merchants still serve on the
platform path. `DOMAIN_EDGE_TOKEN` is still required: it authenticates the
edge's `verify-sni` checks and signs `/api/public/domains/callback` HMACs.

Without the hook vars, custom domains park in `issuing_cert` (fail closed) —
that is expected until edge automation lands; merchants still serve on the
platform path. Never point merchants at `edge.framique.*` or `76.76.21.21`
(Vercel) — those were placeholder values that shipped wrong instructions.

## Pending deploy-sensitive items (do NOT ship without these steps)

- **WF-02 `removed` enum**: needs a real migration (`ALTER TYPE market_install_status ADD VALUE 'removed'`) via expand-and-contract (SYSTEM.md §10.3) — new enum value is backward-compatible (additive), old code ignores it. Deploy migration Release 1 before the code that writes it.
- **Wildcard `*.framique.store` (TODO §2.1)**: needs DNS wildcard + ACME coverage + edge Host→tenant rewrite landing together; canary by tenant cohort, not by percent.
- **Presigned uploads (§2.3)**: needs Supabase Storage bucket + CORS + signer secret rotation plan before code cutover.
