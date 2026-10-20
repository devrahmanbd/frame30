# Phase 2 — Template-completeness escalation bundle (preview host + frozen pins + search route)

**Branch:** `frame30` · **Base commit:** `a48253c8` · **Recorded:** 2026-10-20
**Plan:** `docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md` (Task 1)
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary — "no core files") and §9 (Testing & evidence)

This record is the port spec §9 escalation for the Phase-2 change "every template tab in the Songoskriti theme preview shows a real, theme-authored composition". It is written and committed **before** any pinned output is updated, before the escalated preview host is touched and before the escalated search route is touched. Per §9, a change that alters existing pinned output is a parity finding first; if genuinely required, escalate with the exact diff and rationale before any update (named and called out, never blind `-u`). This document is that escalation.

**Base commit.** The base commit of this plan is **`a48253c8`** — that sha is what every later "nothing else changed" proof in this plan is scoped to (Tasks 6 and 11), and it is the sha quoted in §(e) below. At the moment of recording, `HEAD` is `951c30b4`, whose only change is the addition of this plan's own document (`docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md`, +1166 lines, `docs/**`). No code changed between `a48253c8` and `951c30b4`, so `git diff --stat a48253c8..HEAD -- src/` is empty and the proofs scoped to `a48253c8` remain valid. The older `74b7f2b0` is **not** used for any proof in this plan: it predates Phase 1, so `git diff --stat 74b7f2b0..HEAD -- src/components/store/PageView.tsx` is **not** empty (+45 lines) — Phase 1 already landed the `page_content` slot there, and `ThemeChrome` and `ThemePreviewFrame` changed too.

**The three rulings this record runs under** (the owner's, already recorded in the plan's Decision Gate): **D1** — the archive surface is the blog taxonomy surface; **no `archive` template key is added** (Option A). **D4** — port spec §7 is **relaxed for this programme** for exactly four narrow exceptions: this record's four files. **D6** — the storefront search route **exposes its pieces as per-widget context slots** (State B).

---

## (a) The finding

**Four findings, one per escalated surface.**

**(i) The preview host is the only place that can feed the preview's cart, account, search, blog and checkout surfaces.**
`ThemePreviewFrame` (`src/components/store/ThemePreviewFrame.tsx:420`) mounts **no** `CartProvider` and **no** `BlogFeedProvider`, and grants **no** search-widget permission. So:

- the preview's cart falls back to the studio's `DEMO_CART` (`src/components/builder/CartContext.tsx:75`) — "Sample product" (`:95`) / "Second product" (`:104`), with a studio total (`:83`) that matches no Songoskriti price;
- the preview's account rows are the shared `DEMO_ORDERS` / `DEMO_PROFILE` (`src/lib/preview-demo-data.ts:21`, `:40`) — "ORD-1001" / "ORD-1002" and "Demo Shopper" (`:42`);
- the preview's blog pack reads the pack's own fallback `SAMPLE` rows (`src/components/builder/blog.tsx:51-62`) — "Sample article 1"…;
- the preview's checkout tab renders `<CheckoutMock …/>` (`src/components/store/ThemePreviewFrame.tsx:36`, `:670`) instead of the theme's authored checkout body.

Every one of those is a _host_ decision: the widgets read the cart **context** (`src/components/builder/cart.tsx:75`, `:274`, `:315`, `:442`, `:465`, `:559`), the account slots and the blog feed are **context slots** the host supplies, and the search widgets are **context widgets** that render only where the host grants permission (`src/components/builder/SectionRenderer.tsx:814-833`). The preview is the only host that mounts a `WidgetDataProvider` (`src/components/store/ThemePreviewFrame.tsx:683`), so it is also the only host that can feed `facet_sidebar` (Decision **D7**). **Without this change the preview cannot show any of the six surfaces the expert says are generic.**

**(ii) The theme's template compositions are pinned by two existing test files.**
`src/components/builder/songoskriti-port-freeze.test.tsx:106-110` pins the exact ordered composition of the `blog`, `cart`, `checkout` and `search` templates (`TEMPLATE_MAIN`), and `src/lib/theme-preview-nav.test.ts:120-130` pins every template's opener (`FIRST_SECTION`). Both files are existing test files, prohibited by port spec §7 (_"existing test files and their snapshots (`.snap`) under `src/`"_) and therefore escalated here. The expectations they hold are **stale**: they pin bodies that carry demo copy and no functional slot.

**(iii) The storefront search route hands the theme one opaque block, so the per-widget decomposition needs a route change.**
`src/routes/store.$slug.search.tsx:186-529` builds the whole listing — query box, filters, chips, sort, summary, results, pager, empty state — and hands it to the theme as **one** `productSlot` (`:559`). The theme's `product_grid` presentation is the only consumer of `productSlot` (`src/components/builder/widgets.tsx:87`, `:1447`, `:1491`), and Songoskriti's own `product_grid` ignores it (`src/components/builder/songoskriti.tsx:897-898`). Meanwhile the six Phase-2.4 search widgets are **context widgets** (`templates:` allowlists at `src/lib/builder-ast.ts:2691`, `:2717`, `:2757`, `:2771`, `:2793`, `:2824`), so they render only where the host grants permission (`src/components/builder/SectionRenderer.tsx:814-833`) — and **no** storefront host grants permission for any of them today. The only `contextSlots` writers in the tree are:

| writer                                                  | granted slots                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/components/store/PageView.tsx:216`                 | `breadcrumb`, `page_content`                                                                  |
| `src/components/store/StoreHomepage.tsx:120`            | `page_content`                                                                                |
| `src/components/store/ProductView.tsx:613`              | `breadcrumb`, `product_media`, `price_block`, `add_to_cart`, `product_meta`, `page_content`   |
| `src/routes/store.$slug.cart.tsx:102`                   | `cart_lines`, `cart_summary`, `cart_drawer`, `checkout_steps`, `payment_methods` (all `null`) |
| `src/routes/store.$slug.account.tsx:502`                | `accountSlots`                                                                                |
| `src/routes/cart.tsx:102`, `src/routes/account.tsx:501` | the custom-host twins of the two routes above                                                 |

`CollectionQueryProvider` (`src/components/builder/collection.tsx:55`) is exported and **mounted nowhere** — a repo-wide grep finds no importer outside that file — so even where the six widgets do render, their facet links, sort links and pager are computed from `DEFAULT_QUERY` (`basePath: ""`, `total: 0`) and are inert. **The per-widget decomposition is therefore a route change**, and `src/routes/**` is prohibited by §7. Decision **D6** (State B) and Decision **D4** (§7 relaxed for this programme) grant it.

**(iv) The archive surface needs no template key under the D1 ruling, but the preview's unsupported-template fallback is a silent redirect.**
`src/components/store/ThemePreviewFrame.tsx:486` reads `const ast = templates[template] ?? templates.index;` — an unsupported template silently renders the **homepage**. Under **D1** (Option A) the archive surface is the blog taxonomy surface (index / category / tag / author), it wears the **`blog`** template and the existing blog pack, and **no `archive` key is added**; `?template=archive` is therefore _unsupported_ and must produce the **explicit** unsupported state, not a homepage redirect. That is a **preview-host** change and is covered by the same escalation as (i).

**The measured blast radius this ruling avoided** (Decision D1, Option A — the justification, not a work item; **no** `archive` key is added and **none** of these files is edited):

| measurement                                              | value                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| files referencing `TEMPLATE_KEYS` outside tests          | **11** (36 matching lines)                                                                   |
| `Record<TemplateKey, …>` occurrences outside tests       | **16**, across **9** files                                                                   |
| catalogue entries carrying a `templates:` allowlist      | **41** (`src/lib/builder-ast.ts`)                                                            |
| hand-written `z.enum([...])` duplicating `TEMPLATE_KEYS` | `src/lib/storefront.functions.ts:97-107` — the nine keys, a **compiler-invisible** duplicate |
| theme-package contract                                   | `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:52`)                                 |

The Phase-0 audit quotes _"16 `TEMPLATE_KEYS` sites, 7 switch/`Record` maps"_ (`phase0-implementation-map.md:249`, `:275`). Those are **line** counts of a slightly different grep; the **file-level** numbers above are the ones that decide the blast radius. **Both are quoted here**, so the discrepancy is visible rather than silently re-derived.

---

## (b) The exact old → new diff

### (b.1) `src/components/store/ThemePreviewFrame.tsx` — the preview host

**Scope of the change, in one line:** one new import of the NEW theme-owned demo modules; one `CartProvider` wrapper carrying the synthetic cart value; one `BlogFeedProvider` wrapper carrying the demo feed; one new permission-slot map for the search widgets the preview grants; one `CollectionQueryProvider` carrying the demo query; the five cart slots stay `null` but are granted for the **`checkout`** template as well as `cart`; the checkout branch changes from `<CheckoutMock …/>` to the authored `ast.main` rendered through `SectionRenderer`; and the unsupported-template branch changes from the bare `?? templates.index` to a named "not supported by this theme" panel.

**The click/submit interception, the skin sheets, `useMockProductSlots`, `accountSlots` and `pageSlots` are all untouched, and no assertion in `src/components/store/ThemePreviewFrame.test.tsx` is skipped, weakened or deleted** — that file is not edited by this plan.

```diff
@@ -48,6 +48,14 @@
   } from "@/lib/widget-data";
   import { previewDemoMap } from "@/lib/preview-demo-data";
   import { PREVIEW_DEMO_PAGE } from "@/lib/preview-page-data";
+  // Phase 2 — the theme-owned demo data (Task 2 / Task 4 / Task 5). Used
+  // ONLY for the Songoskriti blueprint; every other blueprint keeps today's
+  // behaviour byte-for-byte. The data is SYNTHETIC and labelled as such.
+  import {
+    SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
+    songoskritiPreviewCart,
+    songoskritiPreviewFacets,
+    songoskritiPreviewOrders,
+    songoskritiPreviewProfile,
+  } from "@/lib/themes/songoskriti/preview-demo-data";
+  import { SONOSKRITI_PREVIEW_PAGE } from "@/lib/themes/songoskriti/preview-page";
   import { OrdersList, ProfileCard } from "@/components/builder/account";
```

```diff
@@ -565,12 +573,14 @@

   const cartSlots =
-    template === "cart"
+    template === "cart" || template === "checkout"
       ? {
           cart_lines: null,
           cart_summary: null,
           cart_drawer: null,
           checkout_steps: null,
           payment_methods: null,
         }
       : undefined;
+
+  // The six Phase-2.4 search widgets are CONTEXT widgets: they render only
+  // where the host grants permission (`SectionRenderer.tsx:814-833`). The
+  // preview grants the five the storefront grants — `result_toolbar`,
+  // `filter_chips`, `pagination`, `empty_state`, `category_header` — PLUS
+  // `facet_sidebar`, which is preview-only: the preview is the only host
+  // that mounts a `WidgetDataProvider` (D7).
+  const searchSlots =
+    template === "search"
+      ? {
+          result_toolbar: null,
+          filter_chips: null,
+          pagination: null,
+          empty_state: null,
+          category_header: null,
+          facet_sidebar: null,
+        }
+      : undefined;
```

```diff
@@ -486,7 +494,20 @@
-  const ast = templates[template] ?? templates.index;
+  // D1 (Option A): an unsupported template is an EXPLICIT state, never a
+  // silent redirect to the homepage. `?template=archive` is unsupported —
+  // the archive surface is the blog taxonomy surface and wears `blog`.
+  const unsupported = !templates[template];
+  const ast = unsupported ? templates.index : templates[template];
```

```diff
@@ -669,9 +690,26 @@
             {template === "checkout" ? (
-              <CheckoutMock
-                slug={blueprintKey}
-                themeName={themeName}
-                themeKey={blueprintKey}
-              />
+              // The AUTHORED checkout template, rendered through the same
+              // SectionRenderer the storefront uses — not `CheckoutMock`.
+              // The five cart slots are granted above, so the platform's
+              // `checkout_steps` / `payment_methods` / `cart_summary`
+              // widgets render against the synthetic cart context.
+              <MinimalCheckoutHeader
+                slug={blueprintKey}
+                name={themeName}
+                themeKey={blueprintKey}
+              />
             ) : (
```

> The checkout branch, the `CartProvider` / `BlogFeedProvider` / `CollectionQueryProvider` wrappers and the "not supported by this theme" panel are recorded here as the **shape** the host change takes; the exact hunks are written by Task 7 and Task 10, which cite this section before they edit the file. Nothing in this record authorises an edit to any file other than the four named in §(e).

### (b.2) `src/components/builder/songoskriti-port-freeze.test.tsx:106-110` — the four `TEMPLATE_MAIN` entries

```diff
@@ -104,10 +104,14 @@
   account: ["heading", "profile_card", "orders_list"],
   page: ["breadcrumb", "page_content"],
-  blog: ["heading", "image", "rich_text"],
-  cart: ["heading", "columns", "product_rail"],
-  checkout: ["heading", "columns"],
-  search: ["heading", "rich_text", "product_rail"],
+  blog: ["blog_terms", "blog_archive", "blog_pager"],
+  cart: ["heading", "columns"],
+  checkout: ["heading", "checkout_steps", "columns"],
+  search: [
+    "category_header",
+    "result_toolbar",
+    "facet_sidebar",
+    "filter_chips",
+    "product_grid",
+    "pagination",
+    "empty_state",
+  ],
 };
```

The assertion at `:159` — `expect(main.map((x: Section) => x.type)).toEqual(TEMPLATE_MAIN[key])` — is **not** touched. It still pins the exact ordered composition of every template. The old expectations are **replaced, not deleted**, and the replacements are strictly stronger: they name the platform's functional data slots (`result_toolbar`, `facet_sidebar`, `filter_chips`, `pagination`, `empty_state`, `category_header`, `cart_lines`, `cart_summary`, `checkout_steps`, `payment_methods`) that the old literals did not.

### (b.3) `src/lib/theme-preview-nav.test.ts:120-130` — the `FIRST_SECTION` map

```diff
@@ -123,7 +123,7 @@
     collection: "category_header",
     account: "heading",
     page: "breadcrumb",
-    blog: "heading",
+    blog: "blog_terms",
     cart: "heading",
     checkout: "heading",
-    search: "heading",
+    search: "category_header",
   };
```

The map already pins all nine openers explicitly, so the assertion stays **total** and no default branch is reintroduced. The `cart` and `checkout` entries stay `"heading"` — both new bodies still open with the `heading` widget.

### (b.4) `src/routes/store.$slug.search.tsx` — the search route

**D6 is ruled (State B) and D4 is relaxed, so this file is edited — it is not reserved.**

The change: the monolithic `listing` block (`:186-529`) is split into named pieces (`queryBox`, `filtersPanel`, `summaryAndSort`, `degradedNotice`, `emptyState`, `results`, `pager`) — **every piece keeps its existing markup and its existing `t()` calls**; a `CollectionQueryProvider` is mounted around the `ThemeChrome` with the live query; a `contextSlots` permission map grants exactly five widgets; and the `productSlot` / `fallback` split gives every piece exactly one owner.

| piece                                                                                              | owner on a themed page                                                        | owner on an unthemed store |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| the query box (`:188-241`)                                                                         | the **results block** (`productSlot`)                                         | the `fallback`             |
| the filters panel — the category/kind chips, price bounds, stock toggle, clear button (`:243-362`) | the **results block** (`productSlot`)                                         | the `fallback`             |
| the search-status notice (`:366-390`) and the degraded notice (`:412-422`)                         | the **results block** (`productSlot`)                                         | the `fallback`             |
| the results grid (`:446-484`)                                                                      | the **results block** (`productSlot`), rendered by the theme's `product_grid` | the `fallback`             |
| the result count and the sort control (`:368-378`, `:391-409`)                                     | the granted **`result_toolbar`** widget                                       | the `fallback`             |
| the active filter chips                                                                            | the granted **`filter_chips`** widget                                         | the `fallback`             |
| the pager (`:486-527`)                                                                             | the granted **`pagination`** widget                                           | the `fallback`             |
| the empty state (`:424-444`)                                                                       | the granted **`empty_state`** widget                                          | the `fallback`             |
| the page `<h1>` (`:531-534`)                                                                       | the granted **`category_header`** widget                                      | the `fallback`             |

**The query box and the platform's category/kind chips stay inside the results block.** They are search _execution_ and _authorization_, not presentation: the platform runs the query, scopes it to the tenant and applies the filters (`:42-105`), and there is **no main-zone search-form widget** in the catalogue, so a theme cannot author one. Once the theme publishes a search body the route's `fallback` is **not rendered at all** (`src/components/store/ThemeChrome.tsx:400-421`) — so a results block without them would take the shopper's search input off the page.

The granted set is exactly `result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header`. **`facet_sidebar` is not granted**: its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`) and no storefront route mounts a `WidgetDataProvider` (Decision **D7**), so granting it would render an empty facet panel. It is **preview-only**.

The loader, the head, the canonical policy, the rate-limit handling, the `apply()` helper and the tenant scoping are **not** changed: the platform keeps executing and authorizing the search; only the presentation channel changes.

### (b.5) The archive surface — **no key edits**

**D1 (Option A): no `archive` template key is added.** The contract is stated instead:

> _"The archive surface is the blog taxonomy surface (index / category / tag / author); it wears the `blog` template and the existing blog pack; `?template=archive` is unsupported and must produce the explicit unsupported state, not a homepage redirect."_

The eleven files measured above are the **blast radius the ruling avoided**:

- `src/lib/builder-ast.ts` — `TEMPLATE_KEYS` (`:46-59`), `TEMPLATE_ZONES` (`:156`), `ROUTE_H1_TEMPLATES` (`:68-75`), the 41 `templates:` allowlists, the `required` table (`:8438-8462`), `parseTemplates` (`:8117`);
- `src/lib/storefront.functions.ts:97-107` — the hand-written `z.enum`;
- `src/lib/theme-package.ts` — `TEMPLATE_SET` (`:172`), `THEME_API_RANGE` (`:52`);
- `src/lib/theme-preview-nav.ts` — `GENERIC_TITLES` (`:340`), the preview URL map (`:82-99`);
- `src/lib/widget-weight.ts:205` — `TEMPLATE_JS_BUDGET`;
- `src/components/builder/BuilderTopBar.tsx:6` — `TEMPLATE_META`;
- `src/routes/_authenticated/dashboard/builder.tsx:205` — `TEMPLATE_LABEL`;
- `src/lib/builder-seo.ts:317` — `TEMPLATE_FALLBACK`.

**None of them is edited by this plan.**

---

## (c) The rationale, per surface

**The preview host.** _"The preview is the merchant's first impression and the parity source; the six surfaces it shows are the six surfaces the expert says are generic, and the preview frame is the only host that can supply their data. Without this change the preview keeps showing the studio's `DEMO_CART` and `CheckoutMock`."_

**The pins.** _"The old expectations are the bug — they pin bodies that carry demo copy and no functional slot; the replacements are strictly stronger: they pin the exact ordered composition including the functional data slots."_

**The search route.** _"The theme cannot place the platform's search pieces individually because the route hands over one opaque block and the per-widget widgets are context widgets that render only where the host grants permission. The platform keeps executing and authorizing the search; only the presentation channel changes. The query box and the platform's category/kind chips stay inside the results block because they are search execution, not presentation."_

**The archive.** _"No new key is added (D1): the blog taxonomy surface already wears the `blog` template, and a key added to the editor but not to the parser, the `z.enum` and the preview nav would appear in the builder and vanish from every page — the audit's own warning. What is left is the explicit unsupported state."_

---

## (d) The parity impact

**The six template stills per changed template go stale:** `search` (6), `cart` (6), `blog` (6), `checkout` (6) — **24 of the 60** `reference/` captures under `docs/superpowers/songoskriti-evidence/port/reference/` and the matching 24 machine baselines under `.e2e/songoskriti-port-parity.spec.ts-snapshots/`. The other **36** are unaffected, because only those four templates' bodies change.

Re-freezing rewrites **all 60** manifest entries (`reference-manifest.json`) and is a **separate owner-approved step**, not part of this plan's commits.

The parity suite is owner-run only — it is in neither `e2e:critical` nor `e2e:security` (`package.json`) — so stale baselines do not break CI.

---

## (e) The boundary statement

**This record escalates exactly four existing files — `src/components/store/ThemePreviewFrame.tsx`, `src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts` and `src/routes/store.$slug.search.tsx` — which are the whole of the §7 relaxation granted by Decision D4. The base commit for every "nothing else changed" proof in this plan is `a48253c8`. No file under `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/lib/theme-presentations.ts`, `src/lib/unified-widget-registry.ts`, `src/lib/editor/**` or any other route is edited by this plan.**

The two existing test files are prohibited by port spec §7 (_"existing test files and their snapshots (`.snap`) under `src/`"_) and are escalated here. `src/components/store/ThemePreviewFrame.tsx` and `src/routes/store.$slug.search.tsx` are prohibited by §7 (_"everything else under `src/`") and are escalated here by Decision D4.

**Not escalated, and not touched by this plan:** `src/components/store/BlogArchiveTheme.test.tsx` and `src/components/store/ThemePreviewFrame.test.tsx`. No change is recorded to either.

---

## (f) Verification of the cited `file:line` references

Every reference in this record was grepped out of the tree and resolves:

| citation                                              | resolves to                                               |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `if (entry.templates)`                                | `src/components/builder/SectionRenderer.tsx:814`          |
| `slot = contextSlots?.[section.type];`                | `src/components/builder/SectionRenderer.tsx:825`          |
| `export const CollectionQueryProvider`                | `src/components/builder/collection.tsx:55`                |
| `export const DEMO_CART`                              | `src/components/builder/CartContext.tsx:75`               |
| `"Sample product"` / `"Second product"`               | `src/components/builder/CartContext.tsx:95` / `:104`      |
| `export function BlogFeedProvider`                    | `src/components/builder/blog.tsx:32`                      |
| `const SongoskritiProductGrid`                        | `src/components/builder/songoskriti.tsx:897`              |
| `export function CheckoutMock`                        | `src/components/store/CheckoutMock.tsx:4`                 |
| `export function demoCatalogFor`                      | `src/lib/demo-catalog.ts:3216`                            |
| `export function previewDemoMap`                      | `src/lib/preview-demo-data.ts:47`                         |
| `DEMO_ORDERS` / `DEMO_PROFILE` / `"Demo Shopper"`     | `src/lib/preview-demo-data.ts:21` / `:40` / `:42`         |
| `CheckoutMock` import / render                        | `src/components/store/ThemePreviewFrame.tsx:36` / `:670`  |
| `SAMPLE` blog rows                                    | `src/components/builder/blog.tsx:51-62`                   |
| `productSlot` in `widgets.tsx`                        | `src/components/builder/widgets.tsx:87`, `:1447`, `:1491` |
| `productSlot={listing}`                               | `src/routes/store.$slug.search.tsx:559`                   |
| `export const THEME_API_RANGE`                        | `src/lib/theme-package.ts:52`                             |
| `export function lintTemplate`                        | `src/lib/builder-ast.ts:8380`                             |
| `export function primarySectionId`                    | `src/lib/builder-ast.ts:88`                               |
| `export function routeSuppliesH1`                     | `src/lib/builder-ast.ts:77`                               |
| `export function catalogEntry`                        | `src/lib/builder-ast.ts:7048`                             |
| `export function isContextMismatch`                   | `src/lib/builder-ast.ts:7935`                             |
| `export function groupFacetRows`                      | `src/components/builder/collection.tsx:94`                |
| `export function mapOrdersToRows` / `mapProfileToRow` | `src/components/store/account-slots.tsx:31` / `:42`       |
| `export const AccountSlots` / `accountSlotCtx`        | `src/components/store/account-slots.tsx:54`               |
| `export const OrdersList` / `ProfileCard`             | `src/components/builder/account.tsx:70` / `:141`          |
| `export function genericDemoMain`                     | `src/lib/theme-preview-nav.ts:357`                        |
