# Review & Approval Workflow (staff approval)

Status: Planning · Slice: S5 · Reference: `/plan.md` §3.1 (settings), staff-rbac.md §4 (permission matrix), content-cms.md §2 (content state machine), publishing.md §4 (themes.publish guard)
Plans: `staff-rbac.md` (RBAC + elevation) · `content-cms.md` (marketing group) · `publishing.md` (themes group guard) · app-blocks.md (catalog `draft` → `verified` gate) · E2E: `docs/15-e2e/admin_loop.md`
Schema: 💾 additive — Tenant010 (staff flows 005, themes 006, marketing 007, publishing 008, widgets 009)

## 1. Purpose

A merchant's staff shouldn't be able to put content, a page, a catalog entry, or a refund on the storefront (or into the money flow) on a lone keystroke. This spec owns the **four-eyes review gate**: any member can author and submit, a _different_ staff member with the `approve` grant decides; every decision is a tamper-evident audit row. Approval is the enforcement layer above the RBAC matrix — who can do it (RBAC) and when it actually lands (approval).

## 2. Scope

**In scope**

- The generic approval facility: submit → review → approve/reject → (expire) — one shape, shared by every resource that opts in.
- The tenant-level opt-in (`approval_level` per resource group): `none | required`. Default `none` except where an upstream doc already gates (`docs/05-marketing` content-surface ships with approval available but off; refunds in `finance` stay `approve`-granted).
- Four-eyes invariant everywhere: the staff member who submits a request may never approve it (self-approval is a hard server-side error).
- Owner override: the owner decides even in the queue (elevated window, audit row `approval.owner_override`).
- Expiry and cancellation semantics.

**Out of scope**

- Platform-side (cross-tenant) marketplace operator review console — catalog (`widget_catalog`) promotion of community widgets happens in `12-marketplace`, and the queue _pattern_ is borrowed from this doc; the _console_ is a platform surface, not merchant staff.
- Email/SMS digests for pending requests (design reserve; notifications fire as events only).

## 3. Concepts

- **Approval request**: one submission unit `(resource_type, resource_id, action, snapshot)`. The snapshot (JSON) is captured at submit time so the reviewer sees exactly what they approved — no silent drift while the request idles.
- **Queue**: tenant-scoped, per resource type; reviewers (`approve` grant) see pending requests; submitters see their own history.
- **Invariant — no self-approval**: `reviewed_by != submitted_by` always; enforced in the SQL trigger, not the UI (the UI is a comfort layer; AGENTS.md hard rule: no client-trusted decisions).

## 4. State machine

```
draft (author) → submitted (pending) → approved → (resource proceeds on its existing
state machine: content draft → scheduled|published per content-cms §2; publish burst per
publishing §4; catalog draft → installed)
                     ↳ rejected (reason required) → closed
                     ↳ cancelled (submitter revokes)
                     ↳ expired (>72h, server-side tick) → auto-rejected + audit
```

- `submitted` is idempotent: re-submitting the same snapshot is a new request; cancel winks the old one.
- `approved` is the _green light_, not the _do_: the downstream transition still runs under the existing guard (`themes.publish` for pages, `finance.approve` for refunds...). Approval never bypasses RBAC.

## 5. RBAC integration

New matrix action, reused, not invented:

| resource_group | added action          | meaning                                                                              |
| -------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `marketing`    | `approve`             | approve content/pages/feed submissions                                               |
| `catalog`      | `approve`             | approve product/catalog flag-worthy submissions (incl. bulk import)                  |
| `finance`      | `approve` (existing)  | refunds/payouts — the 4-eyes exists here already; this doc generalizes its mechanics |
| `themes`       | `approve` (new group) | page publish/schedule submissions                                                    |

- Fixed roles: `owner` always holds effective `approve` on every group (and is the only one who can self-approve under the elevation window §6.3); `viewer` never does.
- When the tenant's toggle = `approve_required` on a resource type, the publish/stage actions (`publish`, `update_status`, `refund`, `update_coupon`) require `approve` on top of the existing base grant. Staff without it get the button relabeled "Submit for review".
- Exactly one decision actor: `reviewed_by` resolves through `staff_members`, always `auth.uid()` — the same actor chain as `staff_has` (staff-rbac §6), so suspension kills pending queue access instantly (claim cache ≤60s revocation parity).

## 6. Data model (tenant-scoped)

```
approval_requests (
  id uuid PK,
  merchant_id uuid NOT NULL,
  resource_type text NOT NULL,          -- page|coupon|content|catalog|refund
  resource_id uuid NOT NULL,
  resource_action text NOT NULL,        -- publish|update|refund|deactivate...
  payload jsonb NOT NULL,                 -- approval snapshot (± resource details at submit time)
  status approval_status NOT NULL DEFAULT 'pending', -- pending|approved|rejected|expired|cancelled
  submitted_by uuid NOT NULL,             -- FK staff_members
  reviewed_by uuid,                       -- FK staff_members (NULL while pending)
  review_comment text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

- RLS: `merchant_id` mandatory; readers = tenant staff (any role); `approve`-grant holders can read+decide; nobody except owner may delete a row (archive only).
- The payload is a **snapshot, not the live row**: reviewer sees the frozen state, and a post-approval change re-submits (no silent drift).
- Indices: `(merchant_id, resource_type, status, created_at desc)`.

## 7. RPC surface (Tenant010; all `security definer`, `search_path=''`, grant only `authenticated`)

| RPC                    | Signature                                                                       | Required                   | Notes                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.submit_approval`  | `(p_resource_text, p_resource_id, p_resource_type, p_action, p_payload) → uuid` | base grant of the resource | Insert snapshot; fires `approval.requested`                                                                                                                                                             |
| `app.cancel_approval`  | `(p_request_id)`                                                                | submitter                  | Only while `pending`                                                                                                                                                                                    |
| `app.approve_approval` | `(p_request_id, p_comment)`                                                     | `approve` grant            | Rejects `submitted_by = me` with a hard error (`self_approval_denied`); sets `reviewed_at`, fires `approval.approved`; downstream trigger executes the intended transition (e.g. `themes.publish` body) |
| `app.reject_approval`  | `(p_request_id, p_comment)`                                                     | `approve` grant            | `reviewed_at` + fires `approval.rejected` with the comment                                                                                                                                              |
| `app.expire_approval`  | `()`                                                                            | system scheduler           | Ticks `pending` → `expired` past `expires_at` (same tick as `promote_due` – reuse the pattern, publishing §5)                                                                                           |

Self-approval guard lives in the SQL function: `if p_request.submitted_by = app.current_merchant()...` — enforced server-side, never a UI check.

## 8. Approval decisions under owner elevation

- Owner **approving** a request they submitted goes through the 5-minute `begin_elevation()` window (staff-rbac §7) — the only self-approval path in the product, recorded as `approval.owner_override` plus a `staff_audit` entry. Elevation is the risk signal that `11-fraud` sees.

## 9. Events

`approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.cancelled`, `approval.owner_override`.
Consumers: `audit_log` (all), notifications (submitter on decision — PII-minimal), `11-fraud` (`owner_override` + queue-rush heuristics), `07-analytics` (approval latency distribution).

## 10. Failure/recovery

- Reviewer's session corrupts mid-decision → nothing committed until the RPC returns; state stayed `pending`; reject/approve are idempotent on the same request (second call is a no-op with `already_decided`).
- Cadence expiry tick dies → `expired` not written: decisions still competitive (a human can still approve) and the queue surfaces over-age badges; the scheduler heals on the next tick.
- Staff removed mid-`pending`: the request lives on, but decisions require a granted reviewer; `reviewed_by` may be null forever (queue shows "no reviewer for this group" if that's the last one — suspension is instant per staff-rbac §7).

## 11. E2E coverage (extend `docs/15-e2e/admin_loop.md`)

1. Author submits a content article (`marketing`) without `approve` grant → button relabeled "Submit for review"; article `in_review` not on storefront.
2. Second staff with `marketing.approve` approves → article moves to scheduled/published (per content-cms §2).
3. Same staff tries to approve their own request → `self_approval_denied`.
4. Reviewer rejects with comment → article returns to author UI with reasons listed; requeue submits a new request.
5. Owner uses elevated window to approve their own page publish -> `approval.owner_override` audit row present.
6. 72h expiry tick → `expired` state, storefront unaffected, audit row.

## 12. Design guidelines — queue, decision tile, audit trail

- Intent: a queue that reads like a production diplomacy desk — nothing moves without a signature; every decision is a paper trail (BD-native).
- Key surfaces: approval queue (list of pending tiles grouped by resource type), decision tile (snapshot preview + diff-ish note), rejection dialog (reason required), "submitted" banner on the initiating surface.
- Palette: teal accent on decisions; mint = approved; amber = pending/in-flight; Rickshaw = rejected/expired; never color-only (badge = icon + label + color).
- Typography: 0.875rem rows; resource name Bangla+English dual; payload of the tile in monospace-ish chip.
- Density: queue is admin-dense (44px rows); review dialog is spacious (snapshot preview 40px grid).
- Motion: tile status flip 200ms; decision dialog spring 200ms scale; reduced-motion → opacity crossfade only.
- A11y: queue is a list with `aria-current` on pending; decision buttons labelled; reason textarea `aria-describedby` error; status badge has text label (never icon/color only); keyboard complete (Enter decides, Esc closes).
- Performance: queue virtualized >200 rows; snapshot fetched lazily when tile opens.
- Anti-slop: the review diff is rendered as the _actual_ resource preview (article or page or order) not a JSON blob; rejected tiles collapse to show comment in a courier-thread style; the empty queue state is a single quiet Bangla line, not a hero illustration.

## 13. Residual v0 gaps

- Marketplace-operator review console (cross-tenant promotion gate for `widget_catalog` `draft` → `verified`) is a platform surface (see `12-marketplace`); merchant approval shares its shape only.
- SLA timers / auto-reminder email for stale approvals (events only today).
- Approval on all `finance` code paths beyond refunds comparison parity (payout settlement etc. come with the finance slice).
- Delegate so the queue fetches via the real event bus (events work separate).
- `owner_override` per-request justification (single mandatory comment today, structured checklist later).
