# 03 — Customer accounts (depth spec)

Status: Planning · Slice S3 · Reference: `/plan.md` §3.2 (`customer accounts & segments`), §3.3 (storefront); `README.md` §Pages (`register/login (OTP email/SMS + password), address book, orders, reorder, wishlist`)
Design baseline: `00-meta/design-system.md` (auth = AAA surface per AGENTS.md; storefront pages share theme layers)
Reads: `checkout.md` (DD-9 consent-gated abandonment), `07-commerce/README.md` (abandoned-cart recovery, order state machine), `05-marketing` (consent consumption), `02-merchant/staff-rbac.md` (staff identity pattern, Tenant004/005)

---

## 1. Purpose & scope

Customer identity for the storefront: registration/login, address book, order history, reorder, wishlist, back-in-stock notifications, and the **consent hub** — the single source of truth for marketing and abandoned-cart-recovery consent (AGENTS.md: consent mandatory, opt-out honored everywhere).

**In scope:** customer profile, OTP + password auth flows, address book, wishlist + stock alerts, order history + reorder, consent hub, GDPR export/correction/erasure.

**Out of scope (owned elsewhere):** segments and campaigns → `05-marketing`; AI support → `10-ai-support`; marketplace buyer identity → `12-marketplace` (reuses `customers`); abandoned-cart recovery scheduling → `07-commerce` (`cart_recovery_jobs`, consent-gated per `checkout.md` DD-9); order money states → `06-payments`, `07-commerce`.

---

## 2. Design decisions

### DD-1 — Identity is global, profile is per-merchant

`auth.users` is the single global identity (email/phone + password; Supabase Auth, per locked stack). Each merchant keeps its own `customers` row per `auth_uid`. One human can hold accounts at many stores without re-verifying email/phone; every merchant still gets its own segments, consent, and history. FK `customers.auth_uid → auth.users(id) on delete cascade` mirrors Tenant004 (`staff_members.id`). Merchant identity (staff) and customer identity are the same Auth project but disjoint role surfaces — staff RPCs assert `app.is_owner/is_staff`, customer RPCs assert `auth.uid()` row ownership.

### DD-2 — OTP-first, password optional

Login/registration is OTP-first (email and/or SMS), password optional and additive. Supabase Auth owns OTP delivery, expiry, and per-identity throttling; the storefront edge owns tenant context and PII-minimal logging. Resend cooldown ≥ 60s, max 5 OTP attempts per window then lockout (align with Tenant005 lockout literals). OTP is never logged; only `sent_at`-style metadata with a masked destination leaves the auth service.

### DD-3 — Guest-first shopping, link on demand

Checkout never requires an account (`checkout.md` DD-1 server-side cart works for anonymous sessions). Guest orders are trackable via order token (no login; BD-native "Track without login"). An account is captured optionally at checkout and can be created later. When a guest registers or logs in, their anon-session cart **and** any orders matching verified email+phone within the same merchant are linked to the account:

- Merge rules: cart merge `updated_at`-wins (07 rule, unchanged); order history union (never re-assign orders that already belong to another account); wishlist union on `product_variant_id`; address book union de-duplicated on normalized (name, phone, line1, district, postcode); **consent is never merged or auto-granted** — guest consent rows carry over by session only and remain revocable.
- Every link writes a `customer_merge_log` row (PII-minimal: ids + timestamp + rule, no raw PII).

### DD-4 — Address book is server-validated

`customer_addresses`: type (shipping/billing), label (home/office/other), BD field set (line1, line2, city, district, postcode), phone, `is_default` per type, soft delete (`deleted_at`). Server-side validation only (BD postcode pattern, BD mobile format `01XXXXXXXXX`); client validation is convenience, not trust. Max 20 addresses per customer; default flag flips atomically inside the RPC.

### DD-5 — Wishlist + back-in-stock is consent-gated

`customer_wishlist_items` at variant level (catalog DD-5 variant identity). Back-in-stock notification is a separate explicit opt-in per item — it is a marketing channel and requires consent (`customer_consents`); no consent, no notify. The trigger fires on `inventory` low→available transitions (07/02 inventory events), not on merchant bulk email lists.

### DD-6 — Order history is read-only; reorder is server-hydrated

Customers read their orders through RPCs only (no direct grants — DD-9). Reorder hydrates a fresh cart server-side: validates price, VAT, variants, stock at hydrate time (catalog DD-5), skips unavailable lines with an explicit notice list, and refuses to carry client-supplied totals or promos (`price_changed`-style literals if a line moved). This is a **server decision** per AGENTS.md (no client-trusted discounts).

### DD-7 — Consent hub is the single source of truth

`customer_consents` is the one store that `05-marketing`, `07-commerce` (`cart_recovery_jobs`), and `03` stock alerts read. Each row: customer (or NULL + anon session token for guests), channel (email/sms/push), purpose (marketing / abandoned-cart-recovery / stock-alerts), granted, source, granted_at, withdrawn_at, version. Rules:

- Opt-in is explicit per channel+purpose; pre-checked boxes are prohibited (GDPR-grade).
- Withdrawal takes effect immediately; schedulers re-check consent at send time (fail-safe: missing/unparseable consent row ⇒ treated as withdrawn).
- Guest consent is keyed by the anon session token (resolves `checkout.md` DD-9 dependency) and expires with the cart TTL; linking a guest account carries consent rows by session only, never auto-grants.
- Consent changes emit `customer.consent.changed` (PII-minimal payload).

### DD-8 — GDPR: export, correction, erasure

- Export: `customer_export()` returns the customer's own data (profile, addresses, consents, order headers, wishlist) as a JSON dump; async job for large payloads.
- Correction: profile + address RPCs double as rectification; consent edits are versioned (auditable).
- Erasure: `customer_request_deletion()` starts an async erasure job — anonymizes order PII (keeps money records per 06/07 ledger law), deletes profile/addresses/wishlist/consents, and confirms via email. Erasure is idempotent and retried; analytics rows respect the 90d raw-retention rule (AGENTS.md §6) with deletion applied on the next purge window.
- Logs remain PII-minimal end-to-end; raw document content never enters logs (02 KYC rule, applied here to OTP/identity data).

### DD-9 — RLS & grants contract (no direct table access, ever)

- No `anon` or `authenticated` grants on any `customer_*` table.
- All customer data access is RPC-only; each RPC takes `merchant_id` from a claim/context and enforces `auth.uid()` ownership inside the function body — identical posture to catalog/checkout specs.
- Merchant staff see customers through Tenant004-style staff RPCs (role-checked, `merchant_id`-scoped); `service_role` asserted denied on customer RPCs (SYSTEM.md pattern).
- `customers.auth_uid` FK cascades on user deletion; orphaned anon-session data is cleaned by TTL jobs (07 cart TTL is the source of truth).

### DD-10 — Security posture

- OTP throttle/lockout per DD-2; login rate limits at the edge; optional customer TOTP via Supabase Auth (merchant staff MFA stays mandatory per Tenant005 — customers are optional, never forced).
- Session revocation: Supabase Auth session revocation + local edge cache invalidation for deleted/withdrawn sessions.
- No client-trusted decisions anywhere in this surface (reorder hydration, address validation, consent interpretation are all server-side).
- Wishlist toggle and consent ops are idempotent RPCs (safe retry, `already_*` literals).

### DD-11 — Events exactly-once, PII-minimal

`customer.registered`, `customer.profile.updated`, `customer.address.added|updated|removed`, `customer.wishlist.added|removed`, `customer.stockalert.enabled|disabled`, `customer.consent.changed`, `customer.deletion.requested`, `customer.deletion.completed`, `customer.order.linked`, `customer.reorder.created`. Outbox exactly-once (15-e2e harness standard); payloads carry ids and masked destinations only.

### DD-12 — AAA on auth (AGENTS.md hard rule)

Login, OTP entry, registration, and deletion surfaces are AAA: contrast ≥ 7:1, visible focus rings, `lang="bn"`, inline errors via `aria-describedby`, `aria-live` for OTP resend countdown and async state, never color-only status, ≥ 44px targets. Password managers and autofill respected (proper `autocomplete` semantics).

---

## 3. Data model & access contract

All new tables are tenant-scoped (`merchant_id` in every table, RLS per `SYSTEM.md` §2/§6; one schema batch per surface, `TenantNNN_customer_accounts`, < 500 lines).

| table                     | notes                                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customers`               | `merchant_id`, `auth_uid uuid not null references auth.users(id) on delete cascade`, `email citext null`, `phone citext null`, `name`, `locale`, `created_at`, `updated_at`; unique `(merchant_id, auth_uid)`; at least one of email/phone verified via Auth before row creation |
| `customer_addresses`      | `merchant_id`, `customer_id → customers`, `type`, `label`, `name`, `phone`, `line1`, `line2`, `city`, `district`, `postcode`, `country default 'BD'`, `is_default`, `deleted_at`, timestamps                                                                                     |
| `customer_wishlist_items` | `merchant_id`, `customer_id`, `product_variant_id` (catalog identity), `notify_on_stock boolean default false`, `created_at`; unique `(customer_id, product_variant_id)`                                                                                                         |
| `customer_consents`       | `merchant_id`, `customer_id null`, `session_token null` (anon), `channel`, `purpose`, `granted boolean`, `source`, `granted_at`, `withdrawn_at null`, `version int`; unique `(customer_id, session_token, channel, purpose, version)`                                            |
| `customer_merge_log`      | `merchant_id`, `customer_id`, `event`, `rule`, `payload jsonb` (ids only), `created_at`                                                                                                                                                                                          |

Access contract:

- **Anonymous storefront:** no grants on these tables. Anon touches only `customer_consents` via a dedicated RPC when the cart opt-in is submitted (session-token keyed), and nothing else.
- **Authenticated customer:** RPC-only (`customer_*` function names), each function resolves `merchant_id` from context and filters by `auth.uid()` internally.
- **Staff/admin:** read-only customer view via Tenant004-style staff RPC (role + `merchant_id` checks), no table grants for staff either.
- **`service_role`:** asserted denied on all customer RPCs (SYSTEM.md); server jobs use explicit role-scoped invocations only.

---

## 4. API surface

Authenticated customer RPCs (PostgREST `execute` to `authenticated` only; storefront edge proxies, never direct table reads):

- `customer_get_profile()` → profile + consent summary + masked email/phone
- `customer_update_profile(payload jsonb)` — name/locale; email/phone changes route through Supabase Auth verification first
- `customer_list_addresses()`
- `customer_upsert_address(payload jsonb)` — insert or update by id; flips `is_default` atomically; max 20
- `customer_delete_address(p_id uuid)` — soft delete; default moves to most recent remaining
- `customer_toggle_wishlist(p_variant_id uuid)` → added/removed
- `customer_set_stock_alert(p_variant_id uuid, p_enabled boolean)` — requires consent row; literals on missing consent
- `customer_list_wishlist()` — with stock status (catalog DD-5) and alert flags
- `customer_reorder(p_order_id uuid)` → hydrates cart (server-validated); returns cart session or literals
- `customer_consents_get()`, `customer_consents_set(p_channel text, p_purpose text, p_granted boolean)` — versioned, fail-safe withdrawn
- `customer_export()` → JSON dump (async for large payloads)
- `customer_request_deletion()` → confirmation + async job
- `customer_link_guest_order(p_order_token text)` — links matching verified orders (DD-3 rules)

Error literals (stable strings, shared with `checkout.md` style): `not_found`, `unverified_identity`, `email_taken`, `phone_taken`, `otp_throttled`, `otp_max_attempts`, `address_limit_reached`, `already_in_wishlist`, `not_in_wishlist`, `consent_missing`, `consent_invalid_channel`, `variant_unavailable`, `order_not_found`, `order_already_linked`, `deletion_pending`.

---

## 5. Failure/recovery

- **OTP provider down (email/SMS):** fallback to the alternate channel; queued retry with backoff; degraded banner; guest checkout and tracking remain fully functional (accounts are never a hard dependency of buying — BD resilience rule).
- **Supabase Auth outage:** storefront stays read-only for account surfaces; guest cart/checkout unaffected (07/checkout don't depend on auth); re-auth on recovery, no data loss (all state in DB).
- **Erasure job failure:** idempotent retry + alert (15-e2e outbox standard); partially erased state re-runs cleanly; money records per 06/07 are never deleted, only anonymized.
- **Consent-store lag/missing rows:** treated as withdrawn (fail-safe); schedulers re-check at send time (DD-7).
- **Merge interrupted mid-flight:** `customer_merge_log` makes the link replayable; rerun is idempotent (unions on unique keys).

---

## 6. E2E coverage (`accounts_loop`)

Feeds `docs/15-e2e`; mirrors admin_loop/store_loop rigor (retries=2, trace on fail, temp org per test, Redis flush, mock outbox). Gate: store_loop remains critical; accounts_loop is required at slice close (S3).

1. Register via email OTP → profile row created with verified email; duplicate email → `email_taken`.
2. Register via SMS OTP → phone verified; password added later (additive).
3. OTP resend cooldown enforced (60s) → `otp_throttled`; 5-failed-attempt lockout → `otp_max_attempts` and unlock after window.
4. Guest cart + order → register → both linked to account; cart `updated_at`-wins merge; no consent auto-granted.
5. Address CRUD: add (validation: bad postcode/phone rejected server-side), default flip, soft delete → default moves.
6. Wishlist toggle + stock alert: consent missing → `consent_missing`; consent granted → alert set; low→available inventory event triggers exactly one notification (mock outbox assert).
7. Reorder: valid lines hydrate new cart with current prices; discontinued/unavailable variant skipped with notice; client-sent totals ignored.
8. Consent hub: grant email-marketing; withdraw → immediate; campaign send re-checks and skips (fail-safe missing row = withdrawn); guest session consent expires with cart TTL.
9. GDPR export returns own data only (cross-tenant isolation assert); erasure request → job completes → profile/addresses/wishlist/consents gone, order rows anonymized, money records intact.
10. RLS negative tests: anon/authenticated direct `SELECT` on `customer_*` tables fails; staff RPC without role fails; service_role RPC invocation denied.

---

## 7. Open items

1. Password reset + customer MFA enablement UX: TOTP enrollment flow for customers (Supabase Auth screens) — confirm copy and recovery codes path.
2. Guest consent TTL binding: explicit expiry value vs cart TTL (07 owns the cart TTL constant — needs a single shared constant).
3. Order-anonymization field list for erasure: confirm with 06/07 which order columns must survive (money/ledger law) vs may be scrubbed (PII).
4. Phone OTP in production: live SMS provider is mock today (06 MFS sandbox rule); OTP SMS provider must be gated like MFS live sign-off.

---

## 8. Design guidelines — account surfaces

- Intent: calm, privacy-first account hub — trust over conversion pressure. OTP-first, guest-first framing ("Track without login").
- Key surfaces: login/OTP entry, register, account hub, address book, wishlist, order history, consent hub, GDPR export/delete.
- Palette: BD teal primary; mint for verified/active (phone/email verified, consent granted); Bondhu Amber for pending (unverified, stock alert off); Rickshaw Red only for destructive (delete account, withdraw-all). Never color-only.
- Typography: Noto Sans Bengali; tabular numerals for order totals; `clamp()` fluid scale; line-height ≥ 1.6.
- Density: storefront-airy on hub pages (24/32/48px sections); forms compact but ≥ 44px targets; bottom-sheet on mobile for address form.
- Motion: 240ms fade+rise page transition; OTP resend countdown ticks via `aria-live`; reduced-motion → opacity-only.
- A11y: AAA on auth/OTP/registration/deletion (DD-12); skip-link, focus-visible rings, inline errors `aria-describedby`, `lang="bn"`.
- Performance: LCP < 2.5s on mid Android; order history virtualized > 50 rows; images (wishlist thumbs) lazy + WebP/AVIF + aspect-ratio (CLS < 0.1); JS ≤ 100KB gz theme budget.
- Anti-slop: distinctive — login screen shows order-token tracking path first (guest-first BD pattern), not a giant "Sign in" wall; consent hub styled like a message-thread (opt-in/out per row like SMS threads); deletion flow states exactly what is erased vs anonymized in plain Bangla; order history reuses the courier-thread timeline from 03 README guidelines.
