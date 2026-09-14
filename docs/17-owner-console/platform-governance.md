# Platform governance — audit, suspension, impersonation, revenue

Covers BUILD.md §2.7. Everything here is cross-tenant, so the rule is the same
throughout: a platform owner may act, but never invisibly.

## Owner gate

`ownerGate` in `src/lib/owner-ops.server.ts` wraps every owner operation and
applies, in order:

1. `requirePlatformAdmin` — platform role, checked server-side, never from a
   client claim.
2. A dedicated rate-limit bucket (`owner.read`, `owner.revenue`, `owner.suspend`,
   `owner.impersonate`, `owner.impersonate_use`).
3. A span (`owner.<action>`) and a Prometheus counter
   `framique_owner_action_total{action,kind}`.
4. An append-only audit write through the `platform_audit_event` security-definer
   RPC, recording actor, action, entity, scope and before/after payloads.

If the audit write fails, the operation fails. An unauditable cross-tenant action
is a compliance failure, not a warning, and is counted as
`framique_owner_audit_failures_total`.

## Audit trail

Reads are audited as well as writes, with `scope` set to `owner_read` or
`owner_write`. The desk at `/root/audit` is filterable by scope and action, paged
server-side, and can expand the before/after payload of any entry. There is no
edit or delete path from the console.

## Suspension and payment freeze

`merchant_suspensions` holds the full history — a reinstatement closes a row
rather than deleting it. Suspending sets merchant status to `suspended` and,
when the freeze is on, `payments_frozen`.

`assertPaymentsNotFrozen` (30s cache, fail-closed) is called from `openCharge`
and `requestRefund` in `src/lib/payments.server.ts`, so a frozen tenant cannot
move money even from a checkout tab that was already open. Reinstating clears
the freeze in the same transaction as the status change.

## Consented impersonation

`impersonation_grants` moves through `pending_consent → active → expired |
revoked`. The owner can only *request*; a tenant owner or admin must approve
from Settings (`ImpersonationConsent`), and either side can end an active window
early. Every use calls the `use` RPC, which re-checks state and expiry before
incrementing `use_count` and writing an audit row. Grants expire on their own
between 5 and 240 minutes; nothing renews silently.

## Revenue and churn

`src/lib/revenue.ts` is pure and isomorphic so the maths is unit-tested without a
database (`src/lib/revenue.test.ts`, 11 cases).

- MRR sums stored plan prices in integer minor units; `past_due` still counts
  because the contract is live, while `trial`, `paused` and `cancelled` do not.
- Foreign-currency contracts are **reported, never converted** — conversion is a
  payments-side operation off a stored `fx_rate` snapshot, and mixing it into a
  reporting total would fabricate revenue. `mixedCurrencies` surfaces them.
- Logo churn is cancellations in a trailing window over the population alive at
  the window start; tenants that signed up inside the window are excluded from
  the denominator, and the rate is `null` rather than a divide-by-zero.

## Design guidelines

- Money is `tabular-nums`, always with an explicit currency code.
- Suspension is destructive and confirmed through `ConfirmDialog` with the freeze
  consequence spelled out in the description; states use pill + label, never
  colour alone.
- The tenant-facing consent card states plainly that access cannot start without
  approval, shows scope and expiry, and keeps "End access now" available for the
  whole window.
- Empty states explain the absence ("No suspension has ever been recorded")
  rather than showing a blank table.
