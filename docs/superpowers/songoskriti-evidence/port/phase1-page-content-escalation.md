# Phase 1 — Page-template content-slot escalation (frozen pins + preview frame)

**Branch:** `frame30` · **Base commit:** `71271834` · **Recorded:** 2026-10-20
**Plan:** `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (Task 1)
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary — "no core files") and §9 (Testing & evidence)

This record is the port spec §9 escalation for the Phase-1 change "the theme's `page` template declares the route's content slot". It is written and committed **before** any pinned output is updated, and before the escalated preview frame is touched. Per §9, a change that alters existing pinned output is a parity finding first; if genuinely required, escalate with the exact diff and rationale before any update (named and called out, never blind `-u`). This document is that escalation.

---

## (a) The finding

**The theme's `page` template must declare the `page_content` slot, so its current composition `["heading", "rich_text"]` is stale.**

Today `songoskritiPreviewSource().main("page", s)` (`src/lib/themes/songoskriti/preview.ts:83`, the `case "page":` branch at `:207-217`) returns a `heading` section carrying the demo copy `"Size guide"` and a `rich_text` section carrying `"How to measure"` / `"Demo article. …"`. It declares **no** `page_content` slot.

`page_content` is a CONTEXT widget (`src/components/builder/widgets.tsx:1617`), so the host — not the template — supplies its body. The two hosts that drive the `page` template are:

- the CMS page route, `PageView` (`src/components/store/PageView.tsx:165-166` — `ownsPrimary={custom}` and `contentSlot="page_content"`), and
- the CMS-designated homepage, `StoreHomepage` (`src/components/store/StoreHomepage.tsx:101-123` — `template="page"`, `contextSlots={{ page_content: content }}`, `ownsPrimary`).

`ThemeChrome` only renders the theme's layout when the theme's main actually declares the slot it is told about (`src/components/store/ThemeChrome.tsx:302-310`): if the theme's `page` main has no `page_content` section, `themed` is `null` and the route's `fallback` renders instead of the theme body. The current composition therefore means **the theme's layout is skipped for the CMS page route**, and the CMS-designated homepage — which supplies `page_content` but no `contentSlot` — renders the theme's **demo copy** ("Size guide" / "How to measure" / "Demo article") instead of the merchant's body.

So the pinned expectation is not protecting a correct behaviour: it is protecting a template that carries demo copy in the place where a merchant's CMS body belongs.

---

## (b) The exact old → new diff for each of the two frozen pins

### (b.1) `src/components/builder/songoskriti-port-freeze.test.tsx:106`

```diff
@@ -103,7 +103,7 @@
     "product_rail",
   ],
   account: ["heading", "profile_card", "orders_list"],
-  page: ["heading", "rich_text"],
+  page: ["breadcrumb", "page_content"],
   blog: ["heading", "image", "rich_text"],
   cart: ["heading", "columns", "product_rail"],
   checkout: ["heading", "columns"],
```

The assertion at `:159` — `expect(main.map((x: Section) => x.type)).toEqual(TEMPLATE_MAIN[key])` — is **not** touched. It still pins the exact ordered composition of the `page` template. The old expectation is **replaced, not deleted**.

### (b.2) `src/lib/theme-preview-nav.test.ts:142-148` (plus the import at `:5` and a new map above the `it` block)

```diff
@@ -2,7 +2,7 @@
  * In-preview navigation — TDD: demo links stay inside the preview frame.
  */
 import { describe, expect, it } from "vitest";
-import { flattenSections } from "./builder-ast";
+import { flattenSections, type TemplateKey } from "./builder-ast";
 import { registerStaticPreviewSource } from "./preview-sources";
 import { songoskritiPreviewSource } from "./themes/songoskriti/preview";
 import { somvabonaPreviewSource } from "./themes/somvabona/preview";
@@ -114,6 +114,20 @@
       );
     }
   });
+  // Every template's opener is pinned explicitly: six of the nine used to
+  // fall through a default branch to the literal "heading", so a template
+  // that changed its opener was only caught for index and collection.
+  const FIRST_SECTION: Record<TemplateKey, string> = {
+    index: "hero_carousel",
+    product: "heading",
+    collection: "category_header",
+    account: "heading",
+    page: "breadcrumb",
+    blog: "heading",
+    cart: "heading",
+    checkout: "heading",
+    search: "heading",
+  };
   it("authors demo content for every template (no empty sub-pages)", () => {
     const preset = resolveThemePreview("songoskriti")!;
     for (const key of [
@@ -139,13 +153,7 @@
       // Main opens with a heading — except the index (hero carousel) and
       // the collection (category_header breadcrumb/title/subnav) templates,
       // which own the page h1 through their dedicated openers.
-      expect(ast.main[0]!.type, `${key} first section`).toBe(
-        key === "index"
-          ? "hero_carousel"
-          : key === "collection"
-            ? "category_header"
-            : "heading",
-      );
+      expect(ast.main[0]!.type, `${key} first section`).toBe(FIRST_SECTION[key]);
     }
     // Spot-check demo bodies use proven renderers.
     expect(preset.templates.collection.main.map((s) => s.type)).toContain(
```

`TemplateKey` is **not** currently imported in that file — the import at `src/lib/theme-preview-nav.test.ts:5` is `import { flattenSections } from "./builder-ast";` — so it becomes `import { flattenSections, type TemplateKey } from "./builder-ast";` (one added type import, no assertion removed).

The per-template opener map is:

| template     | opener            |
| ------------ | ----------------- |
| `index`      | `hero_carousel`   |
| `product`    | `heading`         |
| `collection` | `category_header` |
| `account`    | `heading`         |
| `page`       | `breadcrumb`      |
| `blog`       | `heading`         |
| `cart`       | `heading`         |
| `checkout`   | `heading`         |
| `search`     | `heading`         |

The assertion stays **total** — it still runs for every template in the loop — and now pins **every** template's opener instead of defaulting six of them to the literal `"heading"`.

---

## (c) The rationale

**The old expectation is the bug: it pins a body that carries demo copy and no `page_content` slot, which is what makes `ThemeChrome` skip the theme's layout (`src/components/store/ThemeChrome.tsx:302-310`) and lets the CMS-designated homepage render the theme's demo copy instead of the merchant's body (`src/components/store/StoreHomepage.tsx:101-123`).**

**The new expectation is strictly stronger: it pins the content slot, the breadcrumb slot, and the exact ordered composition.**

Nothing is weakened by the move:

- The freeze suite's `TEMPLATE_MAIN.page` was a two-element ordered list; it becomes a two-element ordered list that names the route's content slot and the breadcrumb that opens the body. Same shape, same totality, stronger content.
- The preview-nav suite's ternary default silently accepted `"heading"` for six of the nine templates. The explicit map pins all nine openers by name, and it pins the new `page` opener as `"breadcrumb"`.
- No assertion is deleted, skipped or weakened in either file. `expect(main.map((x: Section) => x.type)).toEqual(TEMPLATE_MAIN[key])` (`:159`) and `expect(ast.main[0]!.type, \`${key} first section\`).toBe(FIRST_SECTION[key])` both remain.

The `page` template is a **route-h1** template (`ROUTE_H1_TEMPLATES`, `src/lib/builder-ast.ts:68`; `routeSuppliesH1`, `src/lib/builder-ast.ts:77`): the route owns the `<h1>`, so the template elects no primary section (`primarySectionId`, `src/lib/builder-ast.ts:88`). The `breadcrumb` section is the first section because the route's furniture must survive above the merchant's body, and `page_content` is second because it _is_ the body.

---

## (d) The parity impact

**6 `page` reference stills and 6 machine baselines (`<template>-<width>-<locale>-chromium-linux.png`) under `docs/superpowers/songoskriti-evidence/port/reference/` and `.e2e/songoskriti-port-parity.spec.ts-snapshots/` become stale.**

Measured on this tree at `71271834`:

- `docs/superpowers/songoskriti-evidence/port/reference/` holds **59** files: 54 template stills (9 templates × 6 widths/locales) + 2 index-variation stills (`index-minimal-1440-en.png`, `index-festive-1440-en.png`) + 2 chrome mega-menu stills + 1 chrome mobile-drawer still. The 6 stale ones are `page-1440-bn.png`, `page-1440-en.png`, `page-375-bn.png`, `page-375-en.png`, `page-768-bn.png`, `page-768-en.png`.
- `.e2e/songoskriti-port-parity.spec.ts-snapshots/` holds **59** files with the same shape. The 6 stale ones are `page-1440-bn-chromium-linux.png`, `page-1440-en-chromium-linux.png`, `page-375-bn-chromium-linux.png`, `page-375-en-chromium-linux.png`, `page-768-bn-chromium-linux.png`, `page-768-en-chromium-linux.png`.

So the other **53** files in each directory are unaffected, because only the `page` template's body changes.

`reference-manifest.json` (at `docs/superpowers/songoskriti-evidence/port/reference-manifest.json`) holds **60** capture entries — the 59 above plus one `manual-review` entry, `chrome-mobile-drawer-375-bn.png`, that has no baseline file on disk — and re-freezing `reference/` rewrites all 60 entries. **That is a separate owner-approved step, not part of this plan's commits.**

The parity suite is owner-run only (it is in neither `e2e:critical` nor `e2e:security`, `package.json`), so a stale baseline does not break CI.

---

## (e) The boundary statement

**This record escalates exactly three existing files: the two existing test files named above and `src/components/store/ThemePreviewFrame.tsx`. No prohibited core file, no route file and no snapshot file is touched.**

The two existing test files are prohibited by port spec §7 (_"existing test files and their snapshots (`.snap`) under `src/`"_) and are escalated here. `src/components/store/ThemePreviewFrame.tsx` is likewise prohibited (§7: _"and everything else under `src/`"_) and is escalated here. Nothing under `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `src/components/builder/heritage.tsx`, `src/routes/**`, `src/lib/editor/**`, `src/lib/theme-presentations.ts` or `src/lib/unified-widget-registry.ts` is edited.

---

## (f) The lint-key consequence (Corrections §5 of this plan)

**The change leaves the page template with no h1-claiming widget, which is correct for a route-h1 template, but both live `lintTemplate` call sites pass no template key (`src/hooks/use-builder-editor.ts:635`, `src/lib/themes.server.ts:284`), so the route-h1 exemption is not applied and the builder reports `'No primary heading on this template.'` for the `page` template alone.**

`lintTemplate(ast, template?)` (`src/lib/builder-ast.ts:8380`) only applies the route-h1 exemption (`src/lib/builder-ast.ts:8427` — _"the h1 claimant is declared, not inferred. On `ROUTE_H1_TEMPLATES`…"_) when the template key is passed. Both live call sites omit it:

- `src/hooks/use-builder-editor.ts:635` — `out[key] = lintTemplate(doc.templates[key] ?? EMPTY_AST);`
- `src/lib/themes.server.ts:284` — `issues[key] = lintTemplate(templateOf(templates, key));`

**A merchant who adds a heading in response produces a second `<h1>` on a path host.** The fix is to pass the template key to `lintTemplate` in both call sites; both files are prohibited by port spec §7, so this plan records and escalates the defect rather than fixing it. **Recorded for the D4 boundary decision.**

---

## (g) The third file — `src/components/store/ThemePreviewFrame.tsx`

### (g.1) Reason

**`page_content` is a CONTEXT widget (`src/components/builder/widgets.tsx:1617`), so the host must hand it a React node; `SectionRenderer` renders `null` for a context widget whose slot is `undefined` outside the editor (`src/components/builder/SectionRenderer.tsx:825-833`).**

**The preview's only slot source is `useMockProductSlots` (`src/components/store/ThemePreviewFrame.tsx:256`), and it returns `undefined` for every template but `product` (`:309` — `if (!demoProduct) return undefined;`) — its one `page_content` key (`:415` — `page_content: pageContent,`) exists only on the product template.**

**So the moment the theme's `page` main declares `page_content`, the preview's `?template=page` renders the theme's chrome around an empty body: the demo copy is gone and no merchant page is in its place. Leaving that would trade a correctness win for a merchant-visible blank page in the theme preview.**

### (g.2) The exact diff

```diff
@@ -47,6 +47,7 @@
   type WidgetDataMap,
 } from "@/lib/widget-data";
 import { previewDemoMap } from "@/lib/preview-demo-data";
+import { PREVIEW_DEMO_PAGE } from "@/lib/preview-page-data";
 import { OrdersList, ProfileCard } from "@/components/builder/account";
 import { accountSlotCtx } from "./account-slots";
 import { useLang } from "@/lib/i18n";
@@ -575,6 +576,36 @@
         }
       : undefined;

+  // The preview has no CMS page record: `page_content` is a CONTEXT widget
+  // (`src/components/builder/widgets.tsx:1617`), so the host must hand it a
+  // node. Without one the fixed page template renders chrome with an empty
+  // body. The demo fixture mirrors the production payload shape
+  // (`src/components/store/PageView.tsx:73-110`) and is labelled as demo.
+  const pageSlots = useMemo(() => {
+    if (template !== "page") return undefined;
+    const page = PREVIEW_DEMO_PAGE;
+    return {
+      page_content: (
+        <article>
+          <h1 className="font-bangla-display text-3xl font-bold">
+            {page.title}
+          </h1>
+          <p className="mt-2 text-muted-foreground">{page.excerpt}</p>
+          <div
+            className="fq-prose mt-6 space-y-4 text-sm leading-relaxed"
+            dangerouslySetInnerHTML={{ __html: page.html }} // sast-allow: html-sink -- static first-party demo literal from src/lib/preview-page-data.ts, no merchant or shopper data reaches this sink
+          />
+          <p className="mt-8 text-xs text-muted-foreground">
+            Last updated:{" "}
+            <time dateTime={page.updated_at} className="money">
+              {new Date(page.updated_at).toLocaleDateString("en-GB")}
+            </time>
+          </p>
+        </article>
+      ),
+    };
+  }, [template]);
+
   return (
     <div
       role="dialog"
@@ -665,6 +696,7 @@
                           ...accountSlots,
                           ...productSlots,
                           ...cartSlots,
+                          ...pageSlots,
                         }}
                       />
                     ))}
@@ -690,6 +722,7 @@
                             ...accountSlots,
                             ...productSlots,
                             ...cartSlots,
+                            ...pageSlots,
                           }}
                           primary={section.id === primaryId}
                         />
@@ -716,6 +749,7 @@
                               ...accountSlots,
                               ...productSlots,
                               ...cartSlots,
+                              ...pageSlots,
                             }}
                           />
                         ))}
```

### (g.3) Scope

**The change is exactly: (1) one new import of the NEW fixture `src/lib/preview-page-data.ts`; (2) one new `pageSlots` memo beside the existing `accountSlots` / `cartSlots` memos, which returns `{ page_content: <article>…</article> }` when `template === "page"` and `undefined` otherwise; (3) `...pageSlots` added to the three `contextSlots` spreads (`:664-668`, `:689-693`, `:715-719`).**

**Nothing else in the file changes: the `?? templates.index` fallback (`:485`), the click/submit interception, the skin sheets, the demo focus, `useMockProductSlots`, `accountSlots`, `cartSlots` and `previewDemoMap` are all untouched, and no assertion in the file is skipped, weakened or deleted.**

**The fixture's copy is DEMO copy and is labelled as such — it never pretends to be a real merchant page.**

### (g.4) Approval

**This third file is inside the owner's approved escalation: the owner has ruled that the preview's `?template=page` tab must keep showing content after the fix instead of chrome with an empty body, and has named `src/components/store/ThemePreviewFrame.tsx` as the file that carries the change.**

---

## Not escalated

**No change is recorded to `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap` — the page template's markup is not in it (that snapshot pins the homepage and chrome renderers only).**

---

## Verification of the cited `file:line` references

Every reference in this record was grepped out of the tree at `71271834` and resolves:

| citation                                               | resolves to                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `lintTemplate`                                         | `src/lib/builder-ast.ts:8380`                                                     |
| `routeSuppliesH1`                                      | `src/lib/builder-ast.ts:77`                                                       |
| `primarySectionId`                                     | `src/lib/builder-ast.ts:88`                                                       |
| `genericDemoMain`                                      | `src/lib/theme-preview-nav.ts:357`                                                |
| `const themed =`                                       | `src/components/store/ThemeChrome.tsx:302`                                        |
| `ownsPrimary={custom}`                                 | `src/components/store/PageView.tsx:165`                                           |
| `contentSlot="page_content"`                           | `src/components/store/PageView.tsx:166`                                           |
| `page_content: ContextSlot`                            | `src/components/builder/widgets.tsx:1617`                                         |
| `export type StorePage`                                | `src/lib/storefront-search.server.ts:257`                                         |
| `if (!demoProduct) return undefined`                   | `src/components/store/ThemePreviewFrame.tsx:309`                                  |
| `page: ["heading", "rich_text"],`                      | `src/components/builder/songoskriti-port-freeze.test.tsx:106`                     |
| `${key} first section`                                 | `src/lib/theme-preview-nav.test.ts:142`                                           |
| `"Size guide"` / `"How to measure"` / `"Demo article"` | `src/lib/themes/songoskriti/preview.ts:209` / `:211` / `:213`                     |
| `useMockProductSlots`                                  | `src/components/store/ThemePreviewFrame.tsx:256` (definition), `:535` (call site) |
| `page_content: pageContent,`                           | `src/components/store/ThemePreviewFrame.tsx:415`                                  |
| `lintTemplate` call site (builder editor)              | `src/hooks/use-builder-editor.ts:635`                                             |
| `lintTemplate` call site (theme server)                | `src/lib/themes.server.ts:284`                                                    |
| `ROUTE_H1_TEMPLATES`                                   | `src/lib/builder-ast.ts:68`                                                       |
| context-widget `null` render                           | `src/components/builder/SectionRenderer.tsx:825-833`                              |
