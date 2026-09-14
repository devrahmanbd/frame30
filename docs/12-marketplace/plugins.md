# Marketplace — Plugins: manifest, worker sidecar runtime, consent, purge

Status: Planning (depth spec for `docs/12-marketplace`) · Slice S7+ (skeleton S1; runtime deferred until storefront scaffold + edge)
Reference: `/plan.md` §3.8, `docs/13-export-sdk/oauth.md` (referenced; **not yet approved**), `docs/13-export-sdk/README.md` (webhook/export event contract), `docs/09-analytics/event-pipeline.md` (**server beacon** event glossary), `docs/05-marketing` (opt-ins, consent, marketing channels), `docs/04-builder/app-blocks.md` (widget sandbox + validity), `docs/02-merchant/staff-approval.md` + `staff-rbac.md` (consent, staff), `docs/16-product-pricing` (entitlement gate), AGENTS.md (GDPR, consent, PII-minimal, 90d retention)
Design baseline: `docs/00-meta/design-system.md`

---

## 1. Purpose

A plugin is a merchant-installable extension to their storefront/checkout/admin surface that runs **inside a sandboxed worker sidecar**, declares a contract (manifest + scopes + events), and can act only where the reader/writer contract allows. This file owns the plugin-specific surface: build/install lifecycle, the sandbox runtime (worker sidecar only — one declared runtime), the enumerated event surface, the reader/writer contract, and the uninstall → data purge state machine.

Nothing here re-runs OAuth. The plugin auth/zap-walk design is owned by `docs/13-export-sdk/oauth.md`, which is a **not-yet-approved named dependency**; this file only documents how plugins *consume* scopes, not how scopes are minted.

## 2. Scope

**In scope**

- Plugin manifest (`plugin.yaml`): id, semver, engines, scopes[], subscribe[], runtime, sandbox claims, `requires_version_pin`.
- Plugin lifecycle machine (install → active → uninstall → purge), including reinstall/deactivate.
- Worker sidecar runtime contract (the plugin runs as a worker, not in the storefront/checkout process).
- Enumerated, curated event surface (server-beacon only; nothing from the storefront client).
- Reader/writer contract: read/write rules per resource; plugin can read PII only through scoped pass-through, never store it.
- Purge-on-uninstall (data erasure per GDPR/consent), including effect queue drain.

**Out of scope**

- OAuth server internals → `docs/13-export-sdk/oauth.md`.
- Core analytics pipeline internals → `docs/09-analytics/event-pipeline.md`.
- Theme mechanics → `themes.md`; market/listing mechanics → `marketplace.md`.
- Widget blade validity → `docs/04-builder/app-blocks.md` (referenced for sandbox rules).

## 3. Design decision (approved): one runtime — worker sidecar host

Plugins run in exactly ONE sandboxed runtime: a **worker sidecar** (a sandboxed process/VM per tenant, launched by the platform runtime). No plugins ever execute in the storefront renderer, checkout, or builder JS contexts. This keeps:

- **Blast radius bounded** — a plugin PII-leak/crash cannot touch the storefront/checkout render loop, per `app-blocks.md` "widget JS runs sandboxed; validity is server-side".
- **Deterministic scope** — worker can attach a persistent identity (its plugin id) to its outbound calls; reader/writer contract checks identity at the resource gate.
- **Upgrade-safe** — worker delivers a new plugin version without a storefront redeploy (semver; breaking changes re-run review).

Only active (installed, not suspended) plugins' workers are started; `changed` PII/revoke → worker suspended (see §8 suspend).

## 4. Data model (supabase jsonb; names here are for bindings)

```
plugins.manifests (
  id uuid PK,
  listing_id uuid REFERENCES marketplace.listings(id),   -- review pin
  plugin_id text NOT NULL UNIQUE,     -- e.g. `dhl-shipping` (English key)
  name text NOT NULL, bin_name text,
  semver text NOT NULL,
  scopes text[] NOT NULL,             -- bind to docs/13-export-sdk/oauth.md scope names; not minted here
  subscribes jsonb NULL,              -- [event] entries (only from §6 glossary)
  runtime text NOT NULL DEFAULT 'worker-sidecar',     -- locked: only this runtime
  sandbox_claims jsonb NULL,          -- CPU/mem/burst names (TBD §11)
  requires resign bool NOT NULL DEFAULT false,        -- version pin moving = re-review
  payload_checksum text NOT NULL,     -- sha256 of the tarball, immutability anchor
  blocked_reason text,                -- set when a manifest is refused (see §10)
  created_at timestamptz, updated_at timestamptz
)

plugins.installs (
  id uuid PK,
  merchant_id uuid NOT NULL,                        -- RLS owner (installing tenant)
  listing_id uuid NOT NULL,
  manifest_id text NOT NULL,
  state install_state NOT NULL DEFAULT 'installing', -- installing|active|suspended|uninstalling|purged
  scopes_granted jsonb NOT NULL,                    -- actual granted scope set (subset of manifest scopes)
  consent_ref uuid,                                  -- GDPR consent record (see §8)
  version_pin text NOT NULL,
  installed_by uuid REFERENCES staff_members(id),
  created_at timestamptz, updated_at timestamptz
)
```

RLS: `merchant_id` on `plugins.installs`; `plugins.manifests` readable cross-tenant only through the public marketplace path (`marketplace.listings` `status='listed'`). Unknown OAuth scope names are marked **invalid until docs/13-export-sdk/oauth.md lands** (`platform eng` dependency).
`purge` rows and `install_bodies` are part of purge machine (§9).

## 5. Plugin lifecycle (quoted, canonical)

```
        install             uninstall/purge
listing: draft → in_review (managed in marketplace.md) → listed
            │
            ▼
merchant:  installing → active ⇄ suspended → uninstalling → purge
```

- **listed** (from marketplace.md) → merchant clicks install → `installing` (version pin, scope list shown and consented).
- **active** — worker started, event subscription effect, grant-scoped writes.
- **suspended** — (a) revoke of a scope (OAuth revocation), (b) resource-limit breach, (c) review regressions on a version that was approved. Suspended = worker stopped, no event effect, no writes; data is retained pending explicit reapproval/uninstall.
- **uninstalling → purge** — the GDPR-aware erasure path. `purge` is the terminating state when the effect queue (#8, queue of deletions) is drained and the purge report is written.

`purge` differs from `uninstall`: `uninstall` stops the plugin but leaves data if `reconsent` is kept; `purge` erases scoped data (see §9 machine).

## 6. Sandbox contract (worker sidecar)

- Worker runs with operating-system-level sandbox (per-tenant container / minimal fd / net policy). Network calls allowed only to: scoped vendor endpoints stated in the manifest, and the platform pipeline ingress — never to arbitrary egress.
- Sandbox is resource-bounded: the worker-sidecar resource envelope (max memory / CPU / egress bytes per interval) is enforced by the runtime host; the *numbers* are named TBDs (§11). An envelope breach = `suspend`, not a crash.
- The worker sidecar share NO globals with the storefront/checkout/render; no bridge JS. Exactly `docs/04-builder/app-blocks.md` boundary ("widget validity is server-side; a widget can never trigger callbacks on failed validity").
- `is_breaking` manifest upgrades relay through `marketplace.md` consent (§6) — scope add/revoke or runtime change is a `breaking` upgrade; auto-pinning on the old version until review re-approves.

## 7. Reader / writer contract

The manifest must declare, in a machine-checkable `scopes`/`permissions` block bound to OAuth names:

- **read** — which resources the worker may read: storefront events (from §8), consented customer PII (pseudonymized), tenant settings — *scoped pass-through*, the platform never hands the worker a key that accesses another tenant.
- **write** — which invoices/orders customers a plugin may mutate via API, e.g. patch cart-line metadata, create order notes. Writes go through the **reader/writer gate** (identity-aware, ordered, quota-aware), never through raw SQL to a tenant's tables.
- **No data store outside the platform.** A plugin may write to its own sidecar workspace on the platform (tenant-scoped) but never ship data to an external datastore except the declared vendor endpoints (§6). A `purge` covers the workspace too.

Reader/writer gate uses the permission rules in the manner of `staff-rbac.md` "resource_group = action", expressed in `scopes`.

## 8. Event surface — enumerated, server-beacon only

Plugins subscribe to a **closed, short** event list. Event glossary = server-beacon events from `docs/09-analytics/event-pipeline.md` (that's the canonical source; nothing here re-mints) + explicitly-marketed marketing hooks from `docs/05-marketing`. Represented as a literal enum (single source of truth in code; table mirrors it):

- `storefront.pin_published` (theme install)
- `checkout.order_placed` / `product_events`
- `cart.cart_updated`
- `marketing.consent_updated` (marketing preference changed)
- `payment.paid` (settled) — hook-visible only for scopes that grant `payment:read:aggregate;` these do not expose raw MFS data parse
- `analytics.etl.batch_completed` — the aggregate-ready signal, never raw events
- `plugin.install_hook` (after its own install)

Events delivered once (idempotency id per delivery) — at-least-once to the worker queue, dedupe on the worker. No client-side subscriptions. If event doesn't list in §8, an install that requests it fails at review ("subscribe list longer than the published line" error — mirrors `docs/15-e2e` "unsubscribe" error family).

## 9. Purge machine (quoted, canonical)

```
installed → uninstalling → enqueue_purge → purge_running → purge_complete (data erased) / purge_failed
                                                                    │
                                                                    └─→ retry (idempotent)
```

- Enqueue: on uninstall-purge, platform `purgeQueue` (idempotent keys) is filled with every row referencing the plugin's tenant key in the event pipeline, worker workspace, linked tables. 
- Purge runs for **non-idempotent** and **idempotent** deletions. Idempotency keys in the queue guarantee at-least-once PURGE executed once.
- PII-minimal: the platform logs purge command (key-only, no values); purge fail → `purge_failed` with the queue item retained (retry), not silent.
- Reconsent the customer data model (docs/09 retention rules) governs that purged values and any copied ref are removed across the platform within RPO (owner `docs/09`; RPO named TBD §11).

## 9. Consent + review

- Install: `consent` GDPR-grade for scopes (S4 auth build); each scope shown chang; revoke-by-scope honored later (`revoke` → `suspended`).
- Marketing channel plugin actions ride `docs/05-marketing` channel consent opt-outs. Worker sidecar can't "email on your behalf" unless the merchant consent and marketing opt-out honored (AGENTS.md "Consent" hard rule).
- Review: manifest goes through `marketplace.md` reviewer persona (four-eyes, marketplace-operator) with `app-blocks.md`-style validity checks server-side. Scope set → `is_plugin` upgrade re-approval is `breaking`.
- `review` covers behavior (static-bind) and the sandbox claims. The writer gate is never active during `in_review`.

## 10. Guardrails (hard, enforce)

1. **Tenant + RLS** — every plugin query carries `merchant_id`; plugin's worker-side data tenant-scoped on both read and write.
2. **No client-trusted decisions** — consent, scope grant, event unsub, entitlement, suspend are server-side; no client flag is ever trusted (AGENTS.md).
3. **Sandbox & blast radius** — worker-sidecar only; not render loop; no direct DB writes; no network egress except declared vendor scopes.
4. **PII-minimal by design** — worker reads PII pseudonymously; events are pseudonymized; plugin work sends nothing unless defined scope; `purge` erases scoped data.
5. **Consent honoring** — plugin can act on consent/channel only with the same GDPR modem honors: storefront vs impact, marketing opt-out honored, opt-out respected by data retention.
6. **A11y** — plugin surfaces (e.g. install consent from a plugin drawer) are AA; AAA for auth/consent/refund.
7. **Failures** — worker crash → auto-resume with idempotent effect; queue → `purge_failed` retry; suspend on budget breach never collects a party's tenant.
8. **No cross-customer side-storage** — vendor scope only; purge covers the vendor link on request.

## 11. Testing gates → loops (acceptance contracts, trust)

- `e2e_plugin_install_consent`, `api_plugin_scope_revoke`: unit — grant scopes → revoke → state = `suspended`; install fails outside plan gate → `plan_limit_exceeded`.
- `e2e_plugin_purge`: install worker (mock worker) → subscribe → fire event → purge → assert worker datastore + queue drained, PID gone, retention rule satisfied.
- `api_oauth_scope_consent_sync`: consent-data consent row updated on revoke / data-grant.
- All are **acceptance contracts**, harness deferred: no `plugin` runtime, no OAuth, no worker exists today; go under `docs/15-e2e` (stated logic) and stay DG's-green only after S1 scaffold. **Never claim green/harness.**

## 12. Design guidelines — plugin install, scope list, purge

- Keyword: F*trust.* Plugins get a calm, internal-surface presentation — not a marketplace-ad deck.
- Key surfaces: install consent (scope list), plugin state chip (active/suspended), purge confirmation (erasure summary), scope-consent behavior.
- Palette: teal for active; amber for suspended/in-review; red for purge/uninstalled; never color-only; scopes in monospace badges.
- Typography: plugin name (BN+EN); scope names in tabular/monospace; `version_pin` tabular.
- Density: list-like admin rhythm; a scope table is the place consent happens, not a pop-up dialog wall.
- Motion: state chip animate 200ms; purge progress 300ms; reduced-motion → opacity-only.
- A11y: install/purge AAA; scope badge = icon+text (never color-only); `aria-live` on purge/progress.
- Anti-slop: the scope list is a contract summary — "reads: order totals (aggregate) · writes: order notes · runtime: sandboxed worker" — not a wall of legalese.

## 13. Residual gaps / named TBD owners

| Item | Owner |
| --- | --- |
| **Worker sandbox envelope caps (max CPU / egress / burst)** | **TBD** (`docs/02-infra` / runtime) — cited `docs/12-marketplace/plugins.md`... do not invent |
| **Purge completion SLA / RPO** | **TBD** (`docs/09-analytics`) |
| **OAuth scope names + validation** | **TBD** (`docs/13-export-sdk/oauth.md`, **not yet approved**); `plugins.md` consumes, does not mint |
| **Plugin plan limit** | **NE** (product lead, in `docs/16-product-pricing`) |
| Store-carry PII policy for plugin tokens | **TBD** (`docs/14-operations`) |
| E-commerce registry entry (plugin registry in `docs/12-marketplace/README.md`) | platform eng |

All server-side data values above are TBDs or cited docs; nothing invented.