# The dynamic-themes programme — the obsolete-path table (Task 6)

_Recorded 2026-10-22, on branch `frame30` at the programme tip `4eef8f5c` (the record commit that precedes the Task 6 code commit is `2eba4db1`). The plan's §A8 table listed **eight** candidate obsolete paths (O1–O8); Task 6 proves each disposition by citation **before** touching anything. The citations below were measured that morning — every one is a literal `grep -rn` output against `4eef8f5c`, quoted verbatim where it decides the disposition._*

**The month's ruling.** One path is **removed** (O1 — the checkout mock, proven unused). Everything else **stays**: the gate's reference body (O2), the explicit absent-template copy (O3), the platform's taxonomy grid (O4), the composable shell-slot pieces (O5), the studio's default cart (O6), the studio's generic demo map (O7) and the route's own picker and summary (O8). A removal whose consumer set is non-empty is not a cleanup — it is a defect.

---

## (O1) `src/components/store/CheckoutMock.tsx` — REMOVED (proven unused)

**What it was.** A 137-line hardcoded checkout the previous programme's preview used before the storefront's checkout was authored: fake inputs, a fake order summary and a remote image URL. This programme's Task 4 wave replaced every path it backed with **the theme's authored checkout composition rendered through the same `SectionRenderer` the storefront uses**, plus the platform's own cart widgets granted through the five cart slots.

**The citation (measured 2026-10-22 at `4eef8f5c`):**

```
$ grep -rn "CheckoutMock" src .e2e --include=*.ts --include=*.tsx
src/components/store/songoskriti-preview-compositions.test.tsx:8:  * never the pack's `SAMPLE` blog rows and never the generic `CheckoutMock`.
src/components/store/CheckoutMock.tsx:4:export function CheckoutMock({
src/components/store/ThemePreviewFrame.tsx:1285:                     SectionRenderer the storefront uses — not `CheckoutMock`.
```

Three hits: the file's own definition and **two prose comments** that describe what the preview does _not_ carry. **No importer** — no `import … CheckoutMock` anywhere in `src` or `.e2e`. Dead by citation, exactly as the plan's §A8 O1 predicted.

**The disposition.** `git rm src/components/store/CheckoutMock.tsx`, credited in the Task 6 code commit. The two prose mentions are stale references to a path that no longer exists, so both are re-worded **in the same commit** to name what replaced it — the authored checkout composition rendered through `SectionRenderer` (see §(O2-adjacent) below for the re-word mechanics, and the escalation record's §(l) for the one §7-pinned file among them).

**Kept out of scope.** Nothing imports it; no test pins it; no still frames it. The removal changes no snapshot, no assertion, no contract.

---

## (O2) `genericDemoMain` (`src/lib/theme-preview-nav.ts`) — KEPT; its doc comment re-worded

**What the citation measured (2026-10-22 at `4eef8f5c`):** `grep -rn "genericDemoMain" src` returns the function's definition (`src/lib/theme-preview-nav.ts:482`), the **assembled preview's doc comment** that already records the D4 ruling (`:507`), the distinctness gate's reference body (`src/lib/themes/songoskriti/template-distinctness.ts:56`, `:309`, `:340`, `:490`, `:520`), and five test suites that measure themes against it (`template-distinctness.archive.test.ts:39`, `search-template.test.ts:37`, `page-content.test.ts:22`, `distinctness-dynamic.test.ts:37`, `template-distinctness.test.ts:38`), plus the pipeline resolver's own source-reader pin (`pipeline-resolver.test.ts:374-376`, which gates its presence textually). **The synthesis is already gone**: `assemblePreviewTemplates` no longer calls it (`:528-530` — `const main = source.main(templateKey, s); if (!main) continue;`, the absent-template rule of §**D4**).

**The disposition.** The function **stays** — it is the distinctness gate's yardstick, not a synthesiser; deleting it would blind the gate. What changes is its doc comment, which still described the retired synthesis role (_"Generic demo body for templates a theme does not author"_); it now states the current role — **the distinctness gate's reference body, which the preview never renders**. No string, no body copy and no signature change (the gate's suites measure its output's rule ids and section types, and the body copy `"Demo page. …"` stays byte-stable for them).

---

## (O3) `UNSUPPORTED_TEMPLATE_BODY` (`src/components/store/ThemePreviewFrame.tsx`) — KEPT, copy re-worded

**What the citation measured (2026-10-22 at `4eef8f5c`):** the copy constant at `:135-138`, read straight out of the file by `src/lib/themes/songoskriti/archive-contract.test.ts:115-116` (`copyConstant`), and rendered by the explicit absent-template panel (`UnsupportedTemplateNotice`). At the base `109e2d3d` the constant was byte-identical — the D4 re-word had **not** shipped early; it is Task 6's own edit.

**The disposition.** **Keep and re-word** — this is the explicit state §**D4** relies on (the named panel, never a redirect, is the path every non-authored template now takes). The re-word adds the fact D4 makes true — the engine **never synthesises** a body for a non-authored template — while preserving every phrase the archive contract pins (`"The archive is a first-class template a theme may author"`, `"keep the platform grid"`, `"carry no store slug"`) and carrying **none** of the retired demo strings the same test forbids (`"Demo"`, `"Demo page"`, `"Demo search"`, `"Meet the makers"`, `"Sample product"`). The panel's title constant is untouched (`PublishModal.test.tsx` and `pipeline-resolver.test.ts` read it textually). The module's re-export stays `const` — the builder imports through it (`:140-143`).

---

## (O4) `src/components/store/BlogArchiveTheme.tsx` — KEPT

**The citation (2026-10-22 at `4eef8f5c`):** `grep -rn "BlogArchiveTheme" src` shows the load-bearing consumers — the archive host's **delegated fallback** (`src/components/store/ArchiveView.tsx:152`, imported `:38`), the byte-identical pin (`ArchiveView.test.tsx:203`, _"the no-theme render is BYTE-IDENTICAL to today's BlogArchiveTheme render"_), and the theme-less routes that still render it (`src/routes/blog.index.tsx:167`, `:264`; `src/routes/store.$slug.blog.index.tsx:98`), plus the contract tests that read its source textually (`preview-parity.contract.test.ts:44`, `preview-safety.contract.test.ts:160`).

**Why it stays.** The taxonomy surfaces are store-less by design (§**H6**): a blog listing's category, tag and author archives carry no store slug, so they cannot resolve a theme — the platform grid **is** their surface, not a gap in one. Removing it would strand the reader surfaces.

---

## (O5) `src/lib/theme-shell-slots.ts` — KEPT (generalised this programme)

**The citation (2026-10-22 at `4eef8f5c`):** `themePlacesAccountProfile` is consumed by the account route (`src/routes/store.$slug.account.tsx:315`), and `checkoutShellControls` by the checkout route (`src/store.$slug.checkout.tsx:307-308` → `src/routes/store.$slug.checkout.tsx`); `themeCarriesPaymentPicker` (`theme-shell-slots.ts:116`) and `themeCarriesOrderSummary` (`:132`) are the guards `checkoutShellControls` composes (`:171-172`). This programme's own route comment names the generalised contract: _"the route supplies the picker and the summary when the theme's body carries none"_ (`src/routes/store.$slug.checkout.tsx:295-303`).

**Why it stays.** The rule "the route supplies the control the theme's body does not" is exactly what the composable pieces make **sharper** — each piece answers one question about a body (`themeCarriesPaymentPicker(ast)`), so the shell decision is a composition of readings, not a hardwired table. O5 is the far end of the spectrum: the plan's A8 listed it to force the question, and the question's answer was Task 4's generalisation. Nothing left behind.

---

## (O6) `DEMO_CART` (`src/components/builder/CartContext.tsx:75-124`) — KEPT

**The citation (2026-10-22 at `4eef8f5c`):** `grep -rn "DEMO_CART" src` returns the declaration and its role as the context's **default value** (`CartContext.tsx:126`: `createContext<CartContextValue>(DEMO_CART)`), the studio's payment-method test that seeds from it (`cart-payment-methods.test.tsx:40`, `:70`), and the preview's three prose citations that pin the preview's _non_-use of it (`ThemePreviewFrame.tsx:673`, `:1149`; `songoskriti-preview-compositions.test.tsx:7`).

**Why it stays.** It is not dead — it is the **default**: any host that mounts no `CartProvider` (the painter's canvas before an interaction, the builder's inert studio views) reads it. The D2 ruling already fixes what the plan flagged: the **editor canvas is no longer such a host** — it mounts the real cart provider over the widgets since Task 2. What remains is a default for the studio, not a storefront body.

---

## (O7) `src/lib/preview-demo-data.ts` (`previewDemoMap`) — KEPT

**The citation (2026-10-22 at `4eef8f5c`):** declared at `preview-demo-data.ts:47`, consumed by the preview host at `ThemePreviewFrame.tsx:719` (`const map = previewDemoMap(bundle, blueprintKey)`) — the demo map for the **non-Songoskriti blueprints**' preview compositions.

**Why it stays.** The other build-in blueprints still preview over labelled sample data; the Songoskriti pack uses the theme's own fixture pack. One map for the studio, one for the pack — neither obsolete.

---

## (O8) The route's own payment picker and order summary — KEPT; copy converged

**The citation (2026-10-22 at `4eef8f5c`):** `src/routes/store.$slug.checkout.tsx:295-311` — _"The theme's body may carry them … or it may not … so the route supplies its OWN picker and its OWN summary when the theme's body carries none."_ The `fallbackControls` branch (`:308`) is the platform's surface for a theme that **declines** the checkout.

**Why it stays.** A theme that declines the checkout body must still leave the shopper a working rail and a visible total. The D8 ruling's copy convergence shipped in the Task 4 wave: the route-owned picker and summary now speak the same words as the platform's `payment_methods` / `cart_summary` widgets, so the two paths (theme-carried and route-fallback) read as one storefront.

---

## The removal wave's mechanics (what the Task 6 commit contains)

1. **`git rm src/components/store/CheckoutMock.tsx`** — the O1 removal, credited with the batch.
2. **`ThemePreviewFrame.tsx:1284`** — the stale _"— not `CheckoutMock`"_ clause re-worded to name the replacement: the authored composition that replaced the generic checkout mock, deleted 2026-10-22, proven unused by this record's O1.
3. **`songoskriti-preview-compositions.test.tsx:7-8`** — the same re-word; this file is §7-pinned, so the edit is **escalation-required** and is recorded in the escalation record's §(l) **before** this wave (the record commit `2eba4db1` precedes the code commit). The test's assertions, fixtures and expected strings are untouched — never weakened.
4. **`theme-preview-nav.ts`** — the O2 doc-comment re-word (allowed).
5. **`ThemePreviewFrame.tsx`** — the O3 copy re-word (allowed).
6. **This record** — the file you are reading.

**Neighbouring gates (Task 6.4), run after the edits:**

- `vitest run` over `songoskriti-preview-compositions.test.tsx`, `ThemePreviewFrame.test.tsx`, `template-distinctness.test.ts`, `theme-preview-nav.test.ts` → **4 files, all passed**
- `node_modules/.bin/tsgo --noEmit` → exit 0, no output
- `node_modules/.bin/eslint src scripts` → no findings

_(The measured tails of those three gates are quoted in the Task 6 report; this record carries the dispositions and the citations, the report carries the receipts.)_
