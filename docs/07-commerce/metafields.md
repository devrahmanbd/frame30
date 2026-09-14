# Metafields & Metaobjects (Depth 3)

**Status:** Approved plan (parent: `docs/07-commerce/README.md`) · Slice S3
**Approvers:** Commerce domain · Platform (schema-registry owner)
**Reviewers:** Catalog (02) · Storefront (03) · Builder (04) · Content (05) · Payments (06) · POS/Shipping (08) · Marketplace (12) · Export/SDK (13) · Analytics (09) · AI Support (10) · Product & Pricing (16)

## References

- Folder: `docs/07-commerce/`
- Sources: `docs/07-commerce/README.md` · `docs/05-marketing/content-cms.md` (depth-3 template)
- Inputs: `docs/16-product-pricing/README.md` (entitlement) · `docs/04-builder/theme-registry.md` (pin rule, publish/purge) · `docs/06-payments/currency.md` (BDT) · `docs/00-meta/design-system.md` (tokens) · `docs/00-meta/audit-verdict.md` (approved gates)
- Dependencies: 04-builder (publish + purge) · 06-payments (idempotency, shared rate-limiter) · 13-export-sdk (HMAC webhooks) · 16-product-pricing (`check_entitlement`) · 09-analytics (event feed → search index)
- Related: 02-merchant · 03-storefront · 05-marketing · 08-pos-shipping · 12-marketplace · 10-ai-support · 14-operations
- Tags: metafields, metaobjects, schema-registry, tenant-data, validation

> [!note] Design decision (approved)
> Metafields/metaobjects are merchant-owned, schema-registered custom fields attached to known objects — never arbitrary untyped JSON blobs. All writes are server-side validated and entitlement-gated; every read is RLS-scoped; storefront exposure is **published-only** through a dedicated anon-RLS view; `money` metafields are display-only integer taka and are never read by pricing, stock, or discount engines.

---

## 1. Purpose

Scope: a schema-registry detail spec for **metafields** (typed scalar/value custom fields) and **metaobjects** (schema-validated record custom fields, e.g. vendor sheets, return policies), plus how they attach across product, page, article, order, POS, and marketplace surfaces.

- In scope: definitions + validation, polymorphic value storage with versioning, entitlement caps, server-side validation, REST + webhooks, admin editor UX, published-only storefront exposure, test gates, named gaps.
- Out of scope: page AST semantics (04), content curation (05), pricing/VAT/promo computation (07 root, inherit 06), order state machine (07 root), payments (06), storage of binary files (files live in Storage + imgproxy per 02; a `file` metafield stores a Storage reference only).
- Money: integer taka (BDT) only; `fmtBDT` for display; never floats; pricing/vat/coupon engines never read metafields (inherit `docs/06-payments/currency.md`).
- Entitlement: all quantities enforced via `check_entitlement(tenant_id, feature, qty)` from 16-product-pricing with a Postgres constraint backstop; over-limit → `plan_limit_exceeded`, never silent truncation.
- Tenancy: every row in the three tables below is `merchant_id`-scoped with RLS; no cross-tenant reads.

---

## 2. Data model

All tables tenant-scoped (`merchant_id uuid not null` + RLS). Definitions are per-tenant; platform-shipped defaults (e.g. `shop.brand`, `product.care_instructions`) are seed rows in the same tables, editable like any merchant definition.

### `meta_definitions` — the macro enum (definition catalog)

| column             | type                                   | note                                                                 |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------- |
| `id`               | uuid pk                                |                                                                      |
| `merchant_id`      | uuid not null                          | RLS scope                                                            |
| `namespace`        | text not null                           | logical bucket, e.g. `shop`, `product`, `order`                     |
| `key`              | text not null                                                   | unique per `(merchant_id, namespace)`                                |
| `name` / `name_bn` | text not null                                                   | admin labels (Bangla-first UI)                                      |
| `kind`             | text not null check (`metaobject_scalar` / `metaobject_record`) | scalar metafield vs metaobject record stub                          |
| `value_type`       | text not null check (see enum)                                   | `string` · `rich_text` · `number` · `integer` · `money` · `boolean` · `datetime` · `date` · `url` · `color` · `reference` · `list_of_references` · `file` · `json`    |
| `definition_schema`| jsonb not null default `{}`             | record field list for `kind = metaobject_record`: `{fields: [{name, field_type, label, label_bn, required, visibility}]}` |
| `visibility`       | text not null default `'admin'`                                   | `admin` (ops only) \| `storefront` (renders when host is published) |
| `pii`              | bool not null default false                                | flags PII fields → approval + consent pipeline (§8)                 |
| `status`           | text not null default `'draft'`          | machine A (see §3)                                                   |
| `version`          | int not null default 1                   | definition version (pin-rule mirror)                                 |
| `created_by`/`updated_by` | uuid not null                                          | staff actor; masked in logs                                          |

`UNIQUE (merchant_id, namespace, key)`; unique `(merchant_id, namespace, key, version)` per definition lineage.

### `meta_definitions_validation`

Validation rules bound to a definition/version. One row per rule.

| column       | type                          | notes |
| ------------ | ----------------------------- | ----- |
| `id`         | uuid PK                       |       |
| `merchant_id`| uuid not null                 | RLS   |
| `definition_id` | uuid not null → `meta_definitions.id` | FK; also carries definition `version` |
| `version`    | int not null                  | rules apply to values written under this definition version |
| `rule_type`  | text not null                 | regex · min · max · min_length · max_length · allowed_values · required · query · url_scheme · datetime_range · file(max_bytes, content_type) |
| `params`     | jsonb not null default `{}`    | rule params (see §5 table)                                      |
| `error_code` | text not null                  | exact error emitted on violation (see §5 / §7)                   |
| `order`      | int not null default 0         | evaluation order; first violation wins                          |

### `meta_field_values`

The polymorphic value store.

| column        | type                       | notes                                                          |
| ------------- | -------------------------- | -------------------------------------------------------------- |
| `id`          | uuid PK                    |                                                                |
| `merchant_id` | uuid not null              | RLS                                                            |
| `owner_type`  | enum not null              | admissible surface (see §4 enum)                              |
| `owner_key`   | uuid not null              | PK of the host object (product `id`, page `id`, order `id`, …) |
| `definition_id` | uuid not null → `meta_definitions` | |
| `definition_version` | int not null        | version at write time (pin rule)                               |
| `value`       | jsonb not null             | scalar for metafields; record `{field: value}` for metaobjects |
| `status`      | text not null default `'draft'`       | value machine `draft \| published \| archived` (see §3)         |
| `version`     | int not null default 1               | per-value version; every write appends to `metafield_audits`  |
| `search`      | jsonb not null default '{}'          | denormalized payload for index tie (see §3.3)                 |
| `indexed_at`  | timestamptz null                     | last successful search-index sync; null = pending backfill    |
| `updated_by`  | uuid not null               | staff/API actor                                              |

`UNIQUE (merchant_id, owner_type, owner_key, definition_id)` — one current value per definition per owner. Composite indexes: `(merchant_id, owner_type, owner_key)`, `(merchant_id, namespace, definition_version)`, `(merchant_id, definition_id, status)`.

### `metafield_audits` (append-only)

Every create/update/archive/delete writes a row: `(merchant_id, value_id, action, old_value jsonb, new_value jsonb, actor uuid, at)` — rollback is always a restore of a recorded prior version, never a re-derivation (mirrors `04-builder/theme-registry.md` `revisions`; no deletion).

### Index ties to search

`metafield_values.search` is the denormalized payload consumed by the storefront/`09-analytics` indexer. Index sync: on every value transition we emit `metafield.upserted`; the indexer consumes it and writes `indexed_at` back. `indexed_at IS NULL` for > TTL enters backfill. (TTL and backfill cadence: TBD — `09` owner.)

---

## 3. State machines (quoted)

### System A — Definition lifecycle

```text
draft → active → deprecated
          ↑         │
          └─────────┘   (re-activate a deprecated definition)
```

- `draft`: only visible in admin; no API writes allowed.
- `active`: writable + readable; breaking changes to an active definition (field add/remove, `value_type` change) create a **new definition version** — existing values keep their `definition_version` (pin rule, mirrors `04-builder/sections-templates.md`). Editors may always only add rules to a new version.
- `deprecated`: definition no longer writable by merchants; existing values remain readable + exportable; new writes blocked with error `meta_definition_deprecated`.
- No hard delete of definitions, from `active` onward; values are never silently dropped on deprecation.

### System B — Metafield value lifecycle

```text
draft → published → archived
   ↑         │
   └─────────┘        (re-publish an archived value)
```

- `draft`: value exists in admin + editor; never rendered storefront (even on a published host).
- `published`: rendered on all surfaces that render it. Transition to `published` is server-side validated (against `definition_version` rules) and **purge-coupled** — the host surface's URLs (and the definition's cache keys) are purged; edge TTL convergence ≤ host surface TTL (mirror 04 `theme-registry` publish+purge, `docs/04-builder/theme-registry.md`).
- `archived`: value is not rendered, kept for audit; can be re-published — a republish is a new value `version`, appended to `metafield_audits`.
- Editing a `published` value is atomic + immediately effective after server-side validation and purge (metafields are data, not long-lived content; staging/rollback belongs to host surfaces page/article revision machines).
- Deletion: only `draft` rows are hard-deletable; `published`/`archived` rows are integer-deletable only via `archive`.

### Operation C — Per-surface composition

Metafield visibility *derives from the host object's own machine*; a metafield renders only when **both** the host object is in a live/published state and the value is `published`:

| host surface | host machine (owned by) | metafield visibility rule |
| ------------ | ----------------------- | ------------------------- |
| product / variant / category | 02-merchant publish machine (`endpoint`): `draft → active → archived` | renders only when product `active` AND value `published` |
| page / theme | 04-builder: `draft → preview → published` (rollback = restore previous `revisions` row) | renders on `?preview`/published pages; drafts + previews render only via preview mode |
| article / media | 05-marketing content-cms publish machine | renders when article published |
| order / line items | 07 root order machine (shared with 06) | **admin-visibility only**; never render; writable until host reaches a terminal state (exact terminal set: TBD — `07` root owner) |
| offers / coupons | 07 promotions (server-side calc) | admin only; never read by discount/VAT math |
| pos_capture / pos order | 08 `pending → confirmed` (offline-first) | admin only; offline writes merge via `metafield_audits` conflict window (TBD — `08` owner) |
| marketplace listing | 12 marketplace listing machine | transforms affect the **listing only** (never the source product) |
| customer / addresses | 03 customer accounts | `pii` definitions require consent approval (see §8); PII never enters analytics/AI |

---

## 4. Admissible attachment surface (attachable-object list)

The `owner_type` enum is closed and whitelisted; any new surface requires the Platform schema-registry review.

1. `product` — `02-merchant` products (variants, SKU, BDT price, images Storage+imgproxy, publish status, categories).
2. `product_variant` — same source; value inherits no price.
3. `category` — 02 catalog categories.
4. `collection` — 03 storefront catalog collection.
5. `page` — 04 `pages(ast jsonb, seo jsonb)`; binds to a page `slug`; studio visibility via `?preview`.
6. `widget` — 04 app-blocks `widgets` per-merchant install list; config metafields rendered under sandbox (TR-5), never mutate widget manifest.
7. `article` — 05 marketing article/media/menu/SEO-AEO.
8. `seo_meta` — per-URL SEO overrides on any object (og/schema) — merge precedence vs content-cms SEO fields: **TBD — `05` owner**, values here never silently overwrite the host field.
9. `cart` — 07 cart/cart_items (gift note, delivery instruction); never affects server pricing/`vat_rates`/coupon math.
10. `order` / `line_item` — 07 orders + 08 pos orders; admin-only, ops notes/tags.
11. `offer` — 07 promotions/coupons; metadata only (e.g. external campaign id), promo engine reads only its own columns.
12. `customer` — 03 customer account; consent-gated (see §8).
13. `listing` — 12 marketplace root-level listing.

Covered surfaces (docs that grant/receive attachment): `02-merchant`, `03-storefront`, `04-builder (+ app-blocks)`, `05-marketing`, `07-commerce`, `08-pos-shipping`, `12-marketplace`. Consumers: `09-analytics` (indexed-in), `10-ai-support` (advisory context with provenance), `13-export-sdk` (webhook events), `16-product-pricing` (entitlement).

---

## 5. Validation & integrity

Server-side only. Client never trusted (AGENTS.md no client-trusted decisions). Every write validates the definition `version`, each active rule in `meta_definitions.validation` (evaluation order: `order`), and returns the **first** violating `error_code`.

| rule_type            | params jsonb                                          | applies to `value_type`              | `error_code` (exact)    |
| -------------------- | ----------------------------------------------------- | ------------------------------------ | ----------------------- |
| `required`           | —                                                     | any                                   | `validation_meta_required` |
| `regex`              | `{pattern, flags}`                                    | `string`, `rich_text`                | `validation_meta_regex` |
| `min` / `max`        | `{value}`                                             | `number`, `integer`, `money`         | `validation_meta_min` / `validation_meta_max` |
| `min_length`/`max_length` | `{value}`                                        | `string`, `rich_text`                | `validation_meta_min_length` / `validation_meta_max_length` |
| `allowed_values`     | `{values: []}`                                        | `string`, `number`                   | `validation_meta_allowed` |
| `url_schemes`        | `{schemes: ["https"]}`                                | `url`                                | `validation_meta_url` |
| `datetime_range`     | `{min, max}`                                          | `datetime`, `date`                   | `validation_meta_datetime` |
| `query`             | `{owner_type, filter}` (reference must resolve to an existing host row) | `reference`, `list_of_references` | `validation_meta_reference` |
| `file`              | `{max_bytes, content_type: []}` (opt → Storage URL; file bytes live in 02 Storage, signed short TTL) | `file`  | `validation_meta_file` |
| `color` — parseable hex only | —                                         | `color`                                | `validation_meta_color` |
| `json` — must parse + respect `definition_schema` | `{max_depth}` TBD | `json` | `validation_meta_json` |

Integrity/anti-pattern hard guardrails: prices, stock, and discount values are never legal `value_type` in sections gating compute; `money` values are integer taka, rendered via `fmtBDT`, and **must not** be read by the pricing/order/coupon/stock engines (server-side `check` + `RI 4` guardrails). Every write is idempotent when an `Idempotency-Key` header is provided (mirror 06-payments Redis-key pattern: `idem:{merchant_id}:{key}`; TTL e.g. 24h — TBD `06` owner). Rate limit shared with 06 (Go rate-limiter).

---

## 6. API surface

Mirrors `13-export-sdk` REST conventions (tenant-scoped PostgREST/RPC views + HMAC webhooks). Storefront reads only via the anon-RLS **published view** `v_metafields_published` (joins owner publish state + value `status = 'published'` — `published`-only, mirroring 03 anon-RLS).

- Definition admin (staff, RBAC action `metafields.manage`):
  - `GET /v1/metafield-definitions?namespace=&visibility=`
  - `POST /v1/metafield-definitions` · `GET /v1/metafield-definitions/{id}` · `PATCH /v1/metafield-definitions/{id}/versions` (new version for breaking change)
- Values:
  - `GET /v1/metafields?owner_type=&owner_key=&namespace=&status=`
  - `POST /v1/metafields` (upsert, `Idempotency-Key` honored) · `GET/PATCH /v1/metafields/{id}` · `DELETE /v1/metafields/{id}` (draft rows only) · `POST /v1/metafields/{id}/publish|archive`
  - Vocabulary: `POST /v1/metaobjects` / record CRUD (owner model = `metaobject_record` definition)
  - Batch: `POST /v1/metafields/batch` (batch cap: TBD — `16` entitlement owner; Go rate-limiter enforces burst)
  - Listing: `GET /v1/metaobjects/{owner_type}/{owner_id}` returns `published` + `admin` per the caller role
- Events/webhooks (delivered by `13-export-sdk`, HMAC-signed, replay `Event-Id` dedupe):
  `metafield_definition.created/updated/deprecated`, `metafield.created/updated/archived`, `metaobject.updated`, `metafield.upserted` (indexer feed).
- Search surface: `metafield.upserted` consumed by `09-analytics`/`search` (storefront highway: which facets allow metafield filters — **TBD — `03`**).

---

## 7. Admin UX — Metafields editor

### Design guidelines — metafields editor

- Intent: a schema-designer feel with docs-style clarity — the merchant defines typed fields once, then bulk edits values. Bangla-first, tabular numerals for numeric/integer/money.
- Key surfaces: definition list (namespace rail), definition editor (field-type picker, live validation preview), value grid (owner rows × metafield columns), record editor for metaobjects, batched value entry.
- Palette (tokens only, never invented): chrome slate 100–900; selection `--bd-teal`; validation errors Rickshaw Red (danger text/icon only, never color-only); `published` badge Mint; unsaved + `draft` Bondhu Amber dot. Dark-mode safe (04 token layers).
- A11y: AA minimum, AAA on this editor (forms with labels, focus ring, live contrast badge, keyboard-first table grid).
- Motion: 120ms row hover, 160ms panel, 0.5s sway freezes reduced-motion → collapse to opacity.
- Error surfacing: exact `error_code` + field-level message; in-context upgrade link on `plan_limit_exceeded`.
- Performance: virtualized grid (only visible rows), batch write worker, purge on publish only.
- Anti-slop: value grid shows a live "published-only" pill when a host is `draft`; definition cards show `{{ namespace.key }}`; no density over 1rem gaps.

### Design decisions (explicit list)

1. Typed, schema-registered definitions only (no free-form JSON stores) — keeps validation/server-integrity + storefront contract.
2. Definitions versioned + pin-rule (breaking change = new definition) — mirrors 04 template pinning, protects published values.
3. Edits atomic + live (data, not content); staging/rollback lives in host surfaces; audit history covers metadata rollback.
4. `money` metafields display-only (integer BDT via `fmtBDT`), never consulted by compute engines.
5. Published-only storefront exposure via anon view `v_metafields_published`; drafts never render.
6. Entitlement via `check_entitlement` (16) with Postgres backstop; quotas never hardcoated in this doc.
7. `owner_type` is a closed, whitelisted enum (schema-registry review to extend).
8. All events are HMAC webhooks with event-id dedupe (echo 06/13).

### Error-code table (editor surfaces)

| error_code                                    | meaning                                | UI                                                                 |
| --------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `plan_limit_exceeded`                          | entitlement at limit                   | blocked + "আপনার প্ল্যানের সীমা শেষ — আপগ্রেড করুন" (upgrade link) |
| `validation_meta_*` (see §5)                    | rule violated                           | field-level message + badge; first error wins                    |
| `meta_definition_deprecated`                   | write on deprecated definition                 | blocked, no value change; keep readable                          |
| `meta_owner_not_found` (`reference` rule)      | owner row missing                       | inline reference resolve                                   |
| `meta_definition_not_active`                   | value write before definition `active`  | blocked with definition status pill                            |
| `owner_publish_state_locked`                   | host object reverted/archived              | read-only grid mode                                            |
| `not_found` / `forbidden`                      | RLS scoping            | not exposed; 404/403 behind RLS (no existence oracle)         |

---

## 8. Guardrails

### 8.1 Data & tenancy
- All tables + audits `merchant_id`-scoped with RLS; `v_metafields_published` is the only pattern that can read values, and it is published-only. Cross-tenant reads impossible.

### 8.2 Integrity & trust
- Prices/stock/discounts never computed from metafields; `money` display-only. `check_entitlement` before writes + Postgres constraint backstop (deprecated view); over-limit → `plan_limit_exceeded`, never silent truncate. Idempotency keys honored for all mutating endpoints.

### 8.3 Consent & PII
- `pii = true` definitions require staff approval (`staff-approval.md` in 02) before `draft → active`; `customer` metafields only with marketing consent (AGENTS.md consent rule); opt-out honored everywhere; excluded from analytics (`09`) and AI context (`10`) unless consented; `metafield_audits` actor rows minimal (no PII).

### 8.4 Publish & visibility
- Anon-RLS view returns only `status='published'` values on published hosts; drafts never leak; the `.team-storefront` cache (60s edge TTL / purge-coupled transitions) preserves last-render on purge blip (fallback = stale render, never blank).

### 8.5 Ops & compliance
- `metafield_audits` append-only, 90-day hot retention then archive (mirror `14-operations`); marketplace listing metafields affect only the listing row; `10-ai-support` reads metafields as advisory context with provenance title only — never as authoritative for order/payment/refund/stock outcomes.

---

## 9. Testing gates (named)

| gate | scope |
| ---- | ----- |
| `api_metafields_crud` | CRUD + RLS isolation between 2 tenants; published vs draft visibility via `v_metafields_published`; delete hard block on non-draft |
| `ci_validation_matrix` | every §5 rule × success+failure; asserts exact `error_code` per row (first-error); invalid reference + file (Storage reference) |
| `e2e_metafield_editor` | editor: define → validate → publish → archive + bulk grid; keyboard nav; color → token; contrast; `plan_limit_exceeded` inline upgrade link |
| `store_loop` (critical) | published metafield renders on storefront; unpublished value missing from `v_published`; purge → stale-while-blip |
| `admin_loop` | RBAC: staff without `metafields.manage` blocked (403/404); `pii` defs need approval to become `active` |
| `market_loop` | listing metafields transform listing only; product unchanged |
| `api_metafields_failure` (f-set) | provider (index) down → backoff + `indexed_at` null; dead-letter event on DLQ; entitlement-at-limit → `plan_limit_exceeded` exact |

---

## 10. Open gaps (`TBD` + owner)

| # | Gap | Owner |
| --- | ---- | ----- |
| 1 | Hardcoded value `N` in `meta_field_values.search` — the exact metafield-query/facet surface that consumes it | 03-storefront |
| 2 | `seo_meta` merge precedence vs host content CMS SEO fields | 05-marketing |
| 3 | Offline-first merge window for POS order metafields (08 parent) | 08-pos-shipping |
| 4 | Terminal-state set for `order`/`line_item` metafield writability | 07-commerce root |
| 5 | `metafield_audits` backfill cadence + hot-vs-cold retention boundary | 09-analytics |
| 6 | Webhook event schema + versioning for `metafield.*` (v1) | 13-export-sdk |
| 7 | Entitlement quotas (`metafields`, `metaobject_record`, `storage`) exact numbers | 16-product-pricing |
| 8 | AI ingestion scope + provenance title for metafields (which namespaces) | 10-ai-support |
| 9 | Marketplace listing metafield schema approval flow (enterprise) | 12-marketplace |