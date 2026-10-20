# Phase 1 — page-template content slot: verification evidence

**Branch:** `frame30` · **Base commit:** `71271834` · **HEAD at verification time:** `13fc65ab`
**Plan:** `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (Tasks 5 + 6)
**Recorded:** 2026-10-20

This document is the Phase-1 verification record for the change "the theme's `page` template declares the route's content slot". It carries (A) the live-app evidence for the theme preview, (B) the phase's acceptance criteria against their evidence, and (C) the post-merge verification log for every gate.

### Commits under verification

| Role | SHA | Subject |
| ---- | --- | ------- |
| Task 1 — escalation record | `78421884cc516d1cdb61024016c69c6ea954bf3a` | `docs(songoskriti): record the page-template escalation (frozen pins + preview frame)` |
| **Task 2 — the theme change** | `673e03522ec6c7022117749f6efc21299a99eb23` | `fix(songoskriti): give the page template the route's content slot` |
| Task 3 — the pin move | `293d798fd80e91ea72a8ed99edf79f1a13905372` | `test(songoskriti): move the page composition pins to the content-slot body` |
| Task 2 — record correction | `cf7088b64fad5c525a5946d6869135c76c8fc745` | `docs(songoskriti): correct the escalation record to the committed preview-nav diff` |
| **Task 4 — the preview source** | `13fc65ab84c7ac296ac7bdbde7f61a3eefc8ab7f` | `fix(songoskriti): give the theme preview a demo page body` |

The change set, `71271834..13fc65ab`:

```
$ git diff --stat 71271834..HEAD
 .../port/phase1-page-content-escalation.md         | 311 +++++++++++++++++++++++++
 .../builder/songoskriti-port-freeze.test.tsx       |   2 +-
 src/components/store/ThemePreviewFrame.tsx         |  34 +++
 .../store/songoskriti-page-content.test.tsx        | 140 ++++++++++++++++++
 .../store/songoskriti-preview-page.test.tsx        | 142 ++++++++++++++++++
 src/lib/preview-page-data.ts                       |  42 +++
 src/lib/theme-preview-nav.test.ts                  |  22 +-
 src/lib/themes/songoskriti/page-content.test.ts    | 115 ++++++++++++
 src/lib/themes/songoskriti/preview.ts              |  16 +-
 9 files changed, 809 insertions(+), 15 deletions(-)
```

---

# A. Task 5 — the running app

## A.1 — Step 5.1: the dev server

```
$ cd /opt/frame28 && node_modules/.bin/vite --port 5173 --strictPort
…
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://10.200.1.2:5173/  veth-vpn
  ➜  Network: http://10.100.0.2:5173/  tun0
```

**PASS.** The server started on the fixed port and printed `Local: http://localhost:5173/`. It was stopped after step 5.6 — see A.7.

## A.2 — Step 5.2: prove the route actually serves the page template

```
$ curl -s -o /tmp/opencode/preview-page.html -w '%{http_code}\n' "http://localhost:5173/theme-preview/songoskriti?template=page"
200
```

**PASS.** The status is `200`, so the preview host gate (`themePreviewHostGateFn`, `src/routes/theme-preview.$key.tsx:186`) **allowed** the local request — `isThemePreviewHostAllowed` accepts genuine loopback hosts (`src/lib/storefront-host.server.ts:507-516`). The response is 67 886 bytes and carries the preview dialog, so the greps below are not vacuous on a 404.

The deployed preview, for the record only (it can never stand in for steps 5.3–5.5 — it serves the pre-change build):

```
$ nsenter -t 1 -n bash -c 'curl -s -o /tmp/opencode/deployed-page.html -w "%{http_code}\n" "https://framique.qubickle.com/theme-preview/songoskriti?template=page"'
200
```

Its body still carries the OLD demo copy — `Size guide` 1, `How to measure` 1, `Demo article` 1, `Demo page body.` 0, `<article` 0 — exactly as the brief predicted. It re-confirms the old behaviour only.

## A.3 — Step 5.3: the demo copy is gone

```
$ grep -c "Size guide"  /tmp/opencode/preview-page.html
0
$ grep -c "How to measure" /tmp/opencode/preview-page.html
0
$ grep -c "Demo article"  /tmp/opencode/preview-page.html
0
```

**PASS.** All three are `0` (before the fix each was `1`).

## A.4 — Step 5.4: the theme's chrome still renders

```
$ grep -c "Songoskriti" /tmp/opencode/preview-page.html
3
```

**PASS.** `3` (≥ 1). The three occurrences are the dialog's `aria-label="Songoskriti theme preview"`, the masthead wordmark (`<span …>Songoskriti</span>`) and the footer marker (`© 2026 Songoskriti`).

## A.5 — Step 5.5: the preview body is present and labelled

```
$ grep -c "Demo page body." /tmp/opencode/preview-page.html
1
$ grep -c "<article" /tmp/opencode/preview-page.html
1
$ grep -c "<h1" /tmp/opencode/preview-page.html
1
```

**PASS.** `1`, `1`, and **exactly** `1`.

The measured `<main>` block, verbatim from the live response:

```html
<main class="space-y-12 sm:space-y-16 pb-16 [&amp;>[data-fq-node^=&#x27;announcement_bar&#x27;]]:!mt-0 [&amp;>[data-fq-node^=&#x27;announcement_bar&#x27;]+*]:!mt-0"><div class="fq-node" data-fq-node="page_content-50"><article><h1 class="font-bangla-display text-3xl font-bold">Demo page</h1><p class="mt-2 text-muted-foreground">Demo excerpt — the theme preview shows sample copy, never a real merchant page.</p><div class="fq-prose mt-6 space-y-4 text-sm leading-relaxed"><p>Demo page body. Sample copy for the theme preview.</p><p>This paragraph stands in for the merchant's own CMS page body.</p></div><p class="mt-8 text-xs text-muted-foreground">Last updated:<!-- --> <time dateTime="2026-10-01T00:00:00.000Z" class="money">01/10/2026</time></p></article></div></main>
```

Measured counters over the whole live document:

| Marker | Count | Expected |
| ------ | ----- | -------- |
| `<h1` | **1** | exactly 1 |
| `<article` / `</article>` | 1 / 1 | ≥ 1 |
| `data-fq-node="page_content-50"` | 1 | the content-slot node |
| `data-fq-node="breadcrumb…"` | **0** | (residual gap — see A.6) |
| `Size guide` | 0 | 0 |
| `How to measure` | 0 | 0 |
| `Demo article` | 0 | 0 |
| `Demo page body.` | 1 | ≥ 1 |

The `<h1>` is `Demo page` — the route's own `<h1>` for a merchant page (`src/components/store/PageView.tsx:77-79`), not the retired `Size guide`. The theme elects no primary section for `page` (`ROUTE_H1_TEMPLATES`), so nothing emits a second one.

The live body matches the brief's quoted expectation (`page_content-…` node id and the React `<!-- -->` SSR text separator differ from the component-level rendering; the structure is identical).

## A.6 — Step 5.6: what cannot be verified locally, and why

1. **The live storefront rendering — `/store/<slug>/pages/<pageSlug>` wearing the theme's page layout, and the CMS-designated homepage `/store/<slug>/` showing the merchant's body — cannot be verified from this environment.**
   Independently confirmed here, not merely quoted: the live database was probed read-only and holds exactly **three** `store_themes` rows — `Atelier`, `classic`, `Supershop` (all for merchant `ddac7eeb…`) — and **no row for Songoskriti**, so no store wears the theme (audit §2.1). The platform host 404s path storefronts (`isBlockedPathStorefront`, `src/lib/storefront-host.server.ts:433-447`). Locally the route answers but there is nothing to render: `GET /store/akira/` → `307`, `GET /store/akira/pages/home` → `404`, `GET /store/cloudman-store/` → `307`, `GET /store/cloudman-store/pages/home` → `404` (the database holds exactly one `pages` row, `home` for an unrelated company `66ce0421…`). The Phase-1 evidence for the storefront is therefore the component-level proof in Task 2's storefront test (`src/components/store/songoskriti-page-content.test.tsx`), which exercises the real `ThemeChrome` contract (the `contentSlot` gate at `:302-310`, the `contextSlots` fill at `:825-833`) with the theme's real page AST. Both cases are green — see B.5.

2. **The preview's `breadcrumb` section still renders nothing** — the residual gap Corrections §4 names. The `breadcrumb` widget is a context widget (`src/lib/builder-ast.ts:1500-1509`) and the preview supplies no `breadcrumb` slot (the only `breadcrumb` node in the preview is `useMockProductSlots`' product-template one — declared at `src/components/store/ThemePreviewFrame.tsx:341` and wired into the product slot map at `:411`), so `SectionRenderer` renders `null` for it (`src/components/builder/SectionRenderer.tsx:825-833`). **Measured on the live response: the document carries the `page_content` node and NO `data-fq-node="breadcrumb…"` node.** It is **cosmetic and harmless**: the breadcrumb is route context (merchant name + page title, `src/components/store/PageView.tsx:47-69`), the storefront is unaffected (the route hands the breadcrumb over, `:175`), the body is unaffected, and nothing in CI reads the preview's breadcrumb. It matters only as a preview-parity gap, and Phase 6 still owns the wider preview-honesty work. Recorded as such — **not** as "the preview body is empty", which is no longer true.

3. **The sibling-page nav loss** — `PageView`'s "More information" aside (`src/components/store/PageView.tsx:112-151`) exists only in the route fallback (`:177-186`), so it stops rendering once the theme declares the content slot. No widget represents it, so it cannot be restored inside port spec §7; restoring it needs `src/components/store/PageView.tsx`, which is prohibited. **Open item for the D4 boundary decision.**

4. **The false lint warning in the merchant's editor** (Corrections §5) — both live `lintTemplate` call sites pass no template key (`src/hooks/use-builder-editor.ts:635`, `src/lib/themes.server.ts:284`), so the builder reports `'No primary heading on this template.'` for the `page` template alone, and a merchant who adds a heading in response produces a second `<h1>` on a path host. The fix needs two prohibited files. **Second open item for the D4 boundary decision**, alongside the Task-1 record's item (f) (`docs/superpowers/songoskriti-evidence/port/phase1-page-content-escalation.md:166-177`).

5. **The frozen parity stills for the `page` template** (6 reference stills + 6 machine baselines) are now stale; re-freezing `reference/` rewrites `reference-manifest.json` for all 60 capture entries and is an owner-approved step outside this plan's commits (see the Task-1 record).

## A.7 — The eight other preview templates are byte-identical to before

**PASS.** All nine templates were fetched over HTTP from the live dev server, at `13fc65ab` and at the base commit `71271834` (the two changed source files — `src/lib/themes/songoskriti/preview.ts` and `src/components/store/ThemePreviewFrame.tsx` — were temporarily written back to their base-commit content with `git show 71271834:<path> > <path>`, the server was allowed to recompile, the nine templates were re-fetched, and the files were restored with `git checkout HEAD -- <path>`).

Each response was normalised for the three pieces of per-request nondeterminism (the CSP `nonce` attribute, the `csp-nonce` meta `content`, and the `u:<timestamp>` in the serialised router state) and then hashed. The normalisation was proved sound first: two consecutive fetches of the same template at the same commit produced identical normalised hashes.

```
$ python3 norm.py tpl-base/*.html tpl-head/*.html     # sha256 of the normalised response
```

| Template | base `71271834` sha256 | HEAD `13fc65ab` sha256 | Verdict |
| -------- | ---------------------- | ---------------------- | ------- |
| `index` | `49bc687750708d73bc68c896be48ee09d65ed17d996a599b05859de691111441` | `49bc687750708d73bc68c896be48ee09d65ed17d996a599b05859de691111441` | **IDENTICAL** |
| `product` | `a934ceddfc9720c533a1b8dedada0ce2e55df5b169c0109dac4e738d23f632ad` | `a934ceddfc9720c533a1b8dedada0ce2e55df5b169c0109dac4e738d23f632ad` | **IDENTICAL** |
| `collection` | `f16de3509c5f3a5745596d049643e83d7e498f87a4c09b16ff498626dc15769c` | `f16de3509c5f3a5745596d049643e83d7e498f87a4c09b16ff498626dc15769c` | **IDENTICAL** |
| `account` | `fe6baf78a51fec562e1843efbf1889117f7c4f9111bc77a5c282f37ddb6418d7` | `fe6baf78a51fec562e1843efbf1889117f7c4f9111bc77a5c282f37ddb6418d7` | **IDENTICAL** |
| `blog` | `9f0a4b3841f4bb2c221fb4b36ec856cad949cd1cb62dc4b912cd963bd7c00115` | `9f0a4b3841f4bb2c221fb4b36ec856cad949cd1cb62dc4b912cd963bd7c00115` | **IDENTICAL** |
| `cart` | `3c4d70bd1f73ef62e9791214ee927967af00a429072498be0d8b2d3acabc7f9d` | `3c4d70bd1f73ef62e9791214ee927967af00a429072498be0d8b2d3acabc7f9d` | **IDENTICAL** |
| `checkout` | `5835478bf4489e1d9c2a841571e2026530a72b47e8aa691c2215f79614f0c72c` | `5835478bf4489e1d9c2a841571e2026530a72b47e8aa691c2215f79614f0c72c` | **IDENTICAL** |
| `search` | `d7b5a5ee555830963d9a157f945473b37189ec3b559fcb25e03c99074fc75dfc` | `d7b5a5ee555830963d9a157f945473b37189ec3b559fcb25e03c99074fc75dfc` | **IDENTICAL** |
| `page` | `988a61920926d1657508e69b601d08a47608f3b6d11c75dd0d3d53872a61c638` | `1e0e7fef4f323aba85cfbb4596dbd4ae4bc21e2923eb69549db6ef7b2ec3fdde` | CHANGED — the intended change |

**Eight of nine byte-identical; only `page` changed.** The swap was proved to have taken effect: the base-commit `page` response renders `<h1 …>Size guide</h1>`, `How to measure` and `Demo article` (1 each) and no `<article>`, while the HEAD response renders the labelled demo body.

The source-level statement agrees: `git diff 71271834..HEAD -- src/lib/themes/songoskriti/preview.ts` is a single hunk, wholly inside `case "page":` —

```diff
         case "page":
+          // The route owns the body: `page_content` is the shared slot the
+          // CMS page route and the CMS-designated homepage flow their real
+          // content through (`PageView.tsx:166,175`; `StoreHomepage.tsx:120`).
+          // `page` is a route-h1 template (`ROUTE_H1_TEMPLATES`), so the route
+          // owns the <h1> too — this template elects no primary section, and
+          // declares no demo copy of its own.
           return [
-            s("heading", { text: "Size guide", text_bn: "সাইজ গাইড" }),
-            s("rich_text", {
-              heading: "How to measure",
-              heading_bn: "কীভাবে মাপবেন",
-              body: "Demo article. Chest, waist and length guidance for panjabis, kurtas and saree blouses.",
-              body_bn:
-                "ডেমো নিবন্ধ। পাঞ্জাবি, কুর্তা ও শাড়ির ব্লাউজের জন্য মাপের নির্দেশনা।",
-            }),
+            s("breadcrumb", { homeLabel: "Home" }),
+            s("page_content", {}),
           ];
         case "blog":
```

and the frame's new `pageSlots` memo returns `undefined` for every template but `page` (`src/components/store/ThemePreviewFrame.tsx:585`), so its three `...pageSlots` spreads are no-ops on the other eight.

## A.8 — The dev server was stopped and the tree left unchanged

```
$ pgrep -af "vite --port 5173"    → no process
$ curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:5173/
000                                   (connection refused — server stopped)
```

After the stop, the two temporarily swapped files were verified byte-restored:

```
$ sha256sum src/lib/themes/songoskriti/preview.ts src/components/store/ThemePreviewFrame.tsx
7cd3a4b56052ae599c52d72dca435e9a7eb91b37e6d07360baa9b8723e2ffdc6  src/lib/themes/songoskriti/preview.ts
98b9b52bea9189636a4990e6040791584ab091fb572bede4a58223ad73aa9f59  src/components/store/ThemePreviewFrame.tsx
```

— identical to the pre-measurement hashes (recorded before the swap), and `git status --short` shows both files clean. **PASS.**

---

# B. The phase's acceptance criteria and their evidence

| # | Criterion | Evidence | Verdict |
| - | --------- | -------- | ------- |
| 1 | The theme's page template contains a `page_content` section | Task 2's theme test, assertion 1 — `src/lib/themes/songoskriti/page-content.test.ts:47-53` (`expect(types).toEqual(["breadcrumb", "page_content"])`) | **PASS** |
| 2 | `lintTemplate(pageAst, "page")` produces zero issues | Task 2's theme test, assertion 3 — `src/lib/themes/songoskriti/page-content.test.ts:62-67` (`expect(lintTemplate(ast, "page")).toEqual([])`); before the change this produced `"Page template has no page content widget."` (`src/lib/builder-ast.ts:8448-8453`) | **PASS** |
| 3 | The demo strings are gone from the page body | Task 2's theme test assertion 2 (`src/lib/themes/songoskriti/page-content.test.ts:55-60`) **and** Task 5 step A.3 (live HTTP: 0 / 0 / 0) | **PASS** |
| 4 | The page template elects no primary heading and contains no heading-bearing section | Task 2's theme test, assertions 4 and 7 — `src/lib/themes/songoskriti/page-content.test.ts:69-82` and `:98-114` | **PASS** |
| 5 | The CMS page route and the CMS-designated homepage render the merchant's body inside the theme layout | Task 2's storefront test, both cases — `src/components/store/songoskriti-page-content.test.tsx:80-110` (CMS page route) and `:112-139` (CMS-designated homepage) | **PASS** (component level; the live storefront is blocked — see A.6.1) |
| 6 | The theme preview's `?template=page` renders a **non-empty**, labelled demo body with exactly one `<h1>` and no demo copy | Task 4's new suite, all four assertions (`src/components/store/songoskriti-preview-page.test.tsx:113-143`) **and** Task 5 step A.5 (live HTTP: `Demo page body.` 1, `<article` 1, `<h1` exactly 1, retired strings 0/0/0) | **PASS** |
| 7 | The preview's demo payload mirrors the production payload's shape | Task 4's new suite, assertion 4 (`src/components/store/songoskriti-preview-page.test.tsx:136-143`, `expect(Object.keys(PREVIEW_DEMO_PAGE).sort()).toEqual(["excerpt", "html", "title", "updated_at"])`) plus the `tsgo --noEmit` gate in step 6.3 | **PASS** |

The five suites that carry criteria 1–6, run together:

```
$ node_modules/.bin/vitest run src/lib/themes/songoskriti/page-content.test.ts \
    src/components/store/songoskriti-page-content.test.tsx \
    src/components/store/songoskriti-preview-page.test.tsx \
    src/lib/theme-preview-nav.test.ts \
    src/components/builder/songoskriti-port-freeze.test.tsx

 ✓ src/lib/themes/songoskriti/page-content.test.ts (7 tests) 90ms
 ✓ src/lib/theme-preview-nav.test.ts (43 tests) 141ms
 ✓ src/components/builder/songoskriti-port-freeze.test.tsx (21 tests) 108ms
 ✓ src/components/store/songoskriti-page-content.test.tsx (2 tests) 67ms
 ✓ src/components/store/songoskriti-preview-page.test.tsx (4 tests) 67ms

 Test Files  5 passed (5)
      Tests  77 passed (77)
```

---

# C. Task 6 — post-merge verification log

**Tooling note.** `bun`/`bunx` are not on PATH in this environment, so every gate below was launched with `node` (`scripts/*.mjs`) or with the repo-local binaries in `node_modules/.bin/` (`vitest`, `tsgo`, `eslint`, `prettier`). A repo-wide `eslint .` was not run: it stalls on the untracked 110 MB `.output-snapshots/` directory, so step 6.4 lints the touched paths explicitly.

## 6.1 — Songoskriti asset gate — **PASS**

```
$ node scripts/songoskriti-assets-check.mjs
songoskriti asset gate GREEN — 0 findings, 11 note(s).
notes (11) — advisory, they never fail the gate:
  - note.computed_ref        src/components/builder/songoskriti.tsx:1535 — a computed reference cannot be resolved statically
  … (11 computed_ref notes in total)
exit=0
```

Exit 0. The theme's page template references no art, so the expected-asset set is unchanged.

## 6.2 — Asset generator check — **PASS**

```
$ node scripts/gen-songoskriti-assets.mjs --check
plan campaign-men.jpg 3:4 jpeg
… (21 planned assets listed) …
songoskriti asset check GREEN — 21 planned assets match the expectation.
exit=0
```

Exit 0, no missing/extra asset.

## 6.3 — Typecheck — **PASS**

```
$ node_modules/.bin/tsgo --noEmit
exit=0
```

No output, exit 0. This is also the shape-drift gate for criterion 7: the fixture is typed `Pick<StorePage, "title" | "excerpt" | "updated_at"> & { html: string }` (`src/lib/preview-page-data.ts:27-33`), so a rename or drop in the production page record fails this gate at the fixture.

## 6.4 — Lint the touched paths — **PASS**

```
$ node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts \
    src/lib/themes/songoskriti/page-content.test.ts \
    src/components/store/songoskriti-page-content.test.tsx \
    src/components/builder/songoskriti-port-freeze.test.tsx \
    src/lib/theme-preview-nav.test.ts \
    src/lib/preview-page-data.ts \
    src/components/store/ThemePreviewFrame.tsx \
    src/components/store/songoskriti-preview-page.test.tsx

/opt/frame28/src/components/store/ThemePreviewFrame.tsx
  294:6  warning  React Hook useEffect has a missing dependency: 'demoProduct'. …  react-hooks/exhaustive-deps
  460:6  warning  React Hook useEffect has a missing dependency: 'initialMockOrder'. …  react-hooks/exhaustive-deps

✖ 2 problems (0 errors, 2 warnings)
exit=0
```

Exit 0, **0 errors**. The only output is the two pre-existing `react-hooks/exhaustive-deps` warnings the frame already carried before this plan (`:293` and `:459` before, `:294` and `:460` after — shifted by the one added import). Not touched by this plan.

## 6.5 — Prettier on the touched code files — **PASS**

```
$ node_modules/.bin/prettier --check src/lib/themes/songoskriti/preview.ts \
    src/lib/themes/songoskriti/page-content.test.ts \
    src/components/store/songoskriti-page-content.test.tsx \
    src/components/builder/songoskriti-port-freeze.test.tsx \
    src/lib/theme-preview-nav.test.ts \
    src/lib/preview-page-data.ts \
    src/components/store/ThemePreviewFrame.tsx \
    src/components/store/songoskriti-preview-page.test.tsx
Checking formatting...
All matched files use Prettier code style!
exit=0
```

Exit 0. (The two `docs/**` files are **not** prettier-managed in this repo; markdown is checked by reading it, not by prettier.)

## 6.6 — The known local-only flake — **EXPECTED RED (documented), not a regression**

```
$ node_modules/.bin/vitest run src/lib/site.server.test.ts
 ❯ src/lib/site.server.test.ts (3 tests | 1 failed) 7310ms
     × throws a guarded missing-env error, never a placeholder client 96ms
     ✓ uses runtime process.env when present 5ms
     ✓ publicPlans still fails soft to default plans when env is missing 7205ms

 FAIL  src/lib/site.server.test.ts > site publicClient env resolution > throws a guarded missing-env error, never a placeholder client
AssertionError: expected [Function] to throw an error
 ❯ src/lib/site.server.test.ts:24:34

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
exit=1
```

Exactly the documented failure. **Proof of the mechanism** — re-run with the Supabase env vars emptied:

```
$ VITE_SUPABASE_URL="" SUPABASE_URL="" SUPABASE_PUBLISHABLE_KEY="" VITE_SUPABASE_PUBLISHABLE_KEY="" \
    node_modules/.bin/vitest run src/lib/site.server.test.ts
 ✓ src/lib/site.server.test.ts (3 tests) 44ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
exit=0
```

The gitignored `.env` supplies `VITE_SUPABASE_URL`, so `import.meta.env` is truthy at module-evaluation time and the stubbed env no longer makes `publicClient()` throw. The file under test imports only `./site.server` — nothing this change touched. **Not fixed** (weakening the assertion is prohibited).

## 6.7 — Full unit suite — **PASS, with the one expected failure**

```
$ node_modules/.bin/vitest run
 Test Files  1 failed | 589 passed | 1 skipped (591)
      Tests  1 failed | 8459 passed | 3 skipped (8463)
   Duration  236.86s
exit=1
```

**The complete failing-file list (one file):**

```
 FAIL  src/lib/site.server.test.ts > site publicClient env resolution > throws a guarded missing-env error, never a placeholder client
```

`src/lib/site.server.test.ts` — the step 6.6 flake, and the only failure. **Every other file is green: no second failure, therefore no regression from this change.**

## 6.8 — Contract gate — **EXPECTED RED (pre-existing environment reason), not a regression**

```
$ node scripts/contract-gate.mjs
contract ok  src/lib/seo-weight.contract.test.ts                    6 cases  2.5KB
contract ok  src/lib/search-console.contract.test.ts               18 cases  6.1KB
contract ok  src/lib/content-health.contract.test.ts               32 cases  22.9KB
contract ok  src/lib/query-discipline.contract.test.ts             12 cases  11.7KB
contract ok  src/lib/__fixtures__/large-tenant.ts                   0 cases  7.5KB
contract ok  src/lib/__fixtures__/fake-db.ts                        0 cases  13.5KB
contract ok  src/lib/motion-policy.test.ts                         25 cases  8.2KB
contract ok  src/lib/motion.contract.test.ts                       26 cases  11.0KB
contract ok  src/lib/copy-quality.contract.test.ts                 26 cases  11.4KB
contract ok  src/lib/newsletter.contract.test.ts                    24 cases  7.9KB
contract ok  src/lib/marketing-seo.contract.test.ts                49 cases  22.4KB
contract ok  src/lib/contact.contract.test.ts                      12 cases  5.0KB
contract ok  src/lib/semrush.contract.test.ts                      13 cases  6.7KB
contract ok  src/lib/concurrency-and-caching.contract.test.ts      18 cases  9.0KB
contract ok  src/lib/disaster-proof-backup.contract.test.ts         7 cases  7.1KB

running 13 contract suites…

contract-gate: could not start vitest — spawnSync bunx ENOENT
exit=2
```

**Why:** the script's own manifest verification **passed** — one `contract ok …` line per contract file — and it then printed `running 13 contract suites…` and exited 2 at the spawn. `scripts/contract-gate.mjs:302` hardcodes `spawnSync("bunx", ["vitest", "run", …])`; `bun`/`bunx` are not on PATH here, and the plan's "use plain `node` for the `scripts/*.mjs` gates" constraint covers only how the script is **launched**, not the `bunx` it **spawns**. This is a tooling gap, not a contract failure.

**Local equivalent — the real signal** (the 13 contract suites the gate names, run with the local runner; the two `__fixtures__` entries are fixtures, not suites):

```
$ node_modules/.bin/vitest run src/lib/seo-weight.contract.test.ts src/lib/search-console.contract.test.ts \
    src/lib/content-health.contract.test.ts src/lib/query-discipline.contract.test.ts \
    src/lib/motion-policy.test.ts src/lib/motion.contract.test.ts src/lib/copy-quality.contract.test.ts \
    src/lib/newsletter.contract.test.ts src/lib/marketing-seo.contract.test.ts src/lib/contact.contract.test.ts \
    src/lib/semrush.contract.test.ts src/lib/concurrency-and-caching.contract.test.ts \
    src/lib/disaster-proof-backup.contract.test.ts

 ✓ src/lib/concurrency-and-caching.contract.test.ts (18 tests) 411ms
 ✓ src/lib/copy-quality.contract.test.ts (26 tests) 683ms
 ✓ src/lib/semrush.contract.test.ts (13 tests) 1006ms
 ✓ src/lib/motion-policy.test.ts (25 tests) 265ms
 ✓ src/lib/disaster-proof-backup.contract.test.ts (7 tests) 45ms
 ✓ src/lib/contact.contract.test.ts (12 tests) 59ms
 ✓ src/lib/seo-weight.contract.test.ts (6 tests) 29ms
 ✓ src/lib/newsletter.contract.test.ts (24 tests) 59ms
 ✓ src/lib/query-discipline.contract.test.ts (12 tests) 11463ms
 … (all 13 files listed, all ✓) …

 Test Files  13 passed (13)
      Tests  258 passed (258)
exit=0
```

**All 13 green (258 tests).** `scripts/contract-gate.mjs` was **not** edited — making the gate runner-agnostic is a release-gate change that needs an owner's decision. CI installs bun (`.circleci/config.yml:36-42`), so the `unit-contract` job's `bun run test:contracts` (`config.yml:66-79`) runs this gate for real.

## 6.9 — Documentation gate — **PASS**

```
$ node scripts/doc-gate.mjs
doc gate — canonical documentation checks
scope: 24 documents (23 require a status line)
self-test: PASS

findings: 0

suppressions: 4
  docs/developers/themes.md:68 — deliberate negative reference
  docs/packages/contract.md:44 — deliberate negative reference
  docs/packages/contract.md:291 — deliberate negative reference
  docs/themes/packages.md:41 — deliberate negative reference
exit=0
```

Exit 0, `findings: 0`. The two new `docs/superpowers/**` files are outside the gate's scanned set (`docs/developers/**`, `docs/04-builder/README.md`, `docs/04-builder/app-blocks.md`, `docs/themes/creation.md`, `docs/themes/packages.md`, `docs/themes/level-b.md`, `docs/packages/contract.md`), so they cannot introduce findings; they also must not be added to that set without an owner decision.

## 6.10 — Schema fingerprint check — **EXPECTED RED (pre-existing environment reason), not a regression**

```
$ node scripts/schema-fingerprint.mjs --check
schema-fingerprint: rpc failed (400)
exit=1
```

**Why:** the check reads the **live** schema through a Supabase RPC (`scripts/schema-fingerprint.mjs:49` prints that exact message on a non-2xx response). The local `.env` supplies credentials, but the RPC call itself does not succeed from this environment, so the check cannot run. This is **not** a schema change: the plan creates no migration and alters no migration, and `theme_drafts.templates` / `theme_versions.templates` are `jsonb` (`theme_drafts`/`theme_versions` are read and written by the theme version path, not by a migration). A fingerprint change is therefore not expected, and the pre-existing red is independent of this change. CI's `e2e-levelb-production` job runs `schema:check` against the real environment (`config.yml:302-352`). No migration was created, the fingerprint was not rewritten, and `scripts/schema-fingerprint.mjs` was not edited.

## 6.11 — Cron check — **PASS**

```
$ node scripts/gen-crontab.mjs --check
gen-crontab: ok (18 jobs scheduled)
exit=0
```

Exit 0, exactly as expected.

## 6.12 — Secret scan — **EXPECTED RED (pre-existing repository condition), not a regression**

```
$ node scripts/secret-scan.mjs
secret scan FAILED — 10 finding(s):

  .output-snapshots/snap_20261019T110422Z_26f3447/server/_ssr/client-DcYeaJ49.mjs:41  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261019T110422Z_26f3447/server/_ssr/client-DcYeaJ49.mjs:58  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261019T110422Z_26f3447/server/_ssr/router-CmD4v4T6.mjs:4281 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261019T110422Z_26f3447/server/_ssr/router-CmD4v4T6.mjs:4300 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/client-DcYeaJ49.mjs:41  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/client-DcYeaJ49.mjs:58  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/router-DXSMj1q8.mjs:4281 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/router-DXSMj1q8.mjs:4300 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json:50  [jwt]  "WebSocket connection to 'ws://127.0.0.1:58000/realtime/v1/websocket?apikey=eyJ…"
  docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json:51  [jwt]  "WebSocket connection to 'ws://127.0.0.1:58000/realtime/v1/websocket?apikey=eyJ…"
exit=1
```

**Where the findings are:** 8 of the 10 are in the **untracked** `.output-snapshots/` build output (a local build artefact the plan never commits — they disappear on a pristine checkout). The remaining **2 are in a tracked file**: `docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json:50-51`, a committed anon JWT recorded as e2e evidence (committed in `044624af`). **Consequence: the secret scan is red on a clean checkout of `frame30` at `71271834`, and CI's `secrets:scan` job (`.circleci/config.yml:94`, `bun run secrets:scan`) is red at HEAD — before this plan's change.**

This plan's commits touch only `src/lib/themes/songoskriti/preview.ts`, the three new test files, the NEW fixture `src/lib/preview-page-data.ts`, the escalated preview frame `src/components/store/ThemePreviewFrame.tsx`, the two frozen pins and the two new `docs/**` records — none of which contains a JWT, and none of which can change the finding count. **Not fixed**: rewriting or removing a committed evidence file is an owner decision.

> **Update (2026-10-20, after the run recorded above).** The owner ruled on that file and the two TRACKED findings are closed by redacting the credential IN PLACE: `docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json` now carries `<redacted-anon-key>` where the committed anon JWT used to sit, and a `"redaction"` field in the same file records what was redacted, why, and that the captured error's shape is unchanged (same wording, same `ws://127.0.0.1:58000` URL, same `vsn=2`, same position in the `consoleErrors` array). The scanner was NOT relaxed — `scripts/secret-scan.mjs` is unchanged, because a committed JWT must never live in the repo even when it is a loopback anon key. A clean checkout now reports only the 8 untracked `.output-snapshots/` findings, so CI's `secrets:scan` job is green again. The transcript above is left verbatim as the record of the run that found the condition.

## 6.13 — Nothing unwanted staged; the churn files untouched — **PASS**

```
$ git status --short
 M .artifacts/e2e/playwright-report/index.html
 M ops/routing/canary-weights.conf
 M ops/routing/upstream.conf
?? .output-snapshots/
?? docs/superpowers/plans/2026-10-20-theme-editable-templates.md
?? docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md
?? plan-analysis.md
?? plan.md

$ git diff --cached --stat
(nothing — the index is clean)
```

The index is clean. `git status --short` shows exactly the same set as before this verification began: the three churn files, the untracked snapshot directory and the four untracked documents — **never staged and never committed**.

```
$ git diff --stat      # unstaged, tracked
 .artifacts/e2e/playwright-report/index.html | 2 +-
 ops/routing/canary-weights.conf             | 2 +-
 ops/routing/upstream.conf                   | 2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)
```

## 6.14 — The three expected-red gates are not regressions

**Stated explicitly:** none of the three expected-red gates (6.8 `contract-gate`, 6.10 `schema-fingerprint --check`, 6.12 `secret-scan`) is a regression from this change.

| Gate | Local result | Why it is red | The command that produced the real signal | Result of that signal |
| ---- | ------------ | ------------- | ------------------------------------- | --------------------- |
| 6.8 `contract-gate` | exit 2, `spawnSync bunx ENOENT` | `bun`/`bunx` are not on PATH; the manifest check the gate exists to enforce **passed** | the 13 contract suites, run with `node_modules/.bin/vitest` | **13 files / 258 tests passed, exit 0** |
| 6.10 `schema-fingerprint --check` | exit 1, `rpc failed (400)` | the live Supabase RPC is not callable from this environment; the plan creates no migration and alters no migration | — (no local equivalent: the check needs the live schema) | n/a — CI's `e2e-levelb-production` runs it against the real environment |
| 6.12 `secret-scan` | exit 1, 10 findings | 8 in the untracked `.output-snapshots/`, 2 in a tracked evidence file committed in `044624af` — pre-existing at `71271834` | — (the scan is already the signal; the finding list is unchanged by this plan) | n/a — CI's `secrets:scan` is red at HEAD, before this plan |

The only test-level red in the whole suite (6.6/6.7, `src/lib/site.server.test.ts`) is the documented local-only env flake, and step 6.6's second run proves it (`3 passed (3)` with the Supabase env emptied).

## Post-verification commits — **§6.13 above is a pre-commit snapshot**

**The controller committed all five plan documents in `16f2743d`** — *"docs(songoskriti): phase-1 plan, the Phase-0 audit, the brief review and the verification evidence"*:

| Document | Published path |
| -------- | -------------- |
| This plan | `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` |
| The Phase-0 audit | `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` |
| The brief (the reviewed artefact) | `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` |
| The brief's review | `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief-review.md` |
| This evidence document | `docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md` |

(The brief and its review were untracked files at the repo root when this verification ran; the controller published both under `docs/superpowers/plans/` — the paths above — so that the plan's "the four inputs are never staged" constraint holds in the tracked tree, and committed them with the plan, the audit and this document.)

**§6.13's status list is a snapshot of the pre-commit tree.** It was taken before `16f2743d`, when the four input documents were untracked and the index was clean — which is exactly what the plan's Global Constraints required of them *at that time*. The controller's decision to publish them afterwards changes their tracked status; it does not make the observation recorded in §6.13 inaccurate.

---

## Summary of the verification

| Step | Subject | Verdict |
| ---- | ------- | ------- |
| 5.1 | Dev server on port 5173 | **PASS** |
| 5.2 | Preview route serves the page template (HTTP 200) | **PASS** |
| 5.3 | Retired demo copy gone (0 / 0 / 0) | **PASS** |
| 5.4 | Theme chrome still renders (`Songoskriti` 3) | **PASS** |
| 5.5 | Labelled, non-empty demo body; exactly one `<h1>` | **PASS** |
| 5.6 | Five "cannot be verified locally" items recorded | **RECORDED** |
| 5.7 | This document | **PASS** |
| 5.8 | Commit the evidence doc | **NOT EXECUTED — deliberately** (see note below) |
| 6.1 | Songoskriti asset gate | **PASS** |
| 6.2 | Asset generator check | **PASS** |
| 6.3 | Typecheck | **PASS** |
| 6.4 | Lint the touched paths | **PASS** (0 errors, 2 pre-existing warnings) |
| 6.5 | Prettier on the touched code files | **PASS** |
| 6.6 | The known local-only flake + its proof | **EXPECTED RED, proven** |
| 6.7 | Full unit suite | **PASS** (one expected failing file) |
| 6.8 | Contract gate + the 13 contract suites | **EXPECTED RED (tooling), signal green** |
| 6.9 | Documentation gate | **PASS** |
| 6.10 | Schema fingerprint check | **EXPECTED RED (environment)** |
| 6.11 | Cron check | **PASS** |
| 6.12 | Secret scan | **EXPECTED RED (pre-existing)** |
| 6.13 | Nothing staged; churn files untouched | **PASS** |
| 6.14 | This verification log | **PASS** |
| 6.15 | Commit the verification log | **NOT EXECUTED — deliberately** (see note below) |

**Note on 5.8 and 6.15.** The brief asks for the evidence doc to be staged and committed in two commits. The instruction that governed this verification run was **"DO NOT PUSH, DO NOT DEPLOY, DO NOT COMMIT"** — the controller performs the push, the deploy and the commits. This document therefore exists in the working tree, **untracked and uncommitted**, and the controller should commit it as the two commits the brief names:

> **Superseded (post-verification).** The controller has since committed this document together with the plan, the Phase-0 audit, the brief and the brief's review in `16f2743d` — see the "Post-verification commits" section above. The paragraph below records the state of the tree *at the time of the verification run*; the two commits it names were folded into the controller's single commit.

```
git add docs/superpowers/songoskriti-evidence/port/phase1-page-content-evidence.md
git commit -m "docs(songoskriti): record the page-template preview verification"
```

and, after the controller has split the Task-5 and Task-6 sections if it prefers two commits, the second:

```
git commit -m "docs(songoskriti): record the phase-1 post-merge verification"
```

**The deploy is a separate, explicit step and was not performed.** No `git push`, no `ops/deploy-from-git.sh`, no `ops/backup/time-machine-snapshot.sh` was run. The deployed preview (`https://framique.qubickle.com/theme-preview/songoskriti?template=page`) still serves the **old** build and still shows "Size guide" (measured in A.2); after the deploy it must show the demo body instead, exactly as step 5.5 asserts on the local server. Post-deploy storefront verification remains blocked for the reason in A.6.1.

> **Superseded (post-deploy).** The paragraph above records the state of the tree _at the time of the verification run_, before any deploy. The deploy happened afterwards: the live bundle marker is `c9ec4a45`, and the live preview now serves the demo body instead of "Size guide" — §D.2 carries the measured numbers. Post-deploy storefront verification remains blocked for the reason in A.6.1.

---

# D. Closure — the close-out commits, the final live verification, and the one open owner action

**Recorded:** 2026-10-20 · **Branch:** `frame30` · **HEAD at this recording:** `5afb03fe` · **Live build at this recording:** `c9ec4a45` (the deployed bundle marker, `.output/DEPLOYED_SHA`)

## D.1 — The six closing commits

| SHA        | Subject                                                                                   | What it closed                                                                                                                                                                                                                                                                                            | Files                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `7c7e1b05` | fix(songoskriti): key the builder lint by template so route-owned h1 templates are silent | the false "No primary heading on this template." warning in the merchant's builder (Corrections §5; D4's consequence (a)) — a route-owned-h1 template (product, collection, account, page, blog, search) is silent, and a template that owns its `<h1>` and has none still warns with the identical issue | `src/hooks/use-builder-editor.ts`; `src/lib/themes.server.ts`                                                 |
| `fe727b79` | fix(songoskriti): localise the preview's "Last updated" label                             | the preview's hardcoded English "Last updated" label — the frame now uses the same `t` the production route uses                                                                                                                                                                                          | `src/components/store/ThemePreviewFrame.tsx`                                                                  |
| `b16ccb41` | docs(songoskriti): redact the committed anon JWT from the e2e evidence                    | the 2 TRACKED `secrets:scan` findings — the committed anon JWT is redacted in place; **the scanner was NOT weakened** (`scripts/secret-scan.mjs` is unchanged)                                                                                                                                            | `docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json`                                       |
| `e7f69baa` | fix(songoskriti): restore the CMS page's sibling-page nav on a themed page                | the lost "More information" sibling-page nav **and** the empty 15rem gutter (D4's consequences (b) and (c)) — the nav renders inside the `page_content` slot value, the themed path gets a single-column container, and the "does the theme render the body" predicate moves into the shared NEW module   | `src/components/store/PageView.tsx`; `src/components/store/ThemeChrome.tsx`; NEW `src/lib/theme-body-slot.ts` |
| `9402a975` | docs(songoskriti): disclose the redacted anon key's residual in git history               | the disclosure gap in the redaction note — it now states that the value remains in the git history (`044624af`) and names the rotate-if-shared action                                                                                                                                                     | `docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json`                                       |
| `5afb03fe` | fix(songoskriti): space the themed CMS page's nav away from the article                   | the themed nav sitting flush against the merchant's article — the slot value is wrapped in the theme's own `space-y-8`                                                                                                                                                                                    | `src/components/store/PageView.tsx`                                                                           |

Both boundary-limited consequences D4 named are therefore **closed**: the sibling-page nav and the 15rem gutter by `e7f69baa` (spaced by `5afb03fe`), the false lint warning by `7c7e1b05`. `b16ccb41` and `9402a975` are the records half of the same wave. The plan's D4 entry carries the same statement, with the boundary's cost and how it was paid.

## D.2 — The final live verification of `?template=page`

Measured over HTTP against the deployed preview route, one request per locale:

```
$ for lang in en bn; do
    curl -s -o "live-page-$lang.html" -w "$lang %{http_code}\n" \
      "https://framique.qubickle.com/theme-preview/songoskriti?template=page&lang=$lang"
  done
en 200
bn 200
```

| Measure                                                  | `en`      | `bn`      |
| -------------------------------------------------------- | --------- | --------- |
| HTTP status                                              | 200       | 200       |
| `<h1>`                                                   | exactly 1 | exactly 1 |
| `<article>`                                              | 1         | 1         |
| the `page_content` node (`data-fq-node="page_content…"`) | present   | present   |
| "Demo page body."                                        | 1         | 1         |
| "Size guide"                                             | 0         | 0         |
| "Demo article"                                           | 0         | 0         |
| "How to measure"                                         | 0         | 0         |
| the theme logo (`<img … logo …>`)                        | present   | present   |

The other eight preview templates are unchanged and still answer `200`: index, product, collection, account, blog, cart, checkout, search.

**Which build these numbers describe.** The live bundle marker is `c9ec4a45` — the deploy recorded in the branch's handover — so the measurements above are of that build. **The six commits in D.1 are on the branch and are NOT in that build.** The visible consequence: the live `bn` tab still carries the preview's English "Last updated" label (`Last updated` 1, `সর্বশেষ হালনাগাদ` 0), which is exactly what `fe727b79` fixes and what that commit's own test pins. The other five close-out commits are invisible in the preview (`e7f69baa` and `5afb03fe` change the storefront path, not the preview; `7c7e1b05` changes the builder's lint) or are records (`b16ccb41`, `9402a975`).

## D.3 — The storefront path is still unverified

**Still unverified, for the same reason as A.6.1: the live database holds no Songoskriti store.** The `store_themes` table holds three rows — Atelier, classic, Supershop (audit §2.1) — and none of them is Songoskriti, so `/store/<slug>/pages/<pageSlug>` and the CMS-designated homepage cannot be exercised in production. The storefront acceptance criterion therefore stays at component level (B.5 — `src/components/store/songoskriti-page-content.test.tsx`).

**Blast radius:** the branch's production blast radius is the theme-preview route only. No live merchant storefront renders the theme's `page` template, because no live merchant wears the theme. The route-side changes D.1 carries (`e7f69baa`, `5afb03fe`) therefore have **no live storefront to regress** — they are proven by the component-level suite and by the storefront test, not by a production page.

## D.4 — The CI `secrets:scan` status

**CI's `secrets:scan` job is green on a clean checkout of this branch.** The two TRACKED findings that made it red (`docs/superpowers/songoskriti-evidence/port/e2e/foreign-gap-probe.json:50-51`, §6.12) were closed by `b16ccb41`, which redacted the value in place; the scanner was not relaxed — `scripts/secret-scan.mjs` is unchanged by every commit in D.1.

Measured on a clean export of `5afb03fe` (tracked tree only, no untracked build output):

```
$ git archive HEAD | tar -x -C /tmp/opencode/clean
$ cd /tmp/opencode/clean && node /opt/frame28/scripts/secret-scan.mjs
secret scan passed — no credential-shaped strings in the tree.
exit=0
```

In this working tree the scanner still exits 1, with exactly the **8** findings in the **untracked** `.output-snapshots/` build output — the same 8 as before the close-out, and none of them in a tracked file:

```
$ node scripts/secret-scan.mjs
secret scan FAILED — 8 finding(s):

  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/client-DcYeaJ49.mjs:41  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/client-DcYeaJ49.mjs:58  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/router-DXSMj1q8.mjs:4281 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T040348Z_40673d3/server/_ssr/router-DXSMj1q8.mjs:4300 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T132319Z_c9ec4a4/server/_ssr/client-DcYeaJ49.mjs:41  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T132319Z_c9ec4a4/server/_ssr/client-DcYeaJ49.mjs:58  [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T132319Z_c9ec4a4/server/_ssr/router-Ba23NCC7.mjs:4281 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
  .output-snapshots/snap_20261020T132319Z_c9ec4a4/server/_ssr/router-Ba23NCC7.mjs:4300 [jwt]  "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ…"
exit=1
```

**Residual, disclosed:** the original value is still in the git history — it was committed in `044624af`, and redacting the tree does not erase it from the objects. `9402a975` states that in the evidence file's own `history` field, together with the action: rotate that loopback dev anon key if the project is shared with anyone who has clone access to the history.

## D.5 — The one open owner action: the parity re-freeze

**Status: OPEN — one owner action, deliberately not run by this close-out.**

**What is stale.** `docs/superpowers/songoskriti-evidence/port/reference/` and `.e2e/songoskriti-port-parity.spec.ts-snapshots/` each hold **6** `page-*` stills — `page-{375,768,1440}-{en,bn}.png` and the matching `page-{375,768,1440}-{en,bn}-chromium-linux.png` machine baselines — that predate the page-template change, and `reference-manifest.json` holds **60** capture entries, so a re-freeze of `reference/` rewrites all 60 of them (the escalation record's item (d) states the same numbers).

**The exact command**, run from the repo root (`/opt/frame28`):

```bash
E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  E2E_MERCHANT_EMAIL="$E2E_MERCHANT_EMAIL" E2E_MERCHANT_PASSWORD="$E2E_MERCHANT_PASSWORD" \
  npx playwright test -c .e2e/playwright.config.ts songoskriti-port-parity --update-snapshots
```

This is the parity report's own run command (`docs/superpowers/songoskriti-evidence/port/parity-report.md:8-13`) plus `--update-snapshots`. Two things must hold: `PORT_CAPTURE_OUT` must **not** be `after` — the spec writes the human stills to `after/` when it is set and to `reference/` when it is not (`.e2e/songoskriti-port-parity.spec.ts:26-30`), and a re-freeze wants `reference/`; and `--update-snapshots` is what rewrites the machine baselines in `.e2e/songoskriti-port-parity.spec.ts-snapshots/`. `npx playwright` resolves the repo's own binary (`node_modules/.bin/playwright`).

**Preconditions.**

1. **A local dev server on loopback.** `E2E_BASE_URL=http://localhost:3020` with `E2E_NO_WEBSERVER=1` (the server is started by the owner and serves the branch). The harness only accepts loopback: the preview route's host gate takes genuine loopback hosts only (`isThemePreviewHostAllowed`, `src/lib/storefront-host.server.ts:507-516`) and the spec aborts every non-local request (`blockExternalRequests`).
2. **The theme activated on a DISPOSABLE store.** The spec's trailing "activation helper smoke" installs and activates the theme through the real server functions (`.e2e/helpers-songoskriti.ts:196-205`) against whichever database the app is configured with. The repo's `.env` points at a **hosted** instance (`SUPABASE_URL=https://framebase.qubickle.com`), so the run must be made against the throwaway loopback stack instead (`docs/15-e2e/loopback-auth-setup.md` §§1–3, mode B), with `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD` for a merchant of that stack. The activation is idempotent, but it writes `store_themes` rows — a store in a shared instance would be mutated, which is why this is the owner's call and not the close-out's.
3. **The Playwright browsers present** — `node_modules/.bin/playwright install chromium` if `~/.cache/ms-playwright` carries no chromium build. The suite runs chromium only (`.e2e/playwright.config.ts:62-67`).

**The trigger:** _before the next owner-run parity pass._ The suite is owner-run today — it is in neither `e2e:critical` nor `e2e:security` (`package.json:17` and `:56`) — so a stale baseline does not break CI; this is a parity-record problem, not a gate problem.

**What to review in the resulting diff:** only the **6** `page-*` entries should differ materially — they are the only surface whose body changed. The other **54** captures are expected to be unchanged, modulo the per-response CSP nonce (and the manifest's `generatedAt` and `freezeSha` fields, which the spec rewrites on every run). Anything else that moved is a finding, not noise.

**Why it was deliberately NOT auto-run.** The parity harness activates the theme on a store in the database the repo's `.env` configures — a possibly-shared instance — and it only accepts loopback requests. A run from this close-out would therefore either mutate a store that is not the close-out's to mutate, or fail for want of a loopback stack and a disposable merchant. It is the owner's action, with the command, the preconditions and the review list above.

## D.6 — Two review findings accepted and deferred, not owner actions

The closing review of the four close-out items (the lint warning, the preview's label, the committed credential, the lost nav) returned **SPEC ✅ / quality Approved** with **4 minor findings**. Two of them are closed by the wave above (`9402a975` — the redaction note's undisclosed history residual; `5afb03fe` — the themed nav flush against the merchant's article). The other two are **accepted and deferred** — consciously not fixed here, and not owner actions:

1. **The duplicate-`page_content` case.** A merchant template that declares **two** `page_content` widgets renders the route's sibling-page nav twice, because the slot value is rendered once per widget. This is a pre-existing class of bug — the merchant's own body already duplicates today — and its real fix is a lint rule in `src/lib/builder-ast.ts`, not a change to the route.
2. **The `useLang()` fallback's `t` identity churn.** The fallback context value returned by `useLang()` when no provider is mounted (`src/lib/i18n.tsx:161-174`) is a fresh object with a fresh `t` on every render, so the preview frame's page-content memo (`src/components/store/ThemePreviewFrame.tsx:587-610`) recomputes on every render when the fallback is in play. It affects tests only.

Both are recorded with the review's verdict in the branch's SDD ledger (`.superpowers/sdd/2026-10-20-theme-editable-templates/progress.md`, which is git-ignored and therefore not part of this branch's commit).
