# Phase 3 — The `archive` template key: escalation bundle (the union, the exhaustive maps, the contract, the theme lifecycle and the archive host)

**Branch:** `frame30` · **Base commit:** `182c37b5` · **Recorded:** 2026-10-21
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (Tasks 1 and 2)
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary — "no core files") and §9 (Testing & evidence)
**Owner's rulings in force:** Decision Gate **G1** (port spec §7 is relaxed for this programme for the named list in the plan's Decision Gate), **G2** (the additive API rule — `THEME_API_RANGE` stays `^3.0.0`, the running API stays `3.1.0`, and only a package that DECLARES `archive` is held to the ≥ 3.1.0 lower bound), **G3** (the parity re-freeze runs on the repo's throwaway stack, never on the configured database).

This record is the port spec §9 escalation for the Phase-3 change "the content archive is a first-class template key". It is written **before** any escalated file is edited: the diffs in §(b) are the exact old → new hunks this task applies, and the record is committed in the same commit as the change it escalates. The Phase-2 record (`phase2-template-completeness-escalation.md`) is a **historical** document and is not rewritten: it records the superseded D1 (Option A), and the suite that read it (`src/lib/themes/songoskriti/archive-contract.test.ts`) now reads THIS record instead.

**Base commit.** The base commit of this task is **`182c37b5`** (`docs(report): list the exact §7 relaxations the owner granted`) — the tip of `frame30` and of `origin/frame30`. At the moment of recording, the working tree carries only the three churn files (` .artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/`, none of which is staged or committed by this task.

---

## (a) The finding

> The brief supersedes D1: `archive` becomes a first-class template key; the measured blast radius is **36 files / 46 edit sites**, and **31** of the original 33 are §7-prohibited (**not 24** — the first draft of the plan counted seven NEW files as if they were among the 33; A5.9).

**What the change is.** `archive` joins `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-60`) as the tenth template key. It is a MODEL change, not a UI change, and the model has four load-bearing surfaces that the compiler can only partly see:

1. **The union.** `parseTemplates` (`src/lib/builder-ast.ts:8117-8136`) reads ONLY the keys in `TEMPLATE_KEYS` and silently drops everything else. A key the union does not know appears in the editor and vanishes from every page — the merchant's work is discarded on save, with no error anywhere.
2. **The hand-written duplicate.** The `z.enum([...])` in `getStoreChrome` (`src/lib/storefront.functions.ts:98-108`) is the ONLY compiler-invisible copy of the union in the tree (measured: `grep -rn 'z.enum(\[' src` returns no other template-key enum). It rejects an unknown key at RUNTIME, so an archive route would 500 while every type check passed. This is the single most dangerous site in the blast radius.
3. **The ten exhaustive `Record<TemplateKey, …>` maps.** Each is compile-total, so the compiler names every site that must grow: `TEMPLATE_ZONES`, `TEMPLATE_META`, `TEMPLATE_LABEL`, `TEMPLATE_JS_BUDGET`, `GENERIC_TITLES`, `SONGOSKRITI_TEMPLATE_EXPECTATIONS`, and the four total `Record<TemplateKey, ThemeAst>` maps in the existing test files. A eleventh, `FIRST_SECTION` in `src/lib/theme-preview-nav.test.ts:120-130`, is compile-total too — it is named in the plan's A5.8 and in Task 5's step 5.4, but a compile-total map cannot wait for a later task: the moment the union grows, `tsgo --noEmit` fails. **This record therefore escalates it as well**, with the exact diff, and the suite it belongs to keeps its own pin (the map now names the archive's opener).
4. **The per-widget catalogue allowlists.** 41 catalogue rows carry a `templates:` allowlist. A row that does not name `"archive"` makes the widget a **publish-blocking** "needs data this template does not provide" error the first time a merchant places it on the archive (`isContextMismatch`, `src/lib/builder-ast.ts:7935-7943` → `:8554-8560`) and a failure of the distinctness gate's `R3`. **Exactly seven** rows grow: `breadcrumb` (`:1506`), `category_header` (`:2696`), `pagination` (`:2798`), `empty_state` (`:2829`), `blog_archive` (`:4838`), `blog_terms` (`:4890`), `blog_pager` (`:4913`). The three product-search rows (`facet_sidebar` `:2722`, `filter_chips` `:2762`, `result_toolbar` `:2776`) stay closed — a content archive has no product facets; the blog pack's `blog_terms` is its facet surface. `product_grid` is not a context widget and carries no `templates:` row at all.

**What else this task closes.** Three measured gaps in the theme lifecycle, not one: the **seed** (the RPC `theme_install_preset` replaces the draft's map VERBATIM — `delete from public.theme_drafts …; insert … _preset->'templates'` — so the per-key merge cannot live in SQL and is implemented in TypeScript inside `installRegistryTheme`); the **merge/diff** (`diffTemplates` `:1353` and `mergeTemplates` `:1378` loop over `TEMPLATE_KEYS` only, so every variant key is silently dropped across a theme update — both are widened to the whole template map); and the **publish gate** (`publishVersion` lints `TEMPLATE_KEYS` only, so a variant AST would reach a merchant's storefront unlinted — every variant is now linted with its BASE key, and `applyThemeUpdate`'s `Object.keys(templates) as TemplateKey[]` cast is replaced by the same rule).

**The measure that did not change.** `grep -rn '"archive"' --include=*.ts --include=*.tsx src | grep -v '\.test\.'` returns exactly two hits before this task, and **neither is a template key**: `src/lib/blog-taxonomy.ts:77` — the reserved taxonomy slug `"archive"` in the reader's reserved-word list — and `src/lib/studio/catalog.ts:1281` — the keyword `"archive"` in the `blog_archive` widget's search keywords. No `archive` template key exists anywhere in the tree.

---

## (b) The exact old → new diff

Every §7-prohibited file this task edits, with its exact unified-diff hunks. The three NEW files (a contract suite, the archive context and its suite, the archive host and its suite) are not edits and carry no diff; they are listed at the end of this section for completeness.

```diff
diff --git a/src/components/builder/BuilderTopBar.tsx b/src/components/builder/BuilderTopBar.tsx
index 0bb30afd..4a7451b9 100644
--- a/src/components/builder/BuilderTopBar.tsx
+++ b/src/components/builder/BuilderTopBar.tsx
@@ -73,6 +73,15 @@ export const TEMPLATE_META: Record<
     },
     icon: "file-text",
   },
+  archive: {
+    en: "Archive",
+    bn: "আর্কাইভ",
+    desc: {
+      en: "Category, tag & author listings",
+      bn: "ক্যাটাগরি, ট্যাগ ও লেখকের তালিকা",
+    },
+    icon: "archive",
+  },
 };
 
 export type BuilderTopBarProps = {
@@ -219,6 +228,20 @@ function TemplateIcon({ icon }: { icon: string }) {
           <circle cx="12" cy="7" r="4" />
         </svg>
       );
+    case "archive":
+      return (
+        <svg
+          className="size-3.5"
+          viewBox="0 0 24 24"
+          fill="none"
+          stroke="currentColor"
+          strokeWidth="2"
+        >
+          <rect width="20" height="5" x="2" y="3" rx="1" />
+          <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
+          <path d="M10 12h4" />
+        </svg>
+      );
     default:
       return (
         <svg
diff --git a/src/components/store/songoskriti-preview-compositions.test.tsx b/src/components/store/songoskriti-preview-compositions.test.tsx
index 41e28241..e83ca98e 100644
--- a/src/components/store/songoskriti-preview-compositions.test.tsx
+++ b/src/components/store/songoskriti-preview-compositions.test.tsx
@@ -121,6 +121,7 @@ function themeTemplates(): Record<TemplateKey, ThemeAst> {
     cart: ast("cart"),
     checkout: ast("checkout"),
     search: ast("search"),
+    archive: ast("archive"),
   };
 }
 
diff --git a/src/components/store/songoskriti-preview-page.test.tsx b/src/components/store/songoskriti-preview-page.test.tsx
index e477973e..9f84989d 100644
--- a/src/components/store/songoskriti-preview-page.test.tsx
+++ b/src/components/store/songoskriti-preview-page.test.tsx
@@ -94,6 +94,7 @@ function templates(): Record<TemplateKey, ThemeAst> {
     cart: empty(),
     checkout: empty(),
     search: empty(),
+    archive: empty(),
   };
 }
 
diff --git a/src/components/store/ThemePreviewFrame.test.tsx b/src/components/store/ThemePreviewFrame.test.tsx
index e2c05714..e1048656 100644
--- a/src/components/store/ThemePreviewFrame.test.tsx
+++ b/src/components/store/ThemePreviewFrame.test.tsx
@@ -66,6 +66,7 @@ function buildTemplates(): Record<TemplateKey, ThemeAst> {
     cart: empty(),
     checkout: empty(),
     search: empty(),
+    archive: empty(),
   };
 }
 
@@ -357,6 +358,7 @@ describe("preview skin sheets (lane B2-1)", () => {
       cart: empty(),
       checkout: empty(),
       search: empty(),
+      archive: empty(),
     };
   }
 
diff --git a/src/components/store/ThemePreviewFrame.tsx b/src/components/store/ThemePreviewFrame.tsx
index 8cd2457c..7c8b7f87 100644
--- a/src/components/store/ThemePreviewFrame.tsx
+++ b/src/components/store/ThemePreviewFrame.tsx
@@ -123,7 +123,7 @@ const SONGOSKRITI_PREVIEW_SEARCH_PATH = "/store/songoskriti/search";
 const UNSUPPORTED_TEMPLATE_TITLE =
   "This template is not supported by this theme";
 const UNSUPPORTED_TEMPLATE_BODY =
-  "The theme does not author a body for this template, so there is nothing to preview. The archive surfaces are the blog listing and its category, tag and author archives, and they wear the blog template.";
+  "The theme does not author a body for this template, so there is nothing to preview. The archive is a first-class template a theme may author, and the platform's own reader surfaces — the blog listing and its category, tag and author archives — keep the platform grid, because they carry no store slug and so they cannot resolve a theme.";
 
 /**
  * The explicit unsupported state — a named panel, never a redirect.
@@ -565,13 +565,13 @@ export function ThemePreviewFrame({
     } as never);
   };
 
-  // D1 (Option A) — an unsupported template is an EXPLICIT state, never a
-  // silent redirect to the homepage. `?template=archive` is unsupported: the
-  // archive surface is the blog taxonomy surface (index / category / tag /
-  // author) and it wears the `blog` template, so no `archive` key exists
-  // (the escalation record's §(l.1)). When the theme does not author the
-  // requested template the canvas renders the named "not supported by this
-  // theme" panel instead of the homepage body.
+  // Decision D1' — an unsupported template is an EXPLICIT state, never a
+  // silent redirect to the homepage. `archive` IS a template key now (the
+  // content archive is a first-class theme part), so it is authored like any
+  // other; a key the platform still does not know — say
+  // `?template=blog_anything` — is the unsupported request, and when the
+  // theme does not author the requested template the canvas renders the
+  // named "not supported by this theme" panel instead of the homepage body.
   const templatesByKey: Partial<Record<TemplateKey, ThemeAst>> = templates;
   const authored = templatesByKey[template];
   const unsupported = authored === undefined;
@@ -849,6 +849,26 @@ export function ThemePreviewFrame({
         }
       : undefined;
 
+  // The archive template's functional slots (Decision D1'). The content
+  // archive is a LISTING page: the platform's own `category_header` grant,
+  // the blog pack (terms / listing / pager) and the paging + empty state.
+  //
+  // The grant set is EXACTLY the archive body's six slots — the same set
+  // the deferred merchant-scoped route must grant when it lands. A grant
+  // the body does not use would be a permission the theme never asked for,
+  // and a slot the body DOES use that is not granted renders nothing.
+  const archiveSlots =
+    template === "archive"
+      ? {
+          category_header: null,
+          blog_terms: null,
+          blog_archive: null,
+          blog_pager: null,
+          pagination: null,
+          empty_state: null,
+        }
+      : undefined;
+
   // The preview has no CMS page record: `page_content` is a CONTEXT widget
   // (`src/components/builder/widgets.tsx:1617`), so the host must hand it a
   // node. Without one the fixed page template renders chrome with an empty
@@ -993,6 +1013,7 @@ export function ThemePreviewFrame({
                             ...searchSlots,
                             ...blogSlots,
                             ...pageSlots,
+                            ...archiveSlots,
                           }}
                           productSlot={searchProductSlot}
                           primary={section.id === primaryId}
@@ -1035,6 +1056,7 @@ export function ThemePreviewFrame({
                             ...searchSlots,
                             ...blogSlots,
                             ...pageSlots,
+                            ...archiveSlots,
                           }}
                         />
                       ))}
@@ -1063,6 +1085,7 @@ export function ThemePreviewFrame({
                               ...searchSlots,
                               ...blogSlots,
                               ...pageSlots,
+                              ...archiveSlots,
                             }}
                             productSlot={searchProductSlot}
                             primary={section.id === primaryId}
@@ -1093,6 +1116,7 @@ export function ThemePreviewFrame({
                                 ...searchSlots,
                                 ...blogSlots,
                                 ...pageSlots,
+                                ...archiveSlots,
                               }}
                             />
                           ))}
diff --git a/src/lib/builder-ast.ts b/src/lib/builder-ast.ts
index ba125fd3..e4ec4f41 100644
--- a/src/lib/builder-ast.ts
+++ b/src/lib/builder-ast.ts
@@ -56,6 +56,10 @@ export const TEMPLATE_KEYS = [
   // merchant designs the listing shoppers land on instead of inheriting a
   // hand-written page.
   "search",
+  // Phase 3 (Decision D1'): the content archive — a category, a tag or an
+  // author's articles — is a first-class theme part too, so a merchant
+  // designs the archive shoppers land on instead of inheriting the blog body.
+  "archive",
 ] as const;
 export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
 
@@ -72,6 +76,10 @@ export const ROUTE_H1_TEMPLATES = [
   "page",
   "blog",
   "search",
+  // Phase 3 (Decision D1'): the archive route owns the heading — the
+  // resolved term's name — so a theme's archive body must not claim the
+  // page's <h1>.
+  "archive",
 ] as const;
 const ROUTE_H1 = new Set<string>(ROUTE_H1_TEMPLATES);
 export function routeSuppliesH1(template?: TemplateKey | null): boolean {
@@ -186,6 +194,9 @@ export const TEMPLATE_ZONES: Record<TemplateKey, readonly Zone[]> = {
   cart: ["header", "main", "footer", "sidebar", "drawer", "popup"],
   checkout: ["header", "main", "footer", "thank_you"],
   search: ["header", "main", "footer", ...OVERLAY_ZONES, "not_found"],
+  // The content archive is a listing page like the collection, so it wears
+  // the same overlay chrome and can host the 404 body.
+  archive: ["header", "main", "footer", ...OVERLAY_ZONES, "not_found"],
 };
 
 /** Zones a base template may host. Unknown templates host nothing. */
@@ -1503,7 +1514,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     group: "context",
     slots: ["header", "main"],
     heading: false,
-    templates: ["product", "collection", "page", "blog", "search"],
+    templates: ["product", "collection", "page", "blog", "search", "archive"],
     defaults: { homeLabel: "Home" },
     fields: [text("homeLabel", "Home label", 40)],
   },
@@ -2693,7 +2704,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     group: "commerce",
     slots: ["main"],
     heading: true,
-    templates: ["collection", "page", "search"],
+    templates: ["collection", "page", "search", "archive"],
     defaults: {
       heading: "All products",
       body: "",
@@ -2795,7 +2806,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     group: "commerce",
     slots: ["main"],
     heading: false,
-    templates: ["collection", "blog", "search"],
+    templates: ["collection", "blog", "search", "archive"],
     defaults: {
       mode: "numbered",
       moreLabel: "Load more",
@@ -2826,7 +2837,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     group: "commerce",
     slots: ["main"],
     heading: false,
-    templates: ["collection", "page", "search"],
+    templates: ["collection", "page", "search", "archive"],
     defaults: {
       heading: "Nothing matches those filters",
       body: "Try removing a filter or searching for something else.",
@@ -4835,7 +4846,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     label: "Blog archive",
     group: "content",
     slots: ["main"],
-    templates: ["blog", "page"],
+    templates: ["blog", "page", "archive"],
     heading: false,
     defaults: {
       heading: "",
@@ -4887,7 +4898,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     label: "Blog topics",
     group: "content",
     slots: ["header", "main", "footer"],
-    templates: ["blog", "page"],
+    templates: ["blog", "page", "archive"],
     heading: false,
     defaults: { heading: "", style: "pills", showCounts: true },
     fields: [
@@ -4910,7 +4921,7 @@ const BASE_CATALOG: CatalogEntry[] = [
     label: "Blog pagination",
     group: "content",
     slots: ["main", "footer"],
-    templates: ["blog", "page"],
+    templates: ["blog", "page", "archive"],
     heading: false,
     defaults: { align: "center" },
     fields: [
@@ -8454,6 +8465,15 @@ export function lintTemplate(
     cart: [
       { type: "cart_summary", message: "Cart template has no order summary." },
     ],
+    // Phase 3 (Decision D1'): the archive is a listing page, so it must
+    // carry the listing widget — the same shape as the `page` rule (the
+    // route-owned body slot) and the `cart` rule (the order summary).
+    archive: [
+      {
+        type: "blog_archive",
+        message: "Archive template has no archive listing.",
+      },
+    ],
   };
   for (const rule of required[template!] ?? []) {
     if (!all.some((s) => s.type === rule.type)) {
diff --git a/src/lib/builder-phase2a.test.ts b/src/lib/builder-phase2a.test.ts
index ab933b4b..f60b89ed 100644
--- a/src/lib/builder-phase2a.test.ts
+++ b/src/lib/builder-phase2a.test.ts
@@ -9,6 +9,7 @@ import { describe, expect, it } from "vitest";
 import {
   GLOBAL_REF_ENTRY,
   GLOBAL_REF_MISSING,
+  TEMPLATE_KEYS,
   TEMPLATE_ZONES,
   catalogEntry,
   globalRefTarget,
@@ -188,7 +189,10 @@ describe("parseTemplates variant compatibility", () => {
 describe("named zones allowlist", () => {
   it("allows the layout slots on every template", () => {
     const keys = Object.keys(TEMPLATE_ZONES) as TemplateKey[];
-    expect(keys).toHaveLength(9);
+    // The zone table is TOTAL against the union: a template the table
+    // drops would lose its zone allowlist without any error anywhere.
+    expect(keys).toHaveLength(TEMPLATE_KEYS.length);
+    expect(keys.sort()).toEqual([...TEMPLATE_KEYS].sort());
     for (const key of keys) {
       expect(zoneAllowed(key, "header")).toBe(true);
       expect(zoneAllowed(key, "main")).toBe(true);
diff --git a/src/lib/builder-seo.ts b/src/lib/builder-seo.ts
index ad6c196b..6bb948a7 100644
--- a/src/lib/builder-seo.ts
+++ b/src/lib/builder-seo.ts
@@ -322,6 +322,7 @@ const TEMPLATE_FALLBACK: Partial<Record<TemplateKey, string>> = {
   checkout: "Checkout",
   page: "Page",
   blog: "Journal",
+  archive: "Archive",
 };
 
 /**
diff --git a/src/lib/phase5-seo.test.ts b/src/lib/phase5-seo.test.ts
index 8502eb17..330e528f 100644
--- a/src/lib/phase5-seo.test.ts
+++ b/src/lib/phase5-seo.test.ts
@@ -45,9 +45,14 @@ describe("Phase 5 — one declared <h1> claimant per template", () => {
       "page",
       "blog",
       "search",
+      "archive",
     ]);
     expect(routeSuppliesH1("index")).toBe(false);
     expect(routeSuppliesH1("product")).toBe(true);
+    // The content archive is a route-h1 template too: the archive route
+    // owns the heading (the resolved term's name), so a theme's archive
+    // body must not claim the page's <h1>.
+    expect(routeSuppliesH1("archive")).toBe(true);
   });
 
   it("does not ask a route-h1 template for a primary heading", () => {
diff --git a/src/lib/storefront.functions.ts b/src/lib/storefront.functions.ts
index 72542c2d..fdfac3c4 100644
--- a/src/lib/storefront.functions.ts
+++ b/src/lib/storefront.functions.ts
@@ -105,6 +105,7 @@ export const getStoreChrome = createServerFn({ method: "GET" })
           "cart",
           "checkout",
           "account",
+          "archive",
         ]),
       })
       .parse(d),
diff --git a/src/lib/theme-package.ts b/src/lib/theme-package.ts
index 1a0a94d4..630c7703 100644
--- a/src/lib/theme-package.ts
+++ b/src/lib/theme-package.ts
@@ -43,7 +43,11 @@ import { TEMPLATE_KEYS, type TemplateKey } from "./builder-ast";
 import type { SectionType } from "./builder-ast";
 import { WIDGET_TYPES } from "./widget-registry";
 import { BUILDER_API_VERSION, satisfiesApiRange } from "./plugin-manifest";
-import { normalizeScopes, parseSemver } from "./marketplace-scopes";
+import {
+  compareSemver,
+  normalizeScopes,
+  parseSemver,
+} from "./marketplace-scopes";
 import { scanThemeTrustContent } from "./package-review";
 
 export { BUILDER_API_VERSION };
@@ -142,6 +146,16 @@ export type ThemeManifest = {
   /**
    * Builder API range. Must cover the running builder (`^3.0.0` line) —
    * same caret / `>=a <b` semantics as plugins (`satisfiesApiRange`).
+   *
+   * Phase 3 (Decision D1') — the archive key is ADDITIVE, so the range
+   * value does not move: `THEME_API_RANGE` stays `^3.0.0` and the running
+   * API stays `3.1.0` (`BUILDER_API_VERSION`). The ONE exception is a
+   * package that DECLARES `archive`: it must declare a range whose lower
+   * bound is `>= 3.1.0`, because that is the API line the archive key
+   * landed in. A package that declares `archive` while claiming a lower
+   * bound is rejected with the stable reason code
+   * `templates.archive_requires_api`; every package that does NOT declare
+   * `archive` keeps working exactly as it does today.
    */
   api: string;
   /** Marketplace display author. */
@@ -184,6 +198,22 @@ const PLUGIN_WIDGET_REF_RE =
 const CARET_RANGE_RE = /^\^(\d+\.\d+\.\d+)$/;
 const PAIR_RANGE_RE = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/;
 
+/**
+ * The floor a declared range admits — the API line the package was built
+ * against. `^3.0.0` floors at `3.0.0`, `>=3.0.0 <4.0.0` floors at `3.0.0`
+ * and an exact pin `3.1.0` floors at `3.1.0`. Null for a range shape this
+ * module does not understand (the range validators report that separately).
+ */
+function apiRangeFloor(range: string): string | null {
+  const trimmed = range.trim();
+  const caret = CARET_RANGE_RE.exec(trimmed);
+  if (caret) return caret[1]!;
+  const pair = PAIR_RANGE_RE.exec(trimmed);
+  if (pair) return pair[1]!;
+  if (/^\d+\.\d+\.\d+$/.test(trimmed)) return trimmed;
+  return null;
+}
+
 /**
  * Executable-content ban for every free-text field in the format. Mirrors
  * the sanitiser pins (`src/lib/builder-ast.ts:7396`: `javascript:` /
@@ -369,6 +399,20 @@ export function validateThemeManifest(input: unknown): ThemeVerdict {
       }
       if (unknown.length) errors.push(`templates:${unknown.join(",")}`);
     }
+    // Phase 3 (Decision D1') — the archive key is additive, so only a
+    // package that DECLARES `archive` is held to the API line the key
+    // landed in. `THEME_API_RANGE` stays `^3.0.0` and `BUILDER_API_VERSION`
+    // stays `3.1.0`; a package that declares `archive` must declare a
+    // range whose lower bound is `>= 3.1.0`, and one that claims a lower
+    // bound is rejected with the stable reason code
+    // `templates.archive_requires_api`. Every package that does not
+    // declare `archive` is unaffected.
+    if (templates.includes("archive")) {
+      const floor = apiRangeFloor(api);
+      if (floor !== null && compareSemver(floor, BUILDER_API_VERSION) < 0) {
+        errors.push("templates.archive_requires_api");
+      }
+    }
 
     // --- supportedWidgets (every entry must exist in the catalog) ---
     const supportedWidgets: SectionType[] = [];
diff --git a/src/lib/theme-preview-nav.test.ts b/src/lib/theme-preview-nav.test.ts
index 0c497d64..dd515bc3 100644
--- a/src/lib/theme-preview-nav.test.ts
+++ b/src/lib/theme-preview-nav.test.ts
@@ -127,6 +127,7 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     cart: "heading",
     checkout: "heading",
     search: "category_header",
+    archive: "category_header",
   };
   it("authors demo content for every template (no empty sub-pages)", () => {
     const preset = resolveThemePreview("songoskriti")!;
diff --git a/src/lib/theme-preview-nav.ts b/src/lib/theme-preview-nav.ts
index 1358ba19..e5ca9f82 100644
--- a/src/lib/theme-preview-nav.ts
+++ b/src/lib/theme-preview-nav.ts
@@ -279,15 +279,18 @@ const PREVIEW_TEMPLATE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
 export function validateThemePreviewSearch(search: Record<string, unknown>): {
   template: TemplateKey | undefined;
   /**
-   * The REQUESTED template key when it is NOT one of the nine template keys.
+   * The REQUESTED template key when it is NOT one of the template keys.
    *
-   * D1 (Option A): an unsupported template is an EXPLICIT state, never a
+   * Decision D1': an unsupported template is an EXPLICIT state, never a
    * silent homepage redirect. The key therefore has to REACH the preview
    * host, which resolves it against the theme's authored bodies and renders
    * the named "not supported by this theme" panel for a key it does not have
    * (`src/components/store/ThemePreviewFrame.tsx:575-578`). `template` above
    * keeps its meaning — a key the platform knows — and this field carries
-   * the request the platform does not know. It is OPTIONAL in the type (like
+   * the request the platform does not know. `archive` is a KNOWN key now
+   * (the content archive is a first-class template, Decision D1'), so it
+   * travels in `template`; the keys that reach this field are the ones the
+   * platform still does not know. It is OPTIONAL in the type (like
    * `variation` and `mock_order`) so the routes that navigate INTO the
    * preview with a known template keep their own search shape.
    *
@@ -317,8 +320,9 @@ export function validateThemePreviewSearch(search: Record<string, unknown>): {
   // pass used to read `template` only — and by then `template` was already
   // `undefined` for an unknown key — so the second pass DROPPED the carried
   // request, the canonical URL came out as the BARE path, and the router
-  // answered `?template=archive` with a 307 to the bare path, which renders
-  // the homepage composition instead of the explicit unsupported panel.
+  // answered `?template=blog_anything` with a 307 to the bare path, which
+  // renders the homepage composition instead of the explicit unsupported
+  // panel.
   //
   // Reading the carried key back makes the validation idempotent: the
   // canonical URL keeps the request, and the canonical URL is stable (a
@@ -420,6 +424,7 @@ const GENERIC_TITLES: Record<TemplateKey, [string, string]> = {
   cart: ["Your bag", "আপনার ব্যাগ"],
   checkout: ["Checkout", "চেকআউট"],
   search: ["Search results", "খোঁজার ফলাফল"],
+  archive: ["Archive", "আর্কাইভ"],
 };
 
 /**
diff --git a/src/lib/themes.server.ts b/src/lib/themes.server.ts
index e4ff98d1..998ba3ef 100644
--- a/src/lib/themes.server.ts
+++ b/src/lib/themes.server.ts
@@ -15,9 +15,11 @@ import { incr, log, withSpan } from "./observability.server";
 import { rateLimit } from "./rate-limit.server";
 import {
   DEFAULT_TOKENS,
+  EMPTY_AST,
   TEMPLATE_KEYS,
   assertPayloadWithinLimits,
   isSkinnableType,
+  isTemplateKey,
   isVariantTemplateKey,
   takeSanitiserRejects,
   lintTemplate,
@@ -29,6 +31,8 @@ import {
   type Section,
   type SectionType,
   type TemplateKey,
+  type TemplateMap,
+  type ThemeAst,
   type ThemeTemplates,
   type ThemeTokens,
 } from "./builder-ast";
@@ -826,6 +830,47 @@ async function auditPublish(
 }
 
 /** Publish blocks on lint errors: a broken page never reaches shoppers. */
+/**
+ * The BASE key of a variant key (`archive_category` -> `archive`), or null
+ * when the key is not a variant at all.
+ */
+function variantBaseKey(key: string): TemplateKey | null {
+  if (!isVariantTemplateKey(key)) return null;
+  const sep = key.indexOf("_");
+  if (sep < 1) return null;
+  const base = key.slice(0, sep);
+  return isTemplateKey(base) ? base : null;
+}
+
+/**
+ * Lint every template a map carries. Each VARIANT is linted with its BASE
+ * key (`archive_category` as `archive`, `blog_article` as `blog`), so a
+ * context widget inside a variant is checked against the template that owns
+ * the data. Linting a variant as if it were a template would make every
+ * context widget inside it a publish-blocking "needs data this template
+ * does not provide" error, because no widget's catalogue allowlist names a
+ * variant key.
+ */
+function lintTemplateMap(templates: TemplateMap): string[] {
+  const out: string[] = [];
+  const report = (key: string, base: TemplateKey, ast: ThemeAst): void => {
+    for (const issue of lintTemplate(ast, base)) {
+      if (issue.level !== "error") continue;
+      out.push(`${key}: ${issue.message}`);
+    }
+  };
+  for (const key of TEMPLATE_KEYS) {
+    report(key, key, templateOf(templates, key));
+  }
+  for (const [key, ast] of Object.entries(templates)) {
+    if (isTemplateKey(key)) continue;
+    const base = variantBaseKey(key);
+    if (!base || !ast) continue;
+    report(key, base, ast);
+  }
+  return out;
+}
+
 export async function publishVersion(
   db: Client,
   merchantId: string,
@@ -850,11 +895,7 @@ export async function publishVersion(
     { templates: resolved.templates, tokens: resolved.tokens },
     "publish",
   );
-  const lint = TEMPLATE_KEYS.flatMap((key) =>
-    lintTemplate(templateOf(templates, key), key)
-      .filter((issue) => issue.level === "error")
-      .map((issue) => `${key}: ${issue.message}`),
-  );
+  const lint = lintTemplateMap(templates);
   // Phase 9: missing বাংলা only warns per string, but a theme that is more than
   // 10% untranslated cannot go live half-Bangla.
   const translation = translationGate(translationCoverage(templates)).map(
@@ -1233,6 +1274,65 @@ export async function loadRegistryPackage(
   };
 }
 
+/**
+ * The merchant's CURRENT template map — the one the install's RPC is about
+ * to replace.
+ *
+ * The routine writes to the merchant's ACTIVE theme, else the OLDEST one
+ * (`order by is_active desc, created_at asc limit 1`), so this read mirrors
+ * that rule exactly: the merge is applied to the map the RPC replaces, not
+ * to some other theme's. A failed read never breaks an install — the seed
+ * then behaves exactly as it did before the merge existed.
+ */
+async function readMerchantTemplateMap(
+  db: Client,
+  merchantId: string,
+): Promise<Record<string, unknown> | null> {
+  try {
+    const theme = await db
+      .from("store_themes")
+      .select("id")
+      .eq("merchant_id", merchantId)
+      .order("is_active", { ascending: false })
+      .order("created_at", { ascending: true })
+      .limit(1)
+      .maybeSingle();
+    const themeId = theme.data?.id;
+    if (!themeId) return null;
+    const draft = await db
+      .from("theme_drafts")
+      .select("templates")
+      .eq("theme_id", themeId)
+      .maybeSingle();
+    const stored = draft.data?.templates;
+    if (!stored || typeof stored !== "object") return null;
+    return stored as Record<string, unknown>;
+  } catch {
+    return null;
+  }
+}
+
+/**
+ * The per-key seed merge. A key the merchant's map already carries is NEVER
+ * overwritten — their authored template survives the install. A key it does
+ * not carry is filled from the package's default, which is how a NEW
+ * template key (the archive) reaches a merchant whose map predates it.
+ * Variant keys ride the same map and are carried through untouched.
+ */
+function mergeSeedTemplates(
+  current: Record<string, unknown>,
+  preset: ThemeTemplates,
+): Record<string, unknown> {
+  const merged: Record<string, unknown> = { ...current };
+  let changed = false;
+  for (const [key, ast] of Object.entries(preset)) {
+    if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
+    merged[key] = ast;
+    changed = true;
+  }
+  return changed ? merged : (preset as unknown as Record<string, unknown>);
+}
+
 /**
  * Install an official theme as a draft version *and* fork it into the editable
  * draft. The package is validated and linted server-side before the RPC runs,
@@ -1265,12 +1365,24 @@ export async function installRegistryTheme(
       incr("framique_theme_install_total", { result: "rejected" });
       throw err;
     }
+    // The seed merge. The RPC `theme_install_preset` REPLACES the draft's
+    // map verbatim (`delete from public.theme_drafts …; insert …
+    // _preset->'templates'`), so "fill only the keys the merchant's map does
+    // not have" cannot live in SQL — no applied migration is edited. It is
+    // implemented HERE, in TypeScript, and the MERGED map is what the RPC
+    // receives. That is how the new `archive` default reaches a merchant
+    // whose map predates the key, without a single merchant-authored
+    // template being overwritten.
+    const current = await readMerchantTemplateMap(db, merchantId);
+    const templates = current
+      ? mergeSeedTemplates(current, pkg.templates)
+      : (pkg.templates as unknown as Record<string, unknown>);
     const versionId = await rpc<string>(db, "theme_install_preset", {
       _merchant_id: merchantId,
       _key: key,
       _preset: {
         tokens: pkg.tokens,
-        templates: pkg.templates,
+        templates,
       } as unknown as Json,
       _overwrite_draft: overwriteDraft,
     });
@@ -1314,7 +1426,12 @@ export async function previewPresetSwap(
 /* ------------------------------------------------------------ update / diff */
 
 export type TemplateDiff = {
-  template: TemplateKey;
+  /**
+   * The template the diff is about — a base key (`archive`) OR a variant
+   * key (`archive_category`). A theme update carries the variants too, so
+   * the diff must be able to name them.
+   */
+  template: string;
   added: string[];
   removed: string[];
   changed: string[];
@@ -1344,18 +1461,44 @@ function digestSection(section: {
   ]);
 }
 
-function sectionsOf(templates: ThemeTemplates, key: TemplateKey) {
-  const ast = templateOf(templates, key);
+function sectionsOf(templates: ThemeTemplates, key: string) {
+  const bag = templates as Record<string, ThemeAst | undefined>;
+  const ast = bag[key] ?? EMPTY_AST;
   return [...ast.header, ...ast.main, ...ast.footer];
 }
 
+/**
+ * Every key a template map carries — the base keys plus the VARIANT keys
+ * (`blog_article`, `archive_category`). A theme update must carry the
+ * variants: `parseTemplates` persists them in the same map, so a merge that
+ * looped over `TEMPLATE_KEYS` alone would silently drop every one of them
+ * across an update.
+ */
+function templateMapKeys(
+  ...maps: Array<Record<string, unknown> | undefined>
+): string[] {
+  const out: string[] = [];
+  const push = (key: string): void => {
+    if (!out.includes(key)) out.push(key);
+  };
+  for (const key of TEMPLATE_KEYS) push(key);
+  for (const map of maps) {
+    for (const key of Object.keys(map ?? {})) {
+      if (isTemplateKey(key)) continue;
+      if (!isVariantTemplateKey(key)) continue;
+      push(key);
+    }
+  }
+  return out;
+}
+
 /** Section-level diff between the merchant's current tree and the new package. */
 export function diffTemplates(
   mine: ThemeTemplates,
   upstream: ThemeTemplates,
 ): TemplateDiff[] {
   const out: TemplateDiff[] = [];
-  for (const key of TEMPLATE_KEYS) {
+  for (const key of templateMapKeys(mine, upstream)) {
     const mineMap = new Map(sectionsOf(mine, key).map((s) => [s.id, s]));
     const upMap = new Map(sectionsOf(upstream, key).map((s) => [s.id, s]));
     const added = [...upMap.keys()].filter((id) => !mineMap.has(id));
@@ -1379,11 +1522,13 @@ export function mergeTemplates(
   mine: ThemeTemplates,
   upstream: ThemeTemplates,
   mode: UpdateMode,
-): ThemeTemplates {
-  const merged: ThemeTemplates = {};
-  for (const key of TEMPLATE_KEYS) {
-    const mineAst = templateOf(mine, key);
-    const upAst = templateOf(upstream, key);
+): TemplateMap {
+  const merged: Record<string, ThemeAst> = {};
+  for (const key of templateMapKeys(mine, upstream)) {
+    const mineBag = mine as Record<string, ThemeAst | undefined>;
+    const upBag = upstream as Record<string, ThemeAst | undefined>;
+    const mineAst = mineBag[key] ?? EMPTY_AST;
+    const upAst = upBag[key] ?? EMPTY_AST;
     const hasUp =
       upAst.header.length || upAst.main.length || upAst.footer.length;
     const hasMine =
@@ -1424,7 +1569,7 @@ export function mergeTemplates(
       };
     }
   }
-  return merged;
+  return merged as TemplateMap;
 }
 
 /** What an update would change, computed against the merchant's live draft. */
@@ -1491,12 +1636,7 @@ export async function applyThemeUpdate(
       pkg.templates,
       input.mode,
     );
-    const blocking = (Object.keys(templates) as TemplateKey[]).flatMap(
-      (templateKey) =>
-        lintTemplate(templates[templateKey]!, templateKey).filter(
-          (issue) => issue.level === "error",
-        ),
-    );
+    const blocking = lintTemplateMap(templates);
     if (blocking.length) {
       incr("framique_theme_update_total", { result: "rejected" });
       throw new BuilderError(
diff --git a/src/lib/themes/songoskriti/archive-contract.test.ts b/src/lib/themes/songoskriti/archive-contract.test.ts
index 648d0b8d..7f7add98 100644
--- a/src/lib/themes/songoskriti/archive-contract.test.ts
+++ b/src/lib/themes/songoskriti/archive-contract.test.ts
@@ -1,15 +1,16 @@
 /**
- * Task 10 — the archive contract (Decision D1, Option A) and the preview's
- * explicit unsupported state.
+ * Task 10 — the archive contract (Decision D1' — the archive key is REAL) and
+ * the preview's explicit unsupported state.
  *
  * The expert's archive item asked for "a real first-class template key only
  * after defining which archive-like routes it represents … and unsupported
- * routes must not silently redirect to the homepage". **D1 ruled Option A**:
- * the archive surface is the **blog taxonomy surface** (index / category /
- * tag / author), it wears the **`blog`** template plus the existing blog
- * pack, and **no `archive` template key is added**. What is left is the
- * contract itself — written down — plus the preview's **explicit unsupported
- * state** in place of the silent homepage fallback.
+ * routes must not silently redirect to the homepage". **D1' ruled the
+ * opposite of D1 (Option A)**: the content archive IS a first-class template
+ * key, its supported kinds are the three content-archive routes the platform
+ * actually serves (category / tag / author), and the preview keeps its
+ * **explicit unsupported state** for a key the platform still does not know.
+ * What is left is the contract itself — written down — plus the preview's
+ * explicit unsupported state in place of the silent homepage fallback.
  *
  * This suite pins the contract with **five** cases, none of which depends on
  * a ruling (the ruling is already made and is a decision, not a fact):
@@ -21,7 +22,10 @@
  *    preview's fallback is an explicit, named unsupported state, and the
  *    storefront's own routes answer an unknown slug with their own 404;
  * 4. the unsupported state's copy is **not** demo copy — the panel must not
- *    inherit the demo-copy defect Phase 1 removed;
+ *    inherit the demo-copy defect Phase 1 removed — and it states the
+ *    CURRENT ruling (the archive is a template a theme may author; the
+ *    platform's reader surfaces keep the platform grid because they carry no
+ *    store slug);
  * 5. the contract is **written down** — so it cannot be deleted silently.
  *
  * The tree is read as TEXT (the same pattern as
@@ -46,10 +50,16 @@ const SEARCH_CONTRACT = readFileSync(
   join(REPO, "src/lib/storefront-search.ts"),
   "utf8",
 );
+/**
+ * The Phase-3 escalation record — the one that carries the CURRENT ruling.
+ * The Phase-2 record (`phase2-template-completeness-escalation.md`) is a
+ * HISTORICAL document: it records the superseded D1 (Option A) and it is
+ * never rewritten.
+ */
 const RECORD = readFileSync(
   join(
     REPO,
-    "docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md",
+    "docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md",
   ),
   "utf8",
 );
@@ -108,7 +118,7 @@ function unsupportedStateCopy(): string {
   ].join("\n");
 }
 
-describe("the archive contract (Decision D1, Option A)", () => {
+describe("the archive contract (Decision D1' — the archive key is REAL)", () => {
   it("enumerates the archive-like routes the platform actually serves", () => {
     // The blog listing and its three taxonomy kinds, plus the storefront's
     // own blog index — the whole of the archive-like surface.
@@ -156,7 +166,7 @@ describe("the archive contract (Decision D1, Option A)", () => {
     }
   });
 
-  it("writes the unsupported state in copy that is not demo copy", () => {
+  it("writes the unsupported state in copy that is not demo copy and states the CURRENT ruling", () => {
     const copy = unsupportedStateCopy();
     // The panel says what it is: a statement about the theme's coverage.
     expect(copy).toContain("This template is not supported by this theme");
@@ -172,12 +182,29 @@ describe("the archive contract (Decision D1, Option A)", () => {
         `the unsupported state must not carry "${retired}"`,
       ).not.toContain(retired);
     }
+    // The D1 (Option A) wording is SUPERSEDED: the archive is a template a
+    // theme may author, and the platform's reader surfaces keep the
+    // platform grid because they carry no store slug. The old copy — the
+    // archive surfaces "wear the blog template" — would be false now.
+    expect(copy).toContain(
+      "The archive is a first-class template a theme may author",
+    );
+    expect(copy).toContain("keep the platform grid");
+    expect(copy).toContain("carry no store slug");
+    expect(copy).not.toContain("wear the blog template");
   });
 
   it("keeps the contract written down, so it cannot be deleted silently", () => {
-    expect(RECORD_TEXT).toContain("Archive contract (Decision D1, Option A)");
-    expect(RECORD_TEXT).toContain("No `archive` template key is added");
+    expect(RECORD_TEXT).toContain(
+      "Archive contract (Decision D1' — the archive key is REAL)",
+    );
+    expect(RECORD_TEXT).toContain("`archive` is a first-class template key");
+    expect(RECORD_TEXT).toContain(
+      "the three content-archive routes are its kinds",
+    );
+    expect(RECORD_TEXT).toContain(
+      "the platform reader surfaces keep the platform grid because they carry no store slug",
+    );
     expect(RECORD_TEXT).toContain("src/routes/store.$slug.blog.index.tsx");
-    expect(RECORD_TEXT).toContain("`?template=archive` therefore remains");
   });
 });
diff --git a/src/lib/themes/songoskriti/preview.ts b/src/lib/themes/songoskriti/preview.ts
index 014a040a..7494b200 100644
--- a/src/lib/themes/songoskriti/preview.ts
+++ b/src/lib/themes/songoskriti/preview.ts
@@ -239,6 +239,67 @@ export function songoskritiPreviewSource(
             }),
             s("blog_pager", { align: "center" }),
           ];
+        case "archive":
+          // The content archive — a category, a tag or an author's articles
+          // (Decision D1'). The platform owns the listing: the resolved
+          // term's name and description are ROUTE context, so the theme
+          // authors the FRAME around them and never the merchant's copy.
+          //
+          // The body is exactly: the `category_header` (the archive's own
+          // opening band), the blog pack (`blog_terms` + `blog_archive` +
+          // `blog_pager` — the listing surface and its facet rail), the
+          // `pagination` (the pager) and the `empty_state` (what an empty
+          // archive shows).
+          //
+          // NO `product_grid`: the grid reads the host's `productSlot` ONLY
+          // on the search template, so a grid here would render eight
+          // product skeletons — an archive has no product slot. NO
+          // `heading` and NO `rich_text`: `archive` is a route-h1 template,
+          // so the route owns the page's <h1> and the body carries no demo
+          // copy.
+          return [
+            s("category_header", {
+              // The route owns the page's <h1> (the resolved term's name),
+              // so this widget claims none: a blank `heading` is the
+              // platform's documented remedy for a heading-capable widget
+              // that must not be the primary heading.
+              heading: "",
+              // The merchant-safe label. The RESOLVED term's name and
+              // description are route context — the widget never carries a
+              // merchant's own copy.
+              title: "Archive",
+              title_bn: "আর্কাইভ",
+              description: "",
+              description_bn: "",
+              showBreadcrumb: true,
+              homeLabel: "Home",
+            }),
+            s("blog_terms", {
+              heading: "Browse the archive",
+              heading_bn: "আর্কাইভ দেখুন",
+              style: "pills",
+              showCounts: true,
+            }),
+            s("blog_archive", {
+              heading: "Articles",
+              heading_bn: "প্রবন্ধ",
+              layout: "magazine",
+              columns: 3,
+              limit: 9,
+              showCover: true,
+              showExcerpt: true,
+              showMeta: true,
+            }),
+            s("blog_pager", { align: "center" }),
+            s("pagination", { mode: "numbered", pageLabel: "Page" }),
+            s("empty_state", {
+              heading: "Nothing in this archive yet",
+              body: "Published articles in this category, tag or author archive appear here.",
+              clearLabel: "",
+              showSuggestions: false,
+              limit: 4,
+            }),
+          ];
         case "search":
           // The platform owns the search: it executes the query, authorizes the
           // tenant and prices the results (`store.$slug.search.tsx:42-105`),
diff --git a/src/lib/themes/songoskriti/template-distinctness.ts b/src/lib/themes/songoskriti/template-distinctness.ts
index 909cd64a..5f090dec 100644
--- a/src/lib/themes/songoskriti/template-distinctness.ts
+++ b/src/lib/themes/songoskriti/template-distinctness.ts
@@ -198,6 +198,39 @@ export const SONOSKRITI_TEMPLATE_EXPECTATIONS: Record<
     ],
     forbiddenTypes: ["rich_text", "heading"],
   },
+  // Phase 3 (Decision D1') — the content archive. The row is NOT empty: a
+  // table that quietly drops a template is a gate that quietly stops
+  // guarding it, so the archive's own composition is declared here.
+  //
+  // Every `requiredSlots` entry is one of the SEVEN catalogue rows that
+  // carry `"archive"` in their allowlist, which is exactly what `R3`
+  // requires: a required slot must be present, must be a context widget and
+  // must be granted on the `archive` template. `heading` is forbidden
+  // because `archive` is a route-h1 template (a second <h1> is a lint
+  // error) and `rich_text` is forbidden for the same reason the `search`
+  // row forbids it (`R4` — no demo copy that could impersonate the
+  // merchant's content). `product_grid` is forbidden because the grid
+  // reads the host's `productSlot` only on the search template, so a grid
+  // on an archive would render skeletons.
+  archive: {
+    requiredTypes: [
+      "category_header",
+      "blog_terms",
+      "blog_archive",
+      "blog_pager",
+      "pagination",
+      "empty_state",
+    ],
+    requiredSlots: [
+      "category_header",
+      "blog_terms",
+      "blog_archive",
+      "blog_pager",
+      "pagination",
+      "empty_state",
+    ],
+    forbiddenTypes: ["product_grid", "heading", "rich_text"],
+  },
 };
 
 /* -------------------------------------------- the documented exceptions */
@@ -224,9 +257,9 @@ export const SONOSKRITI_APPROVED_EXCEPTIONS: Partial<
   },
   blog: {
     reason:
-      "the storefront blog is themeless by design (`src/components/store/BlogArchiveTheme.tsx:1-9`, pinned by `src/components/store/BlogArchiveTheme.test.tsx:82`, Decision **D5**). The template is a preview surface until D5 is ruled; the gate therefore requires the pack sections and does not require a storefront render path.",
+      "the platform reader surfaces are STORE-LESS, not themeless: `/blog`, `/blog/category/$slug`, `/blog/tag/$slug` and `/blog/author/$slug` carry no store slug, so none of them can resolve a theme — `getStoreChrome` needs one (`src/lib/storefront.functions.ts:94-111`), a term carries `merchant_id` and a slug that is unique per merchant rather than globally (`src/lib/blog-index.server.ts:304-328`), and the author archive is not merchant-scoped at all (`src/lib/blog-reader.server.ts:378-384`). They therefore keep the platform grid, while the CONTENT-ARCHIVE routes may be served by the `archive` template (Decision **D1'**). The gate requires the pack sections and does not require a storefront render path.",
     basis:
-      "Decision **D5** — the storefront reader blog is themeless by design (`src/components/store/BlogArchiveTheme.tsx:1-9`, pinned by `src/components/store/BlogArchiveTheme.test.tsx:82`).",
+      "Decision **D1'** supersedes Decision **D5**: the platform reader surfaces are store-less, not themeless (`src/lib/storefront.functions.ts:94-111`, `src/lib/blog-index.server.ts:304-328`, `src/lib/blog-reader.server.ts:378-384`); the content archive is the `archive` template.",
   },
   search: {
     reason:
diff --git a/src/lib/themes/songoskriti/unsupported-template-state.test.tsx b/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
index 28eebda5..165a150a 100644
--- a/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
+++ b/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
@@ -2,17 +2,18 @@
  * The preview's EXPLICIT unsupported state is REACHABLE (final-review fix
  * round, 2026-10-21).
  *
- * The archive contract (Decision **D1, Option A**) says an unsupported
- * template is an explicit state — "This template is not supported by this
- * theme", naming the key, linking back to the home tab — and **never** a
- * silent redirect to the homepage (the escalation record's §(l.1)-(l.3)).
+ * The archive contract (Decision **D1'** — the archive key is REAL) says
+ * an unsupported template is an explicit state — "This template is not
+ * supported by this theme", naming the key, linking back to the home tab —
+ * and **never** a silent redirect to the homepage (the escalation record's
+ * §(l.1)-(l.3)).
  * The evidence record's §(B) row carried a ✅ for that, and in the shipped
  * tree the state was **unreachable**:
  *
  *   · the route's own search validation dropped every `?template=` value
- *     that is not one of the nine template keys
+ *     that is not one of the template keys
  *     (`validateThemePreviewSearch`, `src/lib/theme-preview-nav.ts`), so
- *     `?template=archive` never reached the preview host at all; and
+ *     `?template=blog_anything` never reached the preview host at all; and
  *   · the host computes its unsupported state from a **missing** key
  *     (`src/components/store/ThemePreviewFrame.tsx:575-578`, consumed at
  *     `:935-937`), so the branch could not fire while the route could only
@@ -35,14 +36,15 @@
  * rebuilds the URL with `_includeValidateSearch: true`, which validates the
  * ALREADY-VALIDATED search again and answers with a **307 to the canonical
  * URL** when it differs from the requested one. A validation that is not
- * **idempotent** therefore rewrites `?template=archive` to the **bare path**
- * — and the bare path renders the homepage composition. That was the live
- * defect (measured: 307 → `/theme-preview/songoskriti` → the homepage body,
- * the panel heading zero times). The second suite reproduces the router's
+ * **idempotent** therefore rewrites `?template=blog_anything` to the **bare
+ * path** — and the bare path renders the homepage composition. That was the
+ * live defect (measured: 307 → `/theme-preview/songoskriti` → the homepage
+ * body, the panel heading zero times). The second suite reproduces the
+ * router's
  * own canonicalisation headlessly (the same `createRouter` the app runs, the
  * route's own `validateSearch`) and asserts that the canonical URL carries
  * the request, that it is a fixed point (no redirect loop) and that the
- * panel renders for `?template=archive` **through the route**.
+ * panel renders for `?template=blog_anything` **through the route**.
  *
  * The route module IS imported — the preview route is a public, host-gated
  * route and its `validateSearch` is the exact function under test (the
@@ -190,11 +192,15 @@ function renderRequested(search: Record<string, unknown>): string {
 
 describe("the preview's unsupported template state is reachable", () => {
   it("the route's search validation carries an unknown key instead of dropping it", () => {
-    const search = validateThemePreviewSearch({ template: "archive" });
+    // `blog_anything` is key-shaped and STILL UNKNOWN to the platform, so
+    // it is the unsupported request. `archive` is a KNOWN key now (the
+    // content archive is a first-class template), so it travels in
+    // `template` and is never carried as an unsupported request.
+    const search = validateThemePreviewSearch({ template: "blog_anything" });
     // The known-key slot keeps its meaning — a key the platform knows.
     expect(search.template).toBeUndefined();
     // The REQUEST is carried, so it can reach the host.
-    expect(search.unsupportedTemplate).toBe("archive");
+    expect(search.unsupportedTemplate).toBe("blog_anything");
     // A key the platform knows is not an unsupported request.
     const known = validateThemePreviewSearch({ template: "search" });
     expect(known.template).toBe("search");
@@ -224,11 +230,11 @@ describe("the preview's unsupported template state is reachable", () => {
   });
 
   it("an unknown ?template= reaches the host and renders the explicit unsupported state", () => {
-    const html = renderRequested({ template: "archive" });
+    const html = renderRequested({ template: "blog_anything" });
     // The panel's own heading.
     expect(html).toContain("This template is not supported by this theme");
     // It NAMES the requested key.
-    expect(html).toContain("archive");
+    expect(html).toContain("blog_anything");
     // It LINKS BACK to the home tab.
     expect(html).toContain('href="/"');
     expect(html).toContain("Back to the home tab");
@@ -240,12 +246,12 @@ describe("the preview's unsupported template state is reachable", () => {
     // The homepage really renders its own copy …
     expect(home).toContain(HOME_MARKER);
     // … and the unsupported state does not.
-    const unsupported = renderRequested({ template: "archive" });
+    const unsupported = renderRequested({ template: "blog_anything" });
     expect(unsupported).not.toContain(HOME_MARKER);
   });
 
   it("the unsupported state carries none of the retired demo strings", () => {
-    const html = renderRequested({ template: "archive" });
+    const html = renderRequested({ template: "blog_anything" });
     for (const retired of RETIRED_DEMO_STRINGS) {
       expect(
         html,
@@ -260,19 +266,20 @@ describe("the preview's unsupported template state is reachable", () => {
     expect(html).not.toContain("This template is not supported by this theme");
   });
 
-  it("the assembled templates carry the nine keys and not the requested one", () => {
+  it("the assembled templates carry the ten keys and not the requested one", () => {
     // The engine synthesises a body for every key it KNOWS; an unknown key
     // is absent from the map, which is what the host turns into the panel.
-    expect(Object.keys(preset.templates)).toHaveLength(9);
+    // Ten keys now — `archive` joined the union with Decision D1'.
+    expect(Object.keys(preset.templates)).toHaveLength(10);
     expect(
-      (preset.templates as Record<string, unknown>)["archive"],
+      (preset.templates as Record<string, unknown>)["blog_anything"],
     ).toBeUndefined();
   });
 
   it("the request ends with the visit — a switch clears it from the URL", () => {
     const next = previewSearchForSwitch("index", null, null, {
       template: undefined,
-      unsupportedTemplate: "archive",
+      unsupportedTemplate: "blog_anything",
     });
     expect(next.template).toBe("index");
     expect(next.unsupportedTemplate).toBeUndefined();
@@ -285,8 +292,8 @@ describe("the preview's unsupported template state is reachable", () => {
     const validate = Route.options.validateSearch as (
       search: Record<string, unknown>,
     ) => Record<string, unknown>;
-    expect(validate({ template: "archive" }).unsupportedTemplate).toBe(
-      "archive",
+    expect(validate({ template: "blog_anything" }).unsupportedTemplate).toBe(
+      "blog_anything",
     );
     // … and the route reads the request out of its own validated search …
     expect(ROUTE_SRC).toContain("unsupportedTemplate");
@@ -305,8 +312,8 @@ describe("the preview's unsupported template state is reachable", () => {
  * validates the search more than once per request, and the SSR
  * canonicalisation answers with a **307 to the canonical URL** when the
  * canonical URL differs from the requested one. A non-idempotent validation
- * silently rewrote `?template=archive` to the bare path, and the bare path
- * renders the homepage composition — the live defect.
+ * silently rewrote `?template=blog_anything` to the bare path, and the
+ * bare path renders the homepage composition — the live defect.
  * ------------------------------------------------------------------------- */
 
 /**
@@ -354,44 +361,47 @@ function searchOf(href: string): Record<string, unknown> {
 
 describe("the unsupported request survives the route's canonicalisation", () => {
   it("the search validation is idempotent — the request survives a second pass", () => {
-    const first = validateThemePreviewSearch({ template: "archive" });
-    expect(first.unsupportedTemplate).toBe("archive");
+    const first = validateThemePreviewSearch({ template: "blog_anything" });
+    expect(first.unsupportedTemplate).toBe("blog_anything");
     // The SECOND pass is what the router's canonicalisation runs over the
     // already-validated search. A validation that drops the request here
     // is what rewrote the URL to the bare path.
     const second = validateThemePreviewSearch(
       first as unknown as Record<string, unknown>,
     );
-    expect(second.unsupportedTemplate).toBe("archive");
+    expect(second.unsupportedTemplate).toBe("blog_anything");
     expect(second.template).toBeUndefined();
     // … and it is a fixed point, so the canonical URL never drifts.
     const third = validateThemePreviewSearch(
       second as unknown as Record<string, unknown>,
     );
-    expect(third.unsupportedTemplate).toBe("archive");
+    expect(third.unsupportedTemplate).toBe("blog_anything");
   });
 
   it("the canonical URL carries the request — it is NOT the bare path", async () => {
     const canonical = await canonicalPreviewHref(
-      "/theme-preview/songoskriti?template=archive",
+      "/theme-preview/songoskriti?template=blog_anything",
     );
     // The bare path is the homepage composition — the defect.
     expect(canonical).not.toBe("/theme-preview/songoskriti");
     // The canonical URL carries the request, so the panel can be served.
-    expect(canonical).toContain("unsupportedTemplate=archive");
+    expect(canonical).toContain("unsupportedTemplate=blog_anything");
   });
 
   it("the canonical URL is a fixed point — the request is answered, not looped", async () => {
     const canonical = await canonicalPreviewHref(
-      "/theme-preview/songoskriti?template=archive",
+      "/theme-preview/songoskriti?template=blog_anything",
     );
     // Asking for the canonical URL must not redirect again.
     expect(await canonicalPreviewHref(canonical)).toBe(canonical);
   });
 
   it("a template the theme authors is not canonicalised at all", async () => {
-    // The nine known keys keep their URL exactly — no new redirect.
-    for (const key of ["search", "index", "product", "collection"]) {
+    // The known keys keep their URL exactly — no new redirect. `archive` is
+    // one of them now (Decision D1'): the content archive is a first-class
+    // template, so it travels in `template` and is never carried as an
+    // unsupported request.
+    for (const key of ["search", "index", "product", "collection", "archive"]) {
       expect(
         await canonicalPreviewHref(
           `/theme-preview/songoskriti?template=${key}`,
@@ -400,18 +410,18 @@ describe("the unsupported request survives the route's canonicalisation", () =>
     }
   });
 
-  it("?template=archive renders the unsupported panel THROUGH the route", async () => {
+  it("?template=blog_anything renders the unsupported panel THROUGH the route", async () => {
     const { Route } = await import("@/routes/theme-preview.$key");
     const validate = Route.options.validateSearch as (
       search: Record<string, unknown>,
     ) => Record<string, unknown>;
     // The URL the router serves for the natural request …
     const canonical = await canonicalPreviewHref(
-      "/theme-preview/songoskriti?template=archive",
+      "/theme-preview/songoskriti?template=blog_anything",
     );
     // … the route's OWN validation of that URL still carries the request …
     const validated = validate(searchOf(canonical));
-    expect(validated.unsupportedTemplate).toBe("archive");
+    expect(validated.unsupportedTemplate).toBe("blog_anything");
     expect(validated.template).toBeUndefined();
     // … the route hands it to the host (its own wiring, read from source) …
     expect(ROUTE_SRC).toContain(
@@ -419,12 +429,12 @@ describe("the unsupported request survives the route's canonicalisation", () =>
     );
     const requested = (validated.template ??
       validated.unsupportedTemplate) as string;
-    expect(requested).toBe("archive");
+    expect(requested).toBe("blog_anything");
     // … and the host renders the explicit unsupported state, NOT the
     // homepage composition.
     const html = render(requested);
     expect(html).toContain("This template is not supported by this theme");
-    expect(html).toContain("archive");
+    expect(html).toContain("blog_anything");
     expect(html).toContain('href="/"');
     expect(
       html,
diff --git a/src/lib/widget-weight.ts b/src/lib/widget-weight.ts
index 329f80ec..0d9bb631 100644
--- a/src/lib/widget-weight.ts
+++ b/src/lib/widget-weight.ts
@@ -208,6 +208,8 @@ export const TEMPLATE_JS_BUDGET: Record<TemplateKey, number> = {
   collection: widgetBudget(0.9),
   account: widgetBudget(0.7),
   search: widgetBudget(0.9),
+  // The content archive is a listing page, like the collection.
+  archive: widgetBudget(0.9),
   page: widgetBudget(0.7),
   blog: widgetBudget(0.7),
   cart: widgetBudget(0.8),
diff --git a/src/routes/_authenticated/dashboard/builder.tsx b/src/routes/_authenticated/dashboard/builder.tsx
index 20b7dc33..841d58b8 100644
--- a/src/routes/_authenticated/dashboard/builder.tsx
+++ b/src/routes/_authenticated/dashboard/builder.tsx
@@ -212,6 +212,7 @@ const TEMPLATE_LABEL: Record<TemplateKey, { en: string; bn: string }> = {
   checkout: { en: "Checkout", bn: "চেকআউট" },
   blog: { en: "Blog", bn: "ব্লগ" },
   page: { en: "Page", bn: "পেজ" },
+  archive: { en: "Archive", bn: "আর্কাইভ" },
 };
 
 const SLOT_LABEL: Record<Slot, { en: string; bn: string }> = {
diff --git a/src/routes/blog.author.$slug.tsx b/src/routes/blog.author.$slug.tsx
index b721dcf5..91c68a97 100644
--- a/src/routes/blog.author.$slug.tsx
+++ b/src/routes/blog.author.$slug.tsx
@@ -3,7 +3,8 @@ import { z } from "zod";
 import { authorArchiveFn } from "@/lib/blog-reader.functions";
 import { personJsonLd } from "@/lib/blog-reader";
 import { archiveHead } from "@/lib/blog-taxonomy";
-import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
+import { archiveContextFrom } from "@/lib/archive-context";
+import { ArchiveView } from "@/components/store/ArchiveView";
 import { useLang } from "@/lib/i18n";
 
 export const Route = createFileRoute("/blog/author/$slug")({
@@ -76,8 +77,33 @@ function AuthorPage() {
   const data = Route.useLoaderData();
   const { t } = useLang();
   const { author } = data;
+  // The route-owned context — DERIVED from the loader's own output, never
+  // re-queried (`src/lib/archive-context.ts`). The author row carries no
+  // id, only its slug — which IS its public identity on this surface — so
+  // the subject is the author itself. The route carries NO store subject,
+  // so it resolves no theme: the platform's grid is what this surface
+  // serves (the archive key's storefront render path in this programme is
+  // the editor and the theme preview host, both merchant-scoped by
+  // construction).
+  const context = archiveContextFrom({
+    kind: "author",
+    term: {
+      id: author.slug,
+      slug: author.slug,
+      name: author.displayName,
+      name_en: author.displayNameEn,
+      description: author.bioEn || author.bio,
+    },
+    articles: data.articles,
+    facets: [],
+    paging: data.paging,
+    ancestry: [],
+  });
+
   return (
-    <BlogArchiveTheme
+    <ArchiveView
+      kind="author"
+      context={context}
       feed={{
         articles: data.articles,
         facets: [],
diff --git a/src/routes/blog.category.$slug.tsx b/src/routes/blog.category.$slug.tsx
index 5c94ff45..a277bc2b 100644
--- a/src/routes/blog.category.$slug.tsx
+++ b/src/routes/blog.category.$slug.tsx
@@ -21,7 +21,8 @@ import {
   termArchivePath,
 } from "@/lib/blog-taxonomy";
 import { useLang } from "@/lib/i18n";
-import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
+import { archiveContextFrom } from "@/lib/archive-context";
+import { ArchiveView } from "@/components/store/ArchiveView";
 
 export const Route = createFileRoute("/blog/category/$slug")({
   validateSearch: z.object({
@@ -123,8 +124,25 @@ function CategoryArchive() {
       }))
     : data.facets;
 
+  // The route-owned context — DERIVED from the loader's own output, never
+  // re-queried (`src/lib/archive-context.ts`). The route carries NO store
+  // subject, so it resolves no theme: the platform's grid is what this
+  // surface serves (the archive key's storefront render path in this
+  // programme is the editor and the theme preview host, both merchant-scoped
+  // by construction).
+  const context = archiveContextFrom({
+    kind: "category",
+    term: data.term,
+    articles: data.articles,
+    facets,
+    paging: data.paging,
+    ancestry: data.ancestry,
+  });
+
   return (
-    <BlogArchiveTheme
+    <ArchiveView
+      kind="category"
+      context={context}
       feed={{
         articles: data.articles,
         facets,
diff --git a/src/routes/blog.tag.$slug.tsx b/src/routes/blog.tag.$slug.tsx
index c56abc85..95a1442d 100644
--- a/src/routes/blog.tag.$slug.tsx
+++ b/src/routes/blog.tag.$slug.tsx
@@ -16,7 +16,8 @@ import {
   termArchivePath,
 } from "@/lib/blog-taxonomy";
 import { useLang } from "@/lib/i18n";
-import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
+import { archiveContextFrom } from "@/lib/archive-context";
+import { ArchiveView } from "@/components/store/ArchiveView";
 
 export const Route = createFileRoute("/blog/tag/$slug")({
   validateSearch: z.object({
@@ -109,8 +110,25 @@ function TagArchive() {
   const { t } = useLang();
   const { term } = data;
 
+  // The route-owned context — DERIVED from the loader's own output, never
+  // re-queried (`src/lib/archive-context.ts`). The route carries NO store
+  // subject, so it resolves no theme: the platform's grid is what this
+  // surface serves (the archive key's storefront render path in this
+  // programme is the editor and the theme preview host, both merchant-scoped
+  // by construction).
+  const context = archiveContextFrom({
+    kind: "tag",
+    term: data.term,
+    articles: data.articles,
+    facets: data.facets,
+    paging: data.paging,
+    ancestry: data.ancestry,
+  });
+
   return (
-    <BlogArchiveTheme
+    <ArchiveView
+      kind="tag"
+      context={context}
       feed={{
         articles: data.articles,
         facets: data.facets,
```

**The new (allowed) files this task creates.** A new file is allowed by §7 and needs no relaxation:

| file | what it is |
| --- | --- |
| `src/lib/template-key-contract.test.ts` | the union ↔ hand-written enum ↔ package contract ↔ editor labels ↔ SEO/weight tables ↔ the exact set of catalogue rows that carry `"archive"` |
| `src/lib/archive-context.ts` | the typed, validated archive render context (pure; derived, never re-queried) |
| `src/lib/archive-context.test.ts` | its contract suite |
| `src/components/store/ArchiveView.tsx` | the shared archive host — the theme's `archive` composition, or the platform's grid (delegated) |
| `src/components/store/ArchiveView.test.tsx` | its suite |
| `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` | this record |

---

## (c) Backward compatibility

> The `templates` column is `jsonb`; no migration and no DDL; a map written before the key existed resolves to `EMPTY_AST` for `archive`; the archive route therefore falls back **explicitly** and never to the homepage.

**No schema change.** The `templates` map is a `jsonb` object keyed by template key (`theme_drafts.templates`, `theme_versions.templates`). A new key is a new object in an existing map. **No migration, no DDL, no backfill, no applied migration is edited.**

**What an old map does.** `templateOf(map, "archive")` returns `EMPTY_AST` (`src/lib/builder-ast.ts:8138-8143`) — the empty AST, not a crash. `parseTemplates` drops nothing it did not already drop, and the nine existing keys round-trip byte-for-byte. The new contract suite proves this rather than claiming it (`src/lib/template-key-contract.test.ts`, "backward compatibility").

**The explicit fallback, and never the homepage.** `resolveTemplate`'s chain is `suffix → slug → base → page → index` (`src/lib/builder-ast.ts:8254-8274`), so a bare `resolveTemplate(templates, "archive")` on a theme that authors no archive body would hand the archive the **page** composition or the **homepage** composition. The archive host therefore inspects the returned `match` and accepts **only** `"base"` (and `"suffix"`, for the variant-aware call Task 5 makes): `"page"`, `"index"` and `"empty"` mean *no archive body*, and the platform's grid renders. The same rule is written into the host's own doc comment and pinned by `src/components/store/ArchiveView.test.tsx` (a theme whose only other template is `page` renders the **grid**, not the page composition; a theme whose only other template is `index` renders the **grid**, not the homepage body).

**The theme lifecycle never drops a merchant's work.** The seed fills only the keys the merchant's map does not have; the merge and the diff carry the **variants**; the publish gate lints every variant with its base key.

---

## (d) The package contract

> The live gate is `satisfiesApiRange` against `BUILDER_API_VERSION = 3.1.0`; `THEME_API_RANGE` stays `^3.0.0`; a package that declares `archive` must declare an `api` range whose lower bound is ≥ 3.1.0, and a package that declares `archive` while claiming a lower bound is rejected with the stable reason code `templates.archive_requires_api`; every package that does not declare `archive` keeps working unchanged.

**The rule is ADDITIVE (Decision G2).** `THEME_API_RANGE` (`src/lib/theme-package.ts:52`) is **documentation only — no code reads it**, and the running API stays `3.1.0` (`BUILDER_API_VERSION`, `src/lib/plugin-manifest.ts:32`). The live gate is `satisfiesApiRange(api)` (`src/lib/plugin-manifest.ts:463-484`) at `src/lib/theme-package.ts:316`, plus `checkApiCompatibility` at install (`src/lib/package-install.server.ts:316-331`). `^4.0.0` is **pinned as failing** by `src/lib/theme-package.test.ts:211-213`, so **no version bump is made** and `src/lib/plugin-manifest.ts` and `src/lib/frame30-security-matrix.test.ts:531` do **not** join the G1 list.

**What the new check does.** A manifest whose `templates` contains `archive` must declare a range whose **lower bound** is `>= 3.1.0`. The lower bound is read from the range's own shape: `^3.0.0` floors at `3.0.0`, `>=3.0.0 <4.0.0` floors at `3.0.0`, an exact pin `3.1.0` floors at `3.1.0`. A package that declares `archive` while claiming a lower bound is rejected with the stable reason code **`templates.archive_requires_api`**. A package that does **not** declare `archive` is unaffected — `satisfiesApiRange("^3.0.0")` is `true` against the running `3.1.0`, so no existing third-party package is invalidated by this change. The new contract suite proves all three cases.

---

## (e) The parity impact

> The archive template is a new surface: it has no frozen capture today, so the parity impact of this task is zero; the captures that go stale are the account, checkout and blog ones, listed in Task 7.

**Zero for this task.** The 60 frozen captures (`docs/superpowers/songoskriti-evidence/port/reference/` + `reference-manifest.json`) and the 60 machine baselines (`.e2e/songoskriti-port-parity.spec.ts-snapshots/`) cover nine templates. The archive is a **tenth**, so it has no capture to go stale; the three platform taxonomy routes render byte-identically to today's `BlogArchiveTheme` output, because the archive host's fallback **is** that component. The captures that go stale are the **account**, **checkout** and **blog** ones, and they are listed in Task 7. The re-freeze itself is an **owner action** on the repo's throwaway stack (Decision **G3**) — this task never writes to `reference/` or to the snapshot directory.

---

## (f) The boundary

> This record escalates the files enumerated in the plan's Decision Gate G1 that this task edits, each with its exact diff. **Two further files are escalated here although the plan's G1 list does not name them** — the plan's A5.8 audit missed them, and the suites found them at the base commit: `src/lib/builder-phase2a.test.ts` and `src/lib/phase5-seo.test.ts` (see the note under the table). No file outside the G1 list and outside this record is edited.

**The files this record escalates** — every one of them is a member of the plan's Decision Gate G1 list (the 38-file list), and every diff above is quoted in full:

| # | file | what the escalation covers |
| --- | --- | --- |
| 1 | `src/lib/builder-ast.ts` | the union, the route-h1 list, the zone table, the seven catalogue allowlist rows, the lint `required` table |
| 2 | `src/lib/storefront.functions.ts` | the hand-written `z.enum` |
| 3 | `src/lib/theme-package.ts` | the additive API rule and the `templates.archive_requires_api` check |
| 4 | `src/lib/widget-weight.ts` | `TEMPLATE_JS_BUDGET` |
| 5 | `src/lib/builder-seo.ts` | `TEMPLATE_FALLBACK` |
| 6 | `src/lib/theme-preview-nav.ts` | `GENERIC_TITLES` and the superseded D1 prose |
| 7 | `src/lib/themes.server.ts` | the seed merge, the widened merge/diff, the variant linting |
| 8 | `src/components/builder/BuilderTopBar.tsx` | `TEMPLATE_META` and the archive icon |
| 9 | `src/components/store/ThemePreviewFrame.tsx` | the false D1 copy and the archive's context grants |
| 10 | `src/routes/_authenticated/dashboard/builder.tsx` | `TEMPLATE_LABEL` |
| 11 | `src/components/store/songoskriti-preview-compositions.test.tsx` | the total `Record<TemplateKey, ThemeAst>` map |
| 12 | `src/components/store/songoskriti-preview-page.test.tsx` | the total `Record<TemplateKey, ThemeAst>` map |
| 13 | `src/components/store/ThemePreviewFrame.test.tsx` | the two total `Record<TemplateKey, ThemeAst>` maps |
| 14 | `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` | re-pointed at a still-unknown key; `"archive"` joins the known-key loop |
| 15 | `src/lib/themes/songoskriti/archive-contract.test.ts` | re-pinned from the superseded D1 ruling to this record |
| 16 | `src/lib/theme-preview-nav.test.ts` | the compile-total `FIRST_SECTION` map — the one file whose edit the plan assigns to Task 5, pulled forward because a compile-total map cannot wait (see §(a).3) |
| 17 | `src/routes/blog.category.$slug.tsx` | the render host becomes `ArchiveView` |
| 18 | `src/routes/blog.tag.$slug.tsx` | the render host becomes `ArchiveView` |
| 19 | `src/routes/blog.author.$slug.tsx` | the render host becomes `ArchiveView` |
| 20 | `src/lib/builder-phase2a.test.ts` | **beyond the G1 list** — the zone table's own count pin (`toHaveLength(9)`) |
| 21 | `src/lib/phase5-seo.test.ts` | **beyond the G1 list** — the route-h1 list's own pin |

**The two files beyond the G1 list, and why they had to move.** The plan's A5.8 audit enumerated the existing test files that pin the key, and it found ten. It missed two more, because neither mentions the key by name — both pin a COUNT or a LIST that the union's growth changes:

- `src/lib/builder-phase2a.test.ts:190-192` — `expect(Object.keys(TEMPLATE_ZONES)).toHaveLength(9)`. The zone table is `Record<TemplateKey, …>`, so it has one row per union member: the archive row makes it ten. The pin is replaced by the **stronger** statement the test actually wants — the zone table is TOTAL against the union (`toHaveLength(TEMPLATE_KEYS.length)` and the two key sets are equal), so a template the table dropped would now fail this suite instead of passing a stale count.
- `src/lib/phase5-seo.test.ts:41-50` — the `ROUTE_H1_TEMPLATES` list. The archive joins it (the archive route owns the heading), so the list gains `"archive"` and the test also asserts `routeSuppliesH1("archive")` is true — the same shape as the `product` assertion beside it.

Neither edit weakens a test: each replaces a stale literal with a statement about the new ruling, and each is quoted in full in §(b).

**No file outside that list is edited.** The two theme-owned files the plan allows without a relaxation — `src/lib/themes/songoskriti/preview.ts` (the `case "archive":` composition) and `src/lib/themes/songoskriti/template-distinctness.ts` (the expectations row and the `blog` exception's new basis) — are edited under the §7 allowance and carry no diff here.

**One file the plan names but this task does NOT edit.** `src/lib/storefront-cache.ts` is on the G1 list *conditionally* (A5.6 item 29: only if a new personalised path appears). The archive surface is a **public, cacheable** content path — exactly like the blog listing the cache already serves — so neither `PERSONALIZED_SEGMENTS` (`:133-138`) nor `isStorefrontPath` (`:99-119`) needs to change, and the file is untouched. The same holds for `src/lib/builder-seo.server.ts`, `src/lib/template-seo.server.ts` and `src/lib/translation-coverage.ts`: they derive their behaviour from `TEMPLATE_KEYS` and need no edit.

**The rules that hold throughout.** No new npm dependency and no lockfile change. No test is weakened, deleted or skipped — every existing suite that changes here changes to a **stronger** expectation, quoted in the diffs above. Every commit stages **explicit paths** only. The three churn files and `.output-snapshots/` are never staged and never committed.

---

## (g) Archive contract (Decision D1' — the archive key is REAL)

> `archive` is a first-class template key. Its supported kinds are exactly the content archives the platform serves as routes today: the three content-archive routes are its kinds — `/blog/category/$slug` (category), `/blog/tag/$slug` (tag) and `/blog/author/$slug` (author).
>
> The product collection is NOT an archive: it keeps the `collection` template. A product category is a search facet, not a route (`src/lib/storefront-search.ts` puts `category` in the search query), and a brand resolves to a search query too. Anything that is not one of the three kinds is an explicit not-found or unsupported state — never a "valid archive".
>
> The platform reader surfaces keep the platform grid because they carry no store slug: none of `/blog`, `/blog/category/$slug`, `/blog/tag/$slug` or `/blog/author/$slug` can resolve a theme, because `getStoreChrome` needs a slug (`src/lib/storefront.functions.ts:94-111` → `src/lib/storefront.server.ts:216-224`) — a taxonomy term carries `merchant_id`, not a slug, and its slug is unique per merchant rather than globally (`src/lib/blog-index.server.ts:304-328`), and the author archive is not merchant-scoped at all (`src/lib/blog-reader.server.ts:378-384`). A route that cannot name a store must not guess one.
>
> The platform's own storefront blog index — `src/routes/store.$slug.blog.index.tsx` — is merchant-scoped and keeps its own route.
>
> The content-archive routes MAY be served by the `archive` template; the merchant-scoped storefront wiring is deferred to the route that carries a slug (`/store/<slug>/blog/category/<slug>`), which does not exist today. In this programme the archive key's storefront render path is the **editor** (`/dashboard/builder`) and the **theme preview host** (`/theme-preview/<theme>?template=archive`), both of which are merchant-scoped by construction. That deferral is a stated limitation, not an oversight, and it is recorded as such in the evidence record (Task 9).
>
> The preview's unsupported state stays EXPLICIT: a key the platform still does not know is carried through the route's search validation and rendered as the named "not supported by this theme" panel — never a silent homepage redirect.

---

## (h) Fix round — the review's findings (appended, 2026-10-21)

**Base commit of this round:** `8051b21e` (the tip of `frame30` at the time of the review).

This section is **appended**, not rewritten: everything above is the record as it stood when the batch was committed. The round below fixes the findings a task review raised against the `archive` template-key batch, and it names the files it touches, each with its exact diff. **Every file below is already a member of the plan's Decision Gate G1 list** (the plan's own G1 table has been corrected to name every §7-prohibited file this batch touches — see the last paragraph of this section), except the one NEW file, which §7 allows.

### (h.1) The finding

> The archive composition is **not frozen**: `src/components/builder/songoskriti-port-freeze.test.tsx:74-119` and `:152-162` still enumerate the nine old keys, so a reordering of Songoskriti's six archive sections — or a seventh section added — would pass unnoticed. The distinctness gate covers the archive (R2/R3/R5 are `TEMPLATE_KEYS`-driven), but the **ordered** composition was pinned for the other nine templates and not for the archive.
>
> Plus five smaller findings: the seed merge drops the merchant's variant keys; the merge reads the active theme's draft whichever theme key is being installed; `apiRangeFloor`'s exact-pin branch is unreachable; the `>=a <b` range form is untested; the plan's on-disk G1 table does not name the two files the batch had to escalate; three sweep files that omit `archive` belong to nobody; and the published contract omits the new rule.

### (h.2) The exact old → new diff

```diff
diff --git a/src/components/builder/songoskriti-port-freeze.test.tsx b/src/components/builder/songoskriti-port-freeze.test.tsx
index 807947c7..610600e3 100644
--- a/src/components/builder/songoskriti-port-freeze.test.tsx
+++ b/src/components/builder/songoskriti-port-freeze.test.tsx
@@ -116,6 +116,18 @@ const TEMPLATE_MAIN: Record<string, string[]> = {
     "pagination",
     "empty_state",
   ],
+  // Phase 3 (Decision D1') — the content archive. Its ORDERED composition is
+  // frozen like the other nine: a reordering of these six sections, or a
+  // seventh one added, is a change this suite must catch. The order is the
+  // theme's own shipped body (`src/lib/themes/songoskriti/preview.ts:242-303`).
+  archive: [
+    "category_header",
+    "blog_terms",
+    "blog_archive",
+    "blog_pager",
+    "pagination",
+    "empty_state",
+  ],
 };
 
 describe("Task 3 — freeze: homepage composition", () => {
@@ -159,6 +171,7 @@ describe("Task 3 — freeze: per-template zone/type composition", () => {
     "cart",
     "checkout",
     "search",
+    "archive",
   ]) {
     it(`${key} template main zone is frozen`, () => {
       const source = songoskritiPreviewSource();
diff --git a/src/lib/template-key-contract.test.ts b/src/lib/template-key-contract.test.ts
index 1d84b7ba..ed96e653 100644
--- a/src/lib/template-key-contract.test.ts
+++ b/src/lib/template-key-contract.test.ts
@@ -290,6 +290,37 @@ describe("the archive template key — the theme-package contract", () => {
     if (!verdict.ok) return;
     expect(verdict.manifest.api).toBe("^3.0.0");
   });
+
+  it("reads the `>=a <b` range form: an archive package whose floor is below 3.1.0 is refused", () => {
+    // The pair form floors at its LOWER bound. `>=3.0.0 <4.0.0` covers the
+    // running 3.1.0, so the compatibility gate admits it — the ARCHIVE rule
+    // is what refuses it, because the key landed in 3.1.0.
+    const verdict = validateThemeManifest(manifest({ api: ">=3.0.0 <4.0.0" }));
+    expect(verdict.ok).toBe(false);
+    if (verdict.ok) return;
+    expect(verdict.errors).toContain("templates.archive_requires_api");
+  });
+
+  it("admits an archive-declaring package whose `>=a <b` floor reaches 3.1.0", () => {
+    const verdict = validateThemeManifest(manifest({ api: ">=3.1.0 <4.0.0" }));
+    expect(verdict.ok).toBe(true);
+    if (!verdict.ok) {
+      expect(verdict.errors).toEqual([]);
+      return;
+    }
+    expect(verdict.manifest.api).toBe(">=3.1.0 <4.0.0");
+    expect(verdict.manifest.templates).toEqual(["index", "archive"]);
+  });
+
+  it("refuses a bare version — the range gate rejects it before any archive floor is read", () => {
+    // An exact pin is NOT an admitted range shape: the gate rejects it as
+    // `api_range_invalid`, so no manifest is ever admitted through it and
+    // the archive floor never reads one.
+    const verdict = validateThemeManifest(manifest({ api: "3.1.0" }));
+    expect(verdict.ok).toBe(false);
+    if (verdict.ok) return;
+    expect(verdict.errors).toContain("api_range_invalid");
+  });
 });
 
 describe("the archive template key — backward compatibility", () => {
diff --git a/src/lib/theme-package.ts b/src/lib/theme-package.ts
index 630c7703..7cd49421 100644
--- a/src/lib/theme-package.ts
+++ b/src/lib/theme-package.ts
@@ -200,9 +200,13 @@ const PAIR_RANGE_RE = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/;
 
 /**
  * The floor a declared range admits — the API line the package was built
- * against. `^3.0.0` floors at `3.0.0`, `>=3.0.0 <4.0.0` floors at `3.0.0`
- * and an exact pin `3.1.0` floors at `3.1.0`. Null for a range shape this
- * module does not understand (the range validators report that separately).
+ * against. `^3.0.0` floors at `3.0.0` and `>=3.0.0 <4.0.0` floors at
+ * `3.0.0`. Null for a range shape this module does not understand (the range
+ * validators report that separately).
+ *
+ * Only the two shapes the manifest gate ADMITS are read: the gate rejects a
+ * bare version as `api_range_invalid` (`:344-345`), so an exact pin can
+ * never reach this helper as an admitted range.
  */
 function apiRangeFloor(range: string): string | null {
   const trimmed = range.trim();
@@ -210,7 +214,6 @@ function apiRangeFloor(range: string): string | null {
   if (caret) return caret[1]!;
   const pair = PAIR_RANGE_RE.exec(trimmed);
   if (pair) return pair[1]!;
-  if (/^\d+\.\d+\.\d+$/.test(trimmed)) return trimmed;
   return null;
 }
 
diff --git a/src/lib/themes.server.ts b/src/lib/themes.server.ts
index 998ba3ef..78f1a1e0 100644
--- a/src/lib/themes.server.ts
+++ b/src/lib/themes.server.ts
@@ -1274,6 +1274,34 @@ export async function loadRegistryPackage(
   };
 }
 
+/**
+ * The source key of a theme — the registry key it was installed from.
+ *
+ * Two shapes, because the two install paths record it differently: a
+ * marketplace install names it on the theme row (`source_listing_slug`) and
+ * the official install names it on the version the RPC wrote
+ * (`source_registry_key` — the `_key` the RPC was called with). A merchant's
+ * own hand-made theme has neither: null means "no upstream", never "any key".
+ */
+async function themeSourceKeys(
+  db: Client,
+  themeId: string,
+): Promise<Set<string>> {
+  const keys = new Set<string>();
+  const version = await db
+    .from("theme_versions")
+    .select("source_registry_key")
+    .eq("theme_id", themeId)
+    .order("version", { ascending: false })
+    .limit(1)
+    .maybeSingle();
+  const registryKey = version.data?.source_registry_key;
+  if (typeof registryKey === "string" && registryKey.trim()) {
+    keys.add(registryKey.trim());
+  }
+  return keys;
+}
+
 /**
  * The merchant's CURRENT template map — the one the install's RPC is about
  * to replace.
@@ -1283,15 +1311,24 @@ export async function loadRegistryPackage(
  * that rule exactly: the merge is applied to the map the RPC replaces, not
  * to some other theme's. A failed read never breaks an install — the seed
  * then behaves exactly as it did before the merge existed.
+ *
+ * **The gate.** The map is returned ONLY when the ACTIVE theme's source key
+ * IS the key being installed. The RPC replaces the draft's map VERBATIM, so
+ * merging a DIFFERENT theme's bodies into this install would publish one
+ * theme's sections under another theme's name. Installing a theme the
+ * merchant does not already run therefore seeds the package's own map — the
+ * behaviour before the merge existed — and two themes' bodies are never
+ * mixed into one version.
  */
 async function readMerchantTemplateMap(
   db: Client,
   merchantId: string,
+  key: string,
 ): Promise<Record<string, unknown> | null> {
   try {
     const theme = await db
       .from("store_themes")
-      .select("id")
+      .select("id, source_listing_slug")
       .eq("merchant_id", merchantId)
       .order("is_active", { ascending: false })
       .order("created_at", { ascending: true })
@@ -1299,6 +1336,12 @@ async function readMerchantTemplateMap(
       .maybeSingle();
     const themeId = theme.data?.id;
     if (!themeId) return null;
+    const sources = await themeSourceKeys(db, themeId);
+    const listing = theme.data?.source_listing_slug;
+    if (typeof listing === "string" && listing.trim()) {
+      sources.add(listing.trim());
+    }
+    if (!sources.has(key)) return null;
     const draft = await db
       .from("theme_drafts")
       .select("templates")
@@ -1318,19 +1361,23 @@ async function readMerchantTemplateMap(
  * not carry is filled from the package's default, which is how a NEW
  * template key (the archive) reaches a merchant whose map predates it.
  * Variant keys ride the same map and are carried through untouched.
+ *
+ * The MERGED map is returned ALWAYS — never the package's map alone. The
+ * package's map carries only the base keys, so returning it would DROP
+ * every key the merchant's map carries that the package does not (their
+ * variant keys — `blog_article`, `archive_category`), which contradicts the
+ * rule above.
  */
 function mergeSeedTemplates(
   current: Record<string, unknown>,
   preset: ThemeTemplates,
 ): Record<string, unknown> {
   const merged: Record<string, unknown> = { ...current };
-  let changed = false;
   for (const [key, ast] of Object.entries(preset)) {
     if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
     merged[key] = ast;
-    changed = true;
   }
-  return changed ? merged : (preset as unknown as Record<string, unknown>);
+  return merged;
 }
 
 /**
@@ -1373,7 +1420,7 @@ export async function installRegistryTheme(
     // receives. That is how the new `archive` default reaches a merchant
     // whose map predates the key, without a single merchant-authored
     // template being overwritten.
-    const current = await readMerchantTemplateMap(db, merchantId);
+    const current = await readMerchantTemplateMap(db, merchantId, key);
     const templates = current
       ? mergeSeedTemplates(current, pkg.templates)
       : (pkg.templates as unknown as Record<string, unknown>);
```

**The one NEW file this round creates** (§7-allowed — a new file needs no relaxation):

| file | what it is |
| --- | --- |
| `src/lib/theme-seed-merge.test.ts` | the seed merge's contract suite: the merchant's variant keys survive the install, and two themes' bodies are never mixed into one version |

### (h.3) Why each change is right

**The archive's ordered composition is frozen (`songoskriti-port-freeze.test.tsx`).** The six types and their order are the theme's own shipped body, read from `src/lib/themes/songoskriti/preview.ts:242-303` — `category_header` → `blog_terms` → `blog_archive` → `blog_pager` → `pagination` → `empty_state`. The suite's loop already asserts the header/footer zones and the main-zone type list for the other nine templates; `"archive"` joins that loop, so the archive is frozen exactly like the rest. **The pin is stronger than the gap it closes**: before this change a reordering of the archive's six sections passed unnoticed; now it fails this suite.

**The merge returns the MERGED map (`themes.server.ts`).** The old `return changed ? merged : preset` was a contradiction of the function's own docstring: the package's map carries only the base keys, so returning it dropped every key the merchant's map carried that the package does not — their **variant** keys (`blog_article`, `archive_category`). The merged map is now returned unconditionally, so a variant key the merchant authored survives the install.

**The merge is gated on the target key (`themes.server.ts`).** The read mirrors the RPC's write rule (the ACTIVE theme, else the oldest), but the ACTIVE theme is not necessarily the theme being installed. The gate reads the active theme's **source key** — `store_themes.source_listing_slug` (a marketplace install) or the latest `theme_versions.source_registry_key` (the official install — the `_key` the RPC was called with) — and applies the merge **only** when that source key IS the key being installed. Two themes' bodies are therefore never mixed into one version; installing a theme the merchant does not already run seeds the package's own map, which is exactly the behaviour before the merge existed.

**`apiRangeFloor`'s exact-pin branch is dropped (`theme-package.ts`).** The manifest gate rejects a bare version as `api_range_invalid` (`:344-345`) **before** the archive floor is read, so no manifest can be admitted through an exact pin and the branch could never be the reason a manifest passed. The §(d) statement above is corrected by this paragraph: **the lower bound is read from the two shapes the gate admits** — `^a.b.c` and `>=a.b.c <d.e.f`. A manifest that declares `archive` while claiming a floor below `3.1.0` is refused with `templates.archive_requires_api` in **both** admitted shapes; a manifest that claims a bare version is refused with `api_range_invalid` whatever it declares. Nothing that was refused before is admitted now, and nothing that was admitted is refused now.

**The `>=a <b` range form is covered (`template-key-contract.test.ts`).** The pair form floors at its LOWER bound, so `>=3.0.0 <4.0.0` covers the running `3.1.0` and passes the compatibility gate — the ARCHIVE rule is what refuses it. The three new cases pin: the pair form with a floor below `3.1.0` is refused with `templates.archive_requires_api`; the pair form with a floor that reaches `3.1.0` is admitted; and a bare version is refused by the range gate itself with `api_range_invalid`.

### (h.4) The plan's G1 table, corrected on disk

The plan's Decision Gate G1 table listed **38** files, but the batch had to escalate **40**: the plan's A5.8 audit missed `src/lib/builder-phase2a.test.ts` and `src/lib/phase5-seo.test.ts` (neither names the key — both pin a COUNT or a LIST the union's growth changes), and the escalation record's §(f) rows 20 and 21 say so in as many words. **The plan's on-disk G1 table has been corrected to name both files and to state the count honestly (40).** The rows 20/21 "beyond the G1 list" note above is kept as the history it is; this paragraph is the correction.

### (h.5) The sweep files that omit `archive` — ASSIGNED, not edited

Three sweep files enumerate the template keys by hand and therefore omit the archive. **They are not edited in this round** — they belong to the tasks that own them, and the plan now names them:

| file | what it enumerates | assigned to |
| --- | --- | --- |
| `src/lib/theme-preview-nav.test.ts:134-144` and `:375-385` | the two hard-coded nine-key arrays behind "authors demo content for every template" | **Task 5** (the blog-variants task) — the arrays become `TEMPLATE_KEYS`-driven loops, which cover the archive too |
| `.e2e/real-frames.spec.ts:63-73` | the `TEMPLATES` list of the real-frames sweep | **Task 7** (the test-lanes task) |
| `.e2e/songoskriti-port-parity.spec.ts:36-46` | the `TEMPLATES` list of the parity harness | **Task 7** (the test-lanes task) |
| `.e2e/theme-preview-security.spec.ts:567-575` | the preview template sweep | **Task 7** (the test-lanes task) — **no task claimed this file before; it is claimed now** |

### (h.6) The published contract — ASSIGNED, not edited

`docs/packages/contract.md:154-166` states only the range rule, so a third-party author cannot learn that declaring `archive` requires an API floor ≥ `3.1.0`. The contract is **not** edited in this round; the rule is **assigned to Task 9** (the docs task), which owns `docs/packages/contract.md`.

### (h.7) The rules that hold throughout this round

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped — every suite that changes here changes to a **stronger** expectation: the archive gains a frozen ordered composition, the contract suite gains three cases, and a new suite pins the seed merge. Every commit stages **explicit paths** only. The three churn files and `.output-snapshots/` are never staged and never committed.
