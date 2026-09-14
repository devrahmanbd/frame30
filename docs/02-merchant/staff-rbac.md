# Staff, Roles & Permissions (RBAC) + 2FA/MFA

Status: Planning (depth spec for `docs/02-merchant` §Settings) · Slices S2/S5
Owners: Platform Auth + Merchant Admin
References: `/basic.md` items 19–20 · `AGENTS.md` (RLS, consent, PII-minimal) · `docs/11-fraud` (risk signal) · `docs/00-meta/design-system.md` §7, §10
Design decision (approved): granular custom roles (permission matrix) · MFA on platform users only — storefront buyer auth stays in `docs/03-storefront`.

---

## 1. Purpose

Staff accounts let a merchant tenant delegate admin access with granular, revocable permissions, and protect every platform session with multi-factor authentication. This is the accountability layer: every sensitive action resolves to a named staff member, a role, and an audit row.

## 2. Scope

**In scope**

- Staff lifecycle: invite → activate → suspend → remove.
- Role model: fixed Owner + Viewer; arbitrary custom roles composed from a permission matrix.
- Permission enforcement: RLS + RPC guard for every tenant resource.
- 2FA/MFA: TOTP app + email/SMS OTP for owner and staff sessions; enforced MFA; recovery codes.
- Audit trail for role/permission/MFA changes.

**Out of scope**

- Storefront buyer accounts and buyer MFA (see `docs/03-storefront`).
- SSO/SCIM, OIDC identity federation (design reserve).
- Permission for marketplace-wide platform operators (separate platform-operator surface, later slice).

## 3. Concepts

- **Staff member**: a platform user bound to exactly one tenant (`merchant_id`). One person, one staff row; cross-tenant staff sharing is out of scope (re-invite per tenant).
- **Role**: a named bundle of grants. `owner` and `viewer` are fixed and immutable; all other roles are custom and mutable.
- **Grant**: one `(resource_group, action)` pair. The permission matrix is the single source of truth; roles are just sets of grants.
- **Session claim**: the resolved effective permission set is materialized into the session (role id + grant set hash) at login and re-checked against RLS on every query — the claim is a cache, never the authority.

## 4. Permission matrix

Resource groups (tenant-scoped, each maps to one or more PostgREST resources):

| Resource group | Example resources                            | Actions                                              |
| -------------- | -------------------------------------------- | ---------------------------------------------------- |
| `catalog`      | `products`, `product_variants`, `categories` | read, create, update, delete, publish                |
| `inventory`    | `inventory_lots`, `inventory_movements`      | read, adjust, transfer, reconcile                    |
| `orders`       | `orders`, `order_items`, `order_events`      | read, create (manual order), update_status, refund   |
| `shipping`     | `courier_shipments`                          | read, create, label, cancel                          |
| `pos`          | POS session, cash drawer                     | read, operate, cash_register                         |
| `marketing`    | campaigns, coupon codes                      | read, create, update, publish                        |
| `analytics`    | dashboards, exports                          | read, export                                         |
| `finance`      | `refunds`, payouts, settlement accounts      | read, initiate, approve                              |
| `settings`     | store profile, tax/VAT engine, billing       | read, update                                         |
| `staff`        | staff, roles, permission_grants              | read, invite, manage_roles, manage_grants, mfa_admin |
| `webhooks`     | `webhooks`                                   | read, create, update, secret_rotate                  |
| `audit`        | `audit_log`                                  | read                                                 |

Fixed roles:

- **owner** — all actions on all groups; sole holder of `staff.manage_roles` on owner himself (demotion requires password + MFA re-confirmation, see §7).
- **viewer** — `read` on catalog, inventory, orders, shipping, analytics, audit. No create/update/delete; no finance, settings, staff, webhooks.

Custom roles: any subset of the matrix. Invariant: a custom role can never grant `staff.manage_roles` on the `owner` row or the `staff` group beyond members it administers (manage-scope restriction, §5.4).

## 5. Data model (tenant-scoped, Supabase)

```
staff_members (
  id uuid PK = auth.users.id (1:1),
  merchant_id uuid NOT NULL REFERENCES tenants(id),
  role_id uuid REFERENCES roles(id) NULL,        -- NULL only while suspended
  status staff_status NOT NULL DEFAULT 'invited',-- invited|active|suspended|removed
  mfa_status mfa_status NOT NULL DEFAULT 'none', -- none|enrolled|enforced
  backup_codes_remaining smallint NOT NULL DEFAULT 0,
  invited_by uuid REFERENCES staff_members(id),
  last_login_at timestamptz,
  UNIQUE (merchant_id, id)
)

roles (
  id uuid PK,
  merchant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  is_fixed boolean NOT NULL,                     -- owner/viewer rows only
  grants jsonb NOT NULL,                         -- [{resource_group, action}]
  created_at timestamptz, updated_at timestamptz
)

staff_audit (
  id bigint PK identity,
  merchant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,                          -- invited|role_changed|grant_changed|mfa_enrolled|mfa_recovery|suspended|removed|break_glass
  payload jsonb NOT NULL,                        -- before/after snapshots (grant hashes, role ids)
  created_at timestamptz NOT NULL DEFAULT now()
)
```

- MFA secrets/backup codes live in Supabase Auth (`auth.mfa_factors`, encrypted at rest) — never in app tables. `mfa_status` in `staff_members` is the enforcement bookkeeping mirror.
- `audit_log` (02 README) stays the generic per-resource audit stream; `staff_audit` is the tamper-evident staff lifecycle ledger (append-only via RPC).
- Indexes: `staff_members(merchant_id)`, `roles(merchant_id)`, `staff_audit(merchant_id, created_at desc)`.

## 6. API / RLS

Tenant claim: `merchant_id` (normalized per AGENTS.md — the 02 README's `org_id` wording is fixed to match).

RLS policy on every tenant table: `app.staff_has(merchant_id, 'catalog', 'read')` style, implemented as one SQL function:

- `app.staff_has(p_merchant_id uuid, p_group text, p_action text) returns boolean` — resolves current `auth.uid()` → `staff_members` → role → `grants`; returns false for `suspended`/`removed`/`invited` regardless of grants; uses a per-session materialized claim cache (revocation window ≤ 60s, see §7).
- Write guards: all mutating endpoints are RPCs (`app.*`) that call `staff_has` with the _specific_ action; PostgREST direct `insert/update/delete` on tenant tables is disabled for non-owner staff via `GRANT`-level restrictions, keeping "all writes via RPC" invariant from the 02 README.
- `staff` group is self-guarded: only `staff.manage_roles`/`manage_grants`/`mfa_admin` holders can touch `staff_members` and `roles`; a user may always read their own row (`staff.read` self-scope).

**Lifecycle/MFA RPC surface** (Tenant005; all `security definer`, `set search_path = ''`, `revoke all ... from public`, then `grant execute ... to authenticated` only — no `service_role`, since every function derives the actor from `auth.uid()`):

| RPC                           | Signature                                  | Required grant        | Notes                                                                        |
| ----------------------------- | ------------------------------------------ | --------------------- | ---------------------------------------------------------------------------- |
| `app.invite_staff`            | `(p_user_id uuid, p_role_id uuid)`         | `staff.invite`        | Binds an invited Auth user to this tenant; `role_id` nullable                |
| `app.activate_staff`          | `()`                                       | self                  | Refuses unless `mfa_status != 'none'`; raises `not_staff` if no row          |
| `app.set_role`                | `(p_staff_id uuid, p_role_id uuid)`        | `staff.manage_roles`  | Owner demotion requires elevated window + owner caller (§7)                  |
| `app.set_staff_status`        | `(p_staff_id uuid, p_status staff_status)` | `staff.manage_roles`  | Enforces §8 state machine; reactivation to `active` requires MFA             |
| `app.create_role`             | `(p_name text, p_grants jsonb) → uuid`     | `staff.manage_grants` | Never permits `staff.manage_roles`                                           |
| `app.update_role_grants`      | `(p_role_id uuid, p_grants jsonb)`         | `staff.manage_grants` | Fixed roles (`owner`, `viewer`) non-editable                                 |
| `app.mark_mfa_enrolled`       | `()`                                       | self                  | `none → enrolled`                                                            |
| `app.record_mfa_failure`      | `() → boolean`                             | self                  | Escalates per §7 (5 → 30-min lock, 10 → permanent); returns `true` if locked |
| `app.record_mfa_success`      | `()`                                       | self                  | Clears counters, sets `last_login_at`                                        |
| `app.record_backup_code_used` | `()`                                       | self                  | Decrements `backup_codes_remaining` (floor 0)                                |
| `app.break_glass_reset_mfa`   | `(p_staff_id uuid)`                        | owner only            | Resets target to `none`, audits `break_glass`                                |
| `app.unlock_staff`            | `(p_staff_id uuid)`                        | `staff.mfa_admin`     | Owner target requires owner caller                                           |
| `app.begin_elevation`         | `()`                                       | owner only            | `elevated_until = now() + 5 min`                                             |

Helpers (internal, same grants): `app.current_merchant()` (resolves `auth.uid()` → `merchant_id`), `app.is_owner(uuid, uuid)` (owner fast-path incl. `status = 'active'`), `app.elevation_valid()` (checks the 5-min window).

## 7. Auth, MFA, revocation

**Enrollment**

1. Owner invites (email) → pending invite token (24h) → set password → forced MFA enrollment before first admin access.
2. MFA methods: TOTP app (primary) + email/SMS OTP (fallback). Email/SMS OTP is rate-limited (≤5/min) and PII-minimal in logs (no codes, no phone numbers in analytics — AGENTS.md).
3. Backup codes: 10 single-use codes issued at enrollment, displayed once, hashed at rest (bcrypt), counter `backup_codes_remaining` decremented server-side.

**Enforcement**

- `owner`: MFA always enforced, cannot be disabled by the owner or any custom role.
- `staff`: `mfa.enforced` becomes mandatory for all staff at tenant level 90 days after the first staff invite (grace window with prominent banner); individual staff can enroll earlier.
- Risk-based challenge: sign-in from new device/IP/geo, or `docs/11-fraud` risk signal → `challenge` step regardless of remembered device (Supabase Auth MFA + risk event feed).

**Session & revocation**

- Effective grants materialized at login; claim cache invalidated on grant/role change (publish `staff.grants_changed` event → Redis invalidation, worst-case 60s staleness for long-lived sessions; **immediate** for suspended/removed).
- Suspended/removed staff: session revoked server-side (auth admin revoke) + RLS denies regardless of claim.
- Role change: no session kill (claims re-checked live via `staff_has`); permission grants removed from a role take effect ≤ 60s.
- Owner demotion: re-authentication (password + MFA) inside a 5-minute elevated window; recorded in `staff_audit` as `role_changed` with before/after.

**Recovery**

- Lost TOTP: email/SMS OTP → backup code → owner break-glass (owner re-confirms and triggers `mfa_recovery` reset, audit-logged; staff member must re-enroll).
- Lockout: 5 failed MFA attempts → 30-min cool-down → 10 attempts → owner-only unlock (`mfa_admin`), `staff_audit` entry.

## 8. State machines

**Staff**: `invited → active → suspended ⇄ active → removed` (removed is terminal; `removed` deletes session claims, keeps `staff_audit` rows).
**MFA**: `none → enrolled → enforced` (enforced is a tenant-level gate, not per-device).

## 9. Events

`staff.invited`, `staff.activated`, `staff.grants_changed`, `staff.suspended`, `staff.removed`, `staff.mfa_enrolled`, `staff.mfa_recovery`, `staff.lockout`, `staff.break_glass`.
Consumers: `audit_log` (all), `11-fraud` (lockout/break_glass as risk signals), email/SMS notifications (invite, MFA off, lockout, role changes).

## 10. Failure/recovery

- Supabase Auth down: admin read-only mode (existing sessions serve reads via RLS; writes blocked with retry + banner), MFA verification queued; no MFA bypass.
- Redis claim-cache down: `staff_has` falls back to direct grants lookup (slower, never less safe).
- Lost owner MFA with no backup codes: break-glass via platform support with out-of-band verification (phone call + document check) — the only path that may temporarily disable owner MFA, time-boxed 15 min, full `staff_audit` trail.

## 11. E2E coverage (spec: `docs/15-e2e/admin_loop.md`)

1. Owner invites staff → invite email → activation → MFA enforced on first login.
2. Custom role "catalog manager" (catalog create/update/publish only) → create product OK → create order denied (RLS).
3. Role grant removed → ≤60s revocation on existing session.
4. Suspend staff → immediate access denial + session revoked.
5. MFA: TOTP accept, wrong-code lockout, backup-code redemption, owner break-glass recovery.
6. Owner demotion without re-auth → blocked; with re-auth → allowed + audit rows.

## 12. Design guidelines — role editor, staff list, MFA screens

- Intent: a calm, quiet permissions cockpit — who can do what is visible and reversible in one glance; security events read like a transaction ledger, not a scare screen.
- Key surfaces: staff list (dense table, status chips), role editor (matrix grid with group headers), invite dialog, MFA setup stepper (QR + codes), session/device list, staff audit view.
- Palette: BD teal accent only; mint = active/enrolled; amber = invited/pending/grace; red = suspended/locked; money untouched (tabular BDT).
- Typography: 0.875rem body; role names Bangla+English dual; permission groups in small-caps Latin labels.
- Density: admin-dense (44px rows); matrix grid collapses to accordion groups on phone; primary action (invite) bottom-docks on mobile.
- Motion: row status chip 120ms; invite success toast 200ms; MFA stepper fade 200ms; reduce → opacity-only.
- A11y: AAA (auth surface) — visible labels, `aria-describedby` on every grant checkbox, `aria-live` for lockout/success, keyboard-complete matrix grid (arrow keys), status = icon+text+color (never color alone), focus trap in dialogs.
- Performance: virtualize >200 staff rows; matrix grid renders from one grants payload; code-split MFA stepper.
- Anti-slop: the role matrix renders as a real table with per-cell checkbox semantics and per-group "select all", not a generic switch list; invite screen previews the permission summary card before sending; audit view styled like the order timeline (SMS/courier thread) — security history as a thread, BD-native.

## 13. Enum vs policy scope (reconciliation)

`merchant_role` intentionally carries four values — `owner | admin | staff | viewer`.
RLS policies and privileged RPCs (`theme_publish`, `kyc_submit`, `review_moderate`,
marketplace apply/revert) cast only `ARRAY['owner','admin']` because those are
**write/publish** decisions. `staff` and `viewer` are not policy-level writers:
their capabilities are resolved through `staff_has(merchant_id, group, action)`
and the per-merchant `staff_roles.grants` payload, which is the single decision
point for day-to-day permissions. So a narrower cast in a policy is not drift —
it is the boundary between "structural authority" (owner/admin) and "granted
capability" (staff/viewer).
