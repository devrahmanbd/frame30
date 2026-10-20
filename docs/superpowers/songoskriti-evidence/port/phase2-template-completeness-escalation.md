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
`src/routes/store.$slug.search.tsx:186-529` builds the whole listing — query box, filters, chips, sort, summary, results, pager, empty state — and hands it to the theme as **one** `productSlot` (`:559`). The theme's `product_grid` presentation is the only consumer of `productSlot` (`src/components/builder/widgets.tsx:87`, `:1447`, `:1491`), and Songoskriti's own `product_grid` ignores it (`src/components/builder/songoskriti.tsx:897-898` at the base commit `a48253c8`; the definition now sits at `:906-907`, where Task 2 gave the grid the host slot on the `search` template — the change this finding asked for). Meanwhile the six Phase-2.4 search widgets are **context widgets** (`templates:` allowlists at `src/lib/builder-ast.ts:2691`, `:2717`, `:2757`, `:2771`, `:2793`, `:2824`), so they render only where the host grants permission (`src/components/builder/SectionRenderer.tsx:814-833`) — and **no** storefront host grants permission for any of them today. The only `contextSlots` writers in the tree are:

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
| hand-written `z.enum([...])` duplicating `TEMPLATE_KEYS` | `src/lib/storefront.functions.ts:98-108` — the nine keys, a **compiler-invisible** duplicate |
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
+// Phase 2 — the theme-owned demo data (Task 2 / Task 4 / Task 5). Used
+// ONLY for the Songoskriti blueprint; every other blueprint keeps today's
+// behaviour byte-for-byte. The data is SYNTHETIC and labelled as such.
+import {
+  SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
+  songoskritiPreviewCart,
+  songoskritiPreviewFacets,
+  songoskritiPreviewOrders,
+  songoskritiPreviewProfile,
+} from "@/lib/themes/songoskriti/preview-demo-data";
+import { SONOSKRITI_PREVIEW_PAGE } from "@/lib/themes/songoskriti/preview-page";
 import { OrdersList, ProfileCard } from "@/components/builder/account";
```

```diff
@@ -567,12 +575,14 @@

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
+  // The flag is CONSUMED at the render site — the hunk below — so the
+  // "not supported by this theme" panel is a state the preview can reach.
+  const unsupported = !templates[template];
+  const ast = unsupported ? templates.index : templates[template];
```

**The panel the flag renders — added 2026-10-20 (correction round 1).** The flag above is not left unused: it is **consumed** at the render site, inside the preview canvas (`ThemeSurface`, `:642`). The hunk below is that consumption point. Task 10 writes the exact JSX; the comment carries the contract, so no body is quoted here that no code will have.

```diff
@@ -642,6 +662,24 @@
           <ThemeSurface tokens={tokens} skinCss={skinCss}>
+            {/*
+              The `unsupported` flag (the hunk above) is CONSUMED here. Task
+              10 writes the exact hunk; this line is the contract, not the
+              diff: when `unsupported` is true the canvas renders the named
+              "not supported by this theme" PANEL and the homepage body
+              (`templates.index`) is NOT rendered; when it is false the canvas
+              renders exactly as it does today. The panel's copy is fixed by
+              this record — it reads "This template is not supported by this
+              theme", it NAMES the template key (`?template=archive` → the
+              panel names `archive`), it LINKS BACK to the home tab, and it
+              carries NO demo copy — it is a statement about the theme's
+              coverage, not a demo. The canvas body becomes the `: (` branch
+              and the closing `)}` lands at the end of the `ThemeSurface`
+              content.
+            */}
+            {unsupported ? (
+              // … the panel — Task 10 writes the exact JSX …
+            ) : (
```

**The checkout branch — corrected 2026-10-20 (correction round 1).** The hunk previously quoted in this section replaced `<CheckoutMock …/>` with `<MinimalCheckoutHeader slug name themeKey />` — a bare header lockup — while the scope line above requires the **authored** `ast.main` rendered through `SectionRenderer`. An implementer following the old hunk verbatim would have shipped a header where the authored checkout body belongs, which is the divergence the plan's Review Focus forbids. The hunk below is the corrected one: `CheckoutMock` goes, the `MinimalCheckoutHeader` **chrome** stays, and the authored body is what renders.

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
+              // Task 7 writes the exact hunk; the lines below are the
+              // contract, not the diff:
+              //   · the AUTHORED `ast.main` — the same `ast` the rest of the
+              //     preview renders (`:486`) — is rendered through
+              //     `SectionRenderer`, one renderer per authored section, with
+              //     `template="checkout"`, `editing={false}`,
+              //     `storeSlug={blueprintKey}`, `themeKey={blueprintKey}` and
+              //     `contextSlots` carrying the FIVE granted cart slots;
+              //   · `MinimalCheckoutHeader` is the CHROME (it is already
+              //     imported, `:40`) — it is the header lockup, never the
+              //     body;
+              //   · `CheckoutMock` is gone.
+              //
+              // A checkout tab that renders the header and nothing else is
+              // NOT this change: the authored body must be on the page.
+              <MinimalCheckoutHeader
+                slug={blueprintKey}
+                name={themeName}
+                themeKey={blueprintKey}
+              />
             ) : (
```

**The three provider wrappers — added 2026-10-20 (correction round 1).** The record's scope line names them and the plan's Task 7.4 carries them, but no hunk did: the `CartProvider` wrap, the `BlogFeedProvider` wrap and the `CollectionQueryProvider` mount are now recorded below, as three contract hunks. Task 7 writes the exact JSX.

```diff
@@ -630,6 +650,16 @@
       <div
         className="flex-1 overflow-auto bg-background"
         onClickCapture={(event) =>
           handlePreviewCanvasClick(event, switchTo, (message) =>
             toast.info(message),
           )
         }
         onSubmitCapture={(event) =>
           handlePreviewCanvasSubmit(event, (message) => toast.info(message))
         }
       >
+        {/*
+          Task 7 writes the exact hunk; this line is the contract, not the
+          diff. The `CartProvider` wrap goes around the WHOLE preview canvas
+          — BOTH branches, the authored checkout body and the ordinary canvas
+          — so the cart widgets read one cart context. The value is the
+          theme's synthetic cart, `songoskritiPreviewCart()`
+          (`src/lib/themes/songoskriti/preview-demo-data.ts:154`); the
+          authored checkout widgets need the CART CONTEXT, not widget data —
+          none of `cart_lines`, `cart_summary`, `cart_drawer`,
+          `checkout_steps` or `payment_methods` declares a `data` block
+          (`src/lib/widget-registry.ts:549-553`), so they read the context
+          (`src/components/builder/cart.tsx:75`, `:442`). Every other
+          blueprint keeps the studio's `DEMO_CART` fallback
+          (`src/components/builder/CartContext.tsx:126`) — the wrap is scoped
+          to the Songoskriti blueprint, so no other blueprint's behaviour
+          changes.
+        */}
```

```diff
@@ -641,6 +675,16 @@
         <div className="mx-auto" style={{ maxWidth: "100%" }}>
+          {/*
+            Task 7 writes the exact hunk; this line is the contract, not the
+            diff. The `BlogFeedProvider` wrap carries the Songoskriti demo
+            feed — five Songoskriti-flavoured articles (titles, excerpts,
+            categories) whose `basePath` points at the preview's blog tab —
+            for the Songoskriti blueprint only; every other blueprint keeps
+            the pack's own `SAMPLE` rows (`src/components/builder/blog.tsx:51`).
+            The feed's type is `BlogFeed` (`src/components/builder/blog.tsx:22`).
+            The plan's Task 7.4 names the export `songoskritiPreviewFeed()`;
+            **no module exports it yet** — `preview-demo-data.ts` exports
+            `songoskritiPreviewFacets`, `songoskritiPreviewCart`,
+            `songoskritiPreviewOrders`, `songoskritiPreviewProfile` and
+            `SONGOSKRITI_PREVIEW_SEARCH_TOTAL` and no feed among them — so
+            Task 7 writes that export as well as the wrap.
+          */}
```

```diff
@@ -641,6 +691,16 @@
         <div className="mx-auto" style={{ maxWidth: "100%" }}>
+          {/*
+            Task 7 writes the exact hunk; this line is the contract, not the
+            diff. The `CollectionQueryProvider` mount carries the demo query,
+            so the theme's facet, sort and pager widgets compute REAL links
+            in the preview. The value is the plan's Task 7.4 value —
+            `{{ params: normalizeSearchParams({ q: "jamdani" }), total:
+            SONGOSKRITI_PREVIEW_SEARCH_TOTAL, basePath:
+            "/store/songoskriti/search", navigate: undefined }}` — the demo
+            total is the explicit, labelled 38
+            (`src/lib/themes/songoskriti/preview-demo-data.ts:270`), not the
+            demo catalogue's own 13 products, because the pager renders only
+            above one page (`src/components/builder/collection.tsx:537-541`).
+            `normalizeSearchParams` is imported from `@/lib/storefront-search`
+            (`src/lib/storefront-search.ts:121`).
+          */}
```

> The checkout branch, the `CartProvider` / `BlogFeedProvider` / `CollectionQueryProvider` wrappers and the "not supported by this theme" panel are recorded here as the **shape** the host change takes; the exact hunks are written by Task 7 and Task 10, which cite this section before they edit the file. Where a hunk above is marked _"this line is the contract, not the diff"_, the implementer writes the code — the contract is what the code must satisfy, and quoting a body here that Task 7 will not write would be a second contradiction of the kind this record is corrected for (see §(h)). Nothing in this record authorises an edit to any file other than the four named in §(e).

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

**The search-route hunks — added 2026-10-20 (correction round 1).** §(b.4) carried the finding, the per-piece ownership table and the prose, but **no diff**, although the brief requires "the search-route hunk, quoted in full". The four hunks Task 9.3 writes are recorded below, in the order it writes them: the listing split into named pieces, the `CollectionQueryProvider` mount, the `contextSlots` permission map, and the `productSlot`/`fallback` split.

**Reading the split hunk.** A line reading `… the existing X (:a-b), moved verbatim …` is a **marker, not code**: it stands for the unchanged lines of the current file, which this record does not repeat. Every line the diff moves is byte-identical to the line it comes from, and every `t()` call travels with its markup. The lines that are _not_ markers — the constant names, the guards, the two composites — are the shape Task 9.3 writes.

```diff
@@ -184,8 +184,86 @@
   // The whole listing — query box, facets, results, pager — is one block so a
   // theme's search template can place and style it wherever it likes.
-  const listing = (
-    <>
+  // Phase 2 (Task 9.3) — the block is split into NAMED PIECES, so that every
+  // piece has exactly ONE owner: the results block the theme places, or the
+  // platform's own widget. Every piece keeps its existing markup and its
+  // existing `t()` calls — the split MOVES markup into named constants; it
+  // does not redesign the platform's UI.
+  //
+  //   queryBox        ← :188-241   the search form
+  //   filtersPanel    ← :243-362   category/kind chips, price bounds, the
+  //                                 stock toggle, the clear button
+  //   resultCount     ← :368-378   the count branch of the summary
+  //   searchNotice    ← :366-367, :373-386   the other branches of it
+  //   summaryAndSort  ← :388-409   the sort control
+  //   degradedNotice  ← :412-422
+  //   emptyState      ← :424-444
+  //   results         ← :446-484
+  //   pager           ← :486-527
+  const queryBox = (
+    <form
+      … the existing form body (:189-240), moved verbatim …
+    </form>
+  );
+  const filtersPanel = showFilters && facets ? (
+    … the existing filters panel (:244-361), moved verbatim …
+  ) : null;
+  const resultCount = (
+    … the existing count branch and its `<p>` wrapper (:365, :369-372, :387),
+      moved verbatim …
+  );
+  const searchNotice = (
+    … the existing notice branches and their `<p>` wrapper (:365-367,
+      :373-387), moved verbatim …
+  );
+  const summaryAndSort = (
+    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
+      … the summary `<div>` and the sort control (:364, :388-409), moved
+        verbatim …
+    </div>
+  );
+  const degradedNotice = (
+    … the existing degraded notice (:416-421), moved verbatim …
+  );
+  const emptyState = (
+    … the existing empty state (:425-443), moved verbatim …
+  );
+  const results = (
+    … the existing results grid (:447-483), moved verbatim …
+  );
+  const pager = (
+    … the existing pager (:487-526), moved verbatim …
+  );
+  // The whole listing — the `fallback`'s content: every piece, in today's
+  // order, so a store with NO published search template still gets today's
+  // page.
+  const listing = (
+    <>
+      {queryBox}
+      {filtersPanel}
+      {summaryAndSort}
+      {degradedNotice}
+      {emptyState}
+      {results}
+      {pager}
+    </>
+  );
+  // The results block — what the theme's `product_grid` receives as
+  // `productSlot`. It carries the query box and the platform's category/kind
+  // chips (search EXECUTION and AUTHORIZATION, not presentation), the
+  // search-status notice, the degraded notice and the results grid.
+  const resultsBlock = (
+    <>
+      {queryBox}
+      {filtersPanel}
+      {searchNotice}
+      {degradedNotice}
+      {results}
+    </>
+  );
```

**The two branches of the summary's ternary.** The summary (`:364-410`) is one `<p>` (`:365-387`) whose content is a five-way ternary: _pending_ (`:366-367`), _ok_ (`:368-372`, the count), _rate-limited_ (`:373-377`), _not published_ (`:378-382`) and _unavailable_ (`:383-386`). Task 9.3 splits it into **`resultCount`** (the _ok_ branch — the count) and **`searchNotice`** (the other four), and each keeps the original `<p aria-live="polite" className="text-sm text-muted-foreground">` wrapper and its classes, so the page's structure is unchanged. Three rules make the split exact:

- **exactly one** of the two renders at a time — the _ok_ branch is the count, and the notice renders in every other case (including _pending_, which wins over _ok_ in the original ternary);
- the notice must render **nothing** in the _ok_ case, because on a themed page the count comes from the granted `result_toolbar` widget — otherwise the page would show the count _and_ the "search is unavailable" line at once;
- the `<p>` that sits between the summary `<div>` (`:364`) and the sort control (`:388-409`) is now the pair `{resultCount}{searchNotice}`; the `<div>` and the sort control are moved verbatim.

The guards travel with their pieces: `filtersPanel` keeps `showFilters && facets`, `degradedNotice` keeps `result?.degraded`, `emptyState` keeps `result && result.items.length === 0 && !query.isPending`, `results` keeps `result && result.items.length > 0`, `pager` keeps `pages > 1`.

```diff
@@ -536,6 +536,20 @@

   return (
     <PluginLayer plugins={chrome?.installedPlugins ?? []}>
+      {/*
+        Phase 2 (Task 9.3) — the theme's facet, sort and pager widgets compute
+        REAL links, so the provider carries the LIVE query: the live params,
+        the live total, the store's search path and the route's own `apply()`.
+      */}
+      <CollectionQueryProvider
+        value={{
+          params,
+          total: result?.total ?? 0,
+          basePath: `/store/${slug}/search`,
+          navigate: (next) => apply(next),
+        }}
+      >
       <ThemeChrome
         template="search"
         storeSlug={slug}
```

```diff
@@ -564,6 +584,7 @@
           </>
         }
       />
+      </CollectionQueryProvider>
     </PluginLayer>
   );
 }
```

> The `ThemeChrome` block is re-indented one level by the provider; no line inside it changes.

```diff
@@ -546,6 +567,22 @@
         siteKit={chrome?.siteKit ?? null}
         chrome={
           <>
             <StoreHeader
               slug={slug}
               name={chrome?.merchant.name ?? slug}
               menus={chrome?.menus}
               themeKey={chrome?.themeKey ?? null}
             />
             {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
             {/* <SupportWidget slug={slug} /> */}
           </>
         }
+        // The storefront grants five of the platform's search widgets;
+        // `facet_sidebar` stays preview-only because its rows come from the
+        // widget-data pipeline (D7). A themed storefront search page therefore
+        // has NO independent facet sidebar — the platform's own category/kind
+        // chips remain visible inside the results block, which is where the
+        // shopper filters the search.
+        contextSlots={{
+          result_toolbar: null,
+          filter_chips: null,
+          pagination: null,
+          // The `empty_state` widget renders its panel unconditionally
+          // (`src/components/builder/collection.tsx:707-753`), so the GRANT
+          // is what decides whether the theme's empty copy appears — it is
+          // granted only when the platform's own empty state would have
+          // shown (:424).
+          ...(result && result.items.length === 0 && !query.isPending
+            ? { empty_state: null }
+            : {}),
+          category_header: null,
+        }}
```

> `null` is the platform's "granted" token and an absent / `undefined` entry is "not granted" — the gate is `slot = contextSlots?.[section.type]; if (slot === undefined) { … }` (`src/components/builder/SectionRenderer.tsx:825-833`), so the conditional `empty_state` grant is exactly the difference between "the theme's empty copy appears" and "it does not". `facet_sidebar` is **not** in the map; all six Phase-2.4 search names — the five granted ones and the ungranted `facet_sidebar` — are `SectionType` values (`src/lib/builder-ast.ts:275-280`).

```diff
@@ -558,8 +596,8 @@
         }
-        productSlot={listing}
+        productSlot={resultsBlock}
         fallback={
           <>
             {heading}
             {listing}
           </>
         }
       />
```

> The `fallback` is **unchanged**: it keeps `{heading}` + `{listing}`, and `listing` is now the whole listing assembled from the named pieces above — so a store with no published search template still gets today's page, content for content. On a themed page the `fallback` is not rendered at all (`src/components/store/ThemeChrome.tsx:400-421`).

**The import the route gains.** One import, for the provider:

```diff
@@ -22,5 +22,6 @@
 import { ThemeChrome } from "@/components/store/ThemeChrome";
 import { PluginLayer } from "@/components/store/PluginLayer";
 import { SupportWidget } from "@/components/store/SupportWidget";
+import { CollectionQueryProvider } from "@/components/builder/collection";
 import {
   PAGE_SIZE,
```

**What the route does not gain.** No import of `normalizeSearchParams` — the route already has it (`src/lib/storefront-search.ts:121`, imported at `src/routes/store.$slug.search.tsx:29`) — and no change to the loader, the head, the canonical policy, the rate-limit handling, the `apply()` helper or the tenant scoping: the platform keeps executing and authorizing the search; only the presentation channel changes.

### (b.5) The archive surface — **no key edits**

**D1 (Option A): no `archive` template key is added.** The contract is stated instead:

> _"The archive surface is the blog taxonomy surface (index / category / tag / author); it wears the `blog` template and the existing blog pack; `?template=archive` is unsupported and must produce the explicit unsupported state, not a homepage redirect."_

The eleven files measured above are the **blast radius the ruling avoided**:

- `src/lib/builder-ast.ts` — `TEMPLATE_KEYS` (`:46-59`), `TEMPLATE_ZONES` (`:156`), `ROUTE_H1_TEMPLATES` (`:68-75`), the 41 `templates:` allowlists, the `required` table (`:8438-8462`), `parseTemplates` (`:8117`);
- `src/lib/storefront.functions.ts:98-108` — the hand-written `z.enum`;
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

Every reference in this record was grepped out of the tree and resolves. The table was **re-verified on 2026-10-20 against the tree at `ce0f65df`** (correction round 1): every row below was read at the line quoted, and the three rows that were wrong — two that moved when Task 2 landed, one that named a symbol that does not exist — are corrected — see §(h).

| citation                                              | resolves to                                               |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `if (entry.templates)`                                | `src/components/builder/SectionRenderer.tsx:814`          |
| `slot = contextSlots?.[section.type];`                | `src/components/builder/SectionRenderer.tsx:825`          |
| `export const CollectionQueryProvider`                | `src/components/builder/collection.tsx:55`                |
| `export const DEMO_CART`                              | `src/components/builder/CartContext.tsx:75`               |
| `"Sample product"` / `"Second product"`               | `src/components/builder/CartContext.tsx:95` / `:104`      |
| `export function BlogFeedProvider`                    | `src/components/builder/blog.tsx:32`                      |
| `const SongoskritiProductGrid`                        | `src/components/builder/songoskriti.tsx:906`              |
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
| `export function accountSlotCtx`                      | `src/components/store/account-slots.tsx:54`               |
| `export const OrdersList` / `ProfileCard`             | `src/components/builder/account.tsx:70` / `:141`          |
| `export function genericDemoMain`                     | `src/lib/theme-preview-nav.ts:357`                        |

**Added 2026-10-20 (correction round 1)** — the references the new hunks carry:

| citation                                                  | resolves to                                           |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `export const CartProvider`                               | `src/components/builder/CartContext.tsx:128`          |
| `export function BlogFeedProvider` (feed type `BlogFeed`) | `src/components/builder/blog.tsx:32` / `:22`          |
| `export function MinimalCheckoutHeader`                   | `src/components/store/StoreHeader.tsx:41`             |
| `export function songoskritiPreviewCart`                  | `src/lib/themes/songoskriti/preview-demo-data.ts:154` |
| `export const SONGOSKRITI_PREVIEW_SEARCH_TOTAL`           | `src/lib/themes/songoskriti/preview-demo-data.ts:270` |
| `export function normalizeSearchParams`                   | `src/lib/storefront-search.ts:121`                    |
| `export const PAGE_SIZE`                                  | `src/lib/storefront-search.ts:29`                     |
| `const Pagination` / `const EmptyState`                   | `src/components/builder/collection.tsx:537` / `:707`  |
| `slot = contextSlots?.[section.type];` (the gate)         | `src/components/builder/SectionRenderer.tsx:825-833`  |
| `contextSlots` prop / `productSlot` prop on `ThemeChrome` | `src/components/store/ThemeChrome.tsx:49` / `:412`    |
| the six Phase-2.4 search names as `SectionType`           | `src/lib/builder-ast.ts:275-280`                      |

---

## (g) A third stale composition pin — `src/lib/themes/songoskriti/skins.test.ts` _(appended by Task 2)_

**This section is appended, not a rewrite: sections (a)–(f) stand as written in Task 1.**

**The finding.** §(b) named two files that pin the theme's template compositions. **There is a third**, and it was found by measurement, not by reading: Task 2's neighbourhood run (`node_modules/.bin/vitest run … src/lib/themes/songoskriti/skins.test.ts …`) fails with

```
FAIL  src/lib/themes/songoskriti/skins.test.ts > factory output carries theme defaults > preview rails on non-homepage templates carry the default too
AssertionError: search: expected 0 to be greater than 0
 ❯ src/lib/themes/songoskriti/skins.test.ts:162:38
```

**Why it fails.** The case at `src/lib/themes/songoskriti/skins.test.ts:146-165` asserts that every non-homepage template in the list `["collection", "product", "search", "cart"]` authors **at least one** `product_rail` and that each of those rails carries the theme's default skin `editorial`. The new `search` body (`src/lib/themes/songoskriti/preview.ts`, the `case "search":` branch) is the platform's six search widgets plus the results grid — **no merchandising rail** — and the new `cart` body is the two platform commerce widgets — **no merchandising rail** either (a "you may also like" rail is the generic demo shape the distinctness gate rejects). The assertion therefore pins the very demo rail this plan removes: **it is stale for the same reason the two §(b) pins are.**

**The file was NOT edited by this plan.** It is an existing test file, and at the time of writing the owner's Decision **D4** relaxation was _exactly four_ files (§(e)). **The owner has since ruled (2026-10-20): widen D4 to five files and move this pin**, i.e. both (1) the fifth file is approved for this diff and (2) the expert's composition stands — the merchandising rail does **not** come back to keep the pin true. The diff below is therefore approved and Task 3 applies it. The §7 ambiguity the ruling resolves: §7 lists `src/lib/themes/songoskriti/**` as editable and "existing test files … under `src/`" as prohibited, and this file is in both; the owner read the Editable clause as governing a file inside the theme's own directory, and the file's subject (the theme's own preview compositions) is theme-owned.

**The exact old → new diff**, recorded here before any update, per §9:

```diff
@@ -151,14 +151,23 @@
       type,
       props: { ...props },
     });
+    // The search and cart templates author NO merchandising rail: the
+    // search body is the platform's own search widgets, and the cart body
+    // is the platform's two commerce widgets — a "you may also like" rail
+    // is the generic demo shape the distinctness gate rejects. The
+    // templates that DO author a rail must carry the theme's default skin.
     for (const template of [
       "collection",
       "product",
-      "search",
-      "cart",
     ] as const) {
       const main = source.main(template, s)!;
       const rails = main.filter((x) => x.type === "product_rail");
       expect(rails.length, template).toBeGreaterThan(0);
       for (const rail of rails) expect(rail.props.skin).toBe("editorial");
     }
+    // …and the two commerce templates must author NO rail at all.
+    for (const template of ["search", "cart"] as const) {
+      const main = source.main(template, s)!;
+      expect(
+        main.filter((x) => x.type === "product_rail").length,
+        template,
+      ).toBe(0);
+    }
   });
```

**The replacement is strictly stronger, not weaker.** The assertion's _subject_ — "every rail the theme authors carries the theme's default skin" — is untouched and still total over the templates that author rails. What changes is the **list of templates that author one**, and the removal is then **pinned positively**: the two commerce templates must author **no** rail at all. No assertion is deleted, skipped or weakened; the case count is unchanged (20 tests in the file, before and after).

**Scope.** One file, one `it` block, one added `for` loop. Nothing else in `src/lib/themes/songoskriti/skins.test.ts` changes — the skin-vocabulary cases, the CSS cases and the reduced-motion case are untouched.

---

## (h) Corrections — 2026-10-20 (correction round 1)

**Appended, not a rewrite.** Sections (a)–(g) stand as written; this section records what was corrected in place, why, and what was added. The record's own rule is that **the recorded diff wins** — a later task implements the record's hunks verbatim — so a hunk that contradicts the record's own scope line, or omits what the batch's briefs require, is a defect in the approval artifact and is corrected here rather than left for a later implementer to discover.

**1. The checkout hunk (§(b.1)) contradicted the scope line — corrected in place.** The quoted hunk replaced `<CheckoutMock …/>` with `<MinimalCheckoutHeader slug name themeKey />` — a bare header lockup — while the same section's scope line requires the **authored** `ast.main` rendered through `SectionRenderer` (the plan's Task 7.4, item 7). An implementer following the old hunk verbatim would have shipped a header where the authored checkout body belongs — the divergence the plan's Review Focus forbids, and a second checkout rather than the authored one. The hunk now states the contract: `CheckoutMock` goes, the `MinimalCheckoutHeader` **chrome** stays (it is already imported, `src/components/store/ThemePreviewFrame.tsx:40`), and the authored body renders through `SectionRenderer` with the five granted cart slots. **The exact JSX is Task 7's to write** — the hunk says so inside itself rather than quoting a body no code will have, and the corrected hunk states outright that a checkout tab rendering the header and nothing else is not this change.

**2. The three provider-wrapper hunks were missing from §(b.1) — added.** The `CartProvider` wrap, the `BlogFeedProvider` wrap and the `CollectionQueryProvider` mount are in the record's scope line and in the plan's Task 7.4, but no hunk carried them; an implementer reading §(b.1) alone had no diff for any of the three. They are now recorded as three contract hunks, each naming the value it carries, the scope it applies to (the Songoskriti blueprint only — every other blueprint keeps today's behaviour), and the citation that fixes it. Two facts are recorded with them: the authored checkout widgets need the **cart context**, not widget data (none of `cart_lines`, `cart_summary`, `cart_drawer`, `checkout_steps` or `payment_methods` declares a `data` block — `src/lib/widget-registry.ts:549-553` — so they read the context), and the plan's `songoskritiPreviewFeed()` **does not exist yet**, so Task 7 writes that export as well as the wrap.

**3. The unsupported-template panel was missing from the diff — added.** The hunk introduced `const unsupported = !templates[template];` and nothing consumed it: the diff still rendered `templates.index`, so the "not supported by this theme" panel that the scope line and the plan's Task 10.3 require appeared **nowhere in the diff**. The panel's render hunk is now recorded — the flag is **consumed** at the render site — with the panel's copy fixed by this record ("This template is not supported by this theme"), its naming of the template key, its link back to the home tab, and its no-demo-copy rule. The exact JSX remains Task 10's to write.

**4. The search route (§(b.4)) had no diff hunk — added.** §(b.4) carried the finding, the per-piece ownership table and the prose, but **no diff**, although the brief requires "the search-route hunk, quoted in full". The four hunks Task 9.3 writes are now recorded: the listing split into named pieces, the `CollectionQueryProvider` mount, the `contextSlots` permission map and the `productSlot`/`fallback` split — plus the import the route gains and the extraction rule for the summary's two branches. A line reading `… the existing X (:a-b), moved verbatim …` is a **marker, not code**: it stands for the unchanged lines of the current file, which the record does not repeat, because the split moves markup without changing it.

**5. Three citations were wrong and are corrected in place.** Two had **drifted**: `src/components/builder/songoskriti.tsx:897` → `:906` (the `SongoskritiProductGrid` definition) and `src/lib/storefront.functions.ts:97-107` → `:98-108` (the hand-written `z.enum`) — both correct when the record was written (commit `631d28ad`), both moved when Task 2 landed. The third **named a symbol that does not exist**: §(f)'s row read "`export const AccountSlots` / `accountSlotCtx`" → `src/components/store/account-slots.tsx:54`, but that file exports no `AccountSlots` (no module in the tree does); the row now names the symbol the line actually holds, `export function accountSlotCtx`. The §(a)(iii) citation now names both the base-commit line and the current one, so the historical finding and the current tree are both readable. Every `file:line` this record quotes was re-read in the current tree on 2026-10-20; §(f)'s table carries the re-verification and the rows the new hunks added. Every **diff hunk** was re-checked against the file it names: each hunk's context lines appear, in order, in that file. The §(b.1) import hunk's context indentation was two spaces deeper than the source, and is corrected to match it (`src/components/store/ThemePreviewFrame.tsx:48-51`); the §(b.1) `cartSlots` hunk's old-side start is corrected to the line its context actually sits on (`:567`). The §(b.2) and §(b.3) hunks no longer match **by design** — they are diffs Task 6 has already applied to the tree.

**6. The fifth file is approved (owner's ruling, 2026-10-20).** `src/lib/themes/songoskriti/skins.test.ts` — the third stale composition pin recorded in §(g) — **is** added to this escalation: Decision D4 is widened to **five** files, and the expert's composition stands (the merchandising rail does not return). The diff in §(g) is applied by Task 3. See §(g)'s ruling note for the §7 reading the owner adopted.

---

## (i) A fourth stale pin — `src/components/store/songoskriti-preview-page.test.tsx` _(appended by Task 7)_

**This section is appended, not a rewrite: sections (a)–(h) stand as written.**

**The finding.** §(b) named two files that pin the theme's template compositions and §(g) a third. **There is a fourth**, and it was found by measurement, not by reading: Task 7's neighbourhood run fails with

```
FAIL  src/components/store/songoskriti-preview-page.test.tsx > songoskriti preview — the page template's body > renders a non-empty body for ?template=page
AssertionError: expected '<div role="dialog" aria-modal="true" …' to contain 'Demo page body.'
 ❯ src/components/store/songoskriti-preview-page.test.tsx:130:18
```

**Why it fails.** Task 7's preview-host change makes the preview render the **theme's own** labelled sample page on the Songoskriti blueprint's `?template=page` tab — `SONGOSKRITI_PREVIEW_PAGE` (`src/lib/themes/songoskriti/preview-page.ts`) — instead of the shared studio fixture `PREVIEW_DEMO_PAGE` (`src/lib/preview-page-data.ts:36`). That is the change the plan's Task 7.4 item 6 requires (_"for the Songoskriti blueprint, render `SONGOSKRITI_PREVIEW_PAGE` instead of `PREVIEW_DEMO_PAGE` in the existing `pageSlots` memo"_), and it is what Task 7's new suite asserts (_"the markup contains 'Sample page'"_). The Phase-1 suite's case at `:126-131` asserts the **shared fixture's** literal — "Demo page body." (`src/lib/preview-page-data.ts:40`) — so the assertion pins a body the preview no longer renders. **It is stale for the same reason the three pins above are stale**: the body the test names is not the body the host renders.

**The rest of the suite is unaffected and still passes.** The page tab still renders a non-empty `<article>` body, still exactly one `<h1>` (the route owns it), still none of the theme's retired demo copy, the production payload shape is unchanged (`PREVIEW_DEMO_PAGE` still exists, still with the same four keys), and the "Last updated" label is still localised in both locales.

**The file was NOT edited by this plan.** It is an existing test file, and the owner's Decision **D4** relaxation is _five_ files (§(e), §(h) item 6); `src/components/store/songoskriti-preview-page.test.tsx` is not one of them. Applying the diff below needs the owner's approval to widen D4 to a sixth file, or a dispatch that carries that approval — exactly as §(g) needed for the fifth.

**The exact old → new diff**, recorded here before any update, per §9:

```diff
@@ -126,8 +126,11 @@
   it("renders a non-empty body for ?template=page", () => {
     const html = renderPage();
     expect(html).toContain("<article");
     expect(html).toContain("</article>");
-    expect(html).toContain("Demo page body.");
+    // The Songoskriti blueprint renders the theme's OWN labelled sample
+    // page (`SONGOSKRITI_PREVIEW_PAGE`), not the shared studio fixture.
+    expect(html).toContain("Sample page — Songoskriti sizing and care");
   });
```

**The replacement is strictly stronger, not weaker.** The assertion's _subject_ — "the preview's page tab renders a real body" — is untouched; the expectation now names the theme's own page title instead of a generic sentence of the shared fixture, so the pin can no longer be satisfied by the studio's placeholder. No assertion is deleted, skipped or weakened; the case count is unchanged (7 tests in the file, before and after).

**Scope.** One file, one `it` block, one assertion. Nothing else in `src/components/store/songoskriti-preview-page.test.tsx` changes — the h1 case, the retired-copy case, the payload-shape case and the three localisation cases are untouched.

---

## (j) Batch-B review findings — five Important findings, their contracts, and two OPEN items _(appended 2026-10-21)_

**This section is appended, not a rewrite: sections (a)–(i) stand as written.**

A task review of Batch B (Task 3 + Task 7) raised **five Important findings** against the preview host and the theme's search composition, plus three smaller records. Every change this section authorises is written here **before** the code is edited, per §9: the record is the binding artifact, and the implementer implements the record's contract, not the review's prose.

**The five findings, one line each.**

| #   | finding                                                                                                                                                   | the change                                                                                 | where it lands                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | `empty_state` is granted unconditionally, so the preview's search tab shows "Nothing matches those filters" **underneath** a grid of 13 demo products     | the grant becomes **conditional**, mirroring the storefront's own contract                 | `src/components/store/ThemePreviewFrame.tsx`                   |
| 2   | the preview passes no `productSlot` for the search template, so the platform's query box and category/kind chips are absent from the preview's search tab | the preview hands the search template a **demo `productSlot`** with the storefront's shape | `src/components/store/ThemePreviewFrame.tsx`                   |
| 3   | the payment assertion is satisfied by the theme's `payment_icons` marks, not by the platform's payment rails                                              | the assertion is **retargeted**; the platform defect is recorded as an **OPEN item**       | the preview suite + this record + the evidence record          |
| 4   | the Phase-1 preview-page suite pins the shared fixture's literal and is **red**                                                                           | Decision **D4** is widened to **six** files; §(i)'s recorded diff is applied               | `src/components/store/songoskriti-preview-page.test.tsx`       |
| 5   | the theme's `facet_sidebar` pins `showCategories`/`showKinds` off, so the demo facet labels cannot appear                                                 | the theme authors the two switches; the theme's own prop-set pin moves with it             | `src/lib/themes/songoskriti/preview.ts` + the theme's own test |

### (j.1) The `empty_state` grant becomes conditional — the storefront's contract, mirrored

**The defect.** The preview granted `empty_state` unconditionally (`src/components/store/ThemePreviewFrame.tsx:636`), and the platform's `EmptyState` widget renders its panel **unconditionally** (`src/components/builder/collection.tsx:707-753` — there is no emptiness guard inside the widget). So the preview's search tab rendered the theme's "Nothing matches those filters / Try a shorter word… / Clear all filters" panel **underneath** a grid of 13 demo products.

**The contract, recorded before the edit.** The grant is **conditional**, and the condition is **the storefront's own condition**: the platform's `empty_state` widget renders its panel whenever it is granted, so **the grant is what decides whether the theme's empty copy appears** — and the storefront grants it **only when the platform's own empty state would have shown** (`src/routes/store.$slug.search.tsx:424-444`: the route's `emptyState` piece is guarded by `result && result.items.length === 0 && !query.isPending`, and the §(b.4) hunk mirrors that guard in the `contextSlots` map). **The preview mirrors it against its own demo result set**: the `empty_state` grant is present **iff the demo result set is empty**.

**Why a conditional grant and not a deletion.** The preview is not a search engine — its demo result set is the demo catalogue's rows and is never empty, so in practice the preview's grant is **absent** and the empty panel never renders under the results. The grant stays **conditional** (not deleted) so the preview carries the _storefront's_ contract rather than a special case of it: a demo query with no rows shows the theme's empty copy, exactly as the storefront does for a query with no hits.

**The shape (the implementer writes the code; the contract is the rule).** The `searchSlots` map keeps `result_toolbar`, `filter_chips`, `pagination`, `category_header` and `facet_sidebar` as unconditional `null` grants, and the `empty_state` entry becomes a **spread of a one-key object that is present only when the demo result set is empty**. `null` is the platform's "granted" token and an **absent** entry is "not granted" — the gate is `slot = contextSlots?.[section.type]; if (slot === undefined) …` (`src/components/builder/SectionRenderer.tsx:825-833`).

**The proof.** The preview suite asserts the theme's empty copy is **absent** from the search tab ("Nothing matches those filters" and "Clear all filters" do not appear) while the results, the count and the pager are present.

### (j.2) The preview hands the search template a demo `productSlot` — the storefront's shape

**The defect.** The preview passed **no** `productSlot`, so the theme's `product_grid` fell back to its own row grid (`src/components/builder/songoskriti.tsx:906-…`: `const host = template === "search" ? productSlot : undefined;` … `{host ?? (rows ? …)}`). The platform's **query box** and **category/kind chips** — which §(b.4) requires to stay reachable on a themed page, because the route's `fallback` is not rendered at all once the theme publishes a body (`src/components/store/ThemeChrome.tsx:400-421`) — never reached the preview. The preview therefore did not demonstrate the contract the storefront relies on.

**The contract, recorded before the edit.** On the `search` template the preview hands the theme **one** `productSlot` with **the storefront's shape** (`src/routes/store.$slug.search.tsx:559` → the §(b.4) `resultsBlock`):

1. **the query box** — a labelled `<input type="search">` inside a `<form>`, pre-filled with the demo query's term, plus a submit control. Search **execution**, not presentation: the platform owns it and no theme can author one (there is no main-zone search-form widget in the catalogue).
2. **the platform's category/kind chips** — one chip per demo category row and per demo kind row, each a **real link** built from the demo query (`facetHref`, `src/lib/facet-url.ts:150`), so the preview shows that the filters are links.
3. **the results grid** — the demo rows the preview already resolves for the grid node, rendered with the platform's own card (`ProductCard`, `src/components/builder/primitives/ProductCard.tsx:274`).

**The six Phase-2.4 widgets keep their grants.** `result_toolbar`, `filter_chips`, `pagination`, `category_header` and `facet_sidebar` stay granted exactly as they are; the `productSlot` carries only what the **storefront's** results block carries. The storefront's own slots are unchanged by this — the storefront's `productSlot` is the route's `resultsBlock` (`src/routes/store.$slug.search.tsx:559`), and this contract is the preview's mirror of it.

**Mutation safety is unchanged.** The slot's `<form>` lives inside the preview canvas, so the canvas's capture-phase `onSubmitCapture` intercepts the submit and toasts "Disabled in preview" (`src/lib/theme-preview-nav.ts:189-199`); the chip links are preview hrefs the canvas's click handler resolves to the preview's own search tab (`src/lib/theme-preview-nav.ts:71-83`, `:144-181`); the results grid renders the **platform's** card with **no store slug in context**, so it stays a plain anchor with no wishlist or quick-view hooks (`src/lib/store-slug-context.ts`, `src/components/builder/primitives/ProductCard.tsx:299`).

**The proof.** The preview suite asserts the **search input is present** in the search tab's markup (the `type="search"` control and its id), alongside the results, the count and the pager.

### (j.3) The payment assertion is retargeted; the platform's payment rails are recorded as an OPEN item

**The defect in the assertion.** `expect(html).toContain("Cash on delivery")` was satisfied by the theme's **`payment_icons` marks** — the theme's `payment_icons` section carries `marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery"` (`src/lib/themes/songoskriti/preview.ts:351-355`) and the theme's own presentation renders each mark as a badge (`SongoskritiPaymentIcons`, `src/components/builder/songoskriti.tsx:1287-1310`; the text chip for a mark with no artwork, `src/components/store/PaymentMarks.tsx:487-507`). The assertion said nothing about the platform's **payment rails**.

**The platform defect — OPEN, out of scope, recorded and not fixed.** The platform's `payment_methods` widget renders **no payment-method radios**: `PaymentMethods` reads `const grouped = groupMethods(cart.methods)` and then indexes it **by group name** (`const keys = (grouped[group] ?? []) as PaymentMethodKey[]`, `src/components/builder/cart.tsx:560`, `:584`), but `groupMethods()` returns an **array** of `{ layer, methods }` objects (`src/lib/payment-rails.ts:358-363`). `grouped[group]` is therefore **always `undefined`**, every group renders `null`, and the fieldset renders its legend and **no rails** (`src/components/builder/cart.tsx:576-617`). **The same defect is on the live checkout**, because the live checkout renders the same widget. The fix lives in `src/components/builder/cart.tsx`, which port spec §7 **prohibits** ("everything else under `src/`"); it is **out of scope for this plan** and is **recorded, not fixed**. It is an OPEN item in this record and in the evidence record's open list.

**The contract, recorded before the edit.** The preview suite's checkout case asserts **what actually renders**:

- the theme's own payment marks — the "We accept" heading, a brand badge (`aria-label="bKash"`) and the "Cash on delivery" text chip; and
- the platform's `payment_methods` widget's own legend ("Payment method"), which proves the platform widget is granted and rendered.

It does **not** assert payment radios, because the platform renders none (the OPEN defect above), and it does **not** assert their absence either — that would pin a defect into a test. The mock's hard-coded line and money stay asserted absent.

### (j.4) Decision **D4** is widened to **six** files (owner's ruling, 2026-10-20)

**The ruling.** The owner ruled on **2026-10-20**: widen Decision **D4** to **six** files and move the fourth stale pin. The standing instruction was _"as per the expert opinion, whatever goes"_: the expert's bar requires the theme's page in the preview, and the pin is a file this work created, so **it moves with the change**. §(i) already carries the exact diff; it is applied here **verbatim**.

**The file.** `src/components/store/songoskriti-preview-page.test.tsx` — the Phase-1 preview-page suite. Its case at `:126-131` pins the **shared** studio fixture's literal "Demo page body." (`src/lib/preview-page-data.ts:40`); the preview now renders the **theme's own** labelled sample page (`SONGOSKRITI_PREVIEW_PAGE`, `src/lib/themes/songoskriti/preview-page.ts`), so the pin names a body the host no longer renders.

**The diff applied — §(i)'s hunk, verbatim.**

```diff
@@ -126,8 +126,11 @@
   it("renders a non-empty body for ?template=page", () => {
     const html = renderPage();
     expect(html).toContain("<article");
     expect(html).toContain("</article>");
-    expect(html).toContain("Demo page body.");
+    // The Songoskriti blueprint renders the theme's OWN labelled sample
+    // page (`SONGOSKRITI_PREVIEW_PAGE`), not the shared studio fixture.
+    expect(html).toContain("Sample page — Songoskriti sizing and care");
   });
```

**The replacement is strictly stronger.** The subject — "the preview's page tab renders a real body" — is untouched; the expectation now names the theme's own page title instead of a generic sentence of the shared fixture, so the pin can no longer be satisfied by the studio's placeholder. No assertion is deleted, skipped or weakened; the case count is unchanged (7 tests in the file, before and after).

### (j.5) The theme's `facet_sidebar` authors the category and kind groups — a composition change

**The defect.** The theme's `facet_sidebar` carried only `heading`, `limit` and `collapsed` (`src/lib/themes/songoskriti/preview.ts:269-273`). The platform's facet panel renders the category group only when `bool("showCategories")` and the kind group only when `bool("showKinds")` (`src/components/builder/collection.tsx:157`, `:177`), and `bool()` is `props[key] === true` (`src/components/builder/widgets.tsx:176-178`) — an **absent** prop is false. So the granted sidebar rendered **only its heading and "Clear all"**, and the demo facet labels could not appear. The substitute assertion in the preview suite (the toolbar's "Filter" button) proved the demo rows reached the **toolbar**, not the sidebar.

**The fix — the theme's own composition (the real fix).** The theme's `facet_sidebar` authors `showCategories: true` and `showKinds: true`. Both are **catalogue fields** (`src/lib/builder-ast.ts:2742-2743`), so a merchant sees them in the builder as switches, and they join the theme's existing three.

**The pin that moves with it.** The theme's own suite pins the **exact prop-key set** of every section of the search body (`src/lib/themes/songoskriti/search-template.test.ts:204-208`): `facet_sidebar` → `["collapsed","heading","limit"]`. It becomes `["collapsed","heading","limit","showCategories","showKinds"]`. The pin is **not weakened** — it is the same assertion over a **larger** set, so a prop added or dropped still fails; and because the file is under `src/lib/themes/songoskriti/**` (§7's Editable clause — the same reading the owner adopted for `skins.test.ts` in §(g)), it is **not** a new D4 file.

**The storefront is unaffected.** `facet_sidebar` is **not** granted on the storefront (Decision **D7** — no storefront route mounts a `WidgetDataProvider`, so its rows would be empty); an ungranted context widget renders `null` (`src/components/builder/SectionRenderer.tsx:814-833`). The change is visible in the preview (the only host that grants it) and in the builder canvas.

**The proof.** The preview suite asserts the demo facet labels — **"Jewellery"** (a demo category) and **"physical"** (a demo kind) — appear in the search tab's markup, and the brief's literal facet-label assertion is restored.

### (j.6) Three smaller records: the `blogSlots` grant, the count assertion, and the dead `CheckoutMock`

**The `blogSlots` grant is load-bearing and appears in neither the scope line nor the brief.** The blog pack's three sections (`blog_terms` / `blog_archive` / `blog_pager`) are **context widgets** (`templates:` allowlists, `src/lib/builder-ast.ts`), so they render only where the host grants permission (`src/components/builder/SectionRenderer.tsx:814-833`). The preview grants them on the `blog` template (`src/components/store/ThemePreviewFrame.tsx:645-652`): **without that grant the blog body renders an empty `<main>`** — the body is three context widgets and nothing else. The grant is therefore **required for the blog surface to render at all**, and it is recorded here because neither §(b.1)'s scope line nor the plan's Task 7.4 item 5 names it.

**The count assertion is tightened.** The preview suite asserted `expect(html).toContain(String(SONGOSKRITI_PREVIEW_SEARCH_TOTAL))` — which **any** "38" anywhere in the markup satisfies. It now asserts the **rendered count**: `expect(html).toContain("38 products")` — the count and the noun the theme's toolbar actually prints (`countLabel: "products"`, `src/lib/themes/songoskriti/preview.ts:263-268`; `SongoskritiResultToolbar`, `src/components/builder/songoskriti.tsx:2394-2406`). The number is still **derived** from the fixture (`SONGOSKRITI_PREVIEW_SEARCH_TOTAL`), never typed twice.

**`src/components/store/CheckoutMock.tsx` is now DEAD CODE.** Task 7 replaced the preview's checkout branch with the **authored** `ast.main`, so the mock is no longer imported or rendered anywhere (`src/components/store/ThemePreviewFrame.tsx` carries no `CheckoutMock` import; a repo-wide grep finds the symbol only in its own definition). It is **not deleted**: the file is under `src/components/store/**`, which port spec §7 prohibits ("everything else under `src/`"). It is recorded in the evidence record's **stale-artifact list** as dead code, for a later, separately-approved removal.

### (j.7) The boundary of this round — six D4 files, two theme-owned files, one new-suite file

Decision **D4** now covers **six** existing files (the four of §(e), the theme-owned `skins.test.ts` of §(g), and `src/components/store/songoskriti-preview-page.test.tsx` of §(i)/(j.4)). This round edits:

| file                                                             | change                                                                                                                                 | authority                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/store/ThemePreviewFrame.tsx`                     | the conditional `empty_state` grant; the demo `productSlot`                                                                            | §(j.1), §(j.2) — D4 (the preview host)                                      |
| `src/lib/themes/songoskriti/preview.ts`                          | the theme's `facet_sidebar` authors `showCategories` / `showKinds`                                                                     | §(j.5) — §7 Editable (`src/lib/themes/songoskriti/**`)                      |
| `src/lib/themes/songoskriti/search-template.test.ts`             | the prop-set pin moves with the composition                                                                                            | §(j.5) — §7 Editable (the theme's own test)                                 |
| `src/components/store/songoskriti-preview-page.test.tsx`         | §(i)'s diff, applied                                                                                                                   | §(j.4) — D4 (the sixth file)                                                |
| `src/components/store/songoskriti-preview-compositions.test.tsx` | the retargeted payment assertion; the facet-label assertions; the search-input assertion; the tightened count; the empty-state absence | §(j.1)–§(j.3), §(j.6) — a NEW file this plan created (not an existing test) |

**Not touched, by rule:** `src/components/builder/cart.tsx` (the payment-rails defect — §7-prohibited, recorded as an OPEN item), the production storefront routes (including `src/routes/store.$slug.search.tsx`), `src/components/store/BlogArchiveTheme.tsx`, `src/components/store/PageView.tsx`, `src/components/store/CheckoutMock.tsx`, and the three churn files plus `.output-snapshots/`.

---

## (k) Task 9's real search-route hunk — the pieces, the provider and the two slots _(appended 2026-10-21)_

**Appended, not a rewrite: sections (a)–(j) stand as written.** §(b.4) recorded the **contract** for the search route — the nine named pieces, the `CollectionQueryProvider` mount, the `contextSlots` permission map and the `productSlot`/`fallback` split — and said that Task 9 writes the exact code. **This section records the code that was actually written**, so the record and the tree agree.

**The contract was implemented as written.** No part of §(b.4)'s scope line was narrowed, and nothing outside it was touched: the loader, the head, the canonical policy, the rate-limit handling, the `apply()` helper and the tenant scoping are **byte-identical** to the pre-change file. The only change above the listing is **one import** (`CollectionQueryProvider`).

### (k.1) The per-piece ownership table, as implemented

| piece                                                                                                                                          | where it lives in the route                                                               | owner on a themed page                                                        | owner on an unthemed store |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| the query box (the `<form>` + the `<input type="search">` + the Filters toggle)                                                                | `const queryBox`                                                                          | the **results block** (`productSlot`)                                         | the `fallback`             |
| the filters panel — the category/kind `Chip` rows, the price bounds, the stock toggle, the clear button                                        | `const filtersPanel` (guarded by `showFilters && facets`)                                 | the **results block** (`productSlot`)                                         | the `fallback`             |
| the result count (the "ok" branch of the summary)                                                                                              | `const resultCount`                                                                       | the granted **`result_toolbar`** widget                                       | the `fallback`             |
| the search-status notice — the "Searching…", "Too many searches", "This store is not published" and "Search is unavailable right now" branches | `const searchNotice`                                                                      | the **results block** (`productSlot`)                                         | the `fallback`             |
| the sort control                                                                                                                               | `const summaryAndSort` (with `{resultCount}{searchNotice}`)                               | the granted **`result_toolbar`** widget                                       | the `fallback`             |
| the degraded notice                                                                                                                            | `const degradedNotice` (guarded by `result?.degraded`)                                    | the **results block** (`productSlot`)                                         | the `fallback`             |
| the empty state                                                                                                                                | `const emptyState` (guarded by `result && result.items.length === 0 && !query.isPending`) | the granted **`empty_state`** widget                                          | the `fallback`             |
| the results grid                                                                                                                               | `const results` (guarded by `result && result.items.length > 0`)                          | the **results block** (`productSlot`), rendered by the theme's `product_grid` | the `fallback`             |
| the pager                                                                                                                                      | `const pager` (guarded by `pages > 1`)                                                    | the granted **`pagination`** widget                                           | the `fallback`             |
| the page `<h1>`                                                                                                                                | `const heading`                                                                           | the granted **`category_header`** widget                                      | the `fallback`             |

**The two composites** (exactly as §(b.4) specified):

- `listing` = `queryBox + filtersPanel + summaryAndSort + degradedNotice + emptyState + results + pager` — the `fallback`'s content, in today's order;
- `resultsBlock` = `queryBox + filtersPanel + searchNotice + degradedNotice + results` — the `productSlot`'s content.

**Every piece has exactly one owner on each page.** `resultCount` and `summaryAndSort` are in `listing` only; `searchNotice` is in `resultsBlock` only (and inside `listing` it is reached through `summaryAndSort`, so it renders once); `emptyState` and `pager` are in `listing` only. The two branches of the summary's five-way ternary became the two named constants `resultCount` and `searchNotice`, each keeping the original `<p aria-live="polite" className="text-sm text-muted-foreground">` wrapper, so the summary row still renders exactly one live region.

**The granted set is exactly five, and `facet_sidebar` is absent.** `empty_state` is granted **conditionally** — only when the platform's own empty state would have shown — because the platform's `EmptyState` widget renders its panel unconditionally (`src/components/builder/collection.tsx:707-753`), so the _grant_ is what decides whether the theme's empty copy appears. The residual is stated in the code comment above the map, as §(b.4) requires.

### (k.2) The real hunk

The diff is large because the whole listing block was re-indented into named constants; **every markup line is byte-identical to the line it came from**, and every `t()` call travels with its markup (the summary's five-way ternary is the only markup that was _split_, into `resultCount` and `searchNotice`, each keeping the original paragraph wrapper).

```diff
diff --git a/src/routes/store.$slug.search.tsx b/src/routes/store.$slug.search.tsx
index 4398afad..669858c5 100644
--- a/src/routes/store.$slug.search.tsx
+++ b/src/routes/store.$slug.search.tsx
@@ -22,6 +22,7 @@ import {
 import { ThemeChrome } from "@/components/store/ThemeChrome";
 import { PluginLayer } from "@/components/store/PluginLayer";
 import { SupportWidget } from "@/components/store/SupportWidget";
+import { CollectionQueryProvider } from "@/components/builder/collection";
 import {
   PAGE_SIZE,
   SORTS,
@@ -181,350 +182,403 @@ function SearchPage() {
   const pages = pageCount(result?.total ?? 0, result?.limit ?? PAGE_SIZE);
   const filters = activeFilterCount(params);

-  // The whole listing — query box, facets, results, pager — is one block so a
-  // theme's search template can place and style it wherever it likes.
-  const listing = (
-    <>
-      <form
-        className="mt-4 flex flex-wrap items-end gap-2"
-        onSubmit={(e) => {
-          e.preventDefault();
-          apply({ q: term.trim() });
-        }}
-      >
-        <div className="min-w-0 flex-1">
-          <label
-            htmlFor="sf-q"
-            className="block text-xs font-medium text-muted-foreground"
-          >
-            {t(
-              "Product name, description or tag",
-              "পণ্যের নাম, বিবরণ বা ট্যাগ",
-            )}
-          </label>
-          <div className="relative mt-1">
-            <Search
-              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
-              aria-hidden
-            />
-            <input
-              id="sf-q"
-              type="search"
-              value={term}
-              maxLength={80}
-              onChange={(e) => setTerm(e.target.value)}
-              placeholder={t("e.g. jamdani shari", "যেমন: জামদানি শাড়ি")}
-              className="min-h-11 w-full rounded-fq-md border border-border bg-card pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
-            />
-          </div>
-        </div>
-        <button
-          type="submit"
-          className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
-        >
-          {t("Search", "খুঁজুন")}
-        </button>
-        <button
-          type="button"
-          onClick={() => setShowFilters((v) => !v)}
-          aria-expanded={showFilters}
-          className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border bg-card px-3 text-sm"
+  // Phase 2 (Task 9.3) — the listing is split into NAMED PIECES, so that every
+  // piece has exactly ONE owner: the results block the theme places (the
+  // productSlot), or the platform's own widget. Every piece keeps its existing
+  // markup and its existing `t()` calls — the split MOVES markup into named
+  // constants; it does not redesign the platform's UI.
+  //
+  //   queryBox        the search form
+  //   filtersPanel    the category/kind chips, the price bounds, the stock
+  //                   toggle and the clear button
+  //   resultCount     the count branch of the summary
+  //   searchNotice    every other branch of it
+  //   summaryAndSort  the summary row and the sort control
+  //   degradedNotice  the degraded-engine notice
+  //   emptyState      the no-results panel
+  //   results         the results grid
+  //   pager           the pager
+  const queryBox = (
+    <form
+      className="mt-4 flex flex-wrap items-end gap-2"
+      onSubmit={(e) => {
+        e.preventDefault();
+        apply({ q: term.trim() });
+      }}
+    >
+      <div className="min-w-0 flex-1">
+        <label
+          htmlFor="sf-q"
+          className="block text-xs font-medium text-muted-foreground"
         >
-          <SlidersHorizontal className="size-4" aria-hidden />
-          {t("Filters", "ফিল্টার")}
-          {filters > 0 && (
-            <span className="money rounded-full bg-primary px-2 text-xs text-primary-foreground">
-              {filters}
-            </span>
-          )}
-        </button>
-      </form>
+          {t("Product name, description or tag", "পণ্যের নাম, বিবরণ বা ট্যাগ")}
+        </label>
+        <div className="relative mt-1">
+          <Search
+            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
+            aria-hidden
+          />
+          <input
+            id="sf-q"
+            type="search"
+            value={term}
+            maxLength={80}
+            onChange={(e) => setTerm(e.target.value)}
+            placeholder={t("e.g. jamdani shari", "যেমন: জামদানি শাড়ি")}
+            className="min-h-11 w-full rounded-fq-md border border-border bg-card pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
+          />
+        </div>
+      </div>
+      <button
+        type="submit"
+        className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
+      >
+        {t("Search", "খুঁজুন")}
+      </button>
+      <button
+        type="button"
+        onClick={() => setShowFilters((v) => !v)}
+        aria-expanded={showFilters}
+        className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border bg-card px-3 text-sm"
+      >
+        <SlidersHorizontal className="size-4" aria-hidden />
+        {t("Filters", "ফিল্টার")}
+        {filters > 0 && (
+          <span className="money rounded-full bg-primary px-2 text-xs text-primary-foreground">
+            {filters}
+          </span>
+        )}
+      </button>
+    </form>
+  );

-      {showFilters && facets && (
-        <section
-          aria-label={t("Filters", "ফিল্টার")}
-          className="mt-4 space-y-4 rounded-fq-lg border border-border bg-card p-4"
-        >
-          <fieldset>
-            <legend className="text-xs font-medium text-muted-foreground">
-              {t("Category", "ক্যাটাগরি")}
-            </legend>
-            <div className="mt-2 flex flex-wrap gap-2">
+  const filtersPanel =
+    showFilters && facets ? (
+      <section
+        aria-label={t("Filters", "ফিল্টার")}
+        className="mt-4 space-y-4 rounded-fq-lg border border-border bg-card p-4"
+      >
+        <fieldset>
+          <legend className="text-xs font-medium text-muted-foreground">
+            {t("Category", "ক্যাটাগরি")}
+          </legend>
+          <div className="mt-2 flex flex-wrap gap-2">
+            <Chip
+              active={!params.category}
+              label={t("All", "সব")}
+              onClick={() => apply({ category: null })}
+            />
+            {facets.categories.map((c) => (
               <Chip
-                active={!params.category}
-                label={t("All", "সব")}
-                onClick={() => apply({ category: null })}
+                key={c.slug}
+                active={params.category === c.slug}
+                label={`${c.name} (${c.count})`}
+                onClick={() =>
+                  apply({
+                    category: params.category === c.slug ? null : c.slug,
+                  })
+                }
               />
-              {facets.categories.map((c) => (
-                <Chip
-                  key={c.slug}
-                  active={params.category === c.slug}
-                  label={`${c.name} (${c.count})`}
-                  onClick={() =>
-                    apply({
-                      category: params.category === c.slug ? null : c.slug,
-                    })
-                  }
-                />
-              ))}
-            </div>
-          </fieldset>
+            ))}
+          </div>
+        </fieldset>

-          <fieldset>
-            <legend className="text-xs font-medium text-muted-foreground">
-              {t("Product type", "পণ্যের ধরন")}
-            </legend>
-            <div className="mt-2 flex flex-wrap gap-2">
+        <fieldset>
+          <legend className="text-xs font-medium text-muted-foreground">
+            {t("Product type", "পণ্যের ধরন")}
+          </legend>
+          <div className="mt-2 flex flex-wrap gap-2">
+            <Chip
+              active={!params.kind}
+              label={t("All", "সব")}
+              onClick={() => apply({ kind: null })}
+            />
+            {facets.kinds.map((k) => (
               <Chip
-                active={!params.kind}
-                label={t("All", "সব")}
-                onClick={() => apply({ kind: null })}
+                key={k.kind}
+                active={params.kind === k.kind}
+                label={`${k.kind} (${k.count})`}
+                onClick={() =>
+                  apply({
+                    kind:
+                      params.kind === k.kind
+                        ? null
+                        : (k.kind as SearchParams["kind"]),
+                  })
+                }
               />
-              {facets.kinds.map((k) => (
-                <Chip
-                  key={k.kind}
-                  active={params.kind === k.kind}
-                  label={`${k.kind} (${k.count})`}
-                  onClick={() =>
-                    apply({
-                      kind:
-                        params.kind === k.kind
-                          ? null
-                          : (k.kind as SearchParams["kind"]),
-                    })
-                  }
-                />
-              ))}
-            </div>
-          </fieldset>
-
-          <fieldset>
-            <legend className="text-xs font-medium text-muted-foreground">
-              {t("Price range", "দামের সীমা")}{" "}
-              {facets.price_min_minor !== null && (
-                <span className="money">
-                  {fmtMinor(facets.price_min_minor, currency)} –{" "}
-                  {fmtMinor(facets.price_max_minor ?? 0, currency)}
-                </span>
-              )}
-            </legend>
-            <div className="mt-2 flex flex-wrap items-end gap-2">
-              <MoneyBound
-                id="sf-min"
-                label={t("Minimum", "সর্বনিম্ন")}
-                currency={currency}
-                valueMinor={params.minMinor}
-                onCommit={(v) => apply({ minMinor: v })}
-              />
-              <MoneyBound
-                id="sf-max"
-                label={t("Maximum", "সর্বোচ্চ")}
-                currency={currency}
-                valueMinor={params.maxMinor}
-                onCommit={(v) => apply({ maxMinor: v })}
-              />
-            </div>
-          </fieldset>
+            ))}
+          </div>
+        </fieldset>

-          <label className="flex items-center gap-2 text-sm">
-            <input
-              type="checkbox"
-              checked={params.inStock}
-              onChange={(e) => apply({ inStock: e.target.checked })}
-              className="size-4 accent-[var(--bd-teal-700)]"
+        <fieldset>
+          <legend className="text-xs font-medium text-muted-foreground">
+            {t("Price range", "দামের সীমা")}{" "}
+            {facets.price_min_minor !== null && (
+              <span className="money">
+                {fmtMinor(facets.price_min_minor, currency)} –{" "}
+                {fmtMinor(facets.price_max_minor ?? 0, currency)}
+              </span>
+            )}
+          </legend>
+          <div className="mt-2 flex flex-wrap items-end gap-2">
+            <MoneyBound
+              id="sf-min"
+              label={t("Minimum", "সর্বনিম্ন")}
+              currency={currency}
+              valueMinor={params.minMinor}
+              onCommit={(v) => apply({ minMinor: v })}
             />
-            {t("In stock only", "শুধু স্টকে আছে")}{" "}
-            <span className="money text-xs text-muted-foreground">
-              ({facets.in_stock})
-            </span>
-          </label>
-
-          {filters > 0 && (
-            <button
-              type="button"
-              onClick={() =>
-                apply({
-                  category: null,
-                  collection: null,
-                  kind: null,
-                  minMinor: null,
-                  maxMinor: null,
-                  inStock: false,
-                })
-              }
-              className="inline-flex min-h-9 items-center gap-1 text-sm text-primary underline"
-            >
-              <X className="size-3.5" aria-hidden />{" "}
-              {t("Clear filters", "ফিল্টার মুছুন")}
-            </button>
-          )}
-        </section>
-      )}
+            <MoneyBound
+              id="sf-max"
+              label={t("Maximum", "সর্বোচ্চ")}
+              currency={currency}
+              valueMinor={params.maxMinor}
+              onCommit={(v) => apply({ maxMinor: v })}
+            />
+          </div>
+        </fieldset>

-      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
-        <p aria-live="polite" className="text-sm text-muted-foreground">
-          {query.isPending
-            ? t("Searching…", "খোঁজা হচ্ছে…")
-            : outcome?.status === "ok"
-              ? t(
-                  `${result?.total ?? 0} ${result?.total === 1 ? "product" : "products"}`,
-                  `${result?.total ?? 0} টি পণ্য`,
-                )
-              : outcome?.status === "rate_limited"
-                ? t(
-                    "Too many searches — try again shortly.",
-                    "অনেক বেশি সার্চ — কিছুক্ষণ পরে চেষ্টা করুন।",
-                  )
-                : outcome?.status === "not_found"
-                  ? t(
-                      "This store is not published.",
-                      "এই দোকানটি প্রকাশিত নয়।",
-                    )
-                  : t(
-                      "Search is unavailable right now.",
-                      "সার্চ এখন কাজ করছে না।",
-                    )}
-        </p>
         <label className="flex items-center gap-2 text-sm">
-          <span className="text-muted-foreground">{t("Sort", "সাজান")}</span>
-          <select
-            value={params.sort}
-            onChange={(e) => apply({ sort: e.target.value as SortKey })}
-            className="min-h-11 rounded-fq-md border border-border bg-card px-2 text-sm"
-          >
-            {SORTS.map((s) => (
-              <option key={s} value={s}>
-                {s === "relevance"
-                  ? t("Best match", "সবচেয়ে মিল")
-                  : s === "price_asc"
-                    ? t("Price: low to high", "দাম: কম থেকে বেশি")
-                    : s === "price_desc"
-                      ? t("Price: high to low", "দাম: বেশি থেকে কম")
-                      : s === "newest"
-                        ? t("Newest", "নতুন")
-                        : t("Name", "নাম")}
-              </option>
-            ))}
-          </select>
+          <input
+            type="checkbox"
+            checked={params.inStock}
+            onChange={(e) => apply({ inStock: e.target.checked })}
+            className="size-4 accent-[var(--bd-teal-700)]"
+          />
+          {t("In stock only", "শুধু স্টকে আছে")}{" "}
+          <span className="money text-xs text-muted-foreground">
+            ({facets.in_stock})
+          </span>
         </label>
-      </div>

-      {result?.degraded && (
-        // The search engine is down and Postgres answered instead. Ranking is
-        // simpler, so say so plainly rather than let shoppers assume the
-        // catalogue shrank.
-        <p className="mt-4 rounded-fq-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
-          {t(
-            "Showing basic results while search is recovering — ordering may be less precise.",
-            "সার্চ ঠিক হওয়া পর্যন্ত সাধারণ ফলাফল দেখানো হচ্ছে — ক্রম কম নিখুঁত হতে পারে।",
-          )}
-        </p>
-      )}
-
-      {result && result.items.length === 0 && !query.isPending && (
-        <div className="mt-8 rounded-fq-lg border border-border bg-card p-6">
-          <h2 className="font-bangla-display text-lg font-semibold">
-            {t("No products matched", "কোনো পণ্য মেলেনি")}
-          </h2>
-          <p className="mt-1 text-sm text-muted-foreground">
-            {t(
-              "Try a shorter word, or clear a filter to widen the results.",
-              "ছোট শব্দ লিখুন, বা একটি ফিল্টার সরিয়ে ফলাফল বাড়ান।",
-            )}
-          </p>
-          <Link
-            to="/store/$slug"
-            search={{ preview_token: undefined }}
-            params={{ slug }}
-            className="mt-3 inline-block text-sm text-primary underline"
+        {filters > 0 && (
+          <button
+            type="button"
+            onClick={() =>
+              apply({
+                category: null,
+                collection: null,
+                kind: null,
+                minMinor: null,
+                maxMinor: null,
+                inStock: false,
+              })
+            }
+            className="inline-flex min-h-9 items-center gap-1 text-sm text-primary underline"
           >
-            {t("Browse everything", "সব পণ্য দেখুন")}
-          </Link>
-        </div>
-      )}
+            <X className="size-3.5" aria-hidden />{" "}
+            {t("Clear filters", "ফিল্টার মুছুন")}
+          </button>
+        )}
+      </section>
+    ) : null;
+
+  // The count — the "ok" branch of the summary. It keeps the original
+  // paragraph wrapper, so the summary row keeps its single live region.
+  const resultCount =
+    !query.isPending && outcome?.status === "ok" ? (
+      <p aria-live="polite" className="text-sm text-muted-foreground">
+        {t(
+          `${result?.total ?? 0} ${result?.total === 1 ? "product" : "products"}`,
+          `${result?.total ?? 0} টি পণ্য`,
+        )}
+      </p>
+    ) : null;

-      {result && result.items.length > 0 && (
-        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
-          {result.items.map((p) => (
-            <li key={p.id}>
-              <Link
-                to="/store/$slug/p/$productSlug"
-                params={{ slug, productSlug: p.slug }}
-                className="group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5"
-              >
-                <div className="aspect-square bg-muted">
-                  <StoreImage
-                    image={p.image ?? null}
-                    fallbackSrc={p.image_url}
-                    alt={p.title}
-                    seed={p.id}
-                    sizes="(max-width: 768px) 50vw, 300px"
-                    className="size-full object-cover"
-                  />
-                </div>
-                <div className="p-3">
-                  <h2 className="line-clamp-2 text-sm font-medium">
-                    {p.title}
-                  </h2>
-                  <p className="money mt-1 text-sm font-semibold">
-                    {fmtMinor(p.price_minor, currency)}
-                  </p>
-                  <p
-                    className={`mt-1 text-xs ${p.stock > 0 ? "text-success-foreground" : "text-danger-foreground"}`}
-                  >
-                    {p.stock > 0
-                      ? t("In stock", "স্টকে আছে")
-                      : t("Out of stock", "স্টক নেই")}
-                  </p>
-                </div>
-              </Link>
-            </li>
+  // The notice — every other branch of the summary: pending, rate-limited,
+  // not published and unavailable. Exactly one of the count and the notice
+  // renders at a time, and the notice renders NOTHING in the "ok" case (on a
+  // themed page the count comes from the granted result_toolbar widget).
+  const searchNotice =
+    query.isPending || outcome?.status !== "ok" ? (
+      <p aria-live="polite" className="text-sm text-muted-foreground">
+        {query.isPending
+          ? t("Searching…", "খোঁজা হচ্ছে…")
+          : outcome?.status === "rate_limited"
+            ? t(
+                "Too many searches — try again shortly.",
+                "অনেক বেশি সার্চ — কিছুক্ষণ পরে চেষ্টা করুন।",
+              )
+            : outcome?.status === "not_found"
+              ? t("This store is not published.", "এই দোকানটি প্রকাশিত নয়।")
+              : t("Search is unavailable right now.", "সার্চ এখন কাজ করছে না।")}
+      </p>
+    ) : null;
+
+  const summaryAndSort = (
+    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
+      {resultCount}
+      {searchNotice}
+      <label className="flex items-center gap-2 text-sm">
+        <span className="text-muted-foreground">{t("Sort", "সাজান")}</span>
+        <select
+          value={params.sort}
+          onChange={(e) => apply({ sort: e.target.value as SortKey })}
+          className="min-h-11 rounded-fq-md border border-border bg-card px-2 text-sm"
+        >
+          {SORTS.map((s) => (
+            <option key={s} value={s}>
+              {s === "relevance"
+                ? t("Best match", "সবচেয়ে মিল")
+                : s === "price_asc"
+                  ? t("Price: low to high", "দাম: কম থেকে বেশি")
+                  : s === "price_desc"
+                    ? t("Price: high to low", "দাম: বেশি থেকে কম")
+                    : s === "newest"
+                      ? t("Newest", "নতুন")
+                      : t("Name", "নাম")}
+            </option>
           ))}
-        </ul>
+        </select>
+      </label>
+    </div>
+  );
+
+  const degradedNotice = result?.degraded ? (
+    // The search engine is down and Postgres answered instead. Ranking is
+    // simpler, so say so plainly rather than let shoppers assume the
+    // catalogue shrank.
+    <p className="mt-4 rounded-fq-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
+      {t(
+        "Showing basic results while search is recovering — ordering may be less precise.",
+        "সার্চ ঠিক হওয়া পর্যন্ত সাধারণ ফলাফল দেখানো হচ্ছে — ক্রম কম নিখুঁত হতে পারে।",
       )}
+    </p>
+  ) : null;

-      {pages > 1 && (
-        <nav
-          aria-label={t("Pages", "পেজ")}
-          className="mt-8 flex items-center justify-center gap-2"
+  const emptyState =
+    result && result.items.length === 0 && !query.isPending ? (
+      <div className="mt-8 rounded-fq-lg border border-border bg-card p-6">
+        <h2 className="font-bangla-display text-lg font-semibold">
+          {t("No products matched", "কোনো পণ্য মেলেনি")}
+        </h2>
+        <p className="mt-1 text-sm text-muted-foreground">
+          {t(
+            "Try a shorter word, or clear a filter to widen the results.",
+            "ছোট শব্দ লিখুন, বা একটি ফিল্টার সরিয়ে ফলাফল বাড়ান।",
+          )}
+        </p>
+        <Link
+          to="/store/$slug"
+          search={{ preview_token: undefined }}
+          params={{ slug }}
+          className="mt-3 inline-block text-sm text-primary underline"
         >
-          {/* Phase 7.1: real hrefs — a crawler (and a JS-less shopper) must be
-                able to walk the whole result set, so these are links, not buttons. */}
-          <Link
-            to="/store/$slug/search"
-            params={{ slug }}
-            search={toSearchQuery({
-              ...params,
-              page: Math.max(1, params.page - 1),
-            })}
-            rel="prev"
-            aria-disabled={params.page <= 1}
-            className={`min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm leading-[2.75rem] ${
-              params.page <= 1 ? "pointer-events-none opacity-40" : ""
-            }`}
-          >
-            {t("Previous", "আগের")}
-          </Link>
-          <span className="money text-sm text-muted-foreground">
-            {params.page} / {pages}
-          </span>
-          <Link
-            to="/store/$slug/search"
-            params={{ slug }}
-            search={toSearchQuery({
-              ...params,
-              page: Math.min(pages, params.page + 1),
-            })}
-            rel="next"
-            aria-disabled={params.page >= pages}
-            className={`min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm leading-[2.75rem] ${
-              params.page >= pages ? "pointer-events-none opacity-40" : ""
-            }`}
-          >
-            {t("Next", "পরের")}
-          </Link>
-        </nav>
-      )}
+          {t("Browse everything", "সব পণ্য দেখুন")}
+        </Link>
+      </div>
+    ) : null;
+
+  const results =
+    result && result.items.length > 0 ? (
+      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
+        {result.items.map((p) => (
+          <li key={p.id}>
+            <Link
+              to="/store/$slug/p/$productSlug"
+              params={{ slug, productSlug: p.slug }}
+              className="group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5"
+            >
+              <div className="aspect-square bg-muted">
+                <StoreImage
+                  image={p.image ?? null}
+                  fallbackSrc={p.image_url}
+                  alt={p.title}
+                  seed={p.id}
+                  sizes="(max-width: 768px) 50vw, 300px"
+                  className="size-full object-cover"
+                />
+              </div>
+              <div className="p-3">
+                <h2 className="line-clamp-2 text-sm font-medium">{p.title}</h2>
+                <p className="money mt-1 text-sm font-semibold">
+                  {fmtMinor(p.price_minor, currency)}
+                </p>
+                <p
+                  className={`mt-1 text-xs ${p.stock > 0 ? "text-success-foreground" : "text-danger-foreground"}`}
+                >
+                  {p.stock > 0
+                    ? t("In stock", "স্টকে আছে")
+                    : t("Out of stock", "স্টক নেই")}
+                </p>
+              </div>
+            </Link>
+          </li>
+        ))}
+      </ul>
+    ) : null;
+
+  const pager =
+    pages > 1 ? (
+      <nav
+        aria-label={t("Pages", "পেজ")}
+        className="mt-8 flex items-center justify-center gap-2"
+      >
+        {/* Phase 7.1: real hrefs — a crawler (and a JS-less shopper) must be
+              able to walk the whole result set, so these are links, not buttons. */}
+        <Link
+          to="/store/$slug/search"
+          params={{ slug }}
+          search={toSearchQuery({
+            ...params,
+            page: Math.max(1, params.page - 1),
+          })}
+          rel="prev"
+          aria-disabled={params.page <= 1}
+          className={`min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm leading-[2.75rem] ${
+            params.page <= 1 ? "pointer-events-none opacity-40" : ""
+          }`}
+        >
+          {t("Previous", "আগের")}
+        </Link>
+        <span className="money text-sm text-muted-foreground">
+          {params.page} / {pages}
+        </span>
+        <Link
+          to="/store/$slug/search"
+          params={{ slug }}
+          search={toSearchQuery({
+            ...params,
+            page: Math.min(pages, params.page + 1),
+          })}
+          rel="next"
+          aria-disabled={params.page >= pages}
+          className={`min-h-11 rounded-fq-md border border-border bg-card px-3 text-sm leading-[2.75rem] ${
+            params.page >= pages ? "pointer-events-none opacity-40" : ""
+          }`}
+        >
+          {t("Next", "পরের")}
+        </Link>
+      </nav>
+    ) : null;
+
+  // The whole listing — the `fallback`'s content: every piece, in today's
+  // order, so a store with NO published search template still gets today's
+  // page, content for content.
+  const listing = (
+    <>
+      {queryBox}
+      {filtersPanel}
+      {summaryAndSort}
+      {degradedNotice}
+      {emptyState}
+      {results}
+      {pager}
+    </>
+  );
+
+  // The results block — what the theme's `product_grid` receives as
+  // `productSlot`. It carries the query box and the platform's category/kind
+  // chips (search EXECUTION and AUTHORIZATION, not presentation), the
+  // search-status notice, the degraded notice and the results grid.
+  const resultsBlock = (
+    <>
+      {queryBox}
+      {filtersPanel}
+      {searchNotice}
+      {degradedNotice}
+      {results}
     </>
   );

@@ -536,34 +590,68 @@ function SearchPage() {

   return (
     <PluginLayer plugins={chrome?.installedPlugins ?? []}>
-      <ThemeChrome
-        template="search"
-        storeSlug={slug}
-        themeKey={chrome?.themeKey ?? null}
-        merchantId={chrome?.merchant.id ?? null}
-        ast={chrome?.ast ?? null}
-        tokens={chrome?.tokens ?? null}
-        siteKit={chrome?.siteKit ?? null}
-        chrome={
-          <>
-            <StoreHeader
-              slug={slug}
-              name={chrome?.merchant.name ?? slug}
-              menus={chrome?.menus}
-              themeKey={chrome?.themeKey ?? null}
-            />
-            {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
-            {/* <SupportWidget slug={slug} /> */}
-          </>
-        }
-        productSlot={listing}
-        fallback={
-          <>
-            {heading}
-            {listing}
-          </>
-        }
-      />
+      {/*
+        Phase 2 (Task 9.3) — the theme's facet, sort and pager widgets compute
+        REAL links, so the provider carries the LIVE query: the live params,
+        the live total, the store's search path and the route's own `apply()`.
+      */}
+      <CollectionQueryProvider
+        value={{
+          params,
+          total: result?.total ?? 0,
+          basePath: `/store/${slug}/search`,
+          navigate: (next) => apply(next),
+        }}
+      >
+        <ThemeChrome
+          template="search"
+          storeSlug={slug}
+          themeKey={chrome?.themeKey ?? null}
+          merchantId={chrome?.merchant.id ?? null}
+          ast={chrome?.ast ?? null}
+          tokens={chrome?.tokens ?? null}
+          siteKit={chrome?.siteKit ?? null}
+          chrome={
+            <>
+              <StoreHeader
+                slug={slug}
+                name={chrome?.merchant.name ?? slug}
+                menus={chrome?.menus}
+                themeKey={chrome?.themeKey ?? null}
+              />
+              {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
+              {/* <SupportWidget slug={slug} /> */}
+            </>
+          }
+          // The storefront grants five of the platform's search widgets;
+          // `facet_sidebar` stays preview-only because its rows come from the
+          // widget-data pipeline (D7). A themed storefront search page therefore
+          // has NO independent facet sidebar — the platform's own category/kind
+          // chips remain visible inside the results block, which is where the
+          // shopper filters the search.
+          contextSlots={{
+            result_toolbar: null,
+            filter_chips: null,
+            pagination: null,
+            // The `empty_state` widget renders its panel unconditionally
+            // (`src/components/builder/collection.tsx:707-753`), so the GRANT
+            // is what decides whether the theme's empty copy appears — it is
+            // granted only when the platform's own empty state would have
+            // shown.
+            ...(result && result.items.length === 0 && !query.isPending
+              ? { empty_state: null }
+              : {}),
+            category_header: null,
+          }}
+          productSlot={resultsBlock}
+          fallback={
+            <>
+              {heading}
+              {listing}
+            </>
+          }
+        />
+      </CollectionQueryProvider>
     </PluginLayer>
   );
 }
```

### (k.3) The new test file

**`src/routes/store.$slug.search-composition.test.tsx`** — a NEW file (the §7 carve-out is "NEW test/fixture files"). It does **not** import the route module (that would pull the whole server graph); it reads the route file as **text** and asserts the composition contract, the way `src/components/store/chrome-localization.test.tsx` and `src/routes/store.$slug.index.isolated-route.test.ts` read source files. Its six cases are:

1. the route mounts a `CollectionQueryProvider` whose value carries `params`, `total: result?.total ?? 0`, the store's own search base path and `navigate: (next) => apply(next)` — the facet, sort and pager links are real links;
2. the `contextSlots` map grants **exactly** `result_toolbar`, `filter_chips`, `pagination`, `empty_state`, `category_header` and **not** `facet_sidebar`, and the `empty_state` grant is conditional on the platform's own empty-state condition;
3. the identifier handed to `productSlot` is **not** the one handed to `fallback`, the results block still carries the query box and the filters panel (the category and product-type `Chip` rows), and it does **not** carry the count/sort row — those belong to the granted toolbar;
4. the `fallback` is still the whole listing (all seven pieces) plus the route's own `<h1>`;
5. the route still calls `searchStorefrontFn` and still asks `getStoreChrome` for `template: "search"` — the platform still executes and authorizes the search;
6. the route still computes `policy`/`listingPolicy` and returns `buildSearchHead` — the canonical and robots discipline is untouched.

On the pre-change file the suite is **red** with a clear message (`expected 'import { createFileRoute, Link, useNa…' to contain 'CollectionQueryProvider'`); on the post-change file it is **green** (6 passed).

### (k.4) The proof that the shopper's result set did not change

The change is a **presentation-channel** change: the loader, the query validation, the tenant scoping, the filtering, the result authorization and the result limits are byte-identical, and the results grid renders the same `result.items`. It was verified **by rendering**, not by assertion:

- the route's listing markup was extracted from the pre-change file and from the post-change file, given the **same** fixture (3 result rows, `total: 9`, `limit: 3` → 3 pages, one category facet, one kind facet, a search term and a sort), and rendered with `react-dom/server`;
- the rendered **fallback** HTML is **byte-identical** before and after (`cmp` → identical, 7 325 bytes) — same rows, same prices, same "9 products" count, same "1 / 3" pager, same chips, same search input — and identical again in the degraded, empty, pending and rate-limited states;
- the rendered **results block** (the new `productSlot`) carries the search input, the category and kind chips and the same three rows, and does **not** carry the count — the count is the granted `result_toolbar` widget's.

**Nothing in this section widens the escalation.** The two files touched by Task 9 are the search route (escalated by Decision **D4**, and named here) and the new test file (a NEW file). No other file was edited.

---

## (l) The archive contract and the explicit unsupported state _(appended 2026-10-21 by Task 10)_

**Appended, not a rewrite: sections (a)–(k) stand as written.** §(b.5) carried the
contract's _shape_ ("the archive surface is the blog taxonomy surface (index /
category / tag / author); it wears the `blog` template and the existing blog pack;
`?template=archive` is unsupported and must produce the explicit unsupported state,
not a homepage redirect") and said that Task 10 writes the exact wording and the exact
code. **This section records both**, so the record and the tree agree.

### (l.1) The contract, in the words the plan fixes

> **Archive contract (Decision D1, Option A).** The archive-like surfaces the platform
> serves are the blog listing and its three taxonomy kinds — **category, tag, author** —
> plus the blog index itself: `src/routes/blog.index.tsx`,
> `src/routes/blog.category.$slug.tsx`, `src/routes/blog.tag.$slug.tsx`,
> `src/routes/blog.author.$slug.tsx` and the storefront's
> `src/routes/store.$slug.blog.index.tsx`. They are served by `BlogArchiveTheme`
> (`src/components/store/BlogArchiveTheme.tsx:29-33`) and backed by the existing blog
> pack (`blog_terms` / `blog_archive` / `blog_pager`,
> `src/lib/builder-ast.ts:4834-4925`), and they wear the **`blog`** template. **No
> `archive` template key is added**: a key would need edits to
> `src/lib/builder-ast.ts` (`TEMPLATE_KEYS` `:46-59`, `TEMPLATE_ZONES` `:156`,
> `ROUTE_H1_TEMPLATES` `:68-75`, the 41 catalogue `templates:` allowlists, the
> `required` table `:8438-8462`, `parseTemplates` `:8117`),
> `src/lib/theme-package.ts:172`, `src/lib/theme-preview-nav.ts:340` and `:82-99`,
> `src/lib/widget-weight.ts:205`, `src/lib/builder-seo.ts:317`,
> `src/components/builder/BuilderTopBar.tsx:6`,
> `src/routes/_authenticated/dashboard/builder.tsx:205` and the hand-written `z.enum`
> at `src/lib/storefront.functions.ts:97-107` — **every one prohibited by §7** — for a
> surface the `blog` template already covers; and no compiler sees that `z.enum`, so a
> key added to the editor but not to the parser and the `z.enum` would appear in the
> builder and vanish from every page (`phase0-implementation-map.md:308`).
> `?template=archive` therefore remains **unsupported**, and the preview must **say so
> explicitly** rather than redirect to the homepage. The storefront side of the blog —
> whether the route wears the theme's `blog` template — stays behind Decision D5 and is
> not touched by this plan.

**The citation note (measured on this tree, 2026-10-21, before the edit).** Every
`file:line` in the contract was re-read. They all resolve, with **one** drift the
record already corrected in §(h) item 5: the hand-written `z.enum` is at
`src/lib/storefront.functions.ts:98-108` (the contract sentence above quotes the
plan's original `:97-107`; the two ranges overlap and name the same nine keys).
`TEMPLATE_KEYS` `:46-59`, `TEMPLATE_ZONES` `:156`, `ROUTE_H1_TEMPLATES` `:68-75`, the
`required` table `:8438-8462` and `parseTemplates` `:8117` are as quoted; the **41**
catalogue `templates:` allowlists still measure 41
(`grep -c 'templates: \[' src/lib/builder-ast.ts` → `41`);
`src/components/store/BlogArchiveTheme.tsx:29-33` is the
`ThemeChrome template="blog" ast={null}` block; and the blog pack's three entries are
`blog_archive` `:4834`, `blog_terms` `:4886`, `blog_pager` `:4909`.

**The blast radius, re-measured.** §(a)(iv) measured what a key would have cost:
**11** files referencing `TEMPLATE_KEYS` and **9** files carrying `Record<TemplateKey, …>`
(**16** occurrences). **Task 8 added one theme-owned file to each count** —
`src/lib/themes/songoskriti/template-distinctness.ts`, which references `TEMPLATE_KEYS`
(`:46`, `:610`) and carries three `Record<TemplateKey, …>` maps. The counts are
therefore now **12 files** and **10 files / 19 occurrences**. The drift is **+1 file in
each count and +3 occurrences**, all inside a §7-**editable** theme-owned file;
**no core file changed**, so the ruling's shape is untouched and the ruling still
holds.

### (l.2) The unsupported state — the contract, recorded before the edit

**The defect.** `src/components/store/ThemePreviewFrame.tsx:518` read
`const ast = templates[template] ?? templates.index;` — a template the theme does not
author rendered the **homepage**, silently. Nothing in the preview said the template
was unsupported: the merchant saw a store that looked like the theme's home page and
concluded the template "works". This is the "unsupported routes must not silently
redirect to the homepage" half of the expert's archive item.

**The contract.**

1. The panel's heading reads exactly **"This template is not supported by this theme"**.
2. It **names the template key** — the key the preview was asked for, printed verbatim.
3. It **links back to the home tab**: an in-canvas `/` link, which the canvas's
   capture-phase click handler resolves to the `index` template
   (`src/lib/theme-preview-nav.ts:96-98`, `:159-180`) — the preview never leaves the
   frame and never falls back to a page the theme did not author.
4. It carries **no demo copy**: none of `"Demo page"`, `"Demo search"`,
   `"Meet the makers"`, `"Sample product"`, `"Demo"`. The panel is a statement about
   the theme's coverage, not a demo — the demo-copy defect Phase 1 removed from the
   theme's bodies must not come back through the host's own panel. (The engine's
   generic body still carries `"Demo page. The live theme authors this template — what
you see here is the engine fallback."`, `src/lib/theme-preview-nav.ts:367`; that
   generic body is a **different** surface and is not touched by this section.)
5. It **states the contract**: the archive surfaces are the blog listing and its
   category / tag / author archives, and they wear the `blog` template.
6. It is shown **only** when the theme does not author the requested template. A
   template the theme _does_ author renders exactly as it does today — the panel is
   never shown for an authored template, and no assertion in
   `src/components/store/ThemePreviewFrame.test.tsx` (frozen by §7) changes.

**The copy, fixed by this record.** Two constants in
`src/components/store/ThemePreviewFrame.tsx` carry the panel's copy; the contract test
reads them out of the file:

- `UNSUPPORTED_TEMPLATE_TITLE` = "This template is not supported by this theme"
- `UNSUPPORTED_TEMPLATE_BODY` = "The theme does not author a body for this template, so there is nothing to preview. The archive surfaces are the blog listing and its category, tag and author archives, and they wear the blog template."

### (l.3) The exact code

**The fallback — the flag, and the flag's consumption.** The bare `?? templates.index`
is gone. The lookup is widened to a _partial_ map first, so an unauthored template is
a **known** state rather than an accidental one:

```tsx
// D1 (Option A) — an unsupported template is an EXPLICIT state, never a
// silent redirect to the homepage. `?template=archive` is unsupported: the
// archive surface is the blog taxonomy surface (index / category / tag /
// author) and it wears the `blog` template, so no `archive` key exists
// (this record's §(l.1)). When the theme does not author the requested
// template the canvas renders the named "not supported by this theme"
// panel instead of the homepage body.
const templatesByKey: Partial<Record<TemplateKey, ThemeAst>> = templates;
const authored = templatesByKey[template];
const unsupported = authored === undefined;
const ast = authored ?? templatesByKey.index ?? EMPTY_AST;
```

**The panel.** `EMPTY_AST` (`src/lib/builder-ast.ts:519`) is the empty body the canvas
computes from when even the homepage is unauthored — it is a **read-only** import; the
file is not edited.

```tsx
/**
 * The unsupported-template panel's copy.
 *
 * The panel states a fact about the THEME's coverage — it is not a demo, so
 * it carries none of the retired demo strings ("Demo page", "Demo search",
 * "Meet the makers", "Sample product", "Demo"). The contract test
 * (`src/lib/themes/songoskriti/archive-contract.test.ts`) reads these two
 * constants straight out of this file, so the copy cannot drift back into
 * demo copy without failing a test.
 */
const UNSUPPORTED_TEMPLATE_TITLE =
  "This template is not supported by this theme";
const UNSUPPORTED_TEMPLATE_BODY =
  "The theme does not author a body for this template, so there is nothing to preview. The archive surfaces are the blog listing and its category, tag and author archives, and they wear the blog template.";

/**
 * The explicit unsupported state — a named panel, never a redirect.
 *
 * It NAMES the template key, LINKS BACK to the home tab (an in-canvas `/`
 * link, which the canvas's capture-phase handler resolves to the `index`
 * template — `src/lib/theme-preview-nav.ts:96-98`, `:159-180`), and carries
 * no demo copy.
 */
function UnsupportedTemplateNotice({ template }: { template: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {UNSUPPORTED_TEMPLATE_TITLE}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {UNSUPPORTED_TEMPLATE_BODY}
      </p>
      <p className="mt-4 text-sm">
        The requested template key is{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {template}
        </code>
        .
      </p>
      <a
        href="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Back to the home tab
      </a>
    </div>
  );
}
```

**The render site — the flag is consumed.** The `ThemeSurface`'s content becomes the
`: (` branch; the homepage body is **not** rendered when the flag is true.

```tsx
<ThemeSurface tokens={tokens} skinCss={skinCss}>
  {/*
            The `unsupported` flag (the fallback above) is CONSUMED here: when
            the theme does not author the requested template the canvas
            renders the named "not supported by this theme" PANEL and the
            homepage body is NOT rendered. When the flag is false the canvas
            renders exactly as it does today.
          */}
  {unsupported ? (
    <UnsupportedTemplateNotice template={template} />
  ) : (
    <>{/* … the existing ThemeSurface content, unchanged … */}</>
  )}
</ThemeSurface>
```

**What this section does not widen.** One existing file — the preview host
`src/components/store/ThemePreviewFrame.tsx`, already escalated by Decision **D4**
(§(e), §(h) item 6) — and one **NEW** test file,
`src/lib/themes/songoskriti/archive-contract.test.ts`. **No** `archive` key is added;
**no** file under `src/lib/builder-ast.ts`, `src/lib/storefront.functions.ts`,
`src/lib/theme-preview-nav.ts`, `src/lib/theme-package.ts`, `src/lib/widget-weight.ts`,
`src/lib/builder-seo.ts`, `src/components/builder/BuilderTopBar.tsx` or
`src/routes/_authenticated/dashboard/builder.tsx` is edited.

### (l.4) The contract test

`src/lib/themes/songoskriti/archive-contract.test.ts` — a **NEW** file (§7's carve-out
is "NEW test/fixture files"). It reads the tree as **text** (the same pattern as
`src/routes/store.$slug.search-composition.test.tsx`), so it never imports the preview
host or any route module. Its **five** cases are:

1. **the archive-like routes the platform actually has are enumerated** — the route
   directory holds `blog.index.tsx`, `blog.category.$slug.tsx`, `blog.tag.$slug.tsx`,
   `blog.author.$slug.tsx` and `store.$slug.blog.index.tsx`;
2. **the product-side taxonomy surfaces are not routes** — there is no
   `$categorySlug` route and no brand route, and `src/lib/storefront-search.ts`
   carries `category` as a search facet (`category: string | null;` and
   `out["category"] = p.category;`);
3. **no unsupported template silently redirects to the homepage** — the preview host's
   fallback is **not** the bare `?? templates.index`, the `unsupported` flag exists
   and is **consumed** at the render site, and the storefront's own blog routes answer
   an unknown slug with their **own 404** (`throw notFound()`), never a redirect;
4. **the unsupported state's copy is not demo copy** — the panel's copy (its two
   constants and the panel's own JSX) contains **none** of `"Demo page"`,
   `"Demo search"`, `"Meet the makers"`, `"Sample product"`, `"Demo"`;
5. **the contract is written down** — this record carries the sentence, so the
   contract cannot be deleted without failing a test.

**The render, verified separately.** The committed suite is **text-based** (the brief
fixes it at five cases, and the text is what the contract is about). The panel's
_render_ was therefore verified on its own, with a scratch render of the preview host
that was deleted after the run and is **not** part of this commit: with a `templates`
map missing the requested key the markup carried the panel's heading, the named key and
the home link, and did **not** carry the homepage body; with an **authored** template
the frame rendered exactly as before; with an authored but **empty** body the frame
still rendered the platform's own "No sections authored for this template." copy — the
panel is shown only when the template is **unauthored**. The scratch run reported
`Test Files 1 passed (1)` / `Tests 3 passed (3)`.
