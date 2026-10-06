# App blocks (widget catalog & sandbox)

> Stays current — widget catalog contract companion to
> `docs/04-builder/README.md` (canonical). Final split: **Widget =
> functionality/data/state/actions; Builder = composition + props +
> placement; Theme = presentation; Plugin = extension.** A theme never forks
> a renderer; it claims presentations through the registries (§7).

Status: **Current (contract)** · Reference: `04-builder/README.md`
(authoritative theme reference) · `theme-registry.md` §0 (registries,
chrome, menu swap) · `sections-templates.md` (slot allowlists)

## 1. Purpose

Own a single, governed definition of every widget a merchant can drop on a page — the **block catalog**: kind names, props, rendering kind, and sandbox rules for community widgets. The page AST is validated against the catalog and nothing else; the editor, storefront runtime, and marketplace all read the same catalog. Logic that decides what a widget may render — kind, props, sandbox, entitlement — that lives outside the catalog is a defect.

Final architecture: the widget provides functionality/data/state/actions;
the builder composes nodes with props + placement; the theme supplies
presentation only, via the registries (§7) — never a renderer fork
(`src/lib/definition-of-done.test.ts:102`).

## 2. Scope

In scope:

- The canonical catalog: built-in kinds, schema validation, per-row status (`verified` / `draft` / `blocked`), and the per-merchant install list.
- Sandbox contract for community bundles: versioned, hash-pinned, capability-limited; "never load on failed validation".
- Server-side props validation for every AST write — the client never decides what a widget may render.
- Entitlement gating for `custom_html` and community widgets.

Out of scope:

- Marketplace storefront UI (that surface is `12-marketplace`); this doc defines the catalog contract it distributes.
- The render pipeline (`theme-runtime.md` TR-2) and slot rules (`sections-templates.md`) — this doc gates widget kinds, not layout.
- Editor UI chrome; only design guidelines ride here.

## 3. Block model — how one block connects everywhere (HEAD shape)

A **block** is the canonical definition of one widget kind. A node in the
page AST is a `Section` (`src/lib/builder-ast.ts:407`):

```ts
{ id, type, props, children?, hidden?, bp?, invalid?, when?, ab? }
```

There is no `instance` field (identity is `id`) and no top-level `styles`
object — the universal style layer (spacing, background, radius, reveal) is
applied once by the engine from props
(`src/components/builder/SectionRenderer.tsx:182`). Skin rides the chrome
wrapper as `[data-widget][data-skin]` for skinnable types only
(`src/lib/builder-ast.ts:738`, resolved at `:777`).

Every catalog entry (`catalogEntry`, `src/lib/builder-ast.ts:6605`):

| Field               | Meaning (HEAD)                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `type`              | stable kind key — the AST `type` value (e.g. `product_grid`)                                              |
| `label`, `defaults` | editor tray label + base defaults (bitext twins listed in `BITEXT_FIELDS`, `src/lib/builder-ast.ts:5781`) |
| `fields`            | prop schema; the authoritative validator via `coerceProp` (`src/lib/builder-ast.ts:7051`)                 |
| `kind`              | `core` (ships with builder); community arrives namespaced (see §7)                                        |

> Planned (not at HEAD): a `widget_catalog` SQL table and the
> `app.widget_catalog()` / `app.widget_installed()` RPCs named in an earlier
> draft of this section do not exist — no non-test source references them.
> Catalog reads go through `catalogEntry` (`src/lib/builder-ast.ts:6605`)
> and the studio twin map (see `README.md` §“Studio twin parity contract”,
> pinned at `src/lib/studio/catalog.test.ts:843`).

## 4. v0 catalog (planning — slot allowlists live in `sections-templates.md`)

> Planning: the slot table below pre-dates the closed `SectionType` registry
> and per-template context gating (`isContextMismatch` in
> `src/components/builder/SectionRenderer.tsx:288`). Do not build new
> allowlists from it. HEAD rule: slot-level allowlists stay per template
> (`sections-templates.md`); the catalog constrains widget kinds, and
> context widgets render live only on the templates that own their data
> (else a labelled placeholder, never a crash).

| slug                                                 | allowed slots (slot schemas live in theme-registry.md) |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `heading`, `text`, `image`, `custom_html`, `marquee` | any slot incl. header/footer layout groups             |
| `product_grid`, `collection_grid`                    | any main slot                                          |
| `buy_box`, `trust`, `countdown`, `faq_accordion`     | buybox slot only                                       |
| `video`, `form`                                      | any main slot                                          |

Deferred to the S7 marketplace extension (plan.md §3.4): `slider`, `testimonial`, `review`, `action_button` — they arrive as new catalog rows under the same schema/sandbox rules as any other widget. Slot-level allowlists stay per template (sections-templates.md); the catalog only constrains widget kinds.

## 5. Server-side validation (write path — HEAD)

Every `props` object is validated at AST write time on the server through
the parser — the client never decides what a widget may render:

```
parseAst / parseTemplates
  → per node: parseSection rebuilds props field-by-field from the catalog
    (src/lib/builder-ast.ts:7177), each value through coerceProp (:7051);
    unknown keys dropped; bilingual twins preserved (BITEXT_FIELDS, :5781);
    duplicate ids re-suffixed; unknown types → invalid placeholder, never a crash
  → lintTemplate gates publish: errors block, warnings stay advisory
    (src/lib/builder-ast.ts:7853)
```

Pinned: smuggled props dropped + duplicate ids re-suffixed
(`src/lib/builder-lifecycle.contract.test.tsx:126`); serialise→parse→
serialise byte-stable incl. twins (`:109` in the same file — suite at
`src/lib/builder-lifecycle.contract.test.tsx:108`); unknown widget →
`invalid` placeholder with siblings intact (`:144`).

No validation by-pass exists: a failing widget never lands in a published
revision. Editor-side checks are comfort only; the server is the decision
point. Render-time failure degrades per node (placeholder), never blanking
the page (`WidgetBoundary`, exercised at
`src/lib/builder-lifecycle.contract.test.tsx:180`).

## 6. Entitlements (planned — not enforced at HEAD)

> Planned: per-widget plan gates (`min_plan`, a `widget_custom` entitlement
> for `custom_html` + community, `plan_limit_exceeded`, `widget.blocked`
> events, `widget_snapshot()` RPC) do not exist at HEAD — no non-test source
> references them. The shipped gates are the plugin manifest gate
> (`parseManifest`, `src/lib/plugin-manifest.ts:393`), the resource ceiling
> (`PLUGIN_BUDGET`, `src/lib/plugin-manifest.ts:32`), the sandbox island
> (§7), and the publish lint gate
> (`src/lib/builder-lifecycle.contract.test.tsx:84`).

- (planned) `custom_html` and `kind = community` rows are not free-tier surfaces: install and render both require `check_entitlement(merchant_id, 'widget_custom')`; a plan deficit returns `plan_limit_exceeded` (same pattern as sections-templates.md limits).
- (planned) The snapshot RPC (`app.widget_snapshot()`) reports `blocked` status to the merchant's editor so the merchant knows why a widget stopped rendering — an uninstall or cleanup decision needs that code owner.

## 7. Community widgets — Class A/B + theme dressing (HEAD)

One renderer for every plugin-contributed widget: `PluginBlock`
(`src/components/builder/PluginBlock.tsx`). The core widget registry stays a
closed enum; plugins contribute in a namespaced tier
(`plugin:{pluginId}/{widget}` via `pluginWidgetKey` /
`parsePluginWidgetKey`, `src/lib/plugin-manifest.ts:295`), mounted through
the one sandboxed island — never a new core renderer branch.

- **Class A (`isolated`):** no `themeable` contract — the bundle owns
  arbitrary UI inside the null-origin `WidgetSandbox` frame
  (`src/components/builder/PluginBlock.tsx:112`), reaching the app only
  through the scoped `postMessage` bridge
  (`src/lib/marketplace-scopes.ts:341`).
- **Class B (`themeable`):** declares the versioned theme-safe contract
  (schema/data/actions/slots/states, `PLUGIN_THEME_CONTRACT_VERSION = 1`,
  `src/lib/plugin-theme-contract.ts:36`; class via `pluginWidgetClass` at
  `:66`; malformed declarations fail the manifest gate at
  `src/lib/plugin-manifest.ts:459`). The theme dresses it through the
  community presentation registry: `registerCommunityPresentation`
  (`src/lib/plugin-theme-contract.ts:165`) /
  `resolveCommunityPresentation` (`:208`); the generic sandboxed island is
  the fallback when undressed. Data rule (v1, internal): the presentation
  receives the install's validated settings as `data` — the bundle never
  executes on the dressed path.
- **One decision point:** `resolveCommunityRender`
  (`src/lib/plugin-theme-contract.ts:266`) — blocked → labelled placeholder
  (five modes: `bad_key`, `not_installed`, `unknown_widget`,
  `incompatible`, `disabled`); Class A → `sandbox`; Class B undressed →
  `island`; Class B dressed → `theme`
  (`src/components/builder/PluginBlock.tsx:92`). Never throws; malformed
  input degrades to the island.
- **Manifest + compat:** `parseManifest` (`src/lib/plugin-manifest.ts:393`)
  is the single gate (review pipeline, install flow, host); API range via
  `satisfiesApiRange` (`:311`) against `BUILDER_API_VERSION`
  (`src/lib/plugin-manifest.ts:29`); ceiling `PLUGIN_BUDGET`
  (`src/lib/plugin-manifest.ts:32`).
- **Menu fill/swap (plugin nav):** widgets may target menu slots
  (`MENU_SLOTS`, `src/lib/marketplace-scopes.ts:291`); a full-renderer swap
  additionally needs the `replace_menus` scope (`:304`) AND review approval
  (`decideMenuRenderer`, `src/lib/plugin-manifest.ts:102`); rows resolve
  fail-open (`resolveMenuSwapRows`, `:207`); renderer selection fails open
  (`selectPluginMenuRenderer`, `src/lib/plugin-menu-renderers.ts:120`) with
  throwing renderers caught by `PluginMenuBoundary` (`:179`). Detail lives in
  `theme-registry.md` §0 — not duplicated here.
- **Chrome surfaces** (header shell, menu, announcement, footer) are
  themeKey × surface claims on the same registry shape — see
  `theme-registry.md` §0 (`src/components/store/StoreHeader.tsx:316`,
  `:338`; `src/components/store/theme-chrome.ts:63`).

> Historical: the “versioned sandbox” numbered contract below (bundle
> `bundle_sha256` pins, `sandbox_denied` verb, `widget.blocked` daemon) was
> planning — HEAD enforces via the manifest gate + island + decision point
> above. Failing validation still means the widget is never loaded.

Deployed with the marketplace (S7) — the contract is pinned here from day 1 (guardrail 4):

1. A bundle = a versioned catalog row; assets live on the CDN behind a `bundle_sha256` integrity pin. A re-publish ships a new version row; in-place mutation is forbidden.
2. At install: hash verified, JSON schema validated, then the sandbox capability set is applied. A failing validation means the widget is **never loaded**.
3. At render: scripts execute only inside a sandboxed iframe with a `postMessage` allowlist (parity with theme-runtime.md §2 bridge). No direct `fetch` / `localStorage` from the widget — data flows through the host's message channel.
4. A runtime sandbox violation degrades the widget to the standard TR-8 placeholder, flips the catalog row to `blocked`, and fires `widget.blocked` with reason: `sandbox_rejected | schema_regression | cves`.

The storefront never executes untrusted JS outside this sandbox; theme upgrades that pull a blocked widget keep serving the last-good bundle (theme-registry.md §8 pattern).

## 8. Events & audit (planned — see note)

> Planned: `widget.installed` / `widget.blocked` daemon events and the
> `theme_audit` widget rows below do not exist at HEAD. Shipped telemetry:
> install/update spans + counters (`builder.install`, `builder.update_preview`,
> `framique_theme_install_total{result}`,
> `src/lib/themes.server.ts:716`, `src/lib/themes.server.ts:900`,
> `src/lib/themes.server.ts:729`) and render metrics per
> `04-builder/README.md` §“Testing gates”. All events stay tenant-scoped and
> PII-minimal when built.

- `widget.installed` — install, version change, removal (the install list row is the source of truth).
- `theme.updated` — unchanged existing event on page-save mutations.
- `widget.blocked` — new; fires on §7.4 with the reason enum.
- All events tenant-scoped, PII-minimal, raw retention 90 days (AGENTS.md §6); audit rows live in the registry `theme_audit` table.

## 9. Persistence (planned — no `widget_catalog` table at HEAD)

> Planned: the `widget_catalog` global table and the `widgets`
> per-merchant install-list shape below do not exist at HEAD. Plugin installs
> resolve at render time via `resolvePluginWidget`
> (`src/lib/plugin-manifest.ts:665`) against installed manifests; tray
> entries via `pluginTrayEntries` (`:686`). Merchant theme state persists via
> `store_themes` pointer + merchant-scoped `theme_versions`
> (`src/lib/themes.server.ts:1209`).

`widget_catalog` — global, write:service-only, no direct tenant writes:
`id, slug unique, label, label_bn, kind, schema jsonb, sandbox jsonb, min_plan text null, status text default 'verified', bundle_url, bundle_sha256, created_at, updated_at`

`widgets` (existing registry table) becomes the per-merchant install list:
`id, merchant_id, widget_id → catalog, version text, status (installed | blocked), created_at, revoked_at`

- RLS: `merchant_id` scoping on `widgets` mandatory; catalog rows are readable by tenants only through the RPC views (mirror of `theme_versions`).

## 10. Failure & recovery (HEAD)

- Unknown/removed widget slug on page load → parses to an `invalid`
  placeholder; production skips the node, siblings render
  (`src/lib/builder-lifecycle.contract.test.tsx:144`); editor shows an
  inline “Unsupported widget” note instead of blanking.
- Throwing widget → contained to its own node with a space-reserving
  placeholder; page markup around it untouched
  (`src/lib/builder-lifecycle.contract.test.tsx:180`).
- Community resolution failure (`bad_key` in production renders nothing;
  every other mode renders a labelled bilingual placeholder) — never a crash
  (`src/components/builder/PluginBlock.tsx:27`).
- Version conflict: an installed pin stays on its pinned version; breaking
  changes are new manifests gated by `satisfiesApiRange`
  (`src/lib/plugin-manifest.ts:311`), resolving to `incompatible`
  placeholders, never silent upgrades.

## 11. Design guidelines — widget tray, inspector, placeholder

- Intent: additive and calm — the tray is a picker, the inspector a form, and the canvas stays the star; chrome recedes (builder chrome rules).
- Key surfaces: tray rail (left), property inspector (right), canvas with drag ghost, amber "unsaved" dot vs publish mint in the top bar; blocked widget shows reason text + icon, never color alone.
- Palette: monochrome slate chrome; BD-teal accents only for selection; Rickshaw for `blocked`; mint for publish-ready.
- Typography: compact 0.875rem panels and forms; real theme fonts (Bangla display) in preview; tabular numbers for width/offset inputs.
- Density: 4px snap grid, keyboard-first (arrow keys nudge, Enter commits), fields stacked tight.
- Motion: drag ghost 120ms, panel slide 200ms, device switch crossfade 240ms; `prefers-reduced-motion` collapses to opacity only.
- A11y: tray items selectable and keyboard-draggable; inspector is a labeled form; focus ring visible; status never color-only.
- Performance: only requested widget kinds load (lazy catalog fetch), ETag-cached snapshot reads.
- Anti-slop: hand-drawn-style widget glyphs (consistent with builder README), Bangla tray labels, and one empty state: "এক-ক্লিকে উইজেট যোগ করুন"।

## 12. Testing gates (HEAD — contract-level vitest, no Playwright)

- Persist shape: smuggled props dropped, duplicate ids re-suffixed,
  serialise→parse→serialise byte-stable incl. twins
  (`src/lib/builder-lifecycle.contract.test.tsx:108` — cases at `:109` and
  `:126`).
- Broken widget → placeholder with siblings intact + boundary containment
  (`src/lib/builder-lifecycle.contract.test.tsx:144`, `:180`).
- Community install→persist→render→switch with no brand leak
  (`src/lib/builder-themes.contract.test.tsx:82`); A/B same-data-two-
  presentations (`:132`); unknown theme → generic fallback
  (`:185`).
- Sandbox regression: bundle entries using `import(`/`eval(`/`new Function`
  fail the manifest gate (`src/lib/plugin-manifest.ts:452`); dangerous
  schemes/hosts rejected in parser + renderer (`src/lib/builder-ast.ts:6965`,
  `EMBED_HOSTS` at `:6997`), covered by `src/lib/theme-sandbox.test.ts`.
- No `.e2e/` Playwright infra exists in this repo — contract suites above
  are the gate (same adaptation note as `04-builder/README.md` §“Testing
  gates”).

## 13. Residual gaps (HEAD — planned, not implemented)

- Community marketplace storefront and third-party onboarding (S7);
  `widget_catalog` table + `app.widget_*` RPCs (§§3, 9) remain unbuilt.
- Review/approval for community submissions is the marketplace operator flow
  — routed to the review facility, not yet built. The review-approved flag
  the menu swap depends on (`reviewApproved`,
  `src/lib/plugin-manifest.ts:70`) is the same gate mechanism.
- Per-widget entitlements beyond the manifest/budget gates (§6) come with a
  native `check_entitlement` matrix later.
- `slider`, `testimonial`, `review`, `action_button` kinds remain on the S7
  backlog (unchanged).
- **Round-trip guarantee (shipped):** builder → save → reload → preview →
  publish → storefront preserves items/nested/bilingual/presentation/
  responsive (`src/lib/builder-lifecycle.contract.test.tsx:35`,
  `:108`); chrome/bitext twins survive the same path
  (`src/lib/builder-chrome.contract.test.tsx:282`); responsive ranges pinned
  (`src/lib/responsive.ts:11`, `src/lib/responsive.ts:154`).
