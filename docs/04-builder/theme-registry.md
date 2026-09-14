# 04 — Builder: Theme Registry (S1)

Status: Planning · Slice: S1 · Gate: approved ("go")
Owners: builder/runtime · storefront · marketplace(consumer)
References: `04-builder/README.md` (data model), `theme-runtime.md` (TR-1…TR-12, E2E contract),
`12-marketplace/README.md` (catalog/pins), `00-meta/design-system.md` §2–§3 (semantic tokens),
`02-merchant/staff-rbac.md` §2–§11, `AGENTS.md` §2–§4
Implementation note: this spec is the canonical Tenant006 definition. Docs-only —
no `package.json`, no app shell, no edge service yet, so nothing here deploys past the database,
and no `.e2e/*.spec.ts` artifact is written until the storefront harness exists (contract-first, P4).
The purge decision resolves `theme-runtime.md` §8 open item 3.

---

## 1. Purpose

Repository + write-model for merchant theme state: which packaged version is installed, which theme
serves the store as default, the merchant's own page AST + token edits on top of a pin, and the
revision trail that makes publish/rollback atomic. The **runtime** (TR-3) only reads; every mutation
goes through RPCs gated by the `themes` resource group.

## 2. Scope

- Schema for: `theme_versions` (global package catalog), `store_themes` (merchant install/pin),
  `pages` (merchant page state, one row per slug), `theme_tokens` (merchant token overrides),
  `widgets` (merchant-installed widgets), `revisions` (publish snapshots), `theme_audit`.
- Grants: new `themes` resource group (`read · edit · install · publish · rollback`) with role
  backfill from existing staff grants; `pages` edits ride the same `edit` action.
- Anon storefront surface: `app.theme_snapshot` (published-state read only; anon 404 otherwise).
- Authoring surface: `theme_install`, `theme_switch_default`, `app.theme_save_page`,
  `app.theme_save_tokens`, `app.theme_publish`, `app.theme_rollback`.
- Builtin fallback theme seed (TR-3) so the runtime always has something `theme_not_found`-free to
  render by default.
- Purge interface decision (§6) replacing open item 3.

### Naming disambiguation

`04-builder/README.md`'s two-line data model is the same model as here; this reg is the **state**,
`theme-runtime.md` is the **behavior**. `theme_versions` are the marketplace's immutable package
artifacts (owned by creators, `12-marketplace`); `store_themes` rows are merchant-side _installs_;
`revisions` are merchant-side _publish snapshots_ (AST + tokens). Extract -install: a merchant
installs a `theme_version` → a `store_themes` row → the runtime serves `pages` rows edited by this
merchant, seeded from the package's AST until the merchant edits. Widgets: the global registry
(lives in `12`) vs this `widgets` install-list per tenant.

### Out of scope

Marketplace explorer/checkout flows (`12`), the builder editor SPA and widget sandbox (S7), the
storefront edge service (S1) + CDN, custom merchant fonts (runtime open item 5), SDK `code` hook
(open item 6), analytics/consent pipeline, and any `.e2e` implementation (P4 — `docs/15-e2e`).

## 3. Schema (Tenant006)

All tables in `public`, merchant-scoped rows keyed by `merchant_id`; RLS on every merchant row;
`service_role` bypass. Money-free; no floats.

### `theme_versions` — global package catalog (write: service/S7 only)

| column                    | type                                                       | note                                                        |
| ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| id                        | uuid pk                                                    |                                                             |
| theme_key                 | text                                                       | creator slug, e.g. `acme.sunnydays`                         |
| version                   | text                                                       | semver                                                      |
| requires_framique_runtime | text                                                       | semver range, `'^1'` today                                  |
| manifest                  | jsonb                                                      | normalized `theme.yaml`                                     |
| ast                       | jsonb                                                      | page-type → AST map (package defaults)                      |
| tokens                    | jsonb                                                      | package `theme_tokens.json` (semantic + component defaults) |
| assets                    | jsonb                                                      | `path → {"sha256"}` SRI map                                 |
| widget_deps               | jsonb                                                      | `widget_key → version`                                      |
| status                    | enum(`draft`,`review`,`published`,`deprecated`,`archived`) |                                                             |
| is_builtin                | bool                                                       | fallback + starter kits                                     |
| publisher_id              | uuid                                                       | nullable until S7 resolves staff identity                   |
| published_at / created_at | timestamptz                                                |                                                             |

unique `(theme_key, version)`. RLS: `select` where `status='published' or is_builtin` for anon +
authenticated; no write policies (service/`12` layer only).

### `store_themes` — merchant installs & serving pin

| column       | type                           |
| ------------ | ------------------------------ |
| id           | uuid pk                        |
| merchant_id  | uuid fk tenants (cascade)      |
| version_id   | uuid fk theme_versions         |
| version      | text                           | snapshot of the packaged version (denormalized for stable display)    |
| is_default   | boolean not null default false | serving store theme (at most one per merchant — partial unique index) |
| installed_at | timestamptz                    |
| sort_order   | int                            | unpinned fallback order                                               |

unique `(merchant_id, version_id)`; partial unique `(merchant_id) where is_default`.

### `pages` — per merch-state (not the raw table; that's `04-builder` AST slots)

One row per slug (trimmed lowercase); NOTE — this table holds _draft_ state; the _published_
snapshot lives in `revisions`.

| column       | type                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| merchant_id  | uuid pk part                                                                                                   |
| slug         | text pk part — one of `home, collection, product, cart, checkout, account, order, tracking, search, not_found` |
| ast          | jsonb not null default `{}`                                                                                    |
| title        | text not null default ''                                                                                       |
| seo          | jsonb not null default `{}` (meta/og/schema)                                                                   |
| published_at | timestamptz null                                                                                               | null → unpublished → anon 404 per TR-8 |
| updated_at   | timestamptz                                                                                                    |                                        |

### `theme_tokens` — per merchant

| column        | type        | note                         |
| ------------- | ----------- | ---------------------------- |
| merchant_id   | uuid pk     |                              |
| semantic      | jsonb       | semantic-layer overrides     |
| component     | jsonb       | `--bd-*` component tweaks    |
| dark_semantic | jsonb       | dark-mode semantic overrides |
| updated_at    | timestamptz |                              |

`semantic` keys ⊆ design-system semantic layer; `component` keys may add `--bd-*` component-layer
tweaks; `--fq-*` primitive keys are _never_ accepted (TR-6).

### `widgets` — merchant install list

| column      | type                           | note                       |
| ----------- | ------------------------------ | -------------------------- |
| merchant_id | uuid pk part                   |                            |
| widget_key  | text pk part                   | global registry key        |
| version     | text                           | pinned version             |
| manifest    | jsonb                          | normalized widget manifest |
| status      | enum(`installed`,`deprecated`) |                            |

### `revisions` — publish snapshots for rollback

| column           | type                   | note                            |
| ---------------- | ---------------------- | ------------------------------- |
| merchant_id      | uuid pk part           |                                 |
| id               | uuid pk                |                                 |
| revision_no      | int not null           | max+1 per merchant              |
| theme_version_id | uuid fk theme_versions | what was published              |
| page_state       | jsonb not null         | full `{pages, tokens}` snapshot |
| published_at     | timestamptz            |                                 |
| created_by       | uuid null              | staff actor                     |
| created_at       | timestamptz            |                                 |

unique `(merchant_id, revision_no)`; append-only.

### `theme_audit` — append-only

| column      | type               | note                   |
| ----------- | ------------------ | ---------------------- |
| id          | bigint identity pk |                        |
| merchant_id | uuid               |                        |
| actor_id    | uuid               |                        |
| action      | text               | e.g. `theme.installed` |
| payload     | jsonb              |                        |
| created_at  | timestamptz        |                        |

## 4. Grants (`themes` resource group)

`staff_has` already checks fixed-roles shortcut + resource entries (Tenant004). Add actions:
`read · edit · install · publish · rollback`. Backfill Migration 006 maps existing groups →
themes actions for every present role (idempotent, JSON_PUSH):

```sql
-- in migration: for each role, add the rows to grants
```

| if the role has staff…           | add themes…            |
| -------------------------------- | ---------------------- |
| `read`                           | `read`                 |
| `edit` (or `manage_roles`)       | `edit`                 |
| `invite`                         | `install`              |
| `manage_roles` / `manage_grants` | `publish` + `rollback` |

## 5. RPC surface (all `security definer`, `set search_path = ''`)

Service-side data access is **RPC-only for writes**; RLS plus explicit grant checks make double
gates for every write. Grant: anon executes `theme_snapshot` only; authenticated executes the rest
(RLS still filters by `security definer` wrapping staff check).

### `app.theme_snapshot(p_tenant_id uuid, p_slug text)` → jsonb

Published-only read path for the storefront edge:

1. `store_themes` is_default → missing → `theme_not_found` (json null).
2. `pages(merchant,slug)` where `published_at is not null` → missing → `theme_not_published`.
3. Emit `{runtimeVersion:"^1", theme_key, version_id, page:{ast,title,seo}, tokens, widgets:{key→manifest}}`
   with `theme_tokens` merged onto the package tokens (merchant override wins) and token
   validation re-run (primitive override → `token_override_invalid`, edge must not serve).
4. Returns `null` shapes on failure + literal code in `p_code inout`.

Edge contract: anon + slug unpub → HTTP 404 (TR-8); preview paths skip this RPC.

### `app.theme_install(p_version_id uuid)` → store_themes row

- guard `themes.install`; version must be `published` or `is_builtin` (`theme_not_found` /
  `theme_not_published`); runtime compat: `requires_framique_runtime` must satisfy runtime
  `'1'` (this only, until open item 1 lands → S7).
- Upsert install row; if first install for merchant → auto-default + publish flow hint
  (merchant must publish pages before it serves — `theme_not_published` until `theme_publish`).

### `app.theme_switch_default(p_theme_id uuid)`

- guard `themes.install` (switch is an install action); clears other `is_default` flags; writes
  `theme_audit` `theme.switched`.

### `app.theme_save_page(p_slug text, p_ast jsonb, p_title text default '', p_seo jsonb default '{}')`

- guard `themes.edit`; validate AST tokens (primitive override → `token_override_invalid`) and
  widget refs (unknown → `widget_unknown` but _saved with placeholder marker_ — draft can never be
  published with unknown widgets, TR-5); upsert `pages`;
  `updated_at=now()`; audit `page.saved` (draft only).

### `app.theme_save_tokens(p_semantic jsonb, p_component jsonb, p_dark_semantic jsonb)`

- guard `themes.edit`; validate key sets (see §3), contrast re-check can't run here (needs
  render) — publish-time `budget/contrast` still runtime's job; upsert `theme_tokens`;
  audit `token.saved`.

### `app.theme_publish(p_theme_id uuid)` → revision id

The atomic cut.

1. guard `themes.publish`.
2. Load `store_themes` row + default; every page in `pages` for the merchant must have
   `slug` coverage for the manifest's `pages[]` + the required set per TR-4 — else
   `page_missing`.
3. Validate drafts (AST + tokens + budget placeholders) — fail leaves state untouched.
4. Insert `revisions` snapshot (`revision_no = max+1`, full `page_state`).
5. Flip `pages.published_at` for **every** covered page (single transaction); bump tokens.
6. `theme_audit`: `page.published` (per page) + `theme.updated`; nothing else writes.
7. Return revision id; edge picks up via `theme.updated` event → purge (§6).

No partial flips: the `pages.published_at` set is flipped only after the snapshot insert
commits; a crash between = old revision still serving (TR failure table).

### `app.theme_rollback(p_revision_id uuid)`

- guard `themes.rollback`; revision must belong to this merchant’s chain; restore
  `page_state` into `pages` + `theme_tokens`, `published_at` reset to revision’s
  `published_at`; audit `theme.rolled_back`; edge purge issued by service.

## 6. Purge decision (resolves runtime open item 3)

**Decision: revision-keyed URLs + best-effort CDN purge + Redis pub/sub broadcast + 60s
TTL self-heal** — chosen because push-based invalidation alone cannot be trusted at S1 scale
and pull-only (60s) is too slow for a merchant hitting "Publish".

| mechanism                                         | role                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| URL keyed by `revision_no` (e.g. `/<rev>/<slug>`) | prime guard rails: stale versions can never mix, rollback = different URL |
| Redis pub/sub `theme.purge:<merchant>`            | fast invalidate (edge listens, drops cached entries)                      |
| CDN explicit purge (best effort)                  | belt-and-braces for client caches                                         |
| 60s TTL                                           | worst-case staleness bound; self-heal if purge infra fails                |

Failure semantics: purge failure never blocks publish (publish already returned revision);
`purge_failed` logged + alert; the next synchronizing render (`?rev=`) converges within
60s; `theme_updated`/`page.published` events emit `revision_no` for the edge to
re-key.

Deferred: surrogate keys (CloudFront tags) — adopt if CDN supports later; SDK code hooks
use the same re-key channel.

## 7. Builtin default theme seed

One `is_builtin` package `framique/fallback` v1:

- `status=published`, zero assets, zero widget deps;
- AST: every essential page type present, minimal semantic markup, tokens = **empty**
  (theme-runtime's fallback styling lives in CSS defaults, `theme-runtime.md` design
  guidelines);
- used as `store_themes` row with `is_default=true` on any tenant before their first
  install (Tenant006 seeds it for existing tenants).
- The fallback theme never emits `page.viewed` nor loads widget JS (TR-6).

## 8. Failure/recovery (DB surface)

| case                             | behavior                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| no store default                 | `theme_not_found`; anon 404; builtin fallback still `store_themes`--empty → serves 404 (not served) |
| page unpublished                 | `theme_not_published`; preview paths render draft w/ `token` (TR-11)                                |
| publish interrupted vs 2pc       | snapshot insert + flip in one tx; nothing partial                                                   |
| switch to uninstalled theme      | `store_themes` guard → `theme_not_found`                                                            |
| token primitive override on save | `token_override_invalid`, save refused                                                              |
| rollback to missing revision     | `revision_not_found`                                                                                |

## 9. Hooks to other docs

- `docs/15-e2e/theme_registry.md` — 13 scenarios (8 store_loop + 5 builder_loop) authored per
  the harness contract; this doc is the migration-side acceptance source for the RPC-level
  assertions.
- `docs/12-marketplace/README.md` — pipeline consumes `theme_versions`; merchant pins via
  `store_themes`.
- `04-builder/README` data-model line updated to add `store_themes` terms.

---

## Design guidelines — themes manager (S1 chrome only, editor S7)

- Intent: theme management reads "pick, preview, publish, done" — the storefront preview is the
  product, chrome is sparse. Tokens panel mirrors the token editor density.
- Key surfaces: theme list (install card + version badge + `default` tag), preview iframe (device
  widths), publish bar (draft/published chip + `Publish`), token panel (keys grouped
  semantic / component / dark).
- Palette: neutral chrome + primary for default tag + mint publish success; dirty = amber dot
  (existing editor tokens); never color-only (default badge carries a check glyph).
- Typography: tabular nums on version numbers; Bangla labels `Theme`, `Publish`, `Default`.
- Motion: install card drop-in 200ms; preview crossfade 240ms; reduced-motion → opacity only.
- A11y: focus ring on default radio; publish/revert are real buttons; preview iframe keeps focus
  inside via an iframe focus trap; contrast badge for semantic pairs.
- Performance: install card thumbnails lazy-load; snapshot payload ≤ 64KB; publish flips in one
  round trip.
- Anti-slop: the version badge shows sha short form; no inventing new tokens — UI reads live
  from `theme_tokens` payloads.

---

## Install / update / rollback lifecycle (Phase D — as built)

- **Install forks, never overwrites.** `theme_install_preset` writes both an
  immutable draft version and the editable `theme_drafts` row. When a draft
  already exists the RPC raises `builder.draft_exists`; the studio asks for
  confirmation and only then replays with `_overwrite_draft = true`.
- **Semantic versions.** Provenance lives on `store_themes.source_listing_slug`
  / `source_version` and on every `theme_versions` row
  (`source_registry_key`, `source_registry_version`). The registry version of
  record is the typed preset, so SQL and runtime cannot drift.
- **Update preview.** `previewThemeUpdate` diffs the merchant's live draft
  against the package section-by-section, per template: `added`, `changed`,
  `removed` (merchant-only), plus a token-change flag.
- **Two merge modes.** `adopt` bases on the new package and keeps merchant-only
  sections; `keep_mine` keeps the merchant tree and appends only genuinely new
  sections. Tokens follow the mode. The merge is linted before it is stored and
  lands as a draft, never as a publish.
- **Concurrency.** The preview's draft revision is passed back to
  `theme_update_apply`; a mismatch raises `builder.update_conflict` so a second
  editor's work is never merged away silently.
- **Rollback** reuses the immutable version chain (`rollback_of`) and records
  actor and both version ids in `theme_audit`.
- **Guards.** `builder.install` 10/h and `builder.update` 20/h per merchant;
  spans `builder.install`, `builder.update_preview`, `builder.update`; counters
  `framique_theme_install_total{result}` and `framique_theme_update_total{result}`;
  every mutation writes a `theme_audit` row.

---

## No-code customizability contract

Everything below is editable by a merchant in the studio, with no code and no theme fork.
A theme that requires code to change any of these is not shippable.

| Surface | Control | Where it lives |
| --- | --- | --- |
| Colour | Brand, accent, surface, ink — light **and** designed dark set | `theme_tokens` `semantic.%` / `dark_semantic.%`, edited in `TokenEditor`; contrast is gated at publish (4.5:1 text, 3:1 chrome) |
| Typography | Font pairing from the catalogue, or a merchant-uploaded WOFF2 family | `CustomFontsPanel`; budget ≤ 2 families × ≤ 4 weights, `latin` + `bengali` subsets, licence attestation required before publish |
| Radius | Global radius scale | `component.radius.*` tokens |
| Density | Comfortable / compact / list on every card surface | widget `density` prop |
| Spacing | `padY` / `padX` per section, per breakpoint | universal style props on every widget |
| Section order | Add, remove, reorder, nest, hide per breakpoint | AST v3 `children` + `bp` / `hidden[]`, via the layer tree |
| Media ratio | Square / portrait / landscape / wide per media widget | `ratio` prop on `MediaFrame`-backed widgets |
| Reveal | Motion on/off and reveal style per section | `reveal` prop; always yields to `prefers-reduced-motion` |
| Copy | Every string, in English and বাংলা | bilingual props (`*_bn`); publish blocks below 90% বাংলা coverage |
| SEO copy | Title/description templates per template kind | `seo_templates`, seeded per vertical on install, never overwriting merchant edits |

Two invariants make this contract hold:

1. **No theme-exclusive widgets.** `WidgetMeta` carries no theme field, so any widget authored
   for one vertical can be placed in any theme. Asserted in `definition-of-done.test.ts`.
2. **No `themeKey` branches.** Renderers read tokens and props, never the active theme's identity.
   A theme is a composition, so anything one theme can do, every theme can do.
