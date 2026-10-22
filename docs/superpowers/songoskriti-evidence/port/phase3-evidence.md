# Phase 3 — the evidence record: seven first-class templates, the account dashboard, the checkout shell, the variants, the lanes

**Branch:** `frame30` · **Base commit:** `182c37b5` · **Tip at the time of writing:** the tip of the final-fix round (see the CI record §5 for the push)
**Recorded:** 2026-10-22
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — Tasks 1–10
**Escalation record (every §7 relaxation, with the exact diffs):** `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md`
**Self-critique record (the three weakest failures, the three fixes, the re-capture):** `docs/superpowers/songoskriti-evidence/port/phase3-self-critique.md`
**The remote-CI statement (Task 10):** `docs/superpowers/songoskriti-evidence/port/phase3-ci.md`

---

## 0. How to read this record

This record states **what shipped, how it was verified, and what is still
open**. It is deliberately conservative: where a number is a measurement, the
command that produced it is named; where something was **not** verified here,
it says so and says why. Two findings in this programme are **reported, not
absorbed** — §4.1 and §4.2.

---

## 1. What shipped

**Seventeen commits** on `frame30`, from `182c37b5` to the tip of this
batch — **fifteen** that carry the code, and the **two** documentation
commits of Task 9 and Task 10 (this record and the CI statement):

| #     | commit                                                           | what it landed                                                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `24957520`                                                       | the **`archive` template key**: the union, the ten exhaustive maps, the hand-written `z.enum`, the seven catalogue allowlist rows, the SEO/weight tables, the editor's three label maps, and the package rule `templates.archive_requires_api` |
| 2     | `8051b21e`                                                       | the **archive's route-owned context** (`src/lib/archive-context.ts`) and its host (`src/components/store/ArchiveView.tsx`); the three platform taxonomy surfaces keep the platform's grid                                                      |
| 3     | `c27521e7`                                                       | the archive's **ordered composition is frozen**, and the registry seed merge keeps the merchant's variants                                                                                                                                     |
| 4     | `09071bef`                                                       | the **account dashboard** (`src/components/store/AccountDashboard.tsx`) — nav, overview, profile, structured order rows                                                                                                                        |
| 5     | `fdd654ff`                                                       | the **production checkout shell** — the theme's composition around the platform's own form                                                                                                                                                     |
| 6     | `2f4eb2f5`                                                       | the account and checkout **lose no control**: the profile card, the payment picker, the totals and the order view                                                                                                                              |
| 7     | `8e76fe81`                                                       | the **validated blog and archive variants**, authorable in the editor (`src/lib/template-variants.ts`)                                                                                                                                         |
| 8     | `4fd6b9c4`                                                       | the **per-template persistence isolation**, the **reset-to-default affordance**, and preview-parity with the storefront                                                                                                                        |
| 9     | `9705a67e`                                                       | the reset restores a variant, the publish gate enforces the closed vocabulary, and the preview renders a variant                                                                                                                               |
| 10    | `f085bc5c`                                                       | the reset hands back the **stored** map, so the editor's document and the stored document are the same bytes                                                                                                                                   |
| 11    | `040b89be`                                                       | the **test lanes**: the seven-template editor journey, the storefront-surface assertions and the archive distinctness                                                                                                                          |
| 12    | `26ff6fd2`                                                       | the escalation record's fix-round section (docs only)                                                                                                                                                                                          |
| 13    | `3ee3fe1e`                                                       | the escalation record's measured evidence for the fix round (docs only)                                                                                                                                                                        |
| 14    | `3e8f1237`                                                       | the two defects the lanes found: the studio survives a variant, and the article route keeps its two slugs                                                                                                                                      |
| 15    | `0a794b54`                                                       | the three fixes from the self-critique pass                                                                                                                                                                                                    |
| 16–17 | the two documentation commits of this batch (Task 9 and Task 10) | the docs that match the shipped contracts, and the CI statement                                                                                                                                                                                |

**The measured size of the change:** `git diff --shortstat 182c37b5..HEAD` →
**80 files changed, 17 959 insertions(+), 1 955 deletions(-)** — of which the
4 851-line escalation record is the single largest file. By area: `src/lib` 35
files, `src/routes` 14, `src/components` 14, `docs` 9, `.e2e` 6, `src/hooks` 1,
`src/routeTree.gen.ts` 1 (generated).

**No new npm dependency, no lockfile change, no migration, no DDL, no new
environment variable.** The `templates` column is `jsonb`, so a new template
key is a new object in an existing map — nothing in the database changed.

### 1.1 The seven surfaces, and what each one now is

| surface    | what shipped                                                                                                                                                      | the platform's authority, unchanged                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `search`   | the theme's search composition around the platform's result block; the band's `<h1>` reads the **declared** `heading` (fix 3 of the self-critique)                | the query, the result limit, the tenant scope                                                       |
| `cart`     | the theme's cart body around the platform's cart widgets                                                                                                          | the lines, the totals, the rails                                                                    |
| `account`  | a **designed dashboard**: five `?tab=` destinations, the overview, the profile, structured order rows, and the order detail disclosed in place                    | the session, the `customer_overview` RPC, every write                                               |
| `checkout` | the theme's **shell** around the platform's own form; the route supplies its own payment picker and its own summary when the theme's body carries neither         | the form, the customer fields, the server quote, the stock hold, the order write, the payment rails |
| `blog`     | two **variants** — `blog_listing` and `blog_article` — resolved through the same storefront seam                                                                  | the articles, the article body, the paging                                                          |
| `archive`  | the **content archive** — `archive_category`, `archive_tag`, `archive_author` — a real key with its own zone row, editor entry, package rule and distinctness row | the term, the records, the facets, the paging                                                       |
| `page`     | the theme's frame around the merchant's own CMS record                                                                                                            | the page record, its body, its SEO                                                                  |

### 1.2 The editor, the publishing path and the persistence

- **The template selection** is the studio's switcher (`TEMPLATE_META`,
  `src/components/builder/BuilderTopBar.tsx:11`) with a **second level** for
  the variants (`templateVariantEntries`,
  `src/lib/template-variants.ts:214-226`) — the vocabulary is closed, so the
  switcher can only offer a suffix the platform routes to.
- **The controls are schema-generated.** The inspector is built from the
  catalogue's `fields` (`src/lib/widget-props.ts`), and the client and the
  server call the **same** validator, so what the merchant sees is what the
  publish gate checks.
- **Per-template isolation** is structural: one AST per template key, and the
  new suite `src/lib/template-persistence-isolation.test.ts` proves that
  saving one template does not touch another.
- **The reset-to-default affordance** restores **one** template (or one
  variant) to the theme's own default. It is destructive, so it is armed
  before it fires (`src/routes/_authenticated/dashboard/builder.tsx:1574-1609`),
  and it hands back the **stored** map so the editor's document and the
  stored document are the same bytes.
- **The publishing path** lints **every** variant **with its base key**
  (`lintTemplateMap`, `src/lib/themes.server.ts:859-865`), so a variant AST
  can never reach a merchant's storefront unlinted. The seed merge fills
  only the keys the merchant's map does not carry
  (`src/lib/themes.server.ts:1394-1404`), and a theme update carries the
  variants because the merge and the diff walk the whole map.

---

## 2. How it was verified

### 2.1 The unit and contract suites

`node_modules/.bin/vitest run` — **619 test files: 616 passed, 1 skipped, 2
failed. 8 769 tests: 8 763 passed, 3 skipped, 3 failed.**

The three failures are **pre-existing and environment-bound**, and they are
**not** this programme's:

- `src/lib/analytics-live-shape.test.ts` (2) — the fake warehouse rows the
  adapters read do not match this box's warehouse shape.
- `src/lib/site.server.test.ts` (1) — the "missing-env" guard needs the
  local `.env` absent, which CI does not have; the phase-0 implementation
  map records the same failure and the same reproduction
  (`docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md:428-450`).

Both fail at the base commit `2f4eb2f5` in the same environment — the
escalation record carries the side-by-side baseline
(`phase3-archive-key-escalation.md:4139-4148`).

**Two deltas, and they are not the same measurement.** The first is the **last
batch's** delta: from that mid-programme baseline (`2f4eb2f5`, **613** files /
**8 701** tests) to the tip of this batch it is **+6 test files and +68 tests,
with 0 new failures**. The second is the **programme's** delta, measured from
the programme's real base — **`182c37b5`**, the commit this record names as
the base — and it is the one that describes what the programme shipped.

**The programme's base, measured in a clean worktree** (`git worktree add
/tmp/opencode/frame28-base 182c37b5`, then `node_modules/.bin/vitest run` in
it): **604 test files** (602 passed, 1 skipped, 1 failed) and **8 566 tests**
(8 560 passed, 4 skipped, 2 failed). The one failing file there is
`src/lib/analytics-live-shape.test.ts` — the same warehouse-shape failure.
(The `src/lib/site.server.test.ts` "missing-env" guard **passes** in that
worktree because the worktree has no `.env`; it fails in this tree because this
tree has one. That is the environment difference the phase-0 implementation map
already records, and it is why the base's failure count is **two**, not three.)

**The programme's delta from its base:** **+16 test files and +212 tests** at
the tip of this round — **15 new `src/` test files plus the final-fix round's
own contract suite** (`src/lib/themes/songoskriti/composition-props.test.ts`),
**+3 new `.e2e` specs** (outside the vitest count), and **13 existing `src/`
test files + 3 existing `.e2e` specs touched** — **34 test files** in all.
**0 new failures** were introduced by the programme: the tip's failures are the
same environment-bound ones the base has.

### 2.1.1 The suites the final-fix round added

| suite                                                  | what it pins                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/themes/songoskriti/composition-props.test.ts` | every prop the theme authors, on **every** composition (the ten templates and the two variants), is a **declared** field **and survives `parseTemplates`** — the defect class behind the archive's "Collection" band label — plus the archive's rendered label itself |

**The new suites that carry the programme's contracts:**

| suite                                                              | what it pins                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/template-key-contract.test.ts`                            | the union, the hand-written `z.enum`, the seven catalogue rows that carry `archive`, the three label maps, and the package rule `templates.archive_requires_api` |
| `src/lib/template-variants.test.ts`                                | the closed variant vocabulary and the variant-then-base resolution                                                                                               |
| `src/lib/archive-context.test.ts`                                  | the closed archive kinds and the derived, never-fetched context                                                                                                  |
| `src/lib/preview-parity.contract.test.ts`                          | for the seven templates, the context slots the preview grants equal the ones the storefront grants — with the differences **named**                              |
| `src/lib/publish-migration.contract.test.ts`                       | the publish path, the variant linting and the seed merge                                                                                                         |
| `src/lib/theme-seed-merge.test.ts`                                 | the per-key seed merge never overwrites a merchant's template                                                                                                    |
| `src/lib/template-persistence-isolation.test.ts`                   | saving one template does not touch another                                                                                                                       |
| `src/lib/themes-reset.contract.test.ts`                            | the reset restores exactly one template, to the stored bytes                                                                                                     |
| `src/lib/account-status.test.ts`                                   | the account surface's state mapping, in every combination                                                                                                        |
| `src/lib/checkout-shell.contract.test.ts`                          | the checkout route still calls the server functions; the theme's AST contributes no input and no form                                                            |
| `src/components/store/account-dashboard.contract.test.ts`          | every account nav destination is a `?tab=` value on the same route, and the dashboard reads only the fields the RPC returns                                      |
| `src/lib/themes/songoskriti/template-distinctness.archive.test.ts` | the archive's distinctness row is **non-empty** and rejects the engine's generic body                                                                            |

### 2.2 The browser lanes

Two lanes were written by Task 7 and one by Task 8. They were run on the
repo's **throwaway** stack (`docker-compose.e2e.yml`, project `e2e-supabase`,
`http://127.0.0.1:58000`) with a **disposable** merchant — never against the
configured database, whose `.env` routes to the production container.

| lane                              | file                                           | what it drives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the seven-template editor journey | `.e2e/songoskriti-seven-templates.spec.ts`     | for each template: open the real editor, select it, insert and reorder a widget, change a real inspector property, preview desktop/tablet/mobile, save, reload, publish, open the real storefront route, verify the saved composition and the route context — then the documented empty / error / unauthenticated / unavailable cases. **It skips when the merchant credentials are absent and reports the skip as a skip**; it never fakes a session.                                                                                                                                                                                         |
| the storefront-surface assertions | `.e2e/songoskriti-storefront-surfaces.spec.ts` | the eight production surfaces, with no auth: the search result count equals the platform's own, the cart renders the theme's body, the account renders the unauthenticated state for an anonymous visitor and the dashboard for a signed-in one, the blog listing and the article render **different** compositions, the checkout renders the theme's shell around the platform's form, the archive routes render the **platform's grid** with the resolved term's name as the one `<h1>` and **no** theme composition while the preview route **does** render the theme's archive body, and the page route renders the merchant's own record. |
| the self-critique capture         | `.e2e/songoskriti-self-critique.spec.ts`       | the seven surfaces at the six widths, in both locales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Two defects were found by these lanes and fixed** (Batch D, `3e8f1237`):

1. **The studio crashed on every variant.** The canvas breadcrumb indexed the
   base-only label map with the selected identity, so selecting
   `Archive category` replaced the whole page with the route's error
   boundary. Measured in Chromium on the throwaway stack.
2. **The store-scoped blog article route answered 404 for every article.**
   The route file declared **two** path parameters of the same name
   (`$slug` twice), so TanStack Router matched both segments into one key
   and the loader read the _store's_ slug as the _article's_ slug. The row
   was visible to the very same anon query the loader makes, and the route
   still answered 404 — with no `render_read.failed` event, which is what
   proves the loader never reached the article query.

Both fixes are recorded with their exact diffs in the escalation record
(§(n.2)), and both were re-verified by the lanes afterwards.

### 2.3 The self-critique capture — the widths and the stills

**84 stills**: 7 surfaces × 6 widths (**1440 / 1280 / 768 / 430 / 390 /
375**) × 2 locales. The capture waits for the surface's own content before it
screenshots (a per-surface marker plus a stable-DOM wait) — the first run
returned two **blank white** images, and a blank image is not evidence, so the
whole first pass was re-taken from scratch.

**Where the stills live:** `/tmp/opencode/frame30-self-critique/` — a
**scratch** directory, deliberately **never** `reference/`, because
`reference/` is the owner's re-freeze (§4.2).

The comparator is the parity harness's own: `maxDiffPixelRatio: 0.02`,
`threshold: 0.2` — read **out of** `.e2e/songoskriti-port-parity.spec.ts` at
run time, so the two can never drift. The per-surface measurement of the
re-capture against the first capture:

| surface    | max diff ratio | mean diff ratio |
| ---------- | -------------- | --------------- |
| `search`   | 1.0000         | 0.3348          |
| `cart`     | 0.0000         | 0.0000          |
| `account`  | 1.0000         | 1.0000          |
| `blog`     | 1.0000         | 1.0000          |
| `checkout` | 0.0000         | 0.0000          |
| `archive`  | 0.0000         | 0.0000          |
| `page`     | 0.0000         | 0.0000          |

The four surfaces that were **not** fixed are **pixel-identical** — a diff
ratio of exactly `0.0000` on every one of their twelve captures. The three
that **were** fixed carry a non-zero diff, and the size of that diff is a
**layout measurement**, not a "how much changed" measurement: the `search`
fix moves one band, and it measures **0.0020 (0.2 %)** at four of the six
widths — below the harness's own tolerance — and 1.0000 at the two narrow
widths where the new title wraps and everything below it moves; the
`account` fix **removes** a block, so the page moves up; the `blog` fix
**adds** a header, so the page moves down.

### 2.4 The distinctness gate

The Songoskriti distinctness gate (`src/lib/themes/songoskriti/template-distinctness.ts`)
carries seven rules and a **compile-total** table over the template keys. The
archive's row is **not empty**: it requires `category_header`, `blog_terms`,
`blog_archive`, `blog_pager`, `pagination` and `empty_state`, and it forbids
`product_grid` (the grid reads the host's product slot, which an archive does
not have), `heading` (the archive is a route-`<h1>` template) and `rich_text`
(no demo copy that could impersonate the merchant's content). A table that
quietly drops a template is a gate that quietly stops guarding it — so the
archive row is declared, and the gate's own "every template a theme does not
author is rejected as generic" loop is re-run for the new key.

---

## 3. The local gate results

The environment has **no `bun` on `PATH`**, so each `bun run …` form is
invoked as its `node_modules/.bin/…` or `node scripts/…` equivalent. These
are the actual results, measured on **2026-10-22** at `0a794b549315`:

| the CI job                                                | the local command                                 | the actual status                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-typecheck`                                          | `node_modules/.bin/tsgo --noEmit`                 | **green** — no output, exit 0                                                                                                                                                                                                                                               |
| `lint-typecheck`                                          | `node_modules/.bin/eslint src scripts`            | **green** — exit 0: 0 errors, 319 pre-existing warnings, none added here. A repo-wide `eslint .` stalls on the untracked `.output-snapshots/` tree, so the paths are linted instead.                                                                                        |
| `unit-contract`                                           | `node_modules/.bin/vitest run`                    | **red on three pre-existing, environment-bound failures** — 620 files: 617 passed, 1 skipped, 2 failed; 8 778 tests: 8 772 passed, 3 skipped, 3 failed (§2.1)                                                                                                               |
| `unit-contract`                                           | `node scripts/doc-gate.mjs`                       | **green** — `0 findings`, exit 0                                                                                                                                                                                                                                            |
| `unit-contract`                                           | `node scripts/contract-gate.mjs`                  | **EXPECTED RED**, exit 2 — the script hardcodes `spawnSync("bunx", …)` and `bun` is not on `PATH` here. Pre-existing; not fixed, not hidden.                                                                                                                                |
| `scan`                                                    | `node scripts/secret-scan.mjs`                    | **not run here** — it sweeps the whole tree and the untracked `.output-snapshots/` directory holds 110 MB of build output; the prior record's local findings inside that tree are a known local artefact, not a source finding. CI runs it on a clean checkout.             |
| `scan`                                                    | `node scripts/sast-scan.mjs`                      | **not run here** — the same whole-tree sweep, with the same `.output-snapshots/` caveat.                                                                                                                                                                                    |
| `scan`                                                    | `node scripts/dep-audit.mjs`                      | **not run here** — it needs the registry/network reachability this box does not have for the audit endpoint.                                                                                                                                                                |
| `build`                                                   | `node_modules/.bin/vite build`                    | **green — exit 0**, at the tip of this round (see §3.1 below for the measured output).                                                                                                                                                                                      |
| `e2e-critical` / `e2e-security` / `e2e-levelb-production` | the Playwright suites                             | **partially run here** — the programme's own three lanes ran on the throwaway stack (§2.2); the platform-wide suites were not re-run in this batch, and the seven-template journey **skips** without merchant credentials, which is reported as a skip and never as a pass. |
| `plugin-storefront-gate`                                  | —                                                 | **not run here** — it is a CI job over the plugin storefront and needs the CI environment.                                                                                                                                                                                  |
| asset gate                                                | `node scripts/songoskriti-assets-check.mjs`       | **green** — `0 findings`, 11 advisory notes                                                                                                                                                                                                                                 |
| asset generator                                           | `node scripts/gen-songoskriti-assets.mjs --check` | **green** — 21 planned assets match the frozen expectation                                                                                                                                                                                                                  |
| schema fingerprint                                        | `node scripts/schema-fingerprint.mjs --check`     | **EXPECTED RED**, exit 1 — it needs a live Supabase RPC (`rpc failed (400)`). Pre-existing; not fixed, not hidden.                                                                                                                                                          |

### 3.1 The build, measured — and the reason it was never run, corrected

**The earlier reason was false.** This record said the build was _"not run here
— the build writes into the same untracked `.output-snapshots/` tree"_. It does
not. `vite.config.ts` sets **no** `build.outDir`, and the TanStack Start + Nitro
plugin writes the build to **`.output/`** — a gitignored directory (`.gitignore`
line 4). `.output-snapshots/` holds dated **snapshot copies** of a build of the
base commit (`snap_20261021T041306Z_182c37b`, and an earlier
`snap_20261021T013330Z_2f46c63`); nothing writes into it.

**So the build is now run at the tip, and it passes.** The tip's commits —
including the route-file rename (`store.$slug.blog.$slug.tsx` →
`store.$slug.blog.$articleSlug.tsx`) and the regenerated
`src/routeTree.gen.ts` — have now been bundled, which they had never been.

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

| the measurement                      | the value                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| the **exit status**                  | **0** — the build succeeds                                                                                              |
| the **output directory**             | **`.output/`** — the client assets at `.output/public/assets/`, the server bundle at `.output/server/`                  |
| the **bundle size**                  | **55 MB** in total, **1 332** files: **5.50 MB** of client JS, **0.32 MB** of client CSS, **14.38 MB** of server `.mjs` |
| the largest client chunk             | `index-*.js` at **608 KB** (the framework + router entry)                                                               |
| the other client chunks worth naming | `analytics-*.js` 388 KB, `SectionRenderer-*.js` 332 KB, `editor-*.js` 304 KB, `builder-*.js` 284 KB                     |

**Why it matters.** `build` is a **hard gate** in the remote pipeline: the
`e2e-critical`, `e2e-security` and `e2e-levelb-production` jobs all carry
`requires: build`, so a failed build fails the workflow with those three jobs
left `blocked`. The tip had **never** been bundled; it is now.

### 3.2 The owner-run `gates:release` chain — every step's status

The chain is `assets:songoskriti && perf:budget && seo:weight && a11y:gate &&
vitals:gate && responsive:sweep && console:gate && rhythm:gate && design:gate
&& doc:gate && e2e:browsers` (`package.json`). It is **owner-run**, not a CI
job, and each step was measured here. **Three are green** — `assets:songoskriti`,
`seo:weight` and `doc:gate` (the asset *generator* is not one of the chain's
eleven steps); **seven are not runnable on this box**, and `console:gate` is
**skipped, not passed** — every non-green step for a stated reason, and each of
those needing the build or the loopback stack.

| the step             | the command                                 | the measured status                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets:songoskriti` | `node scripts/songoskriti-assets-check.mjs` | **green** — `0 findings`, 11 advisory notes                                                                                                                                                                                                                                                                                                                                |
| `perf:budget`        | `node scripts/perf-budget.mjs`              | **not runnable here** — exit 2, _"perf-budget: no Vite manifest under dist. Run `bun run build` first."_ The gate reads the **Vite manifest under `dist/`**; this repo's build writes to **`.output/`** (TanStack Start + Nitro), so the manifest the gate wants is not the one this build produces. Needs the build/loopback stack.                                       |
| `seo:weight`         | `node scripts/seo-weight-gate.mjs`          | **green** — exit 0, _"seo-weight gate OK — storefront imports and render reads satisfy Phase 7"_, with the warning _"dist manifest absent; source contracts ran, admin chunk check requires a completed build"_. The source contracts ran; the admin-chunk half needs a completed build.                                                                                   |
| `a11y:gate`          | `node scripts/a11y-gate.mjs`                | **not runnable here** — exit 1, every navigation `net::ERR_CONNECTION_REFUSED at http://localhost:8080/…`. It drives a **live server**.                                                                                                                                                                                                                                    |
| `vitals:gate`        | `node scripts/vitals-gate.mjs`              | **not runnable here** — exit 1, _"vitals-gate: no product URL found for store \"frame19-demo\". Seed the store or set E2E_PRODUCT_SLUG."_ It needs a **seeded store on the loopback stack**.                                                                                                                                                                               |
| `responsive:sweep`   | `node scripts/responsive-sweep.mjs`         | **not runnable here** — exit 1, `net::ERR_CONNECTION_REFUSED at http://localhost:8080/…`. It drives a **live server**.                                                                                                                                                                                                                                                     |
| `console:gate`       | `node scripts/console-gate.mjs`             | **skipped, not passed** — exit 0, _"console gate skipped — no authenticated session available for /admin. Inject a session, or set GATE_EMAIL / GATE_PASSWORD to sign in through /auth."_                                                                                                                                                                                  |
| `rhythm:gate`        | `node scripts/rhythm-gate.mjs`              | **not runnable here** — exit 2, _"Dev server at http://localhost:8080 did not answer after 15 probes."_ It needs the **loopback dev server**.                                                                                                                                                                                                                              |
| `design:gate`        | `node scripts/design-gate.mjs`              | **not runnable here** — exit 2: the source scan ran (_"files: 67, findings: 29"_) and then the gate died on `Cannot find module '/opt/frame28/src/lib/seo-technical' imported from /opt/frame28/src/lib/marketing-seo.ts`. The script is a **`bun` script** (`bun scripts/design-gate.mjs`) and `bun` is not on `PATH` here, so Node cannot resolve the TypeScript import. |
| `doc:gate`           | `node scripts/doc-gate.mjs`                 | **green** — `0 findings`, exit 0                                                                                                                                                                                                                                                                                                                                           |
| `e2e:browsers`       | `node scripts/browser-smoke.mjs`            | **not runnable here** — exit 2, _"Browser support gate requires E2E_STORE_SLUG for a seeded storefront with at least one in-stock product."_ It needs the **seeded storefront**.                                                                                                                                                                                           |

**These seven are "not runnable here", not "red".** None of them is a finding
about this programme's code: each one needs a live server, a seeded store, or
`bun`. **No claim is made for any of them.**

**The three reds in the CI table above are the three the plan named**, and none
of them was fixed to go green.

---

## 4. The two findings this programme did **not** absorb

### 4.1 The shipped Songoskriti theme cannot be published by a merchant

**Measured:** the shipped theme's own copy is **76 % বাংলা** against the
platform's publish floor of **90 %** (`TRANSLATION_PUBLISH_FLOOR = 90`,
`src/lib/builder-guardrails.ts:148`). A merchant publish of that theme is
therefore **refused**, with `theme.publish_blocked codes=translation`.

This is **not** absorbed and **not** worked around:

- The E2E journey asserts the contract in **both** branches — a theme that
  meets the floor publishes, a theme that does not is refused — and it
  **never** converts the refusal into a pass.
- The rule is the platform's deliberate one: _"a theme that is more than 10 %
  untranslated cannot go live half-Bangla."_
- The **unblock is an owner action**, and there are exactly two of them:
  **(a)** translate the remaining **~36 strings** of the theme's own copy, or
  **(b)** rule on whether the floor applies to a **source-owned official
  theme** — which is **installed from source** by the owner rather than
  published by a merchant, and is therefore a different act from a
  merchant publishing a third-party package. Which of the two the owner
  chooses is the owner's ruling; this programme does not make it.

### 4.2 The parity baselines are stale — and the impact is wider than the plan stated

The plan predicted that the captures which go stale are the **account**,
**checkout** and **blog** ones. **The measured impact is wider**, and the
record states the measurement rather than the prediction:

- **The `archive` template has no machine baseline at all.** The parity
  harness's `TEMPLATES` list now has **ten** entries, but the snapshot
  directory holds **59** files covering the **nine** older templates. The
  archive's six captures (3 widths × 2 locales) therefore have nothing to
  compare against and the harness's `toHaveScreenshot` for `archive` **fails**
  until the owner re-freezes.
- **The `page` baselines went stale as well.** The plan did not name `page`;
  it changed too (the theme's page frame now wraps the merchant's record).
- **The `account` baseline is out of tolerance**, and so is `page`. Against
  the harness's own threshold (`maxDiffPixelRatio: 0.02`) the measured diff
  ratios — from the Task 7 parity comparison, Batch D — are **0.03** for
  `account` and **0.06** for `page`. Both are beyond tolerance, i.e. the
  frozen images no longer match what the surfaces render.

**The re-freeze is an owner action, on the throwaway stack, never against
the configured database** (Decision Gate **G3**). The exact command and the
preconditions:

```
# 1. the throwaway stack — NEVER the configured .env, whose SUPABASE_URL
#    routes to the production database container (report.md §5.1 D6)
docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env up -d
docker ps --format '{{.Names}}' | grep e2e-supabase
# 2. the migrations, then the disposable merchant, then the app
/tmp/opencode/e2e-auth/apply-all.sh
/tmp/opencode/e2e-auth/run-app.sh          # answers http://localhost:3020
# 3. the re-freeze — the ONLY run that writes the baselines
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-port-parity --update-snapshots
```

**Preconditions, all of them required:** the loopback stack is up and the
migrations are applied; the app runs against `VITE_SUPABASE_URL=http://127.0.0.1:58000`;
the merchant is **disposable**; the run uses `--update-snapshots` **once**,
deliberately. The human captures in
`docs/superpowers/songoskriti-evidence/port/reference/`, the manifest
`docs/superpowers/songoskriti-evidence/port/reference-manifest.json` and
the machine baselines in `.e2e/songoskriti-port-parity.spec.ts-snapshots/`
are **untouched** by every commit in this programme — measured:
`git diff --name-only 182c37b5..HEAD` over those three paths returns **zero
changed files** for each. The only stills this programme wrote were into
the **scratch** directory of §2.3.

---

## 5. The remote CI

**The remote CircleCI run for this branch cannot be verified from this
environment.** There is no CircleCI API token and no
`~/.circleci/cli-config.yml`, so the workflow can be neither triggered nor
observed here; `https://circleci.com/` answers `200`, so the limitation is
**authentication, not connectivity**. The push to `origin/frame30` **does**
trigger the pipeline, and every gate CI runs was run locally with the
commands and results recorded in §3 — but **no claim of a green remote run
is made**, and the brief's DoD item 10 is reported as
**UNVERIFIED-FROM-HERE, not as passed**.

The full statement, with the measurement that settles it, is in
`docs/superpowers/songoskriti-evidence/port/phase3-ci.md`.

---

## 6. What remains open

| #   | the open item                                                                                                                                                                          | whose action             | why it is open                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | the shipped Songoskriti theme's 76 % বাংলা against the 90 % floor                                                                                                                      | **owner**                | translate ~36 strings, or rule on the floor for a source-owned official theme (§4.1)                                                                                                                                                                                                                                    |
| 2   | the stale parity baselines — the six `archive` captures with no baseline, plus `account` (0.03) and `page` (0.06) out of tolerance                                                     | **owner**                | the re-freeze needs the throwaway stack and a disposable merchant (§4.2)                                                                                                                                                                                                                                                |
| 3   | the remote CircleCI run                                                                                                                                                                | **owner**                | no token, no CLI config; the run's URL and result are the owner's to open (§5)                                                                                                                                                                                                                                          |
| 4   | the merchant-scoped content-archive route (`/store/<slug>/blog/category/<slug>`)                                                                                                       | **a follow-on**          | the three existing content-archive routes carry no store slug and therefore cannot resolve a theme; the `archive` key's storefront render path in this programme is the editor and the theme preview host, both merchant-scoped by construction. This is a **deferral**, stated in the plan's own terms, not a shortcut |
| 5   | the three platform context widgets render in the platform's own generic type language (the `cart_summary`'s uppercase letterspaced "ORDER SUMMARY", the checkout's "PLACE ORDER" slab) | **escalated, not fixed** | they are platform-side renderers outside this programme's boundary; the theme can only choose not to place them, which would cost the page its own labels                                                                                                                                                               |
| 6   | the account surface's anonymous state still cannot show a profile                                                                                                                      | **escalated, not fixed** | it is the widget's own contract (`src/components/builder/account.tsx`, outside the boundary); the self-critique's fix 2 removed the **duplicate** sign-in block, not the widget's behaviour                                                                                                                             |

**No acceptance criterion is claimed as passed on the strength of this
record.** Every green above is a command that was run and whose output was
read; every red is a red, with its reason; and the two that are neither —
the remote CI and the parity re-freeze — are named as the owner's.
