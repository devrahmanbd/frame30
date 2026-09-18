# Framique Deploy Notes (DEPLOY.md)

> Living runbook for release help. Architecture source of truth: `SYSTEM.md` §10 (Blue/Green + canary + expand-and-contract + Time-Machine backups).

## Release train (every deploy)

1. `bun run typecheck && bun run test && bun run test:contracts && bun run schema:check`
2. Build immutable image tagged `framique:sha-<GIT_SHA>`; deploy to GREEN.
3. Pre-promotion probes: `/api/healthz` readiness, headless smoke (cart, checkout, auth), Redis warm, DB compatibility, pre-canary snapshot `snap_pre_deploy_<SHA>`.
4. Canary 1% (10m) → 5% (15m) → 25% (30m) → 100%. Roll back to BLUE on 5xx > 0.5% or p99 > 800ms.

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

Without the hook vars, custom domains park in `issuing_cert` (fail closed) —
that is expected until edge automation lands; merchants still serve on the
platform path. Never point merchants at `edge.framique.*` or `76.76.21.21`
(Vercel) — those were placeholder values that shipped wrong instructions.

## Pending deploy-sensitive items (do NOT ship without these steps)

- **WF-02 `removed` enum**: needs a real migration (`ALTER TYPE market_install_status ADD VALUE 'removed'`) via expand-and-contract (SYSTEM.md §10.3) — new enum value is backward-compatible (additive), old code ignores it. Deploy migration Release 1 before the code that writes it.
- **Wildcard `*.framique.store` (TODO §2.1)**: needs DNS wildcard + ACME coverage + edge Host→tenant rewrite landing together; canary by tenant cohort, not by percent.
- **Presigned uploads (§2.3)**: needs Supabase Storage bucket + CORS + signer secret rotation plan before code cutover.
