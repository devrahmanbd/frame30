---
title: "How do I authenticate against the public REST API?"
locale: en
audience: developer
tags: [api, sdk, auth, scopes, rest]
source: /docs/developers/sdk
version: public-corpus-v1
status: published
---

**Q: How do I call the Framique public REST API as a third-party developer?**

All third-party traffic goes through the versioned adapter `src/routes/api/public/v1/$.ts:38-57`, dispatching to one route table (`src/lib/api-scopes.ts:261-376`). Anything not in that table answers `404 unknown_route`. The machine-readable contract is `openapi/openapi.yaml` — this guide never duplicates its endpoint tables.

**Answer**

- Send `Authorization: Bearer <TOKEN>` (`src/lib/rest-gateway.server.ts:79-88`). Tokens starting with the OAuth prefix resolve as OAuth access tokens; anything else resolves as an API key. Unknown, expired, or revoked credentials answer `401 invalid_token`.
- API keys are shown exactly once at creation and stored as a SHA-256 hash only (`src/lib/api-keys.server.ts:28-34`); creation and revocation require the `owner` or `admin` merchant role (`src/lib/api-keys.server.ts:42-55`).
- Scopes come from one catalog (`src/lib/api-scopes.ts:17-32`); the effective grant is always the intersection of requested and allowed scopes, and a `.write` scope implies only the `.read` scope on the same resource. A request lacking the route scope fails with `403 insufficient_scope` plus `required_scope` and `granted_scopes`.
- Tenancy is credential-derived: `merchant_id` is never read from the request, so guessing another tenant id cannot cross rows.
- Every successful response carries the API version in the `framique-version` header, and `GET me` echoes it as `api_version` in the body.

**Conditions**

- Versioning beyond the above (additive-only changes; new path version plus migration note for breaking changes) is prose-only planning, not enforced at HEAD — do not build clients that assume a deprecation policy or a `410` removal behavior.
- The lifecycle `active → retired | expired | revoked` described in planning docs is partially prose-only; what code guarantees is that revocation sets `active = false`, stamps `revoked_at`, writes an `api_key.revoked` audit row, and the key fails auth on the next call.
- Never put real secrets in examples or docs — use placeholders such as `<TOKEN>` (see the documentation standards article).
