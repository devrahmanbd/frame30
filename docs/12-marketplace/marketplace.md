# Marketplace — registry, listing lifecycle, reviewer persona, install

Status: Planning (depth spec for `docs/12-marketplace`) · Slice S7+ (skeleton S1)
Reference: `/plan.md` §3.8, `docs/04-builder/theme-runtime.md` (TR-1/TR-2), `docs/04-builder/theme-registry.md` (Tenant006), `docs/02-merchant/staff-rbac.md` + `staff-approval.md` (four-eyes, out-of-scope), `docs/16-product-pricing` (entitlement gate), `docs/06-payments` (payout ledger, 70/30), `docs/15-e2e/theme_registry.md` + `README.md` (acceptance contract)
Design baseline: `docs/00-meta/design-system.md`

---

## 1. Purpose

The marketplace is where merchant-made themes and plugins cross tenant boundaries to be sold or shared to other merchants' storefronts. It is the only cross-tenant surface on the platform, so it is built around three hard properties: **every install is a pin to a version**, **review is a separate platform-operator persona, never merchant staff**, and **a marketplace outage never touches a running storefront** (channel-level amnesia).

This file owns the marketplace-wide skeleton: the listing registry, the listing lifecycle, the reviewer persona, per-merchant availability via entitlements, and the install/rollback semantics shared by themes and plugins. Theme-specific install flow is `themes.md`; plugin install/uninstall and the plugin runtime are `plugins.md`.

## 2. Scope

**In scope**

- Listing registry (cross-tenant, `merchant_id`-keyed to the selling tenant).
- Listing lifecycle: `draft → in-review → listed → deprecated/removed` (and `removed` as terminal).
- Marketplace-operator review persona (four-eyes at platform level, separate from `staff-approval.md` which is merchant-staff-only).
- Per-merchant availability: selling and installing gated by entitlements (`docs/16-product-pricing`).
- Shared install contract: version pinning, semver + breaking-change policy, rollback to last good, marketplace-down amnesia.
- Side B (Enterprise + KYC-verified) sale gate per `docs/16-product-pricing`.

**Out of scope**

- Theme source vault, preview store, publish → rollback stack → `themes.md`.
- Plugin manifest, worker sidecar runtime, event subscription surface → `plugins.md`.
- Widget catalog validity (status `verified`/`draft`/`blocked`) → `docs/04-builder/app-blocks.md`.
- OAuth scope design (referenced, not duplicated) → `docs/13-export-sdk/oauth.md` (not yet approved).
- Licensing/compliance inventory → `docs/06-payments/licensing.md` (named TBDs, platform legal).

## 3. Design decision (approved): separate marketplace-operator persona

`docs/02-merchant/staff-approval.md` is explicitly merchant-tenant-scoped — its four-eyes facility covers merchant staff, and platform-side cross-tenant review is **out of scope** there. Marketplace listing review therefore runs on a **separate platform-operator persona** that reuses the same four-eyes invariants (no self-approval, tamper-evident audit, expiry) but is bound to the platform, not to any selling tenant:

- A listing is never approved by a marketplace-operator who authored, holds a stake in, or is affiliated with the listing's selling tenant. Self-approval is a hard server-side error, mirroring `staff-approval.md`.
- Operator review decisions append to the listing's append-only audit chain (`marketplace.listing_reviews`), never mutate history.
- The reviewer persona is a fixed platform role (`platform.marketplace_operator`) created via the RBAC backfill pattern used in `theme-registry.md` — it is not a merchant `staff_members` row and never appears inside any tenant's RLS scope.

## 4. Data model (cross-tenant, Supabase)

```
marketplace.listings (
  id uuid PK,
  seller_merchant_id uuid NOT NULL,          -- selling tenant; drives RLS + payout
  listing_type listing_type NOT NULL,        -- theme | plugin
  package_id uuid NOT NULL,                  -- FK to themes.theme_versions / plugins.plugin_versions
  name text NOT NULL,                        -- English key; Bengali display name in name_bn
  name_bn text,
  slug text NOT NULL UNIQUE,
  description text NOT NULL,
  status listing_status NOT NULL DEFAULT 'draft',  -- draft|in_review|listed|deprecated|removed
  availability availability NOT NULL DEFAULT 'private',  -- private|shared|public
  sale_kind sale_kind NOT NULL DEFAULT 'free',          -- free|paid|entitled
  price_bdt bigint CHECK (price_bdt >= 0),              -- integer BDT only; NULL = not for sale
  version_pin text NOT NULL,                            -- semver pinned at install time
  is_breaking boolean NOT NULL DEFAULT false,           -- requires consent screen at install
  listing_owner uuid REFERENCES staff_members(id),      -- merchant staff who owns the listing
  created_at timestamptz, updated_at timestamptz
)

marketplace.listing_reviews (
  id bigint PK identity,
  listing_id uuid NOT NULL REFERENCES marketplace.listings(id),
  reviewer_uid uuid NOT NULL,                -- platform operator, never seller staff
  verdict verdict NOT NULL,                  -- pending|approved|rejected|expired
  reason text,
  review_round smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)

marketplace.installs (
  id uuid PK,
  merchant_id uuid NOT NULL,                 -- installing tenant (RLS-scoped)
  listing_id uuid NOT NULL REFERENCES marketplace.listings(id),
  package_id uuid NOT NULL,                  -- pinned to the exact reviewed version
  version_pin text NOT NULL,                 -- semver pin (TR-1: installs are pins)
  state install_state NOT NULL DEFAULT 'installing',  -- installing|active|failed|uninstalling|removed
  installed_by uuid REFERENCES staff_members(id),
  created_at timestamptz, updated_at timestamptz
)

marketplace.install_events (
  id bigint PK identity,
  install_id uuid NOT NULL REFERENCES marketplace.installs(id),
  merchant_id uuid NOT NULL,                 -- denormalized for RLS + analytics
  event text NOT NULL,                       -- install.started|install.applied|install.rollback|install.failed|...
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

- `merchant_id` RLS applies to `marketplace.installs` and `marketplace.install_events` (installing tenant). `marketplace.listings` is keyed to the **selling** tenant for the owner path (seller edits own listing) and reads are public-only for `status = 'listed'`. Both directions of tenant scoping per `docs/12-marketplace/README.md`.
- Money is integer BDT only (`price_bdt`); display via `fmtBDT`. Payouts to the selling tenant go through the `docs/06-payments` wallet ledger (idempotent payouts), not through marketplace tables.
- Listing review chain is append-only: an RPC appends, nothing updates a prior `listing_reviews` row.

## 5. Listing lifecycle (quoted, canonical)

```
draft → in-review → listed → deprecated/removed
                ↑          │
                └──────────┘   (edit → resubmit)
```

- `draft` — seller authors the listing (name, description, pinned package version, availability, price or entitlement gate). Private to the selling tenant.
- `in-review` — submitted; four-eyes marketplace-operator review per §3. `pending` verdict records the round.
- `listed` — visible to the marketplace grid and installable. A listed listing is a pin to the reviewed `package_id`; a new package version requires a new review round.
- `deprecated` — still installed but not newly installable; existing installs keep running (channel-level amnesia). Pushed by `listing.deprecated` (e.g. seller delists, or an operator deprecation).
- `removed` — terminal. Install surface gone; existing installs remain on last-good version (see §6 rollback) and are offered uninstall.

Listing lifecycle lives on `marketplace.listings.status` with the audit chain on `listing_reviews`. All transitions are idempotent; a rejected `in-review` returns to `draft` for edit → resubmit (loop arrow above).

## 6. Install contract (shared by themes.md / plugins.md)

- **Installs are pins.** An install always records `(listing_id, package_id, version_pin)`. There is no "install latest" — a storefront upgrade is a deliberate new pin.
- **Breaking changes.** A package bump marked `is_breaking` (per `theme-runtime.md` TR-1 semver policy) shows a consent screen listing what breaks before the pin moves. Breaking changes are decided server-side from the reviewed package manifest, never from a client flag.
- **Rollback to last good.** On a failed install, the storefront reverts to the previously applied pin and emits `install.rollback` — this is the same rollback-to-version-stack behavior `themes.md` defines in full and `docs/15-e2e` asserts ("store change rollback on failed install").
- **Channel-level amnesia.** Marketplace-down (or a failed review infra) never touches a running storefront: reads for install RPCs are unavailable, but the storefront runtime keeps serving the already-pinned theme at the 60s edge cache per `docs/03-storefront`. Matches `docs/15-e2e` market-loop contract: "marketplace-down → installs unavailable while existing storefronts keep running."

## 7. Availability & entitlements

- **Installing** requires the storefront on a plan that permits marketplace (per `docs/16-product-pricing`: marketplace selling is an Enterprise/Side-B capability; install gating uses the same `check_entitlement(tenant_id, feature, qty)` RPC — fail-closed, Postgres constraint backstop). Over-limit/plan-lock = `plan_limit_exceeded`, never silent.
- **Selling** requires the Side B gate: Enterprise plan + KYC-verified per `docs/16-product-pricing` §13 ("live merchant entry (payouts, marketplace selling) requires the KYC gate"). KYC state machine `draft → submitted → under_review → verified | rejected → …` stays owned by `docs/16-product-pricing` §5.
- `availability = private | shared | public`: `private` = link-only, `shared` = invite-only to named tenants, `public` = grid. Availability never changes an installed pin.
- A listing can be `paid` (integer BDT) or `entitled` (unlocked by an entitlement/plan). Fee/split for `paid` listings is the 70/30 vendor-of-record split in `docs/12-marketplace/README.md`; reconciliation runs through the `docs/06-payments` app wallet ledger. Setup/review fees, per-sale caps, and BD-scheme compliance are **named TBDs** (§10).

## 8. Events & telemetry

`listing.created`, `listing.submitted`, `listing.reviewed` (verdict), `listing.listed`, `listing.deprecated`, `listing.removed`, `listing.updated`, `install.started`, `install.applied`, `install.failed`, `install.rollback`, `install.uninstalled`. All install telemetry beacons into `docs/09-analytics` event pipeline as server-side beacons under the **installing** tenant's `merchant_id` (PII-minimal payloads; raw window 90d; `analytics.retention.purge` owner TBD — see §10).

Feature-flag surface: listing review is feature-flagged (`marketplace.review`), install-on-storefront is feature-flagged (`marketplace.install`), gated by `check_entitlement`. No client-trusted flags — the flag is a server-side entitlement read.

## 9. Guardrails

1. **Tenancy & RLS** — every query carries `merchant_id`; installs scoped to installing tenant, listing owner path scoped to selling tenant; public reads only on `status = 'listed'`. No application-layer filtering alone.
2. **No client-trusted decisions** — breaking-change consent, availability, price, and entitlements are all resolved server-side from reviewed manifests and `check_entitlement`, never from a client flag (AGENTS.md hard rule).
3. **Money** — integer BDT only, `fmtBDT` at display, payouts only via the 06 wallet ledger (idempotent keys), never marketplace tables; VAT from `vat_rates` year table if a fee is ever invoiced (fee itself is a named TBD).
4. **Consent & privacy** — install of a `paid`/`breaking` listing requires explicit GDPR-grade consent (one surface, reversible via uninstall); PII-minimal logs; no seller PII in install beacons.
5. **Review integrity** — four-eyes platform-operator persona, no self-approval (hard server-side error), append-only review chain.
6. **A11y** — marketplace grid and install consent screens AA minimum (AAA on install/refund/auth surfaces per AGENTS.md); never color-only state on listing status chips.
7. **Failure & recovery** — marketplace-down = installs unavailable, storefronts keep running; failed install = rollback to last-good pin; review verdicts never re-ordered.

## 10. Testing gates → loops (per `docs/15-e2e` standard)

- `e2e_marketplace_loop` — named here; register in `docs/15-e2e` before claiming the gate (same discipline as `e2e_promo_loop` in `docs/16-product-pricing` §13). Acceptance contract per `docs/15-e2e/README.md` market loop: publish theme → install → run on your domain storefront; store change rollback on failed install; 70/30 math equals the 06 ledger; marketplace-down → installs unavailable while existing storefronts keep running.
- `store_loop` — storefront keeps rendering a pinned theme with marketplace down (amnesia arm) and after a failed install rollback.
- `admin_loop` — Side B sale gate: unverified KYC → listing submit blocked; Enterprise + KYC-verified → listing listed.
- `api_marketplace_review` — unit: self-approval hard error, verdict round increments, rejected → `draft` → resubmit re-enters `in-review`.
- These are **acceptance contracts, not green/harness claims**: per `docs/15-e2e/theme_registry.md`, the Playwright harness is deferred until the S1 app scaffold + storefront renderer exist (no package.json / dev server / Supabase local / edge / renderer yet).

## 11. Design guidelines — marketplace grid, listing form, install consent

- Intent: a calm catalog that feels like a shelf, not a feed — status and install-safety visible in one glance.
- Key surfaces: marketplace grid (`listings.status = 'listed'` only), listing detail, listing submit form (seller), install consent screen (breaking-change/paid breakdown).
- Palette: teal = listed/available; mint = verified/installed; amber = in-review/deprecated; red = rejected/removed; money only in tabular BDT via `fmtBDT`.
- Typography: listing titles Noto Sans Bengali variable, Bangla+English; price/semver in tabular numerals; `version_pin` always shown as text, never color-coded alone.
- Density: grid airy (storefront-like); listing form admin-dense.
- Motion: card hover 150ms lift; install progress 300ms; reduced-motion → opacity-only (AGENTS.md).
- A11y: grid cards are links/buttons with visible focus; status chips carry icon+text (never color alone); install consent is a real confirmation (AAA per AGENTS.md); keyboard-complete grid.
- Anti-slop: install consent renders the exact version diff (old → new pin) like a courier-receipt breakdown, not a generic "agree" wall; `is_breaking` items are a checklist with per-item impact lines.

## 12. Residual gaps / named TBD owners

| Item | Owner |
| --- | --- |
| `marketplace.listing_fee_bdt` — setup/review fee per listing (currently 0 implied) | **NE** (product lead) |
| `marketplace.sale_cap_bdt` — per-sale cap / min threshold for `paid` listings | **NE** (product lead) |
| `marketplace.payout_cadence` — payout schedule for seller earnings (reconciles to 06 wallet) | **NE** (financial ops) |
| BD-scheme compliance for cross-tenant paid listings (rides `licensing.md` named TBDs) | platform legal |
| `e2e_marketplace_loop` registration in `docs/15-e2e` | **NE** (platform eng) |
| `analytics.retention.purge` scheduler (90d raw purge, cited in §8) | **TBD** (`docs/09-analytics`) |
| OAuth scope dependency (`docs/13-export-sdk/oauth.md` — **not yet approved**) | platform eng |

All numbers above that are not a named TBD trace to `docs/16-product-pricing`, `docs/06-payments`, or `docs/15-e2e`; none are invented.
