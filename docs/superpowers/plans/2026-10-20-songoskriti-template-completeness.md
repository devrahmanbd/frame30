# Phase 2 — Songoskriti template completeness: real compositions, representative previews, an explicit archive contract

**Goal:** every template tab in the Songoskriti theme preview must show a **real, theme-authored composition** — a search layout built from the platform's own search/result widgets, a cart and an account whose demo data is representative and visibly labelled, a Songoskriti editorial blog listing, an explicitly labelled sample content page, and the **authored** checkout template instead of the generic `CheckoutMock` — and the **archive contract** is written down: the archive surface is the **blog taxonomy surface** (index / category / tag / author), it wears the **`blog`** template and the existing blog pack, **no `archive` template key is added** (Decision **D1**, Option A), and an unsupported template produces an **explicit unsupported state** in the preview instead of a silent redirect to the homepage. The live storefront's search execution and authorization, cart mutations, customer authorization, price calculation, order state, and the merchant's CMS page record must not change.

**Architecture:** two channels, one owner each. The **theme** owns *composition* — which sections, in which order, with which copy — and it does so in `src/lib/themes/songoskriti/preview.ts` (theme-owned, §7-editable). The **platform host** owns *data* — it executes the search, quotes the cart, resolves the shopper's orders, renders the merchant's CMS record — and it does so by handing the theme **context slots** (`contextSlots`, `productSlot`) that the theme's sections declare. Three facts, all verified in the tree, decide the shape of this plan:

1. **The six Phase-2.4 search/collection widgets are *context widgets*.** `facet_sidebar`, `filter_chips`, `result_toolbar`, `pagination`, `category_header` and `empty_state` all carry a `templates` allowlist in the catalogue (`src/lib/builder-ast.ts:2691`, `:2717`, `:2757`, `:2771`, `:2793`, `:2824`), and `SectionRenderer` renders a context widget **only when the host grants permission for it** — `slot = contextSlots?.[section.type]`; `if (slot === undefined) return null` (`src/components/builder/SectionRenderer.tsx:814-833`). No storefront host grants permission for any of the six today (the only hosts that grant permission are `PageView` (`page_content`, `src/components/store/PageView.tsx:216`), the product page host (`src/components/store/ProductView.tsx:613` — six product/page slots: `breadcrumb`, `product_media`, `price_block`, `add_to_cart`, `product_meta`, `page_content`), the cart route (`cart_lines`/`cart_summary`/…, `src/routes/store.$slug.cart.tsx:102-108`) and the account route (`orders_list`/`profile_card`, `src/routes/store.$slug.account.tsx:185-219`, `:502`)). Consequence: **the theme's own Songoskriti `result_toolbar` presentation — which renders representative Songoskriti filter groups (`src/components/builder/songoskriti.tsx:2360`, `:2380-2409`) — is invisible outside the editor**; Task 2.6 makes that presentation live-capable before Task 9 grants the widget on the storefront.
2. **The storefront's search results are dropped whenever a theme publishes a search body.** The search route builds the whole listing — query box, filters, chips, sort, results, pager, empty state (`src/routes/store.$slug.search.tsx:186-529`) — and hands it to the theme as **one opaque `productSlot`** (`:559`). The only widget that consumes `productSlot` is the *generic* `product_grid` (`src/components/builder/widgets.tsx:1447`, `:1491`); Songoskriti overrides `product_grid` with a presentation that reads only `data.rows` (`src/components/builder/songoskriti.tsx:897-944`). The theme's search body has no `product_grid` and no `collection_grid`, so on a Songoskriti store the storefront search page renders **the theme's demo copy and no results at all**.
3. **The preview frame is the only host that can feed the preview**, and it currently mounts no `CartProvider` and no `BlogFeedProvider`. The preview's cart therefore falls back to the studio's `DEMO_CART` — "Sample product" / "Second product" (`src/components/builder/CartContext.tsx:75-124`) — and the account rows are the shared `DEMO_ORDERS` / `DEMO_PROFILE` ("ORD-1001", "Demo Shopper", `src/lib/preview-demo-data.ts:21-45`).

So the work splits cleanly: **theme-owned composition first** (allowed files), **the preview host second** (one escalated file), **the storefront search route third** (one escalated route — §7 relaxed for it by Decision **D4**, the per-widget decomposition approved by Decision **D6**), and **the archive contract last** (a documented contract plus one preview-host change — no template key, per Decision **D1**). Nothing here redoes the plugin registry or the widget architecture.

**Tech Stack:** TypeScript 5 / React 19 (TanStack Start), Vitest 4.1.11, `tsgo --noEmit` typecheck, ESLint 9 + Prettier 3, Node 24. **No new npm dependency** is added.

**Spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (the editable/prohibited boundary) and §9 (the frozen-pin escalation procedure) — binding; `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` (the Phase-0 audit: §1.2 the per-template matrix, §1.3 the routes that wear a template, §4 the archive semantics and blast radius, §5 the boundary, §8 the phase order) — the factual basis, reconciled below; `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (the house plan: its Global Constraints, Review Focus, Decision Gate and Phase Roadmap) — the format this document follows; `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md` + `…-escalation.md` (what Phase 1 shipped and the shape of an escalation record); `report.md` §5 (the open questions D1–D8) and §8 (the rulings).

---

## Corrections to the Phase-0 audit

The Phase-0 audit is the factual basis and this plan does **not** re-derive it. Six statements in it are wrong or materially incomplete, and this plan is written against the code, not against the audit.

1. **"The theme's search template renders *as well as* the route's listing block" (`phase0-implementation-map.md:172`, `:201`) is wrong — the listing block is dropped.** `productSlot` is consumed by exactly one widget, the generic `product_grid` (`src/components/builder/widgets.tsx:1447`, `:1491`). Songoskriti's `product_grid` presentation ignores it (`src/components/builder/songoskriti.tsx:897-898` — `const { str, data, locale, Heading } = ctx;`), and the theme's search body has no `product_grid`/`collection_grid` (`src/lib/themes/songoskriti/preview.ts:235-252`). On a Songoskriti store the storefront search page therefore shows the theme's heading, the "Demo search" copy and a rail — **and no search results**. This is the defect the expert's search item is really about, and it is fixable inside the boundary.
2. **The audit never states that the six Phase-2.4 widgets are context widgets.** It lists them as "the catalog already has per-widget types for the pieces the expert lists" (`phase0-implementation-map.md:517`). True — but incomplete: each carries a `templates` allowlist, so `SectionRenderer` renders it **only** where the host grants permission (`src/components/builder/SectionRenderer.tsx:814-833`). The audit's Phase-3 plan ("produce per-widget context slots") is therefore the *only* way to make them appear, and it is a **route** change — prohibited by §7. This plan states the same conclusion and makes that route change: §7 is relaxed for the search route (Decision **D4**) and the route exposes per-widget context slots (Decision **D6**, State B).
3. **`CollectionQueryProvider` is exported but mounted nowhere.** `src/components/builder/collection.tsx:55` exports it; a repo-wide grep finds no importer outside that file. So even where the six widgets *do* render, their facet links, sort links and pager are computed from `DEFAULT_QUERY` (`basePath: ""`, `total: 0`) — inert. The search route must mount the provider for them to work at all; that is part of the same route escalation.
4. **The audit does not say that Songoskriti's `product_grid` ignores the host slot** (the same fact as correction 1, seen from the other side). It matters because the collection route also passes `productSlot={grid}` (`src/routes/store.$slug.c.$collectionSlug.tsx:220`) — so "make the theme's grid honour the host slot" must be scoped to the `search` template or it silently replaces the collection page's styled grid with the route's plain grid.
5. **The audit's Phase-6 note ("no demo provider for search results, cart lines/totals, checkout steps, blog articles") understates the cart.** The preview *does* render cart widgets — via the studio's `DEMO_CART` fallback, because the preview mounts no `CartProvider` (`src/components/store/ThemePreviewFrame.tsx:568-577` passes `cart_lines: null` and the widgets read `useCartContext()`, `src/components/builder/cart.tsx:80-84`). The problem is not "no data" but "the **wrong** data" — "Sample product" / "Second product", the studio's generic snapshot, with a studio total that does not match any Songoskriti price.
6. **The audit's §2.4 row "blog" says the preview shows the theme's demo body and the storefront shows a bespoke grid.** Still true, and still the pinned product decision: `BlogArchiveTheme` hardcodes `ast={null}` ("the render stays generic for every key by design — pinned in `BlogArchiveTheme.test.tsx`", `src/components/store/BlogArchiveTheme.tsx:1-9`, `:29-33`). This plan therefore treats the expert's blog item as **preview-composition only** and leaves the storefront side to Decision **D5**.

---

## Global Constraints

- **No new npm dependency.** This plan adds no package to `package.json` and changes no lockfile.
- **No test is deleted, skipped, weakened, or made conditional.** The two existing test files that pin the theme's template compositions (`src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts`) are **updated** — each update replaces a stale expectation with a **stronger** one (the exact new composition / an explicit per-template opener map) and is named in the Task-1 escalation record before it is made. No `it.skip`, no `test.skip`, no loosened `expect`. `src/lib/themes/songoskriti/preview.test.ts` (which pins the homepage composition and the account body's three types — both unchanged by this plan), `src/components/store/BlogArchiveTheme.test.tsx` and `src/components/store/ThemePreviewFrame.test.tsx` are **not** touched at all.
- **Port spec §7 boundary.** Editable: `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts`; NEW test/fixture files; NEW `.e2e/` spec/helper files; `docs/**`; `scripts/**`; wiring-only `package.json` / `.circleci/config.yml` edits. Prohibited: `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/lib/theme-presentations.ts`, `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, all `src/routes/**`, existing test files and their `.snap` files, existing `.e2e/**` files, and everything else under `src/`.
  **Files this plan may touch without an escalation:** `src/lib/themes/songoskriti/preview.ts`; `src/components/builder/songoskriti.tsx`; NEW `src/lib/themes/songoskriti/preview-demo-data.ts`; NEW `src/lib/themes/songoskriti/preview-page.ts`; NEW `src/lib/themes/songoskriti/template-distinctness.ts`; NEW test files under `src/lib/themes/songoskriti/` and `src/components/store/`; NEW `docs/**` records.
  **§7 is RELAXED for this programme by explicit owner approval (Decision D4), for exactly five narrow exceptions (four plus the theme-owned skins pin, added by the owner's ruling of 2026-10-20):** the preview host `src/components/store/ThemePreviewFrame.tsx`; the two composition pins `src/components/builder/songoskriti-port-freeze.test.tsx` and `src/lib/theme-preview-nav.test.ts`; the storefront search route `src/routes/store.$slug.search.tsx`; and the archive surface — which, under Decision **D1** (Option A), needs **no key edits**, so the fourth exception is a *permission*, not a change. **Every other §7 prohibition stands.**
  **Files this plan may touch ONLY through a named escalation recorded in Task 1:** `src/components/store/ThemePreviewFrame.tsx` (the preview host — Task 7, and Task 10's explicit unsupported state); `src/components/builder/songoskriti-port-freeze.test.tsx` and `src/lib/theme-preview-nav.test.ts` (the two composition pins — Tasks 3 and 6); and `src/routes/store.$slug.search.tsx` (the search route — Task 9). Those four files are the whole of the relaxation.
  No file under `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/lib/theme-presentations.ts`, `src/lib/unified-widget-registry.ts`, `src/lib/editor/**` or any other route is edited anywhere in this plan.
- **Explicit-path staging only.** Every commit uses `git add <exact paths>`; never `git add -A`, `git add .`, `git commit -a`.
- **Never commit the churn files.** `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf` — leave them dirty, untouched, unstaged (they are already modified in this working tree; `git status --short` must show them unstaged at every commit).
- **Never commit `.output-snapshots/`** (untracked in this tree; it is what makes a repo-wide `eslint .` stall).
- **Never edit an applied migration.** No file under `supabase/migrations/` is read for edit or written; no migration is created or altered by this plan (no schema change is needed — `theme_drafts.templates` and `theme_versions.templates` are `jsonb`).
- **No deploy inside the plan.** The deploy is a separate, explicit step after the branch merges. No task runs it and no task's commit depends on it.
- **`bun` is NOT on PATH in this environment.** Use `node_modules/.bin/<tool>` — `node_modules/.bin/vitest`, `node_modules/.bin/tsgo`, `node_modules/.bin/eslint`, `node_modules/.bin/prettier` — and plain `node` for the `scripts/*.mjs` gates. CI uses `bun`; local verification does not.
- **A repo-wide `eslint .` stalls on the untracked `.output-snapshots/`.** Lint **specific paths** only.
- **The escalation record is append-only.** `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` is written once in Task 1 and later tasks **add** a section; they never rewrite an earlier one. Every task that touches an escalation file cites its section before it edits anything.
- **Three release gates are red on this tree for reasons that predate this plan** (`node scripts/contract-gate.mjs` exits 2 — `bunx` absent; `node scripts/schema-fingerprint.mjs --check` exits 1 — needs a live Supabase RPC; `node scripts/secret-scan.mjs` exits 1 — findings in the untracked `.output-snapshots/`). They are **not** regressions from this change and this plan does **not** fix them.
- **The known pre-existing local flake.** `src/lib/site.server.test.ts` fails on a clean local checkout because the gitignored `.env` supplies `VITE_SUPABASE_URL` before `vi.stubEnv` runs (`phase0-implementation-map.md:428-455`); it passes with `VITE_SUPABASE_URL="" SUPABASE_URL="" SUPABASE_PUBLISHABLE_KEY="" VITE_SUPABASE_PUBLISHABLE_KEY="" node_modules/.bin/vitest run src/lib/site.server.test.ts`. This plan does not touch it and does not weaken it.

---

## Review Focus

The five failure modes most likely to bite a person on this change, most likely first. Each line names the test that pins it, and that test lives in the task that owns the code it protects.

1. **The storefront's search results stay dropped.** The platform's listing block reaches the theme only through `productSlot`, and the theme's own `product_grid` presentation ignores it (`src/components/builder/songoskriti.tsx:897-898`). If Task 2 forgets to honour the host slot, the live search page still shows the theme's demo copy and no results — and the acceptance bar ("the platform continues to execute and authorize the actual search") silently fails. → Pinned by **Task 2** (`src/lib/themes/songoskriti/search-template.test.ts`): the theme's search body contains a `product_grid`, and the Songoskriti presentation renders the host slot **on the `search` template** and the theme's own rows everywhere else — the last clause is the guard against the collection page losing its styled grid.
2. **The theme's search body duplicates the platform's listing.** The route's block already contains a query box, filters, chips, sort, results, a pager and an empty state (`src/routes/store.$slug.search.tsx:186-529`). If the theme authors its own visible copy of all of it *and* the platform's block renders, the page shows the filters twice. → Pinned by **Task 2** (the theme's search body carries **no** authored copy of the platform's pieces: the assertion forbids a `rich_text`/`heading` section inside the search body) and by **Task 9** (the route splits the listing into named pieces so each piece has exactly **one** owner: the query box and the platform's category/kind chips stay inside the **results block** the theme renders, while the count/sort, the active chips, the pager, the empty state and the page `<h1>` are handed to the platform's own widgets through per-widget context slots — asserted on the rendered markup).
3. **A demo indicator leaks into a merchant's live page.** A "Demo" badge authored in the theme's template is inherited by every merchant who installs Songoskriti (the seeded template comes from the theme's own source, `src/lib/themes.server.ts:1154-1174` → `resolveThemePreview` → `assemblePreviewTemplates`) — exactly the "Size guide" defect Phase 1 removed. → Pinned by **Task 2**, **Task 5** and **Task 6**: the four bodies this plan authors (**search**, **blog**, **cart**, **checkout**) carry **no** demo marker string, and the **`page`** body carries none either — it is the one surface whose body would *impersonate the merchant's CMS record*, so the gate's copy rule (`R4`) applies to the `page` template **only** (Task 8). The **`product`** body keeps exactly **one** explicitly labelled line — a sample product page that says its prices and stock are sample data — because the expert's bar is *"demo data is realistic and explicitly labelled"*, not *"no demo copy anywhere"*; Task 6 relabels that line so the product template needs **no** gate exception. The demo labelling lives in the **preview host** and in the **demo rows** (RFC 2606 `.example` addresses, a "(demo shopper)" profile title), never as a bare marker in a store-facing body. The same bar applies to the theme's **presentation**: Task 9 grants `result_toolbar` on the live storefront, so the theme's own toolbar (a hard-coded taxonomy and an inert sort, `src/components/builder/songoskriti.tsx:2360-2600`) is made **live-capable** in Task 2.6 — real count, real sort links, no hard-coded groups.
4. **The checkout preview becomes a second, divergent checkout.** The expert's requirement is that the preview renders the *authored* template with platform-owned payment components; the temptation is to keep `CheckoutMock` and restyle it, or to let the theme's checkout body carry a real price. → Pinned by **Task 6** and **Task 8**: the checkout body contains only platform-owned commerce widgets (`checkout_steps`, `payment_methods`, `cart_summary`, `payment_icons`), no authored money, and the preview's order data comes from the synthetic cart context whose totals are derived from its lines (one function, one source of truth). `src/routes/store.$slug.checkout.tsx` is **not touched** — asserted by the "no production checkout change" check in Task 6.
5. **The distinctness gate is a gate that has never failed.** A rule that only ever passes proves nothing. → Pinned by **Task 8**: the gate module carries the **legacy** compositions as fixtures and asserts the gate **rejects** each of them — so the "generic heading-plus-demo-rail body" failure mode is proven detectable before the gate is trusted on the shipped bodies. The gate asserts **composition, slots and structure** — not lint cleanliness: the platform's own lint findings (translation coverage, double-`<h1>`) are a *different* concern, and a rule the gate cannot guarantee on the nine shipped bodies is not a rule the gate gets to have.

---

## Decision Gate

These decisions are the human's, not the engineer's. **All seven of them are now RULED, and this plan is written against those rulings — an implementer reads D1, D2, D3, D4, D5, D6 and D7 as decided, not as gates:** **D1** (archive semantics), **D4** (§7 for this programme) and **D6** (the search decomposition) were ruled when the plan was written; **D2**, **D3**, **D5** and **D7** were ruled on **2026-10-21** by the closing wave, and each carries a dated amendment below with its reason, its follow-up path and where that follow-up lives. **The plan below was fully executable without any of them**, and nothing in it changes.

**D1 — Archive semantics: does "Archive" mean the blog taxonomy archives, or a product-side listing archive?** — **RULED: Option A.** *"Archive" means the blog taxonomy archives (index / category / tag / author), already served by the blog pack. **No new `archive` template key.***
*Question (answered):* should Frame30 add an `archive` template key at all, or is the blog taxonomy surface (index / category / tag / author) the whole of "Archive"?
*Evidence that settled it:* `grep -rn 'template="' src/routes/` returns **no** `template="blog"` — the blog surfaces are served by `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:29-33`, `ast={null}`). The route-level taxonomy archives are exactly `src/routes/blog.category.$slug.tsx`, `blog.tag.$slug.tsx`, `blog.author.$slug.tsx`, `blog.index.tsx`. Product categories are a **search facet**, not a route (`src/lib/storefront-search.ts:161-163` puts `category` in the search query); brands resolve to a search query (`src/lib/widget-data.ts:224-225`); product collections already own the `collection` template. A new key would need edits to `src/lib/builder-ast.ts` (`TEMPLATE_KEYS` `:46-59`, `TEMPLATE_ZONES` `:156`, `ROUTE_H1_TEMPLATES` `:68-75`, the 41 catalogue `templates:` allowlists, the `required` table `:8438-8462`, `parseTemplates` `:8117`), `src/lib/theme-package.ts:172` (`TEMPLATE_SET`), `src/lib/theme-preview-nav.ts:340` (`GENERIC_TITLES`) and the preview URL map `:82-99`, `src/lib/widget-weight.ts:205` (`TEMPLATE_JS_BUDGET`), `src/components/builder/BuilderTopBar.tsx:6` (`TEMPLATE_META`), `src/routes/_authenticated/dashboard/builder.tsx:205` (`TEMPLATE_LABEL`), `src/lib/builder-seo.ts:317` (`TEMPLATE_FALLBACK`) and the hand-written `z.enum` in `src/lib/storefront.functions.ts:97-107` — **every one prohibited by §7** — for a surface the `blog` template already covers. The audit's warning still holds: no compiler sees that `z.enum`, so without it `getStoreChrome` throws for the archive route at runtime (`phase0-implementation-map.md:308`).
*What the ruling means for this plan:* **Task 10 is the documented archive contract** — the taxonomy archives are the archive surface, they map to the **`blog`** template plus the existing blog pack, and **no `archive` key is added**. The contract's second half is the **explicit unsupported state**: an unsupported template must produce a named "not supported by this theme" panel in the preview, not a silent redirect to the homepage (`src/components/store/ThemePreviewFrame.tsx:486`, the `templates[template] ?? templates.index` fallback). The storefront's blog route wearing the theme's `blog` template stays behind **D5** and is not touched.
*Unlocks:* nothing — Task 10 runs as written.

**D2 — Is the checkout template meant to be themeable at all?** *(carried forward from `report.md` D2 — **RULED 2026-10-21**: the production checkout stays platform-owned)*
*Question:* may a theme author checkout body sections, or is checkout tokens-only by design?
*Evidence:* the route refuses the theme's AST — *"the checkout form is hand-built (server-quoted totals, live rails), so the theme contributes the tokens only"*, `ast={null}` (`src/routes/store.$slug.checkout.tsx:415-421`); the custom-host twin keeps header/footer only (`src/routes/checkout.tsx:276`). Against it: `TEMPLATE_ZONES.checkout` permits a `thank_you` zone (`src/lib/builder-ast.ts:187`), the `checkout` template is a seeded body (`src/lib/themes/songoskriti/preview.ts:283-317`), and a theme package may declare `checkout` (`src/lib/theme-package.ts:172`).
*What this plan does about it:* the **preview** side only. Task 6 authors the checkout body and Task 7 renders it in the preview; **the production checkout route is not touched**, so "tokens only" stays true in production until this is ruled. The answer decides whether Task 6's composition becomes a production surface later.
*Unlocks:* nothing in this plan; it decides the *next* programme.
* **RULED 2026-10-21 (closing wave) — production checkout stays platform-owned.** The theme contributes **tokens** only; the platform's own form, the server-authoritative totals, the validation, the payment selection and the order state remain the platform's. The theme's `checkout` composition is an **authoring and preview** surface, not a production checkout shell. **Reason:** the form is server-quoted (`quoteCart`, the server's rails, the server-side validation and order write), so a theme composing the shell would put theme code between the shopper and the server's authoritative money, payment and order state. **Follow-up:** letting a theme compose the checkout shell needs its **own escalation** (new record, new owner approval, its own §7 widening) and a decision about which parts of the form may be theme-owned — **explicitly out of this programme's scope**. **Where the follow-up lives:** this entry, the evidence record's **§(K.3)**, and the distinctness gate's `checkout` exception, whose `basis` names **D2** (`src/lib/themes/songoskriti/template-distinctness.ts:219-224`).

**D3 — Songoskriti only, or both official themes?** *(carried forward from `report.md` D3 — **RULED 2026-10-21**: Songoskriti only)*
*Evidence:* `OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"]` (`src/lib/themes/builtin-themes.ts:15`); Somvabona authors **no** secondary surface (`src/lib/themes/somvabona/preview.ts:52`), so its six fall through to the engine's generic body (`src/lib/theme-preview-nav.ts:396-440`).
*What this plan does about it:* **Songoskriti only.** The distinctness gate (Task 8) is Songoskriti-specific, as the expert asked.
*Unlocks:* nothing in this plan; it decides the gate's scope if extended.
* **RULED 2026-10-21 (closing wave) — this programme is Songoskriti only**, as the expert asked (*"Songoskriti must be the proof"*). The gate's **machinery** — the seven rules `R1`–`R7` — is theme-agnostic; its **data** is Songoskriti-specific (`SONGOSKRITI_TEMPLATE_EXPECTATIONS`, `src/lib/themes/songoskriti/template-distinctness.ts:132`, and `SONGOSKRITI_APPROVED_EXCEPTIONS`, `:210`). **Reason:** Somvabona authors **three** surfaces — `index` (through `buildHomepageMain`), `collection` and `product` (`src/lib/themes/somvabona/preview.ts:52-90`) — and its `default:` branch returns `null`, so the other six templates fall through to the engine's **generic** body (`src/lib/theme-preview-nav.ts:396-440`); a gate with no Somvabona expectation table would either fail every Somvabona body or have to be weakened to mean nothing. **Follow-up:** extending the gate to Somvabona **adds its own expectation table** (and its own approved exceptions) — **new data, not new machinery**. **Where the follow-up lives:** this entry, the evidence record's **§(K.3)**, and the table it would extend — `src/lib/themes/songoskriti/template-distinctness.ts:132`.

**Citation corrected 2026-10-21 (record-accuracy pass) — the two ranges this entry cited for the engine's generic body were wrong.** Both read `src/lib/theme-preview-nav.ts:357-372`; that range is the **search-param validator** (`search.max` and friends), not the generic body. The generic body is **`src/lib/theme-preview-nav.ts:396-440`** — `GENERIC_TITLES` at `:413` and the *"Demo page. The live theme authors this template — what you see here is the engine fallback."* body at `:440`, with the `genericDemoMain` function itself at `:430` (verified by reading the file at `4206f9a2`). The same correction is applied to this plan's other citations of that symbol — the `genericDemoMain` references in Task 2, Task 8 and Task 10 now read `src/lib/theme-preview-nav.ts:430`, and the two generic-body ranges in Task 8 now read `src/lib/theme-preview-nav.ts:396-440`. The ruling itself is unchanged.

**D4 — Does port spec §7 still govern this Frame30 work?** — **RULED: §7 is RELAXED for this programme, by explicit owner approval, for exactly four narrow exceptions.**
*Question (answered):* is the port's no-core-edits boundary still the rule, or is it relaxed for this programme?
*Evidence:* `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-153` (§7) and `:169` (§9, the frozen-pin escalation procedure).
*The ruling:* the exceptions are **(1)** the preview host `src/components/store/ThemePreviewFrame.tsx`, **(2)** the two composition pins (`src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts`), **(3)** the storefront search route `src/routes/store.$slug.search.tsx`, and **(4)** the archive surface — which, under **D1** (Option A), needs **no key edits**, so (4) is a *permission*, not a change. **Every other §7 prohibition stands.**
*What the ruling means for this plan:* Task 9 (the search-route split) and Task 10 (the archive contract, including the preview's explicit unsupported state) run **in full**. Each of the four files is named in Task 1's escalation record — with the exact diff shape, the reason and the §7 clause — **before** it is edited; that record is the §9 artefact, and it is append-only.
*Unlocks:* nothing — Tasks 9 and 10 run as written.

**D5 — The blog reader is "themeless by design": does that decision stand?** *(carried forward from `report.md` D5 — **RULED 2026-10-21**: it stands)*
*Question:* the storefront reader blog was deliberately purged of theming ("theme purge Task 3"). Does Frame30 reverse that decision and let the theme's `blog` template wear the reader?
*Evidence:* `src/components/store/BlogArchiveTheme.tsx:1-9` — *"Themeless reader blog (theme purge Task 3) … the render stays generic for every key by design — pinned in BlogArchiveTheme.test.tsx"* — and the pin itself, `src/components/store/BlogArchiveTheme.test.tsx:82`. `grep -rn 'template="blog"' src/routes/` returns **nothing**: the `blog` template is authored, seeded, previewable, linted — and rendered by no route.
*What this plan does about it:* **the preview only** (Task 5). The storefront blog route is **not** touched, `BlogArchiveTheme.test.tsx` is **not** touched, and the theme's `blog` body is documented as preview-only until this is ruled. The distinctness gate records the blog surface under an explicit, documented exception with that reason.
*Unlocks:* the storefront half of the expert's blog item (not in this plan).
* **RULED 2026-10-21 (closing wave) — it stands: the storefront's reader blog stays "themeless by design".** `src/components/store/BlogArchiveTheme.tsx` keeps its deliberate "theme purge Task 3" behaviour, pinned by `src/components/store/BlogArchiveTheme.test.tsx`. The theme's `blog` template is the theme's **editorial composition in the preview** and the **authoring surface**; it is not the storefront's reader. **Reason:** the purge was a deliberate product decision, not an accident, and reversing it is a **product** change with **SEO and canonical implications** — the storefront's blog routes (`blog.index`, `blog.category`, `blog.tag`, `blog.author`, `store.$slug.blog.index`) own their canonical policy, and a themed reader would change what those routes publish about themselves. **Follow-up:** a **separate product change** (an SEO/canonical review plus the `BlogArchiveTheme` reversal), with its own escalation and its own evidence — **not** a follow-up task inside this plan. **Where the follow-up lives:** this entry, the evidence record's **§(K.3)**, and the distinctness gate's `blog` exception, whose `basis` names **D5** (`src/lib/themes/songoskriti/template-distinctness.ts:225-230`).

**D6 — The search decomposition: does the storefront search route expose per-widget context slots?** — **RULED: State B (yes).** The storefront search route **does** expose its pieces as per-widget context slots, so Task 9 runs **in full**.
*Question (answered):* the route already builds every piece the expert lists — query and result summary, filters, active filter chips, sort controls, results grid, pagination, empty/error states — but as **one opaque block** handed to the theme as `productSlot` (`src/routes/store.$slug.search.tsx:186-529`, `:559`). Does the theme get to place those pieces individually?
*Evidence:* the six widgets are context widgets and render only where the host grants permission (`src/components/builder/SectionRenderer.tsx:814-833`); the facet/sort/pager links additionally need `CollectionQueryProvider`, which is **mounted nowhere** in production today (`src/components/builder/collection.tsx:55`).
*What the ruling means for this plan:* Task 9 runs: the route splits the listing into named pieces, mounts `CollectionQueryProvider` with the live params, grants permission for the per-widget widgets **whose data the storefront actually provides**, and hands the theme a **results block** through `productSlot`. The storefront's granted set is exactly **`result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header`**; **`facet_sidebar` stays preview-only**, because its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`) and no storefront route mounts a `WidgetDataProvider` (Decision **D7**). The query box and the platform's category/kind chips stay **inside the results block** — they are search execution and authorization, not presentation, and the route's `fallback` is not rendered once the theme publishes a body (`src/components/store/ThemeChrome.tsx:400-421`).
*Unlocks:* nothing — Task 9 runs as written.

**D7 — Is the storefront's widget-data delivery in scope?** *(new, and it is a platform-level fact this plan does **not** fix — **RULED 2026-10-21**: the storefront keeps not mounting widget data in this programme)*
*Question:* on the live storefront **no** `WidgetDataProvider` is mounted (`grep -rn 'WidgetDataProvider' src/` → only `src/components/store/ThemePreviewFrame.tsx:683` and the dead `src/components/store/StorefrontPage.tsx:280`), so a theme's data widgets resolve **no rows** on a live route and render their skeleton. Should this programme fix it?
*Evidence:* `src/components/builder/WidgetDataContext.tsx:17-21` (the default context is an empty bundle), `src/lib/storefront.server.ts:484-514` (the homepage loader resolves the bundle and ships the map in the SSR payload — but no host mounts the provider).
*What this plan does about it:* **nothing** — it is the widget-data architecture, which the expert explicitly put out of scope (*"Do not redo the plugin registry or widget architecture"*). It is recorded here so the search work is not misread as fixing it: **the search results reach the storefront through `productSlot`, not through the widget-data pipeline.** Task 2's host-slot change and Task 9's route split are what restore live search results, and **neither depends on the widget-data pipeline**. `facet_sidebar` is the one search widget that does depend on it (`source: "facets"`, `src/lib/widget-registry.ts:483-503`), which is exactly why it stays **preview-only** on the storefront.
* **RULED 2026-10-21 (closing wave) — the storefront keeps not mounting widget data in this programme.** The platform's **per-widget data delivery** on storefront hosts is a **platform-level feature with its own scope** (the expert put the widget architecture out of scope), and **nothing in this programme depends on it**: the storefront's live search results reach the theme through the route's `productSlot`, not through the widget-data pipeline. The consequence is already stated everywhere it matters — `facet_sidebar` is **preview-only**, and the distinctness gate records `search` as a **documented exception**. **Follow-up:** a **platform-level widget-data delivery epic**; **the gate's `search` exception must keep naming D7** so the gate's basis stays honest while the decision stands, and that exception is revisited when the epic lands. **Where the follow-up lives:** this entry, the evidence record's **§(K.3)** and **§(G.2)**, and the gate's `search` exception (`src/lib/themes/songoskriti/template-distinctness.ts:231-236`).

---

## Mapping — the expert's six items → this plan's tasks

| # | Expert item (verbatim intent) | Tasks | Where it lands |
|---|---|---|---|
| 1 | **P0 — Author a real Songoskriti Search template** (query and result summary, filters, active filter chips, sort controls, results grid, pagination, tailored empty/error states; the theme controls composition, the platform executes and authorizes the search) | **2 → 3 → 9** | Task 2 authors the body + makes the theme's grid honour the host slot; Task 3 moves the pins; Task 9 (**D6 ruled = State B**) splits the route's listing into per-widget pieces and hands the theme a results block that still carries the query box and the platform's category/kind chips. |
| 2 | **P0 — Make Cart and Account previews representative** (null cart slots → realistic synthetic cart lines + a coherent summary; a real-looking Songoskriti account and order history; a visible demo indicator; live cart mutations, customer authorization, price calculation and order data preserved) | **4 → 6 → 7** | Task 6 authors the cart's **commerce composition** (the two platform commerce widgets, one `<h1>` claimant, no demo rail); Task 4 authors the theme-owned synthetic cart context, account rows and facet rows; Task 7 (preview host) mounts them. **Preview-scoped only** — the live cart/account routes are not touched. |
| 3 | **P0 — Finish Blog and Page preview composition** (a distinctive Songoskriti editorial listing/article composition instead of "Meet the makers"; an explicitly labelled, well-designed sample content page; the production Page route keeps the merchant's CMS record) | **5 → 6 → 7** | Task 5 authors the blog body + the sample page; Task 6 moves the pins; Task 7 mounts the demo blog feed and the sample page. **Preview-scoped** — `BlogArchiveTheme` and the Page route are not touched (**D5**). |
| 4 | **P0 — Render the authored Checkout template in preview** (ThemePreviewFrame currently bypasses the checkout AST for CheckoutMock; theme-specific presentation from approved platform-owned form and payment components, synthetic order data, test-only actions) | **6 → 7 → 8** | Task 6 authors the checkout body from platform-owned commerce widgets; Task 7 renders it in the preview instead of `CheckoutMock`; Task 8 pins it. **Preview-scoped** — the production checkout route is not touched (**D2**). |
| 5 | **P0 — Decide and implement the Archive contract** (a real first-class template key only after defining which archive-like routes it represents; parser, template maps, route resolver, zone rules, default templates, editor selection, preview, publishing, tests; unsupported routes must not silently redirect to the homepage) | **1 → 10** | Task 10, **last**. **D1 is ruled (Option A): no `archive` key.** Task 10 is the **documented archive contract** — the blog taxonomy archives are the archive surface, they wear the `blog` template plus the existing blog pack — plus the preview's **explicit unsupported state** for an unsupported template (a named "not supported by this theme" panel, never a silent homepage redirect). Task 1's escalation record enumerates the measured blast radius that makes Option A the ruling: `TEMPLATE_KEYS` referenced in **11 files** (the audit quotes 16 sites), **16** `Record<TemplateKey, …>` occurrences in 9 files (the audit quotes 7 maps), **41** per-widget `templates:` allowlists, the hand-written `z.enum` at `src/lib/storefront.functions.ts:97-107`, the theme-package contract and `THEME_API_RANGE`. |
| 6 | **P1 — Introduce a template-distinctness acceptance gate** (Songoskriti-specific, every claimed template, expected theme-owned composition + required functional data slots + distinct layout structure; documented approved exceptions only for genuinely shared/unsupported surfaces) | **8** | Task 8: `src/lib/themes/songoskriti/template-distinctness.ts` + `…/template-distinctness.test.ts`, with the per-template table spelled out and the gate proven to fail against the legacy compositions. |
| — | *(expert's closing bar)* "all supported template tabs show the real theme-authored composition; demo data is realistic and explicitly labelled; Page previews a useful sample but the live Page route renders the actual CMS record; Checkout preview renders the authored template; Archive has an explicit contract and route mapping; each claimed template passes a theme-distinctness test" | **1–10** | Verified end-to-end by Task 11 (the evidence record). |

---

## Phase Roadmap

| Phase | What it delivers | Blocked by | Files it touches |
|---|---|---|---|
| **1 — Escalation record** (Task 1) | One append-only record naming every escalated file, with the exact diff shape, the reason and the §7 clause | — (none) | NEW `docs/**` |
| **2 — Theme-owned compositions** (Tasks 2, 4, 5, 6) | The search, cart/account-demo, blog, page-sample and checkout bodies, authored by the theme — the cart and checkout bodies each with exactly one `<h1>` claimant | — (none) | `src/lib/themes/songoskriti/preview.ts`; `src/components/builder/songoskriti.tsx`; NEW theme-owned fixture modules; NEW tests |
| **3 — The frozen pins** (Tasks 3, 6) | The two composition pins moved to the new bodies, one commit each | — (none) | two existing test files (escalated) |
| **4 — The preview host** (Task 7) | The preview renders every authored composition, with representative, labelled demo data | — (none) | `src/components/store/ThemePreviewFrame.tsx` (escalated); NEW test |
| **5 — The distinctness gate** (Task 8) | A Songoskriti-specific acceptance gate, proven to fail against the legacy bodies | — (none) | NEW theme-owned rule module + NEW test |
| **6 — The storefront search split** (Task 9) | The theme places the platform's search pieces individually, and the query box and the category/kind chips stay visible on the live page | — (ruled: **D6** = State B, **D4** = relaxed) | `src/routes/store.$slug.search.tsx` (escalated) |
| **7 — The archive contract** (Task 10) | The documented contract (taxonomy archives → the `blog` template + the blog pack, **no new key**) and the preview's explicit unsupported state | — (ruled: **D1** = Option A) | `src/components/store/ThemePreviewFrame.tsx` (escalated — already escalated in Task 7) + NEW test |
| **8 — Evidence** (Task 11) | The evidence record, the stale-parity list and the acceptance walk-through | — (none) | NEW `docs/**` |

---

## Tasks

### Task 1 — Record the escalation bundle for the template-completeness work

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` — **docs**
- Read-only references: `src/components/store/ThemePreviewFrame.tsx`, `src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts`, `src/lib/themes/songoskriti/preview.test.ts`, `src/routes/store.$slug.search.tsx`, `src/components/builder/SectionRenderer.tsx`, `src/lib/builder-ast.ts`, `src/components/builder/cart.tsx`, `src/components/builder/CartContext.tsx`, `src/components/builder/blog.tsx`, `src/components/builder/account.tsx`, `src/components/builder/songoskriti.tsx`, `src/lib/demo-catalog.ts`, `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md`

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `songoskritiPreviewSource().main(template, s)` (`:83`), `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`), `catalogEntry(type)` (`:7048`), `isContextMismatch(type, template)` (`:7935`), `ThemePreviewFrame` (`src/components/store/ThemePreviewFrame.tsx:420`), `useMockProductSlots` (`:257`), `SectionRenderer`'s context-slot gate (`src/components/builder/SectionRenderer.tsx:814-833`), `CartContextValue` / `DEMO_CART` (`src/components/builder/CartContext.tsx:50`, `:75`), `CartProvider` (`:128`), `BlogFeed` / `BlogFeedProvider` (`src/components/builder/blog.tsx:22`, `:32`), `COLLECTION_WIDGETS` (`src/components/builder/collection.tsx:755`), `CollectionQueryProvider` (`:55`), `OrdersList` / `ProfileCard` (`src/components/builder/account.tsx:70`, `:141`), `accountSlotCtx` (`src/components/store/account-slots.tsx:54`), `demoCatalogFor` (`src/lib/demo-catalog.ts:3216`), `previewDemoMap` (`src/lib/preview-demo-data.ts:47`).
- Produces: `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` — a document, no code symbols.

- [ ] **1.1** Confirm the three structural facts the whole plan rests on, record the exact lines, **and record this plan's base commit**:
  ```
  cd /opt/frame28
  grep -n 'if (entry.templates)' -A 20 src/components/builder/SectionRenderer.tsx | sed -n '1,24p'
  grep -rn 'contextSlots' src/components/store/ src/routes/ | grep -v test
  grep -n 'CollectionQueryProvider' -r src/ | grep -v test
  git rev-parse HEAD
  git log --oneline -1
  ```
  Expected output: the context-slot gate at `src/components/builder/SectionRenderer.tsx:814` with `slot = contextSlots?.[section.type];` and `if (slot === undefined) { if (!editing) return null; … }`; the only `contextSlots` writers on a storefront route are `src/components/store/PageView.tsx:216` (`page_content`), `src/components/store/ProductView.tsx:613` (six product/page slots — `breadcrumb`, `product_media`, `price_block`, `add_to_cart`, `product_meta`, `page_content`), `src/routes/store.$slug.cart.tsx:102` (five cart slots, all `null`) and `src/routes/store.$slug.account.tsx:502` (`accountSlots`); and `CollectionQueryProvider` appears **only** at its definition `src/components/builder/collection.tsx:55` — **no importer**. `git rev-parse HEAD` prints the plan's **base commit** — `a48253c8` on this tree — and that sha is what every later "nothing else changed" proof is scoped to (Tasks 6 and 11). Write it verbatim into the escalation record in step 1.5. **Do not** use the older `74b7f2b0` for that proof: that commit predates Phase 1, so `git diff --stat 74b7f2b0..HEAD -- src/components/store/PageView.tsx` is **not** empty (+45 lines) — Phase 1 already landed the `page_content` slot there, and `ThemeChrome` and `ThemePreviewFrame` changed too.

- [ ] **1.2** Confirm that the theme's search body drops the platform's listing, and that Songoskriti's grid is the reason:
  ```
  grep -n 'productSlot' src/components/builder/widgets.tsx
  grep -n 'const SongoskritiProductGrid' -A 3 src/components/builder/songoskriti.tsx
  sed -n '235,252p' src/lib/themes/songoskriti/preview.ts
  grep -n 'productSlot={listing}' src/routes/store.$slug.search.tsx
  ```
  Expected output: `productSlot` appears in `widgets.tsx` at `:87` (the type), `:1447` (the generic `product_grid` destructures it) and `:1491` (`productSlot ?? …`) — **nowhere else**; `src/components/builder/songoskriti.tsx:897-898` shows `const SongoskritiProductGrid: WidgetComponent = (ctx) => {` / `const { str, data, locale, Heading } = ctx;` (no `productSlot`); the theme's search body is `heading` + `rich_text` + `product_rail` (`preview.ts:235-252`); and the route hands the listing over at `src/routes/store.$slug.search.tsx:559`. Together: **the storefront's search results are dropped on a Songoskriti store.**

- [ ] **1.3** Confirm the preview's three data gaps (cart, account, blog) and the checkout bypass:
  ```
  sed -n '568,578p' src/components/store/ThemePreviewFrame.tsx
  grep -n 'DEMO_CART\|"Sample product"\|"Second product"' src/components/builder/CartContext.tsx
  grep -n 'DEMO_ORDERS\|DEMO_PROFILE\|Demo Shopper' src/lib/preview-demo-data.ts
  grep -n 'CheckoutMock' src/components/store/ThemePreviewFrame.tsx
  grep -n 'SAMPLE\|Sample article' src/components/builder/blog.tsx
  ```
  Expected output: the preview's `cartSlots` object with `cart_lines: null, cart_summary: null, cart_drawer: null, checkout_steps: null, payment_methods: null`; `DEMO_CART` at `CartContext.tsx:75` with `"Sample product"` (`:95`) and `"Second product"` (`:104`); `DEMO_ORDERS` (`preview-demo-data.ts:21`) with `"ORD-1001"`/`"ORD-1002"` and `DEMO_PROFILE` (`:40`) with `"Demo Shopper"` (`:42`); `CheckoutMock` imported at `ThemePreviewFrame.tsx:36` and rendered at `:670`; the blog pack's `SAMPLE` rows at `blog.tsx:52-62` ("Sample article 1"…).

- [ ] **1.4** Measure the archive blast radius this plan will quote as the **reason for Decision D1 (Option A)**, so the ruling rests on measurements, not on the audit's summary:
  ```
  grep -rl 'TEMPLATE_KEYS' src/ --include=*.ts --include=*.tsx | grep -v test | wc -l
  grep -rn 'Record<TemplateKey' src/ --include=*.ts --include=*.tsx | grep -v test | wc -l
  grep -c 'templates: \[' src/lib/builder-ast.ts
  sed -n '97,107p' src/lib/storefront.functions.ts
  grep -n 'THEME_API_RANGE' src/lib/theme-package.ts
  ```
  Expected output: **11 files** reference `TEMPLATE_KEYS` outside tests (36 lines); **16** `Record<TemplateKey, …>` occurrences across **9 files**; **41** catalogue entries carry a `templates:` allowlist; the hand-written `z.enum([...])` at `src/lib/storefront.functions.ts:97-107` listing the nine keys (a compiler-invisible duplicate of `TEMPLATE_KEYS`); and `THEME_API_RANGE = "^3.0.0"` at `src/lib/theme-package.ts:52`. (The Phase-0 audit quotes *"16 `TEMPLATE_KEYS` sites, 7 switch/`Record` maps"* — `phase0-implementation-map.md:249`, `:275`; those are **line** counts of a slightly different grep. The file-level numbers above are the ones that decide the blast radius, and the record must quote **both**, so the discrepancy is visible rather than silently re-derived.) **Because D1 is ruled (Option A), these numbers are the *justification* for the ruling, not a work item: no `archive` key is added and none of those files is edited.**

- [ ] **1.5** Write the escalation record to `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md`, in the house style of `phase1-page-content-escalation.md`. It must contain, in this order:
  - **(a) The finding.** Four findings, one per escalated surface: (i) the preview host is the only place that can feed the preview's cart, account, search, blog and checkout surfaces; (ii) the theme's template compositions are pinned by two existing test files; (iii) the storefront search route hands the theme one opaque block, so the per-widget decomposition needs a route change; (iv) the archive surface needs **no** template key under the D1 ruling (Option A), but the preview's unsupported-template fallback (`src/components/store/ThemePreviewFrame.tsx:486`) is a silent redirect to the homepage and must become an explicit state — a preview-host change. **The record must also state this plan's base commit — `a48253c8`** (step 1.1) — because Tasks 6 and 11 scope their "nothing else changed" proofs to it.
  - **(b) The exact old → new diff**, quoted as unified diff hunks, for each file:
    - `src/components/store/ThemePreviewFrame.tsx` — one new import of the NEW theme-owned demo module; one new `CartProvider` wrapper carrying the synthetic cart value; one new `BlogFeedProvider` wrapper carrying the demo feed; one new permission-slot map for the search widgets the preview grants (`result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header` — `null` each, which is the platform's "granted" token — **plus `facet_sidebar`, which is preview-only** because the preview is the only host that mounts a `WidgetDataProvider`, `src/components/store/ThemePreviewFrame.tsx:683`) plus one `CollectionQueryProvider` carrying the demo query; the five cart slots stay `null` but are granted for the **`checkout`** template as well as `cart` (the authored checkout body is full of context widgets); the checkout branch changed from `<CheckoutMock …/>` to the authored `ast.main` rendered through `SectionRenderer`; and the unsupported-template branch changed from the bare `?? templates.index` (`:486`) to a named "not supported by this theme" panel. **Scope:** the click/submit interception, the skin sheets, `useMockProductSlots`, `accountSlots` and `pageSlots` are all untouched, and no assertion in the file is skipped, weakened or deleted.
    - `src/components/builder/songoskriti-port-freeze.test.tsx:106-110` — the four `TEMPLATE_MAIN` entries for `search`, `blog`, `cart` and `checkout` replaced by the new compositions (the exact strings are given in Tasks 2, 5 and 6).
    - `src/lib/theme-preview-nav.test.ts:120-130` — the `FIRST_SECTION` map's `search` entry (and any other opener that moves).
    - `src/routes/store.$slug.search.tsx` — the search-route hunk, quoted in full: the `listing` block split into named pieces, the `CollectionQueryProvider` mount, the `contextSlots` permission map and the `productSlot`/`fallback` split (the exact shape is given in Task 9.3). **D6 is ruled (State B) and D4 is relaxed, so this file is edited — it is not reserved.**
    - The archive surface — **no key edits** (D1, Option A). The section states the contract instead: *"the archive surface is the blog taxonomy surface (index / category / tag / author); it wears the `blog` template and the existing blog pack; `?template=archive` is unsupported and must produce the explicit unsupported state, not a homepage redirect."* The eleven files measured in step 1.4 are listed as the **blast radius that the ruling avoided**.
  - **(c) The rationale**, per surface. For the preview host: *"the preview is the merchant's first impression and the parity source; the six surfaces it shows are the six surfaces the expert says are generic, and the preview frame is the only host that can supply their data. Without this change the preview keeps showing the studio's `DEMO_CART` and `CheckoutMock`."* For the pins: *"the old expectations are the bug — they pin bodies that carry demo copy and no functional slot; the replacements are strictly stronger: they pin the exact ordered composition including the functional data slots."* For the search route: *"the theme cannot place the platform's search pieces individually because the route hands over one opaque block and the per-widget widgets are context widgets that render only where the host grants permission. The platform keeps executing and authorizing the search; only the presentation channel changes. The query box and the platform's category/kind chips stay inside the results block because they are search execution, not presentation."* For the archive: *"no new key is added (D1): the blog taxonomy surface already wears the `blog` template, and a key added to the editor but not to the parser, the `z.enum` and the preview nav would appear in the builder and vanish from every page — the audit's own warning. What is left is the explicit unsupported state."*
  - **(d) The parity impact.** The six template stills per changed template go stale: `search` (6), `cart` (6), `blog` (6), `checkout` (6) — 24 of the 60 `reference/` captures and the matching 24 machine baselines under `.e2e/songoskriti-port-parity.spec.ts-snapshots/` (the other 36 are unaffected, because only those four templates' bodies change). Re-freezing rewrites all 60 manifest entries and is a **separate owner-approved step**, not part of this plan's commits. The parity suite is owner-run only (in neither `e2e:critical` nor `e2e:security`, `package.json`), so stale baselines do not break CI.
  - **(e) The boundary statement.** *"This record escalates exactly **four** existing files — `src/components/store/ThemePreviewFrame.tsx`, `src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts` and `src/routes/store.$slug.search.tsx` — which are the whole of the §7 relaxation granted by Decision D4. The base commit for every 'nothing else changed' proof in this plan is `a48253c8`. No file under `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/lib/theme-presentations.ts`, `src/lib/unified-widget-registry.ts`, `src/lib/editor/**` or any other route is edited by this plan."*
  - Do **not** record any change to `src/components/store/BlogArchiveTheme.test.tsx` or `src/components/store/ThemePreviewFrame.test.tsx` — neither is touched by this plan.

- [ ] **1.6** Verify every `file:line` cited in the record resolves, by grepping each cited symbol out of the tree:
  ```
  grep -n 'if (entry.templates)' src/components/builder/SectionRenderer.tsx
  grep -n 'export const CollectionQueryProvider' src/components/builder/collection.tsx
  grep -n 'export const DEMO_CART' src/components/builder/CartContext.tsx
  grep -n 'export function BlogFeedProvider' src/components/builder/blog.tsx
  grep -n 'const SongoskritiProductGrid' src/components/builder/songoskriti.tsx
  grep -n 'export function CheckoutMock' src/components/store/CheckoutMock.tsx
  grep -n 'export function demoCatalogFor' src/lib/demo-catalog.ts
  grep -n 'export function previewDemoMap' src/lib/preview-demo-data.ts
  ```
  Expected output: one match per line, at `src/components/builder/SectionRenderer.tsx:814`, `src/components/builder/collection.tsx:55`, `src/components/builder/CartContext.tsx:75`, `src/components/builder/blog.tsx:32`, `src/components/builder/songoskriti.tsx:897`, `src/components/store/CheckoutMock.tsx:4`, `src/lib/demo-catalog.ts:3216`, `src/lib/preview-demo-data.ts:47`.

- [ ] **1.7** Confirm the working tree carries nothing this plan would sweep in, and that the three churn files are unstaged:
  ```
  git status --short
  ```
  Expected output — four lines, in this order: ` M .artifacts/e2e/playwright-report/index.html`, ` M ops/routing/canary-weights.conf`, ` M ops/routing/upstream.conf`, `?? .output-snapshots/` — plus the untracked plan file `?? docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md` (this plan, an input, never staged by this plan's task commits). **No** `git add` of any of those.

- [ ] **1.8** Commit the record on its own, with an explicit path:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md
  git commit -m "docs(songoskriti): record the template-completeness escalation bundle"
  ```
  Expected output: a commit touching **one** file. `git status --short` afterwards still shows the three churn files, `.output-snapshots/` and the untracked plan, all unstaged.

---

### Task 2 — The theme authors a real Songoskriti `search` composition, and the theme's grid honours the host's results

**Files:**
- Create: `src/lib/themes/songoskriti/search-template.test.ts` — **allowed** (NEW test file)
- Create: `src/lib/themes/songoskriti/preview-demo-data.ts` — **allowed** (NEW theme-owned fixture module)
- Modify: `src/lib/themes/songoskriti/preview.ts` (the `case "search":` branch, `:235-252`) — **allowed** (`src/lib/themes/songoskriti/**`)
- Modify: `src/components/builder/songoskriti.tsx` (`SongoskritiProductGrid`, `:897-944`; `SongoskritiResultToolbar`, `:2360-2600`) — **allowed** (§7 carve-out: "theme-owned renderers")

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `songoskritiPreviewSource().main(template, s)` (`:83`), `SectionBuilder` (`src/lib/builder-ast.ts:507`), `ThemeAst` (`:512`), `lintTemplate(ast, template?)` (`:8380`), `primarySectionId(ast)` (`:88`), `routeSuppliesH1(template?)` (`:77`), `catalogEntry(type)` (`:7048`), `genericDemoMain(template, s)` (`src/lib/theme-preview-nav.ts:430`), `WidgetComponent` / `WidgetCtx` (`src/components/builder/widgets.tsx:80`, `:87`), `demoCatalogFor` (`src/lib/demo-catalog.ts:3216`), `groupFacetRows` (`src/components/builder/collection.tsx:94`).
- Produces: `songoskritiPreviewSource().main("search", s)` returns exactly `[Section]` of types `["category_header", "result_toolbar", "facet_sidebar", "filter_chips", "product_grid", "pagination", "empty_state"]`; `SongoskritiProductGrid` renders `ctx.productSlot` when `ctx.template === "search"` and the theme's own row grid otherwise; `SongoskritiResultToolbar` reads the **live** collection query (count + real sort links) and carries **no** hard-coded taxonomy; NEW `src/lib/themes/songoskriti/preview-demo-data.ts` exporting `songoskritiPreviewFacets()` (facet rows for the `facets` widget source) and `songoskritiPreviewCart()` (a synthetic `CartContextValue`: `lines: CartLine[]` plus a `totals: CartTotals` whose own `lines` carry the priced demo products).

- [ ] **2.1** Write the failing theme-level test to `src/lib/themes/songoskriti/search-template.test.ts`. It must import `describe/expect/it` from `vitest`, `lintTemplate`, `primarySectionId`, `routeSuppliesH1`, `type SectionBuilder` from `../../builder-ast`, `genericDemoMain` from `../../theme-preview-nav`, `songoskritiPreviewSource` from `./preview`, and `renderToStaticMarkup` + `createElement` from `react`/`react-dom/server`. It builds the search AST exactly as the engine does — a plain builder (`(type, props = {}) => ({ id: `${type}-${n++}`, type, props: { ...props } })`) passed to `songoskritiPreviewSource().main("search", s)`, because the theme's own `withSongoskritiDefaults`/`withSongoskritiVariation` wrap happens inside `main` (`preview.ts:89`) — and asserts, in eight `it` blocks:
  1. `expect(types).toEqual(["category_header", "result_toolbar", "facet_sidebar", "filter_chips", "product_grid", "pagination", "empty_state"])` — the **exact ordered composition**. One assertion carries four facts: the results grid is present, the six platform search widgets are present, the empty state is present, and the body carries no authored copy of the platform's pieces.
  2. the body contains **no** `rich_text` and **no** `heading` section — the platform owns the query box, the result summary and every label (`src/routes/store.$slug.search.tsx:186-529`); a theme that authors its own copy of them duplicates the platform's surface.
  3. `expect(lintTemplate(ast, "search").filter((issue) => issue.level === "error")).toEqual([])` — **zero lint errors**, with the template key **passed** (the keyed form is the contract; see the Phase-1 plan's Corrections §5). Errors are the composition-breaking findings (a second `<h1>` claimant, a context mismatch, an unsupported widget); the **warn** level is the platform's translation-coverage finding ("no বাংলা translation"), which is a *bilingual-content* concern and not this plan's bar — the shipped `index` body carries **22** such warnings today (measured) and no template this plan leaves alone is rewritten to silence them. This body measures **13 warnings and 0 errors**: one per bilingual catalogue field the theme authors in English only (`heading`/`body`/`homeLabel` on `category_header`, `countLabel`/`filtersLabel`/`sortLabel` on `result_toolbar`, `heading` on `facet_sidebar`, `clearLabel` on `filter_chips`, `heading` on `product_grid`, `pageLabel` on `pagination`, `heading`/`body`/`clearLabel` on `empty_state`). The theme's own bilingual convention (`text`/`text_bn`, `description`/`description_bn`, which is what Songoskriti's presentation actually reads) is present and unflagged, because those props are not catalogue fields.
  4. `expect(routeSuppliesH1("search")).toBe(true)` **and** `expect(primarySectionId(ast)).not.toBeNull()` — the route's `<h1>` lives in its `fallback` (`src/routes/store.$slug.search.tsx:531-534`), which is **not** rendered when the theme publishes a body (`src/components/store/ThemeChrome.tsx:400-421`), so the theme's body must claim the page's h1. `category_header` is the only heading-claiming widget in the body, so the page has exactly one `<h1>`.
  5. every section type is **allowed on the `search` template** — `catalogEntry(type)!.templates` either is absent or includes `"search"` (so no section is a context mismatch that would render a placeholder, `src/components/builder/SectionRenderer.tsx:816-823`). The catalogue says so for all seven (`builder-ast.ts:2696`, `:2722`, `:2762`, `:2776`, `:2798`, `:2829`; `product_grid` carries no allowlist).
  6. `expect(types).not.toEqual(genericDemoMain("search", s).map((x) => x.type))` — the body is no longer the engine's generic demo body.
  7. the serialised props of the body contain **none** of `"Demo search"`, `"Live search runs on the storefront"`, `"Demo"` — the retired demo copy is gone, and no demo marker is introduced (Review Focus 3).
  8. **every prop of every section is named, and the ones a merchant cannot edit are named as such.** Three assertions, in this order:
     - **(a) every section carries at least one editable catalogue field.** For each of the seven sections the test reads the widget's **own** catalogue field list — `catalogEntry(type)!.fields.map((f) => f.key)` — and asserts the section carries at least one of them, so a merchant can edit each widget in the builder: `category_header` → `heading`/`body`/`homeLabel`; `facet_sidebar` → `heading`/`limit`/`collapsed`; `filter_chips` → `clearLabel`/`emptyText`; `result_toolbar` → `countLabel`/`filtersLabel`/`sortLabel`; `pagination` → `mode`/`moreLabel`/`prevLabel`/`nextLabel`/`pageLabel`; `empty_state` → `heading`/`body`/`clearLabel`/`limit`; `product_grid` → `heading`/`limit`/`columns`/`skin`. The list is read **per widget type** — not a hard-coded union — so a widget whose fields change cannot silently pass.
     - **(b) the exact prop-key set of every section is pinned** — `expect(Object.keys(section.props).sort()).toEqual([...])` for all seven, so no prop can be added or dropped without failing: `category_header` → `["body","description","description_bn","heading","homeLabel","text","text_bn"]`; `result_toolbar` → `["countLabel","filtersLabel","sortDefault","sortLabel"]`; `facet_sidebar` → `["collapsed","heading","limit"]`; `filter_chips` → `["clearLabel"]`; `product_grid` → `["columns","heading","limit","skin"]`; `pagination` → `["mode","pageLabel"]`; `empty_state` → `["body","clearLabel","heading","limit"]`.
     - **(c) the props outside the catalogue field lists are asserted as an exact set** — the test computes them (`props` minus `catalogEntry(type)!.fields`) and asserts the result equals `["category_header:text", "category_header:text_bn", "category_header:description", "category_header:description_bn", "result_toolbar:sortDefault"]` — **five** props, on **two** widgets, and no others. `text`/`text_bn`/`description`/`description_bn` are the Songoskriti header convention (`src/components/builder/songoskriti.tsx:2251-2254`); `sortDefault` is the theme's own sort label (`src/components/builder/songoskriti.tsx:2369`). Both groups are outside the catalogue's field lists, so a merchant editing these widgets in the builder **will not see them** — that is why the theme passes the catalogue fields **as well**, with the same values (see step 2.5). `facet_sidebar.limit`, `facet_sidebar.collapsed`, `pagination.mode` and `empty_state.limit` are **not** in this set: they are ordinary catalogue fields (a number, a boolean and a select — machine values, not prose), so the merchant *does* see them in the editor; they are simply outside the **bilingual** list (`BITEXT_FIELDS`, `src/lib/builder-ast.ts:5998-6012`), which covers shopper-facing prose only ("machine values (URLs, ISO dates, counts, tokens) stay single-valued on purpose", `src/lib/builder-ast.ts:5861-5865`).

- [ ] **2.2** Write the failing presentation test to the same file (a second `describe` block). It must import `SONOSKRITI_WIDGETS` from `../../../components/builder/songoskriti`, `CollectionQueryProvider` from `../../../components/builder/collection` and `normalizeSearchParams` from `../../storefront-search`, and render the theme's own `product_grid` presentation through `renderToStaticMarkup`, twice:
  - **on the `search` template** — the widget receives `template: "search"`, a `productSlot` node (`<ul id="HOST-SLOT-MARKER" />`) and `data: { rows: undefined, pending: false }`; the assertion is `expect(html).toContain("HOST-SLOT-MARKER")` — the platform's results slot wins. **In the same `it` block**, the test also renders the theme's `result_toolbar` presentation (`SONOSKRITI_WIDGETS.result_toolbar`) inside a `CollectionQueryProvider` (`src/components/builder/collection.tsx:55`) carrying `{ params: normalizeSearchParams({ q: "jamdani" }), total: 24, basePath: "/store/songoskriti/search" }`, and asserts that the markup contains the **live count** (`"24"`) and the **real sort href** built from the query — and that it contains **none** of the hard-coded taxonomy (`"Sarees"`, `"Panjabi"`, `"Jewellery"`, `"Festive"`, `"Wedding"`, `"Eid"`). Those assertions are what make Task 9's storefront grant of `result_toolbar` safe (Review Focus 3): the theme's toolbar must show the shopper's count and sort, not a representative demo.
  - **on the `collection` template** — the same widget with `template: "collection"`, the same `productSlot` node and `data: { rows: [{ id: "p1", title: "Row product", … }], pending: false }`; the assertions are `expect(html).not.toContain("HOST-SLOT-MARKER")` and `expect(html).toContain("Row product")` — the collection page keeps the theme's styled grid and does **not** inherit the route's plain grid (the regression Review Focus 1 guards against). **This case is a guard**: it passes before *and* after the change, and it exists to fail if the host slot is ever honoured everywhere. Say so in the test's name.

- [ ] **2.3** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/search-template.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  5 failed | 5 passed (10)`. The composition assertion fails with `expected [ 'heading', 'rich_text', 'product_rail' ] to deeply equal [ 'category_header', 'result_toolbar', 'facet_sidebar', 'filter_chips', 'product_grid', 'pagination', 'empty_state' ]`; the no-copy assertion fails with `expected [ 'heading', 'rich_text', 'product_rail' ] to deeply equal []`; the demo-copy assertion fails on `"Demo search"`; the props assertion fails because none of the six platform search widgets is present in today's body (`["heading","rich_text","product_rail"]` carries no catalogue field prop for any of them, so the per-section prop sets do not match); and the search-presentation assertion fails with `expected '<div class="fq-theme-scope min-h-scre…' to contain 'HOST-SLOT-MARKER'` — the theme's grid renders its skeleton instead of the host's results — **and**, in the same block, the toolbar assertions fail on both counts: the markup shows `"Products"` instead of the live `"24"` (the presentation reads `data?.rows?.length`, not the query), and it still contains the hard-coded taxonomy (`"Sarees"`, `"Panjabi"`, `"Jewellery"`). The **five that pass today** are the lint assertion (today's body carries **zero lint errors** — it claims no `<h1>`, but `search` is a route-`<h1>` template, so no "No primary heading on this template." finding is raised), the primary-section assertion, the catalogue-allowlist assertion, the not-generic assertion (the current body is `["heading","rich_text","product_rail"]`, which is *not* the engine's `["heading","rich_text"]` generic body), and the collection guard.

- [ ] **2.4** Create the theme-owned demo-data module `src/lib/themes/songoskriti/preview-demo-data.ts`. It must export:
  - `songoskritiPreviewFacets(): WidgetRow[]` — rows shaped for the `facets` widget source, exactly as `groupFacetRows` expects (`src/components/builder/collection.tsx:94-108`): rows with `subtitle: "category"` (a Songoskriti category slug + name + count), rows with `subtitle: "kind"` (`"physical"` / `"digital"`), one row with `subtitle: "stock"` and one with `subtitle: "total"` carrying `count`. The category slugs come from the Songoskriti demo catalogue (`demoCatalogFor("songoskriti").categories`, `src/lib/demo-catalog.ts:3216`), so the preview's facets match the preview's products.
  - `songoskritiPreviewCart(): CartContextValue` — a synthetic cart in **two** parts, because the type has two parts:
    - the **context value** (`src/components/builder/CartContext.tsx:50-68`) carries **`lines: CartLine[]`** — `CartLine` is `{ variantId, quantity }` (`src/lib/cart.ts:4`), and this is the field the `cart_lines` widget merges quantities from — plus `count` = the total quantity, `totals` (below), `pending: false`, `error: null`, `methods: ["cod", "bkash", "nagad"]`, `method: "cod"`, `couponCode: ""`, `live: false`, and the inert `setMethod`/`setCouponCode`/`setQuantity`/`remove`/`clear` no-ops. The context value has **no** `freeShippingThresholdMinor` and **no** `freeShippingRemainingMinor` — those are not its fields.
    - the **`totals`** field is a `CartTotals` (`src/components/builder/CartContext.tsx:26`), and it is where the money and the two free-shipping fields live: `freeShippingThresholdMinor: 300000` and `freeShippingRemainingMinor` = `max(0, threshold − subtotal)` (`src/components/builder/CartContext.tsx:35`, `:37`); `totals.lines` cites **real Songoskriti demo-catalogue products** ("Dhakai Jamdani Heritage Saree" 1,850,000 minor; "Comilla Handspun Khadi Kurta" 285,000 minor; "Dhamrai Brass Heritage Necklace" 185,000 minor — `src/lib/demo-catalog.ts`), and its money is **derived, never typed twice**: `subtotalMinor = Σ lineTotalMinor`, `shippingMinor = 6000`, `totalMinor = subtotalMinor + shippingMinor`.
  The module's header comment states the contract: **synthetic data, never a merchant's, never a price the platform would not compute** — the same contract as "Demo Shopper" (`src/lib/preview-demo-data.ts:42`) and "Sample product" (`src/components/builder/CartContext.tsx:95`).
  Run `node_modules/.bin/prettier --write src/lib/themes/songoskriti/preview-demo-data.ts` after writing it (a NEW file is exempt from the "no reformat" rule; the check in step 2.9 must pass afterwards).

- [ ] **2.5** Replace the theme's `case "search":` body in `src/lib/themes/songoskriti/preview.ts` (`:235-252`) with the authored composition:
  ```ts
        case "search":
          // The platform owns the search: it executes the query, authorizes the
          // tenant and prices the results (`store.$slug.search.tsx:42-105`),
          // and it hands the theme ONE opaque block (`productSlot`, `:559`).
          // The theme owns the composition around it — the section order, the
          // filters column, the results area, the pager and the empty state.
          // No authored copy of the platform's pieces (no heading, no rich_text):
          // the route's own query box, summary and labels stay the single
          // source of truth (`Review Focus 2` in the plan).
          return [
            s("category_header", {
              text: "Search the collection",
              text_bn: "কালেকশনে খুঁজুন",
              description:
                "Every result is priced and stocked by the store — filters only narrow what is already published.",
              description_bn:
                "প্রতিটি ফলাফলের দাম ও স্টক দোকানই নির্ধারণ করে — ফিল্টার শুধু প্রকাশিত পণ্য ফলাক করে।",
              heading: "Search the collection",
              body: "Every result is priced and stocked by the store — filters only narrow what is already published.",
              homeLabel: "Home",
            }),
            s("result_toolbar", {
              countLabel: "products",
              filtersLabel: "Filters",
              sortLabel: "Sort",
              sortDefault: "Featured",
            }),
            s("facet_sidebar", {
              heading: "Filters",
              limit: 12,
              collapsed: false,
            }),
            s("filter_chips", { clearLabel: "Clear all" }),
            s("product_grid", {
              heading: "Results",
              limit: 24,
              columns: 4,
              skin: "cards",
            }),
            s("pagination", { mode: "numbered", pageLabel: "Page" }),
            s("empty_state", {
              heading: "Nothing matches those filters",
              body: "Try a shorter word, or clear a filter to widen the results.",
              clearLabel: "Clear all filters",
              limit: 4,
            }),
          ];
  ```
  The array above is **already in the exact form prettier produces at this indentation** (the `case` line sits at column 9, the `return` at column 11, so the collapsed one-liner would exceed 80 columns and prettier keeps the array expanded). Verify with `node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts` — if it reports a diff, run `node_modules/.bin/prettier --write` on that one path and re-check; never re-shape the block by hand to match a snippet checked outside this file's nesting. Touch **no other** `case` branch, the `rail` helper, or the `main` wrapper at `:83-90`.
  **On the props — every prop of every section, and who can edit it.** The snippet carries **twenty-five** props across seven sections. The catalogue field list of a widget is `catalogEntry(type).fields` — the fields the builder renders as inputs. A prop that is **not** in that list is **not editable in the builder**: a merchant editing that widget will not see it. The step-2.1 props assertion pins exactly this split, so the two lists below are the contract, not a narrative:
  - **`category_header`** — seven props. **Catalogue fields (editable, three):** `heading`, `body`, `homeLabel` (`src/lib/builder-ast.ts:2691-2714`; the entry also has `imageUrl`/`scrim`/`showCount`/`showBreadcrumb`, deliberately **not** passed — only the generic header reads them). **Outside the catalogue (four, not editable):** `text`, `text_bn`, `description`, `description_bn` — the Songoskriti header convention; its presentation reads `text`/`text_bn` first and falls back to `body` for the description (`src/components/builder/songoskriti.tsx:2251-2254`), and it is the convention the theme's existing `collection` template already uses (`src/lib/themes/songoskriti/preview.ts:110-127`). **What they do:** `text`/`text_bn` are the rendered title (English/বাংলা) and `description`/`description_bn` the rendered sub-copy; the catalogue trio exists so the **builder's initial state matches what renders**. **Why a merchant does not see them:** they are not fields of `category_header` in the catalogue, so the inspector renders no input for them and a merchant edit of `heading` would not change the rendered title. Aligning the two conventions is a platform/theme change outside this plan; it is recorded here rather than papered over. The presentation still prefers `text`/`description` over `heading`/`body`.
  - **`result_toolbar`** — four props. **Catalogue fields (editable, three):** `countLabel`, `filtersLabel`, `sortLabel` (`src/lib/builder-ast.ts:2771-2790`; the entry also has `showSort`/`showDensity`, deliberately **not** passed). **Outside the catalogue (one, not editable):** `sortDefault` — the theme's own default sort label, read by Songoskriti's presentation (`src/components/builder/songoskriti.tsx:2369`). **What it does:** it is the label the theme's toolbar shows before the shopper picks a sort. **Why a merchant does not see it:** it is not a field of `result_toolbar` in the catalogue, so the inspector renders no input for it — the merchant changes the sort *label* through `sortLabel` and the *default* through the platform's own sort control.
  - **`facet_sidebar`** — three props, **all catalogue fields (editable)**: `heading`, `limit`, `collapsed` (`src/lib/builder-ast.ts:2717-2754`). `limit` (a number) and `collapsed` (a boolean) are outside the **bilingual** list (`BITEXT_FIELDS`, `src/lib/builder-ast.ts:5999-6008`) because they are machine values, not prose — but they are ordinary fields, so the merchant **does** see them as a number input and a switch.
  - **`filter_chips`** — one prop, **a catalogue field (editable)**: `clearLabel` (`src/lib/builder-ast.ts:2757-2768`).
  - **`product_grid`** — four props, **all catalogue fields (editable)**: `heading`, `limit`, `columns`, `skin` (`src/lib/builder-ast.ts:1247-1277`; the widget carries no `templates:` allowlist, so it is not a context widget).
  - **`pagination`** — two props, **both catalogue fields (editable)**: `mode` (a select) and `pageLabel` (`src/lib/builder-ast.ts:2793-2821`). `mode` is outside the bilingual list because it is a machine value; the merchant **does** see it as a select.
  - **`empty_state`** — four props, **all catalogue fields (editable)**: `heading`, `body`, `clearLabel`, `limit` (`src/lib/builder-ast.ts:2824-2843`); `limit` is a number field, so it is outside the bilingual list but visible in the inspector.
  **So the complete set of props outside a widget's catalogue field list is five, on two widgets:** `category_header.text`, `category_header.text_bn`, `category_header.description`, `category_header.description_bn` and `result_toolbar.sortDefault` — and the step-2.1 props assertion (c) asserts exactly that set, by name, so a sixth uneditable prop cannot be added silently.

- [ ] **2.6** Make the theme's grid honour the host's results — **on the `search` template only**. In `src/components/builder/songoskriti.tsx`, change the `SongoskritiProductGrid` component (`:897-944`) so that it destructures `productSlot` and `template` from `ctx`, and renders the host slot when the template is `search`:
  ```ts
  const SongoskritiProductGrid: WidgetComponent = (ctx) => {
    const { str, data, locale, Heading, productSlot, template } = ctx;
    // The search route hands the theme ONE opaque block (`productSlot`,
    // `store.$slug.search.tsx:559`) — the platform's executed and priced
    // results. On the search template that block IS the result set, so it
    // wins. Every other template keeps the theme's own row grid: the
    // collection route passes a differently-shaped slot (`c.$collectionSlug
    // .tsx:220`) and must not lose its styled cards.
    const host = template === "search" ? productSlot : undefined;
    const rows = data?.rows;
    …
  ```
  **The render change is one expression.** Where the component renders its own grid — the `rows.map(...)` block that draws `SongoskritiProductCard` — it now renders `host ??` **that same block, unchanged**: on the `search` template the host's results win, and on every other template the theme's own row grid renders exactly as before. The rest of the component (its heading, its skeleton grid, `SongoskritiProductCard`) is unchanged. The `WidgetCtx` type already carries both props (`productSlot?: React.ReactNode` at `src/components/builder/widgets.tsx:87`; `template` is passed by `SectionRenderer` at `src/components/builder/SectionRenderer.tsx:880`).

  **And in the same file — make the theme's `result_toolbar` presentation live-capable.** `SongoskritiResultToolbar` (`:2360-2600`) is **representative**: its count is `data?.rows?.length ?? 0` (`:2364`), its filter drawer holds the theme's **hard-coded** taxonomy (`FILTER_GROUPS`, `:2380-2409` — "Sarees, Panjabi, Kids, Jewellery") and its sort entries are inert `<button>`s that change nothing (`:2493-2502`). Task 9 grants `result_toolbar` on the **live storefront** (Decision **D6**), and on a storefront the **theme's** presentation is what renders (`resolveThemePresentation`, `src/lib/theme-presentations.ts:140-155`; Songoskriti's claims, `src/lib/themes/songoskriti/presentation-claims.ts:36-50`) — so a representative toolbar with a demo taxonomy and an inert sort would land on a merchant's live page, which Review Focus 3 forbids. Therefore, in the same edit:
  - the count comes from the **live** query — `useCollectionQuery().total` (`src/components/builder/collection.tsx:57`), falling back to `data?.rows?.length` when there is no provider (the studio canvas);
  - the sort entries become **real links** built from the query — `facetHref` / `withSort` (`src/lib/facet-url.ts`), the same helpers the platform's own toolbar uses (`src/components/builder/collection.tsx:475-535`);
  - the **hard-coded `FILTER_GROUPS` are deleted**, and the drawer renders **only** the platform's real facet rows (`groupFacetRows(data?.rows)`, `src/components/builder/collection.tsx:94`) — so on a storefront, where the widget-data pipeline is absent (Decision **D7**), the drawer has no rows and its "Filters" control does not render; on the storefront the real filters are the platform's category/kind chips, which Task 9 keeps inside the results block.

  This is a **theme-owned** change (`src/components/builder/songoskriti.tsx` is inside §7's editable list), and it is what makes Task 9's grant of `result_toolbar` safe.

- [ ] **2.7** Run the test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/search-template.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  10 passed (10)`.

- [ ] **2.8** Run the affected neighbouring suites and confirm they are green:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/components/builder/songoskriti.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/lib/definition-of-done.test.ts src/lib/themes/songoskriti/search-template.test.ts
  ```
  Expected output: `Test Files  8 passed | 2 failed (10)` / `Tests  2 failed | 236 passed (238)` — **exactly two** failures, both stale pins: `songoskriti-port-freeze.test.tsx` on `search template main zone is frozen` with `expected [ 'category_header', 'result_toolbar', 'facet_sidebar', 'filter_chips', 'product_grid', 'pagination', 'empty_state' ] to deeply equal [ 'heading', 'rich_text', 'product_rail' ]`, and `theme-preview-nav.test.ts` on `search first section` with `expected 'category_header' to be 'heading'`. **Both are fixed in Task 3; no other failure is acceptable.** (Measured baseline on this tree, before this task: `preview.test.ts` 3, `wiring.test.ts` 7, `skins.test.ts` 20, `widgets.test.ts` 18, `songoskriti.test.tsx` 52, `ThemePreviewFrame.test.tsx` 53, `definition-of-done.test.ts` 11, `songoskriti-port-freeze.test.tsx` 21, `theme-preview-nav.test.ts` 43 — plus the new suite's 10.)

- [ ] **2.9** Check formatting and lint on the touched files:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts src/components/builder/songoskriti.tsx src/lib/themes/songoskriti/preview-demo-data.ts src/lib/themes/songoskriti/search-template.test.ts
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts src/components/builder/songoskriti.tsx src/lib/themes/songoskriti/preview-demo-data.ts src/lib/themes/songoskriti/search-template.test.ts
  ```
  Expected output: `All matched files use Prettier code style!` and exit 0 from prettier; no output and exit 0 from eslint.

- [ ] **2.10** Typecheck **before** staging:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: no output, exit 0.

- [ ] **2.11** Stage exactly the four paths and commit:
  ```
  git add src/lib/themes/songoskriti/preview.ts src/components/builder/songoskriti.tsx src/lib/themes/songoskriti/preview-demo-data.ts src/lib/themes/songoskriti/search-template.test.ts
  git status --short
  ```
  Expected output: the four paths staged (`M  src/lib/themes/songoskriti/preview.ts`, `M  src/components/builder/songoskriti.tsx`, `A  src/lib/themes/songoskriti/preview-demo-data.ts`, `A  src/lib/themes/songoskriti/search-template.test.ts`) and the three churn files + `.output-snapshots/` + the untracked plan still **unstaged**.

- [ ] **2.12** Commit:
  ```
  git commit -m "feat(songoskriti): author the search template and honour the host's results"
  ```
  Expected output: a commit touching exactly four files; `git show --stat --oneline HEAD` lists them.

---

### Task 3 — Move the two frozen pins to the new search composition

**Files:**
- Modify: `src/components/builder/songoskriti-port-freeze.test.tsx` (the `TEMPLATE_MAIN.search` literal, `:110`) — **escalation** (existing test file)
- Modify: `src/lib/theme-preview-nav.test.ts` (the `FIRST_SECTION` map, `:120-130`) — **escalation** (existing test file)
- Modify: `src/lib/themes/songoskriti/skins.test.ts` (the `search`/`cart` body assertions, `:146-165`) — **NO escalation**: the file is under `src/lib/themes/songoskriti/**`, which port spec §7 already makes editable. It pins that the `search` and `cart` bodies author a `product_rail`, which this plan removes, so it must move with them.
- Reference (unchanged): `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` §(b)

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`), `TemplateKey` (`:60`).
- Produces: `TEMPLATE_MAIN.search` = `["category_header", "result_toolbar", "facet_sidebar", "filter_chips", "product_grid", "pagination", "empty_state"]`; `FIRST_SECTION.search` = `"category_header"`.

- [ ] **3.1** Confirm the Task-1 escalation is committed and names both pins:
  ```
  git log --oneline -1 -- docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md
  grep -n 'songoskriti-port-freeze.test.tsx\|theme-preview-nav.test.ts' docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md
  ```
  Expected output: `docs(songoskriti): record the template-completeness escalation bundle` and two matching lines in §(b). If the log prints nothing, **stop** — Task 1 has not landed and port spec §9 forbids the update.

- [ ] **3.2** Reproduce the stale-pin failure in the freeze suite:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  1 failed (21)`; the failing case is `search template main zone is frozen` with `expected [ 'category_header', 'result_toolbar', 'facet_sidebar', 'filter_chips', 'product_grid', 'pagination', 'empty_state' ] to deeply equal [ 'heading', 'rich_text', 'product_rail' ]`. The suite has **21** tests in total, so the other **20** cases pass — the failure is the pin, not the theme. (Updating a pinned expectation does not change the count: the post-update figure in step 3.6 is `21 passed (21)`.)

- [ ] **3.3** Reproduce the stale-pin failure in the preview-nav suite:
  ```
  node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  1 failed | 42 passed (43)`; the failing assertion is the `search first section` case with `expected 'category_header' to be 'heading'`.

- [ ] **3.4** Update the freeze pin — one line, `src/components/builder/songoskriti-port-freeze.test.tsx:110`:
  ```
  -  search: ["heading", "rich_text", "product_rail"],
  +  search: [
  +    "category_header",
  +    "result_toolbar",
  +    "facet_sidebar",
  +    "filter_chips",
  +    "product_grid",
  +    "pagination",
  +    "empty_state",
  +  ],
  ```
  The assertion itself (`:159`, `expect(main.map((x: Section) => x.type)).toEqual(TEMPLATE_MAIN[key])`) is **not** touched: it still pins the exact ordered composition. The old expectation is **replaced, not deleted**, and the replacement is strictly stronger — it names every functional slot the search surface needs.

- [ ] **3.5** Update the preview-nav opener map — `src/lib/theme-preview-nav.test.ts`, the `FIRST_SECTION` map (`:120-130`), **by key**: the `search` entry (`search: "heading"`, `:129`) becomes `search: "category_header"`. One line; the map already pins all nine openers explicitly, so the assertion stays total and no default branch is reintroduced. `TemplateKey` is already imported in that file (`import { flattenSections, type TemplateKey } from "./builder-ast";`) — do not touch the import. (The `blog` entry is at `:126` and is moved in Task 6 — the map is pinned **by key**, so the two edits do not collide.)

- [ ] **3.6** Run the freeze suite and confirm it passes:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  21 passed (21)`.

- [ ] **3.7** Run the preview-nav suite and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  43 passed (43)`.

- [ ] **3.8** Run the whole neighbourhood again, including the new search suite:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/lib/themes/songoskriti/search-template.test.ts src/components/builder/songoskriti.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/lib/definition-of-done.test.ts
  ```
  Expected output: `Test Files  10 passed (10)` / `Tests  238 passed (238)` — freeze 21, preview-nav 43, `preview.test.ts` 3, `wiring.test.ts` 7, `skins.test.ts` 20, `widgets.test.ts` 18, the new search suite 10, `songoskriti.test.tsx` 52, `ThemePreviewFrame.test.tsx` 53, `definition-of-done.test.ts` 11 — and **zero** failures.

- [ ] **3.9** Check formatting and lint on the two touched files:
  ```
  node_modules/.bin/prettier --check src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  node_modules/.bin/eslint src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `All matched files use Prettier code style!` and no eslint output, exit 0.

- [ ] **3.10** Typecheck before committing:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: no output, exit 0.

- [ ] **3.11** Stage exactly the two paths and commit:
  ```
  git add src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  git commit -m "test(songoskriti): move the search composition pins to the authored body"
  ```
  Expected output: a commit touching exactly two files; `git show --stat --oneline HEAD` lists only those two.

---

### Task 4 — Representative demo data for the cart, the account and the search facets

**Files:**
- Create: `src/lib/themes/songoskriti/cart-account-demo.test.ts` — **allowed** (NEW test file)
- Modify: `src/lib/themes/songoskriti/preview-demo-data.ts` (created in Task 2) — **allowed**
- Read-only references: `src/components/builder/CartContext.tsx`, `src/components/builder/account.tsx`, `src/components/store/account-slots.tsx`, `src/lib/preview-demo-data.ts`, `src/lib/demo-catalog.ts`

**Interfaces:**
- Consumes: `demoCatalogFor("songoskriti")` (`src/lib/demo-catalog.ts:3216`), `CartContextValue` / `CartTotals` (`src/components/builder/CartContext.tsx:50`, `:26`), `CartLine` (`src/lib/cart.ts:4`), `mapOrdersToRows` / `mapProfileToRow` (`src/components/store/account-slots.tsx:31`, `:42`), `WidgetRow` (`src/lib/widget-data.ts`), `groupFacetRows` (`src/components/builder/collection.tsx:94`).
- Produces: `src/lib/themes/songoskriti/preview-demo-data.ts` gains `songoskritiPreviewOrders(): WidgetRow[]`, `songoskritiPreviewProfile(): WidgetRow` and `songoskritiPreviewCart(): CartContextValue` (the last already added in Task 2, extended here with the Songoskriti order rows' consistency), each visibly labelled as demo.

- [ ] **4.1** Write the failing test to `src/lib/themes/songoskriti/cart-account-demo.test.ts`. It imports `describe/expect/it` from `vitest`, `songoskritiPreviewCart` and `songoskritiPreviewFacets` from `./preview-demo-data`, `demoCatalogFor` from `../../demo-catalog`, `groupFacetRows` from `../../../components/builder/collection`, and asserts, in seven `it` blocks. **The two exports that Task 4 adds are imported *dynamically inside* their tests** (`const { songoskritiPreviewOrders } = await import("./preview-demo-data");`) — the same shape the Phase-1 preview suite uses (`src/components/store/songoskriti-preview-page.test.tsx:145-153`) — so a missing export fails **that one test** instead of taking the whole file down at collection time. The assertions:
  1. **The cart's money is derived from its lines.** `const totals = songoskritiPreviewCart().totals!;` then `expect(totals.subtotalMinor).toBe(totals.lines.reduce((sum, l) => sum + l.lineTotalMinor, 0));` and `expect(totals.totalMinor).toBe(totals.subtotalMinor + totals.shippingMinor);` — the two assertions that keep the preview's summary coherent (Review Focus 4).
  2. **Every cart line is a real Songoskriti demo product.** `expect(totals.lines.map((l) => l.productTitle)).toEqual([...])` — the three titles of step 2.4's module — and `expect(totals.lines.every((l) => l.unitPriceMinor > 0 && l.quantity > 0)).toBe(true)`.
  3. **The cart is not the studio's snapshot.** `expect(JSON.stringify(songoskritiPreviewCart())).not.toContain("Sample product")` and `.not.toContain("Second product")` — the exact strings of `DEMO_CART` (`src/components/builder/CartContext.tsx:95`, `:104`).
  4. **The cart is synthetic and inert — and type-complete.** `expect(cart.live).toBe(false)` and `expect(cart.pending).toBe(false)` and `expect(cart.error).toBeNull()` and `expect(cart.methods.length).toBeGreaterThan(0)`; **and the fixture's shape is asserted, because the context value and the totals are two different shapes**: `expect(cart.lines.length).toBeGreaterThan(0)` with every entry carrying **only** `{ variantId, quantity }` (`CartLine`, `src/lib/cart.ts:4`) — `expect(cart.lines.every((l) => typeof l.variantId === "string" && l.variantId.length > 0 && l.quantity > 0)).toBe(true)` — the context's `lines` field is what the `cart_lines` widget merges quantities from, and `expect(cart.lines.map((l) => l.variantId)).toEqual(cart.totals!.lines.map((l) => l.variantId))` ties it to the priced lines; `expect(cart.lines.reduce((n, l) => n + l.quantity, 0)).toBe(cart.count)`; and **the two free-shipping fields are asserted on `totals`, where they live** (`src/components/builder/CartContext.tsx:35`, `:37`) — `expect(cart.totals!.freeShippingThresholdMinor).toBe(300000)` and `expect(cart.totals!.freeShippingRemainingMinor).toBe(Math.max(0, 300000 - cart.totals!.subtotalMinor))` — **not** on the context value, which has no such fields (`src/components/builder/CartContext.tsx:50-68`).
  5. **The account profile looks like a Songoskriti shopper and is visibly demo.** `expect(profile.title).toContain("demo shopper")` — the fixture's title is `"Rumana Haque (demo shopper)"` (step 4.3), so the visible demo indicator is the **lower-case** `demo shopper` in that string; the assertion must match the fixture exactly, not a capitalised variant of it — `expect(profile.subtitle).toMatch(/@example\.[a-z]+$/)` — an RFC 2606 reserved domain, so the address can never be mistaken for a real customer's — and `expect(profile.body).toMatch(/^01\d{9}$/)` — a Bangladeshi mobile shape.
  6. **The order history looks like an order history.** `expect(orders.length).toBeGreaterThanOrEqual(3)`; every row has a `title` matching `/^ORD-\d{4}$/`, a `subtitle` in `["placed", "packed", "shipped", "delivered"]`, a `priceMinor > 0`, a `currency === "BDT"` and an ISO `date`; and **every order's total equals the price of the catalogue product it names** — the assertion `expect(orders.every((o) => typeof o.priceMinor === "number" && o.priceMinor > 0)).toBe(true)` plus `expect(orders.map((o) => o.priceMinor)).toEqual([1850000, 285000, 185000])` — the three catalogue prices of step 4.3's products, in a plausible order-history sequence (a large saree order, then a kurta, then a piece of jewellery).
  7. **The facet rows are shaped for the platform's facet reader.** `const grouped = groupFacetRows(songoskritiPreviewFacets());` then `expect(grouped.category.length).toBeGreaterThan(0)`, `expect(grouped.kind.length).toBeGreaterThan(0)`, `expect(grouped.stock).toBeGreaterThan(0)` and `expect(grouped.total).toBeGreaterThan(0)` — the exact shape `groupFacetRows` reads (`src/components/builder/collection.tsx:94-108`); and `expect(grouped.category.every((r) => r.title.length > 0)).toBe(true)`.

- [ ] **4.2** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/cart-account-demo.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  2 failed | 5 passed (7)`. The two account tests fail with `SyntaxError: [vite] The requested module does not provide an export named 'songoskritiPreviewOrders'` / `… 'songoskritiPreviewProfile'` (the exports Task 4 adds). The other five pass already: Task 2's module already carries the derived cart money, the three Songoskriti lines, the studio-snapshot guard, the inert-cart guard and the shaped facet rows. Read the report: the two failures must be the **missing account exports**, not a typo in the test.

- [ ] **4.3** Implement the three exports in `src/lib/themes/songoskriti/preview-demo-data.ts`:
  - `songoskritiPreviewProfile()` → `{ id: "songoskriti-demo-profile", title: "Rumana Haque (demo shopper)", subtitle: "rumana@example.com", body: "01700000000" }` — the title carries the **visible demo indicator**, the email uses the reserved `.example` domain.
  - `songoskritiPreviewOrders()` → three rows built with the **same mapping the live account route uses** (`mapOrdersToRows`, `src/components/store/account-slots.tsx:31`, so the row contract cannot drift): `ORD-2451` / `delivered` / 1,850,000 / `2026-09-12T09:30:00.000Z`; `ORD-2468` / `shipped` / 285,000 / `2026-09-29T13:05:00.000Z`; `ORD-2477` / `packed` / 185,000 / `2026-10-06T08:15:00.000Z`.
  - extend `songoskritiPreviewCart()` so its `totals.lines` cite the same three products as the orders ("Dhakai Jamdani Heritage Saree" 1,850,000 ×1; "Comilla Handspun Khadi Kurta" 285,000 ×1; "Dhamrai Brass Heritage Necklace" 185,000 ×1) and so `subtotalMinor` is the derived sum (2,320,000), `shippingMinor` 6,000, `totalMinor` 2,326,000 — derived in code, never typed twice.
  - extend `songoskritiPreviewFacets()` so the category rows carry the Songoskriti demo categories ("women", "men", "kids", "living", "jewellery") with the catalogue's own names and plausible counts, and the `stock`/`total` rows carry counts consistent with the demo catalogue's product count.
  - **the preview's demo result total** — `export const SONGOSKRITI_PREVIEW_SEARCH_TOTAL = 38;`, with the header comment: *"the preview's **demo** result count. The Songoskriti demo catalogue holds **13** products (`src/lib/demo-catalog.ts`, the `SONGOSKRITI` catalogue's `products` array), and the platform pages at `PAGE_SIZE = 24` (`src/lib/storefront-search.ts:29`), so a fixture-derived total of 13 would render **no pager** — the `Pagination` widget returns `null` when `pageCount(total) <= 1` (`src/components/builder/collection.tsx:537-541`). The preview therefore carries an explicit, representative demo total of **38** — two pages — so the preview shows the pager the storefront shows. This number is **preview-only**: the storefront's count is the live `result.total` (Task 9), and no merchant query ever sees 38."* Its **effect** is pinned by Task 7's preview search case, which asserts that the pager actually renders (`page=2`) and therefore fails if this total ever falls to one page.

- [ ] **4.4** Run the test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/cart-account-demo.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  7 passed (7)`.

- [ ] **4.5** Run the neighbouring suites and confirm they are green:
  ```
  node_modules/.bin/vitest run src/lib/preview-demo-data.test.ts src/lib/themes/songoskriti/cart-account-demo.test.ts src/lib/themes/songoskriti/search-template.test.ts src/components/store/account-slots.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  ```
  Expected output: `Test Files  6 passed (6)` / `Tests  89 passed (89)` — `preview-demo-data.test.ts` 3, the new cart/account suite 7, the search suite 10, `account-slots.test.ts` 5, freeze 21, preview-nav 43. **No** change to the live cart/account routes is made by this task — assert that with `git diff --stat -- src/routes src/components/store` before committing: the output must be empty.

- [ ] **4.6** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview-demo-data.ts src/lib/themes/songoskriti/cart-account-demo.test.ts
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview-demo-data.ts src/lib/themes/songoskriti/cart-account-demo.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, and no typecheck output — all exit 0.

- [ ] **4.7** Stage exactly the two paths and commit:
  ```
  git add src/lib/themes/songoskriti/preview-demo-data.ts src/lib/themes/songoskriti/cart-account-demo.test.ts
  git commit -m "feat(songoskriti): representative, labelled demo data for cart, account and facets"
  ```
  Expected output: a commit touching exactly two files.

---

### Task 5 — A Songoskriti editorial blog body and an explicitly labelled sample content page

**Files:**
- Create: `src/lib/themes/songoskriti/blog-page-composition.test.ts` — **allowed** (NEW test file)
- Create: `src/lib/themes/songoskriti/preview-page.ts` — **allowed** (NEW theme-owned fixture module)
- Modify: `src/lib/themes/songoskriti/preview.ts` (the `case "blog":` branch, `:218-234`) — **allowed**
- Read-only references: `src/components/builder/blog.tsx`, `src/components/store/BlogArchiveTheme.tsx`, `src/lib/preview-page-data.ts`, `src/components/store/PageView.tsx`

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `lintTemplate(ast, template?)` (`src/lib/builder-ast.ts:8380`), `catalogEntry(type)` (`:7048`), `BlogFeed` / `BlogCardData` (`src/components/builder/blog.tsx:23`, `src/components/store/BlogList`), `PreviewPagePayload` (`src/lib/preview-page-data.ts:27`), `StorePage` (`src/lib/storefront-search.server.ts:257`).
- Produces: `songoskritiPreviewSource().main("blog", s)` returns exactly `["blog_terms", "blog_archive", "blog_pager"]`; NEW `src/lib/themes/songoskriti/preview-page.ts` exporting `SONOSKRITI_PREVIEW_PAGE: PreviewPagePayload` — a richer, explicitly labelled sample page that keeps the production payload shape.

- [ ] **5.1** Write the failing test to `src/lib/themes/songoskriti/blog-page-composition.test.ts`. It imports `describe/expect/it` from `vitest`, `songoskritiPreviewSource` from `./preview`, `lintTemplate`, `catalogEntry`, `type SectionBuilder` from `../../builder-ast`, and `PREVIEW_DEMO_PAGE` from `../../preview-page-data`, and asserts, in six `it` blocks. **The sample-page fixture is imported *dynamically inside* its test** (`const { SONOSKRITI_PREVIEW_PAGE } = await import("./preview-page");`) — the same shape the Phase-1 preview suite uses (`src/components/store/songoskriti-preview-page.test.tsx:145-153`) — so the not-yet-created module fails **that one test** instead of taking the whole file down at collection time. The assertions:
  1. `expect(types("blog")).toEqual(["blog_terms", "blog_archive", "blog_pager"])` — the **exact ordered composition**: the platform's blog pack, in the platform's order (terms → archive → pager), with no authored story body.
  2. the body contains **no** `rich_text` and **no** `image` section — the "Meet the makers" demo story is gone; the editorial voice moves to the theme's *blog pack* rendering and to the demo feed's own excerpts, not to a static story block.
  3. every section type is allowed on the `blog` template (`catalogEntry(type)!.templates` absent or including `"blog"`) — the pack's allowlist is `["blog", "page"]` (`src/lib/builder-ast.ts:4838`, `:4890`, `:4913`).
  4. `expect(lintTemplate(ast, "blog").filter((issue) => issue.level === "error")).toEqual([])` — **zero lint errors**, key passed. (`blog` is a route-h1 template, `src/lib/builder-ast.ts:68-75`, so no heading claimant is required and none is authored.) The **warn** level is the platform's translation-coverage finding and is not this plan's bar (the same bar the shipped `index` body is held to — 22 such warnings); the new blog body measures **one** warning — `blog_archive`'s bilingual `heading` — and **zero** errors.
  5. the serialised props contain none of `"Meet the makers"`, `"Demo story"`, `"Demo"` — the retired demo copy is gone and no demo marker is authored into the body (Review Focus 3).
  6. **the sample page**: `expect(Object.keys(SONGOSKRITI_PREVIEW_PAGE).sort()).toEqual(["excerpt", "html", "title", "updated_at"])` — the sample page keeps the **production payload shape** (`src/lib/preview-page-data.ts:27-33`), so it cannot drift from the route's record; **and** `expect(SONGOSKRITI_PREVIEW_PAGE.title).toContain("Sample")` and `expect(SONGOSKRITI_PREVIEW_PAGE.excerpt.toLowerCase()).toContain("sample")` — the sample page is **explicitly labelled**; and `expect(SONGOSKRITI_PREVIEW_PAGE.html.length).toBeGreaterThan(PREVIEW_DEMO_PAGE.html.length)` — the theme's sample is a *designed* sample, not the one-line placeholder.

- [ ] **5.2** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/blog-page-composition.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  3 failed | 2 passed (6)`. The composition assertion fails with `expected [ 'heading', 'image', 'rich_text' ] to deeply equal [ 'blog_terms', 'blog_archive', 'blog_pager' ]`; the no-copy assertion fails with `expected [ 'heading', 'image', 'rich_text' ] to deeply equal []`; the demo-string assertion fails on `"Meet the makers"`; and the sample-page test fails with `SyntaxError: [vite] The requested module does not provide an export named 'SONOSKRITI_PREVIEW_PAGE'` (or `Failed to resolve import "./preview-page"` — the module does not exist yet). The **two that pass today** are the catalogue-allowlist assertion and the lint assertion (today's body carries **zero lint errors**: it claims no `<h1>`, but `blog` is a route-`<h1>` template, so no "No primary heading on this template." finding is raised).

- [ ] **5.3** Create `src/lib/themes/songoskriti/preview-page.ts`. It must:
  - import `type PreviewPagePayload` from `../../preview-page-data` and re-export the type, so the theme's sample cannot drift from the production payload shape;
  - export `SONOSKRITI_PREVIEW_PAGE: PreviewPagePayload` with `title: "Sample page — Songoskriti sizing and care"`, an `excerpt` that says in plain words that this is **sample content shown by the theme preview**, an `html` body of at least three Songoskriti-flavoured paragraphs (sizing, fabric care, handloom provenance) wrapped in `<p>` tags, and `updated_at: "2026-10-20T00:00:00.000Z"`;
  - carry a header comment stating: **this is sample content for the theme preview; it is never a merchant's CMS record; the live Page route renders the merchant's record through `page_content` (`src/components/store/PageView.tsx:73-110`, `:166`, `:175`) and this plan does not change that.**

- [ ] **5.4** Replace the theme's `case "blog":` body in `src/lib/themes/songoskriti/preview.ts` (`:218-234`) with the blog pack:
  ```ts
        case "blog":
          // The platform's blog pack renders the listing: the terms rail, the
          // archive grid and the pager (`src/components/builder/blog.tsx:392-394`).
          // The theme owns the composition — which pack sections, in which
          // order — and the platform owns the feed
          // (`BlogFeedProvider`). No authored story body: the demo story the
          // preview used to show ("Meet the makers") is retired.
          return [
            s("blog_terms", {
              heading: "Browse the journal",
              style: "pills",
              showCounts: true,
            }),
            s("blog_archive", {
              heading: "From the journal",
              layout: "magazine",
              columns: 3,
              limit: 9,
              showCover: true,
              showExcerpt: true,
              showMeta: true,
            }),
            s("blog_pager", { align: "center" }),
          ];
  ```
  Use **only** props that exist in the catalogue entries for these three widgets (`src/lib/builder-ast.ts:4834-4925`): `blog_archive` takes `heading`/`layout`/`columns`/`limit`/`showCover`/`showExcerpt`/`showMeta`/`emptyText`/`handles`; `blog_terms` takes `heading`/`style`/`showCounts`; `blog_pager` takes **`align` only** — it has no `heading` field, so a `heading` prop there would be silently ignored and the composition would look authored while changing nothing. If a prop you are about to write is not in the catalogue entry, **do not write it**. Verify with `node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts` and adjust with `--write` on that one path if prettier reports a diff.

- [ ] **5.5** Run the test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/blog-page-composition.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  6 passed (6)`.

- [ ] **5.6** Run the neighbouring suites and confirm the green ones stay green:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/lib/themes/songoskriti/search-template.test.ts src/lib/themes/songoskriti/cart-account-demo.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/components/store/BlogArchiveTheme.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/components/store/PageView.twin-wiring.test.tsx
  ```
  Expected output: **two** failures, both stale pins — `songoskriti-port-freeze.test.tsx` on `blog template main zone is frozen` with `expected [ 'blog_terms', 'blog_archive', 'blog_pager' ] to deeply equal [ 'heading', 'image', 'rich_text' ]`, and `theme-preview-nav.test.ts` on `blog first section` with `expected 'blog_terms' to be 'heading'`; and `Test Files  9 passed | 2 failed (11)` / `Tests  2 failed | 139 passed (141)`. Every other file green — including `BlogArchiveTheme.test.tsx` (2 tests — the themeless-by-design pin is **untouched** by this plan) and `songoskriti-preview-page.test.tsx` (7 tests — the Phase-1 page preview). Both pins move in Task 6.

- [ ] **5.7** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/preview-page.ts src/lib/themes/songoskriti/blog-page-composition.test.ts
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/preview-page.ts src/lib/themes/songoskriti/blog-page-composition.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, no typecheck output — all exit 0.

- [ ] **5.8** Stage exactly the three paths and commit:
  ```
  git add src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/preview-page.ts src/lib/themes/songoskriti/blog-page-composition.test.ts
  git commit -m "feat(songoskriti): an editorial blog body and a labelled sample page"
  ```
  Expected output: a commit touching exactly three files.

---

### Task 6 — The cart and checkout compositions: platform-owned commerce widgets only, one `<h1>` each, and the last three pins

**Files:**
- Create: `src/lib/themes/songoskriti/checkout-composition.test.ts` — **allowed** (NEW test file)
- Modify: `src/lib/themes/songoskriti/preview.ts` (the `case "cart":` branch, `:253-281`; the `case "checkout":` branch, `:283-317`; the `case "product":` body's demo line, `:192`, `:194`) — **allowed**
- Modify: `src/components/builder/songoskriti-port-freeze.test.tsx` (the `TEMPLATE_MAIN.blog`, `TEMPLATE_MAIN.cart` and `TEMPLATE_MAIN.checkout` literals, `:107`, `:108`, `:109`) — **escalation** (existing test file)
- Modify: `src/lib/theme-preview-nav.test.ts` (the `FIRST_SECTION.blog` entry, `:126`) — **escalation** (existing test file)
- Read-only references: `src/routes/store.$slug.checkout.tsx` (**must not be edited**), `src/components/builder/cart.tsx`, `src/components/store/CheckoutMock.tsx`

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `lintTemplate(ast, template?)` (`src/lib/builder-ast.ts:8380`), `catalogEntry(type)` (`:7048`), `checkout_steps` / `payment_methods` / `cart_summary` / `payment_icons` / `cart_lines` catalogue entries (`src/lib/builder-ast.ts:2897`, `:2921`, `:1603`, `:2082`, `:2848`), `CheckoutSteps` / `PaymentMethods` / `CartSummary` / `CartLines` renderers (`src/components/builder/cart.tsx:506`, `:563`, `:441`, `:203`), `blankHeading`'s rule (`src/lib/builder-ast.ts:8301-8313`).
- Produces: `songoskritiPreviewSource().main("checkout", s)` returns exactly `["heading", "checkout_steps", "columns"]`, where the `columns` node's two children hold `payment_methods` + `payment_icons` (left) and `cart_summary` (right); `songoskritiPreviewSource().main("cart", s)` returns exactly `["heading", "columns"]`, where the `columns` node's two children hold `cart_lines` (left) and `cart_summary` (right); **both** commerce bodies carry exactly **one** `<h1>` claimant; the three pins move to the new blog, cart and checkout compositions.

- [ ] **6.1** Write the failing test to `src/lib/themes/songoskriti/checkout-composition.test.ts`. It imports `describe/expect/it` from `vitest`, `songoskritiPreviewSource` from `./preview`, `lintTemplate`, `catalogEntry`, `flattenSections`, `primarySectionId`, `type SectionBuilder` from `../../builder-ast`, and asserts, in seven `it` blocks:
  1. `expect(types("checkout")).toEqual(["heading", "checkout_steps", "columns"])` — the **exact ordered composition**.
  2. the flattened section types are exactly `["heading", "checkout_steps", "columns", "container", "payment_methods", "payment_icons", "container", "cart_summary"]` — no authored form, no authored money, no authored "place order" action. (The two `container` entries are the `columns` children — `flattenSections` walks the tree.)
  3. **every** section type is a platform-owned commerce widget or a layout primitive — the assertion is that the set of types is a subset of `["heading", "columns", "container", "checkout_steps", "payment_methods", "payment_icons", "cart_summary", "cart_lines"]` — so the checkout body can never carry a bespoke field or a bespoke price (Review Focus 4).
  4. `expect(lintTemplate(ast, "checkout").filter((issue) => issue.level === "error")).toEqual([])` — **zero lint errors**, key passed. (`checkout` is **not** a route-h1 template (`src/lib/builder-ast.ts:68-75`), so the body must carry exactly one `<h1>` claimant — the `cart_summary` panel is it, because the payment block's heading is deliberately blank; see step 6.3.) The **warn** level is the platform's translation-coverage finding and is not this plan's bar; the new checkout body measures **three** warnings (`checkout_steps`' accessible label, `payment_icons`' heading and `cart_summary`' heading) and **zero** errors.
  5. `expect(primarySectionId(ast)).toBe("heading-0")` — the checkout body claims exactly one primary heading, and it is the `heading` section.
  6. the serialised props contain **no** money-like literal — the assertion scans every prop value for `/[৳$]\s?\d|\d{4,}/` and expects `[]` — no price, no total, no amount is authored in the checkout body; the money comes from the platform's quote.
  7. **the production checkout route is untouched** — the assertion reads the file from disk (`readFileSync("src/routes/store.$slug.checkout.tsx", "utf8")` relative to the repo root) and expects it to still contain `ast={null}` and the comment *"the theme contributes the tokens only"* — i.e. this task changed the **theme**, never the **route**.

  **The cart body is pinned by the freeze pin and by the gate, not by this file.** Task 6 authors it (step 6.3), the freeze pin moves to it (step 6.5) and the gate asserts its single-`<h1>` structure (Task 8's `R7`); this file stays at **seven** `it` blocks, and the neighbourhood counts that quote it (steps 6.6, 7.6, 8.6, 10.4 and 11.2) are computed on **seven**.

- [ ] **6.2** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/checkout-composition.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  3 failed | 4 passed (7)`. The composition assertion fails with `expected [ 'heading', 'columns' ] to deeply equal [ 'heading', 'checkout_steps', 'columns' ]`; the flattened-types assertion fails with `expected [ 'heading', 'columns', 'container', 'rich_text', 'payment_icons', 'container', 'cart_summary' ] to deeply equal [ 'heading', 'checkout_steps', 'columns', 'container', 'payment_methods', 'payment_icons', 'container', 'cart_summary' ]`; the platform-only assertion fails on `'rich_text'`. The **four that pass today** are the lint assertion (today's body carries **zero lint errors**: one `<h1>` claimant — `cart_summary` — and the `checkout` template carries no `required` rule), the primary-section assertion (`heading-0` is already the claimant), the money-scan assertion (the current body carries no money either) and the "production route untouched" assertion.

- [ ] **6.3** Replace the theme's `case "checkout":` body in `src/lib/themes/songoskriti/preview.ts` (`:283-317`) with the platform-owned composition, then replace its `case "cart":` body (`:253-281`) and relabel the `case "product":` body's one demo line (`:192`, `:194`):
  ```ts
        case "checkout":
          // The platform owns checkout: it quotes the cart, offers the rails
          // the store can take money through and places the order
          // (`store.$slug.checkout.tsx:42-105`, `:428+`). The theme owns the
          // composition only — the progress trail, the payment block and the
          // order summary, all of them platform-owned widgets reading the
          // server's quote (`src/components/builder/cart.tsx:506`, `:563`,
          // `:441`). No authored field, no authored price, no authored
          // "place order" action: in production the route renders its own
          // form (`ast={null}`, `store.$slug.checkout.tsx:418-421`).
          return [
            s("heading", { text: "Checkout", text_bn: "চেকআউট" }),
            s("checkout_steps", { heading: "Checkout progress", activeStep: 2 }),
            {
              ...s("columns", { columns: 2, asymmetrical: true, gap: 64 }),
              children: [
                {
                  ...s("container", {}),
                  children: [
                    // Blank heading: the payment block must not claim the
                    // page <h1> (the order summary is the one claimant) —
                    // the widget falls back to its built-in "Payment
                    // method" legend, so nothing disappears.
                    s("payment_methods", { heading: "" }),
                    s("payment_icons", {
                      heading: "We accept",
                      marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
                    }),
                  ],
                },
                {
                  ...s("container", {}),
                  children: [s("cart_summary", { heading: "Order summary" })],
                },
              ],
            },
          ];
  ```
  Use only props that exist in the catalogue entries for these four widgets (read `src/lib/builder-ast.ts:1603`, `:2082`, `:2897`, `:2921` first). Verify with `node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts` and adjust with `--write` on that one path if prettier reports a diff.

  **The one changed prop — `payment_methods`' `heading`.** `payment_methods` is a heading-capable widget (`heading: true`, `src/lib/builder-ast.ts:2925`) and so is `cart_summary` (`:1607`): two claimants in one body is a lint **error** ("More than one widget claims the page `<h1>`", `src/lib/builder-ast.ts:8516-8523`), and the platform's own documented remedy is a **deliberately blank heading** — "a claimant whose heading text is deliberately blank renders no title, so it cannot be the page `<h1>` … This is how a commerce template carries several heading-capable widgets (lines, summary, payment) while still declaring exactly one primary heading" (`src/lib/builder-ast.ts:8506-8513`, `blankHeading` at `:8301-8313`). The snippet therefore passes **`heading: ""`** on `payment_methods` and lets **`cart_summary`** be the checkout's single claimant. **Nothing visible is lost:** the payment block falls back to its built-in legend — `{str("heading") || t(locale, "Payment method", "পেমেন্ট পদ্ধতি")}` (`src/components/builder/cart.tsx:580`) — so the shopper still reads "Payment method", while the platform's own heading accounting sees exactly one claimant.

  **Why `cart_summary` carries its title explicitly.** The catalogue's default for that widget is `"Order summary"` (`src/lib/builder-ast.ts:1609-1610`), but **catalogue defaults are not merged into a theme's authored sections** — `resolveProps` only merges the breakpoint overrides (`src/lib/builder-ast.ts:7914-7932`), so an omitted prop renders as an empty string and the panel would lose its title. The body therefore passes `heading: "Order summary"` itself (a **catalogue** field, so the merchant sees and edits it) and the panel keeps its label in the preview.

  **And the cart body — the same defect, fixed rather than excepted.** The shipped cart body (`src/lib/themes/songoskriti/preview.ts:253-281`) carries **two** `<h1>` claimants: `cart_lines` (`heading: true`, `src/lib/builder-ast.ts:2851`) and `cart_summary` (`:1607`) — measured as one lint **error** on the shipped body (`cart_summary-5: More than one widget claims the page <h1>`). This is a real defect, not an exception: replace the `case "cart":` branch with the commerce composition below — **the demo "You may also like" rail is dropped** (a merchandising rail is not part of a cart, and it is the shape the legacy body is rejected for) and the two commerce widgets are the only children:
  ```ts
        case "cart":
          // The platform owns the cart: it holds the lines, merges the
          // quantities and quotes the totals (`src/components/builder/cart.tsx:203`,
          // `:440`). The theme owns the composition only — the page heading
          // and the two-column layout (the items on the left, the money on
          // the right). No demo rail: the cart is a commerce surface, and a
          // "you may also like" rail is the generic demo shape the
          // distinctness gate rejects (Task 8's `R1`/`R5`).
          return [
            s("heading", { text: "Your bag", text_bn: "আপনার ব্যাগ" }),
            {
              ...s("columns", {
                columns: 2,
                asymmetrical: true,
                gap: 64,
              }),
              children: [
                {
                  ...s("container", {}),
                  // `cart_lines` is a heading-capable widget (`heading: true`,
                  // `builder-ast.ts:2851`) and so is `cart_summary` (`:1607`):
                  // two claimants in one body is a lint error
                  // (`builder-ast.ts:8516-8523`). The lines block therefore
                  // carries a deliberately blank heading — the platform's
                  // documented remedy (`builder-ast.ts:8506-8513`) — so the
                  // order summary is the body's single claimant.
                  children: [s("cart_lines", { heading: "" })],
                },
                {
                  ...s("container", {}),
                  children: [s("cart_summary", { heading: "Order summary" })],
                },
              ],
            },
          ];
  ```
  **What the blank heading costs and why:** `CartLines` renders its title only when the prop is non-empty (`{heading && (<Heading …>)}`, `src/components/builder/cart.tsx:207-209`), so the items list carries no title of its own — the page's `<h1>` ("Your bag") introduces it, and the money panel keeps its **"Order summary"** title (passed explicitly, as the checkout body does; `src/components/builder/cart.tsx:444-455`). The blank is **not** a lost string: it is the platform's own "this widget must not claim the page heading" signal, and it survives a merchant's save (`coerceProp` keeps an empty string as a value, `src/lib/builder-ast.ts:7733-7738`).

  **And the product body's demo line — labelled, not excepted.** The shipped product body says `"Demo product page. Prices and stock are sample data — ordering is disabled in preview."` (`src/lib/themes/songoskriti/preview.ts:192`, Bengali at `:194`). The bare "Demo" marker is the shape Review Focus 3 forbids, and the product template is the one body this plan does **not** re-compose — so it needs an **explicitly labelled** line instead, and the gate needs **no exception** for it (Task 8's `R4` applies to the `page` template only). Rewrite the two lines to:
  ```ts
              body: "Sample product page — prices and stock are sample data, and ordering is disabled in the preview.",
              body_bn:
                "নমুনা পণ্যের পাতা — দাম ও স্টক নমুনা তথ্য, আর প্রিভিউতে অর্ডার বন্ধ আছে।",
  ```
  The copy still says, in words, that the prices and the stock are sample data — the expert's bar is *"demo data is realistic and explicitly labelled"* — and it no longer carries a bare marker. Nothing else in the `case "product":` branch changes: the composition, the slots and the rail stay exactly as they are (`src/lib/themes/songoskriti/preview.ts:149-205`). The two other themes that ship the same line (`src/lib/themes/somvabona/preview.ts:85`, `examples/starter-theme/preview.ts:56`) are **out of scope** (Decision **D3**: Songoskriti only).

- [ ] **6.4** Run the test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/checkout-composition.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  7 passed (7)`.

- [ ] **6.5** Move the last three pins — `src/components/builder/songoskriti-port-freeze.test.tsx:107`, `:108` and `:109`:
  ```
  -  blog: ["heading", "image", "rich_text"],
  +  blog: ["blog_terms", "blog_archive", "blog_pager"],
  …
  -  cart: ["heading", "columns", "product_rail"],
  +  cart: ["heading", "columns"],
  …
  -  checkout: ["heading", "columns"],
  +  checkout: ["heading", "checkout_steps", "columns"],
  ```
  and `src/lib/theme-preview-nav.test.ts` — the `FIRST_SECTION` map's **`blog`** key (`blog: "heading"`, `:126`) becomes `blog: "blog_terms"`. The map's `cart` and `checkout` entries stay `"heading"` (`:127`, `:128`) — both new bodies still open with the `heading` widget. All three are the **exact** diffs recorded in Task 1's §(b); if the recorded diff and this step disagree, the recorded diff wins and Task 1's §(b) is **appended** with the correction (the record is append-only).

- [ ] **6.6** Run the two pin suites and the neighbourhood:
  ```
  node_modules/.bin/vitest run src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/wiring.test.ts src/lib/themes/songoskriti/skins.test.ts src/lib/themes/songoskriti/widgets.test.ts src/lib/themes/songoskriti/search-template.test.ts src/lib/themes/songoskriti/cart-account-demo.test.ts src/lib/themes/songoskriti/blog-page-composition.test.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/components/builder/songoskriti.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/components/store/BlogArchiveTheme.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/lib/definition-of-done.test.ts
  ```
  Expected output: `Test Files  15 passed (15)` / `Tests  267 passed (267)` — freeze 21, preview-nav 43, `preview.test.ts` 3, `wiring.test.ts` 7, `skins.test.ts` 20, `widgets.test.ts` 18, the search suite 10, the cart/account suite 7, the blog/page suite 6, the checkout suite 7, `songoskriti.test.tsx` 52, `ThemePreviewFrame.test.tsx` 53, `BlogArchiveTheme.test.tsx` 2, `songoskriti-preview-page.test.tsx` 7, `definition-of-done.test.ts` 11 — **fifteen** files, **267** tests, and **zero** failures, including `preview.test.ts` (whose `types("account")` assertion, `["heading", "profile_card", "orders_list"]`, is unchanged by this plan: **the account composition does not change**, only its preview data does) and `BlogArchiveTheme.test.tsx` (untouched). The freeze suite is the one that proves the new cart composition: its `cart` entry is now `["heading","columns"]`.

- [ ] **6.7** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, no typecheck output — all exit 0.

- [ ] **6.8** Stage exactly the four paths and commit:
  ```
  git add src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts
  git commit -m "feat(songoskriti): platform-owned cart and checkout compositions and the last pins"
  ```
  Expected output: a commit touching exactly four files. `git diff --stat a48253c8..HEAD -- src/routes` must still be empty — **no route was touched by Tasks 2–6**. The base commit `a48253c8` is the one recorded in Task 1's escalation record (step 1.1); it is the plan's own starting point, and it is used here and in Task 11 rather than the older `74b7f2b0`, which predates Phase 1 and would report Phase-1 changes in `src/components/store/PageView.tsx`, `ThemeChrome.tsx` and `ThemePreviewFrame.tsx` as if this plan had made them.

---

### Task 7 — The preview host renders every authored composition with representative, labelled data

**Files:**
- Create: `src/components/store/songoskriti-preview-compositions.test.tsx` — **allowed** (NEW test file)
- Modify: `src/components/store/ThemePreviewFrame.tsx` — **escalation** (`src/components/store/**` is prohibited by §7; the owner-approved scope is Task 1's §(b) "the preview host")
- Reference (unchanged): `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` §(b)

**Interfaces:**
- Consumes: `ThemePreviewFrame` (`src/components/store/ThemePreviewFrame.tsx:420`), `CartProvider` / `CartContextValue` (`src/components/builder/CartContext.tsx:128`, `:50`), `BlogFeedProvider` / `BlogFeed` (`src/components/builder/blog.tsx:32`, `:22`), `CollectionQueryProvider` / `SearchParams` (`src/components/builder/collection.tsx:55`, `src/lib/storefront-search.ts:34`), `OrdersList` / `ProfileCard` (`src/components/builder/account.tsx:70`, `:141`), `accountSlotCtx` (`src/components/store/account-slots.tsx:54`), `songoskritiPreviewCart` / `songoskritiPreviewOrders` / `songoskritiPreviewProfile` / `songoskritiPreviewFacets` / `SONGOSKRITI_PREVIEW_SEARCH_TOTAL` (`src/lib/themes/songoskriti/preview-demo-data.ts`), `SONOSKRITI_PREVIEW_PAGE` (`src/lib/themes/songoskriti/preview-page.ts`).
- Produces: the preview renders, per template — `cart`: the Songoskriti cart lines and a coherent summary; `account`: a Songoskriti profile and order history with a visible demo marker; `search`: the authored composition with the demo facet rows, the demo result total **38** and a working pager; `blog`: the authored pack over a Songoskriti demo feed; `page`: the labelled sample page; `checkout`: the **authored** template (not `CheckoutMock`).

- [ ] **7.1** Confirm the escalation section names the preview host and that its scope covers exactly the changes below:
  ```
  git log --oneline -1 -- docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md
  grep -n 'ThemePreviewFrame.tsx' -A 12 docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md | head -40
  ```
  Expected output: the Task-1 commit on the log, and a §(b) hunk for `src/components/store/ThemePreviewFrame.tsx` naming the import, the `CartProvider` wrapper, the `BlogFeedProvider` wrapper, the permission-slot map, the `CollectionQueryProvider` and the checkout branch.

- [ ] **7.2** Write the failing preview test to `src/components/store/songoskriti-preview-compositions.test.tsx`. It follows the shape of the Phase-1 preview suite (`src/components/store/songoskriti-preview-page.test.tsx:16-63`): it mocks `@tanstack/react-router` (`useNavigate`, `useRouterState`, `Link`) and `@/components/store/StoreHeader` exactly as that file does, then imports `ThemePreviewFrame` and `songoskritiPreviewSource` and renders the frame with the theme's **real** template bodies (the same plain builder the engine uses). Six cases:
  - **cart** — `initialTemplate="cart"`: the markup contains `"Dhakai Jamdani Heritage Saree"` and `"Comilla Handspun Khadi Kurta"`, does **not** contain `"Sample product"` or `"Second product"`, and contains a total consistent with the demo cart (the assertion `expect(html).toContain("23,260")` — the formatted `2,326,000` minor units in BDT — computed from `songoskritiPreviewCart().totals.totalMinor`, not hard-coded twice: derive the expected string in the test from the fixture).
  - **account** — `initialTemplate="account"`: the markup contains `"Rumana Haque (demo shopper)"` (the **visible demo indicator**), `"rumana@example.com"`, `"ORD-2451"`, `"delivered"` and `"ORD-2477"`; and it does **not** contain `"Demo Shopper"` or `"ORD-1001"` (the shared demo rows).
  - **search** — `initialTemplate="search"`: the markup contains the theme's search heading text `"Search the collection"`; the demo facet labels (`"Jewellery"`, `"physical"`); the demo product titles from the demo catalogue; the **demo result count** the theme's toolbar reads from the demo query (Task 2.6 — the count the `CollectionQueryProvider` carries, derived in the test from the fixture, not typed twice); and a **pager** — the assertion is `expect(html).toContain("page=2")`, the page-2 link the platform's `Pagination` widget builds from the demo query (`facetHref`, `src/lib/facet-url.ts:150`; `withPage`, `:136`). The pager renders **only** when the query's total exceeds one page (`pageCount(total) <= 1` → the widget returns `null`, `src/components/builder/collection.tsx:537-541`), so the preview's demo total is the explicit, labelled `SONGOSKRITI_PREVIEW_SEARCH_TOTAL` of step 7.4 item 4 — **not** the demo catalogue's own 13 products, which would fit on one page and render no pager. It does **not** contain `"Demo search"`.
  - **blog** — `initialTemplate="blog"`: the markup contains the demo feed's article titles (from the Songoskriti demo feed) and does **not** contain `"Sample article 1"` (the pack's fallback rows) nor `"Meet the makers"`.
  - **page** — `initialTemplate="page"`: the markup contains `"Sample page"` and the label text, contains exactly one `<h1` (the route owns it), and does **not** contain `"Size guide"` / `"How to measure"` / `"Demo article"`.
  - **checkout** — `initialTemplate="checkout"`: the markup contains the authored checkout heading `"Checkout"`, the payment rails (`"Cash on delivery"`), the order summary heading and the synthetic order line — and does **not** contain the `CheckoutMock` string `"Muslin Floral Festive Saree"` and not `"৳ 4,500"` (the mock's hard-coded money). This is the case that proves the preview now renders the **authored** template.

- [ ] **7.3** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-preview-compositions.test.tsx
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  6 failed (6)`. The **cart** case fails on `expect(html).toContain("Dhakai Jamdani Heritage Saree")` with `expected '<div class="fq-theme-scope min-h-scre…' to contain 'Dhakai Jamdani Heritage Saree'` — the preview still renders the studio's `DEMO_CART`; the **account** case fails on `"Rumana Haque (demo shopper)"`; the **search** case fails because the search body renders only the theme's heading (the per-widget widgets are ungranted context widgets → `null`); the **blog** case fails on the article titles; the **page** case fails on `"Sample page"` (the preview still shows the shared `PREVIEW_DEMO_PAGE`); the **checkout** case fails on `expect(html).not.toContain("Muslin Floral Festive Saree")` — the preview still renders `CheckoutMock`.

- [ ] **7.4** Implement the preview host changes in `src/components/store/ThemePreviewFrame.tsx`, exactly as scoped in Task 1's §(b):
  1. **Import the theme's demo data** — one new import of `songoskritiPreviewCart`, `songoskritiPreviewOrders`, `songoskritiPreviewProfile`, `songoskritiPreviewFacets`, `SONGOSKRITI_PREVIEW_SEARCH_TOTAL` from `@/lib/themes/songoskriti/preview-demo-data` and one of `SONOSKRITI_PREVIEW_PAGE` from `@/lib/themes/songoskriti/preview-page`. The theme's demo data is used **only** when `blueprintKey === "songoskriti"`; every other blueprint keeps today's behaviour byte-for-byte.
  2. **Cart** — keep the `cartSlots` object's **five keys and their `null` values exactly as they are** (`cart_lines`, `cart_summary`, `cart_drawer`, `checkout_steps`, `payment_methods`): `null` is the platform's "granted" token, and the widgets read the cart **context** themselves — exactly what the live cart route does (*"The widgets render live cart data on their own; the keys simply tell the renderer this page owns the cart context"*, `src/routes/store.$slug.cart.tsx:98-108`). The **data** is what changes: mount `<CartProvider value={songoskritiPreviewCart()}>` around the preview canvas (the `CartProvider` export already exists — `src/components/builder/CartContext.tsx:128`), so the widgets read the synthetic lines and totals instead of the studio's `DEMO_CART` fallback (`useCartContext`'s default — `createContext<CartContextValue>(DEMO_CART)`, `src/components/builder/CartContext.tsx:126-131`). **Do not** put the widgets into the slot values: `CartSummary` renders its slot instead of itself whenever the cart is not live and a slot is present (`if (!cart.live && slot) return <>{slot}</>;`, `src/components/builder/cart.tsx:442-443`), so a slot holding the very widget would recurse. The preview's other blueprints keep the current `null` slots and the studio fallback. **The five cart slots must also be granted for the `checkout` template** — the preview's `cartSlots` memo currently exists only for `template === "cart"` (`src/components/store/ThemePreviewFrame.tsx:568`), and the authored checkout body is full of context widgets (`cart_summary`, `payment_methods`, `checkout_steps` — each with a `templates:` allowlist naming `checkout`), so without the grant the preview's checkout tab would render them as `null` (item 7).
  3. **Account** — build the `orders_list` / `profile_card` slot nodes from `songoskritiPreviewOrders()` / `songoskritiPreviewProfile()` instead of the shared `previewDemoMap` rows, for the Songoskriti blueprint only. The row **mapping** stays `accountSlotCtx` (`src/components/store/account-slots.tsx:52`) — the live route's helper — so the preview and the storefront render the same widget with the same contract.
  4. **Search** — grant permission for the search widgets by adding them to the `contextSlots` map with the value `null` (the platform's "granted" token — the same shape the cart route uses at `src/routes/store.$slug.cart.tsx:102-108`). The granted set is **the five the storefront grants** — `result_toolbar`, `filter_chips`, `pagination`, `empty_state`, **`category_header`** — **plus `facet_sidebar`, which is preview-only**: the preview is the only host that mounts a `WidgetDataProvider` (`src/components/store/ThemePreviewFrame.tsx:683`), so it is the only host that can feed `facet_sidebar`'s category/kind rows (`source: "facets"`, `src/lib/widget-registry.ts:483-503`); the storefront cannot (Decision **D7**). **`category_header` must be in the list**: it is a context widget (`src/lib/builder-ast.ts:2691`), and an ungranted context widget renders `null` when `editing={false}` (`src/components/builder/SectionRenderer.tsx:814-833`) — without the grant the preview's search tab renders **no heading at all**, which is exactly what the search case in step 7.2 catches. Then mount `<CollectionQueryProvider value={{ params: normalizeSearchParams({ q: "jamdani" }), total: SONGOSKRITI_PREVIEW_SEARCH_TOTAL, basePath: "/store/songoskriti/search", navigate: undefined }}>` — the demo total is the explicit, labelled **38** from Task 4's demo module, **not** the demo catalogue's own 13 products: the platform pages at `PAGE_SIZE = 24` (`src/lib/storefront-search.ts:29`) and the pager renders only above one page (`pageCount(total) <= 1` → `null`, `src/components/builder/collection.tsx:537-541`), so a catalogue-derived total would render **no pager** in the preview. The import is `SONGOSKRITI_PREVIEW_SEARCH_TOTAL` from `@/lib/themes/songoskriti/preview-demo-data` (item 1's import list grows by that name). Merge the theme's facet rows into the preview's widget-data map so the facet sidebar has the right rows.
  5. **Blog** — mount `<BlogFeedProvider value={songoskritiPreviewFeed()}>` around the preview canvas for the Songoskriti blueprint, with a feed of five Songoskriti-flavoured articles (titles, excerpts, categories, `basePath` pointing at the preview's blog tab). The feed type is `BlogFeed` (`src/components/builder/blog.tsx:23`).
  6. **Page** — for the Songoskriti blueprint, render `SONOSKRITI_PREVIEW_PAGE` instead of `PREVIEW_DEMO_PAGE` in the existing `pageSlots` memo, keeping the same `<article>` shape, the same localisation of the "Last updated" label, and the same single `<h1>`.
  7. **Checkout** — replace the `template === "checkout" ? <CheckoutMock …/> : …` branch with a branch that renders the **authored** `ast.main` through `SectionRenderer` inside the `MinimalCheckoutHeader` chrome, with the synthetic cart context in scope so `payment_methods`, `cart_summary` and `checkout_steps` render the demo rails, the demo summary and the progress trail — **and with the five cart slots granted for this template too** (item 2's last sentence): those three widgets are context widgets, and an ungranted context widget renders `null` when `editing={false}` (`src/components/builder/SectionRenderer.tsx:814-833`), so the checkout tab would render an empty summary without the grant. The preview's existing submit/click interception stays in force, so the payment radios and any form submit remain inert (**test-only actions**) and the toast still reads "Disabled in preview". **The authored checkout widgets need the cart context, not widget data**: none of `cart_lines`, `cart_summary`, `cart_drawer`, `checkout_steps` or `payment_methods` declares a `data` block in the widget registry (`src/lib/widget-registry.ts:549-553` — `skeleton`/`seo` only) and `payment_icons` has **no** registry entry at all, so not one of them asks the widget-data pipeline for rows; they read the **cart context** (`src/components/builder/cart.tsx:75`, `:274`, `:315`, `:442`, `:465`, `:559`). The `CartProvider` wrapper from item 2 is therefore mounted around the **whole preview canvas — both branches, including the checkout one** — while the `WidgetDataProvider` (`src/components/store/ThemePreviewFrame.tsx:683`) stays exactly where it is, because the checkout branch does not need it.
  Nothing else in the file changes: the `?? templates.index` fallback (`:486`), the skin sheets, `useMockProductSlots`, `accountSlots`'s structure, the responsive stylesheet and the demo focus are untouched, and **no assertion in `src/components/store/ThemePreviewFrame.test.tsx` is skipped, weakened or deleted** — that file is not edited by this plan.

- [ ] **7.5** Run the new preview suite and confirm it passes:
  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-preview-compositions.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  6 passed (6)`.

- [ ] **7.6** Run the neighbourhood — including the preview frame's own existing suite, which must stay green and **unmodified**:
  ```
  node_modules/.bin/vitest run src/components/store/ThemePreviewFrame.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/BlogArchiveTheme.test.tsx src/components/store/ThemeChrome.route-content.test.tsx src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/search-template.test.ts src/lib/themes/songoskriti/cart-account-demo.test.ts src/lib/themes/songoskriti/blog-page-composition.test.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts
  ```
  Expected output: `Test Files  13 passed (13)` / `Tests  179 passed (179)` — `ThemePreviewFrame.test.tsx` 53, `songoskriti-preview-page.test.tsx` 7, the new preview suite 6, `BlogArchiveTheme.test.tsx` 2, `ThemeChrome.route-content.test.tsx` 3, `preview.test.ts` 3, the search suite 10, the cart/account suite 7, the blog/page suite 6, the checkout suite 7, freeze 21, preview-nav 43, `definition-of-done.test.ts` 11 — and **zero** failures. If `ThemePreviewFrame.test.tsx` fails, the change broke an existing behaviour — read the failure before touching anything; that file is **frozen** by §7 and is not edited by this plan.

- [ ] **7.7** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-compositions.test.tsx
  node_modules/.bin/eslint src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-compositions.test.tsx
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, no typecheck output — all exit 0.

- [ ] **7.8** Stage exactly the two paths and commit:
  ```
  git add src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-compositions.test.tsx
  git commit -m "feat(songoskriti): render the authored compositions in the theme preview"
  ```
  Expected output: a commit touching exactly two files.

---

### Task 8 — The Songoskriti template-distinctness gate

**Files:**
- Create: `src/lib/themes/songoskriti/template-distinctness.ts` — **allowed** (NEW theme-owned rule module)
- Create: `src/lib/themes/songoskriti/template-distinctness.test.ts` — **allowed** (NEW test file)
- Read-only references: `src/lib/builder-ast.ts` (`TEMPLATE_KEYS`, `catalogEntry`), `src/lib/theme-preview-nav.ts` (`genericDemoMain`), `src/lib/themes/songoskriti/preview.ts`

**Interfaces:**
- Consumes: `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`), `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`), `catalogEntry(type)` (`:7048`), `primarySectionId(ast)` (`:88`), `genericDemoMain(template, s)` (`src/lib/theme-preview-nav.ts:430`), `flattenSections` (`:7889`). **The gate does not import `lintTemplate`** — lint cleanliness is not the gate's subject (see step 8.1's note).
- Produces: `src/lib/themes/songoskriti/template-distinctness.ts` exporting `SONOSKRITI_TEMPLATE_EXPECTATIONS` (the per-template table), `SONOSKRITI_APPROVED_EXCEPTIONS` (the documented exceptions, each with a reason), `SONOSKRITI_LEGACY_COMPOSITIONS` (the fixtures the gate must reject), `SONOSKRITI_DISTINCTNESS_RULES` (the rule ids the gate enforces — seven, and none of them a lint rule), and `checkSongoskritiTemplateDistinctness(template, ast): DistinctnessIssue[]`.

- [ ] **8.1** Write the rule module `src/lib/themes/songoskriti/template-distinctness.ts`. It must contain, verbatim in substance:

  **The per-template table** — one entry per `TEMPLATE_KEYS` member, each with `requiredTypes` (the theme-owned composition the surface must have), `requiredSlots` (the functional data slots the surface must carry) and `forbiddenTypes` (the generic shapes the surface must not have):

  | template | `requiredTypes` | `requiredSlots` | `forbiddenTypes` |
  |---|---|---|---|
  | `index` | `hero_carousel`, `product_rail`, `collection_story` | — | — |
  | `product` | `heading`, `columns`, `rich_text` | `product_media`, `price_block`, `add_to_cart`, `product_meta` | — |
  | `collection` | `category_header`, `result_toolbar`, `product_grid` | — | — |
  | `account` | `heading`, `profile_card`, `orders_list` | `profile_card`, `orders_list` | — |
  | `page` | `breadcrumb`, `page_content` | `page_content` | `heading`, `rich_text` |
  | `blog` | `blog_terms`, `blog_archive`, `blog_pager` | `blog_archive`, `blog_terms`, `blog_pager` | `rich_text`, `image` |
  | `cart` | `heading`, `columns` | `cart_lines`, `cart_summary` | `product_rail` |
  | `checkout` | `heading`, `checkout_steps`, `columns` | `payment_methods`, `cart_summary`, `checkout_steps` | `rich_text` |
  | `search` | `category_header`, `result_toolbar`, `facet_sidebar`, `filter_chips`, `product_grid`, `pagination`, `empty_state` | `category_header`, `result_toolbar`, `facet_sidebar`, `filter_chips`, `pagination`, `empty_state` | `rich_text`, `heading` |

  The `search` row declares the six platform search widgets as **required slots** (they are the surface's functional data slots), and `product_grid` is deliberately **not** one of them: it is not a context widget — it takes the host's `productSlot` (`src/components/builder/widgets.tsx:87`, `:1447`, `:1491`) — so `R3` cannot require it. The `cart` row forbids `product_rail`: the cart is a commerce surface, and the demo "you may also like" rail is the generic shape the legacy cart body is rejected for (Task 6 drops it). Every other row's `requiredSlots` stays as tabled.

  **The rules the checker enforces**, each producing a `DistinctnessIssue` with a `rule` id. **The gate's subject is composition, slots and structure** — never lint cleanliness (see the note after the list):
  - `R1-not-generic` — the template's main types must not be a **generic demo body**. Two shapes qualify: **(a)** the engine's own generic body — `genericDemoMain(template, s).map(x => x.type)`, which is `["heading","rich_text"]` for **every** template (`src/lib/theme-preview-nav.ts:396-440`); and **(b)** a *heading-led* body — its **first** section is a `heading` widget — that carries **at least one** of the engine's generic demo sections (`rich_text`, `product_rail`) **and none of the template's own required functional slots** (`requiredSlots`; for the two templates with no required slots — `index` and `collection` — that third condition is vacuously true, so only the heading-led and demo-section conditions apply). *This is the rule the expert named: a generic heading-plus-demo-rail layout must never pass.* The "none of the required slots" clause is what makes the rule **honest about the legacy bodies**: the legacy `search` body `["heading","rich_text","product_rail"]` is heading-led, carries a demo section and none of the six search slots → **rejected**; the legacy `cart` body `["heading","columns","product_rail"]` is heading-led, carries the demo rail and neither `cart_lines` nor `cart_summary` → **rejected**; the legacy `blog` body `["heading","image","rich_text"]` is heading-led, carries a demo section and none of the three blog slots → **rejected**. The clause equally protects the bodies the gate must **pass**: the shipped `product` body `["heading","columns","rich_text","product_rail"]` is heading-led and carries demo sections, but it also carries **all four** of its required slots (`product_media`, `price_block`, `add_to_cart`, `product_meta`) → **not** generic. (The legacy `checkout` body `["heading","columns"]` is heading-led but carries **no** demo section, so `R1` does **not** fire on it — it is rejected by `R2`/`R3` instead, and the gate test asserts exactly that.)
  - `R2-theme-composition` — every type in `requiredTypes` must be present in the template's (recursive) section types.
  - `R3-functional-slots` — every type in `requiredSlots` must be present, must be a **context widget** (its catalogue entry carries a `templates:` allowlist), **and that allowlist must include the template being checked** — i.e. the slot must be in the **granted set for that template**. A slot type that carries no allowlist, or one whose allowlist does not include the template, cannot be fed by a host on that template, so requiring it would be a hole. Stating both halves is what stops a future slot addition from silently weakening the gate: a new required slot must come with a catalogue allowlist that names the template.
  - `R4-no-demo-copy` — **the `page` template only.** The `page` body's serialised props must contain none of the retired demo strings (`"Demo search"`, `"Meet the makers"`, `"Size guide"`, `"How to measure"`, `"Demo article"`, `"Demo story"`) and no `"Demo"` marker. **Why `page` and not every template:** the expert's bar is *"demo data is realistic and explicitly labelled"*, so **labelled** demo copy is acceptable elsewhere; the `page` body is the one surface whose copy would **impersonate the merchant's CMS record** — the defect Phase 1 removed. The `product` body therefore needs **no** exception: Task 6 relabels its one demo line as an explicitly labelled sample ("Sample product page — prices and stock are sample data, and ordering is disabled in the preview."). The bodies this plan authors carry no demo marker at all — the **search** and **blog** bodies assert it in their own suites (Task 2's demo-string assertion, Task 5's demo-string assertion), and the **cart** and **checkout** bodies author no prose beyond their section labels ("Your bag", "Checkout", "Checkout progress", "We accept").
  - `R5-no-forbidden-types` — no type in `forbiddenTypes` may appear.
  - `R6-distinct-across-templates` — the template's main types must differ from **every other** template's main types (two templates with the same body are not two templates). The nine bodies it compares against are the theme's **own** shipped bodies — the gate imports `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`) — so the comparison is against what actually ships, not against a hand-kept table.
  - `R7-one-primary-heading` — the body's **h1 claimants** number **at most one**. A claimant is counted with the platform's own accounting, **exactly**: skip the `heading` widget type entirely (`src/lib/builder-ast.ts:8500-8504` — the `heading` section is the primary, never a second claimant), then count the catalogue widgets with `heading: true` whose `heading` prop is not deliberately blank (`src/lib/builder-ast.ts:8506-8513`, `blankHeading` at `:8301-8313`). **A literal reading that counts the `heading` section as a claimant would make this rule reject the very bodies this plan authors** (the cart and checkout bodies each open with a `heading` section), and the tempting "fix" — deleting that `heading` section — would break the two frozen pins (`cart: ["heading","columns"]`, `checkout: ["heading","checkout_steps","columns"]`) and the preview-nav opener map. Implement the platform's rule, not a paraphrase of it. This is the composition's **structure**: one page, one primary heading. It replaces the gate's former `R7-lint-clean`, which the gate could not honour on the nine shipped bodies.

  **Why there is no lint rule in the gate.** The platform's lint (`lintTemplate`, `src/lib/builder-ast.ts:8380`) is a *different* concern from this gate, and it was measured on the nine shipped bodies before these rules were written: `index` → **22 warnings** ("no বাংলা translation", `src/lib/builder-ast.ts:8660-8673`), `product` → 0 errors / 0 warnings, `collection` → 0 / 0, `account` → 0 / 0, `page` → 0 / 0, `blog` → 0 errors / **2** warnings, `cart` → **1 error** ("More than one widget claims the page `<h1>`", `src/lib/builder-ast.ts:8516-8523`), `checkout` → 0 / 0, `search` → 0 / 0. A rule the gate cannot hold on the bodies it must pass is not a rule the gate gets to have — the translation-coverage warnings are the platform's bilingual-content finding (the shipped `index` body carries 22 of them and no plan is fixing them), and the double-`<h1>` error is a **composition** defect, which this plan **fixes** in the body that carries it (the cart body, Task 6) and then asserts structurally through `R7`. The lint remains the platform's own publish gate; the gate here is the theme-distinctness gate the expert asked for.

  **The documented approved exceptions** — a map `template → { reason, basis }`, consulted by `R2`/`R3` only, each with the reason spelled out:
  - `page` — *"the route owns the body: `page_content` is the shared slot the CMS page route and the CMS-designated homepage flow the merchant's real content through (`src/components/store/PageView.tsx:216`, `src/components/store/StoreHomepage.tsx:120`). The theme's contribution is the slot choice and the breadcrumb — a genuinely shared surface, so the gate requires the slots, forbids a heading and forbids demo copy (`R4`, the one template where copy could impersonate the merchant's record), and does not require a theme-owned presentation."*
  - `checkout` — *"the platform owns checkout: the production route renders its own hand-built form and discards the theme's AST (`src/routes/store.$slug.checkout.tsx:415-421`, Decision **D2**). The template's contribution is the composition of platform-owned commerce widgets; no theme-owned checkout presentation exists, so the gate requires the slots and the platform-only widget set, and does not require a theme-owned section type."*
  - `blog` — *"the storefront blog is themeless by design (`src/components/store/BlogArchiveTheme.tsx:1-9`, pinned by `src/components/store/BlogArchiveTheme.test.tsx:82`, Decision **D5**). The template is a preview surface until D5 is ruled; the gate therefore requires the pack sections and does not require a storefront render path."*
  - `search` — *"the six per-widget search sections are context widgets whose permission the host grants (`src/components/builder/SectionRenderer.tsx:814-833`); on a host that does not grant it they render nothing. The storefront grants five of them — `result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header` — and `facet_sidebar` stays **preview-only**, because its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`) and no storefront route mounts a `WidgetDataProvider` (Decision **D7**). The gate requires the six sections in the composition and their catalogue allowlist, and does not require them to render on every host (Decisions **D6** — ruled, State B — and **D7**)."*
  Each exception names the decision or the file:line it rests on, so a reader can tell an approved exception from a loophole.

  **The legacy fixtures** — `SONOSKRITI_LEGACY_COMPOSITIONS`: the **four** pre-Phase-2 bodies this plan replaces, quoted verbatim from the freeze pin (`src/components/builder/songoskriti-port-freeze.test.tsx:107-110`): `blog` `["heading","image","rich_text"]`, `cart` `["heading","columns","product_rail"]`, `checkout` `["heading","columns"]`, `search` `["heading","rich_text","product_rail"]` — plus the engine's **generic demo body** `["heading","rich_text"]` (`genericDemoMain`, `src/lib/theme-preview-nav.ts:396-440`), which every template would get if the theme authored nothing. **The other five templates are deliberately *not* fixtures**: this plan does not change the **composition** of `index`, `product`, `collection`, `account` or `page` (their freeze-pin entries are still the shipped bodies — `src/components/builder/songoskriti-port-freeze.test.tsx:75-106`; the product body gets **one demo line relabelled** in Task 6, its sections and slots are untouched), and the gate must **pass** those, not reject them. The gate's second assertion is what proves it.

- [ ] **8.2** Write the failing gate test to `src/lib/themes/songoskriti/template-distinctness.test.ts`. It imports `describe/expect/it` from `vitest`, `checkSongoskritiTemplateDistinctness`, `SONOSKRITI_TEMPLATE_EXPECTATIONS`, `SONOSKRITI_APPROVED_EXCEPTIONS`, `SONOSKRITI_LEGACY_COMPOSITIONS`, `SONOSKRITI_DISTINCTNESS_RULES` from `./template-distinctness`, `songoskritiPreviewSource` from `./preview`, `TEMPLATE_KEYS`, `catalogEntry`, `type SectionBuilder` from `../../builder-ast`, `genericDemoMain` from `../../theme-preview-nav`. Four `it` blocks:
  1. **The gate rejects the legacy bodies — it has failed before.** For each of the **four** legacy compositions this plan replaces (plus the engine's generic body), build an AST whose main carries exactly those types and assert `expect(checkSongoskritiTemplateDistinctness(key, legacyAst).length).toBeGreaterThan(0)`. For the bodies that matter most, the assertion names the rules that **actually** reject them, because the rules differ per body — no rule is asserted that cannot fire:
     - the legacy **`search`** body `["heading","rich_text","product_rail"]` is rejected by **`R1-not-generic`** (it is heading-led, it carries a generic demo section and it carries none of the six required search slots — the expert's exact bar), by **`R2-theme-composition`** (it carries none of the seven required types), by **`R3-functional-slots`** (it carries none of the six required slots) and by **`R5-no-forbidden-types`** (`heading` and `rich_text` are forbidden on `search`). The assertion checks that the body's rule ids **include** those four — `expect(ids).toEqual(expect.arrayContaining(["R1-not-generic","R2-theme-composition","R3-functional-slots","R5-no-forbidden-types"]))` — because the rules can only fire on the types and props the fixture carries, and the fixture carries **types only**.
     - the legacy **`blog`** body `["heading","image","rich_text"]` is rejected by **`R1-not-generic`** (heading-led, carries the demo `rich_text`, carries none of the three blog slots), **`R2-theme-composition`**, **`R3-functional-slots`** and **`R5-no-forbidden-types`** (`rich_text` and `image` are forbidden on `blog`); the legacy **`cart`** body `["heading","columns","product_rail"]` by **`R1-not-generic`** (heading-led, carries the demo rail, carries neither `cart_lines` nor `cart_summary`), **`R3-functional-slots`** and **`R5-no-forbidden-types`** (`product_rail` is forbidden on `cart` since Task 6 drops it) — and **not** by `R2`: the legacy body already carries `heading` and `columns`, the two types the cart row requires, so the cart assertion names `R1`, `R3` and `R5` and claims no `R2` at all.
     - the legacy **`checkout`** body `["heading","columns"]` is rejected by **`R2-theme-composition`** and **`R3-functional-slots`** (no `checkout_steps`, no `payment_methods`, no `cart_summary`) — the two rules that fire on it whatever the other bodies look like — and by **neither** `R1` (it carries no generic demo section) **nor** `R5` (`rich_text` is the only forbidden type on `checkout`, and the fixture has none), so the assertion names those two and claims no `R1`/`R5`. (It also trips `R6`: `["heading","columns"]` is exactly the **cart** body's composition after Task 6 — a second, independent reason the legacy checkout body is not a distinct template.)
     - the engine's **generic body** `["heading","rich_text"]` is rejected by **`R1-not-generic`** on every template — it *is* `genericDemoMain`'s output — and, on `search`, by `R2`, `R3` and `R5` as well.
     - every fixture is rejected by **at least one** rule, and the assertion logs the rule ids it found, so a body that is only rejected by `R6-distinct-across-templates` (a duplicate of another template) is visible rather than hidden behind a count. **The five templates this plan does not change are not fixtures**: their shipped bodies must **pass** the gate, which assertion 2 proves.
  2. **The gate passes the shipped bodies.** For every key in `TEMPLATE_KEYS`, build the theme's real body and assert `expect(checkSongoskritiTemplateDistinctness(key, ast)).toEqual([])` — zero issues on all nine. **In the same `it` block**, the test asserts the structure the cart fix buys: the **`cart`** body's h1 claimants number **exactly one** (the order summary), measured with the platform's own claimant rule — a catalogue widget with `heading: true` whose `heading` prop is not deliberately blank (`src/lib/builder-ast.ts:8506-8513`, `blankHeading` at `:8301-8313`) — and the `checkout` body's likewise (the order summary; the payment block's heading is deliberately blank). The shipped cart body had **two** claimants and one lint error (`cart_summary-5: More than one widget claims the page <h1>`); Task 6 fixed it, and this assertion is what keeps it fixed.
  3. **The gate catches the generic body.** Build an AST from `genericDemoMain("search", s)` and assert the issues include a `R1-not-generic` entry — the exact failure the expert named ("never allow a generic heading-plus-demo-rail layout to pass merely because it lives in `preview.ts`"). The legacy heading-plus-demo-rail body is covered by the first assertion above; this one covers the engine's own generic body.
  4. **Every rule has a firing fixture.** R1/R2/R3/R5/R6 have named legacy-body fixtures; add the same for **R4** and **R7**, or state in the plan why a rule can only be exercised by a body the plan does not author. R4's fixture is the `page` body with a demo string (the Phase-1 defect's shape) — assert it is rejected. R7's fixture is a body carrying **two** `heading: true` widgets that are not the `heading` type (e.g. a `heading` section plus a `cart_summary` with a non-blank heading) — assert it is rejected, and assert the platform's own exclusion (the `heading` type is not counted) keeps the plan's cart and checkout bodies at exactly one claimant.
  5. **The exceptions are documented, not silent.** Assert `Object.keys(SONGOSKRITI_APPROVED_EXCEPTIONS).sort()` equals `["blog", "checkout", "page", "search"]` and that every exception carries a non-empty `reason` of at least 40 characters **and** a non-empty `basis` naming what it rests on — the `checkout` exception's basis names **D2**, the `blog` exception's names **D5**, the `search` exception's names **D7**, and the `page` exception's names the two `page_content` grants (`src/components/store/PageView.tsx:216`, `src/components/store/StoreHomepage.tsx:120`); and assert that `SONOSKRITI_TEMPLATE_EXPECTATIONS` has **exactly** one entry per `TEMPLATE_KEYS` member (`expect(Object.keys(SONGOSKRITI_TEMPLATE_EXPECTATIONS).sort()).toEqual([...TEMPLATE_KEYS].sort())`) — a table that quietly drops a template is a gate that quietly stops guarding it. **And assert that the gate has no lint rule**: the exported rule ids are exactly `["R1-not-generic","R2-theme-composition","R3-functional-slots","R4-no-demo-copy","R5-no-forbidden-types","R6-distinct-across-templates","R7-one-primary-heading"]` — a lint rule (the former `R7-lint-clean`) is a rule the gate cannot hold on the nine shipped bodies (the `index` body alone carries 22 translation-coverage warnings), so it is not in the gate at all.

- [ ] **8.3** Run the test and confirm the expected failure:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts
  ```
  Expected output: `Test Files  1 failed (1)` / `Tests  4 failed (4)` — the module `./template-distinctness` does not exist yet (`Failed to resolve import "./template-distinctness"`). If it resolves and the failures are different, read them: the legacy fixtures must be rejected **for the right reasons**, and the shipped bodies must pass — anything else means the table in step 8.1 is wrong.

- [ ] **8.4** Implement `src/lib/themes/songoskriti/template-distinctness.ts` so that the four assertions hold. The checker is a pure function over `(template, ast)`; it must not import React and must not read the filesystem. It **may** import the theme's own source — `songoskritiPreviewSource()` (`src/lib/themes/songoskriti/preview.ts:70`) — because `R6` compares a body against the nine bodies that actually ship; it must **not** import `lintTemplate` (`src/lib/builder-ast.ts:8380`), because the gate has no lint rule (step 8.1). The module's header comment records the gate's subject in one sentence: *"composition, functional slots and structure — never lint cleanliness"*, with the measured reason (the `index` body's 22 translation-coverage warnings).

- [ ] **8.5** Run the gate test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  4 passed (4)`.

- [ ] **8.6** Run the neighbourhood and confirm nothing regressed:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts src/components/store/ThemePreviewFrame.test.tsx src/components/store/songoskriti-preview-compositions.test.tsx
  ```
  Expected output: every file green, **zero** failures — `Test Files  29 passed (29)` / `Tests  396 passed (396)`. The count is the **`src/lib/themes/songoskriti` filter alone** (**24** files / **262** tests: the filter matches 19 files / 228 tests today — it also picks up `src/lib/themes/songoskriti-assets.test.ts` by prefix — and this plan adds five new suites: the search 10, the cart/account 7, the blog/page 6, the checkout 7 and the gate 4), **plus** the five explicit files (**134** tests): the freeze 21, preview-nav 43, `definition-of-done.test.ts` 11, `ThemePreviewFrame.test.tsx` 53 and the new preview suite 6 — 262 + 134 = **396**, and 24 + 5 = **29** files.

- [ ] **8.7** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/lib/themes/songoskriti/template-distinctness.ts src/lib/themes/songoskriti/template-distinctness.test.ts
  node_modules/.bin/eslint src/lib/themes/songoskriti/template-distinctness.ts src/lib/themes/songoskriti/template-distinctness.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, no typecheck output — all exit 0.

- [ ] **8.8** Stage exactly the two paths and commit:
  ```
  git add src/lib/themes/songoskriti/template-distinctness.ts src/lib/themes/songoskriti/template-distinctness.test.ts
  git commit -m "test(songoskriti): gate every template against a generic composition"
  ```
  Expected output: a commit touching exactly two files.

---

### Task 9 — The storefront search route exposes the platform's search pieces individually

**Files:**
- Modify: `src/routes/store.$slug.search.tsx` — **escalation** (all `src/routes/**` are prohibited by §7; the exception is **granted** by Decision **D4** and the hunk is written in Task 1's §(b))
- Create: `src/routes/store.$slug.search-composition.test.tsx` — **allowed** (a **NEW** test file — the §7 carve-out is "NEW test/fixture files"; the prohibition is on *editing* the existing route, which is the escalated file above)
- Reference (unchanged): `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` §(b) "the search route"

**Interfaces:**
- Consumes: `searchStorefrontFn` (`src/lib/storefront-search.functions.ts`), `getStoreChrome` (`src/lib/storefront.functions.ts:93`), `CollectionQueryProvider` / `useCollectionQuery` (`src/components/builder/collection.tsx:55`, `:57`), `CollectionQuery` (`:37`), `SearchParams` / `normalizeSearchParams` / `toSearchQuery` (`src/lib/storefront-search.ts:34`, `:121`, `:159`), `SORTS` (`:12`), `pageCount` / `activeFilterCount` (`src/lib/storefront-search.ts`), `facetHref` / `toggleFacet` / `withSort` / `withPage` (`src/lib/facet-url.ts:150`, `:104`, `:124`, `:136`), `ThemeChrome` (`src/components/store/ThemeChrome.tsx`).
- Produces: the search route renders the theme's authored composition with the platform's pieces filled individually — `productSlot` = the **results block** (the query box, the platform's category/kind chips, the search-status notice, the degraded notice and the results grid), `contextSlots` = permission for exactly **`result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header`**, and a `CollectionQueryProvider` carrying the live query. **`facet_sidebar` is not granted on the storefront** — its rows come from the widget-data pipeline and no storefront route mounts a `WidgetDataProvider` (Decision **D7**).

**The granted set, and where each widget's data comes from** — the per-widget data source, stated exactly, because it is what decides the grant:

| granted widget | what it reads | the storefront's data source |
|---|---|---|
| `result_toolbar` | `query.total` and `groupFacetRows(data?.rows)` (`src/components/builder/collection.tsx:475-483`) | the **provider** — `CollectionQueryProvider`'s `total` is the live `result.total`. Its optional `data.rows` come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:505-507`), which the storefront does not have, so the widget falls back to `query.total` and still renders the count. On a Songoskriti storefront the **theme's** presentation is what renders (`resolveThemePresentation`, `src/lib/theme-presentations.ts:140-155`), and Task 2.6 makes it live-capable — the count from `query.total`, the sort as real links — so the granted toolbar shows the shopper's real count and sort, not a representative one |
| `filter_chips` | `activeFilters(query.params)` (`src/components/builder/collection.tsx:409-411`) | the **provider** only — the query string |
| `pagination` | `query.total` and `query.params.page` (`src/components/builder/collection.tsx:537-540`) | the **provider** only |
| `empty_state` | its authored copy and the provider's clear-all link (`src/components/builder/collection.tsx:707-753`) | the **provider** for the link; its optional suggestion rows come from the widget-data pipeline (`source: "collection"`, `src/lib/widget-registry.ts:524-526`) → absent on the storefront → no suggestions |
| `category_header` | its authored copy and `query.total` (`src/components/builder/collection.tsx:632-705`) | the **provider** for the count; the rest is the theme's authored copy |
| `facet_sidebar` — **not granted** | `groupFacetRows(data?.rows)` (`src/components/builder/collection.tsx:149`, `:94-108`) | the **widget-data pipeline** (`source: "facets"`, `src/lib/widget-registry.ts:483-503`). The only two `WidgetDataProvider` mounts are the preview (`src/components/store/ThemePreviewFrame.tsx:683`) and the dead `src/components/store/StorefrontPage.tsx:280` — **no storefront route mounts one**, so granting it here would render an empty facet panel. **Preview-only** (Decision **D7**) |

- [ ] **9.1** **Confirm the two rulings that this task runs under** — they are **decided**, so this step verifies the record, it does not gate the work:
  ```
  grep -n 'D6 —' -A 12 docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md | head -30
  grep -n 'D4 —' -A 12 docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md | head -30
  grep -n 'the search route' -A 6 docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md
  ```
  Expected output: the **D6** section reading *"RULED: State B (yes)"* and the **D4** section reading *"RULED: §7 is RELAXED for this programme"*, plus the search-route hunk in the escalation record. **If either section does not read as ruled, stop and report it** — the ruling is the owner's, and this plan does not make it. Do **not** defer the task: D6 and D4 are decided, so the route is edited.

- [ ] **9.2** Write the failing route test to `src/routes/store.$slug.search-composition.test.tsx`. It must not import the route module (which pulls the whole server graph); instead it must **read the route file as text** and assert on the composition contract, the way `src/components/builder/chrome-localization.test.tsx` reads source files. The assertions:
  1. the file contains `CollectionQueryProvider` and mounts it with `basePath` and `total` — the facet links and the pager must be real links;
  2. the file passes `contextSlots` containing **exactly** the five granted types (`result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header`) and **not** `facet_sidebar` — the permission tokens and the deliberate exclusion;
  3. the `productSlot` it passes is the **results block**, and that block **still contains the query box and the filters panel** (the `Chip` rows for the category and the product type) — the assertion is that the identifier handed to `productSlot` is not the one handed to `fallback`, and that the query form and the filters panel are inside the identifier handed to `productSlot`;
  4. the `fallback` it passes is still the **whole** listing (the summary, the degraded notice, the empty state and the pager) plus the route's `<h1>` — so a store with **no** published search template keeps today's page;
  5. the file still calls `searchStorefrontFn` and still passes `template: "search"` to `getStoreChrome` — the platform still executes and authorizes the search;
  6. the file still computes `policy` / `listingPolicy` and returns `buildSearchHead` — the canonical and robots discipline is untouched (`src/routes/store.$slug.search.tsx:75-105`).
  The test fails on today's file with a clear message (e.g. `expected '<route source>' to contain 'CollectionQueryProvider'`).

- [ ] **9.3** Implement the route change in `src/routes/store.$slug.search.tsx`, in this order:
  1. Split the monolithic `listing` block (`:186-529`) into named pieces: `queryBox` (`:188-241`), `filtersPanel` (`:243-362`), `summaryAndSort` (`:364-410`), `degradedNotice` (`:412-422`), `emptyState` (`:424-444`), `results` (`:446-484`), `pager` (`:486-527`). **Every piece keeps its existing markup and its existing `t()` calls** — this task moves markup into named constants; it does not redesign the platform's UI.
  2. **Give every piece exactly one owner**, so nothing is rendered twice:

     | piece | owner on a themed page | owner on an unthemed store |
     |---|---|---|
     | the query box (`:188-241`) | the **results block** (`productSlot`) | the `fallback` |
     | the filters panel — the category/kind `Chip` rows, the price bounds, the stock toggle, the clear button (`:243-362`) | the **results block** (`productSlot`) | the `fallback` |
     | the search-status notice — the "Searching…", "Too many searches", "This store is not published" and "Search is unavailable right now" branches (`:366-390`) | the **results block** (`productSlot`) | the `fallback` |
     | the degraded notice (`:412-422`) | the **results block** (`productSlot`) | the `fallback` |
     | the results grid (`:446-484`) | the **results block** (`productSlot`) — rendered by the theme's `product_grid` | the `fallback` |
     | the result count and the sort control (the "ok" branch of the summary, `:368-378`, and the sort label + select, `:391-409`) | the granted **`result_toolbar`** widget — rendered by the theme's live-capable presentation (Task 2.6) | the `fallback` |
     | the active filter chips | the granted **`filter_chips`** widget | the `fallback` |
     | the pager (`:486-527`) | the granted **`pagination`** widget | the `fallback` |
     | the empty state (`:424-444`) | the granted **`empty_state`** widget | the `fallback` |
     | the page `<h1>` (`:531-534`) | the granted **`category_header`** widget — the theme's body claims the h1 | the `fallback` |

     **Why the query box and the chips stay in the results block:** they are search *execution* and *authorization*, not presentation — the platform runs the query, scopes it to the tenant and applies the filters (`src/routes/store.$slug.search.tsx:42-105`). There is **no main-zone search-form widget** in the catalogue, so a theme cannot author one; and once the theme publishes a search body the route's `fallback` is **not rendered at all** (`src/components/store/ThemeChrome.tsx:400-421`) — so a results block without them would take the shopper's search input off the page. The summary's count and the sort control leave the block because the granted `result_toolbar` widget renders both from the provider (`countLabel`/`filtersLabel`/`sortLabel`, `src/lib/builder-ast.ts:6010`); the two branches of the summary's ternary are extracted into two named constants — `resultCount` and `searchNotice` — and each keeps the original `<p>` wrapper and its classes, so the page's structure is unchanged.
  3. Mount `<CollectionQueryProvider value={{ params, total: result?.total ?? 0, basePath: `/store/${slug}/search`, navigate: (next) => apply(next) }}>` around the `ThemeChrome` so the theme's facet/sort/pager widgets compute real links.
  4. Pass `contextSlots={{ result_toolbar: null, filter_chips: null, pagination: null, empty_state: null, category_header: null }}` — the five permission tokens, and **no `facet_sidebar`**: its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`) and no storefront route mounts a `WidgetDataProvider` (Decision **D7**), so granting it would render an empty facet panel. The `empty_state` token is added **only when the platform's own empty-state condition holds** (`result && result.items.length === 0 && !query.isPending`, `:424`) — the `empty_state` widget renders its panel unconditionally (`src/components/builder/collection.tsx:707-753`), so the grant is what decides whether the theme's empty copy appears, and it must appear exactly when the platform's own empty state would.
  5. Pass `productSlot={resultsBlock}` — the **results block** (the query box, the filters panel, the search-status notice, the degraded notice and the results grid) — so the theme's `product_grid` shows the platform's priced, tenant-scoped results **and the shopper's search input and filters with them**.
  6. Keep `fallback` as the **whole** listing (`queryBox + filtersPanel + summaryAndSort + degradedNotice + emptyState + results + pager` plus the route's `<h1>`), so a store with **no** published search template still gets today's page, byte-identical in content.
  7. Change **nothing** about the loader, the head, the canonical policy, the rate-limit handling, the `apply()` helper or the tenant scoping.
  8. **State the residual in the code comment above the `contextSlots` map:** *"the storefront grants five of the platform's search widgets; `facet_sidebar` stays preview-only because its rows come from the widget-data pipeline (D7). A themed storefront search page therefore has **no independent facet sidebar** — the platform's own category/kind chips remain visible inside the results block, which is where the shopper filters the search."*

- [ ] **9.4** Run the route test and confirm it passes:
  ```
  node_modules/.bin/vitest run src/routes/store.$slug.search-composition.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)` / `Tests  6 passed (6)`.

- [ ] **9.5** Run the neighbouring suites:
  ```
  node_modules/.bin/vitest run src/routes/store.$slug.search-composition.test.tsx src/lib/phase2-collection.test.ts src/lib/phase7-seo.test.ts src/lib/themes/songoskriti/search-template.test.ts src/components/store/ThemeChrome.route-content.test.tsx src/lib/definition-of-done.test.ts
  ```
  Expected output: every file green, zero failures. (`src/lib/phase2-collection.test.ts` and `src/lib/phase7-seo.test.ts` are the suites that cover `src/lib/storefront-search.ts` and `src/lib/facet-url.ts` — there is no `storefront-search.test.ts` / `facet-url.test.ts` in the tree, so those two are the ones to run.)

- [ ] **9.6** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/routes/store.$slug.search.tsx src/routes/store.$slug.search-composition.test.tsx
  node_modules/.bin/eslint src/routes/store.$slug.search.tsx src/routes/store.$slug.search-composition.test.tsx
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, no typecheck output — all exit 0.

- [ ] **9.7** Stage exactly the two paths and commit:
  ```
  git add src/routes/store.$slug.search.tsx src/routes/store.$slug.search-composition.test.tsx
  git commit -m "feat(storefront): expose the search pieces to the theme's composition"
  ```
  Expected output: a commit touching exactly two files.

---

### Task 10 — The documented archive contract *(D1 ruled: Option A — no new `archive` key)*

**Files:**
- Modify: `src/components/store/ThemePreviewFrame.tsx` (the explicit unsupported state) — **escalation** (the same file, and the same escalation record, as Task 7)
- Create: `src/lib/themes/songoskriti/archive-contract.test.ts` — **allowed** (NEW test file) — the **contract** test
- Reference (unchanged): `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md`

**Interfaces:**
- Consumes: `TEMPLATE_KEYS` / `TemplateKey` (`src/lib/builder-ast.ts:46-59`, `:60`), `genericDemoMain` (`src/lib/theme-preview-nav.ts:430`), `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:29-33`), the blog pack's catalogue entries (`blog_archive` `src/lib/builder-ast.ts:4834`, `blog_terms` `:4886`, `blog_pager` `:4909`), `ThemePreviewFrame` (`src/components/store/ThemePreviewFrame.tsx:420`), the templates map the preview reads (`:486`).
- Produces: **the archive contract**, written into the escalation record and pinned by a test; and the preview's **explicit unsupported state** — a named "not supported by this theme" panel in place of the silent homepage fallback. **No `archive` template key is added and no core file is edited** (Decision **D1**, Option A).

- [ ] **10.1** **The contract, written down** (append-only — this section is **appended** to the escalation record, and an earlier section is never rewritten). Append a section stating, in these words:

  *"**Archive contract (Decision D1, Option A).** The archive-like surfaces the platform serves are the blog listing and its three taxonomy kinds — **category, tag, author** — plus the blog index itself: `src/routes/blog.index.tsx`, `src/routes/blog.category.$slug.tsx`, `src/routes/blog.tag.$slug.tsx`, `src/routes/blog.author.$slug.tsx` and the storefront's `src/routes/store.$slug.blog.index.tsx`. They are served by `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:29-33`) and backed by the existing blog pack (`blog_terms` / `blog_archive` / `blog_pager`, `src/lib/builder-ast.ts:4834-4925`), and they wear the **`blog`** template. **No `archive` template key is added**: a key would need edits to `src/lib/builder-ast.ts` (`TEMPLATE_KEYS` `:46-59`, `TEMPLATE_ZONES` `:156`, `ROUTE_H1_TEMPLATES` `:68-75`, the 41 catalogue `templates:` allowlists, the `required` table `:8438-8462`, `parseTemplates` `:8117`), `src/lib/theme-package.ts:172`, `src/lib/theme-preview-nav.ts:340` and `:82-99`, `src/lib/widget-weight.ts:205`, `src/lib/builder-seo.ts:317`, `src/components/builder/BuilderTopBar.tsx:6`, `src/routes/_authenticated/dashboard/builder.tsx:205` and the hand-written `z.enum` at `src/lib/storefront.functions.ts:97-107` — **every one prohibited by §7** — for a surface the `blog` template already covers; and no compiler sees that `z.enum`, so a key added to the editor but not to the parser and the `z.enum` would appear in the builder and vanish from every page (`phase0-implementation-map.md:308`). `?template=archive` therefore remains **unsupported**, and the preview must **say so explicitly** rather than redirect to the homepage. The storefront side of the blog — whether the route wears the theme's `blog` template — stays behind Decision D5 and is not touched by this plan."*

- [ ] **10.2** Write the **contract** test `src/lib/themes/songoskriti/archive-contract.test.ts`. It must assert, in five `it` blocks, the facts the contract rests on — none of them depends on a ruling, because the ruling is already made:
  1. **the archive-like routes the platform actually has are enumerated** — the assertion reads `src/routes/` and expects the blog taxonomy routes (`blog.index.tsx`, `blog.category.$slug.tsx`, `blog.tag.$slug.tsx`, `blog.author.$slug.tsx`) and the storefront blog index (`store.$slug.blog.index.tsx`) to exist;
  2. **the product-side taxonomy surfaces are not routes** — the assertion expects no `store.$slug.c.$categorySlug.tsx`-style route and no brand route to exist, and expects `src/lib/storefront-search.ts` to carry `category` as a search facet;
  3. **no unsupported template silently redirects to the homepage** — the assertion is that the preview's fallback is an explicit, named unsupported state: it checks that the preview host's fallback expression (`src/components/store/ThemePreviewFrame.tsx:486`) is not the bare `?? templates.index`, and that the route's own 404 — not a redirect — is what an unsupported storefront route gets;
  4. **the unsupported state's copy is not demo copy** — the assertion reads the preview host's unsupported-state copy and expects it to contain **none** of the retired demo strings (`"Demo page"`, `"Demo search"`, `"Meet the makers"`, `"Sample product"`, `"Demo"`), so the new "not supported by this theme" panel cannot inherit the demo-copy defect Phase 1 removed — the engine's generic body still carries `"Demo page. The live theme authors this template — what you see here is the engine fallback."` (`src/lib/theme-preview-nav.ts:367`);
  5. **the contract is written down** — the assertion reads the escalation record (or this plan's Decision Gate) and expects the archive contract sentence to be present, so the contract cannot be deleted without failing a test.

- [ ] **10.3** **Implement the explicit unsupported state** in the preview host (the same escalated file as Task 7): when `templates[template]` is `undefined`, render a labelled **"This template is not supported by this theme"** panel instead of `templates.index`. The panel **names the template key**, links back to the home tab, and carries **no** demo copy (it is not a demo — it is a statement about the theme's coverage). It is never shown for a template the theme *does* author. The panel's copy is the string step 10.2's fourth assertion reads.

- [ ] **10.4** Run the contract test and the neighbourhood:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/archive-contract.test.ts src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/themes/songoskriti/preview.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts src/components/store/ThemePreviewFrame.test.tsx
  ```
  Expected output: every file green, zero failures — `Test Files  7 passed (7)` / `Tests  140 passed (140)` (the new contract suite 5, the gate suite 4, `preview.test.ts` 3, freeze 21, preview-nav 43, `definition-of-done.test.ts` 11, `ThemePreviewFrame.test.tsx` 53 — and **zero** failures: `ThemePreviewFrame.test.tsx` is frozen by §7 and its assertions are **not** skipped or weakened, so the unsupported state must not change any of them).

- [ ] **10.5** Check formatting, lint and types:
  ```
  node_modules/.bin/prettier --check src/components/store/ThemePreviewFrame.tsx src/lib/themes/songoskriti/archive-contract.test.ts
  node_modules/.bin/eslint src/components/store/ThemePreviewFrame.tsx src/lib/themes/songoskriti/archive-contract.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: `All matched files use Prettier code style!`, no eslint output, no typecheck output — all exit 0. **No `TEMPLATE_KEYS` change is involved**, so the route/editor/SEO maps are not touched and no compile error is possible in them.

- [ ] **10.6** Stage exactly the three paths and commit:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md src/components/store/ThemePreviewFrame.tsx src/lib/themes/songoskriti/archive-contract.test.ts
  git commit -m "docs(songoskriti): record the archive contract and name the unsupported state"
  ```
  Expected output: a commit touching only those three paths. **Never** `git add -A`.

---

### Task 11 — The evidence record: what shipped, what was verified, what was deferred

**Files:**
- Create: `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md` — **docs**

**Interfaces:**
- Consumes: the commits of Tasks 1–10 (`git log --oneline`), the test output of each task, the escalation record, the plan's Decision Gate.
- Produces: the evidence document — no code symbols.

- [ ] **11.1** Collect the commit list and the test evidence:
  ```
  git log --oneline a48253c8..HEAD | head -30
  git diff --stat a48253c8..HEAD
  ```
  Expected output: the plan's commits in order, and a diff stat showing **only** the planned files. Confirm explicitly that `git diff --stat a48253c8..HEAD -- src/routes/store.$slug.cart.tsx src/routes/store.$slug.account.tsx src/routes/store.$slug.checkout.tsx src/components/store/BlogArchiveTheme.tsx src/components/store/PageView.tsx src/components/store/StoreHomepage.tsx` is **empty** — the live cart, account, checkout, blog and page surfaces are untouched. `a48253c8` is **this plan's base commit** (recorded in Task 1's escalation record): the range must start at the plan's own starting point, not at an older commit — `74b7f2b0` predates Phase 1, so a range starting there would report Phase-1's own changes to `src/components/store/PageView.tsx` (+45 lines), `ThemeChrome.tsx` and `ThemePreviewFrame.tsx` as if this plan had made them. The one route the plan **does** change is `src/routes/store.$slug.search.tsx` (Task 9), so it is named separately in the diff stat, with the Task 9 commit as its diff.

- [ ] **11.2** Run the full theme neighbourhood one last time and record the numbers:
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti src/components/builder/songoskriti-port-freeze.test.tsx src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts src/components/store/ThemePreviewFrame.test.tsx src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/components/store/BlogArchiveTheme.test.tsx src/components/store/ThemeChrome.route-content.test.tsx src/components/store/PageView.twin-wiring.test.tsx
  ```
  Expected output: **every file green, zero failures** — `Test Files  34 passed (34)` / `Tests  416 passed (416)` (the `src/lib/themes/songoskriti` filter matches 25 files / 267 tests after this plan's six new suites — the search 10, the cart/account 7, the blog/page 6, the checkout 7, the gate 4 and the archive contract 5; plus freeze 21, preview-nav 43, `definition-of-done.test.ts` 11, `ThemePreviewFrame.test.tsx` 53, the new preview suite 6, `songoskriti-preview-page.test.tsx` 7, `BlogArchiveTheme.test.tsx` 2, `ThemeChrome.route-content.test.tsx` 3, `PageView.twin-wiring.test.tsx` 3). Record the exact file and test counts in the evidence document.

- [ ] **11.3** Write the evidence document `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md`, in the shape of `phase1-page-content-evidence.md`:
  - **§A — What shipped**: one row per expert item, with the commit(s), the files, and the acceptance evidence (the exact test name that pins it);
  - **§B — The acceptance walk-through**: the expert's closing bar, item by item — *"all supported template tabs show the real theme-authored composition"* (Task 7's six preview cases) · *"demo data is realistic and explicitly labelled"* (Task 4's seven assertions + the preview's visible markers + the product body's relabelled sample line) · *"Page previews a useful sample but the live Page route renders the actual CMS record"* (Task 5 + the untouched `PageView`) · *"Checkout preview renders the authored template"* (Task 7's checkout case, `not.toContain("Muslin Floral Festive Saree")`) · *"Archive has an explicit contract and route mapping"* (Task 10's contract: the blog taxonomy surface wears the `blog` template plus the blog pack, **no `archive` key**, and an unsupported template produces the explicit unsupported state instead of a homepage redirect) · *"each claimed template passes a theme-distinctness test"* (Task 8 — composition, slots and structure, **not** lint cleanliness: the gate's seven rules and the reason it has no lint rule are recorded in the gate module's header comment);
  - **§C — What was deliberately not changed**: the live search execution/authorization, the cart mutations, the customer authorization, the price calculation, the order state, and the merchant's CMS page record — with the `git diff --stat` evidence from step 11.1;
  - **§D — The parity impact**: the 24 stale captures (`search`, `cart`, `blog`, `checkout` × 6 widths/locales) in `docs/superpowers/songoskriti-evidence/port/reference/` and in `.e2e/songoskriti-port-parity.spec.ts-snapshots/`; the trigger (*before the next owner-run parity pass*); the fact that re-freezing rewrites all 60 manifest entries and is a separate owner-approved step; and that CI is unaffected (the parity suite is in neither `e2e:critical` nor `e2e:security`);
  - **§E — The deferred items**: D5 (the storefront blog stays themeless by design), D2 (the production checkout stays tokens-only), and D7 (the storefront's widget-data delivery is not fixed — the search results reach the storefront through `productSlot`, and `facet_sidebar` stays **preview-only**). **D1, D4 and D6 are not deferred: they are ruled and this plan implements them**;
    - **Amended 2026-10-21 (closing wave):** D2, D5 and D7 are **now closed as decisions** (the deferrals stand; the questions are settled — each has a dated amendment above with its reason, its follow-up path and where that follow-up lives). **D3 is closed too** (Songoskriti only). The evidence record's **§(K.3)** carries the four rulings in full;
  - **§F — The commands to reproduce**, each runnable as written.

- [ ] **11.4** Commit the evidence document on its own:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md
  git commit -m "docs(songoskriti): record the template-completeness evidence"
  ```
  Expected output: a commit touching **one** file; `git status --short` still shows the three churn files and `.output-snapshots/` unstaged.

---

## What this plan deliberately does NOT do

- **The plugin registry and the widget architecture are out of scope** — the expert said so explicitly (*"Do not redo the plugin registry or widget architecture"*). This plan does not touch `src/lib/unified-widget-registry.ts`, `src/lib/theme-presentations.ts`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/components/builder/heritage.tsx` or `src/components/builder/theme-widgets.tsx`. It adds **no** widget type, **no** theme package capability and **no** registry surface. **No `archive` template key is added** (Decision **D1**, Option A), so `TEMPLATE_KEYS`, `TEMPLATE_ZONES`, the catalogue allowlists, the `z.enum` and the editor/SEO/weight maps are all left alone.
- **The live storefront's search execution and authorization do not change.** The platform still runs the query, still scopes it to the tenant, still limits the page size, still applies the canonical/robots discipline and still prices the results (`src/routes/store.$slug.search.tsx:42-105`). Task 2 changes only *where the platform's block is placed*; Task 9 changes only *how the block is split for presentation* — the query box, the category/kind chips and the results grid stay in the platform's results block, and the count/sort, the active chips, the pager, the empty state and the page `<h1>` are handed to the platform's own widgets. No query, no filter, no sort, no limit and no authorization rule is authored by a theme.
- **The cart mutations, the customer authorization, the price calculation and the order state do not change.** The live cart route keeps its `CartProvider` and its real quote (`src/routes/store.$slug.cart.tsx:81-129`, `src/components/builder/CartContext.tsx:129+`); the live account route keeps its session-scoped `accountSlots` (`src/routes/store.$slug.account.tsx:185-219`) and never shows another customer's rows; every money figure on the storefront still comes from the server quote (`quoteCart`), never from a theme prop. Task 4's synthetic cart is **preview-only** and is `live: false`.
- **The production checkout route is not touched.** `src/routes/store.$slug.checkout.tsx` keeps `ast={null}`, keeps its server-authoritative totals, its validation, its payment providers and its order state (Task 6 asserts the file still says so). The checkout preview's synthetic order data never reaches a quote, a reservation or an order.
- **The merchant's CMS page record is not replaced with theme demo copy.** The live Page route keeps rendering the merchant's real record through `page_content` (`src/components/store/PageView.tsx:73-110`, `:166`, `:175`); the theme's `page` template still declares the slot and no demo copy. The sample page is **preview-only** and explicitly labelled. The gate's copy rule (`R4`) is scoped to the **`page`** template for exactly this reason — it is the one body whose copy could impersonate the merchant's record.
- **The gate does not police lint cleanliness.** The distinctness gate (Task 8) asserts **composition, functional slots and structure** — seven rules, none of them a lint rule. The platform's own lint keeps its publish-blocking role (the translation-coverage warnings and the double-`<h1>` error), and the one double-`<h1>` defect this plan finds — the shipped cart body — is **fixed**, not excepted (Task 6), and then held by the gate's `R7-one-primary-heading`. The **22** translation-coverage warnings on the shipped `index` body are **not** in this plan's scope: they are the platform's bilingual-content finding, and no template this plan leaves alone is rewritten to silence them.
- **The storefront blog stays "themeless by design".** `src/components/store/BlogArchiveTheme.tsx` and its pin `src/components/store/BlogArchiveTheme.test.tsx` are **not touched** (Decision **D5**). The blog item of this plan is a *preview-composition* item, exactly as the expert framed it.
- **The storefront's widget-data delivery is not fixed** (Decision **D7**). No `WidgetDataProvider` is added to any storefront host; the search results reach the storefront through the route's `productSlot`, and the theme's grid honours it. **Residual, stated plainly:** on a themed storefront search page there is **no independent facet sidebar** — `facet_sidebar` is **preview-only**, because its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`); the platform's own category/kind chips stay visible inside the results block, which is where the shopper filters the search.
- **No new `archive` template key is added** (Decision **D1**, Option A). The archive surface is the blog taxonomy surface — index, category, tag, author — and it wears the **`blog`** template plus the existing blog pack. `?template=archive` is **unsupported**, and the preview says so explicitly instead of redirecting to the homepage.
- **No existing test is weakened, skipped or deleted**, and no snapshot file is regenerated. The two existing test files this plan updates (`songoskriti-port-freeze.test.tsx` and `theme-preview-nav.test.ts`) are updated to **stronger** expectations, each quoted in the Task-1 escalation record before the change. Every other existing test file — including `src/lib/themes/songoskriti/preview.test.ts`, `src/components/store/BlogArchiveTheme.test.tsx` and `src/components/store/ThemePreviewFrame.test.tsx` — is left byte-identical.
- **No migration is created or altered** (`theme_drafts.templates` and `theme_versions.templates` are `jsonb`), **no dependency is added**, **no deploy runs inside this plan**, and the three churn files plus `.output-snapshots/` are never staged.
