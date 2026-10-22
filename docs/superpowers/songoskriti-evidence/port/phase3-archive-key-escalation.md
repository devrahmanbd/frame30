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

---

## (i) Batch B — the account dashboard and the production checkout shell

**Base commit of this batch:** `c27521e7` (`fix(templates): freeze the archive's ordered composition; the seed merge keeps the merchant's variants`) — the tip of `frame30`.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (Tasks 3 and 4).
**Owner's rulings in force:** Decision Gate **G1** (§7 relaxed for the plan's named list), **G2** (the additive API rule), **G3** (the parity re-freeze runs on the repo's throwaway stack, never on the configured database).

This section is **appended**, not rewritten: everything above is the record as it stood when the archive-key batch was committed. It is the port spec §9 escalation for the two production-surface repairs this batch makes, and it is written **before** any escalated file is edited.

### (i.1) The finding

> The account route's own comment claiming the published `account` template is *"rejected by the storefront validator"* is **false** in this tree: `account` has been in `TEMPLATE_KEYS` since Phase 6 (`src/lib/builder-ast.ts:50`) and `getStoreChrome`'s hand-written `z.enum` already lists it (`src/lib/storefront.functions.ts:107`). The route's `dashboard` fragment is the route's `fallback` (`src/routes/store.$slug.account.tsx:511`), so it renders **only** when the theme publishes no `account` body — and Songoskriti publishes one (`heading` + `profile_card` + `orders_list`, `src/lib/themes/songoskriti/preview.ts:435-440`). The result is the defect the brief calls the highest-priority visual repair: **a signed-in shopper on a themed store sees a heading, a profile card and an order list — with no navigation, no overview and none of the account panels (addresses, wishlist, profile, privacy) at all.**
>
> The production checkout route has the mirror-image defect: it renders its own hand-built form and **discards** the theme's AST (`src/routes/store.$slug.checkout.tsx:421` — `ast={null}`), so the merchant's authored checkout composition never reaches a shopper.

**What the account repair does.** The route's body becomes a **designed dashboard** (`src/components/store/AccountDashboard.tsx`, a NEW file — §7-allowed) that owns the header, an intentional five-tab navigation, an overview strip built only from permitted data, the composed profile and the structured order rows. The theme's `account` AST is composed **around** it through `ThemeChrome`'s existing route-owned body slot (`contentSlot` / `themeRendersBody`, `src/lib/theme-body-slot.ts`), so the theme keeps the frame and the route keeps the data.

**The composition slot.** The platform already ships exactly one "the host hands the template its body" widget: `page_content` (`src/lib/builder-ast.ts:1603-1611` — `heading: false`, `slots: ["main"]`, rendered by the platform's `ContextSlot` widget, `src/components/builder/widgets.tsx:335-343`). Its catalogue allowlist is `["page","blog"]`; this batch widens it to `["page","blog","account","checkout"]` so the account and checkout templates may carry the **route-owned body** the same way the authored page does. **No new widget type is added**, so no renderer is needed in `src/components/builder/widgets.tsx` (which is §7-prohibited and is NOT on the plan's G1 list).

**Why no new account widget types.** The plan's Task 3 "Produces" line names "the new overview/nav slots". A new `SectionType` needs a renderer in `src/components/builder/widgets.tsx` (`WIDGET_COMPONENTS` is a compile-total `Record<SectionType, WidgetComponent>`), and that file is §7-prohibited and outside the plan's G1 list. The overview and the navigation are therefore **route-owned data** (the tab state lives in the route's own `?tab=` search parameter; the counts come from the shopper's own `customer_overview` payload) and they live **inside** the route-owned body slot. This is recorded as a deviation in the batch report.

### (i.2) The exact old → new diff

Every §7-prohibited file this batch edits, with its exact unified-diff hunks. The NEW files (the dashboard, its suite, the contract suite and the checkout contract suite) are not edits and carry no diff; they are listed at the end of this section for completeness.

```diff
diff --git a/src/lib/builder-ast.ts b/src/lib/builder-ast.ts
index 7a2c1de..0a4d9f1 100644
--- a/src/lib/builder-ast.ts
+++ b/src/lib/builder-ast.ts
@@ -1603,9 +1603,13 @@ const BASE_CATALOG: CatalogEntry[] = [
     type: "page_content",
     label: "Page content",
     group: "context",
     slots: ["main"],
     heading: false,
-    templates: ["page", "blog"],
+    // The route-owned BODY slot. The authored page flows its body through it
+    // (`ThemeChrome`'s `contentSlot`); the account dashboard and the production
+    // checkout form flow theirs through the same slot, so the theme composes
+    // AROUND the route's data instead of replacing it. The widget stays the
+    // platform's generic body slot — it renders whatever the host grants.
+    templates: ["page", "blog", "account", "checkout"],
     defaults: {},
     fields: [],
   },
@@ -8477,6 +8481,13 @@ export function lintTemplate(
       cart: [
         { type: "cart_summary", message: "Cart template has no order summary." },
       ],
+    // Batch B: the account dashboard and the production checkout form are the
+    // ROUTE's body on those two templates, so the theme must carry the
+    // route-owned body slot — otherwise the theme's frame renders and the
+    // shopper's account / checkout never does.
+    account: [
+      { type: "page_content", message: "Account template has no account body." },
+    ],
+    checkout: [
+      { type: "page_content", message: "Checkout template has no checkout body." },
+    ],
     // Phase 3 (Decision D1'): the archive is a listing page, so it must
     // carry the listing widget — the same shape as the `page` rule (the
     // route-owned body slot) and the `cart` rule (the order summary).
diff --git a/src/routes/store.$slug.account.tsx b/src/routes/store.$slug.account.tsx
index 4b6d0aa..c1e77b4 100644
--- a/src/routes/store.$slug.account.tsx
+++ b/src/routes/store.$slug.account.tsx
@@ -46,10 +46,12 @@ export const Route = createFileRoute("/store/$slug/account")({
     tab: isAccountTab(s.tab) ? s.tab : undefined,
   }),
   loader: async ({ params }) => {
-    // The published `account` template, when the merchant has one. Rejected
-    // by the storefront validator until the template-key track extends it —
-    // caught to null so the page renders the built-in dashboard regardless.
+    // The published `account` template, when the merchant has one. `account`
+    // IS a known template key (`TEMPLATE_KEYS`, `src/lib/builder-ast.ts:50`)
+    // and `getStoreChrome`'s validator accepts it
+    // (`src/lib/storefront.functions.ts:107`) — the OLD comment here claimed
+    // the opposite, which was false from Phase 6 onward. The `.catch` below
+    // now only swallows a GENUINE loader failure, so the page renders the
+    // built-in dashboard when the merchant has no published body.
     const chrome = await getStoreChrome({
       data: { slug: params.slug, template: "account" },
     }).catch(() => null);
@@ -225,268 +227,9 @@ function AccountPage() {
     return <ShopperOrderLookup slug={slug} />;
   }
 
-  // Route's default body: used when the theme publishes no `account` main
-  // sections, so the page is never blank. (The `defaultAccountAst` fallback
-  // takes the `ast` slot once the widget registry knows its section types.)
-  const dashboard = (
-    <>
-      … (the whole inline `dashboard` fragment — heading, tab strip and the
-          five panels — moves into `src/components/store/AccountDashboard.tsx`)
-    </>
-  );
-
   return (
     <PluginLayer plugins={chrome?.installedPlugins ?? []}>
       <ThemeChrome
         template="account"
         ast={chrome?.ast ?? null}
         tokens={chrome?.tokens ?? null}
         storeSlug={slug}
         themeKey={chrome?.themeKey ?? null}
         merchantId={chrome?.merchant.id ?? null}
         siteKit={chrome?.siteKit ?? null}
         ownsPrimary
         contextSlots={accountSlots}
+        contentSlot="page_content"
         chrome={
           <StoreHeader
             slug={slug}
             name={chrome?.merchant.name ?? store?.name ?? slug}
             themeKey={chrome?.themeKey ?? null}
           />
         }
         containerClassName="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-12 sm:px-6 lg:px-8"
-        fallback={dashboard}
+        fallback={
+          <AccountDashboard … />
+        }
       />
     </PluginLayer>
   );
 }
diff --git a/src/routes/store.$slug.checkout.tsx b/src/routes/store.$slug.checkout.tsx
index 9f2ab77..5c9d1e4 100644
--- a/src/routes/store.$slug.checkout.tsx
+++ b/src/routes/store.$slug.checkout.tsx
@@ -415,10 +415,14 @@ function CheckoutPage() {
       <ThemeChrome
         template="checkout"
         storeSlug={slug}
         themeKey={themeKey ?? null}
         merchantId={merchant.id}
-        // The checkout form is hand-built (server-quoted totals, live rails), so
-        // the theme contributes the tokens only. We drop the normal header and footer.
-        ast={null}
+        // Decision D2': the theme's checkout composition is the SHELL. The
+        // route keeps the form, the customer fields, the server quote and the
+        // order write; the theme contributes the layout around them. The
+        // header and footer stay off (a checkout page is distraction-free).
+        ast={checkoutAst}
         tokens={tokens}
         siteKit={siteKit}
         ownsPrimary
+        contentSlot="page_content"
+        contextSlots={{
+          cart_lines: null,
+          cart_summary: null,
+          checkout_steps: null,
+          payment_methods: null,
+          page_content: checkoutBody,
+        }}
         chrome={
           <MinimalCheckoutHeader
             slug={slug}
diff --git a/src/routes/checkout.tsx b/src/routes/checkout.tsx
index 3ba01c9..8d0e6f5 100644
--- a/src/routes/checkout.tsx
+++ b/src/routes/checkout.tsx
@@ -273,9 +273,14 @@ function CheckoutPage() {
       <ThemeChrome
         template="checkout"
         storeSlug={slug}
         themeKey={themeKey ?? null}
         merchantId={merchant.id}
-        ast={ast ? { header: ast.header, main: [], footer: ast.footer } : null}
+        // The custom-host twin composes the SAME shell as the storefront
+        // route (Decision D2'): the theme's checkout body around the route's
+        // own form, with the same fallback.
+        ast={ast}
         tokens={tokens}
         siteKit={siteKit}
         ownsPrimary
+        contentSlot="page_content"
+        contextSlots={{
+          cart_lines: null,
+          cart_summary: null,
+          checkout_steps: null,
+          payment_methods: null,
+          page_content: checkoutBody,
+        }}
         chrome={
           <StoreHeader
             slug={slug}
diff --git a/src/components/store/ThemePreviewFrame.tsx b/src/components/store/ThemePreviewFrame.tsx
index 7e2b9d1..0c5a4f7 100644
--- a/src/components/store/ThemePreviewFrame.tsx
+++ b/src/components/store/ThemePreviewFrame.tsx
@@ -655,6 +655,14 @@ export function ThemePreviewFrame({
   const accountSlots = useMemo(() => {
     if (template !== "account") return undefined;
     …
   }, [template, ast, previewData, lang, blueprintKey]);
+
+  // The account template's route-owned BODY slot (Batch B): the dashboard the
+  // storefront route renders, shown here over the theme's SYNTHETIC demo
+  // profile and orders — visibly labelled, never a real shopper's data.
+  const accountBodySlot = useMemo(() => {
+    if (template !== "account") return undefined;
+    return { page_content: <AccountDashboard … /> };
+  }, [template, lang]);
diff --git a/src/components/builder/songoskriti-port-freeze.test.tsx b/src/components/builder/songoskriti-port-freeze.test.tsx
index 610600e3..2f7b1c9 100644
--- a/src/components/builder/songoskriti-port-freeze.test.tsx
+++ b/src/components/builder/songoskriti-port-freeze.test.tsx
@@ -103,7 +103,7 @@ const TEMPLATE_MAIN: Record<string, string[]> = {
     "result_toolbar",
     "product_grid",
     "product_rail",
   ],
-  account: ["heading", "profile_card", "orders_list"],
+  account: ["profile_card", "page_content"],
   page: ["breadcrumb", "page_content"],
   blog: ["blog_terms", "blog_archive", "blog_pager"],
   cart: ["heading", "columns"],
-  checkout: ["heading", "checkout_steps", "columns"],
+  checkout: ["heading", "checkout_steps", "columns", "page_content"],
diff --git a/src/lib/theme-preview-nav.test.ts b/src/lib/theme-preview-nav.test.ts
index dd515bc5..9a4c2e8 100644
--- a/src/lib/theme-preview-nav.test.ts
+++ b/src/lib/theme-preview-nav.test.ts
@@ -170,9 +170,9 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
       "product_media",
     );
     expect(preset.templates.account.main.map((s) => s.type)).toEqual([
-      "heading",
       "profile_card",
-      "orders_list",
+      "page_content",
     ]);
diff --git a/src/lib/themes/songoskriti/preview.test.ts b/src/lib/themes/songoskriti/preview.test.ts
index 6d0b0a1..c1f7e93 100644
--- a/src/lib/themes/songoskriti/preview.test.ts
+++ b/src/lib/themes/songoskriti/preview.test.ts
@@ -79,9 +79,9 @@ describe("songoskriti preview source", () => {
       "product_media",
     );
     expect(types("account")).toEqual([
-      "heading",
       "profile_card",
-      "orders_list",
+      "page_content",
     ]);
   });
 });
```

**The NEW files this batch creates** (§7-allowed — a new file needs no relaxation):

| file | what it is |
| --- | --- |
| `src/components/store/AccountDashboard.tsx` | the designed account dashboard — header, five-tab navigation, overview strip, composed profile, structured order rows and the five account panels |
| `src/components/store/AccountDashboard.test.tsx` | its suite: the six states, the navigation contract, the overview's permitted data and the six-breakpoint class contract |
| `src/components/store/account-dashboard.contract.test.ts` | the contract suite: no invented routes, no invented data, no invented metrics |
| `src/lib/checkout-shell.contract.test.ts` | the checkout authority contract: the four server functions stay, the theme AST stays presentation-only, the zones stay closed, the customer fields stay the route's own |

### (i.3) Two files this batch touches that the plan's G1 list does NOT name

| file | what the escalation covers | why it had to move |
| --- | --- | --- |
| `src/lib/themes/songoskriti/preview.test.ts` | the pinned `account` composition (`types("account")`) | the composition changes, so the pin must change. §7 lists "existing test files … under `src/`" as prohibited; the plan's G1 list names `template-distinctness.test.ts` and `archive-contract.test.ts` from this directory but **not** this one. The edit replaces a stale literal with the NEW composition — a stronger expectation, never a weaker one. |
| `src/lib/themes/songoskriti/template-distinctness.ts` | the `account` and `checkout` expectation rows | §7-allowed (`src/lib/themes/songoskriti/**`), but the rows MUST change with the compositions: the account body's required slot is now the route-owned body, and the checkout body gains it too. |

### (i.4) Backward compatibility

> The `templates` column is `jsonb`; no migration and no DDL. A theme published BEFORE this batch authored the account template as `heading` + `profile_card` + `orders_list`. That body still parses, still lints and still renders — the `heading` widget is not an `<h1>` claimant on a route-h1 template (`src/lib/builder-ast.ts:8500-8504`), and `profile_card` / `orders_list` keep their catalogue allowlists. Such a body simply does **not** declare the route-owned body slot, so `themeRendersBody(ast, "page_content")` is false and the route's `fallback` — the dashboard — renders. The shopper sees the dashboard, which is the repair, not a regression. A merchant who re-publishes the account template with the platform's editor gets the new composition.

### (i.5) The platform's authority (unchanged by this batch)

| concern | where it stays |
| --- | --- |
| the account's identity | the `customer_overview` RPC, scoped to `auth.uid()` (`src/lib/accounts.server.ts:95-105`) — no query parameter, widget or theme code selects a shopper |
| the checkout's totals | the server quote (`quoteCart` → `priceCart`), rendered by the route's `fallback` and by the platform's `cart_summary` widget |
| the checkout's rails | `quote.settings.methods` → `groupMethods` — the route renders only what the server offered |
| the checkout's customer fields | the route's own `FormData` (`src/routes/store.$slug.checkout.tsx:332-339`) |
| the checkout's order write | `placeOrder` with the route's idempotency key, honeypot and beacon |
| the payment state | the shared cart context (`useLiveCart`), which the platform's `payment_methods` widget drives |

### (i.6) The rules that hold throughout this batch

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped — every existing suite that changes here changes to a **stronger** expectation, quoted in the diffs above. Every commit stages **explicit paths** only. The three churn files and `.output-snapshots/` are never staged and never committed.

### (i.7) The batch's FINAL file set — and the corrections to §(i.2)

This paragraph is **appended**, not a rewrite of §(i.2). It states the file set the batch actually committed and the two places where the diffs quoted above were written before the code settled.

**The files this batch commits** (Task 3):

| file | what the escalation covers |
| --- | --- |
| `src/components/store/AccountDashboard.tsx` | **NEW** (§7-allowed) — the designed dashboard |
| `src/components/store/AccountDashboard.test.tsx` | **NEW** — its suite |
| `src/components/store/account-dashboard.contract.test.ts` | **NEW** — the contract suite |
| `src/routes/store.$slug.account.tsx` | the route's body becomes the dashboard; the stale loader comment is corrected; the theme's account body is composed around it through `contentSlot` |
| `src/lib/themes/songoskriti/preview.ts` | the `account` composition is now `profile_card` + `page_content` (no heading-bearing section on a route-h1 template) |
| `src/lib/themes/songoskriti/preview-demo-data.ts` | the preview's **demo account** — the labelled synthetic shopper the preview's dashboard renders |
| `src/lib/themes/songoskriti/template-distinctness.ts` | the `account` expectation row (and the `checkout` row, Task 4) |
| `src/lib/builder-ast.ts` | `page_content`'s catalogue allowlist widens to the `account` and `checkout` templates |
| `src/components/store/ThemePreviewFrame.tsx` | the preview grants the account template's route-owned body slot over the demo account |
| `src/lib/themes/songoskriti/preview.test.ts` | the pinned `account` composition (§7-prohibited; **not** on the plan's G1 list — see §(i.3)) |
| `src/lib/theme-preview-nav.test.ts` | the pinned `account` composition and its opener |
| `src/components/builder/songoskriti-port-freeze.test.tsx` | the frozen `account` and `checkout` compositions |

**Correction 1 — the lint `required` rules were NOT added.** §(i.2)'s `builder-ast.ts` hunk proposed two new `lintTemplate` `required` rules (`account` and `checkout` must carry a `page_content` section). They were **dropped**: the rules are WARNINGS, and the platform's own default account AST (`src/lib/default-account-ast.ts`) carries the old composition, so the rules would have turned an existing green suite (`src/lib/account-template.test.ts:48`) red for no behavioural gain — the route falls back to the dashboard safely when a merchant's body carries no body slot, and the theme's own composition is enforced by the distinctness gate's expectation row. **No file outside the list above was edited to accommodate them.**

**Correction 2 — the account body is `profile_card` + `page_content`, not `profile_card` + `orders_list` + `page_content`.** The dashboard's orders tab renders the shopper's orders as **structured rows** (the brief's requirement: the four fields `mapOrdersToRows` produces, laid out as rows). The `orders_list` widget renders the same orders as a plain list; carrying both would show the shopper's orders twice on one page. The widget remains available to a merchant who places it deliberately — the route still grants the slot.

### (i.8) Task 4 — the one more §7-prohibited file this batch touches

| file | what the escalation covers | why it had to move |
| --- | --- | --- |
| `src/lib/themes/songoskriti/checkout-composition.test.ts` | the pinned `checkout` composition and the pinned **production-route** behaviour (`ast={null}` and "the theme contributes the tokens only") | §7 lists "existing test files … under `src/`" as prohibited; the plan's G1 list does not name this one. The pin states the **superseded D2** ("the production route renders its own hand-built form and discards the theme's AST"). Decision **D2'** supersedes D2, so the pin is re-pointed at the CURRENT ruling — and it is **stronger**: it now asserts that the route still calls the four server functions and still reads the customer fields from its own `FormData`, where the old pin asserted only that the route threw the AST away. |

**The re-pinned assertion (old → new), quoted in full:**

```diff
-  it("leaves the production checkout route untouched", () => {
-    // The theme changed; the route did not. In production the checkout form
-    // is hand-built (server-quoted totals, live rails), so the theme
-    // contributes the tokens only (`ast={null}`).
+  it("keeps the platform's authority in the production checkout route", () => {
+    // Decision D2' — the theme's checkout body is the SHELL; the route keeps
+    // the form, the customer fields, the server quote, the validation and the
+    // order write. The route's authority is asserted, not assumed.
     const route = readFileSync("src/routes/store.$slug.checkout.tsx", "utf8");
-    expect(route).toContain("ast={null}");
-    expect(route).toContain("the theme contributes the tokens only");
+    expect(route).toContain("ast={ast}");
+    expect(route).toContain('contentSlot="page_content"');
+    expect(route).toContain("quoteCart(");
+    expect(route).toContain("reserveCheckout(");
+    expect(route).toContain("releaseCheckout(");
+    expect(route).toContain("placeOrder(");
+    expect(route).toContain('form.get("name")');
+    expect(route).toContain('form.get("phone")');
   });
```

The composition pins in the same file change with the composition (the route-owned body slot joins the body), and the allowed-widget set gains `page_content` — the platform's own route-owned body slot, which renders **whatever the host grants** and can never author a field, a price or a "place order" action.

---

## (j) Fix round — the review's ten findings (appended, 2026-10-21)

**Base commit of this round:** `fdd654ff` (`feat(storefront): the theme composes the production checkout shell; the platform keeps the form, the totals and the rails`) — the tip of `frame30`.
**Trigger:** the task review of Task 3 (the account dashboard) and Task 4 (the production checkout shell) — **four Important** findings and **six Minor** findings.
**Appended, never rewritten.** Everything above is the record as it stood when the batch was committed.

This round edits §7-prohibited files again, so the same discipline applies: the finding, the file set and the covering test are written **before** the edit (§(j.1)–§(j.4) below), and the **final** unified diffs plus the measured evidence are appended **after** it (§(j.5), §(j.6)). §(j.2) is the amendment §(i.2) never got: the FINAL diff of every §7-prohibited file the batch committed.

### (j.1) The ten findings, and what each one changes

| # | finding | the change | the files |
| --- | --- | --- | --- |
| 1 | the theme's composed profile card is silently lost for a merchant whose published account body predates the change | the route's "the theme places the profile" decision now asks the SAME question `ThemeChrome` asks — **does the theme's body RENDER?** — before it hands the profile to the dashboard | `src/routes/store.$slug.account.tsx` |
| 2 | a signed-out shopper on a themed store gets a permanent loading skeleton | the account slots' `pending` flag is gated on the session (in React Query v5 a **DISABLED** query is `status: "pending"`, so `isPending === true`) | `src/routes/store.$slug.account.tsx` · `src/lib/account-status.ts` (new) |
| 3 | the checkout shell has no payment picker and no totals when the theme's body omits them | the route inspects the theme's own body and supplies its **own** picker / summary when the body carries none — the account route's pattern, applied to the checkout | `src/routes/store.$slug.checkout.tsx` |
| 4 | the order rows' "view" action dead-ends on a 404 | the row becomes an inline **disclosure** fed by the session-scoped `accountOrderFn`; the signed-out lookup asks for the order's **access code** (the order route is token-gated, so the code is the credential) | `src/components/store/AccountDashboard.tsx` · `src/routes/store.$slug.account.tsx` |
| 5 | the record understates the committed blast radius | **§(j.2)** — the final diff of every §7-prohibited file | this record |
| 6 | the six-state wiring in the route is untested | the mapping moves into a **pure** helper and is unit-tested in all six combinations | `src/lib/account-status.ts` (new) · `src/lib/account-status.test.ts` (new) · `src/routes/store.$slug.account.tsx` |
| 7 | the responsive suite's per-width loop is theatre | the loop is dropped: the bucket mapping is asserted once for all six widths, the class contract once — and the comment names the lane where the **pixels** are proved | `src/components/store/AccountDashboard.test.tsx` |
| 8 | a stale comment contradicts the code | the comment is re-pointed at the CURRENT contract (D2′) | `src/lib/themes/songoskriti/preview.ts` |
| 9 | `busy.consent` is accepted and never read | the consent switches are disabled while the consent mutation is in flight | `src/components/store/AccountDashboard.tsx` |
| 10 | the `role="tab"` nav is not the ARIA tabs pattern | the pattern is implemented **properly**: roving `tabindex`, arrow-key navigation, focus moved to the panel on activation | `src/components/store/AccountDashboard.tsx` |

**Files this round touches, and why each is in scope.** Every file below is either on the plan's G1 list (`src/routes/store.$slug.account.tsx`, `src/routes/store.$slug.checkout.tsx`), §7-allowed (`src/lib/themes/songoskriti/**`), a NEW file (§7 allows a new file), or a file the batch already created and therefore already owns (`src/components/store/AccountDashboard.tsx` and its two suites). **No file outside that set is edited** — in particular `src/lib/accounts.server.ts` and `src/lib/accounts.functions.ts` are **read, never written**: `accountOrderFn` and `ownOrderDetail` already exist and already carry the session-scoped order detail this round uses.

| file | kind | why |
| --- | --- | --- |
| `src/lib/account-status.ts` | **NEW** | the pure six-state mapping (finding 6) and the pure pending rule (finding 2) — no React, no DOM, no DB |
| `src/lib/account-status.test.ts` | **NEW** | the six combinations + the pending rule, unit-tested |
| `src/routes/store.$slug.account.tsx` | §7-prohibited (G1) | findings 1, 2, 4, 6 |
| `src/routes/store.$slug.checkout.tsx` | §7-prohibited (G1) | finding 3 |
| `src/components/store/AccountDashboard.tsx` | **NEW** in the batch | findings 4, 9, 10 |
| `src/components/store/AccountDashboard.test.tsx` | **NEW** in the batch | findings 4, 7, 9, 10 |
| `src/components/store/account-dashboard.contract.test.ts` | **NEW** in the batch | finding 4 (the contract suite must assert the truth) |
| `src/lib/checkout-shell.contract.test.ts` | **NEW** in the batch | finding 3 |
| `src/lib/themes/songoskriti/preview.ts` | §7-allowed | finding 8 |
| `src/lib/themes/songoskriti/preview-demo-data.ts` | §7-allowed | the preview's demo order DETAIL, so the preview shows the same disclosure the storefront shows |
| `src/components/store/ThemePreviewFrame.tsx` | §7-prohibited (G1) | the preview grants the demo order loader (finding 4) |
| `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` | `docs/**` | this record |

### (j.2) The FINAL diff of every §7-prohibited file — the amendment §(i.2) never got

§(i.2) quoted a **first draft** of the batch: `ast={checkoutAst}` and `page_content: checkoutBody` for the checkout routes, before the code settled on the extracted `CheckoutBody` component and the shared-cart payment state. It also never re-quoted the final diff for the two checkout routes, `ThemePreviewFrame.tsx`, `preview.ts` or `template-distinctness.ts`. **This subsection is that amendment.** The batch's final state is `fdd654ff`; every diff below is `git diff c27521e7..fdd654ff -- <file>`.

**The §7-prohibited files the batch committed** (port spec §7: `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, all `src/routes/**`, the existing test files under `src/`, and everything else under `src/`):

| file | the exact command that prints the FINAL diff | the final diffstat |
| --- | --- | --- |
| `src/lib/builder-ast.ts` | `git diff c27521e7..fdd654ff -- src/lib/builder-ast.ts` | `8 +-` (1 hunk) |
| `src/routes/store.$slug.account.tsx` | `git diff c27521e7..fdd654ff -- 'src/routes/store.$slug.account.tsx'` | `662 +++------------` (the inline dashboard moves out) |
| `src/routes/store.$slug.checkout.tsx` | `git diff c27521e7..fdd654ff -- 'src/routes/store.$slug.checkout.tsx'` | `842 +++++++++++----------` (the `CheckoutBody` extraction) |
| `src/routes/checkout.tsx` | `git diff c27521e7..fdd654ff -- src/routes/checkout.tsx` | `582 +++++++-------` (the custom-host twin) |
| `src/components/store/ThemePreviewFrame.tsx` | `git diff c27521e7..fdd654ff -- src/components/store/ThemePreviewFrame.tsx` | `43 +-` |
| `src/components/builder/songoskriti-port-freeze.test.tsx` | `git diff c27521e7..fdd654ff -- src/components/builder/songoskriti-port-freeze.test.tsx` | `13 +-` |
| `src/lib/theme-preview-nav.test.ts` | `git diff c27521e7..fdd654ff -- src/lib/theme-preview-nav.test.ts` | `5 +-` |
| `src/lib/themes/songoskriti/preview.test.ts` | `git diff c27521e7..fdd654ff -- src/lib/themes/songoskriti/preview.test.ts` | `6 +-` |
| `src/lib/themes/songoskriti/checkout-composition.test.ts` | `git diff c27521e7..fdd654ff -- src/lib/themes/songoskriti/checkout-composition.test.ts` | `49 +-` |

**And the two §7-ALLOWED files the batch changed whose final diff was also never re-quoted** (they are named here because the review names them, not because §7 needs them):

| file | the exact command | the final diffstat |
| --- | --- | --- |
| `src/lib/themes/songoskriti/preview.ts` | `git diff c27521e7..fdd654ff -- src/lib/themes/songoskriti/preview.ts` | `25 +-` |
| `src/lib/themes/songoskriti/template-distinctness.ts` | `git diff c27521e7..fdd654ff -- src/lib/themes/songoskriti/template-distinctness.ts` | `30 +-` |

**The small diffs, quoted in full** (the three pins and the catalogue row — the ones a reader can check by eye):

```diff
diff --git a/src/lib/builder-ast.ts b/src/lib/builder-ast.ts
index e4ec4f41..a152d9bb 100644
--- a/src/lib/builder-ast.ts
+++ b/src/lib/builder-ast.ts
@@ -1605,7 +1605,13 @@ const BASE_CATALOG: CatalogEntry[] = [
     group: "context",
     slots: ["main"],
     heading: false,
-    templates: ["page", "blog"],
+    // The route-owned BODY slot. The authored page flows its body through it
+    // (`ThemeChrome`'s `contentSlot`); the account dashboard and the
+    // production checkout form flow theirs through the same slot, so the
+    // theme composes AROUND the route's data instead of replacing it. The
+    // widget stays the platform's generic body slot — it renders whatever
+    // the host grants, and the host grants the route's own node.
+    templates: ["page", "blog", "account", "checkout"],
     defaults: {},
     fields: [],
   },
diff --git a/src/lib/theme-preview-nav.test.ts b/src/lib/theme-preview-nav.test.ts
index dd515bc5..ebd82786 100644
--- a/src/lib/theme-preview-nav.test.ts
+++ b/src/lib/theme-preview-nav.test.ts
@@ -121,7 +121,7 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     index: "hero_carousel",
     product: "heading",
     collection: "category_header",
-    account: "heading",
+    account: "profile_card",
     page: "breadcrumb",
     blog: "blog_terms",
     cart: "heading",
@@ -169,9 +169,8 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
       flattenSections(preset.templates.product.main).map((s) => s.type),
     ).toContain("product_media");
     expect(preset.templates.account.main.map((s) => s.type)).toEqual([
-      "heading",
       "profile_card",
-      "orders_list",
+      "page_content",
     ]);
     // Section ids stay unique across templates sharing one counter.
     const ids = (
diff --git a/src/lib/themes/songoskriti/preview.test.ts b/src/lib/themes/songoskriti/preview.test.ts
index 2687c367..27867c0c 100644
--- a/src/lib/themes/songoskriti/preview.test.ts
+++ b/src/lib/themes/songoskriti/preview.test.ts
@@ -77,10 +77,6 @@ describe("songoskriti preview source", () => {
     expect(
       flattenSections(source.main("product", s)!).map((x) => x.type),
     ).toContain("product_media");
-    expect(types("account")).toEqual([
-      "heading",
-      "profile_card",
-      "orders_list",
-    ]);
+    expect(types("account")).toEqual(["profile_card", "page_content"]);
   });
 });
diff --git a/src/components/builder/songoskriti-port-freeze.test.tsx b/src/components/builder/songoskriti-port-freeze.test.tsx
index 610600e3..163082c1 100644
--- a/src/components/builder/songoskriti-port-freeze.test.tsx
+++ b/src/components/builder/songoskriti-port-freeze.test.tsx
@@ -102,11 +102,20 @@ const TEMPLATE_MAIN: Record<string, string[]> = {
     "product_grid",
     "product_rail",
   ],
-  account: ["heading", "profile_card", "orders_list"],
+  // Batch B — the account dashboard (Task 3). The theme's account body is a
+  // FRAME around the route's dashboard: the merchant's own profile card and
+  // the route-owned body slot the dashboard flows through. NO `heading` (the
+  // account template is a route-h1 template — the route owns the page's
+  // <h1>) and NO `orders_list` (the dashboard's orders tab renders the
+  // orders as structured rows; the widget's plain list beside them would
+  // show the same orders twice).
+  account: ["profile_card", "page_content"],
   page: ["breadcrumb", "page_content"],
   blog: ["blog_terms", "blog_archive", "blog_pager"],
   cart: ["heading", "columns"],
-  checkout: ["heading", "checkout_steps", "columns"],
+  // Batch B — the production checkout shell (Task 4). The theme's checkout
+  // body gains the route-owned body slot the checkout FORM flows through.
+  checkout: ["heading", "checkout_steps", "columns", "page_content"],
   search: [
     "result_toolbar",
     "product_grid",
```

**The corrections this amendment makes to §(i.2), stated plainly:**

1. **The checkout-route hunks in §(i.2) were a first draft.** The committed change does **not** pass `ast={checkoutAst}`; it passes the loader's own `ast={ast}` and the route's body is a **separate `CheckoutBody` component** rendered twice — once as the `page_content` context slot (`variant="shell"`) and once as `ThemeChrome`'s `fallback` (`variant="fallback"`). The reason is mechanical: only a component **inside** `LiveCartScope` can read the shared cart context, and the theme's `payment_methods` widget writes the payment state there.
2. **The payment-state move is not "one line".** The route's private `useState("cod")` is gone; the route reads `cart.method` from the shared cart context and writes `cart.setMethod`, and the route's own picker is the fallback for a theme body that carries no `payment_methods` section. §(i.5)'s "the payment state — the shared cart context" row is the truth, and the diff that proves it is the one the command above prints.
3. **The lint `required` rules for `account` / `checkout` were never added** (already stated in §(i.7), Correction 1 — repeated here so the amendment stands alone).
4. **The account composition is `profile_card` + `page_content`** (already stated in §(i.7), Correction 2 — repeated here for the same reason).

### (j.3) This round's exact old → new diff

The hunks below are what this round applies. They are written before the edit; §(j.5) prints the **final** diff of the same files, measured after the edit.

**New file — `src/lib/account-status.ts`** (the pure six-state mapping; finding 6, and the pending rule; finding 2):

```ts
/**
 * The account surface's SIX states — a pure mapping, so the wiring can be
 * tested without a router, a session or a network.
 *
 * The precedence is the one the route has always used, written down:
 * the session resolves first (a pending session is a loading page), then
 * the SIGN (a signed-out shopper is never "loading" — the overview query
 * is disabled for them, and a disabled React Query v5 query is
 * `status: "pending"`, so a naive `isPending` would show a skeleton
 * forever), then the query (pending → loading, error → error), and
 * otherwise the surface is ready.
 */
export type AccountStatus = "unauthenticated" | "loading" | "error" | "ready";

export type AccountStatusInput = {
  /** The session query has not answered yet. */
  sessionPending: boolean;
  /** The session resolved AND carries a shopper. */
  signedIn: boolean;
  /** The overview query has not answered yet. */
  queryPending: boolean;
  /** The overview query failed. */
  queryError: boolean;
};

export function accountStatus(input: AccountStatusInput): AccountStatus {
  if (input.sessionPending) return "loading";
  if (!input.signedIn) return "unauthenticated";
  if (input.queryPending) return "loading";
  if (input.queryError) return "error";
  return "ready";
}

/**
 * The context widgets' `pending` flag.
 *
 * `ProfileCard` and `OrdersList` render a skeleton while `pending` is true
 * and a SIGN-IN PROMPT when their rows are undefined. A signed-out shopper
 * must reach the prompt, never the skeleton: the overview query is
 * DISABLED for them, and a disabled query is `pending` in React Query v5.
 */
export function accountSlotsPending(input: {
  signedIn: boolean;
  queryPending: boolean;
}): boolean {
  return input.signedIn && input.queryPending;
}
```

**New file — `src/lib/account-status.test.ts`**: the six combinations (session pending → loading; signed out → unauthenticated; signed out AND a pending query → unauthenticated — the disabled-query case; query pending → loading; query error → error; all clear → ready) and the pending rule (signed out → never pending; signed in + pending → pending).

**`src/routes/store.$slug.account.tsx`** — findings 1, 2, 4, 6:

```diff
-  const accountSlots = useMemo(() => {
+  // A DISABLED query (a signed-out shopper) is `pending` in React Query v5,
+  // so the widgets' skeleton flag is gated on the session: a signed-out
+  // shopper must reach the widgets' SIGN-IN PROMPT, never a skeleton.
+  const pending = accountSlotsPending({
+    signedIn,
+    queryPending: account.isPending,
+  });
+  const accountSlots = useMemo(() => {
     const sections = chrome?.ast ? flattenAst(chrome.ast) : [];
     const out: Partial<Record<string, ReactNode>> = {};
-    const pending = account.isPending;
     const o = sections.find((s) => s.type === "orders_list");
```

```diff
-  const themePlacesProfile = Boolean(
-    chrome?.ast &&
-    flattenAst(chrome.ast).some((section) => section.type === "profile_card"),
-  );
+  // The theme places the profile card ONLY when its body actually RENDERS
+  // (`themeRendersBody` — the same predicate `ThemeChrome` asks). A
+  // merchant whose published account body predates the route-owned body
+  // slot carries no `page_content` section, so the theme's ENTIRE body is
+  // dropped and the route's fallback (the dashboard) renders — the theme
+  // places nothing, so the dashboard must carry the profile.
+  const themePlacesProfile = Boolean(
+    chrome?.ast &&
+      themeRendersBody(chrome.ast, "page_content") &&
+      flattenAst(chrome.ast).some((section) => section.type === "profile_card"),
+  );
```

```diff
-          pending: account.isPending,
+          pending,
```

```diff
-  const status: AccountDashboardStatus = session.isPending
-    ? "loading"
-    : !signedIn
-      ? "unauthenticated"
-      : account.isPending
-        ? "loading"
-        : account.isError
-          ? "error"
-          : "ready";
+  // The six states, in ONE pure mapping (`src/lib/account-status.ts`) so
+  // the precedence is unit-tested rather than only observable.
+  const status: AccountDashboardStatus = accountStatus({
+    sessionPending: session.isPending,
+    signedIn,
+    queryPending: account.isPending,
+    queryError: account.isError,
+  });
```

and the session-scoped order detail (finding 4):

```diff
+  // The session-scoped order detail. `accountOrderFn` is the tree's own
+  // server function for a shopper's OWN order (`src/lib/accounts.functions.ts`),
+  // scoped to `auth.uid()` by the `customer_order_detail` RPC — so the
+  // shopper sees their order WITHOUT the access token the order page's
+  // route demands, and the row never links to a 404.
+  const orderFn = useServerFn(accountOrderFn);
+  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
+  const orderDetail = useQuery({
+    queryKey: ["store-order-detail", slug, openOrderId],
+    queryFn: () => orderFn({ data: { slug, orderId: openOrderId! } }),
+    enabled: Boolean(openOrderId) && signedIn,
+  });
```

**`src/components/store/AccountDashboard.tsx`** — findings 4, 9, 10: the order rows become a disclosure fed by `onLoadOrder` / `orderDetail` / `orderDetailPending`; the consent switches read `busy?.consent`; the nav implements the ARIA tabs pattern (roving `tabindex`, arrow keys, focus moved to the panel on activation); the signed-out lookup asks for the order's access code and navigates with it.

**`src/routes/store.$slug.checkout.tsx`** — finding 3: the route reads the theme's own body and supplies its **own** payment picker and order summary when the body carries neither `payment_methods` nor `cart_summary`:

```diff
+  // The theme's body may or may not carry the two controls a checkout
+  // cannot be without: the PAYMENT PICKER and the ORDER SUMMARY. A body
+  // that carries neither would leave the shopper placing an order with no
+  // rail chosen and no total shown — so the route supplies its own when
+  // the theme's body carries none. (The account route's pattern, applied
+  // to the checkout.)
+  const themeSections = ast ? flattenAst(ast) : [];
+  const themeHasPaymentPicker = themeSections.some(
+    (section) => section.type === "payment_methods" && !section.invalid,
+  );
+  const themeHasSummary = themeSections.some(
+    (section) => section.type === "cart_summary" && !section.invalid,
+  );
```

### (j.4) The rules that hold throughout this round

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped — every pin that changes changes to a **stronger** expectation, quoted in §(j.5). Every commit stages **explicit paths** only; the three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/` are never staged. The platform keeps every authority: the account's identity and its order detail come from the session-scoped RPCs, the checkout's totals from the server quote, the rails from the server's answer, and the customer fields from the route's own `FormData`.

### (j.5) The round's FINAL diffs and the corrections to §(j.1)–§(j.3)

**Correction to §(j.1)'s file table — TWO more NEW files.** The first draft of this section listed the round's file set before findings 1 and 3 had a **behavioural** seam. A text assertion ("the route mentions `themeRendersBody`") is not a test: it cannot fail when the decision is wrong. So the two decisions that had to be *decisions* — "who places the profile card?" and "which controls does the checkout render?" — moved into two pure modules with their own suites:

| file | kind | what it is |
| --- | --- | --- |
| `src/lib/theme-shell-slots.ts` | **NEW** | the pure decisions: `themeBodyRenders` · `themePlacesAccountProfile` · `themeCarriesPaymentPicker` · `themeCarriesOrderSummary` · `checkoutShellControls` |
| `src/lib/theme-shell-slots.test.ts` | **NEW** | their suite — the legacy account body, the nested payment block, the `invalid` section, the dropped body, the four checkout combinations |

`src/lib/accounts.server.ts` and `src/lib/accounts.functions.ts` are **read, never written**: `accountOrderFn` and `ownOrderDetail` already existed and already carry the session-scoped order detail this round uses. `src/lib/theme-body-slot.ts` is **read, never written**: `themeRendersBody` is the shared predicate and the new module asks it the SAME question `ThemeChrome` asks.

**The round's final diffstat** (against `fdd654ff`):

```
$ git diff --stat fdd654ff -- src docs
 docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md | 325 +++++++++++++
 src/components/store/AccountDashboard.test.tsx                      | 206 ++++++--
 src/components/store/AccountDashboard.tsx                          | 523 ++++++++++++++++++---
 src/components/store/ThemePreviewFrame.tsx                         |  27 +-
 src/components/store/account-dashboard.contract.test.ts            |  55 +++
 src/lib/checkout-shell.contract.test.ts                            |  42 ++
 src/lib/themes/songoskriti/preview-demo-data.ts                    |  54 +++
 src/lib/themes/songoskriti/preview.ts                             |   3 +-
 src/routes/checkout.tsx                                            | 148 ++++--
 src/routes/store.$slug.account.tsx                                 |  82 +++-
 src/routes/store.$slug.checkout.tsx                                | 262 +++++++----
 11 files changed, 1458 insertions(+), 269 deletions(-)
```

plus the four NEW files (`src/lib/account-status.ts`, `src/lib/account-status.test.ts`, `src/lib/theme-shell-slots.ts`, `src/lib/theme-shell-slots.test.ts`).

**The §7-prohibited files this round edits, and the exact command that prints each final diff:**

| file | the exact command | the final diffstat |
| --- | --- | --- |
| `src/routes/store.$slug.account.tsx` | `git diff fdd654ff -- 'src/routes/store.$slug.account.tsx'` | `82 +++-` |
| `src/routes/store.$slug.checkout.tsx` | `git diff fdd654ff -- 'src/routes/store.$slug.checkout.tsx'` | `262 +++++++----` |
| `src/routes/checkout.tsx` | `git diff fdd654ff -- src/routes/checkout.tsx` | `148 ++++--` |
| `src/components/store/ThemePreviewFrame.tsx` | `git diff fdd654ff -- src/components/store/ThemePreviewFrame.tsx` | `27 +-` |

**The two §7-ALLOWED files this round edits:** `src/lib/themes/songoskriti/preview.ts` (`3 +-` — the stale comment, finding 8) and `src/lib/themes/songoskriti/preview-demo-data.ts` (`54 +++` — the preview's demo order DETAIL).

**The decisive hunks, quoted in full** (the three that carry the findings):

```diff
--- a/src/routes/store.$slug.account.tsx
+++ b/src/routes/store.$slug.account.tsx
-  const themePlacesProfile = Boolean(
-    chrome?.ast &&
-    flattenAst(chrome.ast).some((section) => section.type === "profile_card"),
-  );
+  // "The theme places it" means the theme's body RENDERS: `ThemeChrome`
+  // drops the theme's ENTIRE body when it declares no `page_content`
+  // section … The route therefore asks the SAME question `ThemeChrome`
+  // asks (`themePlacesAccountProfile`), so the two can never disagree
+  // about who places the profile card.
+  const themePlacesProfile = themePlacesAccountProfile(chrome?.ast);
@@
-    const pending = account.isPending;
+  const pending = accountSlotsPending({
+    signedIn,
+    queryPending: account.isPending,
+  });
@@
-  const status: AccountDashboardStatus = session.isPending
-    ? "loading"
-    : !signedIn
-      ? "unauthenticated"
-      : account.isPending
-        ? "loading"
-        : account.isError
-          ? "error"
-          : "ready";
+  const status: AccountDashboardStatus = accountStatus({
+    sessionPending: session.isPending,
+    signedIn,
+    queryPending: account.isPending,
+    queryError: account.isError,
+  });
@@
+  // The session-scoped order detail. The order route is TOKEN-GATED …
+  const orderFn = useServerFn(accountOrderFn);
+  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
+  const orderDetail = useQuery({
+    queryKey: ["store-order-detail", slug, openOrderId],
+    queryFn: () => orderFn({ data: { slug, orderId: openOrderId! } }),
+    enabled: Boolean(openOrderId) && signedIn,
+  });
```

```diff
--- a/src/routes/store.$slug.checkout.tsx
+++ b/src/routes/store.$slug.checkout.tsx
+  const shellControls = checkoutShellControls(ast, "shell");
+  const fallbackControls = checkoutShellControls(ast, "fallback");
@@
-      {variant === "fallback" ? paymentPicker : null}
+      {showPaymentPicker ? paymentPicker : null}
@@
-  if (variant === "shell") {
-    return (
-      <div className="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-8 sm:px-6 lg:px-8">
-        {pendingBanner}
-        {form}
-      </div>
-    );
-  }
+  if (variant === "shell") {
+    // … When the theme's body carries no payment picker and no order
+    // summary, the route supplies BOTH …
+    if (!showSummary) {
+      return (
+        <div className="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-8 sm:px-6 lg:px-8">
+          {pendingBanner}
+          {form}
+        </div>
+      );
+    }
+    return (
+      <div className="mx-auto grid max-w-[var(--fq-container,1280px)] gap-12 px-4 py-8 lg:grid-cols-[1.5fr_1fr] lg:gap-16 sm:px-6 lg:px-8">
+        <section className="order-2 lg:order-1 pt-4">
+          {pendingBanner}
+          {form}
+        </section>
+
+        <aside className="order-1 lg:order-2">{summaryPanel}</aside>
+      </div>
+    );
+  }
```

```diff
--- a/src/components/store/AccountDashboard.tsx
+++ b/src/components/store/AccountDashboard.tsx
-          <Link
-            to="/store/$slug/order/$orderId"
-            params={{ slug, orderId: row.id }}
-            className="grid gap-2 py-6 …"
-          >
+          <div className="grid gap-2 py-6 …">
+            …
+            {onLoadOrder ? (
+              <button
+                type="button"
+                aria-expanded={open}
+                aria-controls={`account-order-detail-${row.id}`}
+                onClick={() => toggle(row.id)}
+              >
+                {open ? t("Hide order", …) : t("View order", …)}
+              </button>
+            ) : null}
+          </div>
```

**The pins that changed, and what each changed INTO** (no pin was weakened):

| pin | before | after |
| --- | --- | --- |
| `AccountDashboard.test.tsx` — the tabs' links | `expect(tabs).toContain("/store/$slug/order/$orderId")` | `expect(tabs).not.toContain("/store/$slug/order/$orderId")` — the **absence** of the dead link, plus the disclosure control's `aria-controls` / `aria-expanded` |
| `AccountDashboard.test.tsx` — the order rows | `expect(html).toContain('data-link-to="/store/$slug/order/$orderId"')` | the row is a **disclosure**: one `aria-controls` per row, `aria-expanded="false"`, and the detail panel rendered from the session-scoped payload |
| `AccountDashboard.test.tsx` — the responsive loop | `it.each(WIDTHS)` re-rendering the SAME markup six times | ONE class-contract assertion + the bucket mapping for all six widths in one list; the comment names the Task 7 Playwright lane where the pixels are proved |
| `AccountDashboard.test.tsx` — the order rows' grid class | `sm:grid-cols-[minmax(0,1fr)_auto_auto]` | `sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]` — the row now carries the disclosure control |
| `account-dashboard.contract.test.ts` — the link contract | every `to=`/`href=` is a real path | the same, **plus** the truth: the dashboard never links to the token-gated order route, the route resolves it through `accountOrderFn`, and the signed-out lookup carries the access code |
| `checkout-shell.contract.test.ts` — the controls | (no such pin) | both production routes decide the controls through `checkoutShellControls` and render the ROUTE's own picker and summary when the theme's body carries none |

### (j.6) The measured evidence

**The covering suites** (the round's own plus the batch's neighbours):

```
$ node_modules/.bin/vitest run src/lib/account-status.test.ts src/lib/theme-shell-slots.test.ts \
    src/components/store/AccountDashboard.test.tsx src/components/store/account-dashboard.contract.test.ts \
    src/lib/checkout-shell.contract.test.ts src/lib/themes/songoskriti/checkout-composition.test.ts \
    src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/template-distinctness.test.ts \
    src/components/store/ThemePreviewFrame.test.tsx src/components/builder/songoskriti-port-freeze.test.tsx \
    src/lib/theme-preview-nav.test.ts src/lib/account-template.test.ts src/components/builder/account-widgets.test.tsx \
    src/components/store/account-slots.test.ts src/lib/account-tab.test.ts

 ✓ src/lib/theme-preview-nav.test.ts (43 tests) 82ms
 ✓ src/components/store/account-slots.test.ts (5 tests) 125ms
 ✓ src/lib/themes/songoskriti/template-distinctness.test.ts (9 tests) 192ms
 ✓ src/components/builder/account-widgets.test.tsx (8 tests) 147ms
 ✓ src/components/builder/songoskriti-port-freeze.test.tsx (22 tests) 154ms
 ✓ src/components/store/AccountDashboard.test.tsx (28 tests) 402ms
 ✓ src/lib/account-tab.test.ts (4 tests) 42ms
 ✓ src/lib/account-template.test.ts (4 tests) 24ms
 ✓ src/lib/account-status.test.ts (9 tests) 50ms
 ✓ src/lib/theme-shell-slots.test.ts (14 tests) 82ms
 ✓ src/components/store/ThemePreviewFrame.test.tsx (53 tests) 237ms
 ✓ src/lib/themes/songoskriti/checkout-composition.test.ts (7 tests) 67ms
 ✓ src/lib/checkout-shell.contract.test.ts (21 tests) 69ms
 ✓ src/components/store/account-dashboard.contract.test.ts (16 tests) 38ms
 ✓ src/lib/themes/songoskriti/preview.test.ts (3 tests) 15ms

 Test Files  15 passed (15)
      Tests  246 passed (246)
```

**The typecheck and the lint:**

```
$ node_modules/.bin/tsgo --noEmit
(no output — exit 0)

$ node_modules/.bin/eslint src
✖ 319 problems (0 errors, 319 warnings)
  0 errors and 8 warnings potentially fixable with the `--fix` option.
```

The 319 warnings are the tree's pre-existing ones (the `react-refresh/only-export-components` warnings on the route modules' exported helpers, the `react-hooks/exhaustive-deps` warnings, and the rest). **This round added none**: `src/components/store/ThemePreviewFrame.tsx` still carries exactly its two pre-existing `exhaustive-deps` warnings, and the two new lib modules are warning-free.

**The whole-tree sweep** (the round's final state):

```
$ node_modules/.bin/vitest run
 Test Files  2 failed | 610 passed | 1 skipped (613)
      Tests  3 failed | 8691 passed | 3 skipped (8697)

  FAIL src/lib/analytics-live-shape.test.ts > builds a funnel from flat daily rows without touching events
  FAIL src/lib/analytics-live-shape.test.ts > serves traffic from flat geo+daily rows with empty splits
  FAIL src/lib/site.server.test.ts > throws a guarded missing-env error, never a placeholder client
```

Those three are the **pre-existing** failures (2 in `analytics-live-shape.test.ts`, 1 in `site.server.test.ts` — the latter needs the local `.env` CI lacks). They fail at the base commit too and are not this round's. The round's own delta: **+2 test files, +35 tests, 0 failures.**

**What this round could NOT verify, stated plainly.** The browser lane (Task 7's Playwright measurement) is not run here: the loopback stack is not up, so the pixels of the six widths, the disclosure's open state and the checkout's rendered picker are proven by the CLASS contract and the pure decisions, not by a screenshot. The three states' `aria` behaviour (the arrow keys moving the focus, the focus landing on the panel) is proven by the rendered STRUCTURE (the roving `tabindex`, the panel's `tabindex="0"`, the handlers in the source) and not by a live keypress — the repo has no DOM environment (no jsdom, no testing-library), so every suite is static markup.

### (j.7) The round's commit, and one honest correction to §(j.5)

**The commit.** The whole round is ONE commit — *"fix(storefront): the account dashboard and the checkout shell lose no control — the profile card, the payment picker, the totals and the order view"* (`git log --oneline -1` at the tip of `frame30`). It stages **explicit paths** only: the four NEW files, the two account/checkout routes, the custom-host twin, the dashboard and its two suites, the checkout contract suite, the theme's preview composition and its demo data, the preview host, and this record. The three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/` are **unstaged** at that commit. (The record names the commit by its SUBJECT, not by its SHA: a record that carries its own commit's SHA cannot survive being amended, and this one was amended once, to add this section.)

**The correction.** §(j.5)'s diffstat was measured **before** §(j.5) and §(j.6) were appended to this record, so its own line for this file (`325 +++++++++++++`) is the size of the record *up to §(j.4)*. The record's final size is larger by this section. Every other line of that diffstat is exact and unchanged.

---

## (k) Batch C — the blog variants, the editor's variant surface, the persistence isolation and the publishing integration

**Base commit of this batch:** `2f4eb2f5` (`fix(storefront): the account dashboard and the checkout shell lose no control — the profile card, the payment picker, the totals and the order view`) — the tip of `frame30`.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (Tasks 5 and 6).
**Owner's rulings in force:** Decision Gate **G1** (§7 relaxed for the plan's named list), **G2** (the additive API rule), **G3** (the parity re-freeze runs on the repo's throwaway stack, never on the configured database).

This section is **appended**, not rewritten: everything above is the record as it stood when the account/checkout batch was committed. It is the port spec §9 escalation for the two tasks this batch runs, and it is written **before** any escalated file is edited.

### (k.1) The finding

> The platform already persists **variant** template keys (`parseTemplates`, `src/lib/builder-ast.ts:8117-8136` — every `<known base>_<suffix>` key rides the same `jsonb` map) and already **resolves** them (`resolveTemplate`, `:8254-8274` — `suffix → slug → base → page → index`). Three things are missing, and the plan names all three:
>
> 1. **A closed vocabulary.** `isVariantTemplateKey` (`:8170-8182`) accepts `blog_anything` — any `<base>_<lowercase suffix>` — so there is no way to tell a *legal* variant from a typo. A merchant's typo would persist a template nothing routes to, silently.
> 2. **An authoring surface.** The editor's switcher lists `TEMPLATE_KEYS` only (`src/components/builder/BuilderTopBar.tsx:413`) and `EditorDoc.templates` is typed `ThemeTemplates` (`src/hooks/use-builder-editor.ts:39` — `Partial<Record<TemplateKey, ThemeAst>>`), so a variant is **unauthorable**: the merchant cannot reach it and the editor cannot type it.
> 3. **Route resolution.** No route resolves a variant. The storefront's blog routes render the themeless `BlogArchiveTheme` (`ast={null}`), and the plan's ruling **D5′** splits the reader surfaces in two: the three platform taxonomy routes carry **no store subject** (no slug — a term carries `merchant_id` and a slug that is unique per merchant rather than globally, `src/lib/blog-index.server.ts:304-328`; the author archive is not merchant-scoped at all, `src/lib/blog-reader.server.ts:378-384`), while the **merchant-scoped** routes are where a theme can be resolved (`getStoreChrome` needs a slug, `src/lib/storefront.functions.ts:94-111`).
>
> The consequence that matters: the blog **listing** and the blog **article detail** are ONE `blog` key today, so a merchant cannot design them apart — and the review's fourth failure mode ("the blog listing and the article detail become ambiguous again") is exactly that.

### (k.2) The exact old → new diff

Every §7-prohibited file this batch edits, with its planned unified-diff hunks. The NEW files are not edits and carry no diff; they are listed at the end of this section.

```diff
diff --git a/src/lib/theme-preview-nav.ts b/src/lib/theme-preview-nav.ts
@@
 export type PreviewThemeSource = {
   …
+  /**
+   * Authored demo body per VARIANT (`blog_listing`, `blog_article`, …).
+   * Return null for a variant the theme does not author — the variant then
+   * falls back to its base template. The port is OPTIONAL: a theme that
+   * ships no variant body keeps the exact behaviour it had before.
+   */
+  variantMain?: (
+    variant: TemplateVariantKey,
+    s: SectionBuilder,
+  ) => Section[] | null;
 };
@@
 export type ThemePreviewPreset = {
   …
   templates: Record<TemplateKey, ThemeAst>;
+  /**
+   * The theme's authored VARIANT bodies, keyed `blog_listing` / `blog_article`.
+   * A SEPARATE map, never folded into `templates`: the base map is the
+   * template-key space the preview host resolves against, and an existing
+   * pin counts it (`unsupported-template-state.test.tsx` — ten keys).
+   */
+  variants: Record<string, ThemeAst>;
 };
@@
 export function assemblePreviewTemplates(
   source: PreviewThemeSource,
-): Record<TemplateKey, ThemeAst> {
+): { templates: Record<TemplateKey, ThemeAst>; variants: Record<string, ThemeAst> } {
   …
+  const variants: Record<string, ThemeAst> = {};
+  if (source.variantMain) {
+    for (const variant of TEMPLATE_VARIANT_KEYS) {
+      const main = source.variantMain(variant, s);
+      if (!main) continue;
+      variants[variant] = {
+        header: reid(source.header(baseOf(variant), s), variant),
+        main,
+        footer: reid(source.footer(baseOf(variant), s), variant),
+      };
+    }
+  }
+  return { templates, variants };
 }
```

```diff
diff --git a/src/hooks/use-builder-editor.ts b/src/hooks/use-builder-editor.ts
@@
-export type EditorDoc = { templates: ThemeTemplates; tokens: ThemeTokens };
+/**
+ * The editor's document. `templates` is a `TemplateMap`, not a
+ * `ThemeTemplates`: the map carries the VARIANT keys (`blog_listing`,
+ * `blog_article`) beside the base keys, and a variant is a first-class
+ * editable template from Batch C on.
+ */
+export type EditorDoc = { templates: TemplateMap; tokens: ThemeTokens };
+
+/**
+ * The editor's template IDENTITY: a base key, or one of the CLOSED
+ * variant keys (`blog_listing`, `blog_article`, `archive_category`, …).
+ * Nothing else is addressable — an unvalidated suffix is not a template.
+ */
+export type EditorTemplateKey = TemplateKey | TemplateVariantKey;
```

```diff
diff --git a/src/components/builder/BuilderTopBar.tsx b/src/components/builder/BuilderTopBar.tsx
@@
 export type BuilderTopBarProps = {
   …
   template?: TemplateKey;
   onTemplateChange?: (t: TemplateKey) => void;
+  /**
+   * The selected VARIANT (Batch C). The base key stays the default
+   * selection; a variant is opt-in, and only the CLOSED vocabulary is
+   * offered — a merchant can never save a suffix the platform does not
+   * route to.
+   */
+  templateVariant?: TemplateVariantKey | null;
+  onTemplateVariantChange?: (v: TemplateVariantKey | null) => void;
 };
@@
-                  {TEMPLATE_KEYS.map((key) => {
+                  {TEMPLATE_KEYS.map((key) => {
                     const meta = TEMPLATE_META[key];
                     …
                   })}
+                  {/* The SECOND level: the closed variant vocabulary, one
+                      group per base that has variants. */}
```

```diff
diff --git a/src/components/store/BlogArchiveTheme.tsx b/src/components/store/BlogArchiveTheme.tsx
@@
 export function BlogArchiveTheme({
   feed,
   header,
   empty,
   themeKey,
+  ast,
+  tokens,
 }: {
   feed: BlogFeed;
   header: ReactNode;
   empty: ReactNode;
   themeKey?: string | null;
+  /**
+   * The theme's `blog` composition (Batch C). ABSENT = the platform's own
+   * grid, byte-identical to the render this component has always produced.
+   * PRESENT = the theme's composition wraps the SAME articles.
+   */
+  ast?: ThemeAst | null;
+  tokens?: ThemeTokens | null;
 }) {
   return (
     <BlogFeedProvider value={feed}>
       <ThemeChrome
         template="blog"
-        ast={null}
-        tokens={null}
+        ast={ast ?? null}
+        tokens={tokens ?? null}
```

```diff
diff --git a/src/lib/storefront.functions.ts b/src/lib/storefront.functions.ts
@@
 export const getStoreChrome = createServerFn({ method: "GET" })
   .inputValidator((d: unknown) =>
     z
       .object({
         slug: z.string().min(1),
         template: z.enum([…the ten base keys…]),
+        /**
+         * The CLOSED variant suffix this surface renders (`listing` on the
+         * blog listing, `article` on the article detail). Optional: absent
+         * = the base template, exactly as before.
+         */
+        variant: z.enum(["listing", "article"]).optional(),
       })
       .parse(d),
   )
   .handler(async ({ data }) => {
     const { loadStoreChrome } = await import("./storefront.server");
     const { requestOrigin } = await import("./site-origin.server");
     const chrome = await loadStoreChrome(data.slug, data.template);
     if (!chrome) return null;
+    // The VARIANT composition: the published map resolved through the closed
+    // vocabulary (`blog_listing` → `blog`), never through the open-ended
+    // `page`/`index` tail of `resolveTemplate`.
+    …
     return { ...chrome, origin: requestOrigin() };
   });
```

```diff
diff --git a/src/routes/store.$slug.blog.index.tsx b/src/routes/store.$slug.blog.index.tsx
@@
   loader: async ({ params, deps }) => {
     …
+    // The theme's `blog_listing` composition (Batch C), or the base `blog`
+    // body, or the platform's own grid. The route carries a STORE SLUG, so
+    // it can resolve a theme at all.
+    const chrome = await getStoreChrome({
+      data: { slug: params.slug, template: "blog", variant: "listing" },
+    }).catch(() => null);
     return { ...store, chrome };
   },
@@
     <BlogArchiveTheme
       feed={…}
+      ast={data.chrome?.ast ?? null}
+      tokens={data.chrome?.tokens ?? null}
+      themeKey={data.chrome?.themeKey ?? null}
```

```diff
diff --git a/src/routes/store.$slug.blog.$slug.tsx b/src/routes/store.$slug.blog.$slug.tsx
@@
   loader: async ({ params }) => {
     …
+    // The theme's `blog_article` composition (Batch C), or the base `blog`
+    // body, or the platform's own article render.
+    const chrome = await getStoreChrome({
+      data: { slug: params.slug, template: "blog", variant: "article" },
+    }).catch(() => null);
     return { ...store, chrome };
   },
@@
   return (
-    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 pb-16">
+    <ThemeChrome
+      template="blog"
+      ast={data.chrome?.ast ?? null}
+      tokens={data.chrome?.tokens ?? null}
+      contentSlot="page_content"
+      contextSlots={{ page_content: body, blog_terms: null, blog_archive: null, blog_pager: null }}
+      ownsPrimary
+      fallback={body}
+    >
```

```diff
diff --git a/src/lib/themes.server.ts b/src/lib/themes.server.ts
@@
+/**
+ * Reset ONE template to the theme's default and write a NEW version.
+ *
+ * Never a silent overwrite of the whole map: the merchant's map is read,
+ * exactly ONE key is replaced, and the merged map is linted before it is
+ * committed. A broken default fails closed (`builder.reset_blocked`).
+ */
+export async function resetTemplateToDefault(
+  db: Client,
+  merchantId: string,
+  input: { themeId: string; template: string },
+) { … }
```

```diff
diff --git a/src/routes/_authenticated/dashboard/builder.tsx b/src/routes/_authenticated/dashboard/builder.tsx
@@
-  const [template, setTemplate] = useState<TemplateKey>("index");
+  // The selected template IDENTITY: a base key, or one of the closed
+  // variant keys. The base stays the default selection.
+  const [template, setTemplate] = useState<EditorTemplateKey>("index");
@@
+  {/* The reset affordance: restore ONE template to the theme's default. */}
```

```diff
diff --git a/src/components/store/ThemePreviewFrame.tsx b/src/components/store/ThemePreviewFrame.tsx
@@
   const blogSlots =
     template === "blog"
       ? {
           blog_terms: null,
           blog_archive: null,
           blog_pager: null,
         }
       : undefined;
```

### (k.3) The two files this batch touches that neither brief names

| file | what the escalation covers | why it had to move |
| --- | --- | --- |
| `src/lib/storefront.functions.ts` | the `getStoreChrome` validator gains the CLOSED variant suffixes, and the handler resolves the variant composition | **The plan's step 5.5 cannot be implemented without it.** `getStoreChrome` is the ONLY seam a storefront route has to the published theme, and its hand-written `z.enum` (`:98-108`) accepts the ten BASE keys only — a variant key is rejected at runtime, so the merchant-scoped blog routes could never resolve `blog_listing` / `blog_article`. The file IS on the plan's G1 list (the owner's §7 relaxation) and was already edited by Task 1; this batch's edit is the same kind: the hand-written duplicate of the key space must track the key space. |
| `src/lib/themes-reset.functions.ts` (NEW) | the server function that exposes `resetTemplateToDefault` to the editor | §7 allows NEW files. The reset needs a server function, and `src/lib/themes.functions.ts` is **not** named by either brief — a NEW file keeps the brief's file list intact. |

### (k.4) Backward compatibility

The `templates` column is `jsonb`; **no migration and no DDL**; the archive key's statement in §(c) stands unchanged. For the variants specifically:

- A map written before this batch has no `blog_listing` / `blog_article` key. `parseTemplates` drops nothing it did not already drop, and the routes fall back explicitly: `blog_listing` → `blog` → **the platform's own grid**. Never the homepage (`resolveTemplate`'s `→ index` tail is not used: the resolution accepts only a `"suffix"` or a `"base"` match).
- `parseTemplates` keeps its **open-ended** variant shape (`isVariantTemplateKey`) on purpose: the old theme-package per-page shape (`page_<slug>`) is a legal persisted key, and dropping it would silently discard a third-party package's layouts. The CLOSED vocabulary governs the **authoring surface** and the **route resolution**, not the parser.

### (k.5) The platform's authority (unchanged by this batch)

| concern | where it stays |
| --- | --- |
| the blog's data | the route's own reader (`storeBlogIndexFn` / `storeBlogArticleFn`) — the theme never queries an article |
| the article's title, excerpt, cover and body | **route context**: they flow through the route-owned body slot (`page_content`), the same slot the authored page and the account dashboard use |
| the taxonomy surfaces | the platform's grid — the three platform routes carry no store subject (Task 2 step 2.4) |
| the publish gate | `publishVersion`'s `lintTemplateMap` lints every variant **with its base key** (Batch A) — a variant never reaches a storefront unlinted |

### (k.6) The rules that hold throughout this batch

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped — every suite that changes here changes to a **stronger** expectation: the blog host's "generic by design" pin becomes its **opposite** assertion (with no AST the render is byte-identical to the platform grid; with an AST the theme's composition wraps the SAME articles), the two hard-coded nine-key arrays become `TEMPLATE_KEYS`-driven loops that cover **more** templates than the literals did, and the new suites prove the isolation and the publish contract. Every commit stages **explicit paths** only. The three churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/` are never staged and never committed.

### (k.7) The measured facts this batch recorded

- `TEMPLATE_KEYS` has **ten** members (`index, product, collection, account, page, blog, cart, checkout, search, archive`).
- `parseTemplates` already persists `blog_listing` and `blog_article` through a parse → JSON → parse round trip (measured: `isVariantTemplateKey("blog_listing")` is true because `blog` is a known base and `listing` matches `^[a-z0-9_]+$`).
- The two platform blog routes have a **custom-host branch** that DOES carry a merchant slug (`resolveStorefrontHostFn()` → `host.merchantSlug`, `src/routes/blog.index.tsx:41-58` and `src/routes/blog.$slug.tsx:34-50`). The plan's step 5.5 sentence — "the two platform routes carry no slug and therefore keep the platform's grid" — was measured on the platform-host mode and does not describe the custom-host branch. This batch applies the plan's own governing rule (a route resolves a theme exactly when it carries a store slug): the custom-host branch resolves the variant, the global branch keeps the platform's grid. Recorded here, not silently.
- `src/lib/theme-preview-nav.test.ts` enumerates the template keys in **three** places: the `FIRST_SECTION: Record<TemplateKey, string>` map (now ten entries) and two hard-coded nine-key arrays (`:134-144` Songoskriti, `:375-385` Somvabona). The two literals omit `archive` — the tenth template — so the sweep that says "authors demo content for every template" does not yet cover the archive's demo body.

### (k.8) Batch C's final state — the new files, the measured evidence and the final diffs

**The NEW files this batch added** (a new file is §7-allowed and carries no diff):

| file | what it is |
| --- | --- |
| `src/lib/template-variants.ts` | the CLOSED variant vocabulary: the table, `variantKeysFor`, `baseTemplateKey`, `isKnownTemplateKey`, `resolveVariantAst`, the switcher's grouping and the editor's identity type |
| `src/lib/template-variants.test.ts` | its contract suite: the table is closed, the routes resolve the variant, the base is the fallback, the platform's grid is the last resort, the map round-trips, and the listing and the article detail are distinguishable |
| `src/lib/template-persistence-isolation.test.ts` | the per-template persistence isolation: one template's save touches no other, every pair holds, a theme switch leaks nothing, a variant never overwrites its base |
| `src/lib/publish-migration.contract.test.ts` | the publish / seed / merge / rollback contract: the gate lints every base key, a variant is linted with its BASE key, the seed fills only the missing keys, the merge carries the new key and the variants, an incompatible stored template fails safe, a rollback restores the target version |
| `src/lib/preview-parity.contract.test.ts` | the preview-parity proof: for the seven templates the set of context slots the preview grants equals the set the storefront grants, with the differences NAMED |
| `src/lib/themes-reset.functions.ts` | the server function that exposes the reset to the editor (`themes.update`, never publishes) |

**Two files this batch touched that neither brief names** (both are recorded in §(k.3) above, and both are §7-allowed NEW files, so neither is an escalation):

- `src/lib/storefront.functions.ts` — the `getStoreChrome` validator and handler, so a merchant-scoped route can resolve a VARIANT at all. The file IS on the plan's G1 list (Task 1 already edited it) and the edit is the same kind: the hand-written duplicate of the key space must track the key space.
- `src/lib/themes-reset.functions.ts` — a NEW file, because `src/lib/themes.functions.ts` is not named by the brief and the builder route's barrel (`src/lib/builder-workspace.functions.ts`) is a §7-prohibited file outside the plan's G1 list. The route therefore imports the new module directly.

**The preview-parity differences — named, not closed:**

| surface | the preview grants | the storefront grants | the difference | why |
| --- | --- | --- | --- | --- |
| search | `result_toolbar`, `filter_chips`, `pagination`, `category_header`, `facet_sidebar`, `empty_state` | the same minus `facet_sidebar` | **`facet_sidebar` is preview-only** | Decision D7 — its rows come from the widget-data pipeline (`source: "facets"`) and no storefront route mounts a `WidgetDataProvider` |
| blog (listing) | `blog_terms`, `blog_archive`, `blog_pager` | the same | none | Batch C closed it: the shared blog host grants the pack |
| blog (article detail) | `blog_terms`, `blog_archive`, `blog_pager` | the same plus `page_content` | **`page_content` on the detail** | the route-owned body slot the article's title, excerpt, cover and body flow through |
| cart | the five cart slots | the same | none | Batch C closed it: the preview's cart and checkout grants are now SEPARATE (the cart no longer grants `page_content`) |
| checkout | the five cart slots plus `page_content` | the same | none | — |
| account | `orders_list`, `profile_card`, `page_content` | the same | none | — |
| page | `breadcrumb`, `page_content` | the same | none | Batch C closed it: the preview now grants `breadcrumb` too |
| archive | the six functional slots | **no live route** | — | the three platform taxonomy surfaces are store-less (Task 2 step 2.4); the preview's grant set IS the contract the deferred merchant-scoped route must meet |

**The measured evidence.** The covering suites (this batch's own plus the neighbours):

```
$ node_modules/.bin/vitest run src/lib/template-variants.test.ts \
    src/lib/template-persistence-isolation.test.ts \
    src/lib/publish-migration.contract.test.ts \
    src/lib/preview-parity.contract.test.ts \
    src/lib/theme-preview-nav.test.ts src/components/store/BlogArchiveTheme.test.tsx \
    src/lib/builder-lifecycle.contract.test.tsx src/lib/builder-chrome.contract.test.tsx \
    src/lib/platform-acceptance.test.tsx src/lib/builder-publish-gate.test.ts \
    src/hooks/use-builder-editor.route-h1.test.tsx src/lib/themes/workspace-route-h1-lint.test.ts

  ✓ src/lib/template-variants.test.ts (15 tests)
  ✓ src/lib/template-persistence-isolation.test.ts (5 tests)
  ✓ src/lib/publish-migration.contract.test.ts (12 tests)
  ✓ src/lib/preview-parity.contract.test.ts (8 tests)
  …
  Test Files  12 passed (12)
```

The whole-tree sweep (the batch's final state):

```
$ node_modules/.bin/vitest run
  Test Files  2 failed | 614 passed | 1 skipped (617)
       Tests  3 failed | 8738 passed | 3 skipped (8744)

  FAIL src/lib/analytics-live-shape.test.ts > builds a funnel from flat daily rows without touching events
  FAIL src/lib/analytics-live-shape.test.ts > serves traffic from flat geo+daily rows with empty splits
  FAIL src/lib/site.server.test.ts > throws a guarded missing-env error, never a placeholder client
```

Those three are the **pre-existing** failures (2 in `analytics-live-shape.test.ts`, 1 in `site.server.test.ts` — the latter needs the local `.env` CI lacks). They fail at the base commit too and are not this batch's.

**The typecheck and the lint:**

```
$ node_modules/.bin/tsgo --noEmit
(no output — exit 0)

$ node_modules/.bin/eslint <this batch's paths>
✖ 2 problems (0 errors, 2 warnings)
```

The two warnings are `ThemePreviewFrame.tsx`'s pre-existing `react-hooks/exhaustive-deps` warnings (`:383` and `:549`) — this batch added none.

**The round's commits.** Batch C is TWO commits: *"feat(templates): validated blog and archive variants, authorable in the editor"* (Task 5) and *"feat(builder): per-template isolation, a reset affordance, and preview-parity with the storefront"* (Task 6). Both stage **explicit paths** only. The three churn files and `.output-snapshots/` are **unstaged** at both commits.

---

## (k.9) Batch C's §7-prohibited files this record did not carry (appended, 2026-10-21)

**Why this section exists.** §(k.2) listed the files Batch C *planned* to edit. Four
§7-prohibited files the Batch C commits (`8e76fe81`, `4fd6b9c4`) actually edited were
**not** in that list, and two of them are on the plan's Decision Gate **G1** list (the
eleven "existing test files" and the twelve "routes"). The record's §(f) boundary
statement says it "escalates exactly the files enumerated in the plan's Decision Gate G1,
each with its exact diff; **no file outside that list is edited**" — so the omission is a
defect in the RECORD, not a licence: the files were on G1, and their diffs are recorded
here, now, with the hunks the commits actually applied. **Nothing above this section is
rewritten** — this record is append-only.

**The four files, and the hunks the commits applied.**

1. `src/components/store/BlogArchiveTheme.test.tsx` (G1 — "existing test files"). The old
   pin's TITLE said "generic by design"; Batch C kept the assertion and re-pinned it
   against the measured basis (the platform reader surfaces are STORE-LESS, not
   themeless), and added the two OPPOSITE cases.

```diff
--- a/src/components/store/BlogArchiveTheme.test.tsx
+++ b/src/components/store/BlogArchiveTheme.test.tsx
@@ -79,10 +79,16 @@ describe("BlogArchiveTheme", () => {
     expect(html).not.toContain("No articles published yet.");
   });
 
-  it("forwards themeKey to ThemeChrome with zero behavioral change (generic by design)", () => {
+  it("forwards themeKey to ThemeChrome; with NO composition every key renders identically", () => {
     // Fix round: the prop was accepted but dropped. It is now forwarded;
     // with a null AST the blog has no themed sections, so every key —
     // including songoskriti — renders byte-identical generic markup.
+    //
+    // Batch C: the OLD title of this pin said "generic by design", which
+    // was the wrong BASIS — the platform reader surfaces are store-less,
+    // not themeless. The assertion is unchanged and still true; the two
+    // cases below pin the OPPOSITE behaviour, which is the new truth: with
+    // a composition resolved, the theme's body wraps the same articles.
     const render = (themeKey?: string | null) =>
       renderToStaticMarkup(
         <BlogArchiveTheme
@@ -99,4 +105,78 @@ describe("BlogArchiveTheme", () => {
     expect(foreign).toBe(unkeyed);
     expect(themed).toContain("How a jamdani saree is woven");
   });
+
+  // Batch C — the pin is REVERSED, and it is STRONGER than the one it
+  // replaces. The old pin said "the blog is themeless by design"; the
+  // measured basis is that the platform reader surfaces are STORE-LESS,
+  // not themeless: a merchant-scoped caller carries a store slug, resolves
+  // the theme's `blog` composition, and wears it around the SAME articles.
+  it("renders the platform's grid byte-identically when NO composition is resolved", () => {
+    // No AST at all — the platform's own surface. The grid is the page.
+    const grid = renderToStaticMarkup(
+      <BlogArchiveTheme
+        feed={feed}
+        header={<h1>Blog</h1>}
+        empty={<p>No articles published yet.</p>}
+      />,
+    );
+    // An explicit null AST is the SAME render — the default is the grid.
+    const explicitNull = renderToStaticMarkup(
+      <BlogArchiveTheme
+        feed={feed}
+        header={<h1>Blog</h1>}
+        empty={<p>No articles published yet.</p>}
+        ast={null}
+        tokens={null}
+      />,
+    );
+    expect(explicitNull).toBe(grid);
+    // The grid carries the article row and the pager.
+    expect(grid).toContain("How a jamdani saree is woven");
+    expect(grid).toContain("/blog/how-jamdani-is-woven");
+  });
+
+  it("wears the theme's composition around the SAME articles when one is resolved", () => {
+    const themed = renderToStaticMarkup(
+      <BlogArchiveTheme
+        feed={feed}
+        header={<h1>Blog</h1>}
+        empty={<p>No articles published yet.</p>}
+        ast={{
+          header: [],
+          main: [
+            {
+              id: "opening-1",
+              type: "heading",
+              props: { text: "Browse the journal" },
+            },
+            {
+              // The pack's listing widget: it reads the SAME feed the
+              // platform's grid reads, through the SAME provider.
+              id: "archive-1",
+              type: "blog_archive",
+              props: {
+                heading: "From the journal",
+                layout: "magazine",
+                columns: 3,
+                limit: 9,
+                showCover: true,
+                showExcerpt: true,
+                showMeta: true,
+              },
+            },
+          ],
+          footer: [],
+        }}
+        tokens={null}
+        themeKey="songoskriti"
+      />,
+    );
+    // The theme's composition rendered …
+    expect(themed).toContain("Browse the journal");
+    // … around the SAME article the platform's grid renders. The feed is
+    // still the platform's: the theme never re-authors the data.
+    expect(themed).toContain("How a jamdani saree is woven");
+    expect(themed).toContain("/blog/how-jamdani-is-woven");
+  });
 });
```

2. `src/lib/theme-preview-nav.test.ts` (G1 — "existing test files"). The `FIRST_SECTION`
   map became `TEMPLATE_KEYS`-driven, and the closed vocabulary's own opener map was
   added.

```diff
--- a/src/lib/theme-preview-nav.test.ts
+++ b/src/lib/theme-preview-nav.test.ts
@@ -117,6 +125,10 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
   // Every template's opener is pinned explicitly: six of the nine used to
   // fall through a default branch to the literal "heading", so a template
   // that changed its opener was only caught for index and collection.
+  //
+  // Batch C: the map is now DRIVEN by `TEMPLATE_KEYS` (so a new template
+  // cannot slip past this pin) and it is joined by the VARIANT openers —
+  // the closed vocabulary's own map.
   const FIRST_SECTION: Record<TemplateKey, string> = {
@@ -129,19 +141,23 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     search: "category_header",
     archive: "category_header",
   };
+  /**
+   * The VARIANT openers (Batch C). The closed vocabulary has five keys; a
+   * theme authors the ones it ships, and each opens with its own section.
+   */
+  const VARIANT_FIRST_SECTION: Record<TemplateVariantKey, string> = {
+    blog_listing: "blog_terms",
+    blog_article: "page_content",
+    archive_category: "category_header",
+    archive_tag: "category_header",
+    archive_author: "category_header",
+  };
   it("authors demo content for every template (no empty sub-pages)", () => {
     const preset = resolveThemePreview("songoskriti")!;
-    for (const key of [
-      "index",
-      "product",
-      "collection",
-      "account",
-      "page",
-      "blog",
-      "cart",
-      "checkout",
-      "search",
-    ] as const) {
+    // `TEMPLATE_KEYS`-driven: the sweep covers EVERY template the platform
+    // knows — including `archive`, the tenth key, which the old literal
+    // list of nine did not.
+    for (const key of TEMPLATE_KEYS) {
@@ -179,6 +195,45 @@ describe("resolveThemePreview (Task 5: restored preview route)", () => {
     expect(new Set(ids).size).toBe(ids.length);
   });
+
+  // Batch C — the VARIANT bodies. The closed vocabulary gives the blog two
+  // surfaces (the listing and the article detail); the theme authors them
+  // beside the base templates, in their own map.
+  it("authors demo content for every variant it ships", () => {
+    const preset = resolveThemePreview("songoskriti")!;
+    expect(Object.keys(preset.variants).sort()).toEqual([
+      "blog_article",
+      "blog_listing",
+    ]);
+    for (const variant of TEMPLATE_VARIANT_KEYS) {
+      const ast = preset.variants[variant];
+      if (!ast) continue;
+      expect(ast.main.length, `${variant} main`).toBeGreaterThan(0);
+      expect(ast.main[0]!.type, `${variant} first section`).toBe(
+        VARIANT_FIRST_SECTION[variant],
+      );
+      expect(ast.header.length, `${variant} header`).toBeGreaterThanOrEqual(0);
+      expect(ast.footer.length, `${variant} footer`).toBeGreaterThan(0);
+    }
+    expect(preset.variants["blog_listing"]!.main.map((s) => s.type)).toEqual([
+      "blog_terms",
+      "blog_archive",
+      "blog_pager",
+    ]);
+    expect(
+      preset.variants["blog_article"]!.main.map((s) => s.type),
+    ).not.toEqual(preset.variants["blog_listing"]!.main.map((s) => s.type));
+  });
```

3. `src/routes/blog.index.tsx` (G1 — "routes"). The custom-host branch resolves the
   `blog_listing` composition; the global branch keeps the platform's grid.

```diff
--- a/src/routes/blog.index.tsx
+++ b/src/routes/blog.index.tsx
@@ -24,7 +24,10 @@ import { archiveHead, blogIndexPath, listingJsonLd } from "@/lib/blog-taxonomy";
 import { useLang } from "@/lib/i18n";
 import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
 import { blogSearchFn } from "@/lib/blog-reader.functions";
-import { resolveStorefrontHostFn } from "@/lib/storefront.functions";
+import {
+  resolveStorefrontHostFn,
+  getStoreChrome,
+} from "@/lib/storefront.functions";
@@ -53,7 +56,14 @@ export const Route = createFileRoute("/blog/")({
         data: { slug: host.merchantSlug, page: deps.page },
       });
       if (!store) throw new Response("Not Found", { status: 404 });
-      return { kind: "store" as const, ...store };
+      // Batch C — the theme's `blog_listing` composition. This branch DOES
+      // carry a store subject (the custom host's merchant slug), so by the
+      // store-subject rule it resolves a theme. The GLOBAL branch below has
+      // no store subject at all, so it keeps the platform's grid.
+      const chrome = await getStoreChrome({
+        data: { slug: host.merchantSlug, template: "blog", variant: "listing" },
+      }).catch(() => null);
+      return { kind: "store" as const, ...store, chrome };
@@ -259,6 +269,9 @@ function StoreBlogIndexPage({
         basePath: (page) =>
           page > 1 ? `${basePath}?page=${page}` : basePath,
       }}
+      ast={data.chrome?.ast ?? null}
+      tokens={data.chrome?.tokens ?? null}
+      themeKey={data.chrome?.themeKey ?? null}
```

4. `src/routes/blog.$slug.tsx` (G1 — "routes"). The custom-host branch resolves the
   `blog_article` composition and mounts the related-articles feed.

```diff
--- a/src/routes/blog.$slug.tsx
+++ b/src/routes/blog.$slug.tsx
@@ -9,11 +9,19 @@ import {
-import { resolveStorefrontHostFn } from "@/lib/storefront.functions";
-import { storeBlogArticleFn } from "@/lib/store-blog.functions";
+import {
+  resolveStorefrontHostFn,
+  getStoreChrome,
+} from "@/lib/storefront.functions";
+import {
+  storeBlogArticleFn,
+  storeBlogIndexFn,
+} from "@/lib/store-blog.functions";
+import { BlogFeedProvider, type BlogFeed } from "@/components/builder/blog";
+import { ThemeChrome } from "@/components/store/ThemeChrome";
@@ -40,7 +48,19 @@ export const Route = createFileRoute("/blog/$slug")({
         data: { slug: host.merchantSlug, articleSlug: params.slug },
       });
       if (!store) throw notFound();
-      return { kind: "store" as const, ...store };
+      // Batch C — the theme's `blog_article` composition. This branch DOES
+      // carry a store subject (the custom host's merchant slug), so by the
+      // store-subject rule it resolves a theme. The GLOBAL branch below has
+      // no store subject at all, so it keeps the platform's own surface.
+      const chrome = await getStoreChrome({
+        data: { slug: host.merchantSlug, template: "blog", variant: "article" },
+      }).catch(() => null);
+      // The store's OTHER articles — the feed the theme's related-content
+      // rail reads. Best-effort: a failure degrades to an empty feed.
+      const related = await storeBlogIndexFn({
+        data: { slug: host.merchantSlug, page: 1 },
+      }).catch(() => null);
+      return { kind: "store" as const, ...store, chrome, related };
@@ -215,6 +235,27 @@ function ReadingProgressBar() {
+/**
+ * The store's articles, minus the one being read — the feed the theme's
+ * related-content rail reads. Without it the widget would render the
+ * engine's synthetic sample rows on a live page.
+ */
+function relatedFeed(
+  related: Awaited<ReturnType<typeof storeBlogIndexFn>> | null,
+  currentSlug: string,
+  basePath: string,
+): BlogFeed {
+  return {
+    articles: (related?.listing.articles ?? []).filter(
+      (a) => a.slug !== currentSlug,
+    ),
+    facets: related?.listing.facets ?? [],
+    paging: related?.listing.paging ?? paging(() => basePath, 1, 0),
+    basePath: (page: number) =>
+      page > 1 ? `${basePath}?page=${page}` : basePath,
+  };
+}
@@ -238,7 +279,10 @@ function StoreArticlePage({
   const { article } = data;
   const merchantName = article.merchant?.name ?? data.merchantSlug;
   const outline = articleOutline(article.body ?? "");
-  return (
+  // The route's own body — the article. It flows through the theme's
+  // route-owned body slot when the theme publishes a `blog_article`
+  // composition, and it IS the fallback when the theme publishes none.
+  const body = (
@@ -295,6 +339,28 @@ function StoreArticlePage({
   );
+  return (
+    <BlogFeedProvider value={relatedFeed(data.related, article.slug, "/blog")}>
+      <ThemeChrome
+        template="blog"
+        ast={data.chrome?.ast ?? null}
+        tokens={data.chrome?.tokens ?? null}
+        themeKey={data.chrome?.themeKey ?? null}
+        contentSlot="page_content"
+        contextSlots={{
+          // The route-owned body slot: the article.
+          page_content: body,
+          // The blog pack: the terms rail, the listing and the pager.
+          blog_terms: null,
+          blog_archive: null,
+          blog_pager: null,
+        }}
+        ownsPrimary
+        containerClassName="mx-auto max-w-6xl py-8"
+        fallback={body}
+      />
+    </BlogFeedProvider>
+  );
 }
```

**The two signature widenings** (`src/lib/themes.server.ts` — G1 — "engine / platform
libs"). `mergeTemplates` and `diffTemplates` took a `ThemeTemplates`, which cannot carry
a variant key; the merge genuinely carries the variants, so the type was widened to the
`TemplateMap` the parser actually returns. `sectionsOf` follows.

```diff
--- a/src/lib/themes.server.ts
+++ b/src/lib/themes.server.ts
@@ -1508,7 +1509,7 @@ function digestSection(section: {
-function sectionsOf(templates: ThemeTemplates, key: string) {
+function sectionsOf(templates: TemplateMap, key: string) {
@@ -1541,8 +1542,8 @@ function templateMapKeys(
 export function diffTemplates(
-  mine: ThemeTemplates,
-  upstream: ThemeTemplates,
+  mine: TemplateMap,
+  upstream: TemplateMap,
 ): TemplateDiff[] {
@@ -1566,8 +1567,8 @@ function templateMapKeys(
 export function mergeTemplates(
-  mine: ThemeTemplates,
-  upstream: ThemeTemplates,
+  mine: TemplateMap,
+  upstream: TemplateMap,
   mode: UpdateMode,
 ): TemplateMap {
```

**The `use-builder-editor` lint-map hunk** (`src/hooks/use-builder-editor.ts` — G1 —
"hooks / components"). The editor's lint map lints every VARIANT **with its base key**,
exactly as the publish gate does.

```diff
--- a/src/hooks/use-builder-editor.ts
+++ b/src/hooks/use-builder-editor.ts
@@ -629,8 +671,15 @@ export function useBuilderEditor(
   const issues = useMemo(() => {
-    if (!doc) return {} as Record<TemplateKey, ReturnType<typeof lintTemplate>>;
-    const out = {} as Record<TemplateKey, ReturnType<typeof lintTemplate>>;
+    if (!doc)
+      return {} as Record<
+        TemplateKey | TemplateVariantKey,
+        ReturnType<typeof lintTemplate>
+      >;
+    const out = {} as Record<
+      TemplateKey | TemplateVariantKey,
+      ReturnType<typeof lintTemplate>
+    >;
@@ -638,6 +687,19 @@ export function useBuilderEditor(
     for (const key of TEMPLATE_KEYS)
       out[key] = lintTemplate(doc.templates[key] ?? EMPTY_AST, key);
+    // Every VARIANT is linted with its BASE key (`blog_listing` as `blog`),
+    // so a context widget inside a variant is checked against the template
+    // that owns the data. Linting a variant as if it were a template would
+    // make every context widget inside it a publish-blocking "needs data
+    // this template does not provide" error — the same rule the publish
+    // gate applies (`lintTemplateMap`, `src/lib/themes.server.ts`).
+    for (const variant of TEMPLATE_VARIANT_KEYS) {
+      const ast = doc.templates[variant];
+      if (!ast) continue;
+      const base = baseTemplateKey(variant);
+      if (!base) continue;
+      out[variant] = lintTemplate(ast, base);
+    }
     return out;
   }, [doc]);
```

**The rest of Batch C's §7-prohibited edits** (`src/lib/themes.server.ts`,
`src/hooks/use-builder-editor.ts`, `src/components/builder/BuilderTopBar.tsx`,
`src/components/store/ThemePreviewFrame.tsx`,
`src/routes/_authenticated/dashboard/builder.tsx`, `src/lib/storefront.functions.ts`)
WERE carried by §(k.2) as planned diffs. This section closes the RECORD's gap; it
changes no code.

---

## (l) Fix round — the review's thirteen findings (appended, 2026-10-21)

**Base commit of this round:** `4fd6b9c4` (`feat(builder): per-template isolation, a reset
affordance, and preview-parity with the storefront`) — the tip of `frame30`.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (Tasks 5 and 6 —
the review round of those two tasks).
**Owner's rulings in force:** Decision Gate **G1** (§7 relaxed for the plan's named list),
**G2** (the additive API rule), **G3** (the parity re-freeze runs on the repo's throwaway
stack, never on the configured database).

This section is **appended**, not rewritten: everything above is the record as it stood
when Batch C was committed. It is written **before** any file this round edits is
touched.

### (l.1) The thirteen findings

**Critical 1 — resetting a VARIANT destroys the theme's default variant body.**
`src/lib/themes.server.ts:1762-1764`: `registryPackage(key)` returns only
`preview.templates` and drops `preview.variants`, so the preset bag has no `blog_listing`
and the reset writes `EMPTY_AST` — clicking "Reset to default" on *Blog listing* erases
Songoskriti's authored `blog_listing` composition and silently downgrades the storefront
listing to the base `blog` pack. **Fixed** by resolving the preset's variants alongside
the base map (§(l.2), `src/lib/themes.server.ts`).

**Critical 2 — the reset path has no test at all.** `grep -rn "resetTemplateToDefault"
src/` found only the definition and its server-fn wrapper, so an unverified destructive
affordance shipped. **Fixed** by a new contract suite (§(l.3),
`src/lib/themes-reset.contract.test.ts`).

**Important 3 — publish does not enforce the closed vocabulary.** `parseTemplates` keeps
any `<known base>_<suffix>` key and `lintTemplateMap` lints it with its base, so
`blog_bogus` can be published and persists as a template nothing routes to. **Fixed** in
`lintTemplateMap` with the stable reason code `builder.unknown_variant`, exempting ONLY
the legacy `page_<slug>` package shape (§(l.2)).

**Important 4 — the parity proof does not cover the variants, and
`resolvePreviewVariantAst` is dead code.** `src/lib/preview-parity.contract.test.ts`
compared slot maps for the BASE templates only, and `resolvePreviewVariantAst`
(`src/lib/theme-preview-nav.ts:613`) was exported and never called. **Fixed** by a case
that resolves one variant through BOTH seams and asserts the same winning key and the
same AST (§(l.3)), and by the preview host calling the seam (§(l.2)).

**Important 5 — the preview host cannot render a variant from the URL, so preview ≠
production for a variant.** `src/routes/theme-preview.$key.tsx:255` cast the requested
key to `TemplateKey`, so `?template=blog_listing` landed in `unsupportedTemplate` and
rendered the "not supported by this theme" panel. **Fixed** by passing `preset.variants`
into `ThemePreviewFrame`, treating a closed variant key as a known template, and
resolving it through `resolvePreviewVariantAst`; the explicit unsupported panel stays for
everything outside the closed table (§(l.2)).

**Important 6 — a variant's Bangla coverage escapes the platform's 90 % gate.**
`src/lib/translation-coverage.ts:89-105` iterated `TEMPLATE_KEYS` only, so a variant full
of untranslated strings was not counted (and the total it did count was inflated by the
omission). **Fixed** by iterating the closed variant keys with their base key, exactly
as `lintTemplateMap` does (§(l.2)), plus a publish-contract case (§(l.3)).

**Important 7 — the hand-written variant enum is a subset of the closed table.**
`src/lib/storefront.functions.ts:127` accepted only `"listing" | "article"` of the five
legal suffixes, so the three archive variants could not be requested through the only
storefront seam. **Fixed** by deriving the enum from the table (§(l.2)).

**Minor 8 — the escalation record omits four §7-prohibited files the batch edited** (plus
the `mergeTemplates` / `diffTemplates` signature widening and the `use-builder-editor`
lint-map hunk). **Fixed** by §(k.9) above.

**Minor 9 — `markSaved()` after the reset can strand unsaved client edits.**
`src/routes/_authenticated/dashboard/builder.tsx:1280-1286`: the server wrote ITS map,
but the client patched only the reset key and then marked the whole doc saved, so
unsaved edits in other templates were neither persisted nor shown as unsaved. **Fixed**
by returning the full merged map from the reset and replacing the doc with it — no
`markSaved` of a doc the server never saw (§(l.2)).

**Minor 10 — a vacuous seed assertion.** `src/lib/publish-migration.contract.test.ts:285`
asserted `expect(sent.blog_article).toBeUndefined()` while the fixture's merchant map
held only `index` and the package carried no variants, so it could not fail. **Fixed** by
putting `blog_article` in the fixture's merchant map and asserting it is present in
`_preset.templates` unchanged (§(l.3)).

**Minor 11 — the "Active" badge disappears when a variant is selected.**
`src/components/builder/BuilderTopBar.tsx:463`: `isSelected = template === key &&
!templateVariant`, and the variant entry showed no badge. **Fixed** by giving the
selected variant entry the same "Active" treatment (§(l.2)).

**Minor 12 — the reset button is destructive, unconfirmed, and defaults to the HOME
template.** `builder.tsx:1541-1555` rendered "Reset to default" beside the template
strip with no confirmation, and the initial selection is `index`, so a first click blanks
the homepage composition. **Fixed** by arming the button before it fires and by
disabling it until a template is explicitly chosen (§(l.2)).

**Minor 13 — the report's test-delta arithmetic does not reconcile** (it claimed "+4
test files, +47 tests"; the diff accounts for +43). **Fixed** in
`.superpowers/sdd/2026-10-21-frame30-core-cms-upgrade/task-5-6-report.md`.

### (l.2) The exact old → new diff of every file this round edits

Every §7-prohibited file this round edits, with its exact unified-diff hunks. The two
NEW files are not edits and carry no diff; they are listed in §(l.3).

```diff
diff --git a/src/lib/themes.server.ts b/src/lib/themes.server.ts
@@
 import { resolveThemePreview } from "./theme-preview-nav";
-import { isKnownTemplateKey } from "./template-variants";
+import {
+  isKnownTemplateKey,
+  isTemplateVariantKey,
+  variantSuffixesFor,
+} from "./template-variants";
@@
 function lintTemplateMap(templates: TemplateMap): string[] {
   const out: string[] = [];
   const report = (key: string, base: TemplateKey, ast: ThemeAst): void => {
     for (const issue of lintTemplate(ast, base)) {
       if (issue.level !== "error") continue;
       out.push(`${key}: ${issue.message}`);
     }
   };
   for (const key of TEMPLATE_KEYS) {
     report(key, key, templateOf(templates, key));
   }
   for (const [key, ast] of Object.entries(templates)) {
     if (isTemplateKey(key)) continue;
     const base = variantBaseKey(key);
     if (!base || !ast) continue;
+    // The CLOSED vocabulary decides what a VARIANT may be. A key shaped
+    // like a variant (`<known base>_<suffix>`) whose suffix is NOT in the
+    // closed table is a typo or a leftover — and it is a template nothing
+    // routes to, so it is REFUSED here, with the stable reason code
+    // `builder.unknown_variant`.
+    //
+    // The ONE exemption is the legacy theme-package per-page shape
+    // (`page_<slug>`): it is a legal persisted key of a third-party
+    // package, so it keeps round-tripping AND keeps being linted with its
+    // base key, exactly as before.
+    if (!isTemplateVariantKey(key)) {
+      if (base !== "page") {
+        out.push(
+          `${key}: builder.unknown_variant — "${key}" is not one of the known variants of "${base}" (${variantSuffixesFor(base).join(", ") || "none"}).`,
+        );
+      }
+      continue;
+    }
     report(key, base, ast);
   }
   return out;
 }
@@
     const workspace = await loadWorkspace(db, merchantId);
     const sourceKey = workspace.theme.sourceKey;
-    const pkg = sourceKey ? registryPackage(sourceKey) : null;
-    const bag = (pkg?.templates ?? {}) as Record<string, ThemeAst | undefined>;
+    // The theme's own default for ONE key. The preset carries the base
+    // templates AND the VARIANT bodies in TWO maps (`preview.templates` /
+    // `preview.variants`), and the reset must read BOTH: a bag with the
+    // base map alone has no `blog_listing`, so the reset would write the
+    // EMPTY AST and erase the theme's authored variant composition.
+    const preset = sourceKey ? resolveThemePreview(sourceKey) : null;
+    const bag = {
+      ...((preset?.templates ?? {}) as Record<string, ThemeAst | undefined>),
+      ...((preset?.variants ?? {}) as Record<string, ThemeAst | undefined>),
+    };
     const ast = bag[key] ?? EMPTY_AST;
@@
-    return { versionId, template: key, ast };
+    // The FULL merged map rides back with the result: the client replaces
+    // its document with the map the SERVER wrote, so the editor's state and
+    // the stored state can never disagree about what was reset.
+    return { versionId, template: key, ast, templates };
   });
 }
```

```diff
diff --git a/src/lib/translation-coverage.ts b/src/lib/translation-coverage.ts
@@
 import {
   biTextKeysOf,
   catalogEntry,
   TEMPLATE_KEYS,
+  type TemplateMap,
   type Section,
   type TemplateKey,
+  type ThemeAst,
   type ThemeTemplates,
 } from "./builder-ast";
 import { biTextState, readBiText, type BiTextState } from "./bitext";
+import { TEMPLATE_VARIANT_KEYS, baseTemplateKey } from "./template-variants";
@@
 export function translationCoverage(templates: ThemeTemplates): CoverageReport {
   const byTemplate: Partial<Record<TemplateKey, CoverageStats>> = {};
   const totals = blank();
-
-  for (const key of TEMPLATE_KEYS) {
-    const ast = templates[key];
-    if (!ast) continue;
-    const stats = coverageOfTemplate(key, ast);
-    if (stats.total === 0) continue;
-    const { refs, ...rest } = stats;
-    byTemplate[key] = rest;
-    totals.total += stats.total;
-    totals.ok += stats.ok;
-    totals.fallback += stats.fallback;
-    totals.empty += stats.empty;
-    totals.refs.push(...refs);
-  }
+  // The base templates AND the VARIANTS both count. A variant's বাংলা
+  // coverage is the theme's coverage: the publish gate's 90 % floor must
+  // see it, or a variant full of untranslated strings slips through a gate
+  // that the base templates cannot slip through.
+  //
+  // A variant is counted against its BASE key — exactly as `lintTemplateMap`
+  // lints it (a context widget inside a variant belongs to the base's
+  // data). The stats ACCUMULATE into the base's row, so the studio's meter
+  // and the publish gate read the same numbers.
+  const bag = templates as TemplateMap;
+  const add = (key: TemplateKey, ast: ThemeAst): void => {
+    const stats = coverageOfTemplate(key, ast);
+    if (stats.total === 0) return;
+    const { refs, ...rest } = stats;
+    const seen = byTemplate[key];
+    const merged = seen
+      ? {
+          total: seen.total + rest.total,
+          ok: seen.ok + rest.ok,
+          fallback: seen.fallback + rest.fallback,
+          empty: seen.empty + rest.empty,
+          percent: 0,
+        }
+      : rest;
+    merged.percent = percentOf(merged);
+    byTemplate[key] = merged;
+    totals.total += stats.total;
+    totals.ok += stats.ok;
+    totals.fallback += stats.fallback;
+    totals.empty += stats.empty;
+    totals.refs.push(...refs);
+  };
+  for (const key of TEMPLATE_KEYS) {
+    const ast = bag[key];
+    if (!ast) continue;
+    add(key, ast);
+  }
+  for (const variant of TEMPLATE_VARIANT_KEYS) {
+    const ast = bag[variant];
+    if (!ast) continue;
+    const base = baseTemplateKey(variant);
+    if (!base) continue;
+    add(base, ast);
+  }
```

```diff
diff --git a/src/lib/storefront.functions.ts b/src/lib/storefront.functions.ts
@@
 import { PAYMENT_METHOD_KEYS } from "./payment-rails";
+import { TEMPLATE_VARIANTS } from "./template-variants";
@@
 const methodSchema = z.enum(PAYMENT_METHOD_KEYS);
+
+/**
+ * The closed variant suffixes the storefront seam accepts — DERIVED from the
+ * vocabulary table, never written out by hand.
+ *
+ * A hand-written copy of the list is how the three archive variants became
+ * unrequestable: the validator accepted `"listing" | "article"` while the
+ * table listed five, and the day the archive route lands it would have 500'd
+ * at the validator. Deriving the list makes that drift impossible.
+ */
+export const STORE_VARIANT_SUFFIXES = Object.values(
+  TEMPLATE_VARIANTS,
+).flat() as [string, ...string[]];
@@
         /**
          * The closed variant suffix of `template` this surface renders.
          * Optional: absent = the base template, exactly as before.
+         *
+         * DERIVED from the closed table, so the validator can never drift
+         * from the vocabulary again: the five legal suffixes come from
+         * `TEMPLATE_VARIANTS` itself. A hand-written copy of the list is
+         * how the three archive variants became unrequestable through the
+         * only storefront seam.
          */
-        variant: z.enum(["listing", "article"]).optional(),
+        variant: z.enum(STORE_VARIANT_SUFFIXES).optional(),
```

```diff
diff --git a/src/lib/theme-preview-nav.ts b/src/lib/theme-preview-nav.ts
@@
 export function validateThemePreviewSearch(search: Record<string, unknown>): {
-  template: TemplateKey | undefined;
+  template: TemplateKey | TemplateVariantKey | undefined;
@@
-  const template = (TEMPLATE_KEYS as readonly string[]).includes(rawTemplate)
-    ? (rawTemplate as TemplateKey)
-    : undefined;
+  // A CLOSED VARIANT key (`blog_listing`, `blog_article`, …) is a KNOWN
+  // template: the platform routes to it, so it travels in the known slot
+  // and the preview host resolves it through the variant rule. A key
+  // OUTSIDE the closed table is still the unsupported request.
+  const template = (TEMPLATE_KEYS as readonly string[]).includes(rawTemplate)
+    ? (rawTemplate as TemplateKey)
+    : isTemplateVariantKey(rawTemplate)
+      ? rawTemplate
+      : undefined;
```

```diff
diff --git a/src/routes/theme-preview.$key.tsx b/src/routes/theme-preview.$key.tsx
@@
 import type { TemplateKey } from "@/lib/builder-ast";
+import type { TemplateVariantKey } from "@/lib/template-variants";
@@
       tokens={preset.tokens}
       templates={preset.templates}
+      // The theme's authored VARIANT bodies (`blog_listing`, `blog_article`).
+      // They ride BESIDE the base map: the host resolves a closed variant
+      // key through the variant rule (the variant first, then its base).
+      variants={preset.variants}
@@
-        (initialTemplate ?? unsupportedTemplate) as TemplateKey | undefined
+        (initialTemplate ?? unsupportedTemplate) as TemplateKey | TemplateVariantKey | undefined
       }
```

```diff
diff --git a/src/components/store/ThemePreviewFrame.tsx b/src/components/store/ThemePreviewFrame.tsx
@@
 import {
   applyDemoFocus,
   type DemoFocus,
   handlePreviewCanvasClick,
   handlePreviewCanvasSubmit,
   previewSearchForSwitch,
   resolveDemoFocus,
+  resolvePreviewVariantAst,
 } from "@/lib/theme-preview-nav";
+import {
+  baseTemplateKey,
+  isTemplateVariantKey,
+  type TemplateVariantKey,
+} from "@/lib/template-variants";
@@
   /** All authored templates keyed by template key. */
   templates: Record<TemplateKey, ThemeAst>;
+  /**
+   * The theme's authored VARIANT bodies (`blog_listing`, `blog_article`).
+   *
+   * A SEPARATE map, exactly as the preset carries it: the base map stays
+   * the ten-key template space the host resolves against, and a key the
+   * platform does not know must stay ABSENT from it (the host turns an
+   * absent key into its explicit "not supported by this theme" panel).
+   * ABSENT = the theme ships no variant body, and every variant falls back
+   * to its base template.
+   */
+  variants?: Record<string, ThemeAst>;
   /** Deep-linkable starting tab (?template=product). Defaults to homepage. */
-  initialTemplate?: TemplateKey;
+  initialTemplate?: TemplateKey | TemplateVariantKey;
@@
-  const [template, setTemplate] = useState<TemplateKey>(startTemplate);
+  const [template, setTemplate] = useState<TemplateKey | TemplateVariantKey>(
+    startTemplate,
+  );
@@
   const templatesByKey: Partial<Record<TemplateKey, ThemeAst>> = templates;
-  const authored = templatesByKey[template];
+  // The VARIANT bodies ride BESIDE the base map. A closed variant key
+  // resolves through the SAME rule the storefront uses — the variant first,
+  // then its base, and nothing else — so the preview shows the composition
+  // the storefront will render, not a different one.
+  const variantBag = useMemo(
+    () => ({ ...templates, ...(variants ?? {}) }),
+    [templates, variants],
+  );
+  const isVariant = isTemplateVariantKey(template);
+  // The BASE key drives every catalogue allowlist check and every grant,
+  // exactly as it does for the editor and the publish gate: no widget's
+  // catalogue row names a variant key.
+  const baseTemplate: TemplateKey = isVariant
+    ? (baseTemplateKey(template) ?? "index")
+    : (template as TemplateKey);
+  const variantResolved = isVariant
+    ? resolvePreviewVariantAst(variantBag, template)
+    : null;
+  const authored: ThemeAst | undefined = isVariant
+    ? variantResolved?.ast
+    : templatesByKey[template as TemplateKey];
   const unsupported = authored === undefined;
   const ast = authored ?? templatesByKey.index ?? EMPTY_AST;
@@
-    focus && focus.template === template
+    focus && focus.template === baseTemplate
@@
-    (template === "collection" || template === "product") &&
-    demoFocus.template === template
+    (baseTemplate === "collection" || baseTemplate === "product") &&
+    demoFocus.template === baseTemplate
@@
-    if (template !== "account") return undefined;
+    if (baseTemplate !== "account") return undefined;
@@
-    template === "cart"
+    baseTemplate === "cart"
@@
-    template === "checkout"
+    baseTemplate === "checkout"
@@
-    if (template !== "search" || !isSongoskriti) return [];
+    if (baseTemplate !== "search" || !isSongoskriti) return [];
@@
-    template === "search"
+    baseTemplate === "search"
@@
-    if (template !== "search" || !isSongoskriti) return undefined;
+    if (baseTemplate !== "search" || !isSongoskriti) return undefined;
@@
-    template === "blog"
+    baseTemplate === "blog"
@@
-    template === "archive"
+    baseTemplate === "archive"
@@
-    if (template !== "page") return undefined;
+    if (baseTemplate !== "page" && template !== "blog_article") return undefined;
@@
-                  {template === "checkout" ? (
+                  {baseTemplate === "checkout" ? (
@@
-                            template={template}
+                            template={baseTemplate}
@@
-                          template={template}
+                          template={baseTemplate}
@@
-                            template={template}
+                            template={baseTemplate}
@@
-                              template={template}
+                              template={baseTemplate}
```

```diff
diff --git a/src/components/builder/BuilderTopBar.tsx b/src/components/builder/BuilderTopBar.tsx
@@
                                   <span className="min-w-0 flex-1">
-                                    <span className="text-xs font-medium leading-none">
-                                      {t(variantMeta.en, variantMeta.bn)}
-                                    </span>
+                                    <span className="flex items-center justify-between gap-2">
+                                      <span className="text-xs font-medium leading-none">
+                                        {t(variantMeta.en, variantMeta.bn)}
+                                      </span>
+                                      {/* The selected VARIANT carries the
+                                          SAME "Active" treatment as the
+                                          selected base — otherwise the badge
+                                          VANISHES the moment a variant is
+                                          chosen, and the merchant cannot see
+                                          which surface they are editing. */}
+                                      {variantSelected && (
+                                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">
+                                          {t("Active", "সক্রিয়")}
+                                        </span>
+                                      )}
+                                    </span>
```

```diff
diff --git a/src/routes/_authenticated/dashboard/builder.tsx b/src/routes/_authenticated/dashboard/builder.tsx
@@
   const [template, setTemplate] = useState<EditorTemplateKey>("index");
+  // The reset is DESTRUCTIVE: it replaces ONE template with the theme's
+  // own default. It is ARMED first (a second click confirms) and it stays
+  // DISABLED until the merchant has explicitly chosen a template — the
+  // initial selection is the homepage, so a first click would otherwise
+  // blank the homepage composition.
+  const [resetArmed, setResetArmed] = useState(false);
+  const [templateChosen, setTemplateChosen] = useState(false);
@@
     onSuccess: async (result) => {
       if (doc) {
+        // The server wrote ITS OWN merged map (the merchant's map with
+        // exactly ONE key replaced) and returned it. The editor follows
+        // THAT map — and it is NOT marked saved: the server never saw the
+        // client's unsaved edits, so marking them saved would strand them
+        // (neither persisted nor shown as unsaved).
         editor.replaceDoc({
           ...doc,
-          templates: { ...doc.templates, [result.template]: result.ast },
+          templates: result.templates,
         });
       }
-      editor.markSaved();
@@
           <button
             type="button"
-            onClick={() => resetTemplate.mutate()}
-            disabled={resetTemplate.isPending || !themeId || !doc}
+            onClick={() => {
+              if (!resetArmed) {
+                setResetArmed(true);
+                return;
+              }
+              setResetArmed(false);
+              resetTemplate.mutate();
+            }}
+            disabled={
+              resetTemplate.isPending || !themeId || !doc || !templateChosen
+            }
@@
-            {resetTemplate.isPending
-              ? t("Resetting…", "ফেরানো হচ্ছে…")
-              : t("Reset to default", "ডিফল্টে ফেরান")}
+            {resetTemplate.isPending
+              ? t("Resetting…", "ফেরানো হচ্ছে…")
+              : resetArmed
+                ? t("Confirm reset", "রিসেট নিশ্চিত করুন")
+                : t("Reset to default", "ডিফল্টে ফেরান")}
           </button>
```

```diff
diff --git a/src/lib/themes/songoskriti/unsupported-template-state.test.tsx b/src/lib/themes/songoskriti/unsupported-template-state.test.tsx
@@
         templates={preset.templates}
-        initialTemplate={requested as TemplateKey}
+        // The theme's authored VARIANT bodies — the host resolves a closed
+        // variant key through them (the variant first, then its base).
+        variants={preset.variants}
+        initialTemplate={requested as TemplateKey | TemplateVariantKey}
@@
-    expect(ROUTE_SRC).toContain(
-      "(initialTemplate ?? unsupportedTemplate) as TemplateKey | undefined",
-    );
+    expect(ROUTE_SRC).toContain(
+      "(initialTemplate ?? unsupportedTemplate) as",
+    );
+    // … and it hands the theme's VARIANT bodies to the host beside the
+    // base map, so the host can resolve a closed variant key.
+    expect(ROUTE_SRC).toContain("variants={preset.variants}");
```

### (l.3) The NEW files this round adds

| file | what it is |
| --- | --- |
| `src/lib/themes-reset.contract.test.ts` | the reset contract: exactly ONE key is replaced and every other key (the other variants included) is byte-identical · a NEW version is written (`theme_commit` once, `theme_publish` never) · the draft revision advances · an unknown key is refused · **a variant reset restores the theme's AUTHORED variant body** |

### (l.4) Backward compatibility

No migration and no DDL. The `templates` column is `jsonb` and its shape does not change.

- **The reset** still replaces exactly ONE key, still lints the merged map before writing,
  still writes a new version and still advances the draft. What changes is WHICH default
  it writes for a VARIANT: the theme's own authored variant body, instead of the EMPTY
  AST. A theme with no source package still writes the EMPTY AST for that one key.
- **The publish gate** now refuses a variant-shaped key outside the closed table with
  the reason code `builder.unknown_variant`. The legacy `page_<slug>` package shape is
  exempt and keeps being linted with its base key, exactly as before. A theme whose
  map carries a `<base>_<suffix>` key outside the closed table (say `product_summer`,
  the row-level suffix override's own shape) is now refused at the publish — stated
  here, not absorbed silently.
- **The preview host** renders a closed variant key through the variant rule (the
  variant first, then its base). Every key outside the closed table keeps the explicit
  "not supported by this theme" panel — the state is never a silent homepage.
- **The translation gate** counts the variants' বাংলা coverage now. A theme whose
  variant is half-translated is refused at the publish where it used to pass; that is
  the point of the gate.
- **The storefront seam** accepts every suffix of the closed table, so the three
  archive variants become requestable the day their route lands.

### (l.5) The rules that hold throughout this round

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped —
every suite that changes here changes to a **stronger** expectation, and the two pins
this round rewrites (the seed's `blog_article` assertion and the preview route's
source-text assertion) are rewritten to assert MORE. Every commit stages **explicit
paths** only. The three churn files (`.artifacts/e2e/playwright-report/index.html`,
`ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and `.output-snapshots/`
are never staged and never committed.

### (l.6) The round's measured evidence

**The covering suites** (this round's own, plus the neighbours whose pins it moves):

```
$ node_modules/.bin/vitest run src/lib/themes-reset.contract.test.ts \
    src/lib/publish-migration.contract.test.ts src/lib/preview-parity.contract.test.ts \
    src/lib/template-variants.test.ts \
    src/lib/themes/songoskriti/unsupported-template-state.test.tsx \
    src/lib/template-persistence-isolation.test.ts src/lib/theme-preview-nav.test.ts \
    src/components/store/BlogArchiveTheme.test.tsx src/lib/phase3-content.test.ts \
    src/lib/phase9-guardrails.test.ts

  Test Files  10 passed (10)
       Tests  146 passed (146)
```

**The whole-tree sweep** (the round's final state):

```
$ node_modules/.bin/vitest run
  Test Files  2 failed | 615 passed | 1 skipped (618)
       Tests  3 failed | 8754 passed | 3 skipped (8760)

  FAIL src/lib/analytics-live-shape.test.ts > builds a funnel from flat daily rows without touching events
  FAIL src/lib/analytics-live-shape.test.ts > serves traffic from flat geo+daily rows with empty splits
  FAIL src/lib/site.server.test.ts > throws a guarded missing-env error, never a placeholder client
```

Those three are the **pre-existing** failures (2 in `analytics-live-shape.test.ts`, 1 in
`site.server.test.ts` — the latter needs the local `.env` CI lacks). They fail at the
base commit too and are not this round's.

**The baseline, measured in the SAME environment** (the base commit `2f4eb2f5`, run in a
throwaway worktree with the same `.env`):

```
  Test Files  2 failed | 610 passed | 1 skipped (613)
       Tests  3 failed | 8695 passed | 3 skipped (8701)
```

**The arithmetic, reconciled.** The batch's earlier report claimed "+4 test files, +47
tests" — it did not reconcile, and the baseline it compared against was mis-stated as
"8691 passed". The measured numbers are:

| state | files | tests (total) |
| --- | --- | --- |
| base `2f4eb2f5` | 613 | 8701 |
| Batch C `4fd6b9c4` | 617 | 8744 |
| this round `9705a67e` | 618 | 8760 |

Batch C's own delta is **+4 test files and +43 tests** — which reconciles exactly with
the diff's own count (44 `it(` blocks added, 1 removed). This round adds **+1 test file
and +16 tests**. The batch's total over its base is **+5 test files and +59 tests**.

**The typecheck and the lint:**

```
$ node_modules/.bin/tsgo --noEmit
(no output — exit 0)

$ node_modules/.bin/eslint <this round's paths>
✖ 3 problems (0 errors, 3 warnings)
```

The three warnings are **pre-existing**: `ThemePreviewFrame.tsx`'s
`react-hooks/exhaustive-deps` (`:400` and `:569` — the same two the batch's own report
recorded, shifted by this round's additions) and `BuilderTopBar.tsx`'s
`react-refresh/only-export-components` (`:11`). This round added none.

**The round's commit.** ONE commit — the record's §(l.2) describes the diff of every
file the round touches, so the record and the code land together:
`9705a67e` (`fix(builder): the reset restores a variant, the publish gate enforces the
closed vocabulary, and the preview renders a variant`). It stages **explicit paths**
only. The three churn files and `.output-snapshots/` are **unstaged** at that commit.

### (l.7) The round's commits — a correction to §(l.6)

**Correction.** §(l.6) says the round is ONE commit. It is **three** — the last one is a
correction §(l.2) already describes, not new scope:

| commit | subject | files |
| --- | --- | --- |
| `9705a67e` | `fix(builder): the reset restores a variant, the publish gate enforces the closed vocabulary, and the preview renders a variant` | 14 |
| `3ee3fe1e` | `docs(escalation): the fix round's measured evidence — the reconciled test delta and the round's commit` | 1 |
| `f085bc5c` | `fix(builder): the reset hands back the STORED map, so the editor's document and the stored document are the same bytes` | 2 |

**What `f085bc5c` changes.** The reset returned the PRE-PARSE merged map while the commit
RPC stores the PARSED one, so the map the client replaced its document with was not
byte-identical to the map the storage layer held. The result now carries the parsed map —
the same shape `parseTemplates` gives the commit — and the contract suite pins it
(`JSON.stringify(out.templates)` equals the map the commit RPC received).

**The final measured state** (the tree at `f085bc5c`):

```
$ node_modules/.bin/vitest run
  Test Files  2 failed | 615 passed | 1 skipped (618)
       Tests  3 failed | 8754 passed | 3 skipped (8760)

  FAIL src/lib/analytics-live-shape.test.ts > builds a funnel from flat daily rows without touching events
  FAIL src/lib/analytics-live-shape.test.ts > serves traffic from flat geo+daily rows with empty splits
  FAIL src/lib/site.server.test.ts > throws a guarded missing-env error, never a placeholder client
```

The same three **pre-existing** failures, the same file and test counts as the run quoted
in §(l.6) — the correction changed no observable behaviour. The typecheck is clean
(`tsgo --noEmit`, exit 0) and the lint reports the same three pre-existing warnings.

---

## (m) Batch D — the test lanes: the three `.e2e` sweeps gain `archive` (appended, 2026-10-21)

**Branch:** `frame30` · **Base commit:** `26ff6fd2` (`docs(escalation): the fix round's three commits, and the correction to its one-commit statement`) — the tip after Batch C's fix round.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — **Task 7** (the test lanes) and **Task 8** (the self-critique pass).
**Governing spec:** port spec §7 (Boundary) and §9 (Testing & evidence).

### (m.1) The finding

**Three existing `.e2e/**` files walk a list of template keys, and all three omitted
`archive` — the tenth template and the one whose body a merchant authors.** Port spec §7
prohibits *"existing `.e2e/**` files (specs and `playwright.config.ts`; new `.e2e` specs /
helpers are additive-only, config edits escalate)"*, so every one of the three edits below
is **escalation-required**, and this section is written **before** the first of them.

The three omissions are the same omission with three different consequences:

1. `.e2e/songoskriti-port-parity.spec.ts` — the **parity harness**. Its `TEMPLATES` list
   (`:36-46`) drives the frozen capture: 9 templates × 3 widths × 2 locales = 54 stills
   plus 6 chrome stills. With `archive` absent, **the new surface is never captured and
   never compared** — the parity harness is blind to the exact surface Decision **D1'**
   created.
2. `.e2e/real-frames.spec.ts` — the **real-frame sweep** (`:63-73`). It opens
   `/theme-preview/<theme>?template=<key>` for every template and counts the REAL (sandboxed)
   frames the preview renders. With `archive` absent, the archive preview's frames are
   never inspected, so a frame the archive body mounts would go unreported.
3. `.e2e/theme-preview-security.spec.ts` — the **preview exfiltration probe** (`:567-575`).
   It sweeps seven `?template=` variants with a hover on each, asserting that nothing
   reaches outside loopback. With `archive` absent, the archive preview — the body a
   merchant authors and the one the archive key makes authorable — **was never swept**.
   This file is assigned to Task 7 by the plan itself (2026-10-21) and was owned by no task
   before it.

All three edits are **ADDITIONS**. No entry is removed, renamed or reordered, no assertion
is weakened, and no baseline is rewritten.

### (m.2) The exact old → new diff

```diff
--- a/.e2e/songoskriti-port-parity.spec.ts
+++ b/.e2e/songoskriti-port-parity.spec.ts
@@ -36,14 +36,15 @@
 const TEMPLATES = [
   "index",
   "product",
   "collection",
   "account",
   "page",
   "blog",
   "cart",
   "checkout",
   "search",
+  "archive",
 ] as const;
 const WIDTHS = [1440, 768, 375] as const;
```

```diff
--- a/.e2e/real-frames.spec.ts
+++ b/.e2e/real-frames.spec.ts
@@ -63,14 +63,15 @@
 const TEMPLATES = [
   "index",
   "product",
   "collection",
   "account",
   "page",
   "blog",
   "cart",
   "checkout",
   "search",
+  "archive",
 ] as const;
 const INDEX_VARIATIONS: Record<(typeof THEMES)[number], string[]> = {
```

```diff
--- a/.e2e/theme-preview-security.spec.ts
+++ b/.e2e/theme-preview-security.spec.ts
@@ -565,12 +565,13 @@
     // Template-switch sweep (?template= variants) with hover per template.
     for (const template of [
       "product",
       "collection",
       "search",
       "cart",
       "account",
       "blog",
       "page",
+      "archive",
     ]) {
```

### (m.3) What this batch does NOT do to the frozen evidence

**The machine baselines are NOT written here and the human captures in `reference/` are
NOT rewritten.** The parity harness is run in **compare mode** only (never
`--update-snapshots`), and only against the repo's **throwaway** stack
(`docker-compose.e2e.yml`, project `e2e-supabase`, `http://127.0.0.1:58000`) — never
against the configured database, whose `.env` routes to the **production** database
container (`report.md` §5.1 D6). The re-freeze that would write the `archive` baselines is
the **owner's action** under Decision Gate **G3**, and it happens on the throwaway stack.

**The consequence, stated plainly:** the `archive` captures the harness now attempts have
**no machine baseline yet**, so the harness's `toHaveScreenshot` for `archive` has nothing
to compare against and **fails** until the owner re-freezes. That is the honest state of
the world and it is **not** papered over here: the batch's parity run is reported with
that measurement (see §(m.5)), and the plan's own commits write nothing into
`reference/` or into the snapshot directory.

### (m.4) Backward compatibility

The `archive` key rides the same `templates` jsonb map as every other key
(`src/lib/builder-ast.ts`), so these three edits change **no** persisted state, **no**
schema and **no** runtime behaviour: they widen three *test* lists. The preview route
already answers `?template=archive` with the theme's authored archive body (the key is in
`TEMPLATE_KEYS` since Task 1), so the three sweeps reach a live, 200-responding surface.

### (m.5) The rules that hold throughout this batch

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped —
the three edits are pure additions to a list, and each sweep therefore **asserts more**
than before. Every commit stages **explicit paths** only. The three churn files
(`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`,
`ops/routing/upstream.conf`) and `.output-snapshots/` are never staged and never
committed.

### (m.6) The boundary

This section escalates **exactly three files**, all of them existing `.e2e/**` specs named
by the plan's Decision Gate **G1** ("existing `.e2e` files — `.e2e/real-frames.spec.ts` ·
`.e2e/songoskriti-port-parity.spec.ts`") and by the plan's Task 7 Files block, plus
`.e2e/theme-preview-security.spec.ts`, which the plan's Task 7 Files block names as
assigned-to-Task-7 on 2026-10-21. No file outside that list is edited by this section.

---

## (n) Batch D — two defects the Task 7 lanes found, and their fixes (appended, 2026-10-21)

**Branch:** `frame30` · **Base commit:** `26ff6fd2`.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — **Task 7** (the test lanes) and **Task 8** (the self-critique pass).
**Governing spec:** port spec §7 (Boundary) and §9 (Testing & evidence).

### (n.1) The finding

Task 7's two browser lanes are the first time the editor's **variant** surface and the
store-scoped blog article route are driven through a real browser. Both found a defect,
and both are recorded here **before** the edit.

**(1) The studio CRASHES when a merchant selects a VARIANT.** Batch C made the editor's
selected template identity a base key **or** a variant key
(`EditorTemplateKey`, `src/routes/_authenticated/dashboard/builder.tsx:448`) and taught
the publish modal the variant-aware label (`templateLabel`, `:609-611`) — but the
**canvas breadcrumb** still indexed the BASE-only label map with the selected identity:

```
src/routes/_authenticated/dashboard/builder.tsx:2208
  {t(TEMPLATE_LABEL[template].en, TEMPLATE_LABEL[template].bn)}
```

`TEMPLATE_LABEL` is a `Record<TemplateKey, …>` — it has **no** `archive_category`,
`archive_tag`, `archive_author`, `blog_listing` or `blog_article` key — so the read is
`undefined.en` and the whole studio dies:

```
TypeError: Cannot read properties of undefined (reading 'en')
    at BuilderStudio (src/routes/_authenticated/dashboard/builder.tsx)
```

**Measured on the throwaway stack (2026-10-21, Chromium):** selecting
`Archive category` in the editor's own variant strip (or the `Archive category` entry
of the top bar's template switcher) replaces the whole page with the route's error
boundary — *"This page didn't load / Something went wrong. Try again — nothing was
lost."* — and the studio is unusable. **Every** variant of every base is affected: the
whole of Batch C's variant surface is unreachable in the browser. The unit suites did
not catch it because they never render the studio.

**(2) The store-scoped blog article route answers 404 for EVERY article.** The route
file was `src/routes/store.$slug.blog.$slug.tsx` — path `/store/$slug/blog/$slug` —
with **two** path parameters of the same name. TanStack Router matches both segments
into the **same** `params.slug` key, so only ONE slug survives, and the loader read the
STORE slug as the ARTICLE slug:

```
src/routes/store.$slug.blog.$slug.tsx:55-57
  storeBlogArticleFn({ data: { slug: params.slug, articleSlug: params.slug } })
```

`storeBlogContext` then looks the merchant up **by slug**
(`merchantIdForSlug`, `src/lib/storefront-host.server.ts:393-403`) with the ARTICLE's
slug, finds no merchant, and the route throws `notFound()`.

**Measured on the throwaway stack (2026-10-21):** the article row was visible to the
very same anon query the loader makes (PostgREST returned the row for
`merchant_id=eq.<demo>`, `slug=eq.the-jamdani-weavers-of-sonargaon`, `status=eq.published`,
`published_at=lte.now`, `deleted_at=is.null`), the store's own blog LISTING rendered the
article, and the article route still answered **404 "Article not found"** — with **no**
`render_read.failed` event in the server log, which is what proves the loader never
reached the article query: the merchant context was already null. The route could only
ever resolve an article whose slug **equalled** the store's slug, so it was unusable for
every real article.

This is a **pre-existing** defect (the file was created in `11d4265f`, before this
programme), but it is on the surface Task 7.4 must assert — *"the blog listing and the
blog article render **different** compositions"* — and the theme's `blog_article`
composition (Batch C) is unreachable without it.

### (n.2) The exact old → new diff

```diff
--- a/src/routes/_authenticated/dashboard/builder.tsx
+++ b/src/routes/_authenticated/dashboard/builder.tsx
@@ -606,9 +606,12 @@ function BuilderStudio() {
   const selectedBase = baseTemplateKey(template) ?? "index";
   const selectedVariant = isTemplateVariantKey(template) ? template : null;
-  const templateLabel = selectedVariant
-    ? TEMPLATE_VARIANT_LABEL[selectedVariant].en
-    : TEMPLATE_LABEL[selectedBase].en;
+  // The label PAIR of the selected identity: the variant's own label when a
+  // variant is selected, the base's otherwise. `TEMPLATE_LABEL` is a BASE-only
+  // map, so the selected identity — which may be a VARIANT key — must never be
+  // used to index it (that read is `undefined` and crashed the studio).
+  const templateLabelPair = selectedVariant
+    ? TEMPLATE_VARIANT_LABEL[selectedVariant]
+    : TEMPLATE_LABEL[selectedBase];
+  const templateLabel = templateLabelPair.en;
   const sections = ast[slot];
@@ -2205,7 +2208,7 @@ function BuilderStudio() {
               <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground pr-2 border-r border-border/60">
                 <span className="font-semibold text-foreground">
-                  {t(TEMPLATE_LABEL[template].en, TEMPLATE_LABEL[template].bn)}
+                  {t(templateLabelPair.en, templateLabelPair.bn)}
                 </span>
```

```diff
--- a/src/routes/store.$slug.blog.$slug.tsx
+++ b/src/routes/store.$slug.blog.$articleSlug.tsx
@@
-export const Route = createFileRoute("/store/$slug/blog/$slug")({
+export const Route = createFileRoute("/store/$slug/blog/$articleSlug")({
   loader: async ({ params }) => {
     let store;
     try {
       store = await storeBlogArticleFn({
-        data: { slug: params.slug, articleSlug: params.slug },
+        data: { slug: params.slug, articleSlug: params.articleSlug },
       });
```

The file is **renamed** (`git mv`), because the route path is derived from the file
name; the URL shape is **unchanged** (`/store/<slug>/blog/<article>`), and no link in
the tree referenced the old path (`grep -rn 'store/\$slug/blog/\$slug' src/` matched only
the route file itself and the generated tree). `src/routeTree.gen.ts` is **generated**
by the TanStack Router Vite plugin and is regenerated by it; the diff is **20
insertions / 19 deletions**, all of them the renamed route's id, path, import and type
entries — no unrelated churn.

### (n.3) Backward compatibility

- **The studio fix** changes no behaviour for a BASE template: `templateLabelPair` is
  `TEMPLATE_LABEL[selectedBase]` for every base key, exactly what the old code read
  through `TEMPLATE_LABEL[template]`. For a VARIANT it now reads the variant's own
  label instead of crashing.
- **The route fix** changes the URL shape **not at all**; only the *name* of the second
  path parameter changes, so the two slugs stop colliding. A merchant's saved links
  (`/store/<slug>/blog/<article>`) keep resolving; the route's own canonicals
  (`storeBlogBasePath`, `storeArticleHead`) are untouched.
- No migration, no DDL, no persisted state changes.

### (n.4) The platform's authority (unchanged)

Neither fix touches authorisation, tenancy, pricing or the payment rails. The studio
still lints and publishes through `publishVersion`; the article route still resolves
the merchant by slug and the article by the platform's own published-status rules
(`status = 'published'`, `published_at <= now`, `deleted_at is null`).

### (n.5) The rules that hold throughout this batch

No new npm dependency and no lockfile change. No test is weakened, deleted or skipped.
Every commit stages **explicit paths** only. The three churn files
(`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`,
`ops/routing/upstream.conf`) and `.output-snapshots/` are never staged and never
committed.

### (n.6) The boundary

This section escalates **three** §7-prohibited files: the two route files above (both
named by the plan's Decision Gate **G1** — `src/routes/_authenticated/dashboard/builder.tsx`
and `src/routes/store.$slug.blog.$slug.tsx`) and the **generated** `src/routeTree.gen.ts`,
which is regenerated by the router's own Vite plugin as a mechanical consequence of the
route rename. No file outside that list is edited by this section.

---

## (o) Batch D — the install seeds the theme's VARIANT defaults (appended, 2026-10-21)

**Branch:** `frame30` · **Base commit:** `26ff6fd2`.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — **Task 7** (the test lanes).

### (o.1) The finding

Task 7.4 must assert that *"the blog listing and the blog article render **different**
compositions"*. On the throwaway stack they render the **same** composition, and the
reason is a gap in the **install seed**, not in the routes.

**The theme AUTHORS two variant bodies** — `blog_listing` (the pack: the terms rail, the
article grid and the pager) and `blog_article` (the theme's frame around the article: the
route-owned body slot, the related-content rail and the newsletter) —
`src/lib/themes/songoskriti/preview.ts:479-530` (`variantMain`). They are assembled into
the theme's preview preset as a **separate map**, `variants`
(`src/lib/theme-preview-nav.ts:535-560`).

**But the PACKAGE that seeds a merchant's installation carries only the BASE keys.**
`registryPackage` (`src/lib/themes.server.ts:1222-1245`) returns
`preview.templates` — the base map — and never `preview.variants`:

```ts
const preview = resolveThemePreview(key);
if (preview) {
  return {
    templates: preview.templates as ThemeTemplates,   // ← the base keys only
    tokens: preview.tokens,
    version: "1.0.0",
  };
}
```

**Measured on the throwaway stack (2026-10-21):** the installed theme's
`theme_versions.templates` map carries exactly the **ten base keys** — `account, archive,
blog, cart, checkout, collection, index, page, product, search` — and **no variant key**.
So the merchant's storefront resolves `blog_listing` and `blog_article` through
`resolveTemplate`'s fallback to the **base `blog` body**, and the two surfaces render the
SAME composition. The editor's variant strip opens an **empty canvas** for the same
reason: the merchant's map carries no variant body to edit.

This is the mirror image of the gap §(h.2) closed — *"the package's map carries only the
base keys"* — which is why Batch C's own seed-merge fix (keep the MERCHANT's variant
keys) was necessary but not sufficient: the merchant's variants were protected, while the
THEME's variant defaults were never seeded at all.

### (o.2) The exact old → new diff

```diff
--- a/src/lib/themes.server.ts
+++ b/src/lib/themes.server.ts
@@ -1222,14 +1222,22 @@ export function registryPackage(key: string): {
   version: string;
 } {
   const preview = resolveThemePreview(key);
   if (preview) {
     return {
-      templates: preview.templates as ThemeTemplates,
+      // The package carries the theme's VARIANT bodies beside its base
+      // bodies. `preview.variants` is a SEPARATE map in the preview preset
+      // (the base map is the template-key space the preview host resolves
+      // against), and the install seed is the ONE place a merchant's map is
+      // filled with the theme's defaults — so the theme's authored variant
+      // defaults have to travel with the package. Without them a merchant
+      // who installs the theme gets no `blog_listing` / `blog_article` body:
+      // the editor's variant strip opens EMPTY and the storefront's
+      // listing and article both fall back to the base `blog` body, so the
+      // two surfaces are not distinguishable.
+      templates: {
+        ...preview.templates,
+        ...preview.variants,
+      } as unknown as ThemeTemplates,
       tokens: preview.tokens,
       version: "1.0.0",
     };
   }
```

### (o.3) Backward compatibility and the merchant's own work

- `parseTemplates` keeps the variant keys (`isVariantTemplateKey`), so the seeded map
  round-trips through the draft, the version rows and the publish payload unchanged.
- The per-key seed merge (`mergeSeedTemplates`, `:1394-1404`) fills only the keys the
  merchant's map does NOT carry — so a merchant who already authored `blog_listing`
  keeps their own body, and a merchant who authored nothing gets the theme's default.
- The publish gate lints every variant **with its base key**
  (`lintTemplateMap`, `:849-900`), so the seeded variants are linted before they can
  reach a storefront.
- No migration, no DDL, and **no** change to any base template's body: the parity
  captures for the base templates are untouched by this change.

### (o.4) The boundary

This section escalates **one** §7-prohibited file: `src/lib/themes.server.ts`, which the
plan's Decision Gate **G1** names ("engine / platform libs — … `src/lib/themes.server.ts`").
No file outside that list is edited by this section.

---

## (p) Batch D, Task 8 — the self-critique's three fixes (appended, 2026-10-21)

**Branch:** `frame30` · **Base commit:** `26ff6fd2`.
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — **Task 8** (the self-critique pass).
**Record:** `docs/superpowers/songoskriti-evidence/port/phase3-self-critique.md`.

### (p.1) The finding — the three weakest failures, and what each one is

The seven surfaces were captured at 1440 / 1280 / 768 / 430 / 390 / 375 in both
locales (84 stills, `/tmp/opencode/frame30-self-critique/first/`) and read. **The three
weakest failures are:**

**(1) The store-scoped blog surfaces carry NO store chrome.** The listing
(`/store/<slug>/blog`) and the article (`/store/<slug>/blog/<article>`) are the only
storefront surfaces that render with **no store header, no navigation, no logo, no cart
and no account link** — the page starts at the reader's own breadcrumb. Every other
storefront surface (search, cart, account, checkout, page) renders the store's
`StoreHeader`. A shopper who reaches the blog from a search result or a link cannot get
back into the shop. **Measured:** the `blog-1440-en.png` capture has no nav row at all,
while `cart-1440-en.png` has the full one.

**(2) The account page shows an ANONYMOUS visitor TWO sign-in affordances.** The theme's
`profile_card` widget renders its own bare prompt — a centred, letter-spaced,
uppercase **"YOUR PROFILE / Sign in to continue. / SIGN IN"** block, in a different type
language from the rest of the theme — and the platform's own order-lookup panel renders
a second one immediately below it ("Track Your Order", also centred). The account
surface is the programme's **highest-priority visual repair** (the brief's own words),
and this is what a visitor sees on it.

**(3) The search page's `<h1>` and breadcrumb say "Collection".** The theme's Songoskriti
`category_header` renderer reads the title from `title` / `text` — **neither of which the
catalogue declares** (`src/lib/builder-ast.ts:2708-2732` declares `heading`, `body`,
`imageUrl`, `scrim`, `showCount`, `showBreadcrumb`, `homeLabel`). The sanitiser drops
every undeclared prop on the way to storage, so on the **storefront** the title chain
falls through to the renderer's literal fallback — **"Collection"** — on a page whose
`<h1>` should name the search. The theme's own search composition already sets the
DECLARED `heading: "Search the collection"`; the renderer simply never reads it. (The
PREVIEW renders the theme's source unparsed, which is why the frozen preview captures
were never affected and the bug was invisible until the storefront was captured.)

### (p.2) The exact old → new diff

```diff
--- a/src/routes/store.$slug.blog.index.tsx
+++ b/src/routes/store.$slug.blog.index.tsx
@@
 import { BlogArchiveTheme } from "@/components/store/BlogArchiveTheme";
+import { StoreHeader } from "@/components/store/StoreHeader";
@@
   return (
-    <BlogArchiveTheme
+    <>
+      {/* The store's chrome (Batch D, self-critique fix 1): the blog listing is a
+          STOREFRONT surface, so it carries the store's header — the same one the
+          cart, account, search, checkout and page routes render. Without it the
+          reader lands on a page with no navigation, no logo and no cart. */}
+      <StoreHeader
+        slug={data.merchantSlug}
+        name={merchantName}
+        menus={data.chrome?.menus ?? []}
+        themeKey={data.chrome?.themeKey ?? null}
+      />
+      <BlogArchiveTheme
       feed={{
         articles: data.listing.articles,
@@
       }
-    />
+      />
+    </>
   );
 }
```

```diff
--- a/src/routes/store.$slug.blog.$articleSlug.tsx
+++ b/src/routes/store.$slug.blog.$articleSlug.tsx
@@
 import { ThemeChrome } from "@/components/store/ThemeChrome";
+import { StoreHeader } from "@/components/store/StoreHeader";
@@
   return (
     <BlogFeedProvider
       value={relatedFeed(
         data.related,
         article.slug,
         `/store/${data.merchantSlug}/blog`,
       )}
     >
+      {/* The store's chrome (Batch D, self-critique fix 1). */}
+      <StoreHeader
+        slug={data.merchantSlug}
+        name={merchantName}
+        menus={data.chrome?.menus ?? []}
+        themeKey={data.chrome?.themeKey ?? null}
+      />
       <ThemeChrome
```

```diff
--- a/src/routes/store.$slug.account.tsx
+++ b/src/routes/store.$slug.account.tsx
@@
     const p = sections.find((s) => s.type === "profile_card");
     const row = overview?.profile
       ? mapProfileToRow(overview.profile)
       : undefined;
-    if (p) {
+    // (Batch D, self-critique fix 2) The theme's profile card is the shopper's
+    // OWN profile — it is granted to a SIGNED-IN shopper only. An anonymous
+    // visitor gets the platform's single, designed order-lookup panel; the
+    // widget's own bare "Sign in to continue." prompt is a SECOND sign-in
+    // block, in a different type language, directly above it.
+    if (p && signedIn) {
```

```diff
--- a/src/components/builder/songoskriti.tsx
+++ b/src/components/builder/songoskriti.tsx
@@
-  const title = str("title") || str("text") || "Collection";
+  // The DECLARED catalogue field is `heading` (`src/lib/builder-ast.ts:2719`);
+  // `title` / `text` are NOT declared, so the sanitiser drops them on the way
+  // to storage and the storefront would fall through to the literal
+  // "Collection" on every band. The declared field is therefore the last
+  // prop in the chain, and the legacy props keep the preview identical.
+  const title = str("title") || str("text") || str("heading") || "Collection";
```

```diff
--- a/src/lib/themes/songoskriti/preview.ts
+++ b/src/lib/themes/songoskriti/preview.ts
@@
             s("category_header", {
+              // The DECLARED `heading` field (Batch D, self-critique fix 3):
+              // the legacy `text` prop is dropped by the sanitiser, so the
+              // storefront would show the catalogue's default instead of the
+              // theme's own title.
+              heading: "New Arrivals",
               text: "New Arrivals",
```

### (p.3) Backward compatibility and the platform's authority

- None of the three fixes touches authorisation, tenancy, pricing or the payment
  rails. The blog routes still resolve the theme through `getStoreChrome` (the same
  seam), the account route still reads the shopper's overview through the
  `auth.uid()`-scoped RPC, and the theme's band still renders the merchant's own
  record — the account fix only decides **whether the theme's profile card is
  placed** for a visitor who has no profile.
- The blog routes' URL shapes, their `<h1>`s, their canonicals and the platform's
  grid fallback are unchanged; a header is added above them.
- The category_header change reads one more PROP; the preview's rendering is
  byte-identical (the legacy props still come first in the chain), so the frozen
  parity captures are untouched. The storefront's band titles become the theme's own.
- No migration, no DDL, no persisted-state change.

### (p.4) The boundary

This section escalates **three** §7-prohibited files — all three named by the plan's
Decision Gate **G1** ("routes — … `src/routes/store.$slug.account.tsx` …") — and
records the two §7-**allowed** files it also touches
(`src/components/builder/songoskriti.tsx`, a theme-owned renderer, and
`src/lib/themes/songoskriti/preview.ts`, the theme's own compositions). No file
outside that list is edited by this section.

### (n.7) The three existing suites that read the renamed route file — their path, and nothing else

The rename in §(n.2) moves `src/routes/store.$slug.blog.$slug.tsx` to
`src/routes/store.$slug.blog.$articleSlug.tsx`. **Three existing suites read that route
file as TEXT** (the repo's "read the source and pin it" pattern), so the path they read
changed. **No assertion changed, no assertion was weakened, and no suite was skipped** —
the same assertion now runs against the same file under its new name.

```diff
--- a/src/routes/storefront-resilience.test.ts
+++ b/src/routes/storefront-resilience.test.ts
@@ -32,7 +32,7 @@
   "src/routes/store.$slug.pages.$pageSlug.tsx",
   "src/routes/store.$slug.blog.index.tsx",
-  "src/routes/store.$slug.blog.$slug.tsx",
+  "src/routes/store.$slug.blog.$articleSlug.tsx",
   "src/routes/store.$slug.track.tsx",
 ];
@@ -81,7 +81,7 @@
       "src/routes/store.$slug.c.$collectionSlug.tsx",
       "src/routes/store.$slug.blog.index.tsx",
-      "src/routes/store.$slug.blog.$slug.tsx",
+      "src/routes/store.$slug.blog.$articleSlug.tsx",
       "src/routes/store.$slug.order.$orderId.tsx",
     ]) {
       expect(readFileSync(path, "utf8")).toContain("throw notFound()");
```

```diff
--- a/src/lib/template-variants.test.ts
+++ b/src/lib/template-variants.test.ts
@@ -40,7 +40,7 @@
 );
 const ARTICLE_ROUTE = readFileSync(
-  join(ROUTE_DIR, "store.$slug.blog.$slug.tsx"),
+  join(ROUTE_DIR, "store.$slug.blog.$articleSlug.tsx"),
   "utf8",
 );
```

```diff
--- a/src/lib/preview-parity.contract.test.ts
+++ b/src/lib/preview-parity.contract.test.ts
@@ -183,7 +183,7 @@
   it("blog article — the pack plus the route-owned article body", () => {
     const preview = grantedSlots(PREVIEW, "const blogSlots =");
     const production = grantedSlots(
-      read("routes", "store.$slug.blog.$slug.tsx"),
+      read("routes", "store.$slug.blog.$articleSlug.tsx"),
       "contextSlots={{",
     );
```

**Measured after the update** (the three suites, whole-file):

```
$ node_modules/.bin/vitest run src/routes/storefront-resilience.test.ts \
    src/lib/template-variants.test.ts src/lib/preview-parity.contract.test.ts

 ✓ src/routes/storefront-resilience.test.ts (27 tests) 94ms
 ✓ src/lib/preview-parity.contract.test.ts (9 tests) 7599ms
 ✓ src/lib/template-variants.test.ts (16 tests) 123ms

 Test Files  3 passed (3)
      Tests  52 passed (52)
```

These three files are **existing test files** and are therefore §7-prohibited; they are
named here, with their exact diff, in the same way the earlier batches named their
existing-test updates. The plan's on-disk G1 table does not name them (nor did it name
the two files Batch B had to escalate) — the table is a list of the batch's **known**
blast radius, and this is the correction to it.
---

## (q) Final-fix round — the review's fourteen findings (appended, 2026-10-22)

**Branch:** `frame30` · **Base commit:** `38aad54d` (`docs(evidence): the typo in the parity figures, and the measured proof that the frozen captures are untouched`).
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md`.
**Why this section exists:** the final review of the programme raised **four MUST
FIX** and **ten SHOULD FIX** findings. Every §7-prohibited file this round edits
is named here **before** the edit, with the finding, the planned change and the
covering test; the FINAL diffs and the measured evidence are appended in §(q.9)
after the edits. This section is **appended**, not rewritten.

**The governing rule, restated.** Port spec §7 ("no core files") is relaxed only
for the plan's Decision Gate **G1** list, and for the files this programme itself
created (a NEW file needs no relaxation; §7's own text allows new files). Every
file below is one or the other, and nothing outside that set is edited.

### (q.1) MUST FIX 1 — the archive band label, and the defect class behind it

**The finding.** The archive template renders the wrong band label after any
save. `src/lib/themes/songoskriti/preview.ts:275` (the `case "archive":` body)
sets the band label with `title` / `title_bn`, but `category_header` declares only
`heading | body | imageUrl | scrim | showCount | showBreadcrumb | homeLabel`
(`src/lib/builder-ast.ts:2708-2732`), so the sanitiser **drops**
`title` / `title_bn` / `description` / `description_bn` on save; the Songoskriti
renderer's chain `str("title") || str("text") || str("heading") || "Collection"`
(`src/components/builder/songoskriti.tsx:2279`) then falls through to the literal
**"Collection"**.

**The class, measured.** The defect is not the archive's alone: it is _a prop the
theme authors that the catalogue does not declare, so the sanitiser drops it on
save_. The new contract suite
(`src/lib/themes/songoskriti/composition-props.test.ts`, a NEW file — §7-allowed)
enumerates **every** composition the theme authors — the ten base templates and
the two variant bodies — and measures the class at **41 distinct
`(widget, prop)` pairs** that were dropped on save:

| widget             | the props the theme authors that the catalogue did not declare                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `category_header`  | `title`, `title_bn`, `text`, `text_bn`, `description`, `description_bn`, `collectionType`, `subnav` |
| `blog_archive`     | `heading_bn`                                                                                        |
| `blog_terms`       | `heading_bn`                                                                                        |
| `collection_story` | `heading_bn`, `subhead`, `subhead_bn`, `collections`                                                |
| `craft_story`      | `eyebrow_bn`, `heading_bn`, `body_bn`                                                               |
| `department_grid`  | `heading`, `heading_bn`                                                                             |
| `finder_row`       | `heading_bn`, `body_bn`                                                                             |
| `heading`          | `text_bn`                                                                                           |
| `product_grid`     | `collection`, `heading_bn`, `promise_bn`, `source`                                                  |
| `product_rail`     | `badgeLabel`, `heading_bn`, `promise_bn`, `subhead`, `subhead_bn`                                   |
| `recently_viewed`  | `heading_bn`                                                                                        |
| `result_toolbar`   | `sortDefault`                                                                                       |
| `rich_text`        | `heading_bn`, `body_bn`                                                                             |
| `split_feature`    | `heading_bn`, `body_bn`                                                                             |
| `store_locator`    | `heading_bn`, `images`                                                                              |
| `ugc_gallery`      | `heading_bn`, `subhead_bn`                                                                          |

**Two of the 41 are material beyond the label.**

1. **`product_grid.collection` / `product_grid.source`** — the widget REGISTRY
   reads `collection` as a **data param** (`requestForSection`,
   `src/lib/widget-data.ts:134-148`, over
   `WIDGET_REGISTRY.product_grid.data.params`,
   `src/lib/widget-registry.ts:109-144`). Because the catalogue did not declare
   it, the sanitiser dropped it, so the storefront's product grid resolved
   **no collection** — the theme's own `collection: "new-in"` never reached the
   data pipeline. The catalogue now declares it, exactly as `product_rail`
   already did.
2. **`category_header.subnav` / `collectionType`** — the Songoskriti renderer's
   own vocabulary (`songoskriti.tsx:2288-2304`), dropped on save, so the
   collection's subnav and its collection type never rendered on the storefront.

**The change.** `src/lib/builder-ast.ts` (§7-prohibited; on the plan's G1 list)
— **the catalogue declares what the theme authors**. Every one of the 41 pairs
becomes a declared field with the kind the renderer's own vocabulary implies:

- `category_header` gains `title`, `title_bn`, `text`, `text_bn`,
  `description`, `description_bn`, `collectionType` (a select over
  `curated | department | occasion`) and `subnav` (an area). `title` /
  `title_bn` default to `""`, so the **collection** and **search** compositions
  (which keep using the legacy `text` alias, and whose preview focus rewrite
  writes `text` — `applyDemoFocus`, `src/lib/theme-preview-nav.ts:735-740`)
  still resolve through the renderer's chain unchanged, and only the **archive**
  — which authors `title` — changes its rendered label.
- Every other widget gains the `_bn` sibling of the copy it already declares
  English for, plus the props its own renderer reads (`department_grid.heading`,
  `product_grid.collection` / `source`, `product_rail.subhead` / `badgeLabel`,
  `result_toolbar.sortDefault`, `store_locator.images`,
  `collection_story.collections` as a repeatable-row array).

**`title` / `title_bn` do NOT change the `<h1>` claim.** `blankHeading`
(`src/lib/builder-ast.ts:8318`) reads only the `heading` prop, so the archive's
`heading: ""` still claims no `<h1>` and the archive stays a route-`<h1>`
template. The renderer's chain is **unchanged**.

**The covering test.** `src/lib/themes/songoskriti/composition-props.test.ts`
(NEW — §7-allowed). It enumerates all twelve compositions, and for every
section in every composition it asserts (a) every authored prop is a **declared**
field and (b) every authored prop **survives `parseTemplates`** with the same
value. It also pins the archive's own instance by name: the band's `title`
survives as `"Archive"` and its `heading` stays blank.

**The files this MUST FIX touches.**

| file                                                   | §7 status                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/builder-ast.ts`                               | **§7-prohibited** — on the plan's G1 list ("engine / platform libs"), and named in the escalation record's §(f) table from Task 1.                                                                |
| `src/lib/themes/songoskriti/preview.ts`                | **§7-allowed** (`src/lib/themes/songoskriti/**`) — the archive composition is unchanged; the label now survives because the catalogue declares it.                                                |
| `src/lib/themes/songoskriti/composition-props.test.ts` | **NEW** — §7 allows a new file.                                                                                                                                                                   |
| `src/lib/themes/songoskriti/search-template.test.ts`   | **§7-prohibited** (an existing test file under `src/`) — its "props outside the catalogue" pin changes: the set becomes **empty**, which is a **stronger** expectation than the five it replaces. |

### (q.2) MUST FIX 5 — the production checkout's order

**The finding.** The theme's checkout body places `payment_methods` +
`cart_summary` in a two-column band **above** `page_content`, and the route's
shell form renders only the contact/address fields + "Place Order" — so the
rail is asked for before the address, and the total is not next to the
place-order action.

**The change.** `src/lib/themes/songoskriti/preview.ts` (§7-allowed) — the
`case "checkout":` body is **reordered**: the route's own body (`page_content`)
comes **first**, and the payment/summary columns follow it. The theme's
composition still declares the same widgets in the same roles; only their
order changes.

**The covering test.** `.e2e/songoskriti-storefront-surfaces.spec.ts`
(§7-prohibited — an existing `.e2e/**` file, and the plan's G1 list names two
other `.e2e` files) — the checkout case gains an assertion that the **payment
control** and the **total** render **below** the customer's fields, measured
from the DOM order.

### (q.3) SHOULD FIX 7 — the reset must not commit to a different theme

**The finding.** `resetTemplateToDefault` (`src/lib/themes.server.ts`) loads the
workspace with `loadWorkspace(db, merchantId)` — the merchant's **active**
theme — and then commits to `input.themeId` without asserting the two match, so
a same-tenant `themeId` for a second of the merchant's themes would receive the
**active** theme's templates.

**The change.** `src/lib/themes.server.ts` (§7-prohibited; on the plan's G1
list) — after the workspace is loaded, the reset asserts
`input.themeId === workspace.theme.id` and throws
`BuilderError("builder.reset_unknown_theme", …)` when they differ. The reset
then writes the theme it read.

**The covering test.** `src/lib/themes-reset.contract.test.ts` (an existing
test file — §7-prohibited) gains the case: a `themeId` that is not the
merchant's active theme is **refused**, and **nothing** is written (no commit,
no autosave, no publish).

### (q.4) SHOULD FIX 8 — the unknown-variant trap gets an exit

**The finding.** A stray non-`page` variant key (a persisted `blog_anything`)
blocks publishing **forever**, and the merchant cannot delete it. The
`page_<slug>` legacy shape is exempt, and `templates.archive_requires_api`
cannot refuse any pre-existing package (no package could declare `archive`
before this key existed), so the blast radius is near-zero — but the trap has
no exit.

**The choice: the trap keeps its refusal, and the editor's reset affordance
becomes the exit.** The refusal is _correct_ — a template nothing routes to must
not ship — so it is **not** downgraded. Instead the merchant is given a way to
**remove** the stray key, which is what the reset affordance is for: a key with
no theme default has nothing to restore, so "reset this template" on it means
"drop it".

**The change.**

- `src/lib/template-variants.ts` (§7-prohibited as an existing file under
  `src/`; **created by this programme**, so the batch owns it) — a pure helper
  `strayVariantKeys(templates)` that lists the keys shaped
  `<known base>_<suffix>` whose suffix is **not** in the closed table. The
  legacy `page_<slug>` shape is **exempt** and is never listed.
- `src/lib/themes.server.ts` (§7-prohibited; G1) — the reset accepts a stray
  variant key and **removes** it from the map instead of restoring a default.
  A key that is neither a known key nor a stray variant is still refused.
- `src/routes/_authenticated/dashboard/builder.tsx` (§7-prohibited; **on the
  plan's G1 list**) — the template nav lists the merchant's own stray keys, and
  the reset button becomes a **remove** action for the selected one.

**The covering test.** `src/lib/themes-reset.contract.test.ts` (existing —
§7-prohibited) gains the case: resetting a stray variant key **removes** it
from the committed map, and the map that rides back no longer carries it.

### (q.5) SHOULD FIX 11 — the archive host's stale comment

**The finding.** `src/components/store/ArchiveView.tsx:78-81` says "the closed
variant vocabulary does not exist yet" — it does now (`TEMPLATE_VARIANTS`
carries `archive: [category, tag, author]`), and `resolveArchiveBody` resolves
the base key only.

**The change.** `src/components/store/ArchiveView.tsx` (§7-prohibited by
location; **created by this programme** in Task 2, so the batch owns it) — the
comment is corrected, and it names the deferred merchant-scoped route's need:
the variant resolution (`resolveVariantAst`) is what that route will have to
call, because it is the only thing that resolves `archive_category` /
`archive_tag` / `archive_author`.

**The covering test.** `src/lib/themes/songoskriti/composition-props.test.ts`
(the new suite) enumerates the archive's variants; and the existing
`src/lib/template-variants.test.ts` already pins the closed table.

### (q.6) MUST FIX 3 — the build at the tip

**The finding.** `phase3-evidence.md:236` and `phase3-ci.md:55` say the build was
"not run here — the build writes into the same untracked `.output-snapshots/`
tree". **That reason is false.** `vite.config.ts` sets **no** `build.outDir`;
the TanStack Start + Nitro plugin writes to **`.output/`** (gitignored), and
`.output-snapshots/` holds dated **snapshot copies** of a build of the base
commit (`snap_20261021T041306Z_182c37b`).

**The change.** The build is run at the tip and its **exit status** and **bundle
size** are recorded in §3 of **both** records. No code change; a measurement.

### (q.7) MUST FIX 2 — `report.md`'s superseded rulings

**The finding.** `report.md:119` and `:122` state D1 = "**No `archive` template
key** was added … all untouched", and D2/D5 = "production checkout stays
tokens-only … the storefront reader blog stays 'themeless by design'". At HEAD
all three are false.

**The change.** `report.md` (a **document**, not a source file — outside §7's
boundary, which governs the source tree) — a dated **§5.2** records D1′ / D2′ /
D5′ with their reasons and where they live, and §5.1's D1 and D2/D5 rows are
re-pointed at it. The earlier decision is **kept**, not erased: §5.2 says what
it decided, what superseded it, and why.

### (q.8) The remaining SHOULD FIX findings — documents, not source

| #   | the finding                                                                                                              | the file                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 6   | the test-delta arithmetic names a mid-programme baseline (`2f4eb2f5`) instead of the programme's base (`182c37b5`)       | `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md`                    |
| 9   | the governing plan is untracked while three phase-3 records cite it by path                                              | `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — **committed**    |
| 10  | the CI record quotes only the first push (`182c37b5..a7b210cd`)                                                          | `docs/superpowers/songoskriti-evidence/port/phase3-ci.md`                          |
| 12  | "~32 strings" is "~36" (254 authored, 193 ok, 61 fallback → 229 needed for 90.2 %)                                       | `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md`                    |
| 13  | `docs/04-builder/theme-runtime.md` §9's archive row names three store-less routes as the ones that "grant" the six slots | `docs/04-builder/theme-runtime.md`                                                 |
| 14  | the local-gate table is silent on the owner-run `gates:release` chain                                                    | `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md` and `phase3-ci.md` |

### (q.9) The FINAL diffs and the measured evidence

_(appended after the edits — see the section that follows this one.)_

### (q.10) The additional §7-prohibited files this round touches (appended, 2026-10-22)

The MUST FIX 1 catalogue work reached three more files that §7 prohibits.
They are named here, **before** the edits, for the same reason §(q.1) names
its files.

| file                                                      | why it is edited                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/widget-help.ts`                                  | the bilingual HINTS a merchant reads under a prop. The new `category_header.collectionType` is a `select`, and the platform's exit gate (`src/lib/widget-metadata.test.ts` — "every non-obvious prop resolves a hint") requires a hint for every non-obvious kind. |
| `src/lib/themes/songoskriti/checkout-composition.test.ts` | the checkout composition's pinned ORDER — the SHOULD FIX 5 reorder. The pin is re-pointed at the new order and a **new** pin is added: the route's own body must come BEFORE the payment/summary band.                                                             |
| `src/lib/themes/songoskriti/search-template.test.ts`      | named in §(q.1) already — its "props outside the catalogue" pin becomes the **empty** set.                                                                                                                                                                         |

**One correction to §(q.1), stated rather than hidden.** §(q.1) listed the
class as "41 distinct `(widget, prop)` pairs". The first measurement counted a
prop as "declared" only when it appeared in the widget's `fields` list — which
**misses** the platform's own bilingual mechanism: a `bitext` field carries its
`${key}_bn` sibling implicitly (`withBiText`,
`src/lib/builder-ast.ts:6505-6521`), so `heading_bn`, `body_bn`, `promise_bn`
and their siblings were **never** undeclared. The corrected class is the
**13** pairs that the sanitiser really dropped, plus the two the `bitext`
mechanism could not reach (an array row's sibling and a widget the map never
covered). The catalogue now declares the **`bitext`** way wherever the platform
already has one (the map `BITEXT_FIELDS` gains `blog_terms`, `department_grid`,
`category_header`'s `title` / `text` / `description`, `product_rail`'s
`subhead` and `collection_story`'s `subhead`), and a plain field only where
there is no bilingual pair at all. The **contract test** now asserts the
corrected predicate: a prop is declared when it is a catalogue field **or** the
`${key}_bn` sibling of a `bitext` field **or** an advanced-tab field — and it
asserts, for every prop, that the value **survives `parseTemplates`**, which is
the property that actually matters.

### (q.9) The FINAL diffs and the measured evidence (appended, 2026-10-22)

The diffs below are the **committed** diffs of the final-fix round, measured
against the round's base commit `38aad54d`. The file list is exactly the one
§(q.1)–§(q.10) named — no file outside it is edited.

```
$ git diff 38aad54d..HEAD --stat -- src/ .e2e/
 .e2e/songoskriti-storefront-surfaces.spec.ts       |  51 ++++
 .../builder/songoskriti-port-freeze.test.tsx       |   8 +-
 src/components/store/ArchiveView.tsx               |  16 +-
 src/lib/builder-ast.ts                             | 107 +++++++-
 src/lib/template-variants.ts                       |  35 +++
 src/lib/themes-reset.contract.test.ts              |  61 +++++
 src/lib/themes.server.ts                           |  46 +++-
 .../songoskriti/checkout-composition.test.ts       |  17 +-
 .../songoskriti/composition-props.test.ts          | 276 +++++++++++++++++++++
 src/lib/themes/songoskriti/preview.ts              |  16 +-
 src/lib/themes/songoskriti/search-template.test.ts |  34 +--
 src/lib/widget-help.ts                             |   4 +
 src/routes/_authenticated/dashboard/builder.tsx    | 105 ++++++--
 13 files changed, 722 insertions(+), 54 deletions(-)
```

#### (q.9.1) `src/lib/builder-ast.ts` — the catalogue declares what the theme authors

```diff
@@ `product_grid`
     defaults: {
       heading: "Products",
       limit: 12,
       columns: 4,
       cardVariant: "standard",
       density: "comfortable",
       showRating: false,
       promise: "",
       skin: "cards",
+      // The data params the widget REGISTRY reads for this widget
+      // (`requestForSection`, `src/lib/widget-data.ts:134-148`).
+      collection: "",
+      source: "collection",
     },
     fields: [
       text("heading", "Heading"),
@@
       cols("columns", "Columns (2-4)"),
+      // The data params the widget REGISTRY reads for this widget
+      // (`requestForSection`, `src/lib/widget-data.ts:134-148`, over
+      // `WIDGET_REGISTRY.product_grid.data.params`,
+      // `src/lib/widget-registry.ts:109-144`). Undeclared, they were dropped
+      // by the sanitiser and the grid resolved no collection at all.
+      text("collection", "Collection handle", 80),
+      {
+        key: "source",
+        label: "Source",
+        kind: "select",
+        panel: "content",
+        options: [
+          { value: "collection", label: "Collection" },
+          { value: "bestsellers", label: "Bestsellers" },
+          { value: "recommended", label: "Recommended" },
+        ],
+      },
       text("promise", "Delivery promise", 60),
@@ `product_rail`
       promise: "",
       skin: "editorial",
+      subhead: "",
+      badgeLabel: "",
     },
     fields: [
       text("heading", "Heading"),
+      text("subhead", "Subhead", 160),
@@
       text("promise", "Delivery promise", 60),
       bool("showRating", "Show rating"),
+      text("badgeLabel", "Card badge label", 40),
@@ `category_header`
       showBreadcrumb: true,
       homeLabel: "Home",
+      // The band's OWN label. `title` is the canonical prop; `text` is the
+      // older alias the renderer still honours (`str("title") ||
+      // str("text") || str("heading")`, `src/components/builder/songoskriti.tsx`).
+      // Both default to EMPTY, so a composition that authors neither falls
+      // through the chain to `heading` exactly as before.
+      title: "",
+      text: "",
+      description: "",
+      collectionType: "curated",
+      subnav: "",
     },
     fields: [
       text("heading", "Title", 120),
@@
       text("homeLabel", "Breadcrumb home label", 40),
+      // The band label. `title` wins over the legacy `text` alias in the
+      // renderer's chain, and neither participates in the <h1>-claim rule
+      // (`blankHeading` reads only `heading`).
+      text("title", "Band label", 120),
+      text("text", "Band label (legacy alias)", 120),
+      area("description", "Editorial line", 600),
+      {
+        key: "collectionType",
+        label: "Collection type",
+        kind: "select",
+        panel: "content",
+        options: [
+          { value: "curated", label: "Curated" },
+          { value: "department", label: "Department" },
+          { value: "occasion", label: "Occasion" },
+        ],
+      },
+      area("subnav", "Subnav (Label:/c/slug, comma separated)", 600),
@@ `result_toolbar`
       sortLabel: "Sort",
+      sortDefault: "",
     },
     fields: [
@@
       text("sortLabel", "Sort label", 40),
+      // The default sort the toolbar shows when the shopper has not chosen
+      // one. The Songoskriti renderer reads it
+      // (`src/components/builder/songoskriti.tsx`, `SongoskritiResultToolbar`).
+      text("sortDefault", "Default sort label", 40),
@@ `collection_story`
       scrim: true,
+      subhead: "",
+      collections: [],
     },
     fields: [
       text("eyebrow", "Eyebrow", 60),
       text("heading", "Heading", 120),
+      text("subhead", "Subhead", 300),
@@
       bool("scrim", "Darken image behind text"),
+      // The collection cards the Songoskriti renderer reads
+      // (`rowsOf(section, "collections")`,
+      // `src/components/builder/songoskriti.tsx`).
+      {
+        key: "collections",
+        label: "Collection cards",
+        kind: "array",
+        panel: "content",
+        itemLabel: "title",
+        maxRows: 8,
+        fields: [
+          text("title", "Title", 80),
+          text("image", "Image URL", 200),
+          url("href", "Link URL"),
+          text("subtitle", "Subtitle", 80),
+        ],
+      },
@@ `store_locator`
     defaults: {
       heading: "Visit us",
+      images: "",
       s1Name: "",
@@
     fields: [
       text("heading", "Heading", 80),
+      // The Songoskriti renderer's own fallback list: a comma-separated URL
+      // string it splits per store (`src/components/builder/songoskriti.tsx`,
+      // `SongoskritiStoreLocator`).
+      area("images", "Store images (comma separated URLs)", 2000),
@@ `hero_carousel`'s `slides` ROW schema (an array row is NOT promoted to
   `bitext`, so its বাংলা siblings must be declared in the row schema)
           area("subhead_bn", "Subhead (বাংলা)", 300),
           text("ctaLabel", "CTA label", 40),
+          text("ctaLabel_bn", "CTA label (বাংলা)", 40),
           url("ctaUrl", "CTA link"),
           text("caption", "Eyebrow caption", 60),
+          text("caption_bn", "Eyebrow caption (বাংলা)", 60),
@@ `department_grid`
-    defaults: { columns: 4, departments: [] },
+    defaults: { heading: "", columns: 4, departments: [] },
     fields: [
+      text("heading", "Heading", 80),
@@ `BITEXT_FIELDS` — the platform's own bilingual mechanism, which is where a
   বাংলা sibling belongs
-  product_rail: ["heading", "promise"],
+  product_rail: ["heading", "promise", "subhead"],
@@
-  category_header: ["heading", "body", "homeLabel"],
+  // `title` / `text` / `description` are the Songoskriti band's own
+  // vocabulary (the renderer's chain is
+  // `str("title") || str("text") || str("heading")`), and they are
+  // shopper-facing prose, so each gains its বাংলা sibling here.
+  category_header: [
+    "heading",
+    "body",
+    "homeLabel",
+    "title",
+    "text",
+    "description",
+  ],
@@
-  collection_story: ["eyebrow", "heading", "body", "ctaLabel"],
+  collection_story: ["eyebrow", "heading", "body", "ctaLabel", "subhead"],
@@
   blog_archive: ["heading", "emptyText"],
+  blog_terms: ["heading"],
+  department_grid: ["heading"],
 };
```

#### (q.9.2) `src/lib/themes/songoskriti/preview.ts` — the checkout's order (§7-allowed)

```diff
@@ the `case "checkout":` body
           return [
             s("heading", { text: "Checkout", text_bn: "চেকআউট" }),
             s("checkout_steps", {
               heading: "Checkout progress",
               activeStep: 2,
             }),
+            // The route's OWN body comes FIRST: the customer fields, the
+            // validated submission and the place-order action. The payment
+            // block and the order summary follow it, so the shopper reads
+            // the address first and picks the rail with the total in view —
+            // not the other way round.
+            //
+            // The route's own body: the production checkout form — the
+            // customer fields, the validated submission and the place-order
+            // action. The theme contributes the frame around it (Decision
+            // D2'); the platform keeps the form, the totals and the rails.
+            s("page_content", {}),
             {
               ...s("columns", { columns: 2, asymmetrical: true, gap: 64 }),
@@
                 },
               ],
             },
-            // The route's OWN body: the production checkout form — the
-            // customer fields, the validated submission and the place-order
-            // action. The theme contributes the frame around it (Decision
-            // D2'); the platform keeps the form, the totals and the rails.
-            s("page_content", {}),
           ];
```

#### (q.9.3) `src/lib/themes.server.ts` — the reset's two guards

```diff
@@ `resetTemplateToDefault`
   return withSpan("builder.reset_template", async () => {
     const key = input.template;
+    // The workspace is the merchant's ACTIVE theme (`loadWorkspace` resolves
+    // it). The reset must write to the theme it READ — a `themeId` for a
+    // second of the merchant's themes would otherwise receive the active
+    // theme's templates.
     const workspace = await loadWorkspace(db, merchantId);
+    if (input.themeId !== workspace.theme.id) {
+      incr("framique_builder_reset_total", { result: "rejected" });
+      throw new BuilderError(
+        "builder.reset_unknown_theme",
+        `Theme "${input.themeId}" is not the theme this workspace holds`,
+      );
+    }
+    // A STRAY variant key — one shaped `<known base>_<suffix>` whose suffix
+    // is not in the closed vocabulary — has no theme default to restore, so
+    // "reset this template" on it means "drop it". That is the merchant's
+    // exit from the `builder.unknown_variant` refusal: the key nothing
+    // routes to can be removed here. The legacy `page_<slug>` shape is
+    // exempt (a legal persisted key of a third-party package) and is never
+    // a stray.
+    const stray = strayVariantKeys(workspace.templates).includes(key);
     // Only a known template key, a variant inside the CLOSED vocabulary, or
     // a stray variant can be reset — any other key would silently create a
     // new one.
-    if (!isKnownTemplateKey(key)) {
+    if (!isKnownTemplateKey(key) && !stray) {
       throw new BuilderError(
         "builder.reset_unknown_template",
         `Unknown template "${key}"`,
@@
-    // Exactly ONE key is replaced. Every other template — and every other
-    // variant — rides the map untouched.
-    const templates: TemplateMap = { ...workspace.templates, [key]: ast };
+    // Exactly ONE key is replaced — or, for a stray variant, REMOVED. Every
+    // other template — and every other variant — rides the map untouched.
+    const templates: TemplateMap = { ...workspace.templates };
+    if (stray) {
+      delete (templates as Record<string, ThemeAst | undefined>)[key];
+    } else {
+      templates[key] = ast;
+    }
@@
-      note: `Reset ${key} to the theme default`,
-      label: `Reset ${key}`,
+      note: stray
+        ? `Remove the stray template ${key}`
+        : `Reset ${key} to the theme default`,
+      label: stray ? `Remove ${key}` : `Reset ${key}`,
```

#### (q.9.4) `src/lib/template-variants.ts` — the stray-key helper (NEW, this round)

```diff
+/**
+ * The STRAY variant keys a merchant's own map carries.
+ *
+ * A key shaped `<known base>_<suffix>` whose suffix is **not** in the closed
+ * table is a typo or a leftover — a template nothing routes to. The publish
+ * gate refuses it (`builder.unknown_variant`,
+ * `src/lib/themes.server.ts`), so the merchant needs a way to get rid of it:
+ * this list is what the editor's reset/cleanup affordance offers.
+ *
+ * The legacy theme-package per-page shape (`page_<slug>`) is **exempt**: it is
+ * a legal persisted key of a third-party package, it is never refused, and it
+ * is therefore never listed here either.
+ */
+export function strayVariantKeys(
+  templates: Record<string, unknown> | null | undefined,
+): string[] {
+  if (!templates) return [];
+  const out: string[] = [];
+  for (const key of Object.keys(templates)) {
+    if (isTemplateKey(key)) continue;
+    if (!isVariantTemplateKey(key)) continue;
+    const sep = key.indexOf("_");
+    if (sep < 1) continue;
+    const base = key.slice(0, sep);
+    // The legacy per-page shape is exempt, exactly as the publish gate
+    // exempts it.
+    if (base === "page") continue;
+    if (!isTemplateKey(base)) continue;
+    if (isTemplateVariantKey(key)) continue;
+    out.push(key);
+  }
+  return out.sort();
+}
```

#### (q.9.5) `src/routes/_authenticated/dashboard/builder.tsx` — the cleanup affordance

The template nav gains a THIRD level — the merchant's own stray keys — and
the reset button becomes a **remove** for the selected one. The full diff is
in the commit (`439e7b76`); its three parts are the import, the state, and
the nav + button.

#### (q.9.6) The measured evidence

**The contract suite (NEW) — the covering test for MUST FIX 1:**

```
$ node_modules/.bin/vitest run src/lib/themes/songoskriti/composition-props.test.ts

 ✓ src/lib/themes/songoskriti/composition-props.test.ts (4 tests) 121ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**The reset contract — the covering test for SHOULD FIX 7 and SHOULD FIX 8:**

```
$ node_modules/.bin/vitest run src/lib/themes-reset.contract.test.ts

 ✓ src/lib/themes-reset.contract.test.ts (9 tests) 1290ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

**The checkout composition — the covering test for SHOULD FIX 5:**

```
$ node_modules/.bin/vitest run src/lib/themes/songoskriti/checkout-composition.test.ts

 ✓ src/lib/themes/songoskriti/checkout-composition.test.ts (8 tests) 78ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

**The whole suite, at the tip of the round:**

```
$ node_modules/.bin/vitest run

 Test Files  2 failed | 617 passed | 1 skipped (620)
      Tests  3 failed | 8772 passed | 3 skipped (8778)
```

The three failures are the **pre-existing, environment-bound** ones —
`src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts`
(1) — and they fail at the base commit too (§2.1 of the evidence record).

**The build, at the tip of the round:**

```
$ node_modules/.bin/vite build
…
✓ 3631 modules transformed.
✓ built in 6.17s
ℹ Generated .output/nitro.json
[nitro] ✔ You can preview this build using npx vite preview
$ echo $?
0
```

| the measurement          | the value                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| the exit status          | **0**                                                                                                          |
| the output directory     | **`.output/`** — the client assets at `.output/public/assets/`, the server bundle at `.output/server/`         |
| the bundle size          | **55 MB** in total, **1 332** files: **5.50 MB** client JS, **0.32 MB** client CSS, **14.38 MB** server `.mjs` |
| the largest client chunk | `index-*.js` at **608 KB**                                                                                     |

**The type check and the linter, at the tip of the round:**

```
$ node_modules/.bin/tsgo --noEmit
(no output — exit 0)

$ node_modules/.bin/eslint src scripts
✖ 319 problems (0 errors, 319 warnings)
(exit 0 — the 319 warnings are the pre-existing ones; 0 errors)
```

**The doc gate, at the tip of the round:**

```
$ node scripts/doc-gate.mjs
doc gate — canonical documentation checks
scope: 24 documents (23 require a status line)
self-test: PASS

findings: 0
(exit 0)
```

---

## (r) Final-tidy round — the last five findings (appended, 2026-10-22)

**Branch:** `frame30` · **Base commit:** `7a7f9b70` (`docs(self-critique): the duplicated paragraph, gone`).
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md`.
**Why this section exists:** the re-review of the final-fix round raised **five**
findings — one of them a real shopper-facing defect (the place-order action
rendered BEFORE the payment rail and the total), four of them documentation
nits. Every §7-prohibited file this round edits is named here **before** the
edit, with the finding, the planned change and the covering test; the measured
evidence is appended in §(r.5) after the edits. This section is **appended**,
not rewritten — the record stays append-only.

**The governing rule, restated.** Port spec §7 ("no core files") is relaxed only
for the plan's Decision Gate **G1** list, for the files this programme itself
created (a NEW file needs no relaxation), and for the one file §(r.1) escalates
below that is on neither list (`src/components/store/ThemeChrome.tsx` — named
here, in this section, before the edit, exactly as §(q.1) names its files).
Nothing outside that set is edited.

### (r.1) MUST FIX — the shopper must meet "Place Order" AFTER the rail and the total

**The finding.** The final-fix round reordered the theme's checkout composition
so the route's own body (`page_content`) precedes the payment/summary band.
But the platform's place-order action lives **inside that body** — inside the
route's `<form>` — so the rendered order became: contact fields → **Place
Order** → payment rail → order summary. The shopper met the action before the
rail they pay with and before the total they pay. The rationale recorded in
`src/lib/themes/songoskriti/preview.ts:416-421` and in the fix report claimed
the shopper "reads the address first and picks the rail with the total in
view" — that was no longer literally true.

**Why the theme's AST cannot fix it.** The theme may only arrange
platform-owned pieces; the action is the ROUTE's, and the route's form is the
thing the theme's body slot carries. A theme that carried its own action would
be authoring a submit button — the very thing the checkout's authority
contract forbids (`src/lib/checkout-shell.contract.test.ts`). So the ORDER has
to be fixed on the platform side, in the route, with the theme's composition
left exactly as it is.

**The change — the platform's contracts, used as they are.**

1. **`ThemeChrome` gains a trailing slot** (`afterBody`): the ROUTE's own
   action, rendered after the page body (the theme's composition) inside the
   same `<main>`. The theme cannot place it, cannot fill it and does not know
   it exists — the route alone decides that its action comes last.
2. **The route's `<form>` gets an `id`, and the action names it through the
   HTML form owner** (`<button type="submit" form="…">`). The action therefore
   submits the route's own form while living outside the form element — the
   only way a submit button can follow a band the theme draws *beside* the
   route's body. The form still owns the fields, the validation, the quote and
   the order write; the browser still runs the form's constraint validation and
   still treats the action as the form's default button (Enter submits).
3. **The form REPORTS the action's state up** (label, disabled, live-region
   notice) because the state that drives it — the server quote, the pending
   mutation and the charge hop — belongs to the form, while the action renders
   outside it. The report is a plain primitive triple, so it cannot loop.
4. **The seam decides where the action goes.** `checkoutShellControls`
   (`src/lib/theme-shell-slots.ts`, created by this programme) grows a third
   answer, `submitAfterBody`: true for the `shell` variant when the theme's
   body renders (the band exists, so the action follows it), false for the
   `fallback` variant — today's hand-built checkout, whose action stays inside
   its own form, unchanged.

**The files this MUST FIX touches.**

| file                                                                       | §7 status                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/store.$slug.checkout.tsx`                                       | **§7-prohibited** — on the plan's Decision Gate **G1** list (the "routes" group).                                                                                                                                                              |
| `src/routes/checkout.tsx`                                                   | **§7-prohibited** — on the plan's Decision Gate **G1** list (the "routes" group).                                                                                                                                                              |
| `src/components/store/ThemeChrome.tsx`                                      | **§7-prohibited, and NOT on the G1 list** — an existing file under `src/`, not created by this programme. **Escalated by this section**, before the edit, in the same way §(q.1) escalates its files. The change is additive: one optional prop, rendered after the body. |
| `src/lib/theme-shell-slots.ts`                                              | **created by this programme** (`2f4eb2f5`, 2026-10-21) — the batch owns it, exactly as §(q.4) states for `src/lib/template-variants.ts`.                                                                                                                |
| `src/lib/theme-shell-slots.test.ts`                                         | **created by this programme** (`2f4eb2f5`, 2026-10-21) — the batch owns it. Its pins gain the seam's third answer (`submitAfterBody`), so each asserts the FULL object it did not assert before.                                                          |
| `src/lib/checkout-shell.contract.test.ts`                                   | **created by this programme** (`fdd654ff`, 2026-10-21) — the batch owns it.                                                                                                                                                                     |
| `src/routes/checkout-dom-order.test.tsx`                                    | **NEW** — §7 allows a new file.                                                                                                                                                                                                                |
| `src/lib/themes/songoskriti/preview.ts`                                     | **§7-allowed** (`src/lib/themes/songoskriti/**`). The composition is **unchanged** — only the comment that described the order is corrected.                                                                                                        |
| `src/lib/themes/songoskriti/checkout-composition.test.ts`                   | **§7-prohibited** (an existing test file under `src/`) — already named in §(q.10) for the previous round; re-named here because it is edited again (its pin is re-pointed and a new pin added).                                                   |
| `.e2e/songoskriti-storefront-surfaces.spec.ts`                              | **§7-prohibited** (an existing `.e2e` file) — already named in §(q.2) for the previous round; re-named here because it is edited again (the checkout case gains the action's own position).                                                              |

**The covering tests.**

- `src/routes/checkout-dom-order.test.tsx` (**NEW**) — the rendered DOM-order
  pin. It renders the **production shell** for **both** routes
  (`store.$slug.checkout.tsx`'s and `checkout.tsx`'s own exported
  `CheckoutShell`, with the Songoskriti checkout AST) and asserts the order
  of the four landmarks in the emitted markup: the route's customer field →
  the theme's payment block → the theme's order summary → the route's
  place-order action. It also asserts that the theme's band carries no `<form>`
  and no submit button, and that the action names the route's form.
- `src/lib/checkout-shell.contract.test.ts` — the authority contract gains the
  new seams: the trailing slot, the form owner, the report-up, and the seam's
  third answer.
- `src/lib/theme-shell-slots.test.ts` — the seam's own unit pins now assert
  the FULL answer (the two booleans **and** where the action renders), and a
  new case pins that the action follows the band only when the theme's body
  renders at all.
- `src/lib/themes/songoskriti/checkout-composition.test.ts` — the theme's own
  composition pin: the order it authors is unchanged, the theme still carries
  **no** form, input or submit button, and the rationale comment is corrected.
- `.e2e/songoskriti-storefront-surfaces.spec.ts` — the browser lane: the
  checkout case now asserts the action renders **below** the payment control
  and **below** the total, and finds the order form through the action's own
  `form` attribute (the HTML form owner) instead of assuming the action is a
  descendant of the form.

### (r.2) The four documentation nits

| #   | the finding                                                                                                                                                                            | the file(s)                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | the "expert's six items" row still records the superseded D1 mechanism ("5 Archive contract ✅ (Option A — a documented contract, not a new key)")                                    | `report.md` — the row is re-pointed at **§5.2** (D1′)                                                                                                        |
| 3   | `phase3-evidence.md` cites `.gitignore` "line 3" for `.output/`; the entry is **line 4**                                                                                           | `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md`                                                                                              |
| 4   | the same file says "**Four are green**" while its own §3.2 table has **three** green rows (`assets:songoskriti`, `seo:weight`, `doc:gate`) — the asset generator is not one of the chain's 11 steps | `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md`                                                                                              |
| 5   | the "written BEFORE the first §7-prohibited edit" claim is unverifiable for the §(q) block — see §(r.3)                                                                            | `.superpowers/sdd/2026-10-21-frame30-core-cms-upgrade/final-fix-report.md` §17, and **this record** (§(r.3))                                                  |

### (r.3) A correction to §(q)'s ordering claim — what git can actually prove

**The claim as §(q) states it.** The §(q) preamble says: _"Every §7-prohibited
file this round edits is named here **before** the edit, with the finding, the
planned change and the covering test."_ The final-fix report's §17 repeated it
as "**§(q.1)–§(q.10) was written BEFORE the first §7-prohibited edit**".

**Why it cannot be stated that way.** The §(q) headers and the first
§7-prohibited edits landed in the **same** commit:

```
$ git log --oneline --name-only 38aad54d..7a7f9b70
5debc16c fix(builder): the catalogue declares what the theme authors
  docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md
  src/lib/builder-ast.ts
  src/lib/themes/songoskriti/composition-props.test.ts
  src/lib/themes/songoskriti/search-template.test.ts
  src/lib/widget-help.ts
```

For those three files (`src/lib/builder-ast.ts`, `src/lib/widget-help.ts`,
`src/lib/themes/songoskriti/search-template.test.ts`) the naming and the edit
are in one commit, and no commit order can separate them. For **every other**
§7-prohibited file the round edited, the naming commit precedes the edit
commit: `src/lib/themes.server.ts`, `src/lib/themes-reset.contract.test.ts`
and `src/routes/_authenticated/dashboard/builder.tsx` are named in `5debc16c`
and edited in `439e7b76`; `src/lib/themes/songoskriti/preview.ts`,
`src/lib/themes/songoskriti/checkout-composition.test.ts`,
`src/components/builder/songoskriti-port-freeze.test.tsx` and
`.e2e/songoskriti-storefront-surfaces.spec.ts` are named in `5debc16c` and
edited in `e707017f`; `src/components/store/ArchiveView.tsx` is named in
`5debc16c` and edited in `3cfe33c8`.

**What git can prove, and what this section therefore claims.**

1. **The record is append-only.** Measured:

   ```
   $ git diff --numstat 38aad54d..7a7f9b70 -- docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md
   702	0	docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md
   $ git diff 38aad54d..7a7f9b70 -- docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md | grep -cE "^-[^-]"
   0
   ```

   — 702 insertions, **0** deletions, and every added line lands after the
   record's original last line (4849).

2. **The record's hunks match the committed diffs byte-for-byte.** Measured
   over the four files whose diffs §(q.9) quotes: `src/lib/builder-ast.ts`
   **107/107** changed lines quoted, **0** mismatches (the record quotes the
   FULL diff); `src/lib/themes/songoskriti/preview.ts` **16/16**, **0**
   mismatches (the FULL diff); `src/lib/themes.server.ts` 38 quoted lines, **0**
   of them absent from the committed diff (quoted abridged — 8 committed lines
   are not quoted); `src/lib/template-variants.ts` 33 quoted lines, **0**
   absent (quoted abridged — 2 committed lines are not quoted). **194 quoted
   changed lines, 0 that differ from the commit.**

3. **The "named before the edit" ordering holds for the files edited in later
   commits** — and only for those. The three files edited in `5debc16c` itself
   are named in the same commit as their edit; the record does not, and cannot,
   claim otherwise.

**The corrected claim.** The final-fix report's §17 and this record now say
exactly that: the record is append-only (702 insertions, 0 deletions, measured);
its quoted hunks match the committed diffs byte-for-byte (194 quoted changed
lines, 0 mismatches, measured); and the "named before the edit" ordering holds
for the files edited in the commits **after** the one that introduced §(q)'s
headers. This round's own edits are named in §(r.1) and §(r.2) **before** the
edits, in this appended section.

### (r.4) The round's own discipline

- **Explicit-path staging only.** Every commit uses `git add <paths>`. The
  three churn files (`.artifacts/e2e/playwright-report/index.html`,
  `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the
  untracked `.output-snapshots/` are never staged.
- **No test deleted, skipped or weakened.** The pins this round touches are
  re-pointed at an intended behaviour change and each asserts at least as
  much.
- **No new npm dependency**, no lockfile change, no migration, no DDL.

### (r.5) The measured evidence

_(appended after the edits — see the section that follows this one.)_

### (r.5) The measured evidence (appended, 2026-10-22)

The diffs below are the **committed** diffs of this round, measured against
this round's base (`7a7f9b70`).

```
$ git diff 7a7f9b70..06406185 --stat -- src/ .e2e/
 .e2e/songoskriti-storefront-surfaces.spec.ts       |  36 ++-
 src/components/store/ThemeChrome.tsx               |  16 ++
 src/lib/checkout-shell.contract.test.ts            |  76 +++++
 src/lib/theme-shell-slots.test.ts                  |  29 +-
 src/lib/theme-shell-slots.ts                       |  31 +-
 .../songoskriti/checkout-composition.test.ts       |  36 ++-
 src/lib/themes/songoskriti/preview.ts              |  21 +-
 src/routes/checkout-dom-order.test.tsx             | 260 +++++++++++++++++
 src/routes/checkout.tsx                            | 248 ++++++++++++----
 src/routes/store.$slug.checkout.tsx                | 317 ++++++++++++++++-----
 10 files changed, 917 insertions(+), 153 deletions(-)
```

(The documents — this record, `phase3-evidence.md` and `report.md` — are in
the round's first commit, `dc1f5a63`; the numbers above are the code
commit's. The two documents are **also** normalised by the repository's own
formatter in the commit that carries this section — `prettier --check` was
clean for `phase3-evidence.md` and `report.md` at the base and this round's
edits changed the tables' padding, so `prettier --write` put them back.)

**The DOM-order pin — the covering test for MUST FIX 1:**

```
$ node_modules/.bin/vitest run src/routes/checkout-dom-order.test.tsx

 ✓ src/routes/checkout-dom-order.test.tsx (8 tests) 240ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

**The authority contract, the seam and the theme's own composition:**

```
$ node_modules/.bin/vitest run src/lib/checkout-shell.contract.test.ts src/lib/theme-shell-slots.test.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/routes/store.$slug.checkout.rescue.test.ts src/lib/checkout-token.test.ts src/components/builder/songoskriti-port-freeze.test.tsx

 ✓ src/lib/theme-shell-slots.test.ts (15 tests) 112ms
 ✓ src/lib/themes/songoskriti/checkout-composition.test.ts (9 tests) 71ms
 ✓ src/lib/checkout-shell.contract.test.ts (29 tests) 153ms
 ✓ src/components/builder/songoskriti-port-freeze.test.tsx (22 tests) 270ms
 ✓ src/routes/store.$slug.checkout.rescue.test.ts (10 tests) 20ms
 ✓ src/lib/checkout-token.test.ts (15 tests) 19ms

 Test Files  6 passed (6)
      Tests  100 passed (100)
```

**The whole suite, at the tip of this round:**

```
$ node_modules/.bin/vitest run

 Test Files  2 failed | 618 passed | 1 skipped (621)
      Tests  3 failed | 8790 passed | 3 skipped (8796)
```

The three failures are the **pre-existing, environment-bound** ones —
`src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts`
(1) — the same three the final-fix round recorded, and they fail at the base
commit in the same environment.

**The type check, the linter, the formatter, the build and the doc gate:**

```
$ node_modules/.bin/tsgo --noEmit
(no output — exit 0)

$ node_modules/.bin/eslint src scripts
✖ 319 problems (0 errors, 319 warnings)
(exit 0 — the 319 warnings are the pre-existing ones; 0 errors)

$ node_modules/.bin/prettier --check <the files this round touched>
Checking formatting...
All matched files use Prettier code style!

$ node_modules/.bin/vite build
✓ built in 6.00s
ℹ Generated .output/nitro.json
(exit 0)

$ node scripts/doc-gate.mjs
doc gate — canonical documentation checks
scope: 24 documents (23 require a status line)
self-test: PASS

findings: 0
(exit 0)
```

**The rendered order, measured on the production shell** (the storefront
route, the Songoskriti checkout AST, `renderToStaticMarkup` — the byte
offsets of the landmarks in the emitted markup):

```
   2541  ROUTE heading: Contact Information
   3466  ROUTE FIELD (phone)            <- the route's own customer fields
   3610  ROUTE heading: Delivery Address
   6099  the route's form closes         <- </form>
   6568  THEME payment block             <- the theme's `payment_methods`
  36534  THEME order summary             <- the theme's `cart_summary` (the total)
  37035  ROUTE place-order action        <- <button type="submit" form="fq-checkout-form-demo">Place Order</button>
```

**contact/address fields → payment control → order summary with the total →
"Place Order" (last).**

**The commits of this round:**

```
dc1f5a63 docs(evidence): the last five findings, named before the edits
06406185 fix(storefront): the place-order action comes LAST, after the rail and the total
```

The first carries **§(r)** — the round's escalation, appended **before** the
§7-prohibited edits — and the documentation nits; the second carries the code
and the pins §(r.1) names. The record stays append-only: this section is an
append too.
