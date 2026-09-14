# 13 — Export & SDK: Admin REST API (sub-plan)

Status: Planning · Slice S7+ · Gate: not yet approved (paper review TBD)

Owners: Platform (API surface + key lifecycle) · 06-payments (shared rate-limit) · Merchant-admin (consumer)

References: `docs/13-export-sdk/README.md` (surface README — this file is its §2 sub-plan), `docs/01-architecture` (edge → Go gateway → PostgREST; JWT `merchant_id`; RLS), `docs/02-merchant/staff-rbac.md` + `staff-approval.md` (four-eyes gates), `docs/06-payments/webhook-gateway.md` + README §3 (`rate_limit_buckets` shared), `docs/07-commerce` (server-side authority), `docs/15-e2e/README.md` (loop house), `docs/00-meta/design-system.md` §10 (page-guideline template)

## 1. Purpose

The admin REST API is the tenant-scoped programmatic surface for merchant
automation: RLS-gated reads, API-key-authenticated writes and rotations, and
a download path for export artifacts. It shares the `rate_limit_buckets`
table with `06-payments`, files every mutation in an audit record, and never
lets the client make a server-authoritative decision (money math, stock,
discounts, fraud — validated server-side, AGENTS.md §2). OAuth for
third-party apps is `oauth.md`; the SDK that wraps this surface is
`api-sdk.md`; webhook delivery lives in README §4/§7.

## 2. Scope

In scope:

- One canonical API-key lifecycle machine for every key (this file, §3):
  `active → retired | expired | revoked`, with `api.key.rotated` on rotation.
- Transport, versioning, cursor pagination, and envelope conventions.
- Shared rate limiting with `06-payments` (production numbers stay upstream).
- Idempotency and declared failures for write paths.
- RLS, `merchant_id` scoping, and audit trail (FO reference).
- Endpoint catalog §6 — each line traceable to README §2 (export center,
  webhooks, admin API) or to an existing dependency in `02`/`07`.

Out of scope (own files): OAuth grant/token machines (`oauth.md`), SDK codegen
and retry policy (`api-sdk.md`), webhook endpoint + DLQ replay (README §4/§7).

## 3. API key lifecycle (`api_keys`)

`api_keys` is RLS-bound to `merchant_id`, always:

- `key_id uuid`, `merchant_id uuid` (only tenancy controller, all writes
  filter on it), `label` (human name), `created_by uuid` (operator id),
  `created_by_role` — role row checked against `staff-rbac.md`; the role is
  fixed at create and cannot be widened by the key.
- `secret_hash` — store the long-lived secret as a salted hash only; the plain
  bearer is shown exactly once at creation, never again. Never logged.
- `last_used_at`, `last_ip` (masked), `created_at`, `revoked_at`, `expires_at`
  — short-lived per README §3.
- `scopes` — always empty or an explicit allowlist (per-surface capabilities
  owned by the role row: read_only | manage_exports | manage_webhooks |
  manage_keys). Empty scopes = role defaults; no scope grants anything beyond
  the role.

Canonical API-key machine (owned by this sub-plan; export-job machine stays
canonical in `export-job.md` §4, webhook machine in `06-payments/webhook-gateway.md`):

`active → retired | expired | revoked`, where `rotated` is an event, not a
state: **rotate** creates a brand-new key row and marks the old one
`revoked` in the same transaction (`api.key.rotated` emitted once). A key in
any non-`active` state fails auth with `key_revoked | key_expired` on the next
call; retries never extend the key.

Grace period: none by default — rotation is immediate; a merchant may set a
named "grace window" only at rotation time (owner: Platform; value 0 | TBD).

## 4. Transport & limits

- REST over TLS, JSON envelope, versioned prefix `api/v1`. OpenAPI contract in
  the same repo; SDK codegen consumes that contract.
- Auth `Authorization: Bearer frm_<token>`; every non-read call also requires
  idempotency (`Idempotency-Key` header, Redis-hidden, key + merchant + route).
- Pagination: cursor-based on every listing (opaque `cursor`, never offset);
  order fixed at request time; limits: named default + named max (owner:
  Platform; value project-measured, never-guessed).
- Rate limits are `rate_limit_buckets` (shared with 06-payments): per-key and
  per-merchant buckets, applied at the gateway before PostgREST; production
  numbers live in `06-payments`, not here; the onboarding page renders counts
  only from the shared integer column.
- Sane gating: a key in the same-role, same-IP, same-second path hits the
  shared bucket first; writes to a job in `ready_for_download` fail before
  any mutation.

## 5. Error contract

- Status codes: 200/201/204/400/401/403/404/409/422/429; `error_code`
  strings (e.g. `rate_limit_exceeded`, `idempotency_replay`,
  `export_not_ready`) + `message` (Bangla/English locale) + `request_id` on
  every response, including 429.
- Write paths rollback on any non-200: idempotency key consumed only on
  success (safe to stamp twice), not on 409/422.
- Every 5xx lands in the edge error log, DLQ-surfaced, PII-minimal.

## 6. Endpoint catalog (annotated, README-consistent)

All RLS-bound to `merchant_id`:

- `GET /api/v1/exports` — list jobs: job rows (`exports`), status chips
  (icon+text+color triple; never plain), cursor pagination, computed
  `total_rows_estimate` from the job record (never live at read time).
- `POST /api/v1/exports` — create job: explicit object_type/range/privacy
  filter; PII fields require explicit selection first (README §8); returns
  `export_id`; idempotent.
- `GET /api/v1/exports/:id` — job detail; `export_files` signed URL is
  returned only when the machine reads `ready_for_download` (`export-job.md`
  §4); expired → purge → re-run.
- `GET /api/v1/webhooks` / `POST|PATCH|DELETE /api/v1/webhooks/:id` — endpoint
  cards (HMAC secret masked, confirm-reset), enabled event set; writes are
  manager-role gated (staff-rbac four-eyes).
- `POST /api/v1/api-keys` — create (plain token shown once); `POST
  /api/v1/api-keys/:id/rotate` — rotate; `DELETE /api/v1/api-keys/:id` —
  revoke. All three are writes that carry `merchant_id`, the `scopes`
  intersection rule and same-idempotency contract.

Only these operations: reads, key CRUD, export/webhook creation, and download —
no client-facing decision endpoints (no "price overrides", no "mark
paid/shipped", no coupon application). A UI surface for these belongs to
`07-commerce` + `admin`, and its platform never trusts the client.

## 7. Events & audit

Events stay canonical in README §5 (`export.completed`, `export.failed`,
`webhook.created`, `webhook.delivered`, `webhook.dead-lettered`,
`api.key.rotated`). Sub-transitions (create, revoke, expire) are audit rows —
no widening of the event set without a README §5 change first. Audit: every
table row touched by a mutation records operator id + key label at write
time (staff-rbac convention).

## 8. Failure & recovery

- Export job, once failed → client retries on the same idempotency key; job
  log keeps the last flushed part (export-job §7).
- Key/secret rotation loss → revoke and recreate; never regenerate a hash
  from a client-trusted value.
- Rate-limit burst → 429 + Retry-After; the client never auto-backs-off into
  the gateway (it re-queues, see `api-sdk.md` §4).

## 9. Design guidelines — SDK/API key onboarding surface

- Intent: trust through openness — every reachable surface and its data
  browsable without a ticket (README §10).
- Key surfaces: create-key dialog with "— value shown once," rotation
  must-mirror to previous, list of keys with status chips.
- Palette: teal for `active`, amber for `expires_within_7d`, red for
  `revoked`, mint whole-block on rotate-complete; code-tint (dark mono
  panels) only on the SDK page, always on white.
- Typography: tabular counts; mono consistently JetBrains Mono; Bangla
  option (Noto Sans Bengali variable) for the mask/value copy.
- Motion: only teal pulse on rotation-in-progress; prefers-reduced-motion →
  opacity (design-system §5).
- A11y: keyboard clear path — key label, then Reveal-Show, then Rotate,
  without a drag.

## 10. Testing gates (see README §11 for the full contract)

- `admin_loop` (existing): API-key create → rotate → revoke; key_* → 401 on
  a dead key; export end-to-end; webhook HMAC verifies; over-bucket requests
  get 429. 
- Any NEW check beyond the above is gated by a new `e2e_<area>_loop` in
  `docs/15-e2e` registered first (named TBD + owner), per README §11.
- `store_loop` never calls the SDK/API live (README §11).

## Residual v0 gaps

- `page` limit numbers, idempotency TTL, and rotation grace window values are
  TBDs (owner: Platform; value measured from first production run).
- Shared rate-limit bucket counts upstream at `06-payments` — no number is
  invented here.
- Key/SDK download is static-only until `api-sdk.md` ships (version lockstep
  in that sub-plan).

---