# Customers — depth spec (S2/S3)

Status: Planning · Slices S2/S3 (core store + accounts) · Reference: `plan.md` §3.1, `docs/02-merchant/README.md`, `docs/03-storefront/accounts.md`
Design baseline: `00-meta/design-system.md`
Scope: merchant-side customer records — list, detail, order history, phone-centric identity, dedupe/merge, GDPR erase/export, guest checkout capture. Storefront self-service customer accounts are a separate arm (`03-storefront/accounts.md`, S3).
Out of scope: storefront login/OTP → `accounts.md`; consent management → `05-marketing`; analytics cohorts → `09-analytics`; marketplace identities → `12-marketplace`.

---

## 1. Purpose

Every order (COD or MFS) arrives with a Bangladesh phone number. Merchants need a durable, deduped customer record per merchant scoped by RLS — showing who ordered what, when, and their consent/opt-out state — without building a general CRM. Records are created idempotently at checkout (upsert by normalized phone) and enriched lazily (name, email, tags) from staff or from storefront account activation.

## 2. Design decisions

- **DD-1 — Phone is the identity key.** Normalized E.164 `+880…`; the same phone in two different rows is a merge signal, not a duplicate intent. Only 11-digit BD numbers; others accepted only for pilot tenants (USD pilot flag).
- **DD-2 — Upsert on order, idempotent.** `upsert_customer_from_order(order_id)` is called by the payment/checkout service; the same order re-delivered (retries) never duplicates rows.
- **DD-3 — No client-trusted fields.** A customer may never set own `total_spent_minor`/`lifetime_value`; those are computed server-side from `orders` (sum of paid amounts in BDT ints). None stored as floats.
- **DD-4 — Erase vs anonymize.** GDPR (-grade, see `00-meta`) erase: RPC `erase_customer(customer_id)` anonymizes PII, keeps order rows for ledger integrity, logs to `audit_log`, idempotent. Export: staff-only, approval-gated (see `staff-approval.md`), PII-minimal fields by default, raw fields require reason.

## 3. Data model & RLS

| Table | Notes |
|---|---|
| `customers` | `merchant_id`, `phone_e164` unique per merchant, `name`, `email`, `tags`, `consents jsonb`, `created_at`, `erased_at` |
| `customer_orders` (view) | joins `orders` + `order_items` for history; doesn't duplicate rows |
| `guest_sessions` | storefront cart→order session linking, destroyed at checkout (per 03 readme data flow) |

RLS: `merchant_id` on every row; anon never reads; staff RPC-reads via `get_customer` / search; `verify_customer_phone` only via OTP service (S3).

## 4. RPC surface

- `get_customer(customer_id)` — staff; returns profile + `orders`, `lifetime_spend_minor` (BDT), `consent_status`.
- `search_customers(merchant_id, q)` — phone substring or name substring; staff.
- `merge_customers(primary_id, duplicate_id)` — remaps all order `customer_id` FK to primary; audit-logged; requires staff role.
- `add_staff_note(customer_id, note)` — no-op for deleted `erased_at` rows.
- `export_customers_csv(request)` — creates a four-eyes approval task.
- `erase_customer(customer_id)` — used by storefront account self-service and staff; honors GDPR/Bangladesh privacy rules.

## 5. Failure / recovery

- Order upserts are retried with an idempotency key (order_id); duplicate phone rows prevented by unique index; if a race proposes two inserts, one wins and the other returns the existing row (ON CONFLICT DO NOTHING then select).
- Merge conflicts (two duplicate staff edits) resolve to primary=latest-updated; audit log records the merge/undone if rolled back.
- Erase is undoable only by staff `restore_customer` within 7 days; after that permanent.

## 6. E2E coverage

- Guest checkout creates customer row on MFS/COD; second order upserts (one row).
- Search by phone returns matching; merge keeps all order rows; lifetime spend computed correct in BDT int.
- Erase → anonymized (PII columns null), orders retained.
- approval-gated CSV export appears in staff-approval queue; cross-tenant isolation test: no customer leakage.

## 7. Open items

- Customer lifetime segments (e.g. "high value") — belongs to `09-analytics`; owner named there.
- Consent event storage keys `consent-events` (S5); this spec only reads status.

---

### Design guidelines — customers

- **Intent**: operational customer record, not a CRM dashboard; find person → see performance/history → take action.
- **Key surfaces**: list w/ search filter; detail w/ history, spend (tabular-nums, BDT), tags, notes, consent flags; merge/erase in overflow menu.
- **Palette emphasis**: teal primary actions, amber = unsafe action (merge), red only for erase (with confirm phrase in Bangla).
- **Typography**: Noto Sans Bengali; phone numbers in tabular-nums, no spaces.
- **Density**: list rows 44px; history table scrollable; sticky header.
- **Motion**: minimal; only panel transitions; reduced-motion → instant.
- **A11y**: AA; focus order; `aria-live` for search results; icon+text buttons.
- **Performance**: search debounced 300ms, server-side limit 50; history lazy-loaded; no client-side pagination of huge lists.
- **Anti-slop check**: no emoji in empty states; empty state uses icon+copy; no invented color.