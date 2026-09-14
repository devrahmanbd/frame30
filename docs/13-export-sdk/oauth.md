# OAuth for Merchant Apps & SDK (13-export-sdk)

Status: Planning · Slice S7+ · Gate: not yet approved (paper review TBD)

Owners: Platform (token service) · Merchant-admin (consent UI surface) · 12-marketplace (app distribution & rotation guidance)

References: `13-export-sdk/README.md` §2–§8 (surface contract, RLS §3), §5 events · `docs/02-merchant/staff-rbac.md` (roles, grants, owner/viewer fixed) · `docs/02-merchant/staff-approval.md` (four-eyes gates) · `docs/06-payments/webhook-gateway.md` (shared HMAC + DLQ semantics) · `docs/12-marketplace/README.md` (app lifecycle) · `docs/00-meta/design-system.md` §7 §8 §9 §10 · `docs/15-e2e/README.md` + `docs/15-e2e/admin_loop.md` (test gate). Design baseline: `docs/00-meta/design-system.md`.

Depth spec for `13-export-sdk/oauth.md` (auth line of the README §2 Admin API + §5 events). Grouped with the README's §4 canonical machines; token lifecycle is canonized in this file (no parallel copies).

---

## 1. Purpose

Merchant and app identity for the API + SDK: consent, issuance,
rotation, and revocation of OAuth tokens used by admin UI, the REST API
(`rest-api.md`), marketplace apps (`12-marketplace`) and the SDKs
(`api-sdk.md`). Every valid token resolves into a **named staff member
and a role** (staff-rbac), never an anonymous bearer; every grant
resolves to `merchant_id`. Nothing a client says about itself is trusted —
all authorization decisions live server-side (consent model in §4).

## 2. Design decisions (approved)

1. **OAuth 2.1**: authorization-code + PKCE for browser/interactive flows
   (admin, apps run in the merchant-admin panel); client-credentials for
   trusted server apps created with an explicit scope allowlist.
2. **Role-inherited scopes**: a token's effective scopes =
   intersection(role grants from staff-rbac, requested oauth scopes).
   No “admin bypass” scope exists — `owner`/`viewer` stay fixed and
   immutable (staff-rbac), custom roles stay bundle-of-grants.
3. **Consent is per-app, per-recorded field-set** (marketing), GDPR-grade,
   and reversible: revoking consent immediately invalidates tokens (audit
   trail full, PII-minimal).
4. **The app might have callback URL hosts** whitelisted at creation; client
   secrets are never stored, never logged, never returned after rotation; a
   masked value with a reset (mirrors the webhook HMAC reveal UX with
   optional consent-replay).
5. **Short TTLs everywhere**; refresh tokens rotate on every use (see canonical
   machine below); reuse/leak detection is in §10.

## 3. Canonical state machine (this file owns it)

```
authorization_code:  issued → consumed → expired | revoked   (single-use)
token pair:          active → expired | rotated | revoked     (refresh rotates)
```

- `consumed` = code exchanged once ever (PKCE proof required);
- `rotated` = refresh token consumed, its successor issued; old one marked
  `rotated` and is instantly invalid;
- `revoked` = explicit consent revoke (owner/staff, API, session); inbound
  `revoke` burns both current tokens immediately;
- transient rows need no parallel copy elsewhere in 13 (README modules
  reference, never redefine).

## 4. Consent & privacy (gate)

- Scopes are NOT allowed silently: each scope maps to a plain-language
  Bangla explanation on the consent screen (design-guidelines §12) plus an
  English fallback.
- **Expert consent rule from staff-rbac**: request checks the requesting
  user's role grants first; any come-out of intersection is refused with a
  `scope_mismatch` error — never an upgraded grant.
- Customer-data scopes (orders, customers, exports with PII) only render
  rows the caller's role can see; payloads never leak beyond the staff
  surface (RLS).
- Audit rows: `consent_granted`, `token_issued`, `token_revoked`,
  `scope_changed` all with `actor_user_id` + `merchant_id`; logs
  PII-minimal (GDPR).
- `opt_out` honored everywhere: turning a webhook or app “off” revokes its
  tokens in the same transaction that flips the setting.

## 5. Data model (tenant tables)

All RLS-bound to `merchant_id` (README §3 guardrail 2):

| Table | Role |
| --- | --- |
| `oauth_clients` | apps: `client_id`, `app_name`, redirect URI allowlist, `client_secret_hash`, scope-allowlist, `merchant_id`, `status active|disabled`, `owner_staff_id` |
| `oauth_authorizations` | approved consent + code: `merchant_id`, `app_client_id`, `staff_user_id`, `scopes`, `code_hash`, `redirect_uri`, `expires_at`, `challenge` PKCE |
| `oauth_token_records` | `access_token_hash`, `refresh_token_hash`, `merchant_id`, `app_client_id`, `staff_user_id`, `scopes`, `role_lookup` (computed intersection), `issued_at`, `expires_at`, `rotated_before_id`, `revoked_at`, `revoked_by` |
| `app_consents` | consent ledger: grant_scope snap, `granted_at`, `revoked_at`, change history (audit) |

JWT claims a bound for gateway/dev-TLS: `sub`=staff id, `merchant_id`, `role`, `scope`, `jti` (token id), `iat/exp`, `iss` (Framique auth origin). RLS **enforces** the row as authority; claims are cache, never authority.

## 6. Endpoints (write/read)

| Method + path | Purpose | Auth on the path | Notes |
| --- | --- | --- | --- |
| `POST /oauth/authorize` | Authorization code (PKCE) | session cookie (staff) | UI consent; returns `code` once |
| `POST /oauth/token` | Exchange code, refresh | none (PKCE/secret proof) | rotate-on-use |
| `POST /oauth/revoke` | Burn access + refresh | refresh token | idempotent, audit |
| `GET /oauth/validate` | Validate/refresh claims (apps peek) | bearer | returns canonical grant record |
| `POST /api/v1/apps` | Create/rotate/disable an OAuth app | admin API key (staff rbac) | scope allowlist required |
| `POST /api/v1/apps/:id/rotate-secret` | Rotation | admin key | old secret dies instantly |
| `DELETE /api/v1/apps/:id/consents` | Revoke all consents | admin key | cascade revoke tokens |

Rate limit: `/oauth/token` shares `rate_limit_buckets` (README §3 shared
with `docs/06-payments`); auth-failure (credential-stuffing) escalation all
routes use the same shared bucket. Production buffer numbers = **named TBD**
(owner: Platform) — the README §13 does not yet set numbers.

## 7. Events (align README §5)

`oauth.token.issued`, `oauth.token.revoked`, `oauth.app.created`,
`oauth.app.rotated`. All tenant-scoped; every webhook payload verifies HMAC
before anything executes (webhook-gateway semantics, same as README §7).

## 8. Failure & recovery

- Refresh with a `rotated` token → `invalid_grant` + full cascade revoke of
  the pair (theft detected).
- Expired refresh token → clean `invalid_grant`; never auto-rotate without
  new authorization.
- Down app: repeated `scope_mismatch` → the app goes `disabled` and consent
  is dropped (re-consent required on re-enable).

## 9. A11y & performance

- Consent screen AAA (auth flow surface — AGENTS.md: AAA on auth).
  44px targets, `prefers-reduced-motion` → opacity-only (design-system §5),
  keyboard complete, no color-only state (mint/amber/red + icon + text per
  design-system §3.2).
- App list virtualized above 200 rows (design-system §8); token refresh
  returns in a single round-trip (no chained calls), route-level split.

## 10. Guardrails (strict)

1. Never return/mask/client trust a scope the role lacks.
2. Never store or log a raw access/refresh token or client secret — hash
   only, PII-min.
3. Empty consented-scope requests are rejected (`scope_required`).
4. Authorization requests without PKCE are **denied** for browser clients.
5. Revocation is synchronous & audit-trailed; the token family dies in one
   op.
6. Never let TTL/rotation reuse-6 silent loopholes through; every auth
   surface pull gates via `rate_limit_buckets`.

## 11. Testing gates (when registered — require new `e2e_…_loop` first per README §11)

- `admin_loop` (existing, docs/15-e2e): grant → token issued → revoke →
  `401` on first use → audit rows present.
- NEW: `e2e_oauth_loop` (register first, per README §11, named TBD owner
  Platform): PKCE flow, refresh-rotation reuse rejection, scope intersection
  refusal, app disable-cascade-revoke, credential-stuffing bucket.

## 12. Design guidelines — OAuth consent + app manager

- Intent: "You are in charge of exactly what you hand out" — every
  grant is explicit, every handover shows a source.
- Key surfaces: consent dialog (Bangla-first, scopes as rows with plain
  explanations + a "what data" preview), app manager list (status chips,
  rotate-secret disclosure row), webhook set linking to 06.
- Palette: teal active / slate neutral queued / red revoke; never color-only
  (icon + label triple).
- Typography: Bangla display header (Noto Sans Bengali variable), tabular
  numerics for token counts; mono for client_id/client_id hint (JetBrains
  Mono).
- Density: admin-dense list, consent dialog airy; mobile bottom-anchored
  primary action.
- Motion: token “revoked” pill 200ms fade, `prefers-reduced-motion`
  collapse to opacity (design-system §5).
- Performance: consent page no render-blocking JS; app list virtualized;
  no 3rd-party.
- Anti-slop check: a real "Your data, your money" opening scrim like the
  README §10 export banner, live row-count of granted scopes
  ("আপনি ৪টি স্কোপ দিয়েছেন"), never Lorem `Dolor`; the "what breaks
  when this is revoked" preview line.

## 13. Residual v0 gaps / named owners
- Production TTL default for access vs refresh tokens — named TBD (owner:
  Platform) before paper.
- Rate-left the crate numbers / bucket sizes on `/oauth/token` shared
  bucket — named TBD (owner: Platform + 06) from load test.
- Auth-failure leak window escalation thresholds — named TBD (owner:
  11-fraud + Platform).
- Revocation-replication latency target (how fast a revoked token is
  rejected at the gateway) — named TBD (owner: Platform); evidenced by
  a new revoked-token drill in `e2e_oauth_loop`.
- PKCE for installable CLI SDKs (device flow) — deferred, named TBD (owner:
  12-marketplace).