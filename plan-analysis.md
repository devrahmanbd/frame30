# Review — `plan.md` "Theme-Editable CMS Templates — Frame30"

**Reviewed artefact:** `/opt/frame28/plan.md` (353 lines)
**Repository:** `/opt/frame28`, branch `frame30`; `origin/frame30` == `origin/main` == `7127183406e3e80fea2b13039720b1000125ed2c`
**Review date:** 2026-10-20 · **Mode:** read-only. No file in the repository was edited except this one.
**Tooling note:** `bun` is not on `PATH` in this environment; every command below uses `node` / `node_modules/.bin/…` or plain `git` / `grep`.

---

## 1. Verdict

**The brief is a well-written *mission statement*, and a poor *plan*.** It is a competent scope document: it names seven surfaces, states the security and data-ownership constraints correctly, and its closing paragraph ("Songoskriti must be the proof that this is a working end-to-end CMS capability — not a set of attractive but disconnected preview pages") is the right acceptance idea.

It is **not** an executable plan, for one structural reason: **it is written against an imagined baseline, not this repository.** Almost every verb in it — "Add or complete a template manager", "Introduce or extend a typed, validated render context", "Provide reusable widgets/components for the search header, query summary, result count, filters/facets…", "Implement `archive` as a real template key", "Update the save, publish, version snapshot, migration, and rollback paths" — names a capability that **already exists under a different name or in a different layer**. A reader who picks this up and starts coding will build a second editor-shaped path, a second render-context mechanism, a second set of listing widgets, and a second archive vocabulary, all of which collide with shipped, frozen, gated code.

Three specific, load-bearing things the brief gets wrong about the *current* system:

1. **§11 ("Fix the generic Page template") is aimed at the wrong layer and states a false defect.** The live CMS page route already renders the merchant's real page — title, excerpt, body, media, studio-composed nodes — through `PageView` → `StudioNodes` → `ThemeChrome`'s `page_content` context slot. The literal string "Size guide" exists in exactly one place: `src/lib/themes/songoskriti/preview.ts:209`, the theme's own **seed/preview** source. It is demo copy, not production copy. §11 as written would send an engineer to fix a bug that is not there, while the real defect (the whole family of non-index Songoskriti templates shipping the shared default) goes untouched.
2. **§9 ("Allow the theme to design the checkout shell") is contradicted by the route.** `src/routes/store.$slug.checkout.tsx:419-421` passes `ast={null}` with the comment *"the checkout form is hand-built (server-quoted totals, live rails), so the theme contributes the tokens only."* The theme cannot design the checkout shell because the checkout route deliberately does not read the theme's AST.
3. **The brief does not know that the port is finished and diagnosed.** `report.md` at HEAD (`71271834`, committed 2026-10-20) already answers the question the brief is built around — why the non-homepage Songoskriti templates read as generic — names the exact gap ("no gate asks *is this template actually a Songoskriti design, or the shared default with the theme's logo on top?*"), and proposes five options including the **distinctness gate** the brief never mentions. The brief re-derives, at length, a conclusion that is already committed to the repository.

**What the brief is good for:** the constraint set (§12 templates-vs-presentations, §16 tenant isolation, §15 a11y/SEO/perf) and the §1 posture ("Do not assume preview behavior and storefront behavior are identical") are correct and should survive verbatim into any re-cut. What it is bad for: it is not a task list, it has no sequencing, no per-task acceptance, no file-level targets, no ownership, and it is unaware of a frozen parity baseline and an active core-file prohibition that will block most of the work it proposes.

**The single most valuable thing this review contributes:** the brief's premise set is wrong in 17 material places (§3 below), and **one of them — the `archive` key — is a decision that needs an owner, not a task that needs an engineer.**

---

## 2. Section-by-section findings

Legend: **HOLDS** = the section is accurate as written. **PARTIALLY HOLDS** = the true part and the false part are separated. **CONTRADICTED** = the repository shows something different.

### §1 — Audit the existing implementation first

**PARTIALLY HOLDS.** The *posture* is right and is the single most valuable line in the brief: *"Identify why the existing preview uses generic bodies, demo data, or empty slots, and whether the same problem occurs in the live storefront. Do not assume preview behavior and storefront behavior are identical."* That is exactly the right instinct, and it is the instruction that would have surfaced the findings below.

The *work* is already done and committed:

- The port inventory, classification map and canonical port map exist: `docs/superpowers/songoskriti-evidence/port/inventory.md`, `…/classification.md` (per-row lane a/b/c, carrier file, evidence), `docs/themes/songoskriti-port-map.md` (§4 "Lane (c) — 26 theme-owned rows").
- The reference freeze exists: `docs/superpowers/songoskriti-evidence/port/reference/` (54 template stills + 2 mega-menu + 2 mobile-drawer + 2 variation stills) with `reference-manifest.json`.
- The parity result is recorded: `docs/superpowers/songoskriti-evidence/port/parity-report.md` — *"60 passed / 1 skipped / 0 failed / 0 flaky — 61 tests, 8.3 min, exit 0."*
- The generic-ness diagnosis exists: `report.md` (HEAD), §2 "Short answer" and §5 "Why nothing caught it (the gap in our own records)".

**Not true:** that an implementation map must still be produced. It must be *updated* — the map that exists is a **theme-port** map (which widget is theme-owned), not a **CMS-template-route** map (which route reads which template, which context slot carries which data). The genuinely new artefact the brief needs is the latter, and it should be a *delta* against the port map, not a re-derivation.

### §2 — Establish a complete template contract

**PARTIALLY HOLDS / one part CONTRADICTED.**

True: the template-key system *is* the contract, and the *exhaustive-map* warning is right — `TEMPLATE_KEYS` is consumed by 20+ non-test sites and by at least six exhaustive `Record<TemplateKey, …>` maps. Adding a key genuinely breaks compilation in more places than the brief anticipates.

| Exhaustive map | File:line |
|---|---|
| `TEMPLATE_ZONES: Record<TemplateKey, readonly Zone[]>` | `src/lib/builder-ast.ts:156` |
| `TEMPLATE_LABEL: Record<TemplateKey, {en;bn}>` | `src/routes/_authenticated/dashboard/builder.tsx:205` |
| `TEMPLATE_JS_BUDGET: Record<TemplateKey, number>` | `src/lib/widget-weight.ts:205` |
| `GENERIC_TITLES: Record<TemplateKey, [string;string]>` | `src/lib/theme-preview-nav.ts:340` |
| `templates: Record<TemplateKey, ThemeAst>` | `src/components/store/ThemePreviewFrame.tsx:89`; `src/lib/theme-preview-nav.ts:333` |
| `ThemeTemplates = Partial<Record<TemplateKey, ThemeAst>>` | `src/lib/builder-ast.ts:517` |

Plus a runtime `z.enum` of the nine keys — `src/lib/storefront.functions.ts:97-107` (`getStoreChrome`).

**Contradicted — "A stable template key and schema/API version" (§2, bullet 1):** there is **no per-template schema or API version anywhere in the repository.** The only version that exists is the *global* builder API: `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`), with `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:52`) and `PRESET_API_RANGE = "^3.0.0"` (`src/lib/registry-version.ts:14`). A repo-wide search for `templateVersion|template_version|schemaVersion|schema_version` returns only an unrelated DB column (`src/integrations/supabase/types.ts:3137`). The brief asks for a versioning contract that does not exist and specifies none — it must either drop the requirement or design it.

**Contradicted — the compatibility consequence of adding a template key, which §2 does not mention at all:** a third-party package's `templates` array is validated as a *subset* of `TEMPLATE_KEYS` (`src/lib/theme-package.ts:172`, `:352-375`), so existing packages keep validating — but they silently ship **no** `archive` template, and the host must fall back. Worse, the *storage* side is destructive: `parseTemplates` reads only known keys and **drops everything else** (`src/lib/builder-ast.ts:8120-8124`: *"Only the known template keys are read; anything else in the payload is dropped rather than carried into storage or the renderer."*). So an `archive` template written to `theme_drafts.templates` / `theme_versions.templates` before the union grows is silently discarded on the next read. That is a migration, and §2 lists "migrations" as a thing to "update" without noting the failure mode.

### §3 — Make every template editable in the actual CMS

**CONTRADICTED (the manager exists).**

The template manager is already built:

| Capability | Where it already lives |
|---|---|
| Template switcher dropdown listing every key | `src/components/builder/BuilderTopBar.tsx:413` (`TEMPLATE_KEYS.map`) |
| Template tab bar in the editor | `src/routes/_authenticated/dashboard/builder.tsx:1430-1444` |
| Per-template command-palette entries | `src/routes/_authenticated/dashboard/builder.tsx:1306-1312` |
| Per-template AST isolation on every mutation | `src/hooks/use-builder-editor.ts:332-345` |
| Per-template lint | `src/hooks/use-builder-editor.ts:632-636` |
| Autosave / version save / publish / schedule | `src/routes/_authenticated/dashboard/builder.tsx:565-570`, `:1212`, `:1223` |
| Device preview (desktop/tablet/mobile) | `src/routes/_authenticated/dashboard/builder.tsx:433`, `:547` |
| Widget tray + schema-driven inspector | `src/hooks/use-builder-editor.ts:21-28` (`fieldsOf`, `validateProps`) |

**"Saving Search must not overwrite Cart" already holds, structurally.** Every editor mutation is scoped to one template key: `editSlot` clones `current.templates[template]`, mutates one slot, and writes back `{ ...current.templates, [template]: ast }` (`src/hooks/use-builder-editor.ts:336-344`). The whole document is then saved, so Cart's AST is carried through untouched. This is a property of the data structure, not of a feature. §3's requirement should become a *regression test*, not a work item.

**Also true, and uncredited by the brief:** the per-page template *override* already exists — `storefront_pages.template` (`src/integrations/supabase/types.ts:8355`) plus the resolution chain `resolveTemplateCandidates` / `resolveTemplate` / `templateSuffixFromOverride` (`src/lib/builder-ast.ts:8145-8260`): `<base>_<suffix>` → `<base>_<slug>` → `page_<slug>` → `<base>` → `page` → `index`. §11 says "If no per-page override exists…" — it does exist.

### §4 — Define a route-owned render-data contract

**PARTIALLY HOLDS — the mechanism exists; the *typed contract* does not.**

The route-owned context system is already the platform's central render seam:

- `ThemeChrome` props `contextSlots`, `productSlot`, `collectionSlot`, `contentSlot` — `src/components/store/ThemeChrome.tsx:48-50`, `:82`, `:217-219`; threaded to every `SectionRenderer` at `:378`, `:415-417`.
- `ContextSlot` is the host-supplied widget body — `src/components/builder/widgets.tsx:335-343`, registered for `breadcrumb`, `price_block`, `add_to_cart`, `product_meta`, `page_content` at `widgets.tsx:1612-1617`.
- The account route already builds **live** per-widget context from the merchant's real orders/profile: `src/routes/store.$slug.account.tsx:185-215`.
- The cart route already declares the live-cart context keys: `src/routes/store.$slug.cart.tsx:100-107`.
- The batched data pipeline exists and is the anti-N+1 mechanism: `collectWidgetRequests` (`src/lib/widget-data.ts:154-171`, de-duplicated by content hash, capped at `MAX_WIDGET_REQUESTS = 24`), resolved once per request at `src/lib/storefront.server.ts:485-514` and `src/lib/storefront.server.ts:506-514`.

**What is genuinely missing:** *typed* per-template context contracts. There is no `SearchContext` / `CartContext` / `AccountContext` type and no per-template zod validation of the context object; `contextSlots` is `Partial<Record<SectionType, ReactNode>>` — untyped by construction, because it carries React nodes rather than data.

### §5 — Implement Search as a real theme template

**PARTIALLY HOLDS; two of its premises are CONTRADICTED.**

True and stronger than the brief claims: search has a **real backend** — a pluggable engine with a Postgres RPC fallback, breaker, degradation flag, rate limiting and caching (`src/lib/storefront-search.server.ts:34-86`, `:109-171`, `:218-255`; outcome type `:28-32` with `ok | not_found | rate_limited | unavailable`). And the route **does** fetch the published `search` template: `getStoreChrome({ data: { slug, template: "search" } })` (`src/routes/store.$slug.search.tsx:64`) in parallel with the query (`:49-65`).

**Contradicted — "Provide reusable widgets/components for the search header, query summary, result count, filters/facets, active filter chips, sorting, product/content result grids, pagination…":** every one of those widgets is already in the closed catalogue — `facet_sidebar`, `filter_chips`, `result_toolbar`, `pagination`, `empty_state` (`src/lib/builder-ast.ts:275-280`; registry entries `src/lib/widget-registry.ts:483`, `:504`, `:505`, `:520`, `:524`). Nothing needs to be provided.

**Contradicted — the shape of the remaining work:** the search listing is **one hardcoded React blob**, built at `src/routes/store.$slug.search.tsx:186-529` (query form, filters panel, result count, sort select, degraded notice, empty state, result grid, pager) and handed to `ThemeChrome` as `productSlot={listing}` (`:559`) with the same blob duplicated in `fallback` (`:560-565`). `productSlot` is consumed by **exactly one widget** — `product_grid` (`src/components/builder/widgets.tsx:1447`, `:1491`; `grep -rn "productSlot" src/components/builder/*.tsx | grep -v SectionRenderer` returns only that widget). So a theme can currently place the entire result set only as one indivisible block.

**This yields a concrete, checkable production hazard.** `ThemeChrome` renders the theme's `main` whenever `ast.main.length > 0` and no `contentSlot` gate applies (`src/components/store/ThemeChrome.tsx:302-310`); the route's `fallback` renders only when that is null. Songoskriti's seeded `search` template is `heading` + `rich_text` + `product_rail` — **no `product_grid`** (`src/lib/themes/songoskriti/preview.ts:235-252`) — so on a store whose published `search` template is that seeded body, `themed` is non-null, the `fallback` never renders, and the `productSlot` has no `product_grid` to land in. By code-path reading, the live listing is dropped. *(This is a code-path derivation; I did not run the live storefront — no database is reachable from this environment. It must be confirmed against a live store before it is treated as a shipped bug, and the fix is the same either way.)*

**Consequence:** §5 is a **route change**, not a template change — and it is a change to a revenue surface. The brief's phrasing ("Make Search's layout fully theme-editable") hides that.

### §6 — Implement Cart as a real theme template

**PARTIALLY HOLDS — most of it is already true.**

- The cart route already wears the published `cart` template: `getStoreChrome` (`src/routes/store.$slug.cart.tsx:27`) and `template="cart"` (`:81`).
- The live-cart context keys are already declared (`:100-107`), with the honest comment *"The widgets render live cart data on their own; the keys simply tell the renderer this page owns the cart context."*
- The cart widgets exist and are data-bound: `cart_lines`, `cart_summary`, `cart_drawer`, `free_shipping_bar` (`src/lib/builder-ast.ts:282-287`; `cart_summary` catalogue entry with full coupon/subtotal/shipping/total fields at `builder-ast.ts:1603-1647`; registry `cart_lines` at `src/lib/widget-registry.ts:549`).
- The checkout CTA, empty state and continue-shopping are already in the route's `fallback` (`src/routes/store.$slug.cart.tsx:109+`).

**Not yet true, and correctly identified by the brief:** *"Provide realistic synthetic cart lines and totals to editor preview instead of `null` slots."* The preview does inject `cart_lines: null, cart_summary: null, cart_drawer: null, checkout_steps: null, payment_methods: null` (`src/components/store/ThemePreviewFrame.tsx:570-571`) — but the *strings* the merchant sees ("Sample product") are platform defaults shared by every theme (`src/components/builder/CartContext.tsx:95`), not Songoskriti copy. That is the `report.md` "shared demo data" finding, not a cart-template gap.

### §7 — Implement Account as a real theme template

**HOLDS substantially — this is the section closest to the truth.**

- Route-owned data already exists and is real: `accountSlots` is built from the merchant's own `overview.orders` and `overview.profile` and bound to the theme's `orders_list` / `profile_card` sections (`src/routes/store.$slug.account.tsx:185-215`).
- Authorization is server-side and untouched by the theme: the route owns the session, the widget receives rows.
- The theme template is already consumed: `template="account"` (`src/routes/store.$slug.account.tsx:494`) and the custom-host twin (`src/routes/account.tsx:493`).
- The widgets exist: `orders_list`, `profile_card` (`src/lib/builder-ast.ts:353-354`; registry `src/lib/widget-registry.ts:652`, `:657`).

**Genuinely open:** the *unauthenticated / loading / empty / error* state set is route-owned and not theme-composable, and the subroutes (profile, orders, order detail, tracking) are **not** template-addressed — there is one `account` key, not four. The brief's "applicable existing account subroutes" is honest about that; it should say explicitly that per-subroute theming is a *new* key family, not an extension.

### §8 — Implement Blog as a real theme template

**CONTRADICTED at the premise; the underlying observation survives in a different place.**

- *"Support real article content and media, not hardcoded 'Meet the makers' demonstration text."* The "Meet the makers" string is at `src/lib/themes/songoskriti/preview.ts:228-234` — theme seed/demo copy. The live routes already render real content: the article route renders `ArticleView` (`src/routes/store.$slug.blog.$slug.tsx:12`, `:58-60`) and the listing renders `BlogArchiveTheme` with the tenant's real `listing.articles`, `listing.facets`, `listing.paging` (`src/routes/store.$slug.blog.index.tsx:15`, `:74-92`).
- **The real fact the brief misses:** the `blog` **template key is not consumed by any storefront route.** `grep -rn "template=\"blog\"" src/routes/` returns nothing. The blog listing and the article detail both bypass `ThemeChrome` entirely. So the `blog` template is authored, seeded, previewable and linted — and never rendered on a live store. That is a bigger problem than demo copy, and it is the opposite of "the route renders a bespoke component instead of the template" in one sense and the *same* in another: the route renders a bespoke component **and never asks for the template at all**.

### §9 — Implement Checkout as a themeable but security-restricted template

**CONTRADICTED.**

The tenant checkout route **deliberately refuses the theme's AST**:

```
// src/routes/store.$slug.checkout.tsx:419-421
// The checkout form is hand-built (server-quoted totals, live rails), so
// the theme contributes the tokens only. We drop the normal header and footer.
ast={null}
```

The custom-host twin is nearly as closed: `ast={ast ? { header: ast.header, main: [], footer: ast.footer } : null }` (`src/routes/checkout.tsx:276`) — header/footer only, `main` emptied.

The repository therefore holds two contradictory positions about checkout theming:

- The **platform** says the theme contributes tokens only (`store.$slug.checkout.tsx:419-421`).
- The **theme surface** says otherwise: `TEMPLATE_ZONES.checkout` permits a `thank_you` zone (`src/lib/builder-ast.ts:187`), the `checkout` template is a first-class seeded body (`src/lib/themes/songoskriti/preview.ts:283-317`), the editor exposes a `checkout` tab (`src/routes/_authenticated/dashboard/builder.tsx:205-214`, `:1430-1444`), and the theme-package contract lets a theme declare `checkout` in `templates` (`src/lib/theme-package.ts:352-375`).

The brief assumes the theme-surface position and does not know the platform position exists. Making checkout themeable is a **platform change to a security-sensitive route**, not a theme-authoring task — and `src/routes/**` is *prohibited* by the port spec (§7, below). The brief's own security paragraph (§9) is well-judged, but it is describing a design that must first be approved.

### §10 — Add a first-class Archive template

**CONTRADICTED — the thing §5 and §10 reinvent already exists, and the key duplicates surfaces that already have owners.**

The "blog archive pack" the hypothesis names is real, complete, and **unconnected**:

| Layer | Evidence |
|---|---|
| Section types | `src/lib/builder-ast.ts:350-352` (`blog_archive`, `blog_terms`, `blog_pager`), introduced as *"Phase 8 — blog archive pack: the reader listing as builder widgets, so the blog wears the active theme instead of a hand-written wrapper."* (`:348-349`) |
| Catalogue entries | `src/lib/builder-ast.ts:4834`, `:4886`, `:4909` |
| Studio catalogue | `src/lib/studio/catalog.ts:1277-1298` |
| Renderers | `src/components/builder/blog.tsx:392-394` (`BlogArchiveWidget`, `BlogTermsWidget`, `BlogPagerWidget`) |
| Tests | `src/components/builder/data-part.test.tsx:404-427` |

**No theme uses it.** The Songoskriti `blog` template is `heading` + `image` + `rich_text` (`src/lib/themes/songoskriti/preview.ts:218-234`) — *not* the pack the authoring guide requires of it: `docs/themes/creation.md:36` — *"`blog` template: `blog_terms` + `blog_archive` + `blog_pager` + newsletter"*. **The documented contract and the shipped theme disagree**, and the storefront blog route renders `BlogArchiveTheme` regardless (`src/routes/store.$slug.blog.index.tsx:15`, `:74`).

Against that, the archive *routes* already have owners:

| Archive-like route | Template it resolves to today |
|---|---|
| `/c/<slug>` product listing | `collection` — `src/routes/store.$slug.c.$collectionSlug.tsx:203` |
| `/blog` listing, `/blog/category/<slug>`, `/blog/tag/<slug>`, `/blog/author/<slug>` | `BlogArchiveTheme` — `src/routes/store.$slug.blog.index.tsx:74`; `src/routes/blog.category.$slug.tsx`; `blog.tag.$slug.tsx`; `blog.author.$slug.tsx` |
| `/search?category=` | `search` — `src/routes/store.$slug.search.tsx:36` |

§10's own rule — *"Do not duplicate the existing Product Collection template or silently repurpose the Blog template"* — is violated by adding an `archive` key that sits on top of exactly these surfaces. §10's *"First inventory the actual storefront's archive-like routes"* is the right instruction; the answer is that there is no orphan archive surface waiting for a key.

### §11 — Fix the generic Page template

**CONTRADICTED — see premise table P1/P2 for the full argument.** The short form:

- The live CMS page route renders the merchant's real content: `src/routes/store.$slug.pages.$pageSlug.tsx:66-68` → `PageView`; `src/components/store/PageView.tsx:73-104` renders `page.title`, `page.excerpt`, the sanitised body `html`, and the studio-composed `studioNodes`; `:175-186` passes them as `contextSlots={{ breadcrumb, page_content: content }}` with `contentSlot="page_content"`.
- `ThemeChrome` renders the theme's `main` for a page route **only if the theme declares a `page_content` section** (`src/components/store/ThemeChrome.tsx:302-310`; the rule is documented at `:75-81`: *"demo copy must never swallow merchant content"*). Songoskriti's `page` template declares `heading` + `rich_text` and **no** `page_content` (`src/lib/themes/songoskriti/preview.ts:207-217`), so the route's `fallback` — the real content — renders. The "Size guide" copy is therefore **not** production copy.
- The narrower, real defect: the *seeded default* `page` template contains demo copy, and `registryPackage()` seeds a merchant's templates **from the theme's preview source** (`src/lib/themes.server.ts:1154-1174` → `resolveThemePreview` → `assemblePreviewTemplates`). So a merchant who installs Songoskriti receives a `page` template whose body is "Size guide / How to measure / Demo article…". Today it is invisible in production (no `page_content` section ⇒ the route's body wins). The moment the merchant adds a `page_content` widget to that template, the demo copy renders **above** their real page. That is the bug worth fixing, and it is roughly one-fifth the size of §11 as written.
- §11's *"If no per-page override exists"* is false: `storefront_pages.template` exists (`src/integrations/supabase/types.ts:8355`) and the resolution chain is implemented (`src/lib/builder-ast.ts:8145-8260`).

### §12 — Keep templates and widget presentations separate

**HOLDS — and it is already the platform's law, with a test enforcing it.**

The brief's five-layer model (template composition / theme presentation / route-owned context / platform actions / design tokens) matches the shipped architecture exactly: `SectionRenderer` resolves the widget from the closed registry and the theme-keyed presentation registry (`src/components/builder/SectionRenderer.tsx:272-274`: *"the widget itself comes from the closed registry in `./widgets`, so this component never grows a per-widget branch"*); the theme-keyed presentation registry is `src/lib/theme-presentations.ts`; the data bundle is `src/lib/widget-data.ts`; tokens are `src/lib/theme-globals.ts` / `src/lib/builder-ast.ts`.

It is also **enforced**: `src/lib/definition-of-done.test.ts:102-238` ("DoD 5 — ≥70% shared registry, no theme-exclusive renderer branches") asserts that no renderer in `src/components/builder/*.tsx` takes, compares, switches on, or names a theme key, and that vertical modules stay a minority of the registry (`:144`).

**The one correction:** the brief's rule *"Do not implement a template by hardcoding a large JSX branch per theme and route"* is stated as a prohibition but the repository **already contains exactly that**, at scale, on the routes the brief wants to make themeable: the search listing (`src/routes/store.$slug.search.tsx:186-529`), the account dashboard (`src/routes/store.$slug.account.tsx:~380-490`), the checkout form (`src/routes/store.$slug.checkout.tsx:419+`). The rule is right; the brief does not apply it to the code that exists, and it does not say which of those blobs is *allowed* to stay a blob.

### §13 — Update default templates, official themes, and publishing

**PARTIALLY HOLDS; the scope is CONTRADICTED.**

True: theme installation must seed missing defaults without overwriting merchant edits; theme switches must not leak layouts; publishing/versioning/rollback already exist (`theme_drafts` / `theme_versions` / `theme_schedules`, `src/lib/themes.server.ts:230-236`; publish path `:674-700`).

**Contradicted — "default template ASTs for every supported template in each official theme" vs. "Use Songoskriti as the primary port and visual acceptance target."** These are two different scopes and the brief carries both:

- There are exactly **two** official themes: `OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"]` (`src/lib/themes/builtin-themes.ts:15`), and *"This map is the ONLY place that names official themes for identity"* (`:3-11`).
- Somvabona authors **no** `search` / `cart` / `account` / `page` / `blog` / `checkout` template. Its `preview.ts` has no `case "search"` (and no other non-homepage case), so every one of those surfaces falls through to the engine's generic demo body: `genericDemoMain` (`src/lib/theme-preview-nav.ts:340-373`) with the copy *"Demo page. The live theme authors this template — what you see here is the engine fallback."* (`:365-370`).

So "every supported template in each official theme" is **2 × 9 = 18 authored bodies** (or 2 × 10 with `archive`), of which Songoskriti already ships 9 (one generic each) and Somvabona ships 3. The brief must choose one scope.

**Also uncredited and material:** *"the theme's `index` template is not what renders the tenant storefront homepage."* Both index routes render either the merchant's CMS-designated homepage (via `StoreHomepage`, which uses `template="page"` — `src/components/store/StoreHomepage.tsx:101-103`) or a static "Welcome to Framique" plate (`src/components/store/StoreWelcome.tsx:14-18`; `src/routes/store.$slug.index.tsx:461-475`; `src/routes/index.tsx:180-195`). The index template AST *is* loaded (`src/lib/storefront.server.ts:473` → `resolveIndexTheme`) but is used only in the isolated-theme branch (`src/routes/store.$slug.index.tsx:451`). This is deliberate — commit `b08f6819` *"feat(storefront): Welcome to Framique default homepage"* — and `src/lib/storefront.server.ts:578-580` still carries a **stale comment** claiming the opposite (*"falls back to the theme index template below"*). If that is the intended product state, then the 21-section Songoskriti homepage the port produced never reaches a shopper, and §13's investment is misdirected; if it is drift, it is a P0 the brief does not know about. **This is a judgement call for the owner (§8, J4).**

### §14 — Fix the preview system

**PARTIALLY HOLDS; one rule is CONTRADICTED and is currently violated.**

True: the preview should use the same registry, section renderer and schema contract as the storefront — and it already does. `ThemePreviewFrame` renders the theme's AST through `SectionRenderer` (`src/components/store/ThemePreviewFrame.tsx:89` holds `templates: Record<TemplateKey, ThemeAst>`), and the engine assembles every template from the theme's own source (`assemblePreviewTemplates`, `src/lib/theme-preview-nav.ts:380-405`).

**CONTRADICTED — "Unknown template names must produce a clear, intentional unsupported state or documented redirect. Do not silently render the homepage."** The preview does precisely the forbidden thing:

```
// src/components/store/ThemePreviewFrame.tsx:485
const ast = templates[template] ?? templates.index;
```

A theme that forgot a template silently shows its **homepage** there. `report.md` §7 item 4 names this as the reason "a missing template is invisible" and it is a two-line fix.

**Also uncredited:** the preview *deliberately* differs from the storefront in data, and the brief's §14 asks for something the codebase already decided against. `ThemePreviewFrame` is a modal that blocks interaction (`role="dialog" aria-modal="true"`, `:580-581`) and injects **null** context slots (`:570-571`) and shared platform demo strings — "Sample product" (`src/components/builder/CartContext.tsx:95`), "Demo Shopper" (`src/lib/preview-demo-data.ts:42`). §14's "Label preview data and disable or stub mutations explicitly" is the right fix; §14's implicit "make preview == storefront" is not reachable without live data and an auth context the anonymous preview does not have (`report.md` Option C, flagged there as escalation-required).

### §15 — Accessibility, SEO, and performance

**HOLDS — and it is already enforced.**

- One H1 per page: `ROUTE_H1_TEMPLATES` (`src/lib/builder-ast.ts:68-75`), `routeSuppliesH1` (`:77-79`), `primarySectionId` (`:88-106`), and a `lintTemplate` that is strict in **both** directions (`:62-67`): route-headed templates must contain no h1-claiming widget, every other template must contain exactly one. The authoring guide states the same rule for third parties (`docs/themes/creation.md:805-809`).
- Per-template SEO already has a first-class store: `builder_template_seo` with a `template` column (`src/integrations/supabase/types.ts:1356`), read by `loadTemplateSeoMap` and keyed by `TEMPLATE_KEYS` (`src/lib/template-seo.server.ts:75-80`).
- Performance budgets are codified: `TEMPLATE_JS_BUDGET` per template (`src/lib/widget-weight.ts:205-215`, checkout deliberately tightest), `LIGHTHOUSE_BUDGET` floors (`src/lib/web-vitals.ts`, asserted `src/lib/definition-of-done.test.ts:40-48`), and the one-batched-data-call-per-render rule (`:50-74`).

§15 is the brief's most accurate section. The only addition it needs: if `archive` is added, it needs a `TEMPLATE_JS_BUDGET` entry and an h1 ruling.

### §16 — Security and tenant isolation

**HOLDS.** The constraints listed are the ones the code already enforces: server-authoritative prices/totals (`src/routes/store.$slug.checkout.tsx` — server-quoted totals, live rails), customer-scoped account data (`src/routes/store.$slug.account.tsx:185-215`), tenant-scoped search (`resolveStore` → `merchants` by slug + active status, `src/lib/storefront-search.server.ts:88-107`), and package-level gates (Level B approval, fingerprint binding, capability checks, asset isolation, revocation — `src/lib/theme-package.ts`, `src/lib/plugin-manifest.ts`).

One addition the brief should make: §16 says *"Unknown widgets and incompatible templates must fail safely without silently displaying another theme's content."* The **theme presentation** layer does that. The **template** layer does not, in the preview: `templates[template] ?? templates.index` (§14) is precisely "silently displaying another template's content". §16 and §14 are internally inconsistent, and the repo currently implements §14's forbidden behaviour.

### §17 — Required regression and end-to-end tests

**PARTIALLY HOLDS — the level structure is right; the inventory is wrong.**

The three levels (contract/unit, integration, browser E2E) are the right shape. But:

- The unit/contract level **already exists and is platform-wide**: `src/lib/definition-of-done.test.ts` (277 lines, seven DoD blocks) — see §19.
- The E2E level **already exists and is frozen**: `.e2e/songoskriti-port-parity.spec.ts` (9 templates × 3 widths × 2 locales, `maxDiffPixelRatio: 0.02`, `threshold: 0.2`), with baselines in `docs/superpowers/songoskriti-evidence/port/reference/` and a recorded green run (`…/parity-report.md`: *"60 passed / 1 skipped / 0 failed"*).
- The asset validation **already exists and is wired into the release gate**: `node scripts/songoskriti-assets-check.mjs` → `songoskriti asset gate GREEN — 0 findings, 11 note(s)`; `package.json` `gates:release` runs `bun run assets:songoskriti` first, and `gates` chains `typecheck → test → test:contracts → schema:check → … → gates:release`.

§17's *"Include the Songoskriti visual-parity fixtures and asset validation"* therefore reads as new work when it is existing, frozen, gate-wired work. The one genuinely missing test is the **distinctness** test — the thing `report.md` §5 identifies and no gate in the repository asks for.

### §18 — Update the documentation

**PARTIALLY HOLDS.** The canonical internal docs exist and are current: `docs/themes/creation.md` (author guide, "Last verified: 2026-10-20 @ 58bbe33e9c8e"), `docs/themes/songoskriti-port-map.md`, `docs/themes/packages.md`, `docs/themes/presentation-primitives.md`, `docs/04-builder/sections-templates.md`, `docs/04-builder/theme-runtime.md`, `docs/03-storefront/*`. A doc gate exists and is wired into `gates:release` (`bun run doc:gate`, `scripts/doc-gate.mjs`).

**The gap §18 does not name is a live contradiction in the canonical docs**, not a missing doc: `docs/themes/creation.md:36` says the `blog` template must be `blog_terms` + `blog_archive` + `blog_pager` + newsletter, and the shipped Songoskriti `blog` template is `heading` + `image` + `rich_text` (`src/lib/themes/songoskriti/preview.ts:218-234`). The guide is wrong about the shipped theme, and nothing catches it. The brief's own rule — *"only mark a guide verified after comparing it with the actual implementation and tests"* — is right; it just needs to be pointed at this specific line.

### §19 — Definition of done

**CONTRADICTED — it duplicates a shipped, enforced file.**

`src/lib/definition-of-done.test.ts` is the platform-wide definition of done, and it is executable:

| Block | Lines | What it pins |
|---|---|---|
| DoD 2 — performance budgets codified | `:40-48` | Lighthouse ≥90, a11y ≥95, LCP ≤2500 ms, CLS ≤0.02, INP ≤200 ms |
| DoD 3 — one batched data call per template render | `:50-74` | `collectWidgetRequests` dedupe + every data node mapped |
| DoD 4 — money is a server integer | `:76-100` | minor-unit formatting; no client-side `/100` in any builder renderer |
| DoD 5 — ≥70% shared registry, no theme-exclusive renderer branches | `:102-238` | no renderer takes/compares/switches on a theme key; vertical modules <50% of the registry |
| DoD 6 — sandboxed, versioned, budgeted, kill-switchable | `:240-264` | `HtmlSandbox` shape; `PLUGIN_BUDGET`; API-range compatibility |
| DoD 7 — demo import idempotent and reversible | `:266-277` | `importDemoContent` / `purgeDemoContent` |

§19's items 7 ("All protected commerce and account operations remain platform-authorized"), 8 ("Unit, integration, and authenticated browser tests pass") and 10 ("CI passes on the actual target branch commit") are **already** this file's job, expressed as prose. §19's *new* content is items 1-6, 9 and 11 — which is what a template-specific DoD should contain, and which should be expressed as a **new test file** rather than a document, so it cannot drift the way `docs/themes/creation.md:36` already has.

---

## 3. Premise-correction table

Each row: the brief's wording, what the repository actually does (with evidence), and the consequence for the plan.

| # | Brief premise (quoted) | What the repo actually does (evidence) | Consequence for the plan |
|---|---|---|---|
| **P1** | §Mission/§11: *"the CMS renders the actual page selected by the merchant … not a hardcoded Size Guide, demonstration copy, or generic fallback body"* | The live page route renders the real content: `src/routes/store.$slug.pages.$pageSlug.tsx:66-68` → `PageView`; `src/components/store/PageView.tsx:73-104` (title, excerpt, sanitised `html`, `studioNodes`); `:175-186` passes `contextSlots={{ breadcrumb, page_content: content }}` + `contentSlot="page_content"`. `ThemeChrome` renders the theme main **only if it declares `page_content`** (`ThemeChrome.tsx:302-310`; rule at `:75-81`). Songoskriti's `page` template declares `heading`+`rich_text` and no `page_content` (`src/lib/themes/songoskriti/preview.ts:207-217`) ⇒ the route's real content renders. The literal "Size guide" exists only at `src/lib/themes/songoskriti/preview.ts:209`. | §11 is **not** a "required functional fix" as described. Re-scope to: (a) strip demo copy from the **seeded** `page` template (seeded via `registryPackage` → `src/lib/themes.server.ts:1154-1174`), (b) make `page_content` the one documented way to lay out a page body, (c) add the "merchant added `page_content` ⇒ demo copy must not render above it" regression. Budget ≈ ⅕ of §11. |
| **P2** | §11: *"If no per-page override exists, use the theme's shared Page template with the selected page's actual content."* | A per-page override **does** exist: `storefront_pages.template` (`src/integrations/supabase/types.ts:8355`), and the whole resolution chain is implemented — `resolveTemplateCandidates` / `resolveTemplate` / `templateSuffixFromOverride` (`src/lib/builder-ast.ts:8145-8260`), with the documented fallback order `<base>_<suffix>` → `<base>_<slug>` → `page_<slug>` → `<base>` → `page` → `index`. | Do **not** propose a new per-page assignment mechanism. Verify and use the existing one, and record its hazard: the chain falls through to `index`, and an empty variant does not shadow its base (`builder-ast.ts:8155-8163`). |
| **P3** | §3: *"Add or complete a template manager within the existing CMS/theme editor."* | The manager exists: switcher `src/components/builder/BuilderTopBar.tsx:413`; tab bar `src/routes/_authenticated/dashboard/builder.tsx:1430-1444`; palette `builder.tsx:1306-1312`; per-template mutation isolation `src/hooks/use-builder-editor.ts:332-345`; per-template lint `use-builder-editor.ts:632-636`; autosave/version/publish/schedule `builder.tsx:565-570`, `:1212`, `:1223`; device preview `builder.tsx:433`, `:547`. | Delete the work item. §3 becomes "the manager is done; the missing thing is *content*, not chrome", plus a regression test for the isolation property below. |
| **P4** | §3: *"Saving Search must not overwrite Cart, editing Account must not change Page."* | **Already true, structurally**: every mutation is `current.templates[template]` scoped (`src/hooks/use-builder-editor.ts:336-344`). | Convert from a work item to a **test**. Do not spend design effort on a property the data structure already guarantees. |
| **P5** | §5: *"Provide reusable widgets/components for the search header, query summary, result count, filters/facets, active filter chips, sorting, product/content result grids, pagination or supported incremental loading, and empty/error states."* | All of them exist in the closed catalogue: `facet_sidebar`, `filter_chips`, `result_toolbar`, `pagination`, `empty_state` (`src/lib/builder-ast.ts:275-280`; registry `src/lib/widget-registry.ts:483`, `:504`, `:505`, `:520`, `:524`). | §5's real work is **wiring the route's live result set into those widgets** — a route change, not widget authoring. Remove the "provide widgets" line entirely. |
| **P6** | §5: *"Make Search's layout fully theme-editable."* | The listing is one hardcoded React blob (`src/routes/store.$slug.search.tsx:186-529`) passed as `productSlot` (`:559`) and duplicated in `fallback` (`:560-565`); `productSlot` is consumed by exactly one widget — `product_grid` (`src/components/builder/widgets.tsx:1447`, `:1491`). `ThemeChrome` renders the theme main whenever `ast.main.length > 0` and no `contentSlot` gate applies (`ThemeChrome.tsx:302-310`). Songoskriti's seeded `search` template has no `product_grid` (`src/lib/themes/songoskriti/preview.ts:235-252`). | §5 is a **route change** on a revenue surface: split the listing into per-widget context slots and pass them through `contextSlots`. Must be scoped, reviewed and regression-tested against a live result set — and it requires a port-spec escalation (all `src/routes/**` is prohibited). |
| **P7** | §4: *"Introduce or extend a typed, validated render context for each template, populated by the existing server-side route/data layer."* | The mechanism exists: `contextSlots` / `productSlot` / `collectionSlot` / `contentSlot` (`src/components/store/ThemeChrome.tsx:48-50`, `:82`, `:217-219`, `:378`, `:415-417`); `ContextSlot` widget body (`src/components/builder/widgets.tsx:335-343`); live account context (`src/routes/store.$slug.account.tsx:185-215`); live cart context keys (`src/routes/store.$slug.cart.tsx:100-107`); one-batch data pipeline (`src/lib/widget-data.ts:154-171`; `src/lib/storefront.server.ts:485-514`). What is missing is **typed per-template context types** — `contextSlots` carries React nodes, not data. | §4 is an **extension, not an introduction**. Budget for typed context shapes + validation, not for a new context system. Do not build a parallel mechanism. |
| **P8** | §8: *"Support real article content and media, not hardcoded 'Meet the makers' demonstration text."* | "Meet the makers" is theme seed copy (`src/lib/themes/songoskriti/preview.ts:228-234`). The live routes already render real content: `ArticleView` (`src/routes/store.$slug.blog.$slug.tsx:12`, `:58-60`); `BlogArchiveTheme` with real `listing.articles` / `facets` / `paging` (`src/routes/store.$slug.blog.index.tsx:15`, `:74-92`). **And the `blog` template key is read by no route at all** (`grep -rn 'template="blog"' src/routes/` ⇒ empty). | §8's premise is wrong; the real problem is bigger: *the blog template is never rendered*. Re-scope to "connect the `blog` template to the blog route using the **existing** `blog_archive`/`blog_terms`/`blog_pager` pack, or explicitly retire the key" — and fix `docs/themes/creation.md:36`, which currently promises a composition the theme does not ship. |
| **P9** | §9: *"Allow the theme to design the checkout shell and approved presentation components…"* | The route refuses the theme AST: `src/routes/store.$slug.checkout.tsx:419-421` — `ast={null}`, *"the theme contributes the tokens only"*; the custom-host twin keeps header/footer only (`src/routes/checkout.tsx:276`). Meanwhile the theme surface implies otherwise: `TEMPLATE_ZONES.checkout` allows `thank_you` (`src/lib/builder-ast.ts:187`); the `checkout` template is seeded (`src/lib/themes/songoskriti/preview.ts:283-317`); the editor exposes a `checkout` tab (`builder.tsx:205-214`); packages may declare `checkout` (`src/lib/theme-package.ts:352-375`). | §9 is not a theme-authoring task. It is a platform decision about a security-sensitive route, and it needs an owner ruling **before** any plan exists. If the answer is "tokens only", the `checkout` template key is documentation, not a surface. |
| **P10** | §10: *"Implement `archive` as a real template key and editor option."* + *"Do not duplicate the existing Product Collection template or silently repurpose the Blog template."* | The blog-archive pack §5/§10 reinvent already exists, is fully wired to the catalogue/registry/studio, and is **unconnected**: `src/lib/builder-ast.ts:350-352` (types; introduced as *"so the blog wears the active theme instead of a hand-written wrapper"*, `:348-349`), `:4834`/`:4886`/`:4909` (catalogue), `src/lib/studio/catalog.ts:1277-1298` (studio), `src/components/builder/blog.tsx:392-394` (renderers), `src/components/builder/data-part.test.tsx:404-427` (tests). No theme uses it. The archive *routes* already have owners: `collection` (`src/routes/store.$slug.c.$collectionSlug.tsx:203`), `BlogArchiveTheme` (`src/routes/store.$slug.blog.index.tsx:74`; `src/routes/blog.category.$slug.tsx`; `blog.tag.$slug.tsx`; `blog.author.$slug.tsx`). | Do **not** add the key. Deliver the archive capability by **connecting the existing pack** to the `blog` template. If the owner still wants a distinct key, it needs a named route that no existing template owns — see judgement call **J1**. |
| **P11** | §13: *"Provide appropriate default template ASTs for every supported template in each official theme."* + Mission: *"Use Songoskriti as the primary port and visual acceptance target."* | Two official themes only: `OFFICIAL_THEME_KEYS = ["songoskriti","somvabona"]` (`src/lib/themes/builtin-themes.ts:15`, "the ONLY place that names official themes for identity", `:3-11`). Somvabona authors **no** non-homepage template — its `preview.ts` has no `case "search"` — so its search/cart/account/page/blog/checkout all fall through to the engine's generic demo body (`src/lib/theme-preview-nav.ts:340-373`, copy at `:366-370`). | "Every template in each official theme" = 18 bodies; "Songoskriti primary" = 9. The brief carries both. Pick one — see judgement call **J3**. Do not budget 18 when the plan means 9. |
| **P12** | §14: *"Unknown template names must produce a clear, intentional unsupported state or documented redirect. Do not silently render the homepage."* | The preview does the forbidden thing: `const ast = templates[template] ?? templates.index;` (`src/components/store/ThemePreviewFrame.tsx:485`). The engine also silently synthesises a generic demo body for unauthored templates (`src/lib/theme-preview-nav.ts:400`). | Two-line fix, and it is the cheapest high-value item in the whole brief. It also restores the brief's own §16 rule ("must fail safely without silently displaying another theme's content"), which the repo currently violates. |
| **P13** | §2: *"A stable template key and schema/API version."* | There is **no** per-template schema or API version. The only version is the global builder API: `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`), `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:52`), `PRESET_API_RANGE = "^3.0.0"` (`src/lib/registry-version.ts:14`). A repo-wide search for `templateVersion|template_version|schemaVersion|schema_version` returns only an unrelated DB column (`src/integrations/supabase/types.ts:3137`). | Either drop the requirement or design the contract (a per-template `schemaVersion` on the AST + a migration path). The brief asserts the requirement without specifying it, which is how it becomes unfunded work. |
| **P14** | §2: *"Extend the existing template-key system to include `archive` while preserving existing template identifiers and serialized content."* | Adding a key is wider than the brief implies: ≥6 exhaustive `Record<TemplateKey,…>` maps (`src/lib/builder-ast.ts:156`, `:517`; `src/routes/_authenticated/dashboard/builder.tsx:205`; `src/lib/widget-weight.ts:205`; `src/lib/theme-preview-nav.ts:340`; `src/components/store/ThemePreviewFrame.tsx:89`), a runtime `z.enum` of the nine keys (`src/lib/storefront.functions.ts:97-107`), the theme-package `TEMPLATE_SET` (`src/lib/theme-package.ts:172`, `:352-375`), the per-template SEO map (`src/lib/template-seo.server.ts:75-80`), the linter over every key for every shipped theme (`src/lib/themes.server.ts:849`, `:1354`, `:1380`, `:1591`), and translation coverage (`src/lib/translation-coverage.ts:93`). Critically, **`parseTemplates` drops unknown keys** (`src/lib/builder-ast.ts:8120-8124`), so an `archive` template persisted before the union grows is silently discarded on read. | If a key is added, the change must be **atomic**: union + `z.enum` + storage read + a route that reads it + a default body for **both** official themes. A key that exists in the editor and the package format but is read by no route is a new "invisible gap" — exactly the failure the preview fallback already hides (P12). |
| **P15** | §17: *"Include the Songoskriti visual-parity fixtures and asset validation."* | Both exist and are already gate-wired: `node scripts/songoskriti-assets-check.mjs` ⇒ *"songoskriti asset gate GREEN — 0 findings, 11 note(s)"*; `package.json` `gates:release` runs `bun run assets:songoskriti` first; the frozen parity baselines are `docs/superpowers/songoskriti-evidence/port/reference/` with `.e2e/songoskriti-port-parity.spec.ts` (9 templates × 3 widths × 2 locales, `maxDiffPixelRatio: 0.02`) and the recorded run *"60 passed / 1 skipped / 0 failed"* (`…/port/parity-report.md`). | Treat these as **frozen baselines to preserve**, not new artefacts. A new `archive` template has no baseline — adding it to the parity spec's `TEMPLATES` list without a freeze would silently change what "parity" means. |
| **P16** | §1: *"Before modifying code, produce an implementation map showing where each of the seven requested template types is defined, edited, persisted, populated with data, and rendered."* | A **theme-port** map exists (`docs/superpowers/songoskriti-evidence/port/inventory.md`, `…/classification.md`, `docs/themes/songoskriti-port-map.md`) and the generic-ness diagnosis is already committed at HEAD: `report.md` §2, §5, §8 (Options A-E, incl. the **distinctness gate**). The brief cites none of it. | The map the brief wants is still needed — but as a **route-level delta** (which route reads which template, which context slot carries which data), and the plan should start from `report.md` Option A + B rather than re-deriving the diagnosis. |
| **P17** | §19: *"This work is complete only when all of the following are demonstrated…"* (11 items) | `src/lib/definition-of-done.test.ts` already codifies, executably, the platform-wide equivalent: performance budgets (`:40-48`), one batched data call per template render (`:50-74`), money as server integer (`:76-100`), ≥70% shared registry with no theme-exclusive renderer branches (`:102-238`), sandbox/version/budget/kill-switch (`:240-264`), reversible demo import (`:266-277`). | §19 must be **additive and executable**: a new template-specific DoD *test file* for items 1-6, 9, 11 — not a prose restatement of DoD 2-8. Prose drifts; `docs/themes/creation.md:36` is the proof. |

**Count: 17 material premise corrections** (P1-P17).

### 3.1 The premise the brief never states, and the repo contradicts by omission

| Brief silence | Repo fact | Consequence |
|---|---|---|
| No mention of the port spec's core-file prohibition | `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-156` §7: **editable** = `src/lib/themes/songoskriti/**`, `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts`, new test/fixture files, new `.e2e/` specs/helpers, `docs/**`, `scripts/**` (incl. the asset-gate scripts), `examples/starter-plugin/**` + `examples/starter-theme/**`; **prohibited** = `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, `src/lib/theme-presentations.ts`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `heritage.tsx`, `theme-widgets.ts`, **all `src/routes/**`**, `EditorShell`/`StudioBuilder`, existing test files and their `.snap`, existing `.e2e/**` files, "and everything else under `src/`". **Escalation:** *"any required capability missing in core → stop, report, wait for a decision. Never edit silently."* | §3 (core editor), §4 (`editor/**`), §5 (`routes/**` + `widgets.tsx`), §9 (`routes/**`), §10 (`builder-ast.ts`), §11 (`builder-ast.ts`, `widgets.tsx`) **all touch prohibited files**. Under §7, each is an **escalation**, not a task. The brief's plan reads as if the boundary does not exist. Only the theme-owned phases (authoring bodies in `src/lib/themes/songoskriti/preview.ts`, new tests, new scripts, docs) are executable without an owner decision. |
| No mention of the frozen parity baseline | `docs/superpowers/songoskriti-evidence/port/reference/` (54+ stills) + `reference-manifest.json` (freeze SHA `9e6806329d47`) + `.e2e/songoskriti-port-parity.spec.ts` | Any change to shared widget markup or to the theme's seeded bodies moves every still. "Run the real tests rather than treating the existence of test files as completion" (§17) is right; add "and never `-u` a parity baseline without a recorded, approved diff". |
| No mention of the asset gate | `scripts/songoskriti-assets-check.mjs` + `scripts/songoskriti-assets-{manifest,image}.mjs` + `scripts/songoskriti-assets-expected.json`; `package.json` `assets:songoskriti`, `assets:songoskriti:gen`; first step of `gates:release` | §17/§19's "asset checks pass" is already a merge blocker. A new template that references new art must extend the expected-asset file, or the release gate fails. |
| No mention of the "distinctness" gap | `report.md` §5: *"no gate asks 'is this template actually a Songoskriti design, or the shared default with the theme's logo on top?'"*; the port map records **ownership** (lane c) but never **distinctness** (`docs/superpowers/songoskriti-evidence/port/classification.md`, rows `TPL-SEARCH`/`TPL-CART`/`TPL-ACCOUNT`/`TPL-PAGE`/`TPL-BLOG` → `preview.ts:214/232/297/186/197`) | The single acceptance criterion the whole programme needs is missing from the brief. See the re-cut plan Phase 1. |
| No per-task sequencing, acceptance, file targets, or ownership | `plan.md` has none of these anywhere | A brief of this size with 19 sections, 7 surfaces and no ordered task list with per-task acceptance is a **scope document**. It cannot be handed to an implementer. See §6. |
| Scope contradiction | §13 *"every supported template in each official theme"* vs Mission *"Songoskriti as the primary implementation and visual-verification target"* | Unfunded ambiguity of ≈9 template bodies (P11). Must be resolved by the owner (J3). |

---

## 4. What the brief gets right (keep these)

Specific, evidence-backed, and worth carrying into the re-cut:

1. **§1's audit-first posture, and the sentence "Do not assume preview behavior and storefront behavior are identical."** This is the brief's best line. The repository proves it matters: the preview is a modal with nulled context slots (`ThemePreviewFrame.tsx:570-581`) while the storefront is not, and the *same* theme source produces a live page and a demo page (`registryPackage` → `src/lib/themes.server.ts:1154-1174`). Keep this line verbatim as the gate before any code.
2. **§12's template-vs-presentation separation** — already the platform's law and already test-enforced (`src/lib/definition-of-done.test.ts:102-238`). Keep §12 as a *constraint on the re-cut*, and cite the DoD 5 test as its enforcement.
3. **§16's security posture** — server-authoritative money, tenant-scoped search, customer-scoped account data, no raw DB/secrets to themes, fail-safe on unknown widgets. Matches the code (`src/lib/storefront-search.server.ts:88-107`; `src/routes/store.$slug.account.tsx:185-215`; `src/lib/theme-package.ts` fail-closed gate). Keep verbatim.
4. **§15's "one well-defined primary heading" and its per-template budget** — already implemented (`ROUTE_H1_TEMPLATES` `src/lib/builder-ast.ts:68-75`; `TEMPLATE_JS_BUDGET` `src/lib/widget-weight.ts:205-215`; `LIGHTHOUSE_BUDGET` asserted `definition-of-done.test.ts:40-48`). Keep; it needs no new work, only an `archive` entry if a key is added.
5. **§4's insistence on using existing source-of-truth records rather than duplicate data models** — exactly right, and the batched pipeline (`src/lib/widget-data.ts:154-171`) is the mechanism to cite.
6. **§5's rule that widget settings "may not bypass result limits or authorization"** — matches the real backend's rate limiting and tenant scoping (`src/lib/storefront-search.server.ts:38-42`, `:88-107`).
7. **§9's payment-security rules** (no custom widget processes payments, no arbitrary JS on the checkout page, no popup over a payment step) — and note the code already implements the last one: `TEMPLATE_ZONES.checkout` deliberately omits `popup`/`drawer`/`sidebar` (`src/lib/builder-ast.ts:187`, with the rationale at `:146-154`). The brief should cite the existing implementation instead of restating the rule.
8. **§14's "Label preview data and disable or stub mutations explicitly"** — correct, and cheaper than the alternative; `report.md` Option C (live data in preview) is the expensive one and is escalation-gated.
9. **§18's "only mark a guide verified after comparing it with the actual implementation and tests"** — correct, and the repo has a live counter-example to act on (`docs/themes/creation.md:36` vs. `src/lib/themes/songoskriti/preview.ts:218-234`).
10. **The closing "Final product requirement"** — "Songoskriti must be the proof that this is a working end-to-end CMS capability — not a set of attractive but disconnected preview pages" is the right acceptance idea. It needs one addition: the proof must be **a published storefront page, not a preview** (which is precisely the gap `report.md` §5 names).

---

## 5. What the brief misses

1. **The frozen parity evidence.** `docs/superpowers/songoskriti-evidence/port/reference/` — 54 template stills (9 templates × 3 widths × 2 locales) + chrome stills, with `reference-manifest.json` (freeze SHA `9e6806329d47`) and the recorded green run in `…/port/parity-report.md` (*"60 passed / 1 skipped / 0 failed / 0 flaky"*). The brief treats parity as future work; it is a frozen baseline the work must not move, and `.e2e/songoskriti-port-parity.spec.ts` is listed as a prohibited existing `.e2e` file by the port spec §7.
2. **The asset gate.** `scripts/songoskriti-assets-check.mjs` (+ `songoskriti-assets-manifest.mjs`, `songoskriti-assets-image.mjs`, `songoskriti-assets-expected.json`, `gen-songoskriti-assets.mjs`), exposed as `bun run assets:songoskriti` / `assets:songoskriti:gen`, and **first in `gates:release`**. Current state: `songoskriti asset gate GREEN — 0 findings, 11 note(s)`. A new template that references new art must extend the expected-asset file or the release gate fails.
3. **The API-version / compatibility consequence of adding a template key.** `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:52`) and `PRESET_API_RANGE = "^3.0.0"` (`src/lib/registry-version.ts:14`) both sit under `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`). A new template key does not break either range; but because a package's `templates` array is a *subset* check (`theme-package.ts:172`, `:352-375`), third-party packages keep validating while shipping no `archive` template, and the *storage* side drops unknown keys on read (`builder-ast.ts:8120-8124`). There is also **no per-template API version at all** (P13) — the brief's "schema/API version" requirement has no counterpart.
4. **The port spec's boundary and escalation rule.** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-156` §7 — the editable/prohibited lists and *"any required capability missing in core → stop, report, wait for a decision. Never edit silently."* Six of the brief's seven surfaces require prohibited files, so **the work touches prohibited core by construction** and every such step is an escalation, not a task.
5. **The scope contradiction** between "Songoskriti as the primary target" and "default template ASTs for every supported template in each official theme" (P11), and the hard fact that **Somvabona authors none of the non-homepage templates** — its surfaces fall through to the engine's generic demo body (`src/lib/theme-preview-nav.ts:340-373`).
6. **The absence of sequencing, per-task acceptance, file-level targets, and ownership.** The brief has 19 sections and zero ordered tasks; each section is a scope statement. A plan needs, per task: the file(s) to touch, the acceptance command, the evidence path, and the owner. §6 below supplies the skeleton.
7. **The already-committed diagnosis.** `report.md` at HEAD answers the brief's central question and names the missing gate. A re-cut should cite it rather than re-derive it.
8. **The `blog` template being read by no route** (P8) and **`docs/themes/creation.md:36` promising a composition the theme does not ship** — a live doc/implementation contradiction the brief's §18 would have caught had it started from the code.
9. **The `index` template not rendering on the tenant storefront homepage** (deliberate, commit `b08f6819`; the stale comment at `src/lib/storefront.server.ts:578-580`). The brief budgets "default template ASTs for every supported template" without knowing that the most expensive template the port produced is not on the storefront homepage path.
10. **The preview's silent homepage fallback** (`ThemePreviewFrame.tsx:485`) — a two-line fix that removes the class of bug the brief is worried about in §14, and that no existing gate catches.
11. **The `blog_archive` / `blog_terms` / `blog_pager` pack** — built, catalogued, studio-mirrored, tested, and used by nobody. It is the archive capability §10 asks to be invented.
12. **The `page_content` slot contract.** `ThemeChrome`'s `contentSlot` mechanism (`ThemeChrome.tsx:75-90`, `:302-310`) is the actual, shipped answer to §11's "the `page` template must be an editable layout shell into which the real selected CMS page content is rendered" — and it is already implemented. The brief describes a feature the repo has.

---

## 6. Risk ranking

Ordered by severity. Each: mechanism of failure → cheapest mitigation.

### R1 (biggest) — Re-implementing capability that already exists

**Mechanism.** The brief's verb set is written against an imagined baseline. "Add or complete a template manager" (→ `BuilderTopBar.tsx:413`, `builder.tsx:1430`), "Introduce or extend a typed, validated render context" (→ `contextSlots`, `collectWidgetRequests`), "Provide reusable widgets/components for the search header … filters/facets … sorting … pagination" (→ `facet_sidebar`/`filter_chips`/`result_toolbar`/`pagination`/`empty_state`), "Add a first-class Archive template" (→ `blog_archive`/`blog_terms`/`blog_pager`), "Update the save, publish, version snapshot, migration, and rollback paths" (→ `theme_drafts`/`theme_versions`/`theme_schedules`, `src/lib/themes.server.ts:230-236`). Because each "add" lands on a name that already exists, the implementer's natural move is to *extend the existing thing* — but the brief gives no map telling them which is which, so the equally natural move is to *build beside it*. A parallel mechanism is worse than no mechanism: it forks the AST contract, splits the widget registry, doubles the data-bundle surface, invalidates the DoD 5 "no theme-exclusive branch" test's clean assumption, and — because `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx` and `src/routes/**` are *prohibited* by port spec §7 — most of the forking attempts are escalations that stop the programme mid-flight. The failure mode is a week of work producing a second, parallel, unwired thing.

**Cheapest mitigation.** Phase 0 below: a one-page table with three columns (**exists** / **extend** / **new**) and a `file:line` for every surface, produced *before* any code. Kill every "add" that lands on an existing name unless a specific `file:line` proves the existing one insufficient. Cost: hours. Value: removes the largest cost in the programme.

### R2 — Shipping a template key that no route reads

**Mechanism.** `archive` is proposed as a key. Adding it to `TEMPLATE_KEYS` touches ≥6 exhaustive maps, a runtime `z.enum`, the theme-package validator, the per-template SEO map, and the linter over every shipped theme (P14) — and `parseTemplates` **drops unknown keys on read** (`builder-ast.ts:8120-8124`), so any stored `archive` template is silently discarded until the union grows. Meanwhile the four candidate archive routes (`/c/<slug>`, `/blog`, `/blog/category|tag|author/<slug>`, `/search?category=`) already have owners. Result: a key that appears in the editor, in the package format and in the preview nav but is read by no storefront route — a *new* invisible gap, in the same family as the preview's `?? templates.index` fallback. The brief's §19 item 1 ("The template selector exposes all seven requested template types") is satisfiable while the surface is still non-functional, which makes it a **false** DoD.

**Cheapest mitigation.** Do not add the key (J1). If added, make the change atomic — union + `z.enum` + storage read + a route that reads it + a default body for **both** official themes — and gate on *"a route renders the template"*, never on *"the union contains the key"*.

### R3 — Touching prohibited core and routes without escalating

**Mechanism.** Port spec §7 (`:150-156`) prohibits `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/lib/editor/**`, `src/lib/unified-widget-registry.ts`, `src/lib/theme-presentations.ts`, `all src/routes/**`, and "everything else under `src/`", with the escalation rule *"stop, report, wait for a decision. Never edit silently."* §3 (core editor), §4 (`editor/**`), §5 (`routes/**` + `widgets.tsx`), §9 (`routes/**`), §10 (`builder-ast.ts`) and §11 (`builder-ast.ts`, `widgets.tsx`) all require prohibited files. §16 of the brief ("Retain existing package validation, Level B approval…") signals that the author knows a boundary exists — but the plan never mentions it. An implementer who discovers it mid-task has to either stop (losing the thread) or edit silently (violating the spec, invalidating the port evidence, and possibly invalidating the freeze).

**Cheapest mitigation.** Before Phase 1, file a **single escalation list** — one page, one entry per prohibited file the work needs, one sentence of justification each — and get one owner decision. Everything theme-owned (Phases 1, 2, 4, 8, 9 below) proceeds meanwhile.

### R4 — Shipping "theme-owned" bodies that are the shared default

**Mechanism.** The port map records **ownership** (lane c) but never **distinctness** (`…/port/classification.md`, rows `TPL-SEARCH`/`TPL-CART`/`TPL-ACCOUNT`/`TPL-PAGE`/`TPL-BLOG` → `preview.ts:214/232/297/186/197`). The seeded bodies are shared widgets + shared demo copy, and **every existing gate passes them**: the asset gate is GREEN (0 findings), the parity spec is green (60/1/0), the platform DoD is green, and the doc gate is green. A theme can therefore be classified as owning a surface, ship the shared default, and every check still goes green — which is exactly the defect `report.md` §5 was written to expose, and which the brief re-diagnoses without closing. Re-planning the bodies without adding a distinctness gate repeats the failure at greater cost.

**Cheapest mitigation.** Phase 1 below: a distinctness gate in a **new** test file (allowed by port spec §7) asserting that a claimed template's `main` contains at least one theme-owned section type and is not the engine's generic demo body. Make it fail against today's Songoskriti first — a gate that has never failed proves nothing.

### R5 — Moving the frozen parity baseline

**Mechanism.** The parity spec compares 9 templates × 3 widths × 2 locales against `…/port/reference/` at `maxDiffPixelRatio: 0.02` / `threshold: 0.2` (`.e2e/songoskriti-port-parity.spec.ts:36-52`). Any change to shared widget markup, to the theme's seeded bodies, or to the preview's demo data moves every still at once. The spec is also a **prohibited existing `.e2e` file** under port spec §7, so the fix is not "edit the spec" — it is "do not move the pixels, or escalate the diff".

**Cheapest mitigation.** Run the parity spec before and after every phase that touches rendering; treat any diff as a **finding** with a recorded rationale (as the spec's own §9 requires), never as a `-u`.

### R6 — Spending the budget on the wrong defect

**Mechanism.** §11 is written as *"a required functional fix, not merely a redesign task"* and is sized like a feature. The behaviour it describes is already correct in production (P1). The engineer will verify, find the page renders correctly, and then — with §11's "required" framing — go looking for demo copy to remove, find it in the *seed* and the *preview*, and polish the preview. Meanwhile the actual generic-ness (five Songoskriti templates shipping the shared default, one of which — `blog` — is read by no route at all) goes unaddressed, and §13's "default template ASTs for every supported template in each official theme" gets spent on Somvabona bodies nobody asked for.

**Cheapest mitigation.** Re-scope §11 (P1) and re-sequence so the highest-value item — the distinctness gate plus the five Songoskriti bodies — lands first.

### R7 — Growing `TEMPLATE_KEYS` breaks the shipped-theme lint and the SEO/coverage maps

**Mechanism.** `themes.server.ts` lints **every** template key of **every** shipped theme (`:849` `TEMPLATE_KEYS.flatMap((key) => …)`, plus `:283`, `:614`, `:1354`, `:1380`, `:1591`), and `template-seo.server.ts` / `builder-seo.server.ts` / `translation-coverage.ts` all iterate the same list. A new key therefore creates a new lint target for every theme, including themes that do not author it, plus a new expected SEO row and a new translation-coverage bucket. Theme package validation may also reject the new key for third-party packages that were built before it existed.

**Cheapest mitigation.** If a key is added, seed a default body for **both** official themes in the same change, and make the lint tolerant of "template not authored" for a newly introduced key until the themes catch up — or do not add the key (J1).

---

## 7. Re-cut plan

Ten phases. Each is **independently shippable**, each has a **one-line acceptance criterion**, each names its files. Only Phase 0 requires no owner decision; Phases 3, 5, 6 and 7 are blocked on the escalations/owner calls in §8 and can run in parallel with the theme-owned phases.

> **Gate before Phase 1 (from §1 of the brief, kept verbatim in spirit):** *"Do not assume preview behavior and storefront behavior are identical."* No code before the Phase 0 map is signed off, and no code before the Phase 3/5 escalations are decided.

| # | Phase | Ships | Files (target) | Acceptance criterion (one line) |
|---|---|---|---|---|
| **0** | **Map, don't build** | The route-level implementation map §1 asks for, as a delta against the existing port map. | `docs/superpowers/songoskriti-evidence/port/` (new file) | Every surface in the plan carries a `file:line` for *defined / edited / persisted / populated / rendered*, and every "add" is struck or labelled **new**. |
| **1** | **Distinctness gate** | A test that fails when a theme claims a template but ships the shared default. | new test file + rule module under `src/lib/themes/songoskriti/**` or `scripts/**` (port spec §7: new files allowed) | The gate **fails** against today's Songoskriti `search`/`cart`/`account`/`page`/`blog` bodies and passes after Phase 2. |
| **2** | **Songoskriti bodies** | Five real Songoskriti compositions around the shared slots (`report.md` Option A). | `src/lib/themes/songoskriti/preview.ts` (theme-owned) | Phase 1's gate passes for all five, **and** the parity spec still passes within 0.02 against `…/port/reference/` (or a recorded, approved diff). |
| **3** | **Search route split** ⚠ escalation | The live listing decomposed into per-widget context slots so a theme can place query summary, count, facets, chips, sort, grid, pager, empty/error separately. | `src/routes/store.$slug.search.tsx` (prohibited — escalation) | A theme `search` template **without** a `product_grid` still renders the live results, proven by a route test over a fixed fixture. |
| **4** | **Page: seed + slot** | Demo copy removed from the seeded `page` template; `page_content` documented as the only supported body layout. | `src/lib/themes/songoskriti/preview.ts`; `docs/themes/creation.md` | The published `page` template contains no demo string, and a two-page fixture proves each page still renders its own title/body. |
| **5** | **Blog connection** ⚠ escalation | The storefront blog listing **and** article read the `blog` template through the existing `blog_archive`/`blog_terms`/`blog_pager` pack — or the `blog` key is retired. | `src/routes/store.$slug.blog.index.tsx`, `src/routes/store.$slug.blog.$slug.tsx` (escalation) | The `blog` template renders on the live blog route **or** the key is removed and `docs/themes/creation.md:36` is corrected to match. |
| **6** | **`archive` decision** ⚠ owner call | The owner's ruling implemented: either nothing (the pack from Phase 5 covers it) or one atomic key. | `src/lib/builder-ast.ts` + `src/lib/theme-package.ts` + `src/lib/theme-preview-nav.ts` + `src/lib/widget-weight.ts` + `src/routes/_authenticated/dashboard/builder.tsx` + `src/lib/storefront.functions.ts` + one route + both themes' seeds (all prohibited — escalation) | A named route renders the `archive` template with live records, **or** the plan records that no archive surface was needed. |
| **7** | **Checkout ruling** ⚠ owner call | The owner states whether the theme may author checkout body sections. | `docs/03-storefront/checkout.md` (+ `src/routes/store.$slug.checkout.tsx` if "yes") | The doc states the rule, and either the `checkout` template is consumed by the route or the key is documented as tokens-only. |
| **8** | **Preview honesty** | The silent homepage fallback is removed; demo bodies are labelled; unauthorised templates show an explicit state. | `src/components/store/ThemePreviewFrame.tsx` (prohibited — escalation); theme-owned `preview.ts` for labelling | `?template=<unknown>` renders an explicit "not authored" state — **never** `templates.index` — and the parity spec's 9-template list is unchanged. |
| **9** | **Docs** | Canonical docs corrected against the implementation, not against the plan. | `docs/themes/creation.md`, `docs/04-builder/sections-templates.md`, `docs/03-storefront/*.md`, `docs/developers/themes.md` | `bun run doc:gate` is green, and every template-key claim in the docs points at a shipped `file:line`. |
| **10** | **Evidence report** | The brief's §19 final paragraph, as an artefact. | new report under `docs/superpowers/songoskriti-evidence/` | Every acceptance criterion in phases 1-9 has a command, its output, and an evidence path in the report; blocked criteria are named as blocked. |

**The distinctness gate that ends the plan.** Phases 1-2 are the durable answer; Phase 10's report must close on it. The gate is the condition that stops a theme being *classified* as owning a surface while shipping the shared default. Concretely, for every template a theme claims (lane c in `…/port/classification.md`):

- the authored `main` must contain **at least one** section type that is theme-owned (a `theme:songoskriti/*` widget or a type the theme's own `SONGOSKRITI_WIDGETS` pack registers) — not only shared catalogue types;
- the authored `main` must **not** be the engine's generic demo body (`genericDemoMain`, `src/lib/theme-preview-nav.ts:357-373`);
- the authored `main` must not contain the platform's shared demo strings ("Demo search", "Demo article", "Demo story", "Sample product", "Demo Shopper" — `src/lib/themes/songoskriti/preview.ts:239`, `src/components/builder/CartContext.tsx:95`, `src/lib/preview-demo-data.ts:42`) **unless** the template is explicitly marked as a demo surface;
- the template must be **reachable from a route** — the key is not merely in the union (P14 / R2).

A theme that fails any clause is either authored properly or re-classified as *shared* — and the classification map (`…/port/classification.md`) is updated to say which. That is the difference between "Songoskriti owns the search template" and "Songoskriti owns the search template **and it is a Songoskriti design**".

---

## 8. Judgement calls for the human

Only four. Each is a decision, not a task, and each comes with the evidence that would settle it.

### J1 — Does `archive` need to be a template key at all?

*Why it is yours:* it is a product-taxonomy decision, and the repo already has a shipped answer that the brief does not acknowledge.

*Evidence that settles it:* the route inventory. Today, archive-like surfaces are already owned — product listings by `collection` (`src/routes/store.$slug.c.$collectionSlug.tsx:203`), article listings and taxonomy views by `BlogArchiveTheme` (`src/routes/store.$slug.blog.index.tsx:74`; `src/routes/blog.category.$slug.tsx`; `blog.tag.$slug.tsx`; `blog.author.$slug.tsx`), category-scoped product search by `search` (`src/routes/store.$slug.search.tsx:36`). And the *capability* the brief wants from `archive` — a theme-designed article listing — already exists unused as `blog_archive`/`blog_terms`/`blog_pager` (`src/lib/builder-ast.ts:350-352`; `src/components/builder/blog.tsx:392-394`), and `docs/themes/creation.md:36` already assigns it to the `blog` template.

*Decision:* **(a)** no key — connect the existing pack to `blog` (Phase 5); **(b)** a key, justified by **one named route that no existing template owns** — name it, and Phase 6 becomes an atomic change (R2/R7).

### J2 — Is the checkout template meant to be authorable by a theme?

*Why it is yours:* the repository holds two opposite positions and the brief assumes the one the route does not implement.

*Evidence that settles it:* `src/routes/store.$slug.checkout.tsx:419-421` — `ast={null}`, *"the theme contributes the tokens only"*; and `src/routes/checkout.tsx:276` — header/footer only, `main` emptied. Against that: `TEMPLATE_ZONES.checkout` permits a `thank_you` zone (`src/lib/builder-ast.ts:187`), the `checkout` template is a seeded body (`src/lib/themes/songoskriti/preview.ts:283-317`), the editor exposes a `checkout` tab (`builder.tsx:205-214`, `:1430-1444`), and packages may declare `checkout` (`src/lib/theme-package.ts:352-375`).

*Decision:* **(a)** tokens-only — then the `checkout` key is documentation, not a surface, and it should be described as such in `docs/themes/creation.md`; **(b)** themeable shell — then §9 becomes a platform change to a payment route, requires a security review, and needs the port-spec escalation cleared before a plan exists.

### J3 — Is the scope Songoskriti only, or both official themes?

*Why it is yours:* the brief carries both ("every supported template in each official theme" and "Songoskriti as the primary target"), and they differ by ≈9 authored bodies.

*Evidence that settles it:* `OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"]` (`src/lib/themes/builtin-themes.ts:15`); Somvabona authors **no** non-homepage template — its `preview.ts` has no `case "search"` — so all six of its secondary surfaces fall through to the engine's generic demo body (`src/lib/theme-preview-nav.ts:340-373`); `docs/themes/creation.md:22-25` requires a complete theme to ship all 12 areas, including the homepage composition.

*Decision:* **(a)** Songoskriti only, with Somvabona explicitly recorded as "shared, not theme-specific" in the classification map and the guide; or **(b)** both, in which case Phase 2 roughly doubles and Somvabona needs a homepage-grade treatment for its six secondary surfaces, not a generic body.

### J4 — Should the theme's `index` template render on the tenant storefront homepage?

*Why it is yours:* the code says no and a stale comment says yes; this is product intent, not a bug report.

*Evidence that settles it:* both index routes render either the merchant's CMS-designated homepage — `StoreHomepage`, which uses `template="page"` (`src/components/store/StoreHomepage.tsx:101-103`; `src/routes/store.$slug.index.tsx:461-462`; `src/routes/index.tsx:180`) — or the static "Welcome to Framique" plate (`src/components/store/StoreWelcome.tsx:14-18`, `:50-77`; `src/routes/store.$slug.index.tsx:464-475`; `src/routes/index.tsx:191`). The index template AST *is* loaded (`src/lib/storefront.server.ts:473` → `resolveIndexTheme`) and is used **only** in the isolated-theme branch (`src/routes/store.$slug.index.tsx:451`). Commit `b08f6819` ("feat(storefront): Welcome to Framique default homepage") made the plate deliberate; `src/lib/storefront.server.ts:578-580` still says the opposite (*"falls back to the theme index template below"*) and is stale.

*Decision:* **(a)** the plate is intended — then the port's 21-section Songoskriti homepage never reaches a shopper, `report.md` §6's "Genuinely Songoskriti" list is overstated for the storefront, and the stale comment should be corrected; or **(b)** drift — then the storefront homepage is a P0 that outranks every template in the brief, and it must be fixed before any of them are judged. *(This is a code-path reading; confirm against one live store before acting, exactly as `report.md` §3 measured the live deployment.)*

---

## 9. Appendix — how to reproduce every claim

Run from `/opt/frame28`. Read-only; nothing below writes to the repository. `bun` is absent in this environment, so the two `bun`-based scripts are shown with their `node` equivalents.

**Environment / identity**

```bash
cd /opt/frame28
git rev-parse origin/main origin/frame30      # both 7127183406e3e80fea2b13039720b1000125ed2c
git log --oneline -5
git status --short                             # .artifacts/..., ops/routing/*.conf, .output-snapshots/, plan.md
git log -S "No designated homepage" --oneline -- src/routes/store.\$slug.index.tsx   # b08f6819
```

**§2 / P13 / P14 — template keys, exhaustive maps, versioning, storage**

```bash
grep -n "TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts                  # 46-59: nine keys, no archive
grep -rn "TEMPLATE_KEYS" src/ --include=*.ts --include=*.tsx | grep -v ".test." | wc -l
grep -rn "Record<TemplateKey" src/ --include=*.ts --include=*.tsx
grep -n "BUILDER_API_VERSION" src/lib/plugin-manifest.ts               # :32 "3.1.0"
grep -n "THEME_API_RANGE" src/lib/theme-package.ts                     # :52 "^3.0.0"
grep -n "PRESET_API_RANGE" src/lib/registry-version.ts                 # :14 "^3.0.0"
grep -rn "templateVersion\|template_version\|schemaVersion\|schema_version" src/ --include=*.ts --include=*.tsx
grep -n "export function parseTemplates" -A 20 src/lib/builder-ast.ts  # :8117-8134 — unknown keys dropped
grep -n "template: z.enum" -A 12 src/lib/storefront.functions.ts       # :97-107
grep -n "TEMPLATE_SET\|templates: TemplateKey\[\]" src/lib/theme-package.ts  # :152, :172, :352-375
grep -n "TEMPLATE_JS_BUDGET" -A 12 src/lib/widget-weight.ts            # :205-215
grep -n "TEMPLATE_LABEL" -A 12 src/routes/_authenticated/dashboard/builder.tsx  # :205-216
grep -n "GENERIC_TITLES" -A 12 src/lib/theme-preview-nav.ts            # :340-350
```

**§3 / P3 / P4 — the template manager and per-template isolation**

```bash
sed -n '405,425p' src/components/builder/BuilderTopBar.tsx             # :413 TEMPLATE_KEYS.map
sed -n '1425,1448p' src/routes/_authenticated/dashboard/builder.tsx    # :1430-1444 template tab bar
sed -n '1300,1315p' src/routes/_authenticated/dashboard/builder.tsx    # :1306-1312 palette actions
sed -n '328,350p' src/hooks/use-builder-editor.ts                      # :332-345 editSlot / editNode
sed -n '628,640p' src/hooks/use-builder-editor.ts                      # :632-636 per-template lint
```

**§4 / P7 — the route-owned context system and the data bundle**

```bash
grep -n "contextSlots\|productSlot\|collectionSlot\|contentSlot" src/components/store/ThemeChrome.tsx
sed -n '300,320p' src/components/store/ThemeChrome.tsx                 # :302-310 the `themed` gate
sed -n '330,345p' src/components/builder/widgets.tsx                   # :335-343 ContextSlot
sed -n '1608,1620p' src/components/builder/widgets.tsx                 # :1612-1617 registrations
sed -n '180,220p' src/routes/store.\$slug.account.tsx                   # :185-215 live account slots
sed -n '95,112p' src/routes/store.\$slug.cart.tsx                       # :100-107 live cart context keys
grep -n "export function collectWidgetRequests" -A 20 src/lib/widget-data.ts   # :154-171
grep -n "collectWidgetRequests" src/lib/storefront.server.ts           # :485-514 one batched call
```

**§5 / P5 / P6 — search: real backend, one hardcoded blob, one consumer**

```bash
grep -n "export async function runStorefrontSearch" -A 55 src/lib/storefront-search.server.ts  # :34-86
sed -n '40,75p' src/routes/store.\$slug.search.tsx                     # :49-65 getStoreChrome(template:"search")
sed -n '184,190p' src/routes/store.\$slug.search.tsx                    # :186 the listing blob starts
sed -n '526,568p' src/routes/store.\$slug.search.tsx                    # :529 end, :559 productSlot, :560-565 fallback
grep -rn "productSlot" src/components/builder/*.tsx | grep -v SectionRenderer   # only widgets.tsx:1447
sed -n '1445,1495p' src/components/builder/widgets.tsx                 # :1491 productSlot ?? ...
grep -n "facet_sidebar\|filter_chips\|result_toolbar\|pagination\|empty_state" src/lib/builder-ast.ts   # :275-280
sed -n '230,255p' src/lib/themes/songoskriti/preview.ts                # :235-252 the seeded search body
```

**§7 — account**

```bash
grep -n "template=\"account\"" src/routes/store.\$slug.account.tsx src/routes/account.tsx   # :494 / :493
grep -n "orders_list\|profile_card" src/lib/builder-ast.ts src/lib/widget-registry.ts   # :353-354 / :652, :657
```

**§8 / P8 / P10 — blog: pack exists, nobody uses it, no route reads the template**

```bash
grep -n "blog_archive\|blog_terms\|blog_pager" src/lib/builder-ast.ts    # :350-352, :4834, :4886, :4909
grep -n "blog_archive\|blog_terms\|blog_pager" src/lib/studio/catalog.ts   # :1277-1298
grep -n "blog_archive\|blog_terms\|blog_pager" src/components/builder/blog.tsx   # :392-394
grep -rn "blog_archive" src/ --include=*.ts --include=*.tsx | grep -v test    # no theme uses it
grep -rn "template=\"blog\"" src/routes/                                  # EMPTY — no route reads it
grep -n "BlogArchiveTheme" src/routes/store.\$slug.blog.index.tsx src/routes/blog.*.tsx
sed -n '30,40p' docs/themes/creation.md                                    # :36 the blog composition claim
```

**§9 / P9 — checkout drops the theme AST**

```bash
sed -n '415,425p' src/routes/store.\$slug.checkout.tsx                    # :419-421 ast={null}
sed -n '270,280p' src/routes/checkout.tsx                                 # :276 header/footer only
grep -n "checkout:" -A 3 src/lib/builder-ast.ts                          # :187 TEMPLATE_ZONES.checkout
```

**§10 / P11 — official themes and the generic fallback**

```bash
grep -n "OFFICIAL_THEME_KEYS" -A 3 src/lib/themes/builtin-themes.ts     # :15-16
grep -c "case \"" src/lib/themes/somvabona/preview.ts                     # no search/cart/account/page/blog/checkout case
grep -n "genericDemoMain" -A 25 src/lib/theme-preview-nav.ts             # :357-373, :400
```

**§11 / P1 / P2 — the page route renders real content; the override column exists**

```bash
sed -n '60,70p' src/routes/store.\$slug.pages.\$pageSlug.tsx             # :66-68 PageView
sed -n '70,110p' src/components/store/PageView.tsx                       # :73-104 real title/excerpt/html/nodes
sed -n '170,190p' src/components/store/PageView.tsx                      # :175-186 contextSlots + contentSlot
grep -n "contentSlot" -A 25 src/components/store/ThemeChrome.tsx | head -40
grep -rni "size guide" src/ --include=*.ts --include=*.tsx | grep -i "songoskriti"
sed -n '204,235p' src/lib/themes/songoskriti/preview.ts                  # :209 "Size guide" — theme seed only
grep -n "export function registryPackage" -A 22 src/lib/themes.server.ts # :1154-1174 seeds from preview source
grep -n "template: string | null" src/integrations/supabase/types.ts     # :8355 storefront_pages.template
grep -n "export function resolveTemplateCandidates" -A 30 src/lib/builder-ast.ts   # :8219-8250 fallback chain
```

**§12 / §15 / §19 — DoD, h1 rules, budgets**

```bash
grep -n "describe(" src/lib/definition-of-done.test.ts                    # DoD 2..7
sed -n '60,80p' src/lib/builder-ast.ts                                    # :68-75 ROUTE_H1_TEMPLATES
grep -n "export function primarySectionId" -A 20 src/lib/builder-ast.ts   # :88-106
grep -n "LIGHTHOUSE_BUDGET" -A 10 src/lib/web-vitals.ts
grep -n "builder_template_seo" -A 20 src/integrations/supabase/types.ts | head -25
```

**§13 / P11 / J4 — the index template on the storefront homepage**

```bash
sed -n '455,478p' src/routes/store.\$slug.index.tsx                       # :461-475 StoreHomepage / StoreWelcome
sed -n '1,30p' src/components/store/StoreHomepage.tsx                    # :101-103 template="page"
sed -n '10,25p' src/components/store/StoreWelcome.tsx                     # :14-18 the plate
sed -n '574,584p' src/lib/storefront.server.ts                           # :578-580 the STALE comment
grep -n "resolveIndexTheme" src/lib/storefront.server.ts
sed -n '175,200p' src/routes/index.tsx
```

**§14 / P12 — the preview's silent homepage fallback and its demo strings**

```bash
sed -n '480,492p' src/components/store/ThemePreviewFrame.tsx             # :485 templates[template] ?? templates.index
sed -n '565,585p' src/components/store/ThemePreviewFrame.tsx             # :570-571 null slots, :580-581 modal
grep -rn "Sample product\|Demo Shopper\|Demo search" src/ --include=*.ts --include=*.tsx
```

**§16 / P17 — gates, parity, asset check**

```bash
node scripts/songoskriti-assets-check.mjs                                # GREEN — 0 findings, 11 notes
node -e "const p=require('./package.json');console.log(p.scripts['gates:release'],'|',p.scripts['assets:songoskriti'],'|',p.scripts['gates'])"
ls docs/superpowers/songoskriti-evidence/port/reference/ | wc -l
ls docs/superpowers/songoskriti-evidence/port/reference/ | head -6
cat docs/superpowers/songoskriti-evidence/port/reference-manifest.json
grep -n "TEMPLATES = \[" -A 14 .e2e/songoskriti-port-parity.spec.ts      # :36-49
grep -n "THRESHOLDS" .e2e/songoskriti-port-parity.spec.ts                # :52
head -25 docs/superpowers/songoskriti-evidence/port/parity-report.md      # 60 passed / 1 skipped / 0 failed
```

**Port spec boundary, the report at HEAD, and the missing distinctness gate**

```bash
sed -n '148,160p' docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md   # §7 boundary + escalation
sed -n '1,12p' report.md                                                # :2 the short answer
grep -n "no gate asks\|Options\|distinctness" report.md
grep -rn "distinctness" src/ scripts/ docs/ 2>/dev/null                  # EMPTY — the gate does not exist
grep -n "TPL-SEARCH\|TPL-CART\|TPL-ACCOUNT\|TPL-PAGE\|TPL-BLOG" docs/superpowers/songoskriti-evidence/port/classification.md
```

**Optional (not run here — no database or network in this environment)**

```bash
# live storefront confirmation of the §5 code-path finding and of J4:
for t in index product collection search cart account page blog; do
  printf "%-11s %s\n" "$t" "$(curl -s -o /dev/null -w '%{http_code}' "https://framique.qubickle.com/theme-preview/songoskriti?template=$t")"
done
curl -s -o /dev/null -w 'archive -> %{http_code}\n' "https://framique.qubickle.com/theme-preview/songoskriti?template=archive"
```

**Local test/lint entry points (not run here — this review is read-only and the suites are slow)**

```bash
node_modules/.bin/vitest run src/lib/definition-of-done.test.ts
node_modules/.bin/vitest run src/lib/themes/songoskriti-assets.test.ts src/lib/themes/songoskriti-asset-paths.test.ts
node_modules/.bin/tsgo --noEmit
node_modules/.bin/eslint src/lib/builder-ast.ts src/routes/store.\$slug.search.tsx
node_modules/.bin/prettier --check plan.md
```

---

*End of review. This file is the only artefact written; the repository was otherwise left untouched, and no file was staged or committed.*
