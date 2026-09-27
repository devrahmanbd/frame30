# API OpenAPI Audit — is our API following OpenAPI?

**Verdict: No.** There is no machine-readable API contract anywhere in the
repo, and nothing enforces one.

## Evidence

1. **Zero spec files.** A repo-wide search for `*openapi*` / `*swagger*`
   returns no spec document — only prose and skill references:
   `docs/superpowers/specs/2026-09-26-developer-guides-openapi-design.md`
   (a design proposal, not a contract), `docs/13-export-sdk/rest-api.md`,
   `docs/13-export-sdk/api-sdk.md`, plus vendored skill docs under
   `.agents/.skills/ruflo/`. No `openapi.yaml`, `openapi.json`, or Swagger
   file exists under `src/`, `docs/`, or the repo root.
2. **Prose-only docs.** The v1 surface is described in planning prose
   (`docs/13-export-sdk/rest-api.md`: "Status: Planning · Slice S7+ · Gate:
   not yet approved"). Prose cannot be validated, diffed in CI, or used for
   codegen — it already drifts (see §4, PATCH and cron-404 notes).
3. **No validators / contract tests.** No request/response schema validation
   middleware, no `openapi`-based test, and `scripts/contract-gate.mjs`
   covers non-HTTP contracts. Nothing fails a build when a handler and its
   documentation disagree. (This lane adds the first such gate:
   `openapi/openapi.spec.test.ts`, filesystem-vs-spec coverage.)

## Endpoint inventory (42 files, verified by reading every handler)

| #   | File                                                   | Method(s)         | Reachable path(s)                                    | Auth                       |
| --- | ------------------------------------------------------ | ----------------- | ---------------------------------------------------- | -------------------------- |
| 1   | `src/routes/api/admin/merchant.$id/risk-tier.ts`       | GET, POST (srvfn) | _none (RPC transport)_ — `x-undocumented`            | admin (unverified here)    |
| 2   | `src/routes/api/public/oauth/token.ts`                 | OPTIONS, POST     | `/api/public/oauth/token`                            | open (client creds)        |
| 3   | `src/routes/api/public/oauth/revoke.ts`                | OPTIONS, POST     | `/api/public/oauth/revoke`                           | open                       |
| 4   | `src/routes/api/public/v1/$.ts`                        | OPTIONS–DELETE    | `/api/public/v1/*` → 19 gateway ops (below)          | API key / OAuth + scope    |
| 5   | `src/routes/api/public/cron/ad-fraud.ts`               | GET→405, POST     | `/api/public/cron/ad-fraud`                          | cron bearer                |
| 6   | `src/routes/api/public/cron/analytics.ts`              | GET→405, POST     | `/api/public/cron/analytics`                         | cron bearer                |
| 7   | `src/routes/api/public/cron/billing.ts`                | GET→405, POST     | `/api/public/cron/billing`                           | cron bearer                |
| 8   | `src/routes/api/public/cron/content-health.ts`         | GET→405, POST     | `/api/public/cron/content-health` (`?external=0`)    | cron bearer                |
| 9   | `src/routes/api/public/cron/couriers.ts`               | GET→405, POST     | `/api/public/cron/couriers`                          | cron bearer                |
| 10  | `src/routes/api/public/cron/domains.ts`                | GET→405, POST     | `/api/public/cron/domains`                           | cron bearer                |
| 11  | `src/routes/api/public/cron/growth.ts`                 | GET→405, POST     | `/api/public/cron/growth`                            | cron bearer                |
| 12  | `src/routes/api/public/cron/jobs.ts`                   | GET→405, POST     | `/api/public/cron/jobs`                              | cron bearer                |
| 13  | `src/routes/api/public/cron/notifications.ts`          | GET→405, POST     | `/api/public/cron/notifications`                     | cron bearer                |
| 14  | `src/routes/api/public/cron/ops.ts`                    | GET→405, POST     | `/api/public/cron/ops` (`?drill=1`)                  | cron bearer                |
| 15  | `src/routes/api/public/cron/payouts.ts`                | GET→405, POST     | `/api/public/cron/payouts`                           | cron bearer                |
| 16  | `src/routes/api/public/cron/purge.ts`                  | GET→405, POST     | `/api/public/cron/purge`                             | cron bearer                |
| 17  | `src/routes/api/public/cron/search-console.ts`         | GET→405, POST     | `/api/public/cron/search-console` (`?days=`)         | cron bearer                |
| 18  | `src/routes/api/public/cron/support.ts`                | GET→405, POST     | `/api/public/cron/support`                           | cron bearer                |
| 19  | `src/routes/api/public/cron/themes.ts`                 | GET→405, POST     | `/api/public/cron/themes`                            | cron bearer                |
| 20  | `src/routes/api/public/cron/webhooks.ts`               | GET→405, POST     | `/api/public/cron/webhooks`                          | cron bearer                |
| 21  | `src/routes/api/public/ads/click.ts`                   | GET→405, POST     | `/api/public/ads/click`                              | open (+HMAC when set)      |
| 22  | `src/routes/api/public/analytics/beacon.ts`            | GET→405, POST     | `/api/public/analytics/beacon`                       | open                       |
| 23  | `src/routes/api/public/vitals.ts`                      | GET→405, POST     | `/api/public/vitals`                                 | open                       |
| 24  | `src/routes/api/public/errors.ts`                      | GET→405, POST     | `/api/public/errors`                                 | open                       |
| 25  | `src/routes/api/public/error-alert.ts`                 | POST              | `/api/public/error-alert`                            | shared secret              |
| 26  | `src/routes/api/public/channels/$channel.ts`           | GET, POST         | `/api/public/channels/{whatsapp\|messenger}`         | open (+HMAC intake)        |
| 27  | `src/routes/api/public/couriers/$carrier.ts`           | GET→405, POST     | `/api/public/couriers/{carrier}`                     | HMAC (carrier secret)      |
| 28  | `src/routes/api/public/domains/callback.ts`            | POST              | `/api/public/domains/callback`                       | HMAC (`DOMAIN_EDGE_TOKEN`) |
| 29  | `src/routes/api/public/domains/verify-sni.ts`          | GET               | `/api/public/domains/verify-sni?host=`               | open (IP rate limited)     |
| 30  | `src/routes/api/public/newsletter/feedback.ts`         | POST              | `/api/public/newsletter/feedback`                    | HMAC + timestamp           |
| 31  | `src/routes/api/public/media/$.ts`                     | GET               | `/api/public/media/{splat}`                          | open (path-shaped)         |
| 32  | `src/routes/api/public/font/$.ts`                      | GET               | `/api/public/font/{splat}`                           | open (path-shaped)         |
| 33  | `src/routes/api/public/img/$.ts`                       | GET               | `/api/public/img/{sig}/{spec}/{source}`              | URL signature              |
| 34  | `src/routes/api/public/ph.$.ts`                        | GET               | `/api/public/ph/{splat}`                             | open (pure compute)        |
| 35  | `src/routes/api/public/metrics.ts`                     | GET               | `/api/public/metrics`                                | bearer (`METRICS_TOKEN`)   |
| 36  | `src/routes/api/public/payments/$provider.ts`          | POST              | `/api/public/payments/{provider}` — `x-undocumented` | HMAC (gateway layer)       |
| 37  | `src/routes/api/public/payments/return.ts`             | GET               | `/api/public/payments/return` (303)                  | HMAC in query              |
| 38  | `src/routes/api/public/payments/live/$provider.ts`     | GET, POST         | `/api/public/payments/live/{provider}`               | open (re-validated)        |
| 39  | `src/routes/api/public/payments/mock/$provider.ts`     | GET, POST         | `/api/public/payments/mock/{provider}`               | open (sandbox)             |
| 40  | `src/routes/api/public/payments/platform/$provider.ts` | GET, POST         | `/api/public/payments/platform/{provider}`           | open (signed return)       |
| 41  | `src/routes/api/public/payments/platform/return.ts`    | GET, POST         | `/api/public/payments/platform/return`               | HMAC in query              |
| 42  | `src/routes/api/admin/merchant.$id/risk-tier.test.ts`  | — (test)          | _covers file #1_                                     | —                          |

Note: the brief said "17 cron/\*"; the tree contains **16** cron files —
the count above is from `src/routes/api` itself, not the brief.

### v1 gateway sub-routes (all via file #4, `API_ROUTES` in `src/lib/api-scopes.ts`)

`GET me` · `GET orders` · `GET orders/:id` · `POST orders/:id/notes` ·
`GET products` · `GET products/:id` · `POST products` · `GET customers` ·
`GET exports` · `POST exports` · `GET exports/:id` · `GET webhooks` ·
`POST webhooks` · `DELETE webhooks/:id` · `GET themes` · `GET themes/:id` ·
`GET themes/:id/assets` · `POST themes/:id/activate` ·
`GET marketplace/themes` — 19 operations, each with a scope in
`src/lib/api-scopes.ts`.

## Per-group gap notes

- **Admin (file #1).** Not an HTTP route at all: it exports TanStack Start
  server functions (`createServerFn`), so the REST path, auth, and status
  codes are framework-generated RPC, not a documented contract. Any OpenAPI
  entry for it is aspirational until it becomes a real file route.
- **Cron (files #5–#20).** Auth scheme is the strongest in the tree
  (`BILLING_CRON_SECRET` constant-time bearer or registered scheduler
  token, `src/lib/cron-auth.server.ts`) but appears in **no** doc: no
  header name, no 401/409/429/503/504 semantics, and the wrapper comment
  claims an unconfigured deploy returns 404 while the code path returns
  401 — the kind of drift only a spec + test catches.
- **Public telemetry / webhooks / edge / payments (files #21–#41).**
  - _Auth scheme:_ eight different mechanisms (open, HMAC-in-header,
    HMAC-in-query, URL signature, shared secret, bearer, timestamp window,
    path-shaped allowlist) with per-route header names
    (`x-framique-signature`, `x-courier-signature`,
    `x-hub-signature-256`, `x-error-alert-secret`,
    `framique-edge-signature`, `x-webhook-signature`,
    `x-framique-timestamp`). None is catalogued; a new integrator must read
    every handler.
  - _Envelope consistency:_ at least five shapes coexist — `{ ok }`,
    `{ accepted, reason }`, `{ outcome }`, `{ allowed, ... }`, `{ status,
reason }`, plus empty-body 202/204s, `text/plain` challenges, HTML
    sandbox pages, raw bytes, and RFC 9457 `problem+json` (v1 only).
  - _Versioning:_ only the v1 gateway is versioned (`API_VERSION =
"2026-01-01"`, `Framique-Version` response header). Everything else is
    unversioned; the CORS layer even advertises `PATCH` on
    `/api/public/v1/*` while `API_ROUTES` defines **zero** PATCH routes —
    dead surface in the contract.

## Remediation actually performed (ranked)

1. **Wrote `openapi/openapi.yaml` (OpenAPI 3.1)** covering every reachable
   endpoint: real methods/paths/auth/params/status codes read from the
   handlers, 19 v1 gateway operations expanded from `API_ROUTES` with
   scopes, shared `securitySchemes` for all eight auth mechanisms, and
   `x-undocumented: true` on the two endpoints that cannot be specified
   honestly (admin risk-tier RPC transport; `payments/{provider}` dynamic
   `outcome.http` status). Parses as valid YAML (proven by suite (a), plus
   an independent PyYAML check).
2. **Added `openapi/openapi.spec.test.ts` (vitest anti-drift gate):**
   spec-parses checks, a filesystem-vs-spec coverage test (every
   `src/routes/api` file must own ≥1 path via `x-source-file`, and no
   marker may go stale), and 8 spot-checks pinning methods, cron bearer
   auth, channel/provider enums, and key status codes. Green.
3. **Flagged, did not fix:** widening `vitest.config.ts` `include` to
   `openapi/**` (config is outside this lane; until then run
   `npx vitest run --config /tmp/opencode/vitest.openapi.config.ts`);
   converting the admin server functions to real file routes; removing the
   dead `PATCH` from v1 CORS; unifying the five response envelopes; adding
   response-schema validation middleware so the spec is enforced, not just
   published.
