# Marketplace — Themes: source vault, preview sandbox, install → publish → rollback

Status: Planning (depth spec for `docs/12-marketplace`) · Slice S7+ (publish path S2)
Reference: `/plan.md` §3.8, `docs/04-builder/theme-runtime.md` (TR-1/TR-2: self-contained versioned package), `docs/04-builder/theme-registry.md` (Tenant006: `theme_versions`, `store_themes`, `theme_install`/`theme_switch_default`/`app.theme_save_page`), `docs/04-builder/sections-templates.md` (AST = instance of exactly one template), `12-marketplace/marketplace.md` (registry, listing lifecycle, reviewer persona, entitlements), `docs/16-product-pricing` (resource quotas), `docs/03-storefront` (renderer, 60s edge cache)
Design baseline: `docs/00-meta/design-system.md`

---

## 1. Purpose

This file owns everything a theme needs to cross from a merchant's builder into other merchants' live storefronts: where the reviewed theme source lives, how a buyer previews it safely, and the install → publish → rollback stack that makes "install is a pin" real (TR-1). The theme file structure, semver policy, and token override rules are **not duplicated here** — they are normative in `docs/04-builder/theme-runtime.md` (TR-1/TR-2). This file adds the marketplace mechanics around that contract.

## 2. Scope

**In scope**

- Theme source vault: versioned JSON AST packages (per TR-1) stored at rest, content-addressed, immutable.
- Brand-owned sandbox preview store (Theme Preview / Tenant008-style `preview_shares` pattern): buying merchants preview a theme on a disposable storefront with `preview_only` semantics before install.
- Install → publish → rollback-to-version-stack machine (owned here; the registry/listing part stays in `marketplace.md`).
- Tier resource quotas for theme payload: quoted from `docs/16-product-pricing` (limits snapshot), enforced at install.
- Lockstep update path with the storefront runtime: a storefront exchange coins `un`-confirmed published pin only after the renderer acknowledges.

**Out of scope**

- Layout AST syntax, token set shape, widget JS contract → `theme-runtime.md` TR-1/TR-2 + `app-blocks.md`.
- Template/section slot contract → `04-builder/sections-templates.md`.
- Listing lifecycle, review persona, sales → `12-marketplace/marketplace.md`.
- Entitlement feature gates → `docs/16-product-pricing` (§4 rule engine).

## 3. Design decision (approved): content-addressed, immutable source vault

A theme's reviewed source is **never mutated**. The vault stores each published version as an immutable, content-addressed JSON AST package (`sha256` of the manifest+AST+token set+asset hashes). This gives three guarantees that `theme-registry.md` (Tenant006) already assumes:

- A later install is always a pin to an exact content hash — `theme_install`-style write RPCs in Tenant006 carry the hash, so "install the same version twice" is idempotent.
- The vault is the audit truth for both seller and reviewer: verdicts in `marketplace.listing_reviews` reference the vault `content_hash`, so a review can never drift from what actually installs.
- Storefront rollback is a content lookup, not a re-render: the last good pin is already on disk at `themes.store_themes`.

## 4. Data model (adds to Tenant006, not a replacement)

`theme-registry.md` owns `theme_versions`, `store_themes`, `pages`, `theme_tokens`, `widgets`, `theme_audit`, and the RPC surface (`theme_install`, `theme_switch_default`, `app.theme_save_page`, anon `app.theme_snapshot` published-only). This file adds the marketplace-facing tables that sit between a listing and a storefront:

```
marketplace.theme_vault (
  id uuid PK,
  listing_id uuid NOT NULL REFERENCES marketplace.listings(id),
  content_hash_id text NOT NULL UNIQUE,      -- sha256 over manifest+AST+tokens+asset hashes
  major smallint NOT NULL, semver minor/patch pins derived from theme-runtime (TR-1 semver policy)
  is_breaking boolean NOT NULL DEFAULT false,
  ast_payload jsonb NOT NULL,                -- immutable; never updated
  token_override jsonb,                      -- token set (theme_runtime TR-1; theme owns A only)
  bundle_size_bigint bigint NOT NULL,        -- total payload bytes
  asset_hashes text[] NOT NULL,              -- hashed static assets (TR-1)
  created_at timestamptz NOT NULL DEFAULT now()
)

theme install rollback and publish stack — this is a ring of append-only audit rows, NOT mutable state:
marketplace.theme_installs (
  id uuid PK,
  merchant_id uuid NOT NULL,                  -- installing tenant (RLS)
  theme_version_id uuid NOT NULL REFERENCES source.theme_v(id),
  from_theme uuid,                            -- prior default; NULL = first install
  state install_state NOT NULL DEFAULT 'installing',       -- installing|active|rollback|failed|uninstalled
  installed_by uuid REFERENCES staff_members(id),
  created_at timestamptz, updated_at timestamptz
)

marketplace.theme_publish (
  id uuid PK,
  theme_instance_id uuid NOT NULL REFERENCES marketplace.theme_install(id),
  merchant_id uuid NOT NULL,
  state publish_state NOT NULL DEFAULT 'published',        -- published|rollback|failed
  runtime_acked_at timestamptz,               -- storefront runtime acknowledged pin
  created_at timestamptz NOT NULL DEFAULT now()
)
```

RLS: `merchant_id` on `theme_install`/`theme_publish` (installing tenant). `source.theme_v` is read-only to non-sellers (immutable) and scoped by the listing's `seller_merchant_id`.
`ast_payload`, `token_override`, `bundle_size_bigint`, `asset_hashes` are just names here that a planner can bind to real columns; Tenant006 resource group tokens apply.

## 5. Install → publish → rollback (quoted, canonical) — the theme install stack

```
    install                      publish                    storefront
  ◀────── a review pin ───────────────► ──────► live
```

Canonical state machine:

```
installing → active ──► published (runtime acked)
     │            │
     │            └──► rollback ──► active (prior pin restored)
     └──► failed ←────────┘
```

- **install** — `theme_install` RPC (Tenant006) with the exact reviewed `content_hash_id`. Fail-closed: unavailable while marketplace down, per `marketplace.md` §6 (channel-level amnesia).
- **active** — installed and usable, but not yet live on buyers' domain (pending publication consent / runtime ACK).
- **published** — `app.theme_snapshot` now returns the new pin to the storefront runtime; `runtime_acked_at` records the acknowledgment. This is the moment the runtime renders it (60s edge cache flush per `docs/03-storefront`).
- **rollback** — on failed install or failed publish, the storefront reverts to the previously applied `from_theme` pin and emits `install.rollback`; `theme_publish.state = rollback`. Same mechanics as `marketplace.md` §6; confirmed by `docs/15-e2e` ("store change rollback on failed install").
- **failed** (terminal-ish) — install never applied; storefront untouched.

First install = `install → active → published`; updates are new `theme_v` pins (install is never mutated; TR-1: installs are pins).

## 6. Quotas (must cite `docs/16-product-pricing`; never invent)

- `check_entitlement(tenant_id, feature, qty)` from `docs/16-product-pricing` §4 gates install and publish. Failing over-limit = `plan_limit_exceeded` (no silent). Bounding giant payload bursts via the Go API rate-limiter (same source, `usage_burst_rate` is a named TBD there — do not re-mint).
- The per-plan theme/payload numbers are in `docs/16-product-pricing` (Launch = "1 theme", Business/Custom per plan row; `plan_definitions.limits` jsonb). This file does not:
- `theme_v.bundle_size_bigint` is capped per plan via the same `check_entitlement` path; exact byte caps by plan are a **named TBD** (§9).

Rolling back does not re-validate quotas (a pin already applied is allowed to stay).

## 7. Sandboxed preview store

Buyers preview a listed theme **before** it can touch their domain:

- Preview runs in a brand-owned, isolated instance of the storefront runtime (per `docs/03-storefront` headless renderer), using **sample** catalog data (never a buyer's, never a seller's) — PII-minimal by construction.
- The preview is marked `preview_only` (the literal from `docs/15-e2e/theme_registry.md`); it can never reach `published`. Widget JS runs under the same sandbox/validity contract as `docs/04-builder/app-blocks.md` ("never load on failed validity"; server-side props validation only; `custom_html` entitlement-gated) — no server-side code executor in preview or install.
- Preview sessions ride the `preview_shares` / Tenant006 preview stores from `docs/04-builder/publishing.md` §6 and expire.

## 8. Runtime lockstep

A publish is only acknowledged after the storefront runtime confirms it holds the pin. Two rules keep lockstep without coupling:

- **The runtime is the authority on the applied pin.** `theme_publish.published_acked` timestamp is set only on the runtime's startup/reload ACK. The edge cache never serving a mismatched pin: if the runtime does not ACK within SLO (SLO number owned by `docs/14-operations`, not invented here), the publish rolls back and `install.rollback`/`publish.rollback` are emitted.
- **Storefront-only reads use the anon RPC.** `app.theme_snapshot` (Tenant-sixtus) returns published-only content; an unpublished draft never leaves the vault. This is what makes amnesia safe: with the marketplace down, the runtime keeps serving the last published pin at the 60s cache.

## 9. Guardrails

1. **Immutable source** — never mutate `async_payload`/`token_override` after `content_hash_id` creation; reviews and installs bind to the hash.
2. **Tenant + RLS** — `merchant_id` on install/publish paths; vault read-only for non-sellers; requirement: no tenant reads another tenant's theme_content (cross-tenant only via the public marketplace listing path under `marketplace.md`).
3. **No client-trusted decisions** — breaking change consent, hash, quotas, entitlements, publish ACK all server-side. install pin comes from REVIEWED HASH, not from a client-supplied "latest".
4. **Money/consent** — none of this file touches money (sales stay in `marketplace.md` + 06 ledger); install of a `breaking`/`paid` theme requires the GDPR-grade consent handled by `marketplace.md` §9.
5. **A11y/perf** — preview surfaces AA, AAA on install/publish confirm; theme render respects `--bd-teal` etc. tokens from layout; reduced-motion → opacity-only.
6. **Failure & recovery** — stale-last-bin runtime = cache serves last good at 60s; marketplace down = pin lookups fail, storefront unaffected; failed install/publish = rollback stack restores prior published pin.

## 10. Testing gates → loops (per `docs/15`, acceptance contracts, not green/harness)

- `e2e_marketplace_loop` (named in `12-marketplace/marketplace.md` §10) covers content:
  - publish a theme version → install → run on your domain storefront (`docs/15-e2e` README market loop).
  - store change rollback on failed install ("store change rollback" per market loop).
  - install with marketplace down → unavailable while existing storefront keeps running ("marketplace-down → installs unavailable while existing storefronts keep running").
- `theme_registry` acceptance (Tenant006) — the `theme_not_found`, `theme_not_published`, `theme_snapshot` anon-only/published-only checks in `docs/15-e2e/theme_registry.md` are replayed for the marketplace vault (install-pin = hash of the listed version; `ast_invalid`, `preview_only` apply).
- Harness is deferred exactly as `docs/15-e2e/theme_registry.md` notes: Playwright file set registered only once S1 app scaffold + storefront renderer exist (no package.json/dev server/edge yet).

## 11. Design guidelines — theme install, publish, rollback surfaces

- Intent: the install flow reads like a receipt — exactly what pin you get, what breaks, what you had before.
- Key surfaces: install consent screen (version diff), publish progress, rollback banner.
- Palette: teal = current default; mint = published/live; amber = in-review/deprecated or near-limit; red = failed; money/version numbers tabular.
- Typography: version pins tabular; theme names Bangla+English; breaking-change items in Bengalho summarized lines.
- Density: menu-like install (builder rhythm); no walls of text; the diff list is the centerpiece.
- Motion: install progress 300ms; publish success 200ms; reduced-motion → opacity-only.
- A11y: AAA on publish/rollback confirm; status text + icon, never color alone; diff list keyboard-readable; `aria-live` on publish progress.
- Anti-slop: the rollback screen shows **which version you're returning to** ("back to 1.4.2") like a store receipt, not a generic "revert" button.

## 12. Residual gaps / named TBD owners

| Item | Owner |
| --- | --- |
| `theme.payload_byte_cap_*` per plan | **NE** (product lead, in `docs/16-product-pricing`) |
| Runtime ACK SLO window | **TBD** (`docs/14-operations`) |
| Semver pre-release policy edge (0.x, nightly) | **NE** (platform eng, in `docs/04-builder/theme-runtime.md`) |
| Marketplace review persona QOF (via `marketplace.md`) | platform eng + platform legal (gap seats in `licensing.md`) |
| OAuth scope dependency (`docs/13-export-sdk/oauth.md` — **not yet approved**) | platform eng |

No number above is invented; the SLO, byte caps, burst limit are named TBDs or in the cited docs.