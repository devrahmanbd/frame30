# 04-builder — Theme Runtime Contract (theme-runtime.md)

Status: Planning · Slices S1 (skeleton) / S2 (runtime v1 + themes proto) / S7 (marketplace packaging) ·
Reference: `/plan.md` §3.3–3.4 (storefront, builder), 7 (themes) · `03-storefront/README.md` (theme runtime, data flow) ·
`12-marketplace/README.md` (themes catalog, versioning, review gate) · `00-meta/design-system.md` (token layers, theming rule)

---

## Purpose

Define the **artifact boundary** between Builder (04) and Storefront (03): what a theme *is* (package format), how the
storefront runtime *consumes* it (render pipeline, sandbox, data surface), and how it *moves* through states
(draft → preview → published, version pin, rollback, CDN purge). Theme = templates + layout AST + design tokens
(`plan.md` §3.4); the theme owns look & feel, the runtime owns data, auth, cart, checkout, and safety.
The same package format is the unit of the S7 marketplace catalog (`12-marketplace`).

Scope lines: **S1** lands the edge/cache skeleton + fallback template + registry tables; **S2** lands runtime v1
(server renderer, sandbox, preview) + 2–3 themes proto (Theme 01 "Char" first, `design-system.md` §9); **S7** lands
marketplace packaging, 8–10 themes, widget API, version pinning.

---

## Key decisions

- **TR-1 Theme = a self-contained versioned package.** A theme is a directory artifact: `theme.yaml` manifest +
  layout AST per page + token set + hashed static assets + optional widget JS. Every mutation is versioned
  (semver). Merchant installs are **pins** — a store keeps serving its pinned version until an explicit upgrade
  (`12-marketplace`: "Remove leaves installs on last good version (pin)").
- **TR-2 Theme owns rendering, runtime owns everything else.** Themes never query data themselves and never touch
  auth/cart/checkout logic. The runtime injects a fixed, versioned data surface (SSR payload + narrow client
  bridge). This is what makes themes runtime-agnostic and marketable as independent apps (`plan.md` §3.3).
- **TR-3 Tokens are the only styling channel.** Storefront themes consume CSS custom properties emitted at runtime
  from `theme_tokens`; they may override **semantic + component layers only** — primitive `--fq-*` tokens are
  locked (`design-system.md` §2 theming rule). Publish-time validation rejects primitive overrides
  (`token_override_invalid`). Brand palette → semantic mapping happens in the builder token editor, never in the
  theme package.
- **TR-4 Framework-free server renderer.** Themes render server-side in a sandboxed, framework-free runtime — not
  TanStack SSR (`plan.md` §2.9, storefront README). The renderer is a pure **AST → HTML serializer** (per widget,
  per page type) + a hydration payload; no theme/widget JS executes during SSR.
- **TR-5 Widget JS only runs sandboxed, post-hydration.** Widget interactivity runs in an iframe (or worker for
  pure compute) with no parent DOM/network access; all communication goes through a narrow `postMessage` bridge
  with origin checks and an allowlist. Review gate blocks malicious widgets before any storefront execution
  (`12-marketplace` failure/recovery).
- **TR-6 Preview is an isolated, non-cached render.** Builder preview = `?preview=ast` (draft AST, `04-builder`
  README); marketplace preview = `?preview=theme:<version>` (packaged version, `12-marketplace`). Preview never
  touches the edge cache, never counts analytics, and never requires publish.
- **TR-7 Publish is atomic and purge-coupled.** Publish snapshots AST + tokens into `revisions`, flips
  `pages.published_at`, then **purges the edge cache immediately** (60s TTL baseline, storefront README data flow).
  Rollback = restore previous revision + purge. A failed publish leaves the previous revision serving.
- **TR-8 One bad widget never breaks a page.** Invalid/unknown widget at render → skip + placeholder
  (`04-builder` failure/recovery); a whole-theme crash → fallback template with maintenance notice
  (storefront README). The page still returns 200 with valid HTML.
- **TR-9 Fallback template is a built-in minimal theme.** It is the last line of defense under theme crash,
  render timeout, or edge-down-with-cached-HTML-miss. Tiny, JS-free, AA, system-font (documented exception to the
  Bangla display rule — it must render with zero network dependency).
- **TR-10 Edge-first with offline grace.** Render output is cached at the edge (60s); edge down → cached HTML
  serves; PWA layer adds offline pages for visitors (`plan.md` §9 risk 268 mitigation).
- **TR-11 Anon reads, RPC-only, published-only.** The runtime fetches via the storefront anon RPC surface
  (catalog/stock/theme data) under RLS; unpublished pages 404 for anon and render only behind a preview token.
  Direct table grants: none (storefront grants convention).
- **TR-12 Budgets are part of the contract, enforced at publish.** Theme JS ≤ 100KB gz, hero ≤ 250KB
  (WebP/AVIF), LCP < 2.5s on mid-Android, CLS < 0.1 (storefront README §performance). CI asserts the budget on
  every publish candidate; overshoot blocks publish (`budget_exceeded`).

---

## 1. Theme package format

```
theme/
  theme.yaml           # manifest (below); the only required file
  ast/                 # page_<slug>.json — one layout AST per page type
  tokens/              # theme_tokens.json — semantic-map + component tweaks (never --fq-* primitives)
  assets/              # images / fonts / icons — content-hashed filenames, served from CDN
  widgets/             # optional widget JS bundles — versioned, sandboxed at runtime
  templates/           # optional page templates offered to the builder canvas
```

### theme.yaml manifest

```yaml
name: char                  # slug, unique per install
version: 1.4.0              # semver; required for any mutation (12 pipeline)
requires:
  framique-runtime: ^1      # runtime API compatibility — drives the S7 "Requires" check
pages:
  home: ast/page_home.json
  collection: ast/page_collection.json
  product: ast/page_product.json
  # optional: cart, checkout, account, order, tracking, search, not_found
tokens: tokens/theme_tokens.json
assets: assets/manifest.json # path -> sha256 (SRI for CDN content)
widgets:                     # widget deps, each versioned
  - id: fq.product_grid
    version: 2.1.0
meta:
  author: framique
  license: proprietary
  preview: assets/preview.webp
```

### Layout AST

```json
{
  "type": "page",
  "slug": "home",
  "title": "My store",
  "children": [
    {
      "widget": "fq.heading",
      "id": "h1",
      "props": { "text": "Welcome" },
      "styles": {
        "desktop": { "spaceTop": "fq-space-6", "color": "semantic.text.primary" },
        "tablet": { "spaceTop": "fq-space-4" },
        "mobile": { "spaceTop": "fq-space-3" }
      }
    }
  ]
}
```

Rules: `widget` ids must exist in the installed widget registry (`widgets.manifest`) or the publish fails
(`widget_unknown`); `styles` values may reference only existing primitive scale tokens, semantic tokens, and
component variants — free-form colors/heights are rejected (`token_override_invalid`). Responsive variants are
`desktop | tablet | mobile`, always descending (desktop base, thinner overrides).

### Tokens

`theme_tokens.json` contains: merchant brand → semantic map (`primary`, `secondary`, `background`, `surface`,
`text`, `success`, `warning`, `danger` — matching the design-system semantic layer), plus component-layer tweaks.
The runtime renders these as CSS custom properties on the document root **before** any page CSS, so widgets and
theme CSS consume tokens uniformly. Dark mode swaps the semantic map (`design-system.md` §2). The builder token
editor's contrast badge ("Text will be hard to read in this color") is re-checked at publish; failing pairs block publish.

### Assets & widgets

Assets are immutable (content-hashed) and served from the CDN with SRI. Widget bundles are versioned,
registry-registered artifacts (installed count = `widgets` table); their JS runs only inside the sandbox (TR-5).

---

## 2. Runtime contract (storefront side)

### SSR data payload

Every server-rendered page embeds a versioned payload the theme can render from:

```js
window.__FRAMIQUE_DATA__ = {
  runtimeVersion: "1.x",
  merchant: { name, currency: "BDT", locale: "bn" },
  page: { type, slug, title, seo: { meta, og, schema } },
  data: { /* catalog/collection/product/cart-count — fetched via anon RPCs server-side */ },
  cdnBase: "https://cdn.framique.com/…",      // for theme assets
  csrfToken: "…",                              // anon-scoped, used only by the client bridge
  navigation: { home, collection, product, cart, account, checkout } // page-type → URL map
};
```

`runtimeVersion` must satisfy the manifest's `requires.framique-runtime`; mismatch → install/upgrade blocked at
the builder/marketplace UI before any render.

### Client bridge (postMessage allowlist)

Widget JS may call only these bridge verbs, via `postMessage` to the host with `event.origin` verified:

- `framique.navigate(url)` — SPA-smooth page move within the store
- `framique.setVariant(productId, variantId)` / `framique.setQty(productId, qty)`
- `framique.addToCart(line)` — forwards to the existing cart RPC surface (07 contract)
- `framique.track(event, payload)` — one of the canonical storefront events (`page.viewed`,
  `product.viewed`, `cart.updated`, …); never called on preview renders (TR-6)
- `framique.get(key)` — read-only snapshot from `__FRAMIQUE_DATA__`

Anything else (raw `fetch`, parent DOM access, storage writes) is **sandbox-denied** (`sandbox_denied` logged,
page unaffected).

### Page-type coverage

The manifest declares which page types it covers. Missing coverage (e.g. theme ships no `account` page) renders
the theme's `not_found`-style placeholder with a builder warning; the builder requires all page types present
before a theme can be published as the store default (S7 catalog lists coverage in the preview card).

### CSP

Storefront responses set `script-src` to allow only the runtime's hashed bundles + sandbox origin; theme assets
load with SRI. No inline scripts from theme packages.

---

## 3. Render pipeline

```
request → edge (cache hit → HTML) → runtime service:
  load pinned published revision (themes × pages × theme_tokens, RLS-scoped)
  emit tokens as CSS custom properties
  server-render AST → HTML (serializer per widget; zero widget JS)
  attach __FRAMIQUE_DATA__ + hydration markers
→ edge cache (60s) → browser
  → hydrate (event delegation) → widget JS into sandbox iframes/workers
```

OTel spans: `theme.load`, `theme.render`, `theme.serialize`, `theme.sandbox`. Errors never leak AST internals or
PII into responses (PII-minimal logging rule).

### 3.1 Shipped runtime contract (TODO Phase 8, half 1)

| Concern | Where it lives | Contract |
| --- | --- | --- |
| Cache key | `src/lib/storefront-cache.ts` | `sf:<tenant>:<template>:<locale>:<theme_version>` — tenant always first, so a purge can only ever be tenant-scoped. Missing tenant or a separator inside any part throws. |
| Response headers | `storefrontCacheHeaders()`, applied in `src/server.ts` for storefront documents only | `s-maxage` + `stale-while-revalidate`, `vary: accept-language`, weak ETag pinned to the published theme version. A publish changes the version, so it invalidates by key rather than by broadcast. |
| Published read | `publishedTheme()` in `src/lib/themes.server.ts` | Two hops: a short-TTL tenant pointer (`published_version_id`) plus a version-keyed snapshot. The `theme_versions` read is filtered by `merchant_id` **and** `status = published`, so a tampered pointer cannot cross tenants. |
| Tenant isolation | `src/lib/tenant-scope.ts` | `assertTenantId` runs at every resolver entry point (`resolveWidgetData`, `publishedTheme`) before a query is built; wildcard-ish ids (`*`, `all`, blank) are rejected. The renderer never sees a tenant id. |
| Failure containment | `src/components/builder/WidgetBoundary.tsx` (wired in `SectionRenderer`) | A throwing widget renders a space-reserving placeholder on the storefront and a labelled reason in the studio; siblings and the document still render. |
| Metrics | `src/lib/observability.server.ts` → `ops/observability/grafana/builder-dashboard.json` | `framique_template_render_ms`, `framique_widget_resolver_ms` / `_total`, `framique_widget_errors_total`, `framique_plugin_hook_ms` / `_total`. |

Still open in Phase 8: island hydration, the `theme_import_demo` RPC, and registry
version compatibility.

---

## 4. Publish pipeline & versioning

`draft → preview → published` (`04-builder` state machine) with the version boundary resolved:

- **`revisions` (04)** = per-merchant publish snapshots (AST + tokens) for rollback — one row per publish.
- **`theme_versions` (12)** = marketplace package versions (creators' artifacts). Merchant install **pins**
  `theme_version_id`; publish snapshots reference the pinned version + the merchant's own AST/token state.

Publish sequence: validate (schema, token refs, widget registry, budgets, contrast) → snapshot revision → flip
`pages.published_at` → purge CDN → emit `page.published` / `theme.updated`. Rollback: restore previous revision
row → purge → serve old render. Failed validation leaves `published_at` untouched and the previous revision
serving (`revision_required` if no prior revision exists).

---

## 5. Preview mode

- Builder: `?preview=ast` — renders the in-flight draft AST with `theme` JSON embedded, no cache, no analytics,
  editor chrome excluded; builder shows a `Preview` badge.
- Marketplace: `?preview=theme:<version>` — renders the packaged version for the preview card, same isolation.
- Preview of a draft that fails validation still renders builder-side with inline warnings (placeholder per
  widget); it never becomes servable (anon 404, TR-11).

---

## 6. Failure/recovery

| Failure | Behavior |
| --- | --- |
| Theme crash / render timeout (>800ms) | Fallback template, 200, maintenance notice (`theme_render_failed` logged, OTel alert) |
| Invalid/unknown widget in AST | Skip + placeholder; rest of page intact (`widget_invalid` / `widget_unknown`) |
| Primitive token override at publish | Publish blocked (`token_override_invalid`); draft keeps serving in preview |
| Publish fails mid-sequence | Previous revision keeps serving; no partial flip |
| Edge down | Cached HTML serves; cache miss → fallback template |
| Sandbox violation attempt | `sandbox_denied` logged; page unaffected |
| Theme not found / not published | 404 for anon (`theme_not_found`); preview token required otherwise |
| Budget overshoot at publish | Publish blocked (`budget_exceeded`); optimizer suggestions returned |

Error literals: `theme_not_found`, `theme_not_published`, `theme_render_failed`, `widget_invalid`,
`widget_unknown`, `token_override_invalid`, `ast_invalid`, `revision_required`, `preview_only`,
`page_missing`, `sandbox_denied`, `budget_exceeded`, `purge_failed`.

---

## 7. E2E contract

Additions to the canonical suites (AGENTS.md loop inventory unchanged); `store_loop` remains the critical gate.

**store_loop — runtime render (8 scenarios)**
1. `theme_serves_rendered_html` — published theme serves HTML at `<merchant>.store.framique.com/` with
   `__FRAMIQUE_DATA__` present and zero widget JS executed during SSR (assert no bundle load before hydration).
2. `edge_cache_and_purge` — second hit served from cache (60s); publish purges immediately (fresh render on
   first post-publish hit).
3. `theme_crash_serves_fallback` — injected failing widget → 200 fallback template with maintenance notice, no
   partial garbage.
4. `invalid_widget_skipped` — unknown widget id → placeholder rendered, sibling widgets intact.
5. `token_override_rejected` — publish candidate overriding `--fq-*` primitive rejected; semantic override
   accepted and applied as CSS custom properties.
6. `unpublished_page_404` — anon 404; `?preview=ast` renders draft; preview response not cached; no
   `page.viewed` event from preview.
7. `budget_enforced` — JS > 100KB gz candidate blocked (`budget_exceeded`).
8. `sandbox_denied_fetch` — widget attempts raw fetch/parent access → `sandbox_denied`, page unaffected.

**builder_loop — publish & versioning (5 scenarios)**
1. `publish_atomic` — draft → preview → published flips `published_at`, creates revision, purges CDN, emits
   `page.published`.
2. `rollback_restores` — rollback serves previous revision render after purge.
3. `version_pin_kept` — marketplace v2 released; store still serves pinned v1 until explicit upgrade.
4. `upgrade_compat_check` — upgrade blocked when `requires.framique-runtime` is unsatisfied.
5. `preview_isolation` — preview renders draft with editor chrome excluded and no analytics events.

---

## 8. Open items

1. **Runtime API versioning granularity** — one `framique-runtime` major vs per-widget API versions; decides the
   S7 "Requires" compat check shape. Needed before marketplace opens.
2. **Hydration strategy** — full re-hydration vs event delegation for server-rendered widgets; directly
   constrains the ≤ 100KB gz widget budget.
3. **Edge purge mechanism** — Redis pub/sub invalidation vs CDN surrogate keys; an S1 infra decision the publish
   pipeline depends on.
4. **PWA offline scope** — which page types/strategies are offline-cacheable (`plan.md` §9 risk 268).
5. **Custom merchant fonts** — whether the manifest may add font faces beyond the Noto Sans Bengali +
   SolaimanLipi/Kalpurush system pair, or whether brand fonts stay locked out of the primitive layer.
6. **SDK code hooks** — `plan.md` §3.4 "no-code default, code allowed via SDK"; the manifest `code` field is
   reserved and deferred to the SDK spec (S7).

---

## Design guidelines — fallback template & preview shell

- Intent: the fallback is invisible when nothing goes wrong — calm, on-brand-by-default (BD teal), zero
  dependency; the preview shell is a honest "what you see is what publishes" frame.
- Key surfaces: fallback (centered mark + notice + retry), preview badge (`Preview`, top-left, amber), preview
  frame (exact viewport device widths).
- Palette: fallback uses platform defaults — `--bd-teal` mark, neutral background, semantic text tokens; no
  theme tokens (theme may be broken).
- Typography: fallback = system font stack only (documented exception to the Bangla display rule — must render
  with no network); preview shell = compact 0.875rem UI.
- Density: fallback airy (centered, one block); preview shell minimal chrome so the canvas dominates.
- Motion: fallback retry hover 120ms; preview badge fade-in 200ms; reduced-motion → opacity only.
- A11y: fallback AA (4.5:1), `role="status"` on the notice, retry is a real button; preview frame keeps
  keyboard focus inside the iframe for editor flows.
- Performance: fallback ~1KB, no JS, no fonts, no network; preview frame only loads the draft AST + tokens.
- Anti-slop: the fallback notice is human Bangla, not error-speak: "Sorry, the store can't be loaded right
  now. We'll be back soon." with "Try again".

---

## Sandbox capability list (Phase E — as built)

Merchant-authored theme content is untrusted input. The parser is the only way
content enters storage or the renderer, so the capability list is enforced
there rather than by convention.

- **Text, textarea, and the `html` widget:** plain text only. `<script>` and
  `<style>` blocks are removed with their contents, all remaining tags are
  stripped, residual `<`/`>` neutralised, control characters dropped, and the
  value truncated to the field maximum. The renderer prints a text node —
  `dangerouslySetInnerHTML` is used nowhere in the theme runtime, so no markup
  and no inline event handler can ever execute.
- **Link fields:** `https:`, `http:`, site-relative `/…`, `#`, `mailto:`,
  `tel:` only. `javascript:`, `data:`, `vbscript:` and protocol-relative
  `//host` are rejected to empty.
- **Embeds (iframes):** must be https and on `EMBED_HOSTS`
  (YouTube, youtube-nocookie, Vimeo player). Every other host is rejected, both
  in the parser and again in the renderer. Frames keep `sandbox`,
  `referrerpolicy=strict-origin-when-cross-origin`, and a narrow `allow` list.
- **Structural limits (`AST_LIMITS`):** 60 sections per slot, 512k characters
  per payload, 12 levels of nesting. Oversized or over-deep documents are
  rejected before parsing with `builder.payload_too_large` /
  `builder.payload_too_deep`.
- **Template keys:** only the known `TEMPLATE_KEYS` are read; unknown or
  malformed keys are dropped. Unknown widgets degrade to a labelled placeholder
  and a blocking lint error, never a crash and never a raw render.
- **Tenancy:** the storefront resolver re-scopes the published version by
  `merchant_id` as well as id, so a tampered pointer can only ever resolve
  inside the same tenant. Template rendering reads no secrets and issues no
  unscoped queries.
- **Observability:** every rejection increments
  `framique_builder_sanitiser_rejects_total{surface}` and logs
  `builder.sanitised` with a count only — never the payload.
- **Gate:** `src/lib/theme-sandbox.test.ts` covers script/handler injection,
  dangerous schemes, non-allowlisted frame hosts, oversized and deeply nested
  documents, section caps, malformed template keys, and unknown widgets.

## Island hydration (Phase 8)

`src/lib/widget-hydration.ts` maps every widget type to one hydration mode, and
`WidgetIsland` is the only place that acts on it:

| Mode | Widgets | Client cost |
| --- | --- | --- |
| `static` | markup-only widgets (`rich_text`, `image`, `spec_table`, `hero`, …) | zero JS: the island never mounts |
| `eager` | chrome and buy path (`announcement_bar`, `add_to_cart`, `buy_box`, `variant_picker`, `html`, `plugin_block`) | hydrates with the page |
| `visible` | default, incl. data widgets and rails | hydrates on scroll into view (200px margin) |
| `interaction` | closed-by-default disclosures (`accordion`, `faq`, `tabs`, `quiz`, `quick_view`) | hydrates on first pointer/focus/touch |

The server always renders complete markup, so a dormant island is a fully
rendered section — the client simply declines to adopt it until the trigger
fires. Containers, context widgets and the studio always hydrate eagerly,
because their children's islands live inside them.

## Registry versioning (Phase 8)

`BUILDER_API_VERSION` (currently the AST v3 line) is the single compatibility
number. Theme presets declare an `api` range next to their `version`, plugins
declare it in their manifest, and `registry-version.ts` applies the same check to
both. `installRegistryTheme` rejects an incompatible package before the RPC
runs, and the studio shows the running builder API plus a per-theme
incompatibility notice.

## Demo content (Phase 8)

`theme_import_demo(_merchant_id, _theme_key, _ast, _tokens)` seeds a small
`is_demo`-flagged catalogue and writes the preset's home layout into the
merchant's draft. It is idempotent: a second call is a no-op. `theme_purge_demo`
deletes only `is_demo` rows, so a merchant's real catalogue is never touched.
Both paths are tenant-scoped, rate limited, audited and purge that tenant's
storefront cache only.
