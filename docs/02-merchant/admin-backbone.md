# Merchant admin backbone (BUILD 2.1)

As-built notes for the store-setup checklist, alert centre, activity log and
least-privilege role editor.

## Setup checklist

`public.merchant_setup_state(merchant_id)` computes eight steps from live data
rather than from a stored wizard cursor, so the checklist is always truthful and
resumable after a crash, a remix or a hand edit in SQL:

| Step | Satisfied when |
| --- | --- |
| profile | `merchant_settings.support_phone` set |
| payments | COD or MFS enabled |
| shipping | pickup address + city set |
| courier | at least one enabled, non-deleted carrier |
| product | at least one active product |
| theme | active theme with a published version |
| vat | `merchants.vat_registration_no` set |
| kyc | verification submitted or verified |

`merchant_save_setup` is the only writer; it requires `settings:update`, patches
only known keys, and returns the recomputed state. The checklist is cached for
30s per merchant (`cache.server`, key `setup:<merchant_id>`) with
stale-while-revalidate, and can be dismissed permanently.

## Alert centre

`public.notifications` is merchant scoped, readable by members through RLS and
never insertable from the Data API — only `notify_merchant()` (service role,
security definer) writes rows. Open alerts collapse on
`(merchant_id, dedupe_key) WHERE read_at IS NULL AND archived_at IS NULL`, so a
variant that stays low on stock produces one alert, not one per stock write.

Sources:

- triggers — new order, low stock, dunning stage increase, verification outcome
- sweep — `notifications_sweep()` scans low stock, past-due invoices, trials
  ending inside three days and approvals pending over 24h

Per-store mute switches live in `merchant_settings.notify_prefs`, keyed by the
first segment of the alert kind (`new_order`, `low_stock`, `billing`,
`approvals`, `kyc`); `notify_merchant` honours them before inserting.

The sweep runs from `POST /api/public/cron/notifications` behind
`BILLING_CRON_SECRET` with a constant-time compare, closed (404) when the secret
is unset. It is rate limited (`notifications.sweep`, 12/h), span traced and
emits `framique_notifications_total{bucket}`.

## Activity log

`public.activity_log` is append-only: a `BEFORE UPDATE OR DELETE` trigger raises
`activity_log.append_only`, so history cannot be rewritten even by a compromised
authenticated session. A single generic `log_activity()` trigger is attached to
products, variants, categories, collections, coupons, storefront pages,
carriers, themes, store settings, staff roles, members and brands. It stores
only the changed keys as `{field: {before, after}}` and drops noisy or sensitive
columns (timestamps, search vectors, tokens, hashes, configs, customer contact
fields). Reads require `audit:read` through `staff_has`, so a viewer without
audit rights sees nothing.

The UI (`/admin/activity`) is keyset paginated on `id`, filterable by resource
and action, and renders before → after pairs with a second redaction pass on the
field name.

## Role editor — least privilege

`staff_normalize_grants(grants, is_owner)` is the single gate, enforced in SQL so
the rule holds for every caller, not just the UI:

- unknown group/action pairs are rejected
- `staff:manage_roles` and `staff:manage_grants` can never be delegated
- `finance:*` and `settings:update` are owner-granted only
- any write action implies the matching `read` in the same group
- an empty grant list falls back to `catalog:read` + `orders:read`

`staff_delete_role` detaches assigned members before deleting and writes a
`role.deleted` audit row carrying the previous grants. The editor mirrors these
rules visually: forbidden and owner-only checkboxes are disabled with a reason,
implied reads render checked and locked.

## Design guidelines

- Alert severity uses the existing tokens only: info → `info-soft`, warning →
  `warning-soft` (Bondhu Amber), critical → `danger-soft` (Rickshaw Red). Never
  colour-only: every alert carries an icon and a text label.
- The bell exposes unread count in its accessible name; the panel is a labelled
  dialog, closes on Escape and on outside click, and is polled every 60s rather
  than pushed, to keep the admin cheap on flaky mobile networks.
- Checklist progress is a real `role="progressbar"` with min/now/max; completed
  steps are struck through *and* carry a check icon.
- Money and counts use tabular figures; Bengali strings come from the shared
  dictionary, never inline.

## Gates

- `.e2e/specs/admin_loop.spec.ts` — sweep auth/method guards, anonymous gating of
  `/admin`, `/admin/activity`, `/admin/staff`, and Data API deny for both new
  tables.
- `src/lib/rls-matrix.test.ts` — `notifications` and `activity_log` added to the
  anonymous deny lists (read and write).
