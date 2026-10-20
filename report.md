# Songoskriti — template genericity & the asset-inventory gap: consolidated report

**Date:** 2026-10-20 · **Repo:** `/opt/frame28` · **Branch:** `frame30` · **Deployed:** `fda55ede` (`origin/frame30` and `origin/main`)
**Purpose:** one self-contained document for an expert review — the problem as found, every implementation question that was asked and the answer it received, what has since shipped and been verified, and the questions that remain open.

---

## 0. How to read this

| §   | For you if you want…                                                           |
| --- | ------------------------------------------------------------------------------ |
| 1   | the problem, in the state it was found                                         |
| 2   | **every question I asked on implementation and the answer I received**         |
| 3   | what has shipped since, with the live evidence                                 |
| 4   | the platform map (what exists vs. what is missing) — the facts an expert needs |
| 5   | **the open questions**, each with the evidence that settles it                 |
| 6   | the constraints that bound any solution                                        |
| 7   | the file map and how to reproduce every claim                                  |
| 8   | the rulings I made on your behalf — challenge these                            |

---

## 1. The problem as found

Songoskriti is a source-owned official theme. Its imagery lived in `public/ph/songoskriti/` with **no trustworthy inventory**:

- A 15-entry manifest in `scripts/songoskriti-assets-check.mjs` against a 21-file directory. The checker was **RED (7 findings) and wired to nothing** — no npm script, no release gate, no test.
- **9 of the 21 assets were JPEG bytes stored under `.png` names** — every public URL for them lied about the format it served.
- 8 assets the theme actually renders (`campaign-men`, `edit-festive-main`, `ugc-1…6`) were absent from the manifest and from the generator, so the generator could not reproduce the shipped tree.
- `prod-kurta` / `prod-kantha` were declared in the manifest and the generator, did not exist, and were referenced by the **applied** seed `supabase/migrations/20260924_songoskriti_demo.sql:64-65` — two seeded catalogue products whose image 404s in production.
- 3 collection-editorial references pointed at files that never existed (`songoskriti_saree.jpg`, `songoskriti_men.jpg` — both marked `// TBD`; `songoskriti_artisan.jpg` — unmarked) in `src/lib/themes/songoskriti/archetypes.ts`.

And the pages that prompted the second half of this work:

- `?template=search`, `?template=cart`, `?template=account` (and `page`, `blog`) rendered **generic bodies inside Songoskriti's chrome** — themed header/footer, shared body. The pages were not broken: nothing 404'd, the chrome and fonts were correct. They were **generic by authorship**.
- The root cause was one omission plus one architecture: Songoskriti's `page` template declared no `page_content` widget, so the CMS page route bypassed the theme layout and rendered the merchant's real content as unthemed prose, while the CMS-designated homepage rendered the theme's hardcoded `"Size guide"` / `"Demo article"` copy. Separately, the theme preview fills its bodies with shared demo data (`"Sample product"`, `"Demo Shopper"`), and a missing template silently falls back to the homepage (`templates[template] ?? templates.index`, `ThemePreviewFrame.tsx:485`).
- There is **no `archive` template** in the product: `TEMPLATE_KEYS` is `index, product, collection, account, page, blog, cart, checkout, search`. `?template=archive` returns **307**.

---

## 2. Every implementation question, and the answer

These are the questions I put to you while implementing, with the options offered and the answer chosen. Each answer unlocked the work noted.

| #   | Question                                                                                    | Options offered                                                                                                     | **Your answer**                                                                                                          | What it unlocked                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | The 9 JPEG-in-`.png` assets — how to make them honest?                                      | rename to `.jpg` · transcode to true PNG · allowlist the mismatch                                                   | **Rename to `.jpg`, update every reference** (byte-identical pixels, URLs become truthful)                               | The rename + its full reference sweep + the live asset gate                                                                                  |
| Q2  | The 3 `// TBD` editorial references point at files that never existed                       | reuse existing theme art · drop the editorial sections · block on new generation                                    | **Reuse existing theme art** — women → `edit-festive-main.jpg`, men → `campaign-men.jpg`, heritage → `hero-artisans.jpg` | No broken references, no new generation, no new assets                                                                                       |
| Q3  | "Unnecessarily large files" — how strict?                                                   | budgets only (pixels exact) · optimise the current assets too · warn only                                           | **Budgets only, keep pixels exact** (≤ 3,000,000 B/file, ≤ 28,000,000 B total, ≤ 2.0 B/px PNG, ≤ 1.0 B/px JPEG)          | The gate's size rules with zero recompression                                                                                                |
| Q4  | How should the gate be built?                                                               | A: shared manifest + CLI + generator `--check` + vitest + release wiring · B: vitest-only · C: browser/network gate | **A — shared manifest + CLI**                                                                                            | One manifest + one frozen expectation + one gate that both the CLI and CI run                                                                |
| Q5  | The port spec §7 forbids editing core files; the rename needs two existing test files moved | two test files only · **also fix the preview's page tab**                                                           | **Also fix the preview's page tab** (a three-file escalation: the two pins + `ThemePreviewFrame.tsx`)                    | The preview keeps showing real content instead of going empty                                                                                |
| Q6  | How to proceed with Phase 1?                                                                | execute now with subagents · commit the documents first · hold                                                      | **Execute Phase 1 now with subagents**                                                                                   | 7 implementation commits + a review after each                                                                                               |
| Q7  | Integration of the asset-gate branch                                                        | push and deploy · push only · keep local                                                                            | **Push and deploy**                                                                                                      | `b31c87ea` live; the live asset verification                                                                                                 |
| Q8  | Integration of Phase 1                                                                      | push and deploy · push only · hold                                                                                  | **Push and deploy**                                                                                                      | `520c0335` live, then `fda55ede` after the closure pass                                                                                      |
| Q9  | "Close all the opened task"                                                                 | —                                                                                                                   | **Close every open item**                                                                                                | The closing wave: the lint key, the nav restore, the label localisation, the JWT redaction, the record corrections, and the remaining minors |

**Escalations granted** (each is an explicit exception to port spec §7, recorded in `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md`):

1. `src/components/builder/songoskriti-port-freeze.test.tsx` + `src/lib/theme-preview-nav.test.ts` (the two frozen pins → moved to a **stronger** assertion: the preview-nav opener map became a compile-time-total `Record<TemplateKey, string>`).
2. `src/components/store/ThemePreviewFrame.tsx` (the preview's page-content source).
3. `src/hooks/use-builder-editor.ts` + `src/lib/themes.server.ts` (the lint key) and `src/components/store/PageView.tsx` (the nav restore), with `ThemeChrome.tsx` touched only to share the "does the theme render the body" predicate via the new `src/lib/theme-body-slot.ts`.

---

## 3. What has shipped, and the evidence

### 3.1 The asset acceptance gate (live on `b31c87ea`)

- **One manifest** (`scripts/songoskriti-assets-manifest.mjs`, 21 entries) + **one frozen expectation** (`scripts/songoskriti-assets-expected.json`, 21 sha256 digests) + the tree. The gate compares all three, so deleting a file _and_ its manifest entry can no longer go green.
- **The gate** (`scripts/songoskriti-assets-check.mjs`): one pure `checkSongoskritiAssets(world) → {findings, notes}`. Rules: missing, orphan, byte-vs-name and name-vs-manifest format mismatch, undersized, oversized, over-dense, total size, duplicate (in-dir **and** a theme raster copied elsewhere under `public/`), unreferenced, invalid SVG, expectation drift, dangling reference, wrong URL form, cross-theme reference, video mismatch, and a retired path in the newest migration (advisory). Exit 0/1/2; notes never fail it.
- **The generator** (`scripts/gen-songoskriti-assets.mjs --check`): keyless, offline, proves plan ↔ expectation ↔ tree, and its write path **refuses** a payload whose format contradicts the file name.
- **Live proof**: the 9 renamed URLs → **200**, the 9 retired `.png` URLs → **404**, the 7 untouched assets → 200; all 21 referenced assets resolve across index/collection/product.
- The gate heads `gates:release` (`bun run assets:songoskriti`); the vitest suite runs it in CI.

### 3.2 Phase 1 — the generic `page` template (live on `fda55ede`)

- `src/lib/themes/songoskriti/preview.ts:207-218` — the theme's `page` template now declares `s("breadcrumb") + s("page_content")` instead of `heading "Size guide"` + `rich_text "Demo article"`. The CMS page now renders the merchant's **real content through the theme layout**.
- The theme preview gained an honestly-labelled demo page source (`src/lib/preview-page-data.ts` — a data-only fixture typed as a `Pick` of the production `StorePage` row, so a production shape change breaks the build) plus one memo in `ThemePreviewFrame.tsx`.
- **The two regressions this introduced were then closed**: the "More information" sibling-page nav is restored on the themed path and the empty 15rem gutter is gone (`15ba404a`, `029b1b5e`), and the false "No primary heading on this template" lint warning is fixed by keying the lint by template (`74b7f2b5`) — the rule is unchanged for templates that genuinely own their h1.
- **Live proof** (`?template=page`, `en` and `bn`): HTTP 200, exactly **one `<h1>`**, one `<article>`, the `page_content` node present, "Demo page body." present, **zero** occurrences of "Size guide" / "Demo article" / "How to measure", the label localised ("Last updated" / "সর্বশেষ হালনাগাদ"). All eight other preview templates still render 200 unchanged.
- **CI's `secrets:scan` was red at HEAD** (a committed anon JWT in the e2e evidence) — redacted in place; the scanner was **not** weakened, and the note now discloses that the value remains in git history (`044624af`) with a rotate-if-shared action.

### 3.3 Documents produced (all committed)

`docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (the executable plan, 6 tasks) · `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` (the audit) · `…/phase1-page-content-escalation.md` (the escalation record) · `…/phase1-page-content-evidence.md` (the verification evidence) · `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` (the brief as received) · `…-brief-review.md` (its review: 17 corrected premises).

---

## 4. The platform map an expert needs

**Legend:** ✅ exists today · ⚠️ exists but incomplete/wrong · ❌ absent.

|                               | search                                                                                          | cart                                    | account           | blog                                           | checkout                                         | archive       | page                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------- | ---------------------------------------------- | ------------------------------------------------ | ------------- | -------------------------------- |
| **A. key defined**            | ✅                                                                                              | ✅                                      | ✅                | ✅                                             | ✅                                               | ❌ **absent** | ✅                               |
| **B. per-theme default AST**  | ✅                                                                                              | ✅                                      | ✅                | ⚠️ demo copy, no `blog_archive`                | ✅                                               | ❌            | ✅ **now** (was ⚠️)              |
| **C. merchant edits it**      | ✅ selector (`BuilderTopBar.tsx:413`), persisted per template (`use-builder-editor.ts:332-345`) | ✅                                      | ✅                | ✅                                             | ✅                                               | ❌            | ✅                               |
| **D. route-owned data**       | ⚠️ one opaque `productSlot`, not per-widget slots                                               | ✅ `contextSlots` + live `CartProvider` | ✅ `accountSlots` | ✅ `BlogFeedProvider`                          | ⚠️ `ast={null}` — tokens only                    | ❌            | ✅ real page record → `PageView` |
| **E. rendered in production** | ⚠️ partial                                                                                      | ✅                                      | ✅                | ❌ `ast={null}` (`BlogArchiveTheme.tsx:29-33`) | ❌ `ast={null}` (`store.$slug.checkout.tsx:418`) | ❌            | ✅ **now**                       |

**Three structural findings that drive everything else:**

1. **The `index` template has no production render path.** The only `template="index"` is inside `src/components/store/StorefrontPage.tsx:294`, and `StorefrontPage` is imported nowhere (only a doc comment and a test that reads it as text). Both storefront index routes render either the CMS-designated page (wearing `template="page"`) or `StoreWelcome`.
2. **The `checkout` template has no production render path either** — the route fetches the checkout chrome and throws the AST away.
3. **The storefront blog route is deliberately themeless** — `BlogArchiveTheme` passes `ast={null} tokens={null}` with the comment _"the render stays generic for every key **by design** — pinned in `BlogArchiveTheme.test.tsx`"_. The brief's §8 therefore contradicts a **test-pinned product decision**, not just an implementation gap.

**What already exists and does not need rebuilding** (the brief's premises that the audit corrected): the per-template editor and selector; the route-owned context/data system (`widget-data.ts` → `collectWidgetRequests`, `ContextSlot`); the theme presentation registry; the **blog archive pack** (`blog_archive` / `blog_terms` / `blog_pager` — the exact pattern the brief reinvents for search/archive, already built and already in a live theme's AST, but **not connected** to the storefront blog route); the platform-wide definition-of-done test (`src/lib/definition-of-done.test.ts`).

**What is genuinely missing**: an `archive` key; per-widget search slots; a themed checkout; a themed storefront blog; a preview that mirrors the storefront's contexts; and a distinctness criterion ("is this template a Songoskriti design, or the shared default with the theme's logo on top?").

---

## 5. The open questions — for the expert

Each carries the evidence that settles it. **D1–D3 and D5 are yours; D4 and D6 are now recorded but still need a ruling.**

### D1 — Does `archive` need to be a template _key_ at all? _(the judgement call the audit flagged)_

**Question:** is "Archive" the **blog taxonomy** surface (index / category / tag / author — the only route-level taxonomy archives that exist) or a **product-side** listing archive (category / brand / search-kind, where "brand" has no route at all)?

- **If blog-only** → **no new key is needed**: the `blog` template + the blog pack already cover it, and the platform already supports suffixed variant keys (`templateSuffixFromOverride` / `resolveTemplateCandidates`, `builder-ast.ts:8203-8280`) — `blog_category`, `blog_tag`, `blog_author` would work today.
- **If product-side** → a new `archive` key touches **16 `TEMPLATE_KEYS` sites, 7 `Record<TemplateKey,…>`/switch maps, 41 per-widget `templates:` allowlists, a hand-written `z.enum` (`src/lib/storefront.functions.ts:97-107` that no compiler sees), the theme-package contract and `THEME_API_RANGE` ("^3.0.0")** — and every one of those files is prohibited by §7, so the whole phase is an escalation. Note also that `parseTemplates` **silently drops unknown keys**, so a key added to the editor but not to the parser would appear in the builder and vanish from every page.
- **Settled by:** `grep -rn 'template="' src/routes/` + `grep -rn 'activeSlug\|termArchivePath' src/routes/blog.*.tsx` + the product ruling _"must merchants design a product-category listing distinct from the Collection template?"_

### D2 — Is the checkout template meant to be themeable at all?

The route deliberately discards the theme AST (`ast={null}`) while the theme surface implies otherwise. The brief's §9 asks for a themeable checkout with strict platform constraints. **Is the current "tokens only" behaviour the intent, or a gap?** Highest-risk phase (payment integrity), and it needs a decision before any design starts.

### D3 — Scope: Songoskriti only, or both official themes?

Somvabona authors **none** of the six secondary surfaces — it falls through to the engine's generic demo body. "Defaults for every official theme" is therefore not 2× the Songoskriti work; it is 2× **plus** authoring six surfaces from scratch for a theme that has none.

### D4 — Does port spec §7's "no core files" boundary still govern this Frame30 work?

Phases 2–5 all require `src/routes/**` and `src/components/store/**`. Phase 1 needed three escalated files (granted) and the closure wave added three more (granted). **The remaining phases cannot be done without a standing escalation.** Options: amend §7 for the template programme, or run each phase as its own escalation, or keep the boundary and accept that the storefront templates stay shared.

### D5 — The blog: reverse "themeless by design", or drop it from scope?

`BlogArchiveTheme` passes `ast={null}` with a comment saying the generic render is intentional and is pinned by a test. Phase 2 would make the storefront blog wear the theme's `blog` template and the blog pack (the widgets already exist). **Is "themeless by design" a product decision to keep, or a placeholder to replace?**

### D6 — The parity re-freeze (one open owner action)

Six `page-*` stills in `docs/superpowers/songoskriti-evidence/port/reference/` and in `.e2e/songoskriti-port-parity.spec.ts-snapshots/` predate the change, and `reference-manifest.json` holds 60 captures. A re-freeze rewrites all 60. It was **deliberately not auto-run**: the harness activates Songoskriti on a store in the database configured by the repo's `.env` — a possibly-shared instance — and it only accepts loopback requests. The exact command, the preconditions (loopback dev server, a **disposable** store, Playwright browsers) and the trigger (before the next owner-run parity pass; the suite is in neither `e2e:critical` nor `e2e:security`, so CI is unaffected) are recorded in the evidence doc §D.5. **What to review in the diff:** only the 6 `page-*` entries should differ materially; the other 54 captures are expected to be unchanged modulo the per-response CSP nonce.

### D7 — The storefront criterion cannot be closed yet

The live DB holds three `store_themes` rows (Atelier, classic, Supershop) — **none Songoskriti** — so `/store/<slug>/pages/<slug>` could not be exercised live. The substitute evidence is component-level (the real `ThemeChrome` contract, the real Songoskriti page AST, both host shapes). The criterion stays open until a Songoskriti store exists. **Until then, the branch's production blast radius is the theme-preview route only** — and the two regressions it introduced (nav loss, false lint warning) had zero blast radius for exactly that reason, and become real the first time a merchant activates Songoskriti.

### D8 — Two accepted-and-deferred review findings

1. A merchant template with **two** `page_content` widgets would render the nav twice (the body already duplicated pre-change; the real fix is a lint rule in `builder-ast.ts`, i.e. core).
2. The `useLang()` fallback `t` identity churn — tests only.

---

## 6. The constraints that bound any solution

- **Port spec §7** (`docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md`): editable = `src/lib/themes/songoskriti/**`, `src/components/builder/songoskriti*.ts(x)`, **new** test/fixture files, **new** `.e2e/` files, `docs/**`, `scripts/**`, wiring-only `package.json`/`.circleci` edits. Prohibited = `src/routes/**`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, existing tests and their `.snap` files, existing `.e2e/**`, everything else under `src/`. Escalation rule: _"any required capability missing in core → stop, report, wait for a decision. Never edit silently."_
- **Gates that must stay green**: asset gate, generator check, `doc-gate` (0 findings), `tsgo --noEmit`, eslint (0 errors), prettier on touched files, `bun run test`.
- **Known pre-existing reds** (not ours, none blocking): `src/lib/site.server.test.ts` — a local `.env` env flake that passes in CI; `contract-gate` exits 2 locally (`spawnSync bunx ENOENT` — `bun` is not on PATH here); `schema-fingerprint --check` exits 1 (needs a live Supabase RPC); `secret-scan` locally reports 8 findings, all inside the untracked `.output-snapshots/` (green in a clean checkout since the JWT redaction); 12 stale parity baselines (D6); 35 dangling `/plan.md` references in `BUILD.md`/`README.md`/`docs/01…17-*` that name a **different, long-gone** S1–S8 master roadmap (pre-existing, deliberately not repointed).
- **Security invariants** the brief restates and the repo enforces: the theme controls presentation, never data access, prices, stock, payment state or authorization; search stays tenant-scoped and limit-bound; account shows only the signed-in customer's rows; checkout totals are server-authoritative; preview data is synthetic and labelled.
- **Visual fidelity** is a first-class constraint: the asset work changed **no pixels**; the template work re-pointed composition, never art.

---

## 7. Where everything lives, and how to reproduce

**Shipped code**: `scripts/songoskriti-assets-manifest.mjs` · `scripts/songoskriti-assets-image.mjs` · `scripts/songoskriti-assets-expected.json` · `scripts/songoskriti-assets-check.mjs` · `scripts/gen-songoskriti-assets.mjs` · `src/lib/themes/songoskriti/preview.ts` (page template) · `src/lib/themes/songoskriti/page-content.test.ts` · `src/components/store/songoskriti-page-content.test.tsx` · `src/components/store/songoskriti-preview-page.test.tsx` · `src/components/store/PageView.page-content-nav.test.tsx` · `src/lib/theme-body-slot.ts` · `src/lib/preview-page-data.ts` · `src/hooks/use-builder-editor.route-h1.test.tsx` · `src/lib/themes/workspace-route-h1-lint.test.ts` · `supabase/migrations/20261019000000_songoskriti_asset_paths.sql`.

**Documents**: `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` · `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` · `…-brief-review.md` · `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` · `…/phase1-page-content-escalation.md` · `…/phase1-page-content-evidence.md`.

**Reproduce the live state**:

```bash
# the gate and the generator check
node scripts/songoskriti-assets-check.mjs          # GREEN — 0 findings, 11 advisory notes
node scripts/gen-songoskriti-assets.mjs --check     # GREEN — 21 planned assets match the expectation

# the live preview: the page template
curl -s "https://framique.qubickle.com/theme-preview/songoskriti?template=page" \
  | grep -oE "<h1|<article|Demo page body\.|Size guide|Demo article|How to measure" | sort | uniq -c

# the platform map
grep -n "TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts
grep -rn 'template="' src/routes/ | sort
grep -rn "blog_archive\|blog_terms\|blog_pager" src/lib/builder-ast.ts | head
```

---

## 8. The rulings I made on your behalf — challenge these

Each is a judgement I took to keep momentum, with what it costs if it was wrong.

1. **No separate worktree; work directly on `frame30`** (the repo's established flow; the rename had to land there).
2. **The vitest-side checks live in `src/lib/themes/songoskriti-assets.ts`, not inside the test file** — the spec was amended to match.
3. **The shared test file is append-only** — later tasks may add, never rewrite.
4. **One implementation of the duplicate rule** — the packaging suite calls the CLI's predicate.
5. **The gate checks floors, never aspect ratios** — the shipped `ugc-3/4` are 2:3 behind a 3:4 generation hint, so an aspect rule would ship the gate red.
6. **The repo-root path in test snippets is three levels up** — the plan's two-level version made two tasks pass vacuously.
7. **`buildPlan()` covers all 21 entries; the generation loop keeps the `generated` filter.**
8. **The scratch fixture copies instead of hard-linking** — a hard link fails with `EXDEV` when TMPDIR and the checkout are on different mounts, i.e. in CI.
9. **The seeded repair function is not executable by `anon`** — Postgres's default PUBLIC EXECUTE plus the baseline's `ALTER DEFAULT PRIVILEGES … TO anon` both had to be revoked.
10. **This plan did not write to the other plan's SDD workspace** — the escalation record lives in the port spec's §7 amendment instead.
11. **Tasks 1-3 were dispatched as one batch** (one coherent change, one review surface); Task 4 was separate.
12. **The 35 dangling `/plan.md` references were not repointed** — they name a different, long-gone master roadmap and were already broken before this work.
13. **The parity re-freeze was not auto-run** — it would mutate a store in a possibly-shared database.
14. **The branch history was rewritten once, on 2026-10-20, to correct a false co-author trailer.** Two commits carried `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` although **no Anthropic model was involved** — the work came from OpenCode subagents running `opencode/minimax-m3.1-flash-free` (the paid models were unavailable on this account), and one subagent mis-stamped its own identity into its commit message. GitHub counts co-author trailers as contributions, which is why an `@claude` account appeared in the contributors list. The rewrite re-issued the two commit messages with the accurate trailer and re-issued every descendant SHA; **the trees are byte-identical** (verified with `git diff`), all subjects and author metadata are preserved, and the SHA references in this report and the evidence documents were updated to match. Cost if wrong: the GitHub contributor list changes shape — it should now show only you and OpenCode.

---

_Prepared for expert review. Every claim above is traceable to a file:line or a command in §7; the open questions in §5 are the ones I could not decide on your behalf._
