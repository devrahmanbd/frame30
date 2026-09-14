# TODO — Three consoles: `/root`, `/admin`, `/dashboard`

One platform, three audiences, three shells. Nothing is shared except tokens,
primitives and the audit spine.

| Route | Audience | Tenancy | Shell | Auth surface |
| --- | --- | --- | --- | --- |
| `/root` | Framique platform owner + platform staff | cross-tenant | `RootShell` (dense ops console, command bar, no branding) | `platform_admins` + step-up MFA, IP allow-list |
| `/admin` | Platform subscriber (merchant owner + their staff) | single tenant, store-scoped | `AdminShell` (merchant-branded, task-first) | `merchant_members` + `staff_roles.grants` |
| `/dashboard` | The subscriber's **customer** (shopper) | single tenant, self-scoped | `CustomerShell` (storefront-themed, calm, mobile-first) | `customers` ↔ `auth.uid()`, own rows only |

> Archived reference. The **active roadmap is `/TODO.md`** — polishing the page
> builder (Elementor-class authoring UX, widget supportiveness, SEO,
> performance, responsiveness, browser support). Keep this file as the contract
> for console security, shells and tenancy; phases below run only when a
> console gap resurfaces.
>
> Earlier page-builder/theme work: `docs/00-meta/todo-builder-themes.md`
> (phases 1–8 complete).

Legend: `[ ]` open · `[!]` blocking security/UX gate · `[x]` done.
Every phase ends with an **Exit gate** — a test that must exist and pass before
the phase is called done. No phase is done because the UI renders.

---

## 0. Where we actually are

Measured, not assumed.

- **Backend is far ahead of the UI.** 200+ tables already exist: `orders`,
  `fulfilments`, `carrier_shipments`, `courier_labels`, `delivery_events`,
  `pos_sessions/orders/payments/refunds`, `customers`, `customer_addresses`,
  `fraud_cases/rules/assessments/blacklist`, `subscribers`, `campaigns`,
  `campaign_sends`, `storefront_forms`, `form_submissions`, `articles`,
  `storefront_pages`, `staff_roles`, `merchant_members`, `platform_admins`,
  `platform_audit_log`, `staff_audit`, `impersonation_grants`, `step_up_grants`.
  Most work below is **console + policy**, not new domain modelling.
- **`/admin` exists** with ~45 route files and `AdminShell` (188 lines).
 - **`/root` is fully separated (done).** 17 route files now live in a standalone
   tree (`src/routes/root.tsx` + `src/routes/root/*`), outside `_authenticated`,
   with its own session + `platform_admins` gate and its own chrome
   (`RootShell`, `RootConfirmDialog`). **No component is shared with `/admin`
   or `/dashboard`** — that isolation is a hard rule, not a preference: nothing
   under `src/components/root/**` may import from `src/components/admin/**`
   (or vice versa), and `/root` keeps private copies of any primitive it needs.

- **`/dashboard` does not exist.** Customer self-service lives at
  `/store/$slug/account` — one page, store-scoped, no shell, no order history
  depth, no returns, no tracking, no addresses UI.
- **Known privilege bug:** `staff_roles_tenant_write` policy uses
  `is_merchant_member()`, so *any* staff member can rewrite the grants of any
  role — including their own. Must be `is_merchant_admin()`.

---

## 1. Shared foundation — the three-shell contract  `[!]`

Do this first; every later phase depends on it.

### 1.1 Authorisation model (single source of truth)

- [x] `src/lib/authz.ts` — pure, isomorphic, declares:
  - `PERMISSIONS` — flat `group.action` union (catalog, inventory, orders,
    shipping, pos, marketing, themes, analytics, finance, settings, staff,
    audit, customers, fraud, apikeys/webhooks). Superset of the editable
    `PERMISSION_MATRIX`; `grantsToPermissions()` maps `staff_roles.grants`.
  - `ROLE_PRESETS` — `owner`, `admin`, `manager`, `staff`, `support`,
    `fulfilment`, `marketing`, `finance`, `read_only` (owner is a superset;
    `MERCHANT_ROLE_PRESET` bridges the legacy `merchant_role` enum).
  - `PLATFORM_PERMISSIONS` — `/root` only, **namespace-disjoint** from the
    merchant set: `tenant.*`, `plan.*`, `gateway.rotate`, `refund.force`,
    `payouts.approve`, `platform.audit`, `flags.write`, `ops.write`.
  - `DANGEROUS` — step-up MFA + reason + audit row; refused outright while
    impersonating.
- [x] `can(permission, ctx)` — pure, client hides / server refuses. A merchant
  grant can never satisfy a platform permission and a platform admin never
  inherits tenant grants.
- [x] `requirePermission("<literal>")` middleware
  (`src/lib/authz-middleware.ts`, client-safe; actor resolution in
  `src/lib/authz.server.ts` via `loadActor` + `assertPermission`). Applied to
  the `/root` mutations (`platform.functions.ts`) as the first consumer.
- [x] `src/lib/authz.contract.test.ts` — scans every `*.functions.ts` for
  mutating server fns, validates each `requirePermission` literal, and asserts
  all `/root` mutations use platform permissions. Runs as a **ratchet**: a
  frozen legacy list of 225 pre-existing unguarded fns may only shrink; any
  new unguarded mutating server fn fails the suite.
- [ ] Backlog: drain the 225-entry legacy list module by module (orders →
  finance → staff → catalog first).


### 1.2 Route gates

- [x] `/root` is now a **standalone tree** (`src/routes/root.tsx` + `src/routes/root/*`),
  outside `_authenticated`, with its own session gate plus a
  `platformIsAdminFn` (`platform_admins`) check; non-admins get neutral copy
  that never confirms what lives behind the path.
- [!] `/_authenticated/admin`: keep onboarding redirect, add
  `status === 'active'` member check; `invited`/`suspended` → a dedicated
  explainer screen, never a blank shell.
- [ ] `/_authenticated/dashboard`: requires a `customers` row for the resolved
  store; unknown → "finish creating your account", not a 403.
- [ ] Per-route `permission` in route `staticData`; the shell reads it to hide
  nav items and the gate reads it to refuse. One declaration, two consumers.

### 1.3 Three shells (separate components, deliberately)

- [x] `RootShell` (`src/components/root/RootShell.tsx`) — grouped rail, owns all
  its chrome; shares no component with `AdminShell` (`RootConfirmDialog` replaced
  the borrowed admin dialog). Still to add: dark, dense, 12px base, grouped rail
  (Revenue · Tenancy · Money · Risk · Access · Ops), global `⌘K` that searches
  tenants/orders/users across tenants, persistent "acting as" banner during
  impersonation, red environment strip when connected to production.
- [ ] `AdminShell` (refactor) — task-first: pinned favourites, `⌘K`,
  store switcher, live-store link, notification bell, setup checklist,
  Bengali/English toggle, mobile drawer nav, and a **grant-filtered** nav
  (a staff member never sees Finance).
- [ ] `CustomerShell` — inherits the merchant's published theme tokens so the
  dashboard feels like the store, not like an admin panel. Bottom tab bar on
  mobile (Orders · Track · Wishlist · Profile), max 5 destinations.
- [ ] Shared primitives only **across `/admin` and `/dashboard`** — `/root` is
  exempt by design and keeps its own copies: `PageHeader`, `DataTable`, `FilterBar`,
  `EmptyState`, `Drawer`, `ConfirmDialog`, `MoneyCell`, `StatusPill`,
  `Timeline`, `BulkBar`, `SavedViews`. Zero shell-specific forks.
- [ ] All three shells: skip-to-content link, focus ring, `aria-current`,
  route-change focus reset to `<h1>`, `robots: noindex` on every console route.

### 1.4 Cross-cutting UX contract

- [ ] **Every table** ships: server-side pagination, saved views, column
  chooser, sticky header, keyboard row nav, bulk selection with a count-aware
  action bar, CSV export honouring the current filter, and an empty state that
  offers the next action.
- [ ] **Every mutation**: optimistic where safe, toast with **Undo** where
  reversible, typed confirm where not, and idempotency keys on money paths.
- [ ] **Every destructive action**: reason field → `staff_audit` /
  `platform_audit_log` row → visible in the entity's own timeline.
- [ ] Bilingual (`en`/`bn`) on all three consoles, reusing the Phase-2 rules
  (`fq-caps`, `<Bi>`, `--fq-bn-scale`). Console copy coverage gate ≥ 95%.
- [ ] Loading = skeletons with the same geometry as loaded content (no spinners
  on lists). Error = inline retry inside the panel, never a page blowout.

**Exit gate:** `authz.contract.test.ts` + a route-gate test that asserts a
merchant user gets `notFound()` on all 17 `/root/*` routes and a customer user
gets refused on all `/admin/*` routes.

---

## 2. `/admin` — subscriber console

### 2.1 Home dashboard

- [ ] Today strip: revenue, orders, AOV, conversion, sessions — each with
  Δ vs. same weekday last week, currency-correct, timezone = store timezone.
- [ ] "Needs you" queue, ranked: unfulfilled orders → suspicious orders →
  failed payments → low stock → unanswered support → abandoned high-value carts.
  Every row is a one-click action, not a link to a filter.
- [ ] Live feed (realtime): new order, new subscriber, payment failure.
- [ ] First-30-days mode: setup checklist replaces analytics until the store
  has ≥ 10 orders (empty charts teach nothing).

### 2.2 Staff management  `[!]`

- [!] Fix `staff_roles_tenant_write` → `is_merchant_admin()`. Ship a migration.
- [ ] Members table: avatar, role, status (`invited`/`active`/`suspended`),
  MFA state, last login, last IP, created-by.
- [ ] Invite flow: email + role + optional scope (locations, channels),
  expiring token, resend, revoke. Invited user landing page states exactly what
  they will be able to see.
- [ ] Custom roles: a permission matrix editor over `staff_roles.grants`
  grouped by domain, with a live "this role can/cannot" preview and a diff on
  save. Owner role is `is_fixed` and uneditable.
- [ ] Guards: cannot remove the last owner; cannot grant a permission you do
  not hold; cannot edit your own role; role change forces re-auth of that
  member's sessions.
- [ ] Enforce MFA per role (`merchant_members.mfa_status`) — a role flagged
  `mfa_required` blocks console access until enrolled.
- [ ] Session & device list per member with remote revoke (`auth_sessions`).
- [ ] Staff activity view from `staff_audit`: who did what, when, from where,
  filterable by member and by domain.

### 2.3 Order management

- [ ] Orders list: saved views (Unfulfilled, Unpaid, COD to confirm, On hold,
  Risk, Returns, Today), facet filters, bulk fulfil / bulk print / bulk tag.
- [ ] Order detail as a **timeline** (`order_events`) — payment, fraud score,
  fulfilment, courier scans, refunds, notes, emails sent — not a form dump.
- [ ] Edit order: add/remove items, adjust price, re-quote shipping and tax,
  `order_amendments` diff preview before commit, customer-facing notice.
- [ ] Payments: capture, partial capture, void, partial/line-level refund with
  restock choice, refund reason taxonomy, `refund_status_transitions` shown.
- [ ] COD workflow: confirm-by-call, call outcome, auto-cancel on N failures,
  `cod_reconciliations` visibility.
- [ ] Draft orders → invoice link → convert to order.
- [ ] Returns/RMA: request, approve, label, receive, inspect, refund/exchange.
- [ ] Notes, internal tags, print invoice/packing slip (bn + en), resend
  confirmation, timeline export.
- [ ] Guards: state machine enforced server-side
  (`order_status_transitions`); illegal transitions are refused, not hidden.

### 2.4 POS + shipment tracking

- [ ] POS terminal route (`/admin/pos`): offline-tolerant cart, barcode scan,
  variant grid, customer attach, split payment (cash + card + wallet), cash
  drawer open/close with `pos_sessions` reconciliation, X/Z report, receipt
  print + SMS/email, park/resume sale, returns against a receipt.
- [ ] Stock is decremented through the same `stock_holds` path as online —
  no separate inventory truth.
- [ ] Shipments: create from order, pick carrier by live rate
  (`shipment_quotes`), buy label (`courier_labels`), print, manifest, and
  cancel-with-refund.
- [ ] Tracking board: kanban by shipment state fed by `delivery_events` /
  `courier_webhook_events`, with **exception lane** (stuck > SLA, failed
  delivery, RTO) and a one-click "contact courier / notify customer".
- [ ] Per-carrier SLA + success-rate scorecard; suggest the better carrier.
- [ ] Customer-facing tracking page reuses the same event stream (one truth).

### 2.5 Customer management

- [ ] Customers list with segments (`segments`), lifetime value, order count,
  last seen, risk flag, marketing consent, channel.
- [ ] Customer 360: orders, returns, tickets, carts, wishlist, addresses,
  loyalty ledger, consent history, devices/IPs, notes, and a merged timeline.
- [ ] Merge duplicates (email/phone match), with an auditable reversal window.
- [ ] Privacy: export-my-data and delete/anonymise request handling, with a
  legal-hold check against open orders/disputes.  `[!]`
- [ ] Consent is honoured everywhere: an unsubscribed customer cannot be added
  to a campaign — enforced server-side, not by list filtering.

### 2.6 Fake / suspicious order management

- [ ] Risk inbox over `fraud_cases`: score, top reasons, evidence panel
  (device, IP reputation, velocity, address mismatch, prior RTO rate,
  disposable email, courier blacklist), and Approve / Hold / Cancel+refund /
  Blacklist with mandatory reason.
- [ ] Rule builder (`fraud_rules`): conditions → action (score, hold, require
  prepay, block), with a **dry-run against the last 30 days** showing exactly
  which past orders would have been caught before you enable it.  `[!]`
- [ ] COD abuse model for BD reality: repeat-refuser phone/address graph,
  RTO-rate per customer/area, force-prepay threshold.
- [ ] Blacklist/allowlist management with expiry and reviewer.
- [ ] Feedback loop: every manual decision writes back as a training label;
  weekly precision/recall panel so rules are tuned, not guessed.
- [ ] Never auto-cancel silently: an auto-action always produces a reviewable
  case and a customer-safe message.

### 2.7 Newsletter, forms & campaigns

- [ ] Subscribers (`subscribers`): source, consent proof, double opt-in state,
  bounce/complaint state, suppression list, import with consent attestation.
- [ ] Form builder over `storefront_forms`: drag fields (text, email, phone,
  select, file, consent checkbox, hidden UTM), validation rules, spam controls
  (honeypot + rate limit + optional captcha), success action (message /
  redirect / auto-reply), and an embeddable block for the page builder.
- [ ] Submissions inbox (`form_submissions`): read/unread, assign, reply,
  export, retention policy, PII masking for low-grant roles.
- [ ] Campaign composer: audience = segment or saved view, subject/preheader
  A/B, bn/en variants, merge tags with a live preview against a real customer,
  test send, schedule, throttle.
- [ ] Deliverability panel: domain auth status, bounce/complaint rate with
  hard stop when over threshold, unsubscribe one-click header.  `[!]`
- [ ] Automations (v1, three only): welcome, abandoned cart, post-purchase
  review request. Each with entry/exit rules and a run log.

### 2.8 Blog + pages CMS

- [ ] Post editor: block-based, autosave every 3s with a visible
  saved-state, revision history + restore, scheduled publish, canonical URL,
  slug edit with automatic `url_redirects` entry on change.  `[!]`
- [ ] Bilingual pairing: a post has `en`/`bn` variants with a translation
  status chip and hreflang emitted automatically.
- [ ] SEO panel per post/page: title, description, OG image, JSON-LD type,
  reading time, and the same lint used by the storefront (single h1,
  singleton JSON-LD) shown inline as you type.
- [ ] Media library (`media_assets`): upload, alt text required before
  publish, focal point, auto AVIF/WebP variants, usage list ("used on 3 pages"),
  safe delete.
- [ ] Pages management (`storefront_pages`): tree with drag-reorder, page-type
  templates from the builder, visibility (public/hidden/password), and a
  publish diff.
- [ ] Editorial workflow: draft → in review → scheduled → published, with
  `approval_requests` for roles lacking `content.publish`.
- [ ] Preview links: signed, expiring, shareable without login.

**Exit gate per section:** a Playwright flow per section (invite staff → login
as staff → verify hidden + refused; place order → fulfil → track → refund;
build form → submit → see submission; write post → schedule → verify canonical
+ redirect). Plus an RLS test proving tenant B never reads tenant A's rows.

---

## 3. `/dashboard` — the subscriber's customer console

Design principle: this is the **post-purchase product**. Most support tickets
exist because this page is bad.

- [ ] Route family `/_authenticated/dashboard/*` resolving the store from the
  session's customer record (or host/domain), themed with that merchant's
  published tokens.
- [ ] Home: active orders with live delivery step, next action ("confirm your
  COD order"), and loyalty/points balance.
- [ ] Orders: list + detail with the same event timeline the merchant sees,
  minus internal notes and risk data.  `[!]` (field-level allow-list, not
  client-side hiding.)
- [ ] Track: map/step tracker fed by `delivery_events`, ETA, courier contact,
  "report a problem" that opens a support ticket pre-filled.
- [ ] Returns: eligibility computed from policy window, reason picker, photo
  upload, label download, and refund status with expected date.
- [ ] Invoices/receipts: download PDF (bn + en), for orders only.
- [ ] Addresses, phone verification, saved payment methods (tokens only,
  never PAN), subscriptions/renewals, wishlist, reviews I can still write.
- [ ] Profile & privacy: language, notification preferences per channel,
  marketing consent toggle wired to `customer_consents`, download my data,
  delete my account (with open-order guard).
- [ ] Auth UX: passwordless/OTP by phone for BD, session list with revoke,
  clear "you're signed in as" on shared devices.
- [ ] Mobile-first: 5-item bottom tab bar, offline-safe order view, sub-100KB
  route JS, all interactive targets ≥ 44px.

**Exit gate:** an RLS + server-fn test proving customer A cannot read customer
B's order by ID, that internal notes/risk fields never appear in any
`/dashboard` payload, and a Lighthouse mobile run ≥ 90 on Orders + Track.

---

## 4. `/root` — platform owner console (isolated by design)

- [x] Standalone route tree outside `_authenticated`, own session +
  `platform_admins` gate, neutral refusal copy that never confirms the path.
- [x] Zero shared components: `RootShell` + `RootConfirmDialog` live only in
  `src/components/root/**`. Duplication here is intentional — `/root` must never
  regress because a merchant-console primitive changed.
- [ ] Test: fail the build if any file under `src/components/root/**` or
  `src/routes/root/**` imports from `components/admin`, `components/dashboard`,
  or a merchant-scoped shell/hook (`src/lib/root-isolation.test.ts`).
- [ ] Finish `RootShell` depth: grouped rail + cross-tenant `⌘K`.

- [ ] Overview: MRR/ARR, net revenue retention, trials → paid, churn,
  active stores, GMV, failed payments, platform error rate, queue depth.
- [ ] Tenancy: tenant list with plan, GMV, health score, risk flags; tenant
  detail = usage vs. `tenant_limits`, overrides, suspension with reason and
  a customer-visible notice, purge requests with a cooling-off window.
- [ ] Impersonation  `[!]`: request → reason → **merchant consent or
  break-glass with dual approval** → time-boxed `impersonation_grants` →
  persistent banner in `AdminShell` → every action tagged with the real actor
  in `platform_audit_log` → auto-expiry. Read-only by default; write requires
  a second grant.
- [ ] Plans & billing: plan builder (`plan_definitions`), feature flags per
  plan, coupons/trials, dunning board, invoice reruns, revenue by plan.
- [ ] Money: gateway accounts, settlement files, variance alerts, payout
  approvals with dual control and a hold reason, FX rates.
- [ ] Platform risk: cross-tenant fraud signals, ad-fraud defence, abusive
  tenant detection (chargeback rate, RTO rate, complaint rate).
- [ ] Access: platform admins, roles, IP allow-list, mandatory hardware/TOTP
  MFA, step-up grants, and a session kill switch.  `[!]`
- [ ] Ops: incidents + status page composer, backup drill results, retention
  runs, job queue depth with retry/DLQ, kill switches (custom code, plugins),
  feature flags with tenant targeting.
- [ ] Audit: one immutable searchable stream over `platform_audit_log` +
  `staff_audit`, filterable by actor/tenant/action, exportable, and
  append-only at the database level (no UPDATE/DELETE grant).  `[!]`

**Exit gate:** test that every `/root` mutation writes a `platform_audit_log`
row containing actor, tenant, action, reason and IP; and that an
impersonated session cannot perform any `DANGEROUS` action.

---

## 5. Security hardening (runs alongside, not after)

- [!] RLS matrix test extended to all three personas × every table touched by
  the consoles: merchant-of-other-tenant, staff-without-grant, customer,
  anonymous. Deny is the default assertion.
- [!] Append-only audit: revoke UPDATE/DELETE on audit tables from
  `authenticated`; writes only via security-definer functions.
- [!] Step-up MFA (`step_up_grants`) required for every `DANGEROUS`
  permission, max age 15 minutes, re-prompted per action class.
- [ ] Rate limits per identity + IP on auth, OTP, form submit, export and
  admin mutation endpoints (`rate_limit_counters`).
- [ ] PII minimisation: server fns return field allow-lists per role; masked
  phone/email for support-tier roles; unmasking is itself an audited action.
- [ ] Export controls: any export > 1000 rows requires reason + audit + async
  job with a signed, expiring download URL.
- [ ] Idempotency on every money mutation (`api_idempotency_keys`).
- [ ] CSP unchanged from the storefront hardening; consoles add
  `frame-ancestors 'none'` and `noindex` everywhere.
- [ ] Security memory + scanner run after each phase; findings triaged, not
  silenced.

---

## 6. Sequencing

1. **Phase A (blocking):** §1.1 authz model, §1.2 route gates, `staff_roles`
   policy fix. `/root` separation + gate is **done**; keep it that way with the
   isolation test in §4. Nothing else ships before this.
2. **Phase B:** §1.3 shells + §1.4 table/mutation primitives.
3. **Phase C:** `/admin` order management → POS/shipments → customers.
4. **Phase D:** fraud inbox + rule dry-run.
5. **Phase E:** `/dashboard` end-to-end (biggest support-cost reduction).
6. **Phase F:** newsletter/forms + blog/pages CMS.
7. **Phase G:** `/root` console depth + impersonation + audit.
8. **Phase H:** §5 hardening sweep, a11y + perf gates on all three consoles,
   bn coverage ≥ 95%, docs in `docs/02-merchant`, `docs/17-owner-console`, and
   a new `docs/18-customer-dashboard`.
