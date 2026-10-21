# Phase 2 — Template completeness: verification evidence

**Branch:** `frame30` · **Base commit:** `a48253c8` · **Opened:** 2026-10-21
**Plan:** `docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md`
**Binding escalation record:** `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md`
**Governing spec:** `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary) and §9 (Testing & evidence)

**This file is APPEND-ONLY and is written in two hands.** The plan's Task 11 writes
§A–§F into this same file — what shipped, the acceptance walk-through, what was
deliberately not changed, the parity impact, the deferred items and the commands to
reproduce. The Batch-B fix round (2026-10-21) appends **§G — the open items** and
**§H — the stale artifacts** below. Task 11 must not drop them, and the Batch-B round
must not overwrite Task 11's sections.

---

## (G) OPEN items — defects found, recorded, and NOT fixed

### (G.1) The platform's `payment_methods` widget renders no payment-method radios — **OPEN**

**What is broken.** The platform's `payment_methods` widget renders its fieldset and its
legend ("Payment method") and **no payment-method radios at all**. The widget reads
`const grouped = groupMethods(cart.methods)` and then indexes that value **by group
name** — `const keys = (grouped[group] ?? []) as PaymentMethodKey[]`
(`src/components/builder/cart.tsx:560`, `:584`) — but `groupMethods()` returns an
**array** of `{ layer, methods }` objects (`src/lib/payment-rails.ts:358-363`), not a
map keyed by group. `grouped[group]` is therefore **always `undefined`**, the `?? []`
fallback makes every group empty, and every group renders `null`
(`src/components/builder/cart.tsx:576-617`). The shopper is offered no way to choose a
payment method.

**Where it shows.** In the theme preview's checkout tab (the authored checkout body
grants the `payment_methods` slot, so the widget renders) **and on the live
checkout** — the live checkout renders the same widget, so the defect is not a
preview-only artefact.

**Why it is NOT fixed here.** The fix lives in `src/components/builder/cart.tsx`, which
port spec §7 **prohibits** ("everything else under `src/`"). It is out of scope for
this plan, and §7's rule is "escalate, never edit silently". It is therefore recorded
here and in the escalation record's §(j.3) — **recorded, not fixed**.

**What the preview's test asserts instead.** The preview suite asserts what actually
renders: the theme's own `payment_icons` marks (the "We accept" heading, a brand badge
— `aria-label="bKash"` — and the "Cash on delivery" text chip) and the platform
widget's own legend. It does **not** assert payment radios, because the platform
renders none, and it does **not** assert their absence either — that would pin a
defect into a test. The suite's header comment names this OPEN item so a reader
cannot mistake the marks for the rails.

**What a fix would need.** Either `groupMethods()` returns a map keyed by group name,
or `PaymentMethods` iterates the array it already receives (`grouped.map(({ layer,
methods }) => …)`). Either way the change is in `src/components/builder/cart.tsx` and
needs its own escalation.

### (G.2) The storefront's widget-data delivery is still absent — **OPEN (Decision D7, deferred by the plan)**

Not a defect this plan introduced and not fixed by it: no storefront route mounts a
`WidgetDataProvider`, so the platform's `facet_sidebar` renders nothing on a live
storefront (Decision **D7**; the escalation record's §(b.4)). The search results reach
the storefront through the route's `productSlot` instead, and the platform's own
category/kind chips stay inside the results block. Carried here so the plan's §E is
read together with it.

---

## (H) Stale artifacts — what this work made obsolete

### (H.1) `src/components/store/CheckoutMock.tsx` — **DEAD CODE**

**The artefact.** `src/components/store/CheckoutMock.tsx` (137 lines,
`export function CheckoutMock` at `:4`) was the studio's generic checkout stand-in. The
preview's checkout tab used to render it (`src/components/store/ThemePreviewFrame.tsx:36`,
`:670` at the base commit).

**Why it is stale.** The preview now renders the **theme's authored** checkout body —
the `ast.main` through `SectionRenderer`, with the five cart slots granted — so the
mock is no longer imported and no longer rendered anywhere. A repo-wide grep finds the
symbol in exactly three places: its own definition, and two comments that name it as
the thing the preview no longer uses (`src/components/store/ThemePreviewFrame.tsx:897`,
`src/components/store/songoskriti-preview-compositions.test.tsx:8`). **Nothing imports
it; nothing renders it.**

**It is NOT deleted.** The file is under `src/components/store/**`, which port spec §7
prohibits ("everything else under `src/`"). Deleting it needs its own escalation; until
then it is recorded here as dead code.

### (H.2) The 24 parity captures of the four changed templates — **STALE**

`search`, `cart`, `blog` and `checkout` × 6 widths/locales — 24 of the 60
`docs/superpowers/songoskriti-evidence/port/reference/` captures and the matching 24
machine baselines under `.e2e/songoskriti-port-parity.spec.ts-snapshots/`. The numbers
and the trigger are recorded in the escalation record's §(d): re-freezing `reference/`
rewrites all 60 `reference-manifest.json` entries and is a separate owner-approved step,
and the parity suite is in neither `e2e:critical` nor `e2e:security`, so CI is
unaffected.

**The Batch-B fix round changes the `search` captures again** (the conditional
`empty_state` grant, the demo `productSlot` and the theme's `facet_sidebar` groups all
change the search tab's markup). They were already stale; they are stale for one more
reason, and the count does not change — still 24 of the 60.

---

## Reproducing this round

```
node_modules/.bin/vitest run \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/lib/themes/songoskriti/search-template.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx
```

```
node_modules/.bin/prettier --check \
  src/components/store/ThemePreviewFrame.tsx \
  src/lib/themes/songoskriti/preview.ts \
  src/lib/themes/songoskriti/search-template.test.ts \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx
node_modules/.bin/eslint <the same five paths>
node_modules/.bin/tsgo --noEmit
```

---

# Task 11 — the evidence record: what shipped, what was verified, what was deferred

**Written:** 2026-10-21 · **Base commit:** `a48253c8` · **HEAD at writing:** `18771e88`

**How to read this file.** It is written in **two hands** and this block is the
**second** one: the Batch-B fix round opened it with **§G — the open items** and
**§H — the stale artifacts** (above), and Task 11 appends **§A–§F** here. Nothing
above was rewritten or dropped; the sections are labelled, not numbered by position.

**The commits under verification** — `git log --oneline a48253c8..HEAD` (22 commits,
oldest first):

| #   | sha        | subject                                                                             |
| --- | ---------- | ----------------------------------------------------------------------------------- |
| 1   | `951c30b4` | docs(plan): mirror the platform's h1-claimant accounting in the gate rule           |
| 2   | `631d28ad` | docs(songoskriti): record the template-completeness escalation bundle               |
| 3   | `17d76002` | feat(songoskriti): author the search template and honour the host's results         |
| 4   | `46f44751` | feat(songoskriti): representative, labelled demo data for cart, account and facets  |
| 5   | `28d83942` | feat(songoskriti): an editorial blog body and a labelled sample page                |
| 6   | `88d511f8` | feat(songoskriti): platform-owned cart and checkout compositions and the last pins  |
| 7   | `141778b6` | docs(songoskriti): record the third stale composition pin (skins suite)             |
| 8   | `ce0f65df` | docs(plan): add the theme-owned skins pin to Task 3                                 |
| 9   | `2ba7622a` | docs: widen the escalation to five files (owner's ruling on the theme-owned pin)    |
| 10  | `fd85b211` | test(songoskriti): move the search composition pins to the authored body            |
| 11  | `4751ea5e` | feat(songoskriti): render the authored compositions in the theme preview            |
| 12  | `dfee0ab7` | docs(songoskriti): record the fourth stale pin (the Phase-1 preview page suite)     |
| 13  | `b1e105d0` | docs(songoskriti): record the Batch-B review contracts and the two open items       |
| 14  | `6bdd417f` | fix(songoskriti): turn on the theme's facet groups in the search sidebar            |
| 15  | `34f31bab` | fix(songoskriti): grant the empty state conditionally and hand the theme the block  |
| 16  | `f0adee47` | test(songoskriti): move the Phase-1 preview-page pin to the theme's own sample page |
| 17  | `ad4361b9` | docs(songoskriti): open the Phase-2 evidence record with the open/stale lists       |
| 18  | `cc9a8b37` | test(songoskriti): gate every template against a generic composition                |
| 19  | `b9b2f513` | fix(songoskriti): make the distinctness gate's generic rule composition-aware       |
| 20  | `161ed58e` | docs(songoskriti): record Task 9's real search-route hunk                           |
| 21  | `a6b99445` | feat(storefront): expose the search pieces to the theme's composition               |
| 22  | `18771e88` | docs(songoskriti): record the archive contract and name the unsupported state       |

---

## (A) What shipped — one row per expert item

| Expert item                                                                                                                                                                           | Commit(s)                                                              | Files                                                                                                                                                                                             | Acceptance evidence — the exact test that pins it                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — P0 — author a real Songoskriti Search template** (query and result summary, filters, active filter chips, sort controls, results grid, pagination, tailored empty/error states) | `17d76002`, `fd85b211`, `6bdd417f`, `34f31bab`, `a6b99445`, `161ed58e` | `src/lib/themes/songoskriti/preview.ts`, `src/components/builder/songoskriti.tsx`, `src/routes/store.$slug.search.tsx`                                                                            | `songoskriti search template composition > authors the platform's search widgets in the exact order` (`src/lib/themes/songoskriti/search-template.test.ts`); `songoskriti search presentation > renders the host's results on the search template`; `storefront search route — the theme composes the platform's pieces > grants EXACTLY the five slots the storefront can feed — and never facet_sidebar` (`src/routes/store.$slug.search-composition.test.tsx`) |
| **2 — P0 — make the Cart and Account previews representative**                                                                                                                        | `46f44751`, `88d511f8`, `4751ea5e`                                     | `src/lib/themes/songoskriti/preview-demo-data.ts`, `src/lib/themes/songoskriti/preview.ts`, `src/components/store/ThemePreviewFrame.tsx`                                                          | `songoskriti preview demo data — cart > derives the cart's money from its lines` and `> is not the studio's snapshot`; `songoskriti preview demo data — account > shows a shopper profile that is visibly demo` (7 cases in `src/lib/themes/songoskriti/cart-account-demo.test.ts`); `songoskriti preview — the cart composition > renders the Songoskriti cart lines and a coherent summary`                                                                     |
| **3 — P0 — finish the Blog and Page preview composition**                                                                                                                             | `28d83942`, `88d511f8`, `4751ea5e`, `f0adee47`                         | `src/lib/themes/songoskriti/preview.ts`, `src/lib/themes/songoskriti/preview-page.ts`, `src/components/store/ThemePreviewFrame.tsx`, `src/components/store/songoskriti-preview-page.test.tsx`     | `songoskriti blog template composition > authors the platform's blog pack in the exact order`; `songoskriti sample content page > keeps the production payload shape and is explicitly labelled` (`src/lib/themes/songoskriti/blog-page-composition.test.ts`); `songoskriti preview — the page composition > renders the labelled sample page with exactly one h1`                                                                                                |
| **4 — P0 — render the authored Checkout template in preview**                                                                                                                         | `88d511f8`, `4751ea5e`                                                 | `src/lib/themes/songoskriti/preview.ts`, `src/components/store/ThemePreviewFrame.tsx`                                                                                                             | `songoskriti checkout composition > holds nothing but platform-owned commerce widgets` and `> leaves the production checkout route untouched` (`src/lib/themes/songoskriti/checkout-composition.test.ts`); `songoskriti preview — the checkout composition > renders the AUTHORED checkout body, not the generic mock`                                                                                                                                            |
| **5 — P0 — decide and implement the Archive contract**                                                                                                                                | `631d28ad`, `18771e88`                                                 | `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` §(l), `src/components/store/ThemePreviewFrame.tsx`, `src/lib/themes/songoskriti/archive-contract.test.ts` | `the archive contract (Decision D1, Option A) > enumerates the archive-like routes the platform actually serves` and `> never redirects an unsupported template to the homepage — the preview states it, the route 404s` (5 cases)                                                                                                                                                                                                                                |
| **6 — P1 — introduce a template-distinctness acceptance gate**                                                                                                                        | `cc9a8b37`, `b9b2f513`                                                 | `src/lib/themes/songoskriti/template-distinctness.ts`, `src/lib/themes/songoskriti/template-distinctness.test.ts`                                                                                 | `songoskriti template distinctness gate > rejects the legacy bodies — the gate has failed before`; `> passes the nine shipped bodies`; `> has a firing fixture for every rule` (9 cases)                                                                                                                                                                                                                                                                          |

**The moved pins** (each a _stronger_ expectation, quoted in the escalation record
before the change — §(b.2), §(b.3), §(g), §(i), §(j.4)): `fd85b211` (the two
composition pins + the skins pin), `f0adee47` (the Phase-1 preview-page pin).

**The one platform route the plan touches**: `src/routes/store.$slug.search.tsx`
(`a6b99445`), with its new suite `src/routes/store.$slug.search-composition.test.tsx`.

---

## (B) The acceptance walk-through — the expert's closing bar, item by item

> _"all supported template tabs show the real theme-authored composition; demo data
> is realistic and explicitly labelled; Page previews a useful sample but the live
> Page route renders the actual CMS record; Checkout preview renders the authored
> template; Archive has an explicit contract and route mapping; each claimed template
> passes a theme-distinctness test"_

| The bar                                                                                   | Met? | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"all supported template tabs show the real theme-authored composition"**                | ✅   | The preview host renders the theme's own `ast.main` through the platform's `SectionRenderer` for every template. The preview suite (`src/components/store/songoskriti-preview-compositions.test.tsx`, **8** cases over the **six** surfaces) asserts what a merchant sees on the cart, account, search, blog, page and checkout tabs; the two composition pins (`src/components/builder/songoskriti-port-freeze.test.tsx`, 21 tests) hold the **exact ordered composition** of every template; `src/lib/theme-preview-nav.test.ts` (43 tests) holds every template's opener.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **"demo data is realistic and explicitly labelled"**                                      | ✅   | `src/lib/themes/songoskriti/cart-account-demo.test.ts` — **seven** cases: the cart's money is _derived from its lines_, the lines cite real Songoskriti demo products, the snapshot is _not_ the studio's, the data is synthetic and inert, the profile is _visibly_ demo ("Rumana Haque (demo shopper)", RFC 2606 `.example` addresses) and the order history reads like one. The preview's visible markers are the shopper's title and the orders themselves — **not** a bare "Demo" badge, which Phase 1 removed because it leaks into a merchant's live page. The **product** body keeps exactly one labelled line, relabelled in this plan: _"Sample product page — prices and stock are sample data, and ordering is disabled in the preview."_ (was _"Demo product page. Prices and stock are sample data…"_).                                                                                                                                                                                                                                                       |
| **"Page previews a useful sample but the live Page route renders the actual CMS record"** | ✅   | The preview renders the theme's own labelled sample page (`SONGOSKRITI_PREVIEW_PAGE`, `src/lib/themes/songoskriti/preview-page.ts`); the **live** Page route is **byte-identical** — `src/components/store/PageView.tsx` is not in this plan's diff (§C), and the gate's `R4-no-demo-copy` rule is scoped to the **`page`** template for exactly this reason: it is the one body whose copy could impersonate the merchant's record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **"Checkout preview renders the authored template"**                                      | ✅   | `songoskriti preview — the checkout composition > renders the AUTHORED checkout body, not the generic mock` asserts the theme's payment marks (`aria-label="bKash"`, "Cash on delivery"), the platform widget's own legend ("Payment method"), the synthetic order's derived money, and **`expect(html).not.toContain("Muslin Floral Festive Saree")`** — the mock's hard-coded line never reaches the preview. `src/components/store/CheckoutMock.tsx` is now **dead code** (§H.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **"Archive has an explicit contract and route mapping"**                                  | ✅   | The contract is written down verbatim in the escalation record's **§(l.1)** and pinned by `src/lib/themes/songoskriti/archive-contract.test.ts`: the archive-like surface is the blog listing and its **category / tag / author** taxonomies plus the storefront's blog index, served by `BlogArchiveTheme` and backed by the existing blog pack (`blog_terms` / `blog_archive` / `blog_pager`) — it wears the **`blog`** template; **no `archive` key is added** (`TEMPLATE_KEYS`, `TEMPLATE_ZONES`, the 41 catalogue allowlists, the hand-written `z.enum` and the editor/SEO/weight maps are all untouched); and an unsupported template produces the **explicit unsupported state** ("This template is not supported by this theme", naming the key, linking back to the home tab) instead of a homepage redirect.                                                                                                                                                                                                                                                      |
| **"each claimed template passes a theme-distinctness test"**                              | ✅   | `src/lib/themes/songoskriti/template-distinctness.ts` — **seven** rules (`R1-not-generic`, `R2-theme-composition`, `R3-functional-slots`, `R4-no-demo-copy`, `R5-no-forbidden-types`, `R6-distinct-across-templates`, `R7-one-primary-heading`). The gate's subject is **composition, functional slots and structure — never lint cleanliness**, and the module's header says why: the platform's own lint is a different concern. **Measured** on the nine shipped bodies at HEAD, `lintTemplate` reports **zero errors** on all nine (`index` 23 findings, `search` 14, `checkout` 3, `blog` 2, `cart` 2, `product` / `collection` / `account` / `page` 1 each — every one of them the platform's _bilingual-content_ finding, "no বাংলা translation", which this plan does not silence), and the one double-`<h1>` **error** the cart body carried is **fixed** in the body that carried it and then held structurally under `R7`. The gate has **failed before**: it rejects the four legacy bodies and the engine's generic body, and every rule has a firing fixture. |

**The suite that backs all six rows** — one run, 34 files, **423 tests, zero
failures**:

```
node_modules/.bin/vitest run src/lib/themes/songoskriti \
  src/components/builder/songoskriti-port-freeze.test.tsx \
  src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/BlogArchiveTheme.test.tsx \
  src/components/store/ThemeChrome.route-content.test.tsx \
  src/components/store/PageView.twin-wiring.test.tsx

 Test Files  34 passed (34)
      Tests  423 passed (423)
```

Per file, as measured:

| suite                                                               | tests | suite                                                             | tests |
| ------------------------------------------------------------------- | ----- | ----------------------------------------------------------------- | ----- |
| `src/lib/themes/songoskriti/presentation-claims-activation.test.ts` | 34    | `src/lib/themes/songoskriti/widgets.test.ts`                      | 18    |
| `src/lib/themes/songoskriti-assets.test.ts`                         | 61    | `src/lib/themes/songoskriti/ornament-presentation.test.tsx`       | 20    |
| `src/components/store/ThemePreviewFrame.test.tsx`                   | 53    | `src/lib/themes/songoskriti/skins.test.ts`                        | 20    |
| `src/lib/theme-preview-nav.test.ts`                                 | 43    | `src/lib/themes/songoskriti/circle-categories-neutrality.test.ts` | 7     |
| `src/lib/definition-of-done.test.ts`                                | 11    | `src/lib/themes/songoskriti/hero-carousel-neutrality.test.ts`     | 7     |
| `src/lib/themes/songoskriti/search-template.test.ts`                | 10    | `src/lib/themes/songoskriti/recently-viewed-neutrality.test.ts`   | 7     |
| `src/lib/themes/songoskriti/template-distinctness.test.ts`          | **9** | `src/lib/themes/songoskriti/wiring.test.ts`                       | 7     |
| `src/lib/themes/songoskriti/ornament-def.test.ts`                   | 8     | `src/lib/themes/songoskriti/cart-account-demo.test.ts`            | 7     |
| `src/lib/themes/songoskriti/variations.test.ts`                     | 8     | `src/lib/themes/songoskriti/checkout-composition.test.ts`         | 7     |
| `src/components/store/songoskriti-preview-compositions.test.tsx`    | **8** | `src/lib/themes/songoskriti/page-content.test.ts`                 | 7     |
| `src/lib/themes/songoskriti/footer-copy-neutrality.test.ts`         | 5     | `src/lib/themes/songoskriti/ornament-reachability.test.ts`        | 5     |
| `src/lib/themes/songoskriti/archive-contract.test.ts`               | **5** | `src/lib/themes/songoskriti/ornament-recovery.test.ts`            | 3     |
| `src/lib/themes/songoskriti/dormant-presentation-claims.test.ts`    | 3     | `src/lib/themes/songoskriti/preview.test.ts`                      | 3     |
| `src/lib/themes/songoskriti/blog-page-composition.test.ts`          | 6     | `src/components/builder/songoskriti-port-freeze.test.tsx`         | 21    |
| `src/lib/themes/songoskriti-asset-paths.test.ts`                    | 4     | `src/components/store/songoskriti-preview-page.test.tsx`          | 7     |
| `src/lib/themes/songoskriti/claims-activation.test.ts`              | 1     | `src/components/store/BlogArchiveTheme.test.tsx`                  | 2     |
| `src/components/store/ThemeChrome.route-content.test.tsx`           | 3     | `src/components/store/PageView.twin-wiring.test.tsx`              | 3     |

**Two counts in the plan were stale, and the measured numbers are the ones above.**
The plan's Task 11.2 expected `416 passed`; the run reports **423**. The difference is
**+7**, and both are explained by suites that grew after the plan was written: the
distinctness gate is **9** cases (the plan said 4 — commits `cc9a8b37` and
`b9b2f513` added the composition-aware `R1` cases) and the preview suite is **8**
cases (the plan said 6 — the Batch-B round added the facet-label and search-input
cases). Task 10's own neighbourhood is likewise **145** where the plan said **140**,
for the same reason (the gate's 9 cases, not 4). No suite lost a case.

---

## (C) What was deliberately not changed

`git diff --stat a48253c8..HEAD` — measured at `18771e88` (this document's own commit
follows it, so the evidence file's own line grows by this block) — **22 files changed,
7731 insertions(+), 668 deletions(-)**:

```
 ...2026-10-20-songoskriti-template-completeness.md | 1167 ++++++++++++
 .../phase2-template-completeness-escalation.md     | 2014 ++++++++++++++++++++
 .../port/phase2-template-completeness-evidence.md  |  123 ++
 .../builder/songoskriti-port-freeze.test.tsx       |   16 +-
 src/components/builder/songoskriti.tsx             |  361 ++--
 src/components/store/ThemePreviewFrame.tsx         |  603 ++++--
 .../songoskriti-preview-compositions.test.tsx      |  296 +++
 .../store/songoskriti-preview-page.test.tsx        |    4 +-
 src/lib/theme-preview-nav.test.ts                  |    4 +-
 .../themes/songoskriti/archive-contract.test.ts    |  183 ++
 .../songoskriti/blog-page-composition.test.ts      |  107 ++
 .../themes/songoskriti/cart-account-demo.test.ts   |  158 ++
 .../themes/songoskriti/checkout-composition.test.ts |  132 +++
 src/lib/themes/songoskriti/preview-demo-data.ts    |  383 ++++
 src/lib/themes/songoskriti/preview-page.ts         |   34 +
 src/lib/themes/songoskriti/preview.ts              |  164 +-
 src/lib/themes/songoskriti/search-template.test.ts |  328 ++++
 src/lib/themes/songoskriti/skins.test.ts           |   20 +-
 .../songoskriti/template-distinctness.test.ts      |  632 ++++++
 .../themes/songoskriti/template-distinctness.ts    |  716 +++++++
 src/routes/store.$slug.search-composition.test.tsx |  160 ++
 src/routes/store.$slug.search.tsx                  |  794 +++++----
```

**The live surfaces are untouched.** The check is empty:

```
git diff --stat a48253c8..HEAD -- \
  src/routes/store.$slug.cart.tsx src/routes/store.$slug.account.tsx \
  src/routes/store.$slug.checkout.tsx src/components/store/BlogArchiveTheme.tsx \
  src/components/store/PageView.tsx src/components/store/StoreHomepage.tsx
```

→ **no output**. The live cart, the live account, the live checkout, the storefront
blog, the live Page route and the storefront homepage are **byte-identical** to the
base commit. Consequently, none of the following changed:

| Not changed                                                                                                                                                                                   | Where it still lives                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the **search execution and authorization** — the platform still runs the query, scopes it to the tenant, limits the page size, applies the canonical/robots discipline and prices the results | `src/routes/store.$slug.search.tsx:42-105` — the loader, the head, the `apply()` helper and the tenant scoping are byte-identical; only the **presentation channel** changed |
| the **cart mutations**                                                                                                                                                                        | `src/routes/store.$slug.cart.tsx:81-129` — its `CartProvider` and its real quote; Task 4's synthetic cart is **preview-only** and `live: false`                              |
| the **customer authorization**                                                                                                                                                                | `src/routes/store.$slug.account.tsx:185-219` — its session-scoped `accountSlots`; no customer ever sees another's rows                                                       |
| the **price calculation**                                                                                                                                                                     | every money figure still comes from the server quote (`quoteCart`), never from a theme prop                                                                                  |
| the **order state**                                                                                                                                                                           | `src/routes/store.$slug.checkout.tsx` keeps `ast={null}`, its server-authoritative totals, its validation, its payment providers and its order state                         |
| the **merchant's CMS page record**                                                                                                                                                            | `src/components/store/PageView.tsx:73-110`, `:166`, `:175` — the live Page route still renders the merchant's real record through `page_content`                             |

**The one route the plan does change** is named separately, with its own commit:

```
git diff --stat a48253c8..HEAD -- src/routes/store.$slug.search.tsx
 src/routes/store.$slug.search.tsx | 794 +++++++++++++++++++++-----------------
 1 file changed, 441 insertions(+), 353 deletions(-)
```

(`a6b99445`, with the escalation record's §(k) carrying the real hunk.)

**Also untouched, by rule:** `src/lib/builder-ast.ts`, `src/lib/storefront.functions.ts`,
`src/lib/theme-preview-nav.ts`, `src/lib/theme-package.ts`, `src/lib/widget-weight.ts`,
`src/lib/builder-seo.ts`, `src/components/builder/BuilderTopBar.tsx`,
`src/components/builder/widgets.tsx`, `src/lib/theme-presentations.ts`,
`src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, every other route, and
`src/components/store/BlogArchiveTheme.tsx` + its pin
`src/components/store/BlogArchiveTheme.test.tsx`. **No `archive` template key was
added**, so `TEMPLATE_KEYS`, `TEMPLATE_ZONES`, the 41 catalogue `templates:`
allowlists, the hand-written `z.enum` and the editor/SEO/weight maps are all as they
were. **No migration** was created or altered, **no dependency** was added, and
**no deploy** ran inside this plan.

---

## (D) The parity impact

**What the parity suite captures.** The parity spec screenshots the **public preview
route** — `/theme-preview/songoskriti?template=<template>&lang=<locale>`
(`.e2e/songoskriti-port-parity.spec.ts:129`, `:90`) — so a capture is stale exactly
when this plan changed **the preview's markup for that template**.

**The measured stale set — 42 of the 60.** The manifest holds **60** capture
entries (`reference-manifest.json`: `index` 12, `product` / `collection` / `account` /
`page` / `blog` / `cart` / `checkout` / `search` 6 each). Rendering the preview host
per template and diffing it against the base commit's own markup shows **seven**
templates changed and two did not:

| template     | stale?      | why (measured)                                                                                                                                                                   |
| ------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product`    | **yes — 6** | the body's sample line was relabelled: it now reads _"Sample product page — prices and stock are sample data…"_; the old _"Demo product page."_ is gone                          |
| `page`       | **yes — 6** | the preview now renders the theme's own labelled sample page (_"Sample page — Songoskriti sizing and care"_) instead of the shared studio fixture (_"Demo page body."_)          |
| `account`    | **yes — 6** | the preview now renders the Songoskriti demo shopper and orders (_"Rumana Haque (demo shopper)", "ORD-2451"_) instead of the studio's shared rows (_"Demo Shopper", "ORD-1001"_) |
| `blog`       | **yes — 6** | the body is now the platform's blog pack over the Songoskriti demo feed (_"Browse the journal", "From the journal"_); the old _"Meet the makers"_ story is gone                  |
| `cart`       | **yes — 6** | the body is now the two platform commerce widgets over the Songoskriti synthetic cart (_"Dhakai Jamdani Heritage Saree", "Order summary"_)                                       |
| `checkout`   | **yes — 6** | the body is now the authored checkout composition (_"Checkout progress", "We accept"_) over the synthetic cart                                                                   |
| `search`     | **yes — 6** | the body is now the platform's six search widgets over the demo facets (_"Search the collection", "Filter", "page=2"_); the old _"Demo search"_ copy is gone                     |
| `index`      | no — 12     | the homepage body (`buildHomepageMain`) and the chrome are unchanged                                                                                                             |
| `collection` | no — 6      | the collection body is unchanged and its `result_toolbar` is not granted by the host, so the new query provider changes nothing it renders                                       |

**The plan's estimate was 24** (the escalation record's §(d) and the plan's Task
11.3 named `search`, `cart`, `blog`, `checkout` × 6). **The measured set is 42** —
Phase 2 also changed the **product**, **page** and **account** preview surfaces, and
the `page` captures were **already** stale from Phase 1 (the Phase-1 close-out
recorded the same six `page-*` stills as stale — `phase1-page-content-evidence.md`
§D.5); Phase 2 changed that surface a second time. The estimate was made before
Tasks 5, 6 and 7 landed; **42 of the 60** is the number to re-freeze against.

**Where the stale files live.** `docs/superpowers/songoskriti-evidence/port/reference/`
holds **42** stale stills (`product-*`, `page-*`, `account-*`, `blog-*`, `cart-*`,
`checkout-*`, `search-*` — 6 each) and
`.e2e/songoskriti-port-parity.spec.ts-snapshots/` holds the matching **42** stale
machine baselines (the `…-chromium-linux.png` twins). **84 files** in total.

**The trigger.** _Before the next owner-run parity pass._ The suite is **owner-run
only** — it is in neither `e2e:critical` nor `e2e:security` (`package.json`) — so a
stale baseline does **not** break CI. This is a parity-record problem, not a gate
problem.

**The owner action — the re-freeze.** It is deliberately **not** run by this plan:

```bash
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  E2E_MERCHANT_EMAIL="$E2E_MERCHANT_EMAIL" E2E_MERCHANT_PASSWORD="$E2E_MERCHANT_PASSWORD" \
  npx playwright test -c .e2e/playwright.config.ts songoskriti-port-parity --update-snapshots
```

`PORT_CAPTURE_OUT` must **not** be `after` (the spec writes the human stills to
`after/` when it is set and to `reference/` when it is not), and
`--update-snapshots` is what rewrites the machine baselines.

**Why it must be deliberate.** The harness **activates the theme on a store in the
database the repo's `.env` configures** — a possibly-shared instance — and it only
accepts loopback requests. A run from this plan would either mutate a store that is
not the plan's to mutate, or fail for want of a loopback stack and a disposable
merchant. The Phase-1 close-out recorded the same action and the same preconditions
(`phase1-page-content-evidence.md` §D.5).

**What a re-freeze rewrites.** **All 60** manifest entries — the spec rewrites
`reference-manifest.json` wholesale (`generatedAt` and `freezeSha` on every run),
not just the stale ones. The other **18** captures (`index` × 12, `collection` × 6)
are expected to be unchanged, modulo the per-response CSP nonce.

**What to review in the resulting diff:** only the **42** entries listed above should
differ materially. Anything else that moved is a finding, not noise.

---

## (E) The deferred items — and what is NOT deferred

**Deferred (open by decision):**

| Decision | The deferral                                                                                                                                                                  | Where it rests                                                                                                                                                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D5**   | the storefront reader blog stays **themeless by design**; the theme's `blog` template is a **preview surface** until D5 is ruled                                              | `src/components/store/BlogArchiveTheme.tsx:1-9` — _"the render stays generic for every key by design"_ — pinned by `src/components/store/BlogArchiveTheme.test.tsx:82`, neither file touched by this plan. The gate records it as a documented exception.                                               |
| **D2**   | the **production checkout stays tokens-only**; the theme may not author a production checkout body                                                                            | `src/routes/store.$slug.checkout.tsx:415-421` (`ast={null}`) — the route renders its own hand-built form and discards the theme's AST. Task 6 asserts the file still says so (`leaves the production checkout route untouched`). The gate records it as a documented exception.                         |
| **D7**   | the storefront's **widget-data delivery is not fixed**; the search results reach the storefront through the route's `productSlot`, and `facet_sidebar` stays **preview-only** | no storefront route mounts a `WidgetDataProvider`; its rows come from the widget-data pipeline (`source: "facets"`, `src/lib/widget-registry.ts:483-503`). The storefront grants **five** of the six search widgets and never `facet_sidebar`. Recorded in the gate's `search` exception and in §(G.2). |

**Ruled — and implemented here (NOT deferred):**

| Decision | The ruling                                                                                                                                                                                                | How this plan implements it                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **D1**   | **Option A** — the archive surface is the blog taxonomy surface; **no `archive` template key**                                                                                                            | §(l.1) of the escalation record + the preview's explicit unsupported state + the five-case contract suite               |
| **D4**   | port spec §7 is **relaxed for this programme** for exactly **six** existing files (the preview host, the two composition pins, the search route, the theme-owned skins pin, the Phase-1 preview-page pin) | every one of them is named in the escalation record and quoted **before** the edit; no other §7 prohibition was touched |
| **D6**   | **State B** — the storefront search route exposes its pieces as per-widget context slots                                                                                                                  | `a6b99445` + `src/routes/store.$slug.search-composition.test.tsx`                                                       |

**Also open — the two OPEN items and the stale artefacts** (written in full above,
**§G** and **§H**): the platform's `payment_methods` widget renders **no
payment-method radios** (it indexes `groupMethods()`'s array by group name —
`src/components/builder/cart.tsx:560`, `:584` against
`src/lib/payment-rails.ts:358-363` — a §7-prohibited file, and the same defect is
on the live checkout); the storefront's widget-data delivery (§G.2);
`src/components/store/CheckoutMock.tsx` is now **dead code** (§H.1) and is **not**
deleted, because `src/components/store/**` is §7-prohibited.

**Still unverified in production.** The **storefront path** of this work has **not**
been exercised against a live store: the live database has **no Songoskriti store**
(the theme activates only on a store the parity harness writes), and the storefront
search route's split has been verified by **rendering the same fixture before and
after** (the `fallback`'s HTML is byte-identical — the escalation record's §(k.4) —
and by the six-case text suite), not by a live shopper's journey. That is the same
status the Phase-1 close-out recorded.

---

## (F) The commands to reproduce

Each command is runnable **as written**, from the repo root (`/opt/frame28`).

**1 — the theme neighbourhood (the acceptance suite)**

```bash
node_modules/.bin/vitest run src/lib/themes/songoskriti \
  src/components/builder/songoskriti-port-freeze.test.tsx \
  src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/BlogArchiveTheme.test.tsx \
  src/components/store/ThemeChrome.route-content.test.tsx \
  src/components/store/PageView.twin-wiring.test.tsx
# → Test Files  34 passed (34) / Tests  423 passed (423)
```

**2 — the archive contract (Task 10)**

```bash
node_modules/.bin/vitest run src/lib/themes/songoskriti/archive-contract.test.ts \
  src/lib/themes/songoskriti/template-distinctness.test.ts \
  src/lib/themes/songoskriti/preview.test.ts \
  src/components/builder/songoskriti-port-freeze.test.tsx \
  src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx
# → Test Files  7 passed (7) / Tests  145 passed (145)
```

**3 — the storefront search route's split (Task 9)**

```bash
node_modules/.bin/vitest run src/routes/store.\$slug.search-composition.test.tsx
# → Test Files  1 passed (1) / Tests  6 passed (6)
```

**4 — format, lint, types** (`bun` is not on PATH; use the repo's own binaries)

```bash
node_modules/.bin/prettier --check src/components/store/ThemePreviewFrame.tsx \
  src/lib/themes/songoskriti/archive-contract.test.ts
# → All matched files use Prettier code style!

node_modules/.bin/eslint src/components/store/ThemePreviewFrame.tsx \
  src/lib/themes/songoskriti/archive-contract.test.ts
# → 2 warnings, 0 errors — both PRE-EXISTING react-hooks/exhaustive-deps
#   warnings on the preview host's own useEffects (the same two warnings
#   are reported by the base commit's copy of the file; the new test file
#   is silent). A repo-wide `eslint .` stalls on the untracked .output-snapshots/.

node_modules/.bin/tsgo --noEmit
# → no output, exit 0
```

**5 — the "nothing else changed" proofs**

```bash
git log --oneline a48253c8..HEAD
git diff --stat a48253c8..HEAD

git diff --stat a48253c8..HEAD -- \
  src/routes/store.\$slug.cart.tsx src/routes/store.\$slug.account.tsx \
  src/routes/store.\$slug.checkout.tsx src/components/store/BlogArchiveTheme.tsx \
  src/components/store/PageView.tsx src/components/store/StoreHomepage.tsx
# → EMPTY (the live cart, account, checkout, blog and page surfaces are untouched)
```

**6 — the three known-red gates (pre-existing; not regressions from this plan)**

```bash
node scripts/contract-gate.mjs          # → exit 2: "could not start vitest — spawnSync bunx ENOENT"
node scripts/schema-fingerprint.mjs --check   # → exit 1: "rpc failed (400)" (needs a live Supabase RPC)
node scripts/secret-scan.mjs             # → exit 1: 8 findings, ALL inside the untracked .output-snapshots/
```

**7 — the known local-only flake (pre-existing; passes in CI)**

```bash
node_modules/.bin/vitest run src/lib/site.server.test.ts
# → 1 failed | 2 passed (the gitignored .env supplies VITE_SUPABASE_URL before
#   vi.stubEnv runs; it passes with
#   VITE_SUPABASE_URL="" SUPABASE_URL="" SUPABASE_PUBLISHABLE_KEY=""
#   VITE_SUPABASE_PUBLISHABLE_KEY="" node_modules/.bin/vitest run src/lib/site.server.test.ts )
```

**8 — the owner action (the parity re-freeze) — see §D.** It is **not** run by this
plan: it activates the theme on a store in the database the repo's `.env` points at.
