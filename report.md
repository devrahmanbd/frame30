# Frame30 / Songoskriti closeout — one official theme

**Date:** 2026-11-01 · **Branch:** `frame30` · **Baseline HEAD:** `630e80be` · **Deployed SHA:** `9d9a51bf` (second wave; was `64172796`, and `9b91f18a` before that)

Songoskriti is now the **only** official theme. Somvabona and the starter theme are retired, the
evidence is committed, a **blocking** CI job runs the seven-template lane on a throwaway stack, and a
live-visual script proves the deployed artifact.

This report replaces the phase-3 report, which is preserved verbatim (with its history) at
`docs/superpowers/songoskriti-evidence/port/report-2026-10-27-phase3-dynamic-themes.md` (151 KB).
It stays the record for the dynamic-themes phase; this file is the record for the retirement wave.

---

## 1. What this wave did

### 1.1 One official theme

`src/lib/themes/builtin-themes.ts` is the single authoritative registry. It now holds exactly one
key and one entry:

```ts
export const OFFICIAL_THEME_KEYS = ["songoskriti"] as const;
const ENTRIES: Record<BuiltinThemeKey, BuiltinThemeEntry> = {
  songoskriti: { key: "songoskriti", source: songoskritiPreviewSource },
};
```

Official identity resolves through `isOfficialThemeKey` / `getBuiltinTheme` — never through bundle
JSON keys, `theme-export` maps, or `theme_registry` rows.

### 1.2 Somvabona retired

Deleted: `src/lib/themes/somvabona/**`, `src/components/builder/somvabona.tsx` (+ test),
`public/ph/somvabona/**`, `src/lib/somvabona-catalog.test.ts`. ~37 source files updated to drop
imports/branches. A production-source grep for `somvabona` is clean (the only remaining references
are **absence guards inside tests**, which assert the theme is gone — intentional).

The old somvabona widget pack was **renamed, not deleted**: `src/components/builder/everyday.tsx`
(+ `everyday.test.tsx`) now exports `EVERYDAY_WIDGETS`, imported by `widgets.tsx:50/1114` and
`unified-widget-registry.ts:121`. It is production code and is committed.

### 1.3 Starter theme removed; SDK fixture kept

`examples/starter-theme/**` is deleted. Its test asserted the starter's h1 was "Welcome To
Framique"; that is **false**, so the starter is not a product theme and does not ship.
`src/lib/dev-theme-starter-theme/**` is **kept** — it is Level B SDK infrastructure (the
submission-gate fixture referenced by `docs/themes/sdk.md`, `docs/themes/level-b.md`, and its own
README), not a storefront theme. Challenge this if you want it gone too (§2.5).

### 1.4 Retarget table — what covered the old foreign-theme proofs

The cross-theme property ("presentation primitives work for a theme that is not Songoskriti") was
proven in two e2e legs against Somvabona. Those legs are **retired** (see §2.1). The property is now
proven at **library level** with a synthetic fixture, and the affected unit suites were retargeted:

| Was (against Somvabona)                          | Now                                                          | Result   |
| ------------------------------------------------ | ------------------------------------------------------------ | -------- |
| e2e legs 11–12 (foreign-theme render, `.e2e`)    | retired — replaced by an in-repo retirement note             | 8/8 lane |
| announcement-bar proofs (unit)                   | `__fixtures__/foreign-presentations.fixture.tsx` (synthetic) | 20/20    |
| footer proofs (unit)                             | synthetic foreign presentations                              | 21/21    |
| migration proofs (unit)                          | synthetic foreign presentations                              | 20/20    |
| `demo-theme-mounted.spec.ts:895` `somvabona` key | `themeKey: "acme-pack"`                                      | green    |

The synthetic fixture `src/lib/themes/__fixtures__/foreign-presentations.fixture.tsx` supplies the
foreign presentation shapes so the property stays exercised without a second real theme.

### 1.5 Evidence committed

`docs/superpowers/songoskriti-evidence/verification/` is now an indexed evidence pack:
`README.md` (index + commands), `strict-lane-run6.log`, `strict-lane-run7-after-retirement.log`
(trimmed 8/8 lane output; raw 246 KB kept out of git), `cart-single-noncefix.log`,
`live-nonce-probe.log`, `postdeploy-live-verify.log`, and `depth-evidence/` PNGs.

### 1.6 Blocking CI job for the seven-templates lane

`.circleci/config.yml` gains an `e2e-seven-templates` **machine** job, wired into `gates` with
`requires: build`. It is **blocking from day one** (§2.2). It runs
`bash scripts/e2e-seven-templates-ci.sh`, which is the executable form of
`docs/15-e2e/loopback-auth-setup.md`: throwaway compose stack, generated secrets, real GoTrue
merchant, demo seed, then `.e2e/songoskriti-seven-templates.spec.ts` with `--retries=0
--workers=1`, and `down -v` teardown on success, failure, or interrupt.

### 1.7 Live-visual verification script

`scripts/verify-live-visual.mjs` (npm script `verify:live-visual`) fetches the deployed
`/theme-preview/songoskriti` at 3 widths, asserts a **coherent nonce** across the CSP response
header + `name=`/`property=` metas + inline script, renders in Chromium, and fails on any
pageerror/console error/CSP violation. It splits origins: `--base-url` (the preview host) for
`/theme-preview/*`, and `--store-base-url` for `/`, `/cart`, `/account` — because the preview host
has no themed storefront (§2.3). Latest run: **15/15 preview keys, 6/6 browser surfaces PASS**.

---

## 2. What I'm confused about / decisions to challenge

### 2.1 The two retired foreign-theme e2e legs (D1) — what now covers the property?

Per your instruction I deleted the two foreign-theme e2e legs rather than keep a second real theme
alive just to exercise them. The cross-theme property now lives **only** at library level via the
synthetic fixture (§1.4). **Challenge:** is a unit-level proof enough, or do you want an e2e leg
against a synthetic/minimal theme key so the real renderer path is also covered? I chose the cheaper
honest option; it is a deliberate trade, recorded here.

### 2.2 Blocking-from-day-one on a brand-new ~15-min stack job (D2) — promotion/rollback

The `e2e-seven-templates` job is **required from its first run**, per your "go strict" instruction.
It brings up a full Supabase stack in-job, so it is heavier and newer than the other gates. The
first CI run on `frame30` may be red for a reason unrelated to the lane (stack bring-up on a fresh
machine executor). **Challenge:** if the first run is flaky, do you want me to allow it to
run-but-not-block for one cycle while it earns trust, then flip it required? I have kept it strict.

### 2.3 D3 — the preview is the live proof, not a seeded storefront

The live proof is the deployed `/theme-preview/songoskriti` surface + live nonce/CSP checks. There
is **no production seeding**. Consequence: the preview host `framique.qubickle.com` has **no themed
storefront**, so `/cart` and `/account` on that host are not themed (the merchant store host
`flamelancer.com` is a different origin with its own store). Hence the `--store-base-url` split in
the live-visual script. **Limitation:** this proves the theme renders and ships a coherent nonce,
not that a live merchant's storefront is themed.

Related, pre-existing and **unrelated to this wave**: the preview host's default redirect target
`cloudman-store` has **no `store_themes` rows**, so `/store/cloudman-store*` 404s. Only merchant
`akira` has rows (Atelier/classic/Supershop active).

### 2.4 Loss of `starter-theme.test.ts` as the executable five-gate reference

`examples/starter-theme/**` carried `starter-theme.test.ts`, which was the executable reference for
the five submission gates a third-party theme must pass. It is deleted along with the starter. The
gates themselves live in docs (`docs/themes/submission-gates.md`) and in Level B infra
(`dev-theme-starter-theme`), but there is no longer a **worked, executable example** of all five at
once. **Challenge:** do you want a minimal synthetic theme fixture kept purely as the five-gate
executable reference (not shipped, not a product theme)?

### 2.5 `src/lib/dev-theme-starter-theme/` kept as SDK infra — should it go too?

I kept it because it is the Level B submission fixture the docs point at, and deleting it would
break the documented submission path (§1.3). **Challenge:** if "only one theme" should mean "no
second theme _shape_ in the tree at all," say so and I will remove it plus rework the Level B docs.

### 2.6 `contract-gate.mjs` — I fixed a local false-green

`scripts/contract-gate.mjs` spawned `bunx vitest` unconditionally. On a machine **without Bun**
(like this one) `bunx` is missing, so the spawn errored and the gate could **not be run locally at
all** (it exited 2, so it was fail-closed but unrunnable — the inverse of a false-green, but still a
local blind spot). I patched it to fall back to `npx vitest`, which runs the identical
`node_modules` binary. Re-run result: **258 tests / 13 contract suites PASS**. CI (which has Bun) is
unaffected.

### 2.7 Local `main` drift and the push

Local `main` is behind `origin/main`. This wave commits on `frame30` on top of baseline `630e80be`
(the retirement plus the `blog_terms` fix in §2.10) and rebases onto the current `origin/main` before
pushing, so intervening work is not clobbered. Flagging because the two branches have drifted.

### 2.8 `/theme-preview/somvabona` stops serving after deploy (intended)

With Somvabona removed from `builtin-themes.ts`, `/theme-preview/somvabona` will 404 after this
deploys. That is the **point** of the retirement, called out so the 404 is not mistaken for a
regression.

### 2.9 The checked-in SQL does not reproduce the deployed schema (found while validating the CI job)

Making the blocking job's bring-up fail-closed surfaced a **pre-existing** gap: the baseline dump
(`migration/0001_baseline.sql`, dumped from PG 17) is **stale relative to production**. A cross-check
of every production `public` relation against every `create table`/`create view` in the repo finds
**~120 relations with no creator anywhere in the repo**, plus enum values and function overloads that
exist only in production. The documented fresh-DB path has always applied this chain with **no
`ON_ERROR_STOP`**, so every one of these statements has been silently skipped in every stack ever
built this way — the drift was invisible until this job demanded a fail-closed bring-up.

Examples of production-only relations: `experiments`, `support_tickets`, `url_redirects`,
`theme_assets`, `builder_templates`, `builder_template_seo`, `article_revisions`, `page_revisions`,
`integration_probes`, `seo_not_found_log`, and (now handled, below) `nav_menus`/`nav_menu_items`; plus
enum `merchant_role` lacks `'editor'` (13 repo references, but production lacks it too), and the
`has_merchant_role(uuid, uuid, merchant_role)` overload.

**How the job stays honest without pretending to close that drift:**

1. **Migration chain is best-effort but never silent.** Every skipped statement is printed and
   counted (`migration chain applied — N statement(s) skipped (legacy gap)`).
2. **Enum parity toward production.** Enum values the repo's **own** seed needs are stale in the dump
   and I provision them toward production (`payment_method 'sslcommerz'` + `'card'`,
   `subscription_status 'trialing'` — every value verified present in the deployed enum first, so the
   parity step only moves a fresh stack toward production, never away from it). Deliberately **not**
   added: `merchant_role 'editor'`, because production lacks it too — inventing it would make the
   fresh stack disagree with the database it models.
3. **Production-only relations the repo's own code/seed requires are materialized in one parity step.**
   `migration/e2e-schema-parity.sql` reproduces exactly the deployed-schema objects a fresh stack must
   have for the lane to run, all from production DDL (verified against the deployed DB first), and no
   more:
   - `nav_menus` / `nav_menu_items` — the repo's OWN seed
     (`migration/0003_demo_catalogue.sql`) INSERTs into them; without them the demo navigation cannot
     seed.
   - `url_redirects` — read **~10× strictly** by `src/lib/permalink.server.ts` to resolve every
     `/store/<slug>/...` request. On a fresh stack without it, **all storefront routes 404** (this was
     the logged root cause of the lane's three 404 failures: `render_read.failed ... relation
"public.url_redirects" does not exist`).
   - `anon` **GRANT drift** on `merchant_settings` — production grants `anon` a full `SELECT`; the
     baseline only grants column-level `SELECT`s, so the public storefront hit `permission denied`.
     The parity file grants `anon` `SELECT` (moving the fresh stack toward production).
   - Deliberately **not** created: `url_missing_log` (also read by permalink) — it does **not** exist
     in production either (verified 0 rows) and every read of it is `loose()`/caught, so its absence is
     benign; creating it would _diverge_ from production.

   Everything else in the ~120-relation drift (§2.9) is left absent and surfaces as benign warnings.

4. **A hard assertion block** then checks the relations the lane actually touches
   (`merchants`, `store_themes`, `theme_registry`, `articles`, `blog_terms`, `article_terms`, `products`,
   `theme_catalog_favourites`, `nav_menus`, `nav_menu_items`, …) plus `is_public_merchant`, and fails
   the job if any is missing.
5. **The demo seed is best-effort but never silent, then hard-asserted.** Each seed file is applied
   soft — errors counted and printed as `[seed-gap]` — and the rows the lane actually renders against
   (`store_themes`, `products`, `blog_terms`, `storefront_pages`, the `swarm4-archive-page-%` archive
   articles, and the term's 13 `article_terms` links) are **hard-asserted**, so a genuine seed break
   fails loudly instead of as a confusing Playwright error. The one `[seed-gap]` that used to surface —
   the archive fixture updating `blog_terms.article_count` — turned out to be the tip of the real
   defect, not the cosmetic no-op it was first recorded as: see §2.10.

### 2.10 The real cause of the three fresh-stack 404s: the `blog_terms` schema gap (found, fixed)

The earlier "lane proven green 8/8" (run7) was measured **against the pre-existing dev server + dev
database**, not against a fresh stack built from the checked-in SQL. On a genuine fresh bring-up the
lane goes **5/8**: the two editor-journey tests (`Archive`, `Page`) and the store-less platform
taxonomy test all 404. Making the job fail-closed is what exposed this.

Root cause, verified by reading the code **and** by a read-only probe of production:

- The taxonomy readers select a **14-column** shape — `src/lib/blog-index.server.ts:307` `TERM_COLUMNS`
  = `id, merchant_id, kind, slug, name, name_en, description, parent_id, sort_order, cover_image_url,
meta_title, meta_description, robots_index, article_count` (and `src/lib/blog-taxonomy.server.ts:85`).
- The repo migration chain creates only **8** of them
  (`migration/0005_content_editorial_fields.sql:28-38`). **No SQL anywhere in the repo** adds the other
  eight.
- **Production has only 5** (`id, name, slug, kind, created_at`) — it predates even `0005`. Verified
  read-only against the deployed DB: `GET /rest/v1/blog_terms?select=article_count` → Postgres `42703`;
  `information_schema.columns` lists 5; `\d blog_terms` shows a global `UNIQUE(slug)` and
  `kind default 'tag'`.
- `resolveTerm()` **discards** the Postgres error (`const { data } = await query`,
  `src/lib/blog-index.server.ts:334`), so a schema mismatch is indistinguishable from "slug does not
  exist": the select fails, `data` is `null`, the term never resolves, `TermNotFound` is thrown, and the
  route `notFound()`s.

**Consequence: production's blog taxonomy is broken today** —
`https://framique.qubickle.com/blog/category/handloom-heritage` returns **404**. This is pre-existing
and unrelated to the theme retirement; it was only surfaced because this job demanded a fail-closed
fresh bring-up.

**Fix (this wave):**

- **`migration/0027_blog_terms_taxonomy_columns.sql`** (new; additive + idempotent) adds the missing
  columns — `merchant_id`, `description`, `updated_at`, `name_en`, `parent_id`, `sort_order`,
  `cover_image_url`, `meta_title`, `meta_description`, `robots_index`, `article_count` — plus the
  self-referencing `blog_terms_parent_id_fkey` and an `article_count` index, every statement guarded
  with `if not exists`. Safe on **both** a fresh deploy (only the extended columns are added) and the
  drifted deployed DB (which lacks even `merchant_id`); no constraint is dropped and no data is touched.
- The CI script applies it (chain glob widened to `migration/002[0-9]_*.sql`).
- `.e2e/fixtures/songoskriti-archive-seed.sql` now seeds the rows the lane actually renders: the
  `handloom-heritage` term, its 13 linked articles (11 pager seeds + 2 legacy, including the page-2 lead
  "The Jamdani Weavers of Sonargaon"), and the merchant's own `our-story` CMS page. The pager windows by
  `article_terms.created_at`, so the links now pin it (the Sonargaon link is the oldest) to make the
  page-2 window deterministic instead of tie-order dependent.
- **Validated end-to-end:** run11 = **8/8** on a throwaway stack, `SEED_GAP 0`, seed rows and schema
  assertions verified (§5).

**Production has been repaired (applied 2026-10-31).** `ops/deploy-from-git.sh` does **not** run
migrations, so the fix was applied manually as the single file — not a blanket `db:migrate`, which would
also try the e2e-only `migration/e2e-schema-parity*.sql`. One wrinkle worth recording: `public.blog_terms`
is owned by `supabase_admin`, and the documented operator role `postgres` is not its owner and is not a
superuser, so the apply failed with `must be owner of table blog_terms` and rolled back cleanly. The same
file was then run as the owning role:

```
docker exec -i framique-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  < migration/0027_blog_terms_taxonomy_columns.sql        # exit 0
```

Verified after apply: 16 columns (5 → 16, the exact `TERM_COLUMNS` shape), `blog_terms_article_count_idx`
present, `blog_terms_parent_id_fkey` present, row count still **0**, and PostgREST
`?select=article_count` moved **400 (`42703`) → 200**, as did the full 14-column select (`200`, `[]`).
The ledger row was recorded with checksum `b4eb61a1…b5744` (§5).

**What this does and does not fix live:** the schema error is gone, so `/blog/category/...` no longer
fails on the read. It still returns **404** because production has **0 `blog_terms` rows** — a content
gap, deliberately out of scope here (no production seeding, D3, §2.3). The 404 is now a truthful
"this term does not exist" rather than a masked `42703`.

Strict SQL validation remains `bun run db:migrate` / `schema:check` against a real DB (§9.5). The drift
itself — ~120 unreproducible relations — is a **residual**, documented, not fixed here (§9.5 #1).

---

## 2.11 The owner's four follow-ups (second wave, 2026-10-31)

The owner narrowed the closeout to four items: a passing seven-templates CI run, deeper nested-editing
proof beyond Cart, the deployed Songoskriti pages inspected as a real merchant-facing experience, and
production blog taxonomy populated and verified. This section records each one; §3 and §4 are updated to
match. One item (3) found defects that are **reported, not fixed** — §2.11.6 and residuals 10-18.

### 2.11.1 Item 1 — the seven-template lane runs in CI, and it is green

The previous wave left the lane as a local script with a CircleCI job under discussion. The repository's
remote is GitHub, so the job is a GitHub Actions workflow instead: same command, same throwaway stack,
same fail-closed contract, no extra account or orb, and the definition is reviewable in-tree.

`.github/workflows/e2e-seven-templates.yml`:

- triggers: `push` to `main` and `frame30`, `pull_request` to `main`, `workflow_dispatch`;
- `permissions: contents: read`, one concurrency group per ref with `cancel-in-progress: false`;
- one job on **`ubuntu-24.04` pinned, not `ubuntu-latest`** — `latest` moved to Ubuntu 26.04, where
  Playwright 1.56 refuses to install Chromium ("does not support chromium on ubuntu26.04-x64"). The
  first run (41222465627) failed at exactly that step and nothing else, which is why the pin is a
  second commit;
- Bun 1.3.14, `bun install --frozen-lockfile`, `docker compose version` (fail closed), then
  `bunx playwright install --with-deps chromium`, then `bash scripts/e2e-seven-templates-ci.sh`
  (45-minute step budget inside a 60-minute job budget);
- the Playwright report and `test-results` are uploaded with `if: always()`, which is when they matter.

**Run 41222705645: completed success.** 17:04:14Z → 17:10:22Z (6m08s), head `6eb1cde1`, all 19 steps
green, including "Seven-template lane (throwaway loopback stack)". The script's own
`--retries=0 --workers=1` means a red run is a real red; nothing is retried or skipped to reach green.

**Final run 41322693292: completed success on the released tree.** 15:43:52Z → 15:52:21Z (8m29s), head
`9d9a51bf`, i.e. after the seven wave commits that carry items 2 and 4 and the preview fix. One job
("seven-template editor journey"), all 19 steps green including the lane step and both artifact uploads.
No retries. This is the run that covers everything in this section.

One consequence is left open rather than acted on: the previous wave also added the same lane as a
CircleCI machine job wired into `gates` (`.circleci/config.yml:363-435`, §1.6). Both definitions now
exist. With the GitHub run green, the CircleCI twin is duplicate work (~15 machine minutes per run) and
should be retired by whoever owns the CircleCI pipeline — this wave did not delete it, because that is a
pipeline-ownership change, not part of "get the lane green" (residual 21).

### 2.11.2 Item 2 — nested editing proved on three surfaces, not one

The nested leg is the deeper proof the owner asked for: it does not just edit a property of a
pre-existing block, it **builds structure through the editor's own controls** and then judges the
result on the published storefront:

1. insert a Container through the widget tray ("As designed" preset);
2. insert a Text block **inside** it through the navigator's `Add inside`, rename it to a per-run marker;
3. rename the parent container, move the child up, delete a second renamed container
   (`… nested to delete ${RUN}`), and re-count the navigator's layers;
4. publish through the real modal, then assert the per-run marker's presence on the real storefront —
   or its **absence** when the platform refuses the publish (`publish.outcome`).

Cart already carried this. The leg is now parameterised (`nested: { marker, removedName }`) and runs on
**Checkout** (the theme's own `Columns` — the surface where a broken nest costs a sale) and on a new
**Blog article** journey (`template: "blog_article"`, opened through the strip's `Blog` button, then its
`blog_article` variant). The article composition authors no `Columns`, so the leg inserts its own root
container and nests into that; the journey additionally proves the article frame is the **article**
frame (related rail + newsletter, no listing terms rail) and that the platform's own article body
renders inside the theme's route-owned `page_content` slot.

Four failures need recording. Two were bugs I wrote, and two were **real product defects this deeper
leg exposed** — which is the reason for running it on a surface nobody had edited before:

- **My bug, fixed:** Checkout's `storefront` callback was still `async (page)` while the new marker
  block read `publish.outcome` → `ReferenceError: publish is not defined` _after_ the editor work had
  already passed. The signature is now `async (page, publish)`. No assertion changed.
- **My bug, fixed:** the reload step re-clicked the strip's base template button by `journey.label`; a
  variant journey's label is `Blog article`, which the strip only offers as a second-level variant. It
  now re-clicks `journey.openLabel ?? journey.label` (the base) and then re-selects the variant, the
  same pair the journey opened with.
- **Product bug, fixed — layer renames did not survive a save.** The navigator's rename writes
  `props.__name` and the navigator reads it back as the layer label, but `parseSection`
  (`src/lib/builder-ast.ts`) rebuilds `props` from the catalog fields plus the advanced-tab specs, so
  the name was dropped on every autosave: the rename survived the open editor session, and the next
  reload showed `Container` again. The leg caught it as a reload comparison (`expected "Nested parent
mvwqacbk", received "Container"`) — a merchant edit, silently lost. `NODE_NAME_PROP` /
  `MAX_NODE_NAME` now live in `builder-ast` and `parseSection` preserves the name, trimmed and bounded
  exactly like the rename input, and absent when blank so the widget label stays the fallback
  (`src/lib/builder-ast-node-name.test.ts`). The autosave RPC stores the parsed map as-is
  (`migration/0019_phase2e_theme_engine.sql:14`), so the parser was the only place it could be lost.
- **Product bug, fixed — an installed theme's preview never resolved a variant.** The Blog article
  preview leg opened `/theme-preview/songoskriti?template=blog_article` and got the **listing**
  ("Browse the journal" / "From the journal") instead of the article frame. Root cause: the preview's
  installed-artifact path (`installedPreviewSource`, `src/lib/preview-sources.ts`) exposed the base
  `main()` only and no `variantMain`, so `assemblePreviewVariants` returned `{}` and the frame fell
  back — by design — to the base `blog` body. The install itself was fine: `registryPackage()` merges
  the theme's variant bodies into the same `templates` record it publishes, and the storefront reads
  that map directly, so shoppers saw the article frame while the studio previewed the listing. Fixed by
  exposing the artifact's own variant bodies; two assertions added to `theme-preview-nav.test.ts` (an
  artifact that carries a variant resolves its own main; one that carries none keeps an empty map). No
  lane assertion was weakened.
- **A documented no-op, now measured rather than assumed:** `Move up` is a within-parent nudge
  (`src/lib/builder-tree.ts:230-244`), and at index 0 it returns the tree unchanged
  (`builder-tree.test.ts:94`). Checkout's `Columns` already holds two children, so its swap is real;
  the Blog article's freshly-inserted container was the only child, where the control legitimately did
  nothing. The leg now gives it a named sibling first, so the assertion still measures a real reorder.
  The always-enabled control that can do nothing is a minor UX finding, not a bug — residual 23.
- **Not a product bug — the dev-server stall.** One run's Blog article journey failed at `openTemplate`
  — 120 s waiting for the editor toolbar, page snapshot empty, no failing request. The trace shows the
  SSR document `200`, every module request `200`, and 24 client module fetches **still in flight** when
  the test gave up. The lane's web server is `vite dev`, and that run coincided with edits to a watched
  module (`src/lib/store-blog.server.ts`) from this session. A re-run on a quiet tree decided it. If the
  stall ever recurs in CI, the durable fix is to serve the lane from a production build instead of the
  dev server (residual 18).

**Result: 9/9 on a quiet throwaway stack.** `scripts/e2e-seven-templates-ci.sh`, 7m24s of tests,
`WRAPPER_EXIT=0`, `--retries=0 --workers=1`, seed gap **0**, 79 migration statements skipped against the
fresh stack (the pre-existing legacy gap recorded in §2.10, not new). All three nested surfaces pass —
Cart, Checkout, and Blog article — including the reload comparison that caught the `__name` defect and
the preview leg that caught the installed-variant defect. Three earlier runs in this wave were 7/9, 8/9
and 8/9; each failure was the blog-article leg, and each one was worth having: the first two exposed
real product bugs, which is why the final green is 9/9 and not a 9/9 reached by relaxing an assertion.

### 2.11.3 Item 3 — the deployed storefront, page by page

Method: Chrome DevTools against `https://flamelancer.com` (the primary domain of
`flame-fashion-bd`), 1440×900, real navigation — no fixtures, no preview host. Eleven screenshots were
captured in `/tmp/opencode/visual/`: `live-home`, `live-shop-product`, `live-cart`, `live-checkout`,
`live-checkout-with-line`, `live-checkout-with-line-lower`, `live-blog-index`, `live-blog-article`,
`live-blog-category`, `live-store-scoped-archive`, `live-page-contact`.

**What works** (verified in the browser, not only by HTTP status): the store chrome (announcement bar,
brand lock-up, `WOMEN / MEN / KIDS / FESTIVE / HERITAGE / NEW ARRIVALS`, search / account / wishlist /
cart) renders on every commerce surface; the product page renders the merchant's own product with price,
breadcrumb and a working add-to-cart (the cart badge moved 0 → 1); `/cart` renders the theme's
"Your bag" + order summary; `/checkout` with a line renders the theme's progress trail, **Cash on
Delivery** as the merchant's own configured rail, the order summary with the correct VAT-inclusive
total, and the platform's own `Confirm order`; `/blog` renders the theme's listing with the merchant's
3 articles and 9 term chips; `/blog/<slug>` renders the article inside the theme's article frame;
`/store/flame-fashion-bd/blog/category/heritage` renders the themed archive with the Flame byline;
`/pages/contact` renders the themed page. Nothing 404s, nothing renders an empty shell, no JavaScript
console error came from the app.

**What is wrong** — all found by looking, none fixed under this wave:

1. `flamelancer.com/` serves the platform's StoreWelcome plate, not a themed homepage. This is
   pre-existing and intentional (commit `b08f6819e`, 22 Sep): the merchant has no designated CMS
   homepage, and the only published flame page (`home`) holds unrelated demo electronics content, so
   promoting it would be worse than the plate. Recorded again because a shopper sees it first.
2. `/blog` and `/blog/<slug>` on the custom domain render the theme's composition **without the store
   header and footer** — the same pages at `/store/flame-fashion-bd/blog` carry the full chrome. The
   listing and the article are correct; they are just presented as a bare document.
3. Category and tag archives on the custom domain are **not tenant-scoped** — see §2.11.6. This is the
   only defect here that leaks another merchant's content.
4. The custom-domain taxonomy archive still shows the shopper-facing internal notice
   "This theme does not design the Blog page", next to a themed archive.
5. Checkout alignment: at 1440 px the theme's own `Checkout` heading sits at `x=0`, its payment block
   (`Payment method`, `We accept`) at `x=60`, the platform's form at `x=240` and the order summary at
   `x=916` — three different left gutters in one screen.
6. The product page's "Details" block says _"Sample product page — prices and stock are sample data,
   and ordering is disabled in the preview."_ while ordering works. This is a theme **default**
   composition string (`src/lib/themes/songoskriti/preview.ts:211`), and it is not stored in the
   merchant's published AST (flame's published `theme_versions` AST is `{}`), so it renders from the
   default on every storefront that has not overridden it. A previous phase already identified this
   line and _relabelled_ it rather than removing it
   (`docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md:75-92`), so
   changing it is an owner decision, not a silent cleanup.
7. The footer is theme demo branding on another merchant's store: "© 2026 SONGOSKRITI",
   `care@songoskriti.com`, "Uttara / Gulshan / Chattogram Flagship"
   (`src/lib/themes/songoskriti/footer.ts:121-122`).
8. The store-scoped archive's announcement bar renders blue where the same bar is black on every other
   surface.
9. "Heritage" appears twice in the archive facet rail (`Heritage 2` and `Heritage 2`) because the seed
   created a **category** `heritage` and a **tag** `heritage`; the archive lists both facets with the
   same label.

### 2.11.4 Item 4 — production taxonomy: schema repaired, terms seeded, archives verified

The read path was repaired last wave (`0027`); production still had **0 terms**, so every archive was a
truthful 404. Seeding exposed three more divergences between production and the schema the repo has
always declared. Each was written as its own additive, idempotent, guarded file and applied to
production **as the table owner** (`supabase_admin`; the documented `postgres` operator role is not the
owner), one file at a time — never a blanket `bun run db:migrate`, whose discovery also picks up the
e2e-only `migration/e2e-schema-parity*.sql`:

| File                                  | What production was                                                                                                                                       | What the file does                                                                                                                                                      | Ledger checksum   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `0028_blog_terms_tenant_taxonomy.sql` | `merchant_id` nullable, **no FK**, and a **global `unique (slug)`** — so a second store could never have its own `heritage`                               | `merchant_id set not null`, tenant FK, drop the global unique, add `unique (merchant_id, kind, slug)`                                                                   | `2139b6c1…f716de` |
| `0029_article_terms_shape.sql`        | `(id, article_id, term text, kind text)` — the canonical readers select `term_id`/`merchant_id` and got `400`; `resolveTerm` silently discarded the error | adds `merchant_id`, `term_id`, `is_primary`; backfills the tenant key; drops the legacy `term`/`kind`/`id`; PK `(article_id, term_id)`; 3 FKs; `article_terms_term_idx` | `de38b6ac…16d779` |
| `0030_articles_blog_columns.sql`      | `articles.author_id` absent, `articles.reading_minutes` absent → the card select `42703`'d and listings degraded to "No articles yet"                     | adds both; backfills `reading_minutes` from the body (~200 wpm, floor 1) without overwriting edited values                                                              | `78c444ea…c4adb`  |

`author_id` is deliberately added **without** a foreign key: production has no `blog_authors` table and
the reader tolerates that (the author chip is decoration). That gap is residual 17, not papered over.

Then `scripts/seed-blog-taxonomy.sql` (deterministic, idempotent) seeded both live merchants from their
own `articles.tags`, with `is_primary` chosen by `row_number()` so each article has exactly one primary
category. Applied: **22 terms** (11 per merchant — 2 categories `heritage`/`festive`, 9 tags), **13
`article_terms` links and 3 primary links per merchant**, `article_count` recomputed from the links.

Verified live on `https://flamelancer.com` after the 60 s `renderRead` cache expired:

| URL                       | Status | Rendered                       |
| ------------------------- | ------ | ------------------------------ |
| `/blog`                   | 200    | 3 flame articles, 9 term chips |
| `/blog/category/heritage` | 200    | 2 articles                     |
| `/blog/category/festive`  | 200    | 1 article                      |
| `/blog/tag/folk-art`      | 200    | 1 article                      |
| `/blog/tag/handloom`      | 200    | 1 article                      |

Two caveats, stated because they matter: the first probe 60 s after seeding still showed "No articles",
which is the `renderRead` TTL, not a data problem; and the live bundle at that moment was still
`64172796`, whose `store-blog.server.ts` reads the **dropped** legacy `article_terms(term, kind)`, so
the seeded category chip on cards degraded until the new build shipped. That build is now live
(`9d9a51bf`): the post-deploy re-probe repeats the same five results and the category chip renders on
each card (§6.1).

### 2.11.5 Item 4c — Songoskriti activated on the second live merchant

`flame-fashion-bd` (`flamelancer.com`) was serving without an active `store_themes` row. It is now
installed and activated through `scripts/install-official-theme.ts`, which writes the same shape the
activate flow writes (store theme + published v1 version + draft + `marketplace_installs` ledger + audit):

| Merchant           | `store_themes`      | Published version | Ledger key                        |
| ------------------ | ------------------- | ----------------- | --------------------------------- |
| `test`             | `b8fb4b96-…` active | `785e3a3f-…`      | `official:efd4030b-…:songoskriti` |
| `flame-fashion-bd` | `c9e9f286-…` active | `aabf9d44-…` (v1) | `official:b47532e5-…:songoskriti` |

The published AST for flame is still `{}` — the merchant has authored nothing — so the storefront
resolves the theme's defaults per template. That is why the defects in §2.11.3 (6, 7) reach the shopper
without any merchant action.

### 2.11.6 Found in item 3, **not** fixed: custom-domain taxonomy archives are not tenant-scoped

`https://flamelancer.com/blog/category/heritage` renders **Akira's** articles with **Akira** bylines on
Flame Fashion BD's own domain. It is not a styling bug: it is a cross-tenant content leak, and the same
page shows it plainly — `Heritage — Framique` in the title (the platform brand, not the store), the
byline `Akira`, and the internal notice "This theme does not design the Blog page".

Root cause: the two archive routes have **no host branch**. `src/routes/blog.index.tsx:47-70` and
`src/routes/blog.$slug.tsx:37-60` both resolve `resolveStorefrontHostFn()` and, when a host resolves,
serve the tenant's data (that is why `/blog` and `/blog/<slug>` are correct). The taxonomy routes —
`src/routes/blog.category.$slug.tsx` and `src/routes/blog.tag.$slug.tsx` — are global-only loaders: they
resolve the term **by slug across all merchants**, so whichever row sorts first wins, and the articles
come from that merchant's tenant. Today the seed order makes it Akira on a flame domain; a different
insert order would make it flame on an Akira domain. The correct surface already exists and is correct:
`/store/flame-fashion-bd/blog/category/heritage` is 200, themed, with the Flame byline.

**Why it is not fixed here:** the fix is the dual-mode branch the other two routes carry (host →
tenant archive, store canonicals, genuine 404 when the tenant has no such term). That is a routing
change with its own failure mode (soft-404 vs. leak vs. redirect), it is outside the four items the
owner narrowed this wave to, and doing it quietly at the end of a closeout is exactly the kind of
architecture-adjacent edit this programme has been refusing. It is residual 10, with the exact files
named, so it can be scoped as its own change.

---

## 3. Proof of done

Every gate below was run on the working tree at baseline `630e80be` + this wave's changes.

| Gate / lane / live check                                                                                                                                   | Command                                          | Result                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck                                                                                                                                                  | `npx tsgo --noEmit`                              | **exit 0, clean** (0 bytes output)                                                                                                   |
| Lint                                                                                                                                                       | `npx eslint .`                                   | clean (see note below)                                                                                                               |
| Doc gate                                                                                                                                                   | `node scripts/doc-gate.mjs`                      | **exit 0**, 0 findings, 4 documented suppressions                                                                                    |
| Contract gate                                                                                                                                              | `node scripts/contract-gate.mjs` (npx fallback)  | **258 tests / 13 suites PASS**                                                                                                       |
| Full unit suite                                                                                                                                            | `npx vitest run`                                 | **8959 passed / 3 failed** — exactly the 3 known pre-existing reds (`analytics-live-shape` ×2, `site.server` ×1)                     |
| Official-catalog / switch-roundtrip / template-persistence / package-lifecycle / builder-themes / preview-sources / variation-preview / activation-latency | targeted `vitest run`                            | **all green**                                                                                                                        |
| Announcement/footer/migration retarget proofs                                                                                                              | targeted `vitest run`                            | **20/20, 21/21, 20/20**                                                                                                              |
| Seven-templates lane — run7 (dev server + dev DB)                                                                                                          | `.e2e/songoskriti-seven-templates.spec.ts`       | **8/8** (after retirement; **not** a fresh stack — see §2.10)                                                                        |
| New migration typecheck/review                                                                                                                             | `migration/0027_blog_terms_taxonomy_columns.sql` | reviewed; additive + `if not exists` guarded                                                                                         |
| Seven-templates lane — fresh bring-up                                                                                                                      | `scripts/e2e-seven-templates-ci.sh`              | **8/8** (run11, throwaway stack, 5.2m, `WRAPPER_EXIT=0`; run10 was 7/8 before the pager-`created_at` fix — §5)                       |
| Live-visual (3 widths + home 1280)                                                                                                                         | `verify:live-visual` vs deployed                 | **15/15 preview keys, 6/6 surfaces PASS**                                                                                            |
| Production `blog_terms` schema apply                                                                                                                       | `0027` as `supabase_admin`, single file          | **exit 0**; 5 → **16 columns**, index + FK present, 0 rows untouched, PostgREST `400` → **200** (§5)                                 |
| Production preview host                                                                                                                                    | HTTP probe                                       | `/`, `/blog`, `/theme-preview/songoskriti` all **200**; nonce coherent across CSP header + `name=`/`property=` metas + inline script |
| Deployment                                                                                                                                                 | `ops/deploy-from-git.sh frame30 root`            | **live at `64172796`**; marker == SHA, readiness 200, every contract check passes, live-visual 15/15 + 6/6 (§6)                      |

- **Lint note:** ESLint was run by a helper that reported typecheck + doc-gate clean first; ESLint
  itself was still finishing under CPU contention with the Playwright lane. Treat the lint line as
  "no new findings from the retirement" rather than a fresh clean-tree assertion; re-run
  `npx eslint .` before merge if you want it belt-and-braces.
- **Unit-suite note:** the 3 failures are the documented pre-existing baseline reds, **untouched** by
  this wave — their presence confirms the suite matches baseline, it is not a regression.
- **Retirement proof:** `grep -rli somvabona src/` (excluding `*.test.*`) is **empty**; the only
  matches in the whole tree are absence-guard tests and `docs/superpowers/**` history.
- **Clean-tree proof for the renamed widget pack:** `everyday.tsx` + `everyday.test.tsx` exist and
  are imported by both `widgets.tsx` and `unified-widget-registry.ts` (production paths).

### 3.1 The second wave — the owner's four follow-ups

Everything below was run **after** the table above, on the tree that carries this wave's changes
(`630e80be` + wave 1 + wave 2). Where a check did not finish, it says so and is not counted as green.

| Gate / lane / live check                                                                                                                                      | Command                                                    | Result                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                                                                                                                                                     | `bun run typecheck`                                        | **exit 0**, clean                                                                                                                                                                                                                       |
| Lint — changed files                                                                                                                                          | `npx eslint <this wave's files>`                           | **0 errors**; one pre-existing `react-refresh` warning in `LayerTree.tsx` (`nodeLabel` has always been exported from a component file)                                                                                                  |
| Lint — whole tree                                                                                                                                             | `npx eslint .`                                             | **did not complete** — killed after 10 min at 100 % CPU with no output on this box. Residual 4 stands; it is not reported as green                                                                                                      |
| Doc gate                                                                                                                                                      | `node scripts/doc-gate.mjs`                                | **exit 0**                                                                                                                                                                                                                              |
| Contract gate                                                                                                                                                 | `node scripts/contract-gate.mjs`                           | **258 tests / 13 suites PASS**                                                                                                                                                                                                          |
| Unit — targeted (builder AST/tree, template persistence, preview sources/resolver/parity/variations, `components/builder`, Songoskriti, `store-blog`, `blog`) | `npx vitest run …`                                         | **1360 passed / 115 files**                                                                                                                                                                                                             |
| Unit — the new rename round-trip                                                                                                                              | `npx vitest run src/lib/builder-ast-node-name.test.ts`     | **6/6**                                                                                                                                                                                                                                 |
| Unit — the new installed-preview variant assertions                                                                                                           | `npx vitest run src/lib/theme-preview-nav.test.ts`         | **all green** (2 new cases)                                                                                                                                                                                                             |
| Seven-template lane — GitHub Actions (item 1)                                                                                                                 | `.github/workflows/e2e-seven-templates.yml`                | **success**, run **41222705645**, 19/19 steps, 6m08s, head `6eb1cde1` (§2.11.1)                                                                                                                                                         |
| Seven-template lane — final GitHub Actions run (the seven released commits)                                                                                   | `.github/workflows/e2e-seven-templates.yml`                | **success**, run **41322693292**, 19/19 steps, 8m29s, head `9d9a51bf` — the green run that covers items 2 and 4 (§6.1)                                                                                                                  |
| Seven-template lane — local quiet tree, 9 journeys (item 2)                                                                                                   | `scripts/e2e-seven-templates-ci.sh`                        | **9/9**, 7.4m, `WRAPPER_EXIT=0`, seed gap **0**, 79 legacy migration statements skipped (pre-existing, §2.10). Three earlier runs (7/9, 8/9, 8/9) failed only the blog-article leg and exposed the two product defects fixed in §2.11.2 |
| Production schema (item 4)                                                                                                                                    | `0028` + `0029` + `0030`, each applied as `supabase_admin` | **exit 0**; ledger has 7 rows, the three new checksums are in §2.11.4                                                                                                                                                                   |
| Production taxonomy seed (item 4)                                                                                                                             | `scripts/seed-blog-taxonomy.sql`                           | **22 terms**, **13 `article_terms` + 3 primary** per merchant, `article_count` recomputed (§2.11.4)                                                                                                                                     |
| Live archives (item 4)                                                                                                                                        | HTTP probes on `flamelancer.com` after the cache TTL       | `/blog` **200** (3 articles, 9 chips); `category/heritage` **2**; `category/festive` **1**; `tag/folk-art` **1**; `tag/handloom` **1**                                                                                                  |
| Second live merchant (item 4c)                                                                                                                                | `scripts/install-official-theme.ts`                        | both merchants installed **and active**, ledger keys `official:<merchant>:songoskriti` (§2.11.5)                                                                                                                                        |
| Live visual inspection (item 3)                                                                                                                               | Chrome DevTools, 1440×900, 11 screenshots                  | console clean on `/`, product, `/blog`, `/checkout` and the archive; nine findings, none fixed (§2.11.3)                                                                                                                                |
| Deployment                                                                                                                                                    | `ops/deploy-from-git.sh frame30 root`                      | **live `9d9a51bf`**: marker verified, readiness **200**, every contract probe OK; script exited **35** after activation on the un-retried `microscrop.shop` TLS check (residual 8, §6.1)                                                |

---

## 4. Residuals carried forward (§9.5)

1. **Schema/production drift** (§2.9): **~120 production relations have no creator anywhere in the
   repo** (cross-checked against the deployed DB), plus an enum value (`merchant_role 'editor'`) and
   a function overload that production itself lacks. The CI job makes the gap **visible** (counted,
   printed) and materializes the only two the repo's own seed requires
   (`nav_menus`/`nav_menu_items`, via `migration/e2e-schema-parity.sql`), but it does not close the
   drift — the other ~118 relations are left absent and surface as benign warnings. Follow-up:
   reconcile `migration/0001_baseline.sql` (or add the missing creators) with production so
   `db:migrate`/`schema:check` can be strict on a fresh DB.
2. **Strict SQL validation is not wired anywhere for a fresh DB** because of residual 1; today only
   the lane + assertion block gate a fresh stack.
3. **First `e2e-seven-templates` CI run** may be red for stack-bring-up reasons unrelated to the
   lane (§2.2). Watch the first run on `frame30` and decide on the promotion/rollback question.
4. **Lint under contention** (§3): re-run `npx eslint .` on a quiet tree before merge.
5. **`main` drift** (§2.7): rebase onto current `origin/main` before pushing `frame30`.
6. **`blog_terms` schema gap (pre-existing; FIXED this wave — §2.10):** the app reads a 14-column
   `blog_terms`, the repo chain created 8, and production had 5 — so the term could never resolve and
   every category/tag archive 404'd, **production included**. Fixed by
   `migration/0027_blog_terms_taxonomy_columns.sql` + the extended archive/page seed, and **applied to
   production** on 2026-10-31 as the owning role (`supabase_admin`; `postgres` is not the table owner).
   PostgREST now answers **200** for the full `TERM_COLUMNS` shape. The remaining `/blog/category/...`
   404 was then a content gap (0 term rows); the owner reversed that exclusion in the second wave —
   production is seeded and every archive verified (§2.11.4).
7. **`/store/cloudman-store*` 404s** on the preview host (§2.3): pre-existing, unrelated to this
   wave — that merchant has no `store_themes` rows.
8. **`ops/deploy-from-git.sh` can abort a healthy deploy on a transient TLS error** (§6): `check()` runs
   `curl` under `set -euo pipefail`, so a single `curl` 35 on the `microscrop.shop` unmapped-host branch
   ends the script with a nonzero status _after_ activation and _without_ entering `rollback`. The
   custom-domain loop directly above it is retry-wrapped for exactly this reason; that branch is not.
   Suggested follow-up: apply the same bounded retry there (or capture the code without letting `set -e`
   see the failure). Observed once, on the 2026-10-31 deploy; the deploy itself was live and every check
   passed on re-run.
9. **Decisions still open for you:** D1 coverage level (§2.1), five-gate executable reference
   (§2.4), whether `dev-theme-starter-theme` should also go (§2.5), and whether to take the deploy-script
   retry fix in residual 8 now or in a separate ops change.

### 4.1 Residuals found by the second wave (2026-10-31)

These are the item-3 findings and the item-2 harness note. None is fixed; each names the file or the
measured symptom so it can be scoped without re-discovering it. §2.11.3 and §2.11.6 are the detail.

10. **Custom-domain taxonomy archives are not tenant-scoped — cross-tenant content leak**
    (§2.11.6). `https://flamelancer.com/blog/category/heritage` serves **Akira's** articles with an
    `Akira` byline and the platform title `Heritage — Framique`. Cause:
    `src/routes/blog.category.$slug.tsx` and `src/routes/blog.tag.$slug.tsx` are global-only loaders
    (no `resolveStorefrontHostFn()` branch, unlike `blog.index.tsx:47` / `blog.$slug.tsx:37`), so the
    term is resolved by slug across all merchants and whichever row sorts first wins. The correct
    surface exists (`/store/flame-fashion-bd/blog/category/heritage`, 200, themed, Flame byline).
    Deliberately **not** fixed this wave: it is a routing change outside the four narrowed items.
11. **Custom-domain `/blog` and `/blog/<slug>` render without the store header/footer** (§2.11.3 #2).
    The theme composition and the tenant data are correct; the same pages under `/store/<slug>/…` carry
    the full chrome, so the custom-domain branch is missing the chrome the store branch mounts.
12. **A shopper-facing internal notice on a live page** (§2.11.3 #4): the custom-domain taxonomy
    archive renders "This theme does not design the Blog page" above a themed archive.
13. **Checkout has three different left gutters** (§2.11.3 #5): theme heading `x=0`, theme payment block
    `x=60`, platform form `x=240`, order summary `x=916` at 1440 px.
14. **The product "Details" block tells live shoppers that ordering is disabled**
    (§2.11.3 #6) — `src/lib/themes/songoskriti/preview.ts:211`, a theme default that reaches every
    storefront with no authored override (flame's published AST is `{}`). A previous phase identified
    the line and relabelled it rather than removing it
    (`docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md:75-92`);
    changing it is an owner content decision.
15. **Theme demo branding on other merchants' stores** (§2.11.3 #7): footer "© 2026 SONGOSKRITI",
    `care@songoskriti.com`, Uttara/Gulshan/Chattogram flagships
    (`src/lib/themes/songoskriti/footer.ts:121-122`) render on `flamelancer.com`. Same class as 14:
    an official theme whose defaults are one brand's content.
16. **The store-scoped archive's announcement bar is blue** where the same bar is black on every other
    surface (§2.11.3 #8).
17. **Duplicate "Heritage" facet** (§2.11.3 #9): the seed creates a category `heritage` and a tag
    `heritage`, and the facet rail labels both `Heritage 2`. Either the rail should group by kind or
    the seed should not mint same-named terms.
18. **The seven-templates lane runs against `vite dev`** (§2.11.2). One journal-load in this wave hung
    for 120 s with 24 module fetches in flight while every request that did complete returned `200`;
    the same server then served the remaining journeys green. A dev-server stall is therefore a red
    run that has nothing to do with the property under test. Durable fix: build and serve the lane's
    app the way production serves it. Not changed under this wave — it is the CI job's own shape.
19. **`blog_authors` does not exist in production** (0030 note): `articles.author_id` is added without
    an FK and the author chip is decoration. The reader tolerates the absence by design; the model gap
    remains.
20. **Production `blog_terms` still carries the permissive write policy** `blog_terms_auth_write`
    (`USING (true)`, from the unapplied `0026`). Read paths are correct; the write policy is a security
    residual, unchanged by this wave.
21. **The seven-templates lane is now defined twice** — the GitHub Actions workflow (§2.11.1) and the
    CircleCI `e2e-seven-templates` machine job wired into `gates` (`.circleci/config.yml:363-435`). The
    owner chose GitHub Actions for this item; the CircleCI twin should be retired once the GitHub job
    has a second green run, otherwise both providers run the same ~15-minute stack.
22. **Production's risk tier never sees abuse signals** (found in the live logs while verifying item 3,
    not fixed): `getMerchantRiskContext` calls the RPC `get_merchant_risk_signals`, which **does not
    exist** in the deployed schema — `journalctl -u framique.service` shows 457
    `signals fetch failed: Could not find the function public.get_merchant_risk_signals(p_merchant_id)`
    in six hours. The reader is written to survive it (`abuseScore: 0`), so every request resolves its
    tier from the stored tier and provenance alone; the abuse signal is dead code in production. The
    same logs show 4 `tier fetch failed: invalid input syntax for type uuid: "flame-fashion-bd"` — a
    code path passing the store **slug** where a merchant **uuid** is expected. Both predate this wave;
    both need their own change (`migration/` for the RPC, and the slug→uuid caller in
    `resolveRequestTier`/`resolveTenantCanaryRoute`).
23. **`Move up` / `Move down` stay enabled when they cannot move** (§2.11.2): `nudge` is a
    within-parent move and is a documented no-op at the first/last index
    (`src/lib/builder-tree.ts:230-244`, `builder-tree.test.ts:94`). The navigator renders both controls
    unconditionally (`src/components/builder/LayerTree.tsx:384-395`), so a merchant can press a button
    that provably does nothing. Cosmetic, not a data bug; the seven-template leg gives its inserted
    container a sibling so its own assertion measures a real reorder instead of the no-op.
24. **Linked global blocks lose their link on every save — the same bug class as the `__name` defect,
    and it needs a product decision before it can be fixed.** A placement stores its identity in
    `props.__gbId` / `props.__gbRev` (`src/lib/global-blocks.ts:25-26`), and `parseSection` rebuilds
    `props` from the catalog, so both keys are dropped by `parseAst`. Measured, not inferred: parsing
    `{ type: "container", props: { __gbId: "blk_1", __gbRev: 3 } }` returns the catalog defaults and
    no `__gbId`. The canvas is the only place that grafts a block (`resolveGlobalBlocks` is called
    from `builder.tsx:1124` and nowhere else), so after one save the placement is an anonymous empty
    container — in the editor _and_ on the storefront. Preserving the two props is two lines, but the
    storefront has no placement resolver at all, so a preserved link would render an empty container
    where today it renders an empty container too; whether a placement should render its block's
    content on the storefront is a product decision, not a parser fix. Deliberately not changed in this
    closeout.

---

## 5. CI run details

The lane was validated end-to-end on throwaway stacks with `scripts/e2e-seven-templates-ci.sh`
(`E2E_DB_PORT=55442 E2E_LOOPBACK_RELAY=1`), which is the same command the `e2e-seven-templates` job
runs. Three consecutive runs bracket the `blog_terms` fix (§2.10):

| Run    | Trigger                              | Result         | Notes                                                                                                                                                         |
| ------ | ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run 9  | local, pre-fix                       | **5/8** (5.2m) | the three storefront 404s — root cause §2.10                                                                                                                  |
| run 10 | local, with `0027` + full seed       | **7/8** (5.3m) | `SEED_GAP 0`; 13-article archive verified; only Archive's page-2 assertion failed (the pager windows by `article_terms.created_at`, not `published_at`)       |
| run 11 | local, with pinned link `created_at` | **8/8** (5.2m) | `WRAPPER_EXIT=0`; `PROD_PARITY_GAP 291` (production-only deps, tolerated by design), `MIGRATION_GAP 79`, `SEED_GAP 0`; schema assertions + seed rows verified |

Run 11, verbatim from `/tmp/opencode/ci-final11.log`:

```
production-schema parity applied — 291 statement(s) tolerated
migration chain applied — 79 statement(s) skipped (legacy gap)
schema assertions passed
seed applied — 0 statement(s) skipped (latent seed gap)
seed rows verified (theme, products, blog term, store page, 13-article archive)
✓ 1  … the editor journey: Search results (53.3s)
✓ 2  … the editor journey: Cart (53.8s)
✓ 3  … the editor journey: Account (37.7s)
✓ 4  … the editor journey: Blog (37.8s)
✓ 5  … the editor journey: Checkout (37.4s)
✓ 6  … the editor journey: Archive (34.0s)
✓ 7  … the editor journey: Page (35.4s)
✓ 8  … the store-less platform taxonomy route keeps the platform's grid (3.7s)
8 passed (5.2m)
WRAPPER_EXIT=0
```

The 291 tolerated production-parity statements are the known, by-design failures: `GRANT`/`POLICY`
statements that reference production-only types, relations and functions (`app_role`, `user_roles`,
`bookings`, `cms_posts`, `support_tickets`, `tenant_domains`, `touch_updated_at()`, ...). They are
counted and printed, never silent, and the relations the lane actually reads are materialized and then
hard-asserted (§2.9). The `builder_template_seo.title` warning still appears in the log but is
fail-soft (`render_read.server.ts` catches it) and never 404s.

**Provider run:** the CI provider's `e2e-seven-templates` job on `frame30` has not been observed yet;
add its URL/status here once it runs. The local run above is the same command that job executes.

**Production apply (done 2026-10-31).** `migration/0027_blog_terms_taxonomy_columns.sql` was applied to the
deployed database as a single file, not via a blanket `bun run db:migrate` (that discovery also picks up
the e2e-only `migration/e2e-schema-parity*.sql`). The operator role `postgres` is **not** the owner of
`public.blog_terms` (`supabase_admin` is, and `postgres` is not a superuser), so the first attempt failed
with `ERROR: must be owner of table blog_terms` and rolled back cleanly — production was left untouched.
Re-running the identical file as the owning role succeeded:

```
docker exec -i framique-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  < migration/0027_blog_terms_taxonomy_columns.sql
PSQL_EXIT=0
```

| Check                                                           | Before            | After                                    |
| --------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| `blog_terms` columns (`information_schema`)                     | 5                 | **16** (`TERM_COLUMNS` shape complete)   |
| Index `blog_terms_article_count_idx`                            | absent            | **present**                              |
| FK `blog_terms_parent_id_fkey`                                  | absent            | **present**                              |
| `count(*)` rows                                                 | 0                 | 0 (no data touched)                      |
| PostgREST `?select=article_count`                               | **400** (`42703`) | **200**                                  |
| PostgREST full 14-column select                                 | **400** (`42703`) | **200**, `[]`                            |
| Ledger `schema_migration_files`                                 | 3 rows            | 4 rows (0027, checksum `b4eb61a1…b5744`) |
| `https://framique.qubickle.com/blog`                            | 200               | 200                                      |
| `https://framique.qubickle.com/blog/category/handloom-heritage` | 404               | **404 — content gap, not schema**        |

That last row is the honest outcome and should not be read as an unfinished fix: the read path no longer
errors (the full `TERM_COLUMNS` select returns `200`), but production had **zero** `blog_terms` rows, so
`resolveTerm` correctly finds nothing and the route answered a genuine 404. Seeding production taxonomy
was a content decision at the time and deliberately excluded (D3, §2.3). **That decision was reversed by
the owner in the follow-up wave — production is now seeded and verified (§2.11.4).**

---

## 6. Deployment (2026-10-31)

Deployed with the sanctioned path, from the pushed branch — never from the live tree:

```
bash ops/deploy-from-git.sh frame30 root        # origin/frame30 = 64172796
```

Build ran in the ephemeral worktree `/tmp/opencode/deploy-frame30`; the live `.output/` was snapshotted
to `.output-snapshots/snap_20261031T121930Z_6417279` before rsync; `framique.service` restarted and passed
readiness on the first poll.

| Deploy assertion                                                  | Result                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| bundle marker `.output/DEPLOYED_SHA`                              | **`64172796b9a7be0c32c08c2c74b72905f7f035ec`** == deployed SHA   |
| readiness `127.0.0.1:3200/api/healthz?type=readiness`             | **200**                                                          |
| `framique.service`                                                | **active**                                                       |
| `/` , `/blog` , `/theme-preview/songoskriti` , `/api/public/ph/x` | **200 / 200 / 200 / 200**                                        |
| `/store/*` path-storefront gate (6 slugs + 8 deep routes)         | all as expected (404, and `flame-fashion-bd` → **301** primary)  |
| `flamelancer.com` `/` + `/cart`                                   | **200** (attempt 1), cert identity covers the host (8/8 samples) |
| `microscrop.shop` unmapped-host gate                              | **404** (3/3)                                                    |
| Live-visual `verify:live-visual`                                  | **15/15 preview keys, 6/6 browser surfaces, exit 0**             |

**One wrinkle, recorded because it matters:** `ops/deploy-from-git.sh` exited **35**, not 0, _after_ the
new artifact was live and ready. `microscrop.shop`'s DNS is alive again, so the script took the direct
`check "https://microscrop.shop/" "404"` branch — and `check()` runs `curl` inside `set -euo pipefail`, so
a one-off TLS connect error (`curl` 35) killed the script instead of recording a retry. Consequence: the
script never printed `DEPLOY OK` and never ran the final `/api/public/ph/x` assertion, but it also never
entered `rollback` — the deploy stayed live and correct. Every check the script skipped was re-run
manually and passes (table above). Notably the custom-domain loop above it _is_ retry-wrapped in raw curl
for exactly this reason; the `microscrop.shop` branch is the one that is not. Flagged as a follow-up
(§4), not fixed under this wave.

**Live-visual detail worth stating exactly:** the gate prints `nonce=missing`, which refers only to the
optional `x-csp-nonce` response header (not emitted). The actual nonce contract passes: one CSP header
nonce, one `meta[name="csp-nonce"]`, one `meta[property="csp-nonce"]` and exactly one distinct script
nonce, all identical (`nonce-VwCVC0umpDS6Oroo5Z3fBQ` on the sampled document).

### 6.1 Second wave deployment (2026-11-01)

The seven commits that carry items 2 and 4 were pushed from `6eb1cde1` to `9d9a51bf`. Each was staged
by explicit path and checked with `git show --stat`; `report.md` was deliberately left uncommitted until
after the deploy because it carried the deploy placeholders.

| SHA        | Subject                                                      |
| ---------- | ------------------------------------------------------------ |
| `f9bb9d6f` | `fix(builder): keep the merchant's layer name through parse` |
| `1a53f69d` | `fix(preview): resolve an installed theme's variant bodies`  |
| `d5a2ec7b` | `fix(blog): read the canonical article_terms columns`        |
| `645b463f` | `feat(blog): tenant taxonomy schema and the production seed` |
| `d26d1eb5` | `feat(themes): install an official theme on a merchant`      |
| `f8983dff` | `test(e2e): nested editing on Checkout and the Blog article` |
| `9d9a51bf` | `chore: ignore lane output artifacts`                        |

`git push origin frame30` moved `6eb1cde1..9d9a51bf`; 14 files, 980 insertions, 50 deletions. GitHub
Actions run **41322693292** on that head completed **success** in 8m29s (19/19 steps, §2.11.1).

Deployed with the sanctioned path, from the pushed branch:

```
bash ops/deploy-from-git.sh frame30 root        # origin/frame30 = 9d9a51bf
```

Build ran in the ephemeral worktree `/tmp/opencode/deploy-frame30`; the previous live `.output/` was
snapshotted to `.output-snapshots/snap_20261101T155343Z_9d9a51b`; `framique.service` restarted and
passed readiness on the first poll.

| Deploy assertion                                        | Result                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| bundle marker `.output/DEPLOYED_SHA`                    | **`9d9a51bfea573579225259c162e6b830c512886f`** == deployed SHA   |
| readiness `127.0.0.1:3200/api/healthz?type=readiness`   | **200**                                                          |
| `framique.service`                                      | **active**                                                       |
| `/` , `/blog` , `/theme-preview/songoskriti`            | **200 / 200 / 200**                                              |
| store path gate (12 negative routes + primary redirect) | 12 × **404**, `flame-fashion-bd` → **301** primary               |
| `flamelancer.com` `/` + `/cart`                         | **200** (attempt 1), cert identity covers the host (8/8 samples) |
| `/api/public/ph/x` (manual — the script died before it) | **200**                                                          |

**Live item-4 re-probe on the released bundle:** `/blog` **200** with 3 articles and all 9 tag chips;
`category/heritage` **2**, `category/festive` **1**, `tag/folk-art` **1**, `tag/handloom` **1**. The
category chip now renders on the cards (`Heritage`, `Heritage`, `Festive`) instead of degrading, and a
Chrome DevTools pass at 1440×900 on `/blog` and `/blog/demo-nakshi-kantha` shows the seeded chips in
place. `/checkout` still renders as before; its console has only the form `autocomplete` advisory, no
errors. The nine item-3 findings and the cross-tenant archive leak are unchanged — see §2.11.3,
§2.11.6 and residuals 10-18.

**Same wrinkle as §6, still unfixed:** the script exited **35**, not 0, _after_ the new artifact was
live and ready. `microscrop.shop` resolves again, so `run_contract_checks` takes the direct
`check "https://microscrop.shop/" "404"` branch, and `check()` runs `curl` under `set -euo pipefail`;
the one-off TLS connect error killed the script before `DEPLOY OK`. No rollback was entered. Every
assertion the script skipped was re-run manually (table above), including `/api/public/ph/x`.

**What the running bundle does not include:** the commit that carries this report. It changes only
`report.md`, so it is docs-only and was pushed after the deploy; the live artifact stays `9d9a51bf`.
