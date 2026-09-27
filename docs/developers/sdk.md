# Third-Party SDK and API Guide

Last verified: 2026-09-26 @ 10fc35c

Audience: third-party developers integrating against the Framique public REST
API. This is a living narrative guide. The machine-readable contract is
[`openapi/openapi.yaml`](../../openapi/openapi.yaml) (owned by a sibling lane;
this document never duplicates its endpoint tables). Planning-only prose lives
in [`docs/13-export-sdk/`](../13-export-sdk/README.md) and is labeled
prose-only wherever it is the sole source.

## 1. Base URL and versioning

All third-party traffic goes through the versioned adapter
`src/routes/api/public/v1/$.ts:38-57`, which accepts `GET`, `POST`, `PATCH`,
and `DELETE` plus CORS preflight, then dispatches to the gateway. The path
after `/api/public/v1/` is matched against one route table,
`src/lib/api-scopes.ts:261-376`, matched segment by segment in
`src/lib/api-scopes.ts:380-400`. Anything not in that table answers `404
unknown_route` (proven by `src/lib/rest-gateway.test.ts:5-26`).

The current API version constant is `src/lib/rest-gateway.server.ts:29`
(`2026-01-01`). Every successful gateway response carries it in the
`framique-version` header (`src/lib/rest-gateway.server.ts:821-828`), and
`GET me` echoes it as `api_version` in the body
(`src/lib/rest-gateway.server.ts:202-219`).

Versioning rules beyond the above (additive-only changes, new path version
plus migration note for breaking changes) are prose-only: see the
[OpenAPI pipeline design](../superpowers/specs/2026-09-26-developer-guides-openapi-design.md#2-openapi-pipeline).
No code at HEAD enforces a deprecation policy; the `410` removal behavior
described in [`docs/13-export-sdk/api-sdk.md`](../13-export-sdk/api-sdk.md#7-deprecation-policy)
is prose-only and TBD-for-G4.

## 2. Authentication

Send `Authorization: Bearer <token>`
(`src/lib/rest-gateway.server.ts:79-88`). One header serves two credential
families (`src/lib/rest-gateway.server.ts:89-115`):

- Tokens starting with `frmat_` resolve as OAuth access tokens via
  `src/lib/oauth.server.ts:670-692`. Expired or revoked tokens resolve to
  null and the gateway answers `401 invalid_token`.
- Anything else resolves as an API key via
  `src/lib/api-keys.server.ts:136-156`. Unknown or inactive keys answer `401
invalid_token`. Each successful resolution refreshes `last_used_at`.

API keys are created as `sk_{test|live}_{token}`
(`src/lib/api-keys.server.ts:84-86`) and the plaintext is returned exactly
once at creation (`src/lib/api-keys.server.ts:109`); it is stored as a
SHA-256 hash only (`src/lib/api-keys.server.ts:28-34`). Key creation and
revocation require the `owner` or `admin` merchant role
(`src/lib/api-keys.server.ts:42-55`).

Scopes come from one catalog, `src/lib/api-scopes.ts:17-32`, shared by the
consent screen, the key editor, and the gateway authorizer
(`src/lib/api-scopes.ts:1-15`). The effective grant is always the
intersection of requested and allowed scopes
(`src/lib/api-scopes.ts:169-173`); a `.write` scope implies only the `.read`
scope on the same resource (`src/lib/api-scopes.ts:176-189`). A request
lacking the route scope fails with `403 insufficient_scope` plus
`required_scope` and `granted_scopes`
(`src/lib/rest-gateway.server.ts:705-715`).

Tenancy is credential-derived: `merchant_id` is never read from the request
(`src/lib/rest-gateway.server.ts:9-11`). Every handler filters on the
principal merchant, so guessing another tenant id cannot cross rows.

### API key lifecycle (partially prose-only)

Code at HEAD models keys with an `active` boolean plus `revoked_at`
(`src/integrations/supabase/types.ts:710-725`). Revocation sets
`active = false` and stamps `revoked_at`
(`src/lib/api-keys.server.ts:119-123`), writes an `api_key.revoked` audit
row (`src/lib/api-keys.server.ts:125-131`), and the key fails auth on the
next call (`src/lib/api-keys.server.ts:145`). Creation writes an
`api_key.created` audit row (`src/lib/api-keys.server.ts:102-108`).

The lifecycle `active → retired | expired | revoked` with rotation events in
[`docs/13-export-sdk/rest-api.md`](../13-export-sdk/rest-api.md#3-api-key-lifecycle)
is prose-only: there is no `expires_at` column, no `retired` state, and no
rotate function in `src/lib/api-keys.server.ts`. Likewise the `frm_` bearer
prefix in that doc does not appear in code (code uses `sk_{test|live}_` keys
and `frmat_` / `frmrt_` OAuth tokens). All of this is TBD-for-G4.

## 3. OAuth grants (pointer)

Third-party apps use OAuth 2.1 authorization-code with PKCE plus rotating
refresh tokens. The token endpoint accepts form-encoded or JSON bodies and
supports exactly two grants, `authorization_code` and `refresh_token`; anything
else answers `unsupported_grant_type`
(`src/routes/api/public/oauth/token.ts:100-161`). Client secrets may arrive
via `client_secret_basic` or `client_secret_post`
(`src/routes/api/public/oauth/token.ts:79-93`).

Key mechanics, all in `src/lib/oauth.server.ts`:

- Lifetimes: access 1 hour, refresh 30 days, code 5 minutes
  (`src/lib/oauth.server.ts:26-28`).
- PKCE `S256` is mandatory; verifiers must be 43 to 128 characters
  (`src/lib/oauth.server.ts:66-78`), and authorization refuses non-`S256`
  challenges (`src/lib/oauth.server.ts:371-373`).
- Codes are single-use: replaying a consumed code burns every token from
  that grant (`src/lib/oauth.server.ts:518-532`).
- Refresh reuse is treated as theft: presenting a rotated or revoked
  refresh token revokes the whole family
  (`src/lib/oauth.server.ts:587-609`).
- Revocation is idempotent and always answers `200`, even for unknown
  tokens, so the endpoint cannot probe token existence
  (`src/routes/api/public/oauth/revoke.ts:40-66`,
  `src/lib/oauth.server.ts:633-659`).
- Disabling an app cascades: live tokens and consents are revoked
  (`src/lib/oauth.server.ts:266-304`).

Full consent, scope-intersection, and app-registry semantics are prose-only;
see [`docs/13-export-sdk/oauth.md`](../13-export-sdk/oauth.md). Gaps versus
that doc, all TBD-for-G4: the `client_credentials` grant has no branch in
the token route; `POST /oauth/authorize`, `GET /oauth/validate`, and
`POST /api/v1/apps*` have no route code; `oauth_clients`, `oauth_tokens`,
and `oauth_consents` tables are referenced by server code but absent from
the generated `src/integrations/supabase/types.ts`.

## 4. Envelopes, pagination, cursors

List endpoints return `{ data, next_cursor }`; see `GET orders`
(`src/lib/rest-gateway.server.ts:221-258`), `GET products`
(`src/lib/rest-gateway.server.ts:323-344`), `GET customers`
(`src/lib/rest-gateway.server.ts:398-419`), and `GET exports`
(`src/lib/rest-gateway.server.ts:421-443`). `GET me` returns
`{ credential, scopes, merchant, api_version }`
(`src/lib/rest-gateway.server.ts:202-219`). Money is always integer minor
units with a `BDT` currency tag (`src/lib/rest-gateway.server.ts:197-199`).

Cursor rules (`src/lib/api-scopes.ts:217-247`,
`src/lib/rest-gateway.server.ts:170-195`):

- Pass `?limit=` and `?cursor=`; the default page is 25, the maximum is 100,
  and larger values are clamped server-side, never client-authoritative.
- Cursors are opaque base64url `timestamp|id` tokens over keyset pagination
  on `(created_at, id)`, stable under concurrent inserts.
- A missing, expired-shape, or tampered cursor never throws: decoding
  returns null and the query starts from the first page.
- `next_cursor` is null when the returned row count is below the limit.

## 5. Rate limits and idempotency

Rate limiting is per credential, not per merchant, so one noisy integration
cannot starve a merchant other apps
(`src/lib/rest-gateway.server.ts:717-730`). The data plane uses the `api.v1`
bucket at 600 requests per 60 seconds
(`src/lib/rate-limit.server.ts:90`); token endpoints are tighter
(`oauth.token` 60 per 60 seconds, `oauth.authorize` 20 per 300 seconds) and
the merchant admin registry uses `dev.read` / `dev.write`
(`src/lib/rate-limit.server.ts:91-95`). Every gateway verdict emits
`x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset`
headers; an over-limit call answers `429 rate_limited` with a `retry_after`
hint (`src/lib/rest-gateway.server.ts:719-730`). The limiter degrades from
Redis to Postgres and fails open with counters rather than blocking traffic
(`src/lib/rate-limit.server.ts:1-22`).

Idempotency is required on every non-`GET` method, including `DELETE`
(`src/lib/api-scopes.ts:402-405`). Behavior in
`src/lib/rest-gateway.server.ts:751-790`:

- Missing `Idempotency-Key` header answers `400 idempotency_key_required`.
- Keys are scoped per merchant, key, and route and stored with a hash of
  route plus body (`src/lib/rest-gateway.server.ts:803-812`).
- Reusing a key with a different body answers `409 idempotency_conflict`.
- Replaying a key with the same body returns the stored status and body
  with an `idempotent-replay: true` header, so a retrying client cannot
  double-create.

The shared `rate_limit_buckets` table and any production bucket counts in
[`docs/13-export-sdk/rest-api.md`](../13-export-sdk/rest-api.md#4-transport--limits)
are prose-only (code uses the named `BUCKETS` map in
`src/lib/rate-limit.server.ts:62-373`). Exact production numbers are
TBD-for-G4.

## 6. Error model

Errors use RFC 9457-style problem responses with content type
`application/problem+json` and fields `type`, `title`, `status`, plus an
optional `detail` (`src/lib/rest-gateway.server.ts:51-73`). The docs URL
template is `https://docs.framique.app/errors/{code}`, asserted in
`src/lib/rest-gateway.test.ts:5-26`. Missing or malformed credentials answer
`401 unauthorized` (`src/lib/rest-gateway.test.ts:28-63`).

Codes implemented at HEAD (all in `src/lib/rest-gateway.server.ts` unless
noted): `unauthorized`, `invalid_token`, `insufficient_scope`,
`rate_limited`, `idempotency_key_required`, `idempotency_conflict`,
`unknown_route`, `invalid_json`, `not_found`, `validation_failed`,
`write_failed`, `query_failed`, `internal_error`, plus OAuth codes
`invalid_client`, `invalid_grant`, `unsupported_grant_type`
(`src/routes/api/public/oauth/token.ts:100-161`), `scope_mismatch`,
`scope_required`, and `pkce_required` (`src/lib/oauth.server.ts`).

Prose-only error claims, all TBD-for-G4: the `error_code` plus
`request_id` envelope and Bangla/English localized messages in
[`docs/13-export-sdk/rest-api.md`](../13-export-sdk/rest-api.md#5-error-contract)
have no gateway implementation (problem responses carry no `request_id`
field); `key_revoked | key_expired`, `rate_limit_exceeded`,
`idempotency_replay`, and `export_not_ready` do not appear as code literals.

## 7. Webhooks: delivery and dead letters (pointer)

Endpoints must be `https` and cannot target localhost or private hosts
(`src/lib/webhook-signing.ts:157-182`). Subscribable events are a closed
catalog (`src/lib/webhook-signing.ts:17-29`): `order.created`,
`order.paid`, `order.fulfilled`, `order.cancelled`, `product.created`,
`product.updated`, `export.completed`, `export.failed`, `api.key.rotated`,
`oauth.token.revoked`. Unknown names are rejected at write time
(`src/lib/rest-gateway.server.ts:497-543`).

Delivery facts:

- The signing secret is shown exactly once at creation
  (`src/lib/rest-gateway.server.ts:541-542`) and sealed server-side; the
  admin-surface equivalent is `src/lib/webhooks.server.ts:123-172`.
- Signatures send as `Framique-Signature: t=<unix seconds>,v1=<hex>` where
  the digest is `HMAC_SHA256(secret, "<timestamp>.<body>")`
  (`src/lib/webhook-signing.ts:14-16`, `src/lib/webhook-signing.ts:70-72`).
  Receivers must reject timestamps outside the 300-second tolerance
  (`src/lib/webhook-signing.ts:15`, `src/lib/webhook-signing.ts:96-113`).
- Retries back off from 30 seconds to 24 hours with a ceiling of 6
  attempts (`src/lib/webhook-signing.ts:119-126`). A 2xx response delivers;
  `410 Gone` ends delivery immediately; anything else retries to the
  ceiling and then dead-letters (`src/lib/webhook-signing.ts:133-155`).
- Delivery rows move through `pending`, `failed`, `delivered`, and `dead`
  statuses (`src/lib/webhooks.server.ts:403-416`,
  `src/lib/webhooks.server.ts:451-479`). An endpoint disabled mid-flight
  parks its rows as `dead` instead of retrying them
  (`src/lib/webhooks.server.ts:472-479`).
- The cron worker claims due rows in bounded batches of 25 by default
  (`src/lib/webhooks.server.ts:448-493`) via
  `src/routes/api/public/cron/webhooks.ts:4-14`.
- A dead or failed delivery can be re-queued as a fresh attempt without
  losing history (`src/lib/webhooks.server.ts:234-261`), and rotating a
  secret keeps the previous secret verifying for a 24-hour grace window
  (`src/lib/webhooks.server.ts:38`, `src/lib/webhooks.server.ts:174-207`).
- A receiver failing 20 times in a row auto-pauses its endpoint
  (`src/lib/webhooks.server.ts:429-435`); re-enabling clears the strike
  counter (`src/lib/webhooks.server.ts:209-232`).

Dead-letter semantics and the `webhook.created`, `webhook.delivered`, and
`webhook.dead-lettered` event names in
[`docs/13-export-sdk/README.md`](../13-export-sdk/README.md#5-events) are
prose-only pointers: code statuses are `pending` / `failed` / `delivered` /
`dead`, and the outbound fan-out (`src/lib/webhooks.server.ts:303-351`) has
no callers at HEAD, so no code path emits those events yet. The 15-minute
retry figure in the README does not match the coded 30-second to 24-hour
ladder. All TBD-for-G4. There is also no public REST route for replay at
HEAD (only `GET` / `POST` / `DELETE` webhook patterns in
`src/lib/api-scopes.ts:328-345`); replay is admin-surface only.

## 8. Exports (pointer)

`POST exports` accepts `object_type` of `orders`, `products`, or
`customers` and defaults `format` to `csv`
(`src/lib/rest-gateway.server.ts:445-470`). Job detail including
`signed_url` comes from `GET exports/:id`
(`src/lib/rest-gateway.server.ts:472-483`). Job statuses are `queued`,
`generating`, `signing`, `ready_for_download`, `downloaded`, `expired`, and
`fail_retry` (`src/integrations/supabase/types.ts:10246-10253`). Signed URLs
live 1 hour and files expire after 24 hours
(`src/lib/exports.server.ts:23-24`); expired downloads flip to `expired`
and must be re-run (`src/lib/exports.server.ts:345-384`). The full job
lifecycle, schema versioning, and checksum rules are prose-only in
[`docs/13-export-sdk/export-job.md`](../13-export-sdk/export-job.md) and its
parent [`docs/13-export-sdk/README.md`](../13-export-sdk/README.md).

## 9. Implemented route inventory (pointer, not a table)

Per lane scope this guide does not duplicate endpoint tables. The complete
implemented surface is the route table in `src/lib/api-scopes.ts:261-376`
(`me`, orders, products, customers, exports, webhooks, themes,
marketplace/themes) served through
`src/routes/api/public/v1/$.ts:38-57`, plus standalone public routes such
as the browser error collector (`src/routes/api/public/errors.ts:36-88`)
and the OAuth pair (`src/routes/api/public/oauth/token.ts`,
`src/routes/api/public/oauth/revoke.ts`). The only route file under
`src/routes/api/admin` at HEAD is `merchant.$id/risk-tier.ts` (with its
test); its contract is TBD-for-G4. The normative per-endpoint reference is
[`openapi/openapi.yaml`](../../openapi/openapi.yaml).

## 10. Explicit gaps (TBD-for-G4, do not implement from this guide)

1. API-key `retired` / `expired` states, rotation endpoint, and grace
   window values (prose-only §2 above).
2. `frm_` bearer prefix claim (prose-only §2 above).
3. OAuth `client_credentials` grant, `/oauth/authorize`, `/oauth/validate`,
   and `/api/v1/apps*` endpoints (prose-only §3 above).
4. Node/Go SDK packages, codegen pipeline, and retry constants from
   [`docs/13-export-sdk/api-sdk.md`](../13-export-sdk/api-sdk.md): no SDK
   source was found under `src/`; all SDK behavior claims are prose-only.
5. `request_id` error field, localized error messages, and the
   `rate_limit_exceeded` / `idempotency_replay` / `export_not_ready` /
   `key_revoked` / `key_expired` codes (prose-only §6 above).
6. Webhook event emission wiring, `webhook.*` event names, 15-minute
   backoff figure, and public replay endpoints (prose-only §7 above).
7. Production rate-limit numbers and the `rate_limit_buckets` table claim
   (prose-only §5 above).
8. Developer-platform tables (`api_webhook_endpoints`,
   `api_webhook_deliveries`, `oauth_*`, `api_idempotency_keys`,
   `export_jobs`) are referenced by server code but missing from the
   generated `src/integrations/supabase/types.ts`; schema drift is for G4
   to rule on.
9. `PATCH /api/v1/webhooks/:id`, `POST /api/v1/api-keys*` key management,
   and export `total_rows_estimate` from
   [`docs/13-export-sdk/rest-api.md`](../13-export-sdk/rest-api.md#6-endpoint-catalog-annotated-readme-consistent):
   no matching code at HEAD.
