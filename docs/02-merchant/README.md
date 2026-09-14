# 02 — Merchant Admin

Status: Planning · Slices S1/S2/S5 · Reference: `/plan.md` §3.1, 7 (orders/shipping)
Design baseline: `00-meta/design-system.md`
Depth specs: `options-and-variants.md` (S2 — per-product option groups, sparse variants, per-variant SKU/price/stock/publish, CSV import/export four-eyes gated, RPC surface) · `customers.md` (S2/S3 — phone-identity customer records, order history, dedupe/merge, erase/export, E2E contract) · `staff-approval.md`, `staff-rbac.md` · [`identity-runtime.md`](identity-runtime.md) (built: auth lockout, session registry, TOTP, step-up gate on refunds)

---

## Purpose

The merchant's day-to-day command surface: onboarding, dashboard, catalog, inventory, orders, shipping, POS, settings. Dense, fast admin with Bangla-first copy.

## Pages & features

- **Onboarding / store setup wizard**: domain pick, theme pick, payment connect, courier connect, tax (VAT) setup, ship address. Steps persisted; resumable.
- **Dashboard**: today's orders, revenue, low stock, pending shipments, payout next-run, fraud flags.
- **Products**: CRUD, variants, SKU, price (BDT), inventory, images (Storage+imgproxy), publish status, categories; bulk import/export CSV.
- **Inventory**: stock per variant, multi-location (shopwarehouse), stock movements, alerts.
- **Orders**: list (filters: status, payment, courier), detail with line items, status timeline, refund, print invoice, cancel.
- **Shipping**: courier connect (eCourier/Paperfly/Pathao/Sundarban), rate quotes, labels, tracking link, delivery events.
- **POS**: offline-capable point-of-sale (see 08), cash drawer, receipts.
- **Settings**: store profile, users/roles (owner/staff/viewer), 2FA/MFA, tax/VAT engine, payout bank/MFS accounts, billing, webhooks. Staff, RBAC (granular permission-matrix roles) and MFA: see `docs/02-merchant/staff-rbac.md`. Review/approval queues (four-eyes publish, refunds, page schedule): see `docs/02-merchant/staff-approval.md`.
- **KYC / enrollment (onboarding step)**: identity-type pick (individual sole-proprietor vs business), document upload (NID/trade license), BIN & VAT details, bank/MFS settlement accounts, consent bits, underwriting result. Gates payouts and marketplace selling. See `docs/02-merchant` §KYC, `docs/16-product-pricing` (plan gating).

## Data model (tenant-scoped)

`products`, `product_variants`, `categories`, `inventory_lots`, `inventory_movements`, `orders`, `order_items`, `order_events`, `refunds`, `courier_shipments`, `users(roles)`, `settings`, `webhooks`, `audit_log`.

## API/RLS

- PostgREST endpoints filtered by `merchant_id` claim (AGENTS.md scoping). All writes via RPC to enforce invariants (e.g., stock movement from orders, not direct mutation).
- Status transitions for order/courier are state machines in 03 and 06.

## KYC / enrollment (money-movement onboarding)

Merchant KYC is a hard gate before any real-money movement (payouts, marketplace
selling; see `docs/16-product-pricing`). Reference: `docs/16` ⇒ KYC module.

- **Identity**: individual vs business; NID / trade license / BIN document upload to Storage (owner-only RLS, TTL, PII-minimal fields only).
- **Settlement accounts**: bank + MFS account capture, micro-deposit/verification flow before payout defaults.
- **Underwriting**: risk score from signup fingerprint + docs (see `docs/11-fraud`); verdict gates activation; `under_review` blocks payouts but allows COD-store operation.
- **Consent**: separate GDPR-grade consent for marketing vs money-movement use (AGENTS.md: consent mandatory).
- **Renewal**: annual re-verification; expired KYC → payouts suspended, store keeps selling with warning.
- Only status fields leave the KYC service; never raw document contents into logs or analytics.

## State machines

**Order**: `pending → confirmed → payment_pending → paid → processing → shipped → delivered` (± `refunded`, `cancelled`, `failed`). Courier events append to `order_events`.

## Events

`order.created`, `order.payment_received`, `order.shipped`, `inventory.low`, `refund.completed`, `payout.scheduled`.

## Failure/recovery

- POS offline queue flushed on reconnect with idempotent IDs (see 08).
- Courier API down → queue events, retry, manual "mark shipped".

---

### Design guidelines — product editor, orders table, inventory, POS, settings

- Intent: each screen is a calm operations cockpit — see, decide, act in one glance; zero flicker.
- Key surfaces: product list/editor (2-pane), orders table (dense), order timeline, inventory table + stock alerts, POS cart screen (offline badge), role editor.
- Palette: BD teal accent only; mint for available/paid; amber for low-stock/COD-pending; red for failed/cancelled/overdue; money always tabular BDT.
- Typography: 0.875rem body in tables; product names Bangla+English dual; tabular numerals.
- Density: admin-dense (44px rows, 36px controls); tables collapse to card-stack on phone w/ sticky first column; primary action docks bottom ⅓; FAB only for create.
- Motion: row hover lift 120ms; timeline entry 200ms; mutation toast 200ms; reduce → opacity-only.
- A11y: inline errors + `aria-describedby`, `aria-live` for async saves, keyboard tray nav, reduced-motion respected, status icon+text+color (not color-alone).
- Performance: virtualize >200-row tables, code-split route, skeleton loaders, defer image decode, debounce search.
- Anti-slop: distinctive — per-variant "On/Off" act on rows without full page reload; order timeline styled like an SMS/courier thread (BD-native); live header stat chips (Today's orders) ride on real-time events.

---

## Strict guardrails

### Data & tenancy

- Every data model row is merchant-scoped via `merchant_id` + RLS; no direct table mutations from admin UI unless through an invariant RPC (stock moves only via orders).
- KYC docs are owner-only RLS, TTL-scoped, PII-minimal fields only; only status fields leave the KYC service (never raw document contents into logs or analytics).

### State transitions

- Order/courier status changes are state machines owned by 03/06 — the admin surface renders them, never mutates them directly.
- KYC verdict gates real-money movement: `under_review` blocks payouts but allows COD-store operation; expired KYC suspends payouts with warning (store keeps selling).

### Vendors

- Courier providers (eCourier/Paperfly/Pathao/Sundarban) are adapters, not hard dependencies; "mark shipped" manual fallback stays.
- Payments/fees rails live in 06/16, not hard-coded here.

### Consent & privacy

- Consent is split GDPR-grade: marketing vs money-movement; both required for their flows, opt-out honored everywhere (incl. payout reminder → no email besides shipping/legal).
- Role & MFA hardening follows `docs/02-merchant/staff-rbac.md`, revocation ≤ 60s across all sessions.

### Accessibility & performance

- Admin-dense, dashboard JS ≤ 180KB gz, virtualized >200-row tables, skeleton loaders; keyboard + screen reader usable (see checkpoints below).
- Status never color-only: icon + text + color triple (mint/amber/red semantics).

### Failure & recovery

- POS offline captures queue & flush on reconnect with idempotent local IDs (see 08); courier API down → queue + retry + manual mark-shipped.

### Testing gates

- admin_loop must pass before release; identity/fine-grained perms (staff, owner/viewer) + MFA always exercised in tests; KYC under-review → COD-only flow verified in E2E.

### Audit verdict — checklist

Follow-up record for `00-meta/audit-verdict.md`; every line below is verifiable in this plan's own sections.

- **Sections audited**: data & tenancy, state transitions, RBAC (staff/owner/viewer + MFA), consent & privacy, accessibility & performance, failure & recovery, testing gates.
- **RLS**: every merchant row tenant-scoped (`merchant_id`); identity reads ride `staff-rbac.md` gates (revocation ≤ 60s across all sessions).
- **Consent**: split GDPR-grade — marketing vs money-movement; both required for their flows, opt-out honored everywhere (incl. payout reminder → no email besides shipping/legal).
- **Status semantics**: never color-only — icon + text + color triple (mint/amber/red) on all status surfaces.
- **Failure & recovery**: POS offline captures queue & flush on reconnect, idempotent local IDs (cross-ref 08); courier API down → queue + retry + manual mark-shipped.
- **Admin surface**: dashboard JS ≤ 180KB gz, virtualized >200-row tables, skeleton loaders; keyboard + screen-reader usable.
- **Testing gates**: `admin_loop` must pass before release; KYC under-review → COD-only verified in E2E; MFA always exercised.
- **Owners**: 02-merchant for RBAC + consent; 08 for POS/courier failure paths; 06 for money movement.
