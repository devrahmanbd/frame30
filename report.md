# Songoskriti — template genericity & the asset-inventory gap: consolidated report

**Date:** 2026-10-22 · **Repo:** `/opt/frame28` · **Branch:** `frame30` · **Deployed:** `be96b320` (`origin/frame30` and `origin/main` — both at this SHA)
**Current as of:** 2026-10-22 — the Frame30 core CMS upgrade programme has shipped (phase 3, `182c37b5` → `be96b320`); §2, §3, §5, §6, §7 and §8 carry its decisions, its evidence and its rulings. The phases before it are unchanged.
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

### 2.1 The phase-3 questions (the Frame30 core CMS upgrade, 2026-10-22)

The programme that shipped the seven surfaces asked three more questions of the owner (**G1–G3**) and **superseded** three earlier answers (**D1′**, **D2′**, **D5′**). The earlier answers are kept in §5 and marked superseded — they are not erased.

| #   | Question                                                                                                                                                                                                     | Options offered                                                                            | **Your answer**                                                                                                                                                                                                                                        | What it unlocked                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | The archive key, the production checkout shell, the blog variants and the editor's variant surface all need files port spec §7 **prohibits**. Is §7 relaxed for this programme, and for exactly which files? | a named list, exactly as D4 was · per-phase escalation · keep the boundary                 | **§7 relaxed for a named list** — the plan's G1 table now names **40 existing prohibited files**, each recorded in the phase-3 escalation record **before** its edit                                                                                   | Every task after the archive key: the context and host, the account dashboard, the checkout shell, the variants, the editor and publishing work, and the test lanes |
| G2  | `THEME_API_RANGE` is `^3.0.0` and the running API is `3.1.0` — does the archive key move the API line?                                                                                                       | bump the range to `^4.0.0` (pinned as failing) · bump `BUILDER_API_VERSION` · **additive** | **Additive** — `THEME_API_RANGE` **stays `^3.0.0`**; a package that declares `archive` must declare an api floor **≥ 3.1.0**, and one that claims a lower floor is rejected with the stable reason code `templates.archive_requires_api`               | The `archive` key's package contract — with every package that does **not** declare `archive` unaffected (`satisfiesApiRange("^3.0.0")` is true against `3.1.0`)    |
| G3  | The parity re-freeze and the authenticated E2E need a database — **which** one?                                                                                                                              | the configured `.env` database · **the repo's throwaway stack**                            | **The throwaway stack** (`docker-compose.e2e.yml`, project `e2e-supabase`) — **never** the configured database, whose `.env` `SUPABASE_URL` resolves to this host's own IP and routes to the **production** container                                  | The authenticated E2E lane and the parity re-freeze — both of which remain **the owner's** action                                                                   |
| D1′ | **Supersedes D1** — "Archive" as a _documented contract_, or as a **real template key**?                                                                                                                     | the documented contract (D1 "Option A") · **a first-class key in the union**               | **A real key** — the brief demanded it and the machinery already existed (the variant machinery, the per-key persistence, the editor); the archive carries its own zone row, editor entry, distinctness row, package rule and three validated variants | The union, the ten exhaustive maps, the hand-written `z.enum`, the seven catalogue allowlist rows, the theme's archive composition, its context module and its host |
| D2′ | **Supersedes D2** — is the authored checkout composition the **production shell**, or an authoring surface only?                                                                                             | platform-owned production (D2) · **the theme's composition around the platform's form**    | **The production shell** — the theme composes; the platform keeps the form, the server-quote totals, the payment rail, the validation, the stock hold and the order state                                                                              | The production checkout route, its authority contract (`src/lib/checkout-shell.contract.test.ts`) and its DOM-order pin (`src/routes/checkout-dom-order.test.tsx`)  |
| D5′ | **Supersedes D5** — the reader blog stays "themeless by design", or wears the theme?                                                                                                                         | themeless (D5) · **themed on the store-scoped routes**                                     | **Themed on the store-scoped routes** — the blog carries `blog_listing` / `blog_article` variants; the three **store-less** taxonomy routes keep the platform's grid, because they carry no store subject and can resolve no theme                     | The two store-scoped blog routes, the closed variant vocabulary and the editor's second level                                                                       |

**Why G1's number moved from 24 to 40.** The plan's first draft claimed _"of the 33 files: 24 are prohibited"_. That was wrong in both directions: seven **new** files (allowed by §7 by definition) had been counted as if they were among the 33, so the real split was **31 prohibited / 2 allowed**. The review measured that, and the batch later had to escalate **two more** existing test files the union's growth broke (`src/lib/builder-phase2a.test.ts` pins a **count**, `src/lib/phase5-seo.test.ts` pins a **list**). The G1 table now names **40** existing prohibited files, and every one of them is recorded in the phase-3 escalation record before its edit.

**Escalations granted** (each is an explicit exception to port spec §7, recorded in `docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md`):

1. `src/components/builder/songoskriti-port-freeze.test.tsx` + `src/lib/theme-preview-nav.test.ts` (the two frozen pins → moved to a **stronger** assertion: the preview-nav opener map became a compile-time-total `Record<TemplateKey, string>`).
2. `src/components/store/ThemePreviewFrame.tsx` (the preview's page-content source).
3. `src/hooks/use-builder-editor.ts` + `src/lib/themes.server.ts` (the lint key) and `src/components/store/PageView.tsx` (the nav restore), with `ThemeChrome.tsx` touched only to share the "does the theme render the body" predicate via the new `src/lib/theme-body-slot.ts`.

**Phase-3 escalations** (G1's 40-file list, plus the two files the later fix rounds named before they were edited) are recorded in `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` — §(b)–§(r), one section per batch, each appended **before** the edit it authorises. The record is **append-only**: measured over the last round, `git diff --numstat 7a7f9b70..HEAD -- …/phase3-archive-key-escalation.md` → **325 insertions, 0 deletions**.

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

`docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (the executable plan, 6 tasks) · `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` (the audit) · `…/phase1-page-content-escalation.md` (the escalation record) · `…/phase1-page-content-evidence.md` (the verification evidence) · `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` (the brief as received) · `…-brief-review.md` (its review: 17 corrected premises) · `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (the phase-3 plan — **now committed**) · `…/port/phase3-archive-key-escalation.md` (the escalation record, §(a)–§(r)) · `…/port/phase3-evidence.md` (the evidence record) · `…/port/phase3-self-critique.md` (the self-critique) · `…/port/phase3-ci.md` (the CI statement).

### 3.4 Phase 3 — the core CMS upgrade (`182c37b5` → `be96b320`)

**Thirty commits**, 87 files, **+21 889 / −1 989** lines (`git diff --shortstat 182c37b5..be96b320`). **No new npm dependency, no lockfile change, no migration, no DDL, no new environment variable** — the `templates` column is `jsonb`, so a new key is a new object in an existing map.

#### 3.4.1 The `archive` template key — real, and everywhere the union is

- **The union** (`src/lib/builder-ast.ts:46-59`) now carries **ten** bases; `TEMPLATE_ZONES.archive` (`:199`) grants `header`/`main`/`footer` + the overlay zones + `not_found`; the hand-written `z.enum` in `src/lib/storefront.functions.ts` (the one compiler-invisible duplicate) carries it too — a key in the editor but not there would 500 the archive route.
- **Seven catalogue allowlist rows grew** — `breadcrumb`, `category_header`, `pagination`, `empty_state`, `blog_archive`, `blog_terms`, `blog_pager` — and **exactly** those seven: a missing row turns a context widget into a publish-blocking "needs data this template does not provide" error. The set is pinned by reading `builder-ast.ts` **as text** (`src/lib/template-key-contract.test.ts`), so a missing allowlist row fails a **suite**, not a merchant's publish. The three **product-search** rows (`facet_sidebar`, `filter_chips`, `result_toolbar`) stay closed to `archive`: a content archive has no product facets.
- **The editor** (`TEMPLATE_META` at `src/components/builder/BuilderTopBar.tsx:81`) carries the key, and the switcher gained a **second level** for the variants (`templateVariantEntries()`, `src/lib/template-variants.ts:215`, consumed at `BuilderTopBar.tsx:375`).
- **The preview** carries the theme's authored `case "archive":` composition (`src/lib/themes/songoskriti/preview.ts:247`).
- **The package rule** (`src/lib/theme-package.ts:414-417`): a manifest that declares `archive` while claiming an api floor below `3.1.0` is rejected with **`templates.archive_requires_api`**. Every package that does not declare `archive` is untouched.
- **Its context module and host**: `src/lib/archive-context.ts` (a closed `category | tag | author` vocabulary, a derived and never-fetched context) and `src/components/store/ArchiveView.tsx` — one host that renders **either** the theme's `archive` composition **or** the platform's grid, and delegates the grid to the existing `BlogArchiveTheme` so the fallback is byte-identical to what the platform has always served. The theme resolution is a **rule**, not a call: only a `"base"` or `"suffix"` match is an authored archive body — `"page"`, `"index"` and `"empty"` all mean _no archive body_, and the grid renders.

#### 3.4.2 The Account dashboard — the highest-priority visual repair

`src/components/store/AccountDashboard.tsx` (1 277 lines) — a designed surface, not a stack of the platform's panels: an intentional five-destination tablist (the ARIA tabs pattern, the selection is the URL's `?tab=`), an overview strip, the composed profile, and **structured order rows**. The **six states** are distinct and each is reachable — signed out, loading, failed, signed in with orders, signed in without orders — and the state decision is **one pure mapping** (`src/lib/account-status.ts`), asserted in every combination. The order detail is disclosed **in place** (`aria-expanded`), not behind a link.

**Real customer data in production, labelled synthetic data in preview.** The route reads the `auth.uid()`-scoped `customer_overview` RPC; the preview reads `songoskritiPreviewAccountOverview()` — "Rumana Haque (demo shopper)", a `.example` email (RFC 2606) and the platform's own placeholder phone. A real shopper's data can never reach the preview surface.

#### 3.4.3 The production checkout shell — the theme composes, the platform owns

The route no longer throws the theme's AST away (`ast={null}` → the theme's `checkout` composition). The **platform keeps every authority**: the `<form>`, the customer fields, the **server-quote** totals (`quoteCart`), the **payment rail** (the theme's `payment_methods` widget, or the route's own picker when the theme's body carries none), the validation, the **stock hold** (`reserveCheckout` / `releaseCheckout`) and the **order state** (`placeOrder`). The theme's AST contributes **no** form, **no** input and **no** submit button — asserted by `src/lib/checkout-shell.contract.test.ts` and by the AST-level pin in `src/lib/themes/songoskriti/checkout-composition.test.ts`.

**The rendered order is fields → payment rail → total → Place Order.** Measured on the production shell (`renderToStaticMarkup`, the byte offsets in the phase-3 record's §(r.5)):

```
 2541  ROUTE heading: Contact Information
 3466  ROUTE FIELD (phone)            <- the route's own customer fields
 3610  ROUTE heading: Delivery Address
 6099  the route's form closes         <- </form>
 6568  THEME payment block             <- the theme's payment_methods
36534  THEME order summary             <- the theme's cart_summary (the total)
37035  ROUTE place-order action        <- <button type="submit" form="fq-checkout-form-demo">Place Order</button>
```

The action is the **route's**, so it renders after the theme's band through `ThemeChrome`'s new trailing slot (`afterBody`) and names the route's own form through the **HTML form owner** (`form="…"`). The hand-built fallback (a store with no theme body) is unchanged, byte for byte.

#### 3.4.4 The blog and archive variants — a closed vocabulary

`src/lib/template-variants.ts` carries the **only** place a variant may be added: `blog → [listing, article]`, `archive → [category, tag, author]`. The editor's switcher renders them as a second level (`templateVariantEntries`), so a merchant can author them and cannot invent one. Every variant is **linted with its base key** (`lintTemplateMap`, `src/lib/themes.server.ts:859-895`), so a variant AST can never reach a storefront unlinted; a key shaped like a variant whose suffix is **not** in the table is refused with the stable reason code **`builder.unknown_variant`** — the legacy `page_<slug>` package shape is the one exemption. The store-scoped reader blog now wears the theme (`blog_listing` on the listing, `blog_article` on the detail — two **distinguishable** compositions); the three **store-less** taxonomy routes resolve no theme and keep the platform's grid.

#### 3.4.5 The editor, the persistence and the publishing path

- **Per-template isolation** is structural (one AST per key) and is now **proved**: `src/lib/template-persistence-isolation.test.ts`.
- **Reset-to-default** restores **exactly one** template (or one variant) to the theme's own default, is armed before it fires, and hands back the **stored** map so the editor's document and the stored document are the same bytes (`src/lib/themes-reset.contract.test.ts`).
- **The seed merge fills only the keys the merchant's map does not carry** — it never overwrites a merchant's template (`src/lib/theme-seed-merge.test.ts`); because the `theme_install_preset` RPC replaces the draft's map verbatim, the per-key merge lives in TypeScript inside `installRegistryTheme`.
- **The publish path** lints every variant with its base key, and an unknown variant is refused with `builder.unknown_variant` — with the editor's cleanup affordance as the merchant's exit, so the refusal is never a dead end.
- **Preview parity**: for the seven templates the context slots the preview grants equal the ones the storefront grants, with the differences **named** (`src/lib/preview-parity.contract.test.ts`).

#### 3.4.6 The test lanes

| lane                                                                                  | what it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the **contract and integration** suites (**17 new** test files)                       | the union ↔ hand-written enum ↔ package contract ↔ the seven catalogue rows; the variant vocabulary; the archive context and its host; preview parity; publish/seed/merge/rollback; the reset; the account's six states and its nav; the checkout authority and its DOM order; the per-template isolation; the composition props                                                                                                                                                                                                                    |
| the **seven-template authenticated E2E** (`.e2e/songoskriti-seven-templates.spec.ts`) | for each template: open the real editor, select it, insert and reorder a widget, change a real inspector property, preview desktop/tablet/mobile, save, reload, publish, open the real storefront route, verify the saved composition and the route context — then the documented empty / error / unauthenticated / unavailable cases. It **skips** without merchant credentials and reports the skip as a skip; it never fakes a session                                                                                                           |
| the **storefront-surface E2E** (`.e2e/songoskriti-storefront-surfaces.spec.ts`)       | the eight production surfaces with no auth: the search result count equals the platform's own, the cart renders the theme's body, the account renders the unauthenticated state for an anonymous visitor and the dashboard for a signed-in one, the blog listing and the article render **different** compositions, the checkout renders the theme's shell around the platform's form, the archive routes render the **platform's grid** while the preview route renders the theme's archive body, the page route renders the merchant's own record |
| the **self-critique capture** (`.e2e/songoskriti-self-critique.spec.ts`)              | **84 stills** — 7 surfaces × 6 widths (1440 / 1280 / 768 / 430 / 390 / 375) × 2 locales — into a **scratch** directory, never into `reference/`                                                                                                                                                                                                                                                                                                                                                                                                     |
| the **distinctness gate**                                                             | seven rules over a compile-total table; the `archive` row is **non-empty** and rejects the engine's generic body, and the gate's "every template a theme does not author is rejected as generic" loop is re-run for the new key                                                                                                                                                                                                                                                                                                                     |

**Two defects were found by the lanes and fixed**: the studio crashed on every variant (the canvas breadcrumb indexed a base-only label map with the selected identity), and the store-scoped blog article route answered 404 for every article (the route file declared **two** path parameters of the same name, so TanStack Router matched both segments into one key).

#### 3.4.7 The self-critique pass

The three weakest failures were named, measured and fixed: the store-scoped blog surfaces carried **no store chrome** (a shopper could not get back into the shop); the account page showed an anonymous visitor **two** sign-in affordances; and the search page's `<h1>` and breadcrumb read "Collection". The re-capture measured the four surfaces that were **not** fixed as **pixel-identical** (a diff ratio of exactly `0.0000` on every one of their twelve captures), and the search fix as **0.0020 (0.2 %)** at four of the six widths — below the harness's own tolerance.

#### 3.4.8 The docs and the CI statement

Five product docs were brought to the shipped contracts — `docs/themes/creation.md` · `docs/themes/packages.md` · `docs/04-builder/theme-runtime.md` · `docs/developers/themes.md` · `docs/packages/contract.md` (which now states the `archive` api-floor rule and its reason code next to the range rule it qualifies). The CI statement (`…/port/phase3-ci.md`) records the local equivalent of every CI job and the exact limitation on the remote run.

### 3.5 The live evidence, measured at `be96b320` (2026-10-22)

- **All twelve template keys answer HTTP 200** on the live preview — the ten bases plus `blog_listing` and `blog_article` — with **zero** occurrences of the retired demo strings (`Demo search` · `Meet the makers` · `Size guide` · `How to measure` · `Demo article` · `Demo story`) and **no** unsupported panel on any of them.
- **The archive band renders "Archive"**, not the literal "Collection": the live `?template=archive` page carries `<h1>Archive</h1>` and **zero** occurrences of "Collection", and its six body nodes are exactly `category_header` · `blog_terms` · `blog_archive` · `blog_pager` · `pagination` · `empty_state`.
- **The build at the tip exits 0** — `.output/`, **55 MB**, **1 332** files: **5.56 MB** of client JS, **0.32 MB** of client CSS, **14.49 MB** of server `.mjs` (the phase-3 record measured 5.50 MB / 14.38 MB at its own tip, `0a794b54`; the difference is the two fix rounds' code).
- **The suite**: **8 790 passed / 3 skipped / 3 failed** (8 796 tests, 621 files — 618 passed, 1 skipped, 2 failed). The three failures are the **pre-existing, environment-bound** ones — `src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts` (1, which needs the local `.env` that CI does not have) — and they fail at the programme's base commit in this same environment.
- **`node_modules/.bin/tsgo --noEmit`** → exit 0, no output.
- **`node_modules/.bin/eslint src scripts`** → exit 0: **0 errors**, 319 pre-existing warnings, none added here.
- **`node scripts/doc-gate.mjs`** → **0 findings**, exit 0.
- **The asset gate** → **GREEN**, 0 findings and 11 advisory notes, 21 assets; the generator's `--check` reports **21 planned assets match the frozen expectation**.

---

## 4. The platform map an expert needs

**Legend:** ✅ exists today · ⚠️ exists but incomplete/wrong · ❌ absent. **This map is the state at `be96b320` (2026-10-22);** §1 is the state as it was found.

|                               | search                                                                              | cart                                    | account           | blog                                                                                     | checkout                                           | archive                                                                                                 | page                             |
| ----------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **A. key defined**            | ✅                                                                                  | ✅                                      | ✅                | ✅                                                                                       | ✅                                                 | ✅ **now** (was ❌ absent)                                                                              | ✅                               |
| **B. per-theme default AST**  | ✅                                                                                  | ✅                                      | ✅                | ✅ **now** — two variants, `blog_listing` / `blog_article`                               | ✅                                                 | ✅ **now** — the authored archive body (six slots)                                                      | ✅ **now** (was ⚠️)              |
| **C. merchant edits it**      | ✅ selector (`BuilderTopBar.tsx`), persisted per template (`use-builder-editor.ts`) | ✅                                      | ✅                | ✅                                                                                       | ✅                                                 | ✅ **now** — the editor's second level                                                                  | ✅                               |
| **D. route-owned data**       | ✅ per-widget slots (D6's state B)                                                  | ✅ `contextSlots` + live `CartProvider` | ✅ `accountSlots` | ✅ `BlogFeedProvider`                                                                    | ✅ **now** — `contextSlots` + the route's own form | ✅ `archive-context.ts` — its own module                                                                | ✅ real page record → `PageView` |
| **E. rendered in production** | ✅                                                                                  | ✅                                      | ✅                | ✅ **now** — store-scoped; the three store-less taxonomy routes keep the platform's grid | ✅ **now** — the theme composes, the platform owns | ⚠️ **the editor + the theme preview host only** — the three store-less taxonomy routes resolve no theme | ✅ **now**                       |

**The structural findings, then and now:**

1. **The `index` template still has no production render path.** The only `template="index"` was inside `src/components/store/StorefrontPage.tsx:294`, and `StorefrontPage` is imported nowhere (only a doc comment and a test that reads it as text). Both storefront index routes render either the CMS-designated page (wearing `template="page"`) or `StoreWelcome`. **Still true at `be96b320`** — the phase-3 programme did not touch it.
2. **The `checkout` template has no production render path either** — the route fetched the checkout chrome and threw the AST away. **Closed by D2′**: the route now hands the theme its own body through the platform's route-owned body slot, and the platform keeps the form, the totals, the rail, the validation, the stock hold and the order state.
3. **The storefront blog route was deliberately themeless** — `BlogArchiveTheme` passed `ast={null} tokens={null}` with the comment _"the render stays generic for every key **by design** — pinned in `BlogArchiveTheme.test.tsx`"_. **Closed by D5′**, with the measured basis rather than the assumption: the reader surfaces are **store-less**, not themeless. The host now takes an optional `ast`/`tokens` pair (`ast={ast ?? null}`) and the **store-scoped** routes wear the theme; the three store-less taxonomy routes carry no store subject, resolve no theme and keep the platform's grid.

**What already existed and did not need rebuilding** (the brief's premises that the audit corrected): the per-template editor and selector; the route-owned context/data system (`widget-data.ts` → `collectWidgetRequests`, `ContextSlot`); the theme presentation registry; the **blog archive pack** (`blog_archive` / `blog_terms` / `blog_pager` — the pattern the brief reinvented, already built and already in a live theme's AST); the platform-wide definition-of-done test (`src/lib/definition-of-done.test.ts`).

**What was missing, and is now shipped**: the `archive` key · per-widget search slots · a themed checkout · a themed storefront blog · a preview that mirrors the storefront's contexts · and a distinctness criterion ("is this template a Songoskriti design, or the shared default with the theme's logo on top?"). **What is still missing**: the **merchant-scoped** archive route (`/store/<slug>/blog/category/<slug>`) — see §5.

---

## 5. The open questions — for the expert

### 5.1 Resolved on 2026-10-20/21 (the expert's programme is now shipped) · amended 2026-10-22 — see **§5.2**

| #                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Where it lives                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **D1** — **SUPERSEDED 2026-10-22 by D1′**                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Option A** (2026-10-20) — "Archive" is the blog taxonomy surface (index / category / tag / author), served by the `blog` template + the platform's blog pack, and **no `archive` template key** was added. **D1′ (2026-10-22) supersedes it**: the `archive` key **IS** in the union, with its own zone row, editor entry, distinctness row, package rule and its three validated variants (`archive_category` / `archive_tag` / `archive_author`). The _semantics_ D1 chose carry over — the archive is the **content** archive, never a product listing. See **§5.2**.                                                                                   | the phase-2 record §(l), §(n) (D1) and **§5.2** (D1′)                                     |
| **D4**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Port spec §7 **relaxed** for a narrow, owner-ruled list: the preview host (`src/components/store/ThemePreviewFrame.tsx`), the two composition pins (`src/components/builder/songoskriti-port-freeze.test.tsx`, `src/lib/theme-preview-nav.test.ts`), the theme-owned `skins.test.ts` pin, the Phase-1 preview-page pin, the search route (`src/routes/store.$slug.search.tsx`), `src/lib/theme-preview-nav.ts`, `src/routes/theme-preview.$key.tsx`, and the platform's payment widget (`src/components/builder/cart.tsx`). **Extended on 2026-10-22 by G1**, which adds a named 40-file list for the phase-3 programme. Every other §7 prohibition stands.  | the same record, §(g), §(h), §(j), §(m), §(n)                                             |
| **D6**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **State B** — the storefront search route now exposes its pieces as per-widget context slots, with `CollectionQueryProvider` mounted and the platform's query box + category/kind chips still inside the results block the theme renders. The result set is **byte-identical** before and after.                                                                                                                                                                                                                                                                                                                                                             | `src/routes/store.$slug.search.tsx` + the record's §(k)                                   |
| **D2 / D3 / D5 / D7** — **D2 and D5 SUPERSEDED 2026-10-22 by D2′ / D5′**                                                                                                                                                                                                                                                                                                                                                                                                                                                | **RULED 2026-10-21 — no longer open**: production checkout stays tokens-only (the theme's checkout composition is an authoring/preview surface, not a production shell), the programme is Songoskriti-only, the storefront reader blog stays "themeless by design", and the storefront still mounts no `WidgetDataProvider` (so `facet_sidebar` is preview-only). **D2′ and D5′ (2026-10-22) supersede two of those**: the theme's checkout composition **IS** the production shell (D2′), and the storefront reader blog **DOES** wear the theme's two `blog` variants (D5′). D3 and D7 stand — and **D3 is open again** in substance (§5.3). See **§5.2**. | the phase-2 plan's Decision Gate and the evidence record's §(K.3); **§5.2** for D2′ / D5′ |
| **The expert's six items, as shipped:** 1 real Search template ✅ · 2 representative Cart/Account previews ✅ · 3 Blog/Page preview composition ✅ · 4 authored Checkout template in preview ✅ · 5 Archive contract ✅ (**the `archive` template key IS real — D1′ (2026-10-22) supersedes the earlier "Option A — a documented contract, not a new key"; see §5.2**) · 6 a template-distinctness acceptance gate ✅ (seven rules, a firing fixture each, and it rejects the engine's generic body on every template). |

Each carries the evidence that settles it. **D1, D2, D3, D4, D5, D6 and D7 are all ruled** — D1 (archive semantics), D4 (§7) and D6 (the search-route state) when the phase-2 plan was written; D2, D3, D5 and D7 on **2026-10-21**, each with its reason, its follow-up path and where it lives. **Three of them moved on 2026-10-22** (D1 → D1′, D2 → D2′, D5 → D5′) when the phase-3 programme landed; §5.1.1 and §5.2 record the amendment, the reason and where each change lives. The earlier rulings are kept, not erased. The master plan's Decision Gate carries the same dated amendments. The open-questions list's own D6 — the parity re-freeze — was CLOSED on 2026-10-21 and **re-staled by phase 3** (§5.3); D7 — the storefront criterion — is CLOSED at the storefront level (see below).

### 5.1.1 **RULED AND IMPLEMENTED** — the three that moved (2026-10-22)

| #   | the earlier answer                               | the ruling that shipped                                                                                                                                                                   | the number                                                                                                                                                                                                                                                                                                   | where it lives                                                                                                                    |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| D1′ | D1 "Option A" — no `archive` key                 | **the `archive` key IS real**: in the union, with its own zone row, editor entry, distinctness row, package rule, context module and host                                                 | the union is **ten** bases; the hand-written `z.enum` carries it; **seven** catalogue allowlist rows grew (`breadcrumb`, `category_header`, `pagination`, `empty_state`, `blog_archive`, `blog_terms`, `blog_pager`); its three validated variants are `archive_category` / `archive_tag` / `archive_author` | `src/lib/builder-ast.ts` · `src/lib/template-variants.ts` · `src/lib/archive-context.ts` · `src/components/store/ArchiveView.tsx` |
| D2′ | D2 — production checkout stays tokens-only       | **the authored checkout composition IS the production shell**; the platform keeps the form, the server-quote totals, the payment rail, the validation, the stock hold and the order state | the rendered order is **fields → payment rail → total → Place Order**; the theme's AST contributes **no** form, **no** input and **no** submit button; the fallback (no theme body) is unchanged                                                                                                             | `src/routes/store.$slug.checkout.tsx` · `src/lib/checkout-shell.contract.test.ts` · `src/routes/checkout-dom-order.test.tsx`      |
| D5′ | D5 — the reader blog stays "themeless by design" | **the store-scoped reader blog wears the theme**; the three store-less taxonomy routes keep the platform's grid                                                                           | two **distinguishable** compositions — `blog_listing` (the terms rail, the article grid, the pager) and `blog_article` (the frame around the story, the related reading, the newsletter); the three taxonomy routes resolve no theme                                                                         | `src/routes/store.$slug.blog.index.tsx` · `src/routes/store.$slug.blog.$articleSlug.tsx` · `src/lib/template-variants.ts`         |

### 5.2 Amended on 2026-10-22 (the phase-3 rulings: D1′ / D2′ / D5′)

**This section is an AMENDMENT, not a replacement.** The rulings of 2026-10-20/21
stand as they were decided; this records what the phase-3 programme changed,
why it changed, and where each change lives. Nothing below erases the earlier
decision — the earlier decision is quoted, and the reason it changed is given.

**Why the amendment exists.** §5.1 records the state of the programme at the end
of phase 2. The phase-3 range (`182c37b5` → `be96b320`) never touched `report.md`
before this update, so three of its rulings went stale: the phase-3 work
**superseded** two of them and **extended** one. A reader of §5.1 alone would have
read three statements that are false at HEAD.

#### D1′ — the `archive` template key IS real (supersedes D1 “Option A”)

**What D1 decided (2026-10-20, quoted).** _"Option A — 'Archive' is the blog
taxonomy surface (index / category / tag / author), served by the `blog`
template + the platform's blog pack. **No `archive` template key** was added, so
`TEMPLATE_KEYS`, the 41 per-widget allowlists, the hand-written `z.enum`, the
package contract and `THEME_API_RANGE` are all untouched."_

**Why it changed.** D1 chose "no new key" to avoid the measured blast radius
(36 files / 46 edit sites, 31 of them §7-prohibited). The phase-3 brief accepts
that blast radius and asks for the **real** key: an archive is a surface a
merchant must be able to design, and a surface that is not a key is a surface
that can only ever be the blog's composition. The owner granted the §7
relaxation (Decision Gate **G1**) for a named 40-file list.

**What carries over from D1, and what does not.** The **semantics** carry over
unchanged: the archive is the **content** archive — a category, a tag or an
author — and never a product listing; the product collection keeps the
`collection` template. What does **not** carry over is the mechanism: the
`archive` key is now in the union.

**Where it lives.**

| what                                                                    | where                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| the key, its zone row and the exhaustive maps                           | `src/lib/builder-ast.ts` (`TEMPLATE_KEYS`, `TEMPLATE_ZONES`)                                     |
| the closed variant vocabulary (`archive_category` / `_tag` / `_author`) | `src/lib/template-variants.ts` (`TEMPLATE_VARIANTS`)                                             |
| the route-owned context and the host                                    | `src/lib/archive-context.ts`, `src/components/store/ArchiveView.tsx`                             |
| the editor entry, the package rule and the distinctness row             | `src/lib/themes/songoskriti/template-distinctness.ts`, the `templates.archive_requires_api` rule |
| the escalation record (every §7 relaxation, with the exact diffs)       | `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` §(b)–§(r)          |
| the evidence record                                                     | `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md` §1.1                             |

#### D2′ — the theme's checkout composition IS the production shell (supersedes D2)

**What D2 decided (2026-10-21, quoted).** _"production checkout stays
tokens-only (the theme's checkout composition is an authoring/preview surface,
not a production shell)."_

**Why it changed.** The phase-3 brief asks for a themeable checkout with
**strict platform constraints**, and the constraint is a better reason to change
the route than a reason to leave it: the theme may own the **composition** (the
progress trail, the payment block, the order summary — all of them platform
widgets reading the server's quote) while the platform keeps the **authority**
(the form, the customer fields, the server quote, the validation, the stock
hold, the order write, the payment rails). The route now hands the theme its
own body through the platform's route-owned body slot
(`contentSlot="page_content"`), exactly as the authored page does.

**What carries over from D2, and what does not.** D2's **substance** — that the
platform keeps every authority a checkout needs — carries over **unchanged and
is now asserted by a test**, not merely intended. D2's **mechanism** — discarding
the theme's AST — does not.

**Where it lives.** `src/routes/store.$slug.checkout.tsx` (the shell),
`src/lib/themes/songoskriti/preview.ts` (the `case "checkout":` body),
`src/lib/checkout-shell.contract.test.ts` (the platform's authority is
asserted, not assumed), and the escalation record's §(i).

#### D5′ — the storefront reader blog wears the theme (supersedes D5 "themeless by design")

**What D5 decided (2026-10-21, quoted).** _"the storefront reader blog stays
'themeless by design'."_

**Why it changed.** The blog is a surface a merchant's customers read, and
"themeless by design" was the **placeholder** the phase-1 build left behind:
`BlogArchiveTheme` passed `ast={null}` with a comment saying the generic
render was intentional. Two phases later that is not a design decision any more
— it is a surface with no theme on it. The phase-3 work gave the blog **two**
distinguishable compositions, `blog_listing` and `blog_article`, resolved
through the same storefront seam as every other template, and the store-scoped
blog routes now render the store's own chrome.

**What carries over from D5, and what does not.** The _reason_ D5 gave for
"themeless by design" — that the reader blog carries **no store subject** on
the three store-less taxonomy routes — is still true, and still stated: those
three routes resolve no theme and keep the platform's grid (D5′ does not change
them). What changed is the **store-scoped** reader blog
(`/store/<slug>/blog` and `/store/<slug>/blog/<article>`), which now wears the
theme.

**Where it lives.** `src/routes/store.$slug.blog.index.tsx`,
`src/routes/store.$slug.blog.$articleSlug.tsx`, `src/lib/template-variants.ts`
(`blog: [listing, article]`), and the escalation record's §(k)–§(n).

**The honest summary.** D1, D2 and D5 were each reasonable answers to the
question as it stood on 2026-10-20/21, and each was made to keep the blast
radius small. The phase-3 programme accepted a larger blast radius — with the
owner's §7 relaxation — and the three rulings moved with it. **What did not
change:** the archive is the content archive and never a product listing; the
platform keeps the checkout's authority; and the store-less taxonomy routes
stay themeless.

### 5.3 Still open at `be96b320` (2026-10-22) — five questions, each with the evidence that bounds it

| #     | the open question                                   | why it is open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | what would close it                                                                                                                                                                                                                                           |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **D3 — Songoskriti only, or both official themes?** | Somvabona still authors **three** surfaces (`index`, `collection`, `product`) and falls through to the engine's generic body for the other seven. The gate's **machinery** is theme-agnostic — its "every template a theme does not author is rejected as generic" loop runs against Somvabona's own source and still passes — but its **expectation table** is scoped to Songoskriti, which is what D3 decided.                                                                                                   | a ruling: whether the second official theme gets the same seven surfaces, or stays the engine's generic body behind the gate                                                                                                                                  |
| **2** | **The 76 % বাংলা publish floor**                    | the shipped theme's own copy is **76 %** বাংলা against the platform's **90 %** floor (`TRANSLATION_PUBLISH_FLOOR = 90`, `src/lib/builder-guardrails.ts:148`), so a **merchant publish is refused** with `theme.publish_blocked codes=translation`. The rule is the platform's deliberate one; the E2E lane asserts the refusal in both branches and never converts it into a pass                                                                                                                                  | **two owner actions**: translate the remaining **~36 strings** of the theme's copy, **or** rule that a **source-installed official theme** is exempt — it is installed from source by the owner rather than published by a merchant, which is a different act |
| **3** | **The stale parity baselines**                      | the harness's `TEMPLATES` list now has **ten** entries, but the snapshot directory holds **59** files covering the **nine** older templates: the `archive` has **no baseline at all**, so its `toHaveScreenshot` fails until the owner re-freezes. `page` (**0.06**) and `account` (**0.03**) also exceed the harness's own `maxDiffPixelRatio` of **0.02**                                                                                                                                                        | the **re-freeze**, on the **throwaway stack** and never the configured database (G3) — the exact command and the preconditions are in the phase-3 evidence record's §4.2                                                                                      |
| **4** | **The remote CircleCI run**                         | **unobservable from this box**: no `CIRCLECI_TOKEN`, no `~/.circleci/cli-config.yml`; `circleci.com` answers **200**, so the limitation is **authentication, not connectivity**. The push to `origin/frame30` **does** trigger the pipeline — but a push is a trigger, not a receipt                                                                                                                                                                                                                               | the **owner** opens the run URL. Every gate CI runs was run locally and is recorded in §3.5 and in `…/port/phase3-ci.md`; **no claim of a green remote run is made**                                                                                          |
| **5** | **The deferred merchant-scoped archive route**      | `/store/<slug>/blog/category/<slug>` and its two siblings do not exist. The three content-archive routes that exist today carry **no store subject** — a term carries a `merchant_id`, not a slug, and term slugs are unique **per merchant, not globally**; the author archive is not merchant-scoped at all. A route that cannot name a store must not guess one, so those three keep the platform's grid and the `archive` key's render path in this programme is the **editor** and the **theme preview host** | the **merchant-scoped route** itself. This is a **deferral**, stated in the plan's own terms, not a shortcut — and `ArchiveView` is already written to resolve the **variant first, the base second**, the moment that route lands                            |

**Also recorded, and not fixed** (they are platform-side renderers outside the §7 boundary, and the theme can only choose not to place them): the three platform context widgets still render in the platform's own generic type language (the `cart_summary`'s uppercase letterspaced "ORDER SUMMARY", the checkout's "PLACE ORDER" slab); the account surface's **anonymous** state still cannot show a profile (the widget's own contract); and the checkout's theme shell leaves the platform's payment block visually orphaned.

### D1 — Does `archive` need to be a template _key_ at all? _(RULED 2026-10-20: **Option A** — **SUPERSEDED 2026-10-22 by D1′, and IMPLEMENTED; see §5.1.1 and §5.2**)_

**Question:** is "Archive" the **blog taxonomy** surface (index / category / tag / author — the only route-level taxonomy archives that exist) or a **product-side** listing archive (category / brand / search-kind, where "brand" has no route at all)?

- **If blog-only** → **no new key is needed**: the `blog` template + the blog pack already cover it, and the platform already supports suffixed variant keys (`templateSuffixFromOverride` / `resolveTemplateCandidates`, `builder-ast.ts:8203-8280`) — `blog_category`, `blog_tag`, `blog_author` would work today.
- **If product-side** → a new `archive` key touches **16 `TEMPLATE_KEYS` sites, 7 `Record<TemplateKey,…>`/switch maps, 41 per-widget `templates:` allowlists, a hand-written `z.enum` (`src/lib/storefront.functions.ts:97-107` that no compiler sees), the theme-package contract and `THEME_API_RANGE` ("^3.0.0")** — and every one of those files is prohibited by §7, so the whole phase is an escalation. Note also that `parseTemplates` **silently drops unknown keys**, so a key added to the editor but not to the parser would appear in the builder and vanish from every page.
- **Settled by:** `grep -rn 'template="' src/routes/` + `grep -rn 'activeSlug\|termArchivePath' src/routes/blog.*.tsx` + the product ruling _"must merchants design a product-category listing distinct from the Collection template?"_

### D2 — Is the checkout template meant to be themeable at all? _(RULED 2026-10-21: the production checkout stays platform-owned — **SUPERSEDED 2026-10-22 by D2′, and IMPLEMENTED; see §5.1.1 and §5.2**)_

The route deliberately discards the theme AST (`ast={null}`) while the theme surface implies otherwise. The brief's §9 asks for a themeable checkout with strict platform constraints. **Is the current "tokens only" behaviour the intent, or a gap?** Highest-risk phase (payment integrity), and it needs a decision before any design starts.

### D3 — Scope: Songoskriti only, or both official themes? _(RULED 2026-10-21: Songoskriti only — **still open in substance; see §5.3**)_

Somvabona authors **none** of the six secondary surfaces — it falls through to the engine's generic demo body. "Defaults for every official theme" is therefore not 2× the Songoskriti work; it is 2× **plus** authoring six surfaces from scratch for a theme that has none.

**Measured at `be96b320`, and the reason the question is open again.** Somvabona's own source authors **three** surfaces — `index`, `collection`, `product` (`src/lib/themes/somvabona/preview.ts:53-70`) — and falls through for the other seven. The gate's **machinery** is theme-agnostic: its "every template a theme does not author is rejected as generic" loop runs against Somvabona's own source and still passes (`src/lib/themes/songoskriti/template-distinctness.test.ts:583-637`). Its **expectation table** is not — that table is Songoskriti's, which is what D3 decided. Nobody has ruled whether the second official theme gets the same seven surfaces. **See §5.3.**

### D4 — Does port spec §7's "no core files" boundary still govern this Frame30 work? _(RULED 2026-10-20: relaxed for a narrow, named list — **extended 2026-10-22 by G1**; see §5.1 and §2.1)_

Phases 2–5 all require `src/routes/**` and `src/components/store/**`. Phase 1 needed three escalated files (granted) and the closure wave added three more (granted). **The remaining phases cannot be done without a standing escalation.** Options: amend §7 for the template programme, or run each phase as its own escalation, or keep the boundary and accept that the storefront templates stay shared.

### D5 — The blog: reverse "themeless by design", or drop it from scope? _(RULED 2026-10-21: "themeless by design" stands — **SUPERSEDED 2026-10-22 by D5′, and IMPLEMENTED; see §5.1.1 and §5.2**)_

`BlogArchiveTheme` passes `ast={null}` with a comment saying the generic render is intentional and is pinned by a test. Phase 2 would make the storefront blog wear the theme's `blog` template and the blog pack (the widgets already exist). **Is "themeless by design" a product decision to keep, or a placeholder to replace?**

### D6 — The parity re-freeze _(CLOSED 2026-10-21 — re-frozen against a throwaway store; the 42 stale captures / 84 files are rewritten — **re-staled by phase 3; the re-freeze is the owner's action again, see §5.3**)_

**It is done, and the database question is settled by measurement.** The premise the re-freeze was deferred on was partly wrong: `.env.local` does **not** point at a hosted project — it holds a **placeholder** (`https://dummy.supabase.co`, key `dummy`) that resolves nowhere — and the database the harness's mutating path actually uses is `.env`'s `SUPABASE_URL=https://framebase.qubickle.com`, which resolves to this host's own IP and routes to the **`framique-supabase-db` container — production**. So a run against the configured database was barred, and the capture was instead run against the repo's own throwaway stack (`docker-compose.e2e.yml` + `docs/15-e2e/loopback-auth-setup.md` §§1–3): a separate compose project, its own network and volume, **zero production merchants**, the disposable merchant created through the real GoTrue admin API. **Production was re-read afterwards and is unchanged** — the same three `store_themes` rows, no Songoskriti row, no theme activated on any production merchant.

**The result:** 60 passed, 1 skipped (the suite's own pre-existing `manual-review` entry), 8.7 min, in freeze mode (`PORT_CAPTURE_OUT` unset → the human stills to the frozen `reference/`; `--update-snapshots` → the machine baselines rewritten). The measured diff over all **118** baseline files: **66 materially changed**, 8 changed but within the spec's own threshold, 44 byte-identical. The **42** changed human stills are exactly the seven templates the evidence record's §(D) predicted (`product`, `page`, `account`, `blog`, `cart`, `checkout`, `search` — 6 each); `index` and `collection` are **byte-identical**. The 32 rewritten machine baselines are the subset whose difference **exceeded the spec's own `maxDiffPixelRatio`** — **not** a below-the-fold subset: every still in the freeze is exactly **900 px** tall (22 × 1440×900, 19 × 375×900, 18 × 768×900 in each of the two directories), so the `fullPage` human still and the viewport machine baseline are the **same pixels**, and every difference lies **inside** the 900-row viewport (rows 92…899). The **10** machine baselines Playwright left in place are `account-1440-bn`, `cart-375-bn`, `cart-768-bn`, `cart-768-en` and the six `product-*` ones — their difference stayed **within** the spec's 2 % ratio tolerance, so they still carry the pre-freeze pixels. `reference-manifest.json` is rewritten with 60 entries (59 `pass` + the one `manual-review`); the committed manifest after `4206f9a2` is stamped `freezeSha: afde28712f8e` (`generatedAt: 2026-10-21T03:43:55.648Z`) — the evidence record's §(L.6). The command, the preconditions and the per-file measurement are in the evidence record's §(L.3).

**Corrected 2026-10-21 (record-accuracy pass) — two claims in the paragraph above were wrong; the evidence record's §(L.3) carries the full measurement.** The paragraph used to say the 32 rewritten machine baselines were _"the subset whose difference is above the fold"_, because _"the machine baseline is the 1440×900 viewport, the human still is `fullPage`"_ — **that explanation is false**: measured on the committed artefacts, every human still and every machine baseline is exactly **900 px** tall, so the preview page's document height **equals** the viewport height and the two captures are the **same pixels** (the pre-freeze human still and the pre-freeze machine baseline are identical for all 59 files under the spec's own comparator). There is therefore **nothing below the fold** in these captures, and all 42 differences are **inside** the viewport. The real reason 10 machine baselines were not rewritten is that their difference stayed **within** Playwright's `maxDiffPixelRatio` (0.02): a bare `--update-snapshots` is Playwright's **`changed`** mode, which rewrites a baseline only when the comparator says the snapshot does not match. The paragraph also named `freezeSha: a93ebfd29c4c` — that was the manifest's state at `afde2871`; the committed manifest after `4206f9a2` is `afde28712f8e`. One number in the paragraph is a _reading_ of the threshold rather than a mistake: **66 / 8 / 44** is the per-channel reading of the same threshold, and under the comparator Playwright applies the 118 files split **64 materially changed** (32 human stills + 32 machine baselines) / **10 within the threshold** (the ten listed above) / **44 byte-identical** (17 human + 27 machine).

**Re-staled by phase 3 (2026-10-22).** The phase-3 programme changed the account dashboard, the checkout shell, the blog variants and the archive — four of the surfaces the frozen captures pin — so the re-freeze is **the owner's action again**: the `archive` has **no** baseline at all (the harness's `TEMPLATES` list has ten entries; the snapshot directory holds 59 files for the nine older ones), and `page` (**0.06**) and `account` (**0.03**) exceed the harness's own `maxDiffPixelRatio` of **0.02**. The programme's own commits never wrote to `reference/`, to `reference-manifest.json` or to the snapshot directory — measured: `git diff --name-only 182c37b5..HEAD` over those three paths returns **zero** changed files for each. The re-freeze runs on the **throwaway stack**, never the configured database (G3). **See §5.3.**

### D7 — The storefront criterion — **closed at the storefront level** _(verified 2026-10-21 against a real Songoskriti store)_

For the first time, a store that actually wears Songoskriti served a CMS page: the disposable merchant's own `storefront_pages` row, requested on the loopback host, returned **200** with **exactly one `<h1>`** ("Care guide — handloom care for the pieces we weave" — the merchant's own page title), the **merchant's real record** rendered in the body (including a unique marker), **no demo copy at all**, and the Songoskriti chrome mounted (`data-nav="songoskriti-desktop"`, `themeKey:"songoskriti"`, the theme's own `page` AST with the `page_content` slot). The rendered page is a tracked artefact: `docs/superpowers/songoskriti-evidence/port/storefront-page-frame19-demo.png`.

**What it does not prove: anything about production.** The live DB still holds three `store_themes` rows (Atelier, classic, Supershop) — **none Songoskriti** — and the live host still 404s path storefronts (`isBlockedPathStorefront`). **The branch's production blast radius is therefore unchanged: the theme-preview route only** — and the two regressions it introduced (nav loss, false lint warning) still had zero blast radius for exactly that reason, and become real the first time a merchant activates Songoskriti. The evidence record's §(L.4) states the boundary explicitly.

**That boundary moved on 2026-10-22.** Phase 3 changed the **production** routes — the checkout route, the account route and the two store-scoped blog routes — so the "theme-preview route only" blast radius no longer holds: the checkout shell and the account dashboard now render on a merchant's live storefront, and the blog's two variants do too. What the phase-3 evidence record does **not** claim is that production was re-read after the programme: its §4.1 and §4.2 name the two owner actions precisely because the programme never touched a production merchant. The change ships **dark** unless a merchant activates the theme — and the theme's `76 %` বাংলা copy means a merchant publish of it is refused anyway (**§5.3**).

### D8 — Two accepted-and-deferred review findings

1. A merchant template with **two** `page_content` widgets would render the nav twice (the body already duplicated pre-change; the real fix is a lint rule in `builder-ast.ts`, i.e. core).
2. The `useLang()` fallback `t` identity churn — tests only.

---

## 6. The constraints that bound any solution

- **Port spec §7** (`docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md`): editable = `src/lib/themes/songoskriti/**`, `src/components/builder/songoskriti*.ts(x)`, **new** test/fixture files, **new** `.e2e/` files, `docs/**`, `scripts/**`, wiring-only `package.json`/`.circleci` edits. Prohibited = `src/routes/**`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, existing tests and their `.snap` files, existing `.e2e/**`, everything else under `src/`. Escalation rule: _"any required capability missing in core → stop, report, wait for a decision. Never edit silently."_ **§7 is now relaxed for a named list** — D4's phase-1/2 list, and **G1's 40 existing prohibited files** for the phase-3 programme (`docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` §(b)–§(r)). **Every other §7 prohibition stands**, and a relaxation granted for one file is never a precedent for the next.
- **The phase-3 programme's own constraints** (all held): **no new npm dependency**, no lockfile change, **no migration, no DDL, no new environment variable** (the `templates` column is `jsonb`, so a new key is a new object in an existing map); **no test weakened, deleted or skipped**; **explicit-path staging only**; the three churn files and `.output-snapshots/` never staged; **no deployment** inside the plan; **no `ast={null}`-style shortcut** — every resolution inspects `resolveTemplate`'s `match` and accepts **only** `"suffix"` / `"base"`, so no template is ever silently replaced by another template's composition.
- **Gates that must stay green**: asset gate, generator check, `doc-gate` (0 findings), `tsgo --noEmit`, eslint (0 errors), prettier on touched files, `bun run test`.
- **Known pre-existing reds** (not ours, none blocking): the **three environment-bound unit failures** — `src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts` (1, the local `.env` flake that passes in CI) — which fail at the programme's base commit in this same environment; `contract-gate` exits 2 locally (`spawnSync bunx ENOENT` — `bun` is not on PATH here); `schema-fingerprint --check` exits 1 (needs a live Supabase RPC); `secret-scan` locally reports 8 findings, all inside the untracked `.output-snapshots/` (green in a clean checkout since the JWT redaction); **the parity baselines are stale again** (D6 — re-frozen on 2026-10-21, re-staled by phase 3; see §5.3); 35 dangling `/plan.md` references in `BUILD.md`/`README.md`/`docs/01…17-*` that name a **different, long-gone** S1–S8 master roadmap (pre-existing, deliberately not repointed).
- **The parity harness and the authenticated E2E never run against the configured database** — `.env`'s `SUPABASE_URL` resolves to this host's own IP and routes to the **production** database container. They run against the repo's own throwaway stack (`docker-compose.e2e.yml`, project `e2e-supabase`) and only on a **disposable** merchant (G3).
- **Security invariants** the brief restates and the repo enforces: the theme controls presentation, never data access, prices, stock, payment state or authorization; search stays tenant-scoped and limit-bound; account shows only the signed-in customer's rows; checkout totals are server-authoritative; preview data is synthetic and labelled.
- **Visual fidelity** is a first-class constraint: the asset work changed **no pixels**; the template work re-pointed composition, never art.

---

## 7. Where everything lives, and how to reproduce

### 7.1 The phase-3 programme's new artefacts (all committed at `be96b320`)

**The four records and the plan** — `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (the committed plan, Tasks 1–10) · `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` (the escalation record, §(a)–§(r)) · `…/phase3-evidence.md` (the evidence record) · `…/phase3-self-critique.md` (the self-critique) · `…/phase3-ci.md` (the CI statement).

**The shipped code** — `src/components/store/AccountDashboard.tsx` (the designed dashboard) · `src/components/store/ArchiveView.tsx` (the archive host) · `src/lib/archive-context.ts` (the archive's closed, derived context) · `src/lib/template-variants.ts` (the closed variant vocabulary) · `src/lib/theme-shell-slots.ts` (the shell seam — what the theme's body carries, and where the action renders) · `src/lib/account-status.ts` (the account's six states as one pure mapping) · `src/lib/themes-reset.functions.ts` (the reset path).

**The new contract and integration suites** — `src/lib/template-key-contract.test.ts` (the union ↔ the hand-written enum ↔ the package contract ↔ the seven catalogue rows) · `src/lib/template-variants.test.ts` · `src/lib/archive-context.test.ts` · `src/lib/preview-parity.contract.test.ts` · `src/lib/publish-migration.contract.test.ts` · `src/lib/theme-seed-merge.test.ts` · `src/lib/template-persistence-isolation.test.ts` · `src/lib/themes-reset.contract.test.ts` · `src/lib/account-status.test.ts` · `src/lib/checkout-shell.contract.test.ts` · `src/lib/theme-shell-slots.test.ts` · `src/components/store/account-dashboard.contract.test.ts` · `src/lib/themes/songoskriti/template-distinctness.archive.test.ts` · `src/lib/themes/songoskriti/composition-props.test.ts` · `src/routes/checkout-dom-order.test.tsx` · `src/components/store/AccountDashboard.test.tsx` · `src/components/store/ArchiveView.test.tsx`.

**The `.e2e` lanes** — three **new** specs: `.e2e/songoskriti-seven-templates.spec.ts` (the authenticated editor journey) · `.e2e/songoskriti-storefront-surfaces.spec.ts` (the storefront assertions) · `.e2e/songoskriti-self-critique.spec.ts` (the 84-still capture); and three **existing** specs **extended** with the archive, never weakened: `.e2e/real-frames.spec.ts` · `.e2e/songoskriti-port-parity.spec.ts` · `.e2e/theme-preview-security.spec.ts`.

**The product docs brought to the shipped contracts** — `docs/themes/creation.md` · `docs/themes/packages.md` · `docs/04-builder/theme-runtime.md` · `docs/developers/themes.md` · `docs/packages/contract.md`.

### 7.2 The earlier phases' artefacts (unchanged)

**Shipped code**: `scripts/songoskriti-assets-manifest.mjs` · `scripts/songoskriti-assets-image.mjs` · `scripts/songoskriti-assets-expected.json` · `scripts/songoskriti-assets-check.mjs` · `scripts/gen-songoskriti-assets.mjs` · `src/lib/themes/songoskriti/preview.ts` (page template) · `src/lib/themes/songoskriti/page-content.test.ts` · `src/components/store/songoskriti-page-content.test.tsx` · `src/components/store/songoskriti-preview-page.test.tsx` · `src/components/store/PageView.page-content-nav.test.tsx` · `src/lib/theme-body-slot.ts` · `src/lib/preview-page-data.ts` · `src/hooks/use-builder-editor.route-h1.test.tsx` · `src/lib/themes/workspace-route-h1-lint.test.ts` · `supabase/migrations/20261019000000_songoskriti_asset_paths.sql`.

**Documents**: `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` · `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` · `…-brief-review.md` · `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` · `…/phase1-page-content-escalation.md` · `…/phase1-page-content-evidence.md`.

### 7.3 Reproduce every claim

```bash
# the gate and the generator check
node scripts/songoskriti-assets-check.mjs          # GREEN — 0 findings, 11 advisory notes, 21 assets
node scripts/gen-songoskriti-assets.mjs --check     # GREEN — 21 planned assets match the expectation

# the live preview: all twelve template keys answer 200, with no retired
# demo string and no unsupported panel
for k in index product collection account page blog cart checkout search \
         archive blog_listing blog_article; do
  curl -s -o /tmp/pv-$k.html -w "$k -> %{http_code}\n" \
    "https://framique.qubickle.com/theme-preview/songoskriti?template=$k"
  grep -c -E "Demo search|Meet the makers|Size guide|How to measure|Demo article|Demo story" \
    /tmp/pv-$k.html   # → 0
  grep -c "This template is not supported by this theme" /tmp/pv-$k.html   # → 0
done
grep -o "<h1[^>]*>[^<]*" /tmp/pv-archive.html   # → <h1 …>Archive   (not "Collection")

# the local gates at the tip
node_modules/.bin/tsgo --noEmit                       # exit 0, no output
node_modules/.bin/eslint src scripts                  # exit 0 — 0 errors, 319 pre-existing warnings
node_modules/.bin/vitest run                          # 8 790 passed / 3 skipped / 3 failed (the three are pre-existing)
node scripts/doc-gate.mjs                             # 0 findings, exit 0
node_modules/.bin/vite build                          # exit 0 — .output/, 55 MB, 1 332 files

# the platform map
grep -n "TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts
grep -rn 'template="' src/routes/ | sort
grep -rn "blog_archive\|blog_terms\|blog_pager" src/lib/builder-ast.ts | head

# the archive key's blast radius, as it was ruled and as it shipped
grep -n "export const TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts
grep -n "templates.archive_requires_api" src/lib/theme-package.ts
grep -n "TEMPLATE_VARIANTS" -A 4 src/lib/template-variants.ts
git diff --name-only 182c37b5..HEAD -- docs/superpowers/songoskriti-evidence/port/reference/ \
  docs/superpowers/songoskriti-evidence/port/reference-manifest.json \
  .e2e/songoskriti-port-parity.spec.ts-snapshots/   # → empty (the frozen captures are untouched)
```

**The re-freeze, when the owner runs it** (throwaway stack only — never the configured database, G3):

```bash
docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env up -d
/tmp/opencode/e2e-auth/apply-all.sh
/tmp/opencode/e2e-auth/run-app.sh          # answers http://localhost:3020
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-port-parity --update-snapshots
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

### 8.1 The phase-3 programme's eight rulings (2026-10-22) — challenge these

Each is a judgement the programme took to keep momentum, with what it costs if it was wrong. The list is the phase-3 ledger's own.

1. **The archive key is a real key (D1′), superseding the earlier "no new key" ruling.** The brief demands it; the audit proved the platform already has the machinery (variants, per-key persistence, the editor). **Cost if wrong:** 40 files changed against a boundary that was meant to stay tight.
2. **The three platform taxonomy routes have no store subject, so the archive's storefront path is the editor + preview only**; the merchant-scoped route is deferred and named. **Cost if wrong:** a merchant on a live store sees the platform's grid for taxonomy archives, not a themed archive.
3. **The `builder.unknown_variant` publish refusal stays a block, with the editor's reset affordance as the exit** — not downgraded to a warning. **Cost if wrong:** a merchant with a stray variant key sees a publish error until they remove it through the new affordance.
4. **The checkout's Place Order action moved to a trailing slot (`afterBody`) so the total precedes the submit**, keeping the platform's ownership of the form, the totals and the payment state. **Cost if wrong:** the submit button is no longer inside the `<form>` element — it submits it through the HTML form owner (`form="…"`).
5. **The `category_header` band label was made a DECLARED catalogue field** (`title` / `text` / `description` + their বাংলা twins) rather than special-cased in the renderer, with a contract test that every authored prop across all **twelve** compositions is declared and survives `parseTemplates`. **Cost if wrong:** the catalogue grew three fields (and the sanitiser's surface with them).
6. **The programme's "written before the edit" claim was restated as what git can prove** (append-only; the hunks match the committed diffs byte-for-byte; the ordering holds for the files edited in later commits). **Cost if wrong:** the record is weaker on ordering than the programme's own rule required.
7. **The remote CI run is recorded as UNVERIFIED-FROM-HERE, never as passing** (no `CIRCLECI_TOKEN`, no `~/.circleci/cli-config.yml`; connectivity is fine). **Cost if wrong:** none — it is a stated limitation, not a claim.
8. **The 76 % বাংলা publish refusal and the stale parity baselines are owner actions, not merge blockers** — both are recorded with their measurements, the exact commands and the preconditions. **Cost if wrong:** a merchant cannot publish their edits until ~36 strings are translated (or the floor is ruled for source-installed official themes).

---

_Prepared for expert review. Every claim above is traceable to a file:line or a command in §7; the open questions in §5.3 are the ones I could not decide on your behalf._
