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

### (G.1) The platform's `payment_methods` widget renders no payment-method radios — **OPEN → FIXED (2026-10-21, see §(K.1))**

**Status (2026-10-21, closing wave):** **FIXED** — commit `9eb581d0`, covered by
the new suite `src/components/builder/cart-payment-methods.test.tsx` (8 cases).
**The body below is the finding exactly as it stood when it was recorded**; §(K.1)
carries the fix, the proof and **a correction to the "where it shows" paragraph
below** (the production *checkout* route does **not** render this widget — the
defect was in the widget, which the preview's checkout tab and the storefront's
**cart** route both grant).

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

### (G.3) The `product` body's preview-only sentence ships to merchants — **OPEN (not fixed in the final-review round)**

**What is broken.** The `product` template's body carries one labelled line
(`src/lib/themes/songoskriti/preview.ts:192`): _"Sample product page — prices and stock
are sample data, **and ordering is disabled in the preview**."_ The clause after the
comma is true **only inside the preview**, and the same body is the **seeded** template
a merchant installs — `registryPackage` returns the preview's assembled templates
(`src/lib/themes.server.ts:1163-1169`), so on a merchant's live product page the copy
claims that ordering is disabled in the preview. **Nothing catches it:** the gate's
`R4-no-demo-copy` rule is scoped to the **`page`** template (the one body whose copy
could impersonate the merchant's CMS record), and the sentence carries none of the
retired demo markers the rule looks for.

**Why it is NOT fixed here.** The sentence's home is the **seeded** body
(`src/lib/themes/songoskriti/preview.ts`) and the fix's other half — rendering the
clause **in** the preview only — lives in the preview host
(`src/components/store/ThemePreviewFrame.tsx`, §7-prohibited). **Neither file is in the
final-review fix round's owner-approved set** (the escalation record's **§(m.3)**), and
the escalation record's **§(m.7)** records the residual. A round that may edit both
files should move the preview-only clause out of the shipped body: the merchant-facing
body keeps a merchant-safe label (_"Sample product page — prices and stock are sample
data."_) and the preview host adds the preview-only note.

**What it costs.** The `product` captures are **already** stale (§(D)), and the
re-freeze is an owner action — so this change must land in the same re-freeze, not
before it.

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

**Correction (2026-10-21):** the "24 of the 60" above is the plan's **estimate**; the
**measured** stale set is **42 of the 60** — see **§(D)**, which names the seven
changed templates and the two that did not change.

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
| **"Archive has an explicit contract and route mapping"**                                  | ✅   | The contract is written down verbatim in the escalation record's **§(l.1)** and pinned by `src/lib/themes/songoskriti/archive-contract.test.ts`: the archive-like surface is the blog listing and its **category / tag / author** taxonomies plus the storefront's blog index, served by `BlogArchiveTheme` and backed by the existing blog pack (`blog_terms` / `blog_archive` / `blog_pager`) — it wears the **`blog`** template; **no `archive` key is added** (`TEMPLATE_KEYS`, `TEMPLATE_ZONES`, the 41 catalogue allowlists, the hand-written `z.enum` and the editor/SEO/weight maps are all untouched); and an unsupported template produces the **explicit unsupported state** ("This template is not supported by this theme", naming the key, linking back to the home tab) instead of a homepage redirect. **Amended 2026-10-21 (§(I)) — the ✅ was FALSE until the final-review fix:** the unsupported branch was **dead code** (`validateThemePreviewSearch` dropped every unknown `?template=` value — `src/lib/theme-preview-nav.ts:264-268` — and the host computes its state from a **missing** key, `src/components/store/ThemePreviewFrame.tsx:575-578`). The route's search validation now **carries** the requested key (bounded to a key-shaped token, ≤64 chars) and the route hands it to the host, so `?template=archive` renders the panel; `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` (9 cases) proves the route's own `validateSearch` carries the key, the panel renders **with the key named**, and the **homepage body does not render** in its place. **Amended 2026-10-21 (§(J)) — the ✅ was still FALSE for the URL the server serves:** the carry was **not idempotent**, so TanStack Router's SSR canonicalisation (`@tanstack/router-core/dist/esm/load-server.js:546-557`) re-validated the search, **dropped the carried request** and answered `?template=archive` with a **307 to the bare path** — which renders the **homepage** (measured live: 204 824 bytes, the panel heading ×0, the homepage's `hero-festive` marker ×5). The validation now reads the carried key back, so the **canonical URL carries the request**: `?template=archive` → **307 → `?unsupportedTemplate=archive`** → **200** with the **panel** (the heading ×1, the key named, the homepage body ×0), and the nine authored keys are **not** redirected at all. The suite grew to **15 cases**; the six new ones reproduce the router's **own** canonicalisation and pin that the panel renders for `?template=archive` **through the route**. **The live build at `bd52c246` still serves the homepage for that URL** — the state is user-visible from this commit onwards, i.e. **after the branch is deployed** (§(J.2)).                                                                                                                                                                                                                                                      |
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

**Updated 2026-10-21 (§(I)) — the run is now one file and nine cases bigger:** the
same command reports **35 files / 432 tests** (the final-review fix round adds
`src/lib/themes/songoskriti/unsupported-template-state.test.tsx`, 9 cases — see
§(I.4) for the measured output). The 34-file / 423-test run above is the one that
backed the six rows as they stood when Task 11 wrote them; **no case was removed,
skipped or weakened**.

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
| the **themed search page's pager, result count, sort control and active-filter chips** — **State B (Decision D6) narrowed what a themed search page can show**: those four moved out of the results block and into **per-widget granted slots**, so they now reach the theme only where the theme **authors** the matching section. A themed search body that publishes a `product_grid` but no `pagination` section **loses the pager** (page 2+ becomes unreachable), and one with no `result_toolbar` / `filter_chips` loses the count, the sort control and the active chips | `src/routes/store.$slug.search.tsx:575-583` — the `resultsBlock` the theme's `product_grid` receives as `productSlot` carries the query box, the platform's category/kind chips, the status notice and the results grid, and **not** the count, the sort, the active chips or the pager; `:632-645` — the `contextSlots` grants them (`result_toolbar`, `filter_chips`, `pagination`, `category_header` and — only when the platform's own empty state would have shown — `empty_state`). The Songoskriti body authors every one of them (`src/lib/themes/songoskriti/preview.ts:242-297`), so the theme's own search page keeps its pager, count and sort — but the guarantee is now **the theme's sections**, not the platform's default |

**The matching note in the route was NOT written (said here, not silently
skipped).** The final-review fix round's owner-approved file set is the two
files the escalation record's **§(m.3)** names — `src/lib/theme-preview-nav.ts`
and `src/routes/theme-preview.$key.tsx` — and `src/routes/store.$slug.search.tsx`
is **not** one of them. The narrowing is therefore recorded **in this row only**;
a round that may edit the search route should carry the same sentence into the
comment above its `contextSlots` map (`src/routes/store.$slug.search.tsx:626-631`).

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

**Updated 2026-10-21 (§(I)) — the list above is now narrower by two files.**
The final-review fix round edited `src/lib/theme-preview-nav.ts` and
`src/routes/theme-preview.$key.tsx` (the two files the escalation record's
**§(m.3)** escalates: the preview's search validation and the preview route).
**Every other file named above is still untouched**, and the "no `archive` key",
"no migration", "no dependency" and "no deploy" statements above still hold — the
fix added **no template key**.

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

**Amended 2026-10-21 (§(K.3)) — D2, D5 and D7 are now CLOSED as decisions, not
open questions.** The deferrals above **stand unchanged** (the production checkout
stays platform-owned, the storefront reader blog stays themeless, the storefront
mounts no widget data) — what changed is that each is now a **settled decision with
a named follow-up path**, recorded in §(K.3) and in the plan's Decision Gate. D3
(also closed) is not in this table: it was never a deferral.

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

**Amended 2026-10-21 (§(K.1)) — the first of those is now FIXED.** The
`payment_methods` defect is closed (commit `9eb581d0`, covered by
`src/components/builder/cart-payment-methods.test.tsx`); the widget now renders a
radio per method of its group. The paragraph above also carried the claim that
"the same defect is on the live checkout" — **that is not what the tree does**: the
production checkout route renders its **own** hand-built payment fieldset (and does
so correctly); the defect was in the **widget**, which the preview's checkout tab
and the storefront's **cart** route both grant. §(K.1) carries the correction.
The items still open are §(G.2) (the storefront's widget-data delivery, now
Decision **D7**) and §(G.3) (the preview-only sentence in the shipped `product`
body).

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

**Updated 2026-10-21 (§(I)):** the same command now reports **35 passed (35) /
432 passed (432)** — one file and nine cases more (the unsupported-template-state
suite).

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

---

## (I) The final-review fix round — what changed, and what is now true _(appended 2026-10-21)_

**Appended, not a rewrite: sections (A)–(H) stand as written, except for the two
targeted amendments named below.** The final review of this branch returned "changes
required" — one **MUST FIX** (a false ✅ in an owner-facing record) and three
**SHOULD FIX** items. This section records what this round did about each of them,
what it measured, and the two places where the existing text had to be corrected.

**The commits.**

| sha        | subject                                                                                | files                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `0fa9f6fa` | docs(songoskriti): record the unsupported-template escalation for the final review fix | the escalation record's **§(m)** — written **before** the code was touched |
| `537cbd38` | fix(songoskriti): make the preview's unsupported-template state reachable               | `src/lib/theme-preview-nav.ts`, `src/routes/theme-preview.$key.tsx`, `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` (**NEW**) |
| (this one) | docs(songoskriti): make the evidence match the tree after the final-review fix         | this file                                                                                                                          |

### (I.1) The MUST FIX — the archive row's ✅ was false, and is now true

**What was false.** The §(B) row claimed an unsupported template produces the
**explicit unsupported state**; in the shipped tree it did not. Two measured causes:
`validateThemePreviewSearch` dropped every `?template=` value that is not one of the
nine template keys (`src/lib/theme-preview-nav.ts:264-268`), and the host computes
its unsupported state from a **missing** key
(`src/components/store/ThemePreviewFrame.tsx:575-578`) while the engine assembles a
body for all nine known keys — so the branch was **dead code** and `?template=archive`
still landed on the homepage.

**What changed** (the escalation record's **§(m)** carries the exact hunks, written
before the edit):

1. `src/lib/theme-preview-nav.ts` — the route's search validation now **carries** the
   requested key (`unsupportedTemplate`) instead of dropping it. The carried value is
   bounded and **key-shaped** (≤64 characters, `[A-Za-z0-9][A-Za-z0-9_-]*`): the host
   **prints** the key inside the panel, so markup and unbounded strings are never
   echoed back. `template` keeps its old meaning (a key the platform knows), so the
   existing pin in `src/lib/theme-preview-nav.test.ts:610-612` still holds unchanged.
2. `src/routes/theme-preview.$key.tsx` — the route hands the **requested** key to the
   host, so the host's own partial lookup turns it into the panel.
3. `src/lib/theme-preview-nav.ts` — `previewSearchForSwitch` clears the request, so an
   answered request never lingers in the URL.

**Is the state genuinely reachable now? YES — and here is the proof.** The new suite
`src/lib/themes/songoskriti/unsupported-template-state.test.tsx` (9 cases) walks the
**URL path**, not a hand-made map:

| #   | case                                                                                                     | what it pins                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | the route's search validation carries an unknown key instead of dropping it                             | `validateThemePreviewSearch({template:"archive"}).unsupportedTemplate === "archive"`                  |
| 2   | bounds the requested key: only a key-shaped token is carried                                           | markup, a 65-character string and `""` are **not** carried; a 64-character key is                    |
| 3   | an unknown `?template=` reaches the host and renders the explicit unsupported state                     | the panel's heading, the **named key**, `href="/"` and "Back to the home tab"                        |
| 4   | the homepage composition does **NOT** render in place of the unsupported state                          | the homepage's own copy is in the `index` render and **not** in the unsupported render              |
| 5   | the unsupported state carries none of the retired demo strings                                         | none of "Demo page", "Demo search", "Meet the makers", "Sample product", "Demo"                     |
| 6   | a template the theme authors still renders its own body                                                 | the `search` template renders its own composition and **no** panel                                    |
| 7   | the assembled templates carry the nine keys and not the requested one                                  | the map has **9** keys and no `archive` key — the missing key is what the panel comes from          |
| 8   | the request ends with the visit — a switch clears it from the URL                                       | `previewSearchForSwitch` clears `unsupportedTemplate`                                                 |
| 9   | the route hands the requested key to the preview host                                                    | the **route's own** `Route.options.validateSearch({template:"archive"})` carries the key, and the route's source hands it to the host |

**The suite fails without the fix** — measured: with the engine's carry reverted, **6
of the 9 cases fail** (`Tests 6 failed | 3 passed (9)`), including the route-module
case. The engine's generic demo body ("Demo page. The live theme authors this
template…", `src/lib/theme-preview-nav.ts:367`) is a **different** surface — it is the
body of a **known** key a theme did not author — and it is **not** what an unknown key
renders (case 5).

**The two targeted amendments to the sections above** (both are corrections of a
statement that had become false, not rewrites of the sections):

- **§(B)** — the archive row's evidence cell now states what is true and says, in the
  cell, that the ✅ was false until this fix (§(I.1)).
- **§(C)** — the "Also untouched, by rule" list named `src/lib/theme-preview-nav.ts`;
  a dated note under it records that this round edited that file and
  `src/routes/theme-preview.$key.tsx`, and that every other file in the list is still
  untouched.

### (I.2) The three SHOULD FIX items

1. **The narrowing State B introduced is now stated** — a **new §(C) row** names it: the
   themed search page's pager, result count, sort control and active-filter chips reach
   the theme **only** through the granted sections (`result_toolbar`, `filter_chips`,
   `pagination`), never through the `productSlot`; a body that publishes a
   `product_grid` but no `pagination` section loses the pager, and page 2+ becomes
   unreachable. **The matching note in the route's own comment was NOT written** —
   `src/routes/store.$slug.search.tsx` is outside this round's owner-approved file
   set (the escalation record's §(m.3)); §(C) says so in place of the edit.
2. **§(H.2)'s "still 24 of the 60"** — a **one-line correction** now points at §(D),
   where the measured number is **42 of the 60**.
3. **The preview-only sentence in the shipped `product` body**
   (`src/lib/themes/songoskriti/preview.ts:192`) — **recorded, not fixed**, as the new
   **§(G.3) OPEN item**: the fix needs the seeded body **and** the preview host, and
   neither file is in this round's owner-approved set. The escalation record's §(m.7)
   carries the same residual.

### (I.3) The scope — the governing statement

The escalation record's **§(e)** still reads "This record escalates exactly four
existing files". It is **not** rewritten (that record is append-only); the **governing
statement** is the escalation record's **§(j.7)** ("six D4 files, two theme-owned
files, one new-suite file") plus its **§(m.3)** (this round's two files and one new
test file). The escalation record's **§(m.6)** carries the same note on its own side.

### (I.4) The measurements — run from the repo root

```
node_modules/.bin/vitest run src/lib/themes/songoskriti/unsupported-template-state.test.tsx
# → Test Files  1 passed (1) / Tests  9 passed (9)

node_modules/.bin/vitest run src/lib/themes/songoskriti \
  src/components/builder/songoskriti-port-freeze.test.tsx \
  src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/BlogArchiveTheme.test.tsx \
  src/components/store/ThemeChrome.route-content.test.tsx \
  src/components/store/PageView.twin-wiring.test.tsx
# → Test Files  35 passed (35) / Tests  432 passed (432)
#   (34 files / 423 tests before this round; +1 file, +9 tests — the new suite)

node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts src/lib/theme-variation-preview.test.ts
# → Test Files  2 passed (2) / Tests  50 passed (50)

node_modules/.bin/prettier --check src/lib/theme-preview-nav.ts \
  src/routes/theme-preview.$key.tsx \
  src/lib/themes/songoskriti/unsupported-template-state.test.tsx
# → All matched files use Prettier code style!

node_modules/.bin/eslint <the same three paths>
# → no output (0 errors, 0 warnings)

node_modules/.bin/tsgo --noEmit
# → no output, exit 0
```

**The three known-red gates and the known local flake are unchanged** — they are the
pre-existing conditions §(F) lists, and this round neither ran nor changed them.

---

## (J) The URL the server SERVES — the closing round _(appended 2026-10-21)_

**Appended, not a rewrite: sections (A)–(I) stand as written**, except the one
amendment the task allows — the §(B) archive row's evidence cell, amended
**in place** with a dated note because it overstated what the **live** build
delivered. The escalation record's **§(n)** carries the same findings with
the exact hunks and citations.

### (J.1) What was still false, and what is true now

§(I.1) fixed the **chain inside one process**: the route's own `validateSearch`
carried the requested key and the route handed it to the host. **What it did
not prove is the URL the server answers with** — and the live build answered
`?template=archive` with a **307 to the bare path**, which renders the
**homepage composition**:

| what | live at `bd52c246` (measured 2026-10-21) | this tree (measured on a loopback dev server) |
| ---- | ---------------------------------------- | --------------------------------------------- |
| `GET /theme-preview/songoskriti?template=archive` | **307** → `location: /theme-preview/songoskriti` (the bare path, every query param dropped) | **307** → `location: /theme-preview/songoskriti?unsupportedTemplate=archive` |
| the followed document | **200, 204 824 bytes** — the **homepage** body (the panel heading **×0**, the homepage's `hero-festive` marker **×5**) | **200, 7 683 bytes** — the **panel** (the heading **×1**, the key named, the homepage body **×0**) |
| `GET /theme-preview/songoskriti?unsupportedTemplate=archive` | **307** → the bare path → the homepage | **200** — the panel |
| `GET /theme-preview/songoskriti?template=index` / `?template=search` | **200** (no redirect) | **200** (no redirect) — the nine authored keys are untouched |

**The cause was a NON-IDEMPOTENT search validation, not a missing feature.**
TanStack Router validates a route's search **twice** per request and then
serves the **canonical** URL, answering a **307** when it differs from the
requested one (`@tanstack/router-core/dist/esm/load-server.js:546-557`, on
`@tanstack/router-core@1.171.35`). The second pass read `search.template`
only — already `undefined` for an unknown key — and so **dropped the request
the first pass had carried**. The canonical URL was the bare path, and the
bare path is the homepage. The full citation chain is in the escalation
record's **§(n.2)**.

**The fix** is one hunk in `src/lib/theme-preview-nav.ts` (an
owner-approved file, already edited by the §(m) round): the requested key is
read from `search.template` **or** from the carried `search.unsupportedTemplate`,
so the validation is a fixed point. `template` keeps its meaning (a key the
platform knows), so the existing pin
`src/lib/theme-preview-nav.test.ts:610-612` still holds unchanged.

### (J.2) The scope of the claim — and the deployment boundary

- The **explicit unsupported state is what the preview renders** for an
  unknown `?template=` — the panel, naming the key, linking back to the home
  tab — and **not** the homepage composition. That is §(l.1)'s contract, and
  it now holds for the **URL the server serves**.
- The request settles on the **canonical** URL: `?template=archive` → **one
  307** → `?unsupportedTemplate=archive` → **200** with the panel. The hop
  stays because the route's search schema **must** carry the request under
  `unsupportedTemplate` (§(m.4)'s design, pinned by the suite's case 9) and
  the canonical search string is built from the validated search — so it can
  equal `?template=archive` only if `template` itself held the unknown key,
  which would break `src/lib/theme-preview-nav.test.ts:610-612`. The
  escalation record's **§(n.5)** carries the full argument.
- **The live build at `bd52c246` is still the old one.** The state is
  user-visible **from this commit onwards** — i.e. **after the branch is
  deployed**. Until then the live URL serves the homepage body, and this
  record says so rather than claiming otherwise.

### (J.3) The OPEN item this round measured but did NOT fix

**Status (2026-10-21, closing wave):** **KNOWN AND PINNED** — no longer an open
item. Three cases in `src/lib/themes/songoskriti/unsupported-template-state.test.tsx`
now pin the **current** behaviour, so a future change to it **flips a test** rather
than silently changing what the server serves. See §(K.2).

The **same** canonicalisation drops `?max=` — a search key the route's own
comment promises to keep (`src/routes/theme-preview.$key.tsx:161-163`).
Measured live: `GET /theme-preview/songoskriti?template=search&max=99900` →
**307** → `?template=search` (**`max` dropped**). **Cause:** the router's
default `parseSearch` parses `max=99900` as the **number** `99900`, and
`validateThemePreviewSearch` accepts `max` only as a **string**
(`src/lib/theme-preview-nav.ts:354-357`), so the second validation drops it.

**It is pre-existing** (it fails identically with the validator reverted, so
it is not part of the defect this round closed) and it is **not fixed here**:
it is a different contract, it would change a documented search shape, and no
pin covers it. **This round's suite deliberately does not pin it**, so a
future fix flips a test rather than silently changing behaviour. A fix would
need the validator to accept the number the router parses, or the route to
read `max` from the raw query rather than from the validated search.

### (J.4) The measurements — run from the repo root

```
node_modules/.bin/vitest run src/lib/themes/songoskriti/unsupported-template-state.test.tsx
# → Test Files  1 passed (1) / Tests  15 passed (15)      (9 cases before this round)

# the same suite with the validator reverted to the §(m) version:
# → Tests  3 failed | 12 passed (15)   ← cases 10, 11, 14 (idempotency, canonical URL, route render)

node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts src/lib/theme-variation-preview.test.ts \
  src/lib/themes/songoskriti/
# → Test Files  26 passed (26) / Tests  272 passed (272)

# §(I.4)'s command, re-run for this round (35 files / 432 tests before it):
node_modules/.bin/vitest run src/lib/themes/songoskriti \
  src/components/builder/songoskriti-port-freeze.test.tsx \
  src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/BlogArchiveTheme.test.tsx \
  src/components/store/ThemeChrome.route-content.test.tsx \
  src/components/store/PageView.twin-wiring.test.tsx
# → Test Files  35 passed (35) / Tests  438 passed (438)   (+6 cases — the canonicalisation)

node_modules/.bin/vitest run          # the whole suite
# → Test Files  2 failed | 600 passed | 1 skipped (603)
#   Tests  3 failed | 8549 passed | 3 skipped (8555)
#   The 3 failures are PRE-EXISTING and unrelated (src/lib/analytics-live-shape.test.ts,
#   src/lib/site.server.test.ts) — measured identically on a clean tree.

node_modules/.bin/tsgo --noEmit
# → no output, exit 0

node_modules/.bin/eslint src/lib/theme-preview-nav.ts \
  src/lib/themes/songoskriti/unsupported-template-state.test.tsx
# → no output (0 errors, 0 warnings)

node_modules/.bin/prettier --check src/lib/theme-preview-nav.ts \
  src/lib/themes/songoskriti/unsupported-template-state.test.tsx
# → All matched files use Prettier code style!
```

**The HTTP measurements** (a loopback dev server, `node_modules/.bin/vite dev
--port 3111`, and the live host through `nsenter -t 1 -n`) are in the
escalation record's **§(n.1)**, **§(n.3)** and **§(n.6)**.

---

## (K) The closing wave — the payment rails FIXED, the `?max=` quirk PINNED, and four decisions CLOSED _(appended 2026-10-21)_

**Appended, not a rewrite: sections (A)–(J) stand as written**, except for the
**four dated status amendments** named in §(K.0) below. The escalation record's
**§(o)** carries the same round's escalations, the exact hunks and the
corrections.

### (K.0) The four dated amendments to the sections above

| section                          | what changed                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **§(G.1)**                       | its status marker moved from **OPEN** to **FIXED (2026-10-21, see §(K.1))**, with a dated pointer and a dated **correction** to its "where it shows" paragraph |
| **§(J.3)**                       | its status marker moved from an open item to **KNOWN AND PINNED (2026-10-21, see §(K.2))**                                    |
| **§(E)**'s deferred-items table  | a dated note: **D2, D5 and D7 are now closed as decisions** — the deferrals stand, the questions are settled (§(K.3))            |
| **§(E)**'s "Also open" paragraph | a dated note: the payment defect is **fixed**, and the "the same defect is on the live checkout" claim is **corrected** (§(K.1)) |

No section above was rewritten, and no assertion was removed.

### (K.1) The payment-method radios — **FIXED**

**The commits.**

| sha        | subject                                                                              | files                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `337ef1f6` | docs(songoskriti): escalate the platform's payment-rails defect before the fix        | the escalation record's **§(o)** — written and committed **before** the code was touched                |
| `9eb581d0` | fix(platform): render a payment-method radio per method of the group                  | `src/components/builder/cart.tsx`, `src/components/builder/cart-payment-methods.test.tsx` (**NEW**), `src/lib/themes/songoskriti/unsupported-template-state.test.tsx`, `src/components/store/songoskriti-preview-compositions.test.tsx` |

**What changed.** `src/components/builder/cart.tsx:558-573` — the widget's grouping
became a lookup **by the group's LAYER**, from the same `groupMethods()` data the
component already had:

```diff
-  const grouped = groupMethods(cart.methods);
+  const byLayer = new Map<MethodLayer, PaymentMethodKey[]>(
+    groupMethods(cart.methods).map(
+      (group) => [group.layer, group.methods] as const,
+    ),
+  );
```

and `src/components/builder/cart.tsx:596`:

```diff
-        const keys = (grouped[group] ?? []) as PaymentMethodKey[];
+        const keys = byLayer.get(group) ?? [];
```

**Nothing else in the file changed** — the fieldset, the legend, the group headings,
the radio markup, the radio group name, the `checked`/`onChange` binding, the empty
state and the note are byte-identical.

**The correction to §(G.1)'s "where it shows".** §(G.1) said the defect was on
"the live checkout … the live checkout renders the same widget". **It does not.**
Measured on the tree:

| host                                                         | renders the `payment_methods` widget?                                                                                                                                             | the defect?                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| the theme preview's **checkout** tab                         | **yes** — granted (`src/components/store/ThemePreviewFrame.tsx:686-696`) and authored by the theme (`src/lib/themes/songoskriti/preview.ts:359`)                                   | **yes**                                                                 |
| the storefront's **cart** route (and its custom-host twin)    | **yes** — granted (`src/routes/store.$slug.cart.tsx:102-108`, `src/routes/cart.tsx:102-108`)                                                                                        | **yes**                                                                 |
| the storefront's **checkout** route (and its custom-host twin) | **no** — the route renders its **own** hand-built fieldset (`ast={null}`, `src/routes/store.$slug.checkout.tsx:415-421`), built from `groupMethods(offered)` and iterated **correctly** (`:570-604`) | **no** — that route's radios render one per method |

So the defect was **not** a preview-only artefact — it was in the platform's
**widget**, and the storefront's **cart** page grants it — but the production
**checkout** page was never affected.

**The security posture is unchanged, and it is asserted.** The rails still come
from the cart context (the **server's** quote), never from a theme prop; the totals
are still the server's; the widget still imports **no** theme module; the theme
still contributes **nothing** to the payment decision. The fix changes only **which
of the platform's own rails the platform draws** — `src/components/builder/cart-payment-methods.test.tsx`
case 8 ("keeps the platform in charge of the payment decision") asserts exactly
that.

**The proof — the new suite.** `src/components/builder/cart-payment-methods.test.tsx`
(**NEW**, 8 cases) renders the widget through `SectionRenderer` — the same path the
storefront's cart route and the preview use — over a cart context whose rails the
test chooses:

1. one radio per method the server offered (`["cod","bkash","nagad"]` → three
   radios, values `cod`, `bkash`, `nagad`);
2. the platform's own group headings and catalogue labels;
3. a radio per method of **each** group (one rail in each of the five groups → five
   radios, five headings, the platform's `METHOD_GROUP_ORDER`);
4. **a group with no methods renders NO radios** — and no heading (`["cod"]` → one
   radio; neither "Mobile wallets" nor bKash nor Nagad);
5. never offers a rail the server did not offer;
6. the empty state — no rails → the platform's empty copy, no fieldset, no radios;
7. the same radios on the storefront's **cart** host (`template="cart"`);
8. the platform stays in charge of the payment decision.

**Measured, before and after the fix** (the same file, the same command):

```
# BEFORE (the tree at 2f46c634, the new suite against the unfixed widget):
node_modules/.bin/vitest run src/components/builder/cart-payment-methods.test.tsx
# → Test Files  1 failed (1)
#   Tests  7 failed | 1 passed (8)
#   AssertionError: expected [] to deeply equal [ 'cod', 'bkash', 'nagad' ]

# AFTER (the tree at 9eb581d0):
node_modules/.bin/vitest run src/components/builder/cart-payment-methods.test.tsx
# → Test Files  1 passed (1)
#   Tests  8 passed (8)
```

**The preview now presents the platform-owned payment components** — the expert's
P0 item 4. `src/components/store/songoskriti-preview-compositions.test.tsx`'s
checkout case (which this programme created, per the escalation record's §(j.7))
now **asserts the radios**: the preview's authored checkout body renders exactly
`cart.methods.length` radio inputs, each carrying the platform's own radio-group
name and the synthetic cart's own method keys. That case's header comment — which
said the defect was "deliberately not asserted" — now says what is asserted and
why.

### (K.2) The `?max=` quirk — **KNOWN AND PINNED**

§(J.3) left the quirk **open** and **unpinned**. It is now **pinned** and no
longer open.

**The measured current behaviour** (the suite's own `canonicalPreviewHref` helper,
which reproduces the router's canonicalisation with the **real** router and the
route's own `validateSearch`):

| request                                                | the canonical URL the router serves           | the key         |
| ------------------------------------------------------ | -------------------------------------------- | --------------- |
| `/theme-preview/songoskriti?template=search&max=99900` | `/theme-preview/songoskriti?template=search`   | **dropped**    |
| `/theme-preview/songoskriti?template=search&q=jamdani`  | `/theme-preview/songoskriti?template=search&q=jamdani` | kept        |

**The cause**, unchanged: the router's default `parseSearch`
(`@tanstack/router-core/dist/esm/searchParams.js`, `parseSearchWith`) parses
`max=99900` as the **number** `99900` (`toValue`, `qss.js`), and
`validateThemePreviewSearch` accepts `max` only when it is a **string**
(`src/lib/theme-preview-nav.ts:354-357`) — so the second validation (the
canonicalisation's) drops it. The route's own comment
(`src/routes/theme-preview.$key.tsx:161-163`) promises the key survives; it does
not.

**The pin** — three cases appended to
`src/lib/themes/songoskriti/unsupported-template-state.test.tsx` (the suite this
programme created — §(m.3) — which §(n.4) grew from 9 to 15 cases, and which now
has **18**):

1. the validator accepts `max` as a **string** and drops it as a **number** — the
   quirk's mechanism, pinned at the unit;
2. the **canonical URL drops `?max=`** — the quirk's effect, pinned at the URL,
   with the exact canonical href asserted;
3. **`?q=` survives** the same canonicalisation — so the pin says which keys are
   affected and which are not.

**A future fix flips these three cases** (they assert the drop), so the change
would be visible as a red test rather than as a silent behaviour change.

### (K.3) The four open decisions — **CLOSED as decisions**

Each is now a decision with a reason, a follow-up path and a named home. The
plan's Decision Gate carries the same rulings (amended in place, dated).

#### D2 — the production checkout: **production checkout stays platform-owned**

- **The decision.** The production checkout route stays **platform-owned**: the
  theme contributes **tokens** only, and the platform's own form, the
  server-authoritative totals, the validation, the payment selection and the order
  state remain the platform's. The theme's `checkout` composition is an
  **authoring and preview** surface — it is the body the merchant authors and the
  body the preview shows, and it is **not** a production checkout shell.
- **The reason.** The route deliberately renders its own hand-built form and
  discards the theme's AST (`src/routes/store.$slug.checkout.tsx:415-421`,
  `ast={null}`) **because the form is server-quoted**: the totals come from
  `quoteCart`, the rails come from the server's availability, the validation and
  the order write are server-side. A theme composing the checkout shell would put
  theme code between the shopper and the server's authoritative money, payment and
  order state — which is exactly the boundary this programme exists to protect.
- **The follow-up path.** Letting a theme compose the checkout shell needs its own
  **escalation** (a new record, a new owner approval, and the §7 widening it would
  need) and a decision about which parts of the form may be theme-owned at all.
  It is **explicitly out of this programme's scope** — the evidence record's
  §(A) row for the expert's P0 item 4 is about the **preview**.
- **Where the follow-up lives.** The plan's Decision Gate (**D2**), this section,
  and the distinctness gate's `checkout` exception, whose `basis` names **D2**
  (`src/lib/themes/songoskriti/template-distinctness.ts:219-224`) — so the gate's
  basis stays honest about what the checkout template is.

#### D3 — the scope of the programme: **Songoskriti only**

- **The decision.** This programme is **Songoskriti only**, as the expert asked
  ("Songoskriti must be the proof"). The distinctness gate's **machinery** — the
  seven rules `R1`–`R7` — is theme-agnostic; its **data** is Songoskriti-specific
  (`SONGOSKRITI_TEMPLATE_EXPECTATIONS` and `SONGOSKRITI_APPROVED_EXCEPTIONS`,
  `src/lib/themes/songoskriti/template-distinctness.ts:132`, `:210`).
- **The reason.** Somvabona authors **three** surfaces — `index` (through
  `buildHomepageMain`), `collection` and `product`
  (`src/lib/themes/somvabona/preview.ts:52-90`) — and its `default:` branch
  returns `null`, so the other six templates fall through to the engine's
  **generic** body (`src/lib/theme-preview-nav.ts:396-440`). A gate with no
  Somvabona expectation table would either fail every Somvabona body or have to
  be weakened to mean nothing; the expert's bar was a Songoskriti proof, and a
  Songoskriti proof is what this programme delivers.
- **The follow-up path.** Extending the gate to Somvabona **adds its own
  expectation table** (and its own approved exceptions) — **new data, not new
  machinery**: the rules, the fixtures and the evaluation are already
  theme-agnostic.
- **Where the follow-up lives.** The plan's Decision Gate (**D3**), this section,
  and the table it would extend —
  `src/lib/themes/songoskriti/template-distinctness.ts:132` (a Somvabona table
  beside it, and a Somvabona gate module beside that).

**Citation corrected 2026-10-21 (record-accuracy pass) — D3's reason above
cited the wrong range for the engine's generic body.** It read
`src/lib/theme-preview-nav.ts:357-372`; that range is the **search-param
validator** (`search.max` and friends), not the generic body. The generic body
is **`src/lib/theme-preview-nav.ts:396-440`** — `GENERIC_TITLES` at `:413` and
the *"Demo page. The live theme authors this template — what you see here is
the engine fallback."* body at `:440` (verified by reading the file at
`4206f9a2`). The ruling itself is unchanged. The same citation is corrected in
the phase-2 plan's **D3** entry and in the closing wave A report.

#### D5 — the storefront reader blog: **"themeless by design" stands**

- **The decision.** The storefront's reader blog stays **themeless by design**.
  `src/components/store/BlogArchiveTheme.tsx` keeps its deliberate "theme purge
  Task 3" behaviour, pinned by `src/components/store/BlogArchiveTheme.test.tsx`.
  The theme's `blog` template is the theme's **editorial composition in the
  preview** and the **authoring surface**; it is not the storefront's reader.
- **The reason.** The purge was a deliberate product decision, not an accident:
  the file's own header says the render "stays generic for every key by design".
  Reversing it is a **product** change with **SEO and canonical implications** —
  the storefront's blog routes (`blog.index`, `blog.category`, `blog.tag`,
  `blog.author`, `store.$slug.blog.index`) own their canonical policy, and a
  themed reader would change what those routes publish about themselves. That is a
  different programme, not a detail of this one.
- **The follow-up path.** A **separate product change** (an SEO/canonical review
  plus the `BlogArchiveTheme` reversal), with its own escalation and its own
  evidence. It is **not** a follow-up task inside this plan.
- **Where the follow-up lives.** The plan's Decision Gate (**D5**), this section,
  and the distinctness gate's `blog` exception, whose `basis` names **D5**
  (`src/lib/themes/songoskriti/template-distinctness.ts:225-230`).

#### D7 — the storefront's widget-data delivery: **the storefront keeps not mounting widget data**

- **The decision.** The storefront keeps **not** mounting a `WidgetDataProvider`
  in this programme. The platform's **per-widget data delivery** on storefront
  hosts is a **platform-level feature with its own scope** — the expert put the
  widget architecture out of scope ("Do not redo the plugin registry or widget
  architecture"), and nothing in this programme depends on it: the storefront's
  live search results reach the theme through the route's `productSlot`, not
  through the widget-data pipeline.
- **The reason.** The consequence is already stated everywhere it matters:
  `facet_sidebar` is **preview-only** (its rows come from the widget-data
  pipeline, `source: "facets"`, `src/lib/widget-registry.ts:483-503`) and the
  distinctness gate records `search` as a **documented exception** whose basis is
  this decision.
- **The follow-up path.** A **platform-level widget-data delivery epic** — the
  per-widget data pipeline mounted by storefront hosts. **The gate's `search`
  exception must keep naming D7**, so the gate's basis stays honest while the
  decision stands; when the epic lands, that exception is revisited (the gate's
  `search` exception, `src/lib/themes/songoskriti/template-distinctness.ts:231-236`).
- **Where the follow-up lives.** The plan's Decision Gate (**D7**), this section,
  §(G.2) above, and the gate's `search` exception.

### (K.4) The measurements — run from the repo root

```
node_modules/.bin/vitest run src/components/builder/cart-payment-methods.test.tsx
# → Test Files  1 passed (1) / Tests  8 passed (8)      (7 failed | 1 passed before the fix)

node_modules/.bin/vitest run src/lib/themes/songoskriti/unsupported-template-state.test.tsx
# → Test Files  1 passed (1) / Tests  18 passed (18)     (15 before this round — the ?max= pin adds 3)

node_modules/.bin/vitest run src/components/store/songoskriti-preview-compositions.test.tsx
# → Test Files  1 passed (1) / Tests  8 passed (8)       (8 before — the checkout case is now STRONGER)

# the acceptance suite of §(I.4)/(J.4), plus this round's two suites:
node_modules/.bin/vitest run src/lib/themes/songoskriti \
  src/components/builder/songoskriti-port-freeze.test.tsx \
  src/lib/theme-preview-nav.test.ts src/lib/definition-of-done.test.ts \
  src/components/store/ThemePreviewFrame.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx \
  src/components/store/songoskriti-preview-page.test.tsx \
  src/components/store/BlogArchiveTheme.test.tsx \
  src/components/store/ThemeChrome.route-content.test.tsx \
  src/components/store/PageView.twin-wiring.test.tsx \
  src/components/builder/cart.test.tsx \
  src/components/builder/cart-payment-methods.test.tsx
# → Test Files  37 passed (37) / Tests  474 passed (474)
#   (the §(J.4) command alone: 35 files / 438 tests; +cart.test.tsx (25 cases)
#    and the new payment suite (8 cases))

node_modules/.bin/vitest run          # the whole suite
# → Test Files  2 failed | 601 passed | 1 skipped (604)
#   Tests  3 failed | 8560 passed | 3 skipped (8566)
#   The 3 failures are PRE-EXISTING and unrelated (src/lib/analytics-live-shape.test.ts
#   — 2, src/lib/site.server.test.ts — 1) — measured identically on a clean tree.
#   (the §(J.4) baseline: 603 files / 8555 tests; +1 file and +11 tests)

node_modules/.bin/tsgo --noEmit
# → no output, exit 0

node_modules/.bin/prettier --check src/components/builder/cart.tsx \
  src/components/builder/cart-payment-methods.test.tsx \
  src/lib/themes/songoskriti/unsupported-template-state.test.tsx \
  src/components/store/songoskriti-preview-compositions.test.tsx
# → All matched files use Prettier code style!

node_modules/.bin/eslint <the same four paths>
# → 13 problems (0 errors, 13 warnings) — all 13 are the PRE-EXISTING
#   react-refresh/only-export-components warnings on src/components/builder/cart.tsx's
#   own component declarations (13 before this round too); the three other files
#   are silent.
```

**The three known-red gates and the known local flake are unchanged** — they are the
pre-existing conditions §(F) lists, and this round neither ran nor changed them.

---

## (L) The parity re-freeze — **DONE**, and the storefront path **VERIFIED** _(appended 2026-10-21 by the closing wave B)_

This section closes the two items §(D) and §(H.2) left open: the **42 stale
captures / 84 files**, and the storefront criterion that could not be exercised
because no store wore Songoskriti. It is appended, not edited — every section
above it stands as written, and §(D)'s and §(H.2)'s own words are **still true**
about the state they described (the baselines *were* stale, and no Songoskriti
store *did* exist in the live database). What follows is the state **after**
this wave.

### (L.1) The read-only determination — which database the harness would have mutated

**The brief's premise was wrong, and the measurement is what matters.** The
brief said the harness *"activates the Songoskriti theme on a store in the
database configured by the repo's `.env.local`"* and that *".env.local points at
a hosted Supabase project"*, so that production (the docker instance) would be
somewhere else. Measured, read-only:

| side | what the repo actually configures | what it resolves to |
| --- | --- | --- |
| `.env.local` | `VITE_SUPABASE_URL=https://dummy.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=dummy` | **a placeholder that does not exist.** `getent hosts dummy.supabase.co` → no A record; a read-only `@supabase/supabase-js` probe of `merchants` / `store_themes` / `pages` against it returns `TypeError: fetch failed` for every table. The publishable key is the literal 5-character string `dummy`. |
| `.env` | `SUPABASE_URL=https://framebase.qubickle.com` | **the production self-hosted instance.** DNS → `88.99.250.99`, which is *this host's own public IP* (`/etc/hosts`: `88.99.250.99 Ubuntu-noble-latest-amd64-base.zst`); the host's openresty (`/usr/local/openresty/nginx/conf/conf.d/framebase-framique.conf`) serves `server_name framebase.qubickle.com` → `proxy_pass http://framebase_supabase` → `upstream framebase_supabase { server 127.0.0.1:8007; }` → the `framique-supabase-kong` container → the `framique-supabase-db` container. |

**The harness's database is therefore the production one**, through two
independent paths:

- **the mutating path** — `themeInstallFn` / `themeActivateFn`
  (`.e2e/helpers-songoskriti.ts:143-193`) call the real server functions,
  which use `supabaseAdmin` → `process.env["SUPABASE_URL"]` +
  `process.env["SUPABASE_SERVICE_ROLE_KEY"]`
  (`src/integrations/supabase/client.server.ts:40-41`) → **`.env`** → the
  production instance. (`.env.local` holds no `SUPABASE_URL` and no
  service-role key at all, so it cannot be that path.)
- **the authenticating path** — the real `/auth` form
  (`.e2e/helpers-songoskriti.ts:45-107`) drives the *browser* client
  (`src/integrations/supabase/client.ts:40-44`) → `import.meta.env["VITE_SUPABASE_URL"]`
  → **`.env.local`** → `dummy.supabase.co`, which resolves nowhere. So a run
  with the repo's own files could not even have minted a session, let alone
  reached production.

**The production side, read-only, for the record** (`docker exec
framique-supabase-db psql -U postgres -d postgres`):

```
MERCHANT|11111111-…|slug=framique|…        6 merchant rows:
MERCHANT|86a81175-…|slug=jhon-mark          framique, jhon-mark, cloudman-store,
MERCHANT|b1111111-…|slug=cloudman-store     flame-fashion-bd, akira, test
MERCHANT|b47532e5-…|slug=flame-fashion-bd
MERCHANT|ddac7eeb-…|slug=akira
MERCHANT|efd4030b-…|slug=test
THEME|0fdcbafc-…|m=ddac7eeb-…|Supershop|active=true
THEME|9b90cfed-…|m=ddac7eeb-…|Atelier|active=false
THEME|feac1471-…|m=ddac7eeb-…|classic|active=false
PAGE|d4a50222-…|company=66ce0421-…|slug=home|title=Que Demo Studio — Home|status=published
DOMAIN|flamelancer.com|m=b47532e5-…|status=active|primary=true
```

Three `store_themes` rows, **all on merchant `akira` (`ddac7eeb-…`), none of
them Songoskriti** — exactly the count and the owner the earlier records
report (§(D), `phase1-page-content-evidence.md` §A.6.1). One `pages` row, one
`merchant_domains` row (the live custom host), and **no** `storefront_pages`
row. This is production data with a live customer host attached.

**The determination, stated plainly: there is no separate hosted project, and
the database the harness would have mutated is the production instance.** On
the brief's own terms that is the "same data" branch, and the capture must not
be run against the configured database. The brief's escape hatch — *"you may
mutate … a demonstrably separate dev/staging project with no production
merchants in it"* — is what this wave used instead, and §(L.2) is that target.

### (L.2) The safe target — the repo's own throwaway stack, empty by construction

The repo already ships the sanctioned throwaway path, and the Phase-1 record
named it: `docker-compose.e2e.yml` + `docs/15-e2e/loopback-auth-setup.md`
§§1-3 ("mode B"). It is a **separate compose project** (`e2e-supabase`) with
its **own bridge network and its own volume**, four vendored images, and
published ports bound to `127.0.0.1` only. This wave brought it up with **no
host port publishing at all** (an override file *outside* the repo,
`/tmp/opencode/e2e-auth/override.yml`, resets `ports` — the repo file is
untouched), because `127.0.0.1:55432` is already held on this host by
`backend-postgres-1` and the sandbox shell is in a different network namespace
from the docker daemon.

The stack was built fresh: the sanctioned fresh-db pipeline
(`migration/0001_baseline.sql` → `supabase/docker/init/01-roles-and-extensions.sql`
→ `migration/0002…0026` → `supabase/migrations/*.sql`), the service-role
passwords set to `POSTGRES_PASSWORD` (the image's own init leaves them empty —
GoTrue and PostgREST cannot authenticate without this), the disposable
merchant created through the **real GoTrue admin API** and seeded with
`migration/0002_seed.sql` using its real uid.

**What that database contains (read-only) — and what it does not:**

```
MERCHANT|11111111-1111-4111-8111-111111111111|slug=frame19-demo|status=active
MERCHANT|b50a0000-0000-4000-8000-000000000001|slug=songoskriti-heritage|status=active
MEMBER|11111111-…|owner|active            (2 members, 2 merchants, 0 production merchants)
THEME|b410f858-…|m=11111111-…|name=Songoskriti|active=true   (1 row, after the harness ran)
```

**No production merchant, no production domain, no production theme, no
production page** — every row is the disposable seed or a row the harness
itself created during this wave. The production instance was re-read after
the run and is **byte-for-byte unchanged**: still exactly three `store_themes`
rows (Supershop active, Atelier, classic), still six merchants, still
`flamelancer.com` as the only domain, and **still no Songoskriti row**. The
production database was never written to, and no theme was activated on any
production merchant.

### (L.3) The re-freeze — the command, and what it produced

The app was started on **loopback only** against the throwaway stack
(`node_modules/.bin/vite --port 3020 --strictPort --host localhost`, with the
shell environment overriding `.env.local` — the mechanism
`docs/15-e2e/loopback-auth-setup.md` §3 records). The capture ran in **freeze
mode**: `PORT_CAPTURE_OUT` **unset** (so the spec's human stills go to the
frozen `reference/`, not to `after/`) **and** `--update-snapshots` (so the
machine baselines are rewritten) — the mode the spec documents at
`.e2e/songoskriti-port-parity.spec.ts:26-33`.

```bash
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  E2E_MERCHANT_EMAIL=e2e-merchant@example.invalid E2E_MERCHANT_PASSWORD='<throwaway>' \
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts \
  songoskriti-port-parity --update-snapshots
```

**Result: 60 passed, 1 skipped, 8.7 min.** The skip is the suite's own
pre-existing calibration entry (`chrome-mobile-drawer-375-bn.png`, recorded
`manual-review` in the manifest) — it is skipped by the spec's `SKIPPED` map,
not by this wave. The run includes the **activation helper smoke** test, which
really logged in through the real `/auth` form and really installed and
activated Songoskriti on the disposable store (the `store_themes` row above is
that test's product).

**The diff — measured, not assumed.** Every one of the **118** baseline files
(59 human stills in `reference/` + 59 machine baselines in
`.e2e/songoskriti-port-parity.spec.ts-snapshots/`) was compared against
`HEAD` pixel-by-pixel, using the spec's own thresholds
(`maxDiffPixelRatio 0.02`, per-pixel `threshold 0.2`):

| outcome | count | which |
| --- | --- | --- |
| **materially changed** (beyond the spec's own threshold) | **66** | 34 human stills + 32 machine baselines |
| changed but **within** the threshold | 8 | all 8 human stills (the 6 `product` stills at 0.004 %-0.86 %, `account-1440-bn` at 0.86 %, `cart-768-bn` at 1.83 %) |
| **byte-identical** | 44 | 17 human + 27 machine |

**The 42 human stills that changed are exactly the 7 templates §(D) predicted**
— `account`, `blog`, `cart`, `checkout`, `page`, `product`, `search`, 6 each
(widths 1440/768/375 × locales en/bn) — and **nothing else changed**: the
`index` stills (6), the `collection` stills (6), the two `index-*` variation
stills, the two mega-menu stills and the one mobile-drawer still are
**byte-identical** to the previous freeze. §(D)'s prediction is therefore
confirmed by measurement, and **no surface that was not expected to change
moved**.

**Why 42 human stills but only 32 machine baselines.** The two sets are
different captures of the same pages: the human still is `fullPage`, the
machine baseline is the **viewport** (1440×900). Ten of the 42 differences sit
**below the fold** (the 6 `product` relabels, `account-1440-bn`,
`cart-375-bn`, `cart-768-bn`), so the viewport pixels did not move beyond the
threshold and Playwright did not rewrite those machine baselines. That is the
expected consequence of the spec's own capture geometry, not a discrepancy.

**CORRECTION (2026-10-21, record-accuracy pass) — the "below the fold"
explanation above is FALSE, and its parenthesis is incomplete.** Measured on
the **committed** artefacts at `4206f9a2` — the 59 human stills in
`docs/superpowers/songoskriti-evidence/port/reference/` and the 59 machine
baselines in `.e2e/songoskriti-port-parity.spec.ts-snapshots/`, the pre-freeze
blobs taken from `a93ebfd2` with `git show`:

1. **Every still in the freeze is viewport-height, so there is no below-the-fold
   content at all.** All **59** human stills and all **59** machine baselines are
   exactly **900 px** tall — **22 × 1440×900, 19 × 375×900, 18 × 768×900** in
   **each** of the two directories (read from the PNG headers). The preview
   page's document height therefore **equals** the viewport height, and the
   `fullPage` capture and the viewport capture are **the same pixels**: under
   the spec's own comparator (Playwright's `pixelmatch`, `threshold: 0.2`) the
   **pre-freeze** human still and the **pre-freeze** machine baseline are
   identical for **all 59** files — **0** differing pixels, **0.000 %**.
2. **Every difference is inside the viewport.** All **42** changed stills have
   their materially differing pixels **within** the 900 rows — rows **92…899**
   (the comparator's differing-pixel rows; the lowest is `checkout-375-en` at
   row 92, the highest is row 899). Nothing in these captures is below the
   fold, because nothing is below the fold.
3. **The 10 machine baselines Playwright did not rewrite are the ones whose
   difference stayed inside the spec's ratio tolerance, and they still carry
   the pre-freeze pixels:** `account-1440-bn` (0.48 %), `cart-375-bn`
   (1.71 %), `cart-768-bn` (1.00 %), `cart-768-en` (1.43 %) and the six
   `product-*` stills (≤ 0.51 %) — every one **≤ `maxDiffPixelRatio` 0.02**.
   **The parenthesis above omitted `cart-768-en`**; the corrected list of ten is
   the one here.
4. **The table above counts in a stricter reading of the threshold than the one
   Playwright applies.** Under the spec's own comparator the 118 files split
   **64 materially changed** (32 human stills + 32 machine baselines), **10
   changed but within the threshold** (the ten listed above) and **44
   byte-identical** (17 human + 27 machine). The table's **66 / 8 / 44** comes
   from the **per-channel** reading of the same threshold (a pixel differs when
   **any** channel moves by more than `0.2 × 255 = 51`), and the table's own
   figures are that reading (`cart-768-bn` 1.83 %, `account-1440-bn` 0.86 %,
   `cart-375-bn` 3.19 %) — under it `cart-375-bn` and `cart-768-en` also exceed
   2 %, which is why the table lists eight where the comparator lists ten. The
   **machine** side is identical under both readings: **32** rewritten, **27**
   byte-identical.

**The mechanism, stated once: all 42 differences are inside the viewport; 10 of
them are small enough that the spec's own tolerance accepts them, and those 10
baselines are exactly the ones Playwright left in place.** A bare
`--update-snapshots` is Playwright's **`changed`** mode
(`node_modules/playwright/lib/program.js:395`), which rewrites a baseline only
when the comparator says the snapshot does not match
(`node_modules/playwright/lib/matchers/toMatchSnapshot.js:208-215`) — so a
difference **inside** the tolerance leaves the old baseline on disk.

**Why each surface changed — the new copy, fetched from the live preview:**

| template | now renders (verified in the served HTML) |
| --- | --- |
| `product` | "Sample product page — prices and stock are sample data, and …" (the old "Demo product page." is gone) |
| `page` | "Sample page — Songoskriti sizing and care" (the shared fixture "Demo page body." is gone) |
| `account` | "Rumana Haque (demo shopper)", "ORD-2451" (the studio rows "Demo Shopper"/"ORD-1001" are gone) |
| `blog` | "Browse the journal", "From the journal" (the old "Meet the makers" story is gone) |
| `cart` | the two platform commerce widgets over the Songoskriti synthetic cart — "Dhakai Jamdani Heritage Saree", "Order summary" |
| `checkout` | the authored checkout composition — "Checkout progress", "We accept" |
| `search` | the platform's six search widgets over the demo facets — "Search the collection", "page=2" (the old "Demo search" copy is gone) |
| `index`, `collection` | **unchanged** — byte-identical stills |

A grep for every retired demo string ("Demo page body.", "Demo shopper",
"ORD-2451" as studio data, "Meet the makers", "Demo search", "Demo product
page") returns **nothing** on the re-frozen surfaces.

### (L.4) The storefront path — verified against a real Songoskriti store

**This is the first time the storefront has been exercised against a store
that actually wears Songoskriti.** With the theme installed and active on the
disposable merchant, a CMS page was created in that store (a
`storefront_pages` row, the table the route reads —
`src/lib/storefront-search.server.ts:284-293`) carrying the merchant's own
copy and a unique marker (`FRAME19-CARE-2026`). The route was then requested
on the loopback host:

```
GET http://127.0.0.1:3020/store/frame19-demo/pages/care-guide
→ 200
→ <h1> count: 1  — "Care guide — handloom care for the pieces we weave"
→ the merchant's record rendered: "Every piece in this store is woven by hand
   in Tangail, on looms our weavers keep for a lifetime." … "Policy reference:
   FRAME19-CARE-2026."
→ demo copy present: []   (no demo string at all)
→ theme chrome: data-nav="songoskriti-desktop"
```

The server payload proves the theme, not just the copy: `themeKey:"songoskriti"`,
`tokens` = the Songoskriti design tokens (`accent #8B4513`, Playfair Display /
Inter), and `ast` = the Songoskriti `page` template (breadcrumb +
`page_content` + `footer_sitemap` + `rich_text`) — the page content is placed
in the theme's own `page_content` slot, not in a bare shell. The single
`<h1>` is `PageView`'s own title heading (`src/components/store/PageView.tsx:78`),
which is why the count is exactly one and not two.

**Artefact:** `docs/superpowers/songoskriti-evidence/port/storefront-page-frame19-demo.png`
— the rendered page, full page: the Songoskriti announcement bar and nav, the
breadcrumb "Frame19 Demo Store / Care guide — handloom care for the pieces we
weave" (the merchant's name, the merchant's page), the one `<h1>`, the
merchant's prose, the "MORE INFORMATION" block listing that page, and the
Songoskriti footer.

**What this does and does not prove.** It proves the **rendering path**:
a real store, a real CMS page row, the real Songoskriti theme, the real
`ThemeChrome` layout, the real `page_content` slot. It does **not** prove
anything about production: the live database still has no Songoskriti store
(§(L.1)), and the live host still 404s path storefronts
(`isBlockedPathStorefront`, `src/lib/storefront-host.server.ts:433-447`). The
production blast radius of this programme is therefore **unchanged** — still
the theme-preview route only — and the first merchant to activate Songoskriti
in production is still the first customer-visible moment.

### (L.5) The manifest, and what remains

**The manifest is re-frozen and consistent:** `reference-manifest.json` holds
**60** entries (59 `pass` + the one pre-existing `manual-review` entry for
`chrome-mobile-drawer-375-bn.png`, which has no baseline file by design), all
60 stamped with `freezeSha: a93ebfd29c4c` — **the tree the pixels were
rendered from** — and `generatedAt: 2026-10-21T03:29:23.742Z`. The spec
stamps the SHA it reads from `git rev-parse HEAD` at module load, so the
freeze SHA necessarily names the *parent* of the commit that carries the
baselines; that is the spec's design, not a drift.

**Amended 2026-10-21 (record-accuracy pass) — the manifest state above is the
state at `afde2871`, not at HEAD.** The committed manifest after `4206f9a2` is
stamped **`freezeSha: afde28712f8e`** and
**`generatedAt: 2026-10-21T03:43:55.648Z`** (60 entries — 59 `pass` + the one
`manual-review` — all 60 stamped `afde28712f8e`); the re-run that re-stamped
it is **§(L.6)**. Both `freezeSha` values are correct **for the tree that
carried the baselines at the time they were written** — `a93ebfd29c4c` is
simply no longer what the committed manifest says.

**The 84 stale files are no longer stale.** `reference/` and the snapshot
directory now hold the current programme's pixels, and the two directories
that §(D) named are the two directories that changed.

**CI is unaffected, exactly as §(D) said:** the parity suite is in neither
`e2e:critical` nor `e2e:security` (`package.json`), so nothing that gates
CI was waiting on this. It was a **parity-record** problem, and it is now a
**parity record** rather than a stale one.

**What still remains, stated exactly:**

1. **The baseline is now frozen against a throwaway store, not against
   production.** The preview route is synthetic and DB-free, so the pixels are
   the same either way — but a future owner pass that wants a *production-
   corroborated* freeze still needs a disposable store on a development
   database, the loopback server and the Playwright browsers. The exact
   command and the preconditions are in §(L.3) and in
   `docs/15-e2e/loopback-auth-setup.md` §§1-3.
2. **The storefront criterion is closed at the storefront level only.** The
   production storefront still cannot be exercised (no Songoskriti store in the
   live database, and the live host 404s path storefronts). That is a product
   fact about the live tenant, not a gap in the code path.
3. **The one `manual-review` entry stands** — the Bangla mobile drawer at
   375 px — unchanged, for the reason the spec already records.

### (L.6) The freeze is reproducible — an independent re-run changed nothing

A baseline is only worth keeping if a later run **passes against it**. The
same command was therefore run a second time, **without** `--update-snapshots`
— the ordinary owner-run form:

```bash
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  E2E_MERCHANT_EMAIL=e2e-merchant@example.invalid E2E_MERCHANT_PASSWORD='<throwaway>' \
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-port-parity
```

**60 passed, 1 skipped, 8.0 min — and `0` baselines re-generated.** Every one
of the **118** baseline files came back **byte-identical** to the committed
freeze: `git status` after the run lists **no** modified file under
`docs/superpowers/songoskriti-evidence/port/reference/` or under
`.e2e/songoskriti-port-parity.spec.ts-snapshots/`. The only file the re-run
touched is `reference-manifest.json`, and the only fields that moved in it are
`generatedAt` and `freezeSha` — the 60 entries are otherwise identical
(same outfiles, same URLs, same `pass` / `manual-review` statuses, same
thresholds, same `catalogue`).

**Amended 2026-10-21 (record-accuracy pass) — `0` baselines re-generated is
guaranteed by construction, so it is not the evidence; "60 passed" is.** A run
**without** `--update-snapshots` uses Playwright's default
`updateSnapshots: "missing"`
(`node_modules/playwright/lib/common/config.js:94`), and `toMatchSnapshot`
writes a baseline **only when the file does not exist**
(`node_modules/playwright/lib/matchers/toMatchSnapshot.js:198-199`) — an
existing baseline that differs **fails the test** instead of being rewritten
(`:216-220`, `:142-168`). So the meaningful result of the re-run is **60
passed, 1 skipped** — the committed freeze is *accepted* by the suite — and
not "0 re-generated", which the `missing` mode guarantees whether or not the
render is deterministic.

So the freeze is **reproducible** on this environment: the same tree renders
the same pixels, the committed baselines match a fresh render **within the
spec's own thresholds** (`maxDiffPixelRatio` 0.02, `threshold` 0.2), and the
suite that produced them is green against them. `freezeSha` now names the
commit that **carries** the baselines (`afde28712f8e`), which is the tree that
renders these pixels — the source code is identical to the tree the freeze was
first captured from (`a93ebfd2`; the intervening commit changed baselines and
documents only, no `src/`), and the re-run proves the pixels are the same.

**Amended 2026-10-21 (record-accuracy pass) — "match a fresh render exactly"
was too strong, and the sentence above now says what the evidence supports.**
The comparison is **within the spec's thresholds**, not exact: **10** of the 59
machine baselines still differ from the fresh render — `cart-375-bn` (1.71 %
under the spec's comparator; 3.19 % under the per-channel reading),
`cart-768-en` (1.43 % / 2.42 %), `cart-768-bn` (1.00 % / 1.83 %),
`account-1440-bn` (0.48 % / 0.86 %) and the six `product-*` baselines
(≤ 0.51 % / ≤ 0.86 %) — every one of them **inside** `maxDiffPixelRatio` 0.02,
which is exactly why Playwright accepted them and left the files alone (§(L.3)).
The remaining **49** machine baselines are byte-identical to the committed
freeze: the **32** that were rewritten *are* the fresh render's pixels
byte-for-byte (Playwright wrote the rendered buffer to the file), and the
**17** that were never rewritten are the ones whose fresh render matched within
the same thresholds. The same measurement, method and numbers are in
**§(L.3)**'s correction.
