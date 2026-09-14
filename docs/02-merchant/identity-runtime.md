# Identity & Access Runtime (Tier 1.2)

Status: Built · Ledger: `BUILD.md` §1.2 · Related: `staff-rbac.md`, `staff-approval.md`,
`01-architecture/tenancy-runtime.md`

This is the implementation contract for authentication, session hygiene, and the
step-up gate that protects money actions. It documents what exists, not a plan.

## 1. Data model (all tenant- or user-scoped, RLS on, service-role grants only where needed)

| Table | Purpose | PII posture |
|---|---|---|
| `auth_events` | Append-only sign-in / failure / MFA / OAuth audit trail | email + IP stored as salted SHA-256 hashes; no raw values |
| `auth_sessions` | Active session registry: device string (OS/browser), hashed IP, last seen | hashed IP only |
| `step_up_grants` | Short-lived single-use grants for sensitive actions | no PII |

`step_up_consume(_action, _merchant_id)` is `SECURITY DEFINER` and burns the grant
in the same statement it validates, so a replayed refund cannot reuse a grant.

## 2. Lockout model

`signInGuard` (in `src/lib/identity.server.ts`) applies a **double bucket** before
any credential is checked:

- `auth.signin` keyed on the hashed email — stops targeted password guessing.
- `auth.signin` keyed on the hashed request IP — stops credential stuffing across
  many accounts from one origin.

Buckets live in `BUCKETS` (`src/lib/rate-limit.server.ts`) and are counted
server-side via `rate_limit_hit`; the limiter table is service-role only, so the
verdict is never client-trusted. On exhaustion the UI shows a neutral
"Too many attempts. Try again in Ns." — identical for existing and unknown
addresses.

## 3. Enumeration safety

Password reset always answers with the same message regardless of whether the
address resolves to a user. Sign-in failures never distinguish "no such user"
from "wrong password". This is asserted in `.e2e/specs/auth_loop.spec.ts`.

## 4. Step-up gate on money

`requireStepUp(supabase, action, merchantId)` is called inside the server path,
not the UI. Currently gated: `refundOrder` (`src/lib/orders-admin.server.ts`).

Flow: staff triggers the action → server rejects without a grant → UI runs a TOTP
challenge → `grantStepUpFn` issues a 5-minute single-use grant (only when the
session reports `aal2`) → action retried → grant burned.

Guarantee: an authenticated, correctly-permissioned staff member still cannot move
money without a fresh second factor.

## 5. Sessions

Sign-in registers a row in `auth_sessions` with a coarse device string. The
security desk (`/admin/settings/security`) lists recent activity and offers
"sign out other devices", which revokes both our registry rows and the Supabase
sessions (`signOut({ scope: "others" })`) — dual layer, so a stale refresh token
cannot outlive a revoke.

## 6. Observability

Every guard emits through `src/lib/observability.server.ts`:
`framique_rate_limit_total{bucket,outcome}` for lockouts,
`framique_span_total{span,outcome}` and `framique_span_duration_ms` for the auth
spans, and structured `log()` lines carrying only hashes and outcomes. Errors
forward to Sentry when `SENTRY_DSN` is set. Scrape target: `/api/public/metrics`,
closed (404) with no `METRICS_TOKEN` and 401 on a wrong bearer.

## 7. Test gates

`.e2e/specs/auth_loop.spec.ts` (part of `e2e:critical`) asserts: the sign-in
surface contract, reset enumeration safety, lockout after repeated failures,
`/admin/settings/security` redirecting unauthenticated users to `/auth`, and the
metrics endpoint refusing to expose the registry.

## 8. Open items

- Email change with re-verification.
- Step-up extended to payouts and gateway credential edits.
- TOTP recovery codes.
