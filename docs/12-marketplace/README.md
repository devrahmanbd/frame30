# 12 — Marketplace

Status: Planning · Slice (post-S7) · Reference: `/plan.md` §3.14 (market), `04-builder` (widgets)
Design: `design-system.md` (marketplace surfaces use official theme kit)
Depth specs: [`marketplace.md`](marketplace.md) (registry, listing lifecycle `draft → active → paused → archived`, reviewer persona, install contract) · [`plugins.md`](plugins.md) (manifest, worker sidecar runtime, consent, purge machine) · [`themes.md`](themes.md) (source vault, preview sandbox, install → publish → rollback machine)

---

## 1. Purpose

Two-sided marketplace. **Side A — extensions marketplace (pre-existing):
themes (paid/free) and widgets/extensions (limit: widget registry validated,
pricing rules). Merchants install via Builder; creators publish via sandbox +
review. Commission on paid items per global policy. Framer is vendor of
record: it collects payouts; creators get `payouts` (reuse 06 wallet ledger),
70/30 split; tax/VAT handled; dispute funnel to support.

**Side B — merchant listings (new).** A tenant merchant can list catalog items
that appear in other tenants' storefront carts for cross-tenant order -- the
buyer's cart stays server-priced, the seller fulfils via the marketplace route,
and settlement happens through the 06 ledger. Selling is gated: only
**Enterprise plan + KYC-verified** merchants may market (per `16-product-pricing`
read-only; KYC lives under `02-merchant` §KYC).

Everything here is multitenant: every row carries the owning tenant's
`merchant_id` (RLS), and marketplace tables additionally carry a `listing_id`
keyed to the SELLING tenant so one tenant's storefront can never read another's
private data.

## 2. Pages & features

- **Marketplace grid**: themes + widgets + product listings; preview (live
  `theme.yml`), badges (formally baked), versioned, compatibility check.
- **Theme install flow**: version-aware; breaking-change breakdown; server-side
  price/trial validation; rollback to last-good on failure.
- **Widget install flow**: built-in (By Framer) + community; review queue w/ AST
  validation + banned-list.
- **Creator dashboard + revenue card**: publishes via sandbox + review; payout
  ledger view with 70/30 split.
- **Listing manager (Side B)**: create/pause/archive a cross-tenant listing;
  `listing_id` ownership; shown public catalog only.
- **Cross-tenant cart surfaces**: seller item rendered in customer's cart with
  server-derived price; route note; fulfillment status.
- **Extensions / Apps**: future SSH-in apps (planned, not built).

## 3. Data model + RLS

All tables are tenant-owned; `listing_id` keys marketplace rows to the selling
tenant:

| Table                         | Role                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `themes` / `theme_versions`   | installed themes + pinned version                                    |
| `widgets` / `widget_versions` | registered widgets + versions                                        |
| `listings`                    | merchant cross-tenant listing (`merchant_id` = seller, `listing_id`) |
| `reviews`                     | creator reviews                                                      |
| `sales`                       | sale events tied to ledger                                           |
| `payments_split(ledger)`      | 70/30 split / settlement ledger                                      |
| `review_queue`                | AST-gated publish queue                                              |
| `bans`                        | banned creator/item list                                             |

RLS example (tenant-isolated; `current_merchant()` resolves from the auth
mapping in `01-identity`):

```sql
-- sellers can touch only their own listings
create policy "seller_owns_listing" on marketplace.listings
  for all
  using (merchant_id = current_merchant());

-- storefronts read only active, public listings of others
create policy "buyer_read_public_listings" on marketplace.listings
  for select
  using (status = 'active');
```

## 4. API

- Public reads (catalog, listing browse, price) are shipped through the same
  Go gateway as the storefront; no grants to PostgREST on any marketplace row
  (`checkout.md §3` rule extends here).
- All writes are server-owned: install / publish / list / pause / settle. Each
  install uses an idempotent `install_id` (per-store); every listing mutation is
  a versioned write.
- Price + VAT settlement come from the pricing service (`16-*`), never from the
  client; a listing's price is integer BDT currency at server source.

## 5. State transitions (owned: listing machine)

**Master (this phase).** One listing machine on `listings`:

```
draft → active → paused → archived
```

where `paused` is chosen by the selling tenant and `archived` is terminal.
Every mutation bumps a version; rollback is safe (prior version pinned).

**Order-level (cross-ref).** The purchase lifecycle referenced by 07, 06, 08:

```
new → routed → capture:captured → shipped/delivered → settled
```

`order_routed` → the seller fulfils its arm; settlement lands on the 06 ledger.

Preserved pre-existing pipeline (creator assets): `draft → review → published →
(version bump) → deprecated → archived`, with `rejected` on review failure;
`deprecated` versions are never auto-installed, and a failed author install
falls back to the merchant last-good version. This phase owns ONLY the listing
machine; the asset pipeline and payout machines are deferred (marketplace
domain).

## 6. Events

Emitted exactly once per transition (PII-minimal payloads; joining 07 §5
contract). Canonical keys:

- `marketplace.listing_created` · `marketplace.listing_paused` ·
  `marketplace.listing_archived`
- `marketplace.order_routed`
- `marketplace.settled`

Pre-existing events preserved and mapped to canonical keys:

| Legacy key                      | Canonical key                             |
| ------------------------------- | ----------------------------------------- |
| `marketplace.theme.published`   | `marketplace.theme_published`             |
| `marketplace.widget.installed`  | `marketplace.widget_installed`            |
| `marketplace.widget.deprecated` | `marketplace.widget_deprecated`           |
| `marketplace.sale.settled`      | `marketplace.settled` (same ledger event) |

## 7. Vendors & swap-out

Marketplace remains vendor-neutral where the platform can sink:

- Framer is vendor of record for payouts; creators receive from the 06 wallet
  ledger, 70/30 split, VAT handled. The payout rails are adapters, swap-out
  story tracked (00-meta guardrail 6) — no doc assumes a permanent provider.
- Built-in review = same GCP assembly as the storefront sandbox; the check
  engine runs on the builder runtime (04), so widget execution is vendor-agnostic.
- Marketplace-down failure: installs unavailable, existing storefronts keep
  running (storefront never depends on marketplace at request time).

## 8. Consent & privacy

- Install telemetry captures only feature flags + version, never page content.
- Marketing about marketplace items lives under the 05 consent flags; no
  unsolicited flow after a trial expires; opt-out is honored everywhere.
- Creator dashboards expose aggregated stats only — "creator proof" cards use
  public merchant data only, never counts that could identify shipments.
- Listing/route data carries `merchant_id` + `listing_id`; no other tenant reads
  a seller's wallet, payout, or KYC data (all KYC fields live under
  `02-merchant` §KYC and gated on Enterprise).
- Payout records are PII-minimal; retention follows 09/10, no inventing a
  window here.

## 9. Accessibility & performance

- AA minimum on all marketplace surfaces; the install-confirmation and
  cross-tenant checkout confirmation are AA+ (checkout/refund remain AAA per
  AGENTS.md).
- Never color-only status: paid/free/deprecated always paired with icon+text.
- Preview images have alt + keyboard path; install button contrast ≥ 4.5:1.
- LCP < 2.5 s on mid-range Bengal 3G-class network (design-system §8); preview
  lazily loads your themes only; CDN width-resized images.
- Marketplace browsing never blocks; a Marketplace outage cannot block a
  running storefront.

## 10. Design guidelines — marketplace browse, theme preview, creator submit, cross-listing

- Intent: discover fast, preview honest, purchase frictionless, install
  visible, cross-sell trustful.
- Key surfaces: marketplace grid; theme asset preview (`?preview` embeds a
  `theme` JSON); install confirmation (breaking-changes list); creator
  dashboard; revenue card.
- Palette: platform teal for the primary action; paid badge in gold (BDT), free
  in mint; deprecated amber badge on versions; never color-only.
- Typography: theme title/summary Bangla + brand voice; tabular BDT figures;
  install CTA weight then moves.
- Density: marketplace cards editorial (large previews); creator tables dense.
- Motion: card hover lift 120ms (`--fq-dur-fast`); install progress ring 200ms (`--fq-dur-base`) with a success check; surface-level token at 120ms (`--fq-dur-fast`); `prefers-reduced-motion` → opacity-only, no layout shift.
- A11y: preview alt + keyboard; install button contrast ≥ 4.5:1; focus
  never color-only; pass-through focus.
- Performance: preview lazy-loads your themes; CDN width-resizing; no blocking
  analytics.
- Anti-slop: distinctive proof — live store-count card (real number from the public API); review block explains
  root with a snippet link; paid vs free is unmistakable (gold vs mint).

## 11. Testing gates → loops

Registered loops (from `15-e2e`, verbatim):

```
store_loop  admin_loop  builder_loop  market_loop
```

- `market_loop`: version-state transitions, install-after-breaking, rollback on
  failed install, 70/30 payout math equals the ledger; failure suites cover
  marketplace-down install + chargeback-idempotent replay.
- `e2e_marketplace_loop`: registered in `docs/15-e2e` §Suites (spec: `marketplace_loop.md`); ops owner tracked via `marketplace.e2e_register` (§13).
- Failure suites for Side B: seller payout fails → settlement stays in escrow
  (held in the 06 ledger, never released); and
  `KYC revoked at settlement → payout blocked until re-KYC` (KYCLE) — both
  covered in `.e2e` failure spec files per `15-e2e`.

## 12. Marketplace-specific coupling list

| Consumer        | Coupling                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `06-payments`   | settle into `payments_split` ledger; escrow on payout failure             |
| `07-commerce`   | order machine references `capture_captured`/`settled`; server-priced cart |
| `08-shipping`   | routed order becomes a fulfil job for the seller                          |
| `02-merchant`   | creator dashboard, install/upgrade admin, KYCLE                           |
| `04-builder`    | widgets execute in sandbox; install triggers robo refresh                 |
| `05-marketing`  | consent-gated marketplace promote, repeat-free                            |
| `09-analytics`  | aggregated seller stats (no PII)                                          |
| `13-sdk/export` | creator dashboards export via shared exporter                             |
| `16-pricing`    | Enterprise + KYC gate on cross-tenant selling                             |

## 13. Residual gaps (named TBDs)

- `marketplace.commission_rate_draft` — commission numbers pending user
  sign-off (owner: Marketplace domain).
- `marketplace.payout_hold_days` — escrow hold window on payout failure
  (owner: Marketplace domain).
- `marketplace.kyc_vendor` — KYC vendor for selling-gate (owner: Ops).
- `marketplace.shipping_assignment` — which `08-shipping` job assigns a routed
  order (owner: Shipping).
- `marketplace.e2e_register` — ops owner for `e2e_marketplace_loop` in `docs/15-e2e` (suite registered; spec `marketplace_loop.md`)
  (owner: Marketplace domain).
- `marketplace.vat_split_rule` — VAT split between seller/platform on
  cross-tenant settlements (owner: Commerce domain).

---

## Audit cross-link

Consistent with `00-meta/audit-verdict.md` (2026-08-08). This doc is a planning
README in the marketplace area. Every referenced value traces to the stated
doc (payout ledger mechanics, capability gates, design-system token values); the 70/30 split remains the draft commission rate pending user sign-off (§13 `marketplace.commission_rate_draft`). Nothing else is invented.

doc gap check: award verdict + arena
