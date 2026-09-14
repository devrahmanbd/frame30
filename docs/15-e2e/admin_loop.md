# Admin Loop — E2E spec (staff lifecycle, RBAC, MFA)

Status: Planning (depth spec for `docs/15-e2e` §Suites) · Slice S2 staff surface (P4) · feeds `.e2e/admin_loop.spec.ts` + `.e2e/admin_loop_failure.spec.ts`
Owners: Platform Auth + Merchant Admin
References: `docs/02-merchant/staff-rbac.md` §2–§11 (Tenant004/005 schemas) · `AGENTS.md` §4 (E2E) · `docs/15-e2e/README.md`
Implementation note: Playwright files are **deferred until the S1 app scaffold exists** (no `package.json`, no dev server, no Supabase local stack, no edge layer yet). This document is the canonical acceptance contract those files must implement; no `.e2e/` artifact may claim green against it before the harness exists.

---

## 1. Purpose

Prove end-to-end that the staff delegation model works as specified: invite → activate → operate → suspend/remove; role grants enforced at RLS + RPC; MFA enforced and recoverable; grant/suspension revocation ≤ 60 s; audit rows written for every sensitive action. This suite is the acceptance contract for `Tenant004` + `Tenant005`.

## 2. Scope

**In scope** — the six golden scenarios of `staff-rbac.md` §11 (invite/activate/MFA-enforced-on-login; custom-role enforcement; ≤ 60 s revocation; suspend; MFA TOTP/lockout/backup/break-glass; owner demotion re-auth), each with concrete RPC calls, expected error codes, and expected `staff_audit` rows. Plus the `admin_loop_failure` suite.

**Naming disambiguation**: the `docs/15-e2e/README.md` "Admin loop" line covers merchant onboarding → product → publish → POS → dashboard KPIs. This spec covers only the **staff lifecycle arm** (RBAC/MFA) of the admin surface. The two suites live side by side in `.e2e/`; this one is `admin_loop` per `staff-rbac.md` §11.

**Out of scope**

- Storefront buyer auth/MFA (`docs/03-storefront`), POS offline drafts, builder/market themes, marketplace platform-operator permissions, SSO/SCIM.

## 3. Harness contract

- Playwright at repo root in `.e2e/`; `retries = 2`; `@flaky` quarantine after 3 flakes; trace on fail (screenshot + video) to `docs/15-e2e/artifacts`.
- Supabase local stack (`supabase start`) with per-env `test-*` datastore; **temp org per test** (`merchant_id` generated per test) so suites never share tenant state; `staff_audit` truncated between tests.
- In-process mock outbox for invite/security emails and SMS OTP (deterministic codes); Redis claim-cache on a test instance, flushed per test.
- **The suite calls the edge layer (PostgREST) as the user — `service_role` is never used**, matching the Tenant005 grants convention (every actor-derived RPC is `authenticated`-only). A dedicated failure test asserts `service_role`-keyed calls are denied.
- Determinism: const email/phone fixtures; fixed TOTP secret seeded into `auth.mfa_factors` per test; lockout timings seeded directly (`mfa_failed_attempts` counters) instead of real 30-min waits — only waits < 2 s are real.
- Tests drive the public RPC surface only (Tenant004/Tenant005 functions); no direct DML from tests.
- CI: migration forward on every run; migration rollback in a separate check; never auto-rollback (human).

## 4. Golden scenarios (map `staff-rbac.md` §11.1–6)

Error codes referenced below are the literal exceptions from Tenant005: `not_staff`, `not_invited`, `mfa_required`, `no_permission`, `not_found`, `invalid_status`.

### 4.1 Invite → activation → MFA enforced on first login (§11.1)

1. Owner calls `invite_staff(p_user_id, p_role_id)` → 200; audit row `staff.invited`.
2. Invite email lands in the mock outbox (PII-minimal, no token in plaintext body).
3. Staff calls `activate_staff()` **before** MFA enrollment → `mfa_required` (activated only when `mfa_status = 'enrolled'`).
4. Staff enrolls TOTP (`mark_mfa_enrolled()`; secret lives in Supabase Auth, not app tables) → `activate_staff()` → 200; status `active`; audit `staff.activated`; second `activate_staff()` → `not_invited`.
5. Non-staff user calls `activate_staff()` → `not_staff`.

### 4.2 Custom role "catalog manager" (§11.2)

1. Owner `create_role('catalog manager', '{"catalog.create": true, "catalog.update": true, "catalog.publish": true}')` → role uuid; `staff.manage_roles` not granted and **unassignable**.
2. Owner `set_role(staff_id, catalog_manager_role_id)`; staff `activate_staff()`.
3. As staff: catalog create/update/publish RPCs → 200.
4. As staff: any order-write RPC → `no_permission` (RLS + guard); grant `staff.manage_roles` absent from every response payload.

### 4.3 Grant removal → ≤ 60 s revocation (§11.3)

1. Staff holds `catalog.publish`; owner `update_role_grants(role_id, {... without publish})`.
2. Assert revocation ≤ 60 s: immediately after the change, the existing session's `catalog.publish` RPC fails with `no_permission` on cache-hit path AND after direct lookup path (cache flush covered in failure suite).

### 4.4 Suspend → immediate denial + session revoked (§11.4)

1. Owner `set_staff_status(staff_id, 'suspended')` → 200; audit `staff.suspended`.
2. Same session: any privileged RPC → `no_permission`; session/claim cache no longer resolves grants.
3. Owner `set_staff_status(staff_id, 'active')` with staff `mfa_status = 'enrolled'` → 200; re-activation while `mfa_status = 'none'` → `mfa_required` (asserted in failure suite).

### 4.5 MFA: TOTP accept, wrong-code lockout, backup code, owner break-glass (§11.5)

1. TOTP correct → `record_mfa_success()` 200; counters cleared; `last_login_at` set.
2. 5 consecutive wrong codes → `record_mfa_failure()` returns `true`; `mfa_locked_until = now() + 30 min`; audit `staff.lockout`.
3. Owner `unlock_staff(staff_id)` → 200; then correct TOTP → session OK.
4. Backup code: `record_backup_code_used()` decrements `backup_codes_remaining` (floor 0); redemption audit `staff.mfa_recovery`.
5. Owner break-glass: `break_glass_reset_mfa(staff_id)` → 200 (owner-only, audit `staff.break_glass`); target `mfa_status` → `none`, then re-enroll flow.

### 4.6 Owner demotion: without re-auth blocked; with re-auth allowed (§11.6)

1. `set_role(owner_id, viewer_role_id)` from an owner session **without** `begin_elevation()` → `no_permission`.
2. `begin_elevation()` (owner only) → `elevated_until = now() + 5 min`; retry demotion → 200; audit rows for both elevation and role change.

## 5. Failure suite (`admin_loop_failure`)

- Lockout seeded at `mfa_failed_attempts = 5` → any MFA-guarded RPC fails while locked; `unlock_staff` by non-`mfa_admin` → `no_permission`; by owner → 200.
- `set_staff_status` invalid transitions → `invalid_status`; unknown staff → `not_found`; reactivation with `mfa_status = 'none'` → `mfa_required`; `invited/removed → removed` → `invalid_status`.
- `activate_staff` on active staff → `not_invited`; on non-staff → `not_staff`.
- `break_glass_reset_mfa` by non-owner → `no_permission`; no audit row written on failure.
- `create_role('owner')` / name collision → rejected; `update_role_grants` on fixed `owner`/`viewer` roles → rejected; `create_role` with `staff.manage_roles` in grants → rejected.
- **`service_role` probe**: calling any Tenant005 RPC with a `service_role` key → denied (guards the grants convention).
- `staff_audit` integrity: every mutation above leaves exactly the expected audit rows; failed calls write none.

## 6. Fixtures & seeds

- Const email/phone fixtures (owner, staff A/B, non-staff), one temp org per test.
- TOTP: fixed seed per test in `auth.mfa_factors`; backup codes stored as hashes in Auth (never plaintext in app tables).
- Role seed data: "catalog manager" grants jsonb as in §4.2; fixed `owner`/`viewer` roles from Tenant004.
- Seeds apply through Tenant004/Tenant005 RPCs only.

## 7. Determinism & data reset

- Temp org per test; claim-cache flush per test; `staff_audit` truncate per test; lockout math seeded (no real 30-min sleeps); clocks frozen where §7 timings are asserted.

## 8. Gates

- `admin_loop` critical at the staff slice merge gate; full suite nightly + per release; a11y AAA on MFA/auth screens (per `staff-rbac.md` §12); migration forward+rollback checked in CI.

## 9. Open items

- Implementation blocked on S1 scaffold (Playwright, Supabase local stack, edge layer) — see header note.
- Edge-layer mapping of `record_mfa_failure()`'s boolean (session-end vs lockout response) must be pinned here once the edge exists.
- Post-scaffold: decide split of this suite vs the README "Admin loop" merchant-onboard suite (shared harness, separate specs).
