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

Edge hook v1 (built 2026-09-24, proven live on flamelancer.com): no
external push receiver is needed. The `:80` challenge path already serves
`/.well-known/acme-challenge/` (certbot webroot + autossl fallback), and
the app orders directly:
`verifyDomain` → `requestCertificate` → `provisionAndApply`
(`src/lib/edge-provision.server.ts`: fixed-shape argv, per-host
single-flight + 10-min cooldown, keys never leave the server) →
`/usr/local/bin/framique-cert-issue.sh` (`ops/edge/`: hostname
re-validation, certbot webroot, PEM assembly 0600, haproxy reload) →
`applyCertResult` → `active`. Traffic for unverified hosts triggers one
coalesced verify chain (`triggerEdgeVerify`); polling and the manual
button remain as fallback. Enable with `EDGE_LOCAL_PROVISION=1`
(+ `ACME_STAGING=true` for safe path proofs). `DOMAIN_EDGE_HOOK_URL`
stays unset (nothing to point it at); `DOMAIN_EDGE_TOKEN` still
authenticates verify-sni/callbacks.

Without the hook vars, custom domains park in `issuing_cert` (fail closed) —
that is expected until edge automation lands; merchants still serve on the
platform path. Never point merchants at `edge.framique.*` or `76.76.21.21`
(Vercel) — those were placeholder values that shipped wrong instructions.

## Live verification contract (deploy gate, Sept 25 2026)

`ops/deploy-from-git.sh` verifies, never assumes:

- **Primary host is merchant data.** Resolved live from `merchant_domains`
  (`status='active'`, `is_primary`); never hardcoded. No active primary →
  custom-host checks SKIP (merchant mid-rename), everything else still gates.
- **Custom-host checks retry.** Edge SNI mapping flaps under load
  (wrong-cert curl 60s from loopback). The gate retries 3×/10s with raw
  curl (outside `check()` so `set -e` can't kill the script), then fails
  honestly. A retry storm in the log means edge, not app — verify with
  `curl -v` (cert subject) before touching code.
- **Unmapped custom hosts must 404 bare.** No CMS site, no featured-store
  fallback, no body (`server.ts` gate; `microscrop.shop/` pins it since the
  flamelancer.com rename). If this check starts serving 200, a mapping
  changed — check `merchant_domains` first, code second.
- **Restart precedes verify.** rsync + `systemctl restart` happen before
  checks, so a red gate means "new code live, proof incomplete" — read
  which line failed before deciding rollback vs edge wait.

## Pending deploy-sensitive items (do NOT ship without these steps)

- **WF-02 `removed` enum**: needs a real migration (`ALTER TYPE market_install_status ADD VALUE 'removed'`) via expand-and-contract (SYSTEM.md §10.3) — new enum value is backward-compatible (additive), old code ignores it. Deploy migration Release 1 before the code that writes it.
- **Wildcard `*.framique.store` (TODO §2.1)**: needs DNS wildcard + ACME coverage + edge Host→tenant rewrite landing together; canary by tenant cohort, not by percent.
- **Presigned uploads (§2.3)**: needs Supabase Storage bucket + CORS + signer secret rotation plan before code cutover.
